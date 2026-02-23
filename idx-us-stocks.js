// IDX & US Stocks Module
// Provides loadIDXStocks() and loadUSStocks() called by app.js switchTab()
console.log('✅ idx-us-stocks.js loaded');

// ─────────────────────────────────────────────
//  MOCK DATA  (replace with real API calls later)
// ─────────────────────────────────────────────
const IDX_STOCKS = [
    { code:'BBCA', name:'Bank Central Asia',       sector:'banking',        price:9800,  change:0.51,  volume:'82.4M',  value:'Rp 807B',  foreign:'+12B',   marketCap:'Rp 2.408T', technical:'📈 Bullish' },
    { code:'BMRI', name:'Bank Mandiri',            sector:'banking',        price:6225,  change:-0.40, volume:'61.1M',  value:'Rp 380B',  foreign:'-5B',    marketCap:'Rp 1.448T', technical:'➡️ Neutral' },
    { code:'BBRI', name:'Bank Rakyat Indonesia',   sector:'banking',        price:4990,  change:0.20,  volume:'95.2M',  value:'Rp 475B',  foreign:'+8B',    marketCap:'Rp 1.226T', technical:'📈 Bullish' },
    { code:'ANTM', name:'Aneka Tambang',           sector:'mining',         price:1645,  change:2.18,  volume:'312M',   value:'Rp 513B',  foreign:'+22B',   marketCap:'Rp 394B',   technical:'🚀 Strong Bull' },
    { code:'ADRO', name:'Adaro Energy Indonesia',  sector:'mining',         price:2460,  change:-1.20, volume:'54M',    value:'Rp 132B',  foreign:'-9B',    marketCap:'Rp 786B',   technical:'📉 Bearish' },
    { code:'ITMG', name:'Indo Tambangraya Megah',  sector:'mining',         price:26200, change:0.77,  volume:'3.2M',   value:'Rp 84B',   foreign:'+4B',    marketCap:'Rp 295B',   technical:'➡️ Neutral' },
    { code:'UNVR', name:'Unilever Indonesia',      sector:'consumer',       price:2100,  change:-0.95, volume:'18.9M',  value:'Rp 39B',   foreign:'-3B',    marketCap:'Rp 80B',    technical:'📉 Bearish' },
    { code:'ICBP', name:'Indofood CBP',            sector:'consumer',       price:9725,  change:0.26,  volume:'12.4M',  value:'Rp 120B',  foreign:'+2B',    marketCap:'Rp 113B',   technical:'➡️ Neutral' },
    { code:'TLKM', name:'Telkom Indonesia',        sector:'infrastructure', price:3090,  change:0.65,  volume:'44.7M',  value:'Rp 138B',  foreign:'+7B',    marketCap:'Rp 305B',   technical:'📈 Bullish' },
    { code:'BSDE', name:'Bumi Serpong Damai',      sector:'property',       price:1225,  change:1.24,  volume:'28.6M',  value:'Rp 35B',   foreign:'+1B',    marketCap:'Rp 72B',    technical:'📈 Bullish' },
    { code:'HEAL', name:'Medikaloka Hermina',      sector:'healthcare',     price:1620,  change:-0.61, volume:'9.8M',   value:'Rp 16B',   foreign:'-1B',    marketCap:'Rp 38B',    technical:'➡️ Neutral' },
];

