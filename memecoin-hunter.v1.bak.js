#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  memecoin-hunter.js — DEX Memecoin Auto-Trader
//
//  Strategy: Early Entry pada token pump.fun / Solana yang baru launch
//  - Scan DEXScreener setiap 30 detik
//  - Scoring Engine: Volume, Momentum, Maker count, Txn velocity, Age, Safety
//  - Rug-pull filter: liquidity ratio, maker distribution, sudden dump detect
//  - Auto-buy via Jupiter API (DRY RUN mode default)
//  - Auto-sell: trailing stop + TP cascade
//
//  Jalankan: node memecoin-hunter.js
//            node memecoin-hunter.js --live   (LIVE — butuh SOL wallet)
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const fetch   = require('node-fetch');
const fs      = require('fs');
const path    = require('path');
const dex     = require('./dex-screener-api');

const ARGS     = process.argv.slice(2);
const IS_LIVE  = ARGS.includes('--live');
const STATE_F  = path.join(__dirname, 'memecoin-state.json');
const LOG_F    = path.join(__dirname, 'memecoin-hunter.log');

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════════════════════
const CFG = {
    DRY_RUN          : !IS_LIVE,

    // Filter awal — token harus lolos semua ini
    MAX_AGE_HOURS    : 24,          // token maks 24 jam umurnya
    MIN_VOL_24H      : 10000,       // min $10k volume 24h
    MIN_VOL_1H       : 500,         // min $500 vol 1h (masih aktif)
    MIN_TXNS_24H     : 200,         // min 200 txns
    MIN_MAKERS_24H   : 0,           // pump.fun tidak expose makers — skip filter ini
    MIN_CHG_24H      : 150,         // min +150% dalam 24h
    MIN_LIQ_USD      : 0,           // pump.fun liq = 0 di API — skip filter ini
    MAX_FDV          : 10_000_000,  // maks $10M FDV

    // Scoring thresholds
    MIN_SCORE        : 60,          // skor minimum untuk BUY (0–100)

    // Entry / sizing
    ENTRY_USD        : 20,          // DRY RUN paper trade $20 per posisi
    MAX_POSITIONS    : 5,           // maks 5 posisi bersamaan
    MAX_DAILY_LOSS   : 50,          // stop trading hari ini jika rugi > $50

    // Exit strategy
    TP1_PCT          : 50,          // TP1: +50% → jual 50% posisi
    TP2_PCT          : 100,         // TP2: +100% → jual 30% posisi
    TP3_PCT          : 300,         // TP3: +300% → jual 20% posisi
    TRAILING_SL_PCT  : 25,          // trailing SL: 25% dari peak
    INITIAL_SL_PCT   : 30,          // initial SL: -30% dari entry (rug protection)
    MAX_HOLD_HOURS   : 48,          // force close setelah 48 jam

    // Safety
    CHAIN            : 'solana',
    SCAN_INTERVAL_MS : 30_000,      // scan setiap 30 detik
    PRICE_CHECK_MS   : 15_000,      // cek harga setiap 15 detik
    BLACKLIST_WORDS  : ['test', 'fake', 'rug', 'scam', 'honeypot'], // skip token ini
};

// ══════════════════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════════════════
let STATE = {
    positions    : {},   // pairAddress → position object
    closedTrades : [],
    scannedPairs : new Set(),
    totalPnl     : 0,
    dailyPnl     : 0,
    dailyDate    : new Date().toDateString(),
    stats        : { totalTrades: 0, wins: 0, losses: 0, bestTrade: 0, worstTrade: 0 },
    lastScanAt   : null,
};

function saveState() {
    const s = { ...STATE, scannedPairs: [...STATE.scannedPairs] };
    fs.writeFileSync(STATE_F, JSON.stringify(s, null, 2));
}

