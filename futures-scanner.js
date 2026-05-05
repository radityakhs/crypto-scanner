#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Futures Scanner v2 — Real-Time Signal Engine untuk Small Account
//  Jalankan: node futures-scanner.js [--coins 30] [--tf 1h] [--min-conf 55]
//
//  Flow:
//    1. Fetch top USDT pairs dari Binance proxy (localhost:3001)
//    2. Fetch 1H + 4H + 1D candles per coin (multi-timeframe)
//    3. Jalankan 12 quant engines paralel
//    4. Filter: SHORT hanya valid jika HTF downtrend terkonfirmasi
//    5. Tampilkan sinyal terurut dari yang paling high-confidence
//    6. Simpan ke futures-signals.json
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const http = require('http');
const path = require('path');

// ─── CLI ARGS ─────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const getArg   = (flag, def) => { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1] : def; };
const hasFlag  = flag => args.includes(flag);

const TOP_N        = parseInt(getArg('--coins', '50'));
const LTF          = getArg('--tf', '1h');          // main timeframe sinyal
const HTF          = getArg('--htf', '4h');         // higher timeframe konfirmasi
const DAILY_TF     = '1d';                           // daily untuk mega-trend
const MIN_CONF     = parseInt(getArg('--min-conf', '45'));
const MIN_BULLISH  = parseInt(getArg('--min-bull', '58'));
const MIN_BEARISH  = parseInt(getArg('--min-bear', '58'));
const CANDLE_LIMIT = parseInt(getArg('--candles', '200'));  // candles per request
const PROXY_HOST   = '127.0.0.1';
const PROXY_PORT   = 3001;
const OUT_FILE     = path.join(__dirname, 'futures-signals.json');
const VERBOSE      = hasFlag('-v') || hasFlag('--verbose');

// ─── UTILS ────────────────────────────────────────────────────────────────────
const mean   = arr => arr.length ? arr.reduce((s,v) => s+v, 0) / arr.length : 0;
const stdDev = arr => { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(arr.reduce((s,v) => s+(v-m)**2, 0) / arr.length); };
const clamp  = (v,lo,hi) => Math.min(hi, Math.max(lo, v));
const sleep  = ms => new Promise(r => setTimeout(r, ms));

