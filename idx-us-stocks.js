// IDX & US Stocks Module
// Provides loadIDXStocks() and loadUSStocks() called by app.js switchTab()
console.log('✅ idx-us-stocks.js loaded');

// ─────────────────────────────────────────────
//  MOCK DATA  (replace with real API calls later)
// ─────────────────────────────────────────────
const IDX_STOCKS = [
    // banking
    { code:'BBCA', name:'Bank Central Asia',       sector:'banking',         price:9800,  change:0.51,  volume:'82.4M',  value:'Rp 807B',   foreign:'+12B',   marketCap:'Rp 2.408T', technical:'📈 Bullish',     pe:24.2, eps:405,  rsi:58, beta:0.82, w52h:10800, w52l:8100,  divYield:1.1, macdSignal:'bullish' },
    { code:'BMRI', name:'Bank Mandiri',             sector:'banking',         price:6225,  change:-0.40, volume:'61.1M',  value:'Rp 380B',   foreign:'-5B',    marketCap:'Rp 1.448T', technical:'➡️ Neutral',     pe:12.6, eps:494,  rsi:47, beta:0.91, w52h:7050,  w52l:5500,  divYield:3.2, macdSignal:'neutral' },
    { code:'BBRI', name:'Bank Rakyat Indonesia',   sector:'banking',         price:4990,  change:0.20,  volume:'95.2M',  value:'Rp 475B',   foreign:'+8B',    marketCap:'Rp 1.226T', technical:'📈 Bullish',     pe:11.8, eps:423,  rsi:53, beta:0.88, w52h:5750,  w52l:4200,  divYield:2.8, macdSignal:'bullish' },
    { code:'BBNI', name:'Bank Negara Indonesia',   sector:'banking',         price:4720,  change:0.64,  volume:'38.6M',  value:'Rp 182B',   foreign:'+4B',    marketCap:'Rp 877B',   technical:'📈 Bullish',     pe:10.2, eps:463,  rsi:55, beta:0.93, w52h:5300,  w52l:4100,  divYield:2.5, macdSignal:'bullish' },
    // mining
    { code:'ANTM', name:'Aneka Tambang',            sector:'mining',          price:1645,  change:2.18,  volume:'312M',   value:'Rp 513B',   foreign:'+22B',   marketCap:'Rp 394B',   technical:'🚀 Strong Bull', pe:8.4,  eps:196,  rsi:68, beta:1.42, w52h:1980,  w52l:1120,  divYield:2.1, macdSignal:'bullish' },
    { code:'ADRO', name:'Adaro Energy Indonesia',   sector:'mining',          price:2460,  change:-1.20, volume:'54M',    value:'Rp 132B',   foreign:'-9B',    marketCap:'Rp 786B',   technical:'📉 Bearish',     pe:6.1,  eps:403,  rsi:39, beta:1.28, w52h:3100,  w52l:2200,  divYield:5.4, macdSignal:'bearish' },
    { code:'ITMG', name:'Indo Tambangraya Megah',   sector:'mining',          price:26200, change:0.77,  volume:'3.2M',   value:'Rp 84B',    foreign:'+4B',    marketCap:'Rp 295B',   technical:'➡️ Neutral',     pe:5.8,  eps:4517, rsi:50, beta:1.18, w52h:29500, w52l:22000, divYield:8.2, macdSignal:'neutral' },
    { code:'UNTR', name:'United Tractors',          sector:'mining',          price:32500, change:1.42,  volume:'7.2M',   value:'Rp 234B',   foreign:'+9B',    marketCap:'Rp 410B',   technical:'📈 Bullish',     pe:9.2,  eps:3533, rsi:62, beta:1.10, w52h:35000, w52l:26500, divYield:4.1, macdSignal:'bullish' },
    // consumer & FMCG
    { code:'UNVR', name:'Unilever Indonesia',       sector:'consumer',        price:2100,  change:-0.95, volume:'18.9M',  value:'Rp 39B',    foreign:'-3B',    marketCap:'Rp 80B',    technical:'📉 Bearish',     pe:18.5, eps:114,  rsi:34, beta:0.65, w52h:3200,  w52l:1900,  divYield:5.6, macdSignal:'bearish' },
    { code:'ICBP', name:'Indofood CBP',             sector:'consumer',        price:9725,  change:0.26,  volume:'12.4M',  value:'Rp 120B',   foreign:'+2B',    marketCap:'Rp 113B',   technical:'➡️ Neutral',     pe:16.2, eps:600,  rsi:48, beta:0.72, w52h:10800, w52l:8500,  divYield:3.8, macdSignal:'neutral' },
    { code:'ACES', name:'Ace Hardware Indonesia',   sector:'consumer',        price:920,   change:0.12,  volume:'11.2M',  value:'Rp 10B',    foreign:'+0.2B',  marketCap:'Rp 8B',     technical:'➡️ Neutral',     pe:22.1, eps:42,   rsi:46, beta:0.68, w52h:1100,  w52l:820,   divYield:1.9, macdSignal:'neutral' },
    // property
    { code:'BSDE', name:'Bumi Serpong Damai',       sector:'property',        price:1225,  change:1.24,  volume:'28.6M',  value:'Rp 35B',    foreign:'+1B',    marketCap:'Rp 72B',    technical:'📈 Bullish',     pe:14.8, eps:83,   rsi:57, beta:0.98, w52h:1480,  w52l:950,   divYield:1.2, macdSignal:'bullish' },
    { code:'CTRA', name:'Ciputra Development',      sector:'property',        price:1085,  change:1.40,  volume:'22.1M',  value:'Rp 24B',    foreign:'+0.8B',  marketCap:'Rp 57B',    technical:'📈 Bullish',     pe:17.2, eps:63,   rsi:56, beta:1.02, w52h:1310,  w52l:840,   divYield:1.0, macdSignal:'bullish' },
    // healthcare
    { code:'HEAL', name:'Medikaloka Hermina',       sector:'healthcare',      price:1620,  change:-0.61, volume:'9.8M',   value:'Rp 16B',    foreign:'-1B',    marketCap:'Rp 38B',    technical:'➡️ Neutral',     pe:21.4, eps:76,   rsi:44, beta:0.74, w52h:1950,  w52l:1450,  divYield:0.8, macdSignal:'neutral' },
    { code:'KLBF', name:'Kalbe Farma',              sector:'healthcare',      price:1480,  change:1.75,  volume:'9.1M',   value:'Rp 13B',    foreign:'+1B',    marketCap:'Rp 52B',    technical:'📈 Bullish',     pe:19.6, eps:76,   rsi:60, beta:0.69, w52h:1700,  w52l:1200,  divYield:2.4, macdSignal:'bullish' },
    // technology
    { code:'MTRO', name:'Metrodata Electronics',    sector:'technology',      price:2520,  change:3.44,  volume:'6.4M',   value:'Rp 16B',    foreign:'+0.5B',  marketCap:'Rp 7B',     technical:'🚀 Strong Bull', pe:13.2, eps:191,  rsi:72, beta:1.22, w52h:2800,  w52l:1800,  divYield:1.4, macdSignal:'bullish' },
    { code:'GOTO', name:'GoTo Gojek Tokopedia',     sector:'technology',      price:183,   change:-2.10, volume:'412M',   value:'Rp 75B',    foreign:'-12B',   marketCap:'Rp 45B',    technical:'📉 Bearish',     pe:-8.1, eps:-23,  rsi:32, beta:1.85, w52h:350,   w52l:148,   divYield:0,   macdSignal:'bearish' },
    // infrastructure & energy
    { code:'TLKM', name:'Telkom Indonesia',         sector:'infrastructure',  price:3090,  change:0.65,  volume:'44.7M',  value:'Rp 138B',   foreign:'+7B',    marketCap:'Rp 305B',   technical:'📈 Bullish',     pe:16.8, eps:184,  rsi:56, beta:0.78, w52h:3500,  w52l:2700,  divYield:4.2, macdSignal:'bullish' },
    { code:'PGAS', name:'Perusahaan Gas Negara',    sector:'energy',          price:1580,  change:-0.30, volume:'45.6M',  value:'Rp 72B',    foreign:'-2B',    marketCap:'Rp 62B',    technical:'➡️ Neutral',     pe:8.9,  eps:178,  rsi:46, beta:0.85, w52h:1800,  w52l:1350,  divYield:5.1, macdSignal:'neutral' },
    // materials & automotive
    { code:'SMGR', name:'Semen Indonesia',          sector:'basic_materials', price:12000, change:2.10,  volume:'3.9M',   value:'Rp 46B',    foreign:'+3B',    marketCap:'Rp 98B',    technical:'� Strong Bull', pe:11.4, eps:1053, rsi:66, beta:1.05, w52h:13500, w52l:9800,  divYield:2.8, macdSignal:'bullish' },
    { code:'ASII', name:'Astra International',      sector:'automotive',      price:6400,  change:0.95,  volume:'21.4M',  value:'Rp 137B',   foreign:'+6B',    marketCap:'Rp 550B',   technical:'� Bullish',     pe:10.8, eps:593,  rsi:59, beta:0.92, w52h:7200,  w52l:5600,  divYield:4.8, macdSignal:'bullish' },
];