function loadState() {
    try {
        if (fs.existsSync(STATE_F)) {
            const s = JSON.parse(fs.readFileSync(STATE_F, 'utf8'));
            s.scannedPairs = new Set(s.scannedPairs || []);
            STATE = { ...STATE, ...s };
        }
    } catch (e) { log(`WARN loadState: ${e.message}`); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOGGING
// ══════════════════════════════════════════════════════════════════════════════
function log(msg) {
    const ts  = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const out = `[${ts}] ${msg}`;
    console.log(out);
    fs.appendFileSync(LOG_F, out + '\n');
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCORING ENGINE
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Hitung skor 0-100 untuk token
 * Skor tinggi = peluang pump lebih besar
 */
function scoreToken(t) {
    let score = 0;
    const reasons = [];

    // 1. MOMENTUM (30 pts) — seberapa kuat harga naik
    const chg = t.chg24h;
    if (chg >= 1000)    { score += 30; reasons.push(`chg24h:${chg.toFixed(0)}%🔥`); }
    else if (chg >= 500) { score += 25; reasons.push(`chg24h:${chg.toFixed(0)}%`); }
    else if (chg >= 200) { score += 20; reasons.push(`chg24h:${chg.toFixed(0)}%`); }
    else if (chg >= 100) { score += 12; reasons.push(`chg24h:${chg.toFixed(0)}%`); }

    // Bonus: masih naik 1h terakhir (sinyal belum dead cat)
    if (t.chg1h > 10)   { score += 5;  reasons.push(`1h:+${t.chg1h.toFixed(0)}%`); }
    if (t.chg5m > 2)    { score += 5;  reasons.push(`5m:+${t.chg5m.toFixed(0)}%`); }

    // 2. VOLUME & ACTIVITY (25 pts)
    if (t.vol1h >= 10000)   { score += 10; reasons.push(`vol1h:$${_kfmt(t.vol1h)}`); }
    else if (t.vol1h >= 2000) { score += 6; reasons.push(`vol1h:$${_kfmt(t.vol1h)}`); }

    if (t.txns1h >= 200)    { score += 8; reasons.push(`txns1h:${t.txns1h}`); }
    else if (t.txns1h >= 50) { score += 4; reasons.push(`txns1h:${t.txns1h}`); }

    if (t.buys1h > t.sells1h * 1.5) { score += 7; reasons.push(`buy>sell`); }

    // 3. MAKER DISTRIBUTION (20 pts) — banyak wallet = tidak concentrated
    if (t.makers24h >= 500)    { score += 20; reasons.push(`makers:${t.makers24h}🔥`); }
    else if (t.makers24h >= 200) { score += 15; reasons.push(`makers:${t.makers24h}`); }
    else if (t.makers24h >= 100) { score += 10; reasons.push(`makers:${t.makers24h}`); }
    else if (t.makers24h >= 50)  { score += 5;  reasons.push(`makers:${t.makers24h}`); }

    // 4. AGE SWEET SPOT (15 pts) — terlalu baru = risiko, terlalu tua = telat
    if (t.ageHours >= 1 && t.ageHours <= 6)    { score += 15; reasons.push(`age:${t.ageHours.toFixed(1)}h🎯`); }
    else if (t.ageHours > 6 && t.ageHours <= 12)  { score += 10; reasons.push(`age:${t.ageHours.toFixed(1)}h`); }
    else if (t.ageHours > 12 && t.ageHours <= 24)  { score += 5; }

    // 5. LIQUIDITY SAFETY (10 pts) — pump.fun liquidity di-report 0 di DEXScreener API
    // Ganti dengan FDV check: FDV kecil = masih early = lebih besar upside
    if (t.fdv > 0 && t.fdv < 100_000)       { score += 10; reasons.push(`fdv:$${_kfmt(t.fdv)}🎯`); }
    else if (t.fdv < 500_000)               { score += 7;  reasons.push(`fdv:$${_kfmt(t.fdv)}`); }
    else if (t.fdv < 1_000_000)             { score += 4; }
    else if (t.fdv >= CFG.MAX_FDV)          { score -= 5;  reasons.push(`HIGH_FDV`); }  // penalty

    // 6. BOOSTS (bonus 5 pts) — ada yang bayar boost = ada yang percaya
    if (t.boosts >= 500) { score += 5; reasons.push(`boost:${t.boosts}⚡`); }
    else if (t.boosts >= 100) { score += 3; reasons.push(`boost:${t.boosts}`); }

    return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * RUG-PULL FILTER — return true jika token TIDAK aman (jangan beli)
 * Catatan: pump.fun token memiliki liquidity=0 dari DEXScreener API,
 * tapi sebenarnya mereka punya bonding curve liquidity internal.
 */
function isRug(t) {
    const reasons = [];

    // 1. Volume sangat kecil dibanding FDV → liquidity tipis
    if (t.fdv > 0 && t.vol24h < t.fdv * 0.01) {
        // vol kurang dari 1% FDV → mungkin honeypot / tidak liquid
        reasons.push(`vol/fdv terlalu kecil: ${(t.vol24h/t.fdv*100).toFixed(2)}%`);
    }

    // 2. Dump 5m parah sementara 24h masih tinggi → ada yang dump sekarang
    if (t.chg5m < -25 && t.chg24h > 300) {
        reasons.push(`dump 5m: ${t.chg5m.toFixed(1)}% (possible rug now)`);
        return { rug: true, reasons };
    }

    // 3. Nama mengandung kata suspicious
    const name = (t.baseName + ' ' + t.baseSymbol).toLowerCase();
    for (const w of CFG.BLACKLIST_WORDS) {
        if (name.includes(w)) {
            reasons.push(`blacklist word: "${w}"`);
            return { rug: true, reasons };
        }
    }

    // 4. FDV terlalu besar → sudah terlambat masuk
    if (t.fdv > CFG.MAX_FDV) {
        reasons.push(`FDV terlalu besar: $${_kfmt(t.fdv)}`);
        return { rug: false, reasons };  // warning saja, bukan rug
    }

    // 5. Sell >> buy 5m dan volume 5m significant → distribusi aktif
    if (t.sells5m > t.buys5m * 4 && t.txns5m > 20) {
        reasons.push(`sell>>buy 5m (${t.sells5m}/${t.buys5m})`);
        return { rug: true, reasons };
    }

    // 6. Volume 1h = 0 tapi 24h besar → sudah mati (dead coin)
    if (t.vol1h < 100 && t.vol24h > 50000) {
        reasons.push(`vol1h=$${t.vol1h} (dead coin — pump sudah selesai)`);
        return { rug: true, reasons };
    }

    return { rug: false, reasons };
}

// ══════════════════════════════════════════════════════════════════════════════
//  ENTRY FILTER — semua kriteria harus lolos
// ══════════════════════════════════════════════════════════════════════════════
function passesFilter(t) {
    if (t.ageHours > CFG.MAX_AGE_HOURS)    return { ok: false, reason: `terlalu tua: ${t.ageHours.toFixed(1)}h` };
    if (t.vol24h < CFG.MIN_VOL_24H)        return { ok: false, reason: `vol24h kecil: $${t.vol24h}` };
    if (t.vol1h < CFG.MIN_VOL_1H)          return { ok: false, reason: `vol1h kecil: $${t.vol1h}` };
    if (t.txns24h < CFG.MIN_TXNS_24H)      return { ok: false, reason: `txns rendah: ${t.txns24h}` };
    if (t.chg24h < CFG.MIN_CHG_24H)        return { ok: false, reason: `chg24h kecil: ${t.chg24h}%` };
    if (t.priceUsd <= 0)                   return { ok: false, reason: `price = 0` };
    // pump.fun: liquidity bisa 0 dari API, jadi skip liquidity filter
    // pump.fun: makers tidak di-expose, skip makers filter
    return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════════════
//  POSITION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
function openPosition(token, score, reasons) {
    const pa = token.pairAddress;
    if (STATE.positions[pa]) return null;  // sudah open
    if (Object.keys(STATE.positions).length >= CFG.MAX_POSITIONS) return null;

    const pos = {
        pairAddress  : pa,
        coinSymbol   : token.baseSymbol,
        coinName     : token.baseName,
        baseMint     : token.baseMint,
        chain        : token.chain,
        dex          : token.dex,
        url          : token.url,

        entryPrice   : token.priceUsd,
        peakPrice    : token.priceUsd,
        currentPrice : token.priceUsd,
        sizeUsd      : CFG.ENTRY_USD,

        // Stop loss & TP levels
        stopLoss     : token.priceUsd * (1 - CFG.INITIAL_SL_PCT / 100),
        tp1Price     : token.priceUsd * (1 + CFG.TP1_PCT / 100),
        tp2Price     : token.priceUsd * (1 + CFG.TP2_PCT / 100),
        tp3Price     : token.priceUsd * (1 + CFG.TP3_PCT / 100),
        trailingSl   : token.priceUsd * (1 - CFG.TRAILING_SL_PCT / 100),

        // Sizing state
        remainPct    : 1.0,   // sisa posisi (1.0 = 100%)
        tp1Hit       : false,
        tp2Hit       : false,
        tp3Hit       : false,

        // Metadata
        score        : score,
        scoreReasons : reasons,
        ageAtEntry   : token.ageHours,
        vol24hAtEntry: token.vol24h,
        openedAt     : new Date().toISOString(),
        openedAtMs   : Date.now(),
        maxHoldMs    : CFG.MAX_HOLD_HOURS * 3600000,
    };

    STATE.positions[pa] = pos;
    saveState();
    return pos;
}

function closePosition(pa, exitPrice, reason) {
    const pos = STATE.positions[pa];
    if (!pos) return null;

    const pnlPct = (exitPrice - pos.entryPrice) / pos.entryPrice * 100;
    const pnlUsd = pos.sizeUsd * pos.remainPct * pnlPct / 100;

    const closed = {
        ...pos,
        exitPrice,
        closedAt     : new Date().toISOString(),
        reason,
        pnlPct,
        pnlUsd,
        durationMs   : Date.now() - pos.openedAtMs,
    };

    STATE.closedTrades.unshift(closed);
    if (STATE.closedTrades.length > 200) STATE.closedTrades.length = 200;

    STATE.totalPnl += pnlUsd;
    STATE.dailyPnl += pnlUsd;
    STATE.stats.totalTrades++;
    if (pnlUsd > 0)  STATE.stats.wins++;
    else             STATE.stats.losses++;
    STATE.stats.bestTrade  = Math.max(STATE.stats.bestTrade, pnlUsd);
    STATE.stats.worstTrade = Math.min(STATE.stats.worstTrade, pnlUsd);

    delete STATE.positions[pa];
    saveState();

    return closed;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRICE UPDATE & EXIT LOGIC
// ══════════════════════════════════════════════════════════════════════════════
async function checkPositions() {
    const pas = Object.keys(STATE.positions);
    if (pas.length === 0) return;

    for (const pa of pas) {
        const pos = STATE.positions[pa];
        try {
            // Fetch current price
            const pairs = await dex.getPair(pa, CFG.CHAIN);
            if (!pairs.length) continue;
            const t = pairs[0];
            const price = t.priceUsd;
            if (!price || price <= 0) continue;

            pos.currentPrice = price;

            // Update peak & trailing SL
            if (price > pos.peakPrice) {
                pos.peakPrice  = price;
                pos.trailingSl = price * (1 - CFG.TRAILING_SL_PCT / 100);
            }

            const pnlPct = (price - pos.entryPrice) / pos.entryPrice * 100;

            // ── TP CASCADE ────────────────────────────────────────
            if (!pos.tp1Hit && price >= pos.tp1Price) {
                pos.tp1Hit     = true;
                pos.remainPct -= 0.50;   // jual 50%
                const partial  = pos.sizeUsd * 0.50 * CFG.TP1_PCT / 100;
                STATE.totalPnl += partial;
                STATE.dailyPnl += partial;
                log(`💰 TP1 HIT ${pos.coinSymbol} +${CFG.TP1_PCT}% → jual 50% | partial P&L: +$${partial.toFixed(2)}`);
                saveState();
            }

            if (!pos.tp2Hit && price >= pos.tp2Price) {
                pos.tp2Hit     = true;
                pos.remainPct -= 0.30;   // jual 30%
                const partial  = pos.sizeUsd * 0.30 * CFG.TP2_PCT / 100;
                STATE.totalPnl += partial;
                STATE.dailyPnl += partial;
                log(`🎯 TP2 HIT ${pos.coinSymbol} +${CFG.TP2_PCT}% → jual 30% | partial P&L: +$${partial.toFixed(2)}`);
                saveState();
            }

            if (!pos.tp3Hit && price >= pos.tp3Price) {
                pos.tp3Hit     = true;
                // Jual semua sisa setelah TP3
                const closed = closePosition(pa, price, 'TP3 hit (+300%)');
                if (closed) log(`🚀 TP3 HIT ${pos.coinSymbol} +${pnlPct.toFixed(0)}% | P&L: ${_pnl(closed.pnlUsd)} | FULL CLOSE`);
                continue;
            }

            // ── TRAILING STOP ─────────────────────────────────────
            if (price <= pos.trailingSl && pos.tp1Hit) {
                // Trailing SL hanya berlaku setelah TP1 hit (lock profit)
                const closed = closePosition(pa, price, 'Trailing SL');
                if (closed) log(`🛡️ TRAILING SL ${pos.coinSymbol} @$${price} | P&L: ${_pnl(closed.pnlUsd)}`);
                continue;
            }

            // ── INITIAL STOP LOSS ──────────────────────────────────
            if (price <= pos.stopLoss) {
                const closed = closePosition(pa, price, 'Stop Loss');
                if (closed) log(`🔴 STOP LOSS ${pos.coinSymbol} @$${price} (${pnlPct.toFixed(1)}%) | P&L: ${_pnl(closed.pnlUsd)}`);
                continue;
            }

            // ── MAX HOLD TIME ──────────────────────────────────────
            if (Date.now() - pos.openedAtMs > pos.maxHoldMs) {
                const closed = closePosition(pa, price, `Max hold ${CFG.MAX_HOLD_HOURS}h`);
                if (closed) log(`⏰ MAX HOLD ${pos.coinSymbol} ${CFG.MAX_HOLD_HOURS}h | P&L: ${_pnl(closed.pnlUsd)}`);
                continue;
            }

        } catch (e) {
            log(`WARN checkPositions ${pos.coinSymbol}: ${e.message}`);
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCAN LOOP
// ══════════════════════════════════════════════════════════════════════════════
async function runScan() {
    STATE.lastScanAt = new Date().toISOString();

    // Reset daily PnL
    const today = new Date().toDateString();
    if (STATE.dailyDate !== today) {
        STATE.dailyDate = today;
        STATE.dailyPnl  = 0;
    }

    // Circuit breaker
    if (STATE.dailyPnl < -CFG.MAX_DAILY_LOSS) {
        log(`⛔ CIRCUIT BREAKER: daily loss > $${CFG.MAX_DAILY_LOSS}. Tidak scan hari ini.`);
        return;
    }

    try {
        // Fetch multiple sources
        const [gainers, boosted] = await Promise.allSettled([
            dex.getTopGainers(CFG.CHAIN, '24h'),
            dex.getBoostedTokens(),
        ]);

        let pairs = gainers.status === 'fulfilled' ? gainers.value : [];

        // Tambahkan boosted tokens yang belum ada
        if (boosted.status === 'fulfilled' && boosted.value.length > 0) {
            const boostMints = boosted.value.map(b => b.baseMint).filter(Boolean);
            for (const mint of boostMints.slice(0, 10)) {
                try {
                    const bp = await dex.getTokenPairs(mint);
                    const sol = bp.filter(p => p.chain === CFG.CHAIN);
                    if (sol.length) pairs.push(sol[0]);
                } catch {}
            }
        }

        // De-dup by pairAddress
        const seen = new Set();
        pairs = pairs.filter(p => {
            if (!p || seen.has(p.pairAddress)) return false;
            seen.add(p.pairAddress);
            return true;
        });

        log(`📡 Scan: ${pairs.length} token ditemukan dari DEXScreener`);

        let candidates = 0;
        let skipped    = 0;

        for (const t of pairs) {
            // Sudah pernah dianalisa dan skip
            if (STATE.scannedPairs.has(t.pairAddress) && !STATE.positions[t.pairAddress]) {
                // Re-check setiap 10 menit untuk token yang pernah di-skip
                // (simple: skip jika sudah scanned dalam sesi ini)
                skipped++;
                continue;
            }

            // Basic filter
            const filt = passesFilter(t);
            if (!filt.ok) { STATE.scannedPairs.add(t.pairAddress); continue; }

            // Rug check
            const rug = isRug(t);
            if (rug.rug) {
                log(`🚫 RUG SKIP ${t.baseSymbol}: ${rug.reasons.join(', ')}`);
                STATE.scannedPairs.add(t.pairAddress);
                continue;
            }

            // Scoring
            const { score, reasons } = scoreToken(t);
            candidates++;

            if (score < CFG.MIN_SCORE) {
                log(`⬜ LOW SCORE ${t.baseSymbol.padEnd(10)} ${score}/100 | ${reasons.slice(0,3).join(' ')}`);
                STATE.scannedPairs.add(t.pairAddress);
                continue;
            }

            // Sudah open posisi untuk pair ini?
            if (STATE.positions[t.pairAddress]) {
                log(`📌 ALREADY OPEN: ${t.baseSymbol}`);
                continue;
            }

            // Max positions check
            if (Object.keys(STATE.positions).length >= CFG.MAX_POSITIONS) {
                log(`⚠️  MAX POSITIONS REACHED (${CFG.MAX_POSITIONS}) — skip ${t.baseSymbol}`);
                break;
            }

            // ── BUY ───────────────────────────────────────────────
            const pos = openPosition(t, score, reasons);
            if (!pos) continue;

            const tag = CFG.DRY_RUN ? '[DRY RUN]' : '[LIVE]';
            log(`\n${'═'.repeat(60)}`);
            log(`${tag} 🟢 BUY ${t.baseSymbol} (${t.baseName})`);
            log(`   Chain   : ${t.chain} | DEX: ${t.dex}`);
            log(`   Price   : $${t.priceUsd}`);
            log(`   Age     : ${t.ageHours.toFixed(1)}h`);
            log(`   Score   : ${score}/100 → ${reasons.join(' | ')}`);
            log(`   Vol24h  : $${_kfmt(t.vol24h)} | Makers: ${t.makers24h} | Txns: ${t.txns24h}`);
            log(`   Entry   : $${CFG.ENTRY_USD} | SL: $${pos.stopLoss.toExponential(4)} | TP1: +${CFG.TP1_PCT}% TP2: +${CFG.TP2_PCT}% TP3: +${CFG.TP3_PCT}%`);
            log(`   URL     : ${t.url}`);
            log(`${'═'.repeat(60)}\n`);

            if (!CFG.DRY_RUN) {
                await executeBuy(t.baseMint, CFG.ENTRY_USD);
            }

            STATE.scannedPairs.add(t.pairAddress);
        }

        // Trim scannedPairs agar tidak terlalu besar
        if (STATE.scannedPairs.size > 500) {
            const arr = [...STATE.scannedPairs].slice(-300);
            STATE.scannedPairs = new Set(arr);
        }

        saveState();
        log(`📊 Scan done: ${candidates} kandidat | open: ${Object.keys(STATE.positions).length}/${CFG.MAX_POSITIONS} | daily P&L: ${_pnl(STATE.dailyPnl)}`);

    } catch (e) {
        log(`ERROR runScan: ${e.message}`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  LIVE TRADING — Jupiter Swap (hanya aktif di --live mode)
// ══════════════════════════════════════════════════════════════════════════════
async function executeBuy(outputMint, amountUsd) {
    // Untuk live trading, gunakan Jupiter API via dex-trader-proxy.js (port 3004)
    // Ini di-handle oleh proxy terpisah agar private key tidak ada di bot ini
    try {
        const r = await fetch('http://127.0.0.1:3004/buy', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ outputMint, amountUsd }),
        });
        const d = await r.json();
        if (d.success) log(`✅ BUY executed: ${d.txHash}`);
        else           log(`❌ BUY failed: ${d.error}`);
        return d;
    } catch (e) {
        log(`ERROR executeBuy: ${e.message}`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRINT STATUS
// ══════════════════════════════════════════════════════════════════════════════
function printStatus() {
    const pos    = Object.values(STATE.positions);
    const line   = '─'.repeat(70);
    console.log(`\n╔${'═'.repeat(70)}╗`);
    console.log(`║  🎯 MEMECOIN HUNTER STATUS  [${CFG.DRY_RUN ? 'DRY RUN' : '🔴 LIVE'}]`);
    console.log(`╠${'═'.repeat(70)}╣`);
    console.log(`║  Total P&L : ${_pnl(STATE.totalPnl).padStart(10)}  |  Daily: ${_pnl(STATE.dailyPnl).padStart(10)}`);
    console.log(`║  Win Rate  : ${STATE.stats.totalTrades > 0 ? (STATE.stats.wins/STATE.stats.totalTrades*100).toFixed(1) : '—'}%   (${STATE.stats.wins}W/${STATE.stats.losses}L ${STATE.stats.totalTrades} trades)`);
    console.log(`║  Open Pos  : ${pos.length}/${CFG.MAX_POSITIONS}`);
    console.log(`╠${'═'.repeat(70)}╣`);

    if (pos.length === 0) {
        console.log(`║  Belum ada posisi terbuka.`);
    } else {
        console.log(`║  ${'COIN'.padEnd(10)} ${'ENTRY'.padEnd(14)} ${'CURRENT'.padEnd(14)} ${'P&L%'.padEnd(10)} SCORE`);
        for (const p of pos) {
            const pct = p.currentPrice > 0
                ? ((p.currentPrice - p.entryPrice) / p.entryPrice * 100).toFixed(1) + '%'
                : '—';
            const pctStr = parseFloat(pct) >= 0 ? `+${pct}` : pct;
            console.log(`║  ${p.coinSymbol.padEnd(10)} $${String(p.entryPrice).padEnd(13)} $${String(p.currentPrice).padEnd(13)} ${pctStr.padEnd(10)} ${p.score}/100`);
        }
    }

    console.log(`╚${'═'.repeat(70)}╝\n`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function _kfmt(n) {
    if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + 'M';
    if (n >= 1000)      return (n/1000).toFixed(1) + 'K';
    return String(Math.round(n));
}

function _pnl(n) {
    if (n == null) return '—';
    return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2);
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN LOOP
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.clear();
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  🎯  MEMECOIN HUNTER — DEX Auto-Trader                          ║
║  Strategy: Early Entry pump.fun / Solana DEX tokens             ║
║  Mode: ${CFG.DRY_RUN ? '📄 DRY RUN (paper trading)                        ' : '🔴 LIVE TRADING ⚠️                               '}║
╠══════════════════════════════════════════════════════════════════╣
║  Config:                                                        ║
║   Max age    : ${String(CFG.MAX_AGE_HOURS + 'h').padEnd(10)} Min vol24h: $${String(CFG.MIN_VOL_24H).padEnd(8)}         ║
║   Min chg24h : ${String(CFG.MIN_CHG_24H + '%').padEnd(10)} Min score : ${String(CFG.MIN_SCORE).padEnd(9)}         ║
║   Entry size : $${String(CFG.ENTRY_USD).padEnd(9)} Max pos   : ${String(CFG.MAX_POSITIONS).padEnd(9)}         ║
║   TP1/TP2/TP3: +${CFG.TP1_PCT}%/+${CFG.TP2_PCT}%/+${CFG.TP3_PCT}%  Trail SL: -${CFG.TRAILING_SL_PCT}%               ║
╚══════════════════════════════════════════════════════════════════╝
`);

    if (!CFG.DRY_RUN) {
        console.log('⚠️  LIVE MODE — pastikan dex-trader-proxy.js (port 3004) berjalan!');
        console.log('⚠️  Private key di .env file, JANGAN share!');
        await new Promise(r => setTimeout(r, 3000));
    }

    loadState();

    // Scan pertama langsung
    await runScan();
    printStatus();

    // Scan loop
    setInterval(async () => {
        await runScan();
        printStatus();
    }, CFG.SCAN_INTERVAL_MS);

    // Price check loop (lebih sering)
    setInterval(async () => {
        await checkPositions();
    }, CFG.PRICE_CHECK_MS);

    // Status print tiap 5 menit
    setInterval(printStatus, 5 * 60_000);
}

// ── Module export (untuk dex-trader-proxy.js) ────────────────────────────────
module.exports = { STATE, CFG, scoreToken, isRug, passesFilter };

// ── CLI entry ─────────────────────────────────────────────────────────────────
if (require.main === module) main().catch(e => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
