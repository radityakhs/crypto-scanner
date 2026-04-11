/**
 * auto-trader-ui.js — Trading Robot dashboard
 * Komunikasi dengan auto-trader.js via proxy-server.js di :3001/trader/*
 */

const autoTraderUI = (() => {
    'use strict';

    const PROXY  = 'http://127.0.0.1:3001';
    let _lastState = null;

    // ── Helpers ────────────────────────────────────────────────────────────
    async function _get(path) {
        const r = await fetch(PROXY + path);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }
    async function _post(path) {
        const r = await fetch(PROXY + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }

    function _fmt(n, dec = 2) {
        const v = parseFloat(n);
        return isNaN(v) ? '—' : v.toFixed(dec);
    }
    function _fmtUsd(n) {
        const v = parseFloat(n);
        if (isNaN(v)) return '—';
        const sign = v >= 0 ? '+' : '';
        return `${sign}$${Math.abs(v).toFixed(2)}`;
    }
    function _pnlColor(n) {
        const v = parseFloat(n);
        if (isNaN(v) || v === 0) return '#94a3b8';
        return v > 0 ? '#22c55e' : '#f87171';
    }
    function _timeSince(iso) {
        if (!iso) return '—';
        const diff = Date.now() - new Date(iso).getTime();
        const m    = Math.floor(diff / 60000);
        if (m < 60)  return `${m}m lalu`;
        const h    = Math.floor(m / 60);
        if (h < 24)  return `${h}j lalu`;
        return `${Math.floor(h / 24)}h lalu`;
    }

    // ── Fetch state dari auto-trader ────────────────────────────────────────
    async function fetchState() {
        try {
            const s = await _get('/trader/state');
            _lastState = s;
            render(s);
        } catch (e) {
            renderOffline();
        }
    }

    // ── Render: full state ──────────────────────────────────────────────────
    function render(s) {
        // Hero status ring + pills
        const ring  = document.getElementById('botStatusRing');
        const pill  = document.getElementById('botStatusPill');
        const sub   = document.getElementById('botSubtitle');
        const cbBtn = document.getElementById('botResetCB');

        if (s.circuitBreaker) {
            if (ring) ring.className = 'bot-status-ring error';
            if (pill) { pill.className = 'bot-pill bot-pill-error'; pill.innerHTML = '<span class="bot-dot"></span>CIRCUIT BREAKER'; }
            if (sub) sub.textContent = '⛔ Circuit breaker aktif — reset untuk melanjutkan';
            if (cbBtn) cbBtn.style.display = 'inline-block';
            _botLog('warn', '⛔ Circuit breaker aktif!');
        } else if (!s.running) {
            if (ring) ring.className = 'bot-status-ring paused';
            if (pill) { pill.className = 'bot-pill bot-pill-warn'; pill.innerHTML = '<span class="bot-dot"></span>PAUSED'; }
            if (sub) sub.textContent = 'Bot terhubung tapi sedang dijeda';
            if (cbBtn) cbBtn.style.display = 'none';
        } else if (s.dryRun) {
            if (ring) ring.className = 'bot-status-ring running';
            if (pill) { pill.className = 'bot-pill bot-pill-paper'; pill.innerHTML = '<span class="bot-dot"></span>PAPER TRADING'; }
            if (sub) sub.textContent = '📄 Mode paper trading — tidak ada dana nyata';
            if (cbBtn) cbBtn.style.display = 'none';
        } else {
            if (ring) ring.className = 'bot-status-ring running';
            if (pill) { pill.className = 'bot-pill bot-pill-live'; pill.innerHTML = '<span class="bot-dot"></span>LIVE'; }
            if (sub) sub.textContent = '🔴 Mode LIVE — menggunakan dana nyata!';
            if (cbBtn) cbBtn.style.display = 'none';
        }

        // KPI
        _setText('at-equity',    `$${_fmt(s.totalEquity)}`);
        _setText('at-peak',      `$${_fmt(s.peakEquity)}`);
        _setText('at-daily-pnl', _fmtUsd(s.dailyPnl));
        _setText('at-total-pnl', _fmtUsd(s.totalPnl));
        _setText('at-drawdown',  `${_fmt(s.drawdownPct)}%`);

        _setColor('at-daily-pnl', _pnlColor(s.dailyPnl));
        _setColor('at-total-pnl', _pnlColor(s.totalPnl));
        _setColor('at-drawdown',  parseFloat(s.drawdownPct) > 0 ? '#f87171' : '#4ade80');

        const ws = s.stats || {};
        const winRate = ws.totalTrades > 0
            ? (ws.wins / ws.totalTrades * 100).toFixed(1) : '—';
        _setText('at-winrate', `${winRate}%`);
        _setText('at-trades',  `${ws.wins || 0}W / ${ws.losses || 0}L`);
        _setText('at-best',    _fmtUsd(ws.bestTrade));
        _setText('at-worst',   _fmtUsd(ws.worstTrade));
        _setColor('at-best',  '#4ade80');
        _setColor('at-worst', '#f87171');

        // Config summary
        if (s.config) {
            _setText('at-cfg-risk',    `${s.config.riskPct}%`);
            _setText('at-cfg-max-pos', s.config.maxPositions);
            _setText('at-cfg-maxloss', `${s.config.maxDailyLoss}%`);
        }

        // Positions
        const positions = s.positions || [];
        _setText('botPosCount', `${positions.length} posisi`);
        renderPositions(positions);

        // Trade history
        const trades = s.recentTrades || [];
        _setText('botHistCount', `${trades.length} trade`);
        renderTrades(trades);

        // Log position change
        const prevPosCnt = (_lastState?.positions || []).length;
        if (_lastState && positions.length > prevPosCnt) {
            _botLog('buy', `📌 Posisi baru dibuka — total ${positions.length} posisi`);
        } else if (_lastState && positions.length < prevPosCnt) {
            const pnl = parseFloat(s.dailyPnl) || 0;
            _botLog(pnl >= 0 ? 'profit' : 'loss',
                `${pnl >= 0 ? '✅' : '❌'} Posisi ditutup — daily P&L: ${_fmtUsd(s.dailyPnl)}`);
        }

        // Legacy badge (kept for compatibility)
        const badge = document.getElementById('at-status-badge');
        if (badge) {
            if (s.circuitBreaker)       { badge.textContent = '⛔ CIRCUIT BREAKER'; badge.className = 'at-badge at-badge-error'; }
            else if (!s.running)        { badge.textContent = '⏸ STOPPED'; badge.className = 'at-badge at-badge-warn'; }
            else if (s.dryRun)          { badge.textContent = '📋 DRY RUN'; badge.className = 'at-badge at-badge-info'; }
            else                        { badge.textContent = '🔴 LIVE'; badge.className = 'at-badge at-badge-live'; }
        }

        // Circuit breaker legacy button
        const cbBtnLeg = document.getElementById('at-btn-reset-cb');
        if (cbBtnLeg) cbBtnLeg.style.display = s.circuitBreaker ? 'inline-flex' : 'none';
    }

    function renderOffline() {
        const ring = document.getElementById('botStatusRing');
        const pill = document.getElementById('botStatusPill');
        const sub  = document.getElementById('botSubtitle');
        if (ring) ring.className = 'bot-status-ring offline';
        if (pill) { pill.className = 'bot-pill bot-pill-offline'; pill.innerHTML = '<span class="bot-dot"></span>OFFLINE'; }
        if (sub) sub.textContent = 'Tidak dapat terhubung ke server bot';

        ['at-equity','at-peak','at-daily-pnl','at-total-pnl','at-drawdown','at-winrate','at-best','at-worst']
            .forEach(id => _setText(id, '—'));

        const posEl = document.getElementById('at-positions-body');
        if (posEl) posEl.innerHTML = '<tr class="empty-row"><td colspan="8">Auto Trader tidak aktif — jalankan <code>node auto-trader.js</code></td></tr>';
        const trdEl = document.getElementById('at-trades-body');
        if (trdEl) trdEl.innerHTML = '<tr class="empty-row"><td colspan="7">—</td></tr>';
    }

    function renderPositions(positions) {
        const el = document.getElementById('at-positions-body');
        if (!el) return;
        if (!positions.length) {
            el.innerHTML = '<tr class="empty-row"><td colspan="8">Tidak ada posisi terbuka</td></tr>';
            return;
        }
        el.innerHTML = positions.map(p => {
            const pnl      = parseFloat(p.pnlUsd || 0);
            const pnlPct   = p.sizeUsd ? ((pnl / p.sizeUsd) * 100) : 0;
            const pnlColor = _pnlColor(pnl);
            const sideClass = p.side === 'buy' ? 'pos-long' : 'pos-short';
            const sideLabel = p.side === 'buy' ? 'LONG' : 'SHORT';
            const trail    = p.trailActive ? ' 🔄' : '';
            const tp1Badge = p.tp1Hit ? '<span style="font-size:9px;color:#4ade80"> TP1✓</span>' : '';
            const tp2Badge = p.tp2Hit ? '<span style="font-size:9px;color:#4ade80"> TP2✓</span>' : '';
            return `<tr>
                <td><b>${p.coinSymbol?.toUpperCase() || '?'}</b></td>
                <td class="${sideClass}">${sideLabel}</td>
                <td>$${_fmt(p.entryPrice, 6)}</td>
                <td>$${_fmt(p.currentPrice || p.entryPrice, 6)}</td>
                <td style="color:${pnlColor};font-weight:700">${_fmtUsd(pnl)} (${pnlPct.toFixed(2)}%)${tp1Badge}${tp2Badge}</td>
                <td>$${_fmt(p.stopLoss, 6)}${trail}</td>
                <td>$${_fmt(p.tp1, 6)}</td>
                <td>
                    <button onclick="autoTraderUI.closePosition('${p.coinId}')"
                        style="padding:3px 10px;border-radius:5px;border:1px solid #f87171;background:transparent;color:#f87171;cursor:pointer;font-size:11px;font-weight:600">
                        Close
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    function renderTrades(trades) {
        const el = document.getElementById('at-trades-body');
        if (!el) return;
        if (!trades.length) {
            el.innerHTML = '<tr class="empty-row"><td colspan="7">Belum ada riwayat trade</td></tr>';
            return;
        }
        el.innerHTML = trades.map(t => {
            const pnl      = parseFloat(t.pnlUsd || 0);
            const pnlColor = _pnlColor(pnl);
            const sideClass = t.side === 'buy' ? 'pos-long' : 'pos-short';
            const sideLabel = t.side === 'buy' ? 'LONG' : 'SHORT';
            const icon = pnl > 0 ? '✅' : '❌';
            return `<tr>
                <td>${icon} <b>${t.coinSymbol?.toUpperCase() || '?'}</b></td>
                <td class="${sideClass}">${sideLabel}</td>
                <td>$${_fmt(t.entryPrice, 6)}</td>
                <td>$${_fmt(t.exitPrice, 6)}</td>
                <td style="color:${pnlColor};font-weight:700">${_fmtUsd(pnl)} (${t.pnlPct}%)</td>
                <td style="color:var(--text3);font-size:11px">${t.reason || '—'}</td>
                <td style="color:var(--text3);font-size:11px">${_timeSince(t.closedAt)}</td>
            </tr>`;
        }).join('');
    }

    // ── Internal log bridge ──────────────────────────────────────────────────
    function _botLog(type, msg) {
        if (typeof botLog === 'function') botLog(type, msg);
    }

    // ── DOM helpers ────────────────────────────────────────────────────────
    function _setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
    function _setColor(id, color) {
        const el = document.getElementById(id);
        if (el) el.style.color = color;
    }

    // ── Public API ─────────────────────────────────────────────────────────
    async function closePosition(coinId) {
        if (!confirm(`Yakin tutup posisi ${coinId}?`)) return;
        try {
            await _post('/trader/close-all');
            fetchState();
        } catch (e) {
            alert('Gagal tutup posisi: ' + e.message);
        }
    }

    async function resetCircuitBreaker() {
        try {
            await _post('/trader/reset-circuit');
            _botLog('info', '⚡ Circuit breaker di-reset');
            fetchState();
        } catch (e) {
            alert('Gagal reset circuit breaker: ' + e.message);
        }
    }

    async function closeAll() {
        if (!confirm('Tutup SEMUA posisi terbuka?')) return;
        try {
            await _post('/trader/close-all');
            _botLog('warn', '🛑 Semua posisi ditutup manual');
            fetchState();
        } catch (e) {
            alert('Gagal close all: ' + e.message);
        }
    }

    function startPolling(intervalMs = 5000) {
        fetchState();
    }
    function stopPolling() {}

    return { startPolling, stopPolling, fetchState, closePosition, resetCircuitBreaker, closeAll };
})();
