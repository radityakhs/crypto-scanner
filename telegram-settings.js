/**
 * TELEGRAM ALERT SETTINGS PANEL
 * Floating button (📬) di pojok kanan bawah → buka modal popup
 */
const TelegramSettings = (() => {
    const API = 'http://127.0.0.1:3001/api/telegram-config';
    let _cfg = null;

    function injectStyles() {
        if (document.getElementById('tg-styles')) return;
        const s = document.createElement('style');
        s.id = 'tg-styles';
        s.textContent = `
#telegramSettingsPanel { margin:0; }
.tg-card { background:#0a0e1a; border:1px solid #1e3a5f; border-radius:16px; overflow:hidden; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
.tg-header { padding:14px 18px; background:linear-gradient(135deg,#0a0e1a,#0d1b2e); border-bottom:1px solid #1e3a5f; display:flex; align-items:center; gap:10px; }
.tg-header h3 { margin:0; font-size:15px; color:#e2e8f0; flex:1; }
.tg-close-btn { background:none; border:none; color:#64748b; font-size:20px; cursor:pointer; padding:0 4px; line-height:1; }
.tg-close-btn:hover { color:#e2e8f0; }
.tg-status-dot { width:8px; height:8px; border-radius:50%; background:#374151; flex-shrink:0; }
.tg-status-dot.active { background:#22c55e; box-shadow:0 0 6px #22c55e88; }
.tg-body { padding:16px 18px; }
.tg-row { display:flex; gap:8px; align-items:flex-start; margin-bottom:10px; flex-wrap:wrap; }
.tg-label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
.tg-input-wrap { flex:1; min-width:180px; }
.tg-input { width:100%; background:#111827; border:1px solid #374151; border-radius:8px; padding:8px 12px; color:#e2e8f0; font-size:13px; outline:none; box-sizing:border-box; }
.tg-input:focus { border-color:#3b82f6; }
.tg-btn { border:none; border-radius:8px; padding:8px 16px; cursor:pointer; font-size:13px; font-weight:600; white-space:nowrap; }
.tg-btn-save { background:#3b82f6; color:#fff; }
.tg-btn-save:hover { background:#2563eb; }
.tg-btn-test { background:#1e293b; color:#94a3b8; border:1px solid #334155; }
.tg-btn-test:hover { background:#334155; color:#e2e8f0; }
.tg-note { font-size:11px; color:#475569; line-height:1.6; margin-top:8px; }
.tg-note a { color:#3b82f6; }
.tg-msg { font-size:12px; padding:6px 12px; border-radius:8px; margin-top:8px; display:none; }
.tg-msg.ok  { background:#14532d; color:#4ade80; display:block; }
.tg-msg.err { background:#450a0a; color:#f87171; display:block; }
.tg-how { margin-top:10px; padding:10px 14px; background:#0f172a; border-radius:10px; border:1px solid #1e293b; }
.tg-how summary { cursor:pointer; font-size:12px; color:#64748b; user-select:none; }
.tg-how p { font-size:11px; color:#475569; margin:6px 0 0; line-height:1.7; }
.tg-how code { background:#1e293b; padding:1px 5px; border-radius:4px; color:#94a3b8; font-size:11px; }
#tg-modal-overlay { display:none; }
#tg-modal-overlay.open { display:flex !important; }
        `;
        document.head.appendChild(s);
    }

    function _updateFab(active) {
        const dot = document.getElementById('tg-fab-dot');
        if (dot) dot.style.display = active ? 'block' : 'none';
    }

    function render(cfg) {
        _cfg = cfg;
        const el = document.getElementById('telegramSettingsPanel');
        if (!el) return;
        const active = cfg?.configured;
        _updateFab(active);

        el.innerHTML = `<div class="tg-card">
            <div class="tg-header">
                <h3>📬 Telegram Alert</h3>
                <span class="tg-status-dot ${active ? 'active' : ''}" title="${active ? 'Aktif' : 'Belum dikonfigurasi'}"></span>
                <span style="font-size:11px;color:${active ? '#4ade80' : '#475569'}">${active ? '✅ Aktif' : '⚙️ Belum setup'}</span>
                <button class="tg-close-btn" onclick="TelegramSettings.closeModal()" title="Tutup">✕</button>
            </div>
            <div class="tg-body">
                <div class="tg-row">
                    <div class="tg-input-wrap">
                        <div class="tg-label">Bot Token</div>
                        <input id="tg-token-input" class="tg-input" type="password"
                            placeholder="123456789:ABCdef…"
                            value="${cfg?.hasToken ? '••••••••••••••••' : ''}"/>
                    </div>
                    <div class="tg-input-wrap">
                        <div class="tg-label">Chat ID</div>
                        <input id="tg-chatid-input" class="tg-input" type="text"
                            placeholder="-100123456789 atau @username"
                            value="${cfg?.chatId || ''}"/>
                    </div>
                    <div class="tg-input-wrap">
                        <div class="tg-label">Topic ID</div>
                        <input id="tg-topicid-input" class="tg-input" type="text"
                            placeholder="Opsional, contoh: 294"
                            value="${cfg?.topicId || ''}"/>
                    </div>
                    <div style="display:flex;gap:6px;padding-top:20px;flex-wrap:wrap">
                        <button class="tg-btn tg-btn-save" onclick="TelegramSettings.save()">💾 Simpan</button>
                        <button class="tg-btn tg-btn-test" onclick="TelegramSettings.test()" ${active ? '' : 'disabled style="opacity:.5;cursor:not-allowed"'}>🔔 Test</button>
                    </div>
                </div>
                <div id="tg-msg" class="tg-msg"></div>
                <details class="tg-how">
                    <summary>📖 Cara setup Telegram Bot</summary>
                    <p>
                        1. Chat <a href="https://t.me/BotFather" target="_blank">@BotFather</a> → ketik <code>/newbot</code> → copy <b>Bot Token</b><br>
                        2. Tambah bot ke grup / chat pribadi, lalu ketik pesan apapun ke bot<br>
                        3. Buka <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> → ambil <b>chat.id</b><br>
                        4. Jika memakai group topic/forum, isi <b>Topic ID</b>, misalnya <code>2</code><br>
                        5. Isi form di atas → Simpan → Test
                    </p>
                </details>
                <div class="tg-note" style="margin-top:8px">
                    ⚡ Alert otomatis dikirim saat ada sinyal <b>LONG</b> baru (maks 1x per token per 4 jam)
                </div>
            </div>
        </div>`;
    }

    async function load() {
        try {
            const r = await fetch(API);
            const d = await r.json();
            if (d.ok) render(d);
        } catch (e) {
            const el = document.getElementById('telegramSettingsPanel');
            if (el) el.innerHTML = `<div class="tg-card"><div style="padding:20px;color:#475569;font-size:13px;text-align:center">⚠️ Proxy server offline<br><button class="tg-btn tg-btn-test" style="margin-top:10px" onclick="TelegramSettings.closeModal()">Tutup</button></div></div>`;
        }
    }

    function openModal() {
        const overlay = document.getElementById('tg-modal-overlay');
        if (overlay) overlay.classList.add('open');
        load();
    }

    function closeModal() {
        const overlay = document.getElementById('tg-modal-overlay');
        if (overlay) overlay.classList.remove('open');
    }

    function showMsg(text, type) {
        const el = document.getElementById('tg-msg');
        if (!el) return;
        el.textContent = text;
        el.className = `tg-msg ${type}`;
        setTimeout(() => { el.className = 'tg-msg'; }, 4000);
    }

    async function save() {
        const tokenInput  = document.getElementById('tg-token-input');
        const chatIdInput = document.getElementById('tg-chatid-input');
        const topicIdInput = document.getElementById('tg-topicid-input');
        const token  = tokenInput?.value?.trim();
        const chatId = chatIdInput?.value?.trim();
        const topicId = topicIdInput?.value?.trim();
        const body = { chatId, topicId };
        if (token && !token.startsWith('•')) body.botToken = token;
        try {
            const r = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const d = await r.json();
            if (d.ok) { showMsg('✅ Tersimpan!', 'ok'); load(); }
            else showMsg('❌ Gagal simpan', 'err');
        } catch (e) { showMsg('❌ ' + e.message, 'err'); }
    }

    async function test() {
        showMsg('⏳ Mengirim pesan test…', 'ok');
        try {
            const r = await fetch('http://127.0.0.1:3001/api/telegram-test', { method: 'POST' });
            const d = await r.json();
            showMsg(d.ok ? '✅ ' + d.message : '❌ ' + d.message, d.ok ? 'ok' : 'err');
        } catch (e) { showMsg('❌ ' + e.message, 'err'); }
    }

    function init() {
        injectStyles();
        // Cek status untuk update dot FAB saja (tanpa buka modal)
        fetch(API).then(r => r.json()).then(d => { if (d.ok) _updateFab(d.configured); }).catch(() => {});
        // Tutup modal saat tekan ESC
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    }

    return { init, load, save, test, openModal, closeModal };
})();
