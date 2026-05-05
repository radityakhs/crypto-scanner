#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Signal Grader — Auto-grade sinyal historis
//
//  Cara kerja:
//  1. Setiap RUN_INTERVAL, baca signals.json
//  2. Untuk setiap sinyal yang sudah expired (> MAX_AGE_MIN):
//     - Fetch harga sekarang via proxy
//     - Simulasikan: apakah TP1 atau SL yang tersentuh lebih dulu?
//       (pakai simplified assumption: jika harga sekarang >= TP1 → WIN,
//        jika harga sekarang <= SL → LOSS, selain itu → PENDING / EXPIRED)
//  3. Simpan hasil ke signal-grades.json:
//     { [coinId]: { wins, losses, pending, winRate, grade, lastUpdated } }
//  4. Coin dengan winRate < MIN_WIN_RATE && gradedCount >= MIN_SAMPLES → di-skip auto-trader
//
//  Di-import oleh auto-trader.js:
//     const signalGrader = require('./signal-grader');
//     signalGrader.getGrade('bitcoin') // → { grade: 'A', winRate: 0.72, ... }
//     signalGrader.shouldSkip('bitcoin') // → false
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

const SIGNALS_FILE = path.join(__dirname, 'signals.json');
const GRADES_FILE  = path.join(__dirname, 'signal-grades.json');

const CFG = {
    MAX_AGE_MIN   : 30,     // sinyal > 30 menit → expired, bisa di-grade
    MIN_SAMPLES   : 5,      // minimal 5 sinyal ter-grade sebelum skip diterapkan
    MIN_WIN_RATE  : 0.40,   // < 40% win rate → coin di-skip oleh auto-trader
    RUN_INTERVAL  : 15 * 60 * 1000,  // jalankan grading tiap 15 menit
    PROXY_HOST    : '127.0.0.1',
    PROXY_PORT    : 3001,
    PRICE_TIMEOUT : 5000,   // ms timeout fetch harga
};

// Grade tiers: A >= 65%, B >= 50%, C >= 40%, F < 40%
function calcGrade(winRate, total) {
    if (total < CFG.MIN_SAMPLES) return 'N/A';
    if (winRate >= 0.65) return 'A';
    if (winRate >= 0.50) return 'B';
    if (winRate >= 0.40) return 'C';
    return 'F';
}

// ── Fetch harga terkini dari proxy ────────────────────────────────────────────
function fetchPrice(coinSymbol) {
    return new Promise((resolve) => {
        const instId = `${coinSymbol.toUpperCase()}-USDT`;
        const options = {
            hostname: CFG.PROXY_HOST,
            port    : CFG.PROXY_PORT,
            path    : `/api/v5/market/ticker?instId=${instId}`,
            method  : 'GET',
            timeout : CFG.PRICE_TIMEOUT,
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const price = parseFloat(json?.data?.[0]?.last);
                    resolve(isNaN(price) ? null : price);
                } catch { resolve(null); }
            });
        });
        req.on('error',   () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end();
    });
}

// ── Load grades dari disk ─────────────────────────────────────────────────────
function loadGrades() {
    try {
        if (!fs.existsSync(GRADES_FILE)) return {};
        return JSON.parse(fs.readFileSync(GRADES_FILE, 'utf8'));
    } catch { return {}; }
}

// ── Simpan grades ke disk ─────────────────────────────────────────────────────
function saveGrades(grades) {
    try { fs.writeFileSync(GRADES_FILE, JSON.stringify(grades, null, 2)); }
    catch (e) { console.warn('[Grader] Gagal simpan grades:', e.message); }
}

