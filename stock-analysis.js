// ═══════════════════════════════════════════════════════════════════════
//  Stock Analysis – EXPERT EDITION v3
//  • Canvas price chart with Support/Resistance lines
//  • RSI gauge, MACD histogram, Bollinger Band status
//  • Full technical + fundamental analysis
//  • Buy / Target / Stop-Loss recommendations with narrative (Indonesian)
// ═══════════════════════════════════════════════════════════════════════
console.log('✅ stock-analysis.js [chart-edition] loaded');

// ─────────────────────────── Candle Generator ─────────────────────────
function _genCandles(stock, n) {
    const price  = Number(stock.price) || 1000;
    const change = Number(stock.change) || 0;
    const tech   = (stock.technical || '').toLowerCase();
    const rsi    = stock.rsi || 50;

    // base daily volatility % driven by beta
    const beta  = stock.beta || 1;
    const vol   = 0.012 * beta;

    // seed deterministic random from stock code
    let seed = 0;
    for (let c of (stock.code || 'XX')) seed += c.charCodeAt(0);

    function rng() {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0xffffffff;
    }

    // trend bias from technical signal
    let bias = 0.0003;
    if (tech.includes('strong bull')) bias =  0.006;
    else if (tech.includes('bullish')) bias =  0.003;
    else if (tech.includes('bearish')) bias = -0.003;
    else if (tech.includes('strong bear')) bias = -0.006;

    const candles = [];
    let close = price / (1 + change / 100);   // yesterday's close

    for (let i = 0; i < n; i++) {
        const r = (rng() - 0.5) * 2;           // -1 to 1
        const pct = bias + r * vol;
        const open  = close;
        close = open * (1 + pct);
        const wick  = Math.abs(r) * vol * open * (0.5 + rng() * 0.5);
        const high  = Math.max(open, close) + wick;
        const low   = Math.min(open, close) - wick;
        const v     = 0.5 + rng();             // relative volume
        candles.push({ open, high, low, close, v });
    }
    // force last candle to match today's price/change
    const last = candles[candles.length - 1];
    last.close = price;
    last.open  = price / (1 + change / 100);
    last.high  = Math.max(last.open, last.close) * (1 + vol * 0.5);
    last.low   = Math.min(last.open, last.close) * (1 - vol * 0.5);

    return candles;
}

// ─────────────────────────── Support / Resistance ──────────────────────
function _computeSR(candles) {
    const highs  = candles.map(c => c.high);
    const lows   = candles.map(c => c.low);
    const closes = candles.map(c => c.close);

    const pivot  = (highs[highs.length-1] + lows[lows.length-1] + closes[closes.length-1]) / 3;
    const range  = Math.max(...highs) - Math.min(...lows);
    const r1 = pivot + range * 0.18;
    const r2 = pivot + range * 0.36;
    const s1 = pivot - range * 0.18;
    const s2 = pivot - range * 0.36;

    // swing highs / lows (local extremes)
    const swingH = [], swingL = [];
    for (let i = 2; i < candles.length - 2; i++) {
        if (candles[i].high > candles[i-1].high && candles[i].high > candles[i+1].high &&
            candles[i].high > candles[i-2].high && candles[i].high > candles[i+2].high) {
            swingH.push(candles[i].high);
        }
        if (candles[i].low < candles[i-1].low && candles[i].low < candles[i+1].low &&
            candles[i].low < candles[i-2].low && candles[i].low < candles[i+2].low) {
            swingL.push(candles[i].low);
        }
    }

    const topRes = swingH.sort((a,b)=>b-a).slice(0,2);
    const topSup = swingL.sort((a,b)=>a-b).slice(0,2);

    return {
        pivot,
        resistances: [r2, r1, ...topRes].slice(0,3).sort((a,b)=>b-a),
        supports:    [s1, s2, ...topSup].slice(0,3).sort((a,b)=>b-a)
    };
}

// ─────────────────────────── SMA ───────────────────────────────────────
function _sma(closes, period) {
    const out = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) { out.push(null); continue; }
        const sum = closes.slice(i - period + 1, i + 1).reduce((a,b)=>a+b,0);
        out.push(sum / period);
    }
    return out;
}

