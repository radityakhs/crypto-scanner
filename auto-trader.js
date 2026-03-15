#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Auto Trader v1 — Professional Quant-Grade Automated Execution Engine
//  Jalankan: node auto-trader.js
//
//  ARSITEKTUR:
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │  1. Signal Reader     — Baca signals.json dari signal-bot.js        │
//  │  2. Risk Manager      — Position sizing, max risk, drawdown limiter  │
//  │  3. Entry Filter      — Konfirmasi ulang entry sebelum eksekusi      │
//  │  4. Order Executor    — Kirim order ke OKX via proxy-server.js       │
//  │  5. Position Tracker  — Monitor open positions, unrealized P&L       │
//  │  6. Trailing Stop     — Geser SL otomatis saat profit               │
//  │  7. Partial TP        — Tutup 50% di TP1, 30% di TP2, 20% di TP3   │
//  │  8. Circuit Breaker   — Stop trading jika drawdown > batas           │
//  │  9. State Persistence — Simpan state ke auto-trader-state.json       │
//  └─────────────────────────────────────────────────────────────────────┘
//
//  KEAMANAN:
//  - Tidak menyentuh API key — semua lewat proxy-server.js di :3001
//  - Mode DRY_RUN default = true (paper trading) → set false untuk live
//  - Hard cap: max 5 posisi terbuka, max 2% risiko per trade
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Engine Logger (adaptive weights training data) ────────────────────────────
let engineLogger = null;
try {
    engineLogger = require('./engine-logger');
} catch (e) {
    console.warn('[AutoTrader] engine-logger.js tidak ditemukan — adaptive weights tidak akan diupdate');
}

// ── Adaptive Weights updater ──────────────────────────────────────────────────
let adaptiveWeights = null;
try {
    adaptiveWeights = require('./adaptive-weights');
} catch {}

// ═══════════════════════════════════════════════════════════════════════════════
//  KONFIGURASI — Ubah sesuai risk tolerance kamu
// ═══════════════════════════════════════════════════════════════════════════════
const CONFIG = {
    // ── Mode ──────────────────────────────────────────────────────────────────
    DRY_RUN           : true,    // true = paper trading, false = live trading NYATA
    PAPER_EQUITY      : 1000,    // modal simulasi DRY RUN dalam USDT
    // ── Proxy server ─────────────────────────────────────────────────────────
    PROXY_HOST        : '127.0.0.1',
    PROXY_PORT        : 3001,
    // ── Risk per trade ────────────────────────────────────────────────────────
    RISK_PER_TRADE_PCT: 1.5,     // % dari total equity per trade (max 2%)
    MAX_RISK_PCT      : 2.0,     // hard cap risk per trade
    // ── Position limits ───────────────────────────────────────────────────────
    MAX_OPEN_POSITIONS: 5,       // max posisi terbuka bersamaan
    MAX_CORRELATED    : 2,       // max 2 posisi di asset yang sama sektor
    // ── Circuit breaker ───────────────────────────────────────────────────────
    MAX_DAILY_LOSS_PCT: 5.0,     // stop trading jika rugi > 5% equity hari ini
    MAX_DRAWDOWN_PCT  : 8.0,     // stop trading jika drawdown dari peak > 8%
    MAX_CONSECUTIVE_LOSS: 3,     // pause 1 jam setelah 3 loss berturut-turut
    // ── Entry filter ──────────────────────────────────────────────────────────
    MIN_CONFIDENCE    : 20,      // min confidence dari quant engine
    MIN_BULLISH       : 60,      // min bullish% untuk LONG
    MIN_BEARISH       : 60,      // min bearish% untuk SHORT
    MIN_RR            : 1.5,     // min Risk:Reward ratio
    MIN_EV            : 0.0,     // min Expected Value (0 = breakeven, positif = ada edge)
    MAX_SIGNAL_AGE_MIN: 30,      // tolak sinyal > 30 menit (stale)
    // ── Partial Take Profit ───────────────────────────────────────────────────
    TP1_CLOSE_PCT     : 50,      // tutup 50% posisi di TP1
    TP2_CLOSE_PCT     : 30,      // tutup 30% posisi di TP2
    TP3_CLOSE_PCT     : 20,      // tutup 20% sisa di TP3
    // ── Trailing Stop ─────────────────────────────────────────────────────────
    TRAIL_ACTIVATE_PCT: 1.5,     // aktifkan trailing stop saat profit >= 1.5%
    TRAIL_DISTANCE_PCT: 0.8,     // jarak trailing stop dari harga saat ini
    // ── Timing ───────────────────────────────────────────────────────────────
    POLL_INTERVAL_MS  : 30_000,  // cek sinyal baru tiap 30 detik
    PRICE_CHECK_MS    : 10_000,  // update harga & cek SL/TP tiap 10 detik
    // ── File paths ───────────────────────────────────────────────────────────
    SIGNALS_FILE      : path.join(__dirname, 'signals.json'),
    STATE_FILE        : path.join(__dirname, 'auto-trader-state.json'),
    LOG_FILE          : path.join(__dirname, 'auto-trader.log'),
};

// ═══════════════════════════════════════════════════════════════════════════════
//  LOGGER
// ═══════════════════════════════════════════════════════════════════════════════
const ICONS = { INFO: 'ℹ️ ', TRADE: '💰', WARN: '⚠️ ', ERROR: '❌', WIN: '✅', LOSS: '🔴', SYSTEM: '⚙️ ' };

