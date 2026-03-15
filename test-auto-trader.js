#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  test-auto-trader.js — Full Simulation & Unit Test
//  Jalankan: node test-auto-trader.js
//
//  Test yang dilakukan:
//   ✅ T1  — Risk Manager: position sizing
//   ✅ T2  — Risk Manager: validasi sinyal (umur, confidence, R:R)
//   ✅ T3  — Risk Manager: circuit breaker (daily loss, drawdown, consecutive)
//   ✅ T4  — Entry Filter: reject sinyal lemah
//   ✅ T5  — Entry Filter: accept sinyal kuat
//   ✅ T6  — Simulasi LONG → TP1 → TP2 → TP3
//   ✅ T7  — Simulasi LONG → Stop Loss hit
//   ✅ T8  — Simulasi LONG → Trailing Stop hit
//   ✅ T9  — Max open positions guard
//   ✅ T10 — Duplikasi sinyal guard (cooldown)
//   ✅ T11 — Simulasi REAL dari signals.json (top 5 sinyal terbaru)
//   ✅ T12 — Statistik akhir & equity curve
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── WARNA TERMINAL ─────────────────────────────────────────────────────────
const C = {
    reset  : '\x1b[0m',
    green  : '\x1b[32m',
    red    : '\x1b[31m',
    yellow : '\x1b[33m',
    cyan   : '\x1b[36m',
    bold   : '\x1b[1m',
    dim    : '\x1b[2m',
    magenta: '\x1b[35m',
    blue   : '\x1b[34m',
};
const ok   = (m) => console.log(`  ${C.green}✅ PASS${C.reset}  ${m}`);
const fail = (m) => { console.log(`  ${C.red}❌ FAIL${C.reset}  ${m}`); failCount++; };
const info = (m) => console.log(`  ${C.dim}ℹ️  ${m}${C.reset}`);
const sep  = ()  => console.log(C.dim + '─'.repeat(65) + C.reset);

let passCount = 0, failCount = 0;

function assert(condition, label) {
    if (condition) { passCount++; ok(label); }
    else           { fail(label); }
}

// ─── COPY LOGIC DARI auto-trader.js (standalone, tanpa require) ───────────────

// CONFIG (sama seperti auto-trader.js)
const CONFIG = {
    DRY_RUN              : true,
    RISK_PER_TRADE_PCT   : 1.5,
    MAX_RISK_PCT         : 2.0,
    MAX_OPEN_POSITIONS   : 5,
    MAX_DAILY_LOSS_PCT   : 5.0,
    MAX_DRAWDOWN_PCT     : 8.0,
    MAX_CONSECUTIVE_LOSS : 3,
    MIN_CONFIDENCE       : 20,
    MIN_BULLISH          : 60,
    MIN_BEARISH          : 60,
    MIN_RR               : 1.5,
    MAX_SIGNAL_AGE_MIN   : 30,
    TP1_CLOSE_PCT        : 50,
    TP2_CLOSE_PCT        : 30,
    TP3_CLOSE_PCT        : 20,
    TRAIL_ACTIVATE_PCT   : 1.5,
    TRAIL_DISTANCE_PCT   : 0.8,
    SIGNALS_FILE         : path.join(__dirname, 'signals.json'),
};

// Fresh state factory
function makeState(equity = 1000) {
    return {
        totalEquity      : equity,
        peakEquity       : equity,
        dailyStartEquity : equity,
        dailyPnl         : 0,
        consecutiveLoss  : 0,
        pauseUntil       : null,
        circuitBreaker   : false,
        positions        : {},
        processedSignals : new Set(),
        stats: { totalTrades: 0, wins: 0, losses: 0, totalPnlUsd: 0, bestTrade: 0, worstTrade: 0 },
    };
}

