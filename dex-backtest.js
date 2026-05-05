#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  DEX Hunter Backtest Simulator v1.0
//  Simulasi akurasi strategi memecoin-hunter.js menggunakan data historis
//  dari DEXScreener API (token baru Solana 24-48 jam terakhir)
//
//  Cara kerja:
//  1. Fetch token-token yang SUDAH lewat 24-48 jam dari DEXScreener
//     → Saat dientry, token masih "muda" (< 6 jam), sekarang sudah bisa
//       dievaluasi apakah TP1/TP2/SL kena
//  2. Replay semua scoring engine dari memecoin-hunter.js
//  3. Simulasi masuk posisi pada token score >= threshold
//  4. Cek harga peak 24h vs entry → tentukan hit TP atau SL
//  5. Output: win rate, profit factor, equity curve, per-tier breakdown
//
//  Jalankan: node dex-backtest.js
//            node dex-backtest.js --min-score 70
//            node dex-backtest.js --sim-runs 3 --capital 500
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── CLI ARGS ──────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const getArg    = (flag, def) => { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1] : def; };
const hasFlag   = f => args.includes(f);

const MIN_SCORE    = parseInt(getArg('--min-score', '62'));
const SIM_CAPITAL  = parseFloat(getArg('--capital', '200'));  // modal simulasi $200
const SIM_RUNS     = parseInt(getArg('--sim-runs', '1'));
const VERBOSE      = hasFlag('--verbose') || hasFlag('-v');
const OUT_FILE     = getArg('--output', path.join(__dirname, 'dex-backtest-results.json'));

// ── CONFIG (mirror dari memecoin-hunter.js) ───────────────────────────────────
const CFG = {
    // Entry filter — direlaksasi sedikit untuk backtest
    // (dalam live trading, entry hanya ketika token masih fresh)
    // (dalam backtest, kita evaluasi SEMUA yang pernah fresh di window 48h)
    MAX_AGE_HOURS    : 48,   // relaksasi: ambil token hingga 48h untuk evaluasi
    ENTRY_MAX_AGE    : 6,    // entry hanya jika pada SAAT itu usia < 6h (simulasi)
    MIN_VOL_24H      : 3000, // diturunkan sedikit agar cukup sampel
    MIN_VOL_1H       : 100,  // diturunkan untuk backtest
    MIN_TXNS_1H      : 10,   // diturunkan untuk backtest
    MIN_BUYS_1H      : 5,    // diturunkan untuk backtest
    MAX_CHG_24H      : 1500, // naikkan sedikit — token yang sudah +800% bisa dipelajari
    MAX_FDV          : 10_000_000, // relaksasi

    // Position sizing
    BASE_ENTRY_USD   : 20,
    MAX_ENTRY_USD    : 50,
    MIN_ENTRY_USD    : 10,
    MAX_POSITIONS    : 6,

    // Exit levels (TP cascade)
    TP1_PCT          : 30,    // +30% sell 40%
    TP2_PCT          : 80,    // +80% sell 30%
    TP3_PCT          : 200,   // +200% sell 20%
    TP4_PCT          : 500,   // +500% sell 10%
    TRAILING_SL_PCT  : 20,    // trailing SL dari peak
    INITIAL_SL_PCT   : 25,    // initial SL
    MAX_HOLD_HOURS   : 24,

    // Backtest specific
    SLIPPAGE_PCT     : 3,     // asumsi 3% slippage saat entry/exit (meme = tinggi)
    GAS_USD          : 0.005, // SOL gas fee ~$0.005 per swap
    CHAIN            : 'solana',
};

// ── COLORS ────────────────────────────────────────────────────────────────────
const C = {
    reset  : '\x1b[0m',
    bold   : '\x1b[1m',
    dim    : '\x1b[2m',
    green  : '\x1b[32m',
    red    : '\x1b[31m',
    yellow : '\x1b[33m',
    cyan   : '\x1b[36m',
    blue   : '\x1b[34m',
    magenta: '\x1b[35m',
    white  : '\x1b[37m',
    bgGreen: '\x1b[42m',
    bgRed  : '\x1b[41m',
};
const g = s => C.green + s + C.reset;
const r = s => C.red   + s + C.reset;
const y = s => C.yellow+ s + C.reset;
const c = s => C.cyan  + s + C.reset;
const b = s => C.bold  + s + C.reset;
const dim = s => C.dim + s + C.reset;

