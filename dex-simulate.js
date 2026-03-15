#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  dex-simulate.js — LIVE PAPER TRADING SIMULATOR
//
//  Cara kerja:
//  1. Ambil data REAL dari DEXScreener (live market)
//  2. Jalankan algoritma scoring + rug filter secara otomatis
//  3. "Beli" di atas kertas (paper trade) ketika sinyal BUY muncul
//  4. Pantau harga setiap 10 detik, trigger TP/SL secara otomatis
//  5. Tampilkan dashboard real-time di terminal
//  6. Simpan semua trade ke dex-sim-results.json
//
//  ⚠️  INI ADALAH SIMULASI — tidak ada uang nyata yang digunakan
//
//  Jalankan: node dex-simulate.js
//            node dex-simulate.js --capital 100    (modal simulasi $100)
//            node dex-simulate.js --fast            (scan tiap 10 detik)
//            node dex-simulate.js --report          (lihat laporan terakhir)
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');
const dex   = require('./dex-screener-api');
const mh    = require('./memecoin-hunter');

const ARGS       = process.argv.slice(2);
const getArg     = (f, d) => { const i = ARGS.indexOf(f); return i !== -1 && ARGS[i+1] ? ARGS[i+1] : d; };
const hasFlag    = f => ARGS.includes(f);

const CAPITAL    = parseFloat(getArg('--capital', '200'));   // modal simulasi
const FAST_MODE  = hasFlag('--fast');
const REPORT_ONLY= hasFlag('--report');
const SIM_FILE   = path.join(__dirname, 'dex-sim-results.json');
const LOG_FILE   = path.join(__dirname, 'dex-sim.log');

// ══════════════════════════════════════════════════════════════════════════════
//  SIMULATOR STATE (terpisah dari memecoin-hunter STATE)
// ══════════════════════════════════════════════════════════════════════════════
let SIM = {
    startCapital   : CAPITAL,
    capital        : CAPITAL,        // sisa modal
    positions      : {},             // pairAddress → simPosition
    closedTrades   : [],
    scannedSet     : new Set(),
    totalPnl       : 0,
    dailyPnl       : 0,
    dailyDate      : new Date().toDateString(),
    stats          : {
        totalTrades : 0,
        wins        : 0,
        losses      : 0,
        bestTrade   : 0,
        worstTrade  : 0,
        totalWinUsd : 0,
        totalLossUsd: 0,
        avgWin      : 0,
        avgLoss     : 0,
        byReason    : {},    // exit reason → { count, pnl }
    },
    scanCount      : 0,
    startedAt      : new Date().toISOString(),
    lastScanAt     : null,
    eventLog       : [],             // last 30 events
};

const SCAN_MS  = FAST_MODE ? 10000 : 20000;
const PRICE_MS = 10000;

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function simLog(msg, type) {
    const ts  = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const out = '[' + ts + '] ' + msg;
    // Terminal output
    const color = {
        BUY   : '\x1b[32m',  // green
        SELL  : '\x1b[33m',  // yellow
        WIN   : '\x1b[32m',
        LOSS  : '\x1b[31m',  // red
        INFO  : '\x1b[36m',  // cyan
        WARN  : '\x1b[33m',
        RESET : '\x1b[0m',
    };
    const c = color[type] || '';
    console.log(c + out + color.RESET);

    // File log
    try { fs.appendFileSync(LOG_FILE, out + '\n'); } catch {}

    // Event log (last 30)
    SIM.eventLog.unshift({ ts, msg, type: type || 'INFO' });
    if (SIM.eventLog.length > 30) SIM.eventLog.length = 30;
}

function saveSim() {
    const s = { ...SIM, scannedSet: [...SIM.scannedSet].slice(-300) };
    fs.writeFileSync(SIM_FILE, JSON.stringify(s, null, 2));
}

