#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Signal Bot v1 — Quant Analyst v2 Signal Engine (Node.js)
//  Jalankan: node signal-bot.js
//
//  Mode: SEMI-AUTO — hanya deteksi & log sinyal, tidak eksekusi order
//
//  Flow:
//    1. Fetch top coins dari CoinGecko
//    2. Fetch market_chart (30d) per coin
//    3. Jalankan semua 10 quant engines
//    4. Jika signal LONG/SHORT + confidence >= threshold → log + notifikasi
//    5. Simpan ke signals.json
//    6. Ulangi tiap INTERVAL menit
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
    INTERVAL_MIN      : 15,          // polling interval (menit)
    MIN_CONFIDENCE    : 15,          // minimum confidence (diturunkan agar lebih banyak sinyal)
    MIN_BULLISH       : 60,          // threshold bullish % (diturunkan dari 65)
    MIN_BEARISH       : 60,          // threshold bearish % (diturunkan dari 65)
    TOP_N_COINS       : 200,         // scan top 200 coin by volume
    MIN_VOLATILITY_PCT: 5,           // min 24h price change % (filter coin volatile)
    MIN_VOLUME_USD    : 10_000_000,  // min volume 24h $10jt (filter likuiditas)
    VS_CURRENCY       : 'usd',
    DAYS              : 30,
    SIGNALS_FILE      : path.join(__dirname, 'signals.json'),
    MAX_SIGNALS_STORED: 500,         // naikkan dari 200 ke 500
    LOG_PREFIX        : '🤖 [SignalBot]',
};

