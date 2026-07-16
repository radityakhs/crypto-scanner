#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Telegram Notifikasi — Real-time alerts untuk signal & trade events
//  Digunakan oleh: signal-bot.js, auto-trader.js
//
//  Setup:
//   1. Buka @BotFather di Telegram → /newbot → copy token ke .env
//   2. Kirim /start ke bot kamu
//   3. Buka https://api.telegram.org/bot<TOKEN>/getUpdates → ambil chat_id
//   4. Isi TELEGRAM_BOT_TOKEN & TELEGRAM_CHAT_ID di .env
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_FILE = path.join(__dirname, 'telegram-config.json');
let fileConfig = {};
try {
    if (fs.existsSync(CONFIG_FILE)) fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (_) {}

function validEnv(value, placeholder) {
    return value && value.trim() && value.trim() !== placeholder;
}

const BOT_TOKEN = validEnv(process.env.TELEGRAM_BOT_TOKEN, 'GANTI_DENGAN_BOT_TOKEN')
    ? process.env.TELEGRAM_BOT_TOKEN.trim()
    : fileConfig.botToken;
const CHAT_ID = validEnv(process.env.TELEGRAM_CHAT_ID, 'GANTI_DENGAN_CHAT_ID')
    ? process.env.TELEGRAM_CHAT_ID.trim()
    : fileConfig.chatId;
const TOPIC_ID = validEnv(process.env.TELEGRAM_TOPIC_ID, 'GANTI_DENGAN_TOPIC_ID')
    ? process.env.TELEGRAM_TOPIC_ID.trim()
    : fileConfig.topicId;

// Topic khusus Wallet Tracker (berbeda dari signal/bot alerts)
const WALLET_TOPIC_ID = fileConfig.walletTopicId || TOPIC_ID;

const ENABLED = BOT_TOKEN
    && BOT_TOKEN !== 'GANTI_DENGAN_BOT_TOKEN'
    && CHAT_ID
    && CHAT_ID !== 'GANTI_DENGAN_CHAT_ID'
    && TOPIC_ID
    && Number.isFinite(Number(TOPIC_ID));

if (!ENABLED) {
    // Silent — tidak crash jika belum diisi
}

// ── Kirim pesan ke topic tertentu (internal helper) ───────────────────────────
function _send(text, topicId, parseMode = 'HTML') {
    if (!ENABLED) return Promise.resolve(null);
    return new Promise((resolve) => {
        const body = JSON.stringify({
            chat_id: CHAT_ID,
            ...(topicId ? { message_thread_id: Number(topicId) } : {}),
            text,
            parse_mode: parseMode,
            disable_web_page_preview: true,
        });
        const opts = {
            hostname: 'api.telegram.org',
            path    : `/bot${BOT_TOKEN}/sendMessage`,
            method  : 'POST',
            headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        };
        const req = https.request(opts, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); } catch { resolve(null); }
            });
        });
        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => { req.destroy(); resolve(null); });
        req.write(body);
        req.end();
    });
}

// ── Kirim pesan ke topic signal/bot (topic 2) ─────────────────────────────────
function sendMessage(text, parseMode = 'HTML') {
    return _send(text, TOPIC_ID, parseMode);
}

