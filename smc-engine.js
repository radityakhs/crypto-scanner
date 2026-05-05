/**
 * smc-engine.js — HollowCat Smart Money Concepts Engine
 * -------------------------------------------------------
 * Detects high-quality FVG (Fair Value Gap) and BOS (Break of Structure)
 * from OHLC candle data. Pure JavaScript, no dependencies.
 *
 * Author: HollowCat AI (@hollowcatai)
 * Usage:  const result = SmcEngine.analyze(candles);
 */

'use strict';

const SmcEngine = (function () {

    // =========================================================================
    // UTILS
    // =========================================================================

    /** Candle body size (absolute) */
    function bodySize(c) { return Math.abs(c.close - c.open); }

    /** Candle full range (high - low) */
    function range(c) { return c.high - c.low; }

    /** Body-to-range ratio 0..1 */
    function bodyRatio(c) {
        const r = range(c);
        return r === 0 ? 0 : bodySize(c) / r;
    }

    /** Is the candle bullish? */
    function isBull(c) { return c.close > c.open; }

    /** Is the candle bearish? */
    function isBear(c) { return c.close < c.open; }

    /**
     * Average candle range over the last `n` candles before index `i`.
     * Used to filter out tiny/noise FVG gaps.
     */
    function avgRange(candles, i, n = 10) {
        const start = Math.max(0, i - n);
        const slice = candles.slice(start, i);
        if (!slice.length) return 0;
        return slice.reduce((s, c) => s + range(c), 0) / slice.length;
    }

    /**
     * Simple consolidation detector: checks if the last `lookback` candles
     * before index `i` have a combined range < 2× the average candle range.
     * Returns true if market is "chopping" (consolidation zone).
     */
    function isConsolidation(candles, i, lookback = 6) {
        const start = Math.max(0, i - lookback);
        const slice = candles.slice(start, i);
        if (slice.length < 3) return false;
        const highest = Math.max(...slice.map(c => c.high));
        const lowest  = Math.min(...slice.map(c => c.low));
        const zoneSize = highest - lowest;
        const avg = avgRange(candles, i, lookback);
        // Consolidation: entire zone fits within 2× avg candle range
        return zoneSize < avg * 2;
    }


    // =========================================================================
    // 1. FVG DETECTION
    // =========================================================================

    /**
     * detectFVG
     * Scans all valid 3-candle windows and returns FVG zones.
     *
     * @param  {Array}  candles  — Full OHLC array
     * @param  {number} minGapMultiplier — Gap must be > avgRange * this value
     * @returns {Array} fvgZones
     */
    function detectFVG(candles, minGapMultiplier = 0.5) {
        const zones = [];

        for (let i = 2; i < candles.length; i++) {
            const c1 = candles[i - 2];
            const c2 = candles[i - 1];
            const c3 = candles[i];

            const avg = avgRange(candles, i, 10);
            const minGap = avg * minGapMultiplier;

            // ── Bullish FVG ─────────────────────────────────────────────────
            // c1.high < c3.low  →  gap between top of c1 and bottom of c3
            // c2 must be strong bullish (body > 60% of range)
            const bullGap = c3.low - c1.high;
            if (
                bullGap > 0 &&
                bullGap > minGap &&
                isBull(c2) &&
                bodyRatio(c2) > 0.60 &&
                !isConsolidation(candles, i - 1, 6)
            ) {
                const strength = calcFvgStrength(c2, bullGap, avg);
                zones.push({
                    type:      'bullish',
                    // Zone boundary: top of c1 → bottom of c3
                    bottom:    c1.high,
                    top:       c3.low,
                    gapSize:   bullGap,
                    strength,
                    candleIdx: i - 1,   // index of the impulse candle (c2)
                    time:      c2.time,
                    filled:    false,    // updated later by fill-check
                });
            }

            // ── Bearish FVG ─────────────────────────────────────────────────
            // c1.low > c3.high  →  gap between bottom of c1 and top of c3
            // c2 must be strong bearish (body > 60% of range)
            const bearGap = c1.low - c3.high;
            if (
                bearGap > 0 &&
                bearGap > minGap &&
                isBear(c2) &&
                bodyRatio(c2) > 0.60 &&
                !isConsolidation(candles, i - 1, 6)
            ) {
                const strength = calcFvgStrength(c2, bearGap, avg);
                zones.push({
                    type:      'bearish',
                    top:       c1.low,
                    bottom:    c3.high,
                    gapSize:   bearGap,
                    strength,
                    candleIdx: i - 1,
                    time:      c2.time,
                    filled:    false,
                });
            }
        }

        // Mark FVGs that have been filled by subsequent price action
        return markFilledFVG(zones, candles);
    }

    /**
     * Strength score 0–100 for an FVG zone.
     * Factors: impulse body ratio, gap size vs avg range.
     */
    function calcFvgStrength(impulseCandle, gapSize, avgRng) {
        const bodyScore = Math.min(bodyRatio(impulseCandle) * 100, 100); // 0–100
        const sizeScore = Math.min((gapSize / (avgRng || 1)) * 50, 100); // 0–100
        return Math.round((bodyScore * 0.6) + (sizeScore * 0.4));
    }

    /**
     * After all FVGs are detected, check if subsequent candles have
     * "filled" each zone (price traded back through the gap).
     */
    function markFilledFVG(zones, candles) {
        return zones.map(z => {
            const startIdx = z.candleIdx + 2; // start checking after c3
            for (let i = startIdx; i < candles.length; i++) {
                const c = candles[i];
                if (z.type === 'bullish' && c.low <= z.bottom) {
                    return { ...z, filled: true, filledAt: c.time };
                }
                if (z.type === 'bearish' && c.high >= z.top) {
                    return { ...z, filled: true, filledAt: c.time };
                }
            }
            return z;
        });
    }


    // =========================================================================
    // 2. SWING DETECTION (Fractal Logic)
    // =========================================================================

    /**
     * detectSwings
     * Uses a 2-candle lookback/lookahead fractal to find swing highs and lows.
     *
     * @param  {Array} candles
     * @param  {number} lookback — candles on each side required (default 2)
     * @returns {{ highs: Array, lows: Array }}
     */
    function detectSwings(candles, lookback = 2) {
        const highs = [];
        const lows  = [];

        for (let i = lookback; i < candles.length - lookback; i++) {
            const c = candles[i];

            // ── Swing High ──────────────────────────────────────────────────
            let isSwingHigh = true;
            for (let j = 1; j <= lookback; j++) {
                if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) {
                    isSwingHigh = false;
                    break;
                }
            }
            if (isSwingHigh) {
                highs.push({ idx: i, price: c.high, time: c.time });
            }

            // ── Swing Low ───────────────────────────────────────────────────
            let isSwingLow = true;
            for (let j = 1; j <= lookback; j++) {
                if (candles[i - j].low <= c.low || candles[i + j].low <= c.low) {
                    isSwingLow = false;
                    break;
                }
            }
            if (isSwingLow) {
                lows.push({ idx: i, price: c.low, time: c.time });
            }
        }

        return { highs, lows };
    }


    // =========================================================================
    // 3. BOS DETECTION
    // =========================================================================

    /**
     * detectBOS
     * Scans for Break of Structure events using confirmed closes.
     *
     * Bullish BOS: close above previous swing high, strong breakout candle.
     * Bearish BOS: close below previous swing low, strong breakout candle.
     *
     * @param  {Array} candles
     * @param  {{ highs: Array, lows: Array }} swings
     * @returns {Array} bosEvents
     */
    function detectBOS(candles, swings) {
        const events = [];

        for (let i = 3; i < candles.length; i++) {
            const c = candles[i];

            // Find last swing high BEFORE current candle
            const prevHighs = swings.highs.filter(sh => sh.idx < i - 1);
            const prevLows  = swings.lows.filter(sl => sl.idx < i - 1);

            // ── Bullish BOS ─────────────────────────────────────────────────
            if (prevHighs.length > 0) {
                const lastHigh = prevHighs[prevHighs.length - 1];
                if (
                    c.close > lastHigh.price &&           // close confirms break
                    isBull(c) &&                           // bullish candle
                    bodyRatio(c) > 0.50                    // strong body
                ) {
                    // Avoid duplicate BOS on same swing high
                    const alreadyBroken = events.some(
                        e => e.type === 'bullish' && e.swingPrice === lastHigh.price
                    );
                    if (!alreadyBroken) {
                        events.push({
                            type:         'bullish',
                            idx:          i,
                            time:         c.time,
                            swingPrice:   lastHigh.price,
                            swingTime:    lastHigh.time,
                            breakPrice:   c.close,
                            bodyRatio:    bodyRatio(c),
                            strength:     calcBosStrength(c, lastHigh.price),
                        });
                    }
                }
            }

            // ── Bearish BOS ─────────────────────────────────────────────────
            if (prevLows.length > 0) {
                const lastLow = prevLows[prevLows.length - 1];
                if (
                    c.close < lastLow.price &&             // close confirms break
                    isBear(c) &&                            // bearish candle
                    bodyRatio(c) > 0.50                    // strong body
                ) {
                    const alreadyBroken = events.some(
                        e => e.type === 'bearish' && e.swingPrice === lastLow.price
                    );
                    if (!alreadyBroken) {
                        events.push({
                            type:         'bearish',
                            idx:          i,
                            time:         c.time,
                            swingPrice:   lastLow.price,
                            swingTime:    lastLow.time,
                            breakPrice:   c.close,
                            bodyRatio:    bodyRatio(c),
                            strength:     calcBosStrength(c, lastLow.price),
                        });
                    }
                }
            }
        }

        return events;
    }

    /**
     * Strength of a BOS event 0–100.
     * Factors: body ratio, distance broken past the swing level.
     */
    function calcBosStrength(breakCandle, swingLevel) {
        const bodyScore = bodyRatio(breakCandle) * 100;
        const penetration = Math.abs(breakCandle.close - swingLevel) / swingLevel * 1000;
        const penScore = Math.min(penetration, 50);
        return Math.round(bodyScore * 0.7 + penScore * 0.3);
    }


    // =========================================================================
    // 4. SIGNAL LOGIC
    // =========================================================================

    /**
     * generateSignal
     * Combines BOS + FVG to produce a trade signal.
     *
     * LONG:  Bullish BOS confirmed + current price retracing into unfilled bullish FVG
     * SHORT: Bearish BOS confirmed + current price retracing into unfilled bearish FVG
     *
     * Scoring:
     *   +20  Confirmed BOS
     *   +20  Price inside FVG (retracement entry)
     *   +15  Strong BOS candle (bodyRatio > 0.7)
     *   +15  Strong FVG (strength > 70)
     *   +15  Volume increasing (volume > avg of last 5)
     *   +15  Clean structure (only 1 BOS in same direction recently)
     *
     * @param  {Array} candles
     * @param  {Array} fvgZones
     * @param  {Array} bosEvents
     * @returns {{ signal, confidence, reason, entryZone, bos, fvg }}
     */
    function generateSignal(candles, fvgZones, bosEvents) {
        if (!candles.length || !bosEvents.length) {
            return { signal: 'NONE', confidence: 0, reason: 'Insufficient data' };
        }

        const last   = candles[candles.length - 1];
        const price  = last.close;

        // Only consider BOS events from the last 30 candles
        const recentBOS = bosEvents.filter(b => b.idx >= candles.length - 30);
        if (!recentBOS.length) {
            return { signal: 'NONE', confidence: 0, reason: 'No recent BOS detected' };
        }

        const lastBOS = recentBOS[recentBOS.length - 1];
        const unfilled = fvgZones.filter(z => !z.filled);

        // ── LONG Setup ───────────────────────────────────────────────────────
        if (lastBOS.type === 'bullish') {
            // Look for an unfilled bullish FVG that price is currently inside or approaching
            const matchFVG = unfilled
                .filter(z => z.type === 'bullish' && z.candleIdx <= lastBOS.idx)
                .sort((a, b) => b.strength - a.strength)[0];

            const inFVG = matchFVG && price >= matchFVG.bottom && price <= matchFVG.top;
            const nearFVG = matchFVG && price > matchFVG.top && price < matchFVG.top * 1.01;

            if (matchFVG && (inFVG || nearFVG)) {
                const score = calcSignalScore(candles, lastBOS, matchFVG, 'bullish');
                return {
                    signal:     'LONG',
                    confidence: score.total,
                    reason:     buildReason('LONG', lastBOS, matchFVG, score),
                    entryZone:  { low: matchFVG.bottom, high: matchFVG.top },
                    bos:        lastBOS,
                    fvg:        matchFVG,
                    scores:     score.breakdown,
                };
            }
            return {
                signal:     'NONE',
                confidence: 25,
                reason:     `Bullish BOS at ${lastBOS.swingPrice.toFixed(4)} — waiting for retracement into FVG`,
                bos:        lastBOS,
            };
        }

        // ── SHORT Setup ──────────────────────────────────────────────────────
        if (lastBOS.type === 'bearish') {
            const matchFVG = unfilled
                .filter(z => z.type === 'bearish' && z.candleIdx <= lastBOS.idx)
                .sort((a, b) => b.strength - a.strength)[0];

            const inFVG   = matchFVG && price <= matchFVG.top && price >= matchFVG.bottom;
            const nearFVG = matchFVG && price < matchFVG.bottom && price > matchFVG.bottom * 0.99;

            if (matchFVG && (inFVG || nearFVG)) {
                const score = calcSignalScore(candles, lastBOS, matchFVG, 'bearish');
                return {
                    signal:     'SHORT',
                    confidence: score.total,
                    reason:     buildReason('SHORT', lastBOS, matchFVG, score),
                    entryZone:  { low: matchFVG.bottom, high: matchFVG.top },
                    bos:        lastBOS,
                    fvg:        matchFVG,
                    scores:     score.breakdown,
                };
            }
            return {
                signal:     'NONE',
                confidence: 25,
                reason:     `Bearish BOS at ${lastBOS.swingPrice.toFixed(4)} — waiting for retracement into FVG`,
                bos:        lastBOS,
            };
        }

        return { signal: 'NONE', confidence: 0, reason: 'No confirmed BOS + FVG confluence' };
    }

    /**
     * Score the signal 0–100.
     */
    function calcSignalScore(candles, bos, fvg, direction) {
        const breakdown = {};
        let total = 0;

        // Confirmed BOS
        breakdown.bos = 20; total += 20;

        // Price inside FVG
        breakdown.fvgEntry = 20; total += 20;

        // Strong BOS candle
        if (bos.bodyRatio > 0.70) { breakdown.strongBos = 15; total += 15; }
        else if (bos.bodyRatio > 0.55) { breakdown.strongBos = 8; total += 8; }
        else { breakdown.strongBos = 0; }

        // Strong FVG zone
        if (fvg.strength > 70) { breakdown.strongFvg = 15; total += 15; }
        else if (fvg.strength > 50) { breakdown.strongFvg = 8; total += 8; }
        else { breakdown.strongFvg = 0; }

        // Volume increasing
        const last5 = candles.slice(-5);
        const avgVol = last5.reduce((s, c) => s + (c.volume || 0), 0) / last5.length;
        const lastVol = candles[candles.length - 1].volume || 0;
        if (lastVol > avgVol * 1.2) { breakdown.volume = 15; total += 15; }
        else if (lastVol > avgVol)   { breakdown.volume = 8; total += 8; }
        else                          { breakdown.volume = 0; }

        // Clean structure: only 1 BOS in this direction in the last 20 candles
        // (passed in via bos.cleanStructure if pre-computed, or skip)
        if (bos.strength > 60) { breakdown.cleanStructure = 15; total += 15; }
        else                    { breakdown.cleanStructure = 5; total += 5; }

        return { total: Math.min(total, 100), breakdown };
    }

    /**
     * Build human-readable reason string.
     */
    function buildReason(dir, bos, fvg, score) {
        const parts = [];
        parts.push(`${dir === 'LONG' ? 'Bullish' : 'Bearish'} BOS confirmed at ${bos.swingPrice.toFixed(4)}`);
        parts.push(`price retrace into ${fvg.type} FVG zone [${fvg.bottom.toFixed(4)} – ${fvg.top.toFixed(4)}]`);
        if (score.breakdown.volume > 0) parts.push('volume increasing');
        if (score.breakdown.strongBos >= 15) parts.push('strong impulse candle');
        if (score.breakdown.strongFvg >= 15) parts.push('high-quality FVG');
        return parts.join(' · ');
    }


    // =========================================================================
    // 5. MAIN ANALYZE FUNCTION
    // =========================================================================

    /**
     * analyze
     * Full SMC analysis pipeline.
     *
     * @param  {Array}  candles  — OHLC array: { time, open, high, low, close, volume? }
     * @param  {Object} options  — { minGapMultiplier, swingLookback }
     * @returns {{
     *   fvgZones: Array,
     *   swings:   { highs, lows },
     *   bosEvents: Array,
     *   signal:   Object,
     *   meta:     Object
     * }}
     */
    function analyze(candles, options = {}) {
        const {
            minGapMultiplier = 0.5,
            swingLookback    = 2,
        } = options;

        if (!Array.isArray(candles) || candles.length < 10) {
            return {
                fvgZones:  [],
                swings:    { highs: [], lows: [] },
                bosEvents: [],
                signal:    { signal: 'NONE', confidence: 0, reason: 'Need at least 10 candles' },
                meta:      { candleCount: candles?.length || 0 },
            };
        }

        const fvgZones  = detectFVG(candles, minGapMultiplier);
        const swings    = detectSwings(candles, swingLookback);
        const bosEvents = detectBOS(candles, swings);
        const signal    = generateSignal(candles, fvgZones, bosEvents);

        return {
            fvgZones,
            swings,
            bosEvents,
            signal,
            meta: {
                candleCount:      candles.length,
                fvgCount:         fvgZones.length,
                unfilledFvg:      fvgZones.filter(z => !z.filled).length,
                bosCount:         bosEvents.length,
                swingHighCount:   swings.highs.length,
                swingLowCount:    swings.lows.length,
                analyzedAt:       new Date().toISOString(),
            },
        };
    }


    // =========================================================================
    // PUBLIC API
    // =========================================================================
    return {
        analyze,
        detectFVG,
        detectSwings,
        detectBOS,
        generateSignal,
        // Expose utils for testing
        _utils: { bodySize, bodyRatio, range, avgRange, isBull, isBear },
    };

})();

// Export for Node.js / proxy-server
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmcEngine;
}
