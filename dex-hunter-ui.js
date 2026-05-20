// ══════════════════════════════════════════════════════════════════════════════
//  dex-hunter-ui.js  — AI-Powered DEX Intelligence Platform
//  Tabs: 🔬 Trenches | 🤖 AI Signal | 🐋 Whale | 🧠 Narratives | 📌 Portfolio
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const dexHunterUI = (() => {
    const PROXY   = 'http://127.0.0.1:3001';
    const DEX_P   = 'http://127.0.0.1:3004';

    let _tab        = 'trenches';
    let _pollTimer  = null;
    let _trenchTimer= null;
    let _aiPending  = false;
    let _trenchData = [];
    let _trenchFilter = 'all';

    // ── Helpers ───────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);

    const fmtUsd = n => {
        if (!n || isNaN(n)) return '$0';
        if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
        if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
        return '$' + n.toFixed(0);
    };

    const fmtPrice = p => {
        if (!p || p === 0) return '—';
        if (p < 0.000001) return '$' + p.toExponential(3);
        if (p < 0.001)    return '$' + p.toFixed(8);
        if (p < 1)        return '$' + p.toFixed(6);
        return '$' + p.toFixed(4);
    };

    const fmtPct = n => {
        if (n == null || isNaN(n)) return '<span style="color:#475569">—</span>';
        const c = n > 0 ? '#4ade80' : n < 0 ? '#f87171' : '#64748b';
        return `<span style="color:${c};font-weight:700">${n >= 0 ? '+' : ''}${n.toFixed(1)}%</span>`;
    };

    const fmtPnl = n => {
        if (n == null || isNaN(n)) return '<span style="color:#475569">—</span>';
        const c = n > 0 ? '#4ade80' : n < 0 ? '#f87171' : '#64748b';
        return `<span style="color:${c};font-weight:700">${n >= 0 ? '+$' : '-$'}${Math.abs(n).toFixed(2)}</span>`;
    };

    const fmtAge = h => {
        if (h < 1) return Math.round(h * 60) + 'm';
        if (h < 24) return h.toFixed(1) + 'h';
        return Math.floor(h / 24) + 'd';
    };

    const fmtTime = iso => iso ? new Date(iso).toLocaleString('id-ID', {
        timeZone:'Asia/Jakarta', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';

    const fmtDur = (a, b) => {
        const ms  = new Date(b || Date.now()).getTime() - new Date(a).getTime();
        const min = Math.floor(ms / 60000);
        if (min < 60)   return min + 'm';
        if (min < 1440) return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
        return Math.floor(min / 1440) + 'd';
    };

    const scoreColor = s => s >= 75 ? '#4ade80' : s >= 55 ? '#facc15' : s >= 35 ? '#fb923c' : '#f87171';
    const scoreBg    = s => s >= 75 ? '#14532d' : s >= 55 ? '#422006' : s >= 35 ? '#431407' : '#450a0a';
    const rugColor   = r => r === 'LOW' ? '#4ade80' : r === 'MEDIUM' ? '#facc15' : '#f87171';
    const rugBgC     = r => r === 'LOW' ? '#14532d' : r === 'MEDIUM' ? '#422006' : '#450a0a';
    const sigColor   = s => ({ STRONG_BUY:'#4ade80', BUY:'#86efac', WATCH:'#60a5fa', NEUTRAL:'#94a3b8', AVOID:'#f87171', SELL:'#ef4444' }[s] || '#94a3b8');
    const sigBg      = s => ({ STRONG_BUY:'#14532d', BUY:'#1a3a1a', WATCH:'#1e3a5f', NEUTRAL:'#1e293b', AVOID:'#450a0a', SELL:'#3f1515' }[s] || '#1e293b');

    const confBar = (conf, color = '#4ade80') =>
        `<div style="background:#1e293b;border-radius:4px;height:6px;width:100%;margin-top:4px">
            <div style="background:${color};border-radius:4px;height:6px;width:${conf}%;transition:width .4s"></div></div>`;

    const dimBar = (val, max, color) => {
        const pct = Math.max(0, Math.min(100, (val / max) * 100));
        return `<div style="background:#0f172a;border-radius:3px;height:4px;width:60px;display:inline-block;vertical-align:middle;margin-left:4px">
            <div style="background:${color};border-radius:3px;height:4px;width:${pct}%"></div></div>`;
    };

    // ── Shell render ──────────────────────────────────────────────────────────
    function renderShell() {
        const panel = $('dex-hunter-panel');
        if (!panel) return;
        panel.innerHTML = `
<style>
.dhi-wrap{padding:16px 20px;font-family:'Inter',system-ui,sans-serif;color:#e2e8f0}
.dhi-topbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.dhi-title{font-size:20px;font-weight:800;background:linear-gradient(135deg,#60a5fa,#a78bfa,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.dhi-badge{padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700}
.dhi-kpi-row{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:14px}
.dhi-kpi{background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:11px 13px}
.dhi-kpi-lbl{font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.dhi-kpi-val{font-size:18px;font-weight:800;color:#e2e8f0}
.dhi-kpi-sub{font-size:9px;color:#64748b;margin-top:2px}
.dhi-tabs{display:flex;gap:2px;background:#0a0f1a;border-radius:10px;padding:4px;margin-bottom:16px;flex-wrap:wrap;border:1px solid #1e293b}
.dhi-tab{flex:1;min-width:90px;padding:8px 10px;border-radius:8px;border:none;background:transparent;color:#64748b;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;text-align:center}
.dhi-tab:hover{color:#94a3b8;background:#111827}
.dhi-tab.active{background:linear-gradient(135deg,#1e3a5f,#1a2a3f);color:#60a5fa;border:1px solid #2563eb33}
.dhi-tc{display:none}.dhi-tc.active{display:block}
.dhi-ctrl-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center}
.dhi-btn{padding:7px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.dhi-btn:hover{opacity:.82;transform:translateY(-1px)}
.dhi-btn-primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff}
.dhi-btn-ai{background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff}
.dhi-btn-danger{background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff}
.dhi-btn-ghost{background:transparent;border:1px solid #334155;color:#94a3b8}
.dhi-btn-green{background:linear-gradient(135deg,#16a34a,#15803d);color:#fff}
.dhi-btn-sm{padding:4px 10px;font-size:11px;border-radius:5px}
.dhi-tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:10px}
.dhi-tcard{background:#0a1628;border:1px solid #1e293b;border-radius:12px;padding:14px;transition:all .2s;position:relative;overflow:hidden}
.dhi-tcard::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--cc,#2563eb),transparent)}
.dhi-tcard:hover{border-color:#334155;transform:translateY(-2px);box-shadow:0 8px 24px #00000066}
.dhi-score-badge{display:inline-block;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:800}
.dhi-dims-row{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin-bottom:8px}
.dhi-dim-item{font-size:10px;color:#475569}.dhi-dim-item span{color:#94a3b8}
.dhi-tc-stats{display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;margin-bottom:8px}
.dhi-tc-stat{color:#64748b}.dhi-tc-stat b{color:#94a3b8}
.dhi-tc-actions{display:flex;gap:6px;flex-wrap:wrap}
.dhi-age-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;background:#1e3a5f;color:#60a5fa}
.dhi-rug-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px}
.dhi-ai-panel{background:#0a0f1a;border:1px solid #1e3a5f;border-radius:14px;padding:18px}
.dhi-ai-search{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.dhi-ai-input{flex:1;min-width:160px;background:#111827;border:1px solid #334155;border-radius:8px;padding:9px 14px;color:#e2e8f0;font-size:13px;outline:none}
.dhi-ai-input:focus{border-color:#3b82f6}
.dhi-signal-box{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:12px}
.dhi-signal-header{display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap}
.dhi-signal-main{display:inline-block;padding:6px 16px;border-radius:8px;font-size:16px;font-weight:800;letter-spacing:.05em}
.dhi-level-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:12px}
.dhi-level-card{background:#111827;border:1px solid #1e293b;border-radius:8px;padding:10px;text-align:center}
.dhi-level-lbl{font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}
.dhi-level-val{font-size:13px;font-weight:800}
.dhi-reasons{background:#111827;border-radius:8px;padding:12px;list-style:none;margin:0}
.dhi-reasons li{padding:4px 0;font-size:12px;color:#94a3b8;border-bottom:1px solid #1e293b22}
.dhi-reasons li:last-child{border-bottom:none}
.dhi-reasons li::before{content:'→ ';color:#3b82f6}
.dhi-whale-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.dhi-wcard{background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:12px}
.dhi-wcard.inflow{border-left:3px solid #f87171}
.dhi-wcard.outflow{border-left:3px solid #4ade80}
.dhi-wcard.transfer{border-left:3px solid #60a5fa}
.dhi-wscore-row{display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.dhi-wscore{flex:1;min-width:110px;background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:12px;text-align:center}
.dhi-wscore-val{font-size:28px;font-weight:800;margin-bottom:4px}
.dhi-narr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}
.dhi-ncard{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:14px}
.dhi-ncard-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.dhi-ncard-name{font-size:14px;font-weight:700;color:#e2e8f0}
.dhi-nstrength{display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700}
.dhi-ncoins{display:flex;flex-wrap:wrap;gap:4px}
.dhi-ncoin{background:#1e293b;border-radius:5px;padding:2px 7px;font-size:10px;color:#94a3b8}
.dhi-ncoin.pos{background:#14532d33;color:#4ade80}.dhi-ncoin.neg{background:#45032233;color:#f87171}
.dhi-tbl-wrap{overflow-x:auto}
.dhi-tbl{width:100%;border-collapse:collapse;font-size:12px}
.dhi-tbl th{background:#0a0f1a;color:#475569;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #1e293b;white-space:nowrap}
.dhi-tbl td{padding:9px 10px;border-bottom:1px solid #0d1320;color:#cbd5e1;vertical-align:middle;white-space:nowrap}
.dhi-tbl tbody tr:hover{background:#0d1a2d}
.dhi-loading{text-align:center;padding:40px 20px;color:#475569;font-size:13px}
.dhi-spinner{width:28px;height:28px;border:2px solid #1e293b;border-top-color:#3b82f6;border-radius:50%;animation:dhi-spin .7s linear infinite;margin:0 auto 12px}
@keyframes dhi-spin{to{transform:rotate(360deg)}}
.dhi-error{background:#1f0a0a;border:1px solid #7f1d1d;border-radius:8px;padding:12px;color:#f87171;font-size:12px;margin:8px 0}
</style>
<div class="dhi-wrap">
  <div class="dhi-topbar">
    <span class="dhi-title">🎯 DEX Hunter AI</span>
    <span id="dhi-proxy-badge" class="dhi-badge" style="background:#1e293b;color:#64748b">⚡ checking…</span>
    <span id="dhi-mode-badge" class="dhi-badge" style="display:none;background:#1a3a1a;color:#4ade80;border:1px solid #16a34a">📄 DRY RUN</span>
  </div>

  <div class="dhi-kpi-row">
    <div class="dhi-kpi"><div class="dhi-kpi-lbl">Total P&L</div><div class="dhi-kpi-val" id="dhi-kpi-pnl">—</div><div class="dhi-kpi-sub">All time</div></div>
    <div class="dhi-kpi"><div class="dhi-kpi-lbl">Daily P&L</div><div class="dhi-kpi-val" id="dhi-kpi-dpnl">—</div><div class="dhi-kpi-sub">Today</div></div>
    <div class="dhi-kpi"><div class="dhi-kpi-lbl">Open Pos</div><div class="dhi-kpi-val" id="dhi-kpi-open">—</div><div class="dhi-kpi-sub">Active</div></div>
    <div class="dhi-kpi"><div class="dhi-kpi-lbl">Win Rate</div><div class="dhi-kpi-val" id="dhi-kpi-wr">—</div><div class="dhi-kpi-sub" id="dhi-kpi-wl">—W/—L</div></div>
    <div class="dhi-kpi"><div class="dhi-kpi-lbl">Best Trade</div><div class="dhi-kpi-val" id="dhi-kpi-best">—</div><div class="dhi-kpi-sub">Max profit</div></div>
    <div class="dhi-kpi"><div class="dhi-kpi-lbl">Tokens Scanned</div><div class="dhi-kpi-val" id="dhi-kpi-scanned">—</div><div class="dhi-kpi-sub">Trenches</div></div>
  </div>

  <div class="dhi-tabs">
    <button class="dhi-tab active" data-t="trenches"  onclick="dexHunterUI._switchTab('trenches')">🔬 Trenches</button>
    <button class="dhi-tab"        data-t="ai-signal" onclick="dexHunterUI._switchTab('ai-signal')">🤖 AI Signal</button>
    <button class="dhi-tab"        data-t="whale"     onclick="dexHunterUI._switchTab('whale')">🐋 Whale Alert</button>
    <button class="dhi-tab"        data-t="narratives"onclick="dexHunterUI._switchTab('narratives')">🧠 Narratives</button>
    <button class="dhi-tab"        data-t="portfolio" onclick="dexHunterUI._switchTab('portfolio')">📌 Portfolio</button>
  </div>

  <!-- TRENCHES -->
  <div class="dhi-tc active" id="dhi-t-trenches">
    <div class="dhi-ctrl-row">
      <button class="dhi-btn dhi-btn-primary" onclick="dexHunterUI.loadTrenches(true)">🔄 Refresh</button>
      <button class="dhi-btn dhi-btn-green"   onclick="dexHunterUI.loadTrenches(true)">🔍 Scan Now</button>
      <button class="dhi-btn dhi-btn-ghost dhi-btn-sm" id="dhi-f-all"   onclick="dexHunterUI._filterTrenches('all')"  style="border-color:#3b82f6;color:#60a5fa">All</button>
      <button class="dhi-btn dhi-btn-ghost dhi-btn-sm" id="dhi-f-hot"   onclick="dexHunterUI._filterTrenches('hot')">🔥 Hot ≥75</button>
      <button class="dhi-btn dhi-btn-ghost dhi-btn-sm" id="dhi-f-fresh" onclick="dexHunterUI._filterTrenches('fresh')">🆕 Fresh &lt;2h</button>
      <button class="dhi-btn dhi-btn-ghost dhi-btn-sm" id="dhi-f-safe"  onclick="dexHunterUI._filterTrenches('safe')">🛡 Low Rug</button>
      <span id="dhi-trench-meta" style="font-size:11px;color:#475569"></span>
    </div>
    <div id="dhi-trench-body"><div class="dhi-loading"><div class="dhi-spinner"></div>Loading trenches…</div></div>
  </div>

  <!-- AI SIGNAL -->
  <div class="dhi-tc" id="dhi-t-ai-signal">
    <div class="dhi-ai-panel">
      <div style="margin-bottom:14px">
        <div style="font-size:14px;font-weight:700;color:#a78bfa;margin-bottom:4px">🤖 AI Signal Engine — LLaMA 3.3 70B via Groq</div>
        <div style="font-size:12px;color:#64748b">Pilih token di Trenches → klik <b>🤖 AI Analyze</b>, atau ketik simbol di bawah.</div>
      </div>
      <div class="dhi-ai-search">
        <input id="dhi-ai-sym" class="dhi-ai-input" placeholder="Simbol token (contoh: BONK, WIF, PEPE)…" />
        <input id="dhi-ai-key" class="dhi-ai-input" style="max-width:230px" placeholder="Groq API Key (opsional jika di .env)" />
        <button class="dhi-btn dhi-btn-ai" onclick="dexHunterUI.analyzeSymbol()">🤖 Analyze</button>
      </div>
      <div id="dhi-ai-result">
        <div style="text-align:center;padding:30px;color:#475569;font-size:13px">
          Pilih token dari Trenches atau ketik simbol di atas untuk mendapatkan analisa AI lengkap.<br>
          <span style="font-size:11px">Entry · TP1/2/3 · SL · Confidence · Reasoning · Risk</span>
        </div>
      </div>
    </div>
  </div>

  <!-- WHALE -->
  <div class="dhi-tc" id="dhi-t-whale">
    <div class="dhi-ctrl-row">
      <button class="dhi-btn dhi-btn-primary" onclick="dexHunterUI.loadWhale()">🔄 Refresh</button>
      <span id="dhi-whale-meta" style="font-size:11px;color:#475569"></span>
    </div>
    <div id="dhi-whale-body"><div class="dhi-loading"><div class="dhi-spinner"></div>Loading…</div></div>
  </div>

  <!-- NARRATIVES -->
  <div class="dhi-tc" id="dhi-t-narratives">
    <div class="dhi-ctrl-row">
      <button class="dhi-btn dhi-btn-primary" onclick="dexHunterUI.loadNarratives()">🔄 Refresh</button>
      <span id="dhi-narr-meta" style="font-size:11px;color:#475569"></span>
    </div>
    <div id="dhi-narr-body"><div class="dhi-loading"><div class="dhi-spinner"></div>Detecting narratives…</div></div>
  </div>

  <!-- PORTFOLIO -->
  <div class="dhi-tc" id="dhi-t-portfolio">
    <div class="dhi-ctrl-row">
      <button class="dhi-btn dhi-btn-primary" onclick="dexHunterUI.fetchState()">🔄 Refresh</button>
      <button class="dhi-btn dhi-btn-danger" onclick="dexHunterUI.closeAll()">🛑 Close All</button>
    </div>
    <div style="font-size:11px;color:#475569;margin-bottom:10px;background:#111827;padding:8px 12px;border-radius:6px;line-height:1.9">
      Bot: <code>node memecoin-hunter.js</code> &nbsp;|&nbsp;
      Proxy: <code>node dex-trader-proxy.js</code> (port 3004) &nbsp;|&nbsp;
      Live: set <code>SOLANA_WALLET_ADDRESS</code> + <code>SOLANA_PRIVATE_KEY</code> di <code>.env</code>
    </div>
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin:12px 0 6px">📌 Open Positions</div>
    <div class="dhi-tbl-wrap">
      <table class="dhi-tbl">
        <thead><tr><th>Token</th><th>Entry</th><th>Now</th><th>P&L%</th><th>Size</th><th>SL</th><th>TP1/2/3</th><th>Score</th><th>Age</th><th>Action</th></tr></thead>
        <tbody id="dhi-pos-body"><tr><td colspan="10" class="dhi-loading">Jalankan dex-trader-proxy.js (port 3004)</td></tr></tbody>
      </table>
    </div>
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin:16px 0 6px">📜 Trade History</div>
    <div class="dhi-tbl-wrap">
      <table class="dhi-tbl">
        <thead><tr><th>Token</th><th>Opened</th><th>Closed</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Dur</th><th>Reason</th><th>Score</th></tr></thead>
        <tbody id="dhi-hist-body"><tr><td colspan="9" class="dhi-loading">Belum ada riwayat</td></tr></tbody>
      </table>
    </div>
  </div>
</div>`;

        loadTrenches();
        fetchState();
    }

    // ── Tab switcher ──────────────────────────────────────────────────────────
    function _switchTab(t) {
        _tab = t;
        document.querySelectorAll('.dhi-tab').forEach(b => b.classList.toggle('active', b.dataset.t === t));
        document.querySelectorAll('.dhi-tc').forEach(c => c.classList.toggle('active', c.id === `dhi-t-${t}`));
        if (t === 'whale')      loadWhale();
        if (t === 'narratives') loadNarratives();
        if (t === 'portfolio')  fetchState();
        if (t === 'trenches')   loadTrenches();
    }

    // ── Trenches ──────────────────────────────────────────────────────────────
    async function loadTrenches(force = false) {
        const body = $('dhi-trench-body');
        if (!body) return;
        if (!force && _trenchData.length) { renderTrenches(_trenchData); return; }

        body.innerHTML = '<div class="dhi-loading"><div class="dhi-spinner"></div>Scanning trenches (200 pairs)…</div>';
        try {
            const r = await fetch(`${PROXY}/api/dex/trenches`, { signal: AbortSignal.timeout(35_000) });
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || 'API error');
            _trenchData = d.tokens || [];
            const sc = $('dhi-kpi-scanned'); if (sc) sc.textContent = d.count || 0;
            const mt = $('dhi-trench-meta');
            if (mt) mt.textContent = `${d.count} tokens · ${new Date(d.fetchedAt).toLocaleTimeString('id-ID', { timeZone:'Asia/Jakarta' })} WIB`;
            renderTrenches(_trenchData);
        } catch (e) {
            body.innerHTML = `<div class="dhi-error">❌ ${e.message}</div>`;
        }
    }

    function _filterTrenches(f) {
        _trenchFilter = f;
        ['all','hot','fresh','safe'].forEach(id => {
            const el = $(`dhi-f-${id}`);
            if (el) { el.style.borderColor = id === f ? '#3b82f6' : '#334155'; el.style.color = id === f ? '#60a5fa' : '#94a3b8'; }
        });
        renderTrenches(_trenchData);
    }

    function renderTrenches(tokens) {
        const body = $('dhi-trench-body');
        if (!body) return;
        let list = tokens;
        if (_trenchFilter === 'hot')   list = tokens.filter(t => t.score >= 75);
        if (_trenchFilter === 'fresh') list = tokens.filter(t => t.ageH < 2);
        if (_trenchFilter === 'safe')  list = tokens.filter(t => t.rugProb === 'LOW');

        if (!list.length) {
            body.innerHTML = '<div class="dhi-loading">Tidak ada token. Coba filter lain atau refresh.</div>';
            return;
        }

        const html = list.slice(0, 60).map(t => {
            const d   = t.dims || {};
            const sc  = t.score;
            const col = scoreColor(sc);
            const bg  = scoreBg(sc);
            const rc  = rugColor(t.rugProb);
            const rb  = rugBgC(t.rugProb);
            const r5  = t.sells5m > 0 ? (t.buys5m / t.sells5m).toFixed(1) : t.buys5m > 0 ? '∞' : '1.0';
            const r1  = t.sells1h > 0 ? (t.buys1h / t.sells1h).toFixed(1) : '1.0';

            // Escape token data for onclick
            const td = encodeURIComponent(JSON.stringify(t));

            return `<div class="dhi-tcard" style="--cc:${col}">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
    <div>
      <div style="font-size:16px;font-weight:800;color:#e2e8f0">${t.symbol}
        <span class="dhi-age-badge">${fmtAge(t.ageH)}</span>
        <span class="dhi-rug-badge" style="background:${rb};color:${rc}">RUG:${t.rugProb}</span>
      </div>
      <div style="font-size:10px;color:#475569;margin-top:1px">${(t.name || '').slice(0,32)}</div>
    </div>
    <div style="text-align:right">
      <span class="dhi-score-badge" style="background:${bg};color:${col}">${sc}</span>
      <div style="font-size:9px;color:#475569;margin-top:2px">/ 100</div>
    </div>
  </div>

  <div style="display:flex;gap:6px;align-items:baseline;margin-bottom:8px;flex-wrap:wrap">
    <span style="font-size:13px;color:#94a3b8">${fmtPrice(t.price)}</span>
    ${fmtPct(t.chg5m)}<span style="font-size:10px;color:#475569">5m</span>
    ${fmtPct(t.chg1h)}<span style="font-size:10px;color:#475569">1h</span>
    ${fmtPct(t.chg24h)}<span style="font-size:10px;color:#475569">24h</span>
  </div>

  <div class="dhi-dims-row">
    <div class="dhi-dim-item">Momentum <span>${d.momentum||0}/20</span>${dimBar(d.momentum||0,20,'#4ade80')}</div>
    <div class="dhi-dim-item">Volume <span>${d.volume||0}/15</span>${dimBar(d.volume||0,15,'#60a5fa')}</div>
    <div class="dhi-dim-item">Buy Press <span>${d.buyPressure||0}/15</span>${dimBar(d.buyPressure||0,15,'#a78bfa')}</div>
    <div class="dhi-dim-item">Age Score <span>${d.age||0}/12</span>${dimBar(d.age||0,12,'#facc15')}</div>
    <div class="dhi-dim-item">FDV Opp <span>${d.fdv||0}/10</span>${dimBar(d.fdv||0,10,'#34d399')}</div>
    <div class="dhi-dim-item">Liquidity <span>${d.liquidity||0}/10</span>${dimBar(d.liquidity||0,10,'#f472b6')}</div>
  </div>

  <div class="dhi-tc-stats">
    <div class="dhi-tc-stat">📊 Vol24h <b>${fmtUsd(t.vol24h)}</b></div>
    <div class="dhi-tc-stat">💧 Liq <b>${fmtUsd(t.liq)}</b></div>
    <div class="dhi-tc-stat">💰 FDV <b>${t.fdv > 0 ? fmtUsd(t.fdv) : '?'}</b></div>
    <div class="dhi-tc-stat">🔄 Txns <b>${t.txns24h}</b></div>
    <div class="dhi-tc-stat">5m B/S <b>${r5}x</b></div>
    <div class="dhi-tc-stat">1h B/S <b>${r1}x</b></div>
  </div>

  <div class="dhi-tc-actions">
    <button class="dhi-btn dhi-btn-ai dhi-btn-sm"
      onclick="dexHunterUI.analyzeToken(decodeURIComponent('${td}'))">🤖 AI Analyze</button>
    <button class="dhi-btn dhi-btn-green dhi-btn-sm"
      onclick="dexHunterUI.dryBuy('${t.mint}','${t.symbol}','${t.pairAddress}',${t.price},${t.score})">🟢 DRY BUY</button>
    <a href="${t.url}" target="_blank" class="dhi-btn dhi-btn-ghost dhi-btn-sm">DSC↗</a>
  </div>
</div>`;
        }).join('');

        body.innerHTML = `<div class="dhi-tgrid">${html}</div>`;
    }

    // ── AI Signal ─────────────────────────────────────────────────────────────
    function analyzeToken(tokenJson) {
        let t;
        try { t = typeof tokenJson === 'string' ? JSON.parse(tokenJson) : tokenJson; } catch { return alert('Parse error'); }
        const inp = $('dhi-ai-sym'); if (inp) inp.value = t.symbol;
        _switchTab('ai-signal');
        _runAIAnalysis(t);
    }

    async function analyzeSymbol() {
        const sym = ($('dhi-ai-sym')?.value || '').trim().toUpperCase();
        if (!sym) return alert('Masukkan simbol token.');
        const found = _trenchData.find(t => t.symbol.toUpperCase() === sym);
        _runAIAnalysis(found || { symbol: sym, name: sym, price: 0, chg24h: 0, chg1h: 0, chg5m: 0,
            vol24h: 0, vol1h: 0, liq: 0, fdv: 0, rugProb: 'UNKNOWN', ageH: 0,
            buys5m: 0, sells5m: 0, buys1h: 0, sells1h: 0, txns24h: 0, score: 0 });
    }

    async function _runAIAnalysis(t) {
        if (_aiPending) return;
        _aiPending = true;
        const el = $('dhi-ai-result');
        if (!el) { _aiPending = false; return; }

        el.innerHTML = `<div class="dhi-loading"><div class="dhi-spinner"></div>🤖 Menganalisa <b>${t.symbol}</b> dengan LLaMA 3.3 70B…<br><span style="font-size:11px">ETA ~5-15 detik</span></div>`;

        try {
            const apiKey = $('dhi-ai-key')?.value?.trim() || '';
            const r = await fetch(`${PROXY}/api/dex/ai-signal`, {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ ...t, apiKey: apiKey || undefined }),
                signal: AbortSignal.timeout(40_000),
            });
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || 'AI error');
            renderAISignal(t, d.analysis, d.generatedAt, d.cached || false);
        } catch (e) {
            el.innerHTML = `<div class="dhi-error">❌ ${e.message}</div>
            <div style="font-size:11px;color:#475569;margin-top:8px">
              Set <code>GROQ_API_KEY</code> di <code>.env</code> atau paste di field di atas.<br>
              Free key: <a href="https://console.groq.com" target="_blank" style="color:#60a5fa">console.groq.com</a>
            </div>`;
        } finally { _aiPending = false; }
    }

    function renderAISignal(token, a, generatedAt, cached) {
        const el = $('dhi-ai-result');
        if (!el || !a) return;

        const sig    = a.signal || 'NEUTRAL';
        const conf   = a.confidence || 0;
        const sc     = sigColor(sig);
        const sb     = sigBg(sig);
        const rc     = { LOW:'#4ade80', MEDIUM:'#facc15', HIGH:'#fb923c', EXTREME:'#ef4444' }[a.riskLevel] || '#94a3b8';

        const entry = a.entry || { low: token.price * 0.97, high: token.price * 1.03 };
        const tp1   = a.tp1 || token.price * 1.5;
        const tp2   = a.tp2 || token.price * 2.5;
        const tp3   = a.tp3 || token.price * 5.0;
        const sl    = a.sl  || token.price * 0.72;

        const mkList = arr => Array.isArray(arr) && arr.length
            ? arr.map(x => `<li>${x}</li>`).join('') : '<li>—</li>';

        el.innerHTML = `
<div class="dhi-signal-box">
  <div class="dhi-signal-header">
    <span class="dhi-signal-main" style="background:${sb};color:${sc};border:1px solid ${sc}44">${sig}${a.signalType ? ' · ' + a.signalType : ''}</span>
    <div>
      <div style="font-size:12px;color:#64748b">Confidence: <b style="color:${sc}">${conf}%</b></div>
      ${confBar(conf, sc)}
    </div>
    <div style="font-size:11px;color:#64748b">
      ${token.symbol} · ${fmtPrice(token.price)}<br>
      Risk: <b style="color:${rc}">${a.riskLevel || '?'}</b> · Hold: ${a.holdTime || '?'}
    </div>
    ${cached ? '<span style="font-size:10px;color:#475569;background:#1e293b;padding:2px 6px;border-radius:4px">cached</span>' : ''}
  </div>

  ${a.summary ? `<div style="font-size:13px;color:#94a3b8;margin-bottom:12px;padding:8px 12px;background:#111827;border-radius:6px;border-left:3px solid ${sc}">💡 ${a.summary}</div>` : ''}

  <div class="dhi-level-grid">
    <div class="dhi-level-card">
      <div class="dhi-level-lbl">Entry Zone</div>
      <div class="dhi-level-val" style="color:#60a5fa;font-size:11px">${fmtPrice(entry.low)} – ${fmtPrice(entry.high)}</div>
    </div>
    <div class="dhi-level-card">
      <div class="dhi-level-lbl">Stop Loss 🛑</div>
      <div class="dhi-level-val" style="color:#f87171">${fmtPrice(sl)}</div>
    </div>
    <div class="dhi-level-card" style="border-color:#4ade8022">
      <div class="dhi-level-lbl">TP 1 (+50%)</div>
      <div class="dhi-level-val" style="color:#4ade80">${fmtPrice(tp1)}</div>
    </div>
    <div class="dhi-level-card" style="border-color:#4ade8033">
      <div class="dhi-level-lbl">TP 2 (+150%)</div>
      <div class="dhi-level-val" style="color:#4ade80">${fmtPrice(tp2)}</div>
    </div>
    <div class="dhi-level-card" style="border-color:#34d39955">
      <div class="dhi-level-lbl">TP 3 🎯</div>
      <div class="dhi-level-val" style="color:#34d399">${fmtPrice(tp3)}</div>
    </div>
    <div class="dhi-level-card">
      <div class="dhi-level-lbl">Rug Risk</div>
      <div class="dhi-level-val" style="color:${rugColor(a.rugProbability)};font-size:13px">${a.rugProbability || '?'}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
    <div>
      <div style="font-size:11px;font-weight:700;color:#60a5fa;margin-bottom:6px">📋 Reasoning</div>
      <ul class="dhi-reasons">${mkList(a.reasoning)}</ul>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;color:#4ade80;margin-bottom:6px">⚡ Catalysts</div>
      <ul class="dhi-reasons">${mkList(a.catalysts)}</ul>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;color:#f87171;margin-bottom:6px">⚠️ Risks</div>
      <ul class="dhi-reasons">${mkList(a.risks)}</ul>
    </div>
  </div>
  <div style="font-size:10px;color:#334155;text-align:right">
    Generated ${generatedAt ? new Date(generatedAt).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'}) : '?'} WIB · ⚠️ Bukan financial advice. DYOR.
  </div>
</div>`;
    }

    // ── Whale Alert ───────────────────────────────────────────────────────────
    async function loadWhale() {
        const body = $('dhi-whale-body');
        if (!body) return;
        body.innerHTML = '<div class="dhi-loading"><div class="dhi-spinner"></div>Loading whale alerts…</div>';
        try {
            const r = await fetch(`${PROXY}/api/whale/alerts`, { signal: AbortSignal.timeout(15_000) });
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || 'API error');
            renderWhale(d.alerts || []);
            const mt = $('dhi-whale-meta'); if (mt) mt.textContent = `${d.count} alerts`;
        } catch (e) {
            body.innerHTML = `<div class="dhi-error">❌ ${e.message}</div>`;
        }
    }

    function renderWhale(alerts) {
        const body = $('dhi-whale-body');
        if (!body) return;
        if (!alerts.length) {
            body.innerHTML = '<div class="dhi-loading">Tidak ada whale alert. Set <code>WHALE_ALERT_KEY</code> di .env untuk data realtime.</div>';
            return;
        }

        let bull = 0, bear = 0;
        for (const a of alerts) {
            const v = a.usdValue || 0;
            if (a.direction === 'EXCHANGE_OUTFLOW') bull += v;
            else if (a.direction === 'EXCHANGE_INFLOW') bear += v;
        }
        const tot  = bull + bear || 1;
        const bp   = Math.round(bull / tot * 100);
        const berp = 100 - bp;

        const demoHtml = alerts.some(a => a.demo)
            ? `<div style="background:#1a1200;border:1px solid #854d0e;border-radius:6px;padding:8px 12px;font-size:11px;color:#fbbf24;margin-bottom:10px">⚠️ Demo data — set <code>WHALE_ALERT_KEY</code> di .env untuk realtime</div>` : '';

        const cards = alerts.slice(0, 30).map(a => {
            const dir = a.direction || '';
            const cls = dir === 'EXCHANGE_OUTFLOW' ? 'outflow' : dir === 'EXCHANGE_INFLOW' ? 'inflow' : 'transfer';
            return `<div class="dhi-wcard ${cls}">
  <div style="display:flex;justify-content:space-between;margin-bottom:6px">
    <span style="font-size:15px;font-weight:800;color:#e2e8f0">${a.icon||'🔵'} ${a.symbol||'?'} <span style="font-size:10px;color:#475569">${a.chain||''}</span></span>
    <span style="font-size:14px;font-weight:800;color:#e2e8f0">${fmtUsd(a.usdValue)}</span>
  </div>
  <div style="font-size:11px;color:#64748b;margin-bottom:4px">${a.label||''}</div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:#334155">
    <span>${a.fromAddr||'?'} → ${a.toAddr||'?'}</span>
    <span>${a.age||'?'}</span>
  </div>
</div>`;
        }).join('');

        body.innerHTML = `${demoHtml}
<div class="dhi-wscore-row">
  <div class="dhi-wscore">
    <div class="dhi-wscore-val" style="color:#4ade80">${bp}%</div>
    <div style="font-size:10px;color:#64748b;text-transform:uppercase">🟢 Bullish Score</div>
    <div style="font-size:10px;color:#475569;margin-top:2px">Exchange Outflow</div>
    ${confBar(bp,'#4ade80')}
  </div>
  <div class="dhi-wscore">
    <div class="dhi-wscore-val" style="color:#f87171">${berp}%</div>
    <div style="font-size:10px;color:#64748b;text-transform:uppercase">🔴 Bearish Score</div>
    <div style="font-size:10px;color:#475569;margin-top:2px">Exchange Inflow</div>
    ${confBar(berp,'#f87171')}
  </div>
  <div class="dhi-wscore" style="flex:2;text-align:left">
    <div style="font-size:11px;color:#64748b;margin-bottom:8px">Smart Money Flow</div>
    <div style="background:#0a0f1a;border-radius:6px;height:12px;overflow:hidden">
      <div style="height:12px;width:${bp}%;background:linear-gradient(90deg,#4ade80,#22c55e);transition:width .5s;border-radius:6px 0 0 6px"></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:#475569;margin-top:4px">
      <span>🟢 OUT ${fmtUsd(bull)}</span>
      <span>🔴 IN ${fmtUsd(bear)}</span>
    </div>
  </div>
</div>
<div class="dhi-whale-grid">${cards}</div>`;
    }

    // ── Narratives ────────────────────────────────────────────────────────────
    async function loadNarratives() {
        const body = $('dhi-narr-body');
        if (!body) return;
        body.innerHTML = '<div class="dhi-loading"><div class="dhi-spinner"></div>Detecting narratives dari top gainers…</div>';
        try {
            const r = await fetch(`${PROXY}/api/dex/narratives`, { signal: AbortSignal.timeout(20_000) });
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || 'API error');
            renderNarratives(d.narratives || [], d.ecosystemMap || {}, d.totalCoinsAnalyzed || 0);
            const mt = $('dhi-narr-meta');
            if (mt) mt.textContent = `${d.totalCoinsAnalyzed} coins · ${new Date(d.fetchedAt).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'})} WIB`;
        } catch (e) {
            body.innerHTML = `<div class="dhi-error">❌ ${e.message}</div>`;
        }
    }

    function renderNarratives(narrs, ecoMap, total) {
        const body = $('dhi-narr-body');
        if (!body) return;
        const maxScore = Math.max(...narrs.map(n => n.score), 1);

        const stStyle = s => ({
            STRONG:   { bg:'#14532d', color:'#4ade80', bar:'#4ade80' },
            MODERATE: { bg:'#422006', color:'#fb923c', bar:'#fb923c' },
            WEAK:     { bg:'#1e293b', color:'#64748b', bar:'#334155' },
        }[s] || { bg:'#1e293b', color:'#64748b', bar:'#334155' });

        const narrHtml = narrs.map(n => {
            const st  = stStyle(n.strength);
            const pct = Math.round((n.score / maxScore) * 100);
            const coins = n.coins.map(c =>
                `<span class="dhi-ncoin ${c.chg24h >= 0 ? 'pos' : 'neg'}" title="${c.name}">${c.symbol} ${c.chg24h >= 0 ? '+' : ''}${(c.chg24h||0).toFixed(0)}%</span>`
            ).join('');
            return `<div class="dhi-ncard">
  <div class="dhi-ncard-header">
    <span class="dhi-ncard-name">${n.momentum} ${n.name}</span>
    <span class="dhi-nstrength" style="background:${st.bg};color:${st.color}">${n.strength}</span>
  </div>
  <div style="background:#0a0f1a;border-radius:4px;height:6px;margin-bottom:6px">
    <div style="background:${st.bar};border-radius:4px;height:6px;width:${pct}%;transition:width .5s"></div>
  </div>
  <div style="font-size:10px;color:#475569;margin-bottom:6px">Score: ${n.score} · ${n.coins.length} coins</div>
  <div class="dhi-ncoins">${coins || '<span style="font-size:10px;color:#334155">no data</span>'}</div>
</div>`;
        }).join('');

        const ecoHtml = Object.entries(ecoMap).map(([sym, eco]) =>
            `<div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:10px;font-size:11px">
  <div style="font-weight:700;color:#60a5fa;margin-bottom:5px">🔗 ${sym} → ${eco.ecosystem}</div>
  <div style="display:flex;flex-wrap:wrap;gap:3px">
    ${eco.relatedCoins.map(c => `<span style="background:#1e293b;border-radius:4px;padding:1px 6px;color:#94a3b8;font-size:10px">${c}</span>`).join('')}
  </div>
</div>`).join('');

        body.innerHTML = `
<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">📊 Narrative Strength (${total} coins analyzed)</div>
<div class="dhi-narr-grid">${narrHtml}</div>
<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.07em;margin:18px 0 10px">🔗 Ecosystem Correlation</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px">${ecoHtml}</div>
<div style="font-size:11px;color:#334155;margin-top:10px">💡 Jika SOL/ETH/TON pump → lihat ecosystem coin terkait sebagai lagging play.</div>`;
    }

    // ── Portfolio ─────────────────────────────────────────────────────────────
    async function fetchState() {
        try {
            const r = await fetch(`${DEX_P}/state`, { signal: AbortSignal.timeout(4000) });
            if (!r.ok) throw new Error('offline');
            const d = await r.json();
            const badge = $('dhi-proxy-badge');
            if (badge) { badge.textContent = '🟢 BOT ONLINE'; badge.style.background='#14532d'; badge.style.color='#4ade80'; }
            const mb = $('dhi-mode-badge');
            if (mb) { mb.style.display='inline-block'; mb.textContent=d.dryRun?'📄 DRY RUN':'🔴 LIVE'; }
            const s = d.stats || {};
            const wr = s.totalTrades > 0 ? (s.wins/s.totalTrades*100).toFixed(1)+'%' : '—';
            const se = (id, html) => { const e=$(id); if(e) e.innerHTML=html; };
            se('dhi-kpi-pnl',  fmtPnl(d.totalPnl));
            se('dhi-kpi-dpnl', fmtPnl(d.dailyPnl));
            se('dhi-kpi-open', (d.openCount||0)+' / 5');
            se('dhi-kpi-wr',   wr);
            se('dhi-kpi-best', fmtPnl(s.bestTrade));
            const wl=$('dhi-kpi-wl'); if(wl) wl.textContent=`${s.wins||0}W / ${s.losses||0}L`;
            renderPositions(d.positions || {});
        } catch {
            const badge = $('dhi-proxy-badge');
            if (badge) { badge.textContent='🔌 dex-trader-proxy.js offline'; badge.style.background='#1e293b'; badge.style.color='#64748b'; }
            const mb=$('dhi-mode-badge'); if(mb) mb.style.display='none';
        }
        try {
            const r = await fetch(`${DEX_P}/trades?limit=30`, { signal: AbortSignal.timeout(4000) });
            if (r.ok) { const d = await r.json(); renderTrades(d.trades || []); }
        } catch {}
    }

    function renderPositions(positions) {
        const tbody = $('dhi-pos-body');
        if (!tbody) return;
        const list = Object.values(positions);
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="dhi-loading">Tidak ada posisi terbuka</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(p => {
            const pnlPct = p.currentPrice > 0 && p.entryPrice > 0
                ? ((p.currentPrice - p.entryPrice) / p.entryPrice * 100) : null;
            const sc = p.score || 0;
            const tp = [p.tp1Price, p.tp2Price, p.tp3Price].map(t => t ? fmtPrice(t) : '—').join(' / ');
            return `<tr>
  <td><b style="color:#e2e8f0">${p.coinSymbol}</b><br><span style="font-size:10px;color:#475569">${(p.baseName||'').slice(0,20)}</span></td>
  <td>${fmtPrice(p.entryPrice)}</td><td>${fmtPrice(p.currentPrice)}</td>
  <td>${fmtPct(pnlPct)}</td><td>$${(p.sizeUsd||0).toFixed(2)}</td>
  <td style="color:#f87171">${fmtPrice(p.stopLoss)}</td>
  <td style="color:#4ade80;font-size:11px">${tp}</td>
  <td><span class="dhi-score-badge" style="background:${scoreBg(sc)};color:${scoreColor(sc)}">${sc}</span></td>
  <td style="font-size:11px;color:#64748b">${fmtDur(p.openedAt, null)}</td>
  <td>
    <button class="dhi-btn dhi-btn-danger dhi-btn-sm" onclick="dexHunterUI.manualSell('${p.pairAddress}')">Sell</button>
    <a href="${p.url||'#'}" target="_blank" class="dhi-btn dhi-btn-ghost dhi-btn-sm" style="margin-left:4px">DSC↗</a>
  </td>
</tr>`;
        }).join('');
    }

    function renderTrades(trades) {
        const tbody = $('dhi-hist-body');
        if (!tbody) return;
        if (!trades.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="dhi-loading">Belum ada riwayat trade</td></tr>';
            return;
        }
        tbody.innerHTML = trades.map(t => {
            const sc = t.score || 0;
            const icon = t.pnlUsd > 0 ? '✅' : t.pnlUsd < 0 ? '🔴' : '⬜';
            return `<tr>
  <td>${icon} <b style="color:#e2e8f0">${t.coinSymbol||'?'}</b>
    <a href="${t.url||'#'}" target="_blank" style="color:#60a5fa;font-size:10px;margin-left:4px">↗</a></td>
  <td style="font-size:11px">${fmtTime(t.openedAt)}</td>
  <td style="font-size:11px">${fmtTime(t.closedAt)}</td>
  <td>${fmtPrice(t.entryPrice)}</td><td>${fmtPrice(t.exitPrice)}</td>
  <td>${fmtPnl(t.pnlUsd)}</td>
  <td style="font-size:11px;color:#64748b">${fmtDur(t.openedAt,t.closedAt)}</td>
  <td style="font-size:11px;color:#94a3b8">${t.reason||'—'}</td>
  <td><span class="dhi-score-badge" style="background:${scoreBg(sc)};color:${scoreColor(sc)};font-size:10px;padding:2px 6px">${sc}</span></td>
</tr>`;
        }).join('');
    }

    // ── Actions ───────────────────────────────────────────────────────────────
    async function manualSell(pairAddress) {
        if (!confirm('Tutup posisi ini?')) return;
        try {
            const r = await fetch(`${DEX_P}/sell`, { method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ pairAddress, reason:'Manual sell via UI' }) });
            const d = await r.json();
            if (d.success) alert(`✅ P&L: ${d.pnlUsd>=0?'+':''}$${(d.pnlUsd||0).toFixed(2)}`);
            else alert('❌ ' + (d.error||'unknown'));
        } catch (e) { alert('❌ ' + e.message); }
        fetchState();
    }

    async function closeAll() {
        if (!confirm('Tutup SEMUA posisi?')) return;
        try {
            const r = await fetch(`${DEX_P}/close-all`, { method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ reason:'Manual close-all' }) });
            const d = await r.json();
            alert(`✅ ${d.closedCount||0} posisi ditutup.`);
        } catch (e) { alert('❌ ' + e.message); }
        fetchState();
    }

    async function dryBuy(mint, symbol, pairAddress, price, score) {
        if (!confirm(`📄 DRY BUY ${symbol} @ ${fmtPrice(price)}\nScore: ${score}/100`)) return;
        try {
            const r = await fetch(`${DEX_P}/buy`, { method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ outputMint: mint, amountUsd: 20, symbol }) });
            const d = await r.json();
            if (d.success) alert(`✅ ${d.dryRun?'[DRY RUN]':'[LIVE]'} BUY ${symbol} berhasil!`);
            else alert('❌ ' + (d.error||'unknown') + '\nPastikan dex-trader-proxy.js jalan (port 3004)');
        } catch (e) { alert('❌ ' + e.message + '\nPastikan dex-trader-proxy.js jalan (port 3004)'); }
    }

    async function scanNow() { await loadTrenches(true); }

    // ── Init / destroy ────────────────────────────────────────────────────────
    function init() {
        renderShell();
        _pollTimer  = setInterval(fetchState, 15_000);
        _trenchTimer= setInterval(() => { if (_tab === 'trenches') loadTrenches(); }, 60_000);
    }

    function destroy() {
        clearInterval(_pollTimer);
        clearInterval(_trenchTimer);
    }

    function startPolling() { init(); }
    function stopPolling()  { destroy(); }

    return {
        init, destroy, startPolling, stopPolling,
        fetchState, scanNow, loadTrenches, loadWhale, loadNarratives,
        analyzeToken, analyzeSymbol,
        closeAll, manualSell, dryBuy,
        _switchTab, _filterTrenches,
    };
})();