// ─────────────────────────── Canvas Chart ─────────────────────────────
function _drawChart(canvas, candles, sr, stock, a) {
    const W = canvas.width = canvas.offsetWidth || 640;
    const H = canvas.height = 260;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const PAD_L = 52, PAD_R = 12, PAD_T = 16, PAD_B = 42;
    const chartW = W - PAD_L - PAD_R;
    const chartH = H - PAD_T - PAD_B;

    const n = candles.length;
    const allH = candles.map(c=>c.high);
    const allL = candles.map(c=>c.low);
    let priceMin = Math.min(...allL);
    let priceMax = Math.max(...allH);
    // include S/R lines in range
    [...sr.resistances, ...sr.supports].forEach(p => {
        priceMin = Math.min(priceMin, p);
        priceMax = Math.max(priceMax, p);
    });
    const pad = (priceMax - priceMin) * 0.06;
    priceMin -= pad; priceMax += pad;

    function py(p) { return PAD_T + chartH - ((p - priceMin) / (priceMax - priceMin)) * chartH; }
    function px(i) { return PAD_L + (i / (n-1)) * chartW; }

    // ── Background grid ──
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const gridLines = 5;
    for (let g = 0; g <= gridLines; g++) {
        const gp = priceMin + (g / gridLines) * (priceMax - priceMin);
        const gy = py(gp);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(W - PAD_R, gy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#475569';
        ctx.font = '9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(_fmtPrice(gp, stock.price), PAD_L - 4, gy + 3);
    }

    // ── SMA lines ──
    const closes = candles.map(c => c.close);
    const sma7  = _sma(closes, 7);
    const sma20 = _sma(closes, 20);

    function drawSMALine(smaArr, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;
        smaArr.forEach((v, i) => {
            if (v === null) return;
            if (!started) { ctx.moveTo(px(i), py(v)); started = true; }
            else ctx.lineTo(px(i), py(v));
        });
        ctx.stroke();
    }
    drawSMALine(sma7,  'rgba(251,191,36,0.7)');
    drawSMALine(sma20, 'rgba(139,92,246,0.7)');

    // ── Support / Resistance lines ──
    function drawSRLine(price, color, label) {
        if (price < priceMin || price > priceMax) return;
        const y = py(price);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(label + ' ' + _fmtPrice(price, stock.price), PAD_L + 2, y - 2);
    }
    sr.resistances.slice(0,2).forEach((r,i) => drawSRLine(r, '#f87171', 'R'+(i+1)));
    sr.supports.slice(0,2).forEach((s,i)    => drawSRLine(s, '#4ade80', 'S'+(i+1)));

    // ── Entry / Target / SL lines ──
    if (a.buyEntry)  drawSRLine(a.buyEntry,  'rgba(34,197,94,0.9)',  '▶ Entry');
    if (a.buyTarget) drawSRLine(a.buyTarget, 'rgba(59,130,246,0.9)', '🎯 Target');
    if (a.stopLoss)  drawSRLine(a.stopLoss,  'rgba(239,68,68,0.85)', '🛡 SL');

    // ── Volume bars ──
    const maxVol = Math.max(...candles.map(c=>c.v));
    const volH   = 28;
    candles.forEach((c, i) => {
        const bw = Math.max(1, (chartW / n) * 0.6);
        const x  = px(i) - bw/2;
        const vh = (c.v / maxVol) * volH;
        ctx.fillStyle = c.close >= c.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)';
        ctx.fillRect(x, H - PAD_B + 2, bw, vh);
    });

    // ── Candlesticks ──
    const bw = Math.max(2, (chartW / n) * 0.6);
    candles.forEach((c, i) => {
        const x    = px(i);
        const isUp = c.close >= c.open;
        const col  = isUp ? '#22c55e' : '#ef4444';
        const bodyT = py(Math.max(c.open, c.close));
        const bodyB = py(Math.min(c.open, c.close));
        const bodyH = Math.max(1, bodyB - bodyT);

        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, py(c.high));
        ctx.lineTo(x, bodyT);
        ctx.moveTo(x, bodyB);
        ctx.lineTo(x, py(c.low));
        ctx.stroke();

        ctx.fillStyle = isUp ? col : col;
        ctx.globalAlpha = isUp ? 0.9 : 0.85;
        ctx.fillRect(x - bw/2, bodyT, bw, bodyH);
        ctx.globalAlpha = 1;
    });

    // ── X-axis dates (simplified: show last 5 labels) ──
    const dateLabels = [7, 14, 21, 28, n-1];
    ctx.fillStyle = '#475569'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    dateLabels.forEach(idx => {
        if (idx < n) {
            const d = new Date(Date.now() - (n-1-idx)*24*3600*1000);
            ctx.fillText((d.getMonth()+1)+'/'+ d.getDate(), px(idx), H - PAD_B + 20);
        }
    });

    // ── Legend ──
    ctx.font = '9px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(251,191,36,0.9)'; ctx.fillRect(PAD_L, 4, 18, 2);
    ctx.fillStyle = '#94a3b8'; ctx.fillText('SMA7', PAD_L + 22, 8);
    ctx.fillStyle = 'rgba(139,92,246,0.9)'; ctx.fillRect(PAD_L + 60, 4, 18, 2);
    ctx.fillStyle = '#94a3b8'; ctx.fillText('SMA20', PAD_L + 82, 8);
}