const US_STOCKS = [
    { ticker:'AAPL',  name:'Apple Inc.',            sector:'technology',  exchange:'NASDAQ', price:226.84, change:0.42,  volume:'55.2M',  marketCap:'$3.45T', pe:'36.2', eps:'6.26',  rsi:58, technical:'📈 Bullish' },
    { ticker:'MSFT',  name:'Microsoft Corp.',       sector:'technology',  exchange:'NASDAQ', price:412.18, change:-0.31, volume:'22.1M',  marketCap:'$3.06T', pe:'34.8', eps:'11.84', rsi:52, technical:'➡️ Neutral' },
    { ticker:'GOOGL', name:'Alphabet Inc.',         sector:'technology',  exchange:'NASDAQ', price:184.52, change:1.05,  volume:'18.9M',  marketCap:'$2.28T', pe:'23.4', eps:'7.88',  rsi:64, technical:'🚀 Strong Bull' },
    { ticker:'NVDA',  name:'NVIDIA Corp.',          sector:'technology',  exchange:'NASDAQ', price:823.40, change:2.10,  volume:'41.5M',  marketCap:'$2.02T', pe:'65.1', eps:'12.65', rsi:71, technical:'🚀 Strong Bull' },
    { ticker:'META',  name:'Meta Platforms',        sector:'technology',  exchange:'NASDAQ', price:512.40, change:0.88,  volume:'18.2M',  marketCap:'$1.31T', pe:'27.1', eps:'18.90', rsi:62, technical:'📈 Bullish' },
    { ticker:'AMD',   name:'Advanced Micro Devices',sector:'technology',  exchange:'NASDAQ', price:158.90, change:1.45,  volume:'35.1M',  marketCap:'$257B',  pe:'44.2', eps:'3.59',  rsi:67, technical:'📈 Bullish' },
    { ticker:'JPM',   name:'JPMorgan Chase',        sector:'financials',  exchange:'NYSE',   price:241.76, change:-0.18, volume:'9.4M',   marketCap:'$696B',  pe:'12.8', eps:'18.88', rsi:49, technical:'➡️ Neutral' },
    { ticker:'GS',    name:'Goldman Sachs',         sector:'financials',  exchange:'NYSE',   price:524.30, change:0.32,  volume:'3.1M',   marketCap:'$175B',  pe:'14.1', eps:'37.18', rsi:53, technical:'➡️ Neutral' },
    { ticker:'V',     name:'Visa Inc.',             sector:'financials',  exchange:'NYSE',   price:278.50, change:0.21,  volume:'6.8M',   marketCap:'$562B',  pe:'31.2', eps:'8.93',  rsi:55, technical:'➡️ Neutral' },
    { ticker:'JNJ',   name:'Johnson & Johnson',     sector:'healthcare',  exchange:'NYSE',   price:158.22, change:0.08,  volume:'7.1M',   marketCap:'$381B',  pe:'15.6', eps:'10.14', rsi:47, technical:'➡️ Neutral' },
    { ticker:'PFE',   name:'Pfizer Inc.',           sector:'healthcare',  exchange:'NYSE',   price:28.40,  change:-0.70, volume:'31.2M',  marketCap:'$161B',  pe:'N/A',  eps:'-1.20', rsi:38, technical:'📉 Bearish' },
    { ticker:'ABBV',  name:'AbbVie Inc.',           sector:'healthcare',  exchange:'NYSE',   price:174.60, change:0.55,  volume:'5.9M',   marketCap:'$308B',  pe:'18.4', eps:'9.49',  rsi:56, technical:'📈 Bullish' },
    { ticker:'XOM',   name:'Exxon Mobil',           sector:'energy',      exchange:'NYSE',   price:112.33, change:-0.55, volume:'14.2M',  marketCap:'$449B',  pe:'14.2', eps:'7.91',  rsi:43, technical:'📉 Bearish' },
    { ticker:'CVX',   name:'Chevron Corp.',         sector:'energy',      exchange:'NYSE',   price:158.80, change:-0.33, volume:'8.6M',   marketCap:'$291B',  pe:'13.8', eps:'11.51', rsi:45, technical:'➡️ Neutral' },
    { ticker:'AMZN',  name:'Amazon.com Inc.',       sector:'consumer',    exchange:'NASDAQ', price:218.50, change:1.32,  volume:'31.8M',  marketCap:'$2.31T', pe:'43.6', eps:'5.01',  rsi:63, technical:'📈 Bullish' },
    { ticker:'TSLA',  name:'Tesla Inc.',            sector:'consumer',    exchange:'NASDAQ', price:312.70, change:3.41,  volume:'122.4M', marketCap:'$998B',  pe:'88.2', eps:'3.54',  rsi:74, technical:'🚀 Strong Bull' },
    { ticker:'MCD',   name:"McDonald's Corp.",      sector:'consumer',    exchange:'NYSE',   price:298.40, change:0.14,  volume:'3.2M',   marketCap:'$215B',  pe:'24.8', eps:'12.03', rsi:51, technical:'➡️ Neutral' },
    { ticker:'BA',    name:'Boeing Co.',            sector:'industrials', exchange:'NYSE',   price:168.92, change:-1.22, volume:'11.3M',  marketCap:'$129B',  pe:'N/A',  eps:'-3.41', rsi:36, technical:'📉 Bearish' },
    { ticker:'CAT',   name:'Caterpillar Inc.',      sector:'industrials', exchange:'NYSE',   price:334.50, change:-0.45, volume:'2.8M',   marketCap:'$161B',  pe:'17.2', eps:'19.45', rsi:48, technical:'➡️ Neutral' },
    { ticker:'KO',    name:'Coca-Cola Co.',         sector:'consumer',    exchange:'NYSE',   price:68.40,  change:0.29,  volume:'12.1M',  marketCap:'$295B',  pe:'24.1', eps:'2.84',  rsi:52, technical:'➡️ Neutral' },
];

// ─────────────────────────────────────────────
//  IDX STOCKS — LIVE DATA
// ─────────────────────────────────────────────
// Holds the last successfully fetched list so filters can re-render it.
let _idxLiveData = null;
let _idxRefreshTimer = null;
let _idxPage = 1;
const IDX_PAGE_SIZE = 20;

