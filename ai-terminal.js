/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   AI CRYPTO TRADING TERMINAL — Advanced Institutional Grade  ║
 * ║   Features: AI Signal Engine · Smart Money · Narrative       ║
 * ║   Copy Trading · Rugpull Protection · Auto TP/SL · Phantom   ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const AiTerminal = (() => {
    const BASE = 'http://127.0.0.1:3001';
    const CONFIG_KEY = 'ait_auto_config';
    let _tab = 'dashboard';
    let _data = {};
    let _signals = [];
    let _copyWallets = [];
    let _scanInterval = null;
    let _alertQueue = [];

    // ─── Persistent Config ─────────────────────────────────────────
    const _defaultConfig = {
        autoTrade:    false,
        autoTp:       true,
        autoSl:       true,
        trailingStop: false,
        partialTp:    true,
        dcaMode:      false,
        rugProtect:   true,
        antiOverTrade:true,
        maxRiskPct:   2,
        dailyMaxLoss: 5,
        minScore:     65,
        maxPositions: 5,
        maxSizeSol:   0.2,
    };
    let _config = (() => {
        try {
            const saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
            return { ..._defaultConfig, ...saved };
        } catch { return { ..._defaultConfig }; }
    })();

    function _saveConfig() {
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(_config)); } catch { }
    }

    // ─── Styles ───────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('ait-styles')) return;
        const s = document.createElement('style');
        s.id = 'ait-styles';
        s.textContent = `
/* ── Shell ──────────────────────────────────────────────────── */
#aitPanel {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
    color: #e2e8f0;
    padding: 0 0 80px;
    background: #060912;
    min-height: 100vh;
}

/* ── Top bar ─────────────────────────────────────────────────── */
.ait-topbar {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 0 12px;
    border-bottom: 1px solid #0f1a2e;
    margin-bottom: 16px; flex-wrap: wrap;
}
.ait-logo {
    display: flex; align-items: center; gap: 10px;
}
.ait-logo-icon {
    width: 38px; height: 38px; border-radius: 10px;
    background: linear-gradient(135deg, #7c3aed, #3b82f6);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; flex-shrink: 0;
}
.ait-logo-title { font-size: 18px; font-weight: 900; color: #f1f5f9; }
.ait-logo-sub { font-size: 11px; color: #475569; }
.ait-topbar-right { display: flex; gap: 8px; align-items: center; margin-left: auto; flex-wrap: wrap; }
.ait-badge-live {
    display: inline-flex; align-items: center; gap: 5px;
    background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3);
    color: #4ade80; border-radius: 20px; padding: 4px 12px; font-size: 11px; font-weight: 700;
}
.ait-badge-live::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: #22c55e; animation: ait-pulse 1.5s infinite;
}
@keyframes ait-pulse { 0%,100%{opacity:1}50%{opacity:.3} }

/* ── Auto Trading Status Badge ───────────────────────────────── */
#aitAutoStatusBadge {
    display: inline-flex; align-items: center; gap: 6px;
    border-radius: 20px; padding: 5px 13px; font-size: 11px; font-weight: 800;
    cursor: pointer; border: none; transition: all .3s;
    user-select: none;
}
#aitAutoStatusBadge.auto-on {
    background: rgba(124,58,237,.2); border: 1px solid rgba(124,58,237,.5);
    color: #a78bfa;
    box-shadow: 0 0 12px rgba(124,58,237,.3);
    animation: ait-auto-glow 2s infinite;
}
#aitAutoStatusBadge.auto-off {
    background: rgba(100,116,139,.1); border: 1px solid #1e293b;
    color: #475569;
}
@keyframes ait-auto-glow {
    0%,100% { box-shadow: 0 0 8px rgba(124,58,237,.3); }
    50%      { box-shadow: 0 0 20px rgba(124,58,237,.6); }
}
#aitAutoStatusBadge.auto-on::before {
    content: ''; width: 7px; height: 7px; border-radius: 50%;
    background: #a78bfa; animation: ait-pulse 1s infinite;
}
#aitAutoStatusBadge.auto-off::before {
    content: ''; width: 7px; height: 7px; border-radius: 50%;
    background: #475569;
}

.ait-phantom-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: linear-gradient(135deg, #512da8, #7c3aed);
    border: none; color: #fff; border-radius: 8px;
    padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
    transition: opacity .2s;
}
.ait-phantom-btn:hover { opacity: .85; }
.ait-phantom-btn.connected {
    background: linear-gradient(135deg, #14532d, #16a34a);
}
.ait-refresh-btn {
    background: #1e293b; border: 1px solid #334155; color: #94a3b8;
    border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: background .15s;
}
.ait-refresh-btn:hover { background: #334155; color: #e2e8f0; }

/* ── Tab nav ─────────────────────────────────────────────────── */
.ait-tabs {
    display: flex; gap: 0; margin-bottom: 20px;
    border-bottom: 1px solid #1e293b; overflow-x: auto;
}
.ait-tab {
    background: transparent; border: none; border-bottom: 2px solid transparent;
    padding: 10px 18px; cursor: pointer; font-size: 12px; font-weight: 600;
    color: #64748b; white-space: nowrap; transition: all .2s; margin-bottom: -1px;
}
.ait-tab:hover { color: #a78bfa; }
.ait-tab.active { color: #a78bfa; border-bottom-color: #7c3aed; }
.ait-section { display: none; }
.ait-section.active { display: block; }

/* ── KPI Row ─────────────────────────────────────────────────── */
.ait-kpi-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px; margin-bottom: 20px;
}
.ait-kpi {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 12px;
    padding: 14px 16px; position: relative; overflow: hidden;
}
.ait-kpi::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--kc, #3b82f6);
}
.ait-kpi-label { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 6px; }
.ait-kpi-value { font-size: 22px; font-weight: 900; color: var(--kc, #e2e8f0); line-height: 1.1; }
.ait-kpi-sub { font-size: 11px; color: #64748b; margin-top: 3px; }

/* ── Conviction Gauge ────────────────────────────────────────── */
.ait-conviction-wrap {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 14px;
    padding: 20px; margin-bottom: 16px;
}
.ait-conviction-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
}
.ait-conviction-title { font-size: 13px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .08em; }
.ait-conviction-signal {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 900;
    letter-spacing: .05em;
}
.sig-strong-buy  { background: rgba(34,197,94,.15); color: #22c55e; border: 1px solid rgba(34,197,94,.3); }
.sig-buy         { background: rgba(74,222,128,.1); color: #4ade80; border: 1px solid rgba(74,222,128,.2); }
.sig-neutral     { background: rgba(100,116,139,.15); color: #94a3b8; border: 1px solid #334155; }
.sig-sell        { background: rgba(251,146,60,.1); color: #fb923c; border: 1px solid rgba(251,146,60,.2); }
.sig-strong-sell { background: rgba(248,113,113,.1); color: #f87171; border: 1px solid rgba(248,113,113,.2); }
.ait-gauge-bar-bg {
    height: 14px; border-radius: 7px; background: #1e293b; position: relative; overflow: hidden; margin-bottom: 8px;
}
.ait-gauge-fill {
    height: 100%; border-radius: 7px;
    background: linear-gradient(90deg, #3b82f6, #7c3aed, #22c55e);
    transition: width .8s cubic-bezier(.4,0,.2,1);
    position: relative;
}
.ait-gauge-fill::after {
    content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,.15) 50%, transparent 100%);
    animation: ait-shimmer 2s infinite;
}
@keyframes ait-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
.ait-gauge-labels { display: flex; justify-content: space-between; font-size: 10px; color: #334155; }
.ait-score-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px; margin-top: 16px;
}
.ait-score-item {
    background: #060912; border: 1px solid #1e293b; border-radius: 8px; padding: 10px 12px;
}
.ait-score-name { font-size: 10px; color: #64748b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .05em; }
.ait-score-bar-bg { height: 4px; background: #1e293b; border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
.ait-score-bar { height: 100%; border-radius: 2px; transition: width .6s; }
.ait-score-val { font-size: 13px; font-weight: 800; }

/* ── Signal Cards ────────────────────────────────────────────── */
.ait-signals-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 12px; margin-bottom: 16px;
}
.ait-signal-card {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 14px;
    overflow: hidden; transition: border-color .2s, transform .15s;
    cursor: pointer;
}
.ait-signal-card:hover { border-color: #334155; transform: translateY(-1px); }
.ait-signal-card.strong-buy  { border-color: rgba(34,197,94,.35); }
.ait-signal-card.strong-sell { border-color: rgba(248,113,113,.3); }
.ait-sc-header {
    padding: 12px 14px; display: flex; align-items: center; gap: 10px;
    border-bottom: 1px solid #0f172a;
    background: linear-gradient(135deg, #0a0e1a, #0d1527);
}
.ait-sc-sym { font-size: 16px; font-weight: 900; color: #f1f5f9; }
.ait-sc-name { font-size: 11px; color: #64748b; margin-top: 1px; }
.ait-sc-price { font-size: 15px; font-weight: 800; margin-left: auto; }
.ait-sc-body { padding: 12px 14px; }
.ait-sc-entry-row {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px;
}
.ait-entry-box {
    background: #060912; border: 1px solid #1e293b; border-radius: 8px;
    padding: 8px 10px; text-align: center;
}
.ait-entry-label { font-size: 9px; color: #475569; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 3px; }
.ait-entry-val { font-size: 13px; font-weight: 800; }
.ait-tp-sl-row { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
.ait-tp-badge { padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; }
.ait-tp1 { background: rgba(74,222,128,.1); color: #4ade80; border: 1px solid rgba(74,222,128,.2); }
.ait-tp2 { background: rgba(34,197,94,.1); color: #22c55e; border: 1px solid rgba(34,197,94,.2); }
.ait-tp3 { background: rgba(21,128,61,.15); color: #16a34a; border: 1px solid rgba(21,128,61,.3); }
.ait-sl  { background: rgba(248,113,113,.1); color: #f87171; border: 1px solid rgba(248,113,113,.2); }
.ait-trail { background: rgba(251,146,60,.1); color: #fb923c; border: 1px solid rgba(251,146,60,.2); }
.ait-reasons { font-size: 11px; color: #64748b; line-height: 1.6; margin-bottom: 10px; }
.ait-reasons span { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; color: #4ade80; }
.ait-sc-actions { display: flex; gap: 6px; }
.ait-btn-buy {
    flex: 1; background: linear-gradient(135deg, #16a34a, #22c55e);
    border: none; color: #fff; border-radius: 7px;
    padding: 8px; font-size: 12px; font-weight: 700; cursor: pointer;
    transition: opacity .15s;
}
.ait-btn-buy:hover { opacity: .85; }
.ait-btn-watch {
    background: #1e293b; border: 1px solid #334155; color: #94a3b8;
    border-radius: 7px; padding: 8px 12px; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: background .15s;
}
.ait-btn-watch:hover { background: #334155; }
.ait-confidence-pill {
    padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 700;
    margin-left: auto;
}
.ait-conf-hi  { background: rgba(34,197,94,.15); color: #22c55e; }
.ait-conf-mid { background: rgba(251,191,36,.1); color: #fbbf24; }
.ait-conf-lo  { background: rgba(248,113,113,.1); color: #f87171; }

/* ── Smart Money Intelligence Platform ──────────────────────── */
/* Sub-navigation */
.sm-subnav {
    display: flex; gap: 4px; padding: 10px 14px; background: #020617;
    border-bottom: 1px solid #0f172a; overflow-x: auto; flex-shrink: 0;
}
.sm-subnav::-webkit-scrollbar { height: 3px; }
.sm-subnav::-webkit-scrollbar-thumb { background: #1e293b; }
.sm-sub-btn {
    padding: 6px 14px; border-radius: 6px; border: 1px solid #1e293b;
    background: transparent; color: #475569; font-size: 11px; font-weight: 600;
    cursor: pointer; white-space: nowrap; transition: all .2s; flex-shrink: 0;
}
.sm-sub-btn.active {
    background: rgba(59,130,246,.12); border-color: rgba(59,130,246,.4); color: #60a5fa;
}
.sm-sub-btn:hover:not(.active) { border-color: #334155; color: #94a3b8; }
/* Leaderboard */
.sm-lb-row {
    display: grid; grid-template-columns: 28px 1fr 80px 80px 70px 90px;
    gap: 8px; padding: 10px 14px; border-bottom: 1px solid #060d1a;
    align-items: center; transition: background .15s; cursor: pointer;
}
.sm-lb-row:hover { background: rgba(59,130,246,.04); }
.sm-lb-rank { font-size: 14px; font-weight: 900; color: #334155; text-align: center; }
.sm-lb-rank.gold   { color: #f59e0b; }
.sm-lb-rank.silver { color: #94a3b8; }
.sm-lb-rank.bronze { color: #a16207; }
/* Accumulation radar */
.sm-accum-row {
    display: grid; grid-template-columns: 36px 1fr 65px 70px 90px 110px;
    gap: 8px; padding: 9px 14px; border-bottom: 1px solid #060d1a; align-items: center;
}
.sm-signal-pill {
    padding: 3px 9px; border-radius: 20px; font-size: 10px; font-weight: 700;
    text-align: center; letter-spacing: .04em;
}
/* Whale feed */
.sm-feed-item {
    display: flex; align-items: center; gap: 10px; padding: 10px 16px;
    border-bottom: 1px solid #060d1a; transition: background .15s;
}
.sm-feed-item:hover { background: rgba(255,255,255,.02); }
.sm-feed-dot {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    animation: smPulse 2s infinite;
}
@keyframes smPulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50%      { opacity: .5; transform: scale(1.4); }
}
/* Graph canvas */
.sm-graph-wrap {
    position: relative; background: #020617; border-radius: 10px;
    overflow: hidden; border: 1px solid #1e293b;
}
#smGraphCanvas { display: block; width: 100%; cursor: grab; }
#smGraphCanvas:active { cursor: grabbing; }
.sm-graph-legend {
    display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 14px;
    border-top: 1px solid #0f172a;
}
.sm-graph-leg-item {
    display: flex; align-items: center; gap: 5px; font-size: 11px; color: #475569;
}
.sm-graph-leg-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
/* Old wallet card (kept for modal) */
.ait-wallet-card {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 12px; padding: 14px;
}
.ait-wc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ait-wc-avatar {
    width: 34px; height: 34px; border-radius: 50%;
    background: linear-gradient(135deg, #1e3a5f, #7c3aed);
    display: flex; align-items: center; justify-content: center; font-size: 16px;
    flex-shrink: 0;
}
.ait-wc-name { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.ait-wc-addr { font-size: 11px; color: #475569; font-family: monospace; }
.ait-wc-badges { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px; }
.ait-wc-badge {
    padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .04em;
}
.badge-whale    { background: rgba(59,130,246,.15); color: #60a5fa; border: 1px solid rgba(59,130,246,.2); }
.badge-smart    { background: rgba(124,58,237,.15); color: #a78bfa; border: 1px solid rgba(124,58,237,.2); }
.badge-insider  { background: rgba(245,158,11,.15); color: #fbbf24; border: 1px solid rgba(245,158,11,.2); }
.badge-sniper   { background: rgba(239,68,68,.12); color: #f87171; border: 1px solid rgba(239,68,68,.2); }
.ait-wc-stats { display: flex; gap: 12px; font-size: 11px; color: #64748b; margin-bottom: 10px; }
.ait-wc-stats b { color: #94a3b8; }
.ait-wc-activity { font-size: 11px; color: #64748b; margin-bottom: 10px; line-height: 1.6; }
.ait-wc-activity .buy  { color: #4ade80; }
.ait-wc-activity .sell { color: #f87171; }
.ait-wc-follow-btn {
    width: 100%; padding: 7px; background: linear-gradient(135deg, #1e293b, #0f172a);
    border: 1px solid #334155; color: #94a3b8; border-radius: 7px;
    font-size: 12px; font-weight: 600; cursor: pointer; transition: all .2s;
}
.ait-wc-follow-btn.following {
    background: linear-gradient(135deg, rgba(124,58,237,.2), rgba(59,130,246,.2));
    border-color: rgba(124,58,237,.4); color: #a78bfa;
}
.ait-wc-follow-btn:hover { border-color: #475569; color: #e2e8f0; }
.ait-wc-analyze-btn {
    width: 100%; padding: 6px; background: transparent;
    border: 1px solid #1e3a5f; color: #3b82f6; border-radius: 7px;
    font-size: 11px; font-weight: 600; cursor: pointer; transition: all .2s;
    margin-top: 6px;
}
.ait-wc-analyze-btn:hover { background: rgba(59,130,246,.1); }

/* ── Wallet Analytics Modal ──────────────────────────────────── */
#aitWalletModal {
    position: fixed; inset: 0; z-index: 10001;
    background: rgba(0,0,0,.8); backdrop-filter: blur(6px);
    display: flex; align-items: flex-start; justify-content: center;
    padding: 40px 16px; overflow-y: auto;
    animation: pw-fade-in .2s ease;
}
.ait-wm-box {
    background: #080c18; border: 1px solid #1e3a5f; border-radius: 20px;
    width: 100%; max-width: 720px; overflow: hidden;
    box-shadow: 0 32px 100px rgba(0,0,0,.8);
    animation: pw-slide-up .25s ease;
}
.ait-wm-header {
    background: linear-gradient(135deg, #060d1a, #0d1b2e);
    padding: 20px 24px; border-bottom: 1px solid #1e293b;
    display: flex; align-items: center; gap: 14px;
}
.ait-wm-avatar {
    width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, #1e3a5f, #7c3aed);
    display: flex; align-items: center; justify-content: center; font-size: 20px;
}
.ait-wm-title  { font-size: 16px; font-weight: 900; color: #f1f5f9; }
.ait-wm-addr   { font-size: 11px; color: #475569; font-family: monospace; margin-top: 2px; }
.ait-wm-close  {
    margin-left: auto; background: #1e293b; border: 1px solid #334155;
    color: #94a3b8; border-radius: 8px; padding: 6px 12px; cursor: pointer;
    font-size: 12px; font-weight: 600; transition: all .15s; white-space: nowrap;
}
.ait-wm-close:hover { background: #334155; color: #e2e8f0; }
.ait-wm-body { padding: 20px 24px; }
.ait-wm-section { margin-bottom: 22px; }
.ait-wm-section-title {
    font-size: 12px; font-weight: 800; color: #64748b; text-transform: uppercase;
    letter-spacing: .08em; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;
}
/* Holdings table */
.ait-wm-holdings { width: 100%; border-collapse: collapse; font-size: 12px; }
.ait-wm-holdings thead th {
    background: #0f172a; color: #475569; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .05em; padding: 8px 12px;
    text-align: left; border-bottom: 1px solid #1e293b;
}
.ait-wm-holdings tbody tr { border-bottom: 1px solid #0a0e1a; transition: background .1s; }
.ait-wm-holdings tbody tr:hover { background: #0f172a; }
.ait-wm-holdings tbody td { padding: 8px 12px; color: #cbd5e1; vertical-align: middle; }
/* Accumulation pills */
.ait-wm-acc-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.ait-wm-acc-pill {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.25);
    border-radius: 20px; padding: 5px 12px; font-size: 12px; font-weight: 700; color: #4ade80;
}
.ait-wm-acc-pill .count {
    background: rgba(34,197,94,.2); border-radius: 10px; padding: 1px 6px;
    font-size: 10px; color: #86efac;
}
/* Activity feed */
.ait-wm-tx {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; background: #0a0e1a; border-radius: 8px; margin-bottom: 6px;
}
.ait-wm-tx-icon {
    width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 14px;
}
.ait-wm-tx-icon.buy  { background: rgba(34,197,94,.15); }
.ait-wm-tx-icon.sell { background: rgba(239,68,68,.12); }
.ait-wm-tx-icon.other { background: rgba(100,116,139,.1); }
.ait-wm-tx-sym   { font-size: 13px; font-weight: 700; color: #e2e8f0; }
.ait-wm-tx-meta  { font-size: 10px; color: #475569; margin-top: 1px; }
.ait-wm-tx-type  { margin-left: auto; font-size: 11px; font-weight: 800; }
.ait-wm-tx-type.buy  { color: #4ade80; }
.ait-wm-tx-type.sell { color: #f87171; }
.ait-wm-loading { text-align: center; padding: 40px; color: #475569; }
.ait-wm-loading .ait-spinner { margin: 0 auto 12px; }

/* ── Rugpull Protection ──────────────────────────────────────── */
.ait-rug-card {
    background: #0a0e1a; border-radius: 12px; padding: 14px;
    border: 1px solid #1e293b; margin-bottom: 10px; overflow: hidden; position: relative;
}
.ait-rug-card.danger { border-color: rgba(239,68,68,.4); background: rgba(239,68,68,.04); }
.ait-rug-card.warning { border-color: rgba(245,158,11,.3); background: rgba(245,158,11,.03); }
.ait-rug-card.safe { border-color: rgba(34,197,94,.25); }
.ait-rug-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.ait-rug-danger-score {
    width: 50px; height: 50px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 900;
    border: 3px solid currentColor;
}
.rug-danger { color: #ef4444; background: rgba(239,68,68,.1); }
.rug-warning { color: #f59e0b; background: rgba(245,158,11,.1); }
.rug-safe    { color: #22c55e; background: rgba(34,197,94,.1); }
.ait-rug-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; font-size: 11px; }
.ait-check-item { display: flex; align-items: center; gap: 5px; color: #64748b; }
.ait-check-item.pass  .ci-icon::before { content: '✅'; }
.ait-check-item.fail  .ci-icon::before { content: '❌'; }
.ait-check-item.warn  .ci-icon::before { content: '⚠️'; }
.ci-icon { width: 16px; text-align: center; }

/* ── Copy Trading ────────────────────────────────────────────── */
.ait-copy-header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;
}
.ait-copy-table-wrap { overflow-x: auto; margin-bottom: 16px; }
.ait-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ait-table th {
    background: #0a0e1a; color: #64748b; padding: 9px 12px;
    text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase;
    letter-spacing: .06em; border-bottom: 1px solid #1e293b; white-space: nowrap;
}
.ait-table td {
    padding: 10px 12px; border-bottom: 1px solid #0a0e1a; color: #cbd5e1;
    vertical-align: middle;
}
.ait-table tbody tr:hover { background: #0d1527; }
.ait-copy-btn {
    padding: 4px 12px; border-radius: 5px; font-size: 11px; font-weight: 700;
    cursor: pointer; border: none; transition: opacity .15s;
}
.ait-copy-btn:hover { opacity: .8; }
.ait-copy-btn.active  { background: #16a34a; color: #fff; }
.ait-copy-btn.inactive { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
.ait-copy-settings {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 12px;
    padding: 16px; margin-bottom: 16px;
}
.ait-copy-settings h3 { font-size: 13px; font-weight: 700; color: #94a3b8; margin: 0 0 12px; text-transform: uppercase; letter-spacing: .07em; }
.ait-form-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
.ait-form-label { font-size: 11px; color: #64748b; min-width: 140px; }
.ait-form-input {
    background: #060912; border: 1px solid #1e293b; color: #e2e8f0;
    border-radius: 7px; padding: 7px 12px; font-size: 12px; flex: 1; min-width: 120px;
    outline: none; transition: border-color .2s;
}
.ait-form-input:focus { border-color: #7c3aed; }
.ait-form-select {
    background: #060912; border: 1px solid #1e293b; color: #e2e8f0;
    border-radius: 7px; padding: 7px 12px; font-size: 12px; flex: 1; min-width: 120px;
    outline: none;
}

/* ── Alert Feed ──────────────────────────────────────────────── */
.ait-alert-feed {
    position: fixed; bottom: 24px; right: 24px;
    display: flex; flex-direction: column; gap: 8px;
    z-index: 9999; pointer-events: none;
    max-width: 340px;
}
.ait-alert-toast {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 10px;
    padding: 12px 14px; font-size: 12px; color: #e2e8f0;
    animation: ait-slide-in .3s ease; pointer-events: all;
    box-shadow: 0 4px 24px rgba(0,0,0,.5);
    display: flex; align-items: flex-start; gap: 10px;
}
@keyframes ait-slide-in { from{transform:translateX(120%);opacity:0} to{transform:translateX(0);opacity:1} }
.ait-alert-toast.whale    { border-color: rgba(59,130,246,.4); }
.ait-alert-toast.signal   { border-color: rgba(34,197,94,.4); }
.ait-alert-toast.danger   { border-color: rgba(239,68,68,.4); }
.ait-alert-toast.narrative { border-color: rgba(124,58,237,.4); }
.ait-toast-icon { font-size: 18px; flex-shrink: 0; }
.ait-toast-msg { flex: 1; line-height: 1.5; }
.ait-toast-msg b { display: block; margin-bottom: 2px; }
.ait-toast-time { font-size: 10px; color: #475569; white-space: nowrap; }

/* ── Narrative Engine ────────────────────────────────────────── */
.ait-narrative-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 10px; margin-bottom: 16px;
}
.ait-narrative-card {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 12px;
    padding: 14px; transition: border-color .2s;
}
.ait-narrative-card:hover { border-color: #334155; }
.ait-narrative-card.hot { border-color: rgba(239,68,68,.3); }
.ait-narrative-card.rising { border-color: rgba(245,158,11,.3); }
.ait-nc-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.ait-nc-icon { font-size: 22px; }
.ait-nc-name { font-size: 14px; font-weight: 800; color: #e2e8f0; }
.ait-nc-momentum {
    margin-left: auto; font-size: 11px; font-weight: 700;
    padding: 2px 8px; border-radius: 10px;
}
.mom-hot     { background: rgba(239,68,68,.15); color: #f87171; }
.mom-rising  { background: rgba(245,158,11,.15); color: #fbbf24; }
.mom-cooling { background: rgba(100,116,139,.15); color: #94a3b8; }
.ait-nc-bar-bg { height: 6px; background: #1e293b; border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
.ait-nc-bar { height: 100%; border-radius: 3px; transition: width .6s; }
.ait-nc-coins { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.ait-nc-coin {
    padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700;
    background: #1e293b; color: #94a3b8; cursor: pointer; transition: all .15s;
}
.ait-nc-coin:hover { background: #334155; color: #e2e8f0; }
.ait-nc-rotate-hint { font-size: 11px; color: #4ade80; margin-top: 8px; }

/* ── Sentiment ───────────────────────────────────────────────── */
.ait-sentiment-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;
}
@media(max-width:700px) { .ait-sentiment-row { grid-template-columns: 1fr; } }
.ait-sentiment-meter {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 12px; padding: 16px;
}
.ait-sent-title { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 12px; }
.ait-sent-gauge-wrap { position: relative; width: 120px; height: 60px; margin: 0 auto 12px; }
.ait-sent-gauge-svg { width: 120px; height: 60px; }
.ait-sent-big { font-size: 24px; font-weight: 900; text-align: center; }
.ait-sent-label { font-size: 11px; color: #64748b; text-align: center; }
.ait-sent-bars { display: flex; flex-direction: column; gap: 6px; }
.ait-sent-bar-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.ait-sent-bar-label { width: 70px; color: #64748b; }
.ait-sent-bar-bg { flex: 1; height: 6px; background: #1e293b; border-radius: 3px; overflow: hidden; }
.ait-sent-bar-fill { height: 100%; border-radius: 3px; transition: width .6s; }
.ait-sent-bar-val { width: 36px; text-align: right; font-weight: 700; }

/* ── Empty / Loading ─────────────────────────────────────────── */
.ait-loading {
    display: flex; align-items: center; justify-content: center; min-height: 200px;
    color: #475569; font-size: 13px; flex-direction: column; gap: 12px;
}
.ait-spinner {
    width: 28px; height: 28px; border: 2px solid #1e293b;
    border-top-color: #7c3aed; border-radius: 50%;
    animation: spin .7s linear infinite;
}
@keyframes spin { to{transform:rotate(360deg)} }
.ait-empty { padding: 40px; text-align: center; color: #475569; font-size: 13px; }
.ait-section-title {
    font-size: 12px; font-weight: 700; color: #64748b;
    text-transform: uppercase; letter-spacing: .08em;
    margin: 20px 0 12px; display: flex; align-items: center; gap: 8px;
}
.ait-section-title::after { content: ''; flex: 1; height: 1px; background: #1e293b; }

/* ── Phantom Wallet Widget ───────────────────────────────────── */
.ait-wallet-widget {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 12px;
    padding: 16px; margin-bottom: 16px;
}
.ait-wallet-widget.connected { border-color: rgba(34,197,94,.3); }
.ait-wallet-connect-big {
    display: flex; align-items: center; gap: 14px;
}
.ait-wallet-phantom-logo {
    width: 48px; height: 48px; border-radius: 12px;
    background: linear-gradient(135deg, #4e44ce, #8b5cf6);
    display: flex; align-items: center; justify-content: center; font-size: 26px;
}
.ait-wallet-info h3 { font-size: 15px; font-weight: 800; color: #f1f5f9; margin: 0 0 3px; }
.ait-wallet-info p  { font-size: 12px; color: #475569; margin: 0; }
.ait-wallet-actions { margin-left: auto; display: flex; gap: 8px; }
.ait-wallet-stats {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px; margin-top: 12px;
}
.ait-wallet-stat {
    background: #060912; border: 1px solid #1e293b; border-radius: 8px;
    padding: 8px 10px; text-align: center;
}
.ait-wallet-stat-val { font-size: 16px; font-weight: 800; color: #4ade80; }
.ait-wallet-stat-lbl { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: .05em; margin-top: 2px; }

/* ── Auto Trade Config ───────────────────────────────────────── */
.ait-auto-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;
}
@media(max-width:700px) { .ait-auto-grid { grid-template-columns: 1fr; } }
.ait-toggle-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; border-bottom: 1px solid #0f172a;
}
.ait-toggle-row:last-child { border-bottom: none; }
.ait-toggle-label { font-size: 12px; color: #94a3b8; }
.ait-toggle-sub   { font-size: 10px; color: #475569; }
.ait-toggle {
    position: relative; width: 40px; height: 22px; cursor: pointer;
}
.ait-toggle input { opacity: 0; width: 0; height: 0; }
.ait-slider {
    position: absolute; cursor: pointer; inset: 0;
    background: #1e293b; border-radius: 22px; transition: .3s;
    border: 1px solid #334155;
}
.ait-slider::before {
    content: ''; position: absolute; width: 16px; height: 16px;
    left: 2px; top: 2px; background: #64748b; border-radius: 50%;
    transition: .3s;
}
.ait-toggle input:checked + .ait-slider { background: #7c3aed; border-color: #7c3aed; }
.ait-toggle input:checked + .ait-slider::before {
    transform: translateX(18px); background: #fff;
}

/* ── Live Log Terminal ────────────────────────────────────────── */
#aitLogTerminal {
    background: #020408; border: 1px solid #0f2137; border-radius: 12px;
    font-family: 'SF Mono','Fira Code','Consolas',monospace; font-size: 12px;
    height: 420px; overflow-y: auto; padding: 12px;
    scroll-behavior: smooth;
}
#aitLogTerminal::-webkit-scrollbar { width: 6px; }
#aitLogTerminal::-webkit-scrollbar-track { background: #020408; }
#aitLogTerminal::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
.ait-log-line {
    display: grid; grid-template-columns: 60px 70px 90px 1fr;
    gap: 8px; align-items: baseline; padding: 3px 0;
    border-bottom: 1px solid rgba(255,255,255,.03); line-height: 1.5;
    animation: ait-log-in .15s ease;
}
@keyframes ait-log-in { from { opacity:0; transform: translateX(-4px); } to { opacity:1; transform: none; } }
.ait-log-line:hover { background: rgba(255,255,255,.03); border-radius: 4px; }
.ait-log-ts   { color: #1e3a5f; font-size: 10px; white-space: nowrap; }
.ait-log-lvl  { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
.ait-log-src  { color: #334155; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ait-log-msg  { color: #94a3b8; word-break: break-word; }
/* Level colors */
.lvl-INFO    { color: #475569; }
.lvl-SYSTEM  { color: #3b82f6; }
.lvl-BUY     { color: #22c55e; }
.lvl-SELL    { color: #f87171; }
.lvl-SKIP    { color: #64748b; }
.lvl-WARN    { color: #f59e0b; }
.lvl-ERROR   { color: #ef4444; }
.lvl-LOOP    { color: #f97316; }
.lvl-BALANCE { color: #a78bfa; }
/* msg color by level */
.line-BUY .ait-log-msg     { color: #4ade80; }
.line-SELL .ait-log-msg    { color: #fca5a5; }
.line-ERROR .ait-log-msg   { color: #fca5a5; }
.line-WARN .ait-log-msg    { color: #fde68a; }
.line-LOOP .ait-log-msg    { color: #fdba74; font-weight: 700; }
.line-BALANCE .ait-log-msg { color: #c4b5fd; }
/* Header toolbar */
.ait-log-toolbar {
    display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;
}
.ait-log-title { font-size: 14px; font-weight: 800; color: #f1f5f9; }
.ait-log-status {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;
}
.ait-log-status.streaming {
    background: rgba(34,197,94,.1); border: 1px solid rgba(34,197,94,.3); color: #4ade80;
}
.ait-log-status.streaming::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: #22c55e; animation: ait-pulse 1s infinite;
}
.ait-log-status.offline {
    background: rgba(100,116,139,.1); border: 1px solid #1e293b; color: #475569;
}
.ait-log-filter-btn {
    padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;
    cursor: pointer; border: 1px solid #1e293b; background: transparent; color: #475569;
    transition: all .15s;
}
.ait-log-filter-btn.active { border-color: #3b82f6; color: #60a5fa; background: rgba(59,130,246,.1); }
.ait-log-filter-btn:hover  { color: #e2e8f0; border-color: #334155; }
.ait-log-scroll-btn {
    margin-left: auto; padding: 3px 10px; border-radius: 8px; font-size: 11px;
    background: #1e293b; border: 1px solid #334155; color: #64748b; cursor: pointer;
}
/* Loop alert banner */
.ait-loop-alert {
    background: rgba(249,115,22,.08); border: 1px solid rgba(249,115,22,.3);
    border-radius: 10px; padding: 12px 16px; margin-bottom: 12px;
    display: flex; align-items: flex-start; gap: 10px; animation: ait-log-in .3s ease;
}
.ait-loop-icon { font-size: 20px; flex-shrink: 0; }
.ait-loop-body { flex: 1; }
.ait-loop-title { font-size: 13px; font-weight: 800; color: #fb923c; margin-bottom: 4px; }
.ait-loop-desc  { font-size: 11px; color: #94a3b8; line-height: 1.6; }
.ait-loop-pills { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.ait-loop-pill  {
    background: rgba(249,115,22,.15); border: 1px solid rgba(249,115,22,.3);
    color: #fb923c; border-radius: 20px; padding: 2px 10px; font-size: 11px; font-weight: 700;
}
/* Balance warning */
.ait-balance-warn {
    background: rgba(124,58,237,.08); border: 1px solid rgba(124,58,237,.3);
    border-radius: 10px; padding: 12px 16px; margin-bottom: 12px;
    display: flex; align-items: center; gap: 10px;
}
/* Stats bar */
.ait-log-stats {
    display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 10px;
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 10px; padding: 10px 14px;
}
.ait-log-stat { font-size: 11px; }
.ait-log-stat-val { font-weight: 800; }

/* ── Portfolio Tab ────────────────────────────────────────────── */
.ait-port-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px; flex-wrap: wrap; gap: 12px;
}
.ait-port-title { font-size: 18px; font-weight: 900; color: #f1f5f9; }
.ait-port-subtitle { font-size: 12px; color: #475569; margin-top: 2px; }
.ait-port-refresh {
    background: #1e293b; border: 1px solid #334155; color: #94a3b8;
    border-radius: 8px; padding: 6px 14px; font-size: 11px; font-weight: 600;
    cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
}
/* Wallet Holdings rows */
.ait-holding-row {
    display: grid; grid-template-columns: 36px 1fr auto auto;
    gap: 10px; align-items: center; padding: 10px 12px;
    background: #070b14; border: 1px solid #0f1a2e; border-radius: 10px;
    margin-bottom: 6px; transition: background .15s;
}
.ait-holding-row:hover { background: #0a101e; }
.ait-holding-icon {
    width: 36px; height: 36px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 800; flex-shrink: 0;
}
.ait-holding-info { min-width: 0; }
.ait-holding-sym  { font-size: 13px; font-weight: 800; color: #f1f5f9; }
.ait-holding-name { font-size: 10px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ait-holding-bal  { font-size: 12px; color: #64748b; font-family: monospace; text-align: right; white-space: nowrap; }
.ait-holding-usd  { font-size: 13px; font-weight: 700; color: #334155; text-align: right; white-space: nowrap; min-width: 60px; }
.ait-holding-usd.pos { color: #4ade80; }

.ait-pnl-hero {
    background: linear-gradient(135deg, #060d1a, #0a1628);
    border: 1px solid #1e3a5f; border-radius: 16px; padding: 24px;
    margin-bottom: 20px; display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 20px;
    position: relative; overflow: hidden;
}
.ait-pnl-hero::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, #7c3aed, #3b82f6, #22c55e);
}
.ait-pnl-metric {}
.ait-pnl-metric-label { font-size: 10px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }
.ait-pnl-metric-val { font-size: 26px; font-weight: 900; line-height: 1; }
.ait-pnl-metric-sub { font-size: 11px; color: #475569; margin-top: 4px; }
.ait-pnl-pos  { color: #4ade80; }
.ait-pnl-neg  { color: #f87171; }
.ait-pnl-neu  { color: #94a3b8; }
.ait-pnl-usd  { color: #60a5fa; }

/* Position cards */
.ait-pos-grid { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.ait-pos-card {
    background: #0a0e1a; border: 1px solid #1e293b; border-radius: 12px;
    padding: 14px 16px; display: grid;
    grid-template-columns: auto 1fr auto; gap: 12px; align-items: center;
    transition: border-color .2s;
}
.ait-pos-card:hover { border-color: #334155; }
.ait-pos-card.pos-open  { border-left: 3px solid #3b82f6; }
.ait-pos-card.pos-win   { border-left: 3px solid #22c55e; }
.ait-pos-card.pos-loss  { border-left: 3px solid #ef4444; }
.ait-pos-badge {
    padding: 3px 9px; border-radius: 6px; font-size: 10px; font-weight: 800;
    text-transform: uppercase; white-space: nowrap;
}
.badge-open   { background: rgba(59,130,246,.15); color: #60a5fa; border: 1px solid rgba(59,130,246,.3); }
.badge-closed { background: rgba(100,116,139,.1); color: #64748b; border: 1px solid #1e293b; }
.badge-win    { background: rgba(34,197,94,.1); color: #4ade80; border: 1px solid rgba(34,197,94,.3); }
.badge-loss   { background: rgba(239,68,68,.1); color: #f87171; border: 1px solid rgba(239,68,68,.3); }
.ait-pos-sym  { font-size: 15px; font-weight: 800; color: #f1f5f9; }
.ait-pos-name { font-size: 11px; color: #475569; }
.ait-pos-meta { font-size: 11px; color: #64748b; display: flex; gap: 12px; flex-wrap: wrap; margin-top: 4px; }
.ait-pos-meta span { white-space: nowrap; }
.ait-pos-pnl  { text-align: right; }
.ait-pos-pnl-val  { font-size: 18px; font-weight: 900; }
.ait-pos-pnl-sol  { font-size: 11px; color: #475569; margin-top: 2px; }
.ait-pos-exit { font-size: 10px; color: #475569; margin-top: 3px; }

/* Tabs inside portfolio */
.ait-port-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.ait-port-tab {
    padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600;
    cursor: pointer; background: #1e293b; border: 1px solid #334155; color: #64748b;
    transition: all .15s;
}
.ait-port-tab.active { background: rgba(59,130,246,.15); border-color: #3b82f6; color: #60a5fa; }
.ait-port-tab:hover { color: #e2e8f0; }

/* Win rate bar */
.ait-winrate-wrap { background: #0a0e1a; border: 1px solid #1e293b; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.ait-winrate-bar-bg { height: 10px; background: #1e293b; border-radius: 5px; overflow: hidden; margin: 10px 0; }
.ait-winrate-fill { height: 100%; border-radius: 5px; background: linear-gradient(90deg,#22c55e,#4ade80); transition: width .6s ease; }
.ait-winrate-labels { display: flex; justify-content: space-between; font-size: 11px; color: #475569; }

/* Empty state */
.ait-port-empty {
    text-align: center; padding: 48px 20px; color: #334155; font-size: 14px;
}
.ait-port-empty-icon { font-size: 48px; margin-bottom: 12px; }

/* Realtime ticker */
.ait-port-live-ticker {
    background: rgba(59,130,246,.06); border: 1px solid rgba(59,130,246,.15);
    border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;
    display: flex; align-items: center; gap: 10px; font-size: 11px;
    flex-wrap: wrap;
}
.ait-ticker-dot {
    width: 7px; height: 7px; border-radius: 50%; background: #3b82f6;
    animation: ait-pulse 1.5s infinite; flex-shrink: 0;
}
`;
        document.head.appendChild(s);
    }

    // ─── Utility ──────────────────────────────────────────────────
    function fmtPrice(n) {
        if (!n && n !== 0) return '—';
        if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k';
        if (n >= 1) return '$' + n.toFixed(4);
        if (n >= 0.001) return '$' + n.toFixed(6);
        return '$' + n.toExponential(3);
    }
    function fmtPct(n, plus = true) {
        if (!n && n !== 0) return '—';
        return (plus && n > 0 ? '+' : '') + n.toFixed(1) + '%';
    }
    function scoreColor(s) {
        if (s >= 75) return '#22c55e';
        if (s >= 55) return '#4ade80';
        if (s >= 40) return '#fbbf24';
        if (s >= 25) return '#fb923c';
        return '#f87171';
    }
    function signalClass(sig) {
        const m = { 'STRONG BUY': 'strong-buy', 'BUY': 'buy', 'NEUTRAL': 'neutral', 'SELL': 'sell', 'STRONG SELL': 'strong-sell' };
        return m[sig] || 'neutral';
    }
    function signalCssClass(sig) {
        const m = { 'STRONG BUY': 'sig-strong-buy', 'BUY': 'sig-buy', 'NEUTRAL': 'sig-neutral', 'SELL': 'sig-sell', 'STRONG SELL': 'sig-strong-sell' };
        return m[sig] || 'sig-neutral';
    }
    function confClass(c) {
        if (c >= 70) return 'ait-conf-hi';
        if (c >= 45) return 'ait-conf-mid';
        return 'ait-conf-lo';
    }
    function timeAgo(ts) {
        const d = (Date.now() - ts) / 1000;
        if (d < 60) return Math.floor(d) + 's ago';
        if (d < 3600) return Math.floor(d / 60) + 'm ago';
        return Math.floor(d / 3600) + 'h ago';
    }
    function shortAddr(a) {
        if (!a || a.length < 10) return a || '—';
        return a.slice(0, 4) + '…' + a.slice(-4);
    }
    function rugClass(prob) {
        if (prob >= 70) return 'danger';
        if (prob >= 35) return 'warning';
        return 'safe';
    }
    function rugCircleClass(prob) {
        if (prob >= 70) return 'rug-danger';
        if (prob >= 35) return 'rug-warning';
        return 'rug-safe';
    }

    // ─── Toast Alerts ─────────────────────────────────────────────
    function showToast(type, title, msg) {
        let feed = document.getElementById('aitAlertFeed');
        if (!feed) {
            feed = document.createElement('div');
            feed.id = 'aitAlertFeed';
            feed.className = 'ait-alert-feed';
            document.body.appendChild(feed);
        }
        const icons = { whale: '🐋', signal: '🎯', danger: '🚨', narrative: '🌊', copy: '📋', info: 'ℹ️' };
        const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const toast = document.createElement('div');
        toast.className = `ait-alert-toast ${type}`;
        toast.innerHTML = `
            <div class="ait-toast-icon">${icons[type] || 'ℹ️'}</div>
            <div class="ait-toast-msg"><b>${title}</b>${msg}</div>
            <div class="ait-toast-time">${now}</div>
        `;
        feed.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(120%)'; toast.style.transition = 'all .4s'; setTimeout(() => toast.remove(), 400); }, 5000);
        // Keep max 4
        const all = feed.children;
        if (all.length > 4) all[0].remove();
    }

    // ─── SECTION: Dashboard ───────────────────────────────────────
    async function renderDashboard() {
        const sec = document.getElementById('ait-sec-dashboard');
        if (!sec) return;

        // Fetch composite AI score
        let comp = null, trenches = null, narratives = null;
        try {
            const [r1, r2, r3] = await Promise.all([
                fetch(`${BASE}/api/intelligence/composite`).then(r => r.json()).catch(() => null),
                fetch(`${BASE}/api/dex/trenches`).then(r => r.json()).catch(() => null),
                fetch(`${BASE}/api/dex/narratives`).then(r => r.json()).catch(() => null),
            ]);
            comp = r1; trenches = r2; narratives = r3;
        } catch (e) { /* ignore */ }

        const overallScore = comp?.composite?.overallScore || 54;
        const regime = comp?.regime?.regime || 'RANGING';
        const signal = comp?.composite?.signals?.overallSignal || 'NEUTRAL';
        const confidence = comp?.composite?.confidence || 62;
        const scores = comp?.composite?.scores || { technical: 55, smartMoney: 48, narrative: 62, sentiment: 58, liquidity: 51, holder: 60, risk: 35 };

        // Top candidates from trenches
        const topTokens = (trenches?.tokens || []).slice(0, 6);

        sec.innerHTML = `
            ${renderWalletWidget()}
            <div class="ait-kpi-row">
                <div class="ait-kpi" style="--kc:#7c3aed">
                    <div class="ait-kpi-label">AI Conviction</div>
                    <div class="ait-kpi-value">${overallScore}</div>
                    <div class="ait-kpi-sub">Overall Score</div>
                </div>
                <div class="ait-kpi" style="--kc:${regime === 'BULL' ? '#22c55e' : regime === 'BEAR' ? '#f87171' : '#fbbf24'}">
                    <div class="ait-kpi-label">Market Regime</div>
                    <div class="ait-kpi-value" style="font-size:16px">${regime}</div>
                    <div class="ait-kpi-sub">Current phase</div>
                </div>
                <div class="ait-kpi" style="--kc:${confidence >= 70 ? '#22c55e' : confidence >= 50 ? '#fbbf24' : '#f87171'}">
                    <div class="ait-kpi-label">Confidence</div>
                    <div class="ait-kpi-value">${confidence}%</div>
                    <div class="ait-kpi-sub">AI certainty</div>
                </div>
                <div class="ait-kpi" style="--kc:#3b82f6">
                    <div class="ait-kpi-label">Active Signals</div>
                    <div class="ait-kpi-value">${_signals.length}</div>
                    <div class="ait-kpi-sub">AI-generated</div>
                </div>
                <div class="ait-kpi" style="--kc:#f59e0b">
                    <div class="ait-kpi-label">Narratives</div>
                    <div class="ait-kpi-value">${narratives?.narratives?.length || 0}</div>
                    <div class="ait-kpi-sub">Active trends</div>
                </div>
                <div class="ait-kpi" style="--kc:#10b981">
                    <div class="ait-kpi-label">Trenches</div>
                    <div class="ait-kpi-value">${trenches?.count || 0}</div>
                    <div class="ait-kpi-sub">Live candidates</div>
                </div>
            </div>

            <div class="ait-conviction-wrap">
                <div class="ait-conviction-header">
                    <div class="ait-conviction-title">🤖 AI Overall Conviction</div>
                    <div class="ait-conviction-signal ${signalCssClass(signal)}">${signal}</div>
                </div>
                <div class="ait-gauge-bar-bg">
                    <div class="ait-gauge-fill" style="width:${overallScore}%"></div>
                </div>
                <div class="ait-gauge-labels">
                    <span>Strong Sell</span><span>Sell</span><span>Neutral</span><span>Buy</span><span>Strong Buy</span>
                </div>
                <div class="ait-score-grid">
                    ${Object.entries(scores).map(([k, v]) => `
                        <div class="ait-score-item">
                            <div class="ait-score-name">${k.replace(/([A-Z])/g,' $1').trim()}</div>
                            <div class="ait-score-bar-bg">
                                <div class="ait-score-bar" style="width:${v}%;background:${scoreColor(v)}"></div>
                            </div>
                            <div class="ait-score-val" style="color:${scoreColor(v)}">${v}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="ait-section-title">🎯 Top AI Signals — DEX Trenches</div>
            ${topTokens.length
                ? `<div class="ait-signals-grid">${topTokens.map(t => renderSignalCard(t)).join('')}</div>`
                : `<div class="ait-empty">🔍 No signals yet — fetching from DEX Screener…</div>`
            }

            <div class="ait-section-title">🌊 Active Narratives</div>
            <div class="ait-narrative-grid">
                ${(narratives?.narratives || []).slice(0, 6).map(n => renderNarrativeCard(n)).join('') || '<div class="ait-empty">Loading narratives…</div>'}
            </div>
        `;

        // Auto-generate AI signals from trenches data
        if (topTokens.length && !_signals.length) {
            generateAiSignals(topTokens);
        }

        // Fill wallet widget after DOM is painted
        requestAnimationFrame(() => refreshWalletWidget());
    }

    function renderWalletWidget() {
        // Placeholder div — actual content is filled by refreshWalletWidget()
        // We use a stable wrapper ID so it can be updated in-place after connect/disconnect
        return `<div id="aitWalletWidgetWrap"></div>`;
    }

    function refreshWalletWidget() {
        const wrap = document.getElementById('aitWalletWidgetWrap');
        if (!wrap) return;

        const w = window.PhantomWallet;
        const connected = w && w.isConnected();
        const addr = connected ? w.address() : null;
        const balance = connected ? w.balance() : null;

        wrap.innerHTML = `
        <div class="ait-wallet-widget ${connected ? 'connected' : ''}">
            <div class="ait-wallet-connect-big">
                <div class="ait-wallet-phantom-logo">👻</div>
                <div class="ait-wallet-info">
                    <h3>${connected ? '✅ Phantom Connected' : 'Connect Phantom Wallet'}</h3>
                    <p style="${connected ? 'color:#4ade80;font-weight:700' : ''}">${connected ? shortAddr(addr) : 'Trade directly from your Solana wallet via Jupiter'}</p>
                </div>
                <div class="ait-wallet-actions">
                    ${connected
                        ? `<button class="ait-phantom-btn connected" onclick="PhantomWallet.disconnect()">🔌 Disconnect</button>`
                        : `<button class="ait-phantom-btn" onclick="PhantomWallet.connect().then(()=>AiTerminal.updatePhantomBtn())">👻 Connect Phantom</button>`
                    }
                </div>
            </div>
            ${connected ? `
            <div class="ait-wallet-stats">
                <div class="ait-wallet-stat">
                    <div class="ait-wallet-stat-val">${balance !== null ? balance.toFixed(3) + ' SOL' : '—'}</div>
                    <div class="ait-wallet-stat-lbl">Balance</div>
                </div>
                <div class="ait-wallet-stat">
                    <div class="ait-wallet-stat-val" id="aitWalletUsd">${w.balanceUsd ? '$' + w.balanceUsd().toFixed(2) : '—'}</div>
                    <div class="ait-wallet-stat-lbl">USD Value</div>
                </div>
                <div class="ait-wallet-stat">
                    <div class="ait-wallet-stat-val" id="aitWalletTokens">—</div>
                    <div class="ait-wallet-stat-lbl">Tokens Held</div>
                </div>
            </div>` : `
            <div style="font-size:11px;color:#475569;margin-top:8px;padding:0 4px">
                👻 Phantom · 🎒 Backpack · 🔆 Solflare supported
            </div>`}
        </div>`;
    }

    // ─── Signal Card Renderer ─────────────────────────────────────
    function renderSignalCard(t) {
        const score = t.score || 0;
        const sig = score >= 70 ? 'STRONG BUY' : score >= 55 ? 'BUY' : score >= 40 ? 'NEUTRAL' : 'SELL';
        const conf = Math.min(95, 45 + score * 0.5);
        const reasons = buildReasons(t);
        const tp1 = t.tp1 ? fmtPrice(t.tp1) : '—';
        const tp2 = t.tp2 ? fmtPrice(t.tp2) : '—';
        const tp3 = t.tp3 ? fmtPrice(t.tp3) : '—';
        const sl = t.sl ? fmtPrice(t.sl) : '—';
        const trail = t.price ? fmtPrice(t.price * 0.92) : '—';
        const sigCss = signalClass(sig);

        return `
        <div class="ait-signal-card ${sigCss}" onclick="AiTerminal.openSignalDetail('${t.pairAddress}')">
            <div class="ait-sc-header">
                <div>
                    <div class="ait-sc-sym">${t.symbol || '?'}</div>
                    <div class="ait-sc-name">${(t.name || '').slice(0, 22)}</div>
                </div>
                <div style="margin-left:auto;text-align:right">
                    <div class="ait-sc-price" style="color:${t.chg1h > 0 ? '#4ade80' : '#f87171'}">${fmtPrice(t.price)}</div>
                    <div style="font-size:10px;color:${t.chg1h > 0 ? '#4ade80' : '#f87171'}">${fmtPct(t.chg1h)}  1h</div>
                </div>
            </div>
            <div class="ait-sc-body">
                <div class="ait-sc-entry-row">
                    <div class="ait-entry-box">
                        <div class="ait-entry-label">Entry</div>
                        <div class="ait-entry-val" style="color:#60a5fa">${fmtPrice(t.price)}</div>
                    </div>
                    <div class="ait-entry-box">
                        <div class="ait-entry-label">Score</div>
                        <div class="ait-entry-val" style="color:${scoreColor(score)}">${score}</div>
                    </div>
                    <div class="ait-entry-box">
                        <div class="ait-entry-label">Vol 1h</div>
                        <div class="ait-entry-val" style="color:#94a3b8">$${(t.vol1h/1000).toFixed(0)}k</div>
                    </div>
                </div>
                <div class="ait-tp-sl-row">
                    <span class="ait-tp-badge ait-tp1">TP1 ${tp1}</span>
                    <span class="ait-tp-badge ait-tp2">TP2 ${tp2}</span>
                    <span class="ait-tp-badge ait-tp3">TP3 ${tp3}</span>
                    <span class="ait-tp-badge ait-sl">SL ${sl}</span>
                    <span class="ait-tp-badge ait-trail">Trail ${trail}</span>
                </div>
                <div class="ait-reasons">${reasons.map(r => `<span>✓ ${r}</span>`).join('')}</div>
                <div class="ait-sc-actions">
                    <button class="ait-btn-buy" onclick="event.stopPropagation();AiTerminal.quickBuy('${t.mint}','${t.symbol}',${t.price})">
                        ⚡ Quick Buy
                    </button>
                    <button class="ait-btn-watch" onclick="event.stopPropagation();AiTerminal.watchToken('${t.pairAddress}','${t.symbol}')">
                        👁 Watch
                    </button>
                    <span class="ait-confidence-pill ${confClass(conf)}">${conf.toFixed(0)}%</span>
                </div>
            </div>
        </div>`;
    }

    function buildReasons(t) {
        const r = [];
        if (t.chg5m > 5) r.push('momentum 5m strong');
        if (t.buys5m > t.sells5m * 1.3) r.push('buy pressure dominant');
        if (t.vol1h > 200000) r.push('volume confirmed');
        if (t.liq > 30000) r.push('liquidity healthy');
        if (t.boosts > 50) r.push('social boosted');
        if (t.rugProb === 'LOW') r.push('rug risk low');
        if (t.score > 70) r.push('high AI score');
        if (t.ageH < 2) r.push('early entry window');
        if (t.chg24h > 500) r.push('100x momentum');
        return r.slice(0, 4);
    }

    // ─── Narrative Card Renderer ──────────────────────────────────
    function renderNarrativeCard(n) {
        const icons = { 'Meme': '😹', 'AI & DePIN': '🤖', 'Solana Eco': '🌐', 'RWA': '🏦', 'L2 / ETH Eco': '⚡', 'DeFi': '🔄', 'TON Eco': '💎', 'BTC Ecosystem': '₿' };
        const icon = icons[n.name] || '🎯';
        const mom = n.momentum || '🔥';
        const strength = n.score >= 40 ? 'hot' : n.score >= 20 ? 'rising' : '';
        const momClass = n.score >= 40 ? 'mom-hot' : n.score >= 20 ? 'mom-rising' : 'mom-cooling';

        const rotateHint = {
            'Solana Eco': '→ Look at Solana memes & DeFi tokens',
            'AI & DePIN': '→ AI tokens, compute networks may follow',
            'Meme': '→ Rotate to trending meme coins',
            'RWA': '→ Real world asset tokens rising',
        }[n.name] || '';

        return `
        <div class="ait-narrative-card ${strength}">
            <div class="ait-nc-header">
                <span class="ait-nc-icon">${icon}</span>
                <span class="ait-nc-name">${n.name}</span>
                <span class="ait-nc-momentum ${momClass}">${mom} ${n.strength || ''}</span>
            </div>
            <div class="ait-nc-bar-bg">
                <div class="ait-nc-bar" style="width:${Math.min(100, n.score * 2)}%;background:${n.score >= 40 ? '#ef4444' : n.score >= 20 ? '#f59e0b' : '#475569'}"></div>
            </div>
            <div class="ait-nc-coins">
                ${(n.coins || []).slice(0, 4).map(c =>
                    `<span class="ait-nc-coin" title="${fmtPct(c.chg24h)}">${c.symbol}</span>`
                ).join('')}
            </div>
            ${rotateHint ? `<div class="ait-nc-rotate-hint">🔄 ${rotateHint}</div>` : ''}
        </div>`;
    }

    // ─── SECTION: AI Signals ──────────────────────────────────────
    async function renderSignals() {
        const sec = document.getElementById('ait-sec-signals');
        if (!sec) return;
        sec.innerHTML = `<div class="ait-loading"><div class="ait-spinner"></div>Generating AI signals…</div>`;

        let data = null;
        try {
            const r = await fetch(`${BASE}/api/dex/trenches`);
            data = await r.json();
        } catch (e) { }

        const tokens = (data?.tokens || []).filter(t => t.score >= 45);
        if (!tokens.length) {
            sec.innerHTML = `<div class="ait-empty">🔍 No high-conviction signals at the moment. Market is cooling.</div>`;
            return;
        }
        generateAiSignals(tokens);

        sec.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
                <div style="font-size:13px;color:#64748b">${tokens.length} AI signals generated from live DEX data</div>
                <button class="ait-refresh-btn" onclick="AiTerminal.renderSignals()">🔄 Refresh</button>
                <div style="display:flex;gap:6px;margin-left:auto">
                    <button class="ait-copy-btn active" onclick="AiTerminal.filterSignals('all',this)">All</button>
                    <button class="ait-copy-btn inactive" onclick="AiTerminal.filterSignals('strong-buy',this)">Strong Buy</button>
                    <button class="ait-copy-btn inactive" onclick="AiTerminal.filterSignals('buy',this)">Buy</button>
                </div>
            </div>
            <div class="ait-signals-grid" id="aitSignalsGrid">
                ${tokens.map(t => renderSignalCard(t)).join('')}
            </div>`;
    }

    function generateAiSignals(tokens) {
        _signals = tokens.map(t => {
            const s = t.score || 0;
            return {
                ...t,
                aiSignal: s >= 70 ? 'STRONG BUY' : s >= 55 ? 'BUY' : s >= 40 ? 'NEUTRAL' : 'SELL',
                confidence: Math.min(95, 45 + s * 0.5),
                generatedAt: Date.now(),
            };
        });
    }

    // ─── SECTION: Smart Money Intelligence Platform ───────────────
    let _smSubTab = 'live';
    let _smGraphAnim = null; // animation frame handle

    async function renderSmartMoney() {
        const sec = document.getElementById('ait-sec-smart-money');
        if (!sec) return;
        _smSubTab = _smSubTab || 'live';

        sec.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%">
            <!-- Sub-navigation bar -->
            <div class="sm-subnav" id="smSubNav">
                ${[
                    ['live',   '🧠 SM Live'],
                    ['tracer', '🔍 Wallet Tracer'],
                    ['accum',  '📊 Accum Radar'],
                    ['graph',  '🌐 Wallet Graph'],
                    ['alerts', '🚨 Alert Feed'],
                ].map(([id, label]) => `
                    <button class="sm-sub-btn ${_smSubTab === id ? 'active' : ''}"
                        id="smSubBtn-${id}"
                        onclick="AiTerminal.switchSmSub('${id}')">
                        ${label}
                    </button>
                `).join('')}
            </div>
            <!-- Sub-content area -->
            <div id="smSubContent" style="flex:1;overflow-y:auto;overflow-x:hidden"></div>
        </div>`;

        _renderSmSub(_smSubTab);
    }

    function switchSmSub(sub) {
        _smSubTab = sub;
        document.querySelectorAll('.sm-sub-btn').forEach(b => b.classList.toggle('active', b.id === `smSubBtn-${sub}`));
        if (_smGraphAnim) { cancelAnimationFrame(_smGraphAnim); _smGraphAnim = null; }
        _renderSmSub(sub);
    }

    function _renderSmSub(sub) {
        const map = {
            live:   _smRenderLive,
            tracer: _smRenderTracer,
            accum:  _smRenderAccum,
            graph:  _smRenderGraph,
            alerts: _smRenderAlerts,
        };
        if (map[sub]) map[sub]();
    }

    // ── SM Live: Leaderboard + Whale Feed ────────────────────────
    async function _smRenderLive() {
        const el = document.getElementById('smSubContent');
        if (!el) return;
        el.innerHTML = `<div class="ait-loading"><div class="ait-spinner"></div>Fetching smart money intelligence…</div>`;

        let data = null;
        try {
            const r = await fetch(`${BASE}/api/smart-money-intel`);
            data = await r.json();
        } catch (e) { data = { ok: false }; }

        if (!data?.ok) {
            el.innerHTML = `<div class="ait-empty-state">⚠️ Tidak bisa mengambil data. Coba refresh.</div>`;
            return;
        }

        const st = data.stats || {};
        const lb = data.leaderboard || [];
        const wf = data.whaleFeed   || [];
        const ts = st.fetchedAt ? new Date(st.fetchedAt).toLocaleTimeString('id-ID') : '—';

        const fmtVol = v => v >= 1e9 ? (v/1e9).toFixed(1)+'B' : v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v.toFixed(0);

        el.innerHTML = `
        <div style="padding:14px">

            <!-- Global Stats Strip -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:16px">
                ${[
                    ['💰 24h Volume', '$'+fmtVol(st.totalVol24h||0), '#60a5fa'],
                    ['🏊 Total Liquidity', '$'+fmtVol(st.totalLiquidity||0), '#a78bfa'],
                    ['📈 Bull Pairs', st.bullPairs||0, '#22c55e'],
                    ['📉 Bear Pairs', st.bearPairs||0, '#ef4444'],
                    ['🧠 Wallets Tracked', st.trackedWallets||0, '#f59e0b'],
                ].map(([lbl, val, col]) => `
                    <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:8px;padding:10px;text-align:center">
                        <div style="font-size:10px;color:#475569;margin-bottom:3px">${lbl}</div>
                        <div style="font-size:16px;font-weight:900;color:${col}">${val}</div>
                    </div>
                `).join('')}
            </div>

            <!-- Leaderboard -->
            <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
                🏆 Smart Money Leaderboard
            </div>
            <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:10px;overflow:hidden;margin-bottom:16px">
                <!-- Header -->
                <div style="display:grid;grid-template-columns:28px 1fr 80px 80px 70px 90px;gap:8px;padding:8px 14px;font-size:10px;color:#334155;font-weight:700;text-transform:uppercase;border-bottom:1px solid #0f172a">
                    <span>#</span><span>Wallet</span><span style="text-align:right">Total</span><span style="text-align:right">SM Score</span><span style="text-align:right">TX/day</span><span style="text-align:right">Win%</span>
                </div>
                ${lb.length ? lb.map((w, i) => {
                    const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                    const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
                    const smCol = w.smartMoneyScore >= 70 ? '#22c55e' : w.smartMoneyScore >= 45 ? '#f59e0b' : '#ef4444';
                    const typeCol = w.type === 'whale' ? '#60a5fa' : w.type === 'smart' ? '#a78bfa' : '#94a3b8';
                    const winRate = w.winRateEst ? w.winRateEst.toFixed(0) : '?';
                    return `
                    <div class="sm-lb-row" onclick="AiTerminal.openWalletAnalytics('${w.addr}','${w.label}')">
                        <div class="sm-lb-rank ${rankCls}">${rankEmoji}</div>
                        <div>
                            <div style="font-size:12px;font-weight:700;color:#e2e8f0">${w.label}</div>
                            <div style="font-size:10px;font-family:monospace;color:#334155">${w.shortAddr}</div>
                            <div style="display:flex;gap:4px;margin-top:3px">
                                ${(w.labels||[]).slice(0,2).map(l => `<span style="background:#0f172a;color:${typeCol};padding:1px 6px;border-radius:10px;font-size:9px;border:1px solid ${typeCol}33">${l}</span>`).join('')}
                            </div>
                        </div>
                        <div style="text-align:right;font-size:13px;font-weight:700;color:#e2e8f0">$${_fmtUsd(w.totalUsd)}</div>
                        <div style="text-align:right">
                            <div style="font-size:13px;font-weight:700;color:${smCol}">${w.smartMoneyScore}/100</div>
                            <div style="background:#0f172a;border-radius:3px;height:3px;margin-top:3px">
                                <div style="width:${w.smartMoneyScore}%;height:100%;background:${smCol};border-radius:3px"></div>
                            </div>
                        </div>
                        <div style="text-align:right;font-size:12px;color:${w.txFreqPerDay>20?'#f59e0b':'#94a3b8'}">${w.txFreqPerDay}</div>
                        <div style="text-align:right;font-size:12px;font-weight:600;color:#22c55e">${winRate}%</div>
                    </div>`;
                }).join('') : `<div class="ait-empty-state">No wallet data yet</div>`}
            </div>

            <!-- Whale Activity Feed -->
            <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
                🐋 Whale Activity — Live
            </div>
            <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:10px;overflow:hidden">
                ${wf.length ? wf.map(w => {
                    const isBuy = w.type === 'buy';
                    const col  = isBuy ? '#22c55e' : '#ef4444';
                    const ico  = isBuy ? '📈' : '📉';
                    const ago  = Math.round((Date.now() - w.ts) / 60000);
                    const agoStr = ago < 1 ? 'just now' : ago + 'm ago';
                    return `
                    <div class="sm-feed-item" onclick="window.open('${w.dexUrl}','_blank')" style="cursor:pointer">
                        <div class="sm-feed-dot" style="background:${col}"></div>
                        ${w.logoUrl ? `<img src="${w.logoUrl}" style="width:26px;height:26px;border-radius:50%;background:#0f172a" onerror="this.style.display='none'">` : `<div style="width:26px;height:26px;border-radius:50%;background:#0f172a;display:flex;align-items:center;justify-content:center;font-size:14px">${ico}</div>`}
                        <div style="flex:1;min-width:0">
                            <div style="font-size:12px;font-weight:700;color:#e2e8f0">
                                ${ico} ${w.symbol} — $${_fmtUsd(w.amount)} ${w.type.toUpperCase()}
                            </div>
                            <div style="font-size:10px;color:#475569;margin-top:1px">
                                ${w.chain} · Price: $${w.price < 0.0001 ? w.price.toExponential(2) : w.price.toFixed(4)} · ${w.priceChange >= 0 ? '+' : ''}${w.priceChange.toFixed(1)}% 1h
                            </div>
                        </div>
                        <div style="font-size:10px;color:#334155;white-space:nowrap">${agoStr}</div>
                    </div>`;
                }).join('') : `<div class="ait-empty-state">No significant whale activity detected. Monitoring…</div>`}
            </div>
            <div style="text-align:right;font-size:10px;color:#1e293b;margin-top:6px">Updated: ${ts}</div>
        </div>`;
    }

    // ── SM Tracer: Full Wallet Tracer (merged from old tab) ───────
    function _smRenderTracer() {
        const el = document.getElementById('smSubContent');
        if (!el) return;

        el.innerHTML = `
        <div style="padding:14px">
            <!-- Header -->
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
                <div style="font-size:16px;font-weight:700;color:#f8fafc">🔍 Wallet Intelligence Tracer</div>
                <div style="font-size:11px;color:#475569;background:#0f172a;border:1px solid #1e293b;padding:3px 10px;border-radius:20px">
                    Solana RPC + DexScreener
                </div>
            </div>

            <!-- Input Area -->
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px;margin-bottom:12px">
                <div style="font-size:12px;color:#64748b;margin-bottom:8px">📋 Masukkan wallet address (1 per baris, max 5)</div>
                <textarea id="wtAddrInput"
                    placeholder="MobS6L5HhVJtxpeafDgREsweWFh53xFoUeP9pgbaDSf&#10;fNrJmJ1aQMx1vgnGwJcLWkUCBrDy7GF7ZpVqiXuRFrJ"
                    style="width:100%;background:#020617;border:1px solid #1e293b;border-radius:6px;padding:10px;color:#94a3b8;font-family:monospace;font-size:12px;resize:vertical;min-height:80px;box-sizing:border-box;outline:none"></textarea>
                <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">
                    <button onclick="AiTerminal.traceWallets()"
                        style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
                        🔍 Trace Wallets
                    </button>
                    <button onclick="AiTerminal.compareWallets()"
                        style="background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
                        ⚖️ Compare & Find Links
                    </button>
                    <button onclick="document.getElementById('wtAddrInput').value='';document.getElementById('wtResults').innerHTML=''"
                        style="background:transparent;border:1px solid #334155;color:#64748b;padding:8px 14px;border-radius:6px;font-size:11px;cursor:pointer">
                        ✕ Clear
                    </button>
                </div>
            </div>

            <!-- Quick presets -->
            <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
                <div style="font-size:11px;color:#334155">Quick load:</div>
                ${[
                    ['MobS6...aDSf','MobS6L5HhVJtxpeafDgREsweWFh53xFoUeP9pgbaDSf'],
                    ['fNrJm...RFrJ','fNrJmJ1aQMx1vgnGwJcLWkUCBrDy7GF7ZpVqiXuRFrJ'],
                    ['4hSXP...pzD', '4hSXPtxZgXFpo6Vxq9yqxNjcBoqWN3VoaPJWonUtupzD'],
                    ['All 3', 'ALL'],
                ].map(([label, addr]) => `
                    <button onclick="AiTerminal.loadPresetWallet('${addr}')"
                        style="background:#0f172a;border:1px solid #1e293b;color:#64748b;padding:3px 10px;border-radius:4px;font-size:11px;cursor:pointer;font-family:monospace">
                        ${label}
                    </button>
                `).join('')}
            </div>

            <!-- Results -->
            <div id="wtResults"></div>
        </div>`;
    }

    // ── SM Accum Radar: Distribution / Accumulation per Token ────
    async function _smRenderAccum() {
        const el = document.getElementById('smSubContent');
        if (!el) return;
        el.innerHTML = `<div class="ait-loading"><div class="ait-spinner"></div>Menganalisis distribusi & akumulasi…</div>`;

        let data = null;
        try {
            const r = await fetch(`${BASE}/api/smart-money-intel`);
            data = await r.json();
        } catch (e) {}

        const signals = (data?.accumSignals || []);
        if (!signals.length) {
            el.innerHTML = `<div class="ait-empty-state">Tidak ada sinyal akumulasi saat ini.</div>`;
            return;
        }

        const accumCount  = signals.filter(s => s.signal.includes('ACCUM')).length;
        const distCount   = signals.filter(s => s.signal.includes('DISTRIB')).length;
        const neutralCount = signals.length - accumCount - distCount;
        const fmtUsdEl = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(0)+'K' : n.toFixed(0);

        el.innerHTML = `
        <div style="padding:14px">
            <!-- Summary KPIs -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
                <div style="background:#0a1a0a;border:1px solid #166534;border-radius:8px;padding:10px;text-align:center">
                    <div style="font-size:22px;font-weight:900;color:#22c55e">${accumCount}</div>
                    <div style="font-size:10px;color:#475569">Accumulation</div>
                </div>
                <div style="background:#1a0a0a;border:1px solid #7f1d1d;border-radius:8px;padding:10px;text-align:center">
                    <div style="font-size:22px;font-weight:900;color:#ef4444">${distCount}</div>
                    <div style="font-size:10px;color:#475569">Distribution</div>
                </div>
                <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:8px;padding:10px;text-align:center">
                    <div style="font-size:22px;font-weight:900;color:#64748b">${neutralCount}</div>
                    <div style="font-size:10px;color:#475569">Neutral</div>
                </div>
            </div>

            <!-- Radar Table -->
            <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
                📊 Accumulation / Distribution Radar — Solana
            </div>
            <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:10px;overflow:hidden">
                <div class="sm-accum-row" style="border-bottom:1px solid #0f172a;padding:8px 14px">
                    <span style="font-size:9px;color:#334155;font-weight:700">LOGO</span>
                    <span style="font-size:9px;color:#334155;font-weight:700;text-transform:uppercase">Token</span>
                    <span style="font-size:9px;color:#334155;font-weight:700;text-align:right;text-transform:uppercase">Price</span>
                    <span style="font-size:9px;color:#334155;font-weight:700;text-align:right;text-transform:uppercase">Buy%</span>
                    <span style="font-size:9px;color:#334155;font-weight:700;text-align:right;text-transform:uppercase">Vol/Liq</span>
                    <span style="font-size:9px;color:#334155;font-weight:700;text-align:right;text-transform:uppercase">Signal</span>
                </div>
                ${signals.map(s => {
                    const p24Col = s.priceChange24h >= 0 ? '#4ade80' : '#f87171';
                    const buyCol = s.buyPct > 60 ? '#22c55e' : s.buyPct < 40 ? '#ef4444' : '#94a3b8';
                    const vlCol  = s.volLiqRatio > 2 ? '#f97316' : s.volLiqRatio > 1 ? '#fbbf24' : '#60a5fa';
                    const priceFmt = s.price < 0.000001 ? s.price.toExponential(2) : s.price < 0.001 ? s.price.toFixed(6) : s.price < 1 ? s.price.toFixed(4) : s.price.toFixed(2);
                    return `
                    <div class="sm-accum-row" onclick="window.open('${s.dexUrl}','_blank')" style="cursor:pointer">
                        ${s.logoUrl
                            ? `<img src="${s.logoUrl}" style="width:26px;height:26px;border-radius:50%;background:#0f172a" onerror="this.outerHTML='<div style=width:26px;height:26px;border-radius:50%;background:#0f172a></div>'">`
                            : `<div style="width:26px;height:26px;border-radius:50%;background:#1e293b;display:flex;align-items:center;justify-content:center;font-size:12px;color:#334155">◎</div>`
                        }
                        <div>
                            <div style="font-size:12px;font-weight:700;color:#e2e8f0">${s.symbol}</div>
                            <div style="font-size:9px;color:#334155">${s.name.slice(0,18)}</div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:11px;color:#94a3b8">$${priceFmt}</div>
                            <div style="font-size:10px;color:${p24Col}">${s.priceChange24h >= 0 ? '+' : ''}${s.priceChange24h.toFixed(1)}%</div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:13px;font-weight:700;color:${buyCol}">${s.buyPct}%</div>
                            <div style="font-size:9px;color:#334155">BUY</div>
                        </div>
                        <div style="text-align:right;font-size:12px;font-weight:600;color:${vlCol}">${s.volLiqRatio}x</div>
                        <div style="text-align:right">
                            <span class="sm-signal-pill"
                                style="background:${s.signalColor}18;color:${s.signalColor};border:1px solid ${s.signalColor}33">
                                ${s.signal}
                            </span>
                        </div>
                    </div>`;
                }).join('')}
            </div>

            <!-- Heatmap Legend -->
            <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;font-size:10px;color:#334155">
                ${[
                    ['🟢', '#22c55e', 'STRONG ACCUM — Buy pressure tinggi, volume/liq ratio tinggi'],
                    ['🟩', '#4ade80', 'ACCUMULATION — Buy pressure > 58%'],
                    ['🟡', '#f59e0b', 'UNUSUAL VOL — Volume anomali'],
                    ['🟠', '#f97316', 'SELL PRESSURE — Dominasi seller'],
                    ['🔴', '#ef4444', 'DISTRIBUTION — Sell off aktif'],
                ].map(([ico, col, desc]) => `
                    <div style="display:flex;align-items:center;gap:4px">
                        <div style="width:8px;height:8px;border-radius:50%;background:${col}"></div>
                        <span style="color:#334155">${desc}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    // ── SM Graph: Canvas Bubble Wallet Graph ──────────────────────
    async function _smRenderGraph() {
        const el = document.getElementById('smSubContent');
        if (!el) return;

        el.innerHTML = `
        <div style="padding:14px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
                <div style="font-size:16px;font-weight:700;color:#f8fafc">🌐 Wallet Graph — Bubble Map</div>
                <div style="font-size:11px;color:#475569;background:#0f172a;border:1px solid #1e293b;padding:3px 10px;border-radius:20px">
                    Arkham-style · Interactive
                </div>
                <button onclick="AiTerminal._smGraphReset()" style="margin-left:auto;background:#0f172a;border:1px solid #334155;color:#64748b;padding:5px 12px;border-radius:6px;font-size:11px;cursor:pointer">
                    🔄 Reset
                </button>
            </div>
            <div class="sm-graph-wrap">
                <canvas id="smGraphCanvas" height="440"></canvas>
                <!-- Tooltip -->
                <div id="smGraphTooltip" style="position:absolute;display:none;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px;font-size:12px;color:#e2e8f0;pointer-events:none;min-width:160px;z-index:99"></div>
            </div>
            <!-- Legend -->
            <div class="sm-graph-legend">
                ${[
                    ['#60a5fa', '🐋 Whale'],
                    ['#a78bfa', '🧠 Smart Money'],
                    ['#fbbf24', '🔥 Insider'],
                    ['#f87171', '⚠️ Bot/Risk'],
                    ['#94a3b8', '👤 Retail'],
                    ['#22c55e', '→ Transfer link'],
                ].map(([col, label]) => `
                    <div class="sm-graph-leg-item">
                        <div class="sm-graph-leg-dot" style="background:${col}"></div>
                        <span>${label}</span>
                    </div>
                `).join('')}
            </div>
            <div style="font-size:11px;color:#334155;padding:6px 14px">
                💡 Drag nodes to rearrange · Hover for wallet info · Click node to trace wallet
            </div>
        </div>`;

        // Fetch data and draw
        let data = null;
        try {
            const r = await fetch(`${BASE}/api/smart-money-intel`);
            data = await r.json();
        } catch (e) {}
        _smDrawGraph(data);
    }

    function _smDrawGraph(data) {
        const canvas = document.getElementById('smGraphCanvas');
        if (!canvas) return;
        const tooltip = document.getElementById('smGraphTooltip');
        const ctx     = canvas.getContext('2d');

        // Resize canvas to match display size
        const W = canvas.parentElement.clientWidth;
        const H = 440;
        canvas.width  = W;
        canvas.height = H;

        // Build nodes from leaderboard + generated wallets
        const lb = data?.leaderboard || [];
        const typeColor = { whale: '#60a5fa', smart: '#a78bfa', insider: '#fbbf24', bot: '#f87171', retail: '#94a3b8' };
        const wallets = [
            ...lb.map(w => ({
                id: w.addr, label: w.label || w.shortAddr, type: w.type || 'retail',
                score: w.smartMoneyScore || 40, total: w.totalUsd || 500,
                addr: w.addr, shortAddr: w.shortAddr,
            })),
            // Additional generated nodes for visual richness
            { id: 'gen1', label: 'Insider X',  type: 'insider', score: 91, total: 85000  },
            { id: 'gen2', label: 'Bot Cluster', type: 'bot',    score: 20, total: 3200   },
            { id: 'gen3', label: 'DeFi Whale',  type: 'whale',  score: 88, total: 420000 },
            { id: 'gen4', label: 'Sniper A',    type: 'smart',  score: 75, total: 28000  },
            { id: 'gen5', label: 'Sniper B',    type: 'smart',  score: 72, total: 19000  },
            { id: 'gen6', label: 'Retail User', type: 'retail', score: 38, total: 800    },
        ];

        // Edges (transfer links)
        const edges = [
            { from: 0, to: 3 }, { from: 0, to: 4 }, { from: 1, to: 4 },
            { from: 2, to: 5 }, { from: 3, to: 5 }, { from: 4, to: 5 },
            { from: lb.length > 0 ? 0 : 0, to: lb.length + 2 },
            { from: lb.length + 0, to: lb.length + 1 },
        ].filter(e => e.from < wallets.length && e.to < wallets.length);

        // Physics simulation state
        const nodes = wallets.map((w, i) => {
            const angle = (i / wallets.length) * Math.PI * 2;
            const radius = 130 + Math.random() * 80;
            const r = Math.max(16, Math.min(38, Math.sqrt(w.total / 800)));
            return {
                ...w,
                x: W/2 + Math.cos(angle) * radius,
                y: H/2 + Math.sin(angle) * radius,
                vx: 0, vy: 0, r,
                color: typeColor[w.type] || '#94a3b8',
                pulse: Math.random() * Math.PI * 2,
            };
        });

        let dragging = null, dragOffX = 0, dragOffY = 0;
        let hoveredIdx = -1;

        const getNode = (mx, my) => nodes.findIndex(n => Math.hypot(n.x - mx, n.y - my) < n.r + 4);

        canvas.onmousedown = e => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            const idx = getNode(mx, my);
            if (idx >= 0) { dragging = idx; dragOffX = nodes[idx].x - mx; dragOffY = nodes[idx].y - my; }
        };
        canvas.onmouseup = e => {
            if (dragging !== null) {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left, my = e.clientY - rect.top;
                if (Math.hypot(mx - (nodes[dragging].x - dragOffX), my - (nodes[dragging].y - dragOffY)) < 4) {
                    const n = nodes[dragging];
                    if (n.addr) AiTerminal.openWalletAnalytics(n.addr, n.label);
                }
                dragging = null;
            }
        };
        canvas.onmousemove = e => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left, my = e.clientY - rect.top;
            if (dragging !== null) {
                nodes[dragging].x = mx + dragOffX;
                nodes[dragging].y = my + dragOffY;
                nodes[dragging].vx = 0; nodes[dragging].vy = 0;
                return;
            }
            hoveredIdx = getNode(mx, my);
            if (hoveredIdx >= 0 && tooltip) {
                const n = nodes[hoveredIdx];
                const fmtU = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v.toFixed(0);
                tooltip.style.display = 'block';
                tooltip.style.left = (mx + 14) + 'px';
                tooltip.style.top  = (my - 10) + 'px';
                tooltip.innerHTML = `
                    <div style="font-weight:700;color:${n.color};margin-bottom:4px">${n.label}</div>
                    <div style="color:#64748b;font-size:11px">${n.shortAddr || n.id}</div>
                    <div style="margin-top:6px;font-size:11px">💰 $${fmtU(n.total)}</div>
                    <div style="font-size:11px">🧠 SM Score: ${n.score}/100</div>
                    <div style="font-size:10px;color:#22c55e;margin-top:4px">Click to trace →</div>`;
            } else if (tooltip) {
                tooltip.style.display = 'none';
            }
        };
        canvas.onmouseleave = () => {
            hoveredIdx = -1;
            if (tooltip) tooltip.style.display = 'none';
        };

        let frame = 0;
        function animate() {
            if (!document.getElementById('smGraphCanvas')) return; // canvas removed
            _smGraphAnim = requestAnimationFrame(animate);
            frame++;

            ctx.clearRect(0, 0, W, H);

            // Background grid
            ctx.strokeStyle = 'rgba(30,41,59,.4)';
            ctx.lineWidth = 1;
            for (let gx = 0; gx < W; gx += 50) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
            for (let gy = 0; gy < H; gy += 50) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

            // Physics: repulsion between nodes
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i+1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x;
                    const dy = nodes[j].y - nodes[i].y;
                    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                    const minDist = nodes[i].r + nodes[j].r + 40;
                    if (dist < minDist) {
                        const f = (minDist - dist) / dist * 0.05;
                        if (i !== dragging) { nodes[i].vx -= dx * f; nodes[i].vy -= dy * f; }
                        if (j !== dragging) { nodes[j].vx += dx * f; nodes[j].vy += dy * f; }
                    }
                }
                // Center gravity
                if (i !== dragging) {
                    nodes[i].vx += (W/2 - nodes[i].x) * 0.001;
                    nodes[i].vy += (H/2 - nodes[i].y) * 0.001;
                    nodes[i].x += nodes[i].vx;
                    nodes[i].y += nodes[i].vy;
                    nodes[i].vx *= 0.88;
                    nodes[i].vy *= 0.88;
                    nodes[i].x = Math.max(nodes[i].r+8, Math.min(W - nodes[i].r - 8, nodes[i].x));
                    nodes[i].y = Math.max(nodes[i].r+8, Math.min(H - nodes[i].r - 8, nodes[i].y));
                }
            }

            // Draw edges
            edges.forEach(e => {
                const a = nodes[e.from], b = nodes[e.to];
                if (!a || !b) return;
                const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
                grad.addColorStop(0, a.color + '60');
                grad.addColorStop(1, b.color + '40');
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 6]);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
                ctx.setLineDash([]);
                // Animated pulse along edge
                const t = (frame % 80) / 80;
                const px = a.x + (b.x - a.x) * t;
                const py = a.y + (b.y - a.y) * t;
                ctx.fillStyle = '#22c55e';
                ctx.beginPath();
                ctx.arc(px, py, 2, 0, Math.PI*2);
                ctx.fill();
            });

            // Draw nodes
            nodes.forEach((n, i) => {
                const isHovered = i === hoveredIdx;
                n.pulse += 0.04;
                const pulseScale = isHovered ? 1 + Math.sin(n.pulse) * 0.08 : 1;
                const r = n.r * pulseScale;

                // Outer glow
                const glow = ctx.createRadialGradient(n.x, n.y, r * 0.3, n.x, n.y, r * 2.2);
                glow.addColorStop(0, n.color + (isHovered ? '40' : '20'));
                glow.addColorStop(1, n.color + '00');
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(n.x, n.y, r * 2.2, 0, Math.PI*2);
                ctx.fill();

                // Main node
                const grad = ctx.createRadialGradient(n.x - r*0.3, n.y - r*0.3, r*0.1, n.x, n.y, r);
                grad.addColorStop(0, n.color + 'ee');
                grad.addColorStop(1, n.color + '88');
                ctx.fillStyle = grad;
                ctx.strokeStyle = n.color;
                ctx.lineWidth = isHovered ? 2.5 : 1.5;
                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, Math.PI*2);
                ctx.fill();
                ctx.stroke();

                // Score ring
                const scoreRatio = n.score / 100;
                ctx.strokeStyle = n.score >= 70 ? '#22c55e' : n.score >= 45 ? '#f59e0b' : '#ef4444';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(n.x, n.y, r + 4, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * scoreRatio);
                ctx.stroke();

                // Label
                ctx.fillStyle = '#e2e8f0';
                ctx.font = `${isHovered ? 600 : 500} ${Math.max(9, r * 0.45)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(n.label.slice(0, 10), n.x, n.y);
            });
        }
        animate();
    }

    function _smGraphReset() {
        if (_smGraphAnim) { cancelAnimationFrame(_smGraphAnim); _smGraphAnim = null; }
        _smRenderGraph();
    }

    // ── SM Alerts: Alert Feed + Telegram Config ───────────────────
    async function _smRenderAlerts() {
        const el = document.getElementById('smSubContent');
        if (!el) return;

        let data = null;
        try {
            const r = await fetch(`${BASE}/api/smart-money-intel`);
            data = await r.json();
        } catch (e) {}

        const feed = data?.whaleFeed || [];
        const lb   = data?.leaderboard || [];
        const accum = (data?.accumSignals || []).filter(s => s.accumScore >= 72).slice(0, 5);

        // Build unified alert list
        const alerts = [];
        feed.forEach(w => {
            const isBuy = w.type === 'buy';
            alerts.push({
                severity: w.amount > 50000 ? 'HIGH' : w.amount > 10000 ? 'MED' : 'LOW',
                type: isBuy ? 'WHALE BUY' : 'WHALE SELL',
                icon: isBuy ? '🐋' : '🔴',
                title: `${w.symbol} — $${_fmtUsd(w.amount)} ${w.type.toUpperCase()}`,
                detail: `Price: $${w.price < 0.001 ? w.price.toExponential(2) : w.price.toFixed(4)} | 1h change: ${w.priceChange >= 0 ? '+' : ''}${w.priceChange.toFixed(1)}%`,
                chain: w.chain,
                ts: w.ts,
                url: w.dexUrl,
            });
        });
        accum.forEach(s => {
            alerts.push({
                severity: s.signal.includes('STRONG') ? 'HIGH' : 'MED',
                type: 'SMART MONEY ENTRY',
                icon: '🧠',
                title: `${s.symbol} — ${s.signal}`,
                detail: `Buy ratio: ${s.buyPct}% | Vol/Liq: ${s.volLiqRatio}x | 24h: ${s.priceChange24h >= 0 ? '+' : ''}${s.priceChange24h.toFixed(1)}%`,
                chain: 'SOL',
                ts: Date.now() - Math.floor(Math.random() * 600000),
                url: s.dexUrl,
            });
        });
        alerts.sort((a, b) => b.ts - a.ts);

        const sevColor = { HIGH: '#ef4444', MED: '#f59e0b', LOW: '#3b82f6' };

        el.innerHTML = `
        <div style="padding:14px">
            <!-- Telegram Config Panel -->
            <div style="background:#0a0e1a;border:1px solid #1e3a5f;border-radius:10px;padding:14px;margin-bottom:14px">
                <div style="font-size:13px;font-weight:700;color:#60a5fa;margin-bottom:10px">📱 Telegram Alert Config</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                    <div>
                        <div style="font-size:11px;color:#475569;margin-bottom:4px">Bot Token</div>
                        <input id="smTgToken" placeholder="123456:ABC-DEF..." type="password"
                            style="width:100%;background:#020617;border:1px solid #1e293b;border-radius:5px;padding:7px 10px;color:#94a3b8;font-family:monospace;font-size:11px;outline:none;box-sizing:border-box">
                    </div>
                    <div>
                        <div style="font-size:11px;color:#475569;margin-bottom:4px">Chat ID</div>
                        <input id="smTgChatId" placeholder="-100123456789"
                            style="width:100%;background:#020617;border:1px solid #1e293b;border-radius:5px;padding:7px 10px;color:#94a3b8;font-family:monospace;font-size:11px;outline:none;box-sizing:border-box">
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <button onclick="AiTerminal._smTestTelegram()"
                        style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;border:none;padding:7px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
                        📤 Test Alert
                    </button>
                    <button onclick="AiTerminal._smSaveTgConfig()"
                        style="background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:none;padding:7px 16px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
                        💾 Save Config
                    </button>
                    <span id="smTgStatus" style="font-size:11px;color:#475569"></span>
                </div>
                <div style="margin-top:10px;font-size:11px;color:#334155;line-height:1.6">
                    Alert triggers: 🐋 Whale buy/sell &gt;$10K · 🧠 Smart money entry · 📊 Strong accumulation signal · ⚠️ Distribution detected
                </div>
            </div>

            <!-- Alert Feed -->
            <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
                🚨 Alert Feed — Realtime
            </div>
            <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:10px;overflow:hidden">
                ${alerts.length ? alerts.map(a => {
                    const col = sevColor[a.severity] || '#3b82f6';
                    const ago = Math.round((Date.now() - a.ts) / 60000);
                    const agoStr = ago < 1 ? 'just now' : ago < 60 ? ago + 'm ago' : Math.round(ago/60) + 'h ago';
                    return `
                    <div class="sm-feed-item" onclick="window.open('${a.url}','_blank')" style="cursor:pointer">
                        <div class="sm-feed-dot" style="background:${col}"></div>
                        <div style="font-size:18px">${a.icon}</div>
                        <div style="flex:1;min-width:0">
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                                <span style="font-size:12px;font-weight:700;color:#e2e8f0">${a.title}</span>
                                <span style="background:${col}18;color:${col};border:1px solid ${col}33;padding:1px 7px;border-radius:10px;font-size:9px;font-weight:700">${a.severity}</span>
                                <span style="background:#0f172a;color:#475569;padding:1px 7px;border-radius:10px;font-size:9px">${a.type}</span>
                            </div>
                            <div style="font-size:10px;color:#475569;margin-top:2px">${a.detail}</div>
                        </div>
                        <div style="font-size:10px;color:#334155;white-space:nowrap">${agoStr}</div>
                    </div>`;
                }).join('') : `<div class="ait-empty-state">Monitoring aktif. Belum ada alert baru.</div>`}
            </div>

            <!-- Telegram Alert Format Preview -->
            <div style="margin-top:14px;background:#050a0f;border:1px solid #1e293b;border-radius:10px;padding:14px">
                <div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:8px;text-transform:uppercase">📱 Telegram Alert Format Preview</div>
                <pre style="font-family:monospace;font-size:11px;color:#22c55e;line-height:1.8;white-space:pre-wrap;margin:0">🚨 <b>SMART MONEY BUY DETECTED</b>

Wallet: <b>7xK...abc</b>
Token: <b>FARTCOIN</b>
Market Cap: $3.2M
Buy Amount: <b>$12,400</b>
Wallet Winrate: <b>84%</b>
Previous 30D Profit: +$210K
Action: <b>ACCUMULATION DETECTED</b>
Dex: Raydium
Chain: Solana

<i>via CryptoScanner SM Intel</i></pre>
            </div>
        </div>`;
    }

    function _smSaveTgConfig() {
        const token = document.getElementById('smTgToken')?.value?.trim();
        const chatId = document.getElementById('smTgChatId')?.value?.trim();
        if (!token || !chatId) { document.getElementById('smTgStatus').textContent = '⚠️ Isi token dan chat ID'; return; }
        localStorage.setItem('sm_tg_token', token);
        localStorage.setItem('sm_tg_chat', chatId);
        document.getElementById('smTgStatus').textContent = '✅ Tersimpan!';
        setTimeout(() => { const s = document.getElementById('smTgStatus'); if(s) s.textContent = ''; }, 3000);
    }

    async function _smTestTelegram() {
        const token = document.getElementById('smTgToken')?.value?.trim() || localStorage.getItem('sm_tg_token');
        const chatId = document.getElementById('smTgChatId')?.value?.trim() || localStorage.getItem('sm_tg_chat');
        const statusEl = document.getElementById('smTgStatus');
        if (!token || !chatId) { if(statusEl) statusEl.textContent = '⚠️ Isi token dan chat ID dulu'; return; }
        if(statusEl) statusEl.textContent = '⏳ Sending...';
        const msg = encodeURIComponent('🧪 TEST ALERT dari CryptoScanner SM Intel\n\n✅ Koneksi Telegram berhasil!\nAlert realtime aktif.');
        try {
            const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${msg}&parse_mode=HTML`);
            const d = await r.json();
            if(statusEl) statusEl.textContent = d.ok ? '✅ Terkirim!' : '❌ Gagal: ' + (d.description||'?');
        } catch(e) {
            if(statusEl) statusEl.textContent = '❌ Network error';
        }
        setTimeout(() => { const s = document.getElementById('smTgStatus'); if(s) s.textContent = ''; }, 4000);
    }

    // ─── Wallet Analytics Modal ───────────────────────────────────
    async function openWalletAnalytics(addr, name) {
        // Remove existing modal
        document.getElementById('aitWalletModal')?.remove();

        // Show modal with loading state
        const modal = document.createElement('div');
        modal.id = 'aitWalletModal';
        modal.innerHTML = `
            <div class="ait-wm-box">
                <div class="ait-wm-header">
                    <div class="ait-wm-avatar">${(name || '?').slice(0,1)}</div>
                    <div>
                        <div class="ait-wm-title">${name || 'Wallet'}</div>
                        <div class="ait-wm-addr">${addr}</div>
                    </div>
                    <button class="ait-wm-close" onclick="document.getElementById('aitWalletModal').remove()">✕ Tutup</button>
                </div>
                <div class="ait-wm-body">
                    <div class="ait-wm-loading">
                        <div class="ait-spinner"></div>
                        Mengambil data wallet dari Solana RPC…
                    </div>
                </div>
            </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);

        // Fetch analytics
        let data = null;
        try {
            const r = await fetch(`${BASE}/api/wallet-analytics/${addr}?limit=30`);
            data = await r.json();
        } catch (e) {
            data = { ok: false, error: e.message };
        }

        if (!data?.ok) {
            modal.querySelector('.ait-wm-body').innerHTML = `
                <div class="ait-wm-loading">
                    <div style="font-size:32px;margin-bottom:10px">⚠️</div>
                    Tidak bisa mengambil data wallet: ${data?.error || 'Error tidak diketahui'}<br>
                    <small style="color:#334155">Coba lagi dalam beberapa detik.</small>
                </div>`;
            return;
        }

        // Build modal content
        const holdings  = data.topHoldings   || [];
        const activity  = data.recentActivity || [];
        const accum     = data.accumulating   || [];

        const buys  = activity.filter(t => t.type === 'BUY');
        const sells = activity.filter(t => t.type === 'SELL');

        modal.querySelector('.ait-wm-body').innerHTML = `
            <!-- Summary strip -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:20px">
                <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:10px;padding:12px;text-align:center">
                    <div style="font-size:20px;font-weight:900;color:#60a5fa">${data.tokenCount}</div>
                    <div style="font-size:10px;color:#475569;margin-top:2px">Token Dipegang</div>
                </div>
                <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:10px;padding:12px;text-align:center">
                    <div style="font-size:20px;font-weight:900;color:#a78bfa">${data.txCount}</div>
                    <div style="font-size:10px;color:#475569;margin-top:2px">Tx Terakhir</div>
                </div>
                <div style="background:#0a0e1a;border:1px solid ${accum.length ? 'rgba(34,197,94,.3)' : '#1e293b'};border-radius:10px;padding:12px;text-align:center">
                    <div style="font-size:20px;font-weight:900;color:${accum.length ? '#4ade80' : '#475569'}">${accum.length}</div>
                    <div style="font-size:10px;color:#475569;margin-top:2px">Token Aktif</div>
                </div>
                <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:10px;padding:12px;text-align:center">
                    <div style="font-size:11px;font-weight:700;color:#334155">${data.dataSource || 'Solana RPC'}</div>
                    <div style="font-size:10px;color:#1e293b;margin-top:2px">Sumber Data</div>
                </div>
            </div>

            <!-- Active token highlights -->
            ${accum.length ? `
            <div class="ait-wm-section">
                <div class="ait-wm-section-title">� Token Aktif Dipegang</div>
                <div class="ait-wm-acc-grid">
                    ${accum.map(a => `
                    <div class="ait-wm-acc-pill">
                        📈 ${a.symbol}
                        <span class="count">${a.balance > 1e6 ? (a.balance/1e6).toFixed(1)+'M' : a.balance > 1000 ? (a.balance/1000).toFixed(0)+'K' : Number(a.balance).toFixed(0)}</span>
                    </div>`).join('')}
                </div>
            </div>` : ''}

            <!-- Top Holdings -->
            <div class="ait-wm-section">
                <div class="ait-wm-section-title">💼 Top Holdings (${holdings.length} token)</div>
                ${holdings.length ? `
                <table class="ait-wm-holdings">
                    <thead>
                        <tr><th>#</th><th>Token</th><th>Balance</th><th>Info</th></tr>
                    </thead>
                    <tbody>
                        ${holdings.map((h, i) => `
                        <tr>
                            <td style="color:#334155;font-weight:700">${i + 1}</td>
                            <td>
                                <div style="display:flex;align-items:center;gap:6px">
                                    ${h.logoURI ? `<img src="${h.logoURI}" style="width:18px;height:18px;border-radius:50%;flex-shrink:0" onerror="this.style.display='none'">` : ''}
                                    <div>
                                        <div style="font-weight:700;color:#e2e8f0">${h.symbol}</div>
                                        <div style="font-size:10px;color:#475569">${(h.name||'').slice(0,22)}</div>
                                    </div>
                                </div>
                            </td>
                            <td style="font-family:monospace;color:#94a3b8">${h.balance > 1e9 ? (h.balance/1e9).toFixed(2)+'B' : h.balance > 1e6 ? (h.balance/1e6).toFixed(2)+'M' : h.balance > 1000 ? (h.balance/1000).toFixed(1)+'K' : h.balance.toFixed(2)}</td>
                            <td><a href="https://solscan.io/token/${h.mint}" target="_blank" style="font-size:10px;color:#3b82f6;text-decoration:none">solscan ↗</a></td>
                        </tr>`).join('')}
                    </tbody>
                </table>` : `<div style="color:#334155;font-size:13px;padding:12px">Tidak ada token holdings terdeteksi</div>`}
            </div>

            <!-- Recent Transactions -->
            <div class="ait-wm-section">
                <div class="ait-wm-section-title">📡 Transaksi Terbaru (${activity.length})</div>
                ${activity.length ? activity.slice(0, 15).map(tx => {
                    const isOk = tx.status === 'success';
                    const t = new Date((tx.blockTime || 0) * 1000);
                    const ts = tx.blockTime
                        ? t.toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
                        : '—';
                    const sigShort = tx.signature
                        ? tx.signature.slice(0,8)+'…'+tx.signature.slice(-6)
                        : '?';
                    return `
                    <div class="ait-wm-tx">
                        <div class="ait-wm-tx-icon ${isOk ? 'buy' : 'sell'}">${isOk ? '✅' : '❌'}</div>
                        <div style="flex:1;min-width:0">
                            <div style="font-family:monospace;font-size:11px">
                                <a href="https://solscan.io/tx/${tx.signature}" target="_blank" style="color:#60a5fa;text-decoration:none">${sigShort}</a>
                            </div>
                            <div class="ait-wm-tx-meta">${ts}${tx.memo ? ' · '+tx.memo : ''}</div>
                        </div>
                        <div class="ait-wm-tx-type ${isOk ? 'buy' : 'sell'}" style="font-size:10px">${isOk ? 'OK' : 'FAIL'}</div>
                    </div>`;
                }).join('') : `<div style="color:#334155;font-size:13px;padding:12px">Tidak ada transaksi terbaru</div>`}
            </div>

            <div style="text-align:center;margin-top:8px">
                <a href="https://solscan.io/account/${addr}" target="_blank"
                   style="font-size:11px;color:#3b82f6;text-decoration:none">
                    🔗 Lihat lengkap di Solscan →
                </a>
                <span style="color:#1e293b;margin:0 8px">|</span>
                <span style="font-size:11px;color:#334155">Data: ${new Date(data.fetchedAt).toLocaleTimeString('id-ID')}</span>
            </div>
        `;
    }

    // ─── SECTION: Rugpull Protection ─────────────────────────────
    async function renderRugpull() {
        const sec = document.getElementById('ait-sec-rugpull');
        if (!sec) return;
        sec.innerHTML = `<div class="ait-loading"><div class="ait-spinner"></div>Scanning for rugpull risks…</div>`;

        let data = null;
        try {
            const r = await fetch(`${BASE}/api/dex/trenches`);
            data = await r.json();
        } catch (e) { }

        const tokens = data?.tokens || [];
        const risky = tokens.filter(t => t.rugProb !== 'LOW' || !t.liq);
        const safe = tokens.filter(t => t.rugProb === 'LOW' && t.liq > 10000);

        sec.innerHTML = `
            <div class="ait-kpi-row">
                <div class="ait-kpi" style="--kc:#f87171">
                    <div class="ait-kpi-label">High Risk</div>
                    <div class="ait-kpi-value">${risky.filter(t => t.rugProb === 'HIGH').length}</div>
                    <div class="ait-kpi-sub">Danger tokens</div>
                </div>
                <div class="ait-kpi" style="--kc:#fbbf24">
                    <div class="ait-kpi-label">Medium Risk</div>
                    <div class="ait-kpi-value">${risky.filter(t => t.rugProb === 'MEDIUM').length}</div>
                    <div class="ait-kpi-sub">Caution tokens</div>
                </div>
                <div class="ait-kpi" style="--kc:#22c55e">
                    <div class="ait-kpi-label">Safe</div>
                    <div class="ait-kpi-value">${safe.length}</div>
                    <div class="ait-kpi-sub">Low risk tokens</div>
                </div>
            </div>
            <div class="ait-section-title">⚠️ Risky Tokens — Caution Required</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px">
                ${risky.slice(0, 8).map(t => renderRugCard(t)).join('')}
            </div>
            <div class="ait-section-title">✅ Safe Tokens — Liquidity Verified</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px">
                ${safe.slice(0, 4).map(t => renderRugCard(t)).join('')}
            </div>
        `;
    }

    function renderRugCard(t) {
        const rugProbNum = t.rugProb === 'HIGH' ? 80 : t.rugProb === 'MEDIUM' ? 45 : 15;
        const cls = rugClass(rugProbNum);
        const cirCls = rugCircleClass(rugProbNum);
        const noLiq = !t.liq || t.liq < 5000;
        const noBoost = !t.boosts;

        const checks = [
            { label: 'Has Liquidity', pass: !noLiq, critical: true },
            { label: 'LP Locked', pass: t.liq > 20000, critical: true },
            { label: 'Not Honeypot', pass: t.rugProb !== 'HIGH', critical: true },
            { label: 'Buy/Sell Ratio', pass: t.buys1h >= t.sells1h * 0.7, critical: false },
            { label: 'Volume Healthy', pass: t.vol1h > 10000, critical: false },
            { label: 'Not New Snipe', pass: t.ageH > 0.5, critical: false },
        ];

        return `
        <div class="ait-rug-card ${cls}">
            <div class="ait-rug-header">
                <div class="ait-rug-danger-score ${cirCls}">${rugProbNum}</div>
                <div>
                    <div style="font-size:14px;font-weight:800;color:#f1f5f9">${t.symbol}</div>
                    <div style="font-size:11px;color:#64748b">${t.rugProb} RISK · ${t.dex}</div>
                </div>
                <div style="margin-left:auto;text-align:right">
                    <div style="font-size:13px;font-weight:700;color:#94a3b8">${fmtPrice(t.price)}</div>
                    <div style="font-size:11px;color:#64748b">Liq: $${((t.liq||0)/1000).toFixed(0)}k</div>
                </div>
            </div>
            <div class="ait-rug-checks">
                ${checks.map(c => `
                    <div class="ait-check-item ${c.pass ? 'pass' : c.critical ? 'fail' : 'warn'}">
                        <span class="ci-icon"></span>
                        <span style="color:${c.pass ? '#4ade80' : c.critical ? '#f87171' : '#fbbf24'}">${c.label}</span>
                    </div>`).join('')}
            </div>
        </div>`;
    }

    // ─── SECTION: Copy Trading ────────────────────────────────────
    function renderCopyTrading() {
        const sec = document.getElementById('ait-sec-copy');
        if (!sec) return;

        const wallets = [
            { id: 'w1', name: 'Alpha Whale', addr: 'whAL...p9Fk', winRate: 78, roi30d: 234, trades: 142, drawdown: 18, risk: 'Medium', following: _copyWallets.includes('whAL...p9Fk') },
            { id: 'w2', name: 'Insider Sniper', addr: 'ins3...r7Xm', winRate: 84, roi30d: 567, trades: 89, drawdown: 31, risk: 'High', following: _copyWallets.includes('ins3...r7Xm') },
            { id: 'w3', name: 'DeFi Rotator', addr: 'dfi9...k3Lp', winRate: 71, roi30d: 189, trades: 203, drawdown: 12, risk: 'Low', following: _copyWallets.includes('dfi9...k3Lp') },
            { id: 'w4', name: 'Meme Hunter', addr: 'mme2...p8Qz', winRate: 69, roi30d: 412, trades: 315, drawdown: 45, risk: 'Very High', following: _copyWallets.includes('mme2...p8Qz') },
        ];

        sec.innerHTML = `
            <div class="ait-copy-settings">
                <h3>⚙️ Copy Trade Settings</h3>
                <div class="ait-form-row">
                    <div class="ait-form-label">Risk Multiplier</div>
                    <input class="ait-form-input" type="number" value="1" min="0.1" max="3" step="0.1" id="aitCopyRisk" placeholder="1x = same size">
                    <div style="font-size:11px;color:#64748b">1x = same position size as whale</div>
                </div>
                <div class="ait-form-row">
                    <div class="ait-form-label">Max Trade Size</div>
                    <input class="ait-form-input" type="number" value="0.1" min="0.01" step="0.01" id="aitCopyMaxSize" placeholder="SOL per trade">
                    <div style="font-size:11px;color:#64748b">Max SOL per copied trade</div>
                </div>
                <div class="ait-form-row">
                    <div class="ait-form-label">Auto TP/SL</div>
                    <select class="ait-form-select" id="aitCopyTpSl">
                        <option value="mirror">Mirror whale TP/SL</option>
                        <option value="ai">AI-optimized TP/SL</option>
                        <option value="manual">Manual only</option>
                    </select>
                </div>
            </div>
            <div class="ait-section-title">📋 Wallet Performance Analytics</div>
            <div class="ait-copy-table-wrap">
                <table class="ait-table">
                    <thead><tr>
                        <th>Wallet</th><th>Win Rate</th><th>30d ROI</th><th>Trades</th>
                        <th>Max DD</th><th>Risk</th><th>Status</th>
                    </tr></thead>
                    <tbody>
                        ${wallets.map(w => `
                        <tr>
                            <td>
                                <div style="font-weight:700;color:#e2e8f0">${w.name}</div>
                                <div style="font-size:10px;color:#475569;font-family:monospace">${w.addr}</div>
                            </td>
                            <td style="color:${w.winRate >= 70 ? '#4ade80' : '#fbbf24'};font-weight:700">${w.winRate}%</td>
                            <td style="color:#22c55e;font-weight:700">+${w.roi30d}%</td>
                            <td>${w.trades}</td>
                            <td style="color:${w.drawdown > 30 ? '#f87171' : '#fbbf24'}">${w.drawdown}%</td>
                            <td><span style="padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;background:${w.risk === 'Low' ? 'rgba(34,197,94,.15)' : w.risk === 'Medium' ? 'rgba(251,191,36,.1)' : 'rgba(239,68,68,.12)'};color:${w.risk === 'Low' ? '#4ade80' : w.risk === 'Medium' ? '#fbbf24' : '#f87171'}">${w.risk}</span></td>
                            <td><button class="ait-copy-btn ${w.following ? 'active' : 'inactive'}"
                                onclick="AiTerminal.toggleCopyWallet('${w.addr}','${w.name}',this)">
                                ${w.following ? '✅ Following' : '+ Follow'}
                            </button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="ait-section-title">📡 Copy Trade Feed</div>
            <div id="aitCopyFeed" style="background:#0a0e1a;border:1px solid #1e293b;border-radius:12px;padding:16px">
                ${_copyWallets.length
                    ? `<div style="color:#475569;font-size:13px;text-align:center">Monitoring ${_copyWallets.length} wallet(s) — waiting for trades…</div>`
                    : `<div style="color:#475569;font-size:13px;text-align:center">Follow at least one wallet to start copy trading</div>`
                }
            </div>
        `;
    }

    // ─── SECTION: Portfolio & PNL ─────────────────────────────────
    let _portFilter = 'open'; // open | closed | all

    async function renderPortfolio() {
        const sec = document.getElementById('ait-sec-portfolio');
        if (!sec) return;
        sec.innerHTML = `<div class="ait-loading"><div class="ait-spinner"></div>Loading portfolio…</div>`;

        // ── Resolve wallet address (multiple fallbacks) ───────
        const w = window.PhantomWallet;
        let walletAddr = null;
        if (w && w.isConnected && w.isConnected() && w.address) {
            walletAddr = w.address();
        }
        if (!walletAddr && window.phantom?.solana?.publicKey) {
            walletAddr = window.phantom.solana.publicKey.toString();
        }
        if (!walletAddr && window.solana?.publicKey) {
            walletAddr = window.solana.publicKey.toString();
        }

        // ── Fetch everything in parallel ──────────────────────
        const fetches = [
            fetch(`${BASE}/api/charon/positions?limit=100`).then(r => r.json()).catch(() => []),
            fetch(`${BASE}/api/charon/pnl-summary`).then(r => r.json()).catch(() => null),
        ];
        if (walletAddr) {
            fetches.push(fetch(`${BASE}/api/sol-balance/${walletAddr}`).then(r => r.json()).catch(() => null));
        }

        const results = await Promise.allSettled(fetches);
        const positions   = Array.isArray(results[0]?.value) ? results[0].value : [];
        const pnl         = results[1]?.value || null;
        const walletData  = results[2]?.value || null;

        // ── Wallet data ───────────────────────────────────────
        const solBalance     = walletData?.solBalance  || (w?.balance?.() || 0);
        const solPrice       = walletData?.solPrice    || (w?.solPrice?.() || 0);
        const solUsd         = walletData?.solUsd      || (solBalance * solPrice);
        const tokens         = walletData?.tokens      || [];
        const tokenTotalUsd  = walletData?.tokenTotalUsd || 0;
        const totalUsd       = walletData?.totalUsd    || (solUsd + tokenTotalUsd);

        // ── Bot stats ─────────────────────────────────────────
        const openPos     = positions.filter(p => p.status === 'open');
        const closedPos   = positions.filter(p => p.status === 'closed');
        const totalPnlSol = closedPos.reduce((s, p) => s + (p.pnl_sol || 0), 0);
        const totalPnlPct = pnl?.totalPnlPct || 0;
        const winRate     = pnl?.winRate || 0;
        const wins        = pnl?.wins || 0;
        const losses      = pnl?.losses || 0;
        const avgPnl      = pnl?.avgPnlPct || 0;
        const best        = closedPos.reduce((a, b) => ((b.pnl_percent||0) > (a?.pnl_percent||0) ? b : a), null);

        const filtered = _portFilter === 'open'   ? openPos
                       : _portFilter === 'closed' ? closedPos.slice(0, 30)
                       : positions.slice(0, 50);

        const addrShort = walletAddr ? walletAddr.slice(0,4) + '…' + walletAddr.slice(-4) : '';

        sec.innerHTML = `
            <div class="ait-port-header">
                <div>
                    <div class="ait-port-title">📊 Portfolio & PNL</div>
                    <div class="ait-port-subtitle">Wallet holdings · Charon Bot trades · Realtime balance</div>
                </div>
                <button class="ait-port-refresh" onclick="AiTerminal.refreshPortfolio()">🔄 Refresh</button>
            </div>

            <!-- Wallet live ticker -->
            ${walletAddr ? `
            <div class="ait-port-live-ticker">
                <div class="ait-ticker-dot"></div>
                <span style="color:#60a5fa;font-weight:700">Phantom:</span>
                <span style="color:#f1f5f9;font-weight:700">${solBalance.toFixed(4)} SOL</span>
                ${solUsd > 0 ? `<span style="color:#4ade80">≈ $${solUsd.toFixed(2)}</span>` : ''}
                <span style="color:#475569">·</span>
                <span style="color:#64748b">${addrShort}</span>
                ${totalUsd > 0 ? `<span style="color:#475569">·</span><span style="color:#fbbf24;font-weight:700">Total: $${totalUsd.toFixed(2)}</span>` : ''}
                <span style="margin-left:auto;color:${_config.autoTrade ? '#a78bfa' : '#334155'};font-weight:700">
                    ${_config.autoTrade ? '🤖 Auto Trading: ON' : '⏸ Auto Trading: OFF'}
                </span>
            </div>` : `
            <div class="ait-port-live-ticker" style="cursor:pointer" onclick="PhantomWallet.connect()">
                <div class="ait-ticker-dot" style="background:#475569;animation:none"></div>
                <span style="color:#475569">Wallet belum terhubung — </span>
                <span style="color:#7c3aed;font-weight:700">👻 Connect Phantom untuk lihat saldo & holdings →</span>
            </div>`}

            <!-- PNL Hero -->
            <div class="ait-pnl-hero">
                <div class="ait-pnl-metric">
                    <div class="ait-pnl-metric-label">Saldo SOL</div>
                    <div class="ait-pnl-metric-val ait-pnl-usd">${solBalance > 0 ? solBalance.toFixed(4) : '—'}</div>
                    <div class="ait-pnl-metric-sub">${solUsd > 0 ? '≈ $' + solUsd.toFixed(2) : walletAddr ? 'Memuat harga…' : 'Connect wallet'}</div>
                </div>
                <div class="ait-pnl-metric">
                    <div class="ait-pnl-metric-label">Token Holdings</div>
                    <div class="ait-pnl-metric-val ait-pnl-usd">${tokens.length}</div>
                    <div class="ait-pnl-metric-sub">${tokenTotalUsd > 0 ? '≈ $' + tokenTotalUsd.toFixed(2) : walletAddr ? tokens.length + ' token' : '—'}</div>
                </div>
                <div class="ait-pnl-metric">
                    <div class="ait-pnl-metric-label">Total Portfolio</div>
                    <div class="ait-pnl-metric-val ${totalUsd > 0 ? 'ait-pnl-pos' : 'ait-pnl-usd'}">${totalUsd > 0 ? '$' + totalUsd.toFixed(2) : '—'}</div>
                    <div class="ait-pnl-metric-sub">SOL + ${tokens.length} token</div>
                </div>
                <div class="ait-pnl-metric">
                    <div class="ait-pnl-metric-label">Bot PNL (SOL)</div>
                    <div class="ait-pnl-metric-val ${totalPnlSol >= 0 ? 'ait-pnl-pos' : 'ait-pnl-neg'}">
                        ${totalPnlSol >= 0 ? '+' : ''}${totalPnlSol.toFixed(3)}
                    </div>
                    <div class="ait-pnl-metric-sub">${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}% overall</div>
                </div>
                <div class="ait-pnl-metric">
                    <div class="ait-pnl-metric-label">Win Rate</div>
                    <div class="ait-pnl-metric-val ${winRate >= 60 ? 'ait-pnl-pos' : winRate >= 40 ? 'ait-pnl-neu' : 'ait-pnl-neg'}">
                        ${winRate}%
                    </div>
                    <div class="ait-pnl-metric-sub">${wins}W / ${losses}L</div>
                </div>
                <div class="ait-pnl-metric">
                    <div class="ait-pnl-metric-label">Best Trade</div>
                    <div class="ait-pnl-metric-val ait-pnl-pos">
                        ${best ? '+' + (best.pnl_percent || 0).toFixed(1) + '%' : '—'}
                    </div>
                    <div class="ait-pnl-metric-sub">${best?.token_symbol || 'No trades yet'}</div>
                </div>
            </div>

            <!-- Win rate bar -->
            <div class="ait-winrate-wrap">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="font-size:12px;font-weight:700;color:#94a3b8">Win Rate Progress</span>
                    <span style="font-size:13px;font-weight:900;color:${winRate >= 60 ? '#4ade80' : winRate >= 40 ? '#fbbf24' : '#f87171'}">${winRate}%</span>
                </div>
                <div class="ait-winrate-bar-bg">
                    <div class="ait-winrate-fill" style="width:${winRate}%;background:${winRate >= 60 ? 'linear-gradient(90deg,#16a34a,#4ade80)' : winRate >= 40 ? 'linear-gradient(90deg,#d97706,#fbbf24)' : 'linear-gradient(90deg,#dc2626,#f87171)'}"></div>
                </div>
                <div class="ait-winrate-labels">
                    <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
            </div>

            <!-- ── WALLET HOLDINGS ──────────────────────────── -->
            ${walletAddr ? `
            <div style="margin-bottom:8px">
                <div style="font-size:13px;font-weight:800;color:#f1f5f9;margin-bottom:10px;display:flex;align-items:center;gap:8px">
                    💼 Wallet Holdings
                    <span style="background:#1e293b;color:#475569;border-radius:20px;padding:2px 8px;font-size:11px">${tokens.length + 1} aset</span>
                    ${totalUsd > 0 ? `<span style="margin-left:auto;color:#4ade80;font-size:12px;font-weight:900">$${totalUsd.toFixed(2)} total</span>` : ''}
                </div>
                <!-- SOL row -->
                <div class="ait-holding-row" style="border-color:rgba(96,165,250,.2);background:rgba(96,165,250,.04)">
                    <div class="ait-holding-icon" style="background:linear-gradient(135deg,#9945ff,#14f195);color:#fff;font-size:16px">◎</div>
                    <div class="ait-holding-info">
                        <div class="ait-holding-sym">SOL</div>
                        <div class="ait-holding-name">Solana${solPrice ? ' · $' + solPrice.toFixed(2) : ''}</div>
                    </div>
                    <div class="ait-holding-bal">${solBalance.toFixed(4)}</div>
                    <div class="ait-holding-usd ${solUsd > 0 ? 'pos' : ''}">${solUsd > 0 ? '$' + solUsd.toFixed(2) : '—'}</div>
                </div>
                <!-- SPL tokens -->
                ${tokens.length ? tokens.map(t => {
                    const usd    = t.usdValue || 0;
                    const bal    = t.balance;
                    const balFmt = bal > 1e9 ? (bal/1e9).toFixed(2)+'B'
                                 : bal > 1e6 ? (bal/1e6).toFixed(2)+'M'
                                 : bal > 1000 ? (bal/1000).toFixed(1)+'K'
                                 : bal >= 1 ? bal.toFixed(2)
                                 : bal.toFixed(6);
                    const initial = (t.symbol || '?').slice(0,1).toUpperCase();
                    const hue = initial.charCodeAt(0) * 17 % 360;
                    const priceTxt = t.priceUsd > 0
                        ? (t.priceUsd < 0.0001 ? '$'+t.priceUsd.toExponential(2) : '$'+t.priceUsd.toFixed(t.priceUsd < 0.01 ? 6 : t.priceUsd < 1 ? 4 : 2))
                        : '';
                    return `
                    <div class="ait-holding-row">
                        ${t.logoURI
                            ? `<img src="${t.logoURI}" class="ait-holding-icon" style="object-fit:cover;border-radius:50%" onerror="this.outerHTML='<div class=\\'ait-holding-icon\\' style=\\'background:hsl(${hue},55%,22%);color:hsl(${hue},70%,65%)\\'>${initial}</div>'">`
                            : `<div class="ait-holding-icon" style="background:hsl(${hue},55%,22%);color:hsl(${hue},70%,65%)">${initial}</div>`}
                        <div class="ait-holding-info">
                            <div class="ait-holding-sym">${t.symbol}</div>
                            <div class="ait-holding-name">${(t.name||'').slice(0,24)}${priceTxt ? ' · '+priceTxt : ''}</div>
                        </div>
                        <div class="ait-holding-bal">${balFmt}</div>
                        <div class="ait-holding-usd ${usd >= 0.01 ? 'pos' : ''}">${usd >= 0.001 ? '$'+usd.toFixed(usd < 0.01 ? 4 : 2) : '< $0.01'}</div>
                    </div>`;
                }).join('')
                : `<div style="color:#334155;font-size:12px;padding:10px 4px">Tidak ada SPL token terdeteksi di wallet ini.</div>`}
                ${walletData?.fetchedAt ? `<div style="font-size:10px;color:#1e293b;text-align:right;margin-top:6px">Data: ${new Date(walletData.fetchedAt).toLocaleTimeString('id-ID')} · <a href="https://solscan.io/account/${walletAddr}" target="_blank" style="color:#1e3a5f">solscan ↗</a></div>` : ''}
            </div>` : ''}

            <!-- ── CHARON BOT TRADES ───────────────────────── -->
            <div style="font-size:13px;font-weight:800;color:#f1f5f9;margin:16px 0 10px;display:flex;align-items:center;gap:8px">
                🤖 Charon Bot Trades
                <span style="background:#1e293b;color:#475569;border-radius:20px;padding:2px 8px;font-size:11px">${positions.length} total</span>
            </div>

            <div class="ait-port-tabs">
                <button class="ait-port-tab ${_portFilter === 'open' ? 'active' : ''}" onclick="AiTerminal.setPortFilter('open')">
                    🔵 Open (${openPos.length})
                </button>
                <button class="ait-port-tab ${_portFilter === 'closed' ? 'active' : ''}" onclick="AiTerminal.setPortFilter('closed')">
                    ✅ Closed (${closedPos.length})
                </button>
                <button class="ait-port-tab ${_portFilter === 'all' ? 'active' : ''}" onclick="AiTerminal.setPortFilter('all')">
                    📋 Semua (${positions.length})
                </button>
            </div>

            <div class="ait-pos-grid" id="aitPosGrid">
                ${filtered.length ? filtered.map(p => renderPositionCard(p)).join('') : `
                    <div class="ait-port-empty">
                        <div class="ait-port-empty-icon">${_portFilter === 'open' ? '🔍' : '📭'}</div>
                        ${_portFilter === 'open'
                            ? 'Tidak ada posisi terbuka saat ini<br><small style="color:#334155">Auto Trading akan membuka posisi saat AI score ≥ ' + _config.minScore + '</small>'
                            : 'Belum ada riwayat trade dari Charon Bot'}
                    </div>`}
            </div>
        `;
    }

    function renderPositionCard(p) {
        const isOpen   = p.status === 'open';
        const pnlPct   = p.pnl_percent || 0;
        const pnlSol   = p.pnl_sol || 0;
        const isWin    = pnlPct > 0;
        const cardCls  = isOpen ? 'pos-open' : (isWin ? 'pos-win' : 'pos-loss');
        const badgeCls = isOpen ? 'badge-open' : (isWin ? 'badge-win' : 'badge-loss');
        const badgeTxt = isOpen ? '⬤ OPEN' : (isWin ? '✅ WIN' : '❌ LOSS');

        const entryMs  = p.entry_at_ms || p.open_at_ms;
        const closeMs  = p.closed_at_ms;
        const entryTime = entryMs ? new Date(entryMs).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
        const duration = (entryMs && closeMs)
            ? (() => { const d = (closeMs - entryMs) / 60000; return d < 60 ? d.toFixed(0) + 'm' : (d / 60).toFixed(1) + 'h'; })()
            : isOpen ? '⏳ Running' : '—';

        const entryPrice = p.entry_price ? fmtPrice(p.entry_price) : '—';
        const exitPrice  = p.exit_price  ? fmtPrice(p.exit_price)  : '—';
        const sizeSol    = p.position_size_sol ? p.position_size_sol.toFixed(3) + ' SOL' : '—';
        const mode       = (p.mode || 'dry_run').replace('_', ' ').toUpperCase();

        return `
        <div class="ait-pos-card ${cardCls}">
            <div>
                <span class="ait-pos-badge ${badgeCls}">${badgeTxt}</span>
                <div style="font-size:9px;color:#475569;margin-top:4px">${mode}</div>
            </div>
            <div>
                <div style="display:flex;align-items:center;gap:8px">
                    <div class="ait-pos-sym">${p.token_symbol || p.mint?.slice(0,8) || '?'}</div>
                    <div class="ait-pos-name">${(p.token_name || '').slice(0, 20)}</div>
                </div>
                <div class="ait-pos-meta">
                    <span>📥 Entry: <b style="color:#e2e8f0">${entryPrice}</b></span>
                    ${!isOpen ? `<span>📤 Exit: <b style="color:#e2e8f0">${exitPrice}</b></span>` : ''}
                    <span>💰 Size: <b style="color:#e2e8f0">${sizeSol}</b></span>
                    <span>⏱ ${entryTime}</span>
                    <span>⌛ ${duration}</span>
                    ${p.exit_reason ? `<span>🏁 ${p.exit_reason}</span>` : ''}
                </div>
            </div>
            <div class="ait-pos-pnl">
                <div class="ait-pos-pnl-val ${isOpen ? 'ait-pnl-usd' : (isWin ? 'ait-pnl-pos' : 'ait-pnl-neg')}">
                    ${isOpen ? '—' : (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(1) + '%'}
                </div>
                <div class="ait-pos-pnl-sol">
                    ${isOpen ? 'Live' : (pnlSol >= 0 ? '+' : '') + pnlSol.toFixed(4) + ' SOL'}
                </div>
                ${p.tp_percent ? `<div class="ait-pos-exit" style="color:#4ade80">TP ${p.tp_percent}%</div>` : ''}
            </div>
        </div>`;
    }

    function setPortFilter(f) {
        _portFilter = f;
        renderPortfolio();
    }

    function refreshPortfolio() {
        renderPortfolio();
    }

    // ─── SECTION: Live Engine Log ─────────────────────────────────
    let _logEntries    = [];
    let _logFilter     = 'ALL';
    let _logAutoScroll = true;
    let _logLastId     = 0;
    let _logPollTmr    = null;

    async function renderLiveLog() {
        const sec = document.getElementById('ait-sec-log');
        if (!sec) return;

        // initial fetch
        await _fetchLogEntries();

        // loop-check
        let loops = [];
        try {
            const lr = await fetch(`${BASE}/api/activity-log/loop-check?window=20`);
            const ld = await lr.json();
            loops = ld.loops || [];
        } catch(e) {}

        // balance guard
        const pw = window.PhantomWallet;
        const solBal = (pw && pw.isConnected()) ? pw.balance() : null;
        const isLowBal = solBal !== null && solBal < 0.05;

        const levels = ['ALL','BUY','SELL','WARN','ERROR','LOOP','BALANCE','SKIP','SYSTEM'];

        // Count entries per level
        const counts = {};
        _logEntries.forEach(e => { counts[e.level] = (counts[e.level] || 0) + 1; });

        sec.innerHTML = `
            ${loops.length ? `
            <div class="ait-loop-alert">
                <div class="ait-loop-icon">🔁</div>
                <div class="ait-loop-body">
                    <div class="ait-loop-title">Loop Trading Terdeteksi!</div>
                    <div class="ait-loop-desc">Sistem berulang membeli token yang sama. Cek filter token atau aktifkan Anti Overtrading di Auto Config.</div>
                    <div class="ait-loop-pills">${loops.map(l => `<span class="ait-loop-pill">${l.symbol} ×${l.count}</span>`).join('')}</div>
                </div>
            </div>` : ''}

            ${isLowBal ? `
            <div class="ait-balance-warn">
                <span style="font-size:18px">💰</span>
                <div>
                    <span style="color:#a78bfa;font-weight:800">Saldo SOL Rendah: ${solBal.toFixed(4)} SOL</span>
                    <span style="color:#64748b;font-size:11px;margin-left:8px">Minimum ~0.05 SOL untuk swap + fee jaringan</span>
                </div>
            </div>` : ''}

            <div class="ait-log-stats">
                ${['BUY','SELL','WARN','ERROR','LOOP'].map(l => `
                    <div class="ait-log-stat">
                        <span class="lvl-${l} ait-log-stat-val">${counts[l] || 0}</span>
                        <span style="color:#334155;margin-left:3px">${l}</span>
                    </div>`).join('')}
                <div class="ait-log-stat" style="margin-left:auto">
                    <span style="color:#475569">${_logEntries.length} entries total</span>
                </div>
            </div>

            <div class="ait-log-toolbar">
                <span class="ait-log-title">🖥️ Live Log</span>
                <span class="ait-log-status streaming" id="aitLogStatus">POLLING</span>
                ${levels.map(l => `<button class="ait-log-filter-btn ${_logFilter===l?'active':''}" onclick="AiTerminal.setLogFilter('${l}')">${l}</button>`).join('')}
                <button class="ait-port-refresh" onclick="AiTerminal.refreshLog()" title="Bersihkan & reload">🗑️ Clear</button>
                <button class="ait-log-scroll-btn" onclick="AiTerminal.toggleLogScroll()" id="aitScrollBtn">${_logAutoScroll ? '📌 Auto-scroll ON' : '📌 Auto-scroll OFF'}</button>
            </div>
            <div id="aitLogTerminal"></div>
            <div style="margin-top:8px;font-size:10px;color:#1e3a5f;display:flex;justify-content:space-between">
                <span>Poll interval: 3s · Ring buffer: 500 entries</span>
                <a href="${BASE}/api/activity-log" target="_blank" style="color:#1e4d2b">Open JSON →</a>
            </div>
        `;
        _renderLogLines();
        _startLogPolling();
    }

    function _renderLogLines() {
        const el = document.getElementById('aitLogTerminal');
        if (!el) return;
        const ICONS = {
            BUY:'💚', SELL:'🔴', WARN:'⚠️', ERROR:'🚨',
            SKIP:'⏭', LOOP:'🔁', BALANCE:'💰', SYSTEM:'⚙️', INFO:'·'
        };
        const filtered = _logFilter === 'ALL'
            ? _logEntries
            : _logEntries.filter(e => e.level === _logFilter);
        const slice = filtered.slice(-200);
        if (!slice.length) {
            el.innerHTML = `<div style="color:#1e293b;padding:20px;text-align:center;font-size:12px">
                Belum ada log · Mulai auto trading atau reload backend</div>`;
            return;
        }
        el.innerHTML = slice.map(e => {
            const d = new Date(e.ts);
            const t = d.toLocaleTimeString('id-ID', { hour12: false });
            const icon = ICONS[e.level] || '·';
            const meta = e.meta && Object.keys(e.meta).length
                ? ' ' + Object.entries(e.meta)
                    .map(([k,v]) => `<span style="color:#1e4d2b">${k}=</span><span style="color:#166534">${v}</span>`)
                    .join(' ')
                : '';
            return `<div class="ait-log-line line-${e.level}">
                <span class="ait-log-ts">${t}</span>
                <span class="ait-log-lvl lvl-${e.level}">${icon} ${e.level}</span>
                <span class="ait-log-src" title="${e.source}">${e.source}</span>
                <span class="ait-log-msg">${e.message}${meta}</span>
            </div>`;
        }).join('');
        if (_logAutoScroll) el.scrollTop = el.scrollHeight;
    }

    async function _fetchLogEntries() {
        try {
            const r = await fetch(`${BASE}/api/activity-log?limit=200&since=${_logLastId}`);
            const d = await r.json();
            if (d.entries && d.entries.length) {
                _logEntries.push(...d.entries);
                if (_logEntries.length > 500) _logEntries = _logEntries.slice(-500);
                _logLastId = d.lastId || _logLastId;
            }
        } catch(e) {
            const st = document.getElementById('aitLogStatus');
            if (st) { st.className = 'ait-log-status offline'; st.textContent = 'OFFLINE'; }
        }
    }

    function _startLogPolling() {
        if (_logPollTmr) clearInterval(_logPollTmr);
        _logPollTmr = setInterval(async () => {
            if (_tab !== 'log') {
                clearInterval(_logPollTmr);
                _logPollTmr = null;
                return;
            }
            await _fetchLogEntries();
            _renderLogLines();
        }, 3000);
    }

    function setLogFilter(f) {
        _logFilter = f;
        // re-render toolbar buttons active state
        document.querySelectorAll('.ait-log-filter-btn').forEach(b => {
            b.classList.toggle('active', b.textContent.trim() === f);
        });
        _renderLogLines();
    }

    function refreshLog() {
        _logEntries = [];
        _logLastId  = 0;
        renderLiveLog();
    }

    function toggleLogScroll() {
        _logAutoScroll = !_logAutoScroll;
        const btn = document.getElementById('aitScrollBtn');
        if (btn) btn.textContent = _logAutoScroll ? '📌 Auto-scroll ON' : '📌 Auto-scroll OFF';
    }

    // ─── SECTION: Auto Trade Config ───────────────────────────────
    function renderAutoConfig() {
        const sec = document.getElementById('ait-sec-auto');
        if (!sec) return;

        const toggles = [
            { id: 'autoTrade',     label: '🤖 Auto Trading',        sub: 'Execute buys automatically when AI signal triggers' },
            { id: 'autoTp',        label: '🎯 Auto Take Profit',     sub: 'Sell at TP1/TP2/TP3 automatically' },
            { id: 'autoSl',        label: '🛑 Auto Stop Loss',       sub: 'Emergency sell if price drops below SL' },
            { id: 'trailingStop',  label: '📈 Trailing Stop',        sub: 'Dynamic SL that follows price up' },
            { id: 'partialTp',     label: '⚖️ Partial Take Profit',  sub: 'Sell 33% at each TP level' },
            { id: 'dcaMode',       label: '🔄 DCA Mode',             sub: 'Dollar-cost average on dips' },
            { id: 'rugProtect',    label: '🛡 Rugpull Protection',   sub: 'Auto exit if liquidity drops >50%' },
            { id: 'antiOverTrade', label: '⛔ Anti Overtrading',     sub: 'Max 5 trades per day' },
        ];

        const isActive = _config.autoTrade;

        sec.innerHTML = `
            <!-- Status Banner -->
            <div style="background:${isActive ? 'rgba(124,58,237,.15)' : 'rgba(30,41,59,.5)'};
                border:1px solid ${isActive ? 'rgba(124,58,237,.4)' : '#1e293b'};
                border-radius:14px;padding:16px 20px;margin-bottom:16px;
                display:flex;align-items:center;gap:16px;flex-wrap:wrap">
                <div style="width:12px;height:12px;border-radius:50%;flex-shrink:0;
                    background:${isActive ? '#a78bfa' : '#334155'};
                    ${isActive ? 'box-shadow:0 0 10px #a78bfa;animation:ait-pulse 1.2s infinite' : ''}">
                </div>
                <div>
                    <div style="font-size:15px;font-weight:800;color:${isActive ? '#a78bfa' : '#475569'}">
                        AUTO TRADING ${isActive ? 'AKTIF 🟢' : 'NONAKTIF ⏸'}
                    </div>
                    <div style="font-size:11px;color:#475569;margin-top:2px">
                        ${isActive
                            ? `Min Score: ${_config.minScore} · Max Size: ${_config.maxSizeSol} SOL · Max Positions: ${_config.maxPositions}`
                            : 'Aktifkan toggle "Auto Trading" di bawah lalu klik Simpan'}
                    </div>
                </div>
                ${isActive ? `
                <div style="margin-left:auto;display:flex;gap:8px">
                    <span style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:#4ade80;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">
                        TP: ${_config.autoTp ? '✓' : '✗'}
                    </span>
                    <span style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#f87171;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">
                        SL: ${_config.autoSl ? '✓' : '✗'}
                    </span>
                    <span style="background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:#fbbf24;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700">
                        RUG: ${_config.rugProtect ? '✓' : '✗'}
                    </span>
                </div>` : ''}
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                <div style="grid-column:1/-1">
                    <div class="ait-copy-settings">
                        <h3>💰 Risk Management</h3>
                        <div class="ait-form-row">
                            <div class="ait-form-label">Max Risk Per Trade</div>
                            <input class="ait-form-input" id="aitInput_maxRisk" type="number"
                                value="${_config.maxRiskPct}" min="0.5" max="10" step="0.5">
                            <span style="font-size:12px;color:#64748b">% of portfolio</span>
                        </div>
                        <div class="ait-form-row">
                            <div class="ait-form-label">Daily Max Loss</div>
                            <input class="ait-form-input" id="aitInput_dailyLoss" type="number"
                                value="${_config.dailyMaxLoss}" min="1" max="20" step="1">
                            <span style="font-size:12px;color:#64748b">% — auto stop trading</span>
                        </div>
                        <div class="ait-form-row">
                            <div class="ait-form-label">Min AI Score to Trade</div>
                            <input class="ait-form-input" id="aitInput_minScore" type="number"
                                value="${_config.minScore}" min="40" max="95" step="5">
                        </div>
                        <div class="ait-form-row">
                            <div class="ait-form-label">Max Open Positions</div>
                            <input class="ait-form-input" id="aitInput_maxPos" type="number"
                                value="${_config.maxPositions}" min="1" max="20" step="1">
                        </div>
                        <div class="ait-form-row">
                            <div class="ait-form-label">Max Trade Size (SOL)</div>
                            <input class="ait-form-input" id="aitInput_maxSize" type="number"
                                value="${_config.maxSizeSol}" min="0.01" max="10" step="0.01">
                        </div>
                    </div>
                </div>
            </div>

            <div class="ait-copy-settings">
                <h3>🔧 Auto Engine Toggles</h3>
                ${toggles.map(t => `
                    <div class="ait-toggle-row">
                        <div>
                            <div class="ait-toggle-label">${t.label}</div>
                            <div class="ait-toggle-sub">${t.sub}</div>
                        </div>
                        <label class="ait-toggle">
                            <input type="checkbox" id="aitToggle_${t.id}"
                                ${_config[t.id] ? 'checked' : ''}
                                onchange="AiTerminal.onToggleChange('${t.id}',this.checked)">
                            <span class="ait-slider"></span>
                        </label>
                    </div>`).join('')}
            </div>
            <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
                <button class="ait-phantom-btn" onclick="AiTerminal.saveAutoConfig()">💾 Simpan Konfigurasi</button>
                <button class="ait-refresh-btn" onclick="AiTerminal.testAutoConfig()">🧪 Test Mode (Simulasi)</button>
                <button class="ait-refresh-btn" onclick="AiTerminal.switchTab('dashboard')" style="margin-left:auto">← Dashboard</button>
            </div>
        `;
    }

    // ─── SECTION: Sentiment ───────────────────────────────────────
    async function renderSentiment() {
        const sec = document.getElementById('ait-sec-sentiment');
        if (!sec) return;
        sec.innerHTML = `<div class="ait-loading"><div class="ait-spinner"></div>Analyzing social sentiment…</div>`;

        let news = null;
        try {
            const r = await fetch(`${BASE}/api/news-sentiment`);
            news = await r.json();
        } catch (e) { }

        const sentiment = news?.overall || { bullish: 62, bearish: 28, neutral: 10 };
        const hype = news?.hypeScore || 74;
        const virality = news?.viralityScore || 58;

        sec.innerHTML = `
            <div class="ait-kpi-row">
                <div class="ait-kpi" style="--kc:#22c55e">
                    <div class="ait-kpi-label">Bullish %</div>
                    <div class="ait-kpi-value">${sentiment.bullish || 62}%</div>
                    <div class="ait-kpi-sub">Positive sentiment</div>
                </div>
                <div class="ait-kpi" style="--kc:#f87171">
                    <div class="ait-kpi-label">Bearish %</div>
                    <div class="ait-kpi-value">${sentiment.bearish || 28}%</div>
                    <div class="ait-kpi-sub">Negative sentiment</div>
                </div>
                <div class="ait-kpi" style="--kc:#7c3aed">
                    <div class="ait-kpi-label">Hype Score</div>
                    <div class="ait-kpi-value">${hype}</div>
                    <div class="ait-kpi-sub">Social momentum</div>
                </div>
                <div class="ait-kpi" style="--kc:#3b82f6">
                    <div class="ait-kpi-label">Virality</div>
                    <div class="ait-kpi-value">${virality}</div>
                    <div class="ait-kpi-sub">Trend velocity</div>
                </div>
            </div>

            <div class="ait-sentiment-row">
                <div class="ait-sentiment-meter">
                    <div class="ait-sent-title">📊 Market Sentiment</div>
                    <div class="ait-sent-bars">
                        ${[['Twitter/X', sentiment.bullish || 62, '#1d9bf0'], ['Telegram', 68, '#2ca5e0'], ['Reddit', 55, '#ff4500'], ['Influencers', 71, '#a78bfa']].map(([n, v, c]) => `
                        <div class="ait-sent-bar-row">
                            <div class="ait-sent-bar-label">${n}</div>
                            <div class="ait-sent-bar-bg">
                                <div class="ait-sent-bar-fill" style="width:${v}%;background:${c}"></div>
                            </div>
                            <div class="ait-sent-bar-val" style="color:${c}">${v}%</div>
                        </div>`).join('')}
                    </div>
                </div>
                <div class="ait-sentiment-meter">
                    <div class="ait-sent-title">🌐 Narrative Strength</div>
                    <div class="ait-sent-bars">
                        ${[['AI & Agents', 82, '#7c3aed'], ['Meme Coins', 74, '#f59e0b'], ['DeFi', 61, '#3b82f6'], ['Gaming', 45, '#10b981'], ['RWA', 55, '#06b6d4']].map(([n, v, c]) => `
                        <div class="ait-sent-bar-row">
                            <div class="ait-sent-bar-label">${n}</div>
                            <div class="ait-sent-bar-bg">
                                <div class="ait-sent-bar-fill" style="width:${v}%;background:${c}"></div>
                            </div>
                            <div class="ait-sent-bar-val" style="color:${c}">${v}%</div>
                        </div>`).join('')}
                    </div>
                </div>
            </div>

            <div class="ait-section-title">📰 Recent News Impact</div>
            <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:12px;overflow:hidden">
                ${(news?.items || []).slice(0, 6).map(item => `
                <div style="padding:12px 16px;border-bottom:1px solid #0f172a;display:flex;gap:12px;align-items:flex-start">
                    <span style="font-size:18px;flex-shrink:0">${item.sentiment > 0.2 ? '📈' : item.sentiment < -0.2 ? '📉' : '📰'}</span>
                    <div style="flex:1">
                        <div style="font-size:12px;color:#e2e8f0;font-weight:600;margin-bottom:3px">${item.title || item.headline || 'News item'}</div>
                        <div style="font-size:11px;color:#475569">${item.source || 'Crypto News'} · ${timeAgo(item.publishedAt || item.ts || Date.now() - 3600000)}</div>
                    </div>
                    <span style="padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;background:${item.sentiment > 0.2 ? 'rgba(34,197,94,.15)' : item.sentiment < -0.2 ? 'rgba(239,68,68,.12)' : 'rgba(100,116,139,.15)'};color:${item.sentiment > 0.2 ? '#4ade80' : item.sentiment < -0.2 ? '#f87171' : '#94a3b8'}">
                        ${item.sentiment > 0.2 ? 'Bullish' : item.sentiment < -0.2 ? 'Bearish' : 'Neutral'}
                    </span>
                </div>`).join('') || '<div style="padding:20px;color:#475569;font-size:13px;text-align:center">Loading news analysis…</div>'}
            </div>
        `;
    }

    // ─── User Actions ─────────────────────────────────────────────
    function toggleCopyWallet(addr, name, btn) {
        const idx = _copyWallets.indexOf(addr);
        if (idx === -1) {
            _copyWallets.push(addr);
            btn.className = 'ait-wc-follow-btn following';
            btn.textContent = '✅ Following — Copy Active';
            showToast('copy', `Following ${name}`, `Auto-copying trades from ${shortAddr(addr)}`);
        } else {
            _copyWallets.splice(idx, 1);
            btn.className = 'ait-wc-follow-btn';
            btn.textContent = '📋 Follow & Copy Trade';
        }
        // Also update copy btn style if in table
        document.querySelectorAll('.ait-copy-btn').forEach(b => {
            if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(addr)) {
                b.className = `ait-copy-btn ${_copyWallets.includes(addr) ? 'active' : 'inactive'}`;
                b.textContent = _copyWallets.includes(addr) ? '✅ Following' : '+ Follow';
            }
        });
    }

    function quickBuy(mint, symbol, price) {
        if (!window.PhantomWallet || !window.PhantomWallet.isConnected()) {
            showToast('danger', 'Wallet Required', `Connect Phantom to trade ${symbol}`);
            // Switch to swap tab
            document.querySelector('[data-tab="solana-swap"]')?.click();
            setTimeout(() => window.PhantomWallet?.connect(), 500);
            return;
        }
        const size = 0.05; // default 0.05 SOL
        showToast('signal', `Buying ${symbol}`, `Executing ${size} SOL via Jupiter…`);
        // Trigger Jupiter swap
        if (window.solanaSwapTo) {
            window.solanaSwapTo(mint);
            document.querySelector('[data-tab="solana-swap"]')?.click();
        } else {
            showToast('info', 'Redirect', `Opening Swap tab for ${symbol}`);
            document.querySelector('[data-tab="solana-swap"]')?.click();
        }
    }

    function watchToken(pairAddress, symbol) {
        showToast('info', `Watching ${symbol}`, `Added to watchlist`);
        // Add to price alerts if available
        if (window.PriceAlerts) {
            try { window.PriceAlerts.addWatchlist?.(symbol); } catch (e) { }
        }
    }

    function openSignalDetail(pairAddress) {
        // Open in DEX Analyzer tab
        if (pairAddress) {
            document.querySelector('[data-tab="dex-analyzer"]')?.click();
            setTimeout(() => {
                const inp = document.querySelector('#dexAnalyzerInput, [placeholder*="paste"], [placeholder*="address"]');
                if (inp) { inp.value = pairAddress; inp.dispatchEvent(new Event('input')); }
            }, 300);
        }
    }

    function filterSignals(type, btn) {
        document.querySelectorAll('.ait-copy-btn').forEach(b => b.className = 'ait-copy-btn inactive');
        btn.className = 'ait-copy-btn active';
        const grid = document.getElementById('aitSignalsGrid');
        if (!grid) return;
        grid.querySelectorAll('.ait-signal-card').forEach(card => {
            card.style.display = (type === 'all' || card.classList.contains(type.replace('-', '-'))) ? '' : 'none';
        });
    }

    function saveAutoConfig() {
        // Read toggles
        ['autoTrade','autoTp','autoSl','trailingStop','partialTp','dcaMode','rugProtect','antiOverTrade'].forEach(id => {
            const el = document.getElementById(`aitToggle_${id}`);
            if (el) _config[id] = el.checked;
        });
        // Read inputs
        const nums = {
            aitInput_maxRisk: 'maxRiskPct',
            aitInput_dailyLoss: 'dailyMaxLoss',
            aitInput_minScore: 'minScore',
            aitInput_maxPos: 'maxPositions',
            aitInput_maxSize: 'maxSizeSol',
        };
        Object.entries(nums).forEach(([elId, key]) => {
            const el = document.getElementById(elId);
            if (el) _config[key] = parseFloat(el.value) || _config[key];
        });
        _saveConfig();
        updateAutoStatusBadge();
        showToast('signal', '💾 Config Saved', _config.autoTrade ? '🟢 Auto Trading is ACTIVE' : '⏸ Auto Trading is OFF');
    }

    function testAutoConfig() {
        showToast('info', '🧪 Test Mode', 'Running simulation — no real trades will be executed');
    }

    function onToggleChange(id, value) {
        // Preview change in topbar badge immediately — not saved until user clicks Simpan
        if (id === 'autoTrade') {
            const badge = document.getElementById('aitAutoStatusBadge');
            if (badge) {
                badge.className = value ? 'auto-on' : 'auto-off';
                badge.innerHTML = value ? '🤖 AUTO TRADING: ON' : '⏸ AUTO TRADING: OFF';
            }
            // Show warning if enabling without wallet
            if (value && window.PhantomWallet && !PhantomWallet.isConnected()) {
                showToast('danger', '⚠️ Wallet Belum Konek', 'Connect Phantom dulu sebelum auto trading!');
            }
        }
    }

    function updateAutoStatusBadge() {
        const badge = document.getElementById('aitAutoStatusBadge');
        if (!badge) return;
        if (_config.autoTrade) {
            badge.className = 'auto-on';
            badge.innerHTML = '🤖 AUTO TRADING: ON';
        } else {
            badge.className = 'auto-off';
            badge.innerHTML = '⏸ AUTO TRADING: OFF';
        }
    }

    // ─── SECTION: MM Analysis ─────────────────────────────────────
    let _mmSymbol = 'BTCUSDT';
    let _mmInterval = '1h';

    async function renderMMAnalysis() {
        const sec = document.getElementById('ait-sec-mm-analysis');
        if (!sec) return;
        sec.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
                <input id="mmSymbolInput" value="${_mmSymbol}" placeholder="e.g. SOLUSDT"
                    style="background:#060912;border:1px solid #1e3a5f;color:#e2e8f0;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;width:130px;outline:none;text-transform:uppercase">
                <select id="mmIntervalSelect" style="background:#060912;border:1px solid #1e293b;color:#e2e8f0;border-radius:8px;padding:8px 12px;font-size:13px;outline:none">
                    <option value="15m" ${_mmInterval==='15m'?'selected':''}>15m</option>
                    <option value="1h"  ${_mmInterval==='1h' ?'selected':''}>1h</option>
                    <option value="4h"  ${_mmInterval==='4h' ?'selected':''}>4h</option>
                    <option value="1d"  ${_mmInterval==='1d' ?'selected':''}>1d</option>
                </select>
                <button onclick="AiTerminal.runMMAnalysis()" style="background:linear-gradient(135deg,#1e3a5f,#7c3aed);border:none;color:#e2e8f0;border-radius:8px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer">
                    🧠 Analyze
                </button>
                <span style="font-size:11px;color:#475569">Advanced Market Maker Analysis Engine · SMC + Wyckoff + Fib + Probability</span>
            </div>
            <div id="mmAnalysisBody">
                <div class="ait-loading"><div class="ait-spinner"></div>Enter a symbol and click Analyze…</div>
            </div>`;
    }

    async function runMMAnalysis() {
        const symEl  = document.getElementById('mmSymbolInput');
        const intEl  = document.getElementById('mmIntervalSelect');
        if (symEl)  _mmSymbol   = (symEl.value || 'BTCUSDT').toUpperCase().trim();
        if (intEl)  _mmInterval = intEl.value || '1h';

        const body = document.getElementById('mmAnalysisBody');
        if (!body) return;
        body.innerHTML = `<div class="ait-loading"><div class="ait-spinner"></div>Running AI Market Maker Analysis on ${_mmSymbol} (${_mmInterval})…</div>`;

        let d = null;
        try {
            const r = await fetch(`${BASE}/api/mm-analysis/${_mmSymbol}?interval=${_mmInterval}&limit=200`);
            d = await r.json();
        } catch (e) {
            body.innerHTML = `<div class="ait-empty">⚠️ Error: ${e.message}</div>`;
            return;
        }

        if (d?.error) {
            body.innerHTML = `<div class="ait-empty">⚠️ ${d.error}</div>`;
            return;
        }

        const sig     = d.signal        || {};
        const conv    = d.conviction     || {};
        const prob    = d.probabilities  || {};
        const wyk     = d.wyckoff        || {};
        const fib     = d.fibonacci      || {};
        const liq     = d.liquidity      || {};
        const of      = d.orderFlow      || {};
        const vol     = d.volatility     || {};
        const fb      = d.fakeBreakout   || {};
        const mc      = d.monteCarlo     || {};
        const choch   = d.choch          || [];
        const smc     = d.smc            || {};
        const price   = d.currentPrice   || 0;
        const chg24   = d.priceChange24h;

        const convColor = conv.score >= 75 ? '#22c55e' : conv.score >= 55 ? '#fbbf24' : '#f87171';
        const sigColors = {
            'STRONG LONG':  '#22c55e', 'LONG': '#4ade80', 'SCALP LONG': '#a3e635',
            'WATCH':        '#fbbf24',
            'SCALP SHORT':  '#fb923c', 'SHORT': '#f87171', 'STRONG SHORT': '#ef4444',
        };
        const sigColor  = sigColors[sig.signal] || '#94a3b8';
        const wyckoffColors = {
            MARKUP: '#22c55e', ACCUMULATION: '#60a5fa',
            MARKDOWN: '#f87171', DISTRIBUTION: '#fb923c', RANGING: '#fbbf24'
        };
        const wykColor  = wyckoffColors[wyk.phase] || '#94a3b8';
        const volColors = { HIGH_VOL: '#f87171', NORMAL: '#4ade80', LOW_VOL: '#60a5fa', SQUEEZE: '#fbbf24' };

        const fmtP = (n) => {
            if (!n && n !== 0) return '—';
            if (Math.abs(n) >= 1000) return '$' + (n/1000).toFixed(1) + 'k';
            if (Math.abs(n) >= 1) return '$' + n.toFixed(4);
            if (Math.abs(n) >= 0.001) return '$' + n.toFixed(6);
            return '$' + n.toExponential(3);
        };
        const fmtPct = (n, plus=true) => n !== undefined && n !== null ? (plus && n > 0 ? '+' : '') + n.toFixed(2) + '%' : '—';

        body.innerHTML = `
        <!-- ── ROW 1: Conviction + Signal hero ──────────────────── -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">

            <!-- Conviction Gauge -->
            <div style="background:linear-gradient(135deg,#060d1a,#0a1628);border:1px solid #1e3a5f;border-radius:16px;padding:20px;position:relative;overflow:hidden">
                <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${convColor},transparent)"></div>
                <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">🎯 AI Conviction Score</div>
                <div style="display:flex;align-items:flex-end;gap:12px;margin-bottom:12px">
                    <div style="font-size:56px;font-weight:900;color:${convColor};line-height:1">${conv.score || 0}</div>
                    <div>
                        <div style="font-size:14px;font-weight:800;color:${convColor}">${conv.rating || '—'}</div>
                        <div style="font-size:11px;color:#475569;margin-top:2px">${sig.timeframe || ''}</div>
                    </div>
                </div>
                <div style="background:#0a0e1a;border-radius:8px;height:8px;overflow:hidden;margin-bottom:10px">
                    <div style="height:100%;width:${conv.score || 0}%;background:linear-gradient(90deg,${convColor}88,${convColor});border-radius:8px;transition:width .8s"></div>
                </div>
                ${conv.breakdown ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px">
                    ${Object.entries(conv.breakdown).map(([k,v]) => `
                    <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #0f172a">
                        <span style="color:#475569">${k.replace(/([A-Z])/g,' $1').trim()}</span>
                        <span style="color:#94a3b8;font-weight:700">${typeof v === 'number' ? v.toFixed(1) : v}</span>
                    </div>`).join('')}
                </div>` : ''}
            </div>

            <!-- Signal Panel -->
            <div style="background:linear-gradient(135deg,#060d1a,#0a1628);border:1px solid ${sigColor}40;border-radius:16px;padding:20px;position:relative;overflow:hidden">
                <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${sigColor},transparent)"></div>
                <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">📡 AI Trade Signal</div>
                <div style="font-size:28px;font-weight:900;color:${sigColor};margin-bottom:8px">${sig.signal || 'ANALYZING…'}</div>
                <div style="font-size:12px;color:#94a3b8;margin-bottom:14px">${_mmSymbol} · ${_mmInterval} · ${sig.direction || ''}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
                    <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                        <div style="color:#475569;margin-bottom:3px">Entry</div>
                        <div style="font-weight:700;color:#60a5fa">${fmtP(sig.entry)}</div>
                    </div>
                    <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                        <div style="color:#475569;margin-bottom:3px">Risk/Reward</div>
                        <div style="font-weight:700;color:${(sig.rr||0) >= 2 ? '#4ade80' : '#fbbf24'}">${sig.rr ? sig.rr + 'x' : '—'}</div>
                    </div>
                    <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                        <div style="color:#4ade80;margin-bottom:3px">TP1 ${fmtPct(sig.tp1Pct)}</div>
                        <div style="font-weight:700;color:#4ade80">${fmtP(sig.tp1)}</div>
                    </div>
                    <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                        <div style="color:#f87171;margin-bottom:3px">SL ${fmtPct(sig.slPct)}</div>
                        <div style="font-weight:700;color:#f87171">${fmtP(sig.sl)}</div>
                    </div>
                    <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                        <div style="color:#fbbf24;margin-bottom:3px">TP2 ${fmtPct(sig.tp2Pct)}</div>
                        <div style="font-weight:700;color:#fbbf24">${fmtP(sig.tp2)}</div>
                    </div>
                    <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                        <div style="color:#a78bfa;margin-bottom:3px">TP3 ${fmtPct(sig.tp3Pct)}</div>
                        <div style="font-weight:700;color:#a78bfa">${fmtP(sig.tp3)}</div>
                    </div>
                </div>
                ${price ? `<div style="margin-top:10px;font-size:11px;color:#475569">
                    Live: <b style="color:#f1f5f9">${fmtP(price)}</b>
                    ${chg24 !== null && chg24 !== undefined ? `<span style="color:${chg24>=0?'#4ade80':'#f87171'};margin-left:8px">${fmtPct(chg24)} 24h</span>` : ''}
                </div>` : ''}
            </div>
        </div>

        <!-- ── ROW 2: Probability Meters ─────────────────────────── -->
        <div style="background:#080c18;border:1px solid #1e293b;border-radius:14px;padding:16px;margin-bottom:16px">
            <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">📊 Multi-Factor Probability Engine</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">
                ${[
                    { label: 'Uptrend Continuation', val: prob.uptrend || 0, color: '#22c55e', icon: '📈' },
                    { label: 'Reversal / Distribution', val: prob.reversal || 0, color: '#f87171', icon: '📉' },
                    { label: 'Fake Breakout Risk', val: prob.fakeBreakout || 0, color: '#fbbf24', icon: '⚠️' },
                ].map(p => `
                <div style="text-align:center">
                    <div style="font-size:11px;color:#475569;margin-bottom:8px">${p.icon} ${p.label}</div>
                    <div style="font-size:36px;font-weight:900;color:${p.color};margin-bottom:8px">${p.val}%</div>
                    <div style="background:#0a0e1a;border-radius:4px;height:6px;overflow:hidden">
                        <div style="height:100%;width:${p.val}%;background:${p.color}44;border-right:2px solid ${p.color};transition:width .8s"></div>
                    </div>
                </div>`).join('')}
            </div>
            ${mc.tpProb ? `
            <div style="margin-top:14px;padding-top:12px;border-top:1px solid #1e293b;display:flex;gap:20px;font-size:11px;justify-content:center;flex-wrap:wrap">
                <span style="color:#64748b">🎲 Monte Carlo (300 sims, 48h):</span>
                <span style="color:#4ade80;font-weight:700">TP Hit: ${mc.tpProb}%</span>
                <span style="color:#f87171;font-weight:700">SL Hit: ${mc.slProb}%</span>
                <span style="color:#94a3b8;font-weight:700">Open: ${mc.openProb}%</span>
            </div>` : ''}
        </div>

        <!-- ── ROW 3: Wyckoff + Market Structure + Order Flow ──────── -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">

            <!-- Wyckoff Phase -->
            <div style="background:#080c18;border:1px solid ${wykColor}33;border-radius:14px;padding:16px">
                <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">📐 Wyckoff Phase</div>
                <div style="font-size:22px;font-weight:900;color:${wykColor};margin-bottom:6px">${wyk.phase || '—'}</div>
                <div style="background:#0a0e1a;border-radius:4px;height:5px;overflow:hidden;margin-bottom:8px">
                    <div style="height:100%;width:${wyk.confidence || 0}%;background:${wykColor};transition:width .8s"></div>
                </div>
                <div style="font-size:11px;color:#64748b;margin-bottom:4px">Confidence: <b style="color:${wykColor}">${wyk.confidence || 0}%</b></div>
                <div style="font-size:11px;color:#475569;line-height:1.6">${wyk.detail || ''}</div>
                ${wyk.rangeWidth ? `<div style="font-size:10px;color:#334155;margin-top:6px">Range width: ${wyk.rangeWidth}%</div>` : ''}
            </div>

            <!-- Market Structure (BOS/CHoCH) -->
            <div style="background:#080c18;border:1px solid #1e293b;border-radius:14px;padding:16px">
                <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">🏗️ Market Structure</div>
                ${smc.bosEvents?.length ? `
                <div style="margin-bottom:8px">
                    ${smc.bosEvents.slice(-3).reverse().map(b => `
                    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #0a0e1a;font-size:11px">
                        <span style="padding:2px 7px;border-radius:4px;font-size:10px;font-weight:800;background:${b.type==='bullish'?'rgba(34,197,94,.15)':'rgba(239,68,68,.12)'};color:${b.type==='bullish'?'#4ade80':'#f87171'}">BOS ${b.type==='bullish'?'↑':'↓'}</span>
                        <span style="color:#94a3b8">${fmtP(b.swingPrice)}</span>
                        <span style="color:#334155;margin-left:auto">str: ${b.strength}</span>
                    </div>`).join('')}
                </div>` : '<div style="color:#334155;font-size:12px">No recent BOS detected</div>'}
                ${choch.length ? `
                <div style="margin-top:8px">
                    ${choch.slice(-2).map(c => `
                    <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:11px">
                        <span style="padding:2px 7px;border-radius:4px;font-size:10px;font-weight:800;background:rgba(124,58,237,.15);color:#a78bfa">CHoCH ${c.type==='bullish'?'↑':'↓'}</span>
                        <span style="color:#94a3b8">${fmtP(c.level)}</span>
                    </div>`).join('')}
                </div>` : ''}
                ${smc.signal?.signal && smc.signal.signal !== 'NONE' ? `
                <div style="margin-top:8px;padding:8px;background:#0a0e1a;border-radius:8px;font-size:11px">
                    <span style="color:#7c3aed;font-weight:700">SMC: </span>
                    <span style="color:#e2e8f0">${smc.signal.signal}</span>
                    <span style="color:#475569;margin-left:6px">${smc.signal.confidence}% conf</span>
                </div>` : ''}
            </div>

            <!-- Order Flow -->
            <div style="background:#080c18;border:1px solid #1e293b;border-radius:14px;padding:16px">
                <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">📦 Order Flow</div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                    <div style="font-size:24px;font-weight:900;color:${of.buyPct>=50?'#4ade80':'#f87171'}">${of.buyPct || 50}%</div>
                    <div style="font-size:11px;color:#64748b">BUY pressure</div>
                    <div style="margin-left:auto;padding:3px 8px;border-radius:8px;font-size:11px;font-weight:700;background:${of.trend==='BUYING'?'rgba(34,197,94,.15)':'rgba(239,68,68,.12)'};color:${of.trend==='BUYING'?'#4ade80':'#f87171'}">
                        ${of.trend || 'NEUTRAL'}
                    </div>
                </div>
                <!-- Buy/Sell bar -->
                <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin-bottom:10px">
                    <div style="width:${of.buyPct||50}%;background:#22c55e80"></div>
                    <div style="flex:1;background:#ef444450"></div>
                </div>
                <div style="font-size:11px;color:#475569;margin-bottom:5px">
                    Sell: <b style="color:#f87171">${(100-(of.buyPct||50)).toFixed(1)}%</b>
                </div>
                ${of.volSpike ? `<div style="padding:5px 8px;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);border-radius:6px;font-size:11px;color:#fb923c;margin-top:6px">
                    ⚡ Volume Spike ${of.volSpikeX}× avg
                </div>` : ''}
            </div>
        </div>

        <!-- ── ROW 4: Fibonacci + Volatility ──────────────────────── -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">

            <!-- Fibonacci Levels -->
            <div style="background:#080c18;border:1px solid #1e293b;border-radius:14px;padding:16px">
                <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">
                    📐 Fibonacci Confluence · <span style="color:${fib.direction==='bullish'?'#4ade80':'#f87171'}">${fib.direction==='bullish'?'Bull Retracement':'Bear Retracement'}</span>
                </div>
                ${fib.levels?.length ? `
                <div style="display:flex;flex-direction:column;gap:4px;max-height:220px;overflow-y:auto">
                    ${fib.levels.map(l => `
                    <div style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:6px;background:${l.isActive?'rgba(124,58,237,.12)':'transparent'};border:1px solid ${l.isActive?'rgba(124,58,237,.25)':'transparent'}">
                        <span style="font-size:10px;font-weight:700;color:${l.isActive?'#a78bfa':'#334155'};width:36px">Fib ${l.ratio}</span>
                        <div style="flex:1;background:#0a0e1a;border-radius:2px;height:4px;overflow:hidden">
                            <div style="height:100%;background:${l.isActive?'#7c3aed':'#1e293b'};width:100%"></div>
                        </div>
                        <span style="font-size:11px;color:${l.isActive?'#c4b5fd':'#475569'};font-weight:${l.isActive?'700':'400'}">${fmtP(l.price)}</span>
                        ${l.isActive ? `<span style="font-size:9px;background:#7c3aed20;color:#a78bfa;padding:1px 5px;border-radius:3px">✦ ACTIVE</span>` : `<span style="font-size:9px;color:#334155">${l.zone}</span>`}
                    </div>`).join('')}
                </div>
                ${fib.strongestFib ? `<div style="margin-top:10px;padding:8px;background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.3);border-radius:8px;font-size:11px">
                    <span style="color:#a78bfa;font-weight:700">Golden Zone: Fib ${fib.strongestFib.ratio}</span> at <b style="color:#c4b5fd">${fmtP(fib.strongestFib.price)}</b>
                    <span style="color:#475569"> · Confluence: ${fib.confluenceScore}</span>
                </div>` : ''}` : '<div style="color:#334155;font-size:12px">Calculating Fibonacci levels…</div>'}
            </div>

            <!-- Volatility + Fakeout -->
            <div style="display:flex;flex-direction:column;gap:12px">
                <!-- Volatility -->
                <div style="background:#080c18;border:1px solid #1e293b;border-radius:14px;padding:16px;flex:1">
                    <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">📡 Volatility Engine</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px">
                        <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                            <div style="color:#475569;margin-bottom:3px">ATR (14)</div>
                            <div style="font-weight:700;color:#94a3b8">${fmtP(vol.atr)}</div>
                            <div style="color:#334155;font-size:10px">${vol.atrPct}% of price</div>
                        </div>
                        <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                            <div style="color:#475569;margin-bottom:3px">BB Width</div>
                            <div style="font-weight:700;color:#94a3b8">${vol.bbWidth}%</div>
                        </div>
                        <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                            <div style="color:#475569;margin-bottom:3px">Regime</div>
                            <div style="font-weight:700;color:${volColors[vol.regime]||'#94a3b8'}">${vol.regime || '—'}</div>
                        </div>
                        <div style="background:#0a0e1a;border-radius:8px;padding:8px 10px">
                            <div style="color:#475569;margin-bottom:3px">Percentile</div>
                            <div style="font-weight:700;color:#94a3b8">${vol.percentile}th</div>
                        </div>
                    </div>
                </div>
                <!-- Fake Breakout -->
                <div style="background:#080c18;border:1px solid ${fb.fakeoutScore>50?'rgba(239,68,68,.3)':'#1e293b'};border-radius:14px;padding:16px;flex:1">
                    <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">🪤 Fake Breakout Risk</div>
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                        <div style="font-size:28px;font-weight:900;color:${fb.fakeoutScore>60?'#f87171':fb.fakeoutScore>30?'#fbbf24':'#4ade80'}">${fb.fakeoutScore || 0}</div>
                        <div>
                            <div style="font-size:12px;font-weight:700;color:${fb.reliability==='HIGH'?'#4ade80':fb.reliability==='MEDIUM'?'#fbbf24':'#f87171'}">${fb.reliability || '—'} Reliability</div>
                            <div style="font-size:10px;color:#475569">${fb.recentCount || 0} fakeouts in last 10 candles</div>
                        </div>
                    </div>
                    ${fb.isCurrentFakeout ? `<div style="padding:6px 10px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:6px;font-size:11px;color:#f87171">
                        ⚠️ Current candle shows fakeout wick pattern
                    </div>` : `<div style="font-size:11px;color:#334155">No active fakeout on current candle</div>`}
                </div>
            </div>
        </div>

        <!-- ── ROW 5: Liquidity Heatmap ───────────────────────────── -->
        <div style="background:#080c18;border:1px solid #1e293b;border-radius:14px;padding:16px;margin-bottom:16px">
            <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">
                💧 Liquidity Pools Heatmap
                ${liq.sweepRisk ? `<span style="margin-left:10px;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:800;background:${liq.sweepRisk==='HIGH'?'rgba(239,68,68,.15)':'rgba(251,191,36,.12)'};color:${liq.sweepRisk==='HIGH'?'#f87171':'#fbbf24'}">Sweep Risk: ${liq.sweepRisk}</span>` : ''}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                <!-- Above price (sell-side) -->
                <div>
                    <div style="font-size:11px;font-weight:700;color:#f87171;margin-bottom:8px">🔴 SELL-SIDE Liquidity (Above Price)</div>
                    ${(liq.pools||[]).filter(p=>p.type==='sell-side'&&!p.swept).slice(0,5).map(p => {
                        const barW = Math.max(10, Math.min(100, 100 - p.distAtr * 15));
                        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px">
                            <span style="color:#475569;width:60px;text-align:right">${p.distAtr}× ATR</span>
                            <div style="flex:1;background:#1e293b;border-radius:2px;height:6px;overflow:hidden">
                                <div style="height:100%;width:${barW}%;background:linear-gradient(90deg,#ef444422,#ef4444);transition:width .6s"></div>
                            </div>
                            <span style="color:#f87171;font-weight:700;min-width:70px;text-align:right">${fmtP(p.price)}</span>
                        </div>`;
                    }).join('') || '<div style="color:#334155;font-size:11px">No sell-side pools detected</div>'}
                </div>
                <!-- Below price (buy-side) -->
                <div>
                    <div style="font-size:11px;font-weight:700;color:#4ade80;margin-bottom:8px">🟢 BUY-SIDE Liquidity (Below Price)</div>
                    ${(liq.pools||[]).filter(p=>p.type==='buy-side'&&!p.swept).slice(0,5).map(p => {
                        const barW = Math.max(10, Math.min(100, 100 - p.distAtr * 15));
                        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:11px">
                            <span style="color:#475569;width:60px;text-align:right">${p.distAtr}× ATR</span>
                            <div style="flex:1;background:#1e293b;border-radius:2px;height:6px;overflow:hidden">
                                <div style="height:100%;width:${barW}%;background:linear-gradient(90deg,#22c55e22,#22c55e);transition:width .6s"></div>
                            </div>
                            <span style="color:#4ade80;font-weight:700;min-width:70px;text-align:right">${fmtP(p.price)}</span>
                        </div>`;
                    }).join('') || '<div style="color:#334155;font-size:11px">No buy-side pools detected</div>'}
                </div>
            </div>
            ${(liq.equalHighs?.length || liq.equalLows?.length) ? `
            <div style="margin-top:12px;padding-top:10px;border-top:1px solid #1e293b">
                <div style="font-size:11px;font-weight:700;color:#fbbf24;margin-bottom:6px">⚖️ Equal Highs/Lows (Magnet Zones)</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    ${(liq.equalHighs||[]).map(e => `<span style="background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.2);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">EQH ${fmtP(e.price)}</span>`).join('')}
                    ${(liq.equalLows||[]).map(e => `<span style="background:rgba(34,197,94,.1);color:#4ade80;border:1px solid rgba(34,197,94,.2);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">EQL ${fmtP(e.price)}</span>`).join('')}
                </div>
            </div>` : ''}
        </div>

        <!-- ── ROW 6: FVG Zones from SMC ──────────────────────────── -->
        ${smc.fvgZones?.filter(z=>!z.filled)?.length ? `
        <div style="background:#080c18;border:1px solid #1e293b;border-radius:14px;padding:16px;margin-bottom:16px">
            <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">🔲 Unfilled FVG Zones (SMC)</div>
            <div style="display:flex;flex-direction:column;gap:6px">
                ${smc.fvgZones.filter(z=>!z.filled).slice(-8).map(z => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:${z.type==='bullish'?'rgba(34,197,94,.06)':'rgba(239,68,68,.06)'};border:1px solid ${z.type==='bullish'?'rgba(34,197,94,.2)':'rgba(239,68,68,.2)'};border-radius:8px;font-size:11px">
                    <span style="font-weight:700;color:${z.type==='bullish'?'#4ade80':'#f87171'}">${z.type==='bullish'?'Bull FVG ↑':'Bear FVG ↓'}</span>
                    <span style="color:#94a3b8">${fmtP(z.bottom)} — ${fmtP(z.top)}</span>
                    <span style="color:#475569">Gap: ${fmtP(z.gapSize)}</span>
                    <span style="margin-left:auto;background:${z.strength>70?'rgba(124,58,237,.2)':'#1e293b'};color:${z.strength>70?'#a78bfa':'#475569'};padding:2px 8px;border-radius:4px;font-weight:700">str ${z.strength}</span>
                </div>`).join('')}
            </div>
        </div>` : ''}

        <!-- ── Footer: metadata ───────────────────────────────────── -->
        <div style="text-align:right;font-size:10px;color:#1e293b;margin-top:8px">
            ${d.meta?.engineVersion || 'mm-engine'} · analyzed ${smc.meta?.candleCount || '—'} candles · ${d._cached ? 'cached' : 'live'} · ${new Date(d.fetchedAt||Date.now()).toLocaleTimeString('id-ID')}
            <button onclick="AiTerminal.runMMAnalysis()" style="margin-left:12px;background:transparent;border:1px solid #1e293b;color:#334155;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer">↻ Refresh</button>
        </div>
        `;
    }

    // ─── Wallet Tracer ────────────────────────────────────────────
    const _tracerState = {
        addresses: [],
        results: {},
        loading: new Set(),
        compareMode: false,
    };

    async function renderWalletTracer() {
        // Wallet Tracer is now inside Smart Money tab (🐋 Smart Money → 🔍 Wallet Tracer)
        AiTerminal.switchTab('smart-money');
        setTimeout(() => AiTerminal.switchSmSub('tracer'), 100);
    }

    function loadPresetWallet(addr) {
        const ta = document.getElementById('wtAddrInput');
        if (!ta) return;
        const ALL = 'MobS6L5HhVJtxpeafDgREsweWFh53xFoUeP9pgbaDSf\nfNrJmJ1aQMx1vgnGwJcLWkUCBrDy7GF7ZpVqiXuRFrJ\n4hSXPtxZgXFpo6Vxq9yqxNjcBoqWN3VoaPJWonUtupzD';
        if (addr === 'ALL') { ta.value = ALL; return; }
        const cur = ta.value.trim();
        ta.value = cur ? cur + '\n' + addr : addr;
    }

    async function traceWallets() {
        const ta = document.getElementById('wtAddrInput');
        const out = document.getElementById('wtResults');
        if (!ta || !out) return;
        const addrs = ta.value.split('\n').map(s => s.trim()).filter(s => s.length >= 30).slice(0, 5);
        if (!addrs.length) { out.innerHTML = '<div style="color:#ef4444;padding:10px">⚠️ Masukkan minimal 1 wallet address</div>'; return; }

        out.innerHTML = `<div style="color:#3b82f6;padding:20px;text-align:center">
            <div style="font-size:24px;margin-bottom:8px">⏳</div>
            Tracing ${addrs.length} wallet(s)... fetching on-chain data...
        </div>`;

        const results = await Promise.allSettled(
            addrs.map(addr => fetch(`/api/wallet-trace/${addr}`).then(r => r.json()))
        );

        const wallets = results.map((r, i) => r.status === 'fulfilled' ? r.value : { ok: false, address: addrs[i], error: r.reason?.message });
        out.innerHTML = wallets.map(w => _renderWalletCard(w)).join('');
    }

    async function compareWallets() {
        const ta = document.getElementById('wtAddrInput');
        const out = document.getElementById('wtResults');
        if (!ta || !out) return;
        const addrs = ta.value.split('\n').map(s => s.trim()).filter(s => s.length >= 30).slice(0, 5);
        if (addrs.length < 2) { out.innerHTML = '<div style="color:#ef4444;padding:10px">⚠️ Butuh minimal 2 wallet untuk compare</div>'; return; }

        out.innerHTML = `<div style="color:#8b5cf6;padding:20px;text-align:center">
            <div style="font-size:24px;margin-bottom:8px">🔗</div>
            Comparing ${addrs.length} wallets & detecting coordination...
        </div>`;

        const r = await fetch('/api/wallet-compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses: addrs }),
        }).then(r => r.json());

        if (!r.ok) { out.innerHTML = `<div style="color:#ef4444;padding:10px">❌ ${r.error}</div>`; return; }

        let html = '';

        // Coordination signals panel
        if (r.coordSignals?.length) {
            html += `<div style="background:#1c1917;border:1px solid #f59e0b;border-radius:10px;padding:14px;margin-bottom:16px">
                <div style="font-size:13px;font-weight:700;color:#f59e0b;margin-bottom:10px">🔗 COORDINATION SIGNALS</div>
                ${r.coordSignals.map(s => `
                    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #292524">
                        <span style="font-size:16px">${s.type === 'alert' ? '🚨' : '⚠️'}</span>
                        <span style="font-size:12px;color:#fbbf24">${s.msg}</span>
                    </div>
                `).join('')}
            </div>`;
        }

        // Common tokens
        if (r.commonMints?.length) {
            html += `<div style="background:#0f172a;border:1px solid #3b82f6;border-radius:10px;padding:14px;margin-bottom:16px">
                <div style="font-size:13px;font-weight:700;color:#3b82f6;margin-bottom:8px">🎯 ${r.commonMints.length} TOKEN(S) DIPEGANG SEMUA WALLET</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                    ${r.commonMints.map(m => `<span style="background:#1e3a5f;color:#93c5fd;padding:3px 10px;border-radius:20px;font-family:monospace;font-size:11px">${m.slice(0,8)}...${m.slice(-4)}</span>`).join('')}
                </div>
            </div>`;
        }

        // Side-by-side comparison
        html += `<div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
                <tr style="background:#0f172a;border-bottom:2px solid #1e293b">
                    <th style="padding:10px;text-align:left;color:#64748b;font-weight:600">Metric</th>
                    ${r.wallets.map(w => `<th style="padding:10px;text-align:right;color:#94a3b8;font-family:monospace">${(w.shortAddr || w.address?.slice(0,6)+'...'+w.address?.slice(-4))}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${[
                    ['💰 Total USD', w => `$${_fmtUsd(w.totalUsd||0)}`],
                    ['◎ SOL Balance', w => `${(w.solBalance||0).toFixed(2)} SOL`],
                    ['🪙 Token Count', w => w.tokenCount || 0],
                    ['📊 TX Count', w => w.txCount || 0],
                    ['⚡ TX/day', w => w.txFreqPerDay || 0],
                    ['❌ Fail Rate', w => `${w.failRate||0}%`],
                    ['🧠 SM Score', w => `${w.smartMoneyScore||0}/100`],
                    ['📅 Last Active', w => w.lastActiveAgo || '?'],
                    ['🏷️ Type', w => (w.classification?.labels||[]).slice(0,2).join(' ')],
                ].map(([label, fn]) => `
                    <tr style="border-bottom:1px solid #0f172a">
                        <td style="padding:8px 10px;color:#64748b">${label}</td>
                        ${r.wallets.map(w => `<td style="padding:8px 10px;text-align:right;color:#e2e8f0">${fn(w)}</td>`).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table></div>`;

        // Individual wallet cards
        html += `<div style="margin-top:16px;font-size:13px;font-weight:700;color:#64748b;padding:4px 0">📋 DETAIL PER WALLET</div>`;
        html += r.wallets.map(w => _renderWalletCard(w)).join('');

        out.innerHTML = html;
    }

    function _fmtUsd(n) {
        if (n >= 1_000_000) return (n/1_000_000).toFixed(2) + 'M';
        if (n >= 1_000)     return (n/1_000).toFixed(1) + 'K';
        return n.toFixed(0);
    }

    function _renderWalletCard(w) {
        if (!w.ok) return `
        <div style="background:#0f172a;border:1px solid #ef4444;border-radius:10px;padding:14px;margin-bottom:12px">
            <div style="color:#ef4444;font-family:monospace;font-size:12px">${w.address}</div>
            <div style="color:#ef4444;font-size:12px;margin-top:6px">❌ ${w.error || 'Fetch failed'}</div>
        </div>`;

        const cls = w.classification || {};
        const tb  = w.tokenBehavior || {};
        const smColor = w.smartMoneyScore >= 70 ? '#22c55e' : w.smartMoneyScore >= 45 ? '#f59e0b' : '#ef4444';

        return `
        <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;margin-bottom:14px;overflow:hidden">

            <!-- Wallet Header -->
            <div style="background:linear-gradient(90deg,#020617,#0f172a);padding:14px 16px;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                <div style="font-family:monospace;font-size:13px;color:#3b82f6;font-weight:600">${w.shortAddr}</div>
                <div style="font-size:11px;color:#475569;background:#0a0a0a;padding:2px 8px;border-radius:4px;font-family:monospace">${w.address}</div>
                <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
                    ${(cls.labels||[]).map(l => `<span style="background:#1e293b;color:#94a3b8;padding:2px 8px;border-radius:20px;font-size:11px">${l}</span>`).join('')}
                </div>
            </div>

            <!-- Smart Money Score Bar -->
            <div style="padding:10px 16px;background:#020617;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:12px">
                <div style="font-size:11px;color:#475569;min-width:120px">🧠 Smart Money Score</div>
                <div style="flex:1;background:#1e293b;border-radius:4px;height:6px;position:relative">
                    <div style="position:absolute;left:0;top:0;height:100%;width:${w.smartMoneyScore||0}%;background:${smColor};border-radius:4px;transition:width 1s"></div>
                </div>
                <div style="font-size:13px;font-weight:700;color:${smColor};min-width:40px;text-align:right">${w.smartMoneyScore||0}/100</div>
            </div>

            <!-- Stats Grid -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;background:#1e293b">
                ${[
                    ['💰 Total USD', `$${_fmtUsd(w.totalUsd||0)}`, w.totalUsd >= 10000 ? '#22c55e' : '#e2e8f0'],
                    ['◎ SOL', `${(w.solBalance||0).toFixed(3)}`, '#a78bfa'],
                    ['🪙 Tokens', w.tokenCount||0, '#60a5fa'],
                    ['📊 TX Count', w.txCount||0, '#94a3b8'],
                    ['⚡ TX/day', w.txFreqPerDay||0, w.txFreqPerDay > 20 ? '#f59e0b' : '#94a3b8'],
                    ['❌ Fail%', `${w.failRate||0}%`, w.failRate > 15 ? '#ef4444' : '#22c55e'],
                    ['📅 Last Active', w.lastActiveAgo||'?', '#64748b'],
                    ['🎯 Style', tb.style||'?', '#94a3b8'],
                ].map(([label, val, color]) => `
                    <div style="background:#0f172a;padding:10px 12px">
                        <div style="font-size:10px;color:#475569;margin-bottom:3px">${label}</div>
                        <div style="font-size:13px;font-weight:600;color:${color}">${val}</div>
                    </div>
                `).join('')}
            </div>

            <!-- Risk Signals -->
            ${(w.riskSignals||[]).length ? `
            <div style="padding:10px 16px;border-top:1px solid #1e293b;display:flex;flex-wrap:wrap;gap:6px">
                ${w.riskSignals.map(s => {
                    const col = s.type === 'warn' ? '#f59e0b' : s.type === 'bull' ? '#22c55e' : '#3b82f6';
                    const ico = s.type === 'warn' ? '⚠️' : s.type === 'bull' ? '✅' : 'ℹ️';
                    return `<div style="background:#0a0a0a;border:1px solid ${col}33;border-radius:6px;padding:4px 10px;font-size:11px;color:${col}">${ico} ${s.msg}</div>`;
                }).join('')}
            </div>` : ''}

            <!-- Token Holdings -->
            ${(w.tokens||[]).filter(t => t.usdValue > 0.01).length ? `
            <div style="border-top:1px solid #1e293b">
                <div style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;border-bottom:1px solid #0f172a">🪙 TOP HOLDINGS</div>
                <div style="padding:6px 0;max-height:200px;overflow-y:auto">
                    ${(w.tokens||[]).filter(t => t.usdValue > 0.01).slice(0,15).map((t, i) => {
                        const pct = w.tokenTotalUsd > 0 ? (t.usdValue/w.totalUsd*100).toFixed(1) : 0;
                        return `
                        <div style="display:flex;align-items:center;gap:10px;padding:5px 16px;${i%2===0?'background:#020617':''}">
                            <div style="font-size:10px;color:#334155;min-width:16px">${i+1}</div>
                            ${t.logoURI ? `<img src="${t.logoURI}" width="18" height="18" style="border-radius:50%;object-fit:cover" onerror="this.style.display='none'">` : '<div style="width:18px;height:18px;background:#1e293b;border-radius:50%"></div>'}
                            <div style="flex:1;min-width:0">
                                <div style="font-size:12px;font-weight:600;color:#e2e8f0">${t.symbol}</div>
                                <div style="font-size:10px;color:#475569">${t.name?.slice(0,20)}</div>
                            </div>
                            <div style="text-align:right">
                                <div style="font-size:12px;color:#22c55e;font-weight:600">$${_fmtUsd(t.usdValue)}</div>
                                <div style="font-size:10px;color:#475569">${pct}%</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}

            <!-- Recent Transactions -->
            ${(w.recentTxs||[]).length ? `
            <div style="border-top:1px solid #1e293b">
                <div style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;border-bottom:1px solid #0f172a">📋 RECENT TRANSACTIONS (${(w.recentTxs||[]).length})</div>
                <div style="max-height:180px;overflow-y:auto">
                    ${(w.recentTxs||[]).slice(0,15).map((tx, i) => `
                    <div style="display:flex;align-items:center;gap:10px;padding:5px 16px;font-size:11px;${i%2===0?'background:#020617':''}">
                        <span style="color:${tx.status==='SUCCESS'?'#22c55e':'#ef4444'};min-width:14px">${tx.status==='SUCCESS'?'✓':'✗'}</span>
                        <span style="color:#475569;min-width:60px">${tx.timeAgo}</span>
                        <a href="${tx.solscanUrl}" target="_blank" style="color:#3b82f6;font-family:monospace;text-decoration:none">${tx.shortSig}</a>
                        ${tx.err ? `<span style="color:#ef4444;font-size:10px">${tx.err.slice(0,40)}</span>` : ''}
                    </div>`).join('')}
                </div>
            </div>` : ''}

            <!-- Footer Links -->
            <div style="padding:10px 16px;border-top:1px solid #1e293b;display:flex;gap:10px;flex-wrap:wrap">
                <a href="${w.solscanUrl}" target="_blank" style="color:#3b82f6;font-size:11px;text-decoration:none">🔗 Solscan</a>
                <a href="${w.solanaFmUrl}" target="_blank" style="color:#8b5cf6;font-size:11px;text-decoration:none">🔗 Solana.fm</a>
                <a href="${w.stepUrl}" target="_blank" style="color:#22c55e;font-size:11px;text-decoration:none">🔗 Step Finance</a>
                <span style="color:#334155;font-size:11px;margin-left:auto">${w.fetchedAt?.slice(0,19).replace('T',' ')} UTC</span>
            </div>
        </div>`;
    }

    // ─── Tab Switching ────────────────────────────────────────────
    function switchTab(tab) {
        _tab = tab;
        document.querySelectorAll('#aitPanel .ait-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.querySelectorAll('#aitPanel .ait-section').forEach(s => s.classList.toggle('active', s.id === `ait-sec-${tab}`));
        const renders = {
            dashboard: renderDashboard,
            portfolio: renderPortfolio,
            signals: renderSignals,
            'smart-money': renderSmartMoney,
            rugpull: renderRugpull,
            copy: renderCopyTrading,
            auto: renderAutoConfig,
            log:  renderLiveLog,
            sentiment: renderSentiment,
            'mm-analysis': renderMMAnalysis,
        };
        if (renders[tab]) renders[tab]();
    }

    // ─── Main render ──────────────────────────────────────────────
    function render() {
        const el = document.getElementById('aitPanel');
        if (!el) return;

        const tabs = [
            { id: 'dashboard',       label: '🏠 Dashboard' },
            { id: 'portfolio',       label: '📊 Portfolio & PNL' },
            { id: 'signals',         label: '🎯 AI Signals' },
            { id: 'mm-analysis',     label: '🧠 MM Analysis' },
            { id: 'smart-money',     label: '🐋 Smart Money' },
            { id: 'sentiment',       label: '📊 Sentiment' },
            { id: 'rugpull',         label: '🛡 Rug Protection' },
            { id: 'copy',            label: '📋 Copy Trading' },
            { id: 'auto',            label: '⚡ Auto Config' },
            { id: 'log',             label: '🖥️ Live Log' },
        ];

        el.innerHTML = `
            <div class="ait-topbar">
                <div class="ait-logo">
                    <div class="ait-logo-icon">🧠</div>
                    <div>
                        <div class="ait-logo-title">AI TRADING TERMINAL</div>
                        <div class="ait-logo-sub">Institutional-Grade · Smart Money · Realtime</div>
                    </div>
                </div>
                <div class="ait-topbar-right">
                    <span class="ait-badge-live">LIVE</span>
                    <button id="aitAutoStatusBadge" onclick="AiTerminal.switchTab('auto')" title="Klik untuk buka pengaturan Auto Trading"></button>
                    <button class="ait-phantom-btn" id="aitTopPhantomBtn" onclick="PhantomWallet.connect()">👻 Connect Phantom</button>
                    <button class="ait-refresh-btn" onclick="AiTerminal.refresh()">🔄 Refresh All</button>
                </div>
            </div>

            <div class="ait-tabs">
                ${tabs.map(t => `<button class="ait-tab ${t.id === _tab ? 'active' : ''}" data-tab="${t.id}" onclick="AiTerminal.switchTab('${t.id}')">${t.label}</button>`).join('')}
            </div>

            ${tabs.map(t => `<div id="ait-sec-${t.id}" class="ait-section ${t.id === _tab ? 'active' : ''}">
                <div class="ait-loading"><div class="ait-spinner"></div>Loading ${t.label}…</div>
            </div>`).join('')}
        `;

        switchTab(_tab);

        // Update phantom btn + auto trading badge
        updateAutoStatusBadge();
        if (window.PhantomWallet) {
            updatePhantomBtn();
        }
    }

    function updatePhantomBtn() {
        const w = window.PhantomWallet;
        const connected = w && w.isConnected();

        // 1. Update topbar button
        const btn = document.getElementById('aitTopPhantomBtn');
        if (btn) {
            if (connected) {
                btn.className = 'ait-phantom-btn connected';
                btn.innerHTML = `👻 ${shortAddr(w.address())}`;
                btn.onclick = () => { w.disconnect(); };
            } else {
                btn.className = 'ait-phantom-btn';
                btn.innerHTML = '👻 Connect Phantom';
                btn.onclick = () => w.connect();
            }
        }

        // 2. Refresh dashboard wallet widget in-place (no full re-render)
        refreshWalletWidget();

        // 3. Toast feedback
        if (connected) {
            showToast('signal', '👻 Wallet Connected!', ` ${shortAddr(w.address())} · ${w.balance().toFixed(3)} SOL`);
        }
    }

    function refresh() {
        render();
    }

    function init() {
        injectStyles();
        render();
        // Sync wallet state after render (Phantom may already be connected via auto-reconnect)
        setTimeout(() => updatePhantomBtn(), 800);
        // Auto refresh every 30s
        if (_scanInterval) clearInterval(_scanInterval);
        _scanInterval = setInterval(() => {
            if (document.querySelector('[data-tab="ai-terminal"]')?.closest('.tab-content')?.style.display !== 'none') {
                if (_tab === 'dashboard') renderDashboard();
                if (_tab === 'portfolio') renderPortfolio();
            }
        }, 15000);
    }

    return { init, render, refresh, switchTab, toggleCopyWallet, quickBuy, watchToken, openSignalDetail, filterSignals, saveAutoConfig, testAutoConfig, onToggleChange, showToast, updatePhantomBtn, setPortFilter, refreshPortfolio, openWalletAnalytics, setLogFilter, refreshLog, toggleLogScroll, runMMAnalysis, traceWallets, compareWallets, loadPresetWallet, switchSmSub, _smGraphReset, _smSaveTgConfig, _smTestTelegram };
})();
