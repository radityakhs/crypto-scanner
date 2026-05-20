/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  SMART NARRATIVE & LIQUIDITY INTELLIGENCE PLATFORM          ║
 * ║  5 Engines: Regime · Liquidity · Narrative · Fake Breakout  ║
 * ║             · Composite AI Score                            ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const SmartIntelligence = (() => {
    const BASE = 'http://127.0.0.1:3001';
    let _tab = 'composite';
    let _regimeData = null, _liqData = null, _fboData = null, _compData = null, _aiData = null;
    let _timer = null;
    let _aiGenerating = false;

    // ── Inject styles ─────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('si-styles')) return;
        const s = document.createElement('style');
        s.id = 'si-styles';
        s.textContent = `
/* ── Shell ──────────────────────────────────────────────────── */
#siPanel { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#e2e8f0; padding:0 0 60px; }
.si-hero { background:linear-gradient(135deg,#060d1f 0%,#0d1433 50%,#0a0e1a 100%);
    border:1px solid #1e3a5f; border-radius:16px; padding:22px 24px; margin-bottom:16px; position:relative; overflow:hidden; }
.si-hero::before { content:''; position:absolute; top:-60px; right:-60px; width:260px; height:260px;
    background:radial-gradient(circle,rgba(139,92,246,.12) 0%,transparent 70%); pointer-events:none; }
.si-hero::after { content:''; position:absolute; bottom:-40px; left:-40px; width:180px; height:180px;
    background:radial-gradient(circle,rgba(59,130,246,.08) 0%,transparent 70%); pointer-events:none; }
.si-hero-badge { display:inline-flex; align-items:center; gap:6px; background:linear-gradient(135deg,#7c3aed,#3b82f6);
    padding:4px 12px; border-radius:20px; font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#fff; margin-bottom:10px; }
.si-hero h1 { margin:0 0 6px; font-size:22px; font-weight:900;
    background:linear-gradient(135deg,#e2e8f0 0%,#a78bfa 50%,#60a5fa 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.si-hero-sub { font-size:12px; color:#64748b; margin-bottom:14px; }
.si-kpi-row { display:flex; flex-wrap:wrap; gap:10px; }
.si-kpi { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:10px;
    padding:10px 16px; min-width:100px; text-align:center; }
.si-kpi-val { font-size:20px; font-weight:900; line-height:1.1; }
.si-kpi-lbl { font-size:10px; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-top:3px; }
.si-regime-banner { border-radius:12px; padding:14px 18px; margin-bottom:14px; display:flex; align-items:center; gap:12px; border:1px solid; }
.si-hero-actions { display:flex; gap:8px; margin-top:14px; align-items:center; }
.si-refresh-btn { background:rgba(124,58,237,.2); border:1px solid rgba(124,58,237,.4); color:#a78bfa;
    border-radius:8px; padding:7px 16px; cursor:pointer; font-size:12px; font-weight:600; transition:all .2s; }
.si-refresh-btn:hover { background:rgba(124,58,237,.35); }
.si-last-ts { font-size:11px; color:#475569; }

/* ── Tab bar ─────────────────────────────────────────────────── */
.si-tabs { display:flex; gap:4px; margin-bottom:16px; overflow-x:auto; padding-bottom:4px; border-bottom:1px solid #1e293b; }
.si-tab { background:transparent; border:none; border-bottom:2px solid transparent;
    padding:10px 16px; cursor:pointer; font-size:12px; font-weight:600; color:#64748b;
    white-space:nowrap; transition:all .2s; margin-bottom:-1px; }
.si-tab:hover { color:#a78bfa; }
.si-tab.active { color:#a78bfa; border-bottom-color:#7c3aed; }
.si-section { display:none; }
.si-section.active { display:block; }

/* ── Cards ───────────────────────────────────────────────────── */
.si-card { background:#0a0e1a; border:1px solid #1e293b; border-radius:14px; overflow:hidden; margin-bottom:12px; }
.si-card-header { padding:12px 16px; display:flex; align-items:center; gap:8px; border-bottom:1px solid #1e293b;
    background:linear-gradient(135deg,#0a0e1a,#0d1b2e); }
.si-card-header h3 { margin:0; font-size:13px; font-weight:700; color:#e2e8f0; flex:1; }
.si-card-body { padding:14px 16px; }
.si-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.si-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
@media(max-width:900px) { .si-grid-2, .si-grid-3 { grid-template-columns:1fr; } }

/* ── Regime ─────────────────────────────────────────────────── */
.si-regime-card { border-radius:12px; padding:16px; border:1px solid; position:relative; overflow:hidden; }
.si-regime-card::before { content:''; position:absolute; inset:0; opacity:.05; background:var(--rc); }
.si-funding-bar { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid #0f172a; }
.si-funding-bar:last-child { border-bottom:none; }
.si-fund-sym { font-size:13px; font-weight:700; min-width:50px; }
.si-fund-bar-wrap { flex:1; height:8px; background:rgba(255,255,255,.06); border-radius:4px; overflow:hidden; position:relative; }
.si-fund-bar-center { position:absolute; left:50%; top:0; width:1px; height:100%; background:#334155; }
.si-fund-bar-fill { position:absolute; height:100%; border-radius:4px; top:0; transition:all .4s; }
.si-fund-val { font-size:12px; font-weight:700; min-width:60px; text-align:right; }

/* ── OI / Liquidity ─────────────────────────────────────────── */
.si-oi-table { width:100%; border-collapse:collapse; font-size:12px; }
.si-oi-table th { padding:8px 10px; text-align:left; font-size:10px; color:#475569; text-transform:uppercase;
    letter-spacing:.06em; border-bottom:1px solid #1e293b; font-weight:600; background:#070b14; white-space:nowrap; }
.si-oi-table td { padding:9px 10px; border-bottom:1px solid #0f172a; vertical-align:middle; }
.si-oi-table tr:hover td { background:rgba(255,255,255,.02); }
.si-sqz-bar-wrap { width:80px; height:6px; background:rgba(255,255,255,.06); border-radius:3px; overflow:hidden; display:inline-block; vertical-align:middle; margin-right:4px; }
.si-sqz-bar-fill { height:100%; border-radius:3px; }
.si-sqz-label { display:inline-block; padding:2px 6px; border-radius:6px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
.sqz-OVERHEATED { background:rgba(239,68,68,.2); color:#f87171; border:1px solid rgba(239,68,68,.3); animation:pulse-red2 1.5s infinite; }
.sqz-SHORT_SQUEEZE_RISK { background:rgba(239,68,68,.15); color:#fca5a5; border:1px solid rgba(239,68,68,.25); }
.sqz-LONG_SQUEEZE_RISK  { background:rgba(34,197,94,.15); color:#86efac; border:1px solid rgba(34,197,94,.25); }
.sqz-LONGS_HEAVY  { background:rgba(251,146,60,.12); color:#fb923c; border:1px solid rgba(251,146,60,.25); }
.sqz-SHORTS_HEAVY { background:rgba(96,165,250,.12); color:#93c5fd; border:1px solid rgba(96,165,250,.25); }
.sqz-BALANCED { background:rgba(100,116,139,.1); color:#64748b; border:1px solid transparent; }
@keyframes pulse-red2 { 0%,100%{box-shadow:0 0 0 rgba(239,68,68,0)} 50%{box-shadow:0 0 6px rgba(239,68,68,.5)} }

/* ── Fake Breakout ──────────────────────────────────────────── */
.si-fbo-item { border:1px solid #1e293b; border-radius:12px; padding:14px; margin-bottom:10px;
    background:rgba(255,255,255,.02); transition:all .2s; }
.si-fbo-item:hover { border-color:#334155; }
.si-fbo-item.strong { border-color:rgba(239,68,68,.4); background:rgba(239,68,68,.04); }
.si-fbo-item.likely { border-color:rgba(251,146,60,.3); background:rgba(251,146,60,.03); }
.si-fbo-top { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.si-fbo-sym { font-size:16px; font-weight:900; color:#e2e8f0; }
.si-fbo-price { font-size:13px; color:#94a3b8; }
.si-fbo-verdict { padding:3px 10px; border-radius:8px; font-size:11px; font-weight:700; margin-left:auto; }
.fbo-STRONG_FAKEOUT { background:rgba(239,68,68,.2); color:#f87171; border:1px solid rgba(239,68,68,.3); }
.fbo-LIKELY_FAKEOUT { background:rgba(251,146,60,.15); color:#fb923c; border:1px solid rgba(251,146,60,.3); }
.fbo-WATCH { background:rgba(100,116,139,.12); color:#64748b; border:1px solid transparent; }
.si-fbo-patterns { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
.si-fbo-pattern { padding:3px 9px; border-radius:8px; font-size:10px; font-weight:700;
    background:rgba(124,58,237,.12); color:#a78bfa; border:1px solid rgba(124,58,237,.2); }
.si-conf-bar { display:flex; align-items:center; gap:8px; }
.si-conf-bg { flex:1; height:6px; background:rgba(255,255,255,.06); border-radius:3px; overflow:hidden; }
.si-conf-fill { height:100%; border-radius:3px; transition:width .5s; }
.si-conf-val { font-size:12px; font-weight:800; min-width:32px; }

/* ── Composite Table ────────────────────────────────────────── */
.si-comp-table { width:100%; border-collapse:collapse; font-size:12px; }
.si-comp-table th { padding:9px 10px; text-align:left; font-size:10px; color:#475569; text-transform:uppercase;
    letter-spacing:.06em; border-bottom:1px solid #1e293b; font-weight:600; background:#070b14; white-space:nowrap; }
.si-comp-table td { padding:9px 10px; border-bottom:1px solid #0f172a; vertical-align:middle; }
.si-comp-table tr:hover td { background:rgba(255,255,255,.025); }
.si-grade { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px;
    border-radius:8px; font-size:14px; font-weight:900; }
.grade-A { background:rgba(34,197,94,.15); color:#4ade80; border:1px solid rgba(34,197,94,.3); }
.grade-B { background:rgba(34,197,94,.08); color:#86efac; border:1px solid rgba(34,197,94,.2); }
.grade-C { background:rgba(251,146,60,.1); color:#fb923c; border:1px solid rgba(251,146,60,.2); }
.grade-D { background:rgba(239,68,68,.08); color:#f87171; border:1px solid rgba(239,68,68,.2); }
.grade-F { background:rgba(100,116,139,.1); color:#475569; border:1px solid transparent; }
.si-signal { display:inline-block; padding:3px 8px; border-radius:6px; font-size:10px; font-weight:700; white-space:nowrap; }
.sig-STRONG_BUY { background:rgba(34,197,94,.15); color:#4ade80; border:1px solid rgba(34,197,94,.3); }
.sig-BUY       { background:rgba(34,197,94,.08); color:#86efac; border:1px solid rgba(34,197,94,.2); }
.sig-NEUTRAL   { background:rgba(100,116,139,.1); color:#94a3b8; border:1px solid rgba(100,116,139,.2); }
.sig-CAUTION   { background:rgba(251,146,60,.1); color:#fb923c; border:1px solid rgba(251,146,60,.2); }
.sig-AVOID     { background:rgba(239,68,68,.08); color:#f87171; border:1px solid rgba(239,68,68,.2); }
.si-mini-bars { display:flex; gap:3px; align-items:flex-end; height:20px; }
.si-mini-bar { width:8px; border-radius:2px 2px 0 0; transition:height .4s; }
.si-score-badge { display:inline-flex; align-items:center; justify-content:center;
    width:36px; height:36px; border-radius:50%; font-size:14px; font-weight:900; border:2px solid; }

/* ── Loading / empty ────────────────────────────────────────── */
.si-loading { padding:40px; text-align:center; color:#475569; font-size:13px; }
.si-spinner { display:inline-block; width:24px; height:24px; border:2px solid #1e293b;
    border-top-color:#7c3aed; border-radius:50%; animation:si-spin .8s linear infinite; margin-bottom:10px; }
@keyframes si-spin { to { transform:rotate(360deg); } }
.si-alert-banner { border-radius:10px; padding:10px 14px; margin-bottom:10px; display:flex;
    align-items:center; gap:10px; font-size:12px; font-weight:600; border:1px solid; }
.si-alert-warn { background:rgba(239,68,68,.08); border-color:rgba(239,68,68,.3); color:#fca5a5; }
.si-alert-info { background:rgba(59,130,246,.08); border-color:rgba(59,130,246,.3); color:#93c5fd; }
.si-alert-ok   { background:rgba(34,197,94,.08); border-color:rgba(34,197,94,.3); color:#86efac; }

/* ── AI Analyst ──────────────────────────────────────────────── */
.si-ai-shell { max-width:860px; }
.si-ai-controls { background:#0a0e1a; border:1px solid #1e3a5f; border-radius:14px; padding:16px 20px; margin-bottom:14px; }
.si-ai-controls-top { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
.si-ai-title { font-size:16px; font-weight:800; color:#e2e8f0; flex:1; }
.si-ai-key-row { display:flex; gap:8px; align-items:center; }
.si-ai-key-input { flex:1; background:#111827; border:1px solid #374151; border-radius:8px; padding:7px 12px;
    color:#e2e8f0; font-size:12px; font-family:monospace; outline:none; min-width:240px; }
.si-ai-key-input:focus { border-color:#7c3aed; }
.si-ai-key-label { font-size:11px; color:#64748b; white-space:nowrap; }
.si-focus-row { display:flex; gap:6px; flex-wrap:wrap; }
.si-focus-btn { padding:6px 14px; border-radius:20px; border:1px solid #1e293b; background:#0f172a;
    color:#64748b; font-size:11px; font-weight:600; cursor:pointer; transition:all .2s; }
.si-focus-btn:hover { border-color:#7c3aed; color:#a78bfa; }
.si-focus-btn.active { background:rgba(124,58,237,.2); border-color:#7c3aed; color:#a78bfa; }
.si-ai-run-btn { padding:10px 24px; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer;
    background:linear-gradient(135deg,#7c3aed,#3b82f6); border:none; color:#fff; transition:all .2s;
    display:flex; align-items:center; gap:8px; }
.si-ai-run-btn:hover { opacity:.9; transform:translateY(-1px); box-shadow:0 4px 16px rgba(124,58,237,.4); }
.si-ai-run-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; box-shadow:none; }
.si-ai-output { background:#070b14; border:1px solid #1e293b; border-radius:14px; padding:20px 22px;
    font-size:13px; line-height:1.75; color:#cbd5e1; min-height:200px; white-space:pre-wrap; word-break:break-word; }
.si-ai-output h2, .si-ai-output h3 { color:#e2e8f0; margin:16px 0 8px; }
.si-ai-output strong, .si-ai-output b { color:#e2e8f0; }
.si-ai-output-meta { display:flex; gap:16px; padding:8px 0; border-top:1px solid #1e293b; margin-top:12px;
    font-size:11px; color:#475569; flex-wrap:wrap; }
.si-ai-snapshot { display:flex; flex-wrap:wrap; gap:8px; padding:10px 0; border-bottom:1px solid #1e293b; margin-bottom:12px; }
.si-ai-snap-item { padding:4px 10px; border-radius:8px; background:rgba(255,255,255,.04);
    border:1px solid rgba(255,255,255,.08); font-size:11px; font-weight:600; }
.si-ai-stream { animation:si-typewriter .1s steps(1,end) forwards; }
@keyframes si-typewriter { from { opacity:0; } to { opacity:1; } }
.si-ai-cursor { display:inline-block; width:2px; height:14px; background:#a78bfa; animation:blink .7s infinite; vertical-align:middle; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
`;
        document.head.appendChild(s);
    }

    // ── Helpers ───────────────────────────────────────────────────
    const fmtUsd = v => v >= 1e12 ? `$${(v/1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;
    const fmtChg = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
    const chgColor = v => v >= 3 ? '#4ade80' : v >= 0 ? '#86efac' : v >= -3 ? '#f87171' : '#ef4444';
    const scoreColor = s => s >= 70 ? '#4ade80' : s >= 50 ? '#fb923c' : s >= 30 ? '#eab308' : '#475569';
    const pct = (v, max) => Math.min(100, Math.max(0, (v / max) * 100));

    function loading(elId) {
        const el = document.getElementById(elId);
        if (el) el.innerHTML = `<div class="si-loading"><div class="si-spinner"></div><br>Memuat data…</div>`;
    }

    // ── Tab switch ────────────────────────────────────────────────
    function switchTab(t) {
        _tab = t;
        document.querySelectorAll('.si-tab').forEach(el => el.classList.toggle('active', el.dataset.siTab === t));
        document.querySelectorAll('.si-section').forEach(el => el.classList.toggle('active', el.dataset.siSection === t));
        // lazy load
        if (t === 'regime'    && !_regimeData) fetchRegime();
        if (t === 'liquidity' && !_liqData)    fetchLiquidity();
        if (t === 'fakeout'   && !_fboData)    fetchFakeout();
        if (t === 'composite' && !_compData)   fetchComposite();
        if (t === 'narrative') NarrativeIntelligence && NarrativeIntelligence.refresh();
        if (t === 'ai-analyst') renderAIShell();
    }
    window._siTab = switchTab;

    // ── Fetch functions ───────────────────────────────────────────
    async function fetchRegime(force) {
        loading('siRegimeBody');
        try {
            const r = await fetch(`${BASE}/api/intelligence/regime${force ? '?refresh=1' : ''}`);
            const d = await r.json();
            if (d.ok) { _regimeData = d; renderRegime(d); }
            else renderErr('siRegimeBody', d.error);
        } catch (e) { renderErr('siRegimeBody', e.message); }
    }

    async function fetchLiquidity(force) {
        loading('siLiqBody');
        try {
            const r = await fetch(`${BASE}/api/intelligence/liquidity${force ? '?refresh=1' : ''}`);
            const d = await r.json();
            if (d.ok) { _liqData = d; renderLiquidity(d); }
            else renderErr('siLiqBody', d.error);
        } catch (e) { renderErr('siLiqBody', e.message); }
    }

    async function fetchFakeout(force) {
        loading('siFboBody');
        try {
            const r = await fetch(`${BASE}/api/intelligence/fake-breakout${force ? '?refresh=1' : ''}`);
            const d = await r.json();
            if (d.ok) { _fboData = d; renderFakeout(d); }
            else renderErr('siFboBody', d.error);
        } catch (e) { renderErr('siFboBody', e.message); }
    }

    async function fetchComposite(force) {
        loading('siCompBody');
        try {
            const r = await fetch(`${BASE}/api/intelligence/composite${force ? '?refresh=1' : ''}`);
            const d = await r.json();
            if (d.ok) { _compData = d; renderComposite(d); }
            else renderErr('siCompBody', d.error);
        } catch (e) { renderErr('siCompBody', e.message); }
    }

    function renderErr(id, msg) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div class="si-loading" style="color:#f87171">⚠️ ${msg || 'Error fetching data'}<br><small style="color:#475569">Pastikan proxy-server.js berjalan di port 3001</small></div>`;
    }

    // ── Render AI Analyst shell (tabs + controls) ─────────────────
    function renderAIShell() {
        const el = document.getElementById('siAiBody');
        if (!el || el.dataset.rendered) return;
        el.dataset.rendered = '1';
        el.innerHTML = `<div class="si-ai-shell">
            <div class="si-ai-controls">
                <div class="si-ai-controls-top">
                    <div class="si-ai-title">🔮 Market Oracle AI</div>
                    <div class="si-ai-key-row">
                        <span class="si-ai-key-label">Groq API Key:</span>
                        <input class="si-ai-key-input" id="siAiKeyInput" type="password"
                            placeholder="gsk_… (kosongkan jika sudah set di .env)" autocomplete="off">
                    </div>
                </div>
                <div style="font-size:12px;color:#64748b;margin-bottom:10px">
                    Analisa crypto market real-time menggunakan <b style="color:#a78bfa">Llama 3.3 70B</b> — mengambil data dari semua 4 engine secara otomatis.
                </div>
                <div style="font-size:12px;color:#475569;margin-bottom:10px">📋 Fokus Analisa:</div>
                <div class="si-focus-row" id="siFocusRow">
                    <button class="si-focus-btn active" data-focus="general"   onclick="window._siSetFocus(this,'general')">📊 Full Market Overview</button>
                    <button class="si-focus-btn"        data-focus="entry"     onclick="window._siSetFocus(this,'entry')">🎯 Entry Opportunities</button>
                    <button class="si-focus-btn"        data-focus="altseason" onclick="window._siSetFocus(this,'altseason')">🚀 Alt Season Analysis</button>
                    <button class="si-focus-btn"        data-focus="risk"      onclick="window._siSetFocus(this,'risk')">🛡️ Risk Management</button>
                </div>
                <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                    <button class="si-ai-run-btn" id="siAiRunBtn" onclick="SmartIntelligence.runAnalysis()">
                        <span id="siAiBtnIcon">🔮</span> Generate Analisa
                    </button>
                    <span id="siAiStatus" style="font-size:12px;color:#475569"></span>
                </div>
            </div>

            <!-- Output area -->
            <div id="siAiResult" style="display:none">
                <div class="si-ai-snapshot" id="siAiSnapshot"></div>
                <div class="si-ai-output" id="siAiOutputText"></div>
                <div class="si-ai-output-meta" id="siAiMeta"></div>
            </div>
            <div style="font-size:11px;color:#334155;margin-top:10px;line-height:1.6">
                ⚠️ <em>Analisa ini adalah output AI berdasarkan data pasar real-time. Bukan saran keuangan. Selalu lakukan riset sendiri sebelum berinvestasi.</em>
            </div>
        </div>`;

        // Restore cached result if exists
        if (_aiData) renderAIResult(_aiData);
    }

    window._siSetFocus = function(btn, focus) {
        document.querySelectorAll('.si-focus-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    };

    async function runAnalysis() {
        if (_aiGenerating) return;
        _aiGenerating = true;

        const btn    = document.getElementById('siAiRunBtn');
        const icon   = document.getElementById('siAiBtnIcon');
        const status = document.getElementById('siAiStatus');
        const result = document.getElementById('siAiResult');
        const output = document.getElementById('siAiOutputText');

        if (btn) btn.disabled = true;
        if (icon) icon.textContent = '⏳';
        if (status) status.textContent = 'Mengumpulkan data dari semua engine…';
        if (result) result.style.display = 'none';

        try {
            const focusBtn  = document.querySelector('.si-focus-btn.active');
            const focus     = focusBtn?.dataset.focus || 'general';
            const keyInput  = document.getElementById('siAiKeyInput');
            const apiKey    = keyInput?.value.trim() || '';

            if (status) status.textContent = '🧠 AI sedang menganalisa market…';

            const r = await fetch(`${BASE}/api/intelligence/ai-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ focus, apiKey: apiKey || undefined, force: true }),
            });
            const d = await r.json();

            if (!d.ok) {
                if (status) status.textContent = '';
                if (output) output.innerHTML = `<span style="color:#f87171">⚠️ ${d.error}</span>`;
                if (result) result.style.display = 'block';
            } else {
                _aiData = d;
                renderAIResult(d);
                if (status) status.textContent = d.cached ? '· dari cache' : `· ${d.tokens?.toLocaleString()} tokens`;
            }
        } catch (e) {
            if (status) status.textContent = '';
            if (output) output.innerHTML = `<span style="color:#f87171">⚠️ Error: ${e.message}</span>`;
            if (result) result.style.display = 'block';
        } finally {
            _aiGenerating = false;
            if (btn) btn.disabled = false;
            if (icon) icon.textContent = '🔮';
        }
    }
    window._siRunAnalysis = runAnalysis;

    function renderAIResult(d) {
        const result   = document.getElementById('siAiResult');
        const output   = document.getElementById('siAiOutputText');
        const snapshot = document.getElementById('siAiSnapshot');
        const meta     = document.getElementById('siAiMeta');
        if (!result || !output) return;

        // Snapshot pills
        const snap = d.dataSnapshot || {};
        if (snapshot) {
            snapshot.innerHTML = [
                snap.regime    ? `<span class="si-ai-snap-item">📊 ${snap.regime}</span>` : '',
                snap.fgVal     ? `<span class="si-ai-snap-item">😱 F&G: ${snap.fgVal}</span>` : '',
                snap.btcDom    ? `<span class="si-ai-snap-item">₿ BTC Dom: ${snap.btcDom}%</span>` : '',
                snap.altSeason !== undefined ? `<span class="si-ai-snap-item" style="color:${snap.altSeason ? '#4ade80' : '#f97316'}">${snap.altSeason ? '🟢 Alt Season' : '🟡 BTC Season'}</span>` : '',
                snap.topCoin   ? `<span class="si-ai-snap-item">🏆 Top: ${snap.topCoin} (${snap.topScore})</span>` : '',
                snap.sqzAlerts ? `<span class="si-ai-snap-item" style="color:#f87171">⚡ ${snap.sqzAlerts} Squeeze Alert</span>` : '',
                snap.fakeouts  ? `<span class="si-ai-snap-item" style="color:#fb923c">🕯️ ${snap.fakeouts} Fakeout</span>` : '',
            ].filter(Boolean).join('');
        }

        // Render markdown-lite: **bold**, ### headings
        const html = (d.analysis || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/^### (.+)$/gm, '<h3 style="color:#a78bfa;margin:14px 0 6px;font-size:13px">$1</h3>')
            .replace(/^## (.+)$/gm,  '<h2 style="color:#e2e8f0;margin:18px 0 8px;font-size:15px;font-weight:800">$2</h2>')
            .replace(/^# (.+)$/gm,   '<h2 style="color:#e2e8f0;margin:18px 0 8px;font-size:16px;font-weight:900">$1</h2>')
            .replace(/\n/g, '<br>');

        output.innerHTML = html;

        if (meta) {
            const ts = d.generatedAt ? new Date(d.generatedAt).toLocaleString('id-ID') : '–';
            meta.innerHTML = `
                <span>🤖 Model: ${d.model || 'llama-3.3-70b'}</span>
                <span>📊 Tokens: ${d.tokens?.toLocaleString() || '–'}</span>
                <span>⏱ ${ts}</span>
                <span style="color:${d.cached ? '#475569' : '#4ade80'}">${d.cached ? '· cached 15min' : '· fresh'}</span>
                <span>🎯 Fokus: ${d.focus || 'general'}</span>`;
        }

        result.style.display = 'block';
    }

    // ── Render Regime ─────────────────────────────────────────────
    function renderRegime(d) {
        const el = document.getElementById('siRegimeBody');
        if (!el) return;

        const riskColors = { VERY_HIGH: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#22c55e' };
        const riskColor = riskColors[d.riskLevel] || '#94a3b8';

        const fundBars = ['BTC','ETH','SOL'].map((s, i) => {
            const val = [d.funding.btc, d.funding.eth, d.funding.sol][i];
            const center = 50;
            const barW = Math.min(50, Math.abs(val) * 800);
            const barLeft = val >= 0 ? center : center - barW;
            const color = val > 0.03 ? '#ef4444' : val > 0.01 ? '#f97316' : val < -0.01 ? '#22c55e' : '#94a3b8';
            const label = val > 0.04 ? 'OVERHEATED' : val > 0.02 ? 'BULLISH' : val > 0 ? 'SLIGHTLY+' : val < -0.02 ? 'NEGATIVE' : 'NEUTRAL';
            return `<div class="si-funding-bar">
                <div class="si-fund-sym" style="color:${color}">${s}</div>
                <div class="si-fund-bar-wrap">
                    <div class="si-fund-bar-center"></div>
                    <div class="si-fund-bar-fill" style="left:${barLeft}%;width:${barW}%;background:${color}"></div>
                </div>
                <div class="si-fund-val" style="color:${color}">${val >= 0 ? '+' : ''}${(val * 100).toFixed(4)}% <span style="font-size:9px;color:#475569">${label}</span></div>
            </div>`;
        }).join('');

        const domSignalColor = d.btcDomSignal === 'ALT_SEASON' ? '#4ade80' : d.btcDomSignal === 'BTC_DOMINANCE' ? '#f97316' : '#94a3b8';

        el.innerHTML = `
        <div class="si-grid-2" style="margin-bottom:12px">
            <!-- Regime Card -->
            <div class="si-regime-card" style="--rc:${d.regimeColor};border-color:${d.regimeColor}40">
                <div style="font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Current Regime</div>
                <div style="font-size:20px;font-weight:900;color:${d.regimeColor};margin-bottom:8px">${d.regime}</div>
                <div style="font-size:12px;color:#94a3b8;line-height:1.6">${d.regimeDesc}</div>
                <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
                    <span style="font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.06)">Risk: <b style="color:${riskColor}">${d.riskLevel?.replace('_',' ')}</b></span>
                    <span style="font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.06)">F&G: <b style="color:${d.regimeColor}">${d.fgVal}</b></span>
                    <span style="font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.06)">${d.altSeason ? '🟢 ALT SEASON' : '₿ BTC DOMINANT'}</span>
                </div>
            </div>
            <!-- BTC Dom Card -->
            <div class="si-card" style="margin-bottom:0">
                <div class="si-card-header"><h3>₿ Market Dominance</h3></div>
                <div class="si-card-body">
                    ${[
                        { label:'BTC Dominance', val: d.btcDom, color: '#F7931A', max:70 },
                        { label:'ETH Dominance', val: d.ethDom, color: '#627EEA', max:30 },
                        { label:'Alt Market', val: +(100 - d.btcDom - d.ethDom).toFixed(2), color: '#a78bfa', max:60 },
                    ].map(x => `
                        <div style="margin-bottom:10px">
                            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
                                <span style="color:#94a3b8">${x.label}</span>
                                <span style="color:${x.color};font-weight:700">${x.val}%</span>
                            </div>
                            <div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
                                <div style="width:${pct(x.val,x.max)}%;height:100%;background:${x.color};border-radius:3px;transition:width .5s"></div>
                            </div>
                        </div>`).join('')}
                    <div style="margin-top:8px;font-size:11px;color:${domSignalColor};font-weight:700">${d.btcDomSignal?.replace(/_/g,' ')}</div>
                    <div style="font-size:11px;color:#64748b;margin-top:2px">Total MCap: ${fmtUsd(d.totalMcap)} · Vol: ${fmtUsd(d.totalVolume)}</div>
                </div>
            </div>
        </div>
        <!-- Funding Rates -->
        <div class="si-card">
            <div class="si-card-header">
                <h3>⚡ Perp Funding Rates</h3>
                <span style="font-size:11px;color:#475569">Positif = longs bayar shorts · >0.04% = overheated</span>
            </div>
            <div class="si-card-body">${fundBars}</div>
        </div>
        <div style="font-size:11px;color:#475569;text-align:right;margin-top:4px">⏱ ${new Date(d.fetchedAt).toLocaleString('id-ID')} ${d.cached ? '· cached' : '· fresh'}</div>`;
    }

    // ── Render Liquidity ──────────────────────────────────────────
    function renderLiquidity(d) {
        const el = document.getElementById('siLiqBody');
        if (!el) return;

        const alerts = d.topSqueeze.map(x => `
            <div class="si-alert-banner ${x.sqzDir.includes('RISK') ? 'si-alert-warn' : 'si-alert-info'}">
                <span style="font-size:18px">${x.sqzDir.includes('SHORT') ? '🔴' : x.sqzDir.includes('LONG') ? '🟢' : '⚠️'}</span>
                <div style="flex:1">
                    <b>${x.symbol}</b> — ${x.sqzDir.replace(/_/g,' ')} &nbsp;
                    <span style="font-size:10px;opacity:.7">Squeeze probability: ${x.sqzProb}%</span>
                </div>
                ${x.liqBelowPct ? `<span style="font-size:11px">Liq below ~${x.liqBelowPct}%</span>` : ''}
            </div>`).join('');

        const rows = d.oiData.map(x => {
            const sqzColor = x.sqzProb >= 60 ? '#ef4444' : x.sqzProb >= 35 ? '#f97316' : '#94a3b8';
            const fundColor = x.fundRate > 0.03 ? '#ef4444' : x.fundRate > 0.01 ? '#fb923c' : x.fundRate < -0.01 ? '#4ade80' : '#94a3b8';
            return `<tr>
                <td><b style="color:#e2e8f0">${x.symbol}</b></td>
                <td style="color:#94a3b8">${fmtUsd(x.oiUsd)}</td>
                <td style="color:${fundColor};font-weight:700">${x.fundRate >= 0 ? '+' : ''}${(x.fundRate * 100).toFixed(4)}%</td>
                <td>
                    <div style="display:flex;align-items:center;gap:6px">
                        <div class="si-sqz-bar-wrap"><div class="si-sqz-bar-fill" style="width:${x.sqzProb}%;background:${sqzColor}"></div></div>
                        <span style="color:${sqzColor};font-weight:700;font-size:12px">${x.sqzProb}%</span>
                    </div>
                </td>
                <td><span class="si-sqz-label sqz-${x.sqzDir}">${x.sqzDir.replace(/_/g,' ')}</span></td>
                <td style="font-size:11px;color:#475569">
                    ${x.liqBelowPct ? `<span style="color:#f87171">⬇ ~${Math.abs(x.liqBelowPct)}% below</span>` : ''}
                    ${x.liqAbovePct ? `<span style="color:#4ade80">⬆ ~${x.liqAbovePct}% above</span>` : '–'}
                </td>
            </tr>`;
        }).join('');

        el.innerHTML = `
        ${alerts}
        <div class="si-card">
            <div class="si-card-header">
                <h3>📊 Open Interest & Squeeze Radar</h3>
                <span style="font-size:11px;color:#475569">Total OI: ${fmtUsd(d.totalOiUsd)}</span>
            </div>
            <div class="si-card-body" style="padding:0">
                <div style="overflow-x:auto">
                    <table class="si-oi-table">
                        <thead><tr>
                            <th>Coin</th><th>Open Interest</th><th>Funding Rate/8h</th>
                            <th>Squeeze Prob</th><th>Status</th><th>Liq Cluster</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
        <div style="font-size:11px;color:#475569;margin-top:6px">
            ℹ️ Squeeze probability = abs(funding) × 500 + OI weight. Data dari Binance Futures public API.<br>
            ⏱ ${new Date(d.fetchedAt).toLocaleString('id-ID')} ${d.cached ? '· cached' : '· fresh'}
        </div>`;
    }

    // ── Render Fake Breakout ──────────────────────────────────────
    function renderFakeout(d) {
        const el = document.getElementById('siFboBody');
        if (!el) return;

        if (!d.detections?.length) {
            el.innerHTML = `<div class="si-alert-banner si-alert-ok">
                <span style="font-size:20px">✅</span>
                <div>Tidak ada fake breakout terdeteksi saat ini. Pasar relatif clean.</div>
            </div>`;
            return;
        }

        const summaryBanner = d.strongFakeouts > 0
            ? `<div class="si-alert-banner si-alert-warn">
                <span style="font-size:20px">🚨</span>
                <div><b>${d.strongFakeouts} STRONG fake breakout</b> terdeteksi + ${d.likelyFakeouts} likely. Hati-hati entry di area resistance.</div>
               </div>`
            : `<div class="si-alert-banner si-alert-info">
                <span>⚠️</span>
                <div>${d.likelyFakeouts} likely fake breakout terdeteksi. Monitor level resistance.</div>
               </div>`;

        const items = d.detections.map(x => {
            const confColor = x.confidence >= 60 ? '#ef4444' : x.confidence >= 35 ? '#f97316' : '#94a3b8';
            const cls = x.verdict === 'STRONG_FAKEOUT' ? 'strong' : x.verdict === 'LIKELY_FAKEOUT' ? 'likely' : '';
            return `<div class="si-fbo-item ${cls}">
                <div class="si-fbo-top">
                    <div>
                        <div class="si-fbo-sym">${x.symbol}</div>
                        <div class="si-fbo-price">$${x.price} &nbsp;·&nbsp; Resistance $${x.resistanceLevel}</div>
                    </div>
                    <span class="si-fbo-verdict fbo-${x.verdict}">${x.verdict.replace(/_/g,' ')}</span>
                </div>
                <div class="si-fbo-patterns">
                    ${x.patterns.map(p => `<span class="si-fbo-pattern">${p.replace(/_/g,' ')}</span>`).join('')}
                </div>
                <div style="display:flex;align-items:center;gap:16px">
                    <div class="si-conf-bar" style="flex:1">
                        <span style="font-size:10px;color:#475569;white-space:nowrap">Confidence</span>
                        <div class="si-conf-bg"><div class="si-conf-fill" style="width:${x.confidence}%;background:${confColor}"></div></div>
                        <div class="si-conf-val" style="color:${confColor}">${x.confidence}%</div>
                    </div>
                    <div style="font-size:11px;color:#475569">
                        Vol ratio: <b style="color:${x.volRatio > 2 ? '#fb923c' : '#94a3b8'}">${x.volRatio}×</b>
                    </div>
                    <div style="font-size:11px;color:${chgColor(x.distFromRes)}">
                        ${x.distFromRes >= 0 ? '+' : ''}${x.distFromRes}% dari resistance
                    </div>
                </div>
            </div>`;
        }).join('');

        el.innerHTML = `
        ${summaryBanner}
        <div class="si-card">
            <div class="si-card-header">
                <h3>🕯️ Fake Breakout Detections — 4H Candles</h3>
                <span style="font-size:11px;color:#475569">${d.detections.length} patterns detected</span>
            </div>
            <div class="si-card-body">${items}</div>
        </div>
        <div style="font-size:11px;color:#475569;margin-top:6px">
            🔍 Patterns: FAKEOUT_BREAKOUT = candlestick menembus resistance lalu tutup di bawahnya. WICK_REJECTION = upper shadow >50% candle range. BEARISH_ENGULF = bearish engulfing candle. VOL_ANOMALY = volume spike tanpa price follow-through.<br>
            ⏱ ${new Date(d.fetchedAt).toLocaleString('id-ID')} ${d.cached ? '· cached' : '· fresh'}
        </div>`;
    }

    // ── Render Composite Score ────────────────────────────────────
    function renderComposite(d) {
        const el = document.getElementById('siCompBody');
        if (!el) return;

        const topBuys = d.topBuy.map(x =>
            `<span style="font-size:12px;padding:4px 10px;border-radius:8px;background:rgba(34,197,94,.1);color:#4ade80;border:1px solid rgba(34,197,94,.2);font-weight:700">⭐ ${x.symbol} (${x.composite})</span>`
        ).join('');

        const rows = d.scores.map(x => {
            const c = x.scores;
            const barColors = ['#a78bfa','#3b82f6','#10b981','#f59e0b'];
            const barVals   = [c.momentum, c.volume, c.funding, c.oi];
            const bars = barVals.map((v, i) =>
                `<div class="si-mini-bar" style="height:${Math.max(2, v * 0.2)}px;background:${barColors[i]};opacity:.8" title="${['Momentum','Volume','Funding','OI'][i]}: ${v}"></div>`
            ).join('');
            return `<tr>
                <td>
                    <div style="font-weight:800;color:#e2e8f0">${x.symbol}</div>
                    <div style="font-size:10px;color:#475569">${x.narrative}</div>
                </td>
                <td>
                    <div style="font-size:13px;font-weight:700;color:#e2e8f0">$${x.price < 1 ? x.price.toFixed(4) : x.price < 100 ? x.price.toFixed(3) : x.price.toFixed(2)}</div>
                </td>
                <td style="color:${chgColor(x.ch1h)};font-weight:700">${fmtChg(x.ch1h)}</td>
                <td style="color:${chgColor(x.ch24h)};font-weight:700">${fmtChg(x.ch24h)}</td>
                <td style="color:${chgColor(x.ch7d)}">${fmtChg(x.ch7d)}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px">
                        <div class="si-score-badge grade-${x.grade}" style="border-color:${scoreColor(x.composite)}40;color:${scoreColor(x.composite)}">${x.composite}</div>
                        <span class="si-grade grade-${x.grade}">${x.grade}</span>
                    </div>
                </td>
                <td><span class="si-signal sig-${x.signal}">${x.signal.replace(/_/g,' ')}</span></td>
                <td>
                    <div class="si-mini-bars">${bars}</div>
                    <div style="font-size:9px;color:#475569;margin-top:2px">M V F O</div>
                </td>
                <td style="font-size:11px;color:${x.fundRate > 0.03 ? '#ef4444' : x.fundRate < -0.01 ? '#4ade80' : '#94a3b8'};font-weight:600">
                    ${x.fundRate >= 0 ? '+' : ''}${(x.fundRate * 100).toFixed(4)}%
                </td>
            </tr>`;
        }).join('');

        el.innerHTML = `
        ${d.topBuy.length ? `<div class="si-alert-banner si-alert-ok" style="margin-bottom:12px">
            <span>🎯</span>
            <div style="flex:1"><b>Top Picks:</b> &nbsp;${topBuys}</div>
        </div>` : ''}
        <div class="si-card">
            <div class="si-card-header">
                <h3>🤖 Composite AI Score — Top ${d.scores.length} Coins</h3>
                <span style="font-size:11px;color:#475569">Momentum (40%) + Volume (20%) + Funding (20%) + OI (20%)</span>
            </div>
            <div class="si-card-body" style="padding:0">
                <div style="overflow-x:auto">
                    <table class="si-comp-table">
                        <thead><tr>
                            <th>Coin</th><th>Price</th><th>1H</th><th>24H</th><th>7D</th>
                            <th>Score</th><th>Signal</th><th>Breakdown</th><th>Funding</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>
        <div style="font-size:11px;color:#475569;margin-top:6px">
            📊 Score breakdown: <span style="color:#a78bfa">M=Momentum</span> · <span style="color:#3b82f6">V=Volume</span> · <span style="color:#10b981">F=Funding</span> · <span style="color:#f59e0b">O=Open Interest</span><br>
            ⏱ ${new Date(d.fetchedAt).toLocaleString('id-ID')} ${d.cached ? '· cached' : '· fresh'}
        </div>`;
    }

    // ── Main render ───────────────────────────────────────────────
    function renderShell() {
        const panel = document.getElementById('siPanel');
        if (!panel) return;
        panel.innerHTML = `
        <!-- Hero -->
        <div class="si-hero">
            <div class="si-hero-badge">🧠 Smart Intelligence Platform</div>
            <h1>Narrative & Liquidity Intelligence</h1>
            <div class="si-hero-sub">Market Regime · Liquidity OI · Fake Breakout Detector · Composite AI Score · Narrative Rotation</div>
            <div id="siHeroKpis" class="si-kpi-row">
                <div class="si-kpi"><div class="si-kpi-val" style="color:#64748b">–</div><div class="si-kpi-lbl">Market Regime</div></div>
                <div class="si-kpi"><div class="si-kpi-val" style="color:#64748b">–</div><div class="si-kpi-lbl">BTC Dominance</div></div>
                <div class="si-kpi"><div class="si-kpi-val" style="color:#64748b">–</div><div class="si-kpi-lbl">Avg Funding</div></div>
                <div class="si-kpi"><div class="si-kpi-val" style="color:#64748b">–</div><div class="si-kpi-lbl">Squeeze Alerts</div></div>
                <div class="si-kpi"><div class="si-kpi-val" style="color:#64748b">–</div><div class="si-kpi-lbl">Fake Breakouts</div></div>
            </div>
            <div class="si-hero-actions">
                <button class="si-refresh-btn" onclick="SmartIntelligence.refreshAll()">🔄 Refresh All</button>
                <span class="si-last-ts" id="siLastTs">–</span>
            </div>
        </div>

        <!-- Tabs -->
        <div class="si-tabs">
            <button class="si-tab active" data-si-tab="composite"  onclick="SmartIntelligence._tab('composite')">🤖 Composite Score</button>
            <button class="si-tab" data-si-tab="regime"            onclick="SmartIntelligence._tab('regime')">🌊 Market Regime</button>
            <button class="si-tab" data-si-tab="liquidity"         onclick="SmartIntelligence._tab('liquidity')">💧 Liquidity / OI</button>
            <button class="si-tab" data-si-tab="fakeout"           onclick="SmartIntelligence._tab('fakeout')">🕯️ Fake Breakout</button>
            <button class="si-tab" data-si-tab="narrative"         onclick="SmartIntelligence._tab('narrative')">🧠 Narrative</button>
            <button class="si-tab" data-si-tab="ai-analyst" style="border-left:2px solid #7c3aed;margin-left:4px"
                onclick="SmartIntelligence._tab('ai-analyst')">🔮 AI Analyst</button>
        </div>

        <!-- Sections -->
        <div class="si-section active" data-si-section="composite">
            <div id="siCompBody"><div class="si-loading"><div class="si-spinner"></div><br>Loading composite scores…</div></div>
        </div>
        <div class="si-section" data-si-section="regime">
            <div id="siRegimeBody"><div class="si-loading"><div class="si-spinner"></div><br>Loading market regime…</div></div>
        </div>
        <div class="si-section" data-si-section="liquidity">
            <div id="siLiqBody"><div class="si-loading"><div class="si-spinner"></div><br>Loading liquidity data…</div></div>
        </div>
        <div class="si-section" data-si-section="fakeout">
            <div id="siFboBody"><div class="si-loading"><div class="si-spinner"></div><br>Analyzing candles for fake breakouts…</div></div>
        </div>
        <div class="si-section" data-si-section="narrative">
            <div id="narrativeIntelligencePanel"></div>
        </div>
        <div class="si-section" data-si-section="ai-analyst">
            <div id="siAiBody"></div>
        </div>`;
    }

    async function refreshAll() {
        _regimeData = _liqData = _fboData = _compData = null;
        await Promise.allSettled([
            fetchComposite(true),
            fetchRegime(true),
            fetchLiquidity(true),
            fetchFakeout(true),
        ]);
        NarrativeIntelligence?.refresh(true);
        updateHeroKpis();
    }

    function updateHeroKpis() {
        const kpis = document.querySelectorAll('#siHeroKpis .si-kpi');
        if (!kpis.length) return;
        if (_regimeData) {
            kpis[0].querySelector('.si-kpi-val').textContent = _regimeData.regime?.split(' ')[0] || '–';
            kpis[0].querySelector('.si-kpi-val').style.color = _regimeData.regimeColor || '#94a3b8';
            kpis[1].querySelector('.si-kpi-val').textContent = _regimeData.btcDom + '%';
            kpis[1].querySelector('.si-kpi-val').style.color = _regimeData.altSeason ? '#4ade80' : '#F7931A';
            const avgF = _regimeData.funding?.avg ?? 0;
            kpis[2].querySelector('.si-kpi-val').textContent = (avgF >= 0 ? '+' : '') + (avgF * 100).toFixed(4) + '%';
            kpis[2].querySelector('.si-kpi-val').style.color = avgF > 0.03 ? '#ef4444' : avgF < 0 ? '#4ade80' : '#94a3b8';
        }
        if (_liqData) {
            kpis[3].querySelector('.si-kpi-val').textContent = _liqData.topSqueeze?.length || 0;
            kpis[3].querySelector('.si-kpi-val').style.color = _liqData.topSqueeze?.length > 0 ? '#ef4444' : '#4ade80';
        }
        if (_fboData) {
            kpis[4].querySelector('.si-kpi-val').textContent = _fboData.detections?.length || 0;
            kpis[4].querySelector('.si-kpi-val').style.color = _fboData.strongFakeouts > 0 ? '#ef4444' : _fboData.likelyFakeouts > 0 ? '#fb923c' : '#4ade80';
        }
        const ts = document.getElementById('siLastTs');
        if (ts) ts.textContent = '⏱ Updated: ' + new Date().toLocaleTimeString('id-ID');
    }

    // ── Public API ────────────────────────────────────────────────
    function init() {
        injectStyles();
        renderShell();
        // Load composite & regime first (most important), rest lazy
        fetchComposite();
        fetchRegime();
        // Start narrative too (it renders into #narrativeIntelligencePanel)
        if (typeof NarrativeIntelligence !== 'undefined') {
            NarrativeIntelligence.init ? NarrativeIntelligence.init() : NarrativeIntelligence.refresh();
        }
        // Auto-refresh every 5 minutes
        if (_timer) clearInterval(_timer);
        _timer = setInterval(() => {
            fetchComposite();
            fetchRegime();
            if (_liqData)  fetchLiquidity();
            if (_fboData)  fetchFakeout();
            updateHeroKpis();
        }, 5 * 60_000);
        // Update KPIs after fetches complete
        setTimeout(updateHeroKpis, 6000);
    }

    function destroy() {
        if (_timer) { clearInterval(_timer); _timer = null; }
    }

    return {
        init, destroy,
        _tab: switchTab,
        refreshAll,
        runAnalysis,
        refresh: (force) => {
            if (_tab === 'composite') fetchComposite(force);
            else if (_tab === 'regime') fetchRegime(force);
            else if (_tab === 'liquidity') fetchLiquidity(force);
            else if (_tab === 'fakeout') fetchFakeout(force);
        },
    };
})();