function _showIDXLoading(show) {
    const tbody = document.getElementById('idxStockBody');
    if (!tbody) return;
    if (show) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:#8892a4;">
            <div style="display:inline-block;width:32px;height:32px;border:3px solid #2d3748;border-top-color:#38bdf8;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;margin-right:12px;"></div>
            Memuat data live dari Yahoo Finance…
        </td></tr>`;
    }
}

async function fetchAndRenderIDXStocks(silent = false) {
    if (!silent) _showIDXLoading(true);
    try {
        const r = await fetch('http://127.0.0.1:3001/api/idx-live');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const json = await r.json();
        const stocks = json.data || IDX_STOCKS;
        // Merge: if live price is null (API failed), fall back to IDX_STOCKS price for that symbol
        const merged = stocks.map(s => {
            if (s.price == null) {
                const fallback = IDX_STOCKS.find(f => f.code === s.code);
                if (fallback) return { ...s, price: fallback.price, change: fallback.change, volume: fallback.volume, value: fallback.value, foreign: fallback.foreign, _live: false };
            }
            return s;
        });
        _idxLiveData = merged;
        renderIDXStocks(merged);
        // Update last-refresh badge
        const badge = document.getElementById('idxLiveBadge');
        if (badge) {
            const src = json.ok ? '🟢 Live' : '🟡 Cached';
            badge.textContent = src + ' · ' + new Date().toLocaleTimeString('id-ID');
        }
    } catch (e) {
        console.warn('IDX live fetch failed, using static data:', e.message);
        _idxLiveData = IDX_STOCKS;
        renderIDXStocks(IDX_STOCKS);
        const badge = document.getElementById('idxLiveBadge');
        if (badge) badge.textContent = '🔴 Offline · ' + new Date().toLocaleTimeString('id-ID');
    }
}

function loadIDXStocks() {
    updateIDXSessionStatus();
    populateIDXStatsPlaceholder();
    simulateIDXSectorHeatmap();

    // Wire up search & sector filter
    const searchInput = document.getElementById('idxSearchStock');
    const sectorFilter = document.getElementById('idxSectorFilter');
    if (searchInput) searchInput.addEventListener('input', () => filterIDXStocks());
    if (sectorFilter) sectorFilter.addEventListener('change', () => filterIDXStocks());

    // Inject live badge + refresh button next to the table header if not present
    _injectIDXLiveBadge();

    // Load Trending / Top Gainers panel
    loadIDXTrendingPanel();

    // Load IPO Calendar + Dividend Schedule
    loadIDXCorpActions();

    // Initial fetch
    fetchAndRenderIDXStocks(false);

    // Auto-refresh every 3 minutes
    if (_idxRefreshTimer) clearInterval(_idxRefreshTimer);
    _idxRefreshTimer = setInterval(() => fetchAndRenderIDXStocks(true), 3 * 60_000);
}

function _injectIDXLiveBadge() {
    if (document.getElementById('idxLiveBadge')) return;
    // Try to find the IDX section toolbar / header
    const toolbar = document.querySelector('.idx-toolbar') || document.querySelector('#idx-us-tab .section-header') || document.querySelector('#idx-us-tab h2');
    if (!toolbar) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:16px;font-size:12px;';
    wrap.innerHTML = `
        <span id="idxLiveBadge" style="color:#64748b;font-size:11px;">⏳ Memuat…</span>
        <button onclick="fetchAndRenderIDXStocks(false)" style="background:#1e293b;border:1px solid #334155;color:#38bdf8;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px;">⟳ Refresh</button>
    `;
    toolbar.appendChild(wrap);
}

// ─── Trending / Top Gainers Panel ───────────────────────────────────────────
async function loadIDXTrendingPanel() {
    // Find or create the panel container above the stock table
    let panel = document.getElementById('idxTrendingPanel');
    if (!panel) {
        const tableWrap = document.getElementById('idxStockTableBody')?.closest('table')?.parentElement
            || document.querySelector('#idx-us-tab .table-container')
            || document.querySelector('#idx-us-tab table')?.parentElement;
        if (!tableWrap) return;

        panel = document.createElement('div');
        panel.id = 'idxTrendingPanel';
        panel.style.cssText = 'margin-bottom:20px;';
        tableWrap.insertAdjacentElement('beforebegin', panel);
    }

    // Loading state
    panel.innerHTML = `
        <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid #1e3a5f;border-radius:14px;padding:18px 20px;margin-bottom:4px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
                <span style="font-size:1.1rem;">🔥</span>
                <span style="font-weight:700;color:#f1f5f9;font-size:0.95rem;">Top Movers Hari Ini</span>
                <span style="color:#475569;font-size:11px;margin-left:auto;">Memuat dari ~200 saham IDX…</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${Array(8).fill(0).map(()=>`<div style="width:130px;height:68px;background:#1e293b;border-radius:10px;animation:pulse 1.5s infinite;"></div>`).join('')}
            </div>
        </div>
    `;

    try {
        const r = await fetch('http://127.0.0.1:3001/api/idx-gainers');
        const json = await r.json();

        const gainers    = json.gainers    || [];
        const losers     = json.losers     || [];
        const mostActive = json.mostActive || [];

        // Active tab state
        let activeTab = 'gainers';

        function renderCards(list, type) {
            if (!list.length) return `<span style="color:#475569;font-size:13px;">Tidak ada data</span>`;
            return list.map(s => {
                const isUp   = s.change >= 0;
                const color  = isUp ? '#22c55e' : '#ef4444';
                const bg     = isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
                const border = isUp ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)';
                const arrow  = isUp ? '▲' : '▼';
                const sign   = isUp ? '+' : '';
                // ARA badge (IDX max daily gain ~35%)
                const isARA  = s.change >= 24.9;
                const isARB  = s.change <= -24.9;
                const badge  = isARA ? '<span style="background:#f59e0b;color:#000;font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;margin-left:4px;">ARA</span>'
                             : isARB ? '<span style="background:#ef4444;color:#fff;font-size:9px;font-weight:800;padding:1px 5px;border-radius:4px;margin-left:4px;">ARB</span>'
                             : s.change >= 10 ? '<span style="background:#f97316;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:4px;margin-left:4px;">HOT</span>' : '';
                const stockData = JSON.stringify(s).replace(/"/g,'&quot;');
                return `
                    <div onclick="showIDXStockAnalysis(${stockData})" style="min-width:120px;flex:0 0 auto;background:${bg};border:1px solid ${border};border-radius:10px;padding:10px 12px;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
                        <div style="font-weight:700;color:#f1f5f9;font-size:0.82rem;white-space:nowrap;">${s.code}${badge}</div>
                        <div style="color:${color};font-size:1rem;font-weight:800;margin:3px 0;">${arrow} ${sign}${s.change}%</div>
                        <div style="color:#94a3b8;font-size:0.72rem;">Rp ${(s.price||0).toLocaleString('id-ID')}</div>
                        <div style="color:#475569;font-size:0.68rem;">Vol: ${s.volume||'—'}</div>
                    </div>
                `;
            }).join('');
        }

        function buildPanel(tab) {
            const list = tab === 'gainers' ? gainers : tab === 'losers' ? losers : mostActive;
            const tabBtn = (t, label, emoji) => `
                <button onclick="window._idxTrendingTab('${t}')" style="background:${tab===t?'#38bdf8':'#1e293b'};color:${tab===t?'#0f172a':'#64748b'};border:1px solid ${tab===t?'#38bdf8':'#334155'};padding:5px 14px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:${tab===t?'700':'400'};transition:all 0.2s;">${emoji} ${label}</button>
            `;

            return `
                <div style="background:linear-gradient(135deg,#0a1628,#1e293b);border:1px solid #1e3a5f;border-radius:14px;padding:16px 20px;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
                        <span style="font-weight:700;color:#f1f5f9;font-size:0.95rem;">🔥 Top Movers IDX Hari Ini</span>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-left:8px;">
                            ${tabBtn('gainers','Top Gainers','🚀')}
                            ${tabBtn('losers','Top Losers','📉')}
                            ${tabBtn('active','Most Active','⚡')}
                        </div>
                        <span style="color:#334155;font-size:11px;margin-left:auto;">~${json.total||0} saham dipindai · ${json.ts||''}</span>
                        <button onclick="loadIDXTrendingPanel()" style="background:#1e293b;border:1px solid #334155;color:#38bdf8;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px;">⟳</button>
                    </div>
                    <div id="idxTrendingCards" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;scrollbar-width:thin;scrollbar-color:#334155 transparent;">
                        ${renderCards(list, tab)}
                    </div>
                    ${tab === 'gainers' && gainers.length ? `
                    <div style="margin-top:10px;padding-top:10px;border-top:1px solid #1e3a5f;display:flex;gap:16px;flex-wrap:wrap;">
                        <span style="color:#64748b;font-size:11px;">🏆 Best: <strong style="color:#22c55e">+${gainers[0]?.change}%</strong> ${gainers[0]?.code}</span>
                        <span style="color:#64748b;font-size:11px;">🔴 Worst: <strong style="color:#ef4444">${losers[0]?.change}%</strong> ${losers[0]?.code}</span>
                        <span style="color:#64748b;font-size:11px;">⚡ Most Active: <strong style="color:#f59e0b">${mostActive[0]?.code}</strong> (${mostActive[0]?.volume})</span>
                        <span style="color:#64748b;font-size:11px;">📊 Naik: <strong style="color:#22c55e">${gainers.length}</strong> · Turun: <strong style="color:#ef4444">${losers.length}</strong></span>
                    </div>` : ''}
                </div>
            `;
        }

        // Expose tab switcher globally
        window._idxTrendingTab = function(tab) {
            panel.innerHTML = buildPanel(tab);
        };

        panel.innerHTML = buildPanel(activeTab);

    } catch(e) {
        console.warn('IDX gainers fetch failed:', e.message);
        panel.innerHTML = `
            <div style="background:#0f172a;border:1px solid #1e3a5f;border-radius:14px;padding:14px 18px;color:#475569;font-size:12px;">
                🔥 Top Movers — <span style="color:#ef4444">Gagal memuat (${e.message})</span>
                <button onclick="loadIDXTrendingPanel()" style="margin-left:12px;background:#1e293b;border:1px solid #334155;color:#38bdf8;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px;">⟳ Coba Lagi</button>
            </div>
        `;
    }
}

// ─── IPO Calendar + Dividend Schedule + Corporate Actions ───────────────────
async function loadIDXCorpActions() {
    const panel = document.getElementById('idxCorpActionsPanel');
    if (!panel) return;

    panel.innerHTML = `<div style="color:#475569;font-size:12px;padding:10px 0;">⏳ Memuat jadwal korporasi…</div>`;

    let data;
    try {
        const r = await fetch('http://127.0.0.1:3001/api/idx-corporate-actions');
        data = await r.json();
    } catch(e) {
        panel.innerHTML = `<div style="color:#ef4444;font-size:12px;padding:10px 0;">⚠ Gagal memuat jadwal korporasi (${e.message})</div>`;
        return;
    }

    const { ipo = [], dividends = [], events = [] } = data;

    // Tab state
    window._idxCorpTab = window._idxCorpTab || 'ipo';

    function renderCorpPanel(tab) {
        window._idxCorpTab = tab;
        const tabs = [
            { id:'ipo',  emoji:'📅', label:'IPO Calendar' },
            { id:'div',  emoji:'💰', label:'Jadwal Dividen' },
            { id:'evt',  emoji:'📋', label:'Aksi Korporasi' },
        ];

        const tabBtns = tabs.map(t => `
            <button onclick="window._idxCorpTabSwitch('${t.id}')"
                style="background:${tab===t.id?'#38bdf8':'#1e293b'};color:${tab===t.id?'#0f172a':'#64748b'};
                       border:1px solid ${tab===t.id?'#38bdf8':'#334155'};padding:5px 16px;border-radius:20px;
                       cursor:pointer;font-size:12px;font-weight:${tab===t.id?'700':'400'};transition:all 0.2s;">
                ${t.emoji} ${t.label}
            </button>`).join('');

        let body = '';

        if (tab === 'ipo') {
            const statusColor = { upcoming:'#f59e0b', open:'#22c55e', rights:'#a78bfa', listed:'#38bdf8', closed:'#64748b' };
            const statusLabel = { upcoming:'UPCOMING', open:'OPEN', rights:'RIGHTS ISSUE', listed:'LISTED', closed:'CLOSED' };
            const rows = ipo.map(item => {
                const sc = statusColor[item.status] || '#64748b';
                const sl = statusLabel[item.status] || item.status.toUpperCase();
                const daysStr = item.status === 'upcoming'
                    ? (item.daysUntil > 0 ? `<span style="color:#f59e0b;font-size:10px;">dalam ${item.daysUntil} hari</span>` : `<span style="color:#ef4444;font-size:10px;">hari ini!</span>`)
                    : '';
                const price = item.offerPrice ? `Rp ${item.offerPrice.toLocaleString('id-ID')}` : '—';
                return `<tr style="border-bottom:1px solid #1e293b;">
                    <td style="padding:8px 10px;">
                        <span style="background:${sc}22;color:${sc};border:1px solid ${sc}44;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">${sl}</span>
                    </td>
                    <td style="padding:8px 10px;font-weight:600;color:#e2e8f0;font-size:13px;">${item.code.replace('2','')}</td>
                    <td style="padding:8px 10px;color:#cbd5e1;font-size:12px;max-width:200px;">${item.name}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.sector}</td>
                    <td style="padding:8px 10px;color:#38bdf8;font-size:12px;">${price}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.ipoDate}${daysStr?'<br>'+daysStr:''}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.marketCap || '—'}</td>
                    <td style="padding:8px 10px;color:#64748b;font-size:11px;max-width:220px;">${item.desc}</td>
                </tr>`;
            }).join('');

            body = `<div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-family:monospace;">
                    <thead>
                        <tr style="border-bottom:2px solid #1e3a5f;">
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;font-weight:600;">STATUS</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;font-weight:600;">KODE</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;font-weight:600;">PERUSAHAAN</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;font-weight:600;">SEKTOR</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;font-weight:600;">HARGA IPO</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;font-weight:600;">TGL IPO</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;font-weight:600;">MARKET CAP</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;font-weight:600;">KETERANGAN</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        else if (tab === 'div') {
            const typeColor = { final:'#22c55e', interim:'#38bdf8', special:'#f59e0b' };
            const rows = dividends.map(item => {
                const tc = typeColor[item.type] || '#64748b';
                const exAgo = item.daysUntilEx;
                let exStr;
                if (exAgo < 0)      exStr = `<span style="color:#64748b;">${Math.abs(exAgo)} hari lalu</span>`;
                else if (exAgo === 0) exStr = `<span style="color:#ef4444;font-weight:700;">HARI INI!</span>`;
                else if (exAgo <= 7) exStr = `<span style="color:#f59e0b;font-weight:600;">${exAgo} hari lagi ⚡</span>`;
                else                 exStr = `<span style="color:#94a3b8;">${exAgo} hari lagi</span>`;

                const yieldColor = item.yield >= 8 ? '#22c55e' : item.yield >= 5 ? '#38bdf8' : '#94a3b8';
                return `<tr style="border-bottom:1px solid #1e293b;">
                    <td style="padding:8px 10px;font-weight:600;color:#e2e8f0;font-size:13px;">${item.code}</td>
                    <td style="padding:8px 10px;color:#cbd5e1;font-size:12px;">${item.name}</td>
                    <td style="padding:8px 10px;">
                        <span style="background:${tc}22;color:${tc};border:1px solid ${tc}44;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">${item.type.toUpperCase()}</span>
                    </td>
                    <td style="padding:8px 10px;color:#38bdf8;font-size:13px;font-weight:600;">Rp ${item.amount.toLocaleString('id-ID')}</td>
                    <td style="padding:8px 10px;color:${yieldColor};font-size:13px;font-weight:600;">${item.yield.toFixed(1)}%</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.exDate}<br>${exStr}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.payDate}</td>
                </tr>`;
            }).join('');

            body = `<div style="overflow-x:auto;">
                <div style="font-size:11px;color:#475569;margin-bottom:8px;">💡 Beli saham <strong style="color:#f59e0b">sebelum tanggal Ex-Date</strong> untuk mendapat dividen.</div>
                <table style="width:100%;border-collapse:collapse;font-family:monospace;">
                    <thead>
                        <tr style="border-bottom:2px solid #1e3a5f;">
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">KODE</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">PERUSAHAAN</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">TIPE</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">DIVIDEN/LBR</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">YIELD</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">EX-DATE</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">BAYAR</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        else if (tab === 'evt') {
            const rows = events.map(item => {
                const d = item.daysUntil;
                let dStr;
                if (d < 0)      dStr = `<span style="color:#64748b;">${Math.abs(d)} hari lalu</span>`;
                else if (d === 0) dStr = `<span style="color:#ef4444;font-weight:700;">HARI INI!</span>`;
                else if (d <= 7) dStr = `<span style="color:#f59e0b;font-weight:600;">${d} hari lagi ⚡</span>`;
                else             dStr = `<span style="color:#94a3b8;">${d} hari lagi</span>`;
                return `<tr style="border-bottom:1px solid #1e293b;">
                    <td style="padding:8px 10px;font-weight:600;color:#e2e8f0;font-size:13px;">${item.code}</td>
                    <td style="padding:8px 10px;color:#cbd5e1;font-size:12px;">${item.name}</td>
                    <td style="padding:8px 10px;color:#a78bfa;font-size:12px;font-weight:600;">${item.event}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.date}<br>${dStr}</td>
                    <td style="padding:8px 10px;color:#64748b;font-size:11px;max-width:280px;">${item.desc}</td>
                </tr>`;
            }).join('');

            body = `<div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-family:monospace;">
                    <thead>
                        <tr style="border-bottom:2px solid #1e3a5f;">
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">KODE</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">PERUSAHAAN</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">EVENT</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">TANGGAL</th>
                            <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">KETERANGAN</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        panel.innerHTML = `
            <div style="background:#0f172a;border:1px solid #1e3a5f;border-radius:14px;padding:16px 20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
                    <span style="color:#e2e8f0;font-size:14px;font-weight:700;">🏦 Kalender Korporasi IDX</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">${tabBtns}</div>
                    <button onclick="loadIDXCorpActions()" style="background:#1e293b;border:1px solid #334155;color:#38bdf8;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;">⟳ Refresh</button>
                </div>
                ${body}
            </div>`;
    }

    window._idxCorpTabSwitch = function(tab) { renderCorpPanel(tab); };
    renderCorpPanel(window._idxCorpTab);
}

function filterIDXStocks() {
    const term   = (document.getElementById('idxSearchStock')?.value || '').toLowerCase();
    const sector = document.getElementById('idxSectorFilter')?.value || 'all';
    const source = _idxLiveData || IDX_STOCKS;
    _idxPage = 1; // reset to page 1 on filter change
    const filtered = source.filter(s => {
        const matchSearch = !term || s.code.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
        const matchSector = sector === 'all' || s.sector === sector;
        return matchSearch && matchSector;
    });
    renderIDXStocks(filtered);
}

function renderIDXStocks(stocks) {
    const tbody = document.getElementById('idxStockTableBody');
    if (!tbody) return;

    if (!stocks || !stocks.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Tidak ada saham ditemukan.</td></tr>';
        _renderIDXPagination(0, 0);
        return;
    }

    const totalPages = Math.ceil(stocks.length / IDX_PAGE_SIZE);
    if (_idxPage > totalPages) _idxPage = totalPages;
    if (_idxPage < 1) _idxPage = 1;

    const start = (_idxPage - 1) * IDX_PAGE_SIZE;
    const pageStocks = stocks.slice(start, start + IDX_PAGE_SIZE);
    const globalStart = start; // for row numbering

    tbody.innerHTML = pageStocks.map((s, i) => {
        const cls  = s.change >= 0 ? 'positive' : 'negative';
        const sign = s.change >= 0 ? '+' : '';
        const signals = (typeof window !== 'undefined' && window.computeIDXSignals)
            ? window.computeIDXSignals(s)
            : { whale:false, inflowText: s.foreign || '—', trending:false, trendLabel:'—', score:0 };

        // RSI color
        const rsi = s.rsi || 50;
        const rsiColor = rsi >= 70 ? '#f87171' : rsi >= 55 ? '#4ade80' : rsi <= 30 ? '#f87171' : '#94a3b8';
        const rsiLabel = rsi >= 70 ? 'OB' : rsi <= 30 ? 'OS' : 'OK';

        // MACD badge
        const macdColor = s.macdSignal === 'bullish' ? '#4ade80' : s.macdSignal === 'bearish' ? '#f87171' : '#94a3b8';
        const macdIcon  = s.macdSignal === 'bullish' ? '▲' : s.macdSignal === 'bearish' ? '▼' : '─';

        // 52-week position bar (0-100%)
        const w52Pct = s.w52h && s.w52l && s.price ? Math.min(100, Math.max(0, Math.round(((s.price - s.w52l) / (s.w52h - s.w52l)) * 100))) : 50;
        const w52Color = w52Pct >= 80 ? '#f59e0b' : w52Pct >= 50 ? '#4ade80' : '#94a3b8';

        // Composite mini-score
        const score = signals.score || 0;
        const scoreColor = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

        // Live indicator dot
        const liveDot = s._live ? '<span title="Data live" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;margin-left:4px;vertical-align:middle;box-shadow:0 0 4px #22c55e"></span>' : '';

        // Whale badge
        const whaleBadge = signals.whale ? '<span class="badge whale">🐋</span> ' : '';

        // Price display — show placeholder if live failed
        const priceDisplay = s.price ? `Rp ${s.price.toLocaleString('id-ID')}` : '<span style="color:#475569">—</span>';
        const changeDisplay = s.change != null ? `<span class="idx-change-pill ${cls}">${sign}${s.change}%</span>` : '<span style="color:#475569">—</span>';

        return `
            <tr class="idx-row ${(s.change||0) >= 0 ? 'idx-row--up' : 'idx-row--down'}" onclick="showIDXStockAnalysis(${JSON.stringify(s).replace(/"/g, '&quot;')})">
                <td class="idx-rank">${globalStart + i + 1}</td>
                <td class="idx-ticker">
                    <div class="idx-ticker-wrap">
                        <span class="idx-ticker-code">${s.code}${liveDot}</span>
                        <span class="idx-ticker-name">${s.name}</span>
                    </div>
                </td>
                <td><span class="idx-sector-pill">${(s.sector||'').replace(/_/g,' ')}</span></td>
                <td class="idx-price"><strong>${priceDisplay}</strong></td>
                <td class="${cls} idx-change">${changeDisplay}</td>
                <td>
                    <div class="idx-rsi-cell">
                        <span style="color:${rsiColor};font-weight:700">${rsi}</span>
                        <span class="idx-rsi-label" style="background:${rsiColor}22;color:${rsiColor}">${rsiLabel}</span>
                    </div>
                </td>
                <td>
                    <span style="color:${macdColor};font-weight:700;font-size:0.8rem">${macdIcon} ${s.macdSignal||'—'}</span>
                </td>
                <td>
                    <div class="idx-52w-bar-wrap">
                        <div class="idx-52w-bar">
                            <div class="idx-52w-fill" style="width:${w52Pct}%;background:${w52Color}"></div>
                            <div class="idx-52w-dot" style="left:${w52Pct}%"></div>
                        </div>
                        <span class="idx-52w-pct" style="color:${w52Color}">${w52Pct}%</span>
                    </div>
                </td>
                <td>${signals.inflowText} ${whaleBadge}</td>
                <td>
                    <div class="idx-score-cell">
                        <div class="idx-score-mini-bar">
                            <div style="width:${score}%;background:${scoreColor};height:100%;border-radius:2px;transition:width 0.6s ease"></div>
                        </div>
                        <span style="color:${scoreColor};font-weight:700;font-size:0.78rem">${score}</span>
                    </div>
                </td>
                <td onclick="event.stopPropagation()">
                    <button class="btn-action btn-action--expert" onclick="showIDXStockAnalysis(${JSON.stringify(s).replace(/"/g, '&quot;')})">📊 Analisa</button>
                </td>
            </tr>
        `;
    }).join('');

    _renderIDXPagination(totalPages, stocks.length);
}

function _renderIDXPagination(totalPages, totalStocks) {
    // Find or create pagination container below the table
    let pg = document.getElementById('idxPagination');
    if (!pg) {
        const tableWrap = document.getElementById('idxStockTableBody')?.closest('table')?.parentElement;
        if (!tableWrap) return;
        pg = document.createElement('div');
        pg.id = 'idxPagination';
        pg.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:14px 4px;gap:8px;flex-wrap:wrap;';
        tableWrap.insertAdjacentElement('afterend', pg);
    }

    if (totalPages <= 1) {
        pg.innerHTML = `<span style="color:#475569;font-size:12px;">${totalStocks} saham tersedia</span>`;
        return;
    }

    const start = (_idxPage - 1) * IDX_PAGE_SIZE + 1;
    const end   = Math.min(_idxPage * IDX_PAGE_SIZE, totalStocks);

    // Build page buttons — show max 7 buttons with ellipsis
    const pages = [];
    const WINDOW = 2;
    for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || (p >= _idxPage - WINDOW && p <= _idxPage + WINDOW)) {
            pages.push(p);
        } else if (pages[pages.length - 1] !== '…') {
            pages.push('…');
        }
    }

    const btnStyle = (active) => active
        ? 'background:#38bdf8;color:#0f172a;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:700;font-size:12px;'
        : 'background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;';
    const navStyle = (disabled) => `background:#1e293b;color:${disabled?'#334155':'#94a3b8'};border:1px solid #334155;padding:6px 12px;border-radius:6px;cursor:${disabled?'default':'pointer'};font-size:12px;`;

    pg.innerHTML = `
        <span style="color:#64748b;font-size:12px;">Menampilkan ${start}–${end} dari <strong style="color:#94a3b8">${totalStocks}</strong> saham</span>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
            <button style="${navStyle(_idxPage===1)}" ${_idxPage===1?'disabled':''} onclick="_idxGoPage(${_idxPage-1})">‹ Prev</button>
            ${pages.map(p => p === '…'
                ? `<span style="color:#475569;padding:6px 4px;">…</span>`
                : `<button style="${btnStyle(p===_idxPage)}" onclick="_idxGoPage(${p})">${p}</button>`
            ).join('')}
            <button style="${navStyle(_idxPage===totalPages)}" ${_idxPage===totalPages?'disabled':''} onclick="_idxGoPage(${_idxPage+1})">Next ›</button>
        </div>
        <span style="color:#475569;font-size:11px;">Hal. ${_idxPage} / ${totalPages}</span>
    `;
}