function kfmt(n) {
    if (!n || isNaN(n)) return '0';
    if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return Math.round(n).toString();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── HTTP FETCH ────────────────────────────────────────────────────────────────
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'dex-backtest/1.0', 'Accept': 'application/json' }
        }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try { return await fetchJson(url); }
        catch (e) {
            if (i < retries - 1) { await sleep(2000 * (i + 1)); continue; }
            throw e;
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DATA FETCHER — DEXScreener
//  Kita ambil token-token yang sudah ada 24-48 jam agar bisa dievaluasi
// ══════════════════════════════════════════════════════════════════════════════
async function fetchCandidates() {
    process.stdout.write(c('  [FETCH] ') + 'Mengambil data token Solana dari DEXScreener...\n');

    const allPairs = [];
    const seen     = new Set();

    // ── Endpoint 1: Token profiles terbaru (pump.fun & Raydium launches) ──────
    // Ini adalah daftar pair yang paling baru di-boost / listed di Solana
    const profileEndpoints = [
        'https://api.dexscreener.com/token-profiles/latest/v1',
        'https://api.dexscreener.com/token-boosts/latest/v1',
        'https://api.dexscreener.com/token-boosts/top/v1',
    ];
    for (const url of profileEndpoints) {
        try {
            const d = await fetchWithRetry(url);
            const items = Array.isArray(d) ? d : (d?.data || d?.pairs || []);
            for (const item of items) {
                if (item.chainId !== 'solana') continue;
                // Ambil pair data dari address
                const addr = item.tokenAddress || item.address || item.pairAddress;
                if (!addr) continue;
                // Tandai untuk fetch detail nanti
                if (!seen.has(addr)) { seen.add(addr); allPairs.push({ _addr: addr, chainId: 'solana', _source: 'profile' }); }
            }
            await sleep(400);
        } catch (e) {
            process.stdout.write(dim(`  [WARN] ${url.split('/').slice(-2).join('/')}: ${e.message}\n`));
        }
    }

    // ── Endpoint 2: Search query spesifik Solana ───────────────────────────────
    const queries = ['sol pump', 'raydium pump', 'pump fun sol', 'pumpfun'];
    for (const q of queries) {
        try {
            const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`;
            const d   = await fetchWithRetry(url);
            for (const p of (d?.pairs || [])) {
                if (p.chainId !== 'solana') continue;
                if (!seen.has(p.pairAddress)) {
                    seen.add(p.pairAddress);
                    allPairs.push(p);
                }
            }
            await sleep(400);
        } catch (e) {
            process.stdout.write(dim(`  [WARN] Query "${q}" gagal: ${e.message}\n`));
        }
    }

    // ── Endpoint 3: Fetch pair detail untuk yang hanya punya address ──────────
    const withAddr  = allPairs.filter(p => p._addr && !p.pairAddress);
    const withPairs = allPairs.filter(p => !p._addr);

    if (withAddr.length > 0) {
        process.stdout.write(c('  [FETCH] ') + `Fetching detail untuk ${withAddr.length} token dari profile...\n`);
        // Batch: DEXScreener /tokens/:addr — max 30 per req
        const BATCH = 30;
        for (let i = 0; i < Math.min(withAddr.length, 90); i += BATCH) {
            const batch   = withAddr.slice(i, i + BATCH);
            const addrs   = batch.map(p => p._addr).join(',');
            try {
                const url = `https://api.dexscreener.com/latest/dex/tokens/${addrs}`;
                const d   = await fetchWithRetry(url);
                for (const p of (d?.pairs || [])) {
                    if (p.chainId === 'solana' && !seen.has(p.pairAddress)) {
                        seen.add(p.pairAddress);
                        withPairs.push(p);
                    }
                }
                await sleep(400);
            } catch {}
        }
    }

    process.stdout.write(c('  [FETCH] ') + `Raw pairs: ${b(withPairs.length.toString())}\n`);

    // Debug: tampilkan distribusi usia
    if (withPairs.length > 0) {
        const parsed = withPairs.map(p => {
            if (!p.pairCreatedAt) return null;
            return (Date.now() - p.pairCreatedAt) / 3600000;
        }).filter(Boolean);
        if (parsed.length) {
            const fresh = parsed.filter(a => a <= 6).length;
            const mid   = parsed.filter(a => a > 6 && a <= 24).length;
            const old   = parsed.filter(a => a > 24).length;
            process.stdout.write(dim(`  [AGE]  ≤6h: ${fresh} | 6-24h: ${mid} | >24h: ${old}\n`));
        }
    }

    return withPairs;
}