function loadSim() {
    try {
        if (fs.existsSync(SIM_FILE)) {
            const s = JSON.parse(fs.readFileSync(SIM_FILE, 'utf8'));
            // Hanya load jika sesi yang sama (hari ini)
            if (s.dailyDate === new Date().toDateString()) {
                SIM.positions    = s.positions    || {};
                SIM.closedTrades = s.closedTrades || [];
                SIM.totalPnl     = s.totalPnl     || 0;
                SIM.dailyPnl     = s.dailyPnl     || 0;
                SIM.capital      = s.capital      || CAPITAL;
                SIM.stats        = Object.assign({}, SIM.stats, s.stats || {});
                SIM.scannedSet   = new Set(s.scannedSet || []);
                SIM.scanCount    = s.scanCount    || 0;
                SIM.startedAt    = s.startedAt    || SIM.startedAt;
                simLog('📂 Loaded state: ' + Object.keys(SIM.positions).length + ' posisi, ' + SIM.stats.totalTrades + ' trades', 'INFO');
            }
        }
    } catch (e) { simLog('WARN loadSim: ' + e.message, 'WARN'); }
}

function _kfmt(n) {
    if (!n || isNaN(n)) return '0';
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n/1000).toFixed(1) + 'K';
    return String(Math.round(n));
}

function _pnl(n) {
    if (n == null || isNaN(n)) return '----';
    return (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2);
}

