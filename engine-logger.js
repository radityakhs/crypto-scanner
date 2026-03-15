#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Engine Logger — Per-Engine Trade Performance Tracker
//  Digunakan oleh: auto-trader.js (saat close trade)
//  Dibaca oleh   : adaptive-weights.js (untuk training)
//
//  Setiap trade yang close (win/loss) dicatat dengan:
//  - subScores dari 9 engine pada saat signal dibuat
//  - outcome: win/loss, PnL, direction LONG/SHORT
//  - Digunakan untuk menghitung win rate per engine
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const fs   = require('fs');
const path = require('path');

const STATS_FILE   = path.join(__dirname, 'engine-stats.json');
const MAX_RECORDS  = 1000;  // simpan 1000 trade terakhir

// Default engine list (urutan harus sama dengan signal-bot.js)
const ENGINE_NAMES = [
    'Market Structure',
    'BOS / CHoCH',
    'Volume Profile',
    'Order Flow (CVD)',
    'Bid/Ask Imbalance',
    'Whale Activity',
    'Volatility Phase',
    'Monte Carlo GBM',
    'Momentum 24h',
];

// ══════════════════════════════════════════════════════════════════════════════
//  LOAD / SAVE
// ══════════════════════════════════════════════════════════════════════════════
function loadStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        }
    } catch {}
    return { trades: [], engineSummary: {} };
}

