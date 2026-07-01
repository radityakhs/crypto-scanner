// ══════════════════════════════════════════════════════════════════════════════
//  wallet-tracker-ui.js  v2
//  Multi-wallet tracker: single/bulk/smart money import, multi-select,
//  batch operations, live feed filter, Telegram alert
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
───────────────────────────────────────────────────────────────────────────── */
(function injectWalletTrackerStyles() {
    if (document.getElementById('wt-styles')) return;
    const s = document.createElement('style');
    s.id = 'wt-styles';
    s.textContent = `
/* ── Panel shell ────────────────────────────────────────────── */
#walletTrackerPanel {
    display:none; position:fixed; top:0; right:0; width:480px; height:100vh;
    background:#030b15; border-left:1px solid #1e293b; z-index:9500;
    flex-direction:column; font-family:'Inter',sans-serif; overflow:hidden;
    box-shadow:-8px 0 40px rgba(0,0,0,.6);
}
#walletTrackerPanel.open { display:flex; }
.wt-header {
    background:linear-gradient(135deg,#0a1628,#06101e);
    border-bottom:1px solid #1e293b; padding:14px 18px;
    display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
}
.wt-header-left  { display:flex; align-items:center; gap:10px; }
.wt-header-title { font-size:15px; font-weight:800; color:#e2e8f0; }
.wt-header-sub   { font-size:10px; color:#475569; }
.wt-dot { width:8px;height:8px;border-radius:50%;background:#22c55e;animation:wt-blink 1.4s infinite;flex-shrink:0; }
@keyframes wt-blink { 0%,100%{opacity:1}50%{opacity:.25} }
.wt-close-btn { background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px; }
.wt-close-btn:hover { background:#1e293b;color:#e2e8f0; }
.wt-tabs { display:flex;border-bottom:1px solid #1e293b;flex-shrink:0; }
.wt-tab  { flex:1;padding:9px 4px;text-align:center;font-size:11px;font-weight:700;color:#475569;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s; }
.wt-tab:hover  { color:#94a3b8; }
.wt-tab.active { color:#60a5fa;border-bottom-color:#3b82f6; }
.wt-tab-badge  { background:#ef4444;color:#fff;border-radius:8px;padding:0 5px;font-size:9px;margin-left:4px; }
.wt-body { flex:1;overflow-y:auto;overflow-x:hidden; }
.wt-body::-webkit-scrollbar { width:4px; }
.wt-body::-webkit-scrollbar-track { background:#030b15; }
.wt-body::-webkit-scrollbar-thumb { background:#1e293b;border-radius:2px; }
.wt-section {
    font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;
    letter-spacing:.1em;padding:10px 16px 6px;border-bottom:1px solid #06101e;
    display:flex;align-items:center;justify-content:space-between;
}
/* ── Import area ── */
.wt-import-box { padding:14px 16px;border-bottom:1px solid #0f172a;background:#040c18; }
.wt-import-tabs { display:flex;gap:6px;margin-bottom:10px; }
.wt-import-tab { padding:4px 12px;border-radius:20px;border:1px solid #1e293b;background:#060c18;color:#64748b;font-size:10px;font-weight:700;cursor:pointer;transition:all .12s; }
.wt-import-tab.active { background:#1e3a5f;color:#93c5fd;border-color:#3b82f6; }
.wt-single-area input, .wt-bulk-area textarea {
    width:100%;background:#06101e;border:1px solid #1e293b;border-radius:8px;
    color:#e2e8f0;padding:8px 12px;font-size:11px;box-sizing:border-box;outline:none;transition:border .15s;
}
.wt-single-area input { font-family:monospace; }
.wt-single-area input:focus, .wt-bulk-area textarea:focus { border-color:#3b82f6; }
.wt-single-row { display:flex;gap:8px;margin-top:7px; }
.wt-single-row input { flex:1; }
.wt-single-row select { background:#06101e;border:1px solid #1e293b;border-radius:8px;color:#94a3b8;padding:8px 10px;font-size:11px;outline:none; }
.wt-bulk-area textarea { resize:vertical;height:90px;line-height:1.5; }
.wt-bulk-hint { font-size:10px;color:#334155;margin-top:5px;line-height:1.4; }
.wt-bulk-preview { margin-top:8px;max-height:100px;overflow-y:auto; }
.wt-bulk-preview-item { display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:#060c18;border-radius:4px;margin-bottom:3px;font-size:10px; }
.wt-bulk-preview-item.valid   { color:#86efac;border-left:2px solid #22c55e; }
.wt-bulk-preview-item.invalid { color:#fca5a5;border-left:2px solid #ef4444; }
.wt-sm-list { max-height:160px;overflow-y:auto;margin-top:6px; }
.wt-sm-item { display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;cursor:pointer;transition:background .1s; }
.wt-sm-item:hover { background:#060c18; }
.wt-sm-item input[type=checkbox] { accent-color:#3b82f6;width:14px;height:14px;cursor:pointer;flex-shrink:0; }
.wt-sm-addr  { font-size:10px;font-family:monospace;color:#94a3b8; }
.wt-sm-label { font-size:10px;color:#475569; }
.wt-btn-row { display:flex;gap:8px;margin-top:10px; }
.wt-btn { flex:1;padding:9px;border-radius:8px;border:none;font-size:12px;font-weight:700;cursor:pointer;transition:opacity .15s; }
.wt-btn:disabled { opacity:.35;cursor:not-allowed; }
.wt-btn.primary { background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff; }
.wt-btn.primary:hover:not(:disabled) { opacity:.85; }
.wt-btn.secondary { background:#0f172a;border:1px solid #1e293b;color:#94a3b8; }
.wt-btn.secondary:hover:not(:disabled) { background:#1e293b; }
.wt-msg { font-size:11px;margin-top:7px;padding:6px 10px;border-radius:6px;display:none; }
.wt-msg.ok  { background:#14532d;color:#86efac;display:block; }
.wt-msg.err { background:#450a0a;color:#fca5a5;display:block; }
/* ── Batch bar ── */
.wt-batch-bar { display:none;padding:8px 16px;background:#0a1628;border-bottom:1px solid #1e3a5f;flex-shrink:0;align-items:center;gap:8px; }
.wt-batch-bar.show { display:flex; }
.wt-batch-count { font-size:11px;font-weight:700;color:#93c5fd;flex:1; }
.wt-batch-btn { padding:5px 12px;border-radius:6px;border:none;font-size:11px;font-weight:700;cursor:pointer; }
.wt-batch-btn.enable  { background:#14532d;color:#4ade80; }
.wt-batch-btn.disable { background:#422006;color:#fcd34d; }
.wt-batch-btn.delete  { background:#450a0a;color:#fca5a5; }
/* ── Wallet list items ── */
.wt-wallet-item { padding:11px 16px;border-bottom:1px solid #06101e;transition:background .12s;position:relative;display:flex;align-items:flex-start;gap:10px; }
.wt-wallet-item:hover { background:#050d1a; }
.wt-wallet-item.inactive { opacity:.45; }
.wt-wallet-item.selected { background:#061a30;outline:1px solid #1e3a5f; }
.wt-wallet-cb input { accent-color:#3b82f6;width:14px;height:14px;cursor:pointer; }
.wt-wallet-content { flex:1;min-width:0; }
.wt-wallet-row1 { display:flex;align-items:center;justify-content:space-between; }
.wt-wallet-name { font-size:13px;font-weight:700;color:#e2e8f0; }
.wt-wallet-addr { font-size:10px;color:#475569;font-family:monospace;margin-top:1px;word-break:break-all; }
.wt-wallet-meta { font-size:10px;color:#334155;margin-top:4px;display:flex;flex-wrap:wrap;gap:6px; }
.wt-wallet-actions { display:flex;gap:5px;margin-top:6px;flex-wrap:wrap; }
.wt-wallet-btn { background:#0f172a;border:1px solid #1e293b;color:#64748b;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;white-space:nowrap; }
.wt-wallet-btn:hover { background:#1e293b;color:#94a3b8; }
.wt-wallet-btn.on  { background:#14532d;border-color:#22c55e;color:#4ade80; }
.wt-wallet-btn.off { background:#1a0a00;border-color:#92400e;color:#fbbf24; }
.wt-wallet-btn.del:hover { background:#450a0a;border-color:#ef4444;color:#f87171; }
.wt-status-dot { width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px; }
.wt-status-dot.on  { background:#22c55e;animation:wt-blink 1.4s infinite; }
.wt-status-dot.off { background:#475569; }
/* ── Sparkline ── */
.wt-sparkline { display:flex;align-items:flex-end;gap:2px;height:20px;margin-top:5px; }
.wt-spark-bar { width:5px;border-radius:2px 2px 0 0;min-height:2px;transition:height .3s; }
/* ── History Modal ── */
#wtHistoryModal {
    display:none;position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.75);
    align-items:center;justify-content:center;
}
#wtHistoryModal.open { display:flex; }
.wt-modal-box {
    background:#030b15;border:1px solid #1e293b;border-radius:16px;
    width:540px;max-width:95vw;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;
    box-shadow:0 20px 60px rgba(0,0,0,.8);
}
.wt-modal-header {
    background:#06101e;padding:14px 18px;border-bottom:1px solid #1e293b;
    display:flex;align-items:center;justify-content:space-between;flex-shrink:0;
}
.wt-modal-title { font-size:14px;font-weight:800;color:#e2e8f0; }
.wt-modal-sub   { font-size:10px;color:#475569;margin-top:2px; }
.wt-modal-close { background:none;border:none;color:#64748b;font-size:18px;cursor:pointer;padding:4px 8px;border-radius:4px; }
.wt-modal-close:hover { background:#1e293b;color:#e2e8f0; }
.wt-modal-body  { flex:1;overflow-y:auto;padding:16px; }
.wt-modal-body::-webkit-scrollbar { width:4px; }
.wt-modal-body::-webkit-scrollbar-thumb { background:#1e293b;border-radius:2px; }
.wt-chart-wrap  { background:#040c18;border:1px solid #0f172a;border-radius:10px;padding:14px;margin-bottom:14px; }
.wt-chart-title { font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px; }
.wt-chart-legend { display:flex;gap:12px;margin-top:8px;flex-wrap:wrap; }
.wt-chart-legend-item { display:flex;align-items:center;gap:4px;font-size:10px;color:#64748b; }
.wt-chart-legend-dot  { width:8px;height:8px;border-radius:2px; }
.wt-stats-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px; }
.wt-stat-card  { background:#040c18;border:1px solid #0f172a;border-radius:8px;padding:10px 12px;text-align:center; }
.wt-stat-val   { font-size:20px;font-weight:800;color:#e2e8f0; }
.wt-stat-lbl   { font-size:9px;color:#475569;margin-top:3px;text-transform:uppercase;letter-spacing:.06em; }
.wt-tx-row { display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #06101e; }
.wt-tx-icon { width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0; }
.wt-tx-info { flex:1;min-width:0; }
.wt-tx-action { font-size:11px;font-weight:700; }
.wt-tx-detail { font-size:10px;color:#64748b;margin-top:2px; }
.wt-tx-time   { font-size:9px;color:#334155;white-space:nowrap; }
/* ── Feed ── */
.wt-feed-bar { padding:8px 16px;background:#040c18;border-bottom:1px solid #0f172a;display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap; }
.wt-feed-filter { padding:3px 10px;border-radius:20px;border:1px solid #1e293b;background:#060c18;color:#64748b;font-size:10px;font-weight:700;cursor:pointer; }
.wt-feed-filter.active { background:#1e3a5f;color:#93c5fd;border-color:#3b82f6; }
.wt-feed-item { padding:10px 16px;border-bottom:1px solid #06101e;cursor:pointer;transition:background .1s; }
.wt-feed-item:hover { background:#050d1a; }
.wt-feed-item.BUY         { border-left:3px solid #22c55e; }
.wt-feed-item.SELL        { border-left:3px solid #ef4444; }
.wt-feed-item.SWAP        { border-left:3px solid #a78bfa; }
.wt-feed-item.ADD_LP      { border-left:3px solid #06b6d4; }
.wt-feed-item.REMOVE_LP   { border-left:3px solid #f59e0b; }
.wt-feed-item.TRANSFER_OUT{ border-left:3px solid #f97316; }
.wt-feed-item.TRANSFER_IN { border-left:3px solid #3b82f6; }
.wt-feed-item.TOKEN_IN    { border-left:3px solid #60a5fa; }
.wt-feed-item.TOKEN_OUT   { border-left:3px solid #fb923c; }
.wt-feed-item.FAILED      { border-left:3px solid #334155;opacity:.4; }
.wt-feed-item.CONTRACT    { border-left:3px solid #4b5563; }
.wt-feed-top    { display:flex;align-items:center;justify-content:space-between;margin-bottom:3px; }
.wt-feed-wallet { font-size:10px;font-weight:700;color:#60a5fa; }
.wt-feed-action { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em; }
.wt-feed-action.BUY         { color:#4ade80; }
.wt-feed-action.SELL        { color:#f87171; }
.wt-feed-action.SWAP        { color:#c4b5fd; }
.wt-feed-action.ADD_LP      { color:#67e8f9; }
.wt-feed-action.REMOVE_LP   { color:#fcd34d; }
.wt-feed-action.TRANSFER_OUT{ color:#fb923c; }
.wt-feed-action.TRANSFER_IN { color:#93c5fd; }
.wt-feed-action.TOKEN_IN    { color:#7dd3fc; }
.wt-feed-action.TOKEN_OUT   { color:#fdba74; }
.wt-feed-action.FAILED      { color:#475569; }
.wt-feed-detail { font-size:11px;color:#94a3b8;line-height:1.4; }
.wt-feed-meta   { font-size:9px;color:#334155;margin-top:4px;display:flex;align-items:center;gap:8px; }
.wt-feed-meta a { color:#475569;text-decoration:none; }
.wt-feed-meta a:hover { color:#60a5fa; }
.wt-empty { text-align:center;padding:50px 20px;color:#334155; }
.wt-empty-icon { font-size:40px;margin-bottom:12px; }
.wt-empty-text { font-size:13px;line-height:1.6; }
/* ── Toggle button ── */
#walletTrackerToggle {
    position:fixed;bottom:120px;right:20px;z-index:9400;
    background:linear-gradient(135deg,#0f2040,#1e3a5f);
    border:1px solid #3b82f6;border-radius:12px;padding:10px 14px;
    color:#60a5fa;font-size:12px;font-weight:700;cursor:pointer;
    display:flex;align-items:center;gap:6px;box-shadow:0 4px 20px rgba(0,0,0,.5);transition:all .15s;
}
#walletTrackerToggle:hover { background:linear-gradient(135deg,#1d4ed8,#1e40af);color:#fff; }
#wtToggleBadge { background:#ef4444;color:#fff;border-radius:10px;padding:0 5px;font-size:9px;font-weight:800;min-width:16px;text-align:center;display:none; }
#wtToggleBadge.show { display:inline-block; }
`;
    document.head.appendChild(s);
})();