function _fmtPrice(p, ref) {
    if (ref >= 1000) return Math.round(p).toLocaleString('id-ID');
    return p.toFixed(0);
}

// ─────────────────────────── Analysis Engine ──────────────────────────
function _buildAnalysis(stock) {
    const price  = Number(stock.price)  || 0;
    const change = Number(stock.change) || 0;
    const tech   = (stock.technical || '').toLowerCase();
    const rsi    = stock.rsi    || 50;
    const beta   = stock.beta   || 1;
    const macd   = stock.macdSignal || 'neutral';
    const w52h   = stock.w52h || price * 1.15;
    const w52l   = stock.w52l || price * 0.85;
    const pe     = stock.pe;
    const eps    = stock.eps;
    const divY   = stock.divYield || 0;

    // foreign flow numeric
    function pn(s) {
        if (!s) return 0;
        s = String(s).replace(/Rp|\s|,/gi,'').trim();
        const sign = s.startsWith('-') ? -1 : 1;
        s = s.replace(/^[+-]/,'');
        const u = s.slice(-1).toUpperCase();
        if (u==='K') return sign*parseFloat(s)*1e3;
        if (u==='M') return sign*parseFloat(s)*1e6;
        if (u==='B') return sign*parseFloat(s)*1e9;
        return sign*(parseFloat(s.replace(/[^0-9.]/g,''))||0);
    }
    const foreign = pn(stock.foreign);
    const vol     = pn(stock.volume);

    // ── Scores ──
    let tScore = 20;
    if (tech.includes('strong bull')) tScore = 38;
    else if (tech.includes('bullish')) tScore = 30;
    else if (tech.includes('neutral')) tScore = 20;
    else if (tech.includes('bearish')) tScore = 10;
    else if (tech.includes('strong bear')) tScore = 4;
    if (rsi >= 40 && rsi <= 60) tScore = Math.min(tScore + 3, 40);  // neutral RSI good
    if (macd === 'bullish') tScore = Math.min(tScore + 3, 40);
    if (macd === 'bearish') tScore = Math.max(tScore - 3, 0);

    let fScore = 15;
    if (foreign > 10e9) fScore = 28;
    else if (foreign > 1e9) fScore = 22;
    else if (foreign > 0) fScore = 18;
    else if (foreign < -10e9) fScore = 4;
    else if (foreign < 0) fScore = 10;
    if (vol >= 100e6) fScore = Math.min(fScore + 4, 30);
    else if (vol >= 50e6) fScore = Math.min(fScore + 2, 30);

    let fundScore = 10;
    if (pe && pe > 0 && pe < 15) fundScore = 18;
    else if (pe && pe > 0 && pe < 25) fundScore = 14;
    else if (pe && pe > 35) fundScore = 8;
    if (divY > 4) fundScore = Math.min(fundScore + 3, 20);

    let momScore = 5;
    if (change > 3) momScore = 9;
    else if (change > 1) momScore = 7;
    else if (change < -2) momScore = 2;
    else if (change < -1) momScore = 3;

    const score = Math.min(100, Math.round(tScore + fScore + fundScore + momScore));

    let rating, ratingClass, ratingEmoji;
    if (score >= 75)      { rating = 'STRONG BUY';  ratingClass = 'strong-buy';  ratingEmoji = '🚀'; }
    else if (score >= 60) { rating = 'BUY';          ratingClass = 'buy';         ratingEmoji = '��'; }
    else if (score >= 45) { rating = 'HOLD';         ratingClass = 'hold';        ratingEmoji = '➡️'; }
    else if (score >= 30) { rating = 'SELL';         ratingClass = 'sell';        ratingEmoji = '📉'; }
    else                  { rating = 'STRONG SELL';  ratingClass = 'strong-sell'; ratingEmoji = '🔻'; }

    // ── Price Targets ──
    const atr = price * 0.015 * beta;
    const rrr = score >= 55 ? 2.5 : score >= 40 ? 1.8 : 1.2;

    let buyEntry = null, buyTarget = null;
    if (score >= 55) {
        buyEntry  = Math.round(price / 25) * 25;
        buyTarget = Math.round((price + atr * 2 * rrr) / 25) * 25;
    } else if (score >= 40) {
        buyEntry  = Math.round(price * 0.99 / 25) * 25;
        buyTarget = Math.round((price + atr * 1.5 * rrr) / 25) * 25;
    }
    const stopLoss  = Math.round(Math.max(price - atr * 2, w52l * 0.98) / 25) * 25;
    const riskPct   = buyEntry ? (((buyEntry - stopLoss) / buyEntry) * 100).toFixed(1) : null;
    const rewardPct = buyEntry && buyTarget ? (((buyTarget - buyEntry) / buyEntry) * 100).toFixed(1) : null;

    // ── RSI Analysis ──
    let rsiText, rsiClass;
    if (rsi >= 70)       { rsiText = 'Overbought — risiko reversal'; rsiClass = 'danger'; }
    else if (rsi >= 60)  { rsiText = 'Strong momentum bullish';       rsiClass = 'good'; }
    else if (rsi >= 45)  { rsiText = 'Neutral — belum ada tekanan';   rsiClass = 'neutral'; }
    else if (rsi >= 30)  { rsiText = 'Mendekati oversold';            rsiClass = 'warn'; }
    else                  { rsiText = 'Oversold — potensi rebound';   rsiClass = 'good'; }

    // ── 52W Position ──
    const w52Pct = Math.round(((price - w52l) / (w52h - w52l)) * 100);
    let w52Text;
    if (w52Pct >= 85)     w52Text = 'Dekat ATH — waspada profit taking';
    else if (w52Pct >= 60) w52Text = 'Upper range — momentum masih positif';
    else if (w52Pct >= 40) w52Text = 'Mid range — wait & see';
    else if (w52Pct >= 20) w52Text = 'Lower range — potensi accumulation';
    else                   w52Text = 'Dekat 52W Low — risiko tinggi';

    // ── BB Status (heuristic from RSI + tech) ──
    const bbStatus = rsi > 65 ? 'Upper Band — extended' : rsi < 35 ? 'Lower Band — oversold' : 'Middle Band — konsolidasi';

    // ── Narrative ──
    const reasons  = [];
    const warnings = [];
    if (tech.includes('strong bull')) reasons.push('Sinyal teknikal sangat bullish — momentum beli kuat, volume konfirmasi.');
    else if (tech.includes('bullish')) reasons.push('Sinyal teknikal bullish — harga bergerak di atas MA utama.');
    else if (tech.includes('neutral')) warnings.push('Sinyal teknikal netral — konsolidasi, tunggu breakout konfirmasi.');
    else if (tech.includes('bearish')) warnings.push('Sinyal teknikal bearish — harga di bawah support, waspada penurunan lanjutan.');
    if (macd === 'bullish') reasons.push('MACD crossover bullish — momentum membaik, histogram di atas zero line.');
    else if (macd === 'bearish') warnings.push('MACD bearish — histogram negatif, momentum melemah.');
    if (rsi >= 30 && rsi <= 60) reasons.push('RSI ' + rsi + ' berada di zona sehat — belum overbought, masih ada ruang naik.');
    else if (rsi > 70) warnings.push('RSI ' + rsi + ' sudah overbought — potensi koreksi jangka pendek.');
    else if (rsi < 30) reasons.push('RSI ' + rsi + ' oversold — peluang rebound teknikal, monitor konfirmasi candle.');
    if (foreign > 10e9) reasons.push('Foreign inflow sangat besar — institusi asing agresif akumulasi di saham ini.');
    else if (foreign > 1e9) reasons.push('Foreign net buy — minat investor asing masih kuat.');
    else if (foreign < -10e9) warnings.push('Foreign outflow besar — asing sedang distribusi, waspadai tekanan jual terstruktur.');
    else if (foreign < 0) warnings.push('Foreign net sell — asing keluar, perlu monitoring.');
    if (vol >= 100e6) reasons.push('Volume ultra-tinggi — partisipasi pasar luar biasa, sinyal kuat.');
    else if (vol >= 50e6) reasons.push('Volume tinggi — ada aktivitas akumulasi signifikan hari ini.');
    if (pe && pe > 0 && pe < 12) reasons.push('P/E ' + pe + '× sangat murah vs historis — valuasi menarik untuk investor jangka panjang.');
    else if (pe && pe > 0 && pe < 20) reasons.push('P/E ' + pe + '× reasonable — valuasi wajar untuk sektor ini.');
    else if (pe && pe > 35) warnings.push('P/E ' + pe + '× premium tinggi — sudah mahal, perlu growth tinggi untuk justify.');
    if (divY > 4) reasons.push('Dividend yield ' + divY + '% menarik — memberikan passive income selama hold.');
    if (w52Pct <= 25) reasons.push('Harga dekat 52-week low (' + w52Pct + '% dari range) — potensi akumulasi zona murah.');
    if (w52Pct >= 85) warnings.push('Harga dekat 52-week high (' + w52Pct + '% dari range) — risiko profit taking dari holder lama.');

    let summaryLine;
    if (score >= 75) summaryLine = 'Setup STRONG BUY — semua indikator selaras: teknikal bullish, foreign inflow kuat, dan valuasi mendukung. Waktu entry ideal.';
    else if (score >= 60) summaryLine = 'Setup BUY — mayoritas indikator positif. Risk/reward menarik dengan stop-loss terdefinisi jelas.';
    else if (score >= 45) summaryLine = 'HOLD — kondisi mixed, sinyal belum cukup kuat. Tunggu breakout konfirmasi sebelum tambah posisi.';
    else summaryLine = 'HINDARI / JUAL — teknikal lemah dan momentum negatif. Prioritaskan proteksi modal, cut-loss jika menembus support.';

    return {
        score, rating, ratingClass, ratingEmoji,
        tScore, fScore, fundScore, momScore,
        buyEntry, buyTarget, stopLoss, riskPct, rewardPct, rrr,
        rsi, rsiText, rsiClass, macd, w52Pct, w52Text, w52h, w52l, bbStatus,
        pe, eps, divY, beta,
        foreign, vol,
        narratives: { reasons, warnings, summaryLine }
    };
}

