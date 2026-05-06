/**
 * SIGNAL ACCURACY TRACKER
 * Win rate per ekosistem, history sinyal LONG
 */
const SignalAccuracy = (() => {
    const API = 'http://127.0.0.1:3001/api/signal-history';
    let _data = null, _timer = null;

    function injectStyles() {
        if (document.getElementById('sa-styles')) return;
        const s = document.createElement('style');
        s.id = 'sa-styles';
        s.textContent = `
#signalAccPanel { margin:16px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
.sa-header { display:flex; align-items:center; gap:12px; padding:14px 18px; background:linear-gradient(135deg,#0f1a0f 0%,#0d2410 100%); border:1px solid #14532d; border-radius:14px 14px 0 0; flex-wrap:wrap; }
.sa-header h2 { margin:0; font-size:16px; color:#f1f5f9; flex:1; }
.sa-stat-box { text-align:center; padding:6px 14px; background:#14532d33; border:1px solid #16a34a; border-radius:10px; }
.sa-stat-box .num { font-size:20px; font-weight:800; color:#4ade80; }
.sa-stat-box .lbl { font-size:10px; color:#86efac; text-transform:uppercase; letter-spacing:.05em; }
.sa-refresh-btn { background:none; border:1px solid #14532d; color:#64748b; border-radius:8px; padding:4px 10px; cursor:pointer; font-size:12px; }
.sa-body { background:#0a120a; border:1px solid #14532d; border-top:none; border-radius:0 0 14px 14px; overflow:hidden; }
.sa-section-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#475569; font-weight:700; padding:12px 18px 6px; }
/* Eco win-rate grid */
.sa-eco-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:1px; background:#1e293b; padding:0; }
.sa-eco-card { background:#0a120a; padding:12px 16px; }
.sa-eco-name { font-size:13px; font-weight:700; color:#e2e8f0; margin-bottom:8px; }
.sa-wr-row { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
.sa-wr-label { font-size:11px; color:#64748b; width:40px; }
.sa-wr-bar-bg { flex:1; height:6px; background:#1e293b; border-radius:3px; overflow:hidden; }
.sa-wr-bar { height:100%; border-radius:3px; transition:width .4s; }
.sa-wr-val { font-size:11px; font-weight:700; min-width:36px; text-align:right; }
/* Signal history table */
.sa-table { width:100%; border-collapse:collapse; font-size:12px; }
.sa-table th { text-align:left; padding:6px 18px; color:#475569; font-size:11px; font-weight:600; border-bottom:1px solid #1e293b; white-space:nowrap; }
.sa-table th:not(:first-child) { text-align:right; }
.sa-table td { padding:6px 18px; border-bottom:1px solid #0a120a; vertical-align:middle; }
.sa-table td:not(:first-child) { text-align:right; }
.sa-table tr:last-child td { border-bottom:none; }
.sa-table tr:hover td { background:#0d1a0d; }
.sa-outcome { display:inline-block; font-size:11px; padding:1px 8px; border-radius:20px; font-weight:700; }
.sa-outcome.win  { background:#14532d; color:#4ade80; }
.sa-outcome.loss { background:#450a0a; color:#f87171; }
.sa-outcome.pending { background:#1e293b; color:#64748b; }
.sa-empty { padding:30px; text-align:center; color:#475569; font-size:13px; }
.sa-loading { padding:30px; text-align:center; color:#475569; font-size:14px; }
.sa-note { padding:8px 18px; font-size:11px; color:#334155; border-top:1px solid #1e293b; background:#080e08; }
        `;
        document.head.appendChild(s);
    }

    function winColor(wr) {
        return wr >= 65 ? '#22c55e' : wr >= 50 ? '#f59e0b' : '#ef4444';
    }

    function renderEcoGrid(byEco) {
        const entries = Object.entries(byEco).sort((a, b) => b[1].winRate - a[1].winRate);
        if (!entries.length) return '<div class="sa-empty">Belum ada data — sinyal LONG akan direkam otomatis.</div>';
        return `<div class="sa-eco-grid">${entries.map(([sym, eco]) => {
            const wr = eco.winRate ?? 0;
            const color = winColor(wr);
            const avgColor = eco.avgReturn >= 0 ? '#4ade80' : '#f87171';
            return `<div class="sa-eco-card">
                <div class="sa-eco-name">${sym}</div>
                <div class="sa-wr-row">
                    <span class="sa-wr-label">Win%</span>
                    <div class="sa-wr-bar-bg"><div class="sa-wr-bar" style="width:${wr}%;background:${color}"></div></div>
                    <span class="sa-wr-val" style="color:${color}">${wr}%</span>
                </div>
                <div class="sa-wr-row">
                    <span class="sa-wr-label">Avg Ret</span>
                    <div class="sa-wr-bar-bg"><div class="sa-wr-bar" style="width:${Math.min(100,Math.abs(eco.avgReturn)*5)}%;background:${avgColor}"></div></div>
                    <span class="sa-wr-val" style="color:${avgColor}">${eco.avgReturn > 0 ? '+' : ''}${eco.avgReturn}%</span>
                </div>
                <div style="font-size:10px;color:#475569;margin-top:4px">${eco.total} sinyal direkam</div>
            </div>`;
        }).join('')}</div>`;
    }

    function renderHistory(signals) {
        if (!signals.length) return '<div class="sa-empty">Belum ada sinyal terekam. Sinyal LONG akan otomatis disimpan.</div>';
        const rows = signals.slice(0, 30).map(s => {
            const date = new Date(s.ts).toLocaleDateString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
            const out4h = s.outcome4h !== null
                ? `<span class="sa-outcome ${s.outcome4h > 0 ? 'win' : 'loss'}">${s.outcome4h > 0 ? '+' : ''}${s.outcome4h}%</span>`
                : `<span class="sa-outcome pending">⏳</span>`;
            const out24h = s.outcome24h !== null
                ? `<span class="sa-outcome ${s.outcome24h > 0 ? 'win' : 'loss'}">${s.outcome24h > 0 ? '+' : ''}${s.outcome24h}%</span>`
                : `<span class="sa-outcome pending">⏳</span>`;
            return `<tr>
                <td><strong style="color:#e2e8f0">${s.symbol}</strong> <span style="color:#475569;font-size:10px">@${s.ecoSymbol||'?'}</span></td>
                <td style="color:#64748b">${date}</td>
                <td style="color:#94a3b8">$${s.price < 0.01 ? s.price?.toFixed(6) : s.price?.toFixed(4)}</td>
                <td>${out4h}</td>
                <td>${out24h}</td>
            </tr>`;
        }).join('');
        return `<table class="sa-table">
            <thead><tr><th>Token</th><th>Waktu</th><th>Entry Price</th><th>+4h</th><th>+24h</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
    }

    function render(data) {
        const el = document.getElementById('signalAccPanel');
        if (!el) return;
        _data = data;
        const stats = data.stats || {};
        const byEco = data.byEco || {};
        const signals = data.signals || [];

        const wr4h  = stats.winRate4h  !== null ? `${stats.winRate4h}%` : 'N/A';
        const wr24h = stats.winRate24h !== null ? `${stats.winRate24h}%` : 'N/A';

        el.innerHTML = `
            <div class="sa-header">
                <h2>📊 Signal Accuracy Tracker</h2>
                <div class="sa-stat-box"><div class="num">${wr4h}</div><div class="lbl">Win Rate 4h</div></div>
                <div class="sa-stat-box"><div class="num">${wr24h}</div><div class="lbl">Win Rate 24h</div></div>
                <div class="sa-stat-box"><div class="num">${stats.total || 0}</div><div class="lbl">Total Sinyal</div></div>
                <button class="sa-refresh-btn" onclick="SignalAccuracy.refresh()">🔄</button>
            </div>
            <div class="sa-body">
                <div class="sa-section-label">Win Rate per Ekosistem (berdasarkan 24h outcome)</div>
                ${renderEcoGrid(byEco)}
                <div class="sa-section-label" style="margin-top:8px">Riwayat Sinyal LONG</div>
                ${renderHistory(signals)}
                <div class="sa-note">⚡ Sinyal LONG otomatis dicatat setiap kali ecosystem pump terdeteksi · Outcome dicek setelah 4h dan 24h · Bukan financial advice</div>
            </div>
        `;
    }

    async function refresh() {
        const el = document.getElementById('signalAccPanel');
        if (!el) return;
        if (!_data) el.innerHTML = '<div class="sa-loading">📊 Loading signal history…</div>';
        try {
            const r = await fetch(API);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || 'API error');
            render(d);
        } catch (e) {
            console.warn('SignalAccuracy:', e);
            if (!_data) el.innerHTML = `<div style="padding:20px;color:#f87171">⚠️ ${e.message}</div>`;
        }
    }

    function init() {
        injectStyles();
        refresh();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(refresh, 10 * 60_000);
    }

    return { init, refresh };
})();