// ─── UTILITIES ─────────────────────────────────────────────────────────────────
const mean   = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
const stdDev = arr => { const m = mean(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length); };
const clamp  = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function log(msg, level = 'INFO') {
    const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const icons = { INFO: 'ℹ️ ', SIGNAL: '🎯', WARN: '⚠️ ', ERROR: '❌' };
    console.log(`${CONFIG.LOG_PREFIX} [${ts}] ${icons[level] || ''} ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── HTTP FETCH (no external deps) ────────────────────────────────────────────
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'signal-bot/1.0' } }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const data = await fetchJson(url);
            // CoinGecko rate limit response
            if (data?.status?.error_code === 429) {
                log(`Rate limit CoinGecko, tunggu 60 detik...`, 'WARN');
                await sleep(60000);
                continue;
            }
            return data;
        } catch (err) {
            if (i < retries - 1) { await sleep(5000 * (i + 1)); continue; }
            throw err;
        }
    }
}

// ─── COINGECKO API ─────────────────────────────────────────────────────────────
const CG_BASE = 'https://api.coingecko.com/api/v3';

async function fetchTopCoins(n = CONFIG.TOP_N_COINS) {
    // CoinGecko free max 250/page — ambil max 2 halaman, sort by volume (paling volatile)
    const pages = Math.ceil(n / 250);
    let allCoins = [];
    for (let page = 1; page <= pages; page++) {
        const perPage = Math.min(250, n - (page - 1) * 250);
        const url = `${CG_BASE}/coins/markets?vs_currency=${CONFIG.VS_CURRENCY}&order=volume_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h`;
        const coins = await fetchWithRetry(url);
        if (!Array.isArray(coins)) break;
        allCoins = allCoins.concat(coins);
        if (page < pages) await sleep(1500); // hindari rate limit antar halaman
    }
    // Filter: min volume & min volatilitas 24h
    const filtered = allCoins.filter(c =>
        c.total_volume >= CONFIG.MIN_VOLUME_USD &&
        Math.abs(c.price_change_percentage_24h || 0) >= CONFIG.MIN_VOLATILITY_PCT
    );
    log(`Fetch ${allCoins.length} coins → setelah filter volatilitas/volume: ${filtered.length} coins`);
    return filtered;
}

async function fetchMarketChart(coinId) {
    const url = `${CG_BASE}/coins/${coinId}/market_chart?vs_currency=${CONFIG.VS_CURRENCY}&days=${CONFIG.DAYS}&interval=daily`;
    return fetchWithRetry(url);
}

// ══════════════════════════════════════════════════════════════════════════════
//  QUANT ENGINES (port dari quant-analyst.js — identik)
// ══════════════════════════════════════════════════════════════════════════════

function detectSwings(prices, strength = 5) {
    const highs = [], lows = [];
    for (let i = strength; i < prices.length - strength; i++) {
        const slice = prices.slice(i - strength, i + strength + 1);
        const center = prices[i];
        if (center === Math.max(...slice)) highs.push({ idx: i, price: center });
        if (center === Math.min(...slice)) lows.push({ idx: i, price: center });
    }
    return { highs, lows };
}

function analyzeMarketStructure(prices) {
    if (!prices || prices.length < 15) return { trend: 'insufficient_data', pattern: [], bos: 'none', choch: false, lastHighs: [], lastLows: [], structureQuality: 0, currentPrice: prices?.at(-1) || 0, lastSwingHigh: 0, lastSwingLow: Infinity };
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
    const prevHigh = last3H.at(-2) || 0, prevLow = last3L.at(-2) || Infinity;
    const bos = currentPrice > lastSwingHigh ? 'bullish_bos' : currentPrice < lastSwingLow ? 'bearish_bos' : 'none';
    const choch = (trend === 'uptrend' && currentPrice < prevLow) || (trend === 'downtrend' && currentPrice > prevHigh);
    const structureQuality = clamp(Math.round((highs.length + lows.length) * 3 + (bos !== 'none' ? 20 : 0) + (choch ? -15 : 10)), 0, 100);
    return { trend, pattern, bos, choch, lastHighs: last3H, lastLows: last3L, structureQuality, currentPrice, lastSwingHigh, lastSwingLow };
}

function analyzeLiquidity(prices, structure) {
    if (!prices || prices.length < 10) return { buySideLiq: null, sellSideLiq: null, equalHighs: false, equalLows: false, sweepProbability: 0, liquidityScore: 50 };
    const { highs, lows } = detectSwings(prices, 3);
    const highPrices = highs.map(h => h.price), lowPrices = lows.map(l => l.price);
    const tol = 0.003;
    const equalHighs = highPrices.some((h, i) => highPrices.slice(i + 1).some(h2 => Math.abs(h - h2) / h < tol));
    const equalLows  = lowPrices.some((l, i) => lowPrices.slice(i + 1).some(l2 => Math.abs(l - l2) / l < tol));
    const buySideLiq  = Math.max(...highPrices.slice(-5)) * 1.002;
    const sellSideLiq = Math.min(...lowPrices.slice(-5)) * 0.998;
    let sweepProbability = 30;
    if (equalHighs) sweepProbability += 25;
    if (equalLows)  sweepProbability += 25;
    if (structure.bos !== 'none') sweepProbability += 15;
    sweepProbability = clamp(sweepProbability, 0, 95);
    const liquidityScore = clamp(Math.round(50 + (structure.trend === 'uptrend' ? 15 : structure.trend === 'downtrend' ? -15 : 0) + (equalLows ? 10 : 0) - (equalHighs ? 10 : 0)), 5, 95);
    return { buySideLiq, sellSideLiq, equalHighs, equalLows, sweepProbability, liquidityScore };
}

function analyzeSupplyDemand(prices, volumes) {
    if (!prices || prices.length < 10) return { supplyZones: [], demandZones: [], nearestSupply: null, nearestDemand: null };
    const n = Math.min(prices.length, volumes.length);
    const avgVol = mean(volumes.slice(-n));
    const supplyZones = [], demandZones = [];
    for (let i = 2; i < n - 1; i++) {
        const p = prices[prices.length - n + i], pPrev = prices[prices.length - n + i - 1];
        const v = volumes[volumes.length - n + i] || 0;
        const pctChange = (p - pPrev) / pPrev;
        if (Math.abs(pctChange) < 0.015 || v < avgVol * 1.2) continue;
        const strength = clamp(Math.round((Math.abs(pctChange) * 500 + (v / avgVol - 1) * 30)), 20, 100);
        const zone = { top: Math.max(p, pPrev) * 1.001, bottom: Math.min(p, pPrev) * 0.999, origin: p, strength };
        if (pctChange < -0.015) supplyZones.push(zone);
        else                    demandZones.push(zone);
    }
    supplyZones.sort((a, b) => b.strength - a.strength);
    demandZones.sort((a, b) => b.strength - a.strength);
    const cur = prices.at(-1);
    const nearestSupply = supplyZones.filter(z => z.bottom > cur).sort((a, b) => a.bottom - b.bottom)[0] || null;
    const nearestDemand = demandZones.filter(z => z.top < cur).sort((a, b) => b.top - a.top)[0] || null;
    return { supplyZones: supplyZones.slice(0, 5), demandZones: demandZones.slice(0, 5), nearestSupply, nearestDemand };
}

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

function analyzeOrderFlow(prices, volumes) {
    if (!prices || !volumes || prices.length < 5) return { delta24h: 0, cvdTrend: 'neutral', absorption: false, buyPressure: 50, imbalance: 0, institutionalBias: 'neutral' };
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

function analyzeWhaleActivity(prices, volumes, coin) {
    const n = Math.min(prices.length, volumes.length);
    if (n < 5) return { whaleBias: 'unknown', pressureScore: 50, obvTrend: 0, volumeSpike: false, exchangeFlowProxy: 'neutral', alert: null };
    const obv = [0];
    for (let i = 1; i < n; i++) {
        const pDiff = prices[prices.length - n + i] - prices[prices.length - n + i - 1];
        const v     = volumes[volumes.length - n + i] || 0;
        obv.push(obv.at(-1) + (pDiff > 0 ? v : pDiff < 0 ? -v : 0));
    }
    const obvTrend    = obv.at(-1) - obv[Math.max(0, obv.length - 7)];
    const avgVol20    = mean(volumes.slice(-20));
    const lastVol     = volumes.at(-1) || 0;
    const volRatio    = avgVol20 > 0 ? lastVol / avgVol20 : 1;
    const volumeSpike = volRatio > 1.8;
    const volMcap     = coin?.market_cap > 0 ? (coin.total_volume || 0) / coin.market_cap : 0;
    const change24h   = coin?.price_change_percentage_24h || 0;
    let exchangeFlowProxy = 'neutral';
    if      (volMcap > 0.15 && change24h < -1)   exchangeFlowProxy = 'inflow_selling';
    else if (volMcap > 0.15 && change24h > 1)    exchangeFlowProxy = 'outflow_buying';
    else if (volMcap > 0.08 && change24h < -0.5) exchangeFlowProxy = 'mild_selling';
    else if (volMcap > 0.08 && change24h > 0.5)  exchangeFlowProxy = 'mild_buying';
    let pressureScore = 50;
    pressureScore += obvTrend > 0 ? 15 : -15;
    pressureScore += volumeSpike && change24h > 0 ? 15 : volumeSpike && change24h < 0 ? -15 : 0;
    pressureScore += exchangeFlowProxy === 'outflow_buying' ? 15 : exchangeFlowProxy === 'inflow_selling' ? -15 : exchangeFlowProxy === 'mild_buying' ? 8 : exchangeFlowProxy === 'mild_selling' ? -8 : 0;
    pressureScore = clamp(Math.round(pressureScore), 5, 95);
    const whaleBias = pressureScore >= 65 ? 'accumulation' : pressureScore <= 35 ? 'distribution' : 'neutral';
    const alert = volumeSpike ? (change24h > 0 ? 'Volume spike + harga naik' : 'Volume spike + harga turun') : null;
    return { whaleBias, pressureScore, obvTrend: +obvTrend.toFixed(0), volumeSpike, volRatio: +volRatio.toFixed(2), exchangeFlowProxy, alert };
}

function analyzeVolatility(prices) {
    const n = prices.length;
    if (n < 14) return { atr: null, bollingerBw: null, rollingStd: null, phase: 'unknown', percentile: 50, atrPct: 0 };
    const trueRanges = [];
    for (let i = 1; i < n; i++) trueRanges.push(Math.abs(prices[i] - prices[i - 1]));
    const atr14      = mean(trueRanges.slice(-14));
    const atrPct     = prices.at(-1) > 0 ? (atr14 / prices.at(-1)) * 100 : 0;
    const window20   = prices.slice(-20);
    const rollingStd = stdDev(window20);
    const sma20      = mean(window20), std20 = stdDev(window20);
    const bbUpper    = sma20 + 2 * std20, bbLower = sma20 - 2 * std20;
    const bollingerBw = sma20 > 0 ? ((bbUpper - bbLower) / sma20) * 100 : 0;
    const fullStd    = stdDev(prices);
    const percentile = fullStd > 0 ? clamp(Math.round((rollingStd / fullStd) * 50 + 25), 0, 100) : 50;
    const phase      = bollingerBw < 4 ? 'contraction' : bollingerBw < 8 ? 'normal' : bollingerBw < 14 ? 'expansion' : 'high_expansion';
    return { atr: +atr14.toFixed(8), atrPct: +atrPct.toFixed(2), bollingerBw: +bollingerBw.toFixed(2), phase, percentile };
}

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
    let signal = 'WAIT', signalReason = 'Probabilitas belum cukup kuat.';
    if      (dirProb.bullish > CONFIG.MIN_BULLISH && dirProb.confidence > CONFIG.MIN_CONFIDENCE) { signal = 'LONG';  signalReason = `Bullish ${dirProb.bullish}% (conf ${dirProb.confidence}%)`; }
    else if (dirProb.bearish > CONFIG.MIN_BEARISH && dirProb.confidence > CONFIG.MIN_CONFIDENCE) { signal = 'SHORT'; signalReason = `Bearish ${dirProb.bearish}% (conf ${dirProb.confidence}%)`; }
    const fmt = (v) => v == null || isNaN(v) ? null : +v.toFixed(v > 0.001 ? 6 : 10);
    return { signal, signalReason, bias: isBullish ? 'LONG' : 'SHORT', entryLow: fmt(entryLow), entryHigh: fmt(entryHigh), stopLoss: fmt(stopLoss), tp1: fmt(tp1), tp2: fmt(tp2), tp3: fmt(tp3), rr };
}

// ─── RUN ALL 10 ENGINES ────────────────────────────────────────────────────────
function runEngines(coin, marketChart) {
    const prices  = (marketChart.prices        || []).map(p => p[1]);
    const volumes = (marketChart.total_volumes || []).map(v => v[1]);
    if (prices.length < 10) return null;

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

    return { structure, liquidity, supplyDemand, volumeProfile, orderFlow, whale, volatility, monteCarlo, dirProb, tradeLevels, currentPrice: prices.at(-1) };
}

// ─── SIGNAL STORAGE ────────────────────────────────────────────────────────────
function loadSignals() {
    try {
        if (fs.existsSync(CONFIG.SIGNALS_FILE)) return JSON.parse(fs.readFileSync(CONFIG.SIGNALS_FILE, 'utf8'));
    } catch {}
    return [];
}

function saveSignal(entry) {
    let signals = loadSignals();
    // dedup: skip jika coin+signal sama dalam 2 jam terakhir
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const alreadySent = signals.some(s => s.coinId === entry.coinId && s.signal === entry.signal && new Date(s.timestamp).getTime() > twoHoursAgo);
    if (alreadySent) return false;

    signals.unshift(entry);
    if (signals.length > CONFIG.MAX_SIGNALS_STORED) signals = signals.slice(0, CONFIG.MAX_SIGNALS_STORED);
    fs.writeFileSync(CONFIG.SIGNALS_FILE, JSON.stringify(signals, null, 2));
    return true;
}

// ─── PRINT SIGNAL BOX ─────────────────────────────────────────────────────────
function printSignalBox(entry) {
    const line = '═'.repeat(55);
    const icon = entry.signal === 'LONG' ? '🟢' : '🔴';
    console.log(`\n╔${line}╗`);
    console.log(`║  ${icon}  SIGNAL: ${entry.signal.padEnd(5)} — ${entry.coinSymbol.toUpperCase().padEnd(10)} $${entry.currentPrice}`);
    console.log(`║  📊 Bullish ${entry.bullish}%  Bearish ${entry.bearish}%  Conf ${entry.confidence}%`);
    console.log(`║  Alasan : ${entry.signalReason}`);
    console.log(`║  Entry  : $${entry.entryLow} — $${entry.entryHigh}`);
    console.log(`║  SL     : $${entry.stopLoss}`);
    console.log(`║  TP1    : $${entry.tp1}  TP2: $${entry.tp2}  TP3: $${entry.tp3}`);
    console.log(`║  R:R    : 1:${entry.rr}  |  Trend: ${entry.trend}`);
    console.log(`║  🕐 ${entry.timestamp}`);
    console.log(`╚${line}╝\n`);
}

// ─── SCAN SATU COIN ────────────────────────────────────────────────────────────
async function scanCoin(coin) {
    try {
        const chart = await fetchMarketChart(coin.id);
        await sleep(1200); // hindari rate limit CoinGecko
        const result = runEngines(coin, chart);
        if (!result) return null;

        const { dirProb: dp, tradeLevels: tl, structure: s } = result;
        if (tl.signal === 'WAIT') return null;

        const entry = {
            timestamp      : new Date().toISOString(),
            coinId         : coin.id,
            coinSymbol     : coin.symbol,
            coinName       : coin.name,
            signal         : tl.signal,
            signalReason   : tl.signalReason,
            bullish        : dp.bullish,
            bearish        : dp.bearish,
            confidence     : dp.confidence,
            currentPrice   : result.currentPrice,
            priceChange24h : coin.price_change_percentage_24h || 0,
            volume24h      : coin.total_volume || 0,
            volatilityScore: Math.round(Math.abs(coin.price_change_percentage_24h || 0) * 10) / 10,
            entryLow       : tl.entryLow,
            entryHigh      : tl.entryHigh,
            stopLoss       : tl.stopLoss,
            tp1            : tl.tp1,
            tp2            : tl.tp2,
            tp3            : tl.tp3,
            rr             : tl.rr,
            trend          : s.trend,
            bos            : s.bos,
            whaleBias      : result.whale.whaleBias,
            whaleScore     : result.whale.pressureScore,
            volPhase       : result.volatility.phase,
            mcProbUp       : result.monteCarlo.probUp,
            subScores      : dp.subScores,
        };

        const isNew = saveSignal(entry);
        if (isNew) printSignalBox(entry);
        return isNew ? entry : null;

    } catch (err) {
        log(`Error scan ${coin.id}: ${err.message}`, 'WARN');
        return null;
    }
}

// ─── MAIN SCAN LOOP ────────────────────────────────────────────────────────────
async function runScan() {
    log(`Memulai scan top ${CONFIG.TOP_N_COINS} coins (filter vol≥${CONFIG.MIN_VOLATILITY_PCT}%, volume≥$${(CONFIG.MIN_VOLUME_USD/1e6).toFixed(0)}M)...`);
    let coins;
    try {
        coins = await fetchTopCoins(CONFIG.TOP_N_COINS);
    } catch (err) {
        log(`Gagal fetch top coins: ${err.message}`, 'ERROR');
        return;
    }
    if (!Array.isArray(coins) || coins.length === 0) {
        log(`Response tidak valid dari CoinGecko (mungkin rate limit). Coba lagi nanti.`, 'WARN');
        if (coins?.status?.error_message) log(`CoinGecko: ${coins.status.error_message}`, 'WARN');
        return;
    }

    // Sort by volatility desc — coin paling volatile duluan
    coins.sort((a, b) => Math.abs(b.price_change_percentage_24h || 0) - Math.abs(a.price_change_percentage_24h || 0));

    let signalCount = 0;
    for (const coin of coins) {
        process.stdout.write(`  → Scanning ${coin.symbol.toUpperCase().padEnd(8)} (${(coin.price_change_percentage_24h||0).toFixed(1)}%)... `);
        const sig = await scanCoin(coin);
        if (sig) { signalCount++; process.stdout.write(`✅ ${sig.signal}\n`); }
        else      { process.stdout.write(`WAIT\n`); }
    }

    log(`Scan selesai. ${signalCount} sinyal baru ditemukan. Sinyal total tersimpan: ${loadSignals().length}`);
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────
async function main() {
    console.log('\n' + '═'.repeat(60));
    console.log('  🤖  Signal Bot v1 — Quant Analyst v2 Engine');
    console.log(`  Scan: top ${CONFIG.TOP_N_COINS} coins | Interval: ${CONFIG.INTERVAL_MIN} menit`);
    console.log(`  Threshold: Bullish/Bearish >${CONFIG.MIN_BULLISH}% + Confidence >${CONFIG.MIN_CONFIDENCE}%`);
    console.log(`  Signal log: ${CONFIG.SIGNALS_FILE}`);
    console.log('═'.repeat(60) + '\n');

    // Scan pertama langsung
    await runScan();

    // Polling loop
    const intervalMs = CONFIG.INTERVAL_MIN * 60 * 1000;
    log(`Polling setiap ${CONFIG.INTERVAL_MIN} menit. Ctrl+C untuk berhenti.`);
    setInterval(runScan, intervalMs);
}

main().catch(err => { log(`Fatal: ${err.message}`, 'ERROR'); process.exit(1); });