function randn() {
    let u=0, v=0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── COLOR CODES (terminal) ───────────────────────────────────────────────────
const C = {
    reset : '\x1b[0m',
    bold  : '\x1b[1m',
    dim   : '\x1b[2m',
    green : '\x1b[32m',
    red   : '\x1b[31m',
    yellow: '\x1b[33m',
    cyan  : '\x1b[36m',
    blue  : '\x1b[34m',
    white : '\x1b[37m',
    gray  : '\x1b[90m',
    bgGreen : '\x1b[42m\x1b[30m',
    bgRed   : '\x1b[41m\x1b[97m',
    bgYellow: '\x1b[43m\x1b[30m',
    bgBlue  : '\x1b[44m\x1b[97m',
    bgGray  : '\x1b[100m\x1b[97m',
};

const green  = s => `${C.green}${s}${C.reset}`;
const red    = s => `${C.red}${s}${C.reset}`;
const yellow = s => `${C.yellow}${s}${C.reset}`;
const cyan   = s => `${C.cyan}${s}${C.reset}`;
const gray   = s => `${C.gray}${s}${C.reset}`;
const bold   = s => `${C.bold}${s}${C.reset}`;
const dim    = s => `${C.dim}${s}${C.reset}`;

function colorPct(pct, threshold1=55, threshold2=65) {
    if (pct >= threshold2) return `${C.bold}${C.green}${pct}%${C.reset}`;
    if (pct >= threshold1) return `${C.yellow}${pct}%${C.reset}`;
    return `${C.gray}${pct}%${C.reset}`;
}

function progressBar(pct, width=20) {
    const filled = Math.round(pct / 100 * width);
    const empty  = width - filled;
    const color  = pct >= 65 ? C.green : pct >= 50 ? C.yellow : C.red;
    return `${color}${'█'.repeat(filled)}${C.gray}${'░'.repeat(empty)}${C.reset}`;
}

// ─── HTTP PROXY FETCH ─────────────────────────────────────────────────────────
function proxyFetch(endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: PROXY_HOST,
            port    : PROXY_PORT,
            path    : endpoint,
            method  : 'GET',
            headers : { 'User-Agent': 'futures-scanner/2.0' },
        };
        const req = http.request(options, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('JSON parse: ' + data.slice(0,120))); }
            });
        });
        req.on('error', reject);
        req.setTimeout(12000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

async function fetchCandles(instId, bar, limit) {
    const ep = `/okx/candles?instId=${instId}&bar=${bar}&limit=${limit}`;
    const d  = await proxyFetch(ep);
    if (!d?.data || !Array.isArray(d.data)) throw new Error(`No candle data for ${instId} ${bar}`);
    // format: [ts, open, high, low, close, vol]
    return d.data.map(k => ({
        ts    : Number(k[0]),
        open  : parseFloat(k[1]),
        high  : parseFloat(k[2]),
        low   : parseFloat(k[3]),
        close : parseFloat(k[4]),
        volume: parseFloat(k[5]),
    })).reverse(); // kronologis
}

async function fetchInstruments() {
    const d = await proxyFetch('/okx/instruments');
    if (!d?.data) throw new Error('No instruments');
    return d.data;
}

async function fetchTicker24h(instId) {
    const d = await proxyFetch(`/okx/ticker/24hr?instId=${instId}`);
    return d || {};
}

// ─── TOP VOLUME COINS ─────────────────────────────────────────────────────────
// Filter instrumen berdasarkan volume 24h dari ticker — ambil yang paling likuid
const SKIP_COINS = new Set([
    'TUSD-USDT','BUSD-USDT','USDC-USDT','DAI-USDT','FDUSD-USDT',
    'USDP-USDT','SUSD-USDT','USDS-USDT','FRAX-USDT','GUSD-USDT',
    'PAX-USDT','HUSD-USDT','LUSD-USDT','CELO-USDT','EURT-USDT',
]);

// Tier-1 coins — prioritas scan (high liquidity, best signals)
const TIER1 = [
    'BTC-USDT','ETH-USDT','BNB-USDT','SOL-USDT','XRP-USDT',
    'ADA-USDT','AVAX-USDT','DOT-USDT','LINK-USDT','MATIC-USDT',
    'DOGE-USDT','SHIB-USDT','TRX-USDT','UNI-USDT','ATOM-USDT',
    'LTC-USDT','BCH-USDT','NEAR-USDT','ICP-USDT','APT-USDT',
    'OP-USDT','ARB-USDT','HBAR-USDT','VET-USDT','FIL-USDT',
    'ALGO-USDT','XLM-USDT','ETC-USDT','MANA-USDT','SAND-USDT',
    'AXS-USDT','AAVE-USDT','SNX-USDT','CRV-USDT','COMP-USDT',
    'FTM-USDT','EGLD-USDT','THETA-USDT','FLOW-USDT','CHZ-USDT',
    'ENJ-USDT','GRT-USDT','1INCH-USDT','BAT-USDT','ZIL-USDT',
    'ZEC-USDT','DASH-USDT','XMR-USDT','EOS-USDT','IOTA-USDT',
];

// ═══════════════════════════════════════════════════════════════════════════════
//  QUANT ENGINES — 12 engines
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Engine 1: Market Structure (SMC) ─────────────────────────────────────────
function detectSwings(closes, strength=5) {
    const highs=[], lows=[];
    for (let i=strength; i<closes.length-strength; i++) {
        const slice = closes.slice(i-strength, i+strength+1);
        if (closes[i] === Math.max(...slice)) highs.push({ idx:i, price:closes[i] });
        if (closes[i] === Math.min(...slice)) lows.push({ idx:i, price:closes[i] });
    }
    return { highs, lows };
}

function marketStructure(candles) {
    if (!candles || candles.length < 20) return { trend:'unknown', bos:'none', choch:false, structureScore:50, lastHigh:0, lastLow:Infinity };
    const closes = candles.map(c => c.close);
    const { highs, lows } = detectSwings(closes, 5);
    const last3H = highs.slice(-3).map(h => h.price);
    const last3L = lows.slice(-3).map(l => l.price);
    const pattern = [];
    for (let i=1; i<last3H.length; i++) pattern.push(last3H[i] > last3H[i-1] ? 'HH' : 'LH');
    for (let i=1; i<last3L.length; i++) pattern.push(last3L[i] > last3L[i-1] ? 'HL' : 'LL');
    const hhC=pattern.filter(p=>p==='HH').length, hlC=pattern.filter(p=>p==='HL').length;
    const lhC=pattern.filter(p=>p==='LH').length, llC=pattern.filter(p=>p==='LL').length;
    let trend;
    if      (hhC>=1 && hlC>=1) trend='uptrend';
    else if (lhC>=1 && llC>=1) trend='downtrend';
    else if (hhC>=1 && llC>=1) trend='reversal_top';
    else if (lhC>=1 && hlC>=1) trend='reversal_bottom';
    else                        trend='consolidation';
    const cur = closes.at(-1);
    const lastHigh = last3H.at(-1) || 0;
    const lastLow  = last3L.at(-1) || Infinity;
    const prevHigh = last3H.at(-2) || 0, prevLow = last3L.at(-2) || Infinity;
    const bos  = cur > lastHigh ? 'bullish_bos' : cur < lastLow ? 'bearish_bos' : 'none';
    const choch = (trend==='uptrend' && cur < prevLow) || (trend==='downtrend' && cur > prevHigh);
    let sScore = trend==='uptrend'?75 : trend==='downtrend'?25 : trend==='reversal_bottom'?65 : trend==='reversal_top'?35 : 50;
    if (bos==='bullish_bos') sScore = clamp(sScore+10, 0, 95);
    if (bos==='bearish_bos') sScore = clamp(sScore-10, 5, 100);
    if (choch) sScore = 50;
    return { trend, bos, choch, structureScore:sScore, lastHigh, lastLow, pattern };
}

// ─── Engine 2: RSI (14) ───────────────────────────────────────────────────────
function calcRSI(closes, period=14) {
    if (closes.length < period+2) return { rsi:50, zone:'neutral', score:50 };
    let gains=0, losses=0;
    for (let i=closes.length-period; i<closes.length; i++) {
        const d = closes[i]-closes[i-1];
        if (d>0) gains+=d; else losses+=Math.abs(d);
    }
    const rs   = gains/period / (losses/period || 0.001);
    const rsi  = Math.round(100 - 100/(1+rs));
    const zone = rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : rsi < 45 ? 'bearish' : rsi > 55 ? 'bullish' : 'neutral';
    // Score: oversold = bullish signal (70+), overbought = bearish signal (30-)
    const score = rsi < 30 ? 78 : rsi > 70 ? 22 : rsi < 45 ? 38 : rsi > 55 ? 62 : 50;
    return { rsi, zone, score };
}

// ─── Engine 3: MACD (12/26/9) ────────────────────────────────────────────────
function calcEMA(closes, period) {
    if (closes.length < period) return closes.at(-1) || 0;
    const k = 2/(period+1);
    let ema = closes.slice(0, period).reduce((s,v) => s+v, 0) / period;
    for (let i=period; i<closes.length; i++) ema = closes[i]*k + ema*(1-k);
    return ema;
}

function calcMACD(closes) {
    if (closes.length < 35) return { macd:0, signal:0, hist:0, cross:'none', score:50 };
    const ema12 = calcEMA(closes, 12);
    const ema26 = calcEMA(closes, 26);
    const macd  = ema12 - ema26;
    // Approx signal line
    const prev12 = calcEMA(closes.slice(0,-1), 12);
    const prev26 = calcEMA(closes.slice(0,-1), 26);
    const prevM  = prev12 - prev26;
    const signal = (macd*2 + prevM) / 3;
    const hist   = macd - signal;
    const cross  = macd>0 && prevM<=0 ? 'bullish_cross' : macd<0 && prevM>=0 ? 'bearish_cross' : 'none';
    const score  = cross==='bullish_cross'?85 : cross==='bearish_cross'?15 : macd>0&&hist>0?70 : macd<0&&hist<0?30 : macd>0?60 : macd<0?40 : 50;
    return { macd:+macd.toFixed(6), signal:+signal.toFixed(6), hist:+hist.toFixed(6), cross, score };
}

// ─── Engine 4: Bollinger Bands ────────────────────────────────────────────────
function calcBB(closes, period=20, mult=2) {
    if (closes.length < period) return { upper:0, mid:0, lower:0, bw:5, pos:50, phase:'normal', score:50 };
    const slice = closes.slice(-period);
    const sma   = mean(slice);
    const std   = stdDev(slice);
    const upper = sma + mult*std, lower = sma - mult*std;
    const bw    = sma > 0 ? (upper-lower)/sma*100 : 5;
    const cur   = closes.at(-1);
    const pos   = upper > lower ? (cur-lower)/(upper-lower)*100 : 50; // 0=at lower, 100=at upper
    const phase = bw < 3 ? 'squeeze' : bw < 6 ? 'contraction' : bw < 12 ? 'normal' : bw < 20 ? 'expansion' : 'high_expansion';
    // Score: harga di bawah BB lower = potensi bounce (bullish), di atas upper = potensi koreksi
    const score = pos < 15 ? 75 : pos > 85 ? 25 : pos < 35 ? 62 : pos > 65 ? 38 : 50;
    return { upper:+upper.toFixed(6), mid:+sma.toFixed(6), lower:+lower.toFixed(6), bw:+bw.toFixed(2), pos:+pos.toFixed(1), phase, score };
}

// ─── Engine 5: Volume Profile (POC) ──────────────────────────────────────────
function volumeProfile(candles) {
    if (!candles || candles.length < 15) return { poc:0, pocRelative:'at', score:50 };
    const n = Math.min(candles.length, 100);
    const prices  = candles.slice(-n).map(c => c.close);
    const volumes = candles.slice(-n).map(c => c.volume);
    const BINS=24, pMin=Math.min(...prices), pMax=Math.max(...prices);
    const step=(pMax-pMin)/BINS;
    if (!step) return { poc:prices.at(-1), pocRelative:'at', score:50 };
    const bins = Array.from({length:BINS}, (_,i) => ({ mid:pMin+(i+0.5)*step, vol:0 }));
    for (let i=0; i<n; i++) bins[clamp(Math.floor((prices[i]-pMin)/step), 0, BINS-1)].vol += volumes[i];
    const poc = bins.reduce((mx,b) => b.vol>mx.vol?b:mx, bins[0]).mid;
    const cur = prices.at(-1);
    const rel = cur > poc*1.005 ? 'above' : cur < poc*0.995 ? 'below' : 'at';
    const score = rel==='above'?65 : rel==='below'?35 : 52;
    return { poc:+poc.toFixed(6), pocRelative:rel, score };
}

// ─── Engine 6: Order Flow / CVD ───────────────────────────────────────────────
function orderFlow(candles) {
    if (!candles || candles.length < 10) return { cvdTrend:'neutral', buyPressure:50, imbalance:0, score:50 };
    const n = Math.min(candles.length, 50);
    const slice = candles.slice(-n);
    const deltas = slice.map(c => {
        const bullish = c.close > c.open;
        return bullish ? c.volume : -c.volume;
    });
    const cvd  = deltas.slice(-10).reduce((s,d) => s+d, 0);
    const upV  = deltas.filter(d=>d>0).reduce((s,d) => s+d, 0);
    const totV = deltas.reduce((s,d) => s+Math.abs(d), 0);
    const bp   = totV > 0 ? Math.round(upV/totV*100) : 50;
    const imb  = totV > 0 ? +((upV-(totV-upV))/totV).toFixed(3) : 0;
    const trend = cvd > 0 ? 'positive' : cvd < 0 ? 'negative' : 'neutral';
    const score = trend==='positive'?70 : trend==='negative'?30 : 50;
    return { cvdTrend:trend, buyPressure:bp, imbalance:imb, score };
}

// ─── Engine 7: ATR Volatility ─────────────────────────────────────────────────
function atrVolatility(candles, period=14) {
    if (!candles || candles.length < period+1) return { atr:0, atrPct:0, phase:'normal', score:50 };
    const trs = [];
    for (let i=1; i<candles.length; i++) {
        const c=candles[i], p=candles[i-1];
        trs.push(Math.max(c.high-c.low, Math.abs(c.high-p.close), Math.abs(c.low-p.close)));
    }
    const atr    = mean(trs.slice(-period));
    const atrPct = candles.at(-1).close > 0 ? atr/candles.at(-1).close*100 : 0;
    const phase  = atrPct < 1 ? 'low_vol' : atrPct < 3 ? 'normal' : atrPct < 6 ? 'elevated' : 'high_vol';
    // high volatility dengan downtrend = bearish, high vol dengan uptrend = bullish expansion
    const score  = 50; // neutral — dipakai untuk SL/TP kalkulasi
    return { atr:+atr.toFixed(8), atrPct:+atrPct.toFixed(2), phase, score };
}

// ─── Engine 8: Momentum (ROC) ─────────────────────────────────────────────────
function calcMomentum(closes, period=10) {
    if (closes.length < period+1) return { roc:0, score:50, trend:'flat' };
    const cur  = closes.at(-1);
    const prev = closes[closes.length-period-1];
    const roc  = prev > 0 ? (cur-prev)/prev*100 : 0;
    const score = clamp(Math.round(50 + roc*3), 5, 95);
    const trend = roc > 3 ? 'strong_up' : roc > 1 ? 'up' : roc < -3 ? 'strong_down' : roc < -1 ? 'down' : 'flat';
    return { roc:+roc.toFixed(2), score, trend };
}

// ─── Engine 9: Support/Resistance Proximity ───────────────────────────────────
function supResProximity(candles) {
    if (!candles || candles.length < 20) return { nearSupport:false, nearResistance:false, score:50 };
    const n = Math.min(candles.length, 100);
    const highs  = candles.slice(-n).map(c => c.high);
    const lows   = candles.slice(-n).map(c => c.low);
    const cur    = candles.at(-1).close;
    const maxH   = Math.max(...highs);
    const minL   = Math.min(...lows);
    const range  = maxH - minL;
    if (!range) return { nearSupport:false, nearResistance:false, score:50 };
    // Near support: dalam 3% dari recent low
    const nearSupport    = (cur - minL) / range < 0.08;
    // Near resistance: dalam 3% dari recent high
    const nearResistance = (maxH - cur) / range < 0.08;
    const score = nearSupport ? 68 : nearResistance ? 32 : 50;
    return { nearSupport, nearResistance, score, supportLevel:+minL.toFixed(6), resistanceLevel:+maxH.toFixed(6) };
}

// ─── Engine 10: Trend Alignment (MA Stack) ────────────────────────────────────
function maAlignment(closes) {
    if (closes.length < 50) return { ma20:0, ma50:0, aligned:'neutral', score:50 };
    const ma20  = mean(closes.slice(-20));
    const ma50  = mean(closes.slice(-50));
    const ma200 = closes.length >= 200 ? mean(closes.slice(-200)) : null;
    const cur   = closes.at(-1);
    let aligned = 'neutral', score = 50;
    if (cur > ma20 && ma20 > ma50) {
        aligned = 'bullish'; score = 72;
        if (ma200 && cur > ma200) { aligned='strong_bullish'; score=80; }
    } else if (cur < ma20 && ma20 < ma50) {
        aligned = 'bearish'; score = 28;
        if (ma200 && cur < ma200) { aligned='strong_bearish'; score=20; }
    }
    return { ma20:+ma20.toFixed(6), ma50:+ma50.toFixed(6), ma200:ma200?+ma200.toFixed(6):null, aligned, score };
}

// ─── Engine 11: Monte Carlo GBM ───────────────────────────────────────────────
function monteCarlo(closes, paths=400, days=5) {
    if (closes.length < 15) return { probUp:50, p25:closes.at(-1), p75:closes.at(-1) };
    const lr = [];
    for (let i=1; i<closes.length; i++) if (closes[i-1]>0) lr.push(Math.log(closes[i]/closes[i-1]));
    const mu=mean(lr), sigma=stdDev(lr), S0=closes.at(-1);
    const finals = [];
    for (let p=0; p<paths; p++) {
        let S=S0;
        for (let t=0; t<days; t++) S*=Math.exp((mu-0.5*sigma*sigma)+sigma*randn());
        finals.push(S);
    }
    finals.sort((a,b) => a-b);
    const pctile = pct => finals[Math.floor(paths*pct/100)];
    const probUp = Math.round(finals.filter(f => f>S0).length/paths*100);
    return { probUp, p10:+pctile(10).toFixed(6), p25:+pctile(25).toFixed(6), p50:+pctile(50).toFixed(6), p75:+pctile(75).toFixed(6), p90:+pctile(90).toFixed(6) };
}

// ─── Engine 12: Whale/Volume Spike ───────────────────────────────────────────
function whalePressure(candles) {
    if (!candles || candles.length < 20) return { bias:'neutral', pressureScore:50, volumeSpike:false };
    const n     = Math.min(candles.length, 50);
    const slice = candles.slice(-n);
    const vols  = slice.map(c => c.volume);
    const avgV  = mean(vols.slice(0,-1));
    const lastV = vols.at(-1);
    const vRatio = avgV > 0 ? lastV/avgV : 1;
    const volumeSpike = vRatio > 2.0;
    // OBV trend
    let obv = 0;
    for (let i=1; i<slice.length; i++) {
        const d = slice[i].close - slice[i-1].close;
        obv += d > 0 ? slice[i].volume : d < 0 ? -slice[i].volume : 0;
    }
    const lastPrice = candles.at(-1).close;
    const prevPrice = candles[candles.length-8]?.close || lastPrice;
    const priceUp   = lastPrice > prevPrice;
    let ps = 50;
    if (obv > 0)  ps += 15; else ps -= 15;
    if (volumeSpike && priceUp)  ps += 20;
    if (volumeSpike && !priceUp) ps -= 20;
    ps = clamp(Math.round(ps), 5, 95);
    const bias = ps >= 65 ? 'accumulation' : ps <= 35 ? 'distribution' : 'neutral';
    return { bias, pressureScore:ps, volumeSpike, vRatio:+vRatio.toFixed(2), obvTrend:obv>0?'up':'down' };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DIRECTIONAL PROBABILITY — Weighted scoring semua engine
// ═══════════════════════════════════════════════════════════════════════════════
function calcDirectionalProb(engines) {
    const { ms, rsi, macd, bb, vp, of, atr, mom, sr, ma, mc, whale } = engines;

    const weights = {
        'Market Structure' : 0.18,
        'BOS/CHoCH'        : 0.10,
        'MA Alignment'     : 0.12,
        'RSI'              : 0.10,
        'MACD'             : 0.10,
        'Order Flow (CVD)' : 0.10,
        'Whale Pressure'   : 0.08,
        'Momentum (ROC)'   : 0.07,
        'Bollinger Bands'  : 0.07,
        'Volume Profile'   : 0.04,
        'Monte Carlo'      : 0.04,
    };

    const scores = [
        { label:'Market Structure', score: ms.structureScore,   weight: weights['Market Structure'] },
        { label:'BOS/CHoCH',        score: ms.bos==='bullish_bos'?82:ms.bos==='bearish_bos'?18:ms.choch?50:52, weight: weights['BOS/CHoCH'] },
        { label:'MA Alignment',     score: ma.score,            weight: weights['MA Alignment'] },
        { label:'RSI',              score: rsi.score,           weight: weights['RSI'] },
        { label:'MACD',             score: macd.score,          weight: weights['MACD'] },
        { label:'Order Flow (CVD)', score: of.score,            weight: weights['Order Flow (CVD)'] },
        { label:'Whale Pressure',   score: whale.pressureScore, weight: weights['Whale Pressure'] },
        { label:'Momentum (ROC)',   score: mom.score,           weight: weights['Momentum (ROC)'] },
        { label:'Bollinger Bands',  score: bb.score,            weight: weights['Bollinger Bands'] },
        { label:'Volume Profile',   score: vp.score,            weight: weights['Volume Profile'] },
        { label:'Monte Carlo',      score: mc.probUp,           weight: weights['Monte Carlo'] },
    ];

    const raw     = scores.reduce((s,m) => s + m.score*m.weight, 0);
    const bullish = clamp(Math.round(raw), 5, 95);

    return { bullish, bearish:100-bullish, subScores:scores };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HTF FILTER — SHORT hanya valid jika HTF downtrend terkonfirmasi
// ═══════════════════════════════════════════════════════════════════════════════
function htfFilter(htfCandles, dailyCandles, signal) {
    const htfMs  = marketStructure(htfCandles);
    const dayMs  = marketStructure(dailyCandles);
    const htfMa  = maAlignment(htfCandles.map(c => c.close));
    const dayMa  = maAlignment(dailyCandles.map(c => c.close));

    const bullTrends = ['uptrend', 'reversal_bottom'];
    const bearTrends = ['downtrend', 'reversal_top'];

    let penalty = 0, reason = '', aligned = true;

    if (signal === 'LONG') {
        if (bearTrends.includes(htfMs.trend)) { penalty += 20; reason = `4H:${htfMs.trend}`; aligned = false; }
        if (bearTrends.includes(dayMs.trend)) { penalty += 25; reason += ` 1D:${dayMs.trend}`; aligned = false; }
        if (bullTrends.includes(htfMs.trend)) { penalty -= 8; reason = `4H:${htfMs.trend}✅`; }
        if (bullTrends.includes(dayMs.trend)) { penalty -= 10; reason += ` 1D:${dayMs.trend}✅`; }
    } else if (signal === 'SHORT') {
        // SHORT lebih ketat: butuh konfirmasi KEDUA timeframe
        if (!bearTrends.includes(htfMs.trend) && !bearTrends.includes(dayMs.trend)) {
            penalty += 35; reason = `SHORT kontra HTF (4H:${htfMs.trend} 1D:${dayMs.trend})`; aligned = false;
        } else if (bearTrends.includes(htfMs.trend) && bearTrends.includes(dayMs.trend)) {
            penalty -= 12; reason = `4H+1D downtrend✅`;
        } else if (bearTrends.includes(htfMs.trend)) {
            penalty += 5; reason = `4H:${htfMs.trend} 1D:${dayMs.trend}`;
        }
    }

    return { penalty:clamp(penalty,-15,50), aligned, reason, htfTrend:htfMs.trend, dayTrend:dayMs.trend, htfMaAligned:htfMa.aligned, dayMaAligned:dayMa.aligned };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TRADE LEVELS — ATR-based SL/TP (lebih realistis)
// ═══════════════════════════════════════════════════════════════════════════════
function tradeLevels(candles, dirProb, atr, sr) {
    const cur     = candles.at(-1).close;
    const isBull  = dirProb.bullish >= 50;
    const atrVal  = atr.atr || cur*0.02;

    // Entry zone: current ± 0.3%
    const entryLow  = isBull ? +(cur*0.997).toFixed(6) : +(cur*0.998).toFixed(6);
    const entryHigh = isBull ? +(cur*1.003).toFixed(6) : +(cur*1.002).toFixed(6);

    // SL: 1.5x ATR dari entry (tighter untuk small account)
    const sl    = isBull ? +(cur - atrVal*1.5).toFixed(6) : +(cur + atrVal*1.5).toFixed(6);
    const slPct = Math.abs(cur - sl) / cur * 100;
    const slDist = Math.abs(cur - sl);

    // TP: ATR-based dengan R:R minimum 1.5, 2.5, 4.0
    const tp1   = isBull ? +(cur + slDist*1.5).toFixed(6) : +(cur - slDist*1.5).toFixed(6);
    const tp2   = isBull ? +(cur + slDist*2.5).toFixed(6) : +(cur - slDist*2.5).toFixed(6);
    const tp3   = isBull ? +(cur + slDist*4.0).toFixed(6) : +(cur - slDist*4.0).toFixed(6);

    // R:R TP1
    const rr    = slDist > 0 ? +(slDist*1.5/slDist).toFixed(2) : 1.5;

    // Leverage rekomendasi untuk small account
    // Berdasarkan: jika SL > 4% = lever rendah; < 1% = bisa lebih tinggi
    let leverage = 5;
    if (slPct < 0.8) leverage = 20;
    else if (slPct < 1.5) leverage = 15;
    else if (slPct < 2.5) leverage = 10;
    else if (slPct < 4) leverage = 7;
    else leverage = 5;

    // Capital at risk: 1-2% dari modal per trade (small account rule)
    const riskPct = 1.5; // 1.5% per trade

    return { entryLow, entryHigh, sl, tp1, tp2, tp3, rr:1.5, slPct:+slPct.toFixed(2), leverage, riskPct };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIDENCE SCORE — Gabungan semua faktor
// ═══════════════════════════════════════════════════════════════════════════════
function calcConfidence(dirProb, htf, engines) {
    const { ms, rsi, macd, ma } = engines;
    let conf = Math.round(Math.abs(dirProb.bullish - 50) * 2); // base: 0-100

    // Bonus untuk alignment antar engines
    const signal = dirProb.bullish >= 50 ? 'LONG' : 'SHORT';
    if (signal === 'LONG') {
        if (ms.bos === 'bullish_bos') conf += 8;
        if (macd.cross === 'bullish_cross') conf += 8;
        if (rsi.zone === 'oversold') conf += 10;
        if (ma.aligned === 'strong_bullish') conf += 8;
        if (htf.aligned) conf += 10;
    } else {
        if (ms.bos === 'bearish_bos') conf += 8;
        if (macd.cross === 'bearish_cross') conf += 8;
        if (rsi.zone === 'overbought') conf += 10;
        if (ma.aligned === 'strong_bearish') conf += 8;
        if (htf.aligned) conf += 10;
    }

    // Penalti dari HTF
    conf -= htf.penalty;

    // Penalti jika MACD kontra sinyal
    if (signal==='LONG' && macd.cross==='bearish_cross') conf -= 10;
    if (signal==='SHORT' && macd.cross==='bullish_cross') conf -= 10;

    return clamp(Math.round(conf), 0, 99);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  REALISASI CHANCE — Probabilitas trade mencapai TP1 berdasarkan backtest data
//  Formula: P(TP1) = base_winrate * conf_multiplier * htf_multiplier * regime_mult
// ═══════════════════════════════════════════════════════════════════════════════
function calcRealisasiChance(dirProb, conf, htf, engines, signal) {
    const { rsi, macd, ms, ma } = engines;

    // Base: dari bulk backtest engine (LONG ~58%, SHORT ~42% historis)
    let base = signal === 'LONG' ? 0.58 : 0.42;

    // Faktor dari confidence
    const confMult = 0.7 + (conf/100) * 0.6; // 0.7x (conf=0) → 1.3x (conf=100)

    // HTF aligned bonus
    const htfMult = htf.aligned ? 1.15 : 0.85;

    // RSI zona bonus
    let rsiBonusMult = 1.0;
    if (signal==='LONG'  && rsi.zone==='oversold')    rsiBonusMult = 1.12;
    if (signal==='SHORT' && rsi.zone==='overbought')  rsiBonusMult = 1.12;
    if (signal==='LONG'  && rsi.zone==='overbought')  rsiBonusMult = 0.80;
    if (signal==='SHORT' && rsi.zone==='oversold')    rsiBonusMult = 0.80;

    // MACD bonus
    let macdMult = 1.0;
    if (signal==='LONG'  && macd.cross==='bullish_cross') macdMult = 1.10;
    if (signal==='SHORT' && macd.cross==='bearish_cross') macdMult = 1.10;

    // MA alignment
    let maMult = 1.0;
    if (signal==='LONG'  && ma.aligned==='strong_bullish') maMult = 1.10;
    if (signal==='SHORT' && ma.aligned==='strong_bearish')  maMult = 1.10;

    const raw = base * confMult * htfMult * rsiBonusMult * macdMult * maMult;
    const pct = clamp(Math.round(raw * 100), 15, 88);

    // Decompose untuk tampilan
    const factors = [];
    if (htf.aligned)  factors.push('HTF aligned');
    if (signal==='LONG'  && rsi.zone==='oversold')    factors.push('RSI oversold');
    if (signal==='SHORT' && rsi.zone==='overbought')  factors.push('RSI overbought');
    if (macd.cross !== 'none') factors.push(`MACD ${macd.cross.replace('_cross','')}`);
    if (ma.aligned.includes('strong'))  factors.push(`MA ${ma.aligned}`);
    if (ms.bos !== 'none') factors.push(`BOS ${ms.bos.replace('_bos','')}`);

    return { pct, factors };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SCAN SATU COIN
// ═══════════════════════════════════════════════════════════════════════════════
async function scanCoin(instId) {
    // Fetch 3 timeframes paralel
    const [ltfCandles, htfCandles, dayCandles] = await Promise.all([
        fetchCandles(instId, LTF, CANDLE_LIMIT),
        fetchCandles(instId, HTF, 100),
        fetchCandles(instId, DAILY_TF, 200),
    ]);

    if (ltfCandles.length < 50) return null;

    const closes = ltfCandles.map(c => c.close);
    const cur    = ltfCandles.at(-1).close;

    // Run all 12 engines
    const ms    = marketStructure(ltfCandles);
    const rsi   = calcRSI(closes);
    const macd  = calcMACD(closes);
    const bb    = calcBB(closes);
    const vp    = volumeProfile(ltfCandles);
    const of    = orderFlow(ltfCandles);
    const atr   = atrVolatility(ltfCandles);
    const mom   = calcMomentum(closes);
    const sr    = supResProximity(ltfCandles);
    const ma    = maAlignment(closes);
    const mc    = monteCarlo(closes);
    const whale = whalePressure(ltfCandles);

    const engines = { ms, rsi, macd, bb, vp, of, atr, mom, sr, ma, mc, whale };

    const dir  = calcDirectionalProb(engines);

    // Tentukan sinyal awal
    let signal = 'WAIT';
    if      (dir.bullish >= MIN_BULLISH) signal = 'LONG';
    else if (dir.bearish >= MIN_BEARISH) signal = 'SHORT';
    else return null; // tidak ada sinyal kuat

    // HTF Filter
    const htf = htfFilter(htfCandles, dayCandles, signal);

    // Confidence
    const conf = calcConfidence(dir, htf, engines);

    // Tolak jika confidence kurang
    if (conf < MIN_CONF) return null;

    // Tolak SHORT jika RSI sangat oversold (< 28) — potensi bounce
    if (signal === 'SHORT' && rsi.rsi < 28) return null;
    // Tolak LONG jika RSI sangat overbought (> 78)
    if (signal === 'LONG' && rsi.rsi > 78) return null;

    // Tingkat realisasi
    const real = calcRealisasiChance(dir, conf, htf, engines, signal);

    // Trade levels
    const levels = tradeLevels(ltfCandles, dir, atr, sr);

    // Change 24h dari daily candle
    const d1 = dayCandles.at(-1), d2 = dayCandles.at(-2);
    const change24h = d1 && d2 && d2.close > 0 ? +((d1.close - d2.close)/d2.close*100).toFixed(2) : 0;

    return {
        instId,
        symbol    : instId.replace('-USDT',''),
        signal,
        currentPrice : cur,
        change24h,
        bullish   : dir.bullish,
        bearish   : dir.bearish,
        confidence: conf,
        realisasi : real.pct,
        realisasiFactors: real.factors,
        subScores : dir.subScores,
        levels,
        htf,
        engines   : {
            trend   : ms.trend,
            bos     : ms.bos,
            rsi     : rsi.rsi,
            rsiZone : rsi.zone,
            macd    : macd.macd,
            macdCross: macd.cross,
            bbPhase : bb.phase,
            bbPos   : bb.pos,
            cvdTrend: of.cvdTrend,
            whaleBias: whale.bias,
            whaleScore: whale.pressureScore,
            volSpike: whale.volumeSpike,
            atrPct  : atr.atrPct,
            atrPhase: atr.phase,
            momRoc  : mom.roc,
            momTrend: mom.trend,
            maAligned: ma.aligned,
            mcProbUp: mc.probUp,
            pocRel  : vp.pocRelative,
            nearSupport: sr.nearSupport,
            nearResistance: sr.nearResistance,
        },
        timestamp : new Date().toISOString(),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PRINT SIGNAL CARD — tampilan terminal super lengkap
// ═══════════════════════════════════════════════════════════════════════════════
function printSignalCard(s, rank) {
    const isLong = s.signal === 'LONG';
    const sigColor = isLong ? C.green : C.red;
    const sigBg    = isLong ? C.bgGreen : C.bgRed;
    const W = 62;
    const line = '═'.repeat(W);
    const thin = '─'.repeat(W);

    // Grade
    const grade = s.realisasi >= 75 ? 'A+' : s.realisasi >= 68 ? 'A' : s.realisasi >= 60 ? 'B+' : s.realisasi >= 52 ? 'B' : 'C';
    const gradeColor = grade==='A+'||grade==='A' ? C.green : grade==='B+' ? C.yellow : C.gray;

    console.log(`\n${sigColor}╔${line}╗${C.reset}`);
    // Header
    const rankStr = `#${rank}`;
    const symbolStr = bold(s.symbol.padEnd(8));
    const sigStr  = `${sigBg} ${s.signal} ${C.reset}`;
    const priceStr = cyan(`$${s.currentPrice.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:8})}`);
    const chgStr  = s.change24h >= 0 ? green(`+${s.change24h}%`) : red(`${s.change24h}%`);
    const gradeStr = `${gradeColor}${bold(grade)}${C.reset}`;
    console.log(`${sigColor}║${C.reset}  ${rankStr} ${symbolStr} ${sigStr}  ${priceStr}  ${chgStr}   Grade: ${gradeStr}`);
    console.log(`${sigColor}╠${line}╣${C.reset}`);

    // ── PROBABILITAS REALISASI ────────────────────────────────────────────
    console.log(`${sigColor}║${C.reset}  ${bold('🎯 PROBABILITAS REALISASI (TP1)')}`);
    const realColor = s.realisasi >= 70 ? C.green : s.realisasi >= 55 ? C.yellow : C.red;
    const realBar = progressBar(s.realisasi, 28);
    console.log(`${sigColor}║${C.reset}     ${realColor}${bold(s.realisasi + '%')}${C.reset}  ${realBar}  Conf: ${colorPct(s.confidence)}`);
    if (s.realisasiFactors.length > 0) {
        console.log(`${sigColor}║${C.reset}     ${dim('Faktor:')} ${s.realisasiFactors.map(f => cyan(f)).join(', ')}`);
    }
    console.log(`${sigColor}║${C.reset}  ${dim(thin)}`);

    // ── DIRECTIONAL SCORE ─────────────────────────────────────────────────
    console.log(`${sigColor}║${C.reset}  ${bold('📊 DIRECTIONAL SCORE')}`);
    const bullBar = progressBar(s.bullish, 16);
    const bearBar = progressBar(s.bearish, 16);
    console.log(`${sigColor}║${C.reset}     BULLISH  ${green(String(s.bullish).padStart(3)+'%')}  ${bullBar}`);
    console.log(`${sigColor}║${C.reset}     BEARISH  ${red(String(s.bearish).padStart(3)+'%')}  ${bearBar}`);
    console.log(`${sigColor}║${C.reset}  ${dim(thin)}`);

    // ── ENGINE SCORES ─────────────────────────────────────────────────────
    console.log(`${sigColor}║${C.reset}  ${bold('🔬 ENGINE BREAKDOWN')} (12 indicators):`);
    const cols = [
        s.subScores.slice(0, 6),
        s.subScores.slice(6),
    ];
    for (const col of cols) {
        for (const sc of col) {
            const bar   = progressBar(sc.score, 12);
            const label = sc.label.padEnd(18);
            const scoreStr = colorPct(sc.score);
            const icon  = sc.score >= 65 ? '▲' : sc.score <= 35 ? '▼' : '─';
            const iconC = sc.score >= 65 ? C.green : sc.score <= 35 ? C.red : C.gray;
            console.log(`${sigColor}║${C.reset}     ${dim(label)} ${bar} ${scoreStr} ${iconC}${icon}${C.reset}`);
        }
    }
    console.log(`${sigColor}║${C.reset}  ${dim(thin)}`);

    // ── KEY INDICATORS ────────────────────────────────────────────────────
    const e = s.engines;
    console.log(`${sigColor}║${C.reset}  ${bold('📡 KEY INDICATORS')}`);
    const rsiColor = e.rsi < 30 ? C.green : e.rsi > 70 ? C.red : C.yellow;
    const rsiZoneIcon = e.rsiZone==='oversold'?'🟢' : e.rsiZone==='overbought'?'🔴' : '🟡';
    console.log(`${sigColor}║${C.reset}     RSI(14): ${rsiColor}${e.rsi}${C.reset} ${rsiZoneIcon}${e.rsiZone}   ` +
                `MACD: ${e.macdCross!=='none'?yellow(e.macdCross.replace('_',' ')):gray('no cross')}   ` +
                `ATR: ${e.atrPct}% (${e.atrPhase})`);
    const maIcon = e.maAligned.includes('bullish') ? green(e.maAligned) : e.maAligned.includes('bearish') ? red(e.maAligned) : gray(e.maAligned);
    const wIcon = e.whaleBias==='accumulation'?green('🐋 ACCUM') : e.whaleBias==='distribution'?red('🐋 DIST') : gray('🐋 neutral');
    console.log(`${sigColor}║${C.reset}     MA Stack: ${maIcon}   BB: ${e.bbPhase} (pos:${e.bbPos}%)   Whale: ${wIcon}`);
    const cvdIcon = e.cvdTrend==='positive'?green('CVD↑') : e.cvdTrend==='negative'?red('CVD↓') : gray('CVD─');
    const momIcon = e.momRoc>2?green(`ROC+${e.momRoc}%`) : e.momRoc<-2?red(`ROC${e.momRoc}%`) : gray(`ROC${e.momRoc}%`);
    const srNote  = e.nearSupport ? green('⚓ near support') : e.nearResistance ? red('🚧 near resistance') : gray('mid-range');
    console.log(`${sigColor}║${C.reset}     ${cvdIcon}  MC: ${colorPct(e.mcProbUp)}  ${momIcon}  ${srNote}`);
    console.log(`${sigColor}║${C.reset}  ${dim(thin)}`);

    // ── HTF CONFIRMATION ──────────────────────────────────────────────────
    const h = s.htf;
    console.log(`${sigColor}║${C.reset}  ${bold('📈 MULTI-TIMEFRAME')}`);
    const htfAlignIcon = h.aligned ? green('✅ ALIGNED') : red('⚠️ CONFLICT');
    const htfTrendC = h.htfTrend.includes('up')||h.htfTrend.includes('reversal_b') ? green(h.htfTrend) : h.htfTrend.includes('down')||h.htfTrend.includes('reversal_t') ? red(h.htfTrend) : gray(h.htfTrend);
    const dayTrendC = h.dayTrend.includes('up')||h.dayTrend.includes('reversal_b') ? green(h.dayTrend) : h.dayTrend.includes('down')||h.dayTrend.includes('reversal_t') ? red(h.dayTrend) : gray(h.dayTrend);
    console.log(`${sigColor}║${C.reset}     ${LTF.toUpperCase()} signal: ${isLong?green('LONG'):red('SHORT')}   4H: ${htfTrendC}   1D: ${dayTrendC}   ${htfAlignIcon}`);
    if (h.reason) console.log(`${sigColor}║${C.reset}     ${dim('MTF note:')} ${h.reason}`);
    console.log(`${sigColor}║${C.reset}  ${dim(thin)}`);

    // ── TRADE SETUP ───────────────────────────────────────────────────────
    const lv = s.levels;
    console.log(`${sigColor}║${C.reset}  ${bold('💼 TRADE SETUP')} (Small Account — Risk ${lv.riskPct}% modal)`);
    console.log(`${sigColor}║${C.reset}     Entry Zone : ${cyan(lv.entryLow)} — ${cyan(lv.entryHigh)}`);
    console.log(`${sigColor}║${C.reset}     Stop Loss  : ${red(lv.sl)}  (SL: ${yellow(lv.slPct + '%')} dari entry)`);
    console.log(`${sigColor}║${C.reset}     TP1 (1.5R) : ${green(lv.tp1)}   R:R = 1:1.5`);
    console.log(`${sigColor}║${C.reset}     TP2 (2.5R) : ${green(lv.tp2)}   R:R = 1:2.5`);
    console.log(`${sigColor}║${C.reset}     TP3 (4.0R) : ${green(lv.tp3)}   R:R = 1:4.0`);
    console.log(`${sigColor}║${C.reset}     Leverage   : ${yellow('×'+lv.leverage)} (rekomendasi)   Exit 50% di TP1, 50% di TP2`);
    console.log(`${sigColor}║${C.reset}  ${dim(thin)}`);

    // ── SUMMARY NARATIF ───────────────────────────────────────────────────
    console.log(`${sigColor}║${C.reset}  ${bold('📝 SUMMARY')}`);
    const dirWord = isLong ? green('BULLISH') : red('BEARISH');
    const trend3  = `${h.dayTrend.includes('up')?'↑':'↓'} 1D / ${h.htfTrend.includes('up')?'↑':'↓'} 4H / ${e.trend.includes('up')?'↑':'↓'} ${LTF.toUpperCase()}`;
    console.log(`${sigColor}║${C.reset}     Sinyal ${dirWord} dengan realisasi ${realColor}${bold(s.realisasi+'%')}${C.reset} — ${trend3}`);

    const reasons = [];
    if (e.macdCross !== 'none') reasons.push(`MACD ${e.macdCross.replace('_cross','').replace('_',' ')}`);
    if (e.rsiZone === 'oversold')    reasons.push('RSI oversold (bounce setup)');
    if (e.rsiZone === 'overbought')  reasons.push('RSI overbought (koreksi)');
    if (ms.bos !== 'none')           reasons.push(`${ms.bos.replace('_bos','').replace('_',' ')} BOS`);
    if (e.whaleBias === 'accumulation') reasons.push('whale accumulation');
    if (e.whaleBias === 'distribution') reasons.push('whale distribution');
    if (e.volSpike) reasons.push('volume spike');
    if (e.maAligned.includes('strong')) reasons.push(`${e.maAligned.replace('_',' ')} MA`);

    if (reasons.length > 0) console.log(`${sigColor}║${C.reset}     Konfirmasi: ${reasons.map(r => yellow(r)).join(' + ')}`);

    // Risk warning
    if (s.realisasi < 55) console.log(`${sigColor}║${C.reset}     ${red('⚠️ Low confidence')} — ukuran posisi kecil (0.5% modal)`);
    if (!h.aligned)       console.log(`${sigColor}║${C.reset}     ${red('⚠️ HTF conflict')} — entry lebih konservatif`);

    console.log(`${sigColor}╚${line}╝${C.reset}`);
    console.log(dim(`   ${s.instId} | ${new Date(s.timestamp).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} | ${LTF.toUpperCase()} + ${HTF.toUpperCase()} + 1D MTF`));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PRINT SUMMARY TABLE — ringkasan semua sinyal
// ═══════════════════════════════════════════════════════════════════════════════
function printSummaryTable(signals) {
    const W = 62;
    console.log(`\n${bold(cyan('╔' + '═'.repeat(W) + '╗'))}`);
    console.log(`${bold(cyan('║'))}  ${bold('📋 RINGKASAN SINYAL FUTURES')} — ${new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'})}${' '.repeat(Math.max(0, W-56-new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).length))}${bold(cyan('║'))}`);
    console.log(`${bold(cyan('╠' + '═'.repeat(W) + '╣'))}`);
    console.log(`${bold(cyan('║'))}  ${'#'.padEnd(3)} ${'COIN'.padEnd(7)} ${'SINYAL'.padEnd(7)} ${'HARGA'.padEnd(13)} ${'REAL%'.padEnd(7)} ${'CONF'.padEnd(6)} ${'4H TREND'.padEnd(14)} ${'1D'}${' '.repeat(3)}${bold(cyan('║'))}`);
    console.log(`${bold(cyan('╠' + '─'.repeat(W) + '╣'))}`);

    const longs  = signals.filter(s => s.signal === 'LONG').sort((a,b) => b.realisasi-a.realisasi);
    const shorts = signals.filter(s => s.signal === 'SHORT').sort((a,b) => b.realisasi-a.realisasi);

    let rank = 1;
    for (const s of [...longs, ...shorts]) {
        const isLong  = s.signal === 'LONG';
        const sigStr  = isLong ? green('LONG  ') : red('SHORT ');
        const realC   = s.realisasi >= 70 ? C.green : s.realisasi >= 55 ? C.yellow : C.red;
        const confC   = s.confidence >= 60 ? C.green : s.confidence >= 40 ? C.yellow : C.gray;
        const priceStr = s.currentPrice.toLocaleString('en-US',{maximumFractionDigits:4}).padEnd(12);
        const htfTrC  = s.htf.htfTrend.includes('up') ? C.green : s.htf.htfTrend.includes('down') ? C.red : C.gray;
        const dayTrC  = s.htf.dayTrend.includes('up') ? C.green : s.htf.dayTrend.includes('down') ? C.red : C.gray;
        const aligned = s.htf.aligned ? green('✅') : red('⚠');

        console.log(
            `${bold(cyan('║'))}  ${String(rank).padEnd(3)} ${bold(s.symbol.padEnd(7))} ${sigStr} ${C.cyan}$${priceStr}${C.reset} ` +
            `${realC}${String(s.realisasi).padStart(4)}%${C.reset}  ` +
            `${confC}${String(s.confidence).padStart(3)}%${C.reset}  ` +
            `${htfTrC}${s.htf.htfTrend.padEnd(14)}${C.reset} ${dayTrC}${s.htf.dayTrend.slice(0,10)}${C.reset} ${aligned}` +
            `${bold(cyan('║'))}`
        );
        rank++;
    }

    console.log(`${bold(cyan('╠' + '═'.repeat(W) + '╣'))}`);
    // Stats
    const bestSignal = signals[0];
    console.log(`${bold(cyan('║'))}  Total: ${bold(String(signals.length))} sinyal  |  LONG: ${green(String(longs.length))}  SHORT: ${red(String(shorts.length))}${' '.repeat(Math.max(0,W-44))}${bold(cyan('║'))}`);
    if (bestSignal) {
        const bsColor = bestSignal.signal==='LONG' ? C.green : C.red;
        console.log(`${bold(cyan('║'))}  🏆 Best: ${bsColor}${bold(bestSignal.symbol)}${C.reset} ${bestSignal.signal} — Realisasi ${green(bestSignal.realisasi+'%')} | Conf ${green(bestSignal.confidence+'%')}${' '.repeat(Math.max(0,W-60))}${bold(cyan('║'))}`);
    }
    console.log(`${bold(cyan('╚' + '═'.repeat(W) + '╝'))}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SMALL ACCOUNT GUIDE
// ═══════════════════════════════════════════════════════════════════════════════
function printSmallAccountGuide(signals) {
    console.log(`\n${bold(yellow('╔══════════════════════════════════════════════════════════════╗'))}`);
    console.log(`${bold(yellow('║'))}  ${bold('💰 PANDUAN SMALL ACCOUNT — RISK MANAGEMENT FUTURES')}${bold(yellow('║'))}`);
    console.log(`${bold(yellow('╠══════════════════════════════════════════════════════════════╣'))}`);
    console.log(`${bold(yellow('║'))}  1. ${bold('MAX RISK per trade: 1.5% modal')} (jangan lebih!)         ${bold(yellow('║'))}`);
    console.log(`${bold(yellow('║'))}  2. ${bold('Leverage')} sesuai SL% — SL 1.5% = max ×15               ${bold(yellow('║'))}`);
    console.log(`${bold(yellow('║'))}  3. ${bold('Entry bertahap')}: 50% di entry zone, 50% saat konfirmasi ${bold(yellow('║'))}`);
    console.log(`${bold(yellow('║'))}  4. ${bold('Exit strategy')}: 50% di TP1, geser SL ke entry, 50% TP2  ${bold(yellow('║'))}`);
    console.log(`${bold(yellow('║'))}  5. Hanya trade sinyal ${green('Grade A/A+')} (realisasi ≥ 68%)      ${bold(yellow('║'))}`);
    console.log(`${bold(yellow('║'))}  6. Max ${bold('3 posisi terbuka')} bersamaan                          ${bold(yellow('║'))}`);
    console.log(`${bold(yellow('║'))}  7. Jika loss 3x berturut → STOP trading hari itu              ${bold(yellow('║'))}`);
    console.log(`${bold(yellow('╠══════════════════════════════════════════════════════════════╣'))}`);

    // Rekomendasi per modal
    const bestSignals = signals.filter(s => s.realisasi >= 65).slice(0, 3);
    if (bestSignals.length > 0) {
        console.log(`${bold(yellow('║'))}  ${bold('🎯 REKOMENDASI PRIORITAS:')}${' '.repeat(34)}${bold(yellow('║'))}`);
        for (const s of bestSignals) {
            const lv = s.levels;
            const col = s.signal==='LONG' ? C.green : C.red;
            const modalExamples = [
                { modal:50,  risk: (50*lv.riskPct/100).toFixed(2) },
                { modal:100, risk: (100*lv.riskPct/100).toFixed(2) },
                { modal:500, risk: (500*lv.riskPct/100).toFixed(2) },
            ];
            console.log(`${bold(yellow('║'))}  ${col}${bold(s.symbol)}${C.reset} ${col}${s.signal}${C.reset} (${s.realisasi}%) — Risk: ${modalExamples.map(m=>`$${m.modal}→$${m.risk}`).join(' | ')}${' '.repeat(Math.max(0,35-s.symbol.length))}${bold(yellow('║'))}`);
        }
    }
    console.log(`${bold(yellow('╚══════════════════════════════════════════════════════════════╝'))}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.clear();
    const now = new Date().toLocaleString('id-ID', { timeZone:'Asia/Jakarta', dateStyle:'full', timeStyle:'medium' });
    console.log(`\n${bold(cyan('  🔬 FUTURES SCANNER v2 — REAL-TIME SIGNAL ENGINE'))}`);
    console.log(dim(`  ${now}`));
    console.log(dim(`  Timeframe: ${LTF.toUpperCase()} signal | ${HTF.toUpperCase()} konfirmasi | 1D trend`));
    console.log(dim(`  Min confidence: ${MIN_CONF}% | Min bullish/bearish: ${MIN_BULLISH}%`));
    console.log(dim(`  Scanning top ${TOP_N} USDT pairs dari Binance...\n`));

    // Ambil daftar coin
    const scanList = TIER1.slice(0, TOP_N);

    const allSignals  = [];
    const failedCoins = [];
    let   scanned     = 0;

    for (const instId of scanList) {
        process.stdout.write(`  ${dim('→')} Scanning ${cyan(instId.replace('-USDT','').padEnd(8))} `);
        try {
            const result = await scanCoin(instId);
            scanned++;
            if (result) {
                allSignals.push(result);
                const col = result.signal==='LONG' ? C.green : C.red;
                process.stdout.write(`${col}${result.signal}${C.reset} ${yellow(result.realisasi+'%')} conf:${result.confidence}%\n`);
            } else {
                process.stdout.write(dim('WAIT\n'));
            }
            await sleep(350); // rate limit jaga-jaga
        } catch (err) {
            failedCoins.push(instId);
            process.stdout.write(red(`ERR: ${err.message.slice(0,40)}\n`));
        }
    }

    if (allSignals.length === 0) {
        console.log(red('\n  ⚠️  Tidak ada sinyal yang memenuhi kriteria saat ini.'));
        console.log(dim('  Coba turunkan threshold: node futures-scanner.js --min-conf 35 --min-bull 54\n'));
        return;
    }

    // Sort: Grade A+ dulu, lalu by realisasi
    allSignals.sort((a,b) => b.realisasi - a.realisasi || b.confidence - a.confidence);

    // Print summary table
    printSummaryTable(allSignals);

    // Print detail card per sinyal (max 8)
    console.log(`\n${bold(cyan('  ━━━━ DETAIL SINYAL ━━━━'))}`);
    allSignals.slice(0, 8).forEach((s, i) => printSignalCard(s, i+1));

    // Small account guide
    printSmallAccountGuide(allSignals);

    // Save to JSON
    const output = {
        generatedAt : new Date().toISOString(),
        scanCount   : scanned,
        signalCount : allSignals.length,
        config      : { ltf:LTF, htf:HTF, minConf:MIN_CONF, minBullish:MIN_BULLISH },
        signals     : allSignals,
    };
    fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
    console.log(dim(`\n  💾 Sinyal disimpan: ${OUT_FILE}`));
    console.log(dim(`  📊 Scanned: ${scanned} coins | Sinyal: ${allSignals.length} | Failed: ${failedCoins.length}\n`));
}

main().catch(err => {
    console.error(red(`\n  ❌ Fatal: ${err.message}`));
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
});
