/**
 * CryptoMind AI Chat
 * Chat dengan AI analyst untuk crypto & saham
 * Powered by Groq (llama3-70b) — gratis!
 */
const AiChat = (() => {
    const CHAT_API   = 'http://127.0.0.1:3001/api/ai-chat';
    const CONFIG_API = 'http://127.0.0.1:3001/api/ai-chat-config';
    let _messages  = [];   // [{role, content}]
    let _apiKey    = '';
    let _hasKey    = false;
    let _isLoading = false;

    const QUICK_QUESTIONS = [
        '📊 Analisa BTC sekarang',
        '🔥 Apa narrative crypto yang hot saat ini?',
        '📈 Strategi untuk pasar sideways',
        '🐋 Apa itu whale accumulation dan bagaimana cara deteksinya?',
        '💰 Gimana cara set Stop Loss yang benar?',
        '🚀 Koin altcoin potensial untuk 2025-2026?',
        '📉 Kapan waktu terbaik untuk buy the dip?',
        '🏦 Pengaruh Fed rate terhadap crypto?',
    ];

    function injectStyles() {
        if (document.getElementById('ac-styles')) return;
        const s = document.createElement('style');
        s.id = 'ac-styles';
        s.textContent = `
/* ── AI Chat Modal ── */
#ac-modal-overlay { display:none; position:fixed; inset:0; z-index:10001;
    background:rgba(0,0,0,.75); backdrop-filter:blur(4px);
    align-items:center; justify-content:center; padding:16px; }
#ac-modal-overlay.open { display:flex !important; }
#ac-modal { width:min(600px,100%); height:min(80vh,700px);
    background:#0a0e1a; border:1px solid #7c3aed55;
    border-radius:18px; overflow:hidden;
    display:flex; flex-direction:column;
    box-shadow:0 24px 60px #7c3aed44, 0 0 0 1px #7c3aed22; }

/* Header */
#ac-modal .ac-header { padding:14px 18px;
    background:linear-gradient(135deg,#0f0a1e,#1a0e3a);
    border-bottom:1px solid #2d1b4e;
    display:flex; align-items:center; gap:10px; flex-shrink:0; }
.ac-header-avatar { width:36px; height:36px; border-radius:50%;
    background:linear-gradient(135deg,#7c3aed,#3b82f6);
    display:flex; align-items:center; justify-content:center; font-size:18px; }
.ac-header-info { flex:1; }
.ac-header-name { font-size:14px; font-weight:700; color:#e2e8f0; }
.ac-header-sub  { font-size:11px; color:#7c3aed; }
.ac-header-btns { display:flex; gap:8px; align-items:center; }
.ac-settings-btn { background:none; border:1px solid #334155; color:#64748b;
    border-radius:8px; padding:5px 10px; cursor:pointer; font-size:12px; }
.ac-settings-btn:hover { border-color:#7c3aed; color:#a78bfa; }
.ac-close-btn { background:none; border:none; color:#64748b;
    font-size:20px; cursor:pointer; padding:0 4px; line-height:1; }
.ac-close-btn:hover { color:#e2e8f0; }

/* API Key setup */
#ac-setup { padding:24px 20px; flex:1; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:16px; text-align:center; }
.ac-setup-icon { font-size:3rem; }
.ac-setup-title { font-size:16px; font-weight:700; color:#e2e8f0; }
.ac-setup-desc { font-size:13px; color:#64748b; line-height:1.6; max-width:400px; }
.ac-setup-desc a { color:#7c3aed; }
.ac-key-row { display:flex; gap:8px; width:100%; max-width:400px; }
.ac-key-input { flex:1; background:#111827; border:1px solid #374151;
    border-radius:8px; padding:9px 12px; color:#e2e8f0; font-size:13px; outline:none; }
.ac-key-input:focus { border-color:#7c3aed; }
.ac-key-btn { background:#7c3aed; border:none; color:#fff;
    border-radius:8px; padding:9px 16px; cursor:pointer; font-size:13px; font-weight:600; }
.ac-key-btn:hover { background:#6d28d9; }

/* Quick questions */
#ac-quick { padding:10px 14px 4px; flex-shrink:0; display:flex;
    gap:6px; flex-wrap:wrap; border-bottom:1px solid #0f172a; }
.ac-q-pill { background:#1e1b4b; border:1px solid #3730a3;
    color:#a5b4fc; font-size:11px; padding:4px 10px;
    border-radius:20px; cursor:pointer; white-space:nowrap; }
.ac-q-pill:hover { background:#312e81; color:#c7d2fe; }

/* Messages */
#ac-messages { flex:1; overflow-y:auto; padding:14px 16px;
    display:flex; flex-direction:column; gap:12px; }
#ac-messages::-webkit-scrollbar { width:4px; }
#ac-messages::-webkit-scrollbar-thumb { background:#334155; border-radius:2px; }

.ac-msg { display:flex; gap:10px; max-width:90%; animation:ac-fadein .2s ease; }
@keyframes ac-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
.ac-msg.user { flex-direction:row-reverse; align-self:flex-end; }
.ac-msg.assistant { align-self:flex-start; }

.ac-msg-avatar { width:28px; height:28px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center; font-size:14px; }
.ac-msg.user .ac-msg-avatar { background:#1e3a5f; }
.ac-msg.assistant .ac-msg-avatar { background:linear-gradient(135deg,#7c3aed,#3b82f6); }

.ac-msg-bubble { padding:10px 14px; border-radius:14px; font-size:13px;
    line-height:1.6; max-width:100%; word-break:break-word; }
.ac-msg.user .ac-msg-bubble { background:#1e3a5f; color:#e2e8f0;
    border-radius:14px 14px 4px 14px; }
.ac-msg.assistant .ac-msg-bubble { background:#1a1040; border:1px solid #2d1b4e;
    color:#e2e8f0; border-radius:14px 14px 14px 4px; }
.ac-msg-bubble strong { color:#a78bfa; }
.ac-msg-bubble em { color:#67e8f9; }

/* Typing indicator */
.ac-typing { display:flex; gap:4px; align-items:center; padding:8px 0; }
.ac-typing span { width:7px; height:7px; background:#7c3aed;
    border-radius:50%; animation:ac-bounce .8s infinite; }
.ac-typing span:nth-child(2) { animation-delay:.15s; }
.ac-typing span:nth-child(3) { animation-delay:.3s; }
@keyframes ac-bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }

/* Input bar */
#ac-input-bar { padding:12px 14px; border-top:1px solid #1e293b;
    display:flex; gap:8px; flex-shrink:0; }
#ac-input { flex:1; background:#111827; border:1px solid #374151;
    border-radius:12px; padding:9px 14px; color:#e2e8f0;
    font-size:13px; outline:none; resize:none; height:40px; max-height:100px;
    font-family:inherit; line-height:1.4; }
#ac-input:focus { border-color:#7c3aed; }
#ac-send-btn { background:linear-gradient(135deg,#7c3aed,#3b82f6);
    border:none; color:#fff; border-radius:12px;
    padding:0 16px; cursor:pointer; font-size:16px;
    transition:opacity .2s; flex-shrink:0; }
#ac-send-btn:disabled { opacity:.4; cursor:not-allowed; }
#ac-send-btn:hover:not(:disabled) { opacity:.85; }
.ac-empty-state { text-align:center; color:#475569; font-size:13px;
    padding:40px 20px; flex:1; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:8px; }
.ac-empty-state .ac-empty-icon { font-size:2.5rem; }
        `;
        document.head.appendChild(s);
    }

    function open() {
        const overlay = document.getElementById('ac-modal-overlay');
        if (overlay) {
            overlay.classList.add('open');
            checkConfig();
        }
    }

    function close() {
        const overlay = document.getElementById('ac-modal-overlay');
        if (overlay) overlay.classList.remove('open');
    }

    async function checkConfig() {
        try {
            const r = await fetch(CONFIG_API);
            const d = await r.json();
            _hasKey = d.hasKey;
        } catch (e) {}
        renderContent();
    }

    async function saveKey() {
        const input = document.getElementById('ac-key-input-field');
        const key = input?.value?.trim();
        if (!key) return;
        try {
            await fetch(CONFIG_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: key }),
            });
            _apiKey = key;
            _hasKey = true;
            renderContent();
        } catch (e) { alert('Gagal simpan API key: ' + e.message); }
    }

    function renderContent() {
        const body = document.getElementById('ac-body');
        if (!body) return;

        if (!_hasKey) {
            body.innerHTML = `
            <div id="ac-setup">
                <div class="ac-setup-icon">🔑</div>
                <div class="ac-setup-title">Setup Groq API Key</div>
                <div class="ac-setup-desc">
                    CryptoMind AI menggunakan <b>Groq API</b> yang <b>100% GRATIS</b>.<br>
                    Daftar di <a href="https://console.groq.com" target="_blank">console.groq.com</a> → API Keys → Create key → paste di bawah ini.
                </div>
                <div class="ac-key-row">
                    <input id="ac-key-input-field" class="ac-key-input" type="password"
                        placeholder="gsk_xxxxxxxxxxxxxxxxxxxx"
                        onkeydown="if(event.key==='Enter') AiChat.saveKey()"/>
                    <button class="ac-key-btn" onclick="AiChat.saveKey()">✅ Simpan</button>
                </div>
                <div style="font-size:11px;color:#475569">
                    Key disimpan di server lokal kamu saja, tidak dikirim kemana-mana.
                </div>
            </div>`;
            return;
        }

        // Quick questions + messages + input
        const quickPills = QUICK_QUESTIONS.map(q =>
            `<button class="ac-q-pill" onclick="AiChat.sendQuick(${JSON.stringify(q)})">${q}</button>`
        ).join('');

        const msgHtml = _messages.length
            ? _messages.map(renderMessage).join('')
            : `<div class="ac-empty-state">
                <div class="ac-empty-icon">🤖</div>
                <div style="font-size:14px;color:#94a3b8;font-weight:600">CryptoMind AI siap!</div>
                <div>Tanya apa saja tentang crypto atau saham.<br>Atau klik salah satu pertanyaan cepat di atas.</div>
               </div>`;

        body.innerHTML = `
            <div id="ac-quick">${quickPills}</div>
            <div id="ac-messages">${msgHtml}</div>
            <div id="ac-input-bar">
                <textarea id="ac-input" placeholder="Tanya tentang crypto, saham, analisa teknikal…"
                    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();AiChat.send()}"></textarea>
                <button id="ac-send-btn" onclick="AiChat.send()">➤</button>
            </div>`;

        scrollToBottom();
    }

    function renderMessage(msg) {
        const isUser = msg.role === 'user';
        const avatar = isUser ? '👤' : '🤖';
        // Simple markdown: **bold**, *italic*, bullet lines
        const html = formatMarkdown(msg.content);
        return `<div class="ac-msg ${msg.role}">
            <div class="ac-msg-avatar">${avatar}</div>
            <div class="ac-msg-bubble">${html}</div>
        </div>`;
    }

    function formatMarkdown(text) {
        return text
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
            .replace(/\*(.+?)\*/g,'<em>$1</em>')
            .replace(/`(.+?)`/g,'<code style="background:#1e293b;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
            .replace(/\n/g,'<br>');
    }

    function scrollToBottom() {
        setTimeout(() => {
            const el = document.getElementById('ac-messages');
            if (el) el.scrollTop = el.scrollHeight;
        }, 50);
    }

    function showTyping() {
        const el = document.getElementById('ac-messages');
        if (!el) return;
        const emptyState = el.querySelector('.ac-empty-state');
        if (emptyState) emptyState.remove();
        const div = document.createElement('div');
        div.className = 'ac-msg assistant';
        div.id = 'ac-typing-indicator';
        div.innerHTML = `<div class="ac-msg-avatar">🤖</div>
            <div class="ac-msg-bubble">
                <div class="ac-typing"><span></span><span></span><span></span></div>
            </div>`;
        el.appendChild(div);
        scrollToBottom();
    }

    function hideTyping() {
        const el = document.getElementById('ac-typing-indicator');
        if (el) el.remove();
    }

    async function send() {
        const input = document.getElementById('ac-input');
        const text = input?.value?.trim();
        if (!text || _isLoading) return;

        input.value = '';
        input.style.height = '40px';
        _messages.push({ role: 'user', content: text });
        _isLoading = true;

        // Render user message
        const msgEl = document.getElementById('ac-messages');
        if (msgEl) {
            const emptyState = msgEl.querySelector('.ac-empty-state');
            if (emptyState) emptyState.remove();
            const div = document.createElement('div');
            div.innerHTML = renderMessage({ role: 'user', content: text });
            msgEl.appendChild(div.firstElementChild);
        }
        scrollToBottom();

        const sendBtn = document.getElementById('ac-send-btn');
        if (sendBtn) sendBtn.disabled = true;

        showTyping();

        try {
            const r = await fetch(CHAT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: _messages,
                    apiKey: _apiKey || undefined,
                }),
            });
            const d = await r.json();
            hideTyping();

            if (d.ok && d.reply) {
                _messages.push({ role: 'assistant', content: d.reply });
                if (msgEl) {
                    const div = document.createElement('div');
                    div.innerHTML = renderMessage({ role: 'assistant', content: d.reply });
                    msgEl.appendChild(div.firstElementChild);
                }
                scrollToBottom();
            } else {
                const err = d.error || 'Error dari AI server';
                _messages.push({ role: 'assistant', content: `⚠️ ${err}` });
                if (msgEl) {
                    const div = document.createElement('div');
                    div.innerHTML = renderMessage({ role: 'assistant', content: `⚠️ ${err}` });
                    msgEl.appendChild(div.firstElementChild);
                }
                // Jika key error, reset hasKey
                if (err.includes('401') || err.includes('invalid_api_key')) {
                    _hasKey = false;
                    setTimeout(() => renderContent(), 1500);
                }
            }
        } catch (e) {
            hideTyping();
            _messages.push({ role: 'assistant', content: `⚠️ Proxy server offline. Jalankan proxy-server.js terlebih dahulu.` });
            if (msgEl) {
                const div = document.createElement('div');
                div.innerHTML = renderMessage({ role: 'assistant', content: `⚠️ Proxy server offline.` });
                msgEl.appendChild(div.firstElementChild);
            }
        } finally {
            _isLoading = false;
            if (sendBtn) sendBtn.disabled = false;
            if (input) input.focus();
        }
    }

    function sendQuick(question) {
        const input = document.getElementById('ac-input');
        if (input) { input.value = question; send(); }
    }

    function clearChat() {
        _messages = [];
        renderContent();
    }

    function init() {
        injectStyles();
        // Inject modal HTML if not exists
        if (!document.getElementById('ac-modal-overlay')) {
            const div = document.createElement('div');
            div.id = 'ac-modal-overlay';
            div.onclick = function(e) { if (e.target === this) AiChat.close(); };
            div.innerHTML = `
            <div id="ac-modal" onclick="event.stopPropagation()">
                <div class="ac-header">
                    <div class="ac-header-avatar">🤖</div>
                    <div class="ac-header-info">
                        <div class="ac-header-name">CryptoMind AI</div>
                        <div class="ac-header-sub">Powered by Groq · Llama 3 70B</div>
                    </div>
                    <div class="ac-header-btns">
                        <button class="ac-settings-btn" onclick="AiChat.clearChat()" title="Clear chat">🗑️ Clear</button>
                        <button class="ac-settings-btn" onclick="AiChat._resetKey()" title="Ganti API Key">🔑 Key</button>
                        <button class="ac-close-btn" onclick="AiChat.close()">✕</button>
                    </div>
                </div>
                <div id="ac-body" style="flex:1;display:flex;flex-direction:column;overflow:hidden"></div>
            </div>`;
            document.body.appendChild(div);
        }
        // ESC close
        document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    }

    function _resetKey() { _hasKey = false; _apiKey = ''; renderContent(); }

    return { init, open, close, send, sendQuick, saveKey, clearChat, _resetKey };
})();
