// ══════════════════════════════════════════════════════════════
//  CORRELATION MATRIX  — 7d/30d Return Correlation for Major Cryptos
// ══════════════════════════════════════════════════════════════
const CorrelationMatrix = (function () {
    'use strict';

    const COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'AVAX', 'ADA'];
    let _open = false;
    let _mode = '7d'; // '7d' or '30d'

    function init() {
        if (document.getElementById('cm-modal')) return;
        const el = document.createElement('div');
        el.id = 'cm-modal';
        el.innerHTML = `
<div id="cm-backdrop" onclick="CorrelationMatrix.closeModal()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9000;"></div>
<div id="cm-box" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(680px,96vw);max-height:85vh;background:#0d1929;border:1px solid #1e3a5f;border-radius:16px;z-index:9001;flex-direction:column;overflow:hidden;">
  <div style="padding:14px 20px;background:#0a1628;border-bottom:1px solid #1e3a5f;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
    <div style="font-size:15px;font-weight:700;color:#e2e8f0">🔗 Correlation Matrix</div>
    <div style="display:flex;gap:8px;align-items:center">
      <button id="cm-btn-7d" onclick="CorrelationMatrix.setMode('7d')" style="background:#1e40af;border:none;border-radius:8px;padding:4px 12px;color:#93c5fd;cursor:pointer;font-size:12px;font-weight:600">7 Hari</button>
      <button id="cm-btn-30d" onclick="CorrelationMatrix.setMode('30d')" style="background:#1e3a5f;border:none;border-radius:8px;padding:4px 12px;color:#64748b;cursor:pointer;font-size:12px">30 Hari</button>
      <button onclick="CorrelationMatrix.refresh()" style="background:#1e3a5f;border:none;border-radius:8px;padding:4px 12px;color:#94a3b8;cursor:pointer;font-size:12px">🔄</button>
      <button onclick="CorrelationMatrix.closeModal()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:18px;line-height:1">✕</button>
    </div>
  </div>
  <div style="padding:8px 16px;background:#0a1628;border-bottom:1px solid #0f2035;font-size:11px;color:#475569">
    Pearson correlation berdasarkan return harian. <b style="color:#10b981">Hijau</b> = korelasi tinggi · <b style="color:#ef4444">Merah</b> = korelasi negatif · <b style="color:#475569">Abu</b> = tidak berkorelasi
  </div>
  <div id="cm-body" style="padding:16px;overflow:auto;flex:1">
    <div style="text-align:center;color:#475569;padding:40px 0">Loading data...</div>
  </div>
</div>`;
        document.body.appendChild(el);
    }

    function openModal() {
        const backdrop = document.getElementById('cm-backdrop');
        const box      = document.getElementById('cm-box');
        if (!backdrop || !box) { init(); return setTimeout(openModal, 100); }
        backdrop.style.display = 'block';
        box.style.display = 'flex';
        _open = true;
        refresh();
    }

    function closeModal() {
        const backdrop = document.getElementById('cm-backdrop');
        const box      = document.getElementById('cm-box');
        if (backdrop) backdrop.style.display = 'none';
        if (box) box.style.display = 'none';
        _open = false;
    }

    function setMode(m) {
        _mode = m;
        document.getElementById('cm-btn-7d').style.background  = m === '7d'  ? '#1e40af' : '#1e3a5f';
        document.getElementById('cm-btn-7d').style.color       = m === '7d'  ? '#93c5fd' : '#64748b';
        document.getElementById('cm-btn-30d').style.background = m === '30d' ? '#1e40af' : '#1e3a5f';
        document.getElementById('cm-btn-30d').style.color      = m === '30d' ? '#93c5fd' : '#64748b';
        refresh();
    }

    async function fetchKlines(symbol, days) {
        const limit = days + 1;
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=${limit}`;
        const r = await fetch(url);
        const d = await r.json();
        if (!Array.isArray(d) || d.length < 2) throw new Error(`No data for ${symbol}`);
        // Return daily percent returns
        const closes = d.map(k => parseFloat(k[4]));
        const returns = [];
        for (let i = 1; i < closes.length; i++) {
            returns.push((closes[i] - closes[i-1]) / closes[i-1]);
        }
        return returns;
    }

    function pearson(a, b) {
        const n = Math.min(a.length, b.length);
        if (n < 2) return 0;
        let sumA = 0, sumB = 0, sumA2 = 0, sumB2 = 0, sumAB = 0;
        for (let i = 0; i < n; i++) {
            sumA  += a[i]; sumB  += b[i];
            sumA2 += a[i]*a[i]; sumB2 += b[i]*b[i];
            sumAB += a[i]*b[i];
        }
        const num = n * sumAB - sumA * sumB;
        const den = Math.sqrt((n*sumA2 - sumA*sumA) * (n*sumB2 - sumB*sumB));
        return den === 0 ? 0 : num / den;
    }

    function corrColor(c) {
        if (c >= 0.7)  return '#10b981'; // strong positive
        if (c >= 0.4)  return '#34d399';
        if (c >= 0.1)  return '#6ee7b7';
        if (c >= -0.1) return '#475569'; // neutral
        if (c >= -0.4) return '#fca5a5';
        if (c >= -0.7) return '#f87171';
        return '#ef4444';                // strong negative
    }

    async function refresh() {
        const body = document.getElementById('cm-body');
        if (!body) return;
        body.innerHTML = '<div style="text-align:center;color:#475569;padding:40px 0">⏳ Mengambil data harga...</div>';
        try {
            const days = _mode === '7d' ? 7 : 30;
            const results = await Promise.allSettled(COINS.map(c => fetchKlines(c, days)));
            const returns = {};
            results.forEach((r, i) => {
                if (r.status === 'fulfilled') returns[COINS[i]] = r.value;
            });
            const available = COINS.filter(c => returns[c]);

            // Build matrix
            const matrix = {};
            available.forEach(a => {
                matrix[a] = {};
                available.forEach(b => {
                    matrix[a][b] = pearson(returns[a], returns[b]);
                });
            });

            // Render table
            const cellSz = '60px';
            let html = `<div style="overflow-x:auto"><table style="border-collapse:collapse;font-size:12px;min-width:100%">
<tr><th style="padding:6px 8px;color:#64748b;text-align:left;white-space:nowrap"></th>`;
            available.forEach(c => {
                html += `<th style="padding:6px 4px;color:#94a3b8;font-weight:700;text-align:center;width:${cellSz}">${c}</th>`;
            });
            html += '</tr>';
            available.forEach(a => {
                html += `<tr><td style="padding:6px 8px;color:#94a3b8;font-weight:700;white-space:nowrap">${a}</td>`;
                available.forEach(b => {
                    const c = matrix[a][b];
                    const clr = corrColor(c);
                    const isD = a === b;
                    const bg  = isD ? '#1e293b' : `${clr}22`;
                    const txt = isD ? '—' : c.toFixed(2);
                    const fclr= isD ? '#64748b' : clr;
                    html += `<td style="padding:4px;text-align:center;width:${cellSz}">
<div style="background:${bg};border-radius:6px;padding:6px 4px;color:${fclr};font-weight:${isD?'400':'600'};font-size:12px">${txt}</div></td>`;
                });
                html += '</tr>';
            });
            html += '</table></div>';

            // Interpretation
            const strongPairs = [];
            for (let i = 0; i < available.length; i++) {
                for (let j = i+1; j < available.length; j++) {
                    const c = matrix[available[i]][available[j]];
                    if (c >= 0.8) strongPairs.push(`${available[i]}-${available[j]}: ${c.toFixed(2)} 🔗`);
                }
            }

            body.innerHTML = html + (strongPairs.length ? `
<div style="margin-top:12px;background:#0a1628;border:1px solid #1e3a5f;border-radius:10px;padding:12px 14px">
  <div style="font-size:12px;color:#94a3b8;font-weight:700;margin-bottom:6px">🔗 Korelasi Sangat Tinggi (≥0.80)</div>
  <div style="font-size:12px;color:#10b981">${strongPairs.join(' · ')}</div>
</div>` : '');

        } catch (e) {
            body.innerHTML = `<div style="text-align:center;color:#ef4444;padding:40px 0">❌ Error: ${e.message}</div>`;
        }
    }

    return { init, openModal, closeModal, setMode, refresh };
})();