const US_STOCKS = [
    { ticker:'AAPL',  name:'Apple Inc.',            sector:'technology',  price:226.84, change:0.42,  volume:'55.2M',  marketCap:'$3.45T', pe:'36.2', eps:'6.26',  technical:'📈 Bullish' },
    { ticker:'MSFT',  name:'Microsoft Corp.',       sector:'technology',  price:412.18, change:-0.31, volume:'22.1M',  marketCap:'$3.06T', pe:'34.8', eps:'11.84', technical:'➡️ Neutral' },
    { ticker:'GOOGL', name:'Alphabet Inc.',         sector:'technology',  price:184.52, change:1.05,  volume:'18.9M',  marketCap:'$2.28T', pe:'23.4', eps:'7.88',  technical:'🚀 Strong Bull' },
    { ticker:'NVDA',  name:'NVIDIA Corp.',          sector:'technology',  price:823.40, change:2.10,  volume:'41.5M',  marketCap:'$2.02T', pe:'65.1', eps:'12.65', technical:'🚀 Strong Bull' },
    { ticker:'JPM',   name:'JPMorgan Chase',        sector:'financials',  price:241.76, change:-0.18, volume:'9.4M',   marketCap:'$696B',  pe:'12.8', eps:'18.88', technical:'➡️ Neutral' },
    { ticker:'JNJ',   name:'Johnson & Johnson',     sector:'healthcare',  price:158.22, change:0.08,  volume:'7.1M',   marketCap:'$381B',  pe:'15.6', eps:'10.14', technical:'➡️ Neutral' },
    { ticker:'XOM',   name:'Exxon Mobil',           sector:'energy',      price:112.33, change:-0.55, volume:'14.2M',  marketCap:'$449B',  pe:'14.2', eps:'7.91',  technical:'📉 Bearish' },
    { ticker:'AMZN',  name:'Amazon.com Inc.',       sector:'consumer',    price:218.50, change:1.32,  volume:'31.8M',  marketCap:'$2.31T', pe:'43.6', eps:'5.01',  technical:'📈 Bullish' },
    { ticker:'BA',    name:'Boeing Co.',            sector:'industrials', price:168.92, change:-1.22, volume:'11.3M',  marketCap:'$129B',  pe:'N/A',  eps:'-3.41', technical:'📉 Bearish' },
    { ticker:'TSLA',  name:'Tesla Inc.',            sector:'consumer',    price:312.70, change:3.41,  volume:'122.4M', marketCap:'$998B',  pe:'88.2', eps:'3.54',  technical:'🚀 Strong Bull' },
];

// ─────────────────────────────────────────────
//  IDX STOCKS
// ─────────────────────────────────────────────
function loadIDXStocks() {
    updateIDXSessionStatus();
    populateIDXStatsPlaceholder();
    renderIDXStocks(IDX_STOCKS);
    simulateIDXSectorHeatmap();

    // Wire up search & sector filter
    const searchInput = document.getElementById('idxSearchStock');
    const sectorFilter = document.getElementById('idxSectorFilter');
    if (searchInput) {
        searchInput.addEventListener('input', () => filterIDXStocks());
    }
    if (sectorFilter) {
        sectorFilter.addEventListener('change', () => filterIDXStocks());
    }
}

function filterIDXStocks() {
    const term   = (document.getElementById('idxSearchStock')?.value || '').toLowerCase();
    const sector = document.getElementById('idxSectorFilter')?.value || 'all';
    const filtered = IDX_STOCKS.filter(s => {
        const matchSearch = !term || s.code.toLowerCase().includes(term) || s.name.toLowerCase().includes(term);
        const matchSector = sector === 'all' || s.sector === sector;
        return matchSearch && matchSector;
    });
    renderIDXStocks(filtered);
}

function renderIDXStocks(stocks) {
    const tbody = document.getElementById('idxStockTableBody');
    if (!tbody) return;

    if (!stocks.length) {
        tbody.innerHTML = '<tr><td colspan="11" class="loading">Tidak ada saham ditemukan.</td></tr>';
        return;
    }

    tbody.innerHTML = stocks.map((s, i) => {
        const cls = s.change >= 0 ? 'positive' : 'negative';
        const sign = s.change >= 0 ? '+' : '';
        return `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${s.code}</strong></td>
                <td>${s.sector}</td>
                <td>Rp ${s.price.toLocaleString('id-ID')}</td>
                <td class="${cls}">${sign}${s.change}%</td>
                <td>${s.volume}</td>
                <td>${s.value}</td>
                <td>${s.foreign}</td>
                <td>${s.marketCap}</td>
                <td>${s.technical}</td>
                <td>
                    <button class="btn-action" onclick="showIDXStockAnalysis(${JSON.stringify(s).replace(/"/g, '&quot;')})">Detail</button>
                </td>
            </tr>
        `;
    }).join('');
}

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
        tbody.innerHTML = '<tr><td colspan="10" class="loading">No stocks found.</td></tr>';
        return;
    }

    tbody.innerHTML = stocks.map((s, i) => {
        const cls  = s.change >= 0 ? 'positive' : 'negative';
        const sign = s.change >= 0 ? '+' : '';
        return `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${s.ticker}</strong></td>
                <td>${s.sector}</td>
                <td>$${s.price.toFixed(2)}</td>
                <td class="${cls}">${sign}${s.change}%</td>
                <td>${s.volume}</td>
                <td>${s.marketCap}</td>
                <td>${s.pe}</td>
                <td>${s.technical}</td>
                <td>
                    <button class="btn-action" onclick="showUSStockAnalysis(${JSON.stringify(s).replace(/"/g, '&quot;')})">Detail</button>
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