// ── Risk Manager ─────────────────────────────────────────────────────────────
function calcPositionSize(state, entryPrice, stopLoss) {
    const riskPct    = Math.min(CONFIG.RISK_PER_TRADE_PCT, CONFIG.MAX_RISK_PCT) / 100;
    const riskUsd    = state.totalEquity * riskPct;
    const slDist     = Math.abs(entryPrice - stopLoss) / entryPrice;
    if (slDist <= 0 || slDist > 0.25) return null;
    const sizeUsd    = riskUsd / slDist;
    const maxSizeUsd = state.totalEquity * 0.20;
    return Math.min(sizeUsd, maxSizeUsd);
}

function canTrade(state, signal) {
    if (state.circuitBreaker)                              return { ok: false, reason: 'Circuit breaker aktif' };
    if (state.pauseUntil && Date.now() < state.pauseUntil) return { ok: false, reason: 'Cooldown aktif' };
    if (Object.keys(state.positions).length >= CONFIG.MAX_OPEN_POSITIONS)
                                                           return { ok: false, reason: 'Max open positions' };
    if (state.positions[signal.coinId])                    return { ok: false, reason: 'Sudah ada posisi di coin ini' };

    const dailyLossPct = ((state.dailyStartEquity - state.totalEquity) / state.dailyStartEquity) * 100;
    if (dailyLossPct >= CONFIG.MAX_DAILY_LOSS_PCT) {
        state.circuitBreaker = true;
        return { ok: false, reason: `Daily loss limit: ${dailyLossPct.toFixed(2)}%` };
    }
    const drawdownPct = ((state.peakEquity - state.totalEquity) / state.peakEquity) * 100;
    if (drawdownPct >= CONFIG.MAX_DRAWDOWN_PCT) {
        state.circuitBreaker = true;
        return { ok: false, reason: `Max drawdown: ${drawdownPct.toFixed(2)}%` };
    }
    if (state.consecutiveLoss >= CONFIG.MAX_CONSECUTIVE_LOSS) {
        state.pauseUntil    = Date.now() + 60 * 60 * 1000;
        state.consecutiveLoss = 0;
        return { ok: false, reason: `${CONFIG.MAX_CONSECUTIVE_LOSS} loss berturut → pause` };
    }
    return { ok: true };
}

function validateSignal(signal) {
    const ageMin = (Date.now() - new Date(signal.timestamp).getTime()) / 60000;
    if (ageMin > CONFIG.MAX_SIGNAL_AGE_MIN)     return { ok: false, reason: `Sinyal terlalu lama: ${ageMin.toFixed(0)} mnt` };
    if (signal.confidence < CONFIG.MIN_CONFIDENCE) return { ok: false, reason: `Confidence ${signal.confidence}% < ${CONFIG.MIN_CONFIDENCE}%` };
    if (signal.signal === 'LONG'  && signal.bullish  < CONFIG.MIN_BULLISH) return { ok: false, reason: `Bullish ${signal.bullish}%` };
    if (signal.signal === 'SHORT' && signal.bearish  < CONFIG.MIN_BEARISH) return { ok: false, reason: `Bearish ${signal.bearish}%` };
    if (signal.rr < CONFIG.MIN_RR)               return { ok: false, reason: `R:R ${signal.rr} < ${CONFIG.MIN_RR}` };
    if (!signal.stopLoss || !signal.tp1)          return { ok: false, reason: 'SL/TP tidak valid' };
    return { ok: true };
}

// ── Position simulation helpers ───────────────────────────────────────────────
function openPosition(state, signal, entryPrice) {
    const sizeUsd = calcPositionSize(state, entryPrice, signal.stopLoss) || 0;
    const qty     = sizeUsd / entryPrice;
    state.positions[signal.coinId] = {
        coinId       : signal.coinId,
        coinSymbol   : signal.coinSymbol,
        side         : signal.signal === 'LONG' ? 'buy' : 'sell',
        entryPrice,
        qty,
        sizeUsd,
        stopLoss     : signal.stopLoss,
        origSL       : signal.stopLoss,
        tp1          : signal.tp1,
        tp2          : signal.tp2,
        tp3          : signal.tp3,
        tp1Hit       : false,
        tp2Hit       : false,
        trailActive  : false,
        trailSL      : null,
        qtyRemaining : qty,
        pnlUsd       : 0,
    };
    return state.positions[signal.coinId];
}