function _pct(n) {
    if (n == null || isNaN(n)) return '--';
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

function _fmtAge(ms) {
    const m = Math.floor(ms / 60000);
    if (m < 60) return m + 'min';
    return Math.floor(m/60) + 'h' + String(m%60).padStart(2,'0') + 'm';
}

function _bar(pct, width) {
    // Progress bar: █░
    width = width || 20;
    const filled = Math.round(Math.max(0, Math.min(1, pct/100)) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ══════════════════════════════════════════════════════════════════════════════
//  POSITION OPEN
// ══════════════════════════════════════════════════════════════════════════════
function simOpen(token, score, signals, meta, sizeUsd) {
    const pa = token.pairAddress;
    if (SIM.positions[pa]) return null;
    if (Object.keys(SIM.positions).length >= mh.CFG.MAX_POSITIONS) return null;
    if (SIM.capital < sizeUsd) {
        simLog('⚠️  Modal kurang ($' + SIM.capital.toFixed(2) + ' < $' + sizeUsd + ')', 'WARN');
        return null;
    }

    SIM.capital -= sizeUsd;

    const pos = {
        pairAddress   : pa,
        symbol        : token.baseSymbol,
        name          : token.baseName ? token.baseName.slice(0,25) : token.baseSymbol,
        baseMint      : token.baseMint,
        url           : token.url,
        entryPrice    : token.priceUsd,
        peakPrice     : token.priceUsd,
        currentPrice  : token.priceUsd,
        sizeUsd       : sizeUsd,
        remainPct     : 1.0,
        partialPnlUsd : 0,
        // Stop loss & TP
        stopLoss      : token.priceUsd * (1 - mh.CFG.INITIAL_SL_PCT / 100),
        tp1Price      : token.priceUsd * (1 + mh.CFG.TP1_PCT  / 100),
        tp2Price      : token.priceUsd * (1 + mh.CFG.TP2_PCT  / 100),
        tp3Price      : token.priceUsd * (1 + mh.CFG.TP3_PCT  / 100),
        tp4Price      : token.priceUsd * (1 + mh.CFG.TP4_PCT  / 100),
        trailingSl    : token.priceUsd * (1 - mh.CFG.TRAILING_SL_PCT / 100),
        tp1Hit: false, tp2Hit: false, tp3Hit: false, tp4Hit: false,
        score         : score,
        signals       : signals,
        meta          : meta,
        ageAtEntry    : token.ageHours,
        chg24hEntry   : token.chg24h,
        fdvEntry      : token.fdv,
        openedAt      : new Date().toISOString(),
        openedAtMs    : Date.now(),
        maxHoldMs     : mh.CFG.MAX_HOLD_HOURS * 3600000,
    };

    SIM.positions[pa] = pos;
    saveSim();
    return pos;
}

// ══════════════════════════════════════════════════════════════════════════════
//  POSITION CLOSE
// ══════════════════════════════════════════════════════════════════════════════
function simClose(pa, exitPrice, reason) {
    const pos = SIM.positions[pa];
    if (!pos) return null;

    const pnlPct = (exitPrice - pos.entryPrice) / pos.entryPrice * 100;
    const pnlUsd = (pos.sizeUsd * pos.remainPct * pnlPct / 100) + (pos.partialPnlUsd || 0);

    // Kembalikan modal + pnl
    SIM.capital += pos.sizeUsd * pos.remainPct + (pos.sizeUsd * pos.remainPct * pnlPct / 100);
    SIM.capital += pos.partialPnlUsd || 0;

    const closed = {
        symbol      : pos.symbol,
        name        : pos.name,
        pairAddress : pa,
        entryPrice  : pos.entryPrice,
        exitPrice   : exitPrice,
        sizeUsd     : pos.sizeUsd,
        pnlPct      : pnlPct,
        pnlUsd      : pnlUsd,
        reason      : reason,
        score       : pos.score,
        signals     : pos.signals,
        ageAtEntry  : pos.ageAtEntry,
        chg24hEntry : pos.chg24hEntry,
        fdvEntry    : pos.fdvEntry,
        openedAt    : pos.openedAt,
        closedAt    : new Date().toISOString(),
        durationMs  : Date.now() - pos.openedAtMs,
        tp1Hit      : pos.tp1Hit,
        tp2Hit      : pos.tp2Hit,
        tp3Hit      : pos.tp3Hit,
    };

    SIM.closedTrades.unshift(closed);
    if (SIM.closedTrades.length > 200) SIM.closedTrades.length = 200;

    SIM.totalPnl += pnlUsd;
    SIM.dailyPnl += pnlUsd;
    SIM.stats.totalTrades++;

    if (pnlUsd > 0) {
        SIM.stats.wins++;
        SIM.stats.totalWinUsd += pnlUsd;
        SIM.stats.avgWin = SIM.stats.totalWinUsd / SIM.stats.wins;
        SIM.stats.bestTrade = Math.max(SIM.stats.bestTrade, pnlUsd);
    } else {
        SIM.stats.losses++;
        SIM.stats.totalLossUsd += Math.abs(pnlUsd);
        SIM.stats.avgLoss = -(SIM.stats.totalLossUsd / SIM.stats.losses);
        SIM.stats.worstTrade = Math.min(SIM.stats.worstTrade, pnlUsd);
    }

    // Track by exit reason
    if (!SIM.stats.byReason[reason]) SIM.stats.byReason[reason] = { count: 0, pnl: 0 };
    SIM.stats.byReason[reason].count++;
    SIM.stats.byReason[reason].pnl += pnlUsd;

    delete SIM.positions[pa];
    saveSim();
    return closed;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRICE CHECK LOOP — pantau posisi terbuka, trigger exit
// ══════════════════════════════════════════════════════════════════════════════
async function checkPrices() {
    const pas = Object.keys(SIM.positions);
    if (pas.length === 0) return;

    for (const pa of pas) {
        const pos = SIM.positions[pa];
        try {
            const pairs = await dex.getPair(pa, mh.CFG.CHAIN);
            if (!pairs || !pairs.length) continue;
            const t = pairs[0];
            const price = t.priceUsd;
            if (!price || price <= 0) continue;

            pos.currentPrice = price;

            // Update peak + trailing SL
            if (price > pos.peakPrice) {
                pos.peakPrice  = price;
                pos.trailingSl = price * (1 - mh.CFG.TRAILING_SL_PCT / 100);
            }

            const pnlPct = (price - pos.entryPrice) / pos.entryPrice * 100;

            // ── VELOCITY EXIT (5m momentum reversal) ─────────────────────────
            if (pos.tp1Hit && t.chg5m < mh.CFG.VELOCITY_EXIT_5M) {
                const closed = simClose(pa, price, 'Velocity exit 5m:' + t.chg5m.toFixed(1) + '%');
                if (closed) {
                    simLog('🌊 VEL EXIT ' + pos.symbol + ' 5m:' + t.chg5m.toFixed(1) + '% | P&L: ' + _pnl(closed.pnlUsd) + ' (' + _pct(closed.pnlPct) + ')', closed.pnlUsd >= 0 ? 'WIN' : 'LOSS');
                }
                continue;
            }

            // ── TP1: +30% → sell 40% ──────────────────────────────────────────
            if (!pos.tp1Hit && price >= pos.tp1Price) {
                pos.tp1Hit = true;
                const partial = pos.sizeUsd * 0.40 * mh.CFG.TP1_PCT / 100;
                pos.partialPnlUsd += partial;
                pos.remainPct -= 0.40;
                SIM.totalPnl += partial;
                SIM.dailyPnl += partial;
                SIM.capital  += pos.sizeUsd * 0.40 + partial;
                simLog('💰 TP1 +' + mh.CFG.TP1_PCT + '% ' + pos.symbol + ' | sell 40% | locked: +$' + partial.toFixed(2), 'WIN');
                saveSim();
            }

            // ── TP2: +80% → sell 30% ──────────────────────────────────────────
            if (!pos.tp2Hit && price >= pos.tp2Price) {
                pos.tp2Hit = true;
                const partial = pos.sizeUsd * 0.30 * mh.CFG.TP2_PCT / 100;
                pos.partialPnlUsd += partial;
                pos.remainPct -= 0.30;
                SIM.totalPnl += partial;
                SIM.dailyPnl += partial;
                SIM.capital  += pos.sizeUsd * 0.30 + partial;
                simLog('🎯 TP2 +' + mh.CFG.TP2_PCT + '% ' + pos.symbol + ' | sell 30% | locked: +$' + partial.toFixed(2), 'WIN');
                saveSim();
            }

            // ── TP3: +200% → sell 20% ─────────────────────────────────────────
            if (!pos.tp3Hit && price >= pos.tp3Price) {
                pos.tp3Hit = true;
                const partial = pos.sizeUsd * 0.20 * mh.CFG.TP3_PCT / 100;
                pos.partialPnlUsd += partial;
                pos.remainPct -= 0.20;
                SIM.totalPnl += partial;
                SIM.dailyPnl += partial;
                SIM.capital  += pos.sizeUsd * 0.20 + partial;
                simLog('🚀 TP3 +' + mh.CFG.TP3_PCT + '% ' + pos.symbol + ' | sell 20% | locked: +$' + partial.toFixed(2), 'WIN');
                saveSim();
            }

            // ── TP4: +500% → close all ────────────────────────────────────────
            if (!pos.tp4Hit && price >= pos.tp4Price) {
                const closed = simClose(pa, price, 'TP4 +' + mh.CFG.TP4_PCT + '%');
                if (closed) simLog('🌕 TP4 MOON ' + pos.symbol + ' +' + pnlPct.toFixed(0) + '% | TOTAL: ' + _pnl(closed.pnlUsd), 'WIN');
                continue;
            }

            // ── TRAILING SL (aktif setelah TP1) ──────────────────────────────
            if (price <= pos.trailingSl && pos.tp1Hit) {
                const closed = simClose(pa, price, 'Trailing SL');
                if (closed) simLog('🛡️  TRAIL SL ' + pos.symbol + ' peak:' + _pct((pos.peakPrice/pos.entryPrice-1)*100) + ' | P&L: ' + _pnl(closed.pnlUsd), closed.pnlUsd >= 0 ? 'WIN' : 'LOSS');
                continue;
            }

            // ── INITIAL SL -25% ───────────────────────────────────────────────
            if (price <= pos.stopLoss) {
                const closed = simClose(pa, price, 'Stop Loss -25%');
                if (closed) simLog('🔴 STOP LOSS ' + pos.symbol + ' ' + _pct(pnlPct) + ' | P&L: ' + _pnl(closed.pnlUsd), 'LOSS');
                continue;
            }

            // ── MAX HOLD ──────────────────────────────────────────────────────
            if (Date.now() - pos.openedAtMs > pos.maxHoldMs) {
                const closed = simClose(pa, price, 'Max hold ' + mh.CFG.MAX_HOLD_HOURS + 'h');
                if (closed) simLog('⏰ MAX HOLD ' + pos.symbol + ' | P&L: ' + _pnl(closed.pnlUsd), closed.pnlUsd >= 0 ? 'WIN' : 'LOSS');
                continue;
            }

        } catch (e) {
            simLog('WARN checkPrice ' + pos.symbol + ': ' + e.message, 'WARN');
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  SCAN LOOP — cari kandidat baru
// ══════════════════════════════════════════════════════════════════════════════
async function runScan() {
    SIM.lastScanAt = new Date().toISOString();
    SIM.scanCount++;

    const today = new Date().toDateString();
    if (SIM.dailyDate !== today) { SIM.dailyDate = today; SIM.dailyPnl = 0; }

    try {
        // Fetch dari DEXScreener (data live real)
        const [gainers, boosted] = await Promise.allSettled([
            dex.getTopGainers(mh.CFG.CHAIN, '1h'),
            dex.getBoostedTokens(),
        ]);

        let pairs = gainers.status === 'fulfilled' ? gainers.value : [];

        // Tambah new tokens
        try {
            const newTok = await dex.getNewTokens(mh.CFG.CHAIN);
            if (newTok && newTok.length) pairs = pairs.concat(newTok);
        } catch {}

        // Tambah boosted
        if (boosted.status === 'fulfilled' && boosted.value.length) {
            const mints = boosted.value.map(b => b.baseMint).filter(Boolean);
            for (let i = 0; i < Math.min(mints.length, 10); i++) {
                try {
                    const bp = await dex.getTokenPairs(mints[i]);
                    const sol = bp.filter(p => p.chain === mh.CFG.CHAIN);
                    if (sol.length) pairs.push(sol[0]);
                } catch {}
            }
        }

        // De-dup
        const seen = new Set();
        pairs = pairs.filter(p => {
            if (!p || !p.pairAddress || seen.has(p.pairAddress)) return false;
            seen.add(p.pairAddress);
            return true;
        });

        let bought = 0;

        for (const t of pairs) {
            if (SIM.scannedSet.has(t.pairAddress) && !SIM.positions[t.pairAddress]) continue;

            const filt = mh.passesFilter(t);
            if (!filt.ok) { SIM.scannedSet.add(t.pairAddress); continue; }

            const rug = mh.isRug(t);
            if (rug.rug) { SIM.scannedSet.add(t.pairAddress); continue; }

            const { score, signals, meta } = mh.scoreToken(t);
            if (score < mh.CFG.MIN_SCORE) { SIM.scannedSet.add(t.pairAddress); continue; }
            if (SIM.positions[t.pairAddress]) continue;
            if (Object.keys(SIM.positions).length >= mh.CFG.MAX_POSITIONS) break;

            const sizeUsd = mh.calcPositionSize ? mh.calcPositionSize(score) : mh.CFG.BASE_ENTRY_USD;
            const pos = simOpen(t, score, signals, meta, sizeUsd);
            if (!pos) continue;

            bought++;
            simLog(
                '🟢 SIM BUY ' + t.baseSymbol.padEnd(10) +
                ' score:' + score + '/100' +
                ' | age:' + (t.ageHours * 60).toFixed(0) + 'min' +
                ' | fdv:$' + _kfmt(t.fdv) +
                ' | vel:' + (meta && meta.velocityRatio ? meta.velocityRatio.toFixed(1) : '--') + 'x' +
                ' | size:$' + sizeUsd +
                ' | ' + (signals || []).slice(0,3).join(' '),
                'BUY'
            );
            SIM.scannedSet.add(t.pairAddress);
        }

        if (SIM.scannedSet.size > 600) {
            SIM.scannedSet = new Set([...SIM.scannedSet].slice(-400));
        }

        saveSim();

    } catch (e) {
        simLog('ERROR scan: ' + e.message, 'WARN');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  DASHBOARD — tampilkan status real-time di terminal
// ══════════════════════════════════════════════════════════════════════════════
function printDashboard() {
    const W = 72;
    const line = '─'.repeat(W);
    const dline = '═'.repeat(W);

    const pos    = Object.values(SIM.positions);
    const wr     = SIM.stats.totalTrades > 0 ? (SIM.stats.wins / SIM.stats.totalTrades * 100) : 0;
    const pf     = SIM.stats.totalLossUsd > 0
        ? (SIM.stats.totalWinUsd / SIM.stats.totalLossUsd).toFixed(2) : '--';
    const roi    = ((SIM.capital - SIM.startCapital) / SIM.startCapital * 100);
    const runMin = Math.floor((Date.now() - new Date(SIM.startedAt).getTime()) / 60000);

    // Clear screen
    process.stdout.write('\x1Bc');

    console.log('╔' + dline + '╗');
    console.log('║  🎯 DEX SIMULATOR — LIVE PAPER TRADING              ' +
                new Date().toLocaleTimeString('id-ID') + '         ║');
    console.log('║  Mode: SIMULASI (tidak ada uang nyata) | Data: DEXScreener Live            ║');
    console.log('╠' + dline + '╣');

    // ── CAPITAL & P&L ────────────────────────────────────────────────────────
    const capBar  = _bar(SIM.capital / SIM.startCapital * 100, 20);
    const roiSign = roi >= 0 ? '+' : '';
    console.log('║  Modal Awal : $' + SIM.startCapital.toFixed(2).padEnd(10) +
                '  Modal Sisa: $' + SIM.capital.toFixed(2).padEnd(10) +
                '  ROI: ' + roiSign + roi.toFixed(2) + '%');
    console.log('║  Total P&L  : ' + _pnl(SIM.totalPnl).padEnd(12) +
                '  Daily P&L : ' + _pnl(SIM.dailyPnl).padEnd(12) +
                '  [' + capBar + ']');
    console.log('╠' + dline + '╣');

    // ── PERFORMANCE ──────────────────────────────────────────────────────────
    const avgW = SIM.stats.avgWin   ? '$' + SIM.stats.avgWin.toFixed(2)  : '--';
    const avgL = SIM.stats.avgLoss  ? '$' + Math.abs(SIM.stats.avgLoss).toFixed(2) : '--';
    const ev   = (SIM.stats.wins > 0 && SIM.stats.losses > 0)
        ? ((SIM.stats.wins / SIM.stats.totalTrades) * SIM.stats.avgWin +
           (SIM.stats.losses / SIM.stats.totalTrades) * SIM.stats.avgLoss).toFixed(2)
        : '--';

    console.log('║  Win Rate   : ' + wr.toFixed(1).padStart(5) + '% (' + SIM.stats.wins + 'W/' + SIM.stats.losses + 'L/' + SIM.stats.totalTrades + 'T)' +
                '  │  Profit Factor: ' + pf + '  │  EV/trade: $' + ev);
    console.log('║  Avg Win    : ' + avgW.padEnd(10) +
                '  │  Avg Loss: ' + avgL.padEnd(10) +
                '  │  Best: ' + _pnl(SIM.stats.bestTrade));
    console.log('║  Scan #     : ' + SIM.scanCount + '  │  Running: ' + runMin + 'min' +
                '  │  Open: ' + pos.length + '/' + mh.CFG.MAX_POSITIONS + ' pos');
    console.log('╠' + dline + '╣');

    // ── OPEN POSITIONS ───────────────────────────────────────────────────────
    if (pos.length > 0) {
        console.log('║  POSISI TERBUKA:');
        console.log('║  ' + 'COIN'.padEnd(10) + 'ENTRY'.padEnd(14) + 'SEKARANG'.padEnd(14) + 'P&L%'.padEnd(10) + 'OPEN'.padEnd(10) + 'SCORE');
        for (const p of pos) {
            const pct   = p.currentPrice > 0 ? ((p.currentPrice - p.entryPrice) / p.entryPrice * 100) : 0;
            const pcts  = _pct(pct);
            const age   = _fmtAge(Date.now() - p.openedAtMs);
            const tps   = (p.tp1Hit ? '✓' : '○') + (p.tp2Hit ? '✓' : '○') + (p.tp3Hit ? '✓' : '○');
            const color = pct >= 0 ? '\x1b[32m' : '\x1b[31m';
            const reset = '\x1b[0m';
            console.log('║  ' + p.symbol.slice(0,10).padEnd(10) +
                        ('$' + p.entryPrice.toExponential(3)).padEnd(14) +
                        color + ('$' + p.currentPrice.toExponential(3)).padEnd(14) + reset +
                        color + pcts.padEnd(10) + reset +
                        age.padEnd(10) + p.score + ' TP:' + tps);
        }
        console.log('╠' + dline + '╣');
    } else {
        console.log('║  Belum ada posisi terbuka — menunggu sinyal...');
        console.log('╠' + dline + '╣');
    }

    // ── RECENT TRADES ────────────────────────────────────────────────────────
    const recent = SIM.closedTrades.slice(0, 8);
    if (recent.length > 0) {
        console.log('║  TRADE TERAKHIR:');
        console.log('║  ' + 'COIN'.padEnd(10) + 'P&L'.padEnd(10) + 'P&L%'.padEnd(10) + 'EXIT REASON'.padEnd(22) + 'DUR');
        for (const t of recent) {
            const color = t.pnlUsd >= 0 ? '\x1b[32m' : '\x1b[31m';
            const reset = '\x1b[0m';
            const dur   = _fmtAge(t.durationMs);
            console.log('║  ' + t.symbol.slice(0,10).padEnd(10) +
                        color + _pnl(t.pnlUsd).padEnd(10) + reset +
                        color + _pct(t.pnlPct).padEnd(10) + reset +
                        (t.reason || '').slice(0,22).padEnd(22) + dur);
        }
        console.log('╠' + dline + '╣');
    }

    // ── RECENT EVENTS ────────────────────────────────────────────────────────
    const events = SIM.eventLog.slice(0, 6);
    if (events.length > 0) {
        console.log('║  LOG TERBARU:');
        for (const e of events) {
            console.log('║  [' + e.ts.split(', ')[1] + '] ' + e.msg.slice(0, 64));
        }
    }

    console.log('╚' + dline + '╝');
    console.log('\n  📄 Log: dex-sim.log  │  Data: dex-sim-results.json  │  Ctrl+C untuk berhenti\n');
}

// ══════════════════════════════════════════════════════════════════════════════
//  REPORT MODE — tampilkan ringkasan hasil
// ══════════════════════════════════════════════════════════════════════════════
function printReport() {
    if (!fs.existsSync(SIM_FILE)) {
        console.log('Belum ada data simulasi. Jalankan: node dex-simulate.js');
        return;
    }

    const d   = JSON.parse(fs.readFileSync(SIM_FILE, 'utf8'));
    const wr  = d.stats.totalTrades > 0 ? (d.stats.wins / d.stats.totalTrades * 100).toFixed(1) : '--';
    const roi = d.startCapital > 0 ? ((d.capital - d.startCapital) / d.startCapital * 100).toFixed(2) : '--';
    const pf  = d.stats.totalLossUsd > 0 ? (d.stats.totalWinUsd / d.stats.totalLossUsd).toFixed(2) : '--';

    console.log('\n╔' + '═'.repeat(60) + '╗');
    console.log('║  📊 DEX SIMULATOR — LAPORAN HASIL');
    console.log('╠' + '═'.repeat(60) + '╣');
    console.log('║  Modal awal    : $' + d.startCapital);
    console.log('║  Modal akhir   : $' + d.capital.toFixed(2));
    console.log('║  Total P&L     : ' + _pnl(d.totalPnl));
    console.log('║  ROI           : ' + roi + '%');
    console.log('╠' + '═'.repeat(60) + '╣');
    console.log('║  Total trades  : ' + d.stats.totalTrades + ' (' + d.stats.wins + 'W / ' + d.stats.losses + 'L)');
    console.log('║  Win rate      : ' + wr + '%');
    console.log('║  Profit factor : ' + pf);
    console.log('║  Avg win       : $' + (d.stats.avgWin || 0).toFixed(2));
    console.log('║  Avg loss      : $' + Math.abs(d.stats.avgLoss || 0).toFixed(2));
    console.log('║  Best trade    : ' + _pnl(d.stats.bestTrade));
    console.log('║  Worst trade   : ' + _pnl(d.stats.worstTrade));
    console.log('╠' + '═'.repeat(60) + '╣');

    // Exit reason breakdown
    if (d.stats.byReason && Object.keys(d.stats.byReason).length > 0) {
        console.log('║  EXIT REASON BREAKDOWN:');
        Object.entries(d.stats.byReason)
            .sort((a, b) => b[1].count - a[1].count)
            .forEach(([reason, v]) => {
                console.log('║    ' + reason.slice(0,28).padEnd(28) +
                            ' x' + String(v.count).padStart(3) +
                            '  P&L: ' + _pnl(v.pnl));
            });
        console.log('╠' + '═'.repeat(60) + '╣');
    }

    // Top 5 trades
    if (d.closedTrades && d.closedTrades.length > 0) {
        console.log('║  TOP 5 TRADE TERBAIK:');
        const sorted = [...d.closedTrades].sort((a, b) => b.pnlUsd - a.pnlUsd);
        sorted.slice(0, 5).forEach((t, i) => {
            console.log('║  ' + (i+1) + '. ' + (t.symbol || '?').padEnd(10) +
                        ' ' + _pnl(t.pnlUsd).padEnd(10) +
                        ' ' + _pct(t.pnlPct).padEnd(10) +
                        ' score:' + t.score + ' age:' + (t.ageAtEntry * 60).toFixed(0) + 'min');
        });

        console.log('║  TOP 5 TRADE TERBURUK:');
        const worst = [...d.closedTrades].sort((a, b) => a.pnlUsd - b.pnlUsd);
        worst.slice(0, 5).forEach((t, i) => {
            console.log('║  ' + (i+1) + '. ' + (t.symbol || '?').padEnd(10) +
                        ' ' + _pnl(t.pnlUsd).padEnd(10) +
                        ' ' + _pct(t.pnlPct).padEnd(10) +
                        ' score:' + t.score + ' age:' + (t.ageAtEntry * 60).toFixed(0) + 'min');
        });
    }

    console.log('╚' + '═'.repeat(60) + '╝\n');
    console.log('File lengkap: dex-sim-results.json');
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
    if (REPORT_ONLY) {
        printReport();
        process.exit(0);
    }

    console.clear();
    console.log('\n╔' + '═'.repeat(68) + '╗');
    console.log('║  🎯 DEX SIMULATOR — LIVE PAPER TRADING                              ║');
    console.log('║                                                                      ║');
    console.log('║  • Data    : DEXScreener real-time (Solana)                         ║');
    console.log('║  • Modal   : $' + CAPITAL + ' (simulasi — tidak ada uang nyata)'.padEnd(55) + '║');
    console.log('║  • Scan    : tiap ' + (SCAN_MS/1000) + ' detik' + (FAST_MODE ? ' (FAST MODE)' : '').padEnd(46) + '║');
    console.log('║  • Exit    : Stop, lihat report: node dex-simulate.js --report      ║');
    console.log('╚' + '═'.repeat(68) + '╝\n');

    loadSim();

    simLog('🚀 Simulator dimulai | modal: $' + SIM.capital.toFixed(2) + ' | algo: v2.0', 'INFO');

    // Scan pertama langsung
    simLog('📡 Scan pertama...', 'INFO');
    await runScan();

    // Dashboard pertama
    printDashboard();

    // Scan loop
    setInterval(async () => {
        await runScan();
        printDashboard();
    }, SCAN_MS);

    // Price check loop
    setInterval(async () => {
        await checkPrices();
    }, PRICE_MS);

    // Dashboard refresh tiap 5 detik meski tidak ada event
    setInterval(() => {
        printDashboard();
    }, 5000);

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n\n⏹  Simulator dihentikan. Menyimpan state...');
        saveSim();
        console.log('\n📊 Ringkasan:');
        printReport();
        process.exit(0);
    });
}

main().catch(e => {
    console.error('FATAL:', e.message);
    process.exit(1);
});