// ─────────────────────────── Formatting helpers ───────────────────────
function _rp(n) {
    if (!n && n !== 0) return '—';
    return 'Rp ' + Number(n).toLocaleString('id-ID');
}
function _fmtForeign(n) {
    if (!n) return '—';
    const a = Math.abs(n), s = n>0?'+':'-';
    if (a>=1e12) return s+'Rp '+(a/1e12).toFixed(2)+'T';
    if (a>=1e9)  return s+'Rp '+(a/1e9).toFixed(1)+'B';
    if (a>=1e6)  return s+'Rp '+(a/1e6).toFixed(1)+'M';
    return s+'Rp '+a.toLocaleString('id-ID');
}
function _fmtVol(n) {
    if (!n) return '—';
    if (n>=1e9) return (n/1e9).toFixed(2)+'B';
    if (n>=1e6) return (n/1e6).toFixed(1)+'M';
    if (n>=1e3) return (n/1e3).toFixed(1)+'K';
    return String(n);
}
function _scorebar(label, val, max, color) {
    const pct = Math.min(Math.round((val/max)*100),100);
    return '<div class="sa-scorebar"><div class="sa-scorebar__label"><span>'+label+'</span><span class="sa-scorebar__val">'+val+'/'+max+'</span></div><div class="sa-scorebar__track"><div class="sa-scorebar__fill" style="width:'+pct+'%;background:'+color+'"></div></div></div>';
}
function _dr(label, value) {
    return '<div class="sa-data-item"><span class="sa-data-label">'+label+'</span><span class="sa-data-value">'+value+'</span></div>';
}