function saveStats(data) {
    try {
        fs.writeFileSync(STATS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(`[EngineLogger] Gagal save: ${e.message}`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOG TRADE RESULT
//  Dipanggil dari auto-trader.js saat posisi ditutup
//
//  @param {Object} signal   — sinyal asli dari signal-bot (berisi subScores)
//  @param {string} outcome  — 'win' atau 'loss'
//  @param {number} pnl      — PnL dalam USD
//  @param {string} reason   — 'TP1'|'TP2'|'TP3'|'SL'|'MANUAL'
// ══════════════════════════════════════════════════════════════════════════════
function logTradeResult(signal, outcome, pnl, reason = 'UNKNOWN') {
    const stats = loadStats();

    // Buat record
    const record = {
        timestamp    : new Date().toISOString(),
        coinSymbol   : signal.coinSymbol,
        direction    : signal.signal,      // 'LONG' atau 'SHORT'
        outcome,                           // 'win' atau 'loss'
        pnl          : +pnl.toFixed(4),
        reason,                            // kenapa close
        rr           : signal.rr || 0,
        confidence   : signal.confidence || 0,
        bullish      : signal.bullish || 0,
        bearish      : signal.bearish || 0,
        bayesianPLong: signal.bayesianPLong || null,
        kellyFraction: signal.kellyFraction || null,
        expectedValue: signal.expectedValue || null,
        // Scores per engine saat signal dibuat
        engineScores : {},
    };

    // Simpan score tiap engine
    if (Array.isArray(signal.subScores)) {
        for (const { label, score, weight } of signal.subScores) {
            record.engineScores[label] = { score, weight };
        }
    }

    // Tambah ke array
    stats.trades.unshift(record);
    if (stats.trades.length > MAX_RECORDS) {
        stats.trades = stats.trades.slice(0, MAX_RECORDS);
    }

    // Update running summary per engine
    stats.engineSummary = computeEngineSummary(stats.trades);
    stats.lastUpdated   = new Date().toISOString();
    stats.totalTrades   = stats.trades.length;
    stats.winRate       = +(stats.trades.filter(t => t.outcome === 'win').length / stats.trades.length * 100).toFixed(1);

    saveStats(stats);
    return record;
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMPUTE ENGINE SUMMARY
//  Hitung win rate, avg score saat win vs loss, contribution score per engine
// ══════════════════════════════════════════════════════════════════════════════
function computeEngineSummary(trades) {
    const summary = {};

    for (const engineName of ENGINE_NAMES) {
        const withEngine = trades.filter(t => t.engineScores?.[engineName] != null);
        if (withEngine.length === 0) {
            summary[engineName] = { trades: 0, wins: 0, winRate: null, avgScoreWin: null, avgScoreLoss: null, correlation: null };
            continue;
        }

        const wins   = withEngine.filter(t => t.outcome === 'win');
        const losses = withEngine.filter(t => t.outcome === 'loss');

        const avgScoreWin  = wins.length   > 0 ? mean(wins.map(t   => t.engineScores[engineName].score)) : null;
        const avgScoreLoss = losses.length > 0 ? mean(losses.map(t => t.engineScores[engineName].score)) : null;

        // Correlation: seberapa kuat score engine ini berkorelasi dengan win
        // Sederhananya: untuk LONG trade, semakin tinggi score → win?
        const longTrades  = withEngine.filter(t => t.direction === 'LONG');
        const shortTrades = withEngine.filter(t => t.direction === 'SHORT');

        let correlation = 0;
        if (longTrades.length >= 5) {
            // Untuk LONG: score tinggi → bullish → win → correlation positif
            const scores  = longTrades.map(t => t.engineScores[engineName].score);
            const outcomes = longTrades.map(t => t.outcome === 'win' ? 1 : 0);
            correlation = pearsonCorrelation(scores, outcomes);
        } else if (shortTrades.length >= 5) {
            // Untuk SHORT: score rendah → bearish → win → correlation negatif (inverted)
            const scores   = shortTrades.map(t => t.engineScores[engineName].score);
            const outcomes = shortTrades.map(t => t.outcome === 'win' ? 1 : 0);
            correlation = -pearsonCorrelation(scores, outcomes); // invert untuk SHORT
        }

        summary[engineName] = {
            trades       : withEngine.length,
            wins         : wins.length,
            losses       : losses.length,
            winRate      : +(wins.length / withEngine.length * 100).toFixed(1),
            avgScoreWin  : avgScoreWin  != null ? +avgScoreWin.toFixed(1)  : null,
            avgScoreLoss : avgScoreLoss != null ? +avgScoreLoss.toFixed(1) : null,
            correlation  : +correlation.toFixed(3),
        };
    }

    return summary;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRINT REPORT
//  Untuk inspect manual: node engine-logger.js
// ══════════════════════════════════════════════════════════════════════════════
function printReport() {
    const stats = loadStats();

    if (!stats.trades || stats.trades.length === 0) {
        console.log('Belum ada data trade. Jalankan auto-trader.js sampai ada trade yang close.');
        return;
    }

    const line = '═'.repeat(70);
    console.log(`\n╔${line}╗`);
    console.log(`║  ENGINE PERFORMANCE REPORT`);
    console.log(`║  Total Trades: ${stats.trades.length}  |  Win Rate: ${stats.winRate}%  |  Updated: ${stats.lastUpdated}`);
    console.log(`╠${line}╣`);
    console.log(`║  ${'ENGINE'.padEnd(22)} ${'TRADES'.padStart(7)} ${'WIN%'.padStart(7)} ${'AVG WIN'.padStart(9)} ${'AVG LOSS'.padStart(9)} ${'CORR'.padStart(7)}`);
    console.log(`╠${line}╣`);

    for (const [name, s] of Object.entries(stats.engineSummary)) {
        if (s.trades === 0) {
            console.log(`║  ${name.padEnd(22)} ${'—'.padStart(7)} ${'—'.padStart(7)} ${'—'.padStart(9)} ${'—'.padStart(9)} ${'—'.padStart(7)}`);
            continue;
        }
        const wr   = s.winRate != null ? `${s.winRate}%` : '—';
        const aw   = s.avgScoreWin  != null ? s.avgScoreWin.toString()  : '—';
        const al   = s.avgScoreLoss != null ? s.avgScoreLoss.toString() : '—';
        const corr = s.correlation  != null ? s.correlation.toString()  : '—';
        console.log(`║  ${name.padEnd(22)} ${s.trades.toString().padStart(7)} ${wr.padStart(7)} ${aw.padStart(9)} ${al.padStart(9)} ${corr.padStart(7)}`);
    }

    console.log(`╚${line}╝\n`);

    // Recent trades
    console.log('Recent 10 trades:');
    for (const t of stats.trades.slice(0, 10)) {
        const icon = t.outcome === 'win' ? '✅' : '🔴';
        console.log(`  ${icon} ${t.direction.padEnd(5)} ${t.coinSymbol.toUpperCase().padEnd(8)} PnL:${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2).padStart(7)} Reason:${t.reason} [${t.timestamp.slice(0,16)}]`);
    }
    console.log('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  MATH HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function pearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
        const dxi = x[i] - mx, dyi = y[i] - my;
        num += dxi * dyi;
        dx2 += dxi * dxi;
        dy2 += dyi * dyi;
    }
    const denom = Math.sqrt(dx2 * dy2);
    return denom === 0 ? 0 : num / denom;
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ══════════════════════════════════════════════════════════════════════════════
module.exports = { logTradeResult, loadStats, computeEngineSummary, ENGINE_NAMES };

// Jika dijalankan langsung: tampilkan report
if (require.main === module) printReport();
