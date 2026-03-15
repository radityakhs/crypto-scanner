#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Backtest Engine v1 — Walk-Forward Simulation
//  Jalankan: node backtest.js [--coins btc,eth,sol] [--days 90] [--verbose]
//
//  Cara kerja:
//  1. Ambil 90 hari data historis dari CoinGecko
//  2. Sliding window: train pada N hari pertama, generate sinyal
//  3. Simulasi apakah TP1/TP2/SL kena di window berikutnya
//  4. Hitung: winrate, avg R:R, profit factor, max drawdown, Sharpe ratio
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── CLI ARGS ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1] : def; };
const hasFlag = flag => args.includes(flag);

const COINS_ARG  = getArg('--coins', 'bitcoin,ethereum,solana,binancecoin,ripple,dogecoin,cardano,avalanche-2,chainlink,polkadot');
const DAYS_ARG   = parseInt(getArg('--days', '90'));
const WINDOW     = parseInt(getArg('--window', '30'));   // hari untuk generate sinyal
const FORWARD    = parseInt(getArg('--forward', '7'));   // hari untuk cek hasil
const VERBOSE    = hasFlag('--verbose') || hasFlag('-v');
const OUT_FILE   = getArg('--output', path.join(__dirname, 'backtest-results.json'));

const COINS = COINS_ARG.split(',').map(s => s.trim());

// ─── UTILS ────────────────────────────────────────────────────────────────────
const mean   = arr => arr.reduce((s,v)=>s+v,0)/arr.length;
const stdDev = arr => { const m=mean(arr); return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length); };
const clamp  = (v,lo,hi) => Math.min(hi, Math.max(lo, v));
function randn() { let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers:{'User-Agent':'backtest/1.0'} }, res => {
            let data = '';
            res.on('data', c => data+=c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('JSON: '+data.slice(0,80))); } });
        });
        req.on('error', reject);
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function fetchWithRetry(url, retries=3) {
    for (let i=0; i<retries; i++) {
        try {
            const d = await fetchJson(url);
            if (d?.status?.error_code === 429) { console.log('⚠️  Rate limit, tunggu 65 detik...'); await sleep(65000); continue; }
            return d;
        } catch(e) {
            if (i<retries-1) { await sleep(4000*(i+1)); continue; }
            throw e;
        }
    }
}