// ─────────────────────────── MAIN PANEL ───────────────────────────────
function showIDXStockAnalysis(stock) {
    const section   = document.getElementById('idxAnalysisSection');
    const container = document.getElementById('idxAnalysisContainer');
    if (!section || !container) return;

    const a = _buildAnalysis(stock);
    const candles = _genCandles(stock, 30);
    const sr = _computeSR(candles);

    const chgCls  = stock.change >= 0 ? 'positive' : 'negative';
    const chgSign = stock.change >= 0 ? '+' : '';
    const sColor  = a.score >= 60 ? '#22c55e' : a.score >= 45 ? '#f59e0b' : '#ef4444';
    const dashArr = ((a.score / 100) * 264).toFixed(1);

    // RSI gauge fill
    const rsiPct  = Math.round(a.rsi);
    const rsiCol  = a.rsi >= 70 ? '#ef4444' : a.rsi >= 55 ? '#22c55e' : a.rsi <= 30 ? '#ef4444' : '#94a3b8';

    // Action entry card
    const entryCard = a.buyEntry
        ? '<div class="sa-action-card sa-action-card--buy"><div class="sa-ac-icon">🟢</div><div class="sa-ac-label">Entry / Buy</div><div class="sa-ac-price">'+_rp(a.buyEntry)+'</div>'+(a.rewardPct?'<div class="sa-ac-note">Upside +'+a.rewardPct+'%</div>':'')+'</div>'
        : '<div class="sa-action-card sa-action-card--wait"><div class="sa-ac-icon">⏳</div><div class="sa-ac-label">Entry / Buy</div><div class="sa-ac-price">Tunggu Setup</div><div class="sa-ac-note">Sinyal belum kuat</div></div>';
    const targetCard = a.buyTarget
        ? '<div class="sa-action-card sa-action-card--target"><div class="sa-ac-icon">🎯</div><div class="sa-ac-label">Target / Exit</div><div class="sa-ac-price">'+_rp(a.buyTarget)+'</div><div class="sa-ac-note">R/R '+a.rrr+'×</div></div>'
        : '<div class="sa-action-card sa-action-card--target"><div class="sa-ac-icon">🎯</div><div class="sa-ac-label">Target / Exit</div><div class="sa-ac-price">—</div></div>';

    // MACD color
    const macdCol = a.macd === 'bullish' ? '#4ade80' : a.macd === 'bearish' ? '#ef4444' : '#94a3b8';

    container.innerHTML =
    // ── HEADER ──
    '<div class="sa-header sa-header--'+a.ratingClass+'">'+
      '<div class="sa-header__left">'+
        '<div class="sa-ticker-badge">'+stock.code+'</div>'+
        '<div class="sa-header__info">'+
          '<h2 class="sa-company-name">'+stock.name+'</h2>'+
          '<div class="sa-header__meta">'+
            '<span class="sa-sector-chip">'+(stock.sector||'').replace(/_/g,' ')+'</span>'+
            '<span class="sa-exchange-chip">IDX</span>'+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="sa-header__center">'+
        '<div class="sa-score-ring">'+
          '<svg viewBox="0 0 100 100" class="sa-score-svg">'+
            '<circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.07)" stroke-width="10" fill="none"/>'+
            '<circle cx="50" cy="50" r="42" stroke="'+sColor+'" stroke-width="10" fill="none"'+
              ' stroke-dasharray="0 264" stroke-dashoffset="66" stroke-linecap="round"'+
              ' class="sa-score-arc" data-target="'+dashArr+'"/>'+
          '</svg>'+
          '<div class="sa-score-inner"><span class="sa-score-num">'+a.score+'</span><span class="sa-score-max">/100</span></div>'+
        '</div>'+
        '<div class="sa-rating-badge sa-rating--'+a.ratingClass+'">'+a.ratingEmoji+' '+a.rating+'</div>'+
      '</div>'+
      '<div class="sa-header__right">'+
        '<div class="sa-price-block">'+
          '<div class="sa-current-price">'+_rp(stock.price)+'</div>'+
          '<div class="sa-change '+chgCls+'">'+chgSign+stock.change+'%</div>'+
        '</div>'+
        '<button class="sa-close-btn" onclick="closeIDXAnalysis()">✕</button>'+
      '</div>'+
    '</div>'+

    // ── ACTION CARDS ──
    '<div class="sa-action-row">'+
      entryCard + targetCard +
      '<div class="sa-action-card sa-action-card--sl"><div class="sa-ac-icon">🛡️</div><div class="sa-ac-label">Stop Loss</div><div class="sa-ac-price">'+_rp(a.stopLoss)+'</div>'+(a.riskPct?'<div class="sa-ac-note">Risk −'+a.riskPct+'%</div>':'')+'</div>'+
      '<div class="sa-action-card sa-action-card--rr"><div class="sa-ac-icon">⚖️</div><div class="sa-ac-label">Risk/Reward</div><div class="sa-ac-price">'+(a.buyEntry&&a.buyTarget?'1 : '+a.rrr:'—')+'</div>'+(a.riskPct&&a.rewardPct?'<div class="sa-ac-note">−'+a.riskPct+'% / +'+a.rewardPct+'%</div>':'')+'</div>'+
    '</div>'+

    // ── CHART ──
    '<div class="sa-section sa-chart-section">'+
      '<div class="sa-section-title">📉 Price Chart — Support & Resistance (30 Hari)</div>'+
      '<div class="sa-chart-legend">'+
        '<span class="sa-leg"><span class="sa-leg-dot" style="background:#22c55e"></span>Bullish candle</span>'+
        '<span class="sa-leg"><span class="sa-leg-dot" style="background:#ef4444"></span>Bearish candle</span>'+
        '<span class="sa-leg"><span class="sa-leg-line" style="background:#fbbf24"></span>SMA7</span>'+
        '<span class="sa-leg"><span class="sa-leg-line" style="background:#8b5cf6"></span>SMA20</span>'+
        '<span class="sa-leg"><span class="sa-leg-dash" style="border-color:#f87171"></span>Resistance</span>'+
        '<span class="sa-leg"><span class="sa-leg-dash" style="border-color:#4ade80"></span>Support</span>'+
      '</div>'+
      '<canvas id="sa-price-canvas" class="sa-canvas"></canvas>'+
      '<div class="sa-sr-grid">'+
        sr.resistances.slice(0,2).map((r,i)=>'<div class="sa-sr-item sa-sr-item--res"><span>R'+(i+1)+' Resistance</span><strong>'+_rp(Math.round(r))+'</strong></div>').join('')+
        sr.supports.slice(0,2).map((s,i)=>'<div class="sa-sr-item sa-sr-item--sup"><span>S'+(i+1)+' Support</span><strong>'+_rp(Math.round(s))+'</strong></div>').join('')+
      '</div>'+
    '</div>'+

    // ── TECHNICAL INDICATORS ──
    '<div class="sa-section">'+
      '<div class="sa-section-title">⚙️ Technical Indicators</div>'+
      '<div class="sa-tech-grid">'+

        // RSI
        '<div class="sa-tech-card">'+
          '<div class="sa-tech-card__title">RSI (14)</div>'+
          '<div class="sa-rsi-gauge">'+
            '<div class="sa-rsi-bar"><div class="sa-rsi-fill" style="width:'+rsiPct+'%;background:'+rsiCol+'"></div></div>'+
            '<div class="sa-rsi-labels"><span>0</span><span>30</span><span>70</span><span>100</span></div>'+
            '<div class="sa-rsi-marker" style="left:'+rsiPct+'%"></div>'+
          '</div>'+
          '<div class="sa-tech-val" style="color:'+rsiCol+'">'+a.rsi+' — '+a.rsiText+'</div>'+
        '</div>'+

        // MACD
        '<div class="sa-tech-card">'+
          '<div class="sa-tech-card__title">MACD Signal</div>'+
          '<div class="sa-macd-block">'+
            '<div class="sa-macd-dot" style="background:'+macdCol+'"></div>'+
            '<span style="color:'+macdCol+';font-weight:700;font-size:1rem">'+a.macd.toUpperCase()+'</span>'+
          '</div>'+
          '<div class="sa-tech-val">'+(a.macd==='bullish'?'Histogram positif — momentum naik':a.macd==='bearish'?'Histogram negatif — momentum turun':'Zero line — sinyal mixed')+'</div>'+
        '</div>'+

        // 52-Week Range
        '<div class="sa-tech-card">'+
          '<div class="sa-tech-card__title">52-Week Range</div>'+
          '<div class="sa-52w">'+
            '<div class="sa-52w-bar-full">'+
              '<div class="sa-52w-fill-full" style="width:'+a.w52Pct+'%"></div>'+
              '<div class="sa-52w-ptr" style="left:'+a.w52Pct+'%"></div>'+
            '</div>'+
            '<div class="sa-52w-labels"><span>'+_rp(a.w52l)+'</span><span>'+a.w52Pct+'%</span><span>'+_rp(a.w52h)+'</span></div>'+
          '</div>'+
          '<div class="sa-tech-val">'+a.w52Text+'</div>'+
        '</div>'+

        // Bollinger Bands
        '<div class="sa-tech-card">'+
          '<div class="sa-tech-card__title">Bollinger Band</div>'+
          '<div class="sa-bb-status">'+a.bbStatus+'</div>'+
          '<div class="sa-tech-val">Beta: <strong>'+a.beta+'×</strong> — Volatilitas '+(a.beta>1.3?'Tinggi':a.beta<0.7?'Rendah':'Normal')+'</div>'+
        '</div>'+

      '</div>'+
    '</div>'+

    // ── FUNDAMENTAL ──
    '<div class="sa-section">'+
      '<div class="sa-section-title">📊 Fundamental Data</div>'+
      '<div class="sa-data-grid">'+
        _dr('P/E Ratio',   a.pe && a.pe > 0 ? a.pe+'×' : (a.pe ? a.pe+'× (loss)' : '—'))+
        _dr('EPS (Rp)',    a.eps || '—')+
        _dr('Div Yield',   a.divY ? a.divY+'%' : '—')+
        _dr('Beta',        a.beta+'×')+
        _dr('52W High',    _rp(a.w52h))+
        _dr('52W Low',     _rp(a.w52l))+
        _dr('Market Cap',  stock.marketCap || '—')+
        _dr('Volume',      stock.volume || '—')+
      '</div>'+
    '</div>'+

    // ── SCORE + FLOW ──
    '<div class="sa-two-col">'+
      '<div class="sa-section">'+
        '<div class="sa-section-title">📊 Score Breakdown</div>'+
        '<div class="sa-score-bars">'+
          _scorebar('Technical',   a.tScore,    40, '#3b82f6')+
          _scorebar('Flow Asing',  a.fScore,    30, '#a855f7')+
          _scorebar('Fundamental', a.fundScore, 20, '#f59e0b')+
          _scorebar('Momentum',    a.momScore,  10, '#22c55e')+
        '</div>'+
      '</div>'+
      '<div class="sa-section">'+
        '<div class="sa-section-title">🐋 Flow & Whale</div>'+
        '<div class="sa-flow-mini">'+
          '<div class="sa-flow-item"><div class="sa-flow-label">Foreign Flow</div><div class="sa-flow-value" style="color:'+(a.foreign>0?'#4ade80':a.foreign<0?'#f87171':'#94a3b8')+'">'+_fmtForeign(a.foreign)+'</div></div>'+
          '<div class="sa-flow-item"><div class="sa-flow-label">Volume</div><div class="sa-flow-value">'+_fmtVol(a.vol)+'</div></div>'+
          '<div class="sa-flow-item"><div class="sa-flow-label">Whale</div><div class="sa-flow-value">'+(a.foreign>1e9&&a.vol>=20e6?'🐋 Akumulasi':a.foreign<-1e9?'🔴 Distribusi':'—')+'</div></div>'+
          '<div class="sa-flow-item"><div class="sa-flow-label">Inflow Cat</div><div class="sa-flow-value">'+(a.vol>=100e6?'🔥 Ultra High':a.vol>=50e6?'📊 High':a.vol>=20e6?'📊 Normal':'💤 Low')+'</div></div>'+
        '</div>'+
      '</div>'+
    '</div>'+

    // ── NARRATIVE ──
    '<div class="sa-section sa-narrative">'+
      '<div class="sa-section-title">🧠 Expert Analysis — Ringkasan & Rekomendasi</div>'+
      '<div class="sa-summary-box"><p class="sa-summary-text">'+a.narratives.summaryLine+'</p></div>'+
      (a.narratives.reasons.length?'<div class="sa-reasons"><div class="sa-reasons-title">✅ Sinyal Positif</div><ul class="sa-reason-list">'+a.narratives.reasons.map(r=>'<li>'+r+'</li>').join('')+'</ul></div>':'')+
      (a.narratives.warnings.length?'<div class="sa-warnings"><div class="sa-reasons-title">⚠️ Risiko & Perhatian</div><ul class="sa-reason-list sa-reason-list--warn">'+a.narratives.warnings.map(w=>'<li>'+w+'</li>').join('')+'</ul></div>':'')+
    '</div>'+

    '<div class="sa-disclaimer">⚠️ Analisa ini bersifat edukatif dan tidak merupakan rekomendasi investasi resmi. Data harga bersifat simulatif. Keputusan investasi sepenuhnya tanggung jawab investor.</div>';

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Animate score arc
    setTimeout(function() {
        var arc = container.querySelector('.sa-score-arc');
        if (arc) { arc.style.transition='stroke-dasharray 1s ease'; arc.style.strokeDasharray = arc.getAttribute('data-target')+' 264'; }
    }, 80);

    // Draw chart after layout
    setTimeout(function() {
        var canvas = document.getElementById('sa-price-canvas');
        if (canvas) _drawChart(canvas, candles, sr, stock, a);
    }, 100);

    // Animate score bars
    setTimeout(function() {
        container.querySelectorAll('.sa-scorebar__fill, .sa-rsi-fill, .sa-52w-fill-full').forEach(function(el) {
            el.style.transition = 'width 0.9s ease';
        });
    }, 50);
}