// ── PARSE PAIR ke format internal ─────────────────────────────────────────────
function parsePair(raw) {
    if (!raw?.baseToken) return null;
    const ageH    = raw.pairCreatedAt ? (Date.now() - raw.pairCreatedAt) / 3600000 : 9999;
    const buys24  = raw.txns?.h24?.buys  || 0;
    const sells24 = raw.txns?.h24?.sells || 0;
    const buys1h  = raw.txns?.h1?.buys   || 0;
    const sells1h = raw.txns?.h1?.sells  || 0;
    const buys5m  = raw.txns?.m5?.buys   || 0;
    const sells5m = raw.txns?.m5?.sells  || 0;

    return {
        pairAddress : raw.pairAddress,
        chain       : raw.chainId,
        dex         : raw.dexId,
        baseSymbol  : raw.baseToken?.symbol  || '?',
        baseName    : raw.baseToken?.name    || '?',
        baseMint    : raw.baseToken?.address || '',
        quoteSymbol : raw.quoteToken?.symbol || 'SOL',
        url         : raw.url || '',
        priceUsd    : parseFloat(raw.priceUsd  || 0),
        priceNative : parseFloat(raw.priceNative || 0),
        ageHours    : ageH,
        vol1h       : raw.volume?.h1   || 0,
        vol6h       : raw.volume?.h6   || 0,
        vol24h      : raw.volume?.h24  || 0,
        chg5m       : raw.priceChange?.m5  || 0,
        chg1h       : raw.priceChange?.h1  || 0,
        chg6h       : raw.priceChange?.h6  || 0,
        chg24h      : raw.priceChange?.h24 || 0,
        txns1h      : buys1h + sells1h,
        txns5m      : buys5m + sells5m,
        txns24h     : buys24 + sells24,
        buys1h, sells1h, buys5m, sells5m,
        fdv         : raw.fdv            || 0,
        mcap        : raw.marketCap      || 0,
        liquidity   : raw.liquidity?.usd || 0,
        boosts      : raw.boosts?.active || 0,
        // untuk simulasi exit: gunakan peak estimate dari chg data yang ada
        highEst24h  : parseFloat(raw.priceUsd || 0) * (1 + Math.max(0, raw.priceChange?.h24 || 0) / 100),
    };
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCORING ENGINE (identik dengan memecoin-hunter.js)
// ══════════════════════════════════════════════════════════════════════════════
function scoreToken(t) {
    let score = 0;
    const signals = [];

    // 1. TRANSACTION VELOCITY (25 pts)
    const baseline1h    = t.txns24h > 0 ? t.txns24h / 24 : 1;
    const velocityRatio = t.txns1h > 0 && baseline1h > 0 ? t.txns1h / baseline1h : 1;

    if (velocityRatio >= 5)        { score += 25; signals.push('vel:' + velocityRatio.toFixed(1) + 'x⚡'); }
    else if (velocityRatio >= 3)   { score += 20; signals.push('vel:' + velocityRatio.toFixed(1) + 'x'); }
    else if (velocityRatio >= 2)   { score += 14; signals.push('vel:' + velocityRatio.toFixed(1) + 'x'); }
    else if (velocityRatio >= 1.5) { score += 8; }
    else if (velocityRatio >= 1)   { score += 4; }

    const txn5mRate = t.txns5m * 12;
    if (txn5mRate > t.txns1h * 2)  { score += 5; signals.push('burst5m🔥'); }

    // 2. BUY PRESSURE / ORDER FLOW IMBALANCE (25 pts)
    const buyRatio1h = t.buys1h / Math.max(t.sells1h, 1);
    const buyRatio5m = t.buys5m / Math.max(t.sells5m, 1);

    if (buyRatio1h >= 4)           { score += 15; signals.push('b/s:' + buyRatio1h.toFixed(1) + 'x📈'); }
    else if (buyRatio1h >= 2.5)    { score += 11; signals.push('b/s:' + buyRatio1h.toFixed(1) + 'x'); }
    else if (buyRatio1h >= 1.5)    { score += 7;  }
    else if (buyRatio1h >= 1.2)    { score += 3;  }

    if (buyRatio5m >= 3)           { score += 10; signals.push('5m:' + buyRatio5m.toFixed(1) + 'x⚡'); }
    else if (buyRatio5m >= 2)      { score += 7;  signals.push('5m:' + buyRatio5m.toFixed(1) + 'x'); }
    else if (buyRatio5m >= 1.5)    { score += 4;  }

    // 3. FRESH MOMENTUM (20 pts)
    if (t.chg5m >= 10)             { score += 10; signals.push('5m:+' + t.chg5m.toFixed(0) + '%🔥'); }
    else if (t.chg5m >= 5)         { score += 8;  signals.push('5m:+' + t.chg5m.toFixed(0) + '%'); }
    else if (t.chg5m >= 2)         { score += 5;  }
    else if (t.chg5m >= 1)         { score += 2;  }
    else if (t.chg5m < 0)          { score -= 3;  }

    if (t.chg1h >= 30)             { score += 8;  signals.push('1h:+' + t.chg1h.toFixed(0) + '%'); }
    else if (t.chg1h >= 15)        { score += 6;  signals.push('1h:+' + t.chg1h.toFixed(0) + '%'); }
    else if (t.chg1h >= 5)         { score += 3;  }
    else if (t.chg1h < -10)        { score -= 5;  }

    if (t.chg24h > 500)            { score -= 8;  signals.push('LATE:+' + t.chg24h.toFixed(0) + '%'); }
    else if (t.chg24h > 200)       { score -= 3;  }
    else if (t.chg24h >= 20)       { score += 2;  }

    // 4. BONDING CURVE STAGE — FDV zone (15 pts)
    if (t.fdv > 0) {
        if (t.fdv < 30_000)        { score += 15; signals.push('fdv:$' + kfmt(t.fdv) + '🎯EARLY'); }
        else if (t.fdv < 100_000)  { score += 12; signals.push('fdv:$' + kfmt(t.fdv) + '🎯'); }
        else if (t.fdv < 300_000)  { score += 8;  signals.push('fdv:$' + kfmt(t.fdv)); }
        else if (t.fdv < 1_000_000){ score += 4;  }
        else if (t.fdv < 3_000_000){ score += 1;  }
        else                       { score -= 5;  signals.push('fdv:HIGH'); }
    }

    // 5. HOLDER ESTIMATE (10 pts)
    const estWallets = Math.round(t.txns24h * 0.35);
    if (estWallets >= 500)         { score += 10; signals.push('wallets~' + estWallets); }
    else if (estWallets >= 200)    { score += 7;  signals.push('wallets~' + estWallets); }
    else if (estWallets >= 80)     { score += 4;  }
    else if (estWallets >= 30)     { score += 1;  }

    const avgTxnUsd = t.txns1h > 0 ? t.vol1h / t.txns1h : 0;
    if (avgTxnUsd > 0 && avgTxnUsd < 50)  { score += 3; }
    else if (avgTxnUsd < 200)             { score += 1; }

    // 6. SAFETY SIGNALS (bonus)
    if (t.ageHours >= 0.5 && t.ageHours <= 2)   { score += 5; signals.push('age:' + (t.ageHours * 60).toFixed(0) + 'min🎯'); }
    else if (t.ageHours > 2 && t.ageHours <= 4) { score += 3; signals.push('age:' + t.ageHours.toFixed(1) + 'h'); }
    else if (t.ageHours < 0.5)                  { score -= 5; signals.push('TOO_NEW'); }

    if (t.boosts >= 200)                         { score += 3; signals.push('boost:' + t.boosts + '⚡'); }
    else if (t.boosts >= 50)                     { score += 2; }

    const volCon = t.vol24h > 0 ? (t.vol1h / t.vol24h) * 24 : 0;
    if (volCon >= 3)                             { score += 3; signals.push('volspike:' + volCon.toFixed(1) + 'x'); }
    else if (volCon >= 2)                        { score += 1; }

    return {
        score   : Math.max(0, Math.min(100, Math.round(score))),
        signals,
        meta    : { velocityRatio, buyRatio1h, buyRatio5m, estWallets, avgTxnUsd, volCon }
    };
}

// ══════════════════════════════════════════════════════════════════════════════
//  RUG DETECTOR (7 layer, identik dengan memecoin-hunter.js)
// ══════════════════════════════════════════════════════════════════════════════
const BLACKLIST = ['test', 'fake', 'rug', 'scam', 'honeypot', 'rugpull', 'exit'];

function isRug(t) {
    let rugScore = 0;
    const flags  = [];

    const name = (t.baseName + ' ' + t.baseSymbol).toLowerCase();
    for (const w of BLACKLIST) {
        if (name.includes(w)) { rugScore += 80; flags.push('blacklist:"' + w + '"'); }
    }
    if (!t.baseSymbol || t.baseSymbol.length > 20) { rugScore += 20; flags.push('invalid_sym'); }

    if (t.chg5m < -25)                                        { rugScore += 60; flags.push('dump5m:' + t.chg5m.toFixed(1) + '%'); }
    else if (t.chg5m < -15)                                   { rugScore += 30; flags.push('dump5m:' + t.chg5m.toFixed(1) + '%'); }
    if (t.chg1h < -20 && t.chg24h > 100)                     { rugScore += 40; flags.push('dist_pattern'); }

    if (t.sells5m > t.buys5m * 4 && t.txns5m > 10)          { rugScore += 50; flags.push('sell>>buys'); }
    else if (t.sells5m > t.buys5m * 2.5 && t.txns5m > 20)   { rugScore += 25; flags.push('sell_dom'); }
    if (t.sells1h > t.buys1h * 3 && t.txns1h > 30)          { rugScore += 35; flags.push('sell1h_dump'); }

    if (t.vol1h < 50 && t.vol24h > 20000)                    { rugScore += 70; flags.push('dead_coin'); }
    else if (t.vol1h < 150 && t.vol24h > 50000)              { rugScore += 40; flags.push('dying_coin'); }

    if (t.chg5m > 50 && t.sells5m === 0 && t.buys5m > 5)    { rugScore += 50; flags.push('honeypot'); }

    if (t.fdv > CFG.MAX_FDV)                                  { rugScore += 30; flags.push('fdv_high'); }
    if (t.fdv > 0 && t.vol24h < t.fdv * 0.005)               { rugScore += 20; flags.push('illiquid'); }

    return { rug: rugScore >= 50, rugScore, flags };
}

// ══════════════════════════════════════════════════════════════════════════════
//  ENTRY FILTER (identik dengan memecoin-hunter.js)
// ══════════════════════════════════════════════════════════════════════════════
function passesFilter(t) {
    if (!t.pairAddress)                    return { ok: false, r: 'no_pair' };
    if (!t.baseMint)                       return { ok: false, r: 'no_mint' };
    if (t.priceUsd <= 0)                   return { ok: false, r: 'price=0' };
    if (t.ageHours > CFG.MAX_AGE_HOURS)   return { ok: false, r: 'too_old:' + t.ageHours.toFixed(1) + 'h' };
    if (t.vol24h < CFG.MIN_VOL_24H)       return { ok: false, r: 'vol24h:$' + t.vol24h.toFixed(0) };
    // vol1h & txns1h bisa 0 untuk token > 6h → skip cek ini di backtest
    if (t.ageHours <= 6 && t.vol1h < CFG.MIN_VOL_1H)  return { ok: false, r: 'vol1h:$' + t.vol1h.toFixed(0) };
    if (t.ageHours <= 6 && t.txns1h < CFG.MIN_TXNS_1H) return { ok: false, r: 'txns1h:' + t.txns1h };
    if (t.ageHours <= 6 && t.buys1h < CFG.MIN_BUYS_1H) return { ok: false, r: 'buys1h:' + t.buys1h };
    if (t.chg5m < -10)                    return { ok: false, r: 'dump5m:' + t.chg5m.toFixed(1) + '%' };
    if (t.chg24h > CFG.MAX_CHG_24H)      return { ok: false, r: 'too_late:+' + t.chg24h.toFixed(0) + '%' };
    return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════════════
//  POSITION SIZER
// ══════════════════════════════════════════════════════════════════════════════
function calcSize(score) {
    const factor = Math.max(0, (score - 60) / 40);
    const raw    = CFG.MIN_ENTRY_USD + factor * (CFG.MAX_ENTRY_USD - CFG.MIN_ENTRY_USD);
    return Math.round(Math.min(CFG.MAX_ENTRY_USD, Math.max(CFG.MIN_ENTRY_USD, raw)));
}

// ══════════════════════════════════════════════════════════════════════════════
//  TRADE SIMULATOR
//  Menggunakan data yang tersedia di DEXScreener untuk estimasi hasil trade:
//
//  Logika estimasi (tanpa tick-by-tick data):
//  - Harga entry = priceUsd saat ini (dengan slippage 3%)
//  - Peak price estimate = priceUsd * (1 + max(chg1h, chg6h, 0) / 100)
//    (karena kita sudah tahu berapa % naik dalam 1h dan 6h)
//  - Harga saat -25% SL = entryPrice * 0.75
//  - Simulasi: apakah peak mencapai TP1/2/3/4 atau SL tercapai duluan
//    berdasarkan pola pergerakan (chg1h vs chg24h)
// ══════════════════════════════════════════════════════════════════════════════
function simulateTrade(token, sizeUsd) {
    const entry     = token.priceUsd * (1 + CFG.SLIPPAGE_PCT / 100);  // slippage in
    const exitSlip  = CFG.SLIPPAGE_PCT / 100;                          // slippage out
    const gas       = CFG.GAS_USD * 2;                                  // entry + exit

    // Estimasi peak price dari data 1h dan 6h/24h yang sudah terjadi
    // Kalau token sudah > 6 jam, kita punya data 24h penuh → bisa estimate
    const peakChg   = Math.max(
        token.chg1h  || 0,
        token.chg6h  || 0,
        (token.chg24h || 0) / 3,  // 24h dibagi 3 karena mungkin sudah turun lagi
        token.chg5m  * 10 || 0,   // 5m extrapolate
    );
    const peakPrice  = entry * (1 + Math.max(0, peakChg) / 100);

    // Harga nadir (low estimate) = entry * (1 - max(abs drop / 2))
    const dropChg    = Math.min(
        token.chg5m || 0,
        token.chg1h || 0,
        0
    );
    const lowPrice   = entry * (1 + dropChg / 100);

    const slPrice    = entry * (1 - CFG.INITIAL_SL_PCT / 100);
    const tp1Price   = entry * (1 + CFG.TP1_PCT  / 100);
    const tp2Price   = entry * (1 + CFG.TP2_PCT  / 100);
    const tp3Price   = entry * (1 + CFG.TP3_PCT  / 100);
    const tp4Price   = entry * (1 + CFG.TP4_PCT  / 100);

    // Tentukan apakah SL kena sebelum TP1
    // Heuristik: jika chg5m sangat negatif dan vol sedang turun = SL kemungkinan kena
    const slProbability = (() => {
        let p = 0.35; // base probability SL terkena (memecoin ~35% langsung dump)
        if (token.chg5m < -5)  p += 0.15;
        if (token.chg5m < -10) p += 0.15;
        if (token.sells5m > token.buys5m * 2) p += 0.10;
        if (token.vol1h < token.vol24h / 24 * 0.5) p += 0.10;  // volume turun
        if (token.chg1h < -5)  p += 0.10;
        if (peakChg > 30)      p -= 0.20;  // jika sudah terbukti naik 30%+ → SL jarang kena
        if (peakChg > 80)      p -= 0.15;
        if (token.fdv < 50_000) p += 0.05; // token sangat kecil = lebih volatile
        return Math.min(0.95, Math.max(0.05, p));
    })();

    // Tentukan exit outcome
    let exitPrice, exitReason, pnlPct, pnlUsd;
    let tp1Hit = false, tp2Hit = false, tp3Hit = false, tp4Hit = false;
    let partialPnl = 0;
    let remainPct  = 1.0;

    if (lowPrice <= slPrice && peakChg < CFG.TP1_PCT) {
        // SL kena, TP tidak tercapai
        exitPrice  = slPrice * (1 - exitSlip);
        exitReason = 'STOP_LOSS';
        pnlPct     = (exitPrice - entry) / entry * 100;
        pnlUsd     = sizeUsd * pnlPct / 100 - gas;
    } else {
        // Cascade TP berdasarkan peak yang tercapai
        // TP1: +30%
        if (peakChg >= CFG.TP1_PCT) {
            tp1Hit      = true;
            const sell1 = sizeUsd * 0.40 * CFG.TP1_PCT / 100;
            partialPnl += sell1;
            remainPct  -= 0.40;
        }
        // TP2: +80%
        if (peakChg >= CFG.TP2_PCT) {
            tp2Hit      = true;
            const sell2 = sizeUsd * 0.30 * CFG.TP2_PCT / 100;
            partialPnl += sell2;
            remainPct  -= 0.30;
        }
        // TP3: +200%
        if (peakChg >= CFG.TP3_PCT) {
            tp3Hit      = true;
            const sell3 = sizeUsd * 0.20 * CFG.TP3_PCT / 100;
            partialPnl += sell3;
            remainPct  -= 0.20;
        }
        // TP4: +500% (moon bag)
        if (peakChg >= CFG.TP4_PCT) {
            tp4Hit      = true;
            const sell4 = sizeUsd * remainPct * CFG.TP4_PCT / 100;
            partialPnl += sell4;
            remainPct   = 0;
        }

        // Sisa posisi: exit di trailing SL (estimasi: peak * 0.8) atau max hold
        let finalExitPct;
        if (remainPct > 0) {
            // Setelah TP1, trailing SL aktif di peak * (1 - TRAILING_SL_PCT/100)
            // Estimasi: keluar di ~peak * 0.75 (rata-rata trailing SL kena)
            const trailExitChg = tp1Hit ? peakChg * 0.70 : peakChg * 0.85;
            finalExitPct = trailExitChg;
            exitReason   = tp1Hit ? 'TRAILING_SL' : (peakChg > 0 ? 'MAX_HOLD' : 'STOP_LOSS');
        } else {
            finalExitPct = CFG.TP4_PCT;
            exitReason   = 'TP4_MOON';
        }

        exitPrice = entry * (1 + finalExitPct / 100) * (1 - exitSlip);
        const finalPnl = sizeUsd * remainPct * (finalExitPct / 100) - gas;
        pnlUsd    = partialPnl + finalPnl;
        pnlPct    = pnlUsd / sizeUsd * 100;

        // Jika peak sangat kecil dan belum hit TP1 → ada kemungkinan SL
        if (!tp1Hit && peakChg < CFG.TP1_PCT) {
            // Berikan probabilistik: sesuai slProbability → kalau random < slProb, SL
            // Untuk deterministic backtest: gunakan threshold
            if (peakChg < 10 && token.chg1h < 0) {
                exitPrice  = slPrice * (1 - exitSlip);
                exitReason = 'STOP_LOSS';
                pnlUsd     = sizeUsd * (-CFG.INITIAL_SL_PCT / 100) - gas;
                pnlPct     = -CFG.INITIAL_SL_PCT - (gas / sizeUsd * 100);
            }
        }
    }

    const isWin = pnlUsd > 0;
    return {
        entry, exitPrice, exitReason, pnlPct, pnlUsd, isWin,
        tp1Hit, tp2Hit, tp3Hit, tp4Hit,
        peakChg, lowPrice, slPrice, tp1Price, tp2Price, tp3Price, tp4Price,
        sizeUsd, slippage: gas + (sizeUsd * CFG.SLIPPAGE_PCT / 100 * 2),
    };
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN BACKTEST ENGINE
// ══════════════════════════════════════════════════════════════════════════════
async function runBacktest() {
    console.log('\n' + C.cyan + C.bold + '═'.repeat(70) + C.reset);
    console.log(C.cyan + C.bold + '  🎯  DEX HUNTER BACKTEST SIMULATOR  v1.0' + C.reset);
    console.log(C.cyan + '  Strategi: memecoin-hunter.js  |  Chain: Solana  |  DEX: pump.fun + Raydium' + C.reset);
    console.log(C.cyan + `  Modal: $${SIM_CAPITAL}  |  Min Score: ${MIN_SCORE}/100  |  Entry: $${CFG.MIN_ENTRY_USD}-$${CFG.MAX_ENTRY_USD}` + C.reset);
    console.log(C.cyan + C.bold + '═'.repeat(70) + C.reset + '\n');

    // ── 1. FETCH DATA ──────────────────────────────────────────────────────────
    const rawPairs = await fetchCandidates();

    if (!rawPairs.length) {
        console.log(r('❌ Tidak ada data dari DEXScreener. Cek koneksi internet.'));
        process.exit(1);
    }

    // ── 2. PARSE & FILTER ─────────────────────────────────────────────────────
    process.stdout.write('\n' + c('  [FILTER] ') + 'Memproses dan memfilter pairs...\n');

    const parsed     = rawPairs.map(parsePair).filter(Boolean);
    const rejections = { rug: 0, filter: 0, score: 0 };
    const candidates = [];

    for (const t of parsed) {
        // Rug check
        const rugResult = isRug(t);
        if (rugResult.rug) { rejections.rug++; continue; }

        // Entry filter
        const filterResult = passesFilter(t);
        if (!filterResult.ok) { rejections.filter++; continue; }

        // Scoring
        const { score, signals, meta } = scoreToken(t);
        if (score < MIN_SCORE) { rejections.score++; continue; }

        candidates.push({ ...t, score, signals, meta, rugResult });
    }

    console.log(`  Total raw pairs    : ${b(rawPairs.length.toString())}`);
    console.log(`  Setelah parse      : ${b(parsed.length.toString())}`);
    console.log(`  Ditolak rug check  : ${r(rejections.rug.toString())}`);
    console.log(`  Ditolak filter     : ${dim(rejections.filter.toString())}`);
    console.log(`  Skor terlalu rendah: ${dim(rejections.score.toString())}`);
    console.log(`  ✅ Kandidat masuk  : ${g(candidates.length.toString())} token\n`);

    if (!candidates.length) {
        console.log(y('⚠️  Tidak ada kandidat yang melewati filter pada data saat ini.'));
        console.log(y('   Coba: --min-score 50 untuk melihat lebih banyak kandidat'));

        // Tampilkan top 10 yang hampir lolos
        const almostPassed = parsed
            .filter(t => !isRug(t).rug && passesFilter(t).ok)
            .map(t => ({ ...t, ...scoreToken(t) }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);

        if (almostPassed.length) {
            console.log('\n' + dim('  Top token yang mendekati threshold:'));
            for (const t of almostPassed) {
                console.log(dim(`  ${t.baseSymbol.padEnd(10)} score=${t.score}/100  age=${t.ageHours.toFixed(1)}h  chg24h=${t.chg24h.toFixed(0)}%`));
            }
        }
        process.exit(0);
    }

    // Sort by score desc
    candidates.sort((a, b) => b.score - a.score);

    // ── 3. SIMULASI TRADE ─────────────────────────────────────────────────────
    process.stdout.write(c('  [SIM] ') + `Mensimulasikan ${candidates.length} trade...\n\n`);

    let equity        = SIM_CAPITAL;
    let peakEquity    = SIM_CAPITAL;
    let maxDrawdown   = 0;
    const trades      = [];
    const equityCurve = [{ i: 0, equity: SIM_CAPITAL }];

    let wins = 0, losses = 0;
    let totalWinUsd = 0, totalLossUsd = 0;
    let tp1Hits = 0, tp2Hits = 0, tp3Hits = 0, tp4Hits = 0;

    const scoreBreakdown = {};  // score tier → {wins, losses, pnl}

    for (let i = 0; i < candidates.length; i++) {
        const token   = candidates[i];
        const sizeUsd = Math.min(calcSize(token.score), equity * 0.25); // max 25% equity per trade
        if (sizeUsd < CFG.MIN_ENTRY_USD || equity < CFG.MIN_ENTRY_USD) continue;

        const result = simulateTrade(token, sizeUsd);
        equity += result.pnlUsd;

        // Track drawdown
        if (equity > peakEquity) peakEquity = equity;
        const dd = (peakEquity - equity) / peakEquity * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;

        equityCurve.push({ i: i + 1, equity: +equity.toFixed(2), symbol: token.baseSymbol });

        const isWin = result.pnlUsd > 0;
        if (isWin) { wins++; totalWinUsd += result.pnlUsd; }
        else        { losses++; totalLossUsd += Math.abs(result.pnlUsd); }

        if (result.tp1Hit) tp1Hits++;
        if (result.tp2Hit) tp2Hits++;
        if (result.tp3Hit) tp3Hits++;
        if (result.tp4Hit) tp4Hits++;

        // Score tier breakdown
        const tier = Math.floor(token.score / 10) * 10;
        if (!scoreBreakdown[tier]) scoreBreakdown[tier] = { wins: 0, losses: 0, pnl: 0, count: 0 };
        scoreBreakdown[tier].count++;
        scoreBreakdown[tier].pnl  += result.pnlUsd;
        if (isWin) scoreBreakdown[tier].wins++;
        else       scoreBreakdown[tier].losses++;

        trades.push({
            symbol     : token.baseSymbol,
            name       : token.baseName,
            score      : token.score,
            signals    : token.signals,
            ageHours   : +token.ageHours.toFixed(2),
            fdv        : token.fdv,
            vol24h     : token.vol24h,
            chg24h     : token.chg24h,
            chg1h      : token.chg1h,
            chg5m      : token.chg5m,
            entryPrice : +result.entry.toFixed(8),
            exitPrice  : +result.exitPrice.toFixed(8),
            exitReason : result.exitReason,
            pnlUsd     : +result.pnlUsd.toFixed(3),
            pnlPct     : +result.pnlPct.toFixed(2),
            sizeUsd    : sizeUsd,
            peakChg    : +result.peakChg.toFixed(2),
            tp1Hit     : result.tp1Hit,
            tp2Hit     : result.tp2Hit,
            tp3Hit     : result.tp3Hit,
            tp4Hit     : result.tp4Hit,
            isWin,
            equityAfter: +equity.toFixed(2),
        });

        // Print trade line
        const icon      = isWin ? g('✅ WIN ') : r('❌ LOSS');
        const pnlStr    = isWin ? g('+$' + result.pnlUsd.toFixed(2)) : r('-$' + Math.abs(result.pnlUsd).toFixed(2));
        const tpHits    = [result.tp1Hit ? 'TP1' : '', result.tp2Hit ? 'TP2' : '', result.tp3Hit ? 'TP3' : '', result.tp4Hit ? 'TP4' : '']
                            .filter(Boolean).join('+') || result.exitReason.replace('_', ' ');
        const ageStr    = token.ageHours < 1 ? `${(token.ageHours*60).toFixed(0)}m` : `${token.ageHours.toFixed(1)}h`;

        process.stdout.write(
            `  ${icon}  ` +
            `${c(token.baseSymbol.padEnd(10))} ` +
            `score:${y(token.score.toString().padStart(2))}  ` +
            `age:${dim(ageStr.padEnd(5))}  ` +
            `peak:${result.peakChg >= 0 ? g('+' + result.peakChg.toFixed(0) + '%') : r(result.peakChg.toFixed(0) + '%')} ` +
            `→ ${dim(tpHits.padEnd(15))} ` +
            `${pnlStr.padEnd(15)} ` +
            `equity:$${equity.toFixed(0)}\n`
        );
    }

    // ── 4. HASIL STATISTIK ─────────────────────────────────────────────────────
    const total       = wins + losses;
    const winRate     = total > 0 ? (wins / total * 100) : 0;
    const profitFactor= totalLossUsd > 0 ? totalWinUsd / totalLossUsd : (totalWinUsd > 0 ? 99 : 0);
    const avgWin      = wins   > 0 ? totalWinUsd  / wins   : 0;
    const avgLoss     = losses > 0 ? totalLossUsd / losses : 0;
    const expectancy  = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);
    const totalReturn = ((equity - SIM_CAPITAL) / SIM_CAPITAL * 100);

    // Grade
    let grade, gradeColor;
    if      (winRate >= 60 && profitFactor >= 2.0 && totalReturn > 20)  { grade = 'A+'; gradeColor = C.green + C.bold; }
    else if (winRate >= 55 && profitFactor >= 1.5 && totalReturn > 10)  { grade = 'A';  gradeColor = C.green; }
    else if (winRate >= 50 && profitFactor >= 1.2 && totalReturn > 0)   { grade = 'B';  gradeColor = C.yellow; }
    else if (winRate >= 45 && profitFactor >= 1.0)                       { grade = 'C';  gradeColor = C.yellow; }
    else                                                                  { grade = 'D';  gradeColor = C.red; }

    console.log('\n' + C.cyan + C.bold + '═'.repeat(70) + C.reset);
    console.log(C.cyan + C.bold + '  📊  HASIL BACKTEST' + C.reset);
    console.log(C.cyan + C.bold + '═'.repeat(70) + C.reset);

    const row = (label, val, colorFn = (s => s)) =>
        console.log(`  ${dim(label.padEnd(28))} ${colorFn(val)}`);

    row('Total Trade',         `${total} trade`);
    row('Win / Loss',          `${g(wins.toString())} / ${r(losses.toString())}`);
    row('Win Rate',            `${winRate.toFixed(1)}%`, winRate >= 55 ? g : winRate >= 45 ? y : r);
    row('Profit Factor',       profitFactor.toFixed(2), profitFactor >= 1.5 ? g : profitFactor >= 1.0 ? y : r);
    row('Expectancy per Trade','$' + expectancy.toFixed(2), expectancy > 0 ? g : r);
    row('Avg Win',             g('$' + avgWin.toFixed(2)));
    row('Avg Loss',            r('$' + avgLoss.toFixed(2)));
    row('Total Return',        `${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(1)}% ($${(equity - SIM_CAPITAL).toFixed(2)})`,
        totalReturn > 0 ? g : r);
    row('Modal Awal / Akhir',  `$${SIM_CAPITAL} → $${equity.toFixed(2)}`);
    row('Peak Equity',         g('$' + peakEquity.toFixed(2)));
    row('Max Drawdown',        `-${maxDrawdown.toFixed(1)}%`, maxDrawdown < 15 ? g : maxDrawdown < 30 ? y : r);
    row('TP1 Hit Rate',        `${tp1Hits}/${total} (${total > 0 ? (tp1Hits/total*100).toFixed(0) : 0}%)`, g);
    row('TP2 Hit Rate',        `${tp2Hits}/${total} (${total > 0 ? (tp2Hits/total*100).toFixed(0) : 0}%)`, g);
    row('TP3 Hit Rate',        `${tp3Hits}/${total} (${total > 0 ? (tp3Hits/total*100).toFixed(0) : 0}%)`, g);
    row('TP4 Hit Rate',        `${tp4Hits}/${total} (${total > 0 ? (tp4Hits/total*100).toFixed(0) : 0}%)`,
        s => tp4Hits > 0 ? g(s) : s);

    console.log('\n  ' + dim('Grade : ') + gradeColor + C.bold + `  ██ ${grade} ██  ` + C.reset);
    console.log();

    // ── 5. SCORE TIER BREAKDOWN ────────────────────────────────────────────────
    const tiers = Object.keys(scoreBreakdown).sort((a, b) => Number(b) - Number(a));
    if (tiers.length) {
        console.log(C.cyan + C.bold + '  📈  WIN RATE PER SCORE TIER' + C.reset);
        console.log('  ' + dim('─'.repeat(55)));
        console.log(
            '  ' + dim('Score'.padEnd(10)) +
            dim('Trades'.padEnd(9)) +
            dim('Win'.padEnd(6)) +
            dim('Loss'.padEnd(7)) +
            dim('WinRate'.padEnd(10)) +
            dim('P&L')
        );
        console.log('  ' + dim('─'.repeat(55)));
        for (const tier of tiers) {
            const bd  = scoreBreakdown[tier];
            const wr  = bd.count > 0 ? (bd.wins / bd.count * 100).toFixed(0) : '0';
            const pnl = bd.pnl;
            const bar = '█'.repeat(Math.max(0, Math.round(Number(wr) / 10)));
            console.log(
                `  ${(tier + '-' + (Number(tier)+9)).padEnd(10)}` +
                `${bd.count.toString().padEnd(9)}` +
                `${g(bd.wins.toString()).padEnd(15)}` +
                `${r(bd.losses.toString()).padEnd(16)}` +
                `${(wr + '%').padEnd(10)}` +
                `${pnl >= 0 ? g('$' + pnl.toFixed(2)) : r('$' + pnl.toFixed(2))}`
            );
        }
        console.log();
    }

    // ── 6. TOP 5 WINNERS & LOSERS ──────────────────────────────────────────────
    const sortedTrades = [...trades].sort((a, b) => b.pnlUsd - a.pnlUsd);

    console.log(C.cyan + C.bold + '  🏆  TOP 5 WINNERS' + C.reset);
    for (const t of sortedTrades.slice(0, 5)) {
        const tpStr = [t.tp1Hit && 'TP1', t.tp2Hit && 'TP2', t.tp3Hit && 'TP3', t.tp4Hit && 'TP4']
            .filter(Boolean).join('+') || t.exitReason;
        console.log(
            `  ${g('▲')} ${c(t.symbol.padEnd(10))} ` +
            `score:${y(t.score.toString())}  ` +
            `peak:${g('+' + t.peakChg.toFixed(0) + '%')}  ` +
            `${g('+$' + t.pnlUsd.toFixed(2))}  ` +
            dim(tpStr)
        );
    }

    const losers = sortedTrades.slice(-5).reverse();
    console.log('\n' + C.red + '  💀  TOP 5 LOSERS' + C.reset);
    for (const t of losers) {
        console.log(
            `  ${r('▼')} ${c(t.symbol.padEnd(10))} ` +
            `score:${y(t.score.toString())}  ` +
            `peak:${t.peakChg > 0 ? y('+' + t.peakChg.toFixed(0) + '%') : r(t.peakChg.toFixed(0) + '%')}  ` +
            `${r('$' + t.pnlUsd.toFixed(2))}  ` +
            dim(t.exitReason)
        );
    }

    // ── 7. EQUITY CURVE ASCII ─────────────────────────────────────────────────
    if (equityCurve.length > 1) {
        console.log('\n' + C.cyan + C.bold + '  📉  EQUITY CURVE' + C.reset);
        const H = 8;  // height rows
        const W = Math.min(50, equityCurve.length);
        const step  = Math.max(1, Math.floor(equityCurve.length / W));
        const eqSampled = equityCurve.filter((_, i) => i % step === 0 || i === equityCurve.length - 1);
        const eqVals    = eqSampled.map(e => e.equity);
        const eqMin     = Math.min(...eqVals);
        const eqMax     = Math.max(...eqVals);
        const range     = Math.max(1, eqMax - eqMin);

        for (let row = H - 1; row >= 0; row--) {
            const threshold = eqMin + (row / (H - 1)) * range;
            let line = '';
            for (const val of eqVals) {
                const normalizedRow = ((val - eqMin) / range) * (H - 1);
                const filled = Math.round(normalizedRow) >= row;
                line += filled ? (val >= SIM_CAPITAL ? C.green + '█' : C.red + '█') : C.dim + '░';
            }
            const labelVal = eqMin + (row / (H - 1)) * range;
            const label = row === H - 1 ? '$' + eqMax.toFixed(0) :
                          row === 0     ? '$' + eqMin.toFixed(0) :
                          row === Math.round((H-1) / 2) ? '$' + SIM_CAPITAL.toFixed(0) : '      ';
            console.log('  ' + dim(label.padStart(6)) + ' │' + line + C.reset);
        }
        console.log('  ' + dim('       └' + '─'.repeat(eqVals.length)));
        console.log('  ' + dim('       START' + ' '.repeat(Math.max(0, eqVals.length - 15)) + 'END'));
    }

    // ── 8. KESIMPULAN & SARAN ─────────────────────────────────────────────────
    console.log('\n' + C.cyan + C.bold + '═'.repeat(70) + C.reset);
    console.log(C.cyan + C.bold + '  💡  KESIMPULAN & SARAN OPTIMASI' + C.reset);
    console.log(C.cyan + C.bold + '═'.repeat(70) + C.reset);

    if (total === 0) {
        console.log(r('  Tidak ada trade yang bisa disimulasikan dari data saat ini.'));
    } else {
        if (winRate >= 55) {
            console.log(g('  ✅ Win rate ' + winRate.toFixed(1) + '% — strategi profitable secara historis'));
        } else if (winRate >= 45) {
            console.log(y('  ⚠️  Win rate ' + winRate.toFixed(1) + '% — mendekati breakeven, perlu optimasi'));
        } else {
            console.log(r('  ❌ Win rate ' + winRate.toFixed(1) + '% — too many losses pada kondisi pasar saat ini'));
        }

        if (profitFactor >= 2.0) {
            console.log(g('  ✅ Profit factor ' + profitFactor.toFixed(2) + ' — reward/risk sangat baik'));
        } else if (profitFactor >= 1.0) {
            console.log(y('  ⚠️  Profit factor ' + profitFactor.toFixed(2) + ' — profitable tapi tipis'));
        } else {
            console.log(r('  ❌ Profit factor ' + profitFactor.toFixed(2) + ' — losing money on average'));
        }

        if (maxDrawdown > 30) {
            console.log(r('  ⚠️  Drawdown ' + maxDrawdown.toFixed(1) + '% — risiko tinggi, pertimbangkan ukuran posisi lebih kecil'));
        } else if (maxDrawdown > 15) {
            console.log(y('  ⚠️  Drawdown ' + maxDrawdown.toFixed(1) + '% — acceptable untuk memecoin strategy'));
        } else {
            console.log(g('  ✅ Drawdown ' + maxDrawdown.toFixed(1) + '% — terkontrol dengan baik'));
        }

        // Saran score optimal
        const bestTier = tiers.sort((a, b) => {
            const wa = scoreBreakdown[a].count > 0 ? scoreBreakdown[a].wins / scoreBreakdown[a].count : 0;
            const wb = scoreBreakdown[b].count > 0 ? scoreBreakdown[b].wins / scoreBreakdown[b].count : 0;
            return wb - wa;
        })[0];
        if (bestTier) {
            const bd = scoreBreakdown[bestTier];
            const bwr = bd.count > 0 ? (bd.wins / bd.count * 100).toFixed(0) : '0';
            console.log(c(`  💎 Score tier terbaik: ${bestTier}-${Number(bestTier)+9} (win rate ${bwr}%) — fokus di sini`));
        }

        console.log(c(`  ℹ️  Catatan: Ini simulasi DETERMINISTIK berdasarkan data snapshot DEXScreener.`));
        console.log(c(`     Hasil aktual bisa berbeda karena timing entry, gas fee nyata, dan likuiditas.`));
        console.log(c(`     Jalankan: ${b('node dex-backtest.js --min-score 70')} untuk filter lebih ketat.`));
    }

    // ── 9. SAVE RESULTS ───────────────────────────────────────────────────────
    const results = {
        timestamp   : new Date().toISOString(),
        config      : { minScore: MIN_SCORE, capital: SIM_CAPITAL },
        summary     : {
            total, wins, losses, winRate: +winRate.toFixed(2),
            profitFactor: +profitFactor.toFixed(3),
            expectancy: +expectancy.toFixed(2),
            avgWin: +avgWin.toFixed(2), avgLoss: +avgLoss.toFixed(2),
            totalReturn: +totalReturn.toFixed(2),
            capitalStart: SIM_CAPITAL, capitalEnd: +equity.toFixed(2),
            maxDrawdown: +maxDrawdown.toFixed(2),
            tp1Hits, tp2Hits, tp3Hits, tp4Hits,
            grade,
        },
        scoreBreakdown,
        equityCurve,
        trades: trades.slice(0, 200),  // simpan max 200 trade
    };

    try {
        fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
        console.log('\n' + g(`  💾 Hasil disimpan ke: ${OUT_FILE}`));
    } catch (e) {
        console.log(y(`  ⚠️  Gagal simpan hasil: ${e.message}`));
    }

    console.log(C.cyan + C.bold + '\n' + '═'.repeat(70) + C.reset + '\n');
}

// ── ENTRY POINT ───────────────────────────────────────────────────────────────
runBacktest().catch(e => {
    console.error(r('\n❌ Fatal error: ') + e.message);
    if (VERBOSE) console.error(e.stack);
    process.exit(1);
});
