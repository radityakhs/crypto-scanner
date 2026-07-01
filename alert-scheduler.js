#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Alert Scheduler — Cron-based job scheduler untuk semua Telegram alerts
//  Digunakan oleh: auto-trader.js
//
//  Jobs:
//    00:00 WIB — Daily Summary → kirim ke Telegram + reset daily PnL
//    08:00 WIB — Morning Brief → ringkasan posisi & ekuitas
//    Tiap 1 jam — Heartbeat → cek apakah signal-bot masih aktif
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const cron = require('node-cron');
const fs   = require('fs');
const path = require('path');

const SIGNALS_FILE      = path.join(__dirname, 'signals.json');
const SIGNAL_MAX_AGE_MIN = 20; // alert jika signals.json tidak diupdate > 20 menit
const TZ                = 'Asia/Jakarta';

let _tg           = null;   // modul telegram-notify
let _getState     = null;   // () => STATE dari auto-trader.js
let _onDailyReset = null;   // callback reset daily PnL
let _tasks        = [];
let _started      = false;

// ── Logger internal ───────────────────────────────────────────────────────────
function log(msg) {
    const ts = new Date().toLocaleString('id-ID', { timeZone: TZ });
    console.log(`[${ts}] ⏰ [Scheduler] ${msg}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Inisialisasi scheduler — wajib dipanggil sebelum start()
 * @param {object}   tgModule      — require('./telegram-notify')
 * @param {Function} stateGetter   — () => STATE (live reference ke state auto-trader)
 * @param {Function} onDailyReset  — dipanggil setelah daily summary terkirim
 */
function init(tgModule, stateGetter, onDailyReset) {
    _tg           = tgModule;
    _getState     = stateGetter;
    _onDailyReset = onDailyReset;
}

/**
 * Mulai semua cron jobs
 */
function start() {
    if (_started) return;
    _started = true;

    const enabled = _tg?.isEnabled?.() ?? false;
    log(`Alert scheduler dimulai | Telegram: ${enabled ? '✅ AKTIF' : '⚠️  nonaktif (isi .env)'}`);

    // ── Job 1: Daily Summary + Reset — 00:00 WIB ─────────────────────────────
    _tasks.push(
        cron.schedule('0 0 * * *', async () => {
            const state = _getState?.();
            log('Daily reset — 00:00 WIB');
            if (_tg && state) {
                await _tg.notifyDailySummary(
                    state.stats, state.totalEquity, state.peakEquity
                ).catch(() => {});
            }
            if (typeof _onDailyReset === 'function') _onDailyReset();
        }, { timezone: TZ })
    );

    // ── Job 2: Morning Brief — 08:00 WIB ─────────────────────────────────────
    _tasks.push(
        cron.schedule('0 8 * * *', async () => {
            const state = _getState?.();
            if (!_tg || !state) return;
            log('Morning brief — 08:00 WIB');
            await sendMorningBrief(state).catch(() => {});
        }, { timezone: TZ })
    );

    // ── Job 3: Heartbeat + Signal-Bot Health Check — Tiap 1 Jam ──────────────
    _tasks.push(
        cron.schedule('0 * * * *', async () => {
            const state = _getState?.();
            await checkHeartbeat(state).catch(() => {});
        }, { timezone: TZ })
    );

    log('Jobs terdaftar:');
    log('  📅 00:00 WIB — Daily Summary + Reset');
    log('  ☀️  08:00 WIB — Morning Brief');
    log('  💓 Tiap 1 jam — Heartbeat + Signal-bot check');
}

/**
 * Hentikan semua cron jobs (dipanggil saat shutdown)
 */
function stop() {
    _tasks.forEach(t => t.stop());
    _tasks   = [];
    _started = false;
    log('Semua jobs dihentikan.');
}

// ══════════════════════════════════════════════════════════════════════════════
//  JOB HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Morning Brief — ringkasan lengkap posisi & statistik
 */
async function sendMorningBrief(state) {
    const openPos    = Object.values(state.positions || {});
    const drawdown   = state.peakEquity > 0
        ? ((state.peakEquity - state.totalEquity) / state.peakEquity * 100).toFixed(2)
        : '0.00';
    const winRate    = state.stats?.totalTrades > 0
        ? (state.stats.wins / state.stats.totalTrades * 100).toFixed(1)
        : '—';
    const mode       = state.dryRun ? '📋 DRY RUN' : '🔴 LIVE';
    const regime     = (state.marketRegime || 'unknown').toUpperCase();
    const dailyPnl   = state.dailyPnl || 0;
    const dailyStr   = `${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)}`;
    const cbLine     = state.circuitBreaker ? '\n⚠️ <b>CIRCUIT BREAKER AKTIF</b>' : '';

    const posList = openPos.length
        ? openPos.map(p => {
            const pnl     = p.pnlUsd || 0;
            const pnlSign = pnl >= 0 ? '+' : '';
            const trail   = p.trailActive ? ' 🔄' : '';
            return `  ${p.side === 'buy' ? '🟢' : '🔴'} <b>${p.coinSymbol.toUpperCase()}</b> ` +
                   `${p.side.toUpperCase()} | Entry: $${p.entryPrice.toFixed(4)} | ` +
                   `PnL: ${pnlSign}$${pnl.toFixed(2)}${trail}`;
          }).join('\n')
        : '  Tidak ada posisi terbuka';

    const today = new Date().toLocaleDateString('id-ID', {
        timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    const text = `
☀️ <b>MORNING BRIEF</b> — ${today}
──────────────────────
${mode} | Regime: <b>${regime}</b>
💵 Equity: <b>$${state.totalEquity.toFixed(2)}</b> | Peak: $${state.peakEquity.toFixed(2)}
📈 Daily PnL: <b>${dailyStr}</b>
📉 Drawdown: <b>${drawdown}%</b> | Win Rate: <b>${winRate}%</b>
📊 Total Trades: ${state.stats?.totalTrades || 0} (${state.stats?.wins || 0}W / ${state.stats?.losses || 0}L)
──────────────────────
📌 Posisi Aktif (${openPos.length}):
${posList}${cbLine}
🕐 08:00 WIB
`.trim();

    await _tg.sendMessage(text);
}

/**
 * Heartbeat — log ke console + alert Telegram jika signal-bot mati
 */
async function checkHeartbeat(state) {
    // Cek umur signals.json
    let signalAgeMin = null;
    try {
        const stat   = fs.statSync(SIGNALS_FILE);
        signalAgeMin = Math.round((Date.now() - stat.mtimeMs) / 60_000);
    } catch { /* signals.json belum dibuat */ }

    const cbStatus  = state?.circuitBreaker ? '⚠️ CB AKTIF' : '✅ Normal';
    const posCount  = Object.keys(state?.positions || {}).length;
    const equity    = state?.totalEquity?.toFixed(2) ?? '?';
    const signalStr = signalAgeMin !== null ? `${signalAgeMin}m lalu` : 'N/A';

    log(`💓 Heartbeat | Equity: $${equity} | Posisi: ${posCount} | CB: ${cbStatus} | signals.json: ${signalStr}`);

    // Alert ke Telegram hanya jika signal-bot tidak aktif > threshold
    if (_tg && signalAgeMin !== null && signalAgeMin > SIGNAL_MAX_AGE_MIN) {
        const text = `
⚠️ <b>SIGNAL BOT TIDAK AKTIF</b>
──────────────────────
signals.json tidak diupdate selama <b>${signalAgeMin} menit</b>
Bot mungkin crash atau belum dijalankan.
🔄 Jalankan: <code>node signal-bot.js</code>
🕐 ${new Date().toLocaleTimeString('id-ID', { timeZone: TZ })} WIB
`.trim();
        await _tg.sendMessage(text).catch(() => {});
    }
}

module.exports = { init, start, stop };