function log(msg, level = 'INFO') {
    const ts   = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const line = `[${ts}] ${ICONS[level] || ''}[${level}] ${msg}`;
    console.log(line);
    try { fs.appendFileSync(CONFIG.LOG_FILE, line + '\n'); } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HTTP CLIENT (ke proxy-server.js)
// ═══════════════════════════════════════════════════════════════════════════════
function proxyRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        const data    = body ? JSON.stringify(body) : null;
        const options = {
            hostname: CONFIG.PROXY_HOST,
            port    : CONFIG.PROXY_PORT,
            path    : endpoint,
            method,
            headers : {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
            },
        };
        const req = http.request(options, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error('JSON parse: ' + raw.slice(0, 100))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Proxy timeout')); });
        if (data) req.write(data);
        req.end();
    });
}

const api = {
    health       : ()           => proxyRequest('GET',  '/health'),
    balance      : ()           => proxyRequest('GET',  '/okx/balance'),
    ticker       : (instId)     => proxyRequest('GET',  `/okx/ticker?instId=${instId}`),
    positions    : ()           => proxyRequest('GET',  '/okx/positions?instType=SPOT'),
    pendingOrders: ()           => proxyRequest('GET',  '/okx/orders/pending?instType=SPOT'),
    instruments  : ()           => proxyRequest('GET',  '/okx/instruments'),
    orderHistory : (n=10)       => proxyRequest('GET',  `/okx/orders/history?instType=SPOT&limit=${n}`),
    placeOrder   : (body)       => proxyRequest('POST', '/okx/order/place', body),
    cancelOrder  : (body)       => proxyRequest('POST', '/okx/order/cancel', body),
};

// ═══════════════════════════════════════════════════════════════════════════════
//  EXCHANGE INSTRUMENTS CACHE
//  — Fetch daftar coin yang tersedia di exchange (Hyperliquid, Binance, dll)
//    agar auto-trader tidak buang waktu coba coin yang tidak ada
// ═══════════════════════════════════════════════════════════════════════════════
let _availableCoins = null; // Set of uppercase coin symbols, e.g. {'BTC','ETH','SOL'}

async function getAvailableCoins() {
    if (_availableCoins) return _availableCoins;
    try {
        const resp = await api.instruments();
        const coins = (resp?.data || []).map(i => i.baseCcy?.toUpperCase()).filter(Boolean);
        if (coins.length > 0) {
            _availableCoins = new Set(coins);
            log(`Exchange instruments loaded: ${coins.length} coins tersedia`, 'SYSTEM');
        }
    } catch (e) {
        log(`Gagal load instruments: ${e.message} — semua coin akan dicoba`, 'WARN');
        _availableCoins = null;
    }
    return _availableCoins;
}

