/**
 * okx-trading.js — OKX Trading Module
 * Berkomunikasi dengan proxy-server.js di localhost:3001
 * API key TIDAK ada di file ini — semuanya di .env di server
 */

const okxTrading = (() => {
    const PROXY = 'http://127.0.0.1:3001';
    let _connected = false;
    let _balance   = [];    // array aset dari OKX
    let _orders    = [];    // pending orders
    let _pollTimer = null;

    // ── Utility ──────────────────────────────────────────────
    async function _get(path) {
        const r = await fetch(PROXY + path);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }
    async function _post(path, body) {
        const r = await fetch(PROXY + path, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    }

    function _fmtNum(n, dec = 4) {
        const v = parseFloat(n);
        return isNaN(v) ? '—' : v.toFixed(dec);
    }

    // ── Connection check ─────────────────────────────────────
    async function checkProxy() {
        try {
            const d = await _get('/health');
            return !!d.ok;
        } catch { return false; }
    }

    // ── Fetch balance ────────────────────────────────────────
    async function fetchBalance() {
        try {
            const d = await _get('/okx/balance');
            if (d.code !== '0') throw new Error(d.msg || 'API error');
            // OKX returns details array per currency
            _balance = (d.data?.[0]?.details || [])
                .filter(a => parseFloat(a.availEq || a.availBal) > 0)
                .sort((a, b) => parseFloat(b.eqUsd || 0) - parseFloat(a.eqUsd || 0));
            return _balance;
        } catch (e) {
            console.error('OKX balance error:', e);
            return [];
        }
    }

    // ── Fetch pending orders ─────────────────────────────────
    async function fetchPendingOrders() {
        try {
            const d = await _get('/okx/orders/pending?instType=SPOT');
            if (d.code !== '0') throw new Error(d.msg);
            _orders = d.data || [];
            return _orders;
        } catch (e) {
            console.error('OKX orders error:', e);
            return [];
        }
    }

    // ── Fetch order history ──────────────────────────────────
    async function fetchOrderHistory(limit = 20) {
        try {
            const d = await _get(`/okx/orders/history?instType=SPOT&limit=${limit}`);
            if (d.code !== '0') throw new Error(d.msg);
            return d.data || [];
        } catch (e) {
            console.error('OKX history error:', e);
            return [];
        }
    }

    // ── Place order ──────────────────────────────────────────
    async function placeOrder({ instId, side, ordType, sz, px }) {
        try {
            const d = await _post('/okx/order/place', { instId, side, ordType, sz, px });
            if (d.code !== '0') throw new Error(d.msg || d.data?.[0]?.sMsg || 'Order gagal');
            const ordId = d.data?.[0]?.ordId;
            _showToast(`✅ Order ${side.toUpperCase()} ${instId} berhasil! ID: ${ordId}`,'success');
            await fetchPendingOrders();
            renderOrders();
            return { ok: true, ordId };
        } catch (e) {
            _showToast(`❌ Order gagal: ${e.message}`, 'error');
            return { ok: false, error: e.message };
        }
    }

    // ── Cancel order ─────────────────────────────────────────
    async function cancelOrder(instId, ordId) {
        try {
            const d = await _post('/okx/order/cancel', { instId, ordId });
            if (d.code !== '0') throw new Error(d.msg);
            _showToast(`🗑 Order ${ordId} dibatalkan`, 'info');
            await fetchPendingOrders();
            renderOrders();
        } catch (e) {
            _showToast(`❌ Cancel gagal: ${e.message}`, 'error');
        }
    }

    // ── Toast helper ─────────────────────────────────────────
    function _showToast(msg, type = 'info') {
        const t = document.createElement('div');
        t.className = `pf-toast pf-toast-${type}`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 5000);
    }

    // ── Render balance table ─────────────────────────────────
    function renderBalance() {
        const el = document.getElementById('okxBalanceBody');
        if (!el) return;
        if (!_balance.length) {
            el.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#475569;padding:16px">Tidak ada aset</td></tr>';
            return;
        }
        el.innerHTML = _balance.map(a => {
            const avail  = parseFloat(a.availEq || a.availBal || 0);
            const frozen = parseFloat(a.frozenBal || 0);
            const usd    = parseFloat(a.eqUsd || 0);
            return `<tr>
                <td><b>${a.ccy}</b></td>
                <td>${_fmtNum(avail, 6)}</td>
                <td style="color:#64748b">${_fmtNum(frozen, 6)}</td>
                <td style="color:#a5b4fc">$${_fmtNum(usd, 2)}</td>
            </tr>`;
        }).join('');

        // Update total equity
        const total = _balance.reduce((s, a) => s + parseFloat(a.eqUsd || 0), 0);
        const totEl = document.getElementById('okxTotalEq');
        if (totEl) totEl.textContent = `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // ── Render pending orders table ──────────────────────────
    function renderOrders() {
        const el = document.getElementById('okxOrdersBody');
        if (!el) return;
        if (!_orders.length) {
            el.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#475569;padding:16px">Tidak ada order aktif</td></tr>';
            return;
        }
        el.innerHTML = _orders.map(o => {
            const side  = o.side === 'buy'
                ? '<span style="color:#22c55e">BUY</span>'
                : '<span style="color:#f87171">SELL</span>';
            const pct   = o.sz ? ((parseFloat(o.accFillSz || 0) / parseFloat(o.sz)) * 100).toFixed(0) : 0;
            const ts    = new Date(parseInt(o.cTime)).toLocaleTimeString('id-ID');
            return `<tr>
                <td><b>${o.instId}</b></td>
                <td>${side}</td>
                <td>${o.ordType}</td>
                <td>${_fmtNum(o.px, 4)}</td>
                <td>${_fmtNum(o.sz, 4)} <small style="color:#64748b">(${pct}% filled)</small></td>
                <td>${ts}</td>
                <td><button class="okx-cancel-btn" onclick="okxTrading.cancelOrder('${o.instId}','${o.ordId}')">✕ Cancel</button></td>
            </tr>`;
        }).join('');
    }

    // ── Render order history ─────────────────────────────────
    async function renderHistory() {
        const el = document.getElementById('okxHistoryBody');
        if (!el) return;
        el.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b"><span class="g-spinner sm"></span> Memuat history…</td></tr>';
        const hist = await fetchOrderHistory(30);
        if (!hist.length) {
            el.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#475569;padding:16px">Belum ada history</td></tr>';
            return;
        }
        el.innerHTML = hist.map(o => {
            const side  = o.side === 'buy'
                ? '<span style="color:#22c55e">BUY</span>'
                : '<span style="color:#f87171">SELL</span>';
            const state = o.state === 'filled' ? '<span style="color:#22c55e">✓ Filled</span>'
                        : o.state === 'canceled' ? '<span style="color:#64748b">Canceled</span>'
                        : `<span style="color:#fbbf24">${o.state}</span>`;
            const pnl   = parseFloat(o.pnl || 0);
            const pnlEl = pnl !== 0
                ? `<span style="color:${pnl >= 0 ? '#22c55e' : '#f87171'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(4)}</span>`
                : '—';
            const ts = new Date(parseInt(o.cTime)).toLocaleDateString('id-ID');
            return `<tr>
                <td><b>${o.instId}</b></td>
                <td>${side}</td>
                <td>${o.ordType}</td>
                <td>${_fmtNum(o.avgPx, 4)}</td>
                <td>${_fmtNum(o.accFillSz, 4)}</td>
                <td>${pnlEl}</td>
                <td>${state}</td>
                <td style="color:#475569">${ts}</td>
            </tr>`;
        }).join('');
    }

    // ── Place order form submit ───────────────────────────────
    async function submitOrder() {
        const instId  = document.getElementById('okxInstId')?.value.trim().toUpperCase();
        const side    = document.getElementById('okxSide')?.value;
        const ordType = document.getElementById('okxOrdType')?.value;
        const sz      = document.getElementById('okxSz')?.value.trim();
        const px      = document.getElementById('okxPx')?.value.trim();

        if (!instId || !side || !sz) {
            _showToast('⚠️ Isi Pair, Side, dan Size terlebih dahulu', 'warn');
            return;
        }

        const btn = document.getElementById('okxPlaceOrderBtn');
        if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }

        const result = await placeOrder({ instId, side, ordType, sz, px: ordType === 'limit' ? px : undefined });

        if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
        if (result.ok) {
            // Reset form
            ['okxSz','okxPx'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        }
    }

    // ── Auto-fill instId dari DEX Analyzer panel ─────────────
    function setTokenFromScanner(symbol, chain) {
        // Convert token symbol ke OKX instId format: SYMBOL-USDT
        const instId = `${symbol.toUpperCase()}-USDT`;
        const el = document.getElementById('okxInstId');
        if (el) el.value = instId;
        _showToast(`📌 Pair diset ke ${instId} dari scanner`, 'info');
        // Switch ke tab OKX
        switchToOKXTab();
    }

    function switchToOKXTab() {
        const tab = document.querySelector('[data-tab="okx"]');
        if (tab) tab.click();
    }

    // ── Toggle order type field visibility ───────────────────
    function onOrdTypeChange() {
        const ordType = document.getElementById('okxOrdType')?.value;
        const pxRow   = document.getElementById('okxPxRow');
        if (pxRow) pxRow.style.display = ordType === 'limit' ? 'flex' : 'none';
    }

    // ── Init: connect + first load ───────────────────────────
    async function init() {
        const statusEl = document.getElementById('okxProxyStatus');
        if (statusEl) statusEl.innerHTML = `<span class="g-spinner sm"></span> Menghubungkan ke proxy…`;

        _connected = await checkProxy();

        if (!_connected) {
            if (statusEl) statusEl.innerHTML = `<span style="color:#f87171">❌ Proxy offline</span> — jalankan <code>node proxy-server.js</code>`;
            return;
        }

        if (statusEl) statusEl.innerHTML = `<span style="color:#22c55e">🟢 Proxy connected</span>`;

        // Load data
        await Promise.all([fetchBalance(), fetchPendingOrders()]);
        renderBalance();
        renderOrders();

        // Poll setiap 15 detik
        _pollTimer = setInterval(async () => {
            await Promise.all([fetchBalance(), fetchPendingOrders()]);
            renderBalance();
            renderOrders();
        }, 15000);
    }

    // ── Refresh manual ───────────────────────────────────────
    async function refresh() {
        const btn = document.getElementById('okxRefreshBtn');
        if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }
        await Promise.all([fetchBalance(), fetchPendingOrders()]);
        renderBalance();
        renderOrders();
        if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
    }

    return {
        init,
        refresh,
        submitOrder,
        cancelOrder,
        renderHistory,
        onOrdTypeChange,
        setTokenFromScanner,
    };
})();
