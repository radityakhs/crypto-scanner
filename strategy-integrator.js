// ════════════════════════════════════════════════════════════════════════════
//  strategy-integrator.js — Unified Multi-Strategy Signal Scoring Engine
//  Browser-side module (loaded via <script> in index.html)
//
//  Menggabungkan 5 source:
//  1. signal-bot.js    → signals.json  (10-engine quant, Kelly, Bayesian)
//  2. memecoin-hunter  → port 3004 /positions  (Velocity, Bonding Curve, Rug)
//  3. dex-backtest     → dex-backtest-results.json  (score-bucket win rate)
//  4. backtest         → backtest-results.json  (per-coin long win rate)
//  5. adaptive-weights → adaptive-weights.json  (self-learning engine weights)
//  + quant-analyst.js  → window.quantAnalyst.analyze() (real-time 10-engine)
//
//  API:
//    await StrategyIntegrator.init()          — load static data once
//    await StrategyIntegrator.score(sig)      — returns enriched signal or null
//    await StrategyIntegrator.getDexSignals() — DEX Hunter open positions as signals
//    StrategyIntegrator.status()              — { backtestLoaded, adaptiveLoaded, ... }
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const StrategyIntegrator = (() => {

    // ── Internal state ───────────────────────────────────────────────────────
    let _dexBacktest   = null;   // dex-backtest-results.json
    let _backtest      = null;   // backtest-results.json
    let _adaptWeights  = null;   // adaptive-weights.json
    let _initDone      = false;
    let _initTs        = 0;
    const REINIT_MS    = 5 * 60 * 1000; // re-fetch static data every 5 min

    // ── Thresholds ────────────────────────────────────────────────────────────
    const MIN_COMPOSITE_SCORE     = 45;   // final composite must be >= 45 to trade (dilonggarkan)
    const MIN_COMPOSITE_SCORE_DEX = 40;   // DEX hunter threshold (dilonggarkan)
    const MIN_BACKTEST_WINRATE    = 40;   // per-coin long win rate (dilonggarkan)
    const DEX_MIN_SCORE           = 40;   // memecoin-hunter min score (dilonggarkan)

    // ── Fetch helpers ─────────────────────────────────────────────────────────
    async function _fetchJson(url, timeoutMs = 4000) {
        try {
            const r = await fetch(url + '?_=' + Date.now(), { signal: AbortSignal.timeout(timeoutMs) });
            if (!r.ok) return null;
            return await r.json();
        } catch { return null; }
    }

    // ── Init — load all static strategy data ─────────────────────────────────
    async function init() {
        const now = Date.now();
        if (_initDone && (now - _initTs) < REINIT_MS) return;

        const [dexBt, bt, aw] = await Promise.all([
            _fetchJson('./dex-backtest-results.json'),
            _fetchJson('./backtest-results.json'),
            _fetchJson('./adaptive-weights.json'),
        ]);

        if (dexBt && dexBt.scoreBreakdown) _dexBacktest = dexBt;
        if (bt   && bt.perCoin)            _backtest    = bt;
        if (aw   && aw.weights)            _adaptWeights = aw;

        _initDone = true;
        _initTs   = now;
    }

    // ── Score a single signal-bot signal ─────────────────────────────────────
    // Returns enriched signal object with _compositeScore, _reasons[]
    // Returns null if signal should be rejected
    async function score(sig) {
        await init();

        const reasons = [];
        let composite = 0;
        let weight    = 0;

        // ── 1. signal-bot base score (40% weight) ──────────────────────────
        const botScore = +(sig.score || sig.confidence || sig.confidenceRaw || 0);
        if (botScore < 40) return null; // hard gate (dilonggarkan dari 60 ke 40)

        // Normalize bot score 40-100 → 0-100
        const botNorm = Math.min(100, Math.max(0, (botScore - 40) / 60 * 100));
        composite += botNorm * 0.40;
        weight    += 0.40;
        reasons.push(`Bot:${botScore.toFixed(0)}`);

        // ── 2. Kelly / Expected Value gate ─────────────────────────────────
        const ev = +(sig.expectedValue || sig.ev || 0);
        // Hapus hard reject untuk EV negatif — EV sering tidak ada di sinyal DEX
        if (ev >= 0.2)       { composite += 8;  reasons.push(`EV+:${ev.toFixed(2)}`); }
        else if (ev >= 0.05) { composite += 3;  reasons.push(`EV:${ev.toFixed(2)}`); }

        // ── 3. Backtest per-coin win rate (15% weight) ────────────────────
        if (_backtest && sig.coinId) {
            const coinData = _backtest.perCoin?.find(c => c.coinId === sig.coinId);
            if (coinData) {
                const longWr = coinData.stats?.longWinRate || 0;
                if (longWr < MIN_BACKTEST_WINRATE) {
                    // Tidak reject langsung, hanya kurangi skor
                    composite -= 5;
                    reasons.push(`BT_WR_LOW:${longWr.toFixed(0)}%`);
                } else {
                    const btNorm = Math.min(100, longWr);
                    composite += btNorm * 0.15;
                    weight    += 0.15;
                    reasons.push(`BT:${longWr.toFixed(0)}%`);
                }
            }
        }

        // ── 4. Adaptive weights mode bonus (5% weight) ────────────────────
        if (_adaptWeights) {
            const mode = _adaptWeights.mode || 'DEFAULT';
            if (mode === 'ADAPTIVE') {
                // Check if adaptive weights beat defaults
                const aw = _adaptWeights.weights || {};
                const dw = _adaptWeights.defaultWeights || {};
                // Count engines where adaptive > default (learning has improved)
                const improved = Object.keys(aw).filter(k => (aw[k] || 0) > (dw[k] || 0)).length;
                const adaptScore = Math.min(100, improved * 15);
                composite += adaptScore * 0.05;
                weight    += 0.05;
                reasons.push(`AW:${mode}(${improved}eng)`);
            } else {
                reasons.push(`AW:${mode}`);
            }
        }

        // ── 5. Quant analyst real-time confirmation (20% weight) ──────────
        // Only run if prices are provided (will be passed by enhanced poll)
        const prices   = sig._prices  || null;
        const volumes  = sig._volumes || null;
        if (prices && volumes && prices.length >= 15 && window.quantAnalyst) {
            try {
                const qa = window.quantAnalyst.analyze(sig.coinId || sig._symRaw || '', { prices, total_volumes: volumes.map((v, i) => [i, v]) });
                if (qa && qa.dirProb) {
                    const qConf = qa.dirProb.confidence || 0;
                    const qBull = qa.dirProb.bullish   || 50;
                    const isBullishQA = qBull > 55;

                    if (!isBullishQA && qConf >= 60) {
                        // Strong quant bearish signal → reject
                        reasons.push(`QA_BEARISH:${qBull.toFixed(0)}%_REJECT`);
                        return null;
                    }

                    const qaNorm = isBullishQA
                        ? Math.min(100, (qBull - 50) / 30 * 100)
                        : 0;
                    composite += qaNorm * 0.20;
                    weight    += 0.20;
                    reasons.push(`QA:${qBull.toFixed(0)}%bull`);

                    // BOS confirmation bonus
                    if (qa.structure?.bos === 'bullish_bos') {
                        composite += 5;
                        reasons.push('BOS_BULL');
                    }
                    // Whale activity bonus
                    if (qa.whale?.whaleBias === 'bullish') {
                        composite += 5;
                        reasons.push('WHALE_BULL');
                    }
                }
            } catch (e) { /* quant analyst optional */ }
        } else if (!prices && botScore >= 75) {
            // High-confidence signal without price data → give partial QA credit
            composite += 50 * 0.20;
            weight    += 0.20;
            reasons.push('QA:N/A(highConf)');
        }

        // ── 6. HTF trend alignment bonus ─────────────────────────────────
        if (sig.htfAligned === true || sig.htfTrend === 'bullish' || sig.htfTrend === 'uptrend') {
            composite += 5;
            reasons.push('HTF_ALIGN');
        }

        // ── 7. Market regime bonus ───────────────────────────────────────
        if (sig.marketRegime === 'bullish' || sig.marketRegime === 'trending_up') {
            composite += 3;
            reasons.push('REGIME_BULL');
        }

        // ── Normalize composite to 0-100 ─────────────────────────────────
        // composite is already a running weighted sum; add base offset
        const finalScore = Math.min(100, Math.round(composite));

        if (finalScore < MIN_COMPOSITE_SCORE) {
            reasons.push(`COMPOSITE_${finalScore}<${MIN_COMPOSITE_SCORE}_REJECT`);
            return null;
        }

        return Object.assign({}, sig, {
            _compositeScore : finalScore,
            _reasons        : reasons,
            _source         : 'signal-bot',
        });
    }

    // ── Get DEX Hunter signals (open positions as BUY signals) ───────────────
    // Converts memecoin-hunter open positions into the same format as signals.json
    async function getDexSignals() {
        const short = a => a && a.length > 10 ? a.slice(0,5)+'…'+a.slice(-4) : (a || '?');
        try {
            // Gabungkan open positions dan scannedPairs
            // 1. Ambil data dari proxy (positions) dan fallback ke memecoin-state.json
            let positions = [];
            let scannedPairs = [];
            let state = null;
            try {
                const r = await fetch('http://localhost:3004/positions', {
                    signal: AbortSignal.timeout(2000)
                });
                if (r.ok) {
                    const data = await r.json();
                    positions = data.positions || [];
                }
            } catch {}
            // Fallback/merge: baca memecoin-state.json
            try {
                const r2 = await fetch('./memecoin-state.json?_=' + Date.now(), {
                    signal: AbortSignal.timeout(3000)
                });
                if (r2.ok) {
                    state = await r2.json();
                    // Gabungkan positions dari state jika belum ada
                    const statePositions = Object.values(state.positions || {});
                    // Hindari duplikat berdasarkan pairAddress/baseMint
                    const existingIds = new Set(positions.map(p => p.pairAddress || p.baseMint));
                    for (const p of statePositions) {
                        const id = p.pairAddress || p.baseMint;
                        if (!existingIds.has(id)) positions.push(p);
                    }
                    // Ambil scannedPairs
                    scannedPairs = Array.isArray(state.scannedPairs) ? state.scannedPairs : [];
                }
            } catch {}

            // Buat map untuk akses cepat posisi by pairAddress/baseMint
            const posMap = {};
            for (const p of positions) {
                const id = p.pairAddress || p.baseMint;
                if (id) posMap[id] = p;
            }

            // Gabungkan semua sinyal: positions (ada nama) diprioritaskan di atas scannedPairs (baru)
            const allSignals = [];

            // 1. Dari positions (token yang ada nama + score lengkap) — selalu tampilkan
            for (const p of positions) {
                const id = p.pairAddress || p.baseMint;
                if (!id) continue;
                allSignals.push({
                    coinSymbol    : p.coinSymbol || p.coinName || short(p.baseMint),
                    coinId        : id,
                    coinName      : p.coinName   || p.coinSymbol || '?',
                    signal        : 'LONG',
                    confidence    : p.score || 55,
                    score         : p.score || 55,
                    expectedValue : 0.10,
                    kellyFraction : 0.1,
                    tp1           : p.tp1Price   || null,
                    tp2           : p.tp2Price   || null,
                    tp3           : p.tp3Price   || null,
                    stopLoss      : p.stopLoss   || p.trailingSl || null,
                    currentPrice  : p.currentPrice || p.entryPrice || null,
                    entryPrice    : p.entryPrice   || p.currentPrice || null,
                    mint          : p.baseMint,
                    chain         : p.chain || 'solana',
                    timestamp     : p.openedAt   || new Date().toISOString(),
                    _status       : p.status || 'open',
                    _source       : 'dex-hunter',
                    _dexScore     : p.score || 0,
                    _dexSignals   : Array.isArray(p.signals) ? p.signals.join(', ') : (p.signals || ''),
                    _pairAddress  : p.pairAddress || '',
                    _ageHours     : p.ageAtEntry || 0,
                    _compositeScore: p.score || 55,
                    _reasons      : Array.isArray(p.signals) ? p.signals : [],
                    _tp1Hit       : p.tp1Hit,
                    _tp2Hit       : p.tp2Hit,
                    _pnlUsd       : p.partialPnlUsd || 0,
                    _sizeUsd      : p.sizeUsd || 0,
                });
            }

            // 2. Dari scannedPairs (token baru yang belum pernah dibeli) — ambil max 20 terbaru
            const posIds = new Set(positions.map(p => p.pairAddress || p.baseMint).filter(Boolean));
            const newPairs = scannedPairs.filter(id => !posIds.has(id)).slice(-20).reverse();
            for (const pairId of newPairs) {
                const shortId = typeof pairId === 'string' ? pairId.slice(0,6)+'…'+pairId.slice(-4) : '?';
                allSignals.push({
                    coinSymbol    : shortId,
                    coinId        : pairId,
                    coinName      : pairId,
                    signal        : 'WATCH',
                    confidence    : 50,
                    score         : 50,
                    expectedValue : 0.05,
                    kellyFraction : 0.05,
                    tp1           : null, tp2: null, tp3: null,
                    stopLoss      : null,
                    currentPrice  : null,
                    entryPrice    : null,
                    mint          : pairId,
                    chain         : 'solana',
                    timestamp     : new Date().toISOString(),
                    _status       : 'scanned',
                    _source       : 'scanned',
                    _dexScore     : 50,
                    _dexSignals   : '',
                    _pairAddress  : pairId,
                    _ageHours     : 0,
                    _compositeScore: 50,
                    _reasons      : ['newly scanned'],
                });
            }
            return allSignals;
        } catch { return []; }
    }

    // ── Score a DEX Hunter signal ────────────────────────────────────────────
    // DEX hunter sudah pre-filter: velocity + rug 7-layer + bonding curve stage
    // Scoring ini hanya tambahkan bonus dari backtest bucket + tags
    // composite mulai dari dexScore langsung (0-100 scale)
    async function scoreDex(sig) {
        await init();

        const reasons = [];

    const dexScore = sig._dexScore || sig.score || 0;

    // Longgarkan: jika score >= 30, tetap masuk pending, bukan langsung reject
    if (dexScore < 30) return null;

        // Mulai dari dexScore sebagai base (sudah 0-100)
        let composite = dexScore;
        reasons.push(`DEX:${dexScore}`);

        // ── 1. Dex-backtest score-bucket validation ────────────────────────
        // Bucket 50 = 0% win rate → reject. Bucket 60+ = 100% → bonus
        if (_dexBacktest && _dexBacktest.scoreBreakdown) {
            const dexBucket  = Math.floor(dexScore / 10) * 10;
            const bucketData = _dexBacktest.scoreBreakdown[String(dexBucket)];
            if (bucketData) {
                const wins     = bucketData.wins   || 0;
                const losses   = bucketData.losses || 0;
                const total    = wins + losses;
                const bucketWr = total > 0 ? wins / total * 100 : 100; // default 100% kalau no data
                if (total > 0 && bucketWr === 0) {
                    reasons.push(`DEXBT_BUCKET${dexBucket}:0%_REJECT`);
                    return null; // score bucket ini historically 0% win → skip
                }
                if (bucketWr >= 80) { composite += 5; reasons.push(`DEXBT:${bucketWr.toFixed(0)}%✅`); }
            }
        } else {
            // Backtest belum load → beri benefit of the doubt, lanjut tanpa penalty
            reasons.push('DEXBT:N/A');
        }

        // ── 2. Age gate (DEX hunter: optimal 30min-4h) ─────────────────────
        const age = sig._ageHours || 0;
        if (age > 0) {
            if (age < 0.01)  { reasons.push('TOO_NEW_REJECT'); return null; } // < 36 detik → data belum reliable
            if (age <= 0.5)  { composite += 8; reasons.push(`age:${(age*60).toFixed(0)}min🎯EARLY`); }
            else if (age <= 2) { composite += 5; reasons.push(`age:${(age*60).toFixed(0)}min🎯`); }
            else if (age <= 4) { composite += 2; reasons.push(`age:${age.toFixed(1)}h`); }
            else if (age > 24) { composite -= 5; reasons.push(`age:${age.toFixed(0)}h_OLD`); }
        }

        // ── 3. Signal tags bonus ────────────────────────────────────────────
        const tags = (sig._dexSignals || '').toLowerCase();
        if (tags.includes('vel:') && tags.includes('x⚡')) { composite += 5; reasons.push('VEL_SPIKE⚡'); }
        if (tags.includes('burst5m'))  { composite += 3; reasons.push('BURST5M'); }
        if (tags.includes('early'))    { composite += 5; reasons.push('EARLY_STAGE🎯'); }
        if (tags.includes('buy/sell')) { composite += 3; reasons.push('BUY_DOM'); }
        if (tags.includes('5m:+'))     { composite += 3; reasons.push('MOM5M'); }

        const finalScore = Math.min(100, Math.round(composite));
        if (finalScore < MIN_COMPOSITE_SCORE_DEX) {
            reasons.push(`SKIP score:${finalScore}<${MIN_COMPOSITE_SCORE_DEX}`);
            return null; // under threshold → skip
        }

        return Object.assign({}, sig, {
            _compositeScore : finalScore,
            _reasons        : reasons,
            _source         : 'dex-hunter',
        });
    }

    // ── Status ────────────────────────────────────────────────────────────────
    function status() {
        return {
            initialized      : _initDone,
            lastInitTs       : _initTs ? new Date(_initTs).toLocaleTimeString('id-ID') : '-',
            dexBacktestLoaded: !!_dexBacktest,
            backtestLoaded   : !!_backtest,
            adaptiveLoaded   : !!_adaptWeights,
            adaptiveMode     : _adaptWeights?.mode || 'N/A',
            dexBtSummary     : _dexBacktest?.summary
                ? `WR:${_dexBacktest.summary.winRate}% Trades:${_dexBacktest.summary.total} Grade:${_dexBacktest.summary.grade}`
                : 'N/A',
            btAggregate      : _backtest?.aggregate
                ? `Long WR:${_backtest.aggregate.longWinRate}% Total:${_backtest.aggregate.total}`
                : 'N/A',
        };
    }

    return { init, score, scoreDex, getDexSignals, status };
})();

// Make globally accessible
window.StrategyIntegrator = StrategyIntegrator;