// Refresh instruments cache tiap 1 jam
setInterval(() => { _availableCoins = null; }, 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════════
//  STATE MANAGER
// ═══════════════════════════════════════════════════════════════════════════════
let STATE = {
    running          : false,
    dryRun           : CONFIG.DRY_RUN,
    totalEquity      : 0,
    peakEquity       : 0,
    dailyStartEquity : 0,
    dailyPnl         : 0,
    totalPnl         : 0,
    consecutiveLoss  : 0,
    pauseUntil       : null,
    circuitBreaker   : false,
    trades           : [],          // riwayat semua trade
    positions        : {},          // posisi terbuka: { coinId: Position }
    processedSignals : new Set(),   // signal ID yang sudah diproses
    stats: {
        totalTrades  : 0,
        wins         : 0,
        losses       : 0,
        totalPnlUsd  : 0,
        bestTrade    : 0,
        worstTrade   : 0,
        avgRR        : 0,
    }
};

function loadState() {
    try {
        if (fs.existsSync(CONFIG.STATE_FILE)) {
            const s = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
            STATE = { ...STATE, ...s };
            // Set tidak bisa di-serialize JSON, rebuild dari array
            STATE.processedSignals = new Set(s._processedSignalsArr || []);
            log(`State di-load: ${Object.keys(STATE.positions).length} posisi terbuka, PnL total: $${STATE.stats.totalPnlUsd.toFixed(2)}`, 'SYSTEM');
        }
    } catch (e) {
        log(`Gagal load state: ${e.message}`, 'WARN');
    }
}

function saveState() {
    try {
        const toSave = {
            ...STATE,
            processedSignals   : undefined,
            _processedSignalsArr: [...STATE.processedSignals].slice(-200), // simpan 200 terakhir
        };
        fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(toSave, null, 2));
    } catch (e) {
        log(`Gagal save state: ${e.message}`, 'WARN');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  RISK MANAGER
// ═══════════════════════════════════════════════════════════════════════════════
const riskManager = {

    /**
     * Hitung ukuran posisi (dalam USDT) berdasarkan:
     * - Equity saat ini
     * - kellyFraction dari signal-bot (jika ada) — DYNAMIC sizing
     * - Fallback ke fixed RISK_PER_TRADE_PCT jika signal lama tidak punya Kelly
     * - Jarak ke stop loss
     */
    calcPositionSize(equity, entryPrice, stopLoss, kellyFraction = null) {
        // Gunakan Kelly fraction jika tersedia dan valid, fallback ke fixed risk%
        const riskPct = kellyFraction && kellyFraction > 0
            ? Math.min(kellyFraction, CONFIG.MAX_RISK_PCT / 100)  // Kelly sudah dalam 0-1
            : Math.min(CONFIG.RISK_PER_TRADE_PCT, CONFIG.MAX_RISK_PCT) / 100;

        const riskUsd    = equity * riskPct;
        const slDist     = Math.abs(entryPrice - stopLoss) / entryPrice; // sebagai desimal
        if (slDist <= 0 || slDist > 0.25) return null; // SL terlalu jauh (>25%) = aneh
        const sizeUsd    = riskUsd / slDist;
        const maxSizeUsd = equity * 0.20; // hard cap 20% equity per posisi
        return Math.min(sizeUsd, maxSizeUsd);
    },

    /**
     * Validasi apakah trade boleh dieksekusi
     */
    canTrade(signal) {
        // Circuit breaker aktif?
        if (STATE.circuitBreaker) return { ok: false, reason: 'Circuit breaker aktif — trading dihentikan' };

        // Sedang pause?
        if (STATE.pauseUntil && Date.now() < STATE.pauseUntil) {
            const mnt = Math.ceil((STATE.pauseUntil - Date.now()) / 60000);
            return { ok: false, reason: `Cooldown: pause ${mnt} menit lagi` };
        }

        // Max open positions?
        const openCount = Object.keys(STATE.positions).length;
        if (openCount >= CONFIG.MAX_OPEN_POSITIONS) {
            return { ok: false, reason: `Max ${CONFIG.MAX_OPEN_POSITIONS} posisi terbuka (saat ini: ${openCount})` };
        }

        // Sudah ada posisi di coin ini?
        if (STATE.positions[signal.coinId]) {
            return { ok: false, reason: `Sudah ada posisi terbuka di ${signal.coinSymbol.toUpperCase()}` };
        }

        // Daily drawdown limit?
        const dailyLossPct = STATE.dailyStartEquity > 0
            ? ((STATE.dailyStartEquity - STATE.totalEquity) / STATE.dailyStartEquity) * 100 : 0;
        if (dailyLossPct >= CONFIG.MAX_DAILY_LOSS_PCT) {
            STATE.circuitBreaker = true;
            return { ok: false, reason: `Daily loss limit: −${dailyLossPct.toFixed(2)}% (batas: ${CONFIG.MAX_DAILY_LOSS_PCT}%)` };
        }

        // Max drawdown dari peak?
        const drawdownPct = STATE.peakEquity > 0
            ? ((STATE.peakEquity - STATE.totalEquity) / STATE.peakEquity) * 100 : 0;
        if (drawdownPct >= CONFIG.MAX_DRAWDOWN_PCT) {
            STATE.circuitBreaker = true;
            return { ok: false, reason: `Max drawdown: −${drawdownPct.toFixed(2)}% dari peak (batas: ${CONFIG.MAX_DRAWDOWN_PCT}%)` };
        }

        // Consecutive loss pause?
        if (STATE.consecutiveLoss >= CONFIG.MAX_CONSECUTIVE_LOSS) {
            STATE.pauseUntil = Date.now() + 60 * 60 * 1000; // pause 1 jam
            STATE.consecutiveLoss = 0;
            return { ok: false, reason: `${CONFIG.MAX_CONSECUTIVE_LOSS} loss berturut-turut — pause 1 jam` };
        }

        return { ok: true, reason: null };
    },

    /**
     * Filter kualitas sinyal
     */
    validateSignal(signal) {
        // Umur sinyal
        const ageMin = (Date.now() - new Date(signal.timestamp).getTime()) / 60000;
        if (ageMin > CONFIG.MAX_SIGNAL_AGE_MIN)
            return { ok: false, reason: `Sinyal terlalu lama: ${ageMin.toFixed(0)} menit` };

        // Confidence minimum
        if (signal.confidence < CONFIG.MIN_CONFIDENCE)
            return { ok: false, reason: `Confidence terlalu rendah: ${signal.confidence}%` };

        // Directional strength
        if (signal.signal === 'LONG'  && signal.bullish < CONFIG.MIN_BULLISH)
            return { ok: false, reason: `Bullish lemah: ${signal.bullish}%` };
        if (signal.signal === 'SHORT' && signal.bearish < CONFIG.MIN_BEARISH)
            return { ok: false, reason: `Bearish lemah: ${signal.bearish}%` };

        // R:R minimum
        if (signal.rr < CONFIG.MIN_RR)
            return { ok: false, reason: `R:R terlalu rendah: 1:${signal.rr}` };

        // Harus punya SL dan TP valid
        if (!signal.stopLoss || !signal.tp1)
            return { ok: false, reason: 'SL atau TP tidak valid' };

        // ── EV filter (Bayesian/Kelly) — hanya untuk sinyal baru yang punya field ini
        if (signal.expectedValue !== undefined && signal.expectedValue <= CONFIG.MIN_EV)
            return { ok: false, reason: `Expected Value negatif/terlalu rendah: EV=${signal.expectedValue}` };
        if (signal.kellyFraction !== undefined && signal.kellyFraction < 0.005)
            return { ok: false, reason: `Kelly fraction terlalu kecil: ${(signal.kellyFraction*100).toFixed(2)}%` };

        // Cek coin tersedia di exchange (sync check dari cache)
        if (_availableCoins && !_availableCoins.has(signal.coinSymbol?.toUpperCase())) {
            return { ok: false, reason: `${signal.coinSymbol} tidak tersedia di exchange ini` };
        }

        return { ok: true, reason: null };
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  POSITION TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} Position
 * @property {string}  coinId
 * @property {string}  coinSymbol
 * @property {string}  instId        — format OKX: e.g. BTC-USDT
 * @property {string}  side          — 'buy' | 'sell'
 * @property {number}  entryPrice
 * @property {number}  qty           — jumlah koin
 * @property {number}  sizeUsd       — nilai posisi dalam USDT
 * @property {number}  stopLoss
 * @property {number}  tp1
 * @property {number}  tp2
 * @property {number}  tp3
 * @property {number}  riskUsd
 * @property {boolean} tp1Hit
 * @property {boolean} tp2Hit
 * @property {number}  trailActive   — harga saat trailing mulai aktif
 * @property {number}  trailSL       — level trailing SL saat ini
 * @property {string}  openedAt
 * @property {string}  orderId
 * @property {number}  qtyRemaining  — qty yang belum ditutup
 */

function buildInstId(coinSymbol) {
    return `${coinSymbol.toUpperCase()}-USDT`;
}

function openPosition(signal, entryPrice, qty, sizeUsd, orderId = null) {
    const pos = {
        coinId       : signal.coinId,
        coinSymbol   : signal.coinSymbol,
        instId       : buildInstId(signal.coinSymbol),
        side         : signal.signal === 'LONG' ? 'buy' : 'sell',
        entryPrice,
        qty,
        sizeUsd,
        stopLoss     : signal.stopLoss,
        origSL       : signal.stopLoss,
        tp1          : signal.tp1,
        tp2          : signal.tp2,
        tp3          : signal.tp3,
        riskUsd      : sizeUsd * (Math.abs(entryPrice - signal.stopLoss) / entryPrice),
        tp1Hit       : false,
        tp2Hit       : false,
        trailActive  : false,
        trailSL      : null,
        openedAt     : new Date().toISOString(),
        orderId,
        qtyRemaining : qty,
        pnlUsd       : 0,
        signal       : signal,           // ← simpan full signal object untuk engine-logger
        confidence   : signal.confidence,
        bullish      : signal.bullish,
        bearish      : signal.bearish,
    };
    STATE.positions[signal.coinId] = pos;
    saveState();
    return pos;
}

function closePosition(coinId, currentPrice, reason) {
    const pos = STATE.positions[coinId];
    if (!pos) return;

    const pnlUsd = pos.side === 'buy'
        ? (currentPrice - pos.entryPrice) * pos.qtyRemaining
        : (pos.entryPrice - currentPrice) * pos.qtyRemaining;

    const pnlPct = ((pnlUsd / pos.sizeUsd) * 100).toFixed(2);
    const isWin  = pnlUsd > 0;

    const tradeRecord = {
        coinId      : pos.coinId,
        coinSymbol  : pos.coinSymbol,
        side        : pos.side,
        entryPrice  : pos.entryPrice,
        exitPrice   : currentPrice,
        qty         : pos.qty,
        sizeUsd     : pos.sizeUsd,
        pnlUsd      : +pnlUsd.toFixed(2),
        pnlPct      : +pnlPct,
        reason,
        openedAt    : pos.openedAt,
        closedAt    : new Date().toISOString(),
        durationMin : Math.round((Date.now() - new Date(pos.openedAt).getTime()) / 60000),
    };

    // Update statistik
    STATE.stats.totalTrades++;
    STATE.stats.totalPnlUsd += pnlUsd;
    STATE.dailyPnl           += pnlUsd;
    STATE.totalPnl           += pnlUsd;
    STATE.totalEquity        += pnlUsd;

    if (isWin) {
        STATE.stats.wins++;
        STATE.consecutiveLoss  = 0;
        STATE.stats.bestTrade  = Math.max(STATE.stats.bestTrade, pnlUsd);
        if (STATE.totalEquity > STATE.peakEquity) STATE.peakEquity = STATE.totalEquity;
    } else {
        STATE.stats.losses++;
        STATE.consecutiveLoss++;
        STATE.stats.worstTrade = Math.min(STATE.stats.worstTrade, pnlUsd);
    }

    STATE.trades.unshift(tradeRecord);
    if (STATE.trades.length > 200) STATE.trades = STATE.trades.slice(0, 200);

    delete STATE.positions[coinId];
    saveState();

    // ── Engine Logger: simpan data training untuk adaptive weights ────────────
    if (engineLogger && pos.signal) {
        try {
            engineLogger.logTradeResult(
                pos.signal,                    // signal asli (berisi subScores, bayesian, kelly)
                isWin ? 'win' : 'loss',
                pnlUsd,
                reason
            );

            // Trigger recompute adaptive weights setiap 5 trades
            if (adaptiveWeights && STATE.stats.totalTrades % 5 === 0) {
                adaptiveWeights.computeAndSave();
                log(`🧠 Adaptive weights updated (${STATE.stats.totalTrades} trades)`, 'SYSTEM');
            }
        } catch (e) {
            log(`Engine logger error: ${e.message}`, 'WARN');
        }
    }

    const icon = isWin ? '✅ WIN' : '🔴 LOSS';
    log(`${icon} | ${pos.coinSymbol.toUpperCase()} | Entry: $${pos.entryPrice} → Exit: $${currentPrice} | PnL: $${pnlUsd.toFixed(2)} (${pnlPct}%) | Alasan: ${reason}`,
        isWin ? 'WIN' : 'LOSS');

    return tradeRecord;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ORDER EXECUTOR
// ═══════════════════════════════════════════════════════════════════════════════
async function executeEntry(signal) {
    const instId = buildInstId(signal.coinSymbol);

    // Ambil harga live
    let currentPrice;
    try {
        const tick = await api.ticker(instId);
        currentPrice = parseFloat(tick?.data?.[0]?.last);
        if (!currentPrice || isNaN(currentPrice)) throw new Error('Harga tidak valid');
    } catch (e) {
        log(`Gagal ambil harga ${instId}: ${e.message}`, 'WARN');
        return null;
    }

    // Verifikasi harga masih dalam range entry (toleransi 2% agar tidak miss saat volatil)
    const ENTRY_TOLERANCE = 0.02;
    const inRange = currentPrice >= signal.entryLow  * (1 - ENTRY_TOLERANCE)
                 && currentPrice <= signal.entryHigh * (1 + ENTRY_TOLERANCE);
    if (!inRange) {
        log(`${signal.coinSymbol.toUpperCase()} harga $${currentPrice} di luar entry range [$${signal.entryLow}–$${signal.entryHigh}]`, 'WARN');
        return null;
    }

    // Hitung position size — gunakan Kelly fraction dari signal jika tersedia
    const sizeUsd = riskManager.calcPositionSize(
        STATE.totalEquity, currentPrice, signal.stopLoss,
        signal.kellyFraction ?? null   // null → fallback ke fixed RISK_PER_TRADE_PCT
    );
    if (!sizeUsd || sizeUsd < 5) {
        log(`Position size terlalu kecil: $${sizeUsd?.toFixed(2) || 0}`, 'WARN');
        return null;
    }

    const qty    = sizeUsd / currentPrice;
    const side   = signal.signal === 'LONG' ? 'buy' : 'sell';
    const sz     = qty.toFixed(6);
    const kellyInfo = signal.kellyFraction ? ` Kelly=${(signal.kellyFraction*100).toFixed(2)}% EV=${signal.expectedValue}` : '';

    log(`📋 ORDER | ${side.toUpperCase()} ${instId} | Qty: ${sz} | Size: $${sizeUsd.toFixed(2)} | Entry: $${currentPrice} | SL: $${signal.stopLoss} | TP1: $${signal.tp1}${kellyInfo}`, 'TRADE');

    if (CONFIG.DRY_RUN) {
        // ── PAPER TRADE ──
        log(`[DRY RUN] Order tidak dikirim ke OKX (paper mode aktif)`, 'SYSTEM');
        const pos = openPosition(signal, currentPrice, qty, sizeUsd, 'DRY-RUN-' + Date.now());
        log(`[DRY RUN] Posisi dibuka: ${pos.coinSymbol.toUpperCase()} ${pos.side.toUpperCase()} $${sizeUsd.toFixed(2)}`, 'TRADE');
        return pos;
    }

    // ── LIVE TRADE ──
    try {
        const resp = await api.placeOrder({ instId, tdMode: 'cash', side, ordType: 'market', sz });
        if (resp.code !== '0') {
            log(`OKX order error: ${resp.msg || resp.data?.[0]?.sMsg}`, 'ERROR');
            return null;
        }
        const orderId = resp.data?.[0]?.ordId;
        log(`✅ Order diterima OKX | ordId: ${orderId}`, 'TRADE');
        const pos = openPosition(signal, currentPrice, qty, sizeUsd, orderId);
        return pos;
    } catch (e) {
        log(`Eksekusi gagal: ${e.message}`, 'ERROR');
        return null;
    }
}

async function executeClose(coinId, qty, reason) {
    const pos = STATE.positions[coinId];
    if (!pos) return;

    // Ambil harga live
    let currentPrice;
    try {
        const tick = await api.ticker(pos.instId);
        currentPrice = parseFloat(tick?.data?.[0]?.last);
        if (!currentPrice) throw new Error('no price');
    } catch (e) {
        log(`Gagal ambil harga ${pos.instId} untuk close: ${e.message}`, 'WARN');
        return;
    }

    const closeSide = pos.side === 'buy' ? 'sell' : 'buy';
    const sz        = qty.toFixed(6);

    if (CONFIG.DRY_RUN) {
        log(`[DRY RUN] CLOSE ${pos.coinSymbol.toUpperCase()} | ${closeSide.toUpperCase()} ${sz} @ $${currentPrice} | ${reason}`, 'TRADE');
        closePosition(coinId, currentPrice, reason);
        return;
    }

    try {
        const resp = await api.placeOrder({ instId: pos.instId, tdMode: 'cash', side: closeSide, ordType: 'market', sz });
        if (resp.code !== '0') {
            log(`Close order error: ${resp.msg}`, 'ERROR');
            return;
        }
        log(`✅ Close order dikirim | ordId: ${resp.data?.[0]?.ordId}`, 'TRADE');
        closePosition(coinId, currentPrice, reason);
    } catch (e) {
        log(`Close gagal: ${e.message}`, 'ERROR');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  POSITION MONITOR — Cek SL / Partial TP / Trailing Stop
// ═══════════════════════════════════════════════════════════════════════════════
async function monitorPositions() {
    const coinIds = Object.keys(STATE.positions);
    if (!coinIds.length) return;

    for (const coinId of coinIds) {
        const pos = STATE.positions[coinId];
        if (!pos) continue;

        let currentPrice;
        try {
            const tick = await api.ticker(pos.instId);
            currentPrice = parseFloat(tick?.data?.[0]?.last);
            if (!currentPrice) continue;
        } catch { continue; }

        const isLong    = pos.side === 'buy';
        const pnlPct    = isLong
            ? (currentPrice - pos.entryPrice) / pos.entryPrice * 100
            : (pos.entryPrice - currentPrice) / pos.entryPrice * 100;

        // Update trailing stop
        if (pnlPct >= CONFIG.TRAIL_ACTIVATE_PCT) {
            const newTrailSL = isLong
                ? currentPrice * (1 - CONFIG.TRAIL_DISTANCE_PCT / 100)
                : currentPrice * (1 + CONFIG.TRAIL_DISTANCE_PCT / 100);

            if (!pos.trailActive) {
                pos.trailActive = true;
                pos.trailSL     = newTrailSL;
                log(`🔔 Trailing stop aktif | ${pos.coinSymbol.toUpperCase()} | Trail SL: $${newTrailSL.toFixed(6)}`, 'INFO');
            } else if (isLong && newTrailSL > pos.trailSL) {
                pos.trailSL = newTrailSL;
            } else if (!isLong && newTrailSL < pos.trailSL) {
                pos.trailSL = newTrailSL;
            }
            // Gunakan trail SL sebagai effective SL
            pos.stopLoss = pos.trailSL;
        }

        // ── Cek STOP LOSS ──────────────────────────────────────────────
        const slHit = isLong ? currentPrice <= pos.stopLoss : currentPrice >= pos.stopLoss;
        if (slHit) {
            log(`🛑 STOP LOSS | ${pos.coinSymbol.toUpperCase()} @ $${currentPrice} (SL: $${pos.stopLoss})`, 'WARN');
            await executeClose(coinId, pos.qtyRemaining, pos.trailActive ? 'Trailing SL hit' : 'Stop Loss hit');
            continue;
        }

        // ── Cek TAKE PROFIT 1 ──────────────────────────────────────────
        if (!pos.tp1Hit && pos.tp1) {
            const tp1Hit = isLong ? currentPrice >= pos.tp1 : currentPrice <= pos.tp1;
            if (tp1Hit) {
                const closeQty = pos.qtyRemaining * (CONFIG.TP1_CLOSE_PCT / 100);
                log(`🎯 TP1 HIT | ${pos.coinSymbol.toUpperCase()} @ $${currentPrice} — Tutup ${CONFIG.TP1_CLOSE_PCT}%`, 'WIN');
                if (CONFIG.DRY_RUN) {
                    const pnl = isLong
                        ? (currentPrice - pos.entryPrice) * closeQty
                        : (pos.entryPrice - currentPrice) * closeQty;
                    STATE.stats.totalPnlUsd += pnl;
                    STATE.dailyPnl           += pnl;
                    STATE.totalEquity        += pnl;
                    pos.qtyRemaining -= closeQty;
                    pos.tp1Hit        = true;
                    // Geser SL ke break-even setelah TP1
                    pos.stopLoss = pos.entryPrice * (isLong ? 1.001 : 0.999);
                    log(`[DRY RUN] TP1 partial close $${pnl.toFixed(2)} | SL geser ke breakeven`, 'WIN');
                } else {
                    await api.placeOrder({
                        instId  : pos.instId,
                        tdMode  : 'cash',
                        side    : isLong ? 'sell' : 'buy',
                        ordType : 'market',
                        sz      : closeQty.toFixed(6),
                    });
                    pos.qtyRemaining -= closeQty;
                    pos.tp1Hit        = true;
                    pos.stopLoss      = pos.entryPrice * (isLong ? 1.001 : 0.999);
                }
                saveState();
            }
        }

        // ── Cek TAKE PROFIT 2 ──────────────────────────────────────────
        if (pos.tp1Hit && !pos.tp2Hit && pos.tp2) {
            const tp2Hit = isLong ? currentPrice >= pos.tp2 : currentPrice <= pos.tp2;
            if (tp2Hit) {
                const closeQty = pos.qtyRemaining * (CONFIG.TP2_CLOSE_PCT / (100 - CONFIG.TP1_CLOSE_PCT) * 100 / 100);
                log(`🎯 TP2 HIT | ${pos.coinSymbol.toUpperCase()} @ $${currentPrice} — Tutup ${CONFIG.TP2_CLOSE_PCT}%`, 'WIN');
                if (CONFIG.DRY_RUN) {
                    const pnl = isLong
                        ? (currentPrice - pos.entryPrice) * closeQty
                        : (pos.entryPrice - currentPrice) * closeQty;
                    STATE.stats.totalPnlUsd += pnl;
                    STATE.dailyPnl           += pnl;
                    STATE.totalEquity        += pnl;
                    pos.qtyRemaining -= closeQty;
                    pos.tp2Hit        = true;
                    log(`[DRY RUN] TP2 partial close $${pnl.toFixed(2)}`, 'WIN');
                } else {
                    await api.placeOrder({
                        instId : pos.instId, tdMode: 'cash',
                        side   : isLong ? 'sell' : 'buy',
                        ordType: 'market', sz: closeQty.toFixed(6),
                    });
                    pos.qtyRemaining -= closeQty;
                    pos.tp2Hit        = true;
                }
                saveState();
            }
        }

        // ── Cek TAKE PROFIT 3 (full close) ────────────────────────────
        if (pos.tp1Hit && pos.tp2Hit && pos.tp3) {
            const tp3Hit = isLong ? currentPrice >= pos.tp3 : currentPrice <= pos.tp3;
            if (tp3Hit) {
                log(`🎯 TP3 HIT | ${pos.coinSymbol.toUpperCase()} @ $${currentPrice} — Full close`, 'WIN');
                await executeClose(coinId, pos.qtyRemaining, 'TP3 hit — full close');
                continue;
            }
        }

        // Update unrealized PnL
        pos.pnlUsd = isLong
            ? (currentPrice - pos.entryPrice) * pos.qtyRemaining
            : (pos.entryPrice - currentPrice) * pos.qtyRemaining;
        pos.currentPrice = currentPrice;
    }

    saveState();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SIGNAL READER
// ═══════════════════════════════════════════════════════════════════════════════
function readNewSignals() {
    try {
        if (!fs.existsSync(CONFIG.SIGNALS_FILE)) return [];
        const all = JSON.parse(fs.readFileSync(CONFIG.SIGNALS_FILE, 'utf8'));
        if (!Array.isArray(all)) return [];

        // Buat ID unik untuk setiap sinyal
        return all.map(s => ({
            ...s,
            _id: `${s.coinId}_${s.signal}_${s.timestamp}`
        })).filter(s => !STATE.processedSignals.has(s._id));
    } catch (e) {
        log(`Gagal baca signals.json: ${e.message}`, 'WARN');
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN SCAN LOOP — Proses sinyal baru
// ═══════════════════════════════════════════════════════════════════════════════
async function processSignals() {
    const newSignals = readNewSignals();
    if (!newSignals.length) return;

    log(`📡 ${newSignals.length} sinyal baru ditemukan`, 'INFO');

    for (const signal of newSignals) {
        STATE.processedSignals.add(signal._id);

        // 1. Validasi kualitas sinyal
        const quality = riskManager.validateSignal(signal);
        if (!quality.ok) {
            log(`SKIP ${signal.coinSymbol?.toUpperCase()} (${signal.signal}): ${quality.reason}`, 'INFO');
            continue;
        }

        // 2. Cek apakah boleh trade
        const canTrade = riskManager.canTrade(signal);
        if (!canTrade.ok) {
            log(`BLOCKED: ${canTrade.reason}`, 'WARN');
            continue;
        }

        // 3. Eksekusi entry
        log(`🚀 ENTRY | ${signal.coinSymbol?.toUpperCase()} ${signal.signal} | Bullish: ${signal.bullish}% | Conf: ${signal.confidence}% | R:R: 1:${signal.rr}`, 'TRADE');
        await executeEntry(signal);

        // Delay antar order
        await sleep(1000);
    }

    saveState();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EQUITY UPDATER
// ═══════════════════════════════════════════════════════════════════════════════
async function updateEquity() {
    try {
        const bal = await api.balance();
        if (bal.code !== '0') return;
        const usdtEquity = parseFloat(
            bal.data?.[0]?.details?.find(d => d.ccy === 'USDT')?.eqUsd || 0
        );
        const totalEq = parseFloat(bal.data?.[0]?.totalEq || usdtEquity);
        if (totalEq > 0) {
            STATE.totalEquity = totalEq;
            if (totalEq > STATE.peakEquity) STATE.peakEquity = totalEq;
        }
    } catch (e) {
        if (CONFIG.DRY_RUN && STATE.totalEquity === 0) {
            // Dry run tanpa proxy: gunakan equity dummy $1000
            STATE.totalEquity      = 1000;
            STATE.peakEquity       = 1000;
            STATE.dailyStartEquity = 1000;
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STATUS PRINTER
// ═══════════════════════════════════════════════════════════════════════════════
function printStatus() {
    const openPos   = Object.values(STATE.positions);
    const drawdown  = STATE.peakEquity > 0 ? ((STATE.peakEquity - STATE.totalEquity) / STATE.peakEquity * 100) : 0;
    const winRate   = STATE.stats.totalTrades > 0 ? (STATE.stats.wins / STATE.stats.totalTrades * 100).toFixed(1) : '—';
    const mode      = STATE.dryRun ? '📋 DRY RUN' : '🔴 LIVE';

    console.log('\n' + '─'.repeat(60));
    console.log(`  ${mode} | Equity: $${STATE.totalEquity.toFixed(2)} | Peak: $${STATE.peakEquity.toFixed(2)}`);
    console.log(`  Daily P&L: $${STATE.dailyPnl.toFixed(2)} | Total P&L: $${STATE.stats.totalPnlUsd.toFixed(2)}`);
    console.log(`  Drawdown: ${drawdown.toFixed(2)}% | Win Rate: ${winRate}% (${STATE.stats.wins}W/${STATE.stats.losses}L)`);
    console.log(`  Posisi terbuka: ${openPos.length}/${CONFIG.MAX_OPEN_POSITIONS}`);
    if (openPos.length) {
        openPos.forEach(p => {
            const pnlSign = p.pnlUsd >= 0 ? '+' : '';
            console.log(`    📌 ${p.coinSymbol.toUpperCase()} ${p.side.toUpperCase()} | Entry: $${p.entryPrice.toFixed(6)} | Now: $${(p.currentPrice || p.entryPrice).toFixed(6)} | P&L: ${pnlSign}$${(p.pnlUsd || 0).toFixed(2)} | SL: $${p.stopLoss.toFixed(6)}${p.trailActive ? ' 🔄' : ''}`);
        });
    }
    if (STATE.circuitBreaker) console.log(`  ⚠️  CIRCUIT BREAKER AKTIF — trading dihentikan`);
    console.log('─'.repeat(60) + '\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HTTP STATUS SERVER — Sajikan state ke dashboard UI
// ═══════════════════════════════════════════════════════════════════════════════
function startStatusServer() {
    const STATUS_PORT = 3002;
    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');

        if (req.method === 'GET' && req.url === '/trader/state') {
            const openPos = Object.values(STATE.positions);
            const drawdown = STATE.peakEquity > 0
                ? ((STATE.peakEquity - STATE.totalEquity) / STATE.peakEquity * 100) : 0;
            return res.end(JSON.stringify({
                running          : STATE.running,
                dryRun           : STATE.dryRun,
                circuitBreaker   : STATE.circuitBreaker,
                totalEquity      : STATE.totalEquity,
                peakEquity       : STATE.peakEquity,
                dailyPnl         : STATE.dailyPnl,
                totalPnl         : STATE.stats.totalPnlUsd,
                drawdownPct      : +drawdown.toFixed(2),
                consecutiveLoss  : STATE.consecutiveLoss,
                positions        : openPos,
                recentTrades     : STATE.trades.slice(0, 20),
                stats            : STATE.stats,
                config           : {
                    dryRun       : CONFIG.DRY_RUN,
                    riskPct      : CONFIG.RISK_PER_TRADE_PCT,
                    maxPositions : CONFIG.MAX_OPEN_POSITIONS,
                    maxDailyLoss : CONFIG.MAX_DAILY_LOSS_PCT,
                }
            }));
        }

        if (req.method === 'POST' && req.url === '/trader/reset-circuit') {
            STATE.circuitBreaker  = false;
            STATE.consecutiveLoss = 0;
            STATE.pauseUntil      = null;
            saveState();
            log('Circuit breaker direset manual', 'SYSTEM');
            return res.end(JSON.stringify({ ok: true }));
        }

        if (req.method === 'POST' && req.url === '/trader/close-all') {
            const coinIds = Object.keys(STATE.positions);
            Promise.all(coinIds.map(id => executeClose(id, STATE.positions[id]?.qtyRemaining || 0, 'Manual close-all')));
            return res.end(JSON.stringify({ ok: true, closed: coinIds.length }));
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(STATUS_PORT, '127.0.0.1', () => {
        log(`Status API berjalan di http://127.0.0.1:${STATUS_PORT}`, 'SYSTEM');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Reset daily PnL tiap tengah malam
function scheduleDailyReset() {
    const now       = new Date();
    const midnight  = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msToMidnight = midnight - now;
    setTimeout(() => {
        STATE.dailyStartEquity = STATE.totalEquity;
        STATE.dailyPnl         = 0;
        STATE.circuitBreaker   = false; // reset circuit breaker tiap hari
        saveState();
        log('Daily reset: PnL harian direset, circuit breaker dibuka', 'SYSTEM');
        scheduleDailyReset(); // jadwalkan lagi untuk besok
    }, msToMidnight);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('\n' + '═'.repeat(65));
    console.log('  🤖  Auto Trader v1 — Quant-Grade Automated Execution Engine');
    console.log(`  Mode    : ${CONFIG.DRY_RUN ? '📋 DRY RUN (paper trading)' : '🔴 LIVE TRADING'}`);
    console.log(`  Risk    : ${CONFIG.RISK_PER_TRADE_PCT}% per trade | Max ${CONFIG.MAX_OPEN_POSITIONS} posisi`);
    console.log(`  SL/TP   : Trailing stop + Partial TP (${CONFIG.TP1_CLOSE_PCT}/${CONFIG.TP2_CLOSE_PCT}/${CONFIG.TP3_CLOSE_PCT}%)`);
    console.log(`  Breaker : Daily loss >${CONFIG.MAX_DAILY_LOSS_PCT}% | Drawdown >${CONFIG.MAX_DRAWDOWN_PCT}% | ${CONFIG.MAX_CONSECUTIVE_LOSS} loss beruntun`);
    console.log('═'.repeat(65) + '\n');

    if (!CONFIG.DRY_RUN) {
        console.log('⚠️  PERINGATAN: Mode LIVE aktif! Order akan dikirim ke OKX!');
        console.log('   Tekan Ctrl+C dalam 5 detik untuk membatalkan...\n');
        await sleep(5000);
    }

    loadState();
    STATE.running = true;
    STATE.dryRun  = CONFIG.DRY_RUN;

    // Cek koneksi proxy (opsional — dry run bisa jalan tanpa proxy)
    try {
        await api.health();
        log('✅ Proxy server terkoneksi', 'SYSTEM');
        await updateEquity();
        // DRY RUN: jika equity 0 (belum ada wallet), set paper equity default
        if (STATE.totalEquity === 0 && CONFIG.DRY_RUN) {
            STATE.totalEquity      = CONFIG.PAPER_EQUITY;
            STATE.peakEquity       = CONFIG.PAPER_EQUITY;
            log(`[DRY RUN] Paper equity diset ke $${CONFIG.PAPER_EQUITY} (simulasi)`, 'SYSTEM');
        }
        if (STATE.dailyStartEquity === 0) STATE.dailyStartEquity = STATE.totalEquity;
        log(`Equity: $${STATE.totalEquity.toFixed(2)}`, 'SYSTEM');
        // Preload daftar coin yang tersedia di exchange
        await getAvailableCoins();
    } catch (e) {
        if (!CONFIG.DRY_RUN) {
            log('❌ Proxy server tidak bisa diakses! Jalankan: node hyperliquid-proxy.js', 'ERROR');
            process.exit(1);
        }
        log('Proxy tidak tersedia — berjalan dalam full DRY RUN tanpa data real', 'WARN');
        STATE.totalEquity      = CONFIG.PAPER_EQUITY;
        STATE.peakEquity       = CONFIG.PAPER_EQUITY;
        STATE.dailyStartEquity = CONFIG.PAPER_EQUITY;
    }

    // Mulai status server
    startStatusServer();

    // Daily reset scheduler
    scheduleDailyReset();

    // Loop 1: Cek sinyal baru tiap POLL_INTERVAL_MS
    async function signalLoop() {
        while (STATE.running) {
            try { await processSignals(); } catch (e) { log(`Signal loop error: ${e.message}`, 'ERROR'); }
            await sleep(CONFIG.POLL_INTERVAL_MS);
        }
    }

    // Loop 2: Monitor posisi terbuka tiap PRICE_CHECK_MS
    async function monitorLoop() {
        let tick = 0;
        while (STATE.running) {
            try {
                await monitorPositions();
                tick++;
                // Update equity tiap 5 menit (30 * 10s)
                if (tick % 30 === 0) {
                    await updateEquity();
                    printStatus();
                }
            } catch (e) { log(`Monitor loop error: ${e.message}`, 'ERROR'); }
            await sleep(CONFIG.PRICE_CHECK_MS);
        }
    }

    log('Auto Trader aktif. Ctrl+C untuk berhenti.', 'SYSTEM');
    printStatus();

    // Jalankan kedua loop secara paralel
    await Promise.all([signalLoop(), monitorLoop()]);
}

// Graceful shutdown
process.on('SIGINT', () => {
    log('Shutdown... Menyimpan state.', 'SYSTEM');
    STATE.running = false;
    saveState();
    printStatus();
    process.exit(0);
});

process.on('uncaughtException', e => {
    log(`Uncaught exception: ${e.message}`, 'ERROR');
    saveState();
});

main().catch(e => {
    log(`Fatal: ${e.message}`, 'ERROR');
    saveState();
    process.exit(1);
});
