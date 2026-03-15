#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Adaptive Weights Engine — Self-Learning Weight Optimizer
//  Digunakan oleh: signal-bot.js (baca weights tiap scan)
//  Input dari    : engine-stats.json (ditulis oleh engine-logger.js)
//
//  ALGORITMA:
//  1. Baca win rate per engine dari engine-stats.json
//  2. Hitung "performance score" per engine:
//       perfScore = winRate * 0.6 + correlation * 0.4
//  3. Normalisasi → bobot baru (jumlah = 1.0)
//  4. Smooth via Exponential Moving Average dengan default weights:
//       newWeight = alpha * adaptiveWeight + (1-alpha) * defaultWeight
//  5. Simpan ke adaptive-weights.json
//
//  SAFETY:
//  - Min data: 30 trades sebelum mulai adapt
//  - Min weight per engine: 0.02 (tidak boleh 0 total)
//  - Max weight per engine: 0.45 (tidak boleh mendominasi terlalu besar)
//  - Alpha decay: semakin banyak trade, semakin percaya adaptive weight
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const fs   = require('fs');
const path = require('path');
const { loadStats, ENGINE_NAMES } = require('./engine-logger');

const WEIGHTS_FILE = path.join(__dirname, 'adaptive-weights.json');

// ── Default weights (sama dengan signal-bot.js) ───────────────────────────────
const DEFAULT_WEIGHTS = {
    'Market Structure'  : 0.25,
    'BOS / CHoCH'       : 0.12,
    'Volume Profile'    : 0.15,
    'Order Flow (CVD)'  : 0.15,
    'Bid/Ask Imbalance' : 0.08,
    'Whale Activity'    : 0.10,
    'Volatility Phase'  : 0.05,
    'Monte Carlo GBM'   : 0.07,
    'Momentum 24h'      : 0.03,
};

const CONFIG = {
    MIN_TRADES_TO_ADAPT : 30,     // mulai adapt setelah 30 trades
    ALPHA_BASE          : 0.30,   // blend: 30% adaptive, 70% default (sedikit data)
    ALPHA_MAX           : 0.75,   // blend: 75% adaptive, 25% default (banyak data)
    ALPHA_FULL_TRADES   : 200,    // di 200 trades, pakai alpha max
    MIN_WEIGHT          : 0.02,   // minimum weight per engine
    MAX_WEIGHT          : 0.45,   // maximum weight per engine
    WIN_RATE_TARGET     : 50,     // baseline win rate (50% = random)
    UPDATE_EVERY_N      : 5,      // update weights setiap 5 trades baru
};

// ══════════════════════════════════════════════════════════════════════════════
//  LOAD / SAVE ADAPTIVE WEIGHTS
// ══════════════════════════════════════════════════════════════════════════════
function loadWeights() {
    try {
        if (fs.existsSync(WEIGHTS_FILE)) {
            return JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
        }
    } catch {}
    return null;
}