// ── Core grading logic ────────────────────────────────────────────────────────
async function runGrading() {
    // Baca sinyal
    let signals = [];
    try {
        if (!fs.existsSync(SIGNALS_FILE)) return;
        signals = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        if (!Array.isArray(signals)) return;
    } catch (e) {
        console.warn('[Grader] Gagal baca signals.json:', e.message);
        return;
    }

    // Filter: hanya sinyal yang sudah expired dan belum pernah di-grade
    const grades = loadGrades();
    const now    = Date.now();

    // Track sinyal yang sudah di-grade (pakai ID unik)
    const gradedIds = new Set(
        Object.values(grades)
            .flatMap(g => g._gradedSignalIds || [])
    );

    const expired = signals.filter(s => {
        if (!s.timestamp) return false;
        const ageMin = (now - new Date(s.timestamp).getTime()) / 60000;
        const uid    = `${s.coinId}_${s.signal}_${s.timestamp}`;
        return ageMin >= CFG.MAX_AGE_MIN && !gradedIds.has(uid);
    });

    if (!expired.length) {
        // console.log('[Grader] Tidak ada sinyal baru untuk di-grade');
        return;
    }

    console.log(`[Grader] Grading ${expired.length} sinyal expired...`);
    let graded = 0;

    // ── Kumpulkan unik coin symbols dulu, fetch price sekali per coin ─────────
    const uniqueSymbols = [...new Set(expired.map(s => s.coinSymbol).filter(Boolean))];
    const priceMap = {};
    for (const sym of uniqueSymbols) {
        priceMap[sym] = await fetchPrice(sym);
    }

    for (const sig of expired) {
        const uid          = `${sig.coinId}_${sig.signal}_${sig.timestamp}`;
        const currentPrice = priceMap[sig.coinSymbol] ?? null;

        if (!currentPrice || !sig.tp1 || !sig.stopLoss) {
            // Tidak bisa grade — skip (tidak masuk grades)
            continue;
        }

        const isLong   = sig.signal === 'LONG';
        const tp1      = sig.tp1;
        const sl       = sig.stopLoss;
        const entry    = sig.entryLow || sig.currentPrice;

        // Simplified outcome:
        // LONG:  price >= TP1 → WIN, price <= SL → LOSS, else → PENDING
        // SHORT: price <= TP1 → WIN, price >= SL → LOSS, else → PENDING
        let outcome;
        if (isLong) {
            if (currentPrice >= tp1)   outcome = 'win';
            else if (currentPrice <= sl) outcome = 'loss';
            else                        outcome = 'pending';
        } else {
            if (currentPrice <= tp1)   outcome = 'win';
            else if (currentPrice >= sl) outcome = 'loss';
            else                        outcome = 'pending';
        }

        // Update coin grade record
        if (!grades[sig.coinId]) {
            grades[sig.coinId] = {
                coinId           : sig.coinId,
                coinSymbol       : sig.coinSymbol,
                coinName         : sig.coinName,
                wins             : 0,
                losses           : 0,
                pending          : 0,
                winRate          : 0,
                grade            : 'N/A',
                lastUpdated      : null,
                _gradedSignalIds : [],
            };
        }

        const g = grades[sig.coinId];
        if (outcome === 'win')         g.wins++;
        else if (outcome === 'loss')   g.losses++;
        else                           g.pending++;

        const total    = g.wins + g.losses;
        g.winRate      = total > 0 ? g.wins / total : 0;
        g.grade        = calcGrade(g.winRate, total);
        g.lastUpdated  = new Date().toISOString();
        g._gradedSignalIds.push(uid);
        // Batasi array ID agar tidak terlalu besar
        if (g._gradedSignalIds.length > 500) g._gradedSignalIds = g._gradedSignalIds.slice(-500);

        graded++;
    }

    if (graded > 0) {
        saveGrades(grades);
        const summary = Object.values(grades)
            .filter(g => (g.wins + g.losses) >= CFG.MIN_SAMPLES)
            .sort((a, b) => b.winRate - a.winRate)
            .slice(0, 5)
            .map(g => `${g.coinSymbol?.toUpperCase()}(${g.grade}:${(g.winRate*100).toFixed(0)}%)`)
            .join(' · ');
        console.log(`[Grader] ✅ Graded ${graded} sinyal. Top coins: ${summary || '(belum cukup data)'}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC API — dipakai oleh auto-trader.js
// ═══════════════════════════════════════════════════════════════════════════════
let _gradesCache      = null;
let _gradesCacheTime  = 0;
const GRADES_CACHE_TTL = 5 * 60 * 1000; // cache 5 menit di-memory

function _loadGradesCached() {
    if (_gradesCache && Date.now() - _gradesCacheTime < GRADES_CACHE_TTL) return _gradesCache;
    _gradesCache      = loadGrades();
    _gradesCacheTime  = Date.now();
    return _gradesCache;
}

/**
 * Ambil grade untuk sebuah coin
 * @param {string} coinId
 * @returns {{ grade: string, winRate: number, wins: number, losses: number, total: number } | null}
 */
function getGrade(coinId) {
    const grades = _loadGradesCached();
    const g      = grades[coinId];
    if (!g) return null;
    return {
        grade   : g.grade,
        winRate : g.winRate,
        wins    : g.wins,
        losses  : g.losses,
        total   : g.wins + g.losses,
    };
}

/**
 * Apakah auto-trader harus skip coin ini karena historis buruk?
 * @param {string} coinId
 * @returns {boolean}
 */
function shouldSkip(coinId) {
    const g = getGrade(coinId);
    if (!g)                             return false; // belum cukup data → jangan skip
    if (g.total < CFG.MIN_SAMPLES)      return false; // belum cukup sample
    if (g.grade === 'F')                return true;  // win rate < 40%
    return false;
}

/**
 * Ambil semua grades (untuk dashboard)
 * @returns {Object}
 */
function getAllGrades() {
    return _loadGradesCached();
}

// ── Auto-start polling jika dijalankan langsung ───────────────────────────────
if (require.main === module) {
    console.log('[Grader] Signal Grader standalone mode — running immediately...');
    runGrading().then(() => {
        console.log('[Grader] Grading selesai. Scheduling tiap 15 menit...');
        setInterval(runGrading, CFG.RUN_INTERVAL);
    });
}

// ── Export untuk dipakai sebagai module ──────────────────────────────────────
module.exports = {
    runGrading,
    getGrade,
    shouldSkip,
    getAllGrades,
    startPolling: () => {
        runGrading(); // jalankan sekali langsung
        return setInterval(runGrading, CFG.RUN_INTERVAL);
    },
    CFG,
};
