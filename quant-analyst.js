// ══════════════════════════════════════════════════════════════════════════════
//  Quant Analyst v2 — Elite Institutional-Grade Analysis Engine
//  Metodologi: Hedge Fund + Prop Trading + Crypto Quant Fund
//
//  ENGINE 1 : Market Structure    — HH/HL/LH/LL · BOS · CHoCH
//  ENGINE 2 : Liquidity Model     — Stop clusters · Sweep prob · Equal H/L
//  ENGINE 3 : Supply & Demand     — Institutional origin zones (S/D)
//  ENGINE 4 : Volume Profile      — POC · VAH · VAL · High-vol nodes
//  ENGINE 5 : Order Flow          — CVD · Delta · Imbalance ratio · Absorption
//  ENGINE 6 : Whale Activity      — Volume spike · OBV · Exchange flow proxy
//  ENGINE 7 : Volatility Model    — ATR-14 · Bollinger BW · Rolling Std Dev
//  ENGINE 8 : Monte Carlo (GBM)   — 500 paths · 7d · P10–P90 distribution
//  ENGINE 9 : Directional Prob    — 9-model weighted ensemble
//  ENGINE 10: Trade Decision      — Entry zone · SL · TP1/2/3 · R:R
//
//  Data source: CoinGecko /market_chart (30d daily OHLCV)
//  No extra API calls — pure math on existing fetched data
// ══════════════════════════════════════════════════════════════════════════════

