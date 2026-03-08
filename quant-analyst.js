// ══════════════════════════════════════════════════════════════════════════════
//  Quant Analyst v1 — Institutional-Grade Technical Engine
//  Market Structure · Liquidity Model · Volume Profile · Order Flow · Probability
//  No external API needed — pure math on CoinGecko OHLCV data
//
//  Methodology inspired by:
//  → Smart Money Concepts (ICT): HH/HL/LH/LL, BOS, CHoCH
//  → Volume Profile: POC / VAH / VAL (70% Value Area)
//  → Order Flow: Delta (buy vs sell pressure), CVD, absorption detection
//  → Liquidity Model: equal highs/lows = stop clusters, sweep probability
//  → Directional Probability: weighted ensemble of 6 sub-models
// ══════════════════════════════════════════════════════════════════════════════

const quantAnalyst = (() => {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    //  SWING DETECTION — Zigzag pivot detection (strength = lookback window)
    // ─────────────────────────────────────────────────────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    //  MARKET STRUCTURE — HH / HL / LH / LL + BOS + CHoCH
    // ─────────────────────────────────────────────────────────────────────────
    function analyzeMarketStructure(prices) {
        if (!prices || prices.length < 15) {
            return { trend: 'insufficient_data', pattern: [], bos: 'none', choch: false,
                     lastHighs: [], lastLows: [], structureQuality: 0 };
        }

        const { highs, lows } = detectSwings(prices, 5);
        const last3H = highs.slice(-3).map(h => h.price);
        const last3L = lows.slice(-3).map(l => l.price);

        // Label sequence of HH/HL/LH/LL
        const pattern = [];
        for (let i = 1; i < last3H.length; i++) {
            pattern.push(last3H[i] > last3H[i - 1] ? 'HH' : 'LH');
        }
        for (let i = 1; i < last3L.length; i++) {
            pattern.push(last3L[i] > last3L[i - 1] ? 'HL' : 'LL');
        }

        // Trend classification
        const hhCount = pattern.filter(p => p === 'HH').length;
        const hlCount = pattern.filter(p => p === 'HL').length;
        const lhCount = pattern.filter(p => p === 'LH').length;
        const llCount = pattern.filter(p => p === 'LL').length;

        let trend;
        if (hhCount >= 1 && hlCount >= 1)      trend = 'uptrend';
        else if (lhCount >= 1 && llCount >= 1) trend = 'downtrend';
        else if (hhCount >= 1 && llCount >= 1) trend = 'reversal_top';
        else if (lhCount >= 1 && hlCount >= 1) trend = 'reversal_bottom';
        else                                    trend = 'consolidation';

        // Break of Structure (BOS): price closes beyond last swing high/low
        const currentPrice = prices[prices.length - 1];
        const lastSwingHigh = last3H[last3H.length - 1] || 0;
        const lastSwingLow  = last3L[last3L.length - 1] || Infinity;

        let bos = 'none';
        if (currentPrice > lastSwingHigh) bos = 'bullish_bos';
        else if (currentPrice < lastSwingLow)  bos = 'bearish_bos';

        // CHoCH: Change of Character — trend reversal signal
        // Detected when the MOST RECENT structure breaks AGAINST the dominant trend
        const choch = (trend === 'uptrend' && bos === 'bearish_bos') ||
                      (trend === 'downtrend' && bos === 'bullish_bos');

        // Structure quality (0–100): how clean and consistent the pattern is
        const cleanHH = last3H.length >= 2 && last3H.every((h, i) => i === 0 || h > last3H[i - 1]);
        const cleanLL = last3L.length >= 2 && last3L.every((l, i) => i === 0 || l < last3L[i - 1]);
        const cleanHL = last3L.length >= 2 && last3L.every((l, i) => i === 0 || l > last3L[i - 1]);
        const structureQuality = trend === 'uptrend' ? (cleanHH && cleanHL ? 90 : 60)
                               : trend === 'downtrend' ? (cleanLL ? 85 : 55)
                               : 35;

        return {
            trend,
            pattern,
            bos,
            choch,
            lastHighs: last3H,
            lastLows:  last3L,
            structureQuality,
            currentPrice,
            lastSwingHigh,
            lastSwingLow
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  LIQUIDITY MODEL — Equal highs/lows = stop clusters, sweep probability
    // ─────────────────────────────────────────────────────────────────────────
    function analyzeLiquidity(prices, structure) {
        const n = prices.length;
        if (n < 20) return { buySideLiq: null, sellSideLiq: null, sweepProbability: 30, nearestPool: null, equalHighs: false, equalLows: false };

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
            buySideLiq,
            sellSideLiq,
            sweepProbability,
            nearestPool,
            equalHighs,
            equalLows,
            distToBuySide:  Math.round(distToBuy * 100),
            distToSellSide: Math.round(distToSell * 100)
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  VOLUME PROFILE — POC / VAH / VAL (bins prices by volume)
    // ─────────────────────────────────────────────────────────────────────────
    function analyzeVolumeProfile(prices, volumes) {
        if (!prices || !volumes || prices.length < 10) {
            return { poc: null, vah: null, val: null, currentVsPoC: 'unknown', volumeNodes: [] };
        }

        const n     = Math.min(prices.length, volumes.length);
        const BINS  = 24; // number of price bins
        const pMin  = Math.min(...prices.slice(-n));
        const pMax  = Math.max(...prices.slice(-n));
        const step  = (pMax - pMin) / BINS;

        if (step === 0) return { poc: null, vah: null, val: null, currentVsPoC: 'unknown', volumeNodes: [] };

        // Build volume-at-price histogram
        const bins = Array.from({ length: BINS }, (_, i) => ({
            priceFrom: pMin + i * step,
            priceTo:   pMin + (i + 1) * step,
            priceMid:  pMin + (i + 0.5) * step,
            volume:    0
        }));

        for (let i = 0; i < n; i++) {
            const p = prices[prices.length - n + i];
            const v = volumes[volumes.length - n + i] || 0;
            const binIdx = Math.min(Math.floor((p - pMin) / step), BINS - 1);
            if (binIdx >= 0) bins[binIdx].volume += v;
        }

        const totalVol = bins.reduce((s, b) => s + b.volume, 0);

        // POC = price bin with max volume
        const pocBin = bins.reduce((max, b) => b.volume > max.volume ? b : max, bins[0]);
        const poc    = pocBin.priceMid;

        // Value Area = 70% of total volume centred around POC
        const sortedByVol = [...bins].sort((a, b) => b.volume - a.volume);
        let vaVol   = 0;
        const vaBins = [];
        for (const b of sortedByVol) {
            if (vaVol >= totalVol * 0.70) break;
            vaVol += b.volume;
            vaBins.push(b);
        }
        const vaPrices = vaBins.map(b => b.priceMid);
        const vah = vaPrices.length ? Math.max(...vaPrices) : poc * 1.02;
        const val = vaPrices.length ? Math.min(...vaPrices) : poc * 0.98;

        const currentPrice  = prices[prices.length - 1];
        const currentVsPoC  = currentPrice > poc * 1.005 ? 'above'
                            : currentPrice < poc * 0.995 ? 'below' : 'at';

        // High-volume nodes = potential S/R (top 3 bins by volume, excluding POC)
        const highVolNodes = sortedByVol.slice(1, 4).map(b => ({
            price:  +b.priceMid.toFixed(8),
            volume: b.volume,
            pct:    +(b.volume / totalVol * 100).toFixed(1)
        }));

        return {
            poc:        +poc.toFixed(8),
            vah:        +vah.toFixed(8),
            val:        +val.toFixed(8),
            currentVsPoC,
            volumeNodes: highVolNodes
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ORDER FLOW — Delta (buy vs sell imbalance), CVD trend, absorption
    // ─────────────────────────────────────────────────────────────────────────
    function analyzeOrderFlow(prices, volumes) {
        if (!prices || !volumes || prices.length < 5) {
            return { delta24h: 0, cvdTrend: 'neutral', absorption: false, buyPressure: 50 };
        }

        const n = Math.min(prices.length, volumes.length);

        // Estimate delta per candle: positive if close > open (up-close), negative otherwise
        // We approximate using the day-over-day price change
        const deltas = [];
        for (let i = 1; i < n; i++) {
            const pDiff = prices[prices.length - n + i] - prices[prices.length - n + i - 1];
            const vol   = volumes[volumes.length - n + i] || 0;
            deltas.push(pDiff >= 0 ? vol : -vol);
        }

        // 24h delta = last delta (most recent period)
        const delta24h  = deltas[deltas.length - 1] || 0;

        // CVD (Cumulative Volume Delta) — running sum, look at last 10 periods
        const cvdWindow = deltas.slice(-10);
        const cvd       = cvdWindow.reduce((s, d) => s + d, 0);
        const cvdTrend  = cvd >  0 ? 'positive' : cvd < 0 ? 'negative' : 'neutral';

        // Buy pressure % (0–100): based on proportion of up-close candles × volume weighting
        const upVol   = deltas.filter(d => d > 0).reduce((s, d) => s + d, 0);
        const totalV  = deltas.reduce((s, d) => s + Math.abs(d), 0);
        const buyPressure = totalV > 0 ? Math.round((upVol / totalV) * 100) : 50;

        // Absorption: large volume but small price change (≤ 0.5%) in recent 5 periods
        const recentPrices = prices.slice(-6);
        const recentVols   = volumes.slice(-6);
        const avgVol       = recentVols.reduce((s, v) => s + v, 0) / recentVols.length;
        const priceRange   = Math.abs(recentPrices[recentPrices.length - 1] - recentPrices[0])
                           / recentPrices[0];
        const volSpike     = recentVols[recentVols.length - 1] > avgVol * 1.5;
        const absorption   = volSpike && priceRange < 0.005;

        return {
            delta24h:    +delta24h.toFixed(2),
            cvdTrend,
            absorption,
            buyPressure
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  DIRECTIONAL PROBABILITY — 6-model weighted ensemble
    // ─────────────────────────────────────────────────────────────────────────
    function calcDirectionalProb(structure, liquidity, volumeProfile, orderFlow, coin) {
        // Each sub-model returns a bullish score 0–100
        const scores = [];

        // 1. Market Structure model (weight 30%)
        const msScore = structure.trend === 'uptrend'          ? 80
                      : structure.trend === 'reversal_bottom'   ? 65
                      : structure.trend === 'consolidation'     ? 50
                      : structure.trend === 'reversal_top'      ? 35
                      : structure.trend === 'downtrend'         ? 20 : 50;
        scores.push({ score: msScore, weight: 0.30 });

        // 2. BOS model (weight 15%)
        const bosScore = structure.bos === 'bullish_bos' ? 85
                       : structure.bos === 'bearish_bos' ? 15 : 50;
        scores.push({ score: bosScore, weight: 0.15 });

        // 3. Volume Profile model (weight 20%)
        const vpScore = volumeProfile.currentVsPoC === 'above' ? 70
                      : volumeProfile.currentVsPoC === 'at'    ? 50
                      : 30;
        scores.push({ score: vpScore, weight: 0.20 });

        // 4. Order Flow model (weight 20%)
        const ofScore = orderFlow.cvdTrend === 'positive' ? 72
                      : orderFlow.cvdTrend === 'negative' ? 28 : 50;
        const absBonus = orderFlow.absorption ? 8 : 0; // absorption = accumulation signal
        scores.push({ score: Math.min(100, ofScore + (orderFlow.cvdTrend === 'positive' ? absBonus : -absBonus)), weight: 0.20 });

        // 5. Buy-pressure model (weight 10%)
        scores.push({ score: orderFlow.buyPressure, weight: 0.10 });

        // 6. Price momentum (24h change) model (weight 5%)
        const change24h  = coin?.price_change_percentage_24h || 0;
        const momScore   = Math.min(100, Math.max(0, 50 + change24h * 2));
        scores.push({ score: momScore, weight: 0.05 });

        // Weighted sum
        const rawBullish = scores.reduce((s, m) => s + m.score * m.weight, 0);

        // CHoCH → penalise the dominant direction
        let bullish = Math.round(rawBullish);
        if (structure.choch && structure.trend === 'uptrend')   bullish -= 15;
        if (structure.choch && structure.trend === 'downtrend') bullish += 15;
        bullish = Math.min(95, Math.max(5, bullish));

        const bearish = 100 - bullish;
        return { bullish, bearish };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ENTRY / SL / TP ZONES — Price-level calculation
    // ─────────────────────────────────────────────────────────────────────────
    function calcTradeLevels(prices, structure, volumeProfile, dirProb, coin) {
        const currentPrice = prices[prices.length - 1];
        const isBullish    = dirProb.bullish >= 55;

        // Entry zone: retracement to VAL (bullish) or VAH (bearish), fallback to 1-2% from current
        const entryLow  = volumeProfile.val  ? Math.min(currentPrice, volumeProfile.val)  : currentPrice * 0.98;
        const entryHigh = volumeProfile.poc  ? Math.min(currentPrice * 1.005, volumeProfile.poc) : currentPrice * 1.005;

        // Stop Loss
        let stopLoss;
        if (isBullish) {
            // SL below last swing low or VAL
            stopLoss = Math.min(structure.lastSwingLow || currentPrice * 0.92,
                                (volumeProfile.val || currentPrice * 0.95) * 0.985);
        } else {
            // SL above last swing high or VAH
            stopLoss = Math.max(structure.lastSwingHigh || currentPrice * 1.08,
                                (volumeProfile.vah || currentPrice * 1.05) * 1.015);
        }

        // TP Levels (based on structure highs/lows + liquidity pools)
        let tp1, tp2, tp3;
        if (isBullish) {
            const range  = currentPrice - stopLoss;
            tp1 = currentPrice + range * 1.5;   // 1.5R
            tp2 = currentPrice + range * 2.5;   // 2.5R
            tp3 = structure.lastSwingHigh > currentPrice
                ? structure.lastSwingHigh * 1.01
                : currentPrice + range * 4.0;    // 4R
        } else {
            const range  = stopLoss - currentPrice;
            tp1 = currentPrice - range * 1.5;
            tp2 = currentPrice - range * 2.5;
            tp3 = structure.lastSwingLow < currentPrice
                ? structure.lastSwingLow * 0.99
                : currentPrice - range * 4.0;
        }

        // Risk/Reward
        const slDist = Math.abs(currentPrice - stopLoss);
        const tp1Dist = Math.abs(tp1 - currentPrice);
        const rr = slDist > 0 ? +(tp1Dist / slDist).toFixed(2) : 0;

        const fmt = (v) => v > 0.001 ? +v.toFixed(6) : +v.toFixed(10);

        return {
            entryLow:   fmt(entryLow),
            entryHigh:  fmt(entryHigh),
            stopLoss:   fmt(stopLoss),
            tp1:        fmt(tp1),
            tp2:        fmt(tp2),
            tp3:        fmt(tp3),
            rr,
            bias:       isBullish ? 'LONG' : 'SHORT',
            invalidation: isBullish ? fmt(stopLoss) : fmt(stopLoss)
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  MAIN ANALYZE — Public entry point
    //  Input: coin (from cryptoData), marketChart (CoinGecko market_chart response)
    // ─────────────────────────────────────────────────────────────────────────
    function analyze(coin, marketChart) {
        const pricePoints  = marketChart?.prices        || [];
        const volumePoints = marketChart?.total_volumes || [];

        const prices  = pricePoints.map(p => p[1]);
        const volumes = volumePoints.map(v => v[1]);

        if (prices.length < 10) {
            return { error: 'insufficient_data', message: 'Data harga tidak cukup (<10 titik).' };
        }

        const structure     = analyzeMarketStructure(prices);
        const liquidity     = analyzeLiquidity(prices, structure);
        const volumeProfile = analyzeVolumeProfile(prices, volumes);
        const orderFlow     = analyzeOrderFlow(prices, volumes);
        const dirProb       = calcDirectionalProb(structure, liquidity, volumeProfile, orderFlow, coin);
        const tradeLevels   = calcTradeLevels(prices, structure, volumeProfile, dirProb, coin);

        return {
            structure,
            liquidity,
            volumeProfile,
            orderFlow,
            dirProb,
            tradeLevels,
            currentPrice: prices[prices.length - 1],
            dataPoints:   prices.length
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  RENDER — Injects HTML into a target element
    // ─────────────────────────────────────────────────────────────────────────
    function _fmt(v, decimals = 6) {
        if (v == null || isNaN(v)) return '—';
        if (v > 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (v > 1)    return '$' + v.toFixed(2);
        return '$' + v.toFixed(decimals);
    }

    function _pbar(val, inverse = false, showVal = true) {
        const c   = Math.min(100, Math.max(0, val));
        const col = inverse
            ? (c <= 30 ? '#4ade80' : c <= 60 ? '#fbbf24' : '#f87171')
            : (c >= 70 ? '#4ade80' : c >= 40 ? '#fbbf24' : '#f87171');
        return `<div class="qa-bar-wrap">
                    <div class="qa-bar-track"><div class="qa-bar-fill" style="width:${c}%;background:${col}"></div></div>
                    ${showVal ? `<span class="qa-bar-val" style="color:${col}">${c}%</span>` : ''}
                </div>`;
    }

    const TREND_LABEL = {
        uptrend:          { icon: '📈', label: 'Uptrend',          color: '#4ade80' },
        downtrend:        { icon: '📉', label: 'Downtrend',         color: '#f87171' },
        consolidation:    { icon: '➡️',  label: 'Konsolidasi',      color: '#fbbf24' },
        reversal_top:     { icon: '🔴', label: 'Reversal Atas',     color: '#f97316' },
        reversal_bottom:  { icon: '🟢', label: 'Reversal Bawah',    color: '#4ade80' },
        insufficient_data:{ icon: '⚪', label: 'Data Kurang',        color: '#94a3b8' }
    };
    const BOS_LABEL = {
        bullish_bos: { icon: '💚', label: 'Bullish BOS', color: '#4ade80' },
        bearish_bos: { icon: '🔴', label: 'Bearish BOS', color: '#f87171' },
        none:        { icon: '➖',  label: 'Tidak Ada',   color: '#94a3b8' }
    };
    const CVD_LABEL = {
        positive: { icon: '📈', label: 'Positif (Bullish)', color: '#4ade80' },
        negative: { icon: '📉', label: 'Negatif (Bearish)', color: '#f87171' },
        neutral:  { icon: '➡️', label: 'Netral',           color: '#94a3b8' }
    };

    function renderPanel(result, targetEl) {
        if (!targetEl) return;

        if (result.error) {
            targetEl.innerHTML = `<div class="qa-error">⚠️ ${result.message}</div>`;
            return;
        }

        const { structure: s, liquidity: liq, volumeProfile: vp,
                orderFlow: of_, dirProb: dp, tradeLevels: tl } = result;

        const trend  = TREND_LABEL[s.trend]  || TREND_LABEL.insufficient_data;
        const bos    = BOS_LABEL[s.bos]      || BOS_LABEL.none;
        const cvd    = CVD_LABEL[of_.cvdTrend] || CVD_LABEL.neutral;
        const biasCol = dp.bullish >= 55 ? '#4ade80' : '#f87171';

        targetEl.innerHTML = `
        <div class="qa-wrap">

            <!-- ══ HEADER ══ -->
            <div class="qa-header">
                <div class="qa-header-left">
                    <span class="qa-badge-title">⚡ Quant Analysis</span>
                    <span class="qa-badge-sub">Market Structure · Liquidity Model · Volume Profile · Order Flow</span>
                </div>
                <div class="qa-dir-badge" style="background:${biasCol}22;border-color:${biasCol}66;color:${biasCol}">
                    <span class="qa-dir-icon">${dp.bullish >= 55 ? '🟢' : '🔴'}</span>
                    <span class="qa-dir-bias">${tl.bias}</span>
                    <span class="qa-dir-pct">${dp.bullish >= 55 ? dp.bullish : dp.bearish}%</span>
                </div>
            </div>

            <!-- ══ DIRECTIONAL PROBABILITY ══ -->
            <div class="qa-prob-strip">
                <div class="qa-prob-bull">
                    <span class="qa-prob-label">📈 Bullish</span>
                    <span class="qa-prob-val" style="color:#4ade80">${dp.bullish}%</span>
                </div>
                <div class="qa-prob-bar-main">
                    <div class="qa-prob-bar-fill-bull" style="width:${dp.bullish}%"></div>
                    <div class="qa-prob-bar-fill-bear" style="width:${dp.bearish}%"></div>
                </div>
                <div class="qa-prob-bear">
                    <span class="qa-prob-val" style="color:#f87171">${dp.bearish}%</span>
                    <span class="qa-prob-label">📉 Bearish</span>
                </div>
            </div>

            <!-- ══ ROW 1 — Market Structure + Liquidity ══ -->
            <div class="qa-grid-2col">

                <!-- Market Structure -->
                <div class="qa-card">
                    <div class="qa-card-title">🏗️ Struktur Pasar</div>
                    <div class="qa-row">
                        <span class="qa-lbl">Trend</span>
                        <span class="qa-val" style="color:${trend.color}">${trend.icon} ${trend.label}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">Break of Structure</span>
                        <span class="qa-val" style="color:${bos.color}">${bos.icon} ${bos.label}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">CHoCH Terdeteksi</span>
                        <span class="qa-val" style="color:${s.choch ? '#f97316' : '#4ade80'}">${s.choch ? '⚠️ Ya — Reversal!' : '✅ Tidak'}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">Pola Terakhir</span>
                        <span class="qa-val qa-pattern-row">${s.pattern.slice(-4).map(p =>
                            `<span class="qa-pat-chip qa-pat-${p.toLowerCase()}">${p}</span>`
                        ).join('')}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">Kualitas Struktur</span>
                        <span class="qa-val">${s.structureQuality}/100</span>
                    </div>
                    ${_pbar(s.structureQuality, false, false)}
                </div>

                <!-- Liquidity Model -->
                <div class="qa-card">
                    <div class="qa-card-title">💧 Model Likuiditas</div>
                    <div class="qa-row">
                        <span class="qa-lbl">Buy-Side Liquidity</span>
                        <span class="qa-val qa-liq-buy">${_fmt(liq.buySideLiq)}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">Sell-Side Liquidity</span>
                        <span class="qa-val qa-liq-sell">${_fmt(liq.sellSideLiq)}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">Equal Highs (Stop Cluster)</span>
                        <span class="qa-val" style="color:${liq.equalHighs ? '#f97316' : '#94a3b8'}">${liq.equalHighs ? '⚠️ Terdeteksi' : '✅ Tidak'}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">Equal Lows (Stop Cluster)</span>
                        <span class="qa-val" style="color:${liq.equalLows ? '#f97316' : '#94a3b8'}">${liq.equalLows ? '⚠️ Terdeteksi' : '✅ Tidak'}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">Prob. Liquidity Sweep</span>
                        <span class="qa-val">${liq.sweepProbability}%</span>
                    </div>
                    ${_pbar(liq.sweepProbability, false, false)}
                </div>

            </div>

            <!-- ══ ROW 2 — Volume Profile + Order Flow ══ -->
            <div class="qa-grid-2col">

                <!-- Volume Profile -->
                <div class="qa-card">
                    <div class="qa-card-title">📊 Volume Profile</div>
                    <div class="qa-row">
                        <span class="qa-lbl">POC (Point of Control)</span>
                        <span class="qa-val qa-poc">${_fmt(vp.poc)}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">VAH (Value Area High)</span>
                        <span class="qa-val">${_fmt(vp.vah)}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">VAL (Value Area Low)</span>
                        <span class="qa-val">${_fmt(vp.val)}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">Harga vs POC</span>
                        <span class="qa-val" style="color:${vp.currentVsPoC === 'above' ? '#4ade80' : vp.currentVsPoC === 'below' ? '#f87171' : '#fbbf24'}">
                            ${{ above:'Di Atas', at:'Tepat', below:'Di Bawah' }[vp.currentVsPoC] || vp.currentVsPoC}
                        </span>
                    </div>
                    ${vp.volumeNodes.length ? `
                    <div class="qa-row-nodes">
                        <span class="qa-lbl">S/R High-Volume Nodes</span>
                        <div class="qa-nodes-list">
                            ${vp.volumeNodes.map(n => `<span class="qa-node-chip">${_fmt(n.price)} <small>${n.pct}%</small></span>`).join('')}
                        </div>
                    </div>` : ''}
                </div>

                <!-- Order Flow -->
                <div class="qa-card">
                    <div class="qa-card-title">🌊 Order Flow</div>
                    <div class="qa-row">
                        <span class="qa-lbl">CVD Trend</span>
                        <span class="qa-val" style="color:${cvd.color}">${cvd.icon} ${cvd.label}</span>
                    </div>
                    <div class="qa-row">
                        <span class="qa-lbl">Tekanan Beli</span>
                        <span class="qa-val">${of_.buyPressure}%</span>
                    </div>
                    ${_pbar(of_.buyPressure, false, false)}
                    <div class="qa-row">
                        <span class="qa-lbl">Absorpsi Terdeteksi</span>
                        <span class="qa-val" style="color:${of_.absorption ? '#fbbf24' : '#94a3b8'}">${of_.absorption ? '⚠️ Ya — Akumulasi?' : '✅ Tidak'}</span>
                    </div>
                    <div class="qa-row" style="margin-top:4px">
                        <span class="qa-lbl qa-hint">Absorpsi = Volume besar tapi harga diam → kemungkinan akumulasi tersembunyi</span>
                    </div>
                </div>

            </div>

            <!-- ══ TRADE LEVELS ══ -->
            <div class="qa-trade-card">
                <div class="qa-card-title">🎯 Level Trading Optimal</div>
                <div class="qa-trade-grid">
                    <div class="qa-trade-item qa-trade-entry">
                        <div class="qa-trade-lbl">Entry Zone</div>
                        <div class="qa-trade-val">${_fmt(tl.entryLow)} — ${_fmt(tl.entryHigh)}</div>
                        <div class="qa-trade-hint">Zona masuk optimal berdasarkan VAL/POC</div>
                    </div>
                    <div class="qa-trade-item qa-trade-sl">
                        <div class="qa-trade-lbl">Stop Loss</div>
                        <div class="qa-trade-val">${_fmt(tl.stopLoss)}</div>
                        <div class="qa-trade-hint">Invalidasi di bawah swing low / VAL</div>
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
                ⚠️ Quant analysis hanya menggunakan data historis harga & volume. Bukan saran keuangan. Selalu DYOR dan kelola risiko.
            </div>
        </div>`;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────
    return { analyze, renderPanel };
})();

console.log('✅ Quant Analyst v1 loaded');