function _idxGoPage(page) {
    _idxPage = page;
    const source = _idxLiveData || IDX_STOCKS;
    // Re-apply current filter
    const term   = (document.getElementById('idxSearchStock')?.value || '').toLowerCase();
    const sector = document.getElementById('idxSectorFilter')?.value || 'all';
    const filtered = source.filter(s => {
        const matchSearch = !term || s.code.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
        const matchSector = sector === 'all' || s.sector === sector;
        return matchSearch && matchSector;
    });
    renderIDXStocks(filtered);
    // Scroll to top of table
    document.getElementById('idxStockTableBody')?.closest('table')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

// ─────────────────────────────────────────────
//  Signal helpers: parse numbers and compute simple heuristics for whale accumulation,
//  inflow volume and trending score. Exposed as window.computeIDXSignals(stock)
// ─────────────────────────────────────────────
function parseCompactNumber(str) {
    if (str == null) return 0;
    try {
        str = String(str).trim();
        // remove Rp, , and whitespace
        str = str.replace(/Rp|\s|,/gi, '');
        // handle plus/minus
        const sign = str.startsWith('-') ? -1 : 1;
        str = str.replace(/^[+-]/, '');
        // handle units
        const unit = str.slice(-1).toUpperCase();
        if (unit === 'K' || unit === 'M' || unit === 'B') {
            const num = parseFloat(str.slice(0, -1)) || 0;
            if (unit === 'K') return sign * num * 1e3;
            if (unit === 'M') return sign * num * 1e6;
            if (unit === 'B') return sign * num * 1e9;
        }
        // if contains letters like 'lot' or 'M' in the middle
        const cleaned = str.replace(/[^0-9.\-]/g, '');
        return sign * (parseFloat(cleaned) || 0);
    } catch (e) { return 0; }
}

function computeIDXSignals(stock) {
    // volume can be '82.4M' or '312M' or '44.7M' or raw number
    const vol = parseCompactNumber(stock.volume);
    // value like 'Rp 807B' -> numeric
    const val = parseCompactNumber(stock.value);
    // foreign like '+12B'
    const foreign = parseCompactNumber(stock.foreign);

    // heuristics
    let score = 0;
    if (vol >= 50e6) score += 2;           // very high trading volume
    else if (vol >= 10e6) score += 1;      // elevated volume
    if ((Number(stock.change) || 0) >= 2) score += 1; // strong price move
    if (foreign > 0) score += 1;           // net foreign inflow
    if ((stock.technical || '').toLowerCase().includes('bull')) score += 1;

    const whale = score >= 3;

    // inflow text: prefer showing foreign if available, otherwise show value
    const inflowText = foreign ? (foreign > 0 ? `+Rp ${Math.round(foreign).toLocaleString('id-ID')}` : `-Rp ${Math.abs(Math.round(foreign)).toLocaleString('id-ID')}`)
        : (val ? `Rp ${Math.round(val).toLocaleString('id-ID')}` : stock.value || '—');

    // trending: change magnitude + volume
    const trending = ((Number(stock.change) || 0) >= 1 && vol >= 5e6) || (vol >= 100e6 && Number(stock.change) !== 0);
    const trendLabel = trending ? (stock.change > 0 ? 'Uptrend' : 'Downtrend') : 'Flat/No Flow';

    // composite score 0-100 for mini bar
    let cscore = 20;
    const tech = (stock.technical||'').toLowerCase();
    if (tech.includes('strong bull')) cscore = 85;
    else if (tech.includes('bullish')) cscore = 65;
    else if (tech.includes('neutral')) cscore = 45;
    else if (tech.includes('bearish')) cscore = 25;
    else if (tech.includes('strong bear')) cscore = 10;
    if (foreign > 5e9) cscore = Math.min(cscore + 10, 100);
    else if (foreign < -5e9) cscore = Math.max(cscore - 10, 0);
    if ((Number(stock.change)||0) >= 2) cscore = Math.min(cscore + 5, 100);
    if ((Number(stock.change)||0) <= -2) cscore = Math.max(cscore - 5, 0);

    return { whale, inflowText, trending, trendLabel, vol, val, foreign, score: cscore };
}

// expose for detail panel
if (typeof window !== 'undefined') window.computeIDXSignals = computeIDXSignals;

function updateIDXSessionStatus() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const h = now.getHours();
    const m = now.getMinutes();
    const mins = h * 60 + m;
    const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;

    const set = (id, label) => {
        const el = document.getElementById(id);
        if (el) el.textContent = label;
    };

    if (!isWeekday) {
        ['idxPreOpeningStatus','idxSession1Status','idxSession2Status','idxPostTradingStatus']
            .forEach(id => set(id, 'Closed (Weekend)'));
        return;
    }

    set('idxPreOpeningStatus', (mins >= 8*60+45 && mins < 9*60)     ? '🟢 Open'   : '🔴 Closed');
    set('idxSession1Status',   (mins >= 9*60    && mins < 12*60)     ? '🟢 Open'   : '🔴 Closed');
    set('idxSession2Status',   (mins >= 13*60+30 && mins < 14*60+49) ? '🟢 Open'   : '🔴 Closed');
    set('idxPostTradingStatus',(mins >= 14*60+49 && mins < 15*60+15) ? '🟢 Open'   : '🔴 Closed');
}

