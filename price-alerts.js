/**
 * Price Alerts — Set alert harga → kirim ke Telegram
 */
const PriceAlerts = (() => {
    const API = 'http://127.0.0.1:3001/api/price-alerts';
    let _alerts = [];

    function injectStyles() {
        if (document.getElementById('pa-styles')) return;
        const s = document.createElement('style');
        s.id = 'pa-styles';
        s.textContent = `
/* ── Price Alert Modal ── */
#pa-modal-overlay { display:none; position:fixed; inset:0; z-index:10002;
    background:rgba(0,0,0,.75); backdrop-filter:blur(4px);
    align-items:center; justify-content:center; padding:16px; }
#pa-modal-overlay.open { display:flex !important; }
#pa-modal { width:min(520px,100%); max-height:80vh;
    background:#0a0e1a; border:1px solid #1e3a5f;
    border-radius:16px; overflow:hidden; display:flex; flex-direction:column;
    box-shadow:0 24px 60px #00000088; }
.pa-header { padding:14px 18px; background:linear-gradient(135deg,#0a0e1a,#0d1b2e);
    border-bottom:1px solid #1e3a5f; display:flex; align-items:center; gap:10px; flex-shrink:0; }
.pa-header h3 { margin:0; font-size:15px; font-weight:700; color:#e2e8f0; flex:1; }
.pa-close-btn { background:none; border:none; color:#64748b; font-size:20px; cursor:pointer; }
.pa-close-btn:hover { color:#e2e8f0; }
.pa-body { padding:18px; overflow-y:auto; flex:1; }
/* Form */
.pa-form { display:flex; flex-direction:column; gap:12px; margin-bottom:20px; }
.pa-form-row { display:flex; gap:8px; flex-wrap:wrap; }
.pa-label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
.pa-input-wrap { flex:1; min-width:120px; }
.pa-input { width:100%; background:#111827; border:1px solid #374151; border-radius:8px;
    padding:8px 12px; color:#e2e8f0; font-size:13px; outline:none; box-sizing:border-box; }
.pa-input:focus { border-color:#3b82f6; }
.pa-select { width:100%; background:#111827; border:1px solid #374151; border-radius:8px;
    padding:8px 12px; color:#e2e8f0; font-size:13px; outline:none; cursor:pointer; }
.pa-add-btn { background:#3b82f6; border:none; color:#fff; border-radius:8px;
    padding:8px 20px; cursor:pointer; font-size:13px; font-weight:700; align-self:flex-end; white-space:nowrap; }
.pa-add-btn:hover { background:#2563eb; }
/* Alert list */
.pa-section-title { font-size:12px; font-weight:700; color:#64748b; text-transform:uppercase;
    letter-spacing:.06em; margin-bottom:10px; }
.pa-empty { color:#475569; font-size:13px; text-align:center; padding:20px 0; }
.pa-list { display:flex; flex-direction:column; gap:8px; }
.pa-item { background:#111827; border:1px solid #1e293b; border-radius:10px;
    padding:10px 14px; display:flex; align-items:center; gap:10px; }
.pa-item.triggered { border-color:#16a34a44; background:#14532d22; }
.pa-item-icon { font-size:18px; flex-shrink:0; }
.pa-item-info { flex:1; }
.pa-item-sym { font-size:13px; font-weight:700; color:#e2e8f0; }
.pa-item-cond { font-size:11px; color:#64748b; margin-top:2px; }
.pa-item-price { font-size:14px; font-weight:800; color:#60a5fa; }
.pa-item-status { font-size:11px; }
.pa-item-status.ok { color:#4ade80; }
.pa-item-status.pending { color:#fbbf24; }
.pa-delete-btn { background:none; border:1px solid #374151; color:#64748b;
    border-radius:6px; padding:4px 10px; cursor:pointer; font-size:11px; }
.pa-delete-btn:hover { border-color:#ef4444; color:#f87171; }
.pa-msg { font-size:12px; padding:6px 12px; border-radius:8px; margin-bottom:8px; }
.pa-msg.ok  { background:#14532d; color:#4ade80; }
.pa-msg.err { background:#450a0a; color:#f87171; }
.pa-tg-note { font-size:11px; color:#475569; background:#0f172a; border-radius:8px;
    padding:8px 12px; border:1px solid #1e293b; margin-bottom:12px; }
.pa-tg-note a { color:#3b82f6; cursor:pointer; }
        `;
        document.head.appendChild(s);
    }

    function injectModal() {
        if (document.getElementById('pa-modal-overlay')) return;
        const div = document.createElement('div');
        div.id = 'pa-modal-overlay';
        div.onclick = (e) => { if (e.target === div) closeModal(); };
        div.innerHTML = `
        <div id="pa-modal">
            <div class="pa-header">
                <h3>🔔 Price Alerts</h3>
                <button class="pa-close-btn" onclick="PriceAlerts.closeModal()">✕</button>
            </div>
            <div class="pa-body">
                <div id="pa-msg"></div>
                <div class="pa-tg-note">
                    ⚡ Alert akan dikirim ke Telegram kamu saat harga tercapai. 
                    Pastikan <a onclick="TelegramSettings.openModal()">Telegram sudah di-setup</a>.
                </div>
                <div class="pa-form">
                    <div class="pa-form-row">
                        <div class="pa-input-wrap">
                            <div class="pa-label">Symbol</div>
                            <input id="pa-sym" class="pa-input" type="text" placeholder="BTC, ETH, SOL…" autocomplete="off"/>
                        </div>
                        <div class="pa-input-wrap" style="max-width:130px">
                            <div class="pa-label">Kondisi</div>
                            <select id="pa-cond" class="pa-select">
                                <option value="above">🚀 Di atas</option>
                                <option value="below">📉 Di bawah</option>
                            </select>
                        </div>
                        <div class="pa-input-wrap">
                            <div class="pa-label">Target Harga ($)</div>
                            <input id="pa-price" class="pa-input" type="number" placeholder="85000" step="any"/>
                        </div>
                    </div>
                    <button class="pa-add-btn" onclick="PriceAlerts.addAlert()">+ Tambah Alert</button>
                </div>
                <div class="pa-section-title">Alert Aktif</div>
                <div id="pa-list" class="pa-list"></div>
            </div>
        </div>`;
        document.body.appendChild(div);
    }

    function showMsg(text, type) {
        const el = document.getElementById('pa-msg');
        if (!el) return;
        el.className = `pa-msg ${type}`;
        el.textContent = text;
        el.style.display = 'block';
        setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

    function renderList() {
        const el = document.getElementById('pa-list');
        if (!el) return;
        if (!_alerts.length) {
            el.innerHTML = '<div class="pa-empty">Belum ada alert — tambah di atas 👆</div>';
            return;
        }
        el.innerHTML = _alerts.map(a => {
            const icon = a.condition === 'above' ? '🚀' : '📉';
            const condText = a.condition === 'above' ? 'Tembus ke atas' : 'Turun ke bawah';
            const status = a.triggered
                ? `<span class="pa-item-status ok">✅ Triggered @ $${a.triggeredPrice?.toLocaleString()}</span>`
                : `<span class="pa-item-status pending">⏳ Menunggu…</span>`;
            return `<div class="pa-item ${a.triggered ? 'triggered' : ''}">
                <span class="pa-item-icon">${icon}</span>
                <div class="pa-item-info">
                    <div class="pa-item-sym">${a.symbol}USDT</div>
                    <div class="pa-item-cond">${condText} $${parseFloat(a.price).toLocaleString()}</div>
                    ${status}
                </div>
                <div class="pa-item-price">$${parseFloat(a.price).toLocaleString()}</div>
                <button class="pa-delete-btn" onclick="PriceAlerts.deleteAlert(${a.id})">🗑</button>
            </div>`;
        }).join('');
    }

    async function loadAlerts() {
        try {
            const r = await fetch(API);
            const d = await r.json();
            if (d.ok) { _alerts = d.alerts || []; renderList(); }
        } catch (e) {}
    }

    async function addAlert() {
        const sym   = document.getElementById('pa-sym')?.value.trim().toUpperCase().replace('USDT','');
        const cond  = document.getElementById('pa-cond')?.value;
        const price = document.getElementById('pa-price')?.value;
        if (!sym || !price) return showMsg('⚠️ Isi symbol dan harga target', 'err');
        try {
            const r = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: sym, condition: cond, price })
            });
            const d = await r.json();
            if (d.ok) {
                showMsg(`✅ Alert ${sym} di-set!`, 'ok');
                document.getElementById('pa-sym').value = '';
                document.getElementById('pa-price').value = '';
                loadAlerts();
            } else showMsg('❌ Gagal tambah alert', 'err');
        } catch (e) { showMsg('❌ ' + e.message, 'err'); }
    }

    async function deleteAlert(id) {
        await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', id })
        });
        loadAlerts();
    }

    function openModal() {
        injectStyles();
        injectModal();
        document.getElementById('pa-modal-overlay').classList.add('open');
        loadAlerts();
        // Auto-refresh setiap 10s saat modal buka
        PriceAlerts._refreshTimer = setInterval(loadAlerts, 10_000);
    }

    function closeModal() {
        const el = document.getElementById('pa-modal-overlay');
        if (el) el.classList.remove('open');
        if (PriceAlerts._refreshTimer) clearInterval(PriceAlerts._refreshTimer);
    }

    function init() {
        injectStyles();
        injectModal();
    }

    return { init, openModal, closeModal, addAlert, deleteAlert, loadAlerts };
})();