// ─── FETCH OHLCV DATA ─────────────────────────────────────────────────────────
async function fetchCoinData(coinId, days) {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`;
    const d = await fetchWithRetry(url);
    if (!d?.prices) throw new Error(`No price data for ${coinId}`);
    return {
        prices:  d.prices.map(p=>[p[0], p[1]]),
        volumes: d.total_volumes.map(v=>[v[0], v[1]])
    };
}

// ─── ENGINES (copy dari signal-bot.js) ────────────────────────────────────────
function detectSwings(prices, strength=5) {
    const highs=[], lows=[];
    for (let i=strength; i<prices.length-strength; i++) {
        const slice=prices.slice(i-strength, i+strength+1), center=prices[i];
        if (center===Math.max(...slice)) highs.push({idx:i, price:center});
        if (center===Math.min(...slice)) lows.push({idx:i, price:center});
    }
    return {highs, lows};
}

function analyzeMarketStructure(prices) {
    if (!prices||prices.length<15) return {trend:'insufficient_data',bos:'none',choch:false,lastHighs:[],lastLows:[],currentPrice:prices?.at(-1)||0,lastSwingHigh:0,lastSwingLow:Infinity,structureQuality:0};
    const {highs,lows}=detectSwings(prices,5);
    const last3H=highs.slice(-3).map(h=>h.price), last3L=lows.slice(-3).map(l=>l.price);
    const pattern=[];
    for(let i=1;i<last3H.length;i++) pattern.push(last3H[i]>last3H[i-1]?'HH':'LH');
    for(let i=1;i<last3L.length;i++) pattern.push(last3L[i]>last3L[i-1]?'HL':'LL');
    const hhC=pattern.filter(p=>p==='HH').length, hlC=pattern.filter(p=>p==='HL').length;
    const lhC=pattern.filter(p=>p==='LH').length, llC=pattern.filter(p=>p==='LL').length;
    let trend;
    if(hhC>=1&&hlC>=1) trend='uptrend';
    else if(lhC>=1&&llC>=1) trend='downtrend';
    else if(hhC>=1&&llC>=1) trend='reversal_top';
    else if(lhC>=1&&hlC>=1) trend='reversal_bottom';
    else trend='consolidation';
    const cur=prices.at(-1), lastSwingHigh=last3H.at(-1)||0, lastSwingLow=last3L.at(-1)||Infinity;
    const prevHigh=last3H.at(-2)||0, prevLow=last3L.at(-2)||Infinity;
    const bos=cur>lastSwingHigh?'bullish_bos':cur<lastSwingLow?'bearish_bos':'none';
    const choch=(trend==='uptrend'&&cur<prevLow)||(trend==='downtrend'&&cur>prevHigh);
    return {trend,bos,choch,lastHighs:last3H,lastLows:last3L,currentPrice:cur,lastSwingHigh,lastSwingLow,structureQuality:50};
}

function analyzeVolumeProfile(prices, volumes) {
    const n=Math.min(prices.length,volumes.length);
    if(n<10) return {poc:null,vah:null,val:null,currentVsPoC:'unknown'};
    const BINS=20, pMin=Math.min(...prices.slice(-n)), pMax=Math.max(...prices.slice(-n));
    const step=(pMax-pMin)/BINS; if(!step) return {poc:null,vah:null,val:null,currentVsPoC:'unknown'};
    const bins=Array.from({length:BINS},(_,i)=>({priceMid:pMin+(i+0.5)*step, volume:0}));
    for(let i=0;i<n;i++) { const p=prices[prices.length-n+i],v=volumes[volumes.length-n+i]||0; bins[clamp(Math.floor((p-pMin)/step),0,BINS-1)].volume+=v; }
    const poc=bins.reduce((m,b)=>b.volume>m.volume?b:m,bins[0]).priceMid;
    const cur=prices.at(-1);
    return {poc:+poc.toFixed(8),currentVsPoC:cur>poc*1.005?'above':cur<poc*0.995?'below':'at',vah:poc*1.02,val:poc*0.98};
}

function analyzeOrderFlow(prices, volumes) {
    const n=Math.min(prices.length,volumes.length); if(n<5) return {cvdTrend:'neutral',buyPressure:50,imbalance:0};
    const deltas=[];
    for(let i=1;i<n;i++) { const pd=prices[prices.length-n+i]-prices[prices.length-n+i-1],v=volumes[volumes.length-n+i]||0; deltas.push(pd>=0?v:-v); }
    const cvd=deltas.slice(-10).reduce((s,d)=>s+d,0);
    const upVol=deltas.filter(d=>d>0).reduce((s,d)=>s+d,0), totV=deltas.reduce((s,d)=>s+Math.abs(d),0);
    const buyPressure=totV>0?Math.round(upVol/totV*100):50;
    return {cvdTrend:cvd>0?'positive':cvd<0?'negative':'neutral',buyPressure,imbalance:totV>0?+((upVol-(totV-upVol))/totV).toFixed(3):0};
}

function analyzeWhaleActivity(prices, volumes, coin={}) {
    const n=Math.min(prices.length,volumes.length); if(n<5) return {whaleBias:'neutral',pressureScore:50};
    const obv=[0];
    for(let i=1;i<n;i++){const pd=prices[prices.length-n+i]-prices[prices.length-n+i-1],v=volumes[volumes.length-n+i]||0;obv.push(obv.at(-1)+(pd>0?v:pd<0?-v:0));}
    const obvTrend=obv.at(-1)-obv[Math.max(0,obv.length-7)];
    const avgVol=mean(volumes.slice(-20)), lastVol=volumes.at(-1)||0, volRatio=avgVol>0?lastVol/avgVol:1;
    const volSpike=volRatio>1.8, ch24=coin.price_change_percentage_24h||0;
    let ps=50; ps+=obvTrend>0?15:-15; ps+=volSpike&&ch24>0?15:volSpike&&ch24<0?-15:0;
    ps=clamp(Math.round(ps),5,95);
    return {whaleBias:ps>=65?'accumulation':ps<=35?'distribution':'neutral',pressureScore:ps};
}

function analyzeVolatility(prices) {
    const n=prices.length; if(n<14) return {atr:0,atrPct:0,bollingerBw:5,phase:'normal',percentile:50};
    const tr=[];for(let i=1;i<n;i++) tr.push(Math.abs(prices[i]-prices[i-1]));
    const atr14=mean(tr.slice(-14)), atrPct=prices.at(-1)>0?atr14/prices.at(-1)*100:0;
    const w20=prices.slice(-20), sma=mean(w20), std=stdDev(w20);
    const bbw=sma>0?(sma+2*std-(sma-2*std))/sma*100:5;
    return {atr:+atr14.toFixed(8),atrPct:+atrPct.toFixed(2),bollingerBw:+bbw.toFixed(2),phase:bbw<4?'contraction':bbw<8?'normal':bbw<14?'expansion':'high_expansion',percentile:50};
}

function monteCarloGBM(prices) {
    if(prices.length<10) return {probUp:50};
    const lr=[]; for(let i=1;i<prices.length;i++) if(prices[i-1]>0) lr.push(Math.log(prices[i]/prices[i-1]));
    const mu=mean(lr), sigma=stdDev(lr), S0=prices.at(-1);
    let up=0;
    for(let p=0;p<300;p++){let S=S0; for(let t=0;t<7;t++) S*=Math.exp((mu-0.5*sigma*sigma)+sigma*randn()); if(S>S0) up++;}
    return {probUp:Math.round(up/300*100)};
}

// ─── RSI ──────────────────────────────────────────────────────────────────────
function calcRSI(prices, period=14) {
    if (prices.length < period+1) return 50;
    let gains=0, losses=0;
    for (let i=prices.length-period; i<prices.length; i++) {
        const diff = prices[i]-prices[i-1];
        if (diff>0) gains+=diff; else losses+=Math.abs(diff);
    }
    const avgGain=gains/period, avgLoss=losses/period;
    if (avgLoss===0) return 100;
    const rs=avgGain/avgLoss;
    return Math.round(100-(100/(1+rs)));
}

// ─── MACD ─────────────────────────────────────────────────────────────────────
function calcEMA(prices, period) {
    const k=2/(period+1); let ema=prices[0];
    for (let i=1; i<prices.length; i++) ema=prices[i]*k+ema*(1-k);
    return ema;
}

function calcMACD(prices) {
    if (prices.length < 26) return {macd:0, signal:0, histogram:0, cross:'none'};
    const ema12=calcEMA(prices, 12), ema26=calcEMA(prices, 26);
    const macd=ema12-ema26;
    // simplified signal (9-period EMA of MACD not available with single-value approach; use prev period)
    const prevEma12=calcEMA(prices.slice(0,-1),12), prevEma26=calcEMA(prices.slice(0,-1),26);
    const prevMacd=prevEma12-prevEma26;
    const signal=(macd*2+prevMacd)/(2+1)*1; // approximation
    const histogram=macd-signal;
    const cross=macd>0&&prevMacd<=0?'bullish_cross':macd<0&&prevMacd>=0?'bearish_cross':'none';
    return {macd:+macd.toFixed(8), signal:+signal.toFixed(8), histogram:+histogram.toFixed(8), cross};
}

// ─── CALC DIRECTIONAL PROB ────────────────────────────────────────────────────
function calcDirectionalProb(structure, vp, of, whale, vol, mc, rsi, macd, coin) {
    const scores = [
        { label:'Market Structure', score: structure.trend==='uptrend'?80:structure.trend==='reversal_bottom'?65:structure.trend==='consolidation'?50:structure.trend==='reversal_top'?35:20, weight:0.20 },
        { label:'BOS/CHoCH',        score: structure.bos==='bullish_bos'?82:structure.bos==='bearish_bos'?18:50, weight:0.12 },
        { label:'Volume Profile',   score: vp.currentVsPoC==='above'?70:vp.currentVsPoC==='at'?52:30, weight:0.10 },
        { label:'Order Flow CVD',   score: of.cvdTrend==='positive'?72:of.cvdTrend==='negative'?28:50, weight:0.12 },
        { label:'Whale Activity',   score: whale.pressureScore, weight:0.10 },
        { label:'Monte Carlo GBM',  score: mc.probUp, weight:0.06 },
        { label:'Momentum 24h',     score: clamp(Math.round(50+(coin?.price_change_percentage_24h||0)*2),5,95), weight:0.03 },
        // NEW engines
        { label:'RSI',              score: rsi<30?80:rsi>70?20:rsi<45?65:rsi>55?35:50, weight:0.12 },
        { label:'MACD',             score: macd.cross==='bullish_cross'?85:macd.cross==='bearish_cross'?15:macd.macd>0?65:macd.macd<0?35:50, weight:0.10 },
        { label:'BB Phase',         score: vol.phase==='contraction'?50:vol.phase==='expansion'?(structure.trend==='uptrend'?68:32):40, weight:0.05 },
    ];
    const raw = scores.reduce((s,m)=>s+m.score*m.weight, 0);
    const bullish = clamp(Math.round(raw), 5, 95);
    return { bullish, bearish:100-bullish, subScores:scores, confidence:Math.round(Math.abs(bullish-50)*2) };
}

function calcTradeLevels(prices, structure, vp, dirProb, atr) {
    const cur=prices.at(-1), isBull=dirProb.bullish>=55;
    const atrVal = atr || cur*0.02;
    const entryLow = isBull ? cur*0.995 : cur*0.998;
    const entryHigh = isBull ? cur*1.005 : cur*1.002;
    // ATR-based SL/TP (lebih akurat dari fixed %)
    const sl = isBull ? cur - atrVal*2.0 : cur + atrVal*2.0;
    const slDist = Math.abs(cur-sl);
    const tp1 = isBull ? cur+slDist*1.5 : cur-slDist*1.5;
    const tp2 = isBull ? cur+slDist*2.5 : cur-slDist*2.5;
    const tp3 = isBull ? cur+slDist*4.0 : cur-slDist*4.0;
    let signal='WAIT';
    if (dirProb.bullish>60&&dirProb.confidence>15) signal='LONG';
    else if (dirProb.bearish>60&&dirProb.confidence>15) signal='SHORT';
    return { signal, entryLow:+entryLow.toFixed(8), entryHigh:+entryHigh.toFixed(8), stopLoss:+sl.toFixed(8), tp1:+tp1.toFixed(8), tp2:+tp2.toFixed(8), tp3:+tp3.toFixed(8), rr:1.5 };
}

// ─── SIMULATE SINGLE TRADE ────────────────────────────────────────────────────
// Cek apakah TP1/TP2/SL kena pada window FORWARD hari ke depan
function simulateTrade(signal, entryPrice, sl, tp1, tp2, futurePrices) {
    for (const price of futurePrices) {
        if (signal === 'LONG') {
            if (price <= sl)  return { outcome:'SL', exitPrice:sl,  pnlR:-1.0 };
            if (price >= tp2) return { outcome:'TP2',exitPrice:tp2, pnlR:+2.5 };
            if (price >= tp1) return { outcome:'TP1',exitPrice:tp1, pnlR:+1.5 };
        } else if (signal === 'SHORT') {
            if (price >= sl)  return { outcome:'SL', exitPrice:sl,  pnlR:-1.0 };
            if (price <= tp2) return { outcome:'TP2',exitPrice:tp2, pnlR:+2.5 };
            if (price <= tp1) return { outcome:'TP1',exitPrice:tp1, pnlR:+1.5 };
        }
    }
    // Expired: hitung open P&L di hari terakhir
    const lastPrice = futurePrices.at(-1);
    const openPnl = signal==='LONG'
        ? (lastPrice-entryPrice)/Math.abs(entryPrice-sl)
        : (entryPrice-lastPrice)/Math.abs(sl-entryPrice);
    return { outcome:'EXPIRED', exitPrice:lastPrice, pnlR:+openPnl.toFixed(3) };
}

// ─── BACKTEST SATU COIN ───────────────────────────────────────────────────────
function backtestCoin(coinId, allPrices, allVolumes, coinMeta={}) {
    const results = [];
    const totalDays = allPrices.length;
    if (totalDays < WINDOW + FORWARD + 5) return results;

    for (let i = WINDOW; i <= totalDays - FORWARD; i++) {
        const trainPrices  = allPrices.slice(0, i);
        const trainVolumes = allVolumes.slice(0, i);
        const futurePrices = allPrices.slice(i, i + FORWARD);

        // Run all engines
        const structure = analyzeMarketStructure(trainPrices);
        const vp        = analyzeVolumeProfile(trainPrices, trainVolumes);
        const of        = analyzeOrderFlow(trainPrices, trainVolumes);
        const whale     = analyzeWhaleActivity(trainPrices, trainVolumes, coinMeta);
        const vol       = analyzeVolatility(trainPrices);
        const mc        = monteCarloGBM(trainPrices);
        const rsi       = calcRSI(trainPrices, 14);
        const macdData  = calcMACD(trainPrices);
        const dirProb   = calcDirectionalProb(structure, vp, of, whale, vol, mc, rsi, macdData, coinMeta);
        const levels    = calcTradeLevels(trainPrices, structure, vp, dirProb, vol.atr);

        if (levels.signal === 'WAIT') continue;

        const entryPrice = trainPrices.at(-1);
        const trade = simulateTrade(levels.signal, entryPrice, levels.stopLoss, levels.tp1, levels.tp2, futurePrices);

        results.push({
            coinId,
            date:      new Date(Date.now() - (totalDays-i)*86400000).toISOString().slice(0,10),
            signal:    levels.signal,
            entryPrice:+entryPrice.toFixed(6),
            sl:        levels.stopLoss,
            tp1:       levels.tp1,
            tp2:       levels.tp2,
            rsi,
            macd:      macdData.macd,
            macdCross: macdData.cross,
            trend:     structure.trend,
            bullish:   dirProb.bullish,
            bearish:   dirProb.bearish,
            confidence:dirProb.confidence,
            outcome:   trade.outcome,
            exitPrice: trade.exitPrice,
            pnlR:      trade.pnlR,
        });
    }
    return results;
}

// ─── STATISTIK ────────────────────────────────────────────────────────────────
function calcStats(trades) {
    if (!trades.length) return null;
    const wins   = trades.filter(t => t.outcome==='TP1'||t.outcome==='TP2');
    const losses = trades.filter(t => t.outcome==='SL');
    const total  = trades.length;
    const winRate = total>0 ? (wins.length/total*100).toFixed(1) : '0';
    const avgPnlR = (trades.reduce((s,t)=>s+t.pnlR,0)/total).toFixed(3);
    const grossWin  = wins.reduce((s,t)=>s+t.pnlR,0);
    const grossLoss = Math.abs(losses.reduce((s,t)=>s+t.pnlR,0));
    const profitFactor = grossLoss>0 ? (grossWin/grossLoss).toFixed(2) : '∞';

    // Max drawdown (equity curve)
    let equity=0, peak=0, maxDD=0;
    for (const t of trades) {
        equity+=t.pnlR; peak=Math.max(peak,equity); maxDD=Math.max(maxDD,peak-equity);
    }

    // Sharpe ratio (annualized, assume 1 trade/day)
    const pnls = trades.map(t=>t.pnlR);
    const sharpe = stdDev(pnls)>0 ? (mean(pnls)/stdDev(pnls)*Math.sqrt(252)).toFixed(2) : '0';

    // Per signal type
    const longTrades  = trades.filter(t=>t.signal==='LONG');
    const shortTrades = trades.filter(t=>t.signal==='SHORT');
    const longWins    = longTrades.filter(t=>t.outcome==='TP1'||t.outcome==='TP2');
    const shortWins   = shortTrades.filter(t=>t.outcome==='TP1'||t.outcome==='TP2');

    return {
        total, wins:wins.length, losses:losses.length, expired:trades.filter(t=>t.outcome==='EXPIRED').length,
        winRate:+winRate, avgPnlR:+avgPnlR, profitFactor:+profitFactor,
        maxDrawdown:+maxDD.toFixed(3), sharpeRatio:+sharpe,
        grossPnlR:+trades.reduce((s,t)=>s+t.pnlR,0).toFixed(3),
        longWinRate: longTrades.length>0 ? +(longWins.length/longTrades.length*100).toFixed(1) : 0,
        shortWinRate: shortTrades.length>0 ? +(shortWins.length/shortTrades.length*100).toFixed(1) : 0,
        totalLong: longTrades.length, totalShort: shortTrades.length,
    };
}

// ─── PRINT REPORT ─────────────────────────────────────────────────────────────
function printReport(coinId, stats, trades) {
    const bar = (pct) => '█'.repeat(Math.round(pct/5)) + '░'.repeat(20-Math.round(pct/5));
    const grade = stats.winRate>=65&&stats.profitFactor>=2.0?'A+':stats.winRate>=60&&stats.profitFactor>=1.5?'A':stats.winRate>=55?'B':stats.winRate>=50?'C':'D';
    console.log(`\n╔════════════════════════════════════════════════════════╗`);
    console.log(`║  📊 BACKTEST: ${coinId.toUpperCase().padEnd(20)} Grade: ${grade.padEnd(3)}            ║`);
    console.log(`╠════════════════════════════════════════════════════════╣`);
    console.log(`║  Total Trades  : ${String(stats.total).padEnd(6)} (Long:${stats.totalLong} Short:${stats.totalShort})`);
    console.log(`║  Win Rate      : ${stats.winRate}% ${bar(stats.winRate)}`);
    console.log(`║  LONG  WinRate : ${stats.longWinRate}%`);
    console.log(`║  SHORT WinRate : ${stats.shortWinRate}%`);
    console.log(`║  Avg R:R       : ${stats.avgPnlR}R`);
    console.log(`║  Profit Factor : ${stats.profitFactor}x`);
    console.log(`║  Gross P&L     : ${stats.grossPnlR > 0 ? '+' : ''}${stats.grossPnlR}R`);
    console.log(`║  Max Drawdown  : ${stats.maxDrawdown}R`);
    console.log(`║  Sharpe Ratio  : ${stats.sharpeRatio}`);
    console.log(`╚════════════════════════════════════════════════════════╝`);

    if (VERBOSE && trades.length > 0) {
        console.log(`\n  📋 Last 10 Trades for ${coinId}:`);
        console.log(`  ${'Date'.padEnd(12)} ${'Signal'.padEnd(7)} ${'Entry'.padEnd(12)} ${'Outcome'.padEnd(8)} ${'P&L R'.padEnd(8)} ${'Conf%'.padEnd(6)} RSI`);
        console.log('  ' + '─'.repeat(70));
        trades.slice(-10).forEach(t => {
            const icon = t.outcome==='TP1'||t.outcome==='TP2'?'✅':t.outcome==='SL'?'❌':'⏳';
            console.log(`  ${t.date.padEnd(12)} ${t.signal.padEnd(7)} ${String(t.entryPrice).padEnd(12)} ${(icon+t.outcome).padEnd(10)} ${(t.pnlR>=0?'+':'')+t.pnlR+'R'.padEnd(6)} ${String(t.confidence).padEnd(6)} ${t.rsi}`);
        });
    }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n' + '═'.repeat(60));
    console.log('  🧪 Backtest Engine v1 — Walk-Forward Simulation');
    console.log(`  Coins : ${COINS.join(', ')}`);
    console.log(`  Data  : ${DAYS_ARG} hari historis | Window: ${WINDOW}d | Forward: ${FORWARD}d`);
    console.log('═'.repeat(60));

    const allResults = [];
    const allTrades  = [];

    for (const coinId of COINS) {
        process.stdout.write(`\n⏳ Fetching data: ${coinId}...`);
        try {
            const data = await fetchCoinData(coinId, DAYS_ARG);
            const prices  = data.prices.map(p=>p[1]);
            const volumes = data.volumes.map(v=>v[1]);
            process.stdout.write(` ${prices.length} candles ✅\n`);
            await sleep(1500); // rate limit

            const trades = backtestCoin(coinId, prices, volumes);
            if (!trades.length) { console.log(`  ⚠️  Tidak ada sinyal untuk ${coinId}`); continue; }

            const stats = calcStats(trades);
            printReport(coinId, stats, trades);
            allResults.push({ coinId, stats });
            allTrades.push(...trades);
        } catch(err) {
            console.log(` ❌ Error: ${err.message}`);
        }
    }

    // ─── AGGREGATE REPORT ──────────────────────────────────────────────────
    if (allTrades.length > 0) {
        const aggStats = calcStats(allTrades);
        console.log('\n' + '═'.repeat(60));
        console.log('  📈 AGGREGATE BACKTEST RESULT (semua coin)');
        console.log('═'.repeat(60));
        console.log(`  Total Trades   : ${aggStats.total}`);
        console.log(`  Win Rate       : ${aggStats.winRate}%  ${aggStats.winRate>=60?'🟢 GOOD':aggStats.winRate>=50?'🟡 OK':'🔴 POOR'}`);
        console.log(`  Avg R:R        : ${aggStats.avgPnlR}R`);
        console.log(`  Profit Factor  : ${aggStats.profitFactor}x  ${aggStats.profitFactor>=2?'🟢 EXCELLENT':aggStats.profitFactor>=1.5?'🟡 GOOD':'🔴 POOR'}`);
        console.log(`  Gross P&L      : ${aggStats.grossPnlR > 0 ? '+' : ''}${aggStats.grossPnlR}R`);
        console.log(`  Max Drawdown   : ${aggStats.maxDrawdown}R`);
        console.log(`  Sharpe Ratio   : ${aggStats.sharpeRatio}  ${aggStats.sharpeRatio>=1.5?'🟢':aggStats.sharpeRatio>=0.8?'🟡':'🔴'}`);
        console.log(`  LONG  WinRate  : ${aggStats.longWinRate}% (${aggStats.totalLong} trades)`);
        console.log(`  SHORT WinRate  : ${aggStats.shortWinRate}% (${aggStats.totalShort} trades)`);

        // Ranking by winrate
        console.log('\n  🏆 Ranking by Win Rate:');
        allResults.sort((a,b)=>b.stats.winRate-a.stats.winRate).forEach((r,i)=>{
            const grade=r.stats.winRate>=65?'A+':r.stats.winRate>=60?'A':r.stats.winRate>=55?'B':r.stats.winRate>=50?'C':'D';
            console.log(`  ${i+1}. ${r.coinId.padEnd(20)} WR:${r.stats.winRate}%  PF:${r.stats.profitFactor}x  Sharpe:${r.stats.sharpeRatio}  Grade:${grade}`);
        });

        // Save to file
        const output = {
            generatedAt: new Date().toISOString(),
            config: { days:DAYS_ARG, window:WINDOW, forward:FORWARD, coins:COINS },
            aggregate: aggStats,
            perCoin: allResults,
            trades: allTrades,
        };
        fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2));
        console.log(`\n  💾 Results saved to: ${OUT_FILE}`);

        // ─── SARAN OTOMATIS ────────────────────────────────────────────────
        console.log('\n' + '═'.repeat(60));
        console.log('  💡 AUTO RECOMMENDATIONS berdasarkan backtest:');
        console.log('═'.repeat(60));
        if (aggStats.winRate >= 60 && aggStats.profitFactor >= 1.5) {
            console.log('  ✅ Engine layak untuk live trading');
            console.log(`  ✅ Fokus pada coin: ${allResults.filter(r=>r.stats.winRate>=60).map(r=>r.coinId.toUpperCase()).join(', ') || 'none'}`);
        } else {
            console.log('  ⚠️  Win rate perlu ditingkatkan sebelum live trading');
        }
        if (aggStats.shortWinRate > aggStats.longWinRate + 10) console.log('  📉 SHORT signals lebih reliable di kondisi pasar ini');
        if (aggStats.longWinRate > aggStats.shortWinRate + 10)  console.log('  📈 LONG signals lebih reliable di kondisi pasar ini');
        if (aggStats.maxDrawdown > 5)  console.log(`  ⚠️  Max drawdown ${aggStats.maxDrawdown}R — pertimbangkan risk management lebih ketat`);
        if (aggStats.sharpeRatio >= 1.5) console.log('  🌟 Sharpe Ratio excellent — performa konsisten');
    }

    console.log('\n✅ Backtest selesai.\n');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