function populateIDXStatsPlaceholder() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('ihsgValue',    '7.284');
    set('ihsgChange',   '+0.42%');
    set('idxVolume',    '18.4B lot');
    set('idxValue',     'Rp 12.8T');
    set('idxForeignFlow','+ Rp 1.2T');
    set('idxBreadth',   '248 naik / 192 turun');
}

function simulateIDXSectorHeatmap() {
    const sectors = { banking:'+0.3%', mining:'+1.8%', consumer:'-0.5%', infrastructure:'+0.6%', property:'+1.1%', healthcare:'-0.3%' };
    document.querySelectorAll('#idxSectorHeatmap .heatmap-item').forEach(item => {
        const key = item.dataset.sector;
        if (!key) return;
        const val = parseFloat(sectors[key]);
        const changeEl = item.querySelector('.sector-change');
        if (changeEl) {
            changeEl.textContent = sectors[key] || '--';
            changeEl.className = 'sector-change ' + (val >= 0 ? 'positive' : 'negative');
        }
        item.style.background = val >= 0
            ? `rgba(34,197,94,${Math.min(0.12 + Math.abs(val)*0.08, 0.35)})`
            : `rgba(239,68,68,${Math.min(0.12 + Math.abs(val)*0.08, 0.35)})`;
    });
}

