// ══════════════════════════════════════════════════════════════
//  SNIPER SCANNER  — Confluence-based bottom detector
//  Mencari setup reversal terbaik dari 30 top pairs
// ══════════════════════════════════════════════════════════════
const SniperScanner = (function () {
    'use strict';

    const PROXY = 'http://127.0.0.1:3001';
    let _tf = '1h';
    let _autoInterval = null;
    let _lastResults  = [];

    // ─── INIT ─────────────────────────────────────────────────
    function init() {
        // Render tab content dilakukan dari index.html
        // Pasang event listener tf selector
        document.addEventListener('tabchange', e => {
            if (e.detail === 'sniper') {
                runScan();
                // Auto refresh setiap 5 menit saat tab aktif
                _autoInterval = setInterval(runScan, 5 * 60_000);
            } else {
                clearInterval(_autoInterval);
            }
        });
    }

    // ─── SCAN ─────────────────────────────────────────────────
    async function runScan() {
        _renderLoading();
        try {
            const r = await fetch(`${PROXY}/api/sniper-scan?tf=${_tf}`);
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || 'Scan gagal');
            _lastResults = d.coins || [];
            _renderResults(_lastResults, d.scannedAt);
        } catch (e) {
            _renderError(e.message);
        }
    }

    function setTf(tf) {
        _tf = tf;
        ['15m','1h','4h'].forEach(t => {
            const btn = document.getElementById(`sniper-tf-${t}`);
            if (btn) {
                btn.style.background = t === tf ? '#1e40af' : '#1e3a5f';
                btn.style.color      = t === tf ? '#93c5fd' : '#64748b';
            }
        });
        runScan();
    }

    // ─── RENDER ───────────────────────────────────────────────
    function _renderLoading() {
        const body = document.getElementById('sniper-body');
        if (!body) return;
        body.innerHTML = `
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;padding:16px">
  ${Array(6).fill(0).map(() => `
  <div style="background:#0a1628;border:1px solid #1e3a5f;border-radius:12px;padding:14px;animation:pulse 1.5s infinite">
    <div style="background:#1e3a5f;height:14px;border-radius:4px;width:40%;margin-bottom:10px"></div>
    <div style="background:#1e3a5f;height:10px;border-radius:4px;width:70%;margin-bottom:6px"></div>
    <div style="background:#1e3a5f;height:8px;border-radius:4px;width:90%"></div>
  </div>`).join('')}
</div>`;
    }

    function _renderError(msg) {
        const body = document.getElementById('sniper-body');
        if (!body) return;
        body.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#ef4444">❌ ${msg}</div>`;
    }

    function _renderResults(coins, scannedAt) {
        const body = document.getElementById('sniper-body');
        if (!body) return;

        const snipers = coins.filter(c => c.score >= 80);
        const watches = coins.filter(c => c.score >= 60 && c.score < 80);
        const setups  = coins.filter(c => c.score >= 40 && c.score < 60);

        const ts = scannedAt ? new Date(scannedAt).toLocaleTimeString('id-ID') : '–';

        // Summary bar
        let html = `
<div style="padding:12px 16px;background:#0a1628;border-bottom:1px solid #1e3a5f;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
  <div style="font-size:12px;color:#64748b">📡 Scan selesai ${ts}</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <span style="background:#f59e0b22;color:#f59e0b;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700">🎯 ${snipers.length} Sniper</span>
    <span style="background:#3b82f622;color:#3b82f6;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700">👀 ${watches.length} Watch</span>
    <span style="background:#8b5cf622;color:#8b5cf6;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700">📋 ${setups.length} Setup</span>
  </div>
  <button onclick="SniperScanner.runScan()" style="margin-left:auto;background:#1e3a5f;border:none;border-radius:8px;padding:5px 14px;color:#94a3b8;cursor:pointer;font-size:12px">🔄 Refresh</button>
</div>`;

        // Top sniper coins first, then watch, then setup
        const allToShow = [...snipers, ...watches, ...setups];

        if (!allToShow.length) {
            html += `<div style="text-align:center;padding:60px 20px;color:#475569">
              😴 Belum ada setup yang cukup kuat saat ini.<br>
              <span style="font-size:12px">Coba timeframe berbeda atau tunggu kondisi market lebih jelas.</span>
            </div>`;
            body.innerHTML = html;
            return;
        }

        html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;padding:16px">`;

        allToShow.forEach(c => {
            const isSniper = c.score >= 80;
            const isWatch  = c.score >= 60 && c.score < 80;
            const border   = isSniper ? '#f59e0b' : isWatch ? '#3b82f6' : '#8b5cf6';
            const priceStr = c.price < 0.01 ? c.price.toFixed(6) : c.price < 1 ? c.price.toFixed(4) : c.price.toFixed(2);
            const chClr    = c.ch24h >= 0 ? '#10b981' : '#ef4444';
            const scoreClr = c.score >= 80 ? '#f59e0b' : c.score >= 60 ? '#3b82f6' : '#8b5cf6';
            const scorePct = Math.min(100, c.score);

            // Signal badges
            const badges = Object.values(c.signals)
                .filter(s => s.active)
                .map(s => `<span style="background:${scoreClr}22;color:${scoreClr};padding:2px 7px;border-radius:99px;font-size:10px;font-weight:600;white-space:nowrap">✓ ${s.label}</span>`)
                .join('');

            html += `
<div class="sniper-card" style="background:#0a1628;border:1px solid ${border}44;border-left:3px solid ${border};border-radius:12px;padding:14px;cursor:pointer;transition:transform .15s,border-color .15s"
     onmouseenter="this.style.transform='translateY(-2px)';this.style.borderColor='${border}'"
     onmouseleave="this.style.transform='';this.style.borderColor='${border}44'"
     onclick="SniperScanner.openChart('${c.symbol}')">

  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="font-size:15px;font-weight:800;color:#e2e8f0">${c.symbol}</div>
      <div style="font-size:10px;font-weight:700;color:${border};background:${border}22;padding:2px 8px;border-radius:99px">${c.signal}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:700;color:#e2e8f0">$${priceStr}</div>
      <div style="font-size:11px;color:${chClr}">${c.ch24h >= 0 ? '+' : ''}${c.ch24h}%</div>
    </div>
  </div>

  <!-- Score bar -->
  <div style="margin-bottom:10px">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
      <span style="font-size:11px;color:#64748b">Confluence Score</span>
      <span style="font-size:13px;font-weight:800;color:${scoreClr}">${c.score}<span style="font-size:10px;color:#64748b">/100</span></span>
    </div>
    <div style="height:6px;background:#1e293b;border-radius:3px;overflow:hidden">
      <div style="width:${scorePct}%;height:100%;background:linear-gradient(90deg,${scoreClr}88,${scoreClr});border-radius:3px;transition:width .5s"></div>
    </div>
  </div>

  <!-- Signal badges -->
  <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${badges || '<span style="font-size:10px;color:#475569">Belum ada sinyal kuat</span>'}</div>

  <!-- Meta: RSI + Volume -->
  <div style="display:flex;gap:10px;border-top:1px solid #1e3a5f;padding-top:8px">
    <div style="flex:1;text-align:center">
      <div style="font-size:10px;color:#64748b">RSI</div>
      <div style="font-size:12px;font-weight:700;color:${c.rsi < 30 ? '#10b981' : c.rsi > 70 ? '#ef4444' : '#94a3b8'}">${c.rsi}</div>
    </div>
    <div style="flex:1;text-align:center">
      <div style="font-size:10px;color:#64748b">Vol Ratio</div>
      <div style="font-size:12px;font-weight:700;color:${c.volRatio >= 2 ? '#f59e0b' : '#94a3b8'}">${c.volRatio}x</div>
    </div>
    <div style="flex:1;text-align:center">
      <div style="font-size:10px;color:#64748b">Sinyal</div>
      <div style="font-size:12px;font-weight:700;color:#64748b">${Object.values(c.signals).filter(s=>s.active).length}/6</div>
    </div>
    <div style="text-align:right;display:flex;align-items:center">
      <span style="font-size:10px;color:#3b82f6">📊 Chart →</span>
    </div>
  </div>
</div>`;
        });

        html += '</div>';

        // Bottom note
        html += `<div style="padding:10px 16px 20px;font-size:11px;color:#334155;text-align:center">
          ℹ️ Score ≥80 = Sniper Zone · ≥60 = Watch · ≥40 = Setup terbentuk · Klik kartu untuk buka HollowCat Chart
        </div>`;

        body.innerHTML = html;
    }

    // ─── OPEN CHART ───────────────────────────────────────────
    function openChart(symbol) {
        // Switch ke HollowCat tab dan set symbol
        if (typeof switchTab === 'function') switchTab('hollowcat-scan');
        setTimeout(() => {
            const symInput = document.getElementById('hcsSym');
            const scanBtn  = document.getElementById('hcsScanBtn');
            if (symInput) symInput.value = symbol;
            if (scanBtn)  scanBtn.click();
        }, 300);
    }

    return { init, runScan, setTf, openChart };
})();
