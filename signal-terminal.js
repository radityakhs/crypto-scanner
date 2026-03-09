// ══════════════════════════════════════════════════════════════════════════════
//  Signal Terminal UI v1
//  Tampilan hacker terminal realtime untuk sinyal dari signal-bot.js
//  Polling /api/signals tiap 15 detik, render sebagai terminal feed
// ══════════════════════════════════════════════════════════════════════════════

const SignalTerminal = (() => {
    'use strict';

    const PROXY  = 'http://127.0.0.1:3001';
    const POLL_MS = 15000;

    // ─── STATE ─────────────────────────────────────────────────────────────
    let _el        = null;   // root element
    let _feedEl    = null;   // .sterm-feed div
    let _seenIds   = new Set();
    let _allSignals = [];
    let _pollTimer  = null;
    let _matrixAnim = null;
    let _scanCount  = 0;
    let _longCount  = 0;
    let _shortCount = 0;
    let _lastPoll   = null;
    let _tickerCoins = [];

    // ─── FORMAT HELPERS ────────────────────────────────────────────────────
    function fmtPrice(v) {
        if (v == null) return '—';
        if (v > 1000)  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (v > 1)     return '$' + (+v).toFixed(4);
        return '$' + (+v).toFixed(6);
    }
    function fmtTime(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' + fmtTime(iso);
    }
    function uid(sig) { return `${sig.coinId}_${sig.signal}_${sig.timestamp}`; }

    // ─── MATRIX RAIN ───────────────────────────────────────────────────────
    function startMatrixRain(canvas) {
        const ctx    = canvas.getContext('2d');
        const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%&*LONGSHORT'.split('');
        const fontSize = 10;
        let cols, drops;

        function resize() {
            canvas.width  = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            cols  = Math.floor(canvas.width / fontSize);
            drops = Array(cols).fill(1);
        }

        resize();
        window.addEventListener('resize', resize);

        function draw() {
            ctx.fillStyle = 'rgba(2,8,16,0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#22d3ee';
            ctx.font      = fontSize + 'px Courier New';
            for (let i = 0; i < drops.length; i++) {
                const text = chars[Math.floor(Math.random() * chars.length)];
                ctx.fillStyle = i % 5 === 0 ? '#4ade80' : '#22d3ee';
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            }
        }

        _matrixAnim = setInterval(draw, 50);
    }

    // ─── TICKER TAPE ───────────────────────────────────────────────────────
    function buildTicker(signals) {
        if (!signals.length) return;
        const tickerWrap = _el.querySelector('.sterm-ticker');
        if (!tickerWrap) return;

        // ambil coin unik + signal terakhir
        const map = {};
        signals.forEach(s => {
            if (!map[s.coinSymbol] || new Date(s.timestamp) > new Date(map[s.coinSymbol].timestamp)) map[s.coinSymbol] = s;
        });
        const items = Object.values(map).slice(0, 15);
        const html  = items.map(s => {
            const cls = s.signal === 'LONG' ? 'sterm-ticker-up' : 'sterm-ticker-down';
            const icon = s.signal === 'LONG' ? '▲' : '▼';
            return `<span class="sterm-ticker-item">
                <span class="sterm-ticker-sym">${s.coinSymbol.toUpperCase()}</span>
                <span class="${cls}">${icon} ${s.signal}</span>
                <span class="sterm-ticker-sym">${fmtPrice(s.currentPrice)}</span>
            </span>`;
        }).join('');
        // duplikat untuk seamless loop
        tickerWrap.innerHTML = html + html;
    }

    // ─── STATS BAR ─────────────────────────────────────────────────────────
    function updateStats() {
        const el = _el.querySelector('.sterm-statsbar');
        if (!el) return;
        const now = new Date().toLocaleTimeString('id-ID');
        el.innerHTML = `
            <div class="sterm-stat">SCAN <span class="sterm-stat-val">#${_scanCount}</span></div>
            <div class="sterm-stat">LONG <span class="sterm-stat-long">${_longCount}</span></div>
            <div class="sterm-stat">SHORT <span class="sterm-stat-short">${_shortCount}</span></div>
            <div class="sterm-stat">TOTAL <span class="sterm-stat-val">${_allSignals.length}</span></div>
            <div class="sterm-stat">POLL <span class="sterm-stat-val">${POLL_MS / 1000}s</span></div>
            <div class="sterm-stat">LAST UPDATE <span class="sterm-stat-val">${now}</span></div>
        `;
    }

    // ─── LOG LINE ──────────────────────────────────────────────────────────
    function appendLine(tag, tagClass, msg) {
        if (!_feedEl) return;
        const div = document.createElement('div');
        div.className = 'sterm-line';
        const ts = new Date().toLocaleTimeString('id-ID');
        div.innerHTML = `
            <span class="sterm-line-ts">${ts}</span>
            <span class="sterm-line-tag sterm-line-tag-${tagClass}">${tag}</span>
            <span class="sterm-line-msg">${msg}</span>
        `;
        _feedEl.appendChild(div);
        _feedEl.scrollTop = _feedEl.scrollHeight;
    }

    // ─── SIGNAL CARD ───────────────────────────────────────────────────────
    function appendSignalCard(sig) {
        if (!_feedEl) return;
        const isLong = sig.signal === 'LONG';
        const card   = document.createElement('div');
        card.className = `sterm-signal-card sterm-card-${isLong ? 'long' : 'short'}`;

        const subScoreStr = (sig.subScores || []).slice(0, 3)
            .map(s => `${s.label.split(' ')[0]}:${s.score}`)
            .join(' · ');

        card.innerHTML = `
            <div class="sterm-card-header">
                <div>
                    <span class="sterm-card-coin sterm-card-coin-${isLong ? 'long' : 'short'}">
                        ${isLong ? '▲' : '▼'} ${sig.coinSymbol.toUpperCase()} / ${sig.coinName}
                    </span>
                </div>
                <span class="sterm-card-badge sterm-card-badge-${isLong ? 'long' : 'short'}">
                    ${sig.signal}
                </span>
            </div>
            <div class="sterm-card-levels">
                <div class="sterm-card-level">
                    <div class="sterm-card-level-lbl">HARGA</div>
                    <div class="sterm-card-level-val blue">${fmtPrice(sig.currentPrice)}</div>
                </div>
                <div class="sterm-card-level">
                    <div class="sterm-card-level-lbl">ENTRY</div>
                    <div class="sterm-card-level-val">${fmtPrice(sig.entryLow)} — ${fmtPrice(sig.entryHigh)}</div>
                </div>
                <div class="sterm-card-level">
                    <div class="sterm-card-level-lbl">STOP LOSS</div>
                    <div class="sterm-card-level-val red">${fmtPrice(sig.stopLoss)}</div>
                </div>
                <div class="sterm-card-level">
                    <div class="sterm-card-level-lbl">TP1</div>
                    <div class="sterm-card-level-val green">${fmtPrice(sig.tp1)}</div>
                </div>
                <div class="sterm-card-level">
                    <div class="sterm-card-level-lbl">TP2</div>
                    <div class="sterm-card-level-val green">${fmtPrice(sig.tp2)}</div>
                </div>
                <div class="sterm-card-level">
                    <div class="sterm-card-level-lbl">R:R</div>
                    <div class="sterm-card-level-val">1 : ${sig.rr}</div>
                </div>
            </div>
            <div class="sterm-card-footer">
                <span>📊 Bull <b>${sig.bullish}%</b> Bear <b>${sig.bearish}%</b> Conf <b>${sig.confidence}%</b></span>
                <span>🐋 Whale: <b>${sig.whaleBias || '—'}</b></span>
                <span>📐 Vol: <b>${sig.volPhase || '—'}</b></span>
                <span>🎲 MC: <b>${sig.mcProbUp ?? '—'}%</b></span>
                <span>🕐 <b>${fmtDate(sig.timestamp)}</b></span>
                ${subScoreStr ? `<span>🔍 ${subScoreStr}</span>` : ''}
            </div>
        `;
        _feedEl.appendChild(card);
        _feedEl.scrollTop = _feedEl.scrollHeight;
    }

    // ─── FETCH & RENDER ────────────────────────────────────────────────────
    async function poll() {
        _scanCount++;
        updateStats();
        appendLine('POLL', 'scan', `Mengambil data sinyal dari server... (#${_scanCount})`);

        let signals = [];
        try {
            const res = await fetch(`${PROXY}/api/signals`, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            signals = await res.json();
        } catch (err) {
            // Fallback: baca signals.json langsung (ketika proxy tidak jalan)
            try {
                const res2 = await fetch('./signals.json?_=' + Date.now(), { signal: AbortSignal.timeout(5000) });
                if (res2.ok) signals = await res2.json();
                else throw new Error('signals.json tidak ditemukan');
            } catch {
                appendLine('ERR', 'warn', `Proxy tidak aktif & signals.json tidak ada. Jalankan: <b>node signal-bot.js</b>`);
                return;
            }
        }

        if (!Array.isArray(signals)) { appendLine('ERR', 'warn', 'Format data tidak valid.'); return; }

        _allSignals = signals;
        _longCount  = signals.filter(s => s.signal === 'LONG').length;
        _shortCount = signals.filter(s => s.signal === 'SHORT').length;

        // Ticker tape
        buildTicker(signals);

        // Cari sinyal baru saja (belum di-render)
        const newSigs = signals.filter(s => !_seenIds.has(uid(s)));

        if (newSigs.length === 0) {
            appendLine('OK', 'scan', `Tidak ada sinyal baru. Total tersimpan: <b>${signals.length}</b>`);
        } else {
            appendLine('NEW', 'scan', `<b>${newSigs.length}</b> sinyal baru ditemukan!`);
            newSigs.reverse().forEach(sig => {
                _seenIds.add(uid(sig));
                const isLong = sig.signal === 'LONG';
                appendLine(
                    sig.signal,
                    isLong ? 'long' : 'short',
                    `<b>${sig.coinSymbol.toUpperCase()}</b> ${sig.coinName} — Harga: <b>${fmtPrice(sig.currentPrice)}</b> | ${sig.signalReason}`
                );
                appendSignalCard(sig);
            });
        }

        _lastPoll = new Date();
        updateStats();
    }

    // ─── BOOT SEQUENCE ─────────────────────────────────────────────────────
    async function bootSequence() {
        const lines = [
            { tag: 'INIT', cls: 'info',  msg: 'Signal Terminal v1 initializing...' },
            { tag: 'LOAD', cls: 'info',  msg: 'Loading Quant Analyst v2 engine modules...' },
            { tag: 'OK',   cls: 'scan',  msg: '10 engines loaded: Structure · Liquidity · S&D · VP · OF · Whale · Vol · GBM · Prob · Trade' },
            { tag: 'CONN', cls: 'info',  msg: `Connecting to proxy: <b>${PROXY}/api/signals</b>` },
        ];
        for (const l of lines) {
            await new Promise(r => setTimeout(r, 220));
            appendLine(l.tag, l.cls, l.msg);
        }
        await poll();
    }

    // ─── COMMAND HANDLER ───────────────────────────────────────────────────
    function handleCommand(cmd) {
        const c = cmd.trim().toLowerCase();
        appendLine('$', 'info', `<b style="color:#22d3ee">${cmd}</b>`);

        if (c === 'help') {
            ['clear    — hapus feed',
             'refresh  — poll sekarang',
             'status   — tampilkan statistik',
             'signals  — tampilkan semua sinyal tersimpan',
             'long     — filter sinyal LONG saja',
             'short    — filter sinyal SHORT saja',
             'cls      — clear screen',
            ].forEach(l => appendLine('', 'info', l));
        } else if (c === 'clear' || c === 'cls') {
            _feedEl.innerHTML = '';
            _seenIds.clear();
            appendLine('OK', 'scan', 'Feed dibersihkan. Polling ulang...');
            poll();
        } else if (c === 'refresh') {
            poll();
        } else if (c === 'status') {
            appendLine('STAT', 'scan', `Scan: <b>#${_scanCount}</b> | LONG: <b>${_longCount}</b> | SHORT: <b>${_shortCount}</b> | Total: <b>${_allSignals.length}</b>`);
            if (_lastPoll) appendLine('STAT', 'info', `Last poll: <b>${_lastPoll.toLocaleTimeString('id-ID')}</b>`);
        } else if (c === 'signals' || c === 'long' || c === 'short') {
            const filtered = c === 'long' ? _allSignals.filter(s => s.signal === 'LONG')
                           : c === 'short' ? _allSignals.filter(s => s.signal === 'SHORT')
                           : _allSignals;
            if (!filtered.length) { appendLine('', 'warn', 'Tidak ada sinyal.'); return; }
            filtered.slice(0, 10).forEach(s => appendLine(
                s.signal, s.signal === 'LONG' ? 'long' : 'short',
                `<b>${s.coinSymbol.toUpperCase()}</b> ${fmtPrice(s.currentPrice)} — ${s.signalReason} [${fmtDate(s.timestamp)}]`
            ));
        } else if (c === '') {
            // ignore empty
        } else {
            appendLine('ERR', 'warn', `Command tidak dikenal: <b>${cmd}</b>. Ketik <b>help</b>`);
        }
    }

    // ─── BUILD HTML ────────────────────────────────────────────────────────
    function buildHTML() {
        return `
        <div class="sterm-section">
            <div class="sterm-section-title">⚡ SIGNAL TERMINAL — Live Bot Feed</div>
            <div class="sterm-outer" id="stermOuter">

                <!-- Matrix rain header -->
                <div class="sterm-matrix-wrap">
                    <canvas class="sterm-matrix-canvas" id="stermMatrix"></canvas>
                    <div class="sterm-matrix-overlay">◈ SIGNAL_BOT v1 · QUANT_ANALYST v2 · 10 ENGINES ACTIVE ◈</div>
                </div>

                <!-- Title bar -->
                <div class="sterm-titlebar">
                    <div class="sterm-dots">
                        <div class="sterm-dot sterm-dot-r"></div>
                        <div class="sterm-dot sterm-dot-y"></div>
                        <div class="sterm-dot sterm-dot-g"></div>
                    </div>
                    <div class="sterm-title-text">signal-terminal@crypto-scanner:~$</div>
                    <div class="sterm-status">
                        <div class="sterm-status-dot"></div>
                        LIVE
                    </div>
                </div>

                <!-- Stats bar -->
                <div class="sterm-statsbar"></div>

                <!-- Ticker tape -->
                <div class="sterm-ticker-wrap">
                    <div class="sterm-ticker" id="stermTicker"></div>
                </div>

                <!-- Feed -->
                <div class="sterm-feed" id="stermFeed">
                    <div class="sterm-empty">
                        <div class="sterm-empty-icon">⌛</div>
                        <div>Memuat sinyal...</div>
                    </div>
                </div>

                <!-- Input bar -->
                <div class="sterm-inputbar">
                    <span class="sterm-prompt">root@signal-bot:~$&nbsp;</span>
                    <input class="sterm-cmd-input" id="stermInput" type="text" placeholder="ketik 'help' untuk daftar perintah..." autocomplete="off" spellcheck="false" />
                    <div class="sterm-cursor"></div>
                    <button class="sterm-btn-refresh" id="stermBtnRefresh">↻ REFRESH</button>
                    <button class="sterm-btn-clear" id="stermBtnClear">✕ CLEAR</button>
                </div>

            </div>
        </div>`;
    }

    // ─── INIT ──────────────────────────────────────────────────────────────
    function init(targetEl) {
        if (!targetEl) return;
        _el = targetEl;
        _el.innerHTML = buildHTML();

        _feedEl = document.getElementById('stermFeed');
        _feedEl.innerHTML = '';

        // Matrix rain
        const canvas = document.getElementById('stermMatrix');
        if (canvas) startMatrixRain(canvas);

        // Input command
        const input = document.getElementById('stermInput');
        if (input) {
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    handleCommand(input.value);
                    input.value = '';
                }
            });
        }

        // Buttons
        document.getElementById('stermBtnRefresh')?.addEventListener('click', poll);
        document.getElementById('stermBtnClear')?.addEventListener('click', () => {
            _feedEl.innerHTML = '';
            _seenIds.clear();
            appendLine('OK', 'scan', 'Feed dibersihkan.');
            poll();
        });

        // Boot + start polling
        bootSequence();
        _pollTimer = setInterval(poll, POLL_MS);
    }

    function destroy() {
        if (_pollTimer)  clearInterval(_pollTimer);
        if (_matrixAnim) clearInterval(_matrixAnim);
    }

    return { init, destroy };
})();