// ─────────────────────────────────────────────
//  US STOCKS
// ─────────────────────────────────────────────
function loadUSStocks() {
    updateUSSessionStatus();
    populateUSStatsPlaceholder();
    renderUSStocks(US_STOCKS);
    simulateUSSectorRotation();
    loadUSCorpActions();

    const searchInput = document.getElementById('usSearchStock');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            const term = searchInput.value.toLowerCase();
            const filtered = US_STOCKS.filter(s =>
                s.ticker.toLowerCase().includes(term) || s.name.toLowerCase().includes(term)
            );
            renderUSStocks(filtered);
        });
    }
}

function renderUSStocks(stocks) {
    const tbody = document.getElementById('usStockTableBody');
    if (!tbody) return;

    if (!stocks.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">No stocks found.</td></tr>';
        return;
    }

    tbody.innerHTML = stocks.map((s, i) => {
        const cls    = s.change >= 0 ? 'positive' : 'negative';
        const sign   = s.change >= 0 ? '+' : '';
        const chgAbs = Math.abs(s.change);

        // Technical signal badge
        const techLow = (s.technical || '').toLowerCase();
        const techColor = techLow.includes('strong bull') ? '#22c55e'
            : techLow.includes('bull') ? '#86efac'
            : techLow.includes('strong bear') ? '#ef4444'
            : techLow.includes('bear') ? '#fca5a5'
            : '#94a3b8';

        // Options quick-info (IV, signals)
        const rsi   = s.rsi  || '—';
        const macd  = s.macd || '—';
        const rsiNum = parseFloat(rsi);
        const rsiColor = rsiNum >= 70 ? '#ef4444' : rsiNum <= 30 ? '#22c55e' : '#94a3b8';
        const optStr = `<span style="color:${rsiColor};font-size:11px;">RSI ${rsi}</span>`;

        const sData = JSON.stringify(s).replace(/"/g, '&quot;');

        return `
            <tr>
                <td style="color:#475569;">${i + 1}</td>
                <td>
                    <div style="font-weight:700;color:#e2e8f0;">${s.ticker}</div>
                    <div style="font-size:10px;color:#475569;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.name || ''}</div>
                </td>
                <td style="color:#94a3b8;font-size:12px;">${s.sector || '—'}</td>
                <td style="color:#6366f1;font-size:11px;font-weight:600;">${s.exchange || 'US'}</td>
                <td style="font-weight:600;color:#e2e8f0;">$${Number(s.price||0).toFixed(2)}</td>
                <td class="${cls}" style="font-weight:600;">${sign}${s.change}%</td>
                <td style="color:#94a3b8;font-size:12px;">${s.volume || '—'}</td>
                <td style="color:#94a3b8;font-size:12px;">${s.marketCap || '—'}</td>
                <td>
                    <span style="color:${techColor};font-size:12px;font-weight:600;">${s.technical || '—'}</span>
                </td>
                <td>${optStr}</td>
                <td>
                    <div style="display:flex;gap:5px;align-items:center;">
                        <button class="btn-action" onclick="showUSStockAnalysis(${sData})" title="Analisa Teknikal" style="padding:4px 10px;font-size:11px;">📊 Analisa</button>
                        <button onclick="window.open('https://finance.yahoo.com/quote/${s.ticker}','_blank')" title="Yahoo Finance" style="background:#1e293b;border:1px solid #334155;color:#f59e0b;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;">📰</button>
                        <button onclick="window.open('https://www.tradingview.com/chart/?symbol=${s.ticker}','_blank')" title="TradingView Chart" style="background:#1e293b;border:1px solid #334155;color:#22c55e;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:11px;">📈</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateUSSessionStatus() {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const mins = now.getHours() * 60 + now.getMinutes();
    const isWeekday = now.getDay() >= 1 && now.getDay() <= 5;

    const set = (id, label) => { const el = document.getElementById(id); if (el) el.textContent = label; };

    if (!isWeekday) {
        ['usPreMarketStatus','usRegularStatus','usAfterHoursStatus'].forEach(id => set(id, 'Closed (Weekend)'));
        return;
    }
    set('usPreMarketStatus',  (mins >= 4*60   && mins < 9*60+30)  ? '🟢 Open' : '🔴 Closed');
    set('usRegularStatus',    (mins >= 9*60+30 && mins < 16*60)   ? '🟢 Open' : '🔴 Closed');
    set('usAfterHoursStatus', (mins >= 16*60  && mins < 20*60)    ? '🟢 Open' : '🔴 Closed');
}

function populateUSStatsPlaceholder() {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('sp500Value',       '5.184 (+0.32%)');
    set('nasdaqValue',      '16.384 (+0.61%)');
    set('dowValue',         '38.924 (+0.11%)');
    set('vixValue',         '16.42 (-2.1%)');
    set('treasury10yValue', '4.28%');
    set('dxyValue',         '104.12 (-0.21%)');
}

function simulateUSSectorRotation() {
    const data = {
        technology: { change:'+1.2%', status:'🔄 Rotating IN' },
        healthcare:  { change:'+0.1%', status:'➡️ Neutral' },
        financials:  { change:'-0.2%', status:'🔄 Rotating OUT' },
        energy:      { change:'-0.8%', status:'🔄 Rotating OUT' },
        consumer:    { change:'+0.9%', status:'🔄 Rotating IN' },
        industrials: { change:'+0.3%', status:'➡️ Neutral' },
    };
    document.querySelectorAll('#usSectorRotation .rotation-item').forEach(item => {
        const key = item.dataset.sector;
        if (!key || !data[key]) return;
        const val = parseFloat(data[key].change);
        const changeEl = item.querySelector('.sector-change');
        const statusEl = item.querySelector('.rotation-status');
        if (changeEl) {
            changeEl.textContent = data[key].change;
            changeEl.className = 'sector-change ' + (val >= 0 ? 'positive' : 'negative');
        }
        if (statusEl) statusEl.textContent = data[key].status;
        item.style.background = val >= 0
            ? `rgba(34,197,94,${Math.min(0.1 + Math.abs(val)*0.06, 0.30)})`
            : `rgba(239,68,68,${Math.min(0.1 + Math.abs(val)*0.06, 0.30)})`;
    });
}

// ─── US Corporate Actions Panel ─────────────────────────────────────────────
async function loadUSCorpActions() {
    const panel = document.getElementById('usCorpActionsPanel');
    if (!panel) return;

    panel.innerHTML = `<div style="color:#475569;font-size:12px;padding:10px 0;">⏳ Memuat jadwal korporasi US…</div>`;

    let data;
    try {
        const r = await fetch('http://127.0.0.1:3001/api/us-corporate-actions');
        data = await r.json();
    } catch(e) {
        panel.innerHTML = `<div style="color:#ef4444;font-size:12px;padding:10px 0;">⚠ Gagal memuat (${e.message})</div>`;
        return;
    }

    const { ipo = [], dividends = [], earnings = [] } = data;
    window._usCorpTab = window._usCorpTab || 'earnings';

    function renderUSCorpPanel(tab) {
        window._usCorpTab = tab;
        const tabs = [
            { id:'earnings', emoji:'📊', label:'Earnings Calendar' },
            { id:'ipo',      emoji:'🚀', label:'IPO Pipeline' },
            { id:'div',      emoji:'💵', label:'Dividend Schedule' },
        ];

        const tabBtns = tabs.map(t => `
            <button onclick="window._usCorpTabSwitch('${t.id}')"
                style="background:${tab===t.id?'#6366f1':'#1e293b'};color:${tab===t.id?'#fff':'#64748b'};
                       border:1px solid ${tab===t.id?'#6366f1':'#334155'};padding:5px 16px;border-radius:20px;
                       cursor:pointer;font-size:12px;font-weight:${tab===t.id?'700':'400'};transition:all 0.2s;">
                ${t.emoji} ${t.label}
            </button>`).join('');

        let body = '';

        if (tab === 'earnings') {
            const impColor = { high:'#ef4444', medium:'#f59e0b', low:'#64748b' };
            const rows = earnings.map(item => {
                const d = item.daysUntil;
                let dStr;
                if (d < 0)       dStr = `<span style="color:#64748b;">${Math.abs(d)}d ago</span>`;
                else if (d === 0) dStr = `<span style="color:#ef4444;font-weight:700;">TODAY ⚡</span>`;
                else if (d <= 3)  dStr = `<span style="color:#f59e0b;font-weight:600;">${d}d ⚡</span>`;
                else              dStr = `<span style="color:#94a3b8;">${d}d</span>`;
                const timeLabel = item.time === 'after-close' ? '🌙 After' : '🌅 Before';
                const epsGrowth = item.prev_eps > 0 ? ((item.est_eps - item.prev_eps)/item.prev_eps*100).toFixed(0) : '—';
                const epsColor = parseFloat(epsGrowth) >= 0 ? '#22c55e' : '#ef4444';
                return `<tr style="border-bottom:1px solid #1e293b;">
                    <td style="padding:8px 10px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${impColor[item.importance]||'#64748b'};display:inline-block;margin-right:4px;"></span>
                    </td>
                    <td style="padding:8px 10px;font-weight:700;color:#e2e8f0;font-size:13px;">${item.ticker}</td>
                    <td style="padding:8px 10px;color:#cbd5e1;font-size:12px;">${item.name}</td>
                    <td style="padding:8px 10px;color:#38bdf8;font-size:12px;">${item.date}<br>${dStr}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${timeLabel}</td>
                    <td style="padding:8px 10px;color:#e2e8f0;font-size:12px;font-weight:600;">$${item.est_eps}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">$${item.prev_eps}</td>
                    <td style="padding:8px 10px;color:${epsColor};font-size:12px;font-weight:600;">${epsGrowth !== '—' ? (parseFloat(epsGrowth)>=0?'+':'')+epsGrowth+'%' : '—'}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.est_rev}</td>
                </tr>`;
            }).join('');
            body = `<div style="overflow-x:auto;">
                <div style="font-size:11px;color:#475569;margin-bottom:8px;">🔴 High impact &nbsp; 🟡 Medium &nbsp; — EPS estimates dari konsensus analis</div>
                <table style="width:100%;border-collapse:collapse;font-family:monospace;">
                    <thead><tr style="border-bottom:2px solid #1e3a5f;">
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">!</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">TICKER</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">PERUSAHAAN</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">TANGGAL</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">WAKTU</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">EST EPS</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">PREV EPS</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">EPS GROWTH</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">EST REVENUE</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        else if (tab === 'ipo') {
            const statusColor = { upcoming:'#f59e0b', listed:'#38bdf8', rights:'#a78bfa' };
            const rows = ipo.map(item => {
                const sc = statusColor[item.status] || '#64748b';
                const d = item.daysUntil;
                let dStr = '';
                if (item.status === 'upcoming') {
                    if (d <= 0)      dStr = `<span style="color:#ef4444;font-weight:700;">HARI INI!</span>`;
                    else if (d <= 7) dStr = `<span style="color:#f59e0b;font-weight:600;">${d}d lagi ⚡</span>`;
                    else             dStr = `<span style="color:#94a3b8;">${d}d lagi</span>`;
                }
                const price = item.offerPrice ? `$${item.offerPrice}` : 'TBD';
                return `<tr style="border-bottom:1px solid #1e293b;">
                    <td style="padding:8px 10px;">
                        <span style="background:${sc}22;color:${sc};border:1px solid ${sc}44;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">${item.status.toUpperCase()}</span>
                    </td>
                    <td style="padding:8px 10px;font-weight:700;color:#e2e8f0;font-size:13px;">${item.ticker}</td>
                    <td style="padding:8px 10px;color:#cbd5e1;font-size:12px;max-width:180px;">${item.name}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.sector}</td>
                    <td style="padding:8px 10px;color:#a78bfa;font-size:11px;font-weight:600;">${item.exchange}</td>
                    <td style="padding:8px 10px;color:#38bdf8;font-size:12px;">${price}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.ipoDate}${dStr?'<br>'+dStr:''}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.marketCap || '—'}</td>
                    <td style="padding:8px 10px;color:#64748b;font-size:11px;max-width:220px;">${item.desc}</td>
                </tr>`;
            }).join('');
            body = `<div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-family:monospace;">
                    <thead><tr style="border-bottom:2px solid #1e3a5f;">
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">STATUS</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">TICKER</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">PERUSAHAAN</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">SEKTOR</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">EXCHANGE</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">HARGA IPO</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">TANGGAL</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">MARKET CAP</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">KETERANGAN</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        else if (tab === 'div') {
            const freqColor = { monthly:'#22c55e', quarterly:'#38bdf8', annual:'#a78bfa' };
            const rows = dividends.map(item => {
                const d = item.daysUntilEx;
                let dStr;
                if (d < 0)       dStr = `<span style="color:#64748b;">${Math.abs(d)}d ago</span>`;
                else if (d === 0) dStr = `<span style="color:#ef4444;font-weight:700;">TODAY!</span>`;
                else if (d <= 7)  dStr = `<span style="color:#f59e0b;font-weight:600;">${d}d ⚡</span>`;
                else              dStr = `<span style="color:#94a3b8;">${d}d</span>`;
                const yieldColor = item.yield >= 5 ? '#22c55e' : item.yield >= 3 ? '#38bdf8' : '#94a3b8';
                const fc = freqColor[item.frequency] || '#64748b';
                return `<tr style="border-bottom:1px solid #1e293b;">
                    <td style="padding:8px 10px;font-weight:700;color:#e2e8f0;font-size:13px;">${item.ticker}</td>
                    <td style="padding:8px 10px;color:#cbd5e1;font-size:12px;">${item.name}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.sector}</td>
                    <td style="padding:8px 10px;">
                        <span style="background:${fc}22;color:${fc};border:1px solid ${fc}44;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700;">${item.frequency.toUpperCase()}</span>
                    </td>
                    <td style="padding:8px 10px;color:#38bdf8;font-size:13px;font-weight:600;">$${item.amount}</td>
                    <td style="padding:8px 10px;color:${yieldColor};font-size:13px;font-weight:600;">${item.yield.toFixed(1)}%</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.exDate}<br>${dStr}</td>
                    <td style="padding:8px 10px;color:#94a3b8;font-size:11px;">${item.payDate}</td>
                </tr>`;
            }).join('');
            body = `<div style="overflow-x:auto;">
                <div style="font-size:11px;color:#475569;margin-bottom:8px;">💡 Beli sebelum <strong style="color:#f59e0b">Ex-Date</strong> untuk mendapat dividen. Semua nilai dalam USD.</div>
                <table style="width:100%;border-collapse:collapse;font-family:monospace;">
                    <thead><tr style="border-bottom:2px solid #1e3a5f;">
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">TICKER</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">PERUSAHAAN</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">SEKTOR</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">FREKUENSI</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">DIVIDEN/SHR</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">YIELD</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">EX-DATE</th>
                        <th style="padding:8px 10px;text-align:left;color:#475569;font-size:11px;">PAY DATE</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        }

        panel.innerHTML = `
            <div style="background:#0f172a;border:1px solid #312e81;border-radius:14px;padding:16px 20px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
                    <span style="color:#e2e8f0;font-size:14px;font-weight:700;">🇺🇸 US Market Calendar</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">${tabBtns}</div>
                    <button onclick="loadUSCorpActions()" style="background:#1e293b;border:1px solid #334155;color:#6366f1;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;">⟳ Refresh</button>
                </div>
                ${body}
            </div>`;
    }

    window._usCorpTabSwitch = function(tab) { renderUSCorpPanel(tab); };
    renderUSCorpPanel(window._usCorpTab);
}