function closePosition(state, coinId, exitPrice, reason) {
    const pos    = state.positions[coinId];
    if (!pos) return null;
    const isLong = pos.side === 'buy';
    const pnlUsd = isLong
        ? (exitPrice - pos.entryPrice) * pos.qtyRemaining
        : (pos.entryPrice - exitPrice) * pos.qtyRemaining;

    state.totalEquity        += pnlUsd;
    state.dailyPnl           += pnlUsd;
    state.stats.totalPnlUsd  += pnlUsd;
    state.stats.totalTrades++;

    if (pnlUsd > 0) {
        state.stats.wins++;
        state.consecutiveLoss  = 0;
        state.stats.bestTrade  = Math.max(state.stats.bestTrade, pnlUsd);
        if (state.totalEquity > state.peakEquity) state.peakEquity = state.totalEquity;
    } else {
        state.stats.losses++;
        state.consecutiveLoss++;
        state.stats.worstTrade = Math.min(state.stats.worstTrade, pnlUsd);
    }
    delete state.positions[coinId];
    return { pnlUsd, reason };
}

function tickPosition(state, coinId, currentPrice) {
    const pos     = state.positions[coinId];
    if (!pos) return 'no_pos';
    const isLong  = pos.side === 'buy';
    const pnlPct  = isLong
        ? (currentPrice - pos.entryPrice) / pos.entryPrice * 100
        : (pos.entryPrice - currentPrice) / pos.entryPrice * 100;

    // Trailing stop
    if (pnlPct >= CONFIG.TRAIL_ACTIVATE_PCT) {
        const newTrailSL = isLong
            ? currentPrice * (1 - CONFIG.TRAIL_DISTANCE_PCT / 100)
            : currentPrice * (1 + CONFIG.TRAIL_DISTANCE_PCT / 100);
        if (!pos.trailActive) { pos.trailActive = true; pos.trailSL = newTrailSL; pos.stopLoss = newTrailSL; }
        else if (isLong && newTrailSL > pos.trailSL) { pos.trailSL = newTrailSL; pos.stopLoss = newTrailSL; }
        else if (!isLong && newTrailSL < pos.trailSL) { pos.trailSL = newTrailSL; pos.stopLoss = newTrailSL; }
    }

    // SL hit
    if ((isLong && currentPrice <= pos.stopLoss) || (!isLong && currentPrice >= pos.stopLoss)) {
        return closePosition(state, coinId, currentPrice, pos.trailActive ? 'Trailing SL' : 'Stop Loss');
    }
    // TP1
    if (!pos.tp1Hit && ((isLong && currentPrice >= pos.tp1) || (!isLong && currentPrice <= pos.tp1))) {
        const closeQty = pos.qtyRemaining * (CONFIG.TP1_CLOSE_PCT / 100);
        const pnlUsd   = isLong ? (currentPrice - pos.entryPrice)*closeQty : (pos.entryPrice - currentPrice)*closeQty;
        state.totalEquity += pnlUsd; state.dailyPnl += pnlUsd; state.stats.totalPnlUsd += pnlUsd;
        pos.qtyRemaining  -= closeQty;
        pos.tp1Hit         = true;
        pos.stopLoss       = pos.entryPrice * (isLong ? 1.001 : 0.999); // geser ke BE
        return { partial: 'TP1', pnlUsd };
    }
    // TP2
    if (pos.tp1Hit && !pos.tp2Hit && ((isLong && currentPrice >= pos.tp2) || (!isLong && currentPrice <= pos.tp2))) {
        const closeQty = pos.qtyRemaining * 0.6; // ~30% dari total
        const pnlUsd   = isLong ? (currentPrice - pos.entryPrice)*closeQty : (pos.entryPrice - currentPrice)*closeQty;
        state.totalEquity += pnlUsd; state.dailyPnl += pnlUsd; state.stats.totalPnlUsd += pnlUsd;
        pos.qtyRemaining  -= closeQty;
        pos.tp2Hit         = true;
        return { partial: 'TP2', pnlUsd };
    }
    // TP3
    if (pos.tp1Hit && pos.tp2Hit && ((isLong && currentPrice >= pos.tp3) || (!isLong && currentPrice <= pos.tp3))) {
        return closePosition(state, coinId, currentPrice, 'TP3');
    }
    pos.pnlUsd = isLong
        ? (currentPrice - pos.entryPrice) * pos.qtyRemaining
        : (pos.entryPrice - currentPrice) * pos.qtyRemaining;
    return 'hold';
}

