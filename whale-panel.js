// ══════════════════════════════════════════════════════════════════════════════
//  Whale Panel v1 — Deteksi aktivitas whale dari volume anomali CoinGecko
//  + Sumber on-chain publik (tidak perlu API key)
//  Endpoint: GET /api/whale-screen
//  Auto-refresh setiap 3 menit
// ══════════════════════════════════════════════════════════════════════════════

const whalePanel = (() => {
    'use strict';

    const API_URL     = 'http://127.0.0.1:3001/api/whale-screen';
    const REFRESH_MS  = 3 * 60 * 1000; // 3 menit

    let _data        = null;
    let _timer       = null;
    let _loading     = false;
    let _filterMin   = 0;     // min $ threshold filter
    let _inited      = false;

    // Threshold filter options
    const THRESHOLDS = [
        { label: 'Semua',   value: 0 },
        { label: '>$1M',    value: 1e6 },
        { label: '>$5M',    value: 5e6 },
        { label: '>$10M',   value: 1e7 },
        { label: '>$50M',   value: 5e7 },
        { label: '>$100M',  value: 1e8 },
    ];

    // ── Fetch data ────────────────────────────────────────────────────────────
    async function _fetch() {
        _loading = true;
        _renderStatus('loading');
        try {
            const res  = await fetch(API_URL);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            _data = await res.json();
            _renderPanel();
        } catch (e) {
            _renderStatus('error', e.message);
        } finally {
            _loading = false;
        }
    }

    // ── Format helpers ────────────────────────────────────────────────────────
    function _fmtUSD(v) {
        if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
        if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
        if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
        return '$' + v.toFixed(0);
    }

    function _fmtPrice(p) {
        if (!p && p !== 0) return '$—';
        if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
        if (p >= 1)    return '$' + p.toFixed(3);
        if (p >= 0.001) return '$' + p.toFixed(5);
        return '$' + p.toFixed(8);
    }

    function _timeAgo(isoTs) {
        if (!isoTs) return '';
        const diff = (Date.now() - new Date(isoTs).getTime()) / 1000;
        if (diff < 60)   return Math.floor(diff) + 'd lalu';
        if (diff < 3600) return Math.floor(diff / 60) + 'm lalu';
        if (diff < 86400) return Math.floor(diff / 3600) + 'j lalu';
        return Math.floor(diff / 86400) + ' hari lalu';
    }

    // ── Whale level badge ─────────────────────────────────────────────────────
    function _whaleBadge(ratio) {
        if (ratio >= 2)   return { label: '🐳 Mega Whale',    bg: '#7f1d1d', color: '#fca5a5' };
        if (ratio >= 1)   return { label: '🐋 Whale',         bg: '#1e1b4b', color: '#a5b4fc' };
        if (ratio >= 0.5) return { label: '🦈 Shark',         bg: '#172554', color: '#93c5fd' };
        return                    { label: '🐬 Dolphin',      bg: '#164e63', color: '#67e8f9' };
    }

    // ── Render full panel ─────────────────────────────────────────────────────
    function _renderPanel() {
        const container = document.getElementById('whalePanelContainer');
        if (!container) return;

        const d = _data;
        if (!d) { _renderStatus('loading'); return; }

        // Build summary stats
        const whaleCount  = d.whales?.length ?? 0;
        const megaCount   = d.whales?.filter(w => w.volMcRatio >= 2).length ?? 0;
        const totalVolume = d.whales?.reduce((s, w) => s + (w.volumeUSD ?? 0), 0) ?? 0;
        const bullish     = d.whales?.filter(w => (w.priceChange24h ?? 0) > 0).length ?? 0;
        const bearish     = d.whales?.filter(w => (w.priceChange24h ?? 0) < 0).length ?? 0;

        container.innerHTML = `
<div class="whale-wrap">

  <!-- Header -->
  <div class="whale-header">
    <div>
      <h2 class="whale-title">🐋 Whale Activity Monitor</h2>
      <p class="whale-subtitle">
        Deteksi akumulasi besar via anomali volume CoinGecko — update setiap 3 menit
      </p>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span id="whaleTs" style="font-size:11px;color:#475569">${d.fetchedAt ? 'Update: ' + new Date(d.fetchedAt).toLocaleTimeString('id-ID') : ''}</span>
      <button onclick="whalePanel.refresh()" class="screener-refresh-btn">↻ Refresh</button>
    </div>
  </div>

  <!-- Summary KPI row -->
  <div class="whale-kpi-row">
    <div class="whale-kpi-card">
      <div class="whale-kpi-val">${whaleCount}</div>
      <div class="whale-kpi-label">🐋 Coin Terdeteksi</div>
    </div>
    <div class="whale-kpi-card" style="--kc:#fca5a5">
      <div class="whale-kpi-val" style="color:#fca5a5">${megaCount}</div>
      <div class="whale-kpi-label">🐳 Mega Whale (Vol/MC >200%)</div>
    </div>
    <div class="whale-kpi-card">
      <div class="whale-kpi-val" style="color:#67e8f9">${_fmtUSD(totalVolume)}</div>
      <div class="whale-kpi-label">💰 Total Volume Anomali</div>
    </div>
    <div class="whale-kpi-card">
      <div class="whale-kpi-val" style="color:#4ade80">${bullish} 🟢 / ${bearish} 🔴</div>
      <div class="whale-kpi-label">📊 Bullish / Bearish</div>
    </div>
  </div>

  <!-- Filter threshold -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <span style="font-size:12px;color:#64748b;font-weight:600">Filter volume:</span>
    ${THRESHOLDS.map(t => `
      <button class="whale-filter-btn ${_filterMin === t.value ? 'whale-filter-btn--active' : ''}"
              onclick="whalePanel.setFilter(${t.value})">${t.label}</button>
    `).join('')}
  </div>

  <!-- Whale feed table -->
  <div style="overflow-x:auto;border-radius:12px;border:1px solid #1e293b">
    <table class="whale-table">
      <thead>
        <tr>
          <th>Level</th>
          <th>Coin</th>
          <th>Rank</th>
          <th>Harga</th>
          <th>24h Δ</th>
          <th>Volume 24h</th>
          <th>Vol/MC Ratio</th>
          <th>Market Cap</th>
          <th>Sinyal</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${_renderRows(d.whales || [])}
      </tbody>
    </table>
  </div>

  <!-- Educational note -->
  <div class="whale-note">
    <div style="font-weight:600;margin-bottom:4px">📚 Cara Baca Whale Activity</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:11px;color:#64748b">
      <div>🐳 <strong style="color:#fca5a5">Mega Whale</strong> — Vol/MC >200%: pergerakan luar biasa, high risk</div>
      <div>🐋 <strong style="color:#a5b4fc">Whale</strong> — Vol/MC >100%: akumulasi besar terdeteksi</div>
      <div>🦈 <strong style="color:#93c5fd">Shark</strong> — Vol/MC >50%: volume di atas normal signifikan</div>
      <div>🐬 <strong style="color:#67e8f9">Dolphin</strong> — Vol/MC >25%: aktivitas di atas rata-rata</div>
      <div>📉 Harga turun + volume tinggi = <strong>akumulasi whale</strong> (beli saat retail panic)</div>
      <div>📈 Harga naik + volume tinggi = <strong>distribusi/pump</strong> (whale jual ke retail)</div>
    </div>
  </div>

  <!-- Disclaimer -->
  <div style="margin-top:12px;font-size:10px;color:#334155;text-align:center">
    ⚠️ Data berdasarkan volume anomali CoinGecko — bukan data on-chain langsung. Gunakan sebagai referensi, bukan sinyal trading tunggal.
  </div>

</div>`;
    }

    function _renderRows(whales) {
        const filtered = whales.filter(w => (w.volumeUSD ?? 0) >= _filterMin);
        if (!filtered.length) {
            return `<tr><td colspan="10" style="text-align:center;padding:32px;color:#475569">
              Tidak ada whale activity dengan threshold ini
            </td></tr>`;
        }

        const colorCh = (v) => v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#94a3b8';

        return filtered.map((w, i) => {
            const badge = _whaleBadge(w.volMcRatio);
            const ch24  = w.priceChange24h ?? 0;
            const signals = w.signals || [];

            return `
<tr class="whale-row" onclick="whalePanel.analyzeWhale('${w.id}','${w.symbol}','${(w.name||'').replace(/'/g,'')}')">
  <td>
    <span class="whale-level-badge" style="background:${badge.bg};color:${badge.color}">${badge.label}</span>
  </td>
  <td>
    <div style="display:flex;align-items:center;gap:8px">
      <img src="${w.image || ''}" alt="${w.symbol}" width="24" height="24" style="border-radius:50%;object-fit:cover" onerror="this.style.display='none'">
      <div>
        <div style="font-weight:700;color:#f1f5f9;font-size:13px">${w.symbol?.toUpperCase()}</div>
        <div style="font-size:11px;color:#64748b">${w.name}</div>
      </div>
    </div>
  </td>
  <td style="color:#64748b;font-size:12px">#${w.rank || '?'}</td>
  <td style="color:#e2e8f0;font-weight:600">${_fmtPrice(w.priceUSD)}</td>
  <td style="color:${colorCh(ch24)};font-weight:700">${ch24 > 0 ? '+' : ''}${ch24.toFixed(2)}%</td>
  <td style="color:#67e8f9;font-weight:600">${_fmtUSD(w.volumeUSD)}</td>
  <td>
    <div style="display:flex;flex-direction:column;gap:2px">
      <span style="font-weight:700;color:${w.volMcRatio >= 1 ? '#fca5a5' : w.volMcRatio >= 0.5 ? '#a5b4fc' : '#93c5fd'};font-size:14px">
        ${(w.volMcRatio * 100).toFixed(1)}%
      </span>
      <div style="height:4px;background:#1e293b;border-radius:2px;width:80px;overflow:hidden">
        <div style="height:100%;background:${w.volMcRatio >= 1 ? '#ef4444' : '#3b82f6'};width:${Math.min(w.volMcRatio * 50, 100)}%;border-radius:2px;transition:width 0.5s"></div>
      </div>
    </div>
  </td>
  <td style="color:#94a3b8;font-size:12px">${_fmtUSD(w.marketCap)}</td>
  <td>
    <div style="display:flex;flex-wrap:wrap;gap:3px">
      ${signals.map(s => `<span class="screener-signal">${s}</span>`).join('')}
    </div>
  </td>
  <td onclick="event.stopPropagation()">
    <div style="display:flex;gap:4px">
      <button onclick="whalePanel.analyzeWhale('${w.id}','${w.symbol}','${(w.name||'').replace(/'/g,'')}')" class="screener-act-btn" title="Analisa">📊</button>
      <a href="https://www.coingecko.com/en/coins/${w.id}" target="_blank" class="screener-act-btn" title="CoinGecko">🦎</a>
      <a href="https://www.tradingview.com/chart/?symbol=${w.symbol?.toUpperCase()}USDT" target="_blank" class="screener-act-btn" title="TradingView">📈</a>
    </div>
  </td>
</tr>`;
        }).join('');
    }

    function _renderStatus(state, msg) {
        const c = document.getElementById('whalePanelContainer');
        if (!c) return;
        if (state === 'loading') {
            c.innerHTML = `<div class="screener-loading" style="padding:60px 0"><span class="g-spinner"></span><span>Memuat whale data…</span></div>`;
        } else if (state === 'error') {
            c.innerHTML = `<div class="pt-empty" style="padding:48px 0">
              <div class="pt-empty-icon">🐳</div>
              <div class="pt-empty-title">Gagal memuat whale data</div>
              <div class="pt-empty-sub">${msg || 'Server tidak tersedia'}</div>
              <button onclick="whalePanel.refresh()" class="screener-refresh-btn" style="margin-top:16px">↻ Coba Lagi</button>
            </div>`;
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────
    function refresh() {
        _fetch();
    }

    function setFilter(minVal) {
        _filterMin = minVal;
        // Update button states
        document.querySelectorAll('.whale-filter-btn').forEach(btn => {
            btn.classList.toggle('whale-filter-btn--active',
                btn.textContent.trim() === THRESHOLDS.find(t => t.value === minVal)?.label);
        });
        if (_data) _renderPanel();
    }

    function analyzeWhale(coinId, symbol, name) {
        const coin = window.cryptoData?.find(c => c.id === coinId);
        if (coin) {
            if (typeof window.analyzeCoin === 'function') window.analyzeCoin(coinId);
        } else if (typeof window._analyzeUnlistedCoin === 'function') {
            window._analyzeUnlistedCoin(coinId, symbol, name);
        }
    }

    function init() {
        if (_inited) return;
        _inited = true;
        _fetch();
        _timer = setInterval(_fetch, REFRESH_MS);
    }

    function destroy() {
        if (_timer) { clearInterval(_timer); _timer = null; }
        _inited = false;
    }

    return { init, refresh, setFilter, analyzeWhale, destroy };
})();