/* ─────────────────────────────────────────────────────────────────────────────
   MODULE
───────────────────────────────────────────────────────────────────────────── */
const WalletTrackerUI = (() => {
    const PROXY = window.PROXY_BASE || 'http://127.0.0.1:3001';
    let _tab        = 'wallets';
    let _importTab  = 'single';
    let _wallets    = [];
    let _feed       = [];
    let _feedFilter = 'all';
    let _selected   = new Set();
    let _newCount   = 0;
    let _pollTimer  = null;
    let _smSuggestions  = [];
    let _smSelectedIdx  = new Set();
    let _smLoading      = false;
    let _smError        = false;

    const shortAddr = a => a ? a.slice(0,5)+'…'+a.slice(-4) : '—';
    const fmtTime = bt => {
        if (!bt) return '—';
        const diff = Math.floor((Date.now() - bt*1000)/1000);
        if (diff < 60)    return diff+'d lalu';
        if (diff < 3600)  return Math.floor(diff/60)+'m lalu';
        if (diff < 86400) return Math.floor(diff/3600)+'j lalu';
        return new Date(bt*1000).toLocaleDateString('id-ID');
    };
    const ACTION_COLORS = {
        BUY:'#4ade80', SELL:'#f87171', SWAP:'#c4b5fd', ADD_LP:'#67e8f9',
        REMOVE_LP:'#fcd34d', TRANSFER_OUT:'#fb923c', TRANSFER_IN:'#93c5fd',
        TOKEN_IN:'#7dd3fc', TOKEN_OUT:'#fdba74', FAILED:'#475569', CONTRACT:'#64748b',
    };

    function parseBulkAddresses(raw) {
        return raw.split(/[\n,;\s]+/)
            .map(s => s.trim())
            .filter(s => s.length >= 32 && s.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s));
    }

    /* ── Panel HTML ── */
    function buildPanel() {
        const panel = document.createElement('div');
        panel.id = 'walletTrackerPanel';
        panel.innerHTML = `
        <div class="wt-header">
            <div class="wt-header-left">
                <div class="wt-dot"></div>
                <div>
                    <div class="wt-header-title">👁 Wallet Tracker</div>
                    <div class="wt-header-sub">Solana · realtime · Telegram alert</div>
                </div>
            </div>
            <button class="wt-close-btn" onclick="WalletTrackerUI.close()">✕</button>
        </div>
        <div class="wt-tabs">
            <div class="wt-tab active" id="wtTab_wallets" onclick="WalletTrackerUI.switchTab('wallets')">
                🏦 Wallets <span id="wtWalletCountBadge" style="font-size:9px;opacity:.6"></span>
            </div>
            <div class="wt-tab" id="wtTab_feed" onclick="WalletTrackerUI.switchTab('feed')">
                📡 Live Feed <span class="wt-tab-badge" id="wtFeedBadge" style="display:none"></span>
            </div>
        </div>
        <div class="wt-batch-bar" id="wtBatchBar">
            <span class="wt-batch-count" id="wtBatchCount">0 dipilih</span>
            <button class="wt-batch-btn enable"  onclick="WalletTrackerUI.batchToggle(true)">✅ Aktifkan</button>
            <button class="wt-batch-btn disable" onclick="WalletTrackerUI.batchToggle(false)">⏸ Nonaktifkan</button>
            <button class="wt-batch-btn delete"  onclick="WalletTrackerUI.batchDelete()">🗑 Hapus</button>
            <button class="wt-batch-btn" style="background:#1e293b;color:#94a3b8" onclick="WalletTrackerUI.clearSelection()">✕</button>
        </div>
        <div class="wt-body" id="wtBody"></div>`;
        document.body.appendChild(panel);

        // History modal
        const modal = document.createElement('div');
        modal.id = 'wtHistoryModal';
        modal.innerHTML = `<div class="wt-modal-box">
            <div class="wt-modal-header">
                <div><div class="wt-modal-title" id="wtModalTitle">Riwayat Wallet</div><div class="wt-modal-sub" id="wtModalSub"></div></div>
                <button class="wt-modal-close" onclick="WalletTrackerUI.closeHistory()">✕</button>
            </div>
            <div class="wt-modal-body" id="wtModalBody"><div class="wt-empty"><div class="wt-empty-icon">⏳</div><div class="wt-empty-text">Memuat…</div></div></div>
        </div>`;
        modal.addEventListener('click', e => { if (e.target === modal) WalletTrackerUI.closeHistory(); });
        document.body.appendChild(modal);
    }

    function buildToggleBtn() {
        if (document.getElementById('walletTrackerToggle')) return;
        const btn = document.createElement('button');
        btn.id = 'walletTrackerToggle';
        btn.innerHTML = '👁 Wallet Tracker <span id="wtToggleBadge"></span>';
        btn.onclick = toggle;
        document.body.appendChild(btn);
    }

    /* ── Render ── */
    function renderTab() {
        const body = document.getElementById('wtBody');
        if (!body) return;
        _tab === 'wallets' ? renderWalletsTab(body) : renderFeedTab(body);
    }

    function renderWalletsTab(body) {
        const countBadge = document.getElementById('wtWalletCountBadge');
        if (countBadge) countBadge.textContent = _wallets.length ? '('+_wallets.length+')' : '';

        const importSection = buildImportSection();
        const listSection   = buildWalletList();
        body.innerHTML = importSection + listSection;

        // Pasang event listener langsung ke DOM (bukan inline onclick) — anti-cache
        const tabsEl = document.getElementById('wtImportTabs');
        if (tabsEl) {
            tabsEl.addEventListener('click', e => {
                const tab = e.target.closest('[data-tab]');
                if (!tab) return;
                e.stopPropagation();
                switchImport(tab.dataset.tab);
            });
        }

        updateBatchBar();
    }

    function buildImportSection() {
        const btnLabel = _importTab === 'bulk' ? '⬆ Import Semua Valid'
            : _importTab === 'smartmoney' ? '⬆ Tambah Yang Dipilih'
            : '+ Tambah Wallet';

        let inner = '';
        if (_importTab === 'single') {
            inner = `<div class="wt-single-area">
                <input type="text" id="wtAddrInput" placeholder="Alamat wallet Solana (base58)…" maxlength="44"/>
                <div class="wt-single-row">
                    <input type="text" id="wtLabelInput" placeholder="Label / nama (opsional)"/>
                    <select id="wtCategoryInput">
                        <option value="">Kategori</option>
                        <option>Smart Money</option><option>Whale</option>
                        <option>Dev Wallet</option><option>KOL</option>
                        <option>LP Provider</option><option>Pantauan</option>
                    </select>
                </div>
            </div>`;
        } else if (_importTab === 'bulk') {
            inner = `<div class="wt-bulk-area">
                <textarea id="wtBulkInput" placeholder="Tempel banyak alamat wallet di sini…&#10;Pisahkan dengan baris baru, koma, atau spasi.&#10;&#10;Contoh:&#10;9WzDXwBb...&#10;7KjNm..." oninput="WalletTrackerUI.previewBulk()"></textarea>
                <div class="wt-bulk-hint">💡 Sistem otomatis deteksi alamat Solana valid. Duplikat & invalid diabaikan.</div>
                <div class="wt-bulk-preview" id="wtBulkPreview"></div>
            </div>`;
        } else {
            let smContent = '';
            if (_smLoading) {
                smContent = `<div style="text-align:center;padding:24px;color:#475569;font-size:11px">
                    <div style="margin-bottom:8px">⏳ Memuat saran smart money…</div>
                    <div style="font-size:10px;color:#334155">Ini bisa memakan waktu 5–15 detik</div>
                </div>`;
            } else if (_smError) {
                smContent = `<div style="text-align:center;padding:24px;font-size:11px">
                    <div style="color:#f87171;margin-bottom:8px">⚠ Gagal memuat saran</div>
                    <div style="color:#334155;font-size:10px;margin-bottom:10px">Endpoint smart-money-intel tidak tersedia atau timeout</div>
                    <button onclick="WalletTrackerUI.loadSmartMoney()" style="background:#1e3a5f;border:1px solid #3b82f6;color:#93c5fd;border-radius:6px;padding:5px 14px;font-size:11px;cursor:pointer">↻ Coba Lagi</button>
                </div>`;
            } else if (_smSuggestions.length === 0) {
                smContent = `<div style="text-align:center;padding:24px;color:#475569;font-size:11px">
                    <div style="font-size:28px;margin-bottom:8px">🧠</div>
                    <div style="margin-bottom:10px">Klik untuk memuat daftar smart money & top holder</div>
                    <button onclick="WalletTrackerUI.loadSmartMoney()" style="background:#1e3a5f;border:1px solid #3b82f6;color:#93c5fd;border-radius:6px;padding:6px 16px;font-size:11px;font-weight:700;cursor:pointer">⬇ Muat Smart Money</button>
                </div>`;
            } else {
                smContent = `<div class="wt-sm-list" id="wtSmList">
                    ${_smSuggestions.map((w,i) => `<div class="wt-sm-item"><input type="checkbox" id="wtSm_${i}" ${_smSelectedIdx.has(i)?'checked':''} onchange="WalletTrackerUI.toggleSmSelection(${i},this.checked)"><div class="wt-sm-item-info"><div class="wt-sm-addr">${shortAddr(w.address)}</div><div class="wt-sm-label">${w.label||''}${w.category?' · '+w.category:''}</div></div><span style="font-size:9px;color:#334155">${w.source||''}</span></div>`).join('')}
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">
                    <span style="font-size:10px;color:#475569"><span id="wtSmSelCount">${_smSelectedIdx.size}</span> dipilih dari ${_smSuggestions.length} saran</span>
                    <button onclick="WalletTrackerUI.loadSmartMoney()" style="background:#0f172a;border:1px solid #1e293b;color:#475569;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer">↻ Refresh</button>
                </div>`;
            }
            inner = `<div>${smContent}</div>`;
        }

        return `<div class="wt-import-box">
            <div style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:8px">➕ Tambah Wallet Pantauan</div>
            <div class="wt-import-tabs" id="wtImportTabs">
                <div class="wt-import-tab ${_importTab==='single'?'active':''}" data-tab="single">1 Wallet</div>
                <div class="wt-import-tab ${_importTab==='bulk'?'active':''}" data-tab="bulk">Bulk Import</div>
                <div class="wt-import-tab ${_importTab==='smartmoney'?'active':''}" data-tab="smartmoney">Smart Money</div>
            </div>
            ${inner}
            <div class="wt-btn-row">
                <button class="wt-btn primary" id="wtAddBtn" onclick="WalletTrackerUI.doAdd()">${btnLabel}</button>
                ${_importTab==='bulk' ? `<button class="wt-btn secondary" onclick="document.getElementById('wtBulkInput').value='';WalletTrackerUI.previewBulk()">🗑 Reset</button>` : ''}
            </div>
            <div class="wt-msg" id="wtAddMsg"></div>
            <div style="font-size:10px;color:#2d3748;margin-top:7px">⚡ Polling tiap 20 dtk · Max 20 wallet · Telegram otomatis</div>
        </div>`;
    }

    function buildWalletList() {
        if (_wallets.length === 0) return `<div class="wt-empty"><div class="wt-empty-icon">👁</div><div class="wt-empty-text">Belum ada wallet dipantau.<br>Tempel satu atau banyak alamat di atas untuk mulai.</div></div>`;

        const rows = _wallets.map(w => {
            const lastTx = w.lastTx;
            const isSelected = _selected.has(w.address);
            const actionColor = lastTx ? (ACTION_COLORS[lastTx.action] || '#475569') : '#334155';
            // build sparkline from feed
            const wTxs = _feed.filter(f => f.walletAddr === w.address).slice(0,12).reverse();
            const sparkHtml = wTxs.length > 0 ? `<div class="wt-sparkline">${wTxs.map(tx => {
                const col = ACTION_COLORS[tx.action]||'#334155';
                return `<div class="wt-spark-bar" style="height:${4+Math.floor(Math.random()*14)}px;background:${col};opacity:.75" title="${tx.action}"></div>`;
            }).join('')}</div>` : '';
            return `<div class="wt-wallet-item ${!w.active?'inactive':''} ${isSelected?'selected':''}" id="wtW_${w.address.slice(0,8)}">
                <div class="wt-wallet-cb"><input type="checkbox" ${isSelected?'checked':''} onchange="WalletTrackerUI.toggleSelect('${w.address}',this.checked)"></div>
                <div class="wt-wallet-content">
                    <div class="wt-wallet-row1">
                        <div style="display:flex;align-items:center;gap:6px">
                            <span class="wt-status-dot ${w.active?'on':'off'}"></span>
                            <span class="wt-wallet-name">${w.label||shortAddr(w.address)}</span>
                            ${w.category?'<span style="font-size:9px;background:#1e293b;color:#64748b;border-radius:8px;padding:1px 6px">'+w.category+'</span>':''}
                        </div>
                        ${wTxs.length>0?'<span style="font-size:9px;color:#334155">'+wTxs.length+' tx</span>':''}
                    </div>
                    <div class="wt-wallet-addr">${w.address}</div>
                    ${sparkHtml}
                    <div class="wt-wallet-meta">
                        ${lastTx
                            ? '<span>Terakhir: <span style="color:'+actionColor+';font-weight:700">'+lastTx.emoji+' '+lastTx.action+'</span></span><span>· '+fmtTime(lastTx.blockTime)+'</span>'
                            : '<span style="color:#1e3a5f">Menunggu tx pertama…</span>'}
                    </div>
                    <div class="wt-wallet-actions">
                        <button class="wt-wallet-btn ${w.active?'on':'off'}" onclick="WalletTrackerUI.toggleWallet('${w.address}')">${w.active?'● Aktif':'○ Nonaktif'}</button>
                        <button class="wt-wallet-btn" style="background:#0f2040;border-color:#1e3a5f;color:#60a5fa" onclick="WalletTrackerUI.viewHistory('${w.address}')">� Chart & Riwayat</button>
                        <a href="https://solscan.io/account/${w.address}" target="_blank"><button class="wt-wallet-btn">🔍 Solscan↗</button></a>
                        <button class="wt-wallet-btn del" onclick="WalletTrackerUI.removeWallet('${w.address}')">🗑</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        return `<div class="wt-section">
            <span>Daftar Wallet (${_wallets.length})</span>
            <div style="display:flex;gap:6px">
                <button onclick="WalletTrackerUI.selectAll()" style="background:#0f172a;border:1px solid #1e293b;color:#64748b;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer">Pilih Semua</button>
                <button onclick="WalletTrackerUI.clearSelection()" style="background:#0f172a;border:1px solid #1e293b;color:#64748b;border-radius:5px;padding:2px 8px;font-size:10px;cursor:pointer">Batal</button>
            </div>
        </div>${rows}`;
    }

    function renderFeedTab(body) {
        _newCount = 0;
        const badge = document.getElementById('wtFeedBadge');
        if (badge) badge.style.display = 'none';
        const tBadge = document.getElementById('wtToggleBadge');
        if (tBadge) { tBadge.textContent = '0'; tBadge.classList.remove('show'); }

        const filtered = _feedFilter === 'all' ? _feed : _feed.filter(f => f.action === _feedFilter);
        const FILTERS = [
            {k:'all',l:'Semua'},{k:'BUY',l:'🟢 BUY'},{k:'SELL',l:'🔴 SELL'},
            {k:'SWAP',l:'🔄 SWAP'},{k:'TRANSFER_OUT',l:'📤 Transfer'},
        ];
        const filterBar = '<div class="wt-feed-bar">'+FILTERS.map(f => '<button class="wt-feed-filter '+(_feedFilter===f.k?'active':'')+'" onclick="WalletTrackerUI.setFeedFilter(\''+f.k+'\')">'+f.l+'</button>').join('')+'<button class="wt-feed-filter" style="margin-left:auto" onclick="WalletTrackerUI.refreshFeed()">↻</button></div>';

        if (filtered.length === 0) {
            body.innerHTML = filterBar + '<div class="wt-empty"><div class="wt-empty-icon">📡</div><div class="wt-empty-text">Belum ada aktivitas.<br>Tambahkan wallet di tab <b>Wallets</b>.</div></div>';
            return;
        }
        body.innerHTML = filterBar + filtered.slice(0,100).map(item =>
            '<div class="wt-feed-item '+item.action+'" onclick="window.open(\'https://solscan.io/tx/'+item.sig+'\',\'_blank\')">'+
            '<div class="wt-feed-top"><div style="display:flex;align-items:center;gap:8px"><span class="wt-feed-wallet">'+item.walletLabel+'</span><span class="wt-feed-action '+item.action+'">'+item.emoji+' '+item.action+'</span></div><span style="font-size:9px;color:#334155">'+fmtTime(item.blockTime)+'</span></div>'+
            '<div class="wt-feed-detail">'+item.detail+'</div>'+
            '<div class="wt-feed-meta">'+(item.dex?'<span>'+item.dex+'</span>':'')+
            '<a href="https://solscan.io/tx/'+item.sig+'" target="_blank" onclick="event.stopPropagation()">🔗 '+item.sig.slice(0,10)+'…</a></div></div>'
        ).join('');
    }

    /* ── Selection ── */
    function toggleSelect(address, checked) {
        checked ? _selected.add(address) : _selected.delete(address);
        updateBatchBar();
    }
    function selectAll() { _wallets.forEach(w => _selected.add(w.address)); renderTab(); }
    function clearSelection() { _selected.clear(); updateBatchBar(); renderTab(); }
    function updateBatchBar() {
        const bar = document.getElementById('wtBatchBar');
        const cnt = document.getElementById('wtBatchCount');
        if (!bar) return;
        if (_selected.size > 0) { bar.classList.add('show'); if (cnt) cnt.textContent = _selected.size+' wallet dipilih'; }
        else bar.classList.remove('show');
    }

    /* ── Batch operations ── */
    async function batchToggle(active) {
        for (const address of [..._selected]) {
            const w = _wallets.find(w => w.address === address);
            if (!w || w.active === active) continue;
            await fetch(PROXY+'/api/wallet-tracker', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({address, action:'toggle'}) }).catch(()=>{});
        }
        _selected.clear(); await refreshWallets(); renderTab();
    }
    async function batchDelete() {
        if (!confirm('Hapus '+_selected.size+' wallet dari pantauan?')) return;
        for (const address of [..._selected]) {
            await fetch(PROXY+'/api/wallet-tracker', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({address, action:'remove'}) }).catch(()=>{});
        }
        _selected.clear(); await refreshWallets(); renderTab();
    }

    /* ── Import tabs ── */
    function switchImport(tab) {
        // Jika sedang loading smart money tapi user pindah tab lain, batalkan loading
        if (_smLoading && tab !== 'smartmoney') _smLoading = false;
        _importTab = tab;
        renderTab();
    }
    function toggleSmSelection(idx, checked) {
        checked ? _smSelectedIdx.add(idx) : _smSelectedIdx.delete(idx);
        const el = document.getElementById('wtSmSelCount');
        if (el) el.textContent = _smSelectedIdx.size;
    }
    async function loadSmartMoney() {
        if (_smLoading) return;
        _smLoading = true; _smError = false; _smSuggestions = []; _smSelectedIdx.clear();
        if (_tab === 'wallets' && _importTab === 'smartmoney') renderTab();
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 15000);
            const r = await fetch(PROXY+'/api/smart-money-intel', { signal: ctrl.signal });
            clearTimeout(timer);
            const d = await r.json();
            const seen = new Set(_wallets.map(w => w.address));
            (d.smartWallets || d.topWallets || []).forEach(w => {
                if (!seen.has(w.address) && w.address?.length > 30) { seen.add(w.address); _smSuggestions.push({ address:w.address, label:w.label||w.alias||'', category:'Smart Money', source:'Smart Money Intel' }); }
            });
            (d.accumSignals || []).forEach(s => {
                (s.topHolders || []).forEach(h => {
                    const addr = h.address || h.owner;
                    if (!seen.has(addr) && addr?.length > 30) { seen.add(addr); _smSuggestions.push({ address:addr, label:'', category:'Top Holder', source:s.symbol||'' }); }
                });
            });
            _smSuggestions = _smSuggestions.slice(0,30);
            if (_smSuggestions.length === 0) _smError = false; // show empty CTA, not error
        } catch(e) {
            _smError = true; _smSuggestions = [];
        } finally {
            _smLoading = false;
            if (_tab === 'wallets' && _importTab === 'smartmoney') renderTab();
        }
    }
    function previewBulk() {
        const raw   = document.getElementById('wtBulkInput')?.value || '';
        const preview = document.getElementById('wtBulkPreview');
        if (!preview) return;
        const parts = raw.split(/[\n,;\s]+/).map(s=>s.trim()).filter(Boolean);
        if (!parts.length) { preview.innerHTML = ''; return; }
        const existing = new Set(_wallets.map(w => w.address));
        preview.innerHTML = parts.slice(0,20).map(part => {
            const valid = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(part);
            const dup   = valid && existing.has(part);
            return '<div class="wt-bulk-preview-item '+(valid&&!dup?'valid':'invalid')+'"><span>'+part.slice(0,12)+'…'+part.slice(-4)+'</span><span>'+(dup?'⚠ duplikat':valid?'✓':'✗ bukan Solana')+'</span></div>';
        }).join('') + (parts.length > 20 ? '<div style="font-size:10px;color:#334155;padding:4px">…dan '+(parts.length-20)+' lainnya</div>' : '');
    }

    /* ── Unified Add ── */
    async function doAdd() {
        const msgEl = document.getElementById('wtAddMsg');
        const btn   = document.getElementById('wtAddBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Memproses…'; }
        try {
            if (_importTab === 'single') await addSingle(msgEl);
            else if (_importTab === 'bulk') await addBulk(msgEl);
            else await addSmartMoney(msgEl);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = _importTab==='bulk'?'⬆ Import Semua Valid':_importTab==='smartmoney'?'⬆ Tambah Yang Dipilih':'+ Tambah Wallet'; }
        }
    }
    async function addSingle(msgEl) {
        const addr  = (document.getElementById('wtAddrInput')?.value||'').trim();
        const label = (document.getElementById('wtLabelInput')?.value||'').trim();
        const cat   = document.getElementById('wtCategoryInput')?.value||'';
        if (!addr || addr.length < 32) return showMsg(msgEl,'err','Alamat Solana tidak valid (min 32 karakter)');
        const r = await fetch(PROXY+'/api/wallet-tracker', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({address:addr,label,category:cat}) });
        const d = await r.json();
        if (d.ok) { showMsg(msgEl,'ok',d.message); document.getElementById('wtAddrInput').value=''; document.getElementById('wtLabelInput').value=''; }
        else showMsg(msgEl,'err',d.error||'Gagal menambahkan');
        await refreshWallets(); renderTab();
    }
    async function addBulk(msgEl) {
        const raw   = document.getElementById('wtBulkInput')?.value||'';
        const addrs = parseBulkAddresses(raw);
        const existing = new Set(_wallets.map(w=>w.address));
        const newAddrs  = addrs.filter(a=>!existing.has(a));
        if (!newAddrs.length) return showMsg(msgEl,'err','Tidak ada alamat valid yang belum ditambahkan');
        let ok=0, fail=0;
        for (const address of newAddrs.slice(0,20)) {
            const r = await fetch(PROXY+'/api/wallet-tracker', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({address,label:'',category:''}) }).catch(()=>null);
            const d = r ? await r.json().catch(()=>({})) : {};
            d.ok ? ok++ : fail++;
        }
        showMsg(msgEl, ok>0?'ok':'err', ok+' berhasil ditambahkan'+(fail>0?', '+fail+' gagal':'')+(newAddrs.length>20?' (maks 20)':''));
        if (document.getElementById('wtBulkInput')) document.getElementById('wtBulkInput').value='';
        await refreshWallets(); renderTab();
    }
    async function addSmartMoney(msgEl) {
        const idxs = [..._smSelectedIdx];
        if (!idxs.length) return showMsg(msgEl,'err','Pilih minimal 1 wallet dari daftar');
        let ok=0;
        for (const idx of idxs) {
            const sm = _smSuggestions[idx]; if (!sm) continue;
            const r = await fetch(PROXY+'/api/wallet-tracker', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({address:sm.address,label:sm.label,category:sm.category}) }).catch(()=>null);
            const d = r ? await r.json().catch(()=>({})) : {};
            if (d.ok) ok++;
        }
        _smSelectedIdx.clear(); showMsg(msgEl,'ok',ok+' wallet smart money ditambahkan');
        await refreshWallets(); renderTab();
    }

    /* ── Wallet ops ── */
    async function removeWallet(address) {
        if (!confirm('Hapus wallet '+shortAddr(address)+' dari pantauan?')) return;
        await fetch(PROXY+'/api/wallet-tracker', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({address, action:'remove'}) }).catch(()=>{});
        _selected.delete(address); await refreshWallets(); renderTab();
    }
    async function toggleWallet(address) {
        await fetch(PROXY+'/api/wallet-tracker', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({address, action:'toggle'}) }).catch(()=>{});
        await refreshWallets(); renderTab();
    }
    async function viewHistory(address) {
        const modal = document.getElementById('wtHistoryModal');
        if (!modal) return;
        const w = _wallets.find(w => w.address === address) || { label: shortAddr(address), address };
        document.getElementById('wtModalTitle').textContent = '📊 ' + (w.label || shortAddr(address));
        document.getElementById('wtModalSub').textContent = address;
        document.getElementById('wtModalBody').innerHTML = '<div class="wt-empty"><div class="wt-empty-icon">⏳</div><div class="wt-empty-text">Memuat riwayat…</div></div>';
        modal.classList.add('open');

        // fetch history
        let history = [];
        try {
            const r = await fetch(PROXY+'/api/wallet-tracker/history/'+address);
            const d = await r.json();
            if (d.ok) history = d.history || [];
        } catch(_) {}

        // also from local feed
        const feedItems = _feed.filter(f => f.walletAddr === address);
        const sigSet = new Set(history.map(h => h.sig));
        feedItems.forEach(f => { if (!sigSet.has(f.sig)) history.push(f); });
        history.sort((a,b) => (b.blockTime||b.ts||0)-(a.blockTime||a.ts||0));

        if (!modal.classList.contains('open')) return; // closed while loading

        // ── Stats ──
        const counts = { BUY:0, SELL:0, SWAP:0, TRANSFER_OUT:0, TRANSFER_IN:0 };
        history.forEach(tx => { if (counts[tx.action] !== undefined) counts[tx.action]++; });

        // ── Chart data: last 7 days grouped ──
        const days = [];
        for (let i=6; i>=0; i--) {
            const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
            days.push({ label: d.toLocaleDateString('id-ID',{weekday:'short'}), ts: d.getTime()/1000, buy:0, sell:0, other:0 });
        }
        history.forEach(tx => {
            const bt = tx.blockTime || tx.ts || 0;
            const dayIdx = days.findIndex((d,i) => bt >= d.ts && (i===days.length-1 || bt < days[i+1].ts));
            if (dayIdx < 0) return;
            if (tx.action === 'BUY') days[dayIdx].buy++;
            else if (tx.action === 'SELL') days[dayIdx].sell++;
            else days[dayIdx].other++;
        });

        // ── Render HTML ──
        const statsHtml = `<div class="wt-stats-grid">
            <div class="wt-stat-card"><div class="wt-stat-val" style="color:#4ade80">${counts.BUY}</div><div class="wt-stat-lbl">🟢 BUY</div></div>
            <div class="wt-stat-card"><div class="wt-stat-val" style="color:#f87171">${counts.SELL}</div><div class="wt-stat-lbl">🔴 SELL</div></div>
            <div class="wt-stat-card"><div class="wt-stat-val" style="color:#e2e8f0">${history.length}</div><div class="wt-stat-lbl">Total TX</div></div>
        </div>`;

        const chartId = 'wtChart_'+Date.now();
        const chartHtml = `<div class="wt-chart-wrap">
            <div class="wt-chart-title">📈 Aktivitas 7 Hari Terakhir</div>
            <canvas id="${chartId}" width="480" height="160" style="width:100%;height:160px"></canvas>
            <div class="wt-chart-legend">
                <div class="wt-chart-legend-item"><div class="wt-chart-legend-dot" style="background:#22c55e"></div>BUY</div>
                <div class="wt-chart-legend-item"><div class="wt-chart-legend-dot" style="background:#ef4444"></div>SELL</div>
                <div class="wt-chart-legend-item"><div class="wt-chart-legend-dot" style="background:#475569"></div>Lainnya</div>
            </div>
        </div>`;

        const txListHtml = history.length === 0
            ? '<div class="wt-empty" style="padding:30px"><div class="wt-empty-icon" style="font-size:28px">📭</div><div class="wt-empty-text">Belum ada riwayat transaksi tercatat.<br>Tunggu polling berikutnya.</div></div>'
            : '<div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Transaksi Terbaru</div>' +
              history.slice(0,30).map(tx => {
                const col = ACTION_COLORS[tx.action]||'#475569';
                return `<div class="wt-tx-row">
                    <div class="wt-tx-icon" style="background:${col}22;color:${col}">${tx.emoji||'•'}</div>
                    <div class="wt-tx-info">
                        <div class="wt-tx-action" style="color:${col}">${tx.action}</div>
                        <div class="wt-tx-detail">${tx.detail||tx.dex||'—'}</div>
                        <div style="margin-top:3px"><a href="https://solscan.io/tx/${tx.sig}" target="_blank" style="font-size:9px;color:#334155;text-decoration:none">🔗 ${(tx.sig||'').slice(0,16)}…</a></div>
                    </div>
                    <div class="wt-tx-time">${fmtTime(tx.blockTime||tx.ts)}</div>
                </div>`;
              }).join('');

        document.getElementById('wtModalBody').innerHTML = statsHtml + chartHtml + txListHtml;

        // Draw canvas chart
        requestAnimationFrame(() => {
            const canvas = document.getElementById(chartId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const W = canvas.offsetWidth || 480;
            canvas.width = W * window.devicePixelRatio;
            canvas.height = 160 * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            const w2 = W, h2 = 160;
            ctx.clearRect(0,0,w2,h2);

            const maxVal = Math.max(1, ...days.map(d => d.buy+d.sell+d.other));
            const pad = { l:28, r:10, t:10, b:30 };
            const chartW = w2-pad.l-pad.r;
            const chartH = h2-pad.t-pad.b;
            const bw = Math.floor(chartW / days.length);

            // grid lines
            ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1;
            for (let i=0; i<=4; i++) {
                const y = pad.t + chartH - (i/4)*chartH;
                ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w2-pad.r, y); ctx.stroke();
                ctx.fillStyle = '#334155'; ctx.font = '9px Inter,sans-serif'; ctx.textAlign='right';
                ctx.fillText(Math.round((i/4)*maxVal), pad.l-4, y+3);
            }

            days.forEach((day, i) => {
                const x = pad.l + i*bw + bw*0.1;
                const bw2 = bw*0.8;
                const total = day.buy+day.sell+day.other;
                if (total === 0) {
                    // empty bar placeholder
                    ctx.fillStyle = '#0f172a';
                    ctx.fillRect(x, pad.t+chartH-2, bw2, 2);
                } else {
                    // stacked: other (bottom), sell (mid), buy (top)
                    let y = pad.t + chartH;
                    const draw = (val, color) => {
                        if (!val) return;
                        const bh = Math.max(2, (val/maxVal)*chartH);
                        y -= bh;
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.roundRect ? ctx.roundRect(x,y,bw2,bh,2) : ctx.rect(x,y,bw2,bh);
                        ctx.fill();
                    };
                    draw(day.other, '#47556988');
                    draw(day.sell, '#ef4444cc');
                    draw(day.buy, '#22c55ecc');
                }
                // label
                ctx.fillStyle = '#475569'; ctx.font = '9px Inter,sans-serif'; ctx.textAlign='center';
                ctx.fillText(day.label, x+bw2/2, h2-pad.b+14);
                if (total > 0) {
                    ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 9px Inter,sans-serif';
                    ctx.fillText(total, x+bw2/2, pad.t+chartH-(total/maxVal)*chartH-4);
                }
            });
        });
    }
    function closeHistory() { document.getElementById('wtHistoryModal')?.classList.remove('open'); }
    function setFeedFilter(f) { _feedFilter = f; renderTab(); }
    function refreshFeed()    { refreshHistory().then(() => { if (_tab==='feed') renderTab(); }); }

    /* ── Data ── */
    async function refreshWallets() {
        try { const r = await fetch(PROXY+'/api/wallet-tracker'); const d = await r.json(); if (d.ok) _wallets = d.wallets; } catch(_) {}
    }
    async function refreshHistory() {
        const newFeed = [];
        for (const w of _wallets) {
            try {
                const r = await fetch(PROXY+'/api/wallet-tracker/history/'+w.address);
                const d = await r.json();
                if (d.ok) d.history.forEach(tx => newFeed.push({...tx, walletLabel: w.label||shortAddr(w.address), walletAddr: w.address}));
            } catch(_) {}
        }
        newFeed.sort((a,b) => (b.ts||0)-(a.ts||0));
        const oldSigs = new Set(_feed.map(f=>f.sig));
        const newItems = newFeed.filter(f=>!oldSigs.has(f.sig));
        _feed = newFeed;
        if (newItems.length > 0) {
            _newCount += newItems.length;
            const badge = document.getElementById('wtFeedBadge');
            if (badge && _tab !== 'feed') { badge.textContent = _newCount; badge.style.display = 'inline'; }
            const tBadge = document.getElementById('wtToggleBadge');
            if (tBadge) { tBadge.textContent = _newCount; tBadge.classList.add('show'); }
        }
        if (_tab === 'feed') renderTab();
    }
    async function poll() { await refreshWallets(); await refreshHistory(); if (_tab==='wallets') renderTab(); }

    /* ── Panel control ── */
    function open() {
        let panel = document.getElementById('walletTrackerPanel');
        if (!panel) buildPanel();
        // Reset ke tab default setiap buka
        _importTab = 'single';
        _tab = 'wallets';
        document.getElementById('walletTrackerPanel').classList.add('open');
        refreshWallets().then(() => renderTab());
        if (_pollTimer) clearInterval(_pollTimer);
        _pollTimer = setInterval(poll, 15000);
    }
    function close() {
        document.getElementById('walletTrackerPanel')?.classList.remove('open');
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }
    function toggle() { const p = document.getElementById('walletTrackerPanel'); p&&p.classList.contains('open')?close():open(); }
    function switchTab(tab) {
        _tab = tab;
        document.querySelectorAll('.wt-tab').forEach(t=>t.classList.remove('active'));
        const el = document.getElementById('wtTab_'+tab); if (el) el.classList.add('active');
        if (tab==='feed') { _newCount=0; const b=document.getElementById('wtFeedBadge'); if (b) b.style.display='none'; }
        renderTab();
    }
    function showMsg(el, type, text) {
        if (!el) return; el.className='wt-msg '+type; el.textContent=text;
        setTimeout(()=>{ if(el) el.className='wt-msg'; }, 5000);
    }

    /* ── Init ── */
    function init() {
        buildToggleBtn();
        refreshWallets().then(() => refreshHistory());
        setInterval(async () => { await refreshWallets(); await refreshHistory(); }, 20000);
    }
    document.addEventListener('DOMContentLoaded', init);

    return { open, close, toggle, switchTab, switchImport, doAdd, addWallet:doAdd,
             removeWallet, toggleWallet, viewHistory, closeHistory, toggleSelect, selectAll, clearSelection,
             updateBatchBar, batchToggle, batchDelete, toggleSmSelection, loadSmartMoney,
             previewBulk, setFeedFilter, refreshFeed };
})();
