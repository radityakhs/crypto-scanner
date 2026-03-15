#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Trade Journal — Laporan lengkap semua trade untuk referensi manual
//  Jalankan: node trade-journal.js
//  Opsi    : node trade-journal.js --open       → hanya posisi terbuka
//            node trade-journal.js --closed      → hanya closed trades
//            node trade-journal.js --today       → trades hari ini saja
//            node trade-journal.js --export      → export ke journal.csv
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const fs   = require('fs');
const path = require('path');

const STATE_FILE  = path.join(__dirname, 'auto-trader-state.json');
const CSV_FILE    = path.join(__dirname, 'trade-journal.csv');
const TZ          = 'Asia/Jakarta';

// ── Args ──────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const SHOW_OPEN   = args.includes('--open')   || args.length === 0;
const SHOW_CLOSED = args.includes('--closed') || args.length === 0;
const TODAY_ONLY  = args.includes('--today');
const EXPORT_CSV  = args.includes('--export');

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('id-ID', {
        timeZone: TZ,
        day     : '2-digit', month: '2-digit', year: 'numeric',
        hour    : '2-digit', minute: '2-digit',
    });
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('id-ID', {
        timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    });
}

function durFmt(openedAt, closedAt) {
    const ms  = new Date(closedAt || Date.now()).getTime() - new Date(openedAt).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 60)   return `${min}m`;
    if (min < 1440) return `${Math.floor(min/60)}h ${min%60}m`;
    return `${Math.floor(min/1440)}d ${Math.floor((min%1440)/60)}h`;
}

function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso).toLocaleDateString('id-ID', { timeZone: TZ });
    const t = new Date().toLocaleDateString('id-ID', { timeZone: TZ });
    return d === t;
}

function pnlStr(pnl) {
    if (pnl == null) return '—';
    return (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2);
}

function pnlIcon(pnl) {
    if (pnl == null) return '⬜';
    if (pnl > 0)     return '✅';
    if (pnl < 0)     return '🔴';
    return '⬜';
}

// ── Load State ────────────────────────────────────────────────────────────────
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) { console.error('Gagal load state:', e.message); }
    return null;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRINT OPEN POSITIONS