// ── Kirim pesan ke topic wallet tracker (topic 294) ───────────────────────────
function sendWalletMessage(text, parseMode = 'HTML') {
    return _send(text, WALLET_TOPIC_ID, parseMode);
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmt(v, decimals = 4) {
    if (v == null) return '—';
    if (v > 1000)  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    return '$' + (+v).toFixed(decimals);
}

function fmtPct(v) { return v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`; }

// ── Notifikasi: Sinyal Baru ───────────────────────────────────────────────────
async function notifySignal(entry) {
    if (!ENABLED) return;
    const icon   = entry.signal === 'LONG' ? '🟢' : '🔴';
    const regime = entry.marketRegime ? entry.marketRegime.toUpperCase() : '?';
    const rsi    = entry.rsi    != null ? `RSI: <b>${entry.rsi.toFixed(1)}</b>` : '';
    const macd   = entry.macdCrossover && entry.macdCrossover !== 'none' ? `MACD: <b>${entry.macdCrossover}</b>` : '';
    const tech   = entry.techConfirmed ? '✅ Tech OK' : '⚠️ Tech Weak';
    const div    = entry.rsiDivergence && entry.rsiDivergence !== 'none'
        ? `\n🔀 <i>${entry.rsiDivergence.replace('_', ' ')}</i>` : '';
    const techLine = [rsi, macd, tech].filter(Boolean).join(' | ');
    const ts = new Date(entry.timestamp).toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

    const text = `
${icon} <b>SIGNAL ${entry.signal}</b> — <b>${entry.coinSymbol.toUpperCase()}</b> (${entry.coinName})
──────────────────────
💰 Harga: <b>${fmt(entry.currentPrice)}</b>
📊 Bullish: <b>${entry.bullish}%</b> | Bearish: <b>${entry.bearish}%</b>
🎯 Confidence: <b>${entry.confidence}%</b>
🌍 Regime: <b>${regime}</b> (score: ${entry.regimeScore})

📐 SL: ${fmt(entry.stopLoss)} | TP1: ${fmt(entry.tp1)}
📐 TP2: ${fmt(entry.tp2)} | TP3: ${fmt(entry.tp3)}
📐 R:R: <b>1:${entry.rr}</b> | Kelly: <b>${((entry.kellyFraction || 0) * 100).toFixed(2)}%</b>
${techLine ? `\n📈 ${techLine}` : ''}${div}
${entry.qualityReason ? `🔎 ${entry.qualityReason}\n` : ''}
📝 ${entry.signalReason}
🕐 ${ts} WIB
`.trim();

    await sendMessage(text);
}

// ── Notifikasi: Entry Trade ───────────────────────────────────────────────────
async function notifyEntry(pos, sizeUsd) {
    if (!ENABLED) return;
    const icon = pos.side === 'buy' ? '🚀' : '📉';
    const mode = pos.coinSymbol === 'DRY-RUN' ? '📋 DRY RUN' : '🔴 LIVE';
    const text = `
${icon} <b>ENTRY ${pos.side.toUpperCase()}</b> — <b>${pos.coinSymbol.toUpperCase()}</b>
──────────────────────
${mode}
💰 Entry: <b>${fmt(pos.entryPrice)}</b>
💵 Size: <b>$${sizeUsd.toFixed(2)}</b>
🛑 SL: ${fmt(pos.stopLoss)}
🎯 TP1: ${fmt(pos.tp1)} | TP2: ${fmt(pos.tp2)}
🕐 ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
`.trim();
    await sendMessage(text);
}

// ── Notifikasi: Close / TP / SL ───────────────────────────────────────────────
async function notifyClose(pos, exitPrice, reason, pnlUsd) {
    if (!ENABLED) return;
    const isWin = pnlUsd >= 0;
    const icon  = isWin ? '✅' : '🔴';
    const pnlStr = isWin ? `+$${pnlUsd.toFixed(2)}` : `-$${Math.abs(pnlUsd).toFixed(2)}`;
    const pnlPct = pos.sizeUsd > 0 ? fmtPct(pnlUsd / pos.sizeUsd * 100) : '';
    const text = `
${icon} <b>CLOSE ${isWin ? 'WIN' : 'LOSS'}</b> — <b>${pos.coinSymbol.toUpperCase()}</b>
──────────────────────
📌 Alasan: <b>${reason}</b>
💰 Entry: ${fmt(pos.entryPrice)} → Exit: ${fmt(exitPrice)}
💵 PnL: <b>${pnlStr}</b> (${pnlPct})
🕐 ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
`.trim();
    await sendMessage(text);
}

// ── Notifikasi: Circuit Breaker ───────────────────────────────────────────────
async function notifyCircuitBreaker(reason, equity, drawdownPct) {
    if (!ENABLED) return;
    const text = `
⚠️ <b>CIRCUIT BREAKER AKTIF</b>
──────────────────────
🛑 Alasan: <b>${reason}</b>
💵 Equity: $${equity.toFixed(2)}
📉 Drawdown: <b>${drawdownPct.toFixed(2)}%</b>
🚫 Trading dihentikan otomatis.
🔄 Reset manual: POST /trader/reset-circuit
🕐 ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
`.trim();
    await sendMessage(text);
}

// ── Notifikasi: TP Hit (Partial) ──────────────────────────────────────────────
async function notifyTPHit(pos, tpLevel, currentPrice, pnlUsd) {
    if (!ENABLED) return;
    const text = `
🎯 <b>${tpLevel} HIT</b> — <b>${pos.coinSymbol.toUpperCase()}</b>
──────────────────────
💰 Harga: <b>${fmt(currentPrice)}</b>
💵 Realized PnL: <b>+$${pnlUsd.toFixed(2)}</b>
📌 SL digeser ke breakeven
🕐 ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB
`.trim();
    await sendMessage(text);
}

// ── Notifikasi: Trailing Stop Update ──────────────────────────────────────────
async function notifyTrailActivated(pos, trailSL, tier) {
    if (!ENABLED) return;
    const text = `🔔 <b>Trailing Stop Aktif</b> — ${pos.coinSymbol.toUpperCase()} | Tier: ${tier} | SL → ${fmt(trailSL)}`;
    await sendMessage(text);
}

// ── Notifikasi: Daily Summary ─────────────────────────────────────────────────
async function notifyDailySummary(stats, equity, peakEquity) {
    if (!ENABLED) return;
    const drawdown = peakEquity > 0 ? ((peakEquity - equity) / peakEquity * 100) : 0;
    const winRate  = stats.totalTrades > 0 ? (stats.wins / stats.totalTrades * 100).toFixed(1) : '—';
    const text = `
📊 <b>DAILY SUMMARY</b>
──────────────────────
💵 Equity: <b>$${equity.toFixed(2)}</b> (Peak: $${peakEquity.toFixed(2)})
📈 Total PnL: <b>${stats.totalPnlUsd >= 0 ? '+' : ''}$${stats.totalPnlUsd.toFixed(2)}</b>
📉 Drawdown: <b>${drawdown.toFixed(2)}%</b>
🏆 Win Rate: <b>${winRate}%</b> (${stats.wins}W / ${stats.losses}L dari ${stats.totalTrades} trades)
🕐 ${new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' })}
`.trim();
    await sendMessage(text);
}

// ── Status check ──────────────────────────────────────────────────────────────
function isEnabled() { return ENABLED; }

// ── Notifikasi: Wallet Tracker Alert (ke topic 294) ───────────────────────────
async function notifyWalletAlert(text) {
    if (!ENABLED) return;
    await sendWalletMessage(text);
}

module.exports = {
    sendMessage,
    sendWalletMessage,
    notifySignal,
    notifyEntry,
    notifyClose,
    notifyCircuitBreaker,
    notifyTPHit,
    notifyTrailActivated,
    notifyDailySummary,
    notifyWalletAlert,
    isEnabled,
    TOPIC_ID,
    WALLET_TOPIC_ID,
};
