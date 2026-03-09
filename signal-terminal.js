// ══════════════════════════════════════════════════════════════════════════════
//  Signal Terminal UI v2
//  Hacker terminal realtime — sinyal dari signal-bot.js
// ══════════════════════════════════════════════════════════════════════════════

const SignalTerminal = (() => {
    'use strict';

    const PROXY   = 'http://127.0.0.1:3001';
    const POLL_MS = 15000;

    let _el         = null;
    let _feedEl     = null;
    let _seenIds    = new Set();
    let _allSignals = [];
    let _pollTimer  = null;
    let _matrixAnim = null;
    let _scanCount  = 0;
    let _longCount  = 0;
    let _shortCount = 0;
    let _lastPoll   = null;
    let _booting    = false;

    // ── FORMAT ──────────────────────────────────────────────────────────────
    function fmtPrice(v) {
        if (v == null) return '\u2014';
        if (v > 1000)  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (v > 1)     return '$' + (+v).toFixed(4);
        return '$' + (+v).toFixed(6);
    }
    function fmtTime(iso) {
        if (!iso) return '\u2014';
        return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    function fmtDate(iso) {
        if (!iso) return '\u2014';
        const d = new Date(iso);
        return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' + fmtTime(iso);
    }
    function uid(s) { return s.coinId + '_' + s.signal + '_' + s.timestamp; }

    // ── LOADING SCREEN ──────────────────────────────────────────────────────
    // Langsung tampil di #signalTerminalPanel saat halaman dimuat,
    // sehingga user tahu panel sedang siap meski tab belum diklik.
    function showLoadingScreen(panel) {
        panel.innerHTML =
            '<div class="sterm-boot-screen" id="stermBootScreen">' +
                '<div class="sterm-boot-inner">' +
                    '<div class="sterm-boot-logo">' +
                        '<div class="sterm-boot-hex">\u2B21</div>' +
                        '<div class="sterm-boot-brand">SIGNAL TERMINAL</div>' +
                        '<div class="sterm-boot-sub">Quant Analyst v2 &middot; 10 Engines Active</div>' +
                    '</div>' +
                    '<div class="sterm-boot-bar-wrap">' +
                        '<div class="sterm-boot-bar" id="stermBootBar"></div>' +
                    '</div>' +
                    '<div class="sterm-boot-log" id="stermBootLog"></div>' +
                    '<div class="sterm-boot-hint">Klik tab <b>&#9889; Signal Terminal</b> untuk membuka tampilan penuh</div>' +
                '</div>' +
            '</div>';
        runBootAnim();
    }

    function runBootAnim() {
        const bar = document.getElementById('stermBootBar');
        const log = document.getElementById('stermBootLog');
        if (!bar || !log) return;
        const steps = [
            [10,  'Memuat modul quant engine...'],
            [22,  'Market Structure Engine OK'],
            [34,  'Liquidity &amp; Supply/Demand OK'],
            [46,  'Volume Profile &amp; Order Flow OK'],
            [58,  'Whale Activity Scanner OK'],
            [70,  'Volatility Phase Detector OK'],
            [80,  'Monte Carlo GBM Engine OK'],
            [90,  'Directional Probability Model OK'],
            [96,  'Trade Decision Engine OK'],
            [100, '&#9989; Siap &mdash; klik tab untuk membuka terminal'],
        ];
        let i = 0;
        const tick = setInterval(function() {
            if (i >= steps.length) { clearInterval(tick); return; }
            var s   = steps[i++];
            var pct = s[0], msg = s[1];
            bar.style.width = pct + '%';
            var line = document.createElement('div');
            line.className = 'sterm-boot-log-line';
            line.innerHTML = '<span class="sterm-boot-pct">[' + String(pct).padStart(3, ' ') + '%]</span> ' + msg;
            log.appendChild(line);
            log.scrollTop = log.scrollHeight;
        }, 300);
    }

    // ── MATRIX RAIN ─────────────────────────────────────────────────────────
    function startMatrixRain(canvas) {
        var ctx   = canvas.getContext('2d');
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$#@%&*LONGSHORT'.split('');
        var fs    = 10;
        var cols, drops;
        function resize() {
            canvas.width  = canvas.offsetWidth  || 800;
            canvas.height = canvas.offsetHeight || 50;
            cols  = Math.floor(canvas.width / fs);
            drops = Array(cols).fill(1);
        }
        resize();
        window.addEventListener('resize', resize);
        function draw() {
            ctx.fillStyle = 'rgba(2,8,16,0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            for (var i = 0; i < drops.length; i++) {
                ctx.fillStyle = i % 5 === 0 ? '#4ade80' : '#22d3ee';
                ctx.font = fs + 'px Courier New';
                ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fs, drops[i] * fs);
                if (drops[i] * fs > canvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            }
        }
        _matrixAnim = setInterval(draw, 50);
    }

    // ── TICKER ──────────────────────────────────────────────────────────────
    function buildTicker(signals) {
        var el = document.getElementById('stermTicker');
        if (!el || !signals.length) return;
        var map = {};
        signals.forEach(function(s) {
            if (!map[s.coinSymbol] || new Date(s.timestamp) > new Date(map[s.coinSymbol].timestamp))
                map[s.coinSymbol] = s;
        });
        var html = Object.values(map).slice(0, 15).map(function(s) {
            var cls = s.signal === 'LONG' ? 'sterm-ticker-up' : 'sterm-ticker-down';
            var icon = s.signal === 'LONG' ? '\u25B2' : '\u25BC';
            return '<span class="sterm-ticker-item">' +
                '<span class="sterm-ticker-sym">' + s.coinSymbol.toUpperCase() + '</span>' +
                '<span class="' + cls + '">' + icon + ' ' + s.signal + '</span>' +
                '<span class="sterm-ticker-sym">' + fmtPrice(s.currentPrice) + '</span></span>';
        }).join('');
        el.innerHTML = html + html;
    }

    // ── STATS ────────────────────────────────────────────────────────────────
    function updateStats() {
        var el = document.querySelector('.sterm-statsbar');
        if (!el) return;
        el.innerHTML =
            '<div class="sterm-stat">SCAN <span class="sterm-stat-val">#' + _scanCount + '</span></div>' +
            '<div class="sterm-stat">LONG <span class="sterm-stat-long">' + _longCount + '</span></div>' +
            '<div class="sterm-stat">SHORT <span class="sterm-stat-short">' + _shortCount + '</span></div>' +
            '<div class="sterm-stat">TOTAL <span class="sterm-stat-val">' + _allSignals.length + '</span></div>' +
            '<div class="sterm-stat">INTERVAL <span class="sterm-stat-val">' + (POLL_MS/1000) + 's</span></div>' +
            '<div class="sterm-stat">UPDATED <span class="sterm-stat-val">' + new Date().toLocaleTimeString('id-ID') + '</span></div>';
    }

    // ── FEED LINE ────────────────────────────────────────────────────────────
    function appendLine(tag, tagClass, msg) {
        if (!_feedEl) return;
        var div = document.createElement('div');
        div.className = 'sterm-line';
        div.innerHTML =
            '<span class="sterm-line-ts">' + new Date().toLocaleTimeString('id-ID') + '</span>' +
            '<span class="sterm-line-tag sterm-line-tag-' + tagClass + '">' + tag + '</span>' +
            '<span class="sterm-line-msg">' + msg + '</span>';
        _feedEl.appendChild(div);
        _feedEl.scrollTop = _feedEl.scrollHeight;
    }

    // ── SIGNAL CARD ──────────────────────────────────────────────────────────
    function appendSignalCard(sig) {
        if (!_feedEl) return;
        var isLong = sig.signal === 'LONG';
        var card   = document.createElement('div');
        card.className = 'sterm-signal-card sterm-card-' + (isLong ? 'long' : 'short');
        var sub = (sig.subScores || []).slice(0, 3).map(function(s) {
            return s.label.split(' ')[0] + ':' + s.score;
        }).join(' \u00B7 ');
        card.innerHTML =
            '<div class="sterm-card-header">' +
                '<span class="sterm-card-coin sterm-card-coin-' + (isLong ? 'long' : 'short') + '">' +
                    (isLong ? '\u25B2' : '\u25BC') + ' ' + sig.coinSymbol.toUpperCase() + ' / ' + sig.coinName +
                '</span>' +
                '<span class="sterm-card-badge sterm-card-badge-' + (isLong ? 'long' : 'short') + '">' + sig.signal + '</span>' +
            '</div>' +
            '<div class="sterm-card-levels">' +
                '<div class="sterm-card-level"><div class="sterm-card-level-lbl">HARGA</div><div class="sterm-card-level-val blue">' + fmtPrice(sig.currentPrice) + '</div></div>' +
                '<div class="sterm-card-level"><div class="sterm-card-level-lbl">ENTRY</div><div class="sterm-card-level-val">' + fmtPrice(sig.entryLow) + ' \u2014 ' + fmtPrice(sig.entryHigh) + '</div></div>' +
                '<div class="sterm-card-level"><div class="sterm-card-level-lbl">STOP LOSS</div><div class="sterm-card-level-val red">' + fmtPrice(sig.stopLoss) + '</div></div>' +
                '<div class="sterm-card-level"><div class="sterm-card-level-lbl">TP1</div><div class="sterm-card-level-val green">' + fmtPrice(sig.tp1) + '</div></div>' +
                '<div class="sterm-card-level"><div class="sterm-card-level-lbl">TP2</div><div class="sterm-card-level-val green">' + fmtPrice(sig.tp2) + '</div></div>' +
                '<div class="sterm-card-level"><div class="sterm-card-level-lbl">R:R</div><div class="sterm-card-level-val">1 : ' + sig.rr + '</div></div>' +
            '</div>' +
            '<div class="sterm-card-footer">' +
                '<span>\uD83D\uDCCA Bull <b>' + sig.bullish + '%</b> Bear <b>' + sig.bearish + '%</b> Conf <b>' + sig.confidence + '%</b></span>' +
                '<span>\uD83D\uDC0B Whale: <b>' + (sig.whaleBias || '\u2014') + '</b></span>' +
                '<span>\uD83D\uDCCF Vol: <b>' + (sig.volPhase || '\u2014') + '</b></span>' +
                '<span>\uD83C\uDFB2 MC: <b>' + (sig.mcProbUp != null ? sig.mcProbUp : '\u2014') + '%</b></span>' +
                '<span>\uD83D\uDD50 <b>' + fmtDate(sig.timestamp) + '</b></span>' +
                (sub ? '<span>\uD83D\uDD0D ' + sub + '</span>' : '') +
            '</div>';
        _feedEl.appendChild(card);
        _feedEl.scrollTop = _feedEl.scrollHeight;
    }

    // ── POLL ─────────────────────────────────────────────────────────────────
    async function poll() {
        _scanCount++;
        updateStats();
        appendLine('POLL', 'scan', 'Mengambil sinyal dari server... (#' + _scanCount + ')');
        var signals = [];
        try {
            var r = await fetch(PROXY + '/api/signals', { signal: AbortSignal.timeout(8000) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            signals = await r.json();
            appendLine('OK', 'scan', 'Proxy OK &mdash; ' + signals.length + ' sinyal tersimpan');
        } catch (e1) {
            try {
                var r2 = await fetch('./signals.json?_=' + Date.now(), { signal: AbortSignal.timeout(5000) });
                if (r2.ok) {
                    signals = await r2.json();
                    appendLine('FILE', 'info', 'Fallback signals.json &mdash; ' + signals.length + ' sinyal');
                } else throw new Error('not found');
            } catch (e2) {
                appendLine('ERR', 'warn', 'Proxy &amp; signals.json tidak tersedia. Jalankan: <b>node signal-bot.js</b>');
                return;
            }
        }
        if (!Array.isArray(signals)) { appendLine('ERR', 'warn', 'Format data tidak valid.'); return; }
        _allSignals = signals;
        _longCount  = signals.filter(function(s) { return s.signal === 'LONG'; }).length;
        _shortCount = signals.filter(function(s) { return s.signal === 'SHORT'; }).length;
        buildTicker(signals);
        var newSigs = signals.filter(function(s) { return !_seenIds.has(uid(s)); });
        if (!newSigs.length) {
            appendLine('OK', 'scan', 'Tidak ada sinyal baru. (Total: <b>' + signals.length + '</b>)');
        } else {
            appendLine('NEW', 'scan', '<b>' + newSigs.length + '</b> sinyal baru ditemukan!');
            newSigs.slice().reverse().forEach(function(sig) {
                _seenIds.add(uid(sig));
                appendLine(sig.signal, sig.signal === 'LONG' ? 'long' : 'short',
                    '<b>' + sig.coinSymbol.toUpperCase() + '</b> ' + sig.coinName +
                    ' \u2014 ' + fmtPrice(sig.currentPrice) + ' | ' + sig.signalReason);
                appendSignalCard(sig);
            });
        }
        _lastPoll = new Date();
        updateStats();
    }

    // ── BOOT SEQUENCE ────────────────────────────────────────────────────────
    async function bootSequence() {
        if (_booting) return;
        _booting = true;
        var lines = [
            ['INIT', 'info', 'Signal Terminal v2 online...'],
            ['LOAD', 'info', '10 engines: Structure &middot; Liquidity &middot; S&amp;D &middot; VP &middot; OF &middot; Whale &middot; Vol &middot; GBM &middot; Prob &middot; Trade'],
            ['CONN', 'info', 'Proxy: <b>' + PROXY + '/api/signals</b>'],
        ];
        for (var i = 0; i < lines.length; i++) {
            await new Promise(function(r) { setTimeout(r, 200); });
            appendLine(lines[i][0], lines[i][1], lines[i][2]);
        }
        await poll();
    }

    // ── COMMAND ──────────────────────────────────────────────────────────────
    function handleCommand(cmd) {
        var c = cmd.trim().toLowerCase();
        if (!c) return;
        appendLine('$', 'info', '<b style="color:#22d3ee">' + cmd + '</b>');
        if (c === 'help') {
            ['clear / cls  &mdash; hapus feed &amp; reload',
             'refresh      &mdash; poll sekarang',
             'status       &mdash; lihat statistik',
             'signals      &mdash; semua sinyal',
             'long         &mdash; filter LONG saja',
             'short        &mdash; filter SHORT saja',
            ].forEach(function(l) { appendLine('', 'info', l); });
        } else if (c === 'clear' || c === 'cls') {
            _feedEl.innerHTML = ''; _seenIds.clear();
            appendLine('OK', 'scan', 'Feed dibersihkan.'); poll();
        } else if (c === 'refresh') {
            poll();
        } else if (c === 'status') {
            appendLine('STAT', 'scan', 'Scan: <b>#' + _scanCount + '</b> | LONG: <b>' + _longCount +
                '</b> | SHORT: <b>' + _shortCount + '</b> | Total: <b>' + _allSignals.length + '</b>');
        } else if (c === 'signals' || c === 'long' || c === 'short') {
            var list = c === 'long' ? _allSignals.filter(function(s) { return s.signal === 'LONG'; })
                     : c === 'short' ? _allSignals.filter(function(s) { return s.signal === 'SHORT'; })
                     : _allSignals;
            if (!list.length) { appendLine('', 'warn', 'Tidak ada sinyal.'); return; }
            list.slice(0, 10).forEach(function(s) {
                appendLine(s.signal, s.signal === 'LONG' ? 'long' : 'short',
                    '<b>' + s.coinSymbol.toUpperCase() + '</b> ' + fmtPrice(s.currentPrice) +
                    ' \u2014 ' + s.signalReason + ' [' + fmtDate(s.timestamp) + ']');
            });
        } else {
            appendLine('ERR', 'warn', 'Tidak dikenal: <b>' + cmd + '</b>. Ketik <b>help</b>');
        }
    }

    // ── TERMINAL HTML ─────────────────────────────────────────────────────────
    function buildTerminalHTML() {
        return '<div class="sterm-section">' +
            '<div class="sterm-section-title">&#9889; SIGNAL TERMINAL &mdash; Live Bot Feed</div>' +
            '<div class="sterm-outer" id="stermOuter">' +
                '<div class="sterm-matrix-wrap">' +
                    '<canvas class="sterm-matrix-canvas" id="stermMatrix"></canvas>' +
                    '<div class="sterm-matrix-overlay">&#9672; SIGNAL_BOT v1 &middot; QUANT_ANALYST v2 &middot; 10 ENGINES ACTIVE &#9672;</div>' +
                '</div>' +
                '<div class="sterm-titlebar">' +
                    '<div class="sterm-dots">' +
                        '<div class="sterm-dot sterm-dot-r"></div>' +
                        '<div class="sterm-dot sterm-dot-y"></div>' +
                        '<div class="sterm-dot sterm-dot-g"></div>' +
                    '</div>' +
                    '<div class="sterm-title-text">signal-terminal@crypto-scanner:~$</div>' +
                    '<div class="sterm-status"><div class="sterm-status-dot"></div>LIVE</div>' +
                '</div>' +
                '<div class="sterm-statsbar"></div>' +
                '<div class="sterm-ticker-wrap"><div class="sterm-ticker" id="stermTicker"></div></div>' +
                '<div class="sterm-feed" id="stermFeed"></div>' +
                '<div class="sterm-inputbar">' +
                    '<span class="sterm-prompt">root@signal-bot:~$&nbsp;</span>' +
                    '<input class="sterm-cmd-input" id="stermInput" type="text" placeholder="ketik \'help\'..." autocomplete="off" spellcheck="false"/>' +
                    '<div class="sterm-cursor"></div>' +
                    '<button class="sterm-btn-refresh" id="stermBtnRefresh">&#8635; REFRESH</button>' +
                    '<button class="sterm-btn-clear" id="stermBtnClear">&#10005; CLEAR</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // ── INIT (dipanggil saat tab diklik) ──────────────────────────────────────
    function init(targetEl) {
        if (!targetEl) return;
        _el = targetEl;
        _el.innerHTML = buildTerminalHTML();
        _feedEl = document.getElementById('stermFeed');

        var canvas = document.getElementById('stermMatrix');
        if (canvas) startMatrixRain(canvas);

        var input = document.getElementById('stermInput');
        if (input) input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { handleCommand(input.value); input.value = ''; }
        });
        var btnR = document.getElementById('stermBtnRefresh');
        if (btnR) btnR.addEventListener('click', poll);
        var btnC = document.getElementById('stermBtnClear');
        if (btnC) btnC.addEventListener('click', function() {
            _feedEl.innerHTML = ''; _seenIds.clear();
            appendLine('OK', 'scan', 'Feed dibersihkan.'); poll();
        });

        bootSequence();
        _pollTimer = setInterval(poll, POLL_MS);
    }

    // ── PRE-INIT (loading screen — langsung saat halaman load) ─────────────────
    function preInit() {
        var panel = document.getElementById('signalTerminalPanel');
        if (panel) showLoadingScreen(panel);
    }

    function destroy() {
        if (_pollTimer)  clearInterval(_pollTimer);
        if (_matrixAnim) clearInterval(_matrixAnim);
    }

    return { init, preInit, destroy };
})();

// Jalankan loading screen segera saat DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { SignalTerminal.preInit(); });
} else {
    SignalTerminal.preInit();
}
