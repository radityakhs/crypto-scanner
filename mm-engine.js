/**
 * mm-engine.js — Advanced AI Market Maker Analysis Engine
 * --------------------------------------------------------
 * Extends smc-engine.js with institutional-grade analytics:
 *   1.  CHOCH (Change of Character) Detection
 *   2.  Wyckoff Phase Detection (Accumulation / Distribution)
 *   3.  Fibonacci Confluence Zones (0.236, 0.382, 0.5, 0.618, 0.786, 1.618)
 *   4.  Liquidity Pool Detection (stop clusters above/below swing levels)
 *   5.  Order-Flow Proxy (buy/sell volume ratio per candle)
 *   6.  ATR Volatility + Bollinger-Band width (realised vol)
 *   7.  Fake Breakout / Fakeout Detector
 *   8.  Probability Engine (Bayesian multi-factor)
 *   9.  Monte-Carlo TP/SL estimator
 *  10.  Unified Conviction Score 0-100
 *
 * Usage (server-side):
 *   const MMEngine = require('./mm-engine');
 *   const result   = MMEngine.analyze(candles);
 *
 * Usage (browser): loaded as script, exposes window.MMEngine
 *
 * Dependencies: none (pure JS)
 * Author: HollowCat AI · mm-engine v1.0
 */

'use strict';

