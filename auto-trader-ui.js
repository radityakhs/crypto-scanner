/**
 * auto-trader-ui.js — Dashboard panel untuk Auto Trader
 * Berkomunikasi dengan auto-trader.js via proxy-server.js di :3001/trader/*
 * Refresh state tiap 5 detik secara otomatis
 */

const autoTraderUI = (() => {
    'use strict';

    const PROXY  = 'http://127.0.0.1:3001';
    let _timer   = null;
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

    // ── Render: status bar ──────────────────────────────────────────────────
    function render(s) {
        // Status badge
        const badge = document.getElementById('at-status-badge');
        if (badge) {
            if (s.circuitBreaker) {
                badge.textContent = '⛔ CIRCUIT BREAKER';
                badge.className = 'at-badge at-badge-error';
            } else if (!s.running) {
                badge.textContent = '⏸ STOPPED';
                badge.className = 'at-badge at-badge-warn';
            } else if (s.dryRun) {
                badge.textContent = '📋 DRY RUN';
                badge.className = 'at-badge at-badge-info';
            } else {
                badge.textContent = '🔴 LIVE';
                badge.className = 'at-badge at-badge-live';
            }
        }

        // Equity & PnL cards
        _setText('at-equity',       `$${_fmt(s.totalEquity)}`);
        _setText('at-peak',         `$${_fmt(s.peakEquity)}`);
        _setText('at-daily-pnl',    _fmtUsd(s.dailyPnl));
        _setText('at-total-pnl',    _fmtUsd(s.totalPnl));
        _setText('at-drawdown',     `${_fmt(s.drawdownPct)}%`);

        // Color PnL
        _setColor('at-daily-pnl',   _pnlColor(s.dailyPnl));
        _setColor('at-total-pnl',   _pnlColor(s.totalPnl));
        _setColor('at-drawdown',    parseFloat(s.drawdownPct) > 0 ? '#f87171' : '#22c55e');

        // Stats
        const ws = s.stats || {};
        const winRate = ws.totalTrades > 0 ? (ws.wins / ws.totalTrades * 100).toFixed(1) : '—';
        _setText('at-winrate',      `${winRate}%`);
        _setText('at-trades',       `${ws.wins || 0}W / ${ws.losses || 0}L`);
        _setText('at-best',         _fmtUsd(ws.bestTrade));
        _setText('at-worst',        _fmtUsd(ws.worstTrade));
        _setColor('at-best',  '#22c55e');
        _setColor('at-worst', '#f87171');

        // Config
        if (s.config) {
            _setText('at-cfg-risk',  `${s.config.riskPct}%`);
            _setText('at-cfg-max-pos', s.config.maxPositions);
            _setText('at-cfg-maxloss', `${s.config.maxDailyLoss}%`);
        }

        // Posisi terbuka
        renderPositions(s.positions || []);

        // Recent trades
        renderTrades(s.recentTrades || []);

        // Circuit breaker button
        const cbBtn = document.getElementById('at-btn-reset-cb');
        if (cbBtn) cbBtn.style.display = s.circuitBreaker ? 'inline-flex' : 'none';
    }

    function renderOffline() {
        const badge = document.getElementById('at-status-badge');
        if (badge) { badge.textContent = '🔌 OFFLINE'; badge.className = 'at-badge at-badge-offline'; }
        _setText('at-equity', '—');
        const posEl = document.getElementById('at-positions-body');
        if (posEl) posEl.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#475569;padding:20px">Auto Trader tidak aktif.<br><small>Jalankan: <code>node auto-trader.js</code></small></td></tr>';
        const trdEl = document.getElementById('at-trades-body');
        if (trdEl) trdEl.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#475569;padding:20px">—</td></tr>';
    }

    function renderPositions(positions) {
        const el = document.getElementById('at-positions-body');
        if (!el) return;
        if (!positions.length) {
            el.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#475569;padding:16px">Tidak ada posisi terbuka</td></tr>';
            return;
        }
        el.innerHTML = positions.map(p => {
            const pnl      = parseFloat(p.pnlUsd || 0);
            const pnlPct   = p.entryPrice ? ((pnl / p.sizeUsd) * 100) : 0;
            const pnlColor = _pnlColor(pnl);
            const side     = p.side === 'buy'
                ? '<span style="color:#22c55e;font-weight:700">LONG</span>'
                : '<span style="color:#f87171;font-weight:700">SHORT</span>';
            const trail    = p.trailActive
                ? '<span title="Trailing stop aktif" style="color:#a78bfa">🔄</span>' : '';
            const tp1Badge = p.tp1Hit ? '<span style="color:#22c55e;font-size:10px"> TP1✓</span>' : '';
            const tp2Badge = p.tp2Hit ? '<span style="color:#22c55e;font-size:10px"> TP2✓</span>' : '';
            return `<tr>
                <td><b>${p.coinSymbol?.toUpperCase()}</b></td>
                <td>${side}</td>
                <td>$${_fmt(p.entryPrice, 6)}</td>
                <td>$${_fmt(p.currentPrice || p.entryPrice, 6)}</td>
                <td style="color:${pnlColor};font-weight:700">${_fmtUsd(pnl)} (${pnlPct.toFixed(2)}%)${tp1Badge}${tp2Badge}</td>
                <td>$${_fmt(p.stopLoss, 6)} ${trail}</td>
                <td>$${_fmt(p.tp1, 6)}</td>
                <td>
                    <button onclick="autoTraderUI.closePosition('${p.coinId}')"
                        style="padding:3px 8px;border-radius:4px;border:1px solid #f87171;background:transparent;color:#f87171;cursor:pointer;font-size:11px">
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
            el.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#475569;padding:16px">Belum ada riwayat trade</td></tr>';
            return;
        }
        el.innerHTML = trades.map(t => {
            const pnl      = parseFloat(t.pnlUsd || 0);
            const pnlColor = _pnlColor(pnl);
            const side     = t.side === 'buy'
                ? '<span style="color:#22c55e">LONG</span>'
                : '<span style="color:#f87171">SHORT</span>';
            const resultIcon = pnl > 0 ? '✅' : '🔴';
            return `<tr>
                <td>${resultIcon} <b>${t.coinSymbol?.toUpperCase()}</b></td>
                <td>${side}</td>
                <td>$${_fmt(t.entryPrice, 6)}</td>
                <td>$${_fmt(t.exitPrice, 6)}</td>
                <td style="color:${pnlColor};font-weight:700">${_fmtUsd(pnl)} (${t.pnlPct}%)</td>
                <td style="color:#64748b;font-size:11px">${t.reason || '—'}</td>
                <td style="color:#64748b;font-size:11px">${_timeSince(t.closedAt)}</td>
            </tr>`;
        }).join('');
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
            // Kirim close-all sementara karena belum ada endpoint per-coin
            // TODO: tambah endpoint /trader/close/:coinId
            await _post('/trader/close-all');
            fetchState();
        } catch (e) {
            alert('Gagal tutup posisi: ' + e.message);
        }
    }

    async function resetCircuitBreaker() {
        try {
            await _post('/trader/reset-circuit');
            fetchState();
        } catch (e) {
            alert('Gagal reset circuit breaker: ' + e.message);
        }
    }

    async function closeAll() {
        if (!confirm('Tutup SEMUA posisi terbuka?')) return;
        try {
            await _post('/trader/close-all');
            fetchState();
        } catch (e) {
            alert('Gagal close all: ' + e.message);
        }
    }

    function startPolling(intervalMs = 5000) {
        fetchState(); // langsung fetch
        _timer = setInterval(fetchState, intervalMs);
    }

    function stopPolling() {
        if (_timer) { clearInterval(_timer); _timer = null; }
    }

    return { startPolling, stopPolling, fetchState, closePosition, resetCircuitBreaker, closeAll };
})();
