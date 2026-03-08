// ══════════════════════════════════════════════════════════════════════════════
//  Portfolio Tracker — Real-time P&L  (Enhanced v2)
//  Holdings disimpan di localStorage. Harga dari CoinGecko + static stock data.
//  Fitur: live P&L, allocation chart, CSV export, countdown timer,
//         flash animasi, target price & stop loss, sparkline mini-chart
// ══════════════════════════════════════════════════════════════════════════════

const ptSimple = (() => {
    'use strict';

    const LS_KEY       = 'pt_holdings_v2';
    const REFRESH_SEC  = 120; // 2 menit

    // ── State ─────────────────────────────────────────────────────────────────
    let _holdings      = [];   // { id, type, symbol, name, buyPrice, qty, buyDate, currency, targetPrice, stopLoss, cgId }
    let _livePrices    = {};   // symbol -> { price, change24h, currency }
    let _prevPrices    = {};   // untuk deteksi flash
    let _refreshTimer  = null;
    let _countdownTimer = null;
    let _countdownSec  = REFRESH_SEC;
    let _allocChart    = null; // Chart.js instance

    // ── Persistence ──────────────────────────────────────────────────────────
    function _save() {
        localStorage.setItem(LS_KEY, JSON.stringify(_holdings));
    }
    function _load() {
        try {
            // migrate from old key
            const old = localStorage.getItem('pt_holdings_v1');
            const cur = localStorage.getItem(LS_KEY);
            if (!cur && old) {
                _holdings = JSON.parse(old);
                _save();
            } else {
                _holdings = JSON.parse(cur || '[]');
            }
        } catch {
            _holdings = [];
        }
    }

    // ── Live price fetch ──────────────────────────────────────────────────────
    async function _fetchCryptoPrices() {
        const cryptoHoldings = _holdings.filter(h => h.type === 'crypto');
        if (!cryptoHoldings.length) return;

        // Collect CoinGecko IDs (stored when user added holding)
        const ids = [...new Set(cryptoHoldings.map(h => h.cgId).filter(Boolean))].join(',');
        if (!ids) return;

        try {
            const r = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
            );
            const d = await r.json();
            for (const [id, v] of Object.entries(d)) {
                const h = cryptoHoldings.find(x => x.cgId === id);
                if (h) {
                    _livePrices[h.symbol.toUpperCase()] = {
                        price:     v.usd,
                        change24h: v.usd_24h_change,
                        currency:  'USD',
                    };
                }
            }
        } catch(e) { console.warn('Portfolio crypto price fetch failed', e); }
    }

    function _loadStockPrices() {
        // Pull from app.js IDX_STOCKS_DATA + US_STOCKS_DATA if available
        const sources = [
            window.IDX_STOCKS_DATA,
            window.US_STOCKS_DATA,
        ].filter(Boolean).flat();

        for (const s of sources) {
            if (s?.symbol && s?.price != null) {
                _livePrices[s.symbol.toUpperCase()] = {
                    price:     s.price,
                    change24h: s.change,
                    currency:  s.currency || 'IDR',
                };
            }
        }
    }

    async function _refreshPrices() {
        _prevPrices = { ..._livePrices };
        _loadStockPrices();
        await _fetchCryptoPrices();
        _renderPortfolio();
        _resetCountdown();
    }

    // ── Countdown timer ───────────────────────────────────────────────────────
    function _resetCountdown() {
        _countdownSec = REFRESH_SEC;
        _updateCountdownUI();
    }
    function _startCountdown() {
        if (_countdownTimer) clearInterval(_countdownTimer);
        _countdownTimer = setInterval(() => {
            _countdownSec = Math.max(0, _countdownSec - 1);
            _updateCountdownUI();
        }, 1000);
    }
    function _updateCountdownUI() {
        const el = document.getElementById('ptCountdown');
        if (el) el.textContent = `Refresh dalam ${_countdownSec}d`;
    }

    // ── Calculations ──────────────────────────────────────────────────────────
    function _calcHolding(h) {
        const live = _livePrices[h.symbol.toUpperCase()];
        const currentPrice = live?.price ?? null;
        const cost         = h.buyPrice * h.qty;
        const currentValue = currentPrice != null ? currentPrice * h.qty : null;
        const pnl          = currentValue != null ? currentValue - cost : null;
        const pnlPct       = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;
        const change24h    = live?.change24h ?? null;
        const currency     = h.currency || live?.currency || 'USD';

        // Flash direction vs prev price
        const prevLive = _prevPrices[h.symbol.toUpperCase()];
        let flash = '';
        if (prevLive && currentPrice != null && prevLive.price != null) {
            if (currentPrice > prevLive.price) flash = 'up';
            else if (currentPrice < prevLive.price) flash = 'down';
        }

        // Target / SL alerts
        let targetHit = false, slHit = false;
        if (currentPrice != null) {
            if (h.targetPrice && currentPrice >= h.targetPrice) targetHit = true;
            if (h.stopLoss    && currentPrice <= h.stopLoss)    slHit = true;
        }

        return { ...h, currentPrice, cost, currentValue, pnl, pnlPct, change24h, currency, flash, targetHit, slHit };
    }

    function _calcSummary(calced) {
        const withPrice = calced.filter(h => h.currentValue != null);

        // Separate by currency for totals
        const usdHoldings = withPrice.filter(h => h.currency === 'USD');
        const idrHoldings = withPrice.filter(h => h.currency === 'IDR');

        const totalUSD  = usdHoldings.reduce((s, h) => s + h.currentValue, 0);
        const totalIDR  = idrHoldings.reduce((s, h) => s + h.currentValue, 0);
        const costUSD   = usdHoldings.reduce((s, h) => s + h.cost, 0);
        const costIDR   = idrHoldings.reduce((s, h) => s + h.cost, 0);
        const pnlUSD    = totalUSD - costUSD;
        const pnlIDR    = totalIDR - costIDR;

        const sorted    = [...calced].filter(h => h.pnlPct != null).sort((a, b) => b.pnlPct - a.pnlPct);
        const best      = sorted[0] || null;
        const worst     = sorted[sorted.length - 1] || null;

        // Total portfolio value across all currencies (normalize to USD for rough total)
        const totalAll = withPrice.reduce((s, h) => s + (h.currency === 'IDR' ? h.currentValue / 16000 : h.currentValue), 0);
        const costAll  = calced.reduce((s, h) => s + (h.currency === 'IDR' ? h.cost / 16000 : h.cost), 0);
        const pnlAll   = totalAll - costAll;
        const pnlPctAll = costAll > 0 ? (pnlAll / costAll) * 100 : 0;

        return { totalUSD, totalIDR, costUSD, costIDR, pnlUSD, pnlIDR, best, worst, totalAll, costAll, pnlAll, pnlPctAll };
    }

    // ── Format helpers ────────────────────────────────────────────────────────
    function fmtMoney(v, currency) {
        if (v == null) return '—';
        if (currency === 'IDR') return 'Rp ' + Number(v).toLocaleString('id-ID', { maximumFractionDigits: 0 });
        if (v >= 1000) return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
        if (v >= 1)    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
        return '$' + v.toFixed(6);
    }
    function fmtPct(v) {
        if (v == null) return '—';
        return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
    }
    function pnlColor(v) {
        if (v == null) return '#94a3b8';
        return v >= 0 ? '#4ade80' : '#f87171';
    }
    function pnlIcon(v) {
        if (v == null) return '';
        return v >= 0 ? '▲' : '▼';
    }

    // ── Render ────────────────────────────────────────────────────────────────
    function _renderPortfolio() {
        const el = document.getElementById('ptContainer');
        if (!el) return;

        if (!_holdings.length) {
            el.innerHTML = `
            <div class="pt-empty">
                <div class="pt-empty-icon">📂</div>
                <div class="pt-empty-title">Portfolio kosong</div>
                <div class="pt-empty-sub">Tambahkan holdings di form di atas untuk mulai tracking P&L real-time.</div>
            </div>`;
            _destroyAllocChart();
            return;
        }

        const calced  = _holdings.map(_calcHolding);
        const summary = _calcSummary(calced);
        const now     = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        // Sort: by value descending
        const sorted = [...calced].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));

        // Compute total value for allocation %
        const grandVal = sorted.reduce((s, h) => s + (h.currentValue || 0), 0);

        el.innerHTML = `
        <!-- ── Summary Cards ───────────────────────────────────────────── -->
        <div class="pt-summary-grid pt-summary-grid-v2">

            <div class="pt-summary-card pt-summary-main">
                <div class="pt-summary-label">💼 Total Portfolio</div>
                ${summary.totalUSD > 0 ? `<div class="pt-summary-val">${fmtMoney(summary.totalUSD, 'USD')}</div>
                <div class="pt-summary-sub" style="color:${pnlColor(summary.pnlUSD)}">
                    ${pnlIcon(summary.pnlUSD)} ${fmtMoney(summary.pnlUSD, 'USD')}
                    <span class="pt-pct-badge-sm" style="background:${pnlColor(summary.pnlUSD)}22;color:${pnlColor(summary.pnlUSD)}">${fmtPct(summary.costUSD > 0 ? (summary.pnlUSD/summary.costUSD)*100 : null)}</span>
                </div>` : ''}
                ${summary.totalIDR > 0 ? `<div class="pt-summary-val pt-summary-val-sm">${fmtMoney(summary.totalIDR, 'IDR')}</div>
                <div class="pt-summary-sub" style="color:${pnlColor(summary.pnlIDR)}">
                    ${pnlIcon(summary.pnlIDR)} ${fmtMoney(summary.pnlIDR, 'IDR')}
                    <span class="pt-pct-badge-sm" style="background:${pnlColor(summary.pnlIDR)}22;color:${pnlColor(summary.pnlIDR)}">${fmtPct(summary.costIDR > 0 ? (summary.pnlIDR/summary.costIDR)*100 : null)}</span>
                </div>` : ''}
            </div>

            <div class="pt-summary-card pt-summary-pnl">
                <div class="pt-summary-label">📈 Unrealized P&L</div>
                <div class="pt-summary-val" style="color:${pnlColor(summary.pnlAll)}">${summary.pnlAll >= 0 ? '+' : ''}${summary.pnlAll.toFixed(0) !== '0' ? fmtMoney(Math.abs(summary.pnlAll),'USD') : '$0'}</div>
                <div class="pt-summary-sub">
                    <span class="pt-pct-badge-sm ${summary.pnlPctAll >= 0 ? 'pt-badge-green' : 'pt-badge-red'}">
                        ${summary.pnlPctAll >= 0 ? '▲' : '▼'} ${Math.abs(summary.pnlPctAll).toFixed(2)}%
                    </span>
                    <span style="color:#64748b;font-size:0.7rem"> total return</span>
                </div>
            </div>

            ${summary.best ? `
            <div class="pt-summary-card pt-summary-card--best">
                <div class="pt-summary-label">🏆 Best Performer</div>
                <div class="pt-summary-val pt-summary-symbol">${summary.best.symbol}</div>
                <div class="pt-summary-sub">
                    <span class="pt-pct-badge-sm pt-badge-green">▲ ${Math.abs(summary.best.pnlPct).toFixed(2)}%</span>
                    <span style="color:#64748b;font-size:0.7rem"> ${fmtMoney(summary.best.pnl, summary.best.currency)}</span>
                </div>
            </div>` : ''}

            ${summary.worst && summary.worst !== summary.best ? `
            <div class="pt-summary-card pt-summary-card--worst">
                <div class="pt-summary-label">📉 Worst Performer</div>
                <div class="pt-summary-val pt-summary-symbol">${summary.worst.symbol}</div>
                <div class="pt-summary-sub">
                    <span class="pt-pct-badge-sm pt-badge-red">▼ ${Math.abs(summary.worst.pnlPct).toFixed(2)}%</span>
                    <span style="color:#64748b;font-size:0.7rem"> ${fmtMoney(summary.worst.pnl, summary.worst.currency)}</span>
                </div>
            </div>` : ''}

            <div class="pt-summary-card pt-summary-holdings">
                <div class="pt-summary-label">🏗️ Holdings</div>
                <div class="pt-summary-val">${_holdings.length}</div>
                <div class="pt-summary-sub" style="color:#64748b">${calced.filter(h=>h.pnl>0).length} profit · ${calced.filter(h=>h.pnl<0).length} rugi</div>
            </div>

        </div>

        <!-- ── Allocation Chart + Bar ─────────────────────────────────── -->
        <div class="pt-alloc-section">
            <div class="pt-alloc-chart-wrap">
                <canvas id="ptAllocChart" width="140" height="140"></canvas>
                <div class="pt-alloc-center-label">
                    <div style="font-size:0.65rem;color:#64748b">Alokasi</div>
                    <div style="font-size:0.85rem;font-weight:600">${_holdings.length} aset</div>
                </div>
            </div>
            <div class="pt-alloc-bars">
                ${sorted.slice(0,8).map(h => {
                    const pct = grandVal > 0 && h.currentValue ? (h.currentValue / grandVal * 100) : 0;
                    const color = h.pnl >= 0 ? '#4ade80' : '#f87171';
                    return `<div class="pt-alloc-bar-row">
                        <span class="pt-alloc-symbol">${h.symbol}</span>
                        <div class="pt-alloc-bar-track">
                            <div class="pt-alloc-bar-fill" style="width:${Math.max(pct,1).toFixed(1)}%;background:${color}22;border-right:2px solid ${color}"></div>
                        </div>
                        <span class="pt-alloc-pct">${pct.toFixed(1)}%</span>
                        <span class="pt-alloc-pnl" style="color:${color}">${h.pnlPct != null ? fmtPct(h.pnlPct) : '—'}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>

        <!-- ── Holdings Table ─────────────────────────────────────────── -->
        <div class="pt-table-wrap">
            <table class="pt-table">
                <thead>
                    <tr>
                        <th>Aset</th>
                        <th>Tipe</th>
                        <th>Qty</th>
                        <th>Harga Beli</th>
                        <th>Harga Kini</th>
                        <th>Nilai Beli</th>
                        <th>Nilai Kini</th>
                        <th>P&L</th>
                        <th>% P&L</th>
                        <th>24h</th>
                        <th>Alokasi</th>
                        <th>Target / SL</th>
                        <th>Tanggal</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                ${sorted.map((h, i) => {
                    const alloc = grandVal > 0 && h.currentValue ? (h.currentValue / grandVal * 100).toFixed(1) : '—';
                    const flashClass = h.flash === 'up' ? ' pt-flash-up' : h.flash === 'down' ? ' pt-flash-down' : '';
                    const targetHitClass = h.targetHit ? ' pt-row-target' : h.slHit ? ' pt-row-sl' : '';
                    const targetStr = h.targetPrice ? `🎯 ${fmtMoney(h.targetPrice, h.currency)}` : '';
                    const slStr    = h.stopLoss    ? `🛑 ${fmtMoney(h.stopLoss, h.currency)}`    : '';
                    return `
                    <tr class="pt-row${flashClass}${targetHitClass}" data-sym="${h.symbol}">
                        <td class="pt-cell-asset">
                            <div class="pt-symbol">${h.symbol.toUpperCase()}</div>
                            <div class="pt-name">${h.name || ''}</div>
                            ${h.targetHit ? '<span class="pt-hit-badge pt-hit-target">🎯 TARGET!</span>' : ''}
                            ${h.slHit     ? '<span class="pt-hit-badge pt-hit-sl">🛑 STOP HIT!</span>' : ''}
                        </td>
                        <td><span class="pt-type-badge pt-type--${h.type}">${h.type === 'crypto' ? '₿ Crypto' : h.type === 'idx' ? '🇮🇩 IDX' : '🇺🇸 US'}</span></td>
                        <td class="pt-num">${Number(h.qty).toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                        <td class="pt-num">${fmtMoney(h.buyPrice, h.currency)}</td>
                        <td class="pt-num${flashClass}">${h.currentPrice != null ? fmtMoney(h.currentPrice, h.currency) : '<span class="pt-na">—</span>'}</td>
                        <td class="pt-num">${fmtMoney(h.cost, h.currency)}</td>
                        <td class="pt-num">${h.currentValue != null ? fmtMoney(h.currentValue, h.currency) : '<span class="pt-na">—</span>'}</td>
                        <td class="pt-num" style="color:${pnlColor(h.pnl)}">${h.pnl != null ? fmtMoney(h.pnl, h.currency) : '—'}</td>
                        <td class="pt-num pt-pnl-pct" style="color:${pnlColor(h.pnlPct)}">
                            ${h.pnlPct != null ? `<span class="pt-pct-badge" style="background:${pnlColor(h.pnlPct)}22;color:${pnlColor(h.pnlPct)}">${pnlIcon(h.pnlPct)} ${Math.abs(h.pnlPct).toFixed(2)}%</span>` : '—'}
                        </td>
                        <td class="pt-num" style="color:${pnlColor(h.change24h)}">${h.change24h != null ? fmtPct(h.change24h) : '—'}</td>
                        <td class="pt-num">
                            ${alloc !== '—' ? `<div class="pt-alloc-mini-track"><div style="width:${Math.min(parseFloat(alloc),100)}%;background:#6366f133;height:4px;border-radius:2px;position:relative"><div style="width:${Math.min(parseFloat(alloc),100)}%;background:#6366f1;height:4px;border-radius:2px"></div></div><span style="font-size:0.7rem;color:#94a3b8">${alloc}%</span>` : '—'}
                        </td>
                        <td class="pt-num" style="font-size:0.72rem;color:#94a3b8">
                            ${targetStr ? `<div>${targetStr}</div>` : ''}
                            ${slStr     ? `<div>${slStr}</div>`     : ''}
                            ${!targetStr && !slStr ? '—' : ''}
                        </td>
                        <td class="pt-date">${h.buyDate || '—'}</td>
                        <td><button class="pt-del-btn" onclick="ptSimple.deleteHolding(${_holdings.indexOf(h)})" title="Hapus">✕</button></td>
                    </tr>`;
                }).join('')}
                </tbody>
            </table>
        </div>

        <div class="pt-footer">
            <span>🕐 Update: ${now}</span>
            <span id="ptCountdown" class="pt-countdown">Refresh dalam ${_countdownSec}d</span>
            <button class="pt-btn pt-btn--ghost" onclick="ptSimple.refreshPrices()">↻ Refresh Harga</button>
            <button class="pt-btn pt-btn--ghost" onclick="ptSimple.exportCSV()">📤 Export CSV</button>
            <button class="pt-btn pt-btn--danger" onclick="ptSimple.clearAll()">🗑️ Hapus Semua</button>
        </div>`;

        // Draw allocation donut chart
        _drawAllocChart(sorted, grandVal);
    }

    // ── Allocation Donut Chart ────────────────────────────────────────────────
    function _destroyAllocChart() {
        if (_allocChart) { _allocChart.destroy(); _allocChart = null; }
    }
    function _drawAllocChart(sorted, grandVal) {
        const canvas = document.getElementById('ptAllocChart');
        if (!canvas || typeof Chart === 'undefined') return;
        _destroyAllocChart();

        const top = sorted.slice(0, 7);
        const otherVal = sorted.slice(7).reduce((s, h) => s + (h.currentValue || 0), 0);

        const labels = top.map(h => h.symbol);
        const data   = top.map(h => h.currentValue || 0);
        const COLORS = ['#6366f1','#4ade80','#f59e0b','#38bdf8','#f87171','#a78bfa','#fb923c','#94a3b8'];

        if (otherVal > 0) { labels.push('Other'); data.push(otherVal); }

        _allocChart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: COLORS.slice(0, labels.length),
                    borderColor: '#0b1220',
                    borderWidth: 2,
                }]
            },
            options: {
                cutout: '70%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const pct = grandVal > 0 ? (ctx.parsed / grandVal * 100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${pct}%`;
                            }
                        }
                    }
                },
                animation: { duration: 400 },
            }
        });
    }

    // ── CSV Export ────────────────────────────────────────────────────────────
    function exportCSV() {
        if (!_holdings.length) return alert('Tidak ada holdings untuk diexport.');
        const calced = _holdings.map(_calcHolding);
        const header = ['Symbol','Tipe','Nama','Qty','Harga Beli','Harga Kini','Nilai Beli','Nilai Kini','P&L','%P&L','24h%','Currency','Target','Stop Loss','Tanggal Beli'];
        const rows   = calced.map(h => [
            h.symbol, h.type, h.name, h.qty,
            h.buyPrice, h.currentPrice ?? '',
            h.cost, h.currentValue ?? '',
            h.pnl != null ? h.pnl.toFixed(2) : '',
            h.pnlPct != null ? h.pnlPct.toFixed(2) + '%' : '',
            h.change24h != null ? h.change24h.toFixed(2) + '%' : '',
            h.currency,
            h.targetPrice || '',
            h.stopLoss || '',
            h.buyDate || '',
        ]);
        const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `portfolio_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── Render Add Form ───────────────────────────────────────────────────────
    function _renderForm() {
        const el = document.getElementById('ptFormContainer');
        if (!el) return;
        el.innerHTML = `
        <div class="pt-form-card">
            <div class="pt-form-title">➕ Tambah Holding</div>
            <div class="pt-form-grid">
                <div class="pt-form-group">
                    <label>Tipe Aset</label>
                    <select id="ptType" onchange="ptSimple.onTypeChange()">
                        <option value="crypto">₿ Crypto</option>
                        <option value="idx">🇮🇩 IDX Saham</option>
                        <option value="us">🇺🇸 US Saham</option>
                    </select>
                </div>
                <div class="pt-form-group">
                    <label>Symbol / Kode</label>
                    <input id="ptSymbol" type="text" placeholder="BTC / BBCA / AAPL" list="ptSymbolList" oninput="ptSimple.onSymbolInput()" autocomplete="off">
                    <datalist id="ptSymbolList"></datalist>
                </div>
                <div class="pt-form-group">
                    <label>Nama (opsional)</label>
                    <input id="ptName" type="text" placeholder="Bitcoin">
                </div>
                <div class="pt-form-group" id="ptCgIdGroup">
                    <label>CoinGecko ID <span style="color:#64748b;font-size:0.7rem">(untuk harga live)</span></label>
                    <input id="ptCgId" type="text" placeholder="bitcoin / ethereum / solana">
                </div>
                <div class="pt-form-group">
                    <label>Harga Beli</label>
                    <input id="ptBuyPrice" type="number" placeholder="0.00" min="0" step="any">
                </div>
                <div class="pt-form-group">
                    <label>Jumlah (Qty)</label>
                    <input id="ptQty" type="number" placeholder="0.00" min="0" step="any">
                </div>
                <div class="pt-form-group">
                    <label>🎯 Target Price <span style="color:#4ade80;font-size:0.68rem">(opsional)</span></label>
                    <input id="ptTargetPrice" type="number" placeholder="Harga target profit" min="0" step="any">
                </div>
                <div class="pt-form-group">
                    <label>🛑 Stop Loss <span style="color:#f87171;font-size:0.68rem">(opsional)</span></label>
                    <input id="ptStopLoss" type="number" placeholder="Harga stop loss" min="0" step="any">
                </div>
                <div class="pt-form-group">
                    <label>Tanggal Beli</label>
                    <input id="ptBuyDate" type="date" value="${new Date().toISOString().split('T')[0]}">
                </div>
            </div>
            <div class="pt-form-actions">
                <div id="ptFormError" class="pt-form-error"></div>
                <button class="pt-btn pt-btn--primary" onclick="ptSimple.addHolding()">➕ Tambah ke Portfolio</button>
            </div>
        </div>`;
    }

    // ── Autocomplete helpers ──────────────────────────────────────────────────
    const CRYPTO_SUGGESTIONS = [
        { symbol: 'BTC', name: 'Bitcoin',  cgId: 'bitcoin' },
        { symbol: 'ETH', name: 'Ethereum', cgId: 'ethereum' },
        { symbol: 'SOL', name: 'Solana',   cgId: 'solana' },
        { symbol: 'BNB', name: 'BNB',      cgId: 'binancecoin' },
        { symbol: 'XRP', name: 'XRP',      cgId: 'ripple' },
        { symbol: 'ADA', name: 'Cardano',  cgId: 'cardano' },
        { symbol: 'DOGE',name: 'Dogecoin', cgId: 'dogecoin' },
        { symbol: 'AVAX',name: 'Avalanche',cgId: 'avalanche-2' },
        { symbol: 'DOT', name: 'Polkadot', cgId: 'polkadot' },
        { symbol: 'LINK',name: 'Chainlink',cgId: 'chainlink' },
        { symbol: 'UNI', name: 'Uniswap',  cgId: 'uniswap' },
        { symbol: 'MATIC',name:'Polygon',  cgId: 'matic-network' },
        { symbol: 'LTC', name: 'Litecoin', cgId: 'litecoin' },
        { symbol: 'ATOM',name: 'Cosmos',   cgId: 'cosmos' },
        { symbol: 'OP',  name: 'Optimism', cgId: 'optimism' },
        { symbol: 'ARB', name: 'Arbitrum', cgId: 'arbitrum' },
        { symbol: 'SUI', name: 'Sui',      cgId: 'sui' },
        { symbol: 'APT', name: 'Aptos',    cgId: 'aptos' },
        { symbol: 'INJ', name: 'Injective',cgId: 'injective-protocol' },
        { symbol: 'TIA', name: 'Celestia', cgId: 'celestia' },
    ];

    function onTypeChange() {
        const type     = document.getElementById('ptType')?.value;
        const cgGroup  = document.getElementById('ptCgIdGroup');
        if (cgGroup) cgGroup.style.display = type === 'crypto' ? '' : 'none';
        _updateDatalist();
    }

    function onSymbolInput() {
        const type   = document.getElementById('ptType')?.value;
        const sym    = document.getElementById('ptSymbol')?.value?.toUpperCase();

        if (type === 'crypto') {
            const match = CRYPTO_SUGGESTIONS.find(c => c.symbol === sym);
            if (match) {
                const nameEl = document.getElementById('ptName');
                const cgEl   = document.getElementById('ptCgId');
                if (nameEl && !nameEl.value) nameEl.value = match.name;
                if (cgEl  && !cgEl.value)   cgEl.value   = match.cgId;
            }
        } else {
            // For stocks, prefill name from IDX/US data
            const sources = [window.IDX_STOCKS_DATA, window.US_STOCKS_DATA].filter(Boolean).flat();
            const match   = sources.find(s => s.symbol?.toUpperCase() === sym);
            if (match) {
                const nameEl = document.getElementById('ptName');
                if (nameEl && !nameEl.value) nameEl.value = match.name;
            }
        }
    }

    function _updateDatalist() {
        const type = document.getElementById('ptType')?.value;
        const dl   = document.getElementById('ptSymbolList');
        if (!dl) return;

        let options = [];
        if (type === 'crypto') {
            options = CRYPTO_SUGGESTIONS.map(c => `<option value="${c.symbol}">${c.name}</option>`);
        } else {
            const src = type === 'idx' ? window.IDX_STOCKS_DATA : window.US_STOCKS_DATA;
            if (src) options = src.map(s => `<option value="${s.symbol}">${s.name}</option>`);
        }
        dl.innerHTML = options.join('');
    }

    // ── Add / Delete / Clear ──────────────────────────────────────────────────
    function addHolding() {
        const type        = document.getElementById('ptType')?.value;
        const symbol      = document.getElementById('ptSymbol')?.value?.trim().toUpperCase();
        const name        = document.getElementById('ptName')?.value?.trim();
        const cgId        = document.getElementById('ptCgId')?.value?.trim().toLowerCase();
        const buyPrice    = parseFloat(document.getElementById('ptBuyPrice')?.value);
        const qty         = parseFloat(document.getElementById('ptQty')?.value);
        const buyDate     = document.getElementById('ptBuyDate')?.value;
        const targetPrice = parseFloat(document.getElementById('ptTargetPrice')?.value) || null;
        const stopLoss    = parseFloat(document.getElementById('ptStopLoss')?.value)    || null;
        const errEl       = document.getElementById('ptFormError');

        const setErr = (msg) => { if (errEl) errEl.textContent = msg; };

        if (!symbol) return setErr('⚠️ Masukkan symbol aset.');
        if (!buyPrice || buyPrice <= 0) return setErr('⚠️ Masukkan harga beli yang valid.');
        if (!qty || qty <= 0)           return setErr('⚠️ Masukkan jumlah (qty) yang valid.');

        // Determine currency
        let currency = 'USD';
        if (type === 'idx') {
            const src = window.IDX_STOCKS_DATA;
            const match = src?.find(s => s.symbol?.toUpperCase() === symbol);
            currency = match?.currency || 'IDR';
        }

        setErr('');

        const holding = {
            id:       Date.now(),
            type,
            symbol,
            name:     name || symbol,
            cgId:     type === 'crypto' ? (cgId || symbol.toLowerCase()) : null,
            buyPrice,
            qty,
            buyDate,
            currency,
            targetPrice,
            stopLoss,
        };

        _holdings.push(holding);
        _save();

        // Clear form
        ['ptSymbol','ptName','ptCgId','ptBuyPrice','ptQty','ptTargetPrice','ptStopLoss'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        _refreshPrices();
    }

    function deleteHolding(index) {
        if (!confirm('Hapus holding ini?')) return;
        _holdings.splice(index, 1);
        _save();
        _renderPortfolio();
    }

    function clearAll() {
        if (!confirm('Hapus SEMUA holdings?')) return;
        _holdings = [];
        _save();
        _renderPortfolio();
    }

    async function refreshPrices() {
        await _refreshPrices();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        _load();
        _renderForm();
        _refreshPrices();
        // Auto-refresh prices every 2 minutes
        _refreshTimer = setInterval(_refreshPrices, 2 * 60 * 1000);
        // Countdown timer (visual)
        _startCountdown();
        // After DOM ready, show/hide CG ID field
        setTimeout(onTypeChange, 100);
        console.log('✅ Portfolio Tracker v2 initialized');
    }

    return {
        init,
        addHolding,
        deleteHolding,
        clearAll,
        refreshPrices,
        exportCSV,
        onTypeChange,
        onSymbolInput,
    };
})();