// ══════════════════════════════════════════════════════════════════════════════
function printOpenPositions(state) {
    const positions = Object.values(state.positions || {});
    if (positions.length === 0) {
        console.log('\n  Tidak ada posisi terbuka saat ini.\n');
        return;
    }

    const line = '═'.repeat(100);
    console.log(`\n╔${line}╗`);
    console.log(`║  📂  POSISI TERBUKA — ${positions.length} posisi aktif`);
    console.log(`╠${line}╣`);
    console.log(`║  ${'#'.padEnd(3)} ${'COIN'.padEnd(8)} ${'DIR'.padEnd(6)} ${'ENTRY DATE'.padEnd(20)} ${'ENTRY PRICE'.padEnd(14)} ${'SIZE'.padEnd(10)} ${'SL'.padEnd(12)} ${'TP1'.padEnd(12)} ${'TP2'.padEnd(12)} ${'DURASI'}`);
    console.log(`╠${line}╣`);

    positions.forEach((p, i) => {
        const dir   = p.side === 'buy' ? '🟢 LONG' : '🔴 SHORT';
        const dur   = durFmt(p.openedAt, null);
        console.log(`║  ${(i+1).toString().padEnd(3)} ${p.coinSymbol.toUpperCase().padEnd(8)} ${dir.padEnd(10)} ${fmtTime(p.openedAt).padEnd(20)} $${String(p.entryPrice).padEnd(13)} $${p.sizeUsd.toFixed(2).padEnd(9)} $${String(p.stopLoss || '—').padEnd(11)} $${String(p.tp1 || '—').padEnd(11)} $${String(p.tp2 || '—').padEnd(11)} ${dur}`);
        // Baris 2: info tambahan
        const conf  = p.confidence != null ? `Conf:${p.confidence}%` : '';
        const kelly = p.signal?.kellyFraction != null ? `Kelly:${(p.signal.kellyFraction*100).toFixed(1)}%` : '';
        const ev    = p.signal?.expectedValue != null ? `EV:${p.signal.expectedValue}` : '';
        const htf   = p.signal?.htfTrend ? `HTF:${p.signal.htfTrend}` : '';
        const rg    = p.signal?.marketRegime ? `Regime:${p.signal.marketRegime}` : '';
        console.log(`║       ${''.padEnd(8)} ${''.padEnd(10)} ${'Opened:'.padEnd(7)} ${fmtDate(p.openedAt).padEnd(12)} ${[conf, kelly, ev, htf, rg].filter(Boolean).join(' | ')}`);
    });

    // Total unrealized (estimasi — pakai entry price sebagai mark)
    const totalSize = positions.reduce((s, p) => s + p.sizeUsd, 0);
    console.log(`╠${line}╣`);
    console.log(`║  Total Size: $${totalSize.toFixed(2).padStart(8)}   (mark price tidak tersedia di state — gunakan harga pasar untuk hitung unrealized P&L)`);
    console.log(`╚${line}╝\n`);

    // Panduan manual
    console.log('  📋 PANDUAN MANUAL TRADING (ikuti posisi ini secara manual):');
    positions.forEach((p, i) => {
        const dir = p.side === 'buy' ? 'BELI (LONG)' : 'JUAL (SHORT)';
        console.log(`\n  ${i+1}. ${p.coinSymbol.toUpperCase()} — ${dir}`);
        console.log(`     ▶ Entry tanggal : ${fmtTime(p.openedAt)}`);
        console.log(`     ▶ Harga entry   : $${p.entryPrice}`);
        console.log(`     ▶ Stop Loss     : $${p.stopLoss || '—'}   ← keluar jika harga menyentuh ini`);
        console.log(`     ▶ Take Profit 1 : $${p.tp1 || '—'}   ← ambil 50% profit di sini`);
        console.log(`     ▶ Take Profit 2 : $${p.tp2 || '—'}   ← ambil 30% profit di sini`);
        console.log(`     ▶ Take Profit 3 : $${p.tp3 || '—'}   ← ambil 20% sisa di sini`);
        console.log(`     ▶ Modal         : $${p.sizeUsd.toFixed(2)}`);
        if (p.signal?.rr) console.log(`     ▶ R:R Ratio     : 1:${p.signal.rr}`);
        if (p.signal?.marketRegime) console.log(`     ▶ Market Regime : ${p.signal.marketRegime.toUpperCase()}`);
    });
    console.log('');
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRINT CLOSED TRADES
// ══════════════════════════════════════════════════════════════════════════════
function printClosedTrades(state, todayOnly = false) {
    let trades = state.trades || [];
    if (todayOnly) trades = trades.filter(t => isToday(t.closedAt));
    if (trades.length === 0) {
        console.log(todayOnly ? '\n  Belum ada trade yang close hari ini.\n' : '\n  Belum ada closed trades.\n');
        return;
    }

    const wins   = trades.filter(t => t.pnlUsd > 0);
    const losses = trades.filter(t => t.pnlUsd <= 0);
    const totalPnl  = trades.reduce((s, t) => s + (t.pnlUsd || 0), 0);
    const winRate   = trades.length > 0 ? (wins.length / trades.length * 100).toFixed(1) : '—';
    const avgWin    = wins.length   > 0 ? wins.reduce((s, t) => s + t.pnlUsd, 0) / wins.length : 0;
    const avgLoss   = losses.length > 0 ? losses.reduce((s, t) => s + t.pnlUsd, 0) / losses.length : 0;

    const label = todayOnly ? 'HARI INI' : `SEMUA (${trades.length} trades)`;
    const line  = '═'.repeat(110);
    console.log(`\n╔${line}╗`);
    console.log(`║  📊  CLOSED TRADES — ${label}`);
    console.log(`║  Win Rate: ${winRate}%  |  Total P&L: ${pnlStr(totalPnl)}  |  Avg Win: ${pnlStr(avgWin)}  |  Avg Loss: ${pnlStr(avgLoss)}`);
    console.log(`╠${line}╣`);
    console.log(`║  ${'#'.padEnd(3)} ${'COIN'.padEnd(8)} ${'DIR'.padEnd(8)} ${'ENTRY DATE'.padEnd(20)} ${'CLOSE DATE'.padEnd(20)} ${'ENTRY'.padEnd(12)} ${'EXIT'.padEnd(12)} ${'P&L'.padEnd(10)} ${'REASON'.padEnd(18)} ${'DUR'}`);
    console.log(`╠${line}╣`);

    trades.forEach((t, i) => {
        const dir    = t.side === 'buy' ? '🟢 LONG' : '🔴 SHORT';
        const pnl    = pnlStr(t.pnlUsd);
        const icon   = pnlIcon(t.pnlUsd);
        const dur    = durFmt(t.openedAt, t.closedAt);
        const reason = (t.reason || '').slice(0, 16);
        console.log(`║  ${icon} ${(i+1).toString().padEnd(2)} ${t.coinSymbol.toUpperCase().padEnd(8)} ${dir.padEnd(11)} ${fmtTime(t.openedAt).padEnd(20)} ${fmtTime(t.closedAt).padEnd(20)} $${String(t.entryPrice).padEnd(11)} $${String(t.exitPrice).padEnd(11)} ${pnl.padEnd(10)} ${reason.padEnd(18)} ${dur}`);
    });

    console.log(`╠${line}╣`);
    console.log(`║  SUMMARY: ${wins.length} WIN  ${losses.length} LOSS  |  Total P&L: ${pnlStr(totalPnl)}  |  Best: ${pnlStr(Math.max(...trades.map(t=>t.pnlUsd||0)))}  |  Worst: ${pnlStr(Math.min(...trades.map(t=>t.pnlUsd||0)))}`);
    console.log(`╚${line}╝\n`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRINT EQUITY SUMMARY
// ══════════════════════════════════════════════════════════════════════════════
function printEquitySummary(state) {
    const line = '═'.repeat(55);
    const dd   = state.peakEquity > 0
        ? ((state.peakEquity - state.totalEquity) / state.peakEquity * 100).toFixed(2)
        : '0.00';
    const wr   = state.stats.totalTrades > 0
        ? (state.stats.wins / state.stats.totalTrades * 100).toFixed(1)
        : '—';

    console.log(`\n╔${line}╗`);
    console.log(`║  💼  EQUITY & PERFORMANCE SUMMARY`);
    console.log(`╠${line}╣`);
    console.log(`║  Equity saat ini : $${state.totalEquity?.toFixed(2) || '—'}`);
    console.log(`║  Peak equity     : $${state.peakEquity?.toFixed(2) || '—'}`);
    console.log(`║  Total P&L       : ${pnlStr(state.totalPnl)}`);
    console.log(`║  Daily P&L       : ${pnlStr(state.dailyPnl)}`);
    console.log(`║  Drawdown        : ${dd}%`);
    console.log(`╠${line}╣`);
    console.log(`║  Total trades    : ${state.stats.totalTrades}`);
    console.log(`║  Win / Loss      : ${state.stats.wins} / ${state.stats.losses}`);
    console.log(`║  Win rate        : ${wr}%`);
    console.log(`║  Best trade      : ${pnlStr(state.stats.bestTrade)}`);
    console.log(`║  Worst trade     : ${pnlStr(state.stats.worstTrade)}`);
    console.log(`║  Circuit breaker : ${state.circuitBreaker ? '🔴 AKTIF' : '✅ OFF'}`);
    console.log(`╚${line}╝\n`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  EXPORT CSV
// ══════════════════════════════════════════════════════════════════════════════
function exportCSV(state) {
    const trades = state.trades || [];
    const open   = Object.values(state.positions || {});

    const rows = ['Status,Coin,Direction,Entry Date (WIB),Close Date (WIB),Entry Price,Exit Price,Size (USD),P&L (USD),Stop Loss,TP1,TP2,TP3,R:R,Reason,Duration,Confidence,Market Regime'];

    // Closed trades
    for (const t of trades) {
        rows.push([
            'CLOSED',
            t.coinSymbol?.toUpperCase(),
            t.side === 'buy' ? 'LONG' : 'SHORT',
            fmtTime(t.openedAt),
            fmtTime(t.closedAt),
            t.entryPrice,
            t.exitPrice,
            t.sizeUsd?.toFixed(2),
            t.pnlUsd?.toFixed(2),
            t.stopLoss || '',
            t.tp1 || '',
            t.tp2 || '',
            t.tp3 || '',
            t.rr || '',
            t.reason || '',
            durFmt(t.openedAt, t.closedAt),
            t.confidence || '',
            '',
        ].map(v => `"${v}"`).join(','));
    }

    // Open positions
    for (const p of open) {
        const sig = p.signal || {};
        rows.push([
            'OPEN',
            p.coinSymbol?.toUpperCase(),
            p.side === 'buy' ? 'LONG' : 'SHORT',
            fmtTime(p.openedAt),
            'MASIH OPEN',
            p.entryPrice,
            '',
            p.sizeUsd?.toFixed(2),
            '',
            p.stopLoss || '',
            p.tp1 || '',
            p.tp2 || '',
            p.tp3 || '',
            sig.rr || '',
            '',
            durFmt(p.openedAt, null),
            p.confidence || sig.confidence || '',
            sig.marketRegime || '',
        ].map(v => `"${v}"`).join(','));
    }

    fs.writeFileSync(CSV_FILE, rows.join('\n'), 'utf8');
    console.log(`\n✅ Export selesai → ${CSV_FILE}`);
    console.log(`   ${trades.length} closed trades + ${open.length} open positions\n`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
const state = loadState();
if (!state) {
    console.log('\n❌ File auto-trader-state.json tidak ditemukan.');
    console.log('   Pastikan auto-trader.js sudah pernah berjalan.\n');
    process.exit(1);
}

const now = new Date().toLocaleString('id-ID', { timeZone: TZ });
console.log(`\n  📅 Trade Journal — ${now} WIB`);
console.log(`  Mode: ${state.dryRun ? '📄 DRY RUN' : '🔴 LIVE TRADING'}\n`);

printEquitySummary(state);

if (SHOW_OPEN) printOpenPositions(state);

if (SHOW_CLOSED) {
    if (TODAY_ONLY) {
        printClosedTrades(state, true);
    } else {
        printClosedTrades(state, false);
    }
}

if (EXPORT_CSV) exportCSV(state);

if (!EXPORT_CSV) {
    console.log('  💡 Tips:');
    console.log('     node trade-journal.js --open     → lihat posisi terbuka saja');
    console.log('     node trade-journal.js --closed   → lihat semua closed trades');
    console.log('     node trade-journal.js --today    → trades hari ini saja');
    console.log('     node trade-journal.js --export   → export ke trade-journal.csv');
    console.log('');
}
