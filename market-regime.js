/**
 * MARKET REGIME + FEAR & GREED + WATCHLIST
 */
const MarketRegime = (() => {
    const FG_API = 'http://127.0.0.1:3001/api/fear-greed';
    const WL_API = 'http://127.0.0.1:3001/api/watchlist';
    const PRICE_API = (ids) => `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    let _fgData = null, _wlData = [], _timer = null;

    function injectStyles() {
        if (document.getElementById('mr-styles')) return;
        const s = document.createElement('style');
        s.id = 'mr-styles';
        s.textContent = `
#marketRegimePanel { margin:16px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
.mr-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
@media(max-width:700px){ .mr-grid { grid-template-columns:1fr; } }
/* Fear & Greed Card */
.mr-card { background:#0a0e1a; border:1px solid #1e3a5f; border-radius:14px; overflow:hidden; }
.mr-card-header { padding:12px 16px; background:linear-gradient(135deg,#0a0e1a,#0d1b2e); border-bottom:1px solid #1e3a5f; display:flex; align-items:center; gap:8px; }
.mr-card-header h3 { margin:0; font-size:14px; color:#e2e8f0; flex:1; }
.mr-card-body { padding:16px; }
/* Gauge arc */
.fg-gauge-wrap { display:flex; flex-direction:column; align-items:center; padding:8px 0 0; }
.fg-arc { position:relative; width:160px; height:80px; overflow:hidden; }
.fg-arc svg { position:absolute; top:0; left:0; }
.fg-value { position:absolute; bottom:0; left:50%; transform:translateX(-50%); font-size:28px; font-weight:900; line-height:1; }
.fg-label { font-size:13px; font-weight:700; margin-top:6px; }
.fg-regime { font-size:18px; margin-top:4px; }
/* 7-day bar chart */
.fg-history { margin-top:12px; }
.fg-hist-label { font-size:10px; color:#475569; margin-bottom:6px; text-transform:uppercase; letter-spacing:.06em; }
.fg-bars { display:flex; gap:4px; align-items:flex-end; height:40px; }
.fg-bar-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:2px; }
.fg-bar { width:100%; border-radius:3px 3px 0 0; }
.fg-bar-day { font-size:9px; color:#475569; }
/* Phase badge */
.fg-phase-badge { display:inline-block; margin-top:10px; padding:5px 14px; border-radius:20px; font-size:13px; font-weight:700; }
/* Watchlist Card */
.wl-card { background:#0a0e1a; border:1px solid #2d1b4e; border-radius:14px; overflow:hidden; }
.wl-card-header { padding:12px 16px; background:linear-gradient(135deg,#0a0e1a,#110d20); border-bottom:1px solid #2d1b4e; display:flex; align-items:center; gap:8px; }
.wl-card-header h3 { margin:0; font-size:14px; color:#e2e8f0; flex:1; }
.wl-add-row { display:flex; gap:8px; padding:12px 16px; border-bottom:1px solid #1e293b; }
.wl-add-input { flex:1; background:#111827; border:1px solid #374151; border-radius:8px; padding:7px 12px; color:#e2e8f0; font-size:13px; outline:none; }
.wl-add-input:focus { border-color:#7c3aed; }
.wl-add-btn { background:#7c3aed; border:none; color:#fff; border-radius:8px; padding:7px 14px; cursor:pointer; font-size:13px; font-weight:600; }
.wl-add-btn:hover { background:#6d28d9; }
.wl-list { padding:0 16px 12px; }
.wl-empty { padding:20px; text-align:center; color:#475569; font-size:13px; }
.wl-item { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #0f172a; }
.wl-item:last-child { border-bottom:none; }
.wl-sym { font-size:14px; font-weight:700; color:#e2e8f0; flex:1; }
.wl-price { font-size:13px; color:#94a3b8; }
.wl-chg { font-size:13px; font-weight:700; min-width:56px; text-align:right; }
.wl-rm-btn { background:none; border:none; color:#374151; cursor:pointer; font-size:16px; padding:0 4px; }
.wl-rm-btn:hover { color:#ef4444; }
.mr-loading { padding:30px; text-align:center; color:#475569; }
        `;
        document.head.appendChild(s);
    }

    // Draw gauge arc via SVG
    function gaugeArc(value) {
        const pct = value / 100;
        // Arc from 180° to 0° (semicircle)
        const angle = 180 * pct; // degrees from left
        const r = 70, cx = 80, cy = 78;
        function polarToXY(deg) {
            const rad = (deg - 180) * Math.PI / 180;
            return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
        }
        // Color segments: 0-25 green, 25-45 yellow-green, 45-55 yellow, 55-75 orange, 75-100 red
        const segments = [
            { from: 0, to: 25, color: '#22c55e' },
            { from: 25, to: 45, color: '#84cc16' },
            { from: 45, to: 55, color: '#eab308' },
            { from: 55, to: 75, color: '#f97316' },
            { from: 75, to: 100, color: '#ef4444' },
        ];
        let paths = segments.map(seg => {
            const [x1, y1] = polarToXY(seg.from * 1.8);
            const [x2, y2] = polarToXY(seg.to * 1.8);
            const large = (seg.to - seg.from) > 50 ? 1 : 0;
            return `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" stroke="${seg.color}" stroke-width="10" fill="none" stroke-linecap="butt"/>`;
        }).join('');
        // Needle
        const needleAngle = value * 1.8;
        const [nx, ny] = polarToXY(needleAngle);
        const needle = `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#f1f5f9" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="5" fill="#1e293b" stroke="#f1f5f9" stroke-width="2"/>`;
        // Color for value text
        const vc = value <= 25 ? '#22c55e' : value <= 45 ? '#84cc16' : value <= 55 ? '#eab308' : value <= 75 ? '#f97316' : '#ef4444';
        return { svg: `<svg width="160" height="80" viewBox="0 0 160 80">${paths}${needle}</svg>`, vc };
    }

    function fgColor(val) {
        return val <= 25 ? '#22c55e' : val <= 45 ? '#84cc16' : val <= 55 ? '#eab308' : val <= 75 ? '#f97316' : '#ef4444';
    }

    function renderFG(d) {
        const { svg, vc } = gaugeArc(d.value);
        const bars = (d.history7d || []).map((h, i) => {
            const color = fgColor(h.value);
            const height = Math.max(4, (h.value / 100) * 36);
            const day = i === (d.history7d.length - 1) ? 'Hari ini' : `-${d.history7d.length - 1 - i}d`;
            return `<div class="fg-bar-col">
                <div class="fg-bar" style="height:${height}px;background:${color}" title="${h.value} - ${h.label}"></div>
                <div class="fg-bar-day">${day}</div>
            </div>`;
        }).join('');

        // regime & marketPhase may be objects or strings
        const regimeLabel = d.regime?.label || d.regime || '';
        const phaseLabel  = d.marketPhase?.label || d.marketPhase || '';
        const phaseColor  = d.marketPhase?.color || '#94a3b8';
        const phaseBg     = phaseColor === '#ef4444' ? '#450a0a' : phaseColor === '#4ade80' ? '#14532d' : '#78350f';

        return `<div class="mr-card">
            <div class="mr-card-header">
                <h3>😱 Fear &amp; Greed Index</h3>
                <span style="font-size:11px;color:#475569">alternative.me</span>
            </div>
            <div class="mr-card-body">
                <div class="fg-gauge-wrap">
                    <div class="fg-arc">${svg}<div class="fg-value" style="color:${vc}">${d.value}</div></div>
                    <div class="fg-label" style="color:${vc}">${d.classification}</div>
                    <div class="fg-regime" style="font-size:12px;color:#64748b">${regimeLabel}</div>
                    <div class="fg-phase-badge" style="background:${phaseBg};color:${phaseColor}">${phaseLabel}</div>
                </div>
                <div class="fg-history">
                    <div class="fg-hist-label">7 hari terakhir</div>
                    <div class="fg-bars">${bars}</div>
                </div>
            </div>
        </div>`;
    }

    // ── Watchlist ──
    async function addToken(sym) {
        sym = sym.toUpperCase().trim();
        if (!sym) return;
        await fetch(WL_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: sym, action: 'add' })
        });
        refreshWatchlist();
    }

    async function removeToken(sym) {
        await fetch(WL_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: sym, action: 'remove' })
        });
        refreshWatchlist();
    }

    // CoinGecko needs IDs, so we do symbol→id lookup via search
    async function fetchPrices(symbols) {
        if (!symbols.length) return {};
        // Use simple search approach: search each symbol
        const result = {};
        // Batch price fetch by guessing lowercase ID = lowercase symbol
        // This works for most major coins: BTC→bitcoin, ETH→ethereum
        const symbolToId = {
            BTC:'bitcoin',ETH:'ethereum',BNB:'binancecoin',SOL:'solana',
            USDT:'tether',USDC:'usd-coin',XRP:'ripple',ADA:'cardano',
            AVAX:'avalanche-2',MATIC:'matic-network',POL:'matic-network',
            DOT:'polkadot',DOGE:'dogecoin',SHIB:'shiba-inu',LTC:'litecoin',
            LINK:'chainlink',UNI:'uniswap',ATOM:'cosmos',NEAR:'near',
            APT:'aptos',SUI:'sui',ARB:'arbitrum',OP:'optimism',
            INJ:'injective-protocol',TON:'the-open-network',
            HYPE:'hyperliquid',VIRTUAL:'virtual-protocol',IO:'io-net',
            BERA:'berachain-bera',ONDO:'ondo-finance',
        };
        const ids = symbols.map(s => symbolToId[s] || s.toLowerCase()).filter(Boolean);
        try {
            const r = await fetch(PRICE_API(ids.join(',')));
            if (!r.ok) return result;
            const data = await r.json();
            symbols.forEach(sym => {
                const id = symbolToId[sym] || sym.toLowerCase();
                if (data[id]) {
                    result[sym] = { price: data[id].usd, change24h: data[id].usd_24h_change };
                }
            });
        } catch (e) {}
        return result;
    }

    function renderWatchlist(symbols, prices) {
        const inputId = 'wl-add-input-' + Date.now();
        const items = symbols.length
            ? symbols.map(sym => {
                const p = prices[sym];
                const price = p ? `$${p.price < 0.01 ? p.price.toFixed(6) : p.price < 1 ? p.price.toFixed(4) : p.price.toFixed(2)}` : '–';
                const chg = p?.change24h !== undefined ? p.change24h.toFixed(2) : null;
                const chgColor = chg >= 0 ? '#4ade80' : '#f87171';
                const chgStr = chg !== null ? `<span class="wl-chg" style="color:${chgColor}">${chg >= 0 ? '+' : ''}${chg}%</span>` : '<span class="wl-chg" style="color:#475569">–</span>';
                return `<div class="wl-item">
                    <span class="wl-sym">${sym}</span>
                    <span class="wl-price">${price}</span>
                    ${chgStr}
                    <button class="wl-rm-btn" onclick="MarketRegime._remove('${sym}')" title="Remove">✕</button>
                </div>`;
            }).join('')
            : '<div class="wl-empty">Watchlist kosong — tambah token di atas 👆</div>';

        return `<div class="wl-card">
            <div class="wl-card-header">
                <h3>⭐ Watchlist Pribadi</h3>
                <span style="font-size:11px;color:#475569">${symbols.length} token</span>
            </div>
            <div class="wl-add-row">
                <input id="${inputId}" class="wl-add-input" type="text" placeholder="Ketik simbol, misal: SOL, INJ …" 
                    onkeydown="if(event.key==='Enter'){MarketRegime._add(this.value);this.value=''}"/>
                <button class="wl-add-btn" onclick="MarketRegime._add(document.getElementById('${inputId}').value);document.getElementById('${inputId}').value=''">+ Tambah</button>
            </div>
            <div class="wl-list">${items}</div>
        </div>`;
    }

    async function refreshWatchlist() {
        try {
            const r = await fetch(WL_API);
            const d = await r.json();
            if (!d.ok) return;
            _wlData = d.tokens || [];
            const prices = await fetchPrices(_wlData);
            const el = document.getElementById('mr-wl-slot');
            if (el) el.innerHTML = renderWatchlist(_wlData, prices);
        } catch (e) { console.warn('Watchlist:', e); }
    }

    async function refresh() {
        const el = document.getElementById('marketRegimePanel');
        if (!el) return;

        // F&G fetch
        let fgHtml = '<div class="mr-loading">Loading Fear &amp; Greed…</div>';
        try {
            const r = await fetch(FG_API);
            const d = await r.json();
            if (d.ok) { _fgData = d; fgHtml = renderFG(d); }
        } catch (e) {}

        // Watchlist
        let wlHtml = '<div class="wl-card"><div class="mr-loading">Loading watchlist…</div></div>';
        try {
            const r = await fetch(WL_API);
            const d = await r.json();
            if (d.ok) {
                _wlData = d.tokens || [];
                const prices = await fetchPrices(_wlData);
                wlHtml = renderWatchlist(_wlData, prices);
            }
        } catch (e) {}

        el.innerHTML = `<div class="mr-grid">${fgHtml}<div id="mr-wl-slot">${wlHtml}</div></div>`;
    }

    function init() {
        injectStyles();
        refresh();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(refresh, 15 * 60_000);
        // Watchlist harga refresh setiap 2 menit
        setInterval(refreshWatchlist, 2 * 60_000);
    }

    return { init, refresh, _add: addToken, _remove: removeToken };
})();
