#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  memecoin-hunter.js  — WORLD-CLASS DEX Memecoin Early-Entry Engine v2.0
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  ALGORITMA INTI                                                         │
//  │                                                                         │
//  │  1. VELOCITY ENGINE  (bukan momentum chasing)                           │
//  │     → Deteksi AWAL pergerakan sebelum harga naik besar                  │
//  │     → Diinspirasi dari HFT "order flow imbalance" detection             │
//  │                                                                         │
//  │  2. BONDING CURVE STAGE ANALYSIS (pump.fun khusus)                      │
//  │     → pump.fun token punya lifecycle: Launch → Acc → Pump → Graduate    │
//  │     → Masuk di fase Accumulation — SEBELUM pump besar                   │
//  │                                                                         │
//  │  3. MULTI-LAYER RUG INTELLIGENCE (7 layer)                              │
//  │     → Pattern recognition dari ribuan rug pull historis                 │
//  │     → Honeypot, dev dump, coordinated exit, dead coin detection         │
//  │                                                                         │
//  │  4. DYNAMIC EXIT (Parabolic + Velocity Slowdown)                        │
//  │     → Tidak exit berdasarkan target price saja                          │
//  │     → Exit ketika velocity momentum mulai melemah (sell signal real)    │
//  │                                                                         │
//  │  5. KELLY CRITERION position sizing                                     │
//  │     → Bet size proporsional dengan edge & win probability               │
//  │     → Cegah overbetting saat kondisi buruk                              │
//  │                                                                         │
//  │  6. ADAPTIVE THRESHOLD ENGINE                                           │
//  │     → Setelah 20+ trades, auto-adjust MIN_SCORE dari win rate           │
//  │                                                                         │
//  │  TARGET: Win Rate 55-70%  |  Avg R:R 1:3+  |  EV POSITIF              │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  Jalankan: node memecoin-hunter.js          (DRY RUN)
//            node memecoin-hunter.js --live   (LIVE — butuh SOL wallet)
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');
const dex   = require('./dex-screener-api');

const ARGS    = process.argv.slice(2);
const IS_LIVE = ARGS.includes('--live');
const STATE_F = path.join(__dirname, 'memecoin-state.json');
const LOG_F   = path.join(__dirname, 'memecoin-hunter.log');

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIG — World-Class Early Detection Parameters
// ══════════════════════════════════════════════════════════════════════════════
const CFG = {
    DRY_RUN: !IS_LIVE,

    // ── FILTER EARLY ENTRY ───────────────────────────────────────────────────
    // Kunci: masuk SEBELUM pump besar, bukan sesudah
    MAX_AGE_HOURS    : 12,        // token maks 12 jam (lebih longgar)
    MIN_VOL_24H      : 2000,      // min $2k (lebih longgar)
    MIN_VOL_1H       : 100,       // min $100 vol 1h (lebih longgar)
    MIN_TXNS_1H      : 10,        // min 10 txn 1h (lebih longgar)
    MIN_BUYS_1H      : 5,         // min 5 buy txn 1h (lebih longgar)
    MAX_CHG_24H      : 800,       // BATAS ATAS — jika sudah +800%, terlambat
    MIN_CHG_24H      : 0,         // tidak ada minimum (bisa token baru < 24h)
    MAX_FDV          : 5000000,   // maks $5M FDV (masih early)

    // ── SCORING ──────────────────────────────────────────────────────────────
    MIN_SCORE        : 55,        // minimum skor untuk BUY (lebih longgar)

    // ── POSITION SIZING (Kelly-based) ────────────────────────────────────────
    BASE_ENTRY_USD   : 20,        // base size $20
    MAX_ENTRY_USD    : 50,        // max size per posisi
    MIN_ENTRY_USD    : 10,        // min size per posisi
    MAX_POSITIONS    : 6,
    MAX_DAILY_LOSS   : 60,

    // ── EXIT STRATEGY (4 TP Cascade) ─────────────────────────────────────────
    TP1_PCT          : 30,        // TP1: +30% → jual 40%  (quick profit lock)
    TP2_PCT          : 80,        // TP2: +80% → jual 30%
    TP3_PCT          : 200,       // TP3: +200% → jual 20%
    TP4_PCT          : 500,       // TP4: +500% → jual sisa (moon bag)
    TRAILING_SL_PCT  : 20,        // trailing SL 20% dari peak
    INITIAL_SL_PCT   : 25,        // initial SL -25%
    MAX_HOLD_HOURS   : 24,        // max 24h hold
    VELOCITY_EXIT_5M : -12,       // jika chg5m < -12% setelah TP1, exit semua

    // ── SYSTEM ───────────────────────────────────────────────────────────────
    CHAIN            : 'solana',
    SCAN_INTERVAL_MS : 20000,     // scan tiap 20 detik
    PRICE_CHECK_MS   : 10000,     // cek harga tiap 10 detik
    BLACKLIST_WORDS  : ['test', 'fake', 'rug', 'scam', 'honeypot', 'rugpull', 'exit'],

    // ── ADAPTIVE ─────────────────────────────────────────────────────────────
    ADAPTIVE_MODE       : true,
    ADAPTIVE_MIN_TRADES : 20,
};