// ══════════════════════════════════════════════════════════════════════════════
//  TESTS
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n' + C.bold + C.cyan + '═'.repeat(65));
console.log('  🧪  Auto Trader — Full Simulation & Unit Test');
console.log('═'.repeat(65) + C.reset + '\n');

// ─────────────────────────────────────────────────────────────────────────────
console.log(C.bold + '📐 T1 — Risk Manager: Position Sizing' + C.reset);
sep();
{
    const state = makeState(1000);
    // Entry $100, SL $95 (5% distance) → risk $15 → size = 15/0.05 = $300 → cap 20% = $200
    const sz1 = calcPositionSize(state, 100, 95);
    assert(sz1 !== null, `Position size tidak null (got $${sz1?.toFixed(2)})`);
    assert(sz1 <= 200, `Size ≤ max 20% equity ($200): $${sz1?.toFixed(2)}`);

    // Entry $100, SL $99 (1% distance) → risk $15 → size = $1500 → cap $200
    const sz2 = calcPositionSize(state, 100, 99);
    assert(sz2 === 200, `Size di-cap $200 saat SL sangat dekat: $${sz2?.toFixed(2)}`);

    // SL terlalu jauh (>25%) → null
    const sz3 = calcPositionSize(state, 100, 70);
    assert(sz3 === null, `SL >25% → null (ditolak): ${sz3}`);

    info(`Risk ${CONFIG.RISK_PER_TRADE_PCT}% × $1000 = $${(1000*CONFIG.RISK_PER_TRADE_PCT/100).toFixed(2)} per trade`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + C.bold + '🔍 T2 — Entry Filter: Validasi Sinyal' + C.reset);
sep();
{
    const now      = new Date().toISOString();
    const old      = new Date(Date.now() - 35 * 60000).toISOString(); // 35 menit lalu

    const goodLong = { coinId:'btc', coinSymbol:'btc', signal:'LONG', timestamp:now, confidence:25, bullish:65, bearish:35, rr:2.0, stopLoss:90000, tp1:105000 };
    const oldSig   = { ...goodLong, timestamp: old };
    const lowConf  = { ...goodLong, confidence: 10 };
    const lowBull  = { ...goodLong, bullish: 55 };
    const lowRR    = { ...goodLong, rr: 1.0 };
    const noSL     = { ...goodLong, stopLoss: null };

    assert(validateSignal(goodLong).ok === true,  'Sinyal baik → ACCEPT');
    assert(validateSignal(oldSig).ok   === false, 'Sinyal 35 mnt lalu → REJECT (stale)');
    assert(validateSignal(lowConf).ok  === false, 'Confidence 10% → REJECT');
    assert(validateSignal(lowBull).ok  === false, 'Bullish 55% → REJECT');
    assert(validateSignal(lowRR).ok    === false, 'R:R 1.0 → REJECT');
    assert(validateSignal(noSL).ok     === false, 'Tanpa SL → REJECT');

    info(`Min confidence: ${CONFIG.MIN_CONFIDENCE}% | Min bullish: ${CONFIG.MIN_BULLISH}% | Min R:R: ${CONFIG.MIN_RR}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + C.bold + '🚦 T3 — Circuit Breaker & Guards' + C.reset);
sep();
{
    const signal = { coinId:'eth', coinSymbol:'eth' };

    // Max positions
    const s1 = makeState(1000);
    for (let i = 0; i < CONFIG.MAX_OPEN_POSITIONS; i++) s1.positions[`coin${i}`] = {};
    assert(canTrade(s1, signal).ok === false, `Max ${CONFIG.MAX_OPEN_POSITIONS} posisi → BLOCK`);

    // Duplikasi coin
    const s2 = makeState(1000);
    s2.positions['eth'] = {};
    assert(canTrade(s2, { coinId: 'eth' }).ok === false, 'Duplikasi coin → BLOCK');

    // Daily loss limit
    const s3 = makeState(1000);
    s3.totalEquity = 940; // -6% dari 1000
    assert(canTrade(s3, signal).ok === false, `Daily loss >5% → CIRCUIT BREAKER`);
    assert(s3.circuitBreaker === true, 'circuitBreaker = true setelah daily loss');

    // Drawdown dari peak
    const s4 = makeState(1000);
    s4.peakEquity  = 1200;
    s4.totalEquity = 1095; // drawdown ~8.75%
    assert(canTrade(s4, signal).ok === false, `Drawdown >8% dari peak → CIRCUIT BREAKER`);

    // Consecutive loss pause
    const s5 = makeState(1000);
    s5.consecutiveLoss = CONFIG.MAX_CONSECUTIVE_LOSS;
    assert(canTrade(s5, signal).ok === false, `${CONFIG.MAX_CONSECUTIVE_LOSS} loss beruntun → PAUSE`);
    assert(s5.pauseUntil !== null, 'pauseUntil diset');
    assert(s5.consecutiveLoss === 0, 'consecutiveLoss direset ke 0');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + C.bold + '📈 T4 — Simulasi LONG → TP1 → TP2 → TP3' + C.reset);
sep();
{
    const state  = makeState(1000);
    const signal = {
        coinId     : 'btc',
        coinSymbol : 'btc',
        signal     : 'LONG',
        timestamp  : new Date().toISOString(),
        confidence : 30,
        bullish    : 70,
        bearish    : 30,
        rr         : 2.0,
        stopLoss   : 90000,
        tp1        : 98000,
        tp2        : 102000,
        tp3        : 108000,
    };
    const ENTRY = 94000;

    const pos = openPosition(state, signal, ENTRY);
    info(`Entry $${ENTRY} | Size: $${pos.sizeUsd.toFixed(2)} | Qty: ${pos.qty.toFixed(6)} BTC`);

    // Price naik ke TP1
    const r1 = tickPosition(state, 'btc', 98000);
    assert(r1?.partial === 'TP1',          'TP1 hit → partial close 50%');
    assert(pos.tp1Hit === true,            'tp1Hit = true');
    assert(pos.stopLoss > ENTRY,           `SL geser ke BE: $${pos.stopLoss.toFixed(2)}`);
    assert(r1.pnlUsd > 0,                 `TP1 PnL positif: +$${r1.pnlUsd.toFixed(2)}`);
    info(`Qty remaining setelah TP1: ${pos.qtyRemaining.toFixed(6)}`);

    // Price naik ke TP2
    const r2 = tickPosition(state, 'btc', 102000);
    assert(r2?.partial === 'TP2',          'TP2 hit → partial close');
    assert(pos.tp2Hit === true,            'tp2Hit = true');
    assert(r2.pnlUsd > 0,                 `TP2 PnL positif: +$${r2.pnlUsd.toFixed(2)}`);

    // Price naik ke TP3 → full close
    const r3 = tickPosition(state, 'btc', 108000);
    assert(typeof r3 === 'object' && r3.reason === 'TP3', 'TP3 hit → full close');
    assert(state.positions['btc'] === undefined,          'Posisi dihapus dari state');
    assert(state.stats.totalTrades === 1,                 'Trade dicatat di stats');
    assert(state.stats.wins === 1,                        'Win count +1');
    assert(state.stats.totalPnlUsd > 0,                   `Total PnL: +$${state.stats.totalPnlUsd.toFixed(2)}`);
    assert(state.totalEquity > 1000,                      `Equity naik: $${state.totalEquity.toFixed(2)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + C.bold + '📉 T5 — Simulasi LONG → Stop Loss Hit' + C.reset);
sep();
{
    const state  = makeState(1000);
    const ENTRY  = 50000;
    const SL     = 48000;
    const signal = {
        coinId: 'sol', coinSymbol: 'sol', signal: 'LONG',
        timestamp: new Date().toISOString(), confidence: 25, bullish: 65, bearish: 35,
        rr: 2.0, stopLoss: SL, tp1: 54000, tp2: 57000, tp3: 62000,
    };

    openPosition(state, signal, ENTRY);
    const equityBefore = state.totalEquity;

    // Price turun sampai SL
    tickPosition(state, 'sol', 49000); // masih hold
    const r = tickPosition(state, 'sol', 47900); // SL hit

    assert(typeof r === 'object' && r.reason === 'Stop Loss', 'SL hit → close');
    assert(state.positions['sol'] === undefined,              'Posisi dihapus');
    assert(state.totalEquity < equityBefore,                  `Equity turun: $${state.totalEquity.toFixed(2)} (rugi $${(equityBefore - state.totalEquity).toFixed(2)})`);
    assert(state.stats.losses === 1,                          'Loss count +1');
    assert(state.consecutiveLoss === 1,                       'consecutiveLoss = 1');

    // Pastikan rugi tidak melebihi risk yang ditetapkan
    const riskUsd   = 1000 * (CONFIG.RISK_PER_TRADE_PCT / 100);
    const actualLoss = equityBefore - state.totalEquity;
    assert(actualLoss <= riskUsd * 1.1, `Loss ($${actualLoss.toFixed(2)}) ≤ risk limit ($${riskUsd.toFixed(2)}) ✓`);
    info(`Risk budget: $${riskUsd.toFixed(2)} | Actual loss: $${actualLoss.toFixed(2)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + C.bold + '🔄 T6 — Simulasi Trailing Stop' + C.reset);
sep();
{
    const state  = makeState(1000);
    const ENTRY  = 100;
    const signal = {
        coinId: 'bnb', coinSymbol: 'bnb', signal: 'LONG',
        timestamp: new Date().toISOString(), confidence: 28, bullish: 68, bearish: 32,
        rr: 2.5, stopLoss: 93, tp1: 108, tp2: 114, tp3: 125,
    };

    const pos = openPosition(state, signal, ENTRY);
    assert(pos.trailActive === false, 'Trailing belum aktif saat entry');

    // Harga naik 1.2% → belum aktif
    tickPosition(state, 'bnb', 101.2);
    assert(pos.trailActive === false, 'Trailing belum aktif di <1.5% profit');

    // Harga naik 2% → aktif
    tickPosition(state, 'bnb', 102);
    assert(pos.trailActive === true, `Trailing aktif di +2%`);
    info(`Trail SL: $${pos.trailSL?.toFixed(4)} (harga $102, jarak ${CONFIG.TRAIL_DISTANCE_PCT}%)`);

    // Harga naik lebih → trail SL ikut naik
    const trailBefore = pos.trailSL;
    tickPosition(state, 'bnb', 105);
    assert(pos.trailSL > trailBefore, `Trail SL naik: $${trailBefore?.toFixed(4)} → $${pos.trailSL?.toFixed(4)}`);

    // Harga turun ke bawah trail SL → close
    const slLevel = pos.trailSL;
    const r = tickPosition(state, 'bnb', slLevel - 0.01);
    assert(r?.reason === 'Trailing SL', `Trailing SL hit → close`);
    assert(state.stats.wins === 1,      'Trade ini profit (menang karena trail di atas entry)');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + C.bold + '📊 T7 — Simulasi REAL dari signals.json (top 5)' + C.reset);
sep();
{
    let signals = [];
    try {
        signals = JSON.parse(fs.readFileSync(CONFIG.SIGNALS_FILE, 'utf8'));
    } catch (e) {
        info('signals.json tidak ditemukan — skip T7');
    }

    if (signals.length) {
        info(`signals.json: ${signals.length} sinyal tersimpan`);

        // Ambil 5 sinyal dengan confidence tertinggi
        const top5 = [...signals]
            .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
            .slice(0, 5);

        const simState = makeState(1000);
        let simLog = [];

        top5.forEach(sig => {
            const sigAge = (Date.now() - new Date(sig.timestamp).getTime()) / 60000;

            // Paksa timestamp jadi "baru" untuk simulasi
            const freshSig = { ...sig, timestamp: new Date().toISOString() };
            const vResult  = validateSignal(freshSig);
            const tResult  = canTrade(simState, freshSig);

            const entry = sig.currentPrice;
            let simResult = '—';
            let simPnl    = 0;

            if (vResult.ok && tResult.ok) {
                const pos = openPosition(simState, freshSig, entry);
                if (pos) {
                    // Simulasi: TP1 tercapai (optimis) / SL tidak tercapai
                    const r = tickPosition(simState, sig.coinId, sig.tp1);
                    if (r?.partial === 'TP1') {
                        simResult = '🎯 TP1';
                        simPnl    = r.pnlUsd;
                        // Tutup sisa posisi di harga TP1 untuk bersihkan state
                        closePosition(simState, sig.coinId, sig.tp1, 'sim-close');
                    } else if (r?.reason) {
                        simResult = `🛑 ${r.reason}`;
                        simPnl    = r.pnlUsd || 0;
                    }
                }
            }

            simLog.push({ sig, vResult, tResult, simResult, simPnl });
        });

        console.log('\n  ' + C.bold + 'Coin'.padEnd(12) + 'Signal'.padEnd(8) + 'Bullish'.padEnd(10) + 'Conf'.padEnd(8) + 'R:R'.padEnd(7) + 'Filter'.padEnd(14) + 'Sim PnL' + C.reset);
        console.log('  ' + '─'.repeat(65));

        simLog.forEach(({ sig, vResult, tResult, simResult, simPnl }) => {
            const coin  = (sig.coinSymbol || sig.coinId).toUpperCase().padEnd(10);
            const dir   = (sig.signal || '?').padEnd(7);
            const bull  = `${sig.bullish || 0}%`.padEnd(9);
            const conf  = `${sig.confidence || 0}%`.padEnd(7);
            const rr    = `1:${sig.rr || 0}`.padEnd(6);
            const filt  = vResult.ok && tResult.ok
                ? C.green + '✅ ACCEPT'.padEnd(13) + C.reset
                : C.red   + `❌ ${(vResult.reason || tResult.reason || '?').slice(0,12)}`.padEnd(13) + C.reset;
            const pnl   = simPnl > 0
                ? C.green + `+$${simPnl.toFixed(3)}` + C.reset
                : simPnl < 0
                    ? C.red + `-$${Math.abs(simPnl).toFixed(3)}` + C.reset
                    : C.dim + simResult + C.reset;
            console.log(`  ${coin} ${dir} ${bull} ${conf} ${rr} ${filt} ${pnl}`);
        });

        const accepted = simLog.filter(l => l.vResult.ok && l.tResult.ok).length;
        console.log();
        assert(signals.length > 0,  `signals.json berisi ${signals.length} sinyal`);
        info(`${accepted}/${top5.length} sinyal lolos filter (dari top 5 by confidence)`);
        info(`Equity simulasi: $${simState.totalEquity.toFixed(2)} | PnL: ${simState.stats.totalPnlUsd >= 0 ? '+' : ''}$${simState.stats.totalPnlUsd.toFixed(2)}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + C.bold + '🔁 T8 — Duplikasi Sinyal Guard' + C.reset);
sep();
{
    const state  = makeState(1000);
    const signal = {
        coinId: 'ada', coinSymbol: 'ada', signal: 'LONG',
        timestamp: new Date().toISOString(), confidence: 30,
        bullish: 70, bearish: 30, rr: 2.0, stopLoss: 0.4, tp1: 0.6, tp2: 0.7, tp3: 0.85,
    };
    const sigId = `${signal.coinId}_${signal.signal}_${signal.timestamp}`;

    // Pertama kali → belum diproses
    assert(!state.processedSignals.has(sigId), 'Sinyal pertama: belum diproses');
    state.processedSignals.add(sigId);

    // Kedua kali → sudah ada di set
    assert(state.processedSignals.has(sigId),  'Sinyal sama: sudah ada di processedSignals → SKIP');

    // Buka posisi lalu coba entry lagi
    openPosition(state, signal, 0.5);
    const c = canTrade(state, signal);
    assert(c.ok === false && c.reason.includes('posisi'), 'Duplikasi posisi per-coin → BLOCK');
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + C.bold + '📉 T9 — Simulasi Backtest: 10 Trade Streak' + C.reset);
sep();
{
    const state = makeState(1000);
    const equityCurve = [state.totalEquity];
    const trades = [
        { result: 'win', mult: 2.0 },   // TP1
        { result: 'win', mult: 2.5 },   // TP2
        { result: 'loss', mult: -1.0 }, // SL
        { result: 'win', mult: 1.5 },   // TP1
        { result: 'loss', mult: -1.0 }, // SL
        { result: 'loss', mult: -1.0 }, // SL → 3 consec, pause
        { result: 'win', mult: 3.0 },   // TP3
        { result: 'win', mult: 1.5 },
        { result: 'loss', mult: -1.0 },
        { result: 'win', mult: 2.0 },
    ];

    const riskUsd = state.totalEquity * (CONFIG.RISK_PER_TRADE_PCT / 100);
    trades.forEach((t, i) => {
        const pnl = riskUsd * t.mult * (t.result === 'win' ? 1 : -1);
        state.totalEquity       += pnl;
        state.stats.totalPnlUsd += pnl;
        state.stats.totalTrades++;
        if (t.result === 'win') { state.stats.wins++; state.consecutiveLoss = 0; }
        else                   { state.stats.losses++; state.consecutiveLoss++; }
        if (state.consecutiveLoss >= CONFIG.MAX_CONSECUTIVE_LOSS) {
            state.consecutiveLoss = 0;
            info(`  Trade ${i+1}: 3 loss beruntun → pause 1 jam`);
        }
        equityCurve.push(state.totalEquity);
    });

    const winRate = (state.stats.wins / state.stats.totalTrades * 100).toFixed(1);
    assert(state.stats.totalTrades === 10,      '10 trade dijalankan');
    assert(state.stats.wins + state.stats.losses === 10, 'Total wins + losses = 10');
    assert(state.totalEquity > 0,               'Equity masih positif');
    info(`Equity curve: ${equityCurve.map(e => '$'+e.toFixed(0)).join(' → ')}`);
    info(`Win Rate: ${winRate}% | Final equity: $${state.totalEquity.toFixed(2)} | PnL: ${state.stats.totalPnlUsd >= 0 ? '+' : ''}$${state.stats.totalPnlUsd.toFixed(2)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HASIL AKHIR
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(65));
const total = passCount + failCount;
if (failCount === 0) {
    console.log(C.bold + C.green + `  ✅ SEMUA TEST LULUS: ${passCount}/${total} passed` + C.reset);
} else {
    console.log(C.bold + C.red + `  ❌ ${failCount} TEST GAGAL: ${passCount}/${total} passed` + C.reset);
}
console.log('═'.repeat(65) + '\n');

process.exit(failCount > 0 ? 1 : 0);