const quantAnalyst = (() => {
    'use strict';

    // ══════════════════════════════════════════════════════════════════════
    //  UTILITY HELPERS
    // ══════════════════════════════════════════════════════════════════════
    const mean   = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
    const stdDev = arr => { const m = mean(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); };
    const clamp  = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    function randn() { // Box-Muller for Monte Carlo
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ENGINE 1 — SWING DETECTION
    // ══════════════════════════════════════════════════════════════════════
    function detectSwings(prices, strength = 5) {
        const highs = []; // { idx, price }
        const lows  = [];

        for (let i = strength; i < prices.length - strength; i++) {
            const slice = prices.slice(i - strength, i + strength + 1);
            const center = prices[i];

            if (center === Math.max(...slice)) highs.push({ idx: i, price: center });
            if (center === Math.min(...slice)) lows.push( { idx: i, price: center });
        }

        return { highs, lows };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ENGINE 1 — MARKET STRUCTURE (HH/HL/LH/LL · BOS · CHoCH)
    // ══════════════════════════════════════════════════════════════════════
    function analyzeMarketStructure(prices) {
        if (!prices || prices.length < 15) {
            return {
                trend: 'insufficient_data', pattern: [], bos: 'none', choch: false,
                lastHighs: [], lastLows: [], structureQuality: 0,
                currentPrice: prices?.at(-1) || 0, lastSwingHigh: 0, lastSwingLow: Infinity
            };
        }
        const { highs, lows } = detectSwings(prices, 5);
        const last3H = highs.slice(-3).map(h => h.price);
        const last3L = lows.slice(-3).map(l => l.price);
        const pattern = [];
        for (let i = 1; i < last3H.length; i++) pattern.push(last3H[i] > last3H[i - 1] ? 'HH' : 'LH');
        for (let i = 1; i < last3L.length; i++) pattern.push(last3L[i] > last3L[i - 1] ? 'HL' : 'LL');
        const hhC = pattern.filter(p => p === 'HH').length, hlC = pattern.filter(p => p === 'HL').length;
        const lhC = pattern.filter(p => p === 'LH').length, llC = pattern.filter(p => p === 'LL').length;
        let trend;
        if      (hhC >= 1 && hlC >= 1) trend = 'uptrend';
        else if (lhC >= 1 && llC >= 1) trend = 'downtrend';
        else if (hhC >= 1 && llC >= 1) trend = 'reversal_top';
        else if (lhC >= 1 && hlC >= 1) trend = 'reversal_bottom';
        else                            trend = 'consolidation';
        const currentPrice  = prices.at(-1);
        const lastSwingHigh = last3H.at(-1) || 0;
        const lastSwingLow  = last3L.at(-1) || Infinity;
        let bos = 'none';
        if (currentPrice > lastSwingHigh) bos = 'bullish_bos';
        else if (currentPrice < lastSwingLow) bos = 'bearish_bos';
        const choch = (trend === 'uptrend' && bos === 'bearish_bos') || (trend === 'downtrend' && bos === 'bullish_bos');
        const cleanHH = last3H.length >= 2 && last3H.every((h, i) => i === 0 || h > last3H[i - 1]);
        const cleanHL = last3L.length >= 2 && last3L.every((l, i) => i === 0 || l > last3L[i - 1]);
        const cleanLL = last3L.length >= 2 && last3L.every((l, i) => i === 0 || l < last3L[i - 1]);
        const structureQuality = trend === 'uptrend' ? (cleanHH && cleanHL ? 90 : 60) : trend === 'downtrend' ? (cleanLL ? 85 : 55) : 35;
        return { trend, pattern, bos, choch, lastHighs: last3H, lastLows: last3L, structureQuality, currentPrice, lastSwingHigh, lastSwingLow };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ENGINE 2 — LIQUIDITY MODEL
    // ══════════════════════════════════════════════════════════════════════
    function analyzeLiquidity(prices, structure) {
        const n = prices.length;
        if (n < 20) return {
            buySideLiq: null, sellSideLiq: null, sweepProbability: 30,
            nearestPool: null, equalHighs: false, equalLows: false,
            distToBuySide: 100, distToSellSide: 100, liquidityScore: 30
        };

        const { highs, lows } = detectSwings(prices, 4);
        const recent = prices.slice(-30);

        // Buy-side liquidity: resting above recent swing highs (stops of shorts)
        const buySideLiq = highs.length ? Math.max(...highs.slice(-3).map(h => h.price)) : null;
        // Sell-side liquidity: resting below recent swing lows (stops of longs)
        const sellSideLiq = lows.length  ? Math.min(...lows.slice(-3).map(l => l.price)) : null;

        const currentPrice = prices[n - 1];

        // Equal highs: multiple highs within 0.5% of each other = strong stop cluster
        const recentHighPrices = highs.slice(-5).map(h => h.price);
        const equalHighs = recentHighPrices.length >= 2 &&
            recentHighPrices.some((h, i) => i > 0 && Math.abs(h - recentHighPrices[i - 1]) / recentHighPrices[i - 1] < 0.005);

        const recentLowPrices = lows.slice(-5).map(l => l.price);
        const equalLows = recentLowPrices.length >= 2 &&
            recentLowPrices.some((l, i) => i > 0 && Math.abs(l - recentLowPrices[i - 1]) / recentLowPrices[i - 1] < 0.005);

        // Nearest liquidity pool to current price
        const distToBuy  = buySideLiq  ? Math.abs(currentPrice - buySideLiq)  / currentPrice : Infinity;
        const distToSell = sellSideLiq ? Math.abs(currentPrice - sellSideLiq) / currentPrice : Infinity;
        const nearestPool = distToBuy < distToSell ? buySideLiq : sellSideLiq;

        // Sweep probability: how close price is to a liquidity pool (within 2%)
        const nearestDist = Math.min(distToBuy, distToSell);
        const sweepProbability = Math.min(90, Math.round(50 + (1 - Math.min(nearestDist, 0.05) / 0.05) * 40));

        return {
            buySideLiq, sellSideLiq, sweepProbability, nearestPool,
            equalHighs, equalLows,
            distToBuySide:  Math.round(distToBuy * 100),
            distToSellSide: Math.round(distToSell * 100),
            liquidityScore: clamp(Math.round((equalHighs ? 30 : 0) + (equalLows ? 30 : 0) + (1 - Math.min(nearestDist, 0.1) / 0.1) * 40), 0, 100)
        };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ENGINE 3 — SUPPLY & DEMAND ZONES
    //  Institutional origin: impulsive candles with above-avg volume
    // ══════════════════════════════════════════════════════════════════════
    function analyzeSupplyDemand(prices, volumes) {
        const n = Math.min(prices.length, volumes.length);
        if (n < 10) return { supplyZones: [], demandZones: [], nearestSupply: null, nearestDemand: null };
        const avgVol = mean(volumes.slice(-n));
        const supplyZones = [], demandZones = [];
        for (let i = 2; i < n - 1; i++) {
            const p0  = prices[prices.length - n + i - 1];
            const p1  = prices[prices.length - n + i];
            const vol = volumes[volumes.length - n + i];
            const move = (p1 - p0) / p0;
            if (Math.abs(move) > 0.015 && vol > avgVol * 1.2) {
                if (move < 0) {
                    supplyZones.push({ top: +(Math.max(p0, p1) * 1.002).toFixed(8), bottom: +(Math.min(p0, p1)).toFixed(8), strength: vol / avgVol });
                } else {
                    demandZones.push({ top: +(Math.max(p0, p1)).toFixed(8), bottom: +(Math.min(p0, p1) * 0.998).toFixed(8), strength: vol / avgVol });
                }
            }
        }
        const top3Supply = supplyZones.sort((a, b) => b.strength - a.strength).slice(0, 3).sort((a, b) => b.top - a.top);
        const top3Demand = demandZones.sort((a, b) => b.strength - a.strength).slice(0, 3).sort((a, b) => b.top - a.top);
        const cur = prices.at(-1);
        const nearestSupply = top3Supply.find(z => z.bottom > cur) || null;
        const nearestDemand = [...top3Demand].reverse().find(z => z.top < cur) || null;
        return { supplyZones: top3Supply, demandZones: top3Demand, nearestSupply, nearestDemand };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ENGINE 4 — VOLUME PROFILE (POC / VAH / VAL)
    // ══════════════════════════════════════════════════════════════════════
    function analyzeVolumeProfile(prices, volumes) {
        if (!prices || !volumes || prices.length < 10) return { poc: null, vah: null, val: null, currentVsPoC: 'unknown', volumeNodes: [] };
        const n = Math.min(prices.length, volumes.length);
        const BINS = 24, pMin = Math.min(...prices.slice(-n)), pMax = Math.max(...prices.slice(-n));
        const step = (pMax - pMin) / BINS;
        if (step === 0) return { poc: null, vah: null, val: null, currentVsPoC: 'unknown', volumeNodes: [] };
        const bins = Array.from({ length: BINS }, (_, i) => ({ priceMid: pMin + (i + 0.5) * step, volume: 0 }));
        for (let i = 0; i < n; i++) {
            const p = prices[prices.length - n + i], v = volumes[volumes.length - n + i] || 0;
            bins[clamp(Math.floor((p - pMin) / step), 0, BINS - 1)].volume += v;
        }
        const totalVol = bins.reduce((s, b) => s + b.volume, 0);
        const pocBin   = bins.reduce((mx, b) => b.volume > mx.volume ? b : mx, bins[0]);
        const sortedByVol = [...bins].sort((a, b) => b.volume - a.volume);
        let vaVol = 0; const vaBins = [];
        for (const b of sortedByVol) { if (vaVol >= totalVol * 0.70) break; vaVol += b.volume; vaBins.push(b); }
        const vaP = vaBins.map(b => b.priceMid);
        const poc = pocBin.priceMid, vah = vaP.length ? Math.max(...vaP) : poc * 1.02, val = vaP.length ? Math.min(...vaP) : poc * 0.98;
        const cur = prices.at(-1);
        return {
            poc: +poc.toFixed(8), vah: +vah.toFixed(8), val: +val.toFixed(8),
            currentVsPoC: cur > poc * 1.005 ? 'above' : cur < poc * 0.995 ? 'below' : 'at',
            volumeNodes: sortedByVol.slice(1, 4).map(b => ({ price: +b.priceMid.toFixed(8), pct: +(b.volume / totalVol * 100).toFixed(1) }))
        };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ENGINE 5 — ORDER FLOW (CVD · Delta · Imbalance · Absorption)
    // ══════════════════════════════════════════════════════════════════════
    function analyzeOrderFlow(prices, volumes) {
        if (!prices || !volumes || prices.length < 5) {
            return { delta24h: 0, cvdTrend: 'neutral', absorption: false, buyPressure: 50, imbalance: 0, institutionalBias: 'neutral' };
        }
        const n = Math.min(prices.length, volumes.length);
        const deltas = [];
        for (let i = 1; i < n; i++) {
            const pDiff = prices[prices.length - n + i] - prices[prices.length - n + i - 1];
            deltas.push(pDiff >= 0 ? (volumes[volumes.length - n + i] || 0) : -(volumes[volumes.length - n + i] || 0));
        }
        const delta24h    = deltas.at(-1) || 0;
        const cvd         = deltas.slice(-10).reduce((s, d) => s + d, 0);
        const cvdTrend    = cvd > 0 ? 'positive' : cvd < 0 ? 'negative' : 'neutral';
        const upVol       = deltas.filter(d => d > 0).reduce((s, d) => s + d, 0);
        const totalV      = deltas.reduce((s, d) => s + Math.abs(d), 0);
        const buyPressure = totalV > 0 ? Math.round((upVol / totalV) * 100) : 50;
        const imbalance   = totalV > 0 ? +((upVol - (totalV - upVol)) / totalV).toFixed(3) : 0;
        const institutionalBias = imbalance > 0.2 ? 'buyer_dominance' : imbalance < -0.2 ? 'seller_dominance' : 'neutral';
        const rP = prices.slice(-6), rV = volumes.slice(-6);
        const aVol = mean(rV), pr = Math.abs(rP.at(-1) - rP[0]) / rP[0];
        const absorption = rV.at(-1) > aVol * 1.5 && pr < 0.005;
        return { delta24h: +delta24h.toFixed(2), cvdTrend, absorption, buyPressure, imbalance, institutionalBias };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ENGINE 6 — WHALE ACTIVITY (OBV · Volume spike · Exchange flow proxy)
    // ══════════════════════════════════════════════════════════════════════
    function analyzeWhaleActivity(prices, volumes, coin) {
        const n = Math.min(prices.length, volumes.length);
        if (n < 5) return { whaleBias: 'unknown', pressureScore: 50, obvTrend: 0, volumeSpike: false, exchangeFlowProxy: 'neutral', alert: null };
        const obv = [0];
        for (let i = 1; i < n; i++) {
            const pDiff = prices[prices.length - n + i] - prices[prices.length - n + i - 1];
            const v     = volumes[volumes.length - n + i] || 0;
            obv.push(obv.at(-1) + (pDiff > 0 ? v : pDiff < 0 ? -v : 0));
        }
        const obvTrend  = obv.at(-1) - obv[Math.max(0, obv.length - 7)];
        const avgVol20  = mean(volumes.slice(-20));
        const lastVol   = volumes.at(-1) || 0;
        const volRatio  = avgVol20 > 0 ? lastVol / avgVol20 : 1;
        const volumeSpike = volRatio > 1.8;
        const volMcap   = coin?.market_cap > 0 ? (coin.total_volume || 0) / coin.market_cap : 0;
        const change24h = coin?.price_change_percentage_24h || 0;
        let exchangeFlowProxy = 'neutral';
        if      (volMcap > 0.15 && change24h < -1)   exchangeFlowProxy = 'inflow_selling';
        else if (volMcap > 0.15 && change24h > 1)    exchangeFlowProxy = 'outflow_buying';
        else if (volMcap > 0.08 && change24h < -0.5) exchangeFlowProxy = 'mild_selling';
        else if (volMcap > 0.08 && change24h > 0.5)  exchangeFlowProxy = 'mild_buying';
        let pressureScore = 50;
        pressureScore += obvTrend > 0 ? 15 : -15;
        pressureScore += volumeSpike && change24h > 0 ? 15 : volumeSpike && change24h < 0 ? -15 : 0;
        pressureScore += exchangeFlowProxy === 'outflow_buying' ? 15 : exchangeFlowProxy === 'inflow_selling' ? -15
                       : exchangeFlowProxy === 'mild_buying' ? 8 : exchangeFlowProxy === 'mild_selling' ? -8 : 0;
        pressureScore = clamp(Math.round(pressureScore), 5, 95);
        const whaleBias = pressureScore >= 65 ? 'accumulation' : pressureScore <= 35 ? 'distribution' : 'neutral';
        const alert = volumeSpike
            ? (change24h > 0 ? '🐋 Volume spike + harga naik → Whale kemungkinan beli besar' : '⚠️ Volume spike + harga turun → Whale kemungkinan distribusi')
            : null;
        return { whaleBias, pressureScore, obvTrend: +obvTrend.toFixed(0), volumeSpike, volRatio: +volRatio.toFixed(2), exchangeFlowProxy, alert };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ENGINE 7 — VOLATILITY (ATR-14 · Bollinger BW · Rolling Std Dev)
    // ══════════════════════════════════════════════════════════════════════
    function analyzeVolatility(prices) {
        const n = prices.length;
        if (n < 14) return { atr: null, bollingerBw: null, rollingStd: null, phase: 'unknown', percentile: 50 };
        const trueRanges = [];
        for (let i = 1; i < n; i++) trueRanges.push(Math.abs(prices[i] - prices[i - 1]));
        const atr14      = mean(trueRanges.slice(-14));
        const atrPct     = prices.at(-1) > 0 ? (atr14 / prices.at(-1)) * 100 : 0;
        const window20   = prices.slice(-20);
        const rollingStd = stdDev(window20);
        const rollingStdPct = prices.at(-1) > 0 ? (rollingStd / prices.at(-1)) * 100 : 0;
        const sma20      = mean(window20);
        const std20      = stdDev(window20);
        const bbUpper    = sma20 + 2 * std20;
        const bbLower    = sma20 - 2 * std20;
        const bollingerBw = sma20 > 0 ? ((bbUpper - bbLower) / sma20) * 100 : 0;
        const fullStd    = stdDev(prices);
        const percentile = fullStd > 0 ? clamp(Math.round((rollingStd / fullStd) * 50 + 25), 0, 100) : 50;
        const phase      = bollingerBw < 4 ? 'contraction' : bollingerBw < 8 ? 'normal' : bollingerBw < 14 ? 'expansion' : 'high_expansion';
        return { atr: +atr14.toFixed(8), atrPct: +atrPct.toFixed(2), bollingerBw: +bollingerBw.toFixed(2), rollingStd: +rollingStd.toFixed(8), rollingStdPct: +rollingStdPct.toFixed(2), sma20: +sma20.toFixed(8), bbUpper: +bbUpper.toFixed(8), bbLower: +bbLower.toFixed(8), phase, percentile };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ENGINE 8 — MONTE CARLO (GBM · 500 paths · 7 days)
    //  S(t+1) = S(t) * exp((μ − 0.5σ²)Δt + σ√Δt * Z)
    // ══════════════════════════════════════════════════════════════════════
    function monteCarloGBM(prices, PATHS = 500, DAYS = 7) {
        if (prices.length < 10) return { p10: null, p25: null, p50: null, p75: null, p90: null, probUp: 50, mu: 0, sigma: 0, S0: prices.at(-1) };
        const logReturns = [];
        for (let i = 1; i < prices.length; i++) if (prices[i - 1] > 0) logReturns.push(Math.log(prices[i] / prices[i - 1]));
        const mu = mean(logReturns), sigma = stdDev(logReturns), S0 = prices.at(-1);
        const finalPrices = [];
        for (let p = 0; p < PATHS; p++) {
            let S = S0;
            for (let t = 0; t < DAYS; t++) S = S * Math.exp((mu - 0.5 * sigma * sigma) + sigma * randn());
            finalPrices.push(S);
        }
        finalPrices.sort((a, b) => a - b);
        const pctile = (pct) => finalPrices[Math.floor(PATHS * pct / 100)];
        return {
            p10: +pctile(10).toFixed(8), p25: +pctile(25).toFixed(8),
            p50: +pctile(50).toFixed(8), p75: +pctile(75).toFixed(8), p90: +pctile(90).toFixed(8),
            probUp: Math.round(finalPrices.filter(p => p > S0).length / PATHS * 100),
            mu: +mu.toFixed(6), sigma: +sigma.toFixed(6), S0: +S0.toFixed(8)
        };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  MAIN ANALYZE — calls all 10 engines
    // ══════════════════════════════════════════════════════════════════════
    function calcDirectionalProb(structure, liquidity, volumeProfile, orderFlow, whale, volatility, monteCarlo, coin) {
        const scores = [];
        const msScore = structure.trend === 'uptrend' ? 80 : structure.trend === 'reversal_bottom' ? 65 : structure.trend === 'consolidation' ? 50 : structure.trend === 'reversal_top' ? 35 : 20;
        scores.push({ label: 'Market Structure', score: msScore, weight: 0.25 });
        let bosScore = structure.bos === 'bullish_bos' ? 82 : structure.bos === 'bearish_bos' ? 18 : 50;
        if (structure.choch) bosScore = structure.trend === 'uptrend' ? 25 : 75;
        scores.push({ label: 'BOS / CHoCH', score: bosScore, weight: 0.12 });
        const vpScore = volumeProfile.currentVsPoC === 'above' ? 70 : volumeProfile.currentVsPoC === 'at' ? 52 : 30;
        scores.push({ label: 'Volume Profile', score: vpScore, weight: 0.15 });
        const ofScore = orderFlow.cvdTrend === 'positive' ? 72 : orderFlow.cvdTrend === 'negative' ? 28 : 50;
        const absAdj  = orderFlow.absorption ? (orderFlow.cvdTrend === 'positive' ? 8 : -8) : 0;
        scores.push({ label: 'Order Flow (CVD)', score: clamp(ofScore + absAdj, 5, 95), weight: 0.15 });
        scores.push({ label: 'Bid/Ask Imbalance', score: clamp(Math.round(50 + orderFlow.imbalance * 100), 5, 95), weight: 0.08 });
        scores.push({ label: 'Whale Activity', score: whale.pressureScore, weight: 0.10 });
        const volScore = volatility.phase === 'contraction' ? 50 : volatility.phase === 'expansion' ? (structure.trend === 'uptrend' ? 68 : 32) : volatility.phase === 'high_expansion' ? 40 : 50;
        scores.push({ label: 'Volatility Phase', score: volScore, weight: 0.05 });
        scores.push({ label: 'Monte Carlo GBM', score: monteCarlo.probUp ?? 50, weight: 0.07 });
        const change24h = coin?.price_change_percentage_24h || 0;
        scores.push({ label: 'Momentum 24h', score: clamp(Math.round(50 + change24h * 2), 5, 95), weight: 0.03 });
        const rawBullish = scores.reduce((s, m) => s + m.score * m.weight, 0);
        const bullish    = clamp(Math.round(rawBullish), 5, 95);
        return { bullish, bearish: 100 - bullish, subScores: scores, confidence: Math.round(Math.abs(bullish - 50) * 2) };
    }

    function calcTradeLevels(prices, structure, volumeProfile, dirProb, supplyDemand) {
        const currentPrice = prices.at(-1);
        const isBullish    = dirProb.bullish >= 55;
        let entryLow, entryHigh;
        if (isBullish && supplyDemand?.nearestDemand) {
            entryLow = supplyDemand.nearestDemand.bottom; entryHigh = supplyDemand.nearestDemand.top;
        } else if (!isBullish && supplyDemand?.nearestSupply) {
            entryLow = supplyDemand.nearestSupply.bottom; entryHigh = supplyDemand.nearestSupply.top;
        } else {
            entryLow  = volumeProfile.val  ? Math.min(currentPrice, volumeProfile.val)  : currentPrice * 0.98;
            entryHigh = volumeProfile.poc  ? Math.min(currentPrice * 1.005, volumeProfile.poc) : currentPrice * 1.005;
        }
        let stopLoss;
        if (isBullish) {
            stopLoss = Math.min(structure.lastSwingLow || currentPrice * 0.92, (volumeProfile.val || currentPrice * 0.95) * 0.985);
        } else {
            stopLoss = Math.max(structure.lastSwingHigh || currentPrice * 1.08, (volumeProfile.vah || currentPrice * 1.05) * 1.015);
        }
        let tp1, tp2, tp3;
        if (isBullish) {
            const r = currentPrice - stopLoss;
            tp1 = currentPrice + r * 1.5; tp2 = currentPrice + r * 2.5;
            tp3 = structure.lastSwingHigh > currentPrice ? structure.lastSwingHigh * 1.01 : currentPrice + r * 4.0;
        } else {
            const r = stopLoss - currentPrice;
            tp1 = currentPrice - r * 1.5; tp2 = currentPrice - r * 2.5;
            tp3 = structure.lastSwingLow < currentPrice ? structure.lastSwingLow * 0.99 : currentPrice - r * 4.0;
        }
        const slDist = Math.abs(currentPrice - stopLoss);
        const rr     = slDist > 0 ? +((Math.abs(tp1 - currentPrice)) / slDist).toFixed(2) : 0;
        let signal = 'WAIT', signalReason = 'Probabilitas belum cukup kuat. Tunggu konfirmasi lebih lanjut.';
        if      (dirProb.bullish > 65 && dirProb.confidence > 20) { signal = 'LONG';  signalReason = 'Probabilitas bullish kuat (>' + dirProb.bullish + '%). Masuk di zona demand / VAL.'; }
        else if (dirProb.bearish > 65 && dirProb.confidence > 20) { signal = 'SHORT'; signalReason = 'Probabilitas bearish kuat (>' + dirProb.bearish + '%). Masuk di zona supply / VAH.'; }
        const fmt = (v) => v == null || isNaN(v) ? null : v > 0.001 ? +v.toFixed(6) : +v.toFixed(10);
        return { signal, signalReason, bias: isBullish ? 'LONG' : 'SHORT', entryLow: fmt(entryLow), entryHigh: fmt(entryHigh), stopLoss: fmt(stopLoss), tp1: fmt(tp1), tp2: fmt(tp2), tp3: fmt(tp3), rr, invalidation: fmt(stopLoss) };
    }

    function analyze(coin, marketChart) {
        const pricePoints  = marketChart?.prices        || [];
        const volumePoints = marketChart?.total_volumes || [];
        const prices  = pricePoints.map(p => p[1]);
        const volumes = volumePoints.map(v => v[1]);
        if (prices.length < 10) return { error: 'insufficient_data', message: 'Data harga tidak cukup (<10 titik).' };

        const structure     = analyzeMarketStructure(prices);
        const liquidity     = analyzeLiquidity(prices, structure);
        const supplyDemand  = analyzeSupplyDemand(prices, volumes);
        const volumeProfile = analyzeVolumeProfile(prices, volumes);
        const orderFlow     = analyzeOrderFlow(prices, volumes);
        const whale         = analyzeWhaleActivity(prices, volumes, coin);
        const volatility    = analyzeVolatility(prices);
        const monteCarlo    = monteCarloGBM(prices);
        const dirProb       = calcDirectionalProb(structure, liquidity, volumeProfile, orderFlow, whale, volatility, monteCarlo, coin);
        const tradeLevels   = calcTradeLevels(prices, structure, volumeProfile, dirProb, supplyDemand);

        return { structure, liquidity, supplyDemand, volumeProfile, orderFlow, whale, volatility, monteCarlo, dirProb, tradeLevels, currentPrice: prices.at(-1), dataPoints: prices.length };
    }

    // ══════════════════════════════════════════════════════════════════════
    //  RENDER HELPERS
    // ══════════════════════════════════════════════════════════════════════
    function _fmt(v, decimals = 6) {
        if (v == null || isNaN(v)) return '—';
        if (v > 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (v > 1)    return '$' + v.toFixed(2);
        return '$' + v.toFixed(decimals);
    }
    function _pct(v) { return v == null ? '—' : v.toFixed(2) + '%'; }
    function _pbar(val, inverse = false, showVal = true) {
        const c   = Math.min(100, Math.max(0, val));
        const col = inverse
            ? (c <= 30 ? '#4ade80' : c <= 60 ? '#fbbf24' : '#f87171')
            : (c >= 70 ? '#4ade80' : c >= 40 ? '#fbbf24' : '#f87171');
        return `<div class="qa-bar-wrap"><div class="qa-bar-track"><div class="qa-bar-fill" style="width:${c}%;background:${col}"></div></div>${showVal ? `<span class="qa-bar-val" style="color:${col}">${c}%</span>` : ''}</div>`;
    }

    const TREND_LABEL = {
        uptrend:          { icon: '📈', label: 'Uptrend',       color: '#4ade80' },
        downtrend:        { icon: '📉', label: 'Downtrend',      color: '#f87171' },
        consolidation:    { icon: '➡️',  label: 'Konsolidasi',   color: '#fbbf24' },
        reversal_top:     { icon: '🔴', label: 'Reversal Atas',  color: '#f97316' },
        reversal_bottom:  { icon: '🟢', label: 'Reversal Bawah', color: '#4ade80' },
        insufficient_data:{ icon: '⚪', label: 'Data Kurang',     color: '#94a3b8' }
    };
    const BOS_LABEL = {
        bullish_bos: { icon: '💚', label: 'Bullish BOS', color: '#4ade80' },
        bearish_bos: { icon: '🔴', label: 'Bearish BOS', color: '#f87171' },
        none:        { icon: '➖',  label: 'Tidak Ada',   color: '#94a3b8' }
    };
    const CVD_LABEL = {
        positive: { icon: '📈', label: 'Positif (Bullish)', color: '#4ade80' },
        negative: { icon: '📉', label: 'Negatif (Bearish)', color: '#f87171' },
        neutral:  { icon: '➡️', label: 'Netral',            color: '#94a3b8' }
    };
    const WHALE_BIAS = {
        accumulation: { icon: '🐋', label: 'Akumulasi', color: '#4ade80' },
        distribution: { icon: '⚠️', label: 'Distribusi', color: '#f87171' },
        neutral:      { icon: '➡️', label: 'Netral',     color: '#94a3b8' },
        unknown:      { icon: '❓', label: 'Tidak Diketahui', color: '#94a3b8' }
    };
    const VOL_PHASE = {
        contraction:    { icon: '🔵', label: 'Kontraksi (squeeze)',  color: '#60a5fa' },
        normal:         { icon: '⚪', label: 'Normal',               color: '#94a3b8' },
        expansion:      { icon: '🟡', label: 'Ekspansi',             color: '#fbbf24' },
        high_expansion: { icon: '🔴', label: 'Ekspansi Tinggi',      color: '#f87171' },
        unknown:        { icon: '❓', label: '—',                    color: '#94a3b8' }
    };

    // ══════════════════════════════════════════════════════════════════════
    //  RENDER PANEL (v2)
    // ══════════════════════════════════════════════════════════════════════
    function renderPanel(result, targetEl) {
        if (!targetEl) return;
        if (result.error) { targetEl.innerHTML = `<div class="qa-error">⚠️ ${result.message}</div>`; return; }

        const { structure: s, liquidity: liq, supplyDemand: sd, volumeProfile: vp,
                orderFlow: of_, whale: wh, volatility: vol, monteCarlo: mc,
                dirProb: dp, tradeLevels: tl } = result;

        const trend   = TREND_LABEL[s.trend]      || TREND_LABEL.insufficient_data;
        const bos     = BOS_LABEL[s.bos]          || BOS_LABEL.none;
        const cvd     = CVD_LABEL[of_.cvdTrend]   || CVD_LABEL.neutral;
        const whBias  = WHALE_BIAS[wh.whaleBias]  || WHALE_BIAS.unknown;
        const volPh   = VOL_PHASE[vol.phase]       || VOL_PHASE.unknown;
        const biasCol = dp.bullish >= 55 ? '#4ade80' : '#f87171';
        const sigCol  = tl.signal === 'LONG' ? '#4ade80' : tl.signal === 'SHORT' ? '#f87171' : '#fbbf24';

        const subScoreRows = (dp.subScores || []).map(m => {
            const col = m.score >= 65 ? '#4ade80' : m.score <= 35 ? '#f87171' : '#fbbf24';
            return `<div class="qa-subscore-item">
                        <span class="qa-subscore-label">${m.label}</span>
                        <div class="qa-bar-track" style="flex:1;margin:0 8px"><div class="qa-bar-fill" style="width:${m.score}%;background:${col}"></div></div>
                        <span class="qa-subscore-weight" style="color:${col}">${m.score}% <small>(${Math.round(m.weight*100)}%)</small></span>
                    </div>`;
        }).join('');

        const sdSupplyRows = (sd?.supplyZones || []).slice(0, 3).map(z =>
            `<div class="qa-sd-zone qa-sd-zone-supply">${_fmt(z.bottom)} — ${_fmt(z.top)} <span class="qa-sd-str">${z.strength}/100</span></div>`
        ).join('') || '<div class="qa-sd-empty">Tidak ada zona terdeteksi</div>';
        const sdDemandRows = (sd?.demandZones || []).slice(0, 3).map(z =>
            `<div class="qa-sd-zone qa-sd-zone-demand">${_fmt(z.bottom)} — ${_fmt(z.top)} <span class="qa-sd-str">${z.strength}/100</span></div>`
        ).join('') || '<div class="qa-sd-empty">Tidak ada zona terdeteksi</div>';

        const mcFmt = (v) => v == null ? '—' : _fmt(v);
        const mcChange = (v) => { if (v == null || mc.S0 == null) return ''; const pct = ((v - mc.S0) / mc.S0 * 100).toFixed(1); return `<span style="color:${pct>=0?'#4ade80':'#f87171'}">(${pct>=0?'+':''}${pct}%)</span>`; };

        targetEl.innerHTML = `
        <div class="qa-wrap">

            <!-- ══ SIGNAL CARD ══ -->
            <div class="qa-signal-card" style="border-color:${sigCol}66;background:${sigCol}11">
                <div class="qa-signal-left">
                    <div class="qa-signal-label" style="color:${sigCol}">${tl.signal === 'LONG' ? '🟢 LONG' : tl.signal === 'SHORT' ? '🔴 SHORT' : '🟡 WAIT'}</div>
                    <div class="qa-signal-reason">${tl.signalReason}</div>
                </div>
                <div class="qa-signal-conf">
                    <div class="qa-dir-badge" style="background:${biasCol}22;border-color:${biasCol}66;color:${biasCol}">
                        <span>${dp.bullish >= 55 ? '🟢' : '🔴'}</span>
                        <span>${tl.bias}</span>
                        <span>${dp.bullish >= 55 ? dp.bullish : dp.bearish}%</span>
                    </div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:4px">Conf: ${dp.confidence}%</div>
                </div>
            </div>

            <!-- ══ PROB BAR ══ -->
            <div class="qa-prob-strip">
                <div class="qa-prob-bull"><span class="qa-prob-label">📈 Bullish</span><span class="qa-prob-val" style="color:#4ade80">${dp.bullish}%</span></div>
                <div class="qa-prob-bar-main">
                    <div class="qa-prob-bar-fill-bull" style="width:${dp.bullish}%"></div>
                    <div class="qa-prob-bar-fill-bear" style="width:${dp.bearish}%"></div>
                </div>
                <div class="qa-prob-bear"><span class="qa-prob-val" style="color:#f87171">${dp.bearish}%</span><span class="qa-prob-label">📉 Bearish</span></div>
            </div>

            <!-- ══ SUB-SCORES ACCORDION ══ -->
            <details class="qa-subscores-details">
                <summary class="qa-subscores-summary">🔍 9 Sub-Model Scores (klik untuk expand)</summary>
                <div class="qa-subscores-grid">${subScoreRows}</div>
            </details>

            <!-- ══ ROW 1: Market Structure + Liquidity ══ -->
            <div class="qa-grid-2col">
                <div class="qa-card">
                    <div class="qa-card-title">🏗️ Struktur Pasar</div>
                    <div class="qa-row"><span class="qa-lbl">Trend</span><span class="qa-val" style="color:${trend.color}">${trend.icon} ${trend.label}</span></div>
                    <div class="qa-row"><span class="qa-lbl">Break of Structure</span><span class="qa-val" style="color:${bos.color}">${bos.icon} ${bos.label}</span></div>
                    <div class="qa-row"><span class="qa-lbl">CHoCH</span><span class="qa-val" style="color:${s.choch ? '#f97316' : '#4ade80'}">${s.choch ? '⚠️ Terdeteksi' : '✅ Tidak'}</span></div>
                    <div class="qa-row"><span class="qa-lbl">Pola</span><span class="qa-val qa-pattern-row">${s.pattern.slice(-4).map(p => `<span class="qa-pat-chip qa-pat-${p.toLowerCase()}">${p}</span>`).join('')}</span></div>
                    <div class="qa-row"><span class="qa-lbl">Kualitas</span><span class="qa-val">${s.structureQuality}/100</span></div>
                    ${_pbar(s.structureQuality, false, false)}
                </div>
                <div class="qa-card">
                    <div class="qa-card-title">💧 Likuiditas</div>
                    <div class="qa-row"><span class="qa-lbl">Buy-Side Liq.</span><span class="qa-val qa-liq-buy">${_fmt(liq.buySideLiq)}</span></div>
                    <div class="qa-row"><span class="qa-lbl">Sell-Side Liq.</span><span class="qa-val qa-liq-sell">${_fmt(liq.sellSideLiq)}</span></div>
                    <div class="qa-row"><span class="qa-lbl">Equal Highs</span><span class="qa-val" style="color:${liq.equalHighs ? '#f97316' : '#94a3b8'}">${liq.equalHighs ? '⚠️ Terdeteksi' : '✅ Tidak'}</span></div>
                    <div class="qa-row"><span class="qa-lbl">Equal Lows</span><span class="qa-val" style="color:${liq.equalLows ? '#f97316' : '#94a3b8'}">${liq.equalLows ? '⚠️ Terdeteksi' : '✅ Tidak'}</span></div>
                    <div class="qa-row"><span class="qa-lbl">Prob. Sweep</span><span class="qa-val">${liq.sweepProbability}%</span></div>
                    ${_pbar(liq.sweepProbability, false, false)}
                </div>
            </div>

            <!-- ══ SUPPLY & DEMAND ZONES ══ -->
            <div class="qa-card qa-card-full">
                <div class="qa-card-title">🏹 Supply & Demand Zones</div>
                <div class="qa-sd-section">
                    <div>
                        <div class="qa-sd-label qa-sd-supply-lbl">🔴 Supply (Jual)</div>
                        ${sdSupplyRows}
                        ${sd?.nearestSupply ? `<div class="qa-sd-sep">📍 Nearest: ${_fmt(sd.nearestSupply.bottom)} — ${_fmt(sd.nearestSupply.top)}</div>` : ''}
                    </div>
                    <div>
                        <div class="qa-sd-label qa-sd-demand-lbl">🟢 Demand (Beli)</div>
                        ${sdDemandRows}
                        ${sd?.nearestDemand ? `<div class="qa-sd-sep">📍 Nearest: ${_fmt(sd.nearestDemand.bottom)} — ${_fmt(sd.nearestDemand.top)}</div>` : ''}
                    </div>
                </div>
            </div>

            <!-- ══ ROW 2: Volume Profile + Order Flow ══ -->
            <div class="qa-grid-2col">
                <div class="qa-card">
                    <div class="qa-card-title">📊 Volume Profile</div>
                    <div class="qa-row"><span class="qa-lbl">POC</span><span class="qa-val qa-poc">${_fmt(vp.poc)}</span></div>
                    <div class="qa-row"><span class="qa-lbl">VAH</span><span class="qa-val">${_fmt(vp.vah)}</span></div>
                    <div class="qa-row"><span class="qa-lbl">VAL</span><span class="qa-val">${_fmt(vp.val)}</span></div>
                    <div class="qa-row"><span class="qa-lbl">Harga vs POC</span>
                        <span class="qa-val" style="color:${vp.currentVsPoC==='above'?'#4ade80':vp.currentVsPoC==='below'?'#f87171':'#fbbf24'}">
                            ${{above:'Di Atas',at:'Tepat',below:'Di Bawah'}[vp.currentVsPoC]||vp.currentVsPoC}
                        </span>
                    </div>
                    ${vp.volumeNodes?.length ? `<div class="qa-row-nodes"><span class="qa-lbl">HVN Nodes</span><div class="qa-nodes-list">${vp.volumeNodes.map(n=>`<span class="qa-node-chip">${_fmt(n.price)} <small>${n.pct}%</small></span>`).join('')}</div></div>` : ''}
                </div>
                <div class="qa-card">
                    <div class="qa-card-title">🌊 Order Flow</div>
                    <div class="qa-row"><span class="qa-lbl">CVD Trend</span><span class="qa-val" style="color:${cvd.color}">${cvd.icon} ${cvd.label}</span></div>
                    <div class="qa-row"><span class="qa-lbl">Tekanan Beli</span><span class="qa-val">${of_.buyPressure}%</span></div>
                    ${_pbar(of_.buyPressure, false, false)}
                    <div class="qa-row"><span class="qa-lbl">Imbalance</span>
                        <span class="qa-val" style="color:${of_.imbalance>0.2?'#4ade80':of_.imbalance<-0.2?'#f87171':'#94a3b8'}">
                            ${of_.imbalance > 0.2 ? '📈 Buyer Dominance' : of_.imbalance < -0.2 ? '📉 Seller Dominance' : '➡️ Netral'} (${of_.imbalance})
                        </span>
                    </div>
                    <div class="qa-row"><span class="qa-lbl">Absorpsi</span><span class="qa-val" style="color:${of_.absorption?'#fbbf24':'#94a3b8'}">${of_.absorption?'⚠️ Ya':'✅ Tidak'}</span></div>
                </div>
            </div>

            <!-- ══ WHALE ACTIVITY ══ -->
            <div class="qa-card qa-card-full">
                <div class="qa-card-title">🐋 Aktivitas Whale</div>
                <div class="qa-grid-4col">
                    <div class="qa-vol-item"><div class="qa-vol-lbl">Bias Whale</div><div class="qa-vol-val" style="color:${whBias.color}">${whBias.icon} ${whBias.label}</div></div>
                    <div class="qa-vol-item"><div class="qa-vol-lbl">Pressure Score</div><div class="qa-vol-val">${wh.pressureScore}/100</div>${_pbar(wh.pressureScore,false,false)}</div>
                    <div class="qa-vol-item"><div class="qa-vol-lbl">Volume Spike</div><div class="qa-vol-val" style="color:${wh.volumeSpike?'#f97316':'#94a3b8'}">${wh.volumeSpike?`⚡ Ya (${wh.volRatio}×)`:'Tidak'}</div></div>
                    <div class="qa-vol-item"><div class="qa-vol-lbl">Exchange Flow Proxy</div><div class="qa-vol-val" style="color:${wh.exchangeFlowProxy.includes('buying')?'#4ade80':wh.exchangeFlowProxy.includes('selling')?'#f87171':'#94a3b8'}">${wh.exchangeFlowProxy.replace(/_/g,' ')}</div></div>
                </div>
                ${wh.alert ? `<div class="qa-whale-alert">${wh.alert}</div>` : ''}
            </div>

            <!-- ══ VOLATILITY MODEL ══ -->
            <div class="qa-card qa-card-full">
                <div class="qa-card-title">📐 Model Volatilitas</div>
                <div class="qa-grid-4col">
                    <div class="qa-vol-item">
                        <div class="qa-vol-lbl">ATR-14</div>
                        <div class="qa-vol-val">${_fmt(vol.atr)}</div>
                        <div class="qa-vol-hint">${_pct(vol.atrPct)} dari harga</div>
                    </div>
                    <div class="qa-vol-item">
                        <div class="qa-vol-lbl">Bollinger BW</div>
                        <div class="qa-vol-val">${vol.bollingerBw?.toFixed(2) ?? '—'}%</div>
                        <div class="qa-bb-visual">
                            <span class="qa-bb-lower">${_fmt(vol.bbLower)}</span>
                            <span class="qa-bb-mid">SMA ${_fmt(vol.sma20)}</span>
                            <span class="qa-bb-upper">${_fmt(vol.bbUpper)}</span>
                        </div>
                    </div>
                    <div class="qa-vol-item">
                        <div class="qa-vol-lbl">Rolling Std (20)</div>
                        <div class="qa-vol-val">${_pct(vol.rollingStdPct)}</div>
                        <div class="qa-vol-hint">Persentil: ${vol.percentile}%</div>
                    </div>
                    <div class="qa-vol-item">
                        <div class="qa-vol-lbl">Fase Volatilitas</div>
                        <div class="qa-vol-val" style="color:${volPh.color}">${volPh.icon} ${volPh.label}</div>
                        <div class="qa-vol-hint">${vol.phase==='contraction'?'Squeeze: breakout segera?':vol.phase==='high_expansion'?'Volatile tinggi, hati-hati':''}</div>
                    </div>
                </div>
            </div>

            <!-- ══ MONTE CARLO ══ -->
            <div class="qa-card qa-card-full">
                <div class="qa-card-title">🎲 Monte Carlo GBM (500 path · 7 hari)</div>
                <div class="qa-mc-strip">
                    <div class="qa-mc-item qa-mc-p10"><div class="qa-vol-lbl">P10</div><div class="qa-vol-val">${mcFmt(mc.p10)}</div><div>${mcChange(mc.p10)}</div></div>
                    <div class="qa-mc-item qa-mc-p25"><div class="qa-vol-lbl">P25</div><div class="qa-vol-val">${mcFmt(mc.p25)}</div><div>${mcChange(mc.p25)}</div></div>
                    <div class="qa-mc-item qa-mc-p50 qa-mc-highlight"><div class="qa-vol-lbl">P50 (Median)</div><div class="qa-vol-val">${mcFmt(mc.p50)}</div><div>${mcChange(mc.p50)}</div></div>
                    <div class="qa-mc-item qa-mc-p75"><div class="qa-vol-lbl">P75</div><div class="qa-vol-val">${mcFmt(mc.p75)}</div><div>${mcChange(mc.p75)}</div></div>
                    <div class="qa-mc-item qa-mc-p90"><div class="qa-vol-lbl">P90</div><div class="qa-vol-val">${mcFmt(mc.p90)}</div><div>${mcChange(mc.p90)}</div></div>
                </div>
                <div class="qa-mc-prob-row">
                    <span class="qa-mc-prob-label">Probabilitas harga naik dalam 7 hari:</span>
                    <span class="qa-mc-prob-val" style="color:${mc.probUp>=50?'#4ade80':'#f87171'}">${mc.probUp}%</span>
                </div>
                <div class="qa-mc-hint">μ (drift) = ${mc.mu} · σ (volatilitas) = ${mc.sigma} · Harga Awal = ${_fmt(mc.S0)}</div>
            </div>

            <!-- ══ TRADE LEVELS ══ -->
            <div class="qa-trade-card">
                <div class="qa-card-title">🎯 Level Trading Optimal</div>
                <div class="qa-trade-grid">
                    <div class="qa-trade-item qa-trade-entry">
                        <div class="qa-trade-lbl">Entry Zone</div>
                        <div class="qa-trade-val">${_fmt(tl.entryLow)} — ${_fmt(tl.entryHigh)}</div>
                        <div class="qa-trade-hint">Zona S/D + VAL/POC</div>
                    </div>
                    <div class="qa-trade-item qa-trade-sl">
                        <div class="qa-trade-lbl">Stop Loss</div>
                        <div class="qa-trade-val">${_fmt(tl.stopLoss)}</div>
                        <div class="qa-trade-hint">Invalidasi struktur</div>
                    </div>
                    <div class="qa-trade-item qa-trade-tp1">
                        <div class="qa-trade-lbl">TP1 <small>(1.5R)</small></div>
                        <div class="qa-trade-val">${_fmt(tl.tp1)}</div>
                    </div>
                    <div class="qa-trade-item qa-trade-tp2">
                        <div class="qa-trade-lbl">TP2 <small>(2.5R)</small></div>
                        <div class="qa-trade-val">${_fmt(tl.tp2)}</div>
                    </div>
                    <div class="qa-trade-item qa-trade-tp3">
                        <div class="qa-trade-lbl">TP3 <small>(4R)</small></div>
                        <div class="qa-trade-val">${_fmt(tl.tp3)}</div>
                    </div>
                    <div class="qa-trade-item qa-trade-rr">
                        <div class="qa-trade-lbl">Risk/Reward</div>
                        <div class="qa-trade-val">1 : ${tl.rr}</div>
                    </div>
                </div>
            </div>

            <!-- ══ DISCLAIMER ══ -->
            <div class="qa-disclaimer">
                ⚠️ Quant Analysis v2 menggunakan data historis harga & volume saja. Bukan saran keuangan. Selalu DYOR dan kelola risiko Anda.
            </div>
        </div>`;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════════════════════════════
    return { analyze, renderPanel };
})();

console.log('✅ Quant Analyst v2 loaded — 10 engines active');
