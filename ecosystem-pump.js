/**
 * ECOSYSTEM MOMENTUM DETECTOR v2
 * LONG / WAIT / AVOID signals with lag score, vol spike, relative strength
 */
const EcosystemPump = (() => {
    const API = 'http://127.0.0.1:3001/api/ecosystem-pump';
    let _data = null;
    let _filter = 'ALL';
    let _timer = null;

    function injectStyles() {
        if (document.getElementById('ep-styles')) return;
        const s = document.createElement('style');
        s.id = 'ep-styles';
        s.textContent = `
#ecosystemPumpPanel { margin: 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.ep-header { display:flex; align-items:center; gap:12px; padding:14px 18px; background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%); border:1px solid #334155; border-radius:14px 14px 0 0; flex-wrap:wrap; }
.ep-header h2 { margin:0; font-size:16px; color:#f1f5f9; flex:1; }
.ep-badge { font-size:12px; padding:3px 10px; border-radius:20px; font-weight:600; }
.ep-badge.pumping { background:#14532d; color:#4ade80; }
.ep-badge.opps    { background:#1e3a5f; color:#60a5fa; }
.ep-refresh-btn { background:none; border:1px solid #475569; color:#94a3b8; border-radius:8px; padding:4px 10px; cursor:pointer; font-size:12px; }
.ep-refresh-btn:hover { border-color:#60a5fa; color:#60a5fa; }
.ep-filter-bar { display:flex; gap:8px; flex-wrap:wrap; padding:10px 18px; background:#0f172a; border-left:1px solid #334155; border-right:1px solid #334155; }
.ep-filter-btn { padding:4px 14px; border-radius:20px; border:1px solid #334155; background:#1e293b; color:#94a3b8; font-size:12px; cursor:pointer; }
.ep-filter-btn.active { border-color:#60a5fa; color:#60a5fa; background:#1e3a5f; }
.ep-top-opps { padding:10px 18px; background:#0c1220; border-left:1px solid #334155; border-right:1px solid #334155; border-bottom:1px solid #1e293b; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.ep-top-opps-label { font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:.05em; }
.ep-opp-pill { display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; background:#14532d; border:1px solid #16a34a; color:#4ade80; font-size:12px; font-weight:700; }
.ep-opp-pill .ep-eco { font-size:10px; color:#86efac; opacity:.7; }
.ep-grid { background:#0f172a; border:1px solid #334155; border-top:none; border-radius:0 0 14px 14px; overflow:hidden; }
.ep-eco-card { border-bottom:1px solid #1e293b; overflow:hidden; }
.ep-eco-card:last-child { border-bottom:none; }
.ep-l1-header { display:flex; align-items:center; gap:10px; padding:12px 18px; background:#111827; cursor:pointer; user-select:none; transition:background .15s; }
.ep-l1-header:hover { background:#1a2332; }
.ep-l1-img { width:28px; height:28px; border-radius:50%; object-fit:cover; }
.ep-l1-name { font-size:14px; font-weight:700; color:#f1f5f9; }
.ep-l1-status { font-size:12px; color:#94a3b8; }
.ep-l1-prices { display:flex; gap:10px; margin-left:auto; align-items:center; flex-wrap:wrap; }
.ep-ch { font-size:12px; font-weight:600; border-radius:6px; padding:2px 8px; }
.ep-ch.pos { background:#14532d; color:#4ade80; }
.ep-ch.neg { background:#450a0a; color:#f87171; }
.ep-ch.neu { background:#1e293b; color:#94a3b8; }
.ep-summary-pills { display:flex; gap:6px; }
.ep-sum-pill { font-size:11px; padding:2px 8px; border-radius:20px; }
.ep-sum-pill.long  { background:#14532d; color:#4ade80; }
.ep-sum-pill.avoid { background:#450a0a; color:#f87171; }
.ep-sum-pill.wait  { background:#422006; color:#fbbf24; }
.ep-chevron { font-size:12px; color:#475569; margin-left:4px; transition:transform .2s; }
.ep-eco-card.collapsed .ep-chevron { transform:rotate(-90deg); }
.ep-token-section { padding:0 18px 14px; background:#0f172a; }
.ep-section-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#475569; font-weight:700; padding:8px 0 4px; }
.ep-table { width:100%; border-collapse:collapse; font-size:12px; }
.ep-table th { text-align:left; padding:5px 8px; color:#64748b; font-weight:600; font-size:11px; border-bottom:1px solid #1e293b; white-space:nowrap; }
.ep-table th:not(:first-child) { text-align:right; }
.ep-table td { padding:6px 8px; border-bottom:1px solid #0f172a; vertical-align:middle; }
.ep-table td:not(:first-child) { text-align:right; }
.ep-table tr:last-child td { border-bottom:none; }
.ep-table tr:hover td { background:#1e293b22; }
.ep-sig { display:inline-flex; align-items:center; gap:4px; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:700; white-space:nowrap; border:1px solid transparent; }
.ep-sig[data-s="LONG"]  { background:#14532d33; border-color:#16a34a; color:#4ade80; }
.ep-sig[data-s="AVOID"] { background:#450a0a33; border-color:#dc2626; color:#f87171; }
.ep-sig[data-s="WAIT"]  { background:#42200633; border-color:#d97706; color:#fbbf24; }
.ep-sig[data-s="WATCH"] { background:#1e293b; border-color:#334155; color:#94a3b8; }
.ep-lag-wrap { display:flex; align-items:center; gap:6px; justify-content:flex-end; }
.ep-lag-bar-bg { width:48px; height:5px; background:#1e293b; border-radius:3px; overflow:hidden; }
.ep-lag-bar { height:100%; border-radius:3px; transition:width .3s; }
.ep-lag-val { font-size:11px; min-width:30px; text-align:right; }
.ep-tok-img { width:20px; height:20px; border-radius:50%; vertical-align:middle; margin-right:5px; }
.ep-tok-sym { font-weight:700; color:#e2e8f0; }
.ep-tok-name { color:#64748b; font-size:10px; display:block; }
.ep-missing { font-size:11px; color:#475569; padding:6px 0 2px; }
.ep-missing span { background:#1e293b; padding:2px 7px; border-radius:10px; margin:2px; display:inline-block; }
.ep-loading { padding:30px; text-align:center; color:#64748b; font-size:14px; }
.ep-error   { padding:20px; text-align:center; color:#f87171; font-size:13px; }
.ep-tooltip-wrap { position:relative; display:inline-block; }
.ep-tooltip-wrap .ep-tooltip { visibility:hidden; opacity:0; position:absolute; bottom:calc(100% + 6px); left:50%; transform:translateX(-50%); background:#1e293b; color:#cbd5e1; font-size:11px; padding:6px 10px; border-radius:8px; border:1px solid #334155; pointer-events:none; z-index:9999; transition:opacity .15s; max-width:240px; white-space:normal; text-align:left; }
.ep-tooltip-wrap:hover .ep-tooltip { visibility:visible; opacity:1; }
@media(max-width:600px){.ep-l1-prices{display:none}.ep-table th:nth-child(3),.ep-table td:nth-child(3),.ep-table th:nth-child(5),.ep-table td:nth-child(5){display:none}}
        `;
        document.head.appendChild(s);
    }

    const fmt = (n, d=2) => n==null ? '—' : (n>=0?'+':'')+n.toFixed(d)+'%';
    const fmtP = n => n==null ? '—' : '$'+(n<0.01?n.toFixed(6):n<1?n.toFixed(4):n.toFixed(2));
    const chClass = n => n>0?'pos':n<0?'neg':'neu';

    function renderTopOpps(tops) {
        if (!tops || !tops.length) return '';
        const pills = tops.slice(0,8).map(o =>
            `<span class="ep-opp-pill">${o.symbol} <span class="ep-eco">@${o.eco}</span></span>`
        ).join('');
        return `<div class="ep-top-opps"><span class="ep-top-opps-label">🎯 Top Opportunities:</span>${pills}</div>`;
    }

    function renderTokenRow(t) {
        const lagPct = Math.min(100, Math.max(0, (t.lagScore24h??0)*5));
        const lagColor = t.lagScore24h>8?'#22c55e':t.lagScore24h>3?'#f59e0b':'#64748b';
        const volBadge = t.hasHighVol?'🔥🔥':t.hasVolSpike?'🔥':'';
        const img = t.image ? `<img src="${t.image}" class="ep-tok-img" onerror="this.style.display='none'">` : '';
        return `<tr>
            <td>${img}<span class="ep-tok-sym">${t.symbol}</span><span class="ep-tok-name">${t.name}</span></td>
            <td style="color:#e2e8f0">${fmtP(t.price)}</td>
            <td class="ep-ch ${chClass(t.ch1h)}">${fmt(t.ch1h)}</td>
            <td class="ep-ch ${chClass(t.ch24h)}">${fmt(t.ch24h)}</td>
            <td><div class="ep-lag-wrap"><div class="ep-lag-bar-bg"><div class="ep-lag-bar" style="width:${lagPct}%;background:${lagColor}"></div></div><span class="ep-lag-val" style="color:${lagColor}">${(t.lagScore24h??0)>0?'+':''}${(t.lagScore24h??0).toFixed(1)}%</span></div></td>
            <td><span style="font-size:11px">${volBadge}</span></td>
            <td><div class="ep-tooltip-wrap"><span class="ep-sig" data-s="${t.signal}">${t.signalLabel}</span><div class="ep-tooltip">${t.signalDesc||''}</div></div></td>
        </tr>`;
    }

    function renderEcoCard(eco, idx) {
        let tokens = eco.tokens || [];
        if (_filter !== 'ALL') tokens = tokens.filter(t => t.signal === _filter);
        const isExpanded = eco.isPumping || idx === 0;

        const tokenRows = tokens.length
            ? tokens.map(renderTokenRow).join('')
            : `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:12px">No tokens match filter</td></tr>`;

        const s = eco.summary || {};
        const pills = [
            s.longCount  ? `<span class="ep-sum-pill long">🚀 ${s.longCount}</span>` : '',
            s.waitCount  ? `<span class="ep-sum-pill wait">⏳ ${s.waitCount}</span>` : '',
            s.avoidCount ? `<span class="ep-sum-pill avoid">⛔ ${s.avoidCount}</span>` : '',
        ].filter(Boolean).join('');

        const img = eco.l1Image
            ? `<img src="${eco.l1Image}" class="ep-l1-img" onerror="this.style.display='none'">`
            : `<span style="font-size:22px">${eco.ecoEmoji}</span>`;

        const missing = eco.missingSymbols?.length
            ? `<div class="ep-missing">Also: ${eco.missingSymbols.map(s=>`<span>${s}</span>`).join('')}</div>` : '';

        return `<div class="ep-eco-card ${isExpanded?'':'collapsed'}" id="ep-card-${eco.l1Id}">
            <div class="ep-l1-header" onclick="EcosystemPump.toggleCard('${eco.l1Id}')">
                ${img}
                <div>
                    <div class="ep-l1-name">${eco.ecoEmoji} ${eco.ecoName}</div>
                    <div class="ep-l1-status">${eco.l1Symbol} · ${eco.l1Status}</div>
                </div>
                <div class="ep-l1-prices">
                    <span class="ep-ch ${chClass(eco.l1Ch1h)}">${fmt(eco.l1Ch1h)}</span>
                    <span class="ep-ch ${chClass(eco.l1Ch24h)}">${fmt(eco.l1Ch24h)}</span>
                    <div class="ep-summary-pills">${pills}</div>
                </div>
                <span class="ep-chevron">${isExpanded?'▼':'▶'}</span>
            </div>
            <div class="ep-token-section" ${isExpanded?'':'style="display:none"'}>
                <div class="ep-section-label">Ecosystem Tokens</div>
                <table class="ep-table">
                    <thead><tr><th>Token</th><th>Price</th><th>1h</th><th>24h</th><th>Lag vs L1</th><th>Vol</th><th>Signal</th></tr></thead>
                    <tbody>${tokenRows}</tbody>
                </table>
                ${missing}
            </div>
        </div>`;
    }

    function render(data) {
        const el = document.getElementById('ecosystemPumpPanel');
        if (!el) return;
        _data = data;
        const ecos = data.ecosystems || [];

        const filterBtns = ['ALL','LONG','WAIT','AVOID','WATCH'].map(f =>
            `<button class="ep-filter-btn ${_filter===f?'active':''}" onclick="EcosystemPump.setFilter('${f}')">${
                f==='ALL'?'All':f==='LONG'?'🚀 LONG':f==='WAIT'?'⏳ WAIT':f==='AVOID'?'⛔ AVOID':'👀 WATCH'
            }</button>`
        ).join('');

        el.innerHTML = `
            <div class="ep-header">
                <h2>🌐 Ecosystem Momentum</h2>
                <span class="ep-badge pumping">🔥 ${data.pumpingCount||0} Pumping</span>
                <span class="ep-badge opps">🎯 ${data.totalLongSignals||0} LONG</span>
                <button class="ep-refresh-btn" onclick="EcosystemPump.refresh(true)">🔄 Refresh</button>
                <span style="font-size:11px;color:#475569;margin-left:auto">${data.fetchedAt?'Updated '+new Date(data.fetchedAt).toLocaleTimeString():''}${data.cached?' · cached':''}</span>
            </div>
            <div class="ep-filter-bar">${filterBtns}</div>
            ${renderTopOpps(data.topOpportunities)}
            <div class="ep-grid">${ecos.map((e,i)=>renderEcoCard(e,i)).join('')||'<div class="ep-loading">No data.</div>'}</div>
        `;
    }

    function toggleCard(id) {
        const card = document.getElementById(`ep-card-${id}`);
        if (!card) return;
        const sec = card.querySelector('.ep-token-section');
        const ch  = card.querySelector('.ep-chevron');
        const col = card.classList.toggle('collapsed');
        if (sec) sec.style.display = col ? 'none' : '';
        if (ch)  ch.textContent = col ? '▶' : '▼';
    }

    function setFilter(f) { _filter = f; if (_data) render(_data); }

    async function refresh(force=false) {
        const el = document.getElementById('ecosystemPumpPanel');
        if (!el) return;
        if (!_data) el.innerHTML = '<div class="ep-loading">⏳ Loading ecosystem data…</div>';
        try {
            const r = await fetch(force ? `${API}?refresh=1` : API);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            if (!d.ok) throw new Error(d.error||'API error');
            render(d);
        } catch(e) {
            console.warn('EcosystemPump:', e);
            if (!_data) el.innerHTML = `<div class="ep-error">⚠️ ${e.message}</div>`;
        }
    }

    function init() {
        injectStyles();
        refresh();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(()=>refresh(), 3*60_000);
    }

    return { init, refresh, toggleCard, setFilter };
})();
