// ══════════════════════════════════════════════════════════════════════════════
//  Macro Bar — Fear & Greed + Crypto Global + Macro Indicators
//  Updates every 5 minutes. Renders into #macroBar
//  Includes: DXY Index, US 10Y Yield, BTC, ETH, Total MCap, BTC Dom, F&G
// ══════════════════════════════════════════════════════════════════════════════

const macroBar = (() => {
    'use strict';

    const REFRESH_MS = 5 * 60 * 1000; // 5 minutes
    let _timer    = null;
    let _data     = {};
    let _compact  = false; // compact/expanded toggle

    const FNG_LABELS = {
        'Extreme Fear': { color: '#f87171', icon: '😱' },
        'Fear':         { color: '#fb923c', icon: '😨' },
        'Neutral':      { color: '#fbbf24', icon: '😐' },
        'Greed':        { color: '#86efac', icon: '😏' },
        'Extreme Greed':{ color: '#4ade80', icon: '🤑' },
    };

    // ── Fetch Fear & Greed ────────────────────────────────────────────────────
    async function _fetchFNG() {
        try {
            const r = await fetch('https://api.alternative.me/fng/?limit=1&format=json');
            const d = await r.json();
            const item = d?.data?.[0];
            if (!item) return null;
            return {
                value:     Number(item.value),
                label:     item.value_classification,
                timestamp: item.timestamp,
            };
        } catch { return null; }
    }

    // ── Fetch CoinGecko global ────────────────────────────────────────────────
    async function _fetchGlobal() {
        try {
            const r = await fetch('https://api.coingecko.com/api/v3/global');
            const d = await r.json();
            const g = d?.data;
            if (!g) return null;
            return {
                totalMcap:    g.total_market_cap?.usd || 0,
                totalVol24h:  g.total_volume?.usd || 0,
                btcDominance: g.market_cap_percentage?.btc || 0,
                ethDominance: g.market_cap_percentage?.eth || 0,
                mcapChange24h:g.market_cap_change_percentage_24h_usd || 0,
                activeCryptos:g.active_cryptocurrencies || 0,
            };
        } catch { return null; }
    }

    // ── Fetch BTC + ETH price ─────────────────────────────────────────────────
    async function _fetchBTCPrice() {
        try {
            const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
            const d = await r.json();
            return {
                btcPrice:  d?.bitcoin?.usd  || 0,
                btcChange: d?.bitcoin?.usd_24h_change  || 0,
                ethPrice:  d?.ethereum?.usd || 0,
                ethChange: d?.ethereum?.usd_24h_change || 0,
            };
        } catch { return null; }
    }

    // ── Fetch DXY (US Dollar Index) via stooq ─────────────────────────────────
    async function _fetchDXY() {
        // Try stooq CSV (dx.f = DXY futures)
        const urls = [
            'https://stooq.com/q/l/?s=dx.f&f=sd2t2ohlcv&h&e=csv',
            'https://stooq.com/q/l/?s=usdx.icap&f=sd2t2ohlcv&h&e=csv',
        ];
        for (const url of urls) {
            try {
                const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
                if (!r.ok) continue;
                const text = await r.text();
                const lines = text.trim().split('\n');
                if (lines.length < 2) continue;
                const parts = lines[1].split(',');
                const close = parseFloat(parts[6]);
                const open  = parseFloat(parts[3]);
                if (isNaN(close) || close <= 0) continue;
                const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
                return { value: close, change: changePct };
            } catch { /* try next */ }
        }
        return null;
    }

    // ── Fetch US 10Y Treasury Yield via stooq ────────────────────────────────
    async function _fetchUS10Y() {
        // Try multiple stooq tickers for US 10Y yield
        const urls = [
            'https://stooq.com/q/l/?s=10us.b&f=sd2t2ohlcv&h&e=csv',
            'https://stooq.com/q/l/?s=tnx.cboe&f=sd2t2ohlcv&h&e=csv',
            'https://stooq.com/q/l/?s=%5Etnx&f=sd2t2ohlcv&h&e=csv',
        ];
        for (const url of urls) {
            try {
                const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
                if (!r.ok) continue;
                const text = await r.text();
                const lines = text.trim().split('\n');
                if (lines.length < 2) continue;
                const parts = lines[1].split(',');
                const close = parseFloat(parts[6]);
                const open  = parseFloat(parts[3]);
                if (isNaN(close) || close <= 0) continue;
                const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
                return { value: close, change: changePct };
            } catch { /* try next */ }
        }
        return null;
    }

    // ── Format helpers ────────────────────────────────────────────────────────
    function fmtB(n) {
        if (!n) return '—';
        if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
        if (n >= 1e9)  return '$' + (n / 1e9).toFixed(1) + 'B';
        return '$' + n.toLocaleString();
    }
    function fmtK(n) {
        if (!n) return '—';
        if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
        return '$' + n.toFixed(2);
    }
    function fmtPct(n, decimals = 2) {
        if (n == null) return '—';
        const s = Number(n).toFixed(decimals);
        return (n >= 0 ? '+' : '') + s + '%';
    }
    function chgColor(n) {
        return n >= 0 ? '#4ade80' : '#f87171';
    }
    // Arrow indicator for change direction
    function chgArrow(n) {
        if (n == null || n === 0) return '';
        return n > 0 ? '▲' : '▼';
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function _render() {
        const el = document.getElementById('macroBar');
        if (!el) return;

        const fng    = _data.fng    || {};
        const global = _data.global || {};
        const prices = _data.prices || {};
        const dxy    = _data.dxy    || null;
        const us10y  = _data.us10y  || null;

        const fngMeta = FNG_LABELS[fng.label] || { color: '#94a3b8', icon: '❓' };
        const lastUpdate = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        el.innerHTML = `
<div class="mbar-inner">

  <!-- Fear & Greed -->
  <div class="mbar-item mbar-fng" title="Crypto Fear & Greed Index — ${fng.label || '—'}">
    <span class="mbar-label">F&G Index</span>
    <span class="mbar-val" style="color:${fngMeta.color}">
      ${fngMeta.icon} <strong>${fng.value ?? '—'}</strong>
      <span class="mbar-sub">${fng.label || '—'}</span>
    </span>
  </div>

  <div class="mbar-sep"></div>

  <!-- BTC Price -->
  <div class="mbar-item" title="Bitcoin price & 24h change">
    <span class="mbar-label">BTC</span>
    <span class="mbar-val">
      <strong>${prices.btcPrice ? fmtK(prices.btcPrice) : '—'}</strong>
      <span class="mbar-chg" style="color:${chgColor(prices.btcChange)}">${fmtPct(prices.btcChange, 1)}</span>
    </span>
  </div>

  <div class="mbar-sep"></div>

  <!-- ETH Price -->
  <div class="mbar-item" title="Ethereum price & 24h change">
    <span class="mbar-label">ETH</span>
    <span class="mbar-val">
      <strong>${prices.ethPrice ? fmtK(prices.ethPrice) : '—'}</strong>
      <span class="mbar-chg" style="color:${chgColor(prices.ethChange)}">${fmtPct(prices.ethChange, 1)}</span>
    </span>
  </div>

  <div class="mbar-sep"></div>

  <!-- Total Market Cap -->
  <div class="mbar-item" title="Total crypto market cap & 24h change">
    <span class="mbar-label">Total MCap</span>
    <span class="mbar-val">
      <strong>${fmtB(global.totalMcap)}</strong>
      <span class="mbar-chg" style="color:${chgColor(global.mcapChange24h)}">${fmtPct(global.mcapChange24h, 1)}</span>
    </span>
  </div>

  <div class="mbar-sep"></div>

  <!-- BTC Dominance -->
  <div class="mbar-item" title="Bitcoin market dominance">
    <span class="mbar-label">BTC Dom.</span>
    <span class="mbar-val">
      <strong>${global.btcDominance ? global.btcDominance.toFixed(1) + '%' : '—'}</strong>
    </span>
  </div>

  <div class="mbar-sep"></div>

  <!-- ETH Dominance -->
  <div class="mbar-item" title="Ethereum market dominance">
    <span class="mbar-label">ETH Dom.</span>
    <span class="mbar-val">
      <strong>${global.ethDominance ? global.ethDominance.toFixed(1) + '%' : '—'}</strong>
    </span>
  </div>

  <div class="mbar-sep"></div>

  <!-- Total Volume 24h -->
  <div class="mbar-item" title="Total 24h trading volume">
    <span class="mbar-label">Vol 24h</span>
    <span class="mbar-val"><strong>${fmtB(global.totalVol24h)}</strong></span>
  </div>

  <div class="mbar-sep"></div>

  <!-- Active Cryptos -->
  <div class="mbar-item" title="Total active cryptocurrencies">
    <span class="mbar-label">Aktif</span>
    <span class="mbar-val"><strong>${global.activeCryptos ? global.activeCryptos.toLocaleString() : '—'}</strong> coins</span>
  </div>

  <div class="mbar-sep mbar-sep--macro"></div>

  <!-- DXY Index -->
  <div class="mbar-item mbar-macro-item" title="US Dollar Index (DXY) — indikator kekuatan USD global. Naik = USD menguat, tekanan pada aset risiko.">
    <span class="mbar-label">DXY</span>
    <span class="mbar-val">
      ${dxy
        ? `<strong>${dxy.value.toFixed(2)}</strong>
           <span class="mbar-chg" style="color:${chgColor(dxy.change)}">
             ${chgArrow(dxy.change)} ${fmtPct(dxy.change, 2)}
           </span>`
        : `<strong class="mbar-na">—</strong>`
      }
    </span>
    <span class="mbar-macro-hint">💵 USD Strength</span>
  </div>

  <div class="mbar-sep"></div>

  <!-- US 10Y Treasury Yield -->
  <div class="mbar-item mbar-macro-item" title="US 10-Year Treasury Yield — indikator risk appetite global. Naik = risk-off, tekanan pada saham &amp; kripto.">
    <span class="mbar-label">US 10Y</span>
    <span class="mbar-val">
      ${us10y
        ? `<strong>${us10y.value.toFixed(3)}%</strong>
           <span class="mbar-chg" style="color:${chgColor(us10y.change)}">
             ${chgArrow(us10y.change)} ${fmtPct(us10y.change, 2)}
           </span>`
        : `<strong class="mbar-na">—</strong>`
      }
    </span>
    <span class="mbar-macro-hint">🏦 Treasury Yield</span>
  </div>

  <!-- Refresh indicator -->
  <div class="mbar-refresh" title="Terakhir diperbarui — otomatis refresh tiap 5 menit">
    <span class="mbar-clock">🕐 ${lastUpdate}</span>
    <button class="mbar-refresh-btn" onclick="macroBar.refresh()" title="Refresh sekarang">↻</button>
  </div>

</div>`;
    }

    // ── Render skeleton while loading ─────────────────────────────────────────
    function _renderLoading() {
        const el = document.getElementById('macroBar');
        if (!el) return;
        el.innerHTML = `<div class="mbar-inner mbar-loading">
            <span class="g-spinner" style="width:14px;height:14px;border-width:2px"></span>
            <span style="font-size:0.75rem;color:#64748b;margin-left:8px">Memuat data makro…</span>
        </div>`;
    }

    // ── Main fetch + render cycle ─────────────────────────────────────────────
    async function refresh() {
        _renderLoading();
        // Crypto data & macro indicators fetched in parallel
        // DXY / US10Y may fail gracefully if stooq is blocked — shows '—'
        const [fng, global, prices, dxy, us10y] = await Promise.all([
            _fetchFNG(),
            _fetchGlobal(),
            _fetchBTCPrice(),
            _fetchDXY(),
            _fetchUS10Y(),
        ]);
        if (fng)    _data.fng    = fng;
        if (global) _data.global = global;
        if (prices) _data.prices = prices;
        // Always update macro — even null clears stale data gracefully
        _data.dxy   = dxy;
        _data.us10y = us10y;
        _render();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        refresh();
        _timer = setInterval(refresh, REFRESH_MS);
        console.log('✅ Macro Bar v2 initialized — F&G + Crypto + DXY + US10Y, refresh every 5 min');
    }

    return { init, refresh };
})();

document.addEventListener('DOMContentLoaded', () => macroBar.init());