function closeIDXAnalysis() {
    var s = document.getElementById('idxAnalysisSection');
    if (s) s.style.display = 'none';
}

// ─────────────────────────── US Stock ─────────────────────────────────
function showUSStockAnalysis(stock) {
    const section   = document.getElementById('usAnalysisSection');
    const container = document.getElementById('usAnalysisContainer');
    if (!section || !container) return;
    const chgCls  = stock.change >= 0 ? 'positive' : 'negative';
    const chgSign = stock.change >= 0 ? '+' : '';
    container.innerHTML =
        '<div class="sa-header sa-header--us">'+
          '<div class="sa-header__left">'+
            '<div class="sa-ticker-badge sa-ticker-badge--us">'+(stock.ticker||stock.code)+'</div>'+
            '<div class="sa-header__info">'+
              '<h2 class="sa-company-name">'+stock.name+'</h2>'+
              '<div class="sa-header__meta">'+
                '<span class="sa-sector-chip">'+(stock.sector||'—')+'</span>'+
                '<span class="sa-exchange-chip sa-exchange-chip--us">'+(stock.exchange||'US')+'</span>'+
              '</div>'+
            '</div>'+
          '</div>'+
          '<div class="sa-header__right">'+
            '<div class="sa-price-block">'+
              '<div class="sa-current-price">$'+Number(stock.price||0).toFixed(2)+'</div>'+
              '<div class="sa-change '+chgCls+'">'+chgSign+stock.change+'%</div>'+
            '</div>'+
            '<button class="sa-close-btn" onclick="closeUSAnalysis()">✕</button>'+
          '</div>'+
        '</div>'+
        '<div class="sa-section"><div class="sa-section-title">📊 Market Data</div><div class="sa-data-grid">'+
          _dr('Sector', stock.sector||'—')+_dr('Volume',stock.volume||'—')+
          _dr('Mkt Cap',stock.marketCap||'—')+_dr('P/E',stock.pe||'—')+
          _dr('EPS',stock.eps||'—')+_dr('Signal',stock.technical||'—')+
        '</div></div>';
    section.style.display = 'block';
    section.scrollIntoView({ behavior:'smooth' });
}

function closeUSAnalysis() {
    var s = document.getElementById('usAnalysisSection');
    if (s) s.style.display = 'none';
}