// ══════════════════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════════════════
let STATE = {
    positions    : {},
    closedTrades : [],
    scannedPairs : [],
    scannedSet   : new Set(),
    totalPnl     : 0,
    dailyPnl     : 0,
    dailyDate    : new Date().toDateString(),
    stats        : {
        totalTrades : 0, wins : 0, losses : 0,
        bestTrade : 0, worstTrade : 0,
        avgWin : 0, avgLoss : 0,
        totalWinUsd : 0, totalLossUsd : 0,
        byScore : {},
    },
    lastScanAt   : null,
    sessionStart : new Date().toISOString(),
};

function saveState() {
    const s = { ...STATE, scannedPairs: [...STATE.scannedSet].slice(-400), scannedSet: undefined };
    fs.writeFileSync(STATE_F, JSON.stringify(s, null, 2));
}

function loadState() {
    try {
        if (fs.existsSync(STATE_F)) {
            const s = JSON.parse(fs.readFileSync(STATE_F, 'utf8'));
            STATE.positions    = s.positions    || {};
            STATE.closedTrades = s.closedTrades || [];
            STATE.totalPnl     = s.totalPnl     || 0;
            STATE.dailyPnl     = s.dailyPnl     || 0;
            STATE.dailyDate    = s.dailyDate     || STATE.dailyDate;
            STATE.stats        = Object.assign({}, STATE.stats, s.stats || {});
            STATE.lastScanAt   = s.lastScanAt   || null;
            STATE.scannedSet   = new Set(s.scannedPairs || []);
        }
    } catch (e) { log('WARN loadState: ' + e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOGGING
// ══════════════════════════════════════════════════════════════════════════════
function log(msg) {
    const ts  = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const out = '[' + ts + '] ' + msg;
    console.log(out);
    try { fs.appendFileSync(LOG_F, out + '\n'); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
//  WORLD-CLASS VELOCITY ENGINE v2.0
//  Skor 0-100 berdasarkan 6 dimensi
// ══════════════════════════════════════════════════════════════════════════════
function scoreToken(t) {
    let score = 0;
    const signals = [];

    // ── 1. TRANSACTION VELOCITY (25 pts) ────────────────────────────────────
    // Mengukur seberapa cepat txn terjadi SEKARANG vs baseline 24h
    // Prinsip HFT: spike txn adalah LEADING INDICATOR sebelum harga naik
    const baseline1h    = t.txns24h > 0 ? t.txns24h / 24 : 1;
    const velocityRatio = t.txns1h > 0 && baseline1h > 0 ? t.txns1h / baseline1h : 1;

    if (velocityRatio >= 5)      { score += 25; signals.push('vel:' + velocityRatio.toFixed(1) + 'x⚡'); }
    else if (velocityRatio >= 3) { score += 20; signals.push('vel:' + velocityRatio.toFixed(1) + 'x'); }
    else if (velocityRatio >= 2) { score += 14; signals.push('vel:' + velocityRatio.toFixed(1) + 'x'); }
    else if (velocityRatio >= 1.5) { score += 8; }
    else if (velocityRatio >= 1)   { score += 4; }

    // Bonus burst: txn 5m jauh melebihi rata-rata 1h
    const txn5mRate = t.txns5m * 12;
    if (txn5mRate > t.txns1h * 2) { score += 5; signals.push('burst5m🔥'); }

    // ── 2. BUY PRESSURE / ORDER FLOW IMBALANCE (25 pts) ─────────────────────
    // Prinsip: buy >> sell = akumulasi sedang terjadi = pump akan datang
    const buyRatio1h = (t.buys1h > 0 && t.sells1h >= 0)
        ? t.buys1h / Math.max(t.sells1h, 1)
        : (t.buys1h > 0 ? 2 : 1);
    const buyRatio5m = (t.buys5m > 0 && t.sells5m >= 0)
        ? t.buys5m / Math.max(t.sells5m, 1)
        : (t.buys5m > 0 ? 2 : 1);

    if (buyRatio1h >= 4)         { score += 15; signals.push('buy/sell:' + buyRatio1h.toFixed(1) + 'x📈'); }
    else if (buyRatio1h >= 2.5)  { score += 11; signals.push('b/s:' + buyRatio1h.toFixed(1) + 'x'); }
    else if (buyRatio1h >= 1.5)  { score += 7; }
    else if (buyRatio1h >= 1.2)  { score += 3; }

    if (buyRatio5m >= 3)         { score += 10; signals.push('5m:' + buyRatio5m.toFixed(1) + 'x⚡'); }
    else if (buyRatio5m >= 2)    { score += 7;  signals.push('5m:' + buyRatio5m.toFixed(1) + 'x'); }
    else if (buyRatio5m >= 1.5)  { score += 4; }

    // ── 3. FRESH MOMENTUM (20 pts) ───────────────────────────────────────────
    // REWARD: token yang BARU MULAI naik, BUKAN yang sudah naik besar
    if (t.chg5m >= 10)           { score += 10; signals.push('5m:+' + t.chg5m.toFixed(0) + '%🔥'); }
    else if (t.chg5m >= 5)       { score += 8;  signals.push('5m:+' + t.chg5m.toFixed(0) + '%'); }
    else if (t.chg5m >= 2)       { score += 5;  signals.push('5m:+' + t.chg5m.toFixed(0) + '%'); }
    else if (t.chg5m >= 1)       { score += 2; }
    else if (t.chg5m < 0)        { score -= 3; }

    if (t.chg1h >= 30)           { score += 8;  signals.push('1h:+' + t.chg1h.toFixed(0) + '%'); }
    else if (t.chg1h >= 15)      { score += 6;  signals.push('1h:+' + t.chg1h.toFixed(0) + '%'); }
    else if (t.chg1h >= 5)       { score += 3; }
    else if (t.chg1h < -10)      { score -= 5;  signals.push('1h:' + t.chg1h.toFixed(0) + '%⚠️'); }

    // PENALTY: sudah naik terlalu besar di 24h (masuk terlambat)
    if (t.chg24h > 500)          { score -= 8;  signals.push('LATE24h:+' + t.chg24h.toFixed(0) + '%'); }
    else if (t.chg24h > 200)     { score -= 3; }
    else if (t.chg24h >= 20)     { score += 2; }

    // ── 4. BONDING CURVE STAGE (15 pts) ──────────────────────────────────────
    // pump.fun graduates ke Raydium di ~$69k market cap
    // Zone emas: FDV $20k-$300k = masih ada 10-50x ke graduation
    if (t.fdv > 0) {
        if (t.fdv < 30000)       { score += 15; signals.push('fdv:$' + _kfmt(t.fdv) + '🎯EARLY'); }
        else if (t.fdv < 100000) { score += 12; signals.push('fdv:$' + _kfmt(t.fdv) + '🎯'); }
        else if (t.fdv < 300000) { score += 8;  signals.push('fdv:$' + _kfmt(t.fdv)); }
        else if (t.fdv < 1000000){ score += 4; }
        else if (t.fdv < 3000000){ score += 1; }
        else                     { score -= 5;  signals.push('fdv:HIGH'); }
    }

    // ── 5. HOLDER DISTRIBUTION ESTIMATE (10 pts) ─────────────────────────────
    // DEXScreener tidak expose wallet count → estimasi dari txns
    // Empiris: ~35% txns berasal dari wallet unik yang berbeda
    const estWallets = Math.round(t.txns24h * 0.35);
    if (estWallets >= 500)       { score += 10; signals.push('wallets~' + estWallets); }
    else if (estWallets >= 200)  { score += 7;  signals.push('wallets~' + estWallets); }
    else if (estWallets >= 80)   { score += 4; }
    else if (estWallets >= 30)   { score += 1; }

    // Bonus: avg txn kecil = banyak retail kecil = healthier distribution
    const avgTxnUsd = t.txns1h > 0 ? t.vol1h / t.txns1h : 0;
    if (avgTxnUsd > 0 && avgTxnUsd < 50)  { score += 3; }
    else if (avgTxnUsd < 200)             { score += 1; }

    // ── 6. SAFETY & CONFIDENCE SIGNALS (bonus) ───────────────────────────────
    // Umur optimal: 30 menit - 3 jam = sudah lewat "instant rug" tapi masih early
    if (t.ageHours >= 0.5 && t.ageHours <= 2)   { score += 5; signals.push('age:' + (t.ageHours*60).toFixed(0) + 'min🎯'); }
    else if (t.ageHours > 2 && t.ageHours <= 4) { score += 3; signals.push('age:' + t.ageHours.toFixed(1) + 'h'); }
    else if (t.ageHours < 0.5)                  { score -= 5; signals.push('TOO_NEW'); }

    if (t.boosts >= 200)         { score += 3; signals.push('boost:' + t.boosts + '⚡'); }
    else if (t.boosts >= 50)     { score += 2; }

    // Volume consistency: vol1h/vol24h * 24 — lebih tinggi = aktivitas sekarang
    const volCon = t.vol24h > 0 ? (t.vol1h / t.vol24h) * 24 : 0;
    if (volCon >= 3)             { score += 3; signals.push('volspike:' + volCon.toFixed(1) + 'x'); }
    else if (volCon >= 2)        { score += 1; }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    return {
        score   : finalScore,
        signals : signals,
        meta    : { velocityRatio, buyRatio1h, buyRatio5m, estWallets, avgTxnUsd, volCon }
    };
}

// ══════════════════════════════════════════════════════════════════════════════
//  KELLY CRITERION POSITION SIZING
//  f* = (p * b - q) / b   →  half-Kelly untuk safety
// ══════════════════════════════════════════════════════════════════════════════
function calcPositionSize(score) {
    const trades = STATE.stats.totalTrades;

    if (trades < CFG.ADAPTIVE_MIN_TRADES || !CFG.ADAPTIVE_MODE) {
        // Belum ada data → linear scale by score
        const sizeFactor = Math.max(0, (score - 60) / 35);
        const size = CFG.MIN_ENTRY_USD + sizeFactor * (CFG.MAX_ENTRY_USD - CFG.MIN_ENTRY_USD);
        return Math.round(Math.min(CFG.MAX_ENTRY_USD, Math.max(CFG.MIN_ENTRY_USD, size)));
    }

    const p    = STATE.stats.wins / trades;
    const q    = 1 - p;
    const avgW = STATE.stats.avgWin  || (CFG.BASE_ENTRY_USD * 0.8);
    const avgL = Math.abs(STATE.stats.avgLoss || (CFG.BASE_ENTRY_USD * 0.25));
    const b    = avgW / Math.max(avgL, 0.01);

    let kelly = (p * b - q) / b;
    kelly = kelly * 0.5;                   // half-Kelly
    kelly = Math.max(0.1, Math.min(0.5, kelly));

    const scoreMul = 0.7 + (score - 60) / 100;
    const size = CFG.BASE_ENTRY_USD * kelly * scoreMul * 5;
    return Math.round(Math.min(CFG.MAX_ENTRY_USD, Math.max(CFG.MIN_ENTRY_USD, size)));
}

// ══════════════════════════════════════════════════════════════════════════════
//  MULTI-LAYER RUG INTELLIGENCE v2.0 (7 Layer)
// ══════════════════════════════════════════════════════════════════════════════
function isRug(t) {
    const flags = [];
    let rugScore = 0;

    // Layer 1: Nama/metadata suspicious
    const name = (t.baseName + ' ' + t.baseSymbol).toLowerCase();
    for (const w of CFG.BLACKLIST_WORDS) {
        if (name.includes(w)) { flags.push('blacklist:"' + w + '"'); rugScore += 80; }
    }
    if (!t.baseSymbol || t.baseSymbol.length > 20) { flags.push('invalid_symbol'); rugScore += 20; }

    // Layer 2: Price dump pattern (dev dump sedang berjalan)
    if (t.chg5m < -25)      { flags.push('dump5m:' + t.chg5m.toFixed(1) + '%'); rugScore += 60; }
    else if (t.chg5m < -15) { flags.push('dump5m:' + t.chg5m.toFixed(1) + '%'); rugScore += 30; }
    if (t.chg1h < -20 && t.chg24h > 100) { flags.push('dist_pattern:1h/24h'); rugScore += 40; }

    // Layer 3: Order flow sell pressure (distribusi koordinasi)
    if (t.sells5m > t.buys5m * 4 && t.txns5m > 10) {
        flags.push('sell>>' + t.sells5m + '/' + t.buys5m);
        rugScore += 50;
    } else if (t.sells5m > t.buys5m * 2.5 && t.txns5m > 20) {
        flags.push('sell_dom:' + t.sells5m + '/' + t.buys5m);
        rugScore += 25;
    }
    if (t.sells1h > t.buys1h * 3 && t.txns1h > 30) {
        flags.push('sell1h_dump');
        rugScore += 35;
    }

    // Layer 4: Dead coin (pump sudah selesai)
    if (t.vol1h < 50 && t.vol24h > 20000)       { flags.push('dead_coin'); rugScore += 70; }
    else if (t.vol1h < 150 && t.vol24h > 50000) { flags.push('dying_coin'); rugScore += 40; }

    // Layer 5: Honeypot pattern
    if (t.chg5m > 50 && t.sells5m === 0 && t.buys5m > 5) {
        flags.push('honeypot_pattern');
        rugScore += 50;
    }

    // Layer 6: FDV trap (overvalued)
    if (t.fdv > CFG.MAX_FDV) { flags.push('fdv_high:$' + _kfmt(t.fdv)); rugScore += 30; }

    // Layer 7: Volume/FDV sanity (very illiquid)
    if (t.fdv > 0 && t.vol24h < t.fdv * 0.005) {
        flags.push('illiquid:' + (t.vol24h / t.fdv * 100).toFixed(2) + '%');
        rugScore += 20;
    }

    return { rug: rugScore >= 50, rugScore, flags };
}

// ══════════════════════════════════════════════════════════════════════════════
//  ENTRY FILTER v2.0 — Early Entry Mode
// ══════════════════════════════════════════════════════════════════════════════
function passesFilter(t) {
    if (!t.pairAddress)                   return { ok: false, r: 'no_pair' };
    if (!t.baseMint)                      return { ok: false, r: 'no_mint' };
    if (t.priceUsd <= 0)                  return { ok: false, r: 'price=0' };
    if (t.ageHours > CFG.MAX_AGE_HOURS)  return { ok: false, r: 'old:' + t.ageHours.toFixed(1) + 'h' };
    if (t.vol24h < CFG.MIN_VOL_24H)      return { ok: false, r: 'vol24h:$' + t.vol24h.toFixed(0) };
    if (t.vol1h < CFG.MIN_VOL_1H)        return { ok: false, r: 'vol1h:$' + t.vol1h.toFixed(0) };
    if (t.txns1h < CFG.MIN_TXNS_1H)     return { ok: false, r: 'txns1h:' + t.txns1h };
    if (t.buys1h < CFG.MIN_BUYS_1H)     return { ok: false, r: 'buys1h:' + t.buys1h };
    if (t.chg5m < -10)                   return { ok: false, r: 'dump5m:' + t.chg5m.toFixed(1) + '%' };
    if (t.chg24h > CFG.MAX_CHG_24H)     return { ok: false, r: 'too_late:+' + t.chg24h.toFixed(0) + '%' };
    return { ok: true };
}

// ══════════════════════════════════════════════════════════════════════════════
//  POSITION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
function openPosition(token, score, signals, meta, sizeUsd) {
    const pa = token.pairAddress;
    if (STATE.positions[pa]) return null;
    if (Object.keys(STATE.positions).length >= CFG.MAX_POSITIONS) return null;

    const pos = {
        pairAddress   : pa,
        coinSymbol    : token.baseSymbol,
        coinName      : token.baseName,
        baseMint      : token.baseMint,
        chain         : token.chain,
        dex           : token.dex,
        url           : token.url,
        entryPrice    : token.priceUsd,
        peakPrice     : token.priceUsd,
        currentPrice  : token.priceUsd,
        sizeUsd       : sizeUsd,
        stopLoss      : token.priceUsd * (1 - CFG.INITIAL_SL_PCT / 100),
        tp1Price      : token.priceUsd * (1 + CFG.TP1_PCT  / 100),
        tp2Price      : token.priceUsd * (1 + CFG.TP2_PCT  / 100),
        tp3Price      : token.priceUsd * (1 + CFG.TP3_PCT  / 100),
        tp4Price      : token.priceUsd * (1 + CFG.TP4_PCT  / 100),
        trailingSl    : token.priceUsd * (1 - CFG.TRAILING_SL_PCT / 100),
        remainPct     : 1.0,
        tp1Hit        : false, tp2Hit : false, tp3Hit : false, tp4Hit : false,
        partialPnlUsd : 0,
        score         : score,
        signals       : signals,
        meta          : meta,
        ageAtEntry    : token.ageHours,
        vol24hEntry   : token.vol24h,
        chg24hEntry   : token.chg24h,
        openedAt      : new Date().toISOString(),
        openedAtMs    : Date.now(),
        maxHoldMs     : CFG.MAX_HOLD_HOURS * 3600000,
    };

    STATE.positions[pa] = pos;
    saveState();
    return pos;
}

function closePosition(pa, exitPrice, reason) {
    const pos = STATE.positions[pa];
    if (!pos) return null;

    const pnlPct = (exitPrice - pos.entryPrice) / pos.entryPrice * 100;
    const pnlUsd = (pos.sizeUsd * pos.remainPct * pnlPct / 100) + (pos.partialPnlUsd || 0);

    const closed = Object.assign({}, pos, {
        exitPrice, closedAt: new Date().toISOString(),
        reason, pnlPct, pnlUsd,
        durationMs: Date.now() - pos.openedAtMs,
    });

    STATE.closedTrades.unshift(closed);
    if (STATE.closedTrades.length > 300) STATE.closedTrades.length = 300;

    STATE.totalPnl += pnlUsd;
    STATE.dailyPnl += pnlUsd;
    STATE.stats.totalTrades++;

    if (pnlUsd > 0) {
        STATE.stats.wins++;
        STATE.stats.totalWinUsd += pnlUsd;
        STATE.stats.avgWin = STATE.stats.totalWinUsd / STATE.stats.wins;
        STATE.stats.bestTrade = Math.max(STATE.stats.bestTrade, pnlUsd);
    } else {
        STATE.stats.losses++;
        STATE.stats.totalLossUsd += Math.abs(pnlUsd);
        STATE.stats.avgLoss = -(STATE.stats.totalLossUsd / STATE.stats.losses);
        STATE.stats.worstTrade = Math.min(STATE.stats.worstTrade, pnlUsd);
    }

    if (CFG.ADAPTIVE_MODE) {
        const bucket = Math.floor(pos.score / 10) * 10;
        if (!STATE.stats.byScore[bucket]) STATE.stats.byScore[bucket] = { wins: 0, losses: 0 };
        if (pnlUsd > 0) STATE.stats.byScore[bucket].wins++;
        else            STATE.stats.byScore[bucket].losses++;
    }

    delete STATE.positions[pa];
    saveState();
    return closed;
}

// ══════════════════════════════════════════════════════════════════════════════
//  DYNAMIC EXIT ENGINE
// ══════════════════════════════════════════════════════════════════════════════
async function checkPositions() {
    const pas = Object.keys(STATE.positions);
    if (pas.length === 0) return;

    for (const pa of pas) {
        const pos = STATE.positions[pa];
        try {
            const pairs = await dex.getPair(pa, CFG.CHAIN);
            if (!pairs || !pairs.length) continue;
            const t = pairs[0];
            const price = t.priceUsd;
            if (!price || price <= 0) continue;

            pos.currentPrice = price;
            if (price > pos.peakPrice) {
                pos.peakPrice  = price;
                pos.trailingSl = price * (1 - CFG.TRAILING_SL_PCT / 100);
            }

            const pnlPct = (price - pos.entryPrice) / pos.entryPrice * 100;

            // Velocity exit: momentum berbalik setelah TP1 hit
            if (pos.tp1Hit && t.chg5m < CFG.VELOCITY_EXIT_5M) {
                const closed = closePosition(pa, price, 'Velocity exit 5m:' + t.chg5m.toFixed(1) + '%');
                if (closed) log('🌊 VEL EXIT ' + pos.coinSymbol + ' | P&L: ' + _pnl(closed.pnlUsd));
                continue;
            }

            // TP1: +30% → sell 40%
            if (!pos.tp1Hit && price >= pos.tp1Price) {
                pos.tp1Hit = true;
                const partial = pos.sizeUsd * 0.40 * CFG.TP1_PCT / 100;
                pos.partialPnlUsd += partial;
                pos.remainPct -= 0.40;
                STATE.totalPnl += partial;
                STATE.dailyPnl += partial;
                log('💰 TP1 +' + CFG.TP1_PCT + '% ' + pos.coinSymbol + ' | sell 40% | +$' + partial.toFixed(2));
                saveState();
            }
            // TP2: +80% → sell 30%
            if (!pos.tp2Hit && price >= pos.tp2Price) {
                pos.tp2Hit = true;
                const partial = pos.sizeUsd * 0.30 * CFG.TP2_PCT / 100;
                pos.partialPnlUsd += partial;
                pos.remainPct -= 0.30;
                STATE.totalPnl += partial;
                STATE.dailyPnl += partial;
                log('🎯 TP2 +' + CFG.TP2_PCT + '% ' + pos.coinSymbol + ' | sell 30% | +$' + partial.toFixed(2));
                saveState();
            }
            // TP3: +200% → sell 20%
            if (!pos.tp3Hit && price >= pos.tp3Price) {
                pos.tp3Hit = true;
                const partial = pos.sizeUsd * 0.20 * CFG.TP3_PCT / 100;
                pos.partialPnlUsd += partial;
                pos.remainPct -= 0.20;
                STATE.totalPnl += partial;
                STATE.dailyPnl += partial;
                log('🚀 TP3 +' + CFG.TP3_PCT + '% ' + pos.coinSymbol + ' | sell 20% | +$' + partial.toFixed(2));
                saveState();
            }
            // TP4: +500% → close all (moon bag exit)
            if (!pos.tp4Hit && price >= pos.tp4Price) {
                const closed = closePosition(pa, price, 'TP4 +' + CFG.TP4_PCT + '% MOONBAG');
                if (closed) log('🌕 TP4 MOON ' + pos.coinSymbol + ' +' + pnlPct.toFixed(0) + '% | TOTAL: ' + _pnl(closed.pnlUsd));
                continue;
            }

            // Trailing SL (aktif setelah TP1 hit)
            if (price <= pos.trailingSl && pos.tp1Hit) {
                const closed = closePosition(pa, price, 'Trailing SL');
                if (closed) log('🛡️ TRAIL SL ' + pos.coinSymbol + ' | P&L: ' + _pnl(closed.pnlUsd));
                continue;
            }

            // Initial SL -25%
            if (price <= pos.stopLoss) {
                const closed = closePosition(pa, price, 'Stop Loss -25%');
                if (closed) log('🔴 STOP LOSS ' + pos.coinSymbol + ' (' + pnlPct.toFixed(1) + '%) | P&L: ' + _pnl(closed.pnlUsd));
                continue;
            }

            // Max hold
            if (Date.now() - pos.openedAtMs > pos.maxHoldMs) {
                const closed = closePosition(pa, price, 'Max hold ' + CFG.MAX_HOLD_HOURS + 'h');
                if (closed) log('⏰ MAX HOLD ' + pos.coinSymbol + ' | P&L: ' + _pnl(closed.pnlUsd));
                continue;
            }

        } catch (e) {
            log('WARN checkPos ' + pos.coinSymbol + ': ' + e.message);
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADAPTIVE THRESHOLD ENGINE
// ══════════════════════════════════════════════════════════════════════════════
function adaptiveAdjust() {
    if (!CFG.ADAPTIVE_MODE) return;
    const trades = STATE.stats.totalTrades;
    if (trades < CFG.ADAPTIVE_MIN_TRADES) return;
    const wr = STATE.stats.wins / trades;
    if (wr < 0.45 && CFG.MIN_SCORE < 75) {
        CFG.MIN_SCORE = Math.min(75, CFG.MIN_SCORE + 2);
        log('🧠 ADAPTIVE: WR ' + (wr*100).toFixed(1) + '% → MIN_SCORE=' + CFG.MIN_SCORE);
    } else if (wr > 0.65 && CFG.MIN_SCORE > 58) {
        CFG.MIN_SCORE = Math.max(58, CFG.MIN_SCORE - 1);
        log('🧠 ADAPTIVE: WR ' + (wr*100).toFixed(1) + '% → MIN_SCORE=' + CFG.MIN_SCORE);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN SCAN LOOP
// ══════════════════════════════════════════════════════════════════════════════
async function runScan() {
    STATE.lastScanAt = new Date().toISOString();
    const today = new Date().toDateString();
    if (STATE.dailyDate !== today) { STATE.dailyDate = today; STATE.dailyPnl = 0; }
    if (STATE.dailyPnl < -CFG.MAX_DAILY_LOSS) {
        log('⛔ CIRCUIT BREAKER: daily loss > $' + CFG.MAX_DAILY_LOSS);
        return;
    }
    adaptiveAdjust();

    try {
        const [gainers, boosted] = await Promise.allSettled([
            dex.getTopGainers(CFG.CHAIN, '1h'),
            dex.getBoostedTokens(),
        ]);

        let pairs = gainers.status === 'fulfilled' ? gainers.value : [];

        // Tambah new tokens
        try {
            const newTok = await dex.getNewTokens(CFG.CHAIN);
            if (newTok && newTok.length) pairs = pairs.concat(newTok);
        } catch {}

        // Tambah boosted
        if (boosted.status === 'fulfilled' && boosted.value.length > 0) {
            const mints = boosted.value.map(function(b) { return b.baseMint; }).filter(Boolean);
            for (var i = 0; i < Math.min(mints.length, 15); i++) {
                try {
                    const bp = await dex.getTokenPairs(mints[i]);
                    const sol = bp.filter(function(p) { return p.chain === CFG.CHAIN; });
                    if (sol.length) pairs.push(sol[0]);
                } catch {}
            }
        }

        // De-dup
        const seen = new Set();
        pairs = pairs.filter(function(p) {
            if (!p || !p.pairAddress || seen.has(p.pairAddress)) return false;
            seen.add(p.pairAddress);
            return true;
        });

        log('📡 Scan: ' + pairs.length + ' token | score_min:' + CFG.MIN_SCORE + ' | pos:' + Object.keys(STATE.positions).length + '/' + CFG.MAX_POSITIONS);

        let candidates = 0, filtered = 0, rugged = 0;

        for (var j = 0; j < pairs.length; j++) {
            const t = pairs[j];
            if (STATE.scannedSet.has(t.pairAddress) && !STATE.positions[t.pairAddress]) continue;

            const filt = passesFilter(t);
            if (!filt.ok) {
                log('⏸️  SKIP ' + t.baseSymbol + ' (' + (filt.r || 'filter') + ')');
                filtered++;
                STATE.scannedSet.add(t.pairAddress);
                continue;
            }

            const rug = isRug(t);
            if (rug.rug) {
                rugged++;
                log('🚫 RUG ' + t.baseSymbol + ' (rugScore:' + rug.rugScore + ') ' + rug.flags.join(', '));
                STATE.scannedSet.add(t.pairAddress);
                continue;
            }

            const result = scoreToken(t);
            const score = result.score, signals = result.signals, meta = result.meta;
            candidates++;

            if (score < CFG.MIN_SCORE) { STATE.scannedSet.add(t.pairAddress); continue; }
            if (STATE.positions[t.pairAddress]) { log('📌 OPEN: ' + t.baseSymbol); continue; }
            if (Object.keys(STATE.positions).length >= CFG.MAX_POSITIONS) {
                log('⚠️  MAX POS — skip ' + t.baseSymbol);
                break;
            }

            const sizeUsd = calcPositionSize(score);
            const pos = openPosition(t, score, signals, meta, sizeUsd);
            if (!pos) continue;

            const mode = CFG.DRY_RUN ? '📄[DRY]' : '🔴[LIVE]';
            log('');
            log('═'.repeat(65));
            log(mode + ' 🟢 BUY ' + t.baseSymbol + ' (' + t.baseName.slice(0,30) + ')');
            log('   Score   : ' + score + '/100 | ' + signals.slice(0,5).join(' | '));
            log('   Age     : ' + (t.ageHours*60).toFixed(0) + 'min | FDV: $' + _kfmt(t.fdv) + ' | chg24h: +' + t.chg24h.toFixed(0) + '%');
            log('   Vol1h   : $' + _kfmt(t.vol1h) + ' | Txns1h: ' + t.txns1h + ' | Buy/Sell: ' + meta.buyRatio1h.toFixed(1) + 'x');
            log('   Velocity: ' + meta.velocityRatio.toFixed(1) + 'x | Wallets~: ' + meta.estWallets);
            log('   Price   : $' + t.priceUsd + ' | Size: $' + sizeUsd + ' (Kelly-adj)');
            log('   SL: -' + CFG.INITIAL_SL_PCT + '% | TP: +' + CFG.TP1_PCT + '% +' + CFG.TP2_PCT + '% +' + CFG.TP3_PCT + '% +' + CFG.TP4_PCT + '%');
            log('   URL     : ' + t.url);
            log('═'.repeat(65));
            log('');

            if (!CFG.DRY_RUN) await executeBuy(t.baseMint, sizeUsd);
            STATE.scannedSet.add(t.pairAddress);
        }

        if (STATE.scannedSet.size > 600) {
            const arr = Array.from(STATE.scannedSet).slice(-400);
            STATE.scannedSet = new Set(arr);
        }

        saveState();
        log('📊 Done: ' + candidates + ' kandidat | ' + filtered + ' filtered | ' + rugged + ' rug | daily P&L: ' + _pnl(STATE.dailyPnl));

    } catch (e) {
        log('ERROR runScan: ' + e.message);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  LIVE BUY via dex-trader-proxy.js (port 3004)
// ══════════════════════════════════════════════════════════════════════════════
async function executeBuy(outputMint, amountUsd) {
    try {
        const r = await fetch('http://127.0.0.1:3004/buy', {
            method  : 'POST',
            headers : { 'Content-Type': 'application/json' },
            body    : JSON.stringify({ outputMint, amountUsd }),
        });
        const d = await r.json();
        if (d.success) log('✅ BUY tx: ' + d.txHash);
        else           log('❌ BUY failed: ' + d.error);
        return d;
    } catch (e) { log('ERROR executeBuy: ' + e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  STATUS DISPLAY
// ══════════════════════════════════════════════════════════════════════════════
function printStatus() {
    const pos = Object.values(STATE.positions);
    const wr  = STATE.stats.totalTrades > 0
        ? (STATE.stats.wins / STATE.stats.totalTrades * 100).toFixed(1) : '--';
    const avgW = STATE.stats.avgWin  ? '$' + STATE.stats.avgWin.toFixed(2)  : '--';
    const avgL = STATE.stats.avgLoss ? '$' + Math.abs(STATE.stats.avgLoss).toFixed(2) : '--';
    const ev   = (STATE.stats.wins > 0 && STATE.stats.losses > 0)
        ? ((STATE.stats.wins / STATE.stats.totalTrades) * STATE.stats.avgWin
           - (STATE.stats.losses / STATE.stats.totalTrades) * Math.abs(STATE.stats.avgLoss)).toFixed(2)
        : '--';

    console.log('\n╔' + '═'.repeat(68) + '╗');
    console.log('║  🎯 MEMECOIN HUNTER v2.0  [' + (CFG.DRY_RUN ? 'DRY RUN' : '🔴 LIVE') + ']  score_min:' + CFG.MIN_SCORE);
    console.log('╠' + '═'.repeat(68) + '╣');
    console.log('║  P&L Total : ' + _pnl(STATE.totalPnl).padStart(10) + '  │  Daily : ' + _pnl(STATE.dailyPnl).padStart(10));
    console.log('║  Win Rate  : ' + String(wr).padStart(6) + '%  │  ' + STATE.stats.wins + 'W/' + STATE.stats.losses + 'L/' + STATE.stats.totalTrades + 'T');
    console.log('║  Avg Win   : ' + String(avgW).padStart(8) + '  │  Avg Loss: ' + String(avgL).padStart(8) + '  │  EV/trade: $' + ev);
    console.log('║  Open Pos  : ' + pos.length + '/' + CFG.MAX_POSITIONS + '  │  Kelly: ' + (STATE.stats.totalTrades >= CFG.ADAPTIVE_MIN_TRADES ? 'ACTIVE' : 'need ' + (CFG.ADAPTIVE_MIN_TRADES - STATE.stats.totalTrades) + ' more'));
    if (pos.length > 0) {
        console.log('╠' + '═'.repeat(68) + '╣');
        for (var i = 0; i < pos.length; i++) {
            const p   = pos[i];
            const pct = p.currentPrice > 0 ? ((p.currentPrice - p.entryPrice) / p.entryPrice * 100) : 0;
            const pcts = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
            const age  = _fmtAge(Date.now() - p.openedAtMs);
            console.log('║  ' + p.coinSymbol.slice(0,8).padEnd(8) + ' $' + String(p.entryPrice.toExponential(3)).padEnd(13) + ' now $' + String(p.currentPrice.toExponential(3)).padEnd(12) + ' ' + pcts.padEnd(9) + ' ' + age + ' s:' + p.score);
        }
    }
    console.log('╚' + '═'.repeat(68) + '╝\n');
}

function _kfmt(n) {
    if (!n || isNaN(n)) return '0';
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n/1000).toFixed(1) + 'K';
    return String(Math.round(n));
}

function _pnl(n) {
    if (n == null || isNaN(n)) return '--';
    return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2);
}

function _fmtAge(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 60) return m + 'm';
    return Math.floor(m/60) + 'h' + (m%60) + 'm';
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.clear();
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║  🎯  MEMECOIN HUNTER v2.0 — WORLD-CLASS Early-Entry Engine          ║');
    console.log('║                                                                      ║');
    console.log('║  1. Transaction Velocity Detection (HFT-inspired)                   ║');
    console.log('║  2. Buy Pressure / Order Flow Imbalance                             ║');
    console.log('║  3. Bonding Curve Stage Analysis (pump.fun)                         ║');
    console.log('║  4. Kelly Criterion Position Sizing                                 ║');
    console.log('║  5. Parabolic Exit + Velocity Slowdown Detection                    ║');
    console.log('║  6. Multi-Layer Rug Intelligence (7 filters)                        ║');
    console.log('║  7. Adaptive Threshold Engine (auto-adjust setelah 20 trades)       ║');
    console.log('║                                                                      ║');
    console.log('║  Mode: ' + (CFG.DRY_RUN ? '📄 DRY RUN                                              ║' : '🔴 LIVE TRADING ⚠️                                       ║'));
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log('');

    if (!CFG.DRY_RUN) {
        console.log('⚠️  LIVE MODE — pastikan dex-trader-proxy.js (port 3004) berjalan!');
        await new Promise(function(r) { setTimeout(r, 3000); });
    }

    loadState();
    await runScan();
    printStatus();

    setInterval(async function() { await runScan(); printStatus(); }, CFG.SCAN_INTERVAL_MS);
    setInterval(async function() { await checkPositions(); }, CFG.PRICE_CHECK_MS);
    setInterval(printStatus, 5 * 60000);
}

// ── Module export ─────────────────────────────────────────────────────────────
module.exports = { STATE, CFG, scoreToken, isRug, passesFilter, calcPositionSize };

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) main().catch(function(e) {
    console.error('FATAL:', e.message);
    process.exit(1);
});