function saveWeights(data) {
    try {
        fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`[AdaptiveWeights] Gagal save: ${e.message}`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GET CURRENT WEIGHTS
//  Fungsi utama yang dipanggil signal-bot.js
//  Returns object { 'Market Structure': 0.27, 'BOS / CHoCH': 0.11, ... }
// ══════════════════════════════════════════════════════════════════════════════
function getCurrentWeights() {
    const saved = loadWeights();

    // Cek apakah weights masih fresh (< 1 jam)
    if (saved?.weights && saved?.updatedAt) {
        const ageMs = Date.now() - new Date(saved.updatedAt).getTime();
        if (ageMs < 60 * 60 * 1000) {
            return saved.weights; // pakai cache
        }
    }

    // Recompute
    return computeAndSave();
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMPUTE ADAPTIVE WEIGHTS
// ══════════════════════════════════════════════════════════════════════════════
function computeAndSave() {
    const stats = loadStats();

    if (!stats.trades || stats.trades.length < CONFIG.MIN_TRADES_TO_ADAPT) {
        // Belum cukup data → pakai default
        const result = {
            weights     : { ...DEFAULT_WEIGHTS },
            mode        : 'DEFAULT',
            totalTrades : stats.trades?.length || 0,
            minRequired : CONFIG.MIN_TRADES_TO_ADAPT,
            updatedAt   : new Date().toISOString(),
            message     : `Butuh ${CONFIG.MIN_TRADES_TO_ADAPT - (stats.trades?.length || 0)} trades lagi untuk adaptive mode`,
        };
        saveWeights(result);
        return result.weights;
    }

    const n     = stats.trades.length;
    const summary = stats.engineSummary;

    // Alpha: semakin banyak trade → semakin percaya adaptive weights
    const alpha = Math.min(
        CONFIG.ALPHA_BASE + (CONFIG.ALPHA_MAX - CONFIG.ALPHA_BASE) * (n / CONFIG.ALPHA_FULL_TRADES),
        CONFIG.ALPHA_MAX
    );

    // Hitung performance score per engine
    const rawScores = {};
    for (const engineName of ENGINE_NAMES) {
        const s = summary[engineName];
        if (!s || s.trades < 5) {
            rawScores[engineName] = DEFAULT_WEIGHTS[engineName] || 0.05;
            continue;
        }

        // Win rate contribution (0-1, 50% = neutral = 0.5)
        const winRateScore = (s.winRate || 50) / 100;

        // Correlation contribution (-1 to 1, normalize ke 0-1)
        const corrScore = ((s.correlation || 0) + 1) / 2;

        // Avg score saat win vs loss (reliability)
        let reliabilityScore = 0.5;
        if (s.avgScoreWin != null && s.avgScoreLoss != null) {
            // Semakin besar gap win vs loss score, semakin reliable engine ini
            const gap = Math.abs(s.avgScoreWin - s.avgScoreLoss);
            reliabilityScore = 0.5 + Math.min(gap / 100, 0.4);
        }

        // Combined performance score
        rawScores[engineName] = winRateScore * 0.50 + corrScore * 0.30 + reliabilityScore * 0.20;
    }

    // Normalisasi raw scores menjadi weights yang jumlahnya = 1
    const totalRaw = Object.values(rawScores).reduce((s, v) => s + v, 0);
    const normalizedWeights = {};
    for (const [k, v] of Object.entries(rawScores)) {
        normalizedWeights[k] = v / totalRaw;
    }

    // EMA blend: adaptive + default
    const blendedWeights = {};
    for (const engineName of ENGINE_NAMES) {
        const adaptive = normalizedWeights[engineName] || DEFAULT_WEIGHTS[engineName];
        const def      = DEFAULT_WEIGHTS[engineName];
        blendedWeights[engineName] = alpha * adaptive + (1 - alpha) * def;
    }

    // Clamp min/max
    for (const k of Object.keys(blendedWeights)) {
        blendedWeights[k] = Math.max(CONFIG.MIN_WEIGHT, Math.min(CONFIG.MAX_WEIGHT, blendedWeights[k]));
    }

    // Renormalize setelah clamp
    const totalBlend = Object.values(blendedWeights).reduce((s, v) => s + v, 0);
    const finalWeights = {};
    for (const [k, v] of Object.entries(blendedWeights)) {
        finalWeights[k] = +( v / totalBlend ).toFixed(4);
    }

    // Hitung delta vs default untuk logging
    const deltas = {};
    for (const k of ENGINE_NAMES) {
        deltas[k] = +((finalWeights[k] - DEFAULT_WEIGHTS[k]) * 100).toFixed(2);
    }

    const result = {
        weights        : finalWeights,
        mode           : 'ADAPTIVE',
        alpha          : +alpha.toFixed(3),
        totalTrades    : n,
        overallWinRate : stats.winRate,
        deltas,          // perubahan dari default (dalam poin %)
        updatedAt      : new Date().toISOString(),
        engineSummary  : summary,
    };

    saveWeights(result);
    return finalWeights;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRINT WEIGHT COMPARISON REPORT
// ══════════════════════════════════════════════════════════════════════════════
function printWeightReport() {
    const stats  = loadStats();
    const saved  = loadWeights();
    const weights = saved?.weights || DEFAULT_WEIGHTS;
    const mode    = saved?.mode || 'DEFAULT';

    const line = '═'.repeat(72);
    console.log(`\n╔${line}╗`);
    console.log(`║  ADAPTIVE WEIGHTS REPORT — Mode: ${mode}`);
    if (saved?.totalTrades != null) {
        console.log(`║  Trades: ${saved.totalTrades}  Alpha: ${saved.alpha || '—'}  Win Rate: ${saved.overallWinRate || '—'}%`);
    }
    if (saved?.message) console.log(`║  ⚠️  ${saved.message}`);
    console.log(`╠${line}╣`);
    console.log(`║  ${'ENGINE'.padEnd(22)} ${'DEFAULT'.padStart(9)} ${'CURRENT'.padStart(9)} ${'DELTA'.padStart(9)} ${'WIN%'.padStart(7)}`);
    console.log(`╠${line}╣`);

    for (const engineName of ENGINE_NAMES) {
        const def    = DEFAULT_WEIGHTS[engineName];
        const cur    = weights[engineName] || def;
        const delta  = +((cur - def) * 100).toFixed(2);
        const wr     = stats.engineSummary?.[engineName]?.winRate;
        const arrow  = delta > 0.5 ? '↑' : delta < -0.5 ? '↓' : '→';
        const wrStr  = wr != null ? `${wr}%` : '—';
        console.log(`║  ${engineName.padEnd(22)} ${(def*100).toFixed(1).padStart(8)}% ${(cur*100).toFixed(1).padStart(8)}% ${(delta >= 0 ? '+' : '') + delta}%${arrow.padStart(4)} ${wrStr.padStart(7)}`);
    }

    console.log(`╚${line}╝\n`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
module.exports = { getCurrentWeights, computeAndSave, loadWeights, DEFAULT_WEIGHTS, CONFIG };

// Jika dijalankan langsung
if (require.main === module) {
    computeAndSave();
    printWeightReport();
}