const MMEngine = (function () {

    // =========================================================================
    // HELPERS
    // =========================================================================

    const range  = c => c.high - c.low;
    const body   = c => Math.abs(c.close - c.open);
    const isBull = c => c.close >= c.open;
    const isBear = c => c.close <  c.open;
    const bodyR  = c => { const r = range(c); return r === 0 ? 0 : body(c) / r; };

    function atr(candles, period = 14) {
        if (candles.length < period + 1) return range(candles[candles.length - 1]) || 0;
        let sum = 0;
        for (let i = candles.length - period; i < candles.length; i++) {
            const prev = candles[i - 1];
            const c    = candles[i];
            const tr   = Math.max(
                range(c),
                Math.abs(c.high - prev.close),
                Math.abs(c.low  - prev.close)
            );
            sum += tr;
        }
        return sum / period;
    }

    /** Rolling average volume over last n candles */
    function avgVol(candles, n = 20) {
        const slice = candles.slice(-n);
        if (!slice.length) return 0;
        return slice.reduce((s, c) => s + (c.volume || 0), 0) / slice.length;
    }

    /** Swing highs/lows (fractal, lookback each side) */
    function swings(candles, lb = 3) {
        const highs = [], lows = [];
        for (let i = lb; i < candles.length - lb; i++) {
            let sh = true, sl = true;
            for (let j = 1; j <= lb; j++) {
                if (candles[i - j].high >= candles[i].high || candles[i + j].high >= candles[i].high) sh = false;
                if (candles[i - j].low  <= candles[i].low  || candles[i + j].low  <= candles[i].low)  sl = false;
            }
            if (sh) highs.push({ idx: i, price: candles[i].high, time: candles[i].time });
            if (sl) lows.push ({ idx: i, price: candles[i].low,  time: candles[i].time });
        }
        return { highs, lows };
    }

    function clamp(v, lo = 0, hi = 100) { return Math.min(hi, Math.max(lo, v)); }


    // =========================================================================
    // 1.  CHOCH — Change of Character
    // =========================================================================
    /**
     * A CHoCH occurs when the market breaks a structural level in the
     * *opposite* direction to the recent trend.
     *
     * We define:
     *   Bearish CHoCH → after a series of HH/HL, price closes below a HL
     *   Bullish CHoCH → after a series of LH/LL, price closes above a LH
     */
    function detectCHOCH(candles, swingData) {
        const { highs, lows } = swingData;
        const events = [];
        const last = candles[candles.length - 1];

        // Check for bullish CHoCH (reversal up)
        if (lows.length >= 2) {
            const recentLows = lows.slice(-4);
            // Last two lows must be descending (downtrend)
            for (let i = 1; i < recentLows.length; i++) {
                if (recentLows[i].price < recentLows[i - 1].price) {
                    // Now look for a swing high that was taken out
                    const relHighs = highs.filter(h => h.idx > recentLows[i - 1].idx && h.idx < recentLows[i].idx);
                    if (relHighs.length > 0) {
                        const lvh = relHighs[relHighs.length - 1];
                        if (last.close > lvh.price && isBull(last)) {
                            events.push({
                                type: 'bullish',
                                level: lvh.price,
                                time: last.time,
                                strength: clamp(bodyR(last) * 100),
                                label: 'CHoCH ↑'
                            });
                        }
                    }
                }
            }
        }

        // Check for bearish CHoCH (reversal down)
        if (highs.length >= 2) {
            const recentHighs = highs.slice(-4);
            for (let i = 1; i < recentHighs.length; i++) {
                if (recentHighs[i].price > recentHighs[i - 1].price) {
                    const relLows = lows.filter(l => l.idx > recentHighs[i - 1].idx && l.idx < recentHighs[i].idx);
                    if (relLows.length > 0) {
                        const lvl = relLows[relLows.length - 1];
                        if (last.close < lvl.price && isBear(last)) {
                            events.push({
                                type: 'bearish',
                                level: lvl.price,
                                time: last.time,
                                strength: clamp(bodyR(last) * 100),
                                label: 'CHoCH ↓'
                            });
                        }
                    }
                }
            }
        }

        return events;
    }


    // =========================================================================
    // 2.  WYCKOFF PHASE
    // =========================================================================
    /**
     * Simplified Wyckoff detection based on price-volume-structure.
     * Returns one of: ACCUMULATION | MARKUP | DISTRIBUTION | MARKDOWN | RANGING
     */
    function detectWyckoff(candles, swingData) {
        if (candles.length < 40) return { phase: 'RANGING', confidence: 30, detail: 'Insufficient data' };

        const { highs, lows } = swingData;
        const recent = candles.slice(-40);
        const currentPrice  = candles[candles.length - 1].close;
        const avgVolRecent  = avgVol(recent, 20);
        const avgVolEarly   = avgVol(candles.slice(-80, -40), 20);

        // Price structure
        const recentHighs   = highs.filter(h => h.idx >= candles.length - 40);
        const recentLows    = lows.filter(l  => l.idx >= candles.length - 40);

        const highsAscending = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].price > recentHighs[0].price;
        const lowsAscending  = recentLows.length  >= 2 && recentLows[recentLows.length - 1].price  > recentLows[0].price;
        const highsDesc      = recentHighs.length >= 2 && recentHighs[recentHighs.length - 1].price < recentHighs[0].price;
        const lowsDesc       = recentLows.length  >= 2 && recentLows[recentLows.length - 1].price  < recentLows[0].price;

        const volRising  = avgVolRecent > avgVolEarly * 1.2;
        const volFalling = avgVolRecent < avgVolEarly * 0.8;

        // Price range compression in last 20 candles (ranging/base)
        const last20      = candles.slice(-20);
        const rangeHigh   = Math.max(...last20.map(c => c.high));
        const rangeLow    = Math.min(...last20.map(c => c.low));
        const rangeWidth  = (rangeHigh - rangeLow) / rangeLow;
        const compressed  = rangeWidth < 0.05;

        let phase = 'RANGING', confidence = 40, detail = '';

        if (highsAscending && lowsAscending && volRising) {
            phase = 'MARKUP'; confidence = 78;
            detail = 'HH + HL struktur dengan volume naik → fase MARKUP';
        } else if (highsDesc && lowsDesc && volRising) {
            phase = 'MARKDOWN'; confidence = 75;
            detail = 'LH + LL struktur dengan volume naik → fase MARKDOWN';
        } else if (compressed && volFalling && lowsAscending) {
            phase = 'ACCUMULATION'; confidence = 70;
            detail = 'Konsolidasi sempit, volume rendah, lows naik → AKUMULASI';
        } else if (compressed && volFalling && highsDesc) {
            phase = 'DISTRIBUTION'; confidence = 67;
            detail = 'Konsolidasi sempit, volume rendah, highs turun → DISTRIBUSI';
        } else if (compressed) {
            phase = 'RANGING'; confidence = 55;
            detail = 'Range konsolidasi — menunggu breakout';
        } else {
            detail = 'Struktur transisi — tidak jelas';
        }

        return { phase, confidence, detail, rangeWidth: +(rangeWidth * 100).toFixed(2) };
    }


    // =========================================================================
    // 3.  FIBONACCI CONFLUENCE
    // =========================================================================
    const FIB_LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.272, 1.618];

    /**
     * Calculates Fibonacci retracement/extension from the most recent
     * significant swing (last major swing low → swing high, or vice versa).
     */
    function calcFibLevels(candles, swingData) {
        const { highs, lows } = swingData;
        if (!highs.length || !lows.length) return { levels: [], direction: 'none' };

        const lastHigh = highs[highs.length - 1];
        const lastLow  = lows[lows.length - 1];

        // Determine which came last
        const bullish = lastLow.idx < lastHigh.idx;
        const base  = bullish ? lastLow.price  : lastHigh.price;
        const peak  = bullish ? lastHigh.price : lastLow.price;
        const diff  = peak - base;
        const currentPrice = candles[candles.length - 1].close;
        const atrVal = atr(candles, 14);

        const levels = FIB_LEVELS.map(ratio => {
            const price = bullish
                ? peak - diff * ratio          // retracement (long setup)
                : base + diff * ratio;          // retracement (short setup)

            const dist = Math.abs(currentPrice - price);
            const isActive = dist < atrVal * 1.5;   // within 1.5 ATR = confluence zone
            const zone = isActive ? 'ACTIVE' : dist < atrVal * 3 ? 'NEAR' : 'FAR';

            return { ratio, price, zone, dist: +dist.toFixed(8), isActive };
        });

        // Extension levels (from base to peak)
        const extensions = [1.272, 1.618, 2.0, 2.618].map(ratio => {
            const price = bullish ? base + diff * ratio : peak - diff * ratio;
            return { ratio, price, type: 'extension' };
        });

        const activeLevels = levels.filter(l => l.isActive);
        const strongestFib = activeLevels.sort((a, b) =>
            Math.abs(b.ratio - 0.618) - Math.abs(a.ratio - 0.618)
        )[0] || null;

        return {
            direction: bullish ? 'bullish' : 'bearish',
            swing:     { base, peak, diff },
            levels,
            extensions,
            activeLevels,
            strongestFib,
            confluenceScore: clamp(activeLevels.length * 20),
        };
    }


    // =========================================================================
    // 4.  LIQUIDITY POOLS
    // =========================================================================
    /**
     * Liquidity clusters above swing highs (sell-side stops / buy liquidity)
     * and below swing lows (buy-side stops / sell liquidity).
     *
     * Also detects equal highs / equal lows (price magnet zones).
     */
    function detectLiquidityPools(candles, swingData) {
        const { highs, lows } = swingData;
        const pools = [];
        const price = candles[candles.length - 1].close;
        const atrVal = atr(candles, 14);

        // Sell-side liquidity above swing highs (stop hunts target these)
        highs.slice(-10).forEach(h => {
            const dist = h.price - price;
            pools.push({
                type:     'sell-side',
                price:    h.price,
                level:    +(h.price * 1.002).toFixed(8), // 0.2% above = stop cluster
                dist:     +dist.toFixed(8),
                distAtr:  +(dist / atrVal).toFixed(2),
                swept:    price >= h.price,
                label:    `SSL ${(dist / price * 100).toFixed(1)}% away`,
            });
        });

        // Buy-side liquidity below swing lows
        lows.slice(-10).forEach(l => {
            const dist = price - l.price;
            pools.push({
                type:    'buy-side',
                price:   l.price,
                level:   +(l.price * 0.998).toFixed(8),
                dist:    +dist.toFixed(8),
                distAtr: +(dist / atrVal).toFixed(2),
                swept:   price <= l.price,
                label:   `BSL ${(dist / price * 100).toFixed(1)}% away`,
            });
        });

        // Equal highs / equal lows detection (within 0.1% tolerance)
        const eqHighs = [];
        for (let i = 0; i < highs.length - 1; i++) {
            for (let j = i + 1; j < highs.length; j++) {
                if (Math.abs(highs[i].price - highs[j].price) / highs[i].price < 0.001) {
                    eqHighs.push({ price: highs[i].price, type: 'equal-high', count: 2 });
                }
            }
        }

        const eqLows = [];
        for (let i = 0; i < lows.length - 1; i++) {
            for (let j = i + 1; j < lows.length; j++) {
                if (Math.abs(lows[i].price - lows[j].price) / lows[i].price < 0.001) {
                    eqLows.push({ price: lows[i].price, type: 'equal-low', count: 2 });
                }
            }
        }

        // Nearest pool (most likely target for next sweep)
        const nearestAbove = pools.filter(p => p.type === 'sell-side' && !p.swept)
            .sort((a, b) => a.dist - b.dist)[0] || null;
        const nearestBelow = pools.filter(p => p.type === 'buy-side' && !p.swept)
            .sort((a, b) => a.dist - b.dist)[0] || null;

        return {
            pools:        pools.slice(0, 20),
            equalHighs:   eqHighs.slice(0, 5),
            equalLows:    eqLows.slice(0, 5),
            nearestAbove,
            nearestBelow,
            sweepRisk:    nearestBelow && nearestBelow.distAtr < 1.5 ? 'HIGH'
                        : nearestBelow && nearestBelow.distAtr < 3   ? 'MEDIUM' : 'LOW',
        };
    }


    // =========================================================================
    // 5.  ORDER FLOW PROXY
    // =========================================================================
    /**
     * Approximate buy/sell volume split from candle OHLCV.
     * Method: delta = (close - low) / range * volume  (buying pressure)
     *         delta = (high - close) / range * volume  (selling pressure)
     */
    function calcOrderFlow(candles, lookback = 20) {
        const slice = candles.slice(-lookback);
        let buyVol = 0, sellVol = 0;
        const cvds = [];  // cumulative volume delta

        slice.forEach(c => {
            const r = range(c) || 1;
            const buy  = ((c.close - c.low)  / r) * (c.volume || 0);
            const sell = ((c.high - c.close) / r) * (c.volume || 0);
            buyVol  += buy;
            sellVol += sell;
            cvds.push({ time: c.time, delta: buy - sell, cumDelta: buyVol - sellVol });
        });

        const totalVol    = buyVol + sellVol;
        const buyPct      = totalVol > 0 ? +(buyVol / totalVol * 100).toFixed(1) : 50;
        const imbalance   = +(buyVol - sellVol).toFixed(2);
        const trend       = cvds.length >= 5
            ? (cvds[cvds.length - 1].cumDelta > cvds[cvds.length - 5].cumDelta ? 'BUYING' : 'SELLING')
            : 'NEUTRAL';

        // Volume spike detection
        const recentVol  = candles[candles.length - 1].volume || 0;
        const avgV       = avgVol(candles, 20);
        const volSpike   = recentVol > avgV * 2.5;
        const volSpikeX  = avgV > 0 ? +(recentVol / avgV).toFixed(1) : 1;

        return { buyVol, sellVol, buyPct, imbalance, trend, cvds, volSpike, volSpikeX };
    }


    // =========================================================================
    // 6.  VOLATILITY ENGINE
    // =========================================================================
    function calcVolatility(candles) {
        const atrVal      = atr(candles, 14);
        const atrPct      = candles.length > 0
            ? +(atrVal / candles[candles.length - 1].close * 100).toFixed(2)
            : 0;

        // Bollinger Band Width (20-period)
        const bb = 20;
        if (candles.length < bb) {
            return { atr: atrVal, atrPct, bbWidth: 0, regime: 'UNKNOWN', percentile: 50 };
        }
        const slice   = candles.slice(-bb).map(c => c.close);
        const mean    = slice.reduce((a, b) => a + b, 0) / bb;
        const stdev   = Math.sqrt(slice.reduce((s, c) => s + (c - mean) ** 2, 0) / bb);
        const bbWidth = mean > 0 ? +(stdev * 4 / mean * 100).toFixed(2) : 0;  // 2*stdev*2 = full band

        // Historical ATR percentile (compare to last 50 ATR readings)
        const atrSeries = [];
        for (let i = 28; i < candles.length; i++) {
            atrSeries.push(atr(candles.slice(0, i + 1), 14));
        }
        const sorted   = [...atrSeries].sort((a, b) => a - b);
        const rank     = sorted.filter(v => v <= atrVal).length;
        const pctile   = +(rank / (sorted.length || 1) * 100).toFixed(0);

        const regime   = pctile >= 80 ? 'HIGH_VOL'
                       : pctile >= 50 ? 'NORMAL'
                       : pctile >= 20 ? 'LOW_VOL'
                       : 'SQUEEZE';

        return { atr: +atrVal.toFixed(8), atrPct, bbWidth, regime, percentile: pctile };
    }


    // =========================================================================
    // 7.  FAKE BREAKOUT DETECTOR
    // =========================================================================
    /**
     * A fakeout is: price briefly closes above a swing high (or below a swing low)
     * then reverses back inside the range within the same or next candle.
     *
     * Returns: fakeoutScore 0-100, recent fakeouts array.
     */
    function detectFakeBreakout(candles, swingData) {
        const { highs, lows } = swingData;
        const fakeouts = [];
        const lookback = Math.min(30, candles.length - 5);

        for (let i = candles.length - lookback; i < candles.length - 1; i++) {
            const c    = candles[i];
            const next = candles[i + 1];

            // Price spiked above swing high but closed back below
            const relevantHighs = highs.filter(h => h.idx < i && h.price < c.high * 1.005);
            if (relevantHighs.length) {
                const h = relevantHighs[relevantHighs.length - 1];
                if (c.high > h.price && c.close < h.price) {
                    fakeouts.push({
                        type: 'bull-trap',
                        idx: i,
                        level: h.price,
                        spikeAbove: +(c.high - h.price).toFixed(8),
                        time: c.time,
                        label: 'Bull Trap — wick above, close below',
                    });
                }
            }

            // Price spiked below swing low but closed back above
            const relevantLows = lows.filter(l => l.idx < i && l.price > c.low * 0.995);
            if (relevantLows.length) {
                const l = relevantLows[relevantLows.length - 1];
                if (c.low < l.price && c.close > l.price) {
                    fakeouts.push({
                        type: 'bear-trap',
                        idx: i,
                        level: l.price,
                        spikeBelow: +(l.price - c.low).toFixed(8),
                        time: c.time,
                        label: 'Bear Trap — wick below, close above',
                    });
                }
            }
        }

        // Score: higher = more recent fakeouts = less reliable breakouts
        const recent = fakeouts.filter(f => f.idx >= candles.length - 10);
        const fakeoutScore = clamp(recent.length * 25 + fakeouts.length * 5);

        // Last candle is a wick-based fakeout attempt?
        const lastC = candles[candles.length - 1];
        const upperWick = lastC.high - Math.max(lastC.open, lastC.close);
        const lowerWick = Math.min(lastC.open, lastC.close) - lastC.low;
        const atrVal    = atr(candles, 14);
        const isCurrentFakeout = (upperWick > atrVal * 0.5) || (lowerWick > atrVal * 0.5);

        return {
            fakeouts: fakeouts.slice(-10),
            fakeoutScore,
            recentCount: recent.length,
            isCurrentFakeout,
            reliability: fakeoutScore < 20 ? 'HIGH' : fakeoutScore < 50 ? 'MEDIUM' : 'LOW',
        };
    }


    // =========================================================================
    // 8.  PROBABILITY ENGINE (Bayesian multi-factor)
    // =========================================================================
    /**
     * Estimates probability of:
     *   - Uptrend continuation (%)
     *   - Reversal (%)
     *   - Fake breakout (%)
     *
     * Based on: BOS/CHoCH direction, Wyckoff phase, order flow,
     *           Fibonacci position, volatility regime, fakeout history.
     */
    function calcProbabilities(params) {
        const {
            wyckoff, orderFlow, fib, fakeBreakout,
            choch, bosType,   // 'bullish' | 'bearish' | 'none'
            lastCandle,
        } = params;

        // ── Uptrend probability ──────────────────────────────────────────────
        let upScore = 50;  // base

        // BOS direction
        if (bosType === 'bullish') upScore += 15;
        if (bosType === 'bearish') upScore -= 15;

        // Wyckoff
        if (wyckoff.phase === 'MARKUP')       upScore += 20;
        if (wyckoff.phase === 'ACCUMULATION') upScore += 10;
        if (wyckoff.phase === 'MARKDOWN')     upScore -= 20;
        if (wyckoff.phase === 'DISTRIBUTION') upScore -= 10;

        // Order flow
        if (orderFlow.buyPct >= 65)  upScore += 12;
        if (orderFlow.buyPct >= 55)  upScore += 6;
        if (orderFlow.buyPct <= 35)  upScore -= 12;
        if (orderFlow.buyPct <= 45)  upScore -= 6;
        if (orderFlow.trend === 'BUYING')  upScore += 8;
        if (orderFlow.trend === 'SELLING') upScore -= 8;

        // Fibonacci position
        if (fib.strongestFib) {
            const r = fib.strongestFib.ratio;
            if (fib.direction === 'bullish') {
                if (r === 0.618 || r === 0.5) upScore += 10;  // golden pocket
                if (r === 0.786) upScore += 5;
            } else {
                if (r === 0.618 || r === 0.5) upScore -= 10;
                if (r === 0.786) upScore -= 5;
            }
        }

        // CHoCH
        if (choch.length > 0) {
            if (choch[0].type === 'bullish') upScore += 15;
            if (choch[0].type === 'bearish') upScore -= 15;
        }

        upScore = clamp(upScore);

        // ── Reversal probability ─────────────────────────────────────────────
        let revScore = 100 - upScore;  // inverse base

        // Fakeout adds reversal risk
        revScore += fakeBreakout.fakeoutScore * 0.2;

        // High vol → higher reversal risk
        if (wyckoff.phase === 'DISTRIBUTION') revScore += 10;
        if (orderFlow.volSpike) revScore += 8;

        revScore = clamp(revScore);

        // ── Fake breakout probability ────────────────────────────────────────
        const fakeScore = clamp(fakeBreakout.fakeoutScore);

        // Normalise so the 3 sum near 100%
        const total = upScore + revScore + fakeScore || 100;
        const norm  = (v) => Math.round(v / total * 100);

        return {
            uptrend:      norm(upScore),
            reversal:     norm(revScore),
            fakeBreakout: norm(fakeScore),
            raw:          { upScore, revScore, fakeScore },
        };
    }


    // =========================================================================
    // 9.  MONTE-CARLO TP/SL ESTIMATOR
    // =========================================================================
    /**
     * Runs N simple random-walk simulations from current price using
     * historical volatility to estimate expected TP / SL hit probabilities.
     */
    function monteCarloTPSL(candles, direction, tpPct, slPct, iterations = 500) {
        const price   = candles[candles.length - 1].close;
        const atrVal  = atr(candles, 14);
        const stepVol = (atrVal / price) / Math.sqrt(24);  // hourly step volatility proxy

        let tpHits = 0, slHits = 0;

        const tp = price * (1 + (direction === 'LONG' ?  tpPct : -tpPct) / 100);
        const sl = price * (1 + (direction === 'LONG' ? -slPct :  slPct) / 100);

        for (let i = 0; i < iterations; i++) {
            let p = price;
            for (let step = 0; step < 48; step++) {  // 48 hours look-ahead
                // Gaussian random step (Box-Muller)
                const u1 = Math.random() || 1e-10;
                const u2 = Math.random();
                const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                p *= (1 + z * stepVol);

                if (direction === 'LONG')  { if (p >= tp) { tpHits++; break; } if (p <= sl) { slHits++; break; } }
                if (direction === 'SHORT') { if (p <= tp) { tpHits++; break; } if (p >= sl) { slHits++; break; } }
            }
        }

        return {
            tpProb: +(tpHits / iterations * 100).toFixed(1),
            slProb: +(slHits / iterations * 100).toFixed(1),
            openProb: +((iterations - tpHits - slHits) / iterations * 100).toFixed(1),
            direction, tpPct, slPct,
        };
    }


    // =========================================================================
    // 10.  CONVICTION SCORE
    // =========================================================================
    /**
     * Unified 0-100 score aggregating all MM signals.
     * Each factor contributes a weighted portion.
     */
    function calcConviction(params) {
        const {
            wyckoff, orderFlow, fib, fakeBreakout,
            volatility, probabilities, choch, bosStrength,
        } = params;

        let score = 0;
        const breakdown = {};

        // Wyckoff phase clarity (0-20)
        const wyckoffScore = wyckoff.phase === 'MARKUP'      ? 20
                           : wyckoff.phase === 'ACCUMULATION'? 15
                           : wyckoff.phase === 'MARKDOWN'    ? 10
                           : wyckoff.phase === 'DISTRIBUTION'? 10
                           : 5;
        breakdown.wyckoff = wyckoffScore * (wyckoff.confidence / 100);
        score += breakdown.wyckoff;

        // Order flow clarity (0-20)
        const ofStrength = Math.abs(orderFlow.buyPct - 50);  // 0-50
        breakdown.orderFlow = clamp(ofStrength * 0.4, 0, 20);
        score += breakdown.orderFlow;

        // Fibonacci confluence (0-15)
        breakdown.fibonacci = clamp((fib.confluenceScore || 0) * 0.15, 0, 15);
        score += breakdown.fibonacci;

        // Fakeout penalty (0 to -15 score reduction handled as inverse)
        breakdown.fakeout = clamp(15 - (fakeBreakout.fakeoutScore || 0) * 0.15, 0, 15);
        score += breakdown.fakeout;

        // BOS / CHoCH strength (0-15)
        const bosS = bosStrength || 0;
        const chochBonus = choch.length > 0 ? 8 : 0;
        breakdown.structure = clamp((bosS / 100 * 10) + chochBonus, 0, 15);
        score += breakdown.structure;

        // Volatility regime bonus (0-10)
        // Normal volatility = best for reliable signals
        breakdown.volatility = volatility.regime === 'NORMAL'   ? 10
                             : volatility.regime === 'LOW_VOL'  ? 7
                             : volatility.regime === 'SQUEEZE'  ? 5
                             : 3;  // HIGH_VOL = unreliable
        score += breakdown.volatility;

        // Probability alignment bonus (0-5)
        const maxProb = Math.max(probabilities.uptrend, probabilities.reversal);
        breakdown.probability = maxProb >= 65 ? 5 : maxProb >= 55 ? 3 : 1;
        score += breakdown.probability;

        // Clamp and round
        score = clamp(Math.round(score));

        const rating = score >= 80 ? 'VERY HIGH'
                     : score >= 65 ? 'HIGH'
                     : score >= 50 ? 'MODERATE'
                     : score >= 35 ? 'LOW'
                     : 'VERY LOW';

        return { score, rating, breakdown };
    }


    // =========================================================================
    // 11.  AI SIGNAL GENERATION
    // =========================================================================
    /**
     * Generates the final AI trade signal:
     *   STRONG LONG | LONG | SCALP LONG | WATCH | SCALP SHORT | SHORT | STRONG SHORT
     *
     * Also computes TP1/TP2/TP3/SL using ATR-based projections + Fib targets.
     */
    function generateMMSignal(candles, analysis) {
        const { conviction, probabilities, fib, volatility, wyckoff, orderFlow, liquidity, bosType } = analysis;
        const price   = candles[candles.length - 1].close;
        const atrVal  = volatility.atr || atr(candles, 14);
        const direction = probabilities.uptrend > probabilities.reversal ? 'LONG' : 'SHORT';

        // TP and SL based on ATR multiples + Fibonacci targets
        const tp1Mult = 1.5, tp2Mult = 2.5, tp3Mult = 4.0, slMult = 1.0;

        let tp1, tp2, tp3, sl;
        if (direction === 'LONG') {
            tp1 = price + atrVal * tp1Mult;
            tp2 = price + atrVal * tp2Mult;
            tp3 = fib.extensions?.[1]?.price || price + atrVal * tp3Mult;
            sl  = price - atrVal * slMult;
            // Adjust SL below nearest BSL
            if (liquidity.nearestBelow) sl = Math.min(sl, liquidity.nearestBelow.price * 0.997);
        } else {
            tp1 = price - atrVal * tp1Mult;
            tp2 = price - atrVal * tp2Mult;
            tp3 = fib.extensions?.[1]?.price || price - atrVal * tp3Mult;
            sl  = price + atrVal * slMult;
            if (liquidity.nearestAbove) sl = Math.max(sl, liquidity.nearestAbove.price * 1.003);
        }

        const rr = Math.abs(tp2 - price) / Math.abs(sl - price);

        // Signal label
        let signalLabel;
        const s = conviction.score;
        if (direction === 'LONG') {
            signalLabel = s >= 75 ? 'STRONG LONG' : s >= 60 ? 'LONG' : s >= 45 ? 'SCALP LONG' : 'WATCH';
        } else {
            signalLabel = s >= 75 ? 'STRONG SHORT' : s >= 60 ? 'SHORT' : s >= 45 ? 'SCALP SHORT' : 'WATCH';
        }

        // Entry zone: FVG or ATR-based
        const entryLow  = direction === 'LONG'
            ? (fib.activeLevels?.[0]?.price || price - atrVal * 0.3)
            : price;
        const entryHigh = direction === 'LONG'
            ? price
            : (fib.activeLevels?.[0]?.price || price + atrVal * 0.3);

        return {
            signal:    signalLabel,
            direction,
            conviction: conviction.score,
            entry:      +price.toFixed(8),
            entryLow:   +entryLow.toFixed(8),
            entryHigh:  +entryHigh.toFixed(8),
            tp1:        +tp1.toFixed(8),
            tp2:        +tp2.toFixed(8),
            tp3:        +tp3.toFixed(8),
            sl:         +sl.toFixed(8),
            rr:         +rr.toFixed(2),
            tp1Pct:     +((tp1 - price) / price * 100 * (direction === 'LONG' ? 1 : -1)).toFixed(2),
            tp2Pct:     +((tp2 - price) / price * 100 * (direction === 'LONG' ? 1 : -1)).toFixed(2),
            tp3Pct:     +((tp3 - price) / price * 100 * (direction === 'LONG' ? 1 : -1)).toFixed(2),
            slPct:      +((sl  - price) / price * 100 * (direction === 'LONG' ? -1 : 1)).toFixed(2),
            timeframe:  s >= 65 ? 'SWING (4h–1d)' : 'SCALP (15m–4h)',
            expiryH:    s >= 65 ? 48 : 12,
        };
    }


    // =========================================================================
    // MAIN ANALYZE FUNCTION
    // =========================================================================

    /**
     * analyze
     * Full Market Maker analysis pipeline on OHLCV candles.
     *
     * @param   {Array}  candles  — OHLCV: { time, open, high, low, close, volume }
     * @param   {Object} options  — { bosType, bosStrength } — pass from smc-engine if available
     * @returns {Object} Full analysis result
     */
    function analyze(candles, options = {}) {
        if (!Array.isArray(candles) || candles.length < 20) {
            return { error: 'Need at least 20 candles', conviction: { score: 0 } };
        }

        const swingData     = swings(candles, 3);
        const choch         = detectCHOCH(candles, swingData);
        const wyckoff       = detectWyckoff(candles, swingData);
        const fib           = calcFibLevels(candles, swingData);
        const liquidity     = detectLiquidityPools(candles, swingData);
        const orderFlow     = calcOrderFlow(candles, 20);
        const volatility    = calcVolatility(candles);
        const fakeBreakout  = detectFakeBreakout(candles, swingData);

        const bosType       = options.bosType     || 'none';
        const bosStrength   = options.bosStrength || 0;

        const probabilities = calcProbabilities({
            wyckoff, orderFlow, fib, fakeBreakout, choch, bosType,
            lastCandle: candles[candles.length - 1],
        });

        const conviction = calcConviction({
            wyckoff, orderFlow, fib, fakeBreakout,
            volatility, probabilities, choch, bosStrength,
        });

        const analysis = {
            swings: swingData, choch, wyckoff, fib, liquidity,
            orderFlow, volatility, fakeBreakout, probabilities, conviction,
            bosType, bosStrength,
        };

        const signal  = generateMMSignal(candles, analysis);

        // Monte-Carlo for the generated signal
        const mc = monteCarloTPSL(
            candles, signal.direction,
            Math.abs(signal.tp2Pct), Math.abs(signal.slPct), 300
        );

        return {
            ...analysis,
            signal,
            monteCarlo: mc,
            meta: {
                candleCount: candles.length,
                analyzedAt:  new Date().toISOString(),
                engineVersion: 'mm-engine v1.0',
            },
        };
    }


    // =========================================================================
    // PUBLIC API
    // =========================================================================
    return {
        analyze,
        detectCHOCH,
        detectWyckoff,
        calcFibLevels,
        detectLiquidityPools,
        calcOrderFlow,
        calcVolatility,
        detectFakeBreakout,
        calcProbabilities,
        monteCarloTPSL,
        calcConviction,
        generateMMSignal,
    };

})();

// Node.js / CommonJS export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MMEngine;
}
