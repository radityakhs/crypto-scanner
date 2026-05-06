/**
 * WHALE ACCUMULATION RADAR
 * Deteksi stealth accumulation, absorption at support, vol anomaly
 */
const WhaleAccumulation = (() => {
    const API = 'http://127.0.0.1:3001/api/whale-accumulation';
    let _data = null, _timer = null;

    function injectStyles() {
        if (document.getElementById('wa-styles')) return;
        const s = document.createElement('style');
        s.id = 'wa-styles';
        s.textContent = `
#whaleAccPanel { margin: 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.wa-header { display:flex; align-items:center; gap:12px; padding:14px 18px; background:linear-gradient(135deg,#0a0f1e 0%,#0d2137 100%); border:1px solid #1e3a5f; border-radius:14px 14px 0 0; flex-wrap:wrap; }
.wa-header h2 { margin:0; font-size:16px; color:#f1f5f9; flex:1; }
.wa-badge { font-size:12px; padding:3px 10px; border-radius:20px; font-weight:600; }
.wa-badge.acc  { background:#0c2a4a; color:#38bdf8; border:1px solid #0369a1; }
.wa-badge.hot  { background:#14532d; color:#4ade80; border:1px solid #16a34a; }
.wa-refresh-btn { background:none; border:1px solid #1e3a5f; color:#64748b; border-radius:8px; padding:4px 10px; cursor:pointer; font-size:12px; }
.wa-refresh-btn:hover { border-color:#38bdf8; color:#38bdf8; }
.wa-body { background:#0a0f1e; border:1px solid #1e3a5f; border-top:none; border-radius:0 0 14px 14px; overflow:hidden; }
.wa-alert-bar { display:flex; gap:8px; flex-wrap:wrap; padding:10px 18px; background:#051020; border-bottom:1px solid #1e293b; align-items:center; }
.wa-alert-label { font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase; }
.wa-alert-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; background:#0c2a4a; border:1px solid #0369a1; color:#38bdf8; font-size:12px; font-weight:700; cursor:default; animation: wa-pulse 2s infinite; }
@keyframes wa-pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
.wa-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1px; background:#1e293b; }
.wa-card { background:#0a0f1e; padding:14px 16px; transition:background .15s; cursor:default; }
.wa-card:hover { background:#0d1929; }
.wa-card-top { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.wa-tok-img { width:32px; height:32px; border-radius:50%; object-fit:cover; }
.wa-tok-sym { font-size:15px; font-weight:700; color:#f1f5f9; }
.wa-tok-eco { font-size:11px; color:#64748b; }
.wa-tok-price { margin-left:auto; text-align:right; }
.wa-tok-price .price { font-size:13px; color:#e2e8f0; font-weight:600; }
.wa-tok-price .ch { font-size:11px; }
.wa-score-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.wa-score-label { font-size:11px; color:#64748b; width:70px; flex-shrink:0; }
.wa-score-bar-bg { flex:1; height:6px; background:#1e293b; border-radius:3px; overflow:hidden; }
.wa-score-bar { height:100%; border-radius:3px; background:linear-gradient(90deg,#0369a1,#38bdf8); transition:width .4s; }
.wa-score-val { font-size:11px; color:#38bdf8; font-weight:700; min-width:28px; text-align:right; }
.wa-signals { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }
.wa-sig-chip { font-size:10px; padding:2px 8px; border-radius:20px; font-weight:600; }
.wa-sig-chip.stealth  { background:#0c2a4a; color:#38bdf8; border:1px solid #0369a1; }
.wa-sig-chip.absorb   { background:#14532d; color:#4ade80; border:1px solid #16a34a; }
.wa-sig-chip.volspike { background:#451a03; color:#fb923c; border:1px solid #c2410c; }
.wa-sig-chip.support  { background:#2e1065; color:#c084fc; border:1px solid #7c3aed; }
.wa-type-badge { display:inline-block; font-size:11px; padding:2px 10px; border-radius:20px; font-weight:700; margin-top:6px; }
.wa-type-badge.ACCUMULATING { background:#0c2a4a; color:#38bdf8; border:1px solid #0369a1; }
.wa-type-badge.WATCHING     { background:#1e293b; color:#94a3b8; border:1px solid #334155; }
.wa-empty { padding:40px; text-align:center; color:#475569; font-size:14px; }
.wa-loading { padding:40px; text-align:center; color:#475569; font-size:14px; }
.wa-error   { padding:20px; text-align:center; color:#f87171; font-size:13px; }
.wa-footer  { padding:8px 18px; font-size:11px; color:#334155; text-align:right; border-top:1px solid #1e293b; background:#080d18; }
/* Global alert badge for header */
#whaleAlertBadge { display:none; align-items:center; gap:6px; padding:4px 12px; border-radius:20px; background:#0c2a4a; border:1px solid #0369a1; color:#38bdf8; font-size:12px; font-weight:700; cursor:pointer; animation:wa-pulse 2s infinite; }
#whaleAlertBadge.visible { display:inline-flex; }
        `;
        document.head.appendChild(s);
    }

    const fmtP = n => n == null ? '—' : '$' + (n < 0.01 ? n.toFixed(6) : n < 1 ? n.toFixed(4) : n.toFixed(2));
    const fmtCh = n => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%');
    const chColor = n => n > 0 ? '#4ade80' : n < 0 ? '#f87171' : '#94a3b8';

    function renderCard(t) {
        const scorePct = Math.min(100, (t.score ?? 0) * 10);
        const img = t.image ? `<img src="${t.image}" class="wa-tok-img" onerror="this.style.display='none'">` : `<span style="font-size:28px">🪙</span>`;
        const chips = [
            t.stealthAccumulation ? '<span class="wa-sig-chip stealth">🕵️ Stealth Accum</span>' : '',
            t.absorptionAtSupport ? '<span class="wa-sig-chip absorb">📥 Absorbing</span>' : '',
            t.volumeAnomaly       ? '<span class="wa-sig-chip volspike">🔥 Vol Anomaly</span>' : '',
            t.nearSupport         ? '<span class="wa-sig-chip support">🟣 Near Support</span>' : '',
        ].filter(Boolean).join('');

        return `<div class="wa-card">
            <div class="wa-card-top">
                ${img}
                <div>
                    <div class="wa-tok-sym">${t.symbol}</div>
                    <div class="wa-tok-eco">${t.ecoEmoji || ''} ${t.ecoName || '?'}</div>
                </div>
                <div class="wa-tok-price">
                    <div class="price">${fmtP(t.price)}</div>
                    <div class="ch" style="color:${chColor(t.ch24h)}">${fmtCh(t.ch24h)}</div>
                </div>
            </div>
            <div class="wa-score-row">
                <span class="wa-score-label">Whale Score</span>
                <div class="wa-score-bar-bg"><div class="wa-score-bar" style="width:${scorePct}%"></div></div>
                <span class="wa-score-val">${t.score ?? 0}/10</span>
            </div>
            <div class="wa-score-row">
                <span class="wa-score-label">Vol/MCap</span>
                <div class="wa-score-bar-bg"><div class="wa-score-bar" style="width:${Math.min(100,(t.volMcRatio??0)*200)}%;background:linear-gradient(90deg,#7c3aed,#c084fc)"></div></div>
                <span class="wa-score-val" style="color:#c084fc">${((t.volMcRatio??0)*100).toFixed(1)}%</span>
            </div>
            <div class="wa-signals">${chips}</div>
            <span class="wa-type-badge ${t.type}">${t.type === 'ACCUMULATING' ? '🐋 Accumulating' : '👀 Watching'}</span>
        </div>`;
    }

    function render(data) {
        const el = document.getElementById('whaleAccPanel');
        if (!el) return;
        _data = data;
        const tops = data.topAccumulating || [];
        const accCount = data.accumulatingCount || 0;
        const watchCount = data.watchingCount || 0;

        // Update global alert badge
        const badge = document.getElementById('whaleAlertBadge');
        if (badge) {
            if (accCount > 0) {
                badge.textContent = `🐋 ${accCount} Whale Accum`;
                badge.classList.add('visible');
                badge.onclick = () => document.getElementById('whaleAccPanel')?.scrollIntoView({ behavior: 'smooth' });
            } else {
                badge.classList.remove('visible');
            }
        }

        const alertPills = tops.slice(0, 6).map(t =>
            `<span class="wa-alert-pill">🐋 ${t.symbol} <span style="font-size:10px;opacity:.7">@${t.ecoName||'?'}</span></span>`
        ).join('');

        const cards = tops.length
            ? tops.map(renderCard).join('')
            : `<div class="wa-empty">Tidak ada sinyal akumulasi whale saat ini.<br><span style="font-size:12px">Coba refresh atau tunggu pasar bergerak.</span></div>`;

        el.innerHTML = `
            <div class="wa-header">
                <h2>🐋 Whale Accumulation Radar</h2>
                <span class="wa-badge acc">🐋 ${accCount} Accumulating</span>
                <span class="wa-badge hot">👀 ${watchCount} Watching</span>
                <button class="wa-refresh-btn" onclick="WhaleAccumulation.refresh(true)">🔄 Refresh</button>
                <span style="font-size:11px;color:#334155;margin-left:auto">${data.fetchedAt ? 'Updated ' + new Date(data.fetchedAt).toLocaleTimeString() : ''}${data.cached ? ' · cached' : ''}</span>
            </div>
            <div class="wa-body">
                ${tops.length ? `<div class="wa-alert-bar"><span class="wa-alert-label">🔍 Top Signals:</span>${alertPills}</div>` : ''}
                <div class="wa-grid">${cards}</div>
                <div class="wa-footer">Data from CoinGecko · Score = kombinasi Vol Spike + Price Flat + Near Support · Bukan financial advice</div>
            </div>
        `;
    }

    async function refresh(force = false) {
        const el = document.getElementById('whaleAccPanel');
        if (!el) return;
        if (!_data) el.innerHTML = '<div class="wa-loading">🐋 Scanning whale activity…</div>';
        try {
            const r = await fetch(force ? `${API}?refresh=1` : API);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || 'API error');
            render(d);
        } catch (e) {
            console.warn('WhaleAccumulation:', e);
            if (!_data) el.innerHTML = `<div class="wa-error">⚠️ ${e.message}</div>`;
        }
    }

    function init() {
        injectStyles();
        refresh();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(() => refresh(), 5 * 60_000);
    }

    return { init, refresh };
})();
