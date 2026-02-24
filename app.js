// Crypto Scanner Dashboard - Main Application Logic
// Version: 2.0 - Full Recovery Edition
// Date: February 11, 2026

// Global Variables
let cryptoData = [];
let filteredCryptoData = [];
let currentPage = 1;
const itemsPerPage = 20;
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
let showOnlyFavorites = false;
let portfolioData = JSON.parse(localStorage.getItem('portfolio')) || [];
let tradingHistory = JSON.parse(localStorage.getItem('tradingHistory')) || [];
let analysisCharts = { priceChart: null, macdChart: null };
let marketStatsData = null;
let fearGreedData = null;
let macroAgendaData = [];
let macroAgendaFilter = 'all';

// ── DEX UI State ──────────────────────────────────────────────
let activeSortCol    = 'mcap';  // current sort column (default: market cap rank → BTC #1)
let activeSortDir    = 'desc';  // 'asc' | 'desc'
let activeQuickFilter = 'all';  // all|trending|gainers|losers|whale|long|short|favorites
let activeTimeframe  = '24h';   // '1h' | '24h' | '7d'
let activeModalFilters = {};    // { minLiquidity, maxMcap, ... }
let activeSearchTerm = '';      // current search string
// ──────────────────────────────────────────────────────────────

// API Configuration
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
let autoRefreshInterval;

// ── Simple in-memory cache ─────────────────────────────────────
const _cache = {};
function cacheGet(key) {
    const entry = _cache[key];
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { delete _cache[key]; return null; }
    return entry.data;
}
function cacheSet(key, data, ttlMs) {
    _cache[key] = { data, expiresAt: Date.now() + ttlMs };
}

// ── Price flash tracking ───────────────────────────────────────
const _prevPrices = new Map(); // coinId → last known price

/**
 * fetch dengan timeout otomatis.
 * @param {string} url
 * @param {number} timeoutMs - default 8000ms
 */
async function fetchWithTimeout(url, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        return res;
    } catch (err) {
        clearTimeout(tid);
        throw err;
    }
}
// ──────────────────────────────────────────────────────────────

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Crypto Scanner Dashboard Initialized');
    initializeApp();
    setupEventListeners();
    setupDexEventListeners();
    loadInitialData();
    startAutoRefresh();
    updateMoonPhase();
});

function initializeApp() {
    // Set initial tab
    switchTab('scanner');
    
    // Load saved data (legacy stubs — portfolioTracker handles its own storage)
    updateGlobalSessions();
    portfolioTracker.init();
    setInterval(updateGlobalSessions, 60 * 1000);
    
    console.log('✅ App initialized successfully');
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = e.currentTarget.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshAllData();
        });
    }
    
    // Search functionality
    const searchInput = document.getElementById('searchCoin');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            activeSearchTerm = e.target.value;
            if (cryptoData.length === 0) {
                loadCryptoData().then(() => _applyAllFilters());
            } else {
                _applyAllFilters();
            }
        });
        
        // Keyboard shortcut Ctrl+K or /
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey && e.key === 'k') || e.key === '/') {
                // Jangan intercept saat user sedang ketik di input lain
                if (document.activeElement.tagName === 'INPUT' && document.activeElement !== searchInput) return;
                e.preventDefault();
                searchInput.focus();
                // Pastikan tab scanner aktif
                if (!document.getElementById('scanner')?.classList.contains('active')) {
                    switchTab('scanner');
                }
            }
        });
    }
    
    // News refresh button
    const refreshNewsBtn = document.getElementById('refreshNewsBtn');
    if (refreshNewsBtn) {
        refreshNewsBtn.addEventListener('click', () => {
            loadCryptoNews();
        });
    }

    const alertContent = document.getElementById('alertContent');
    if (alertContent) {
        alertContent.addEventListener('click', (event) => {
            const card = event.target.closest('[data-coin-id]');
            if (card) {
                analyzeCoin(card.dataset.coinId);
            }
        });
    }

    document.querySelectorAll('.agenda-filter-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            document.querySelectorAll('.agenda-filter-btn').forEach(item => item.classList.remove('active'));
            const target = event.currentTarget;
            target.classList.add('active');
            macroAgendaFilter = target.dataset.filter || 'all';
            renderMacroAgenda();
        });
    });
    
    console.log('✅ Event listeners setup complete');
}

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Add active class to clicked button
    const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    
    // Load tab-specific data
    switch(tabName) {
        case 'scanner':
            if (cryptoData.length === 0) {
                loadCryptoData();
            }
            break;
        case 'news':
            // Initialize top movers when switching to news tab
            if (typeof initializeTopMovers === 'function') {
                initializeTopMovers();
            }
            break;
        case 'idx-stocks':
            if (typeof loadIDXStocks === 'function') {
                loadIDXStocks();
            }
            break;
        case 'us-stocks':
            if (typeof loadUSStocks === 'function') {
                loadUSStocks();
            }
            break;
        case 'portfolio':
            portfolioTracker.renderAll();
            break;
        case 'history':
            if (typeof displayTradingHistory === 'function') displayTradingHistory();
            break;
        case 'wallet':
            walletTracker.init();
            break;
        case 'dex-analyzer':
            dexAnalyzer.init();
            break;
        case 'token-scanner':
            dexScanner.init();
            break;
        case 'okx':
            if (typeof okxTrading !== 'undefined') okxTrading.init();
            break;
        case 'solana-swap':
            if (typeof solanaSwap !== 'undefined') solanaSwap.init();
            break;
    }

    // Fire custom event for lazy-init modules
    document.dispatchEvent(new CustomEvent('tabchange', { detail: tabName }));

    console.log(`📑 Switched to tab: ${tabName}`);
}

async function loadInitialData() {
    try {
        // Tahap 1: data kritikal dulu — tabel langsung tampil
        await Promise.all([
            loadMarketStats(),
            loadCryptoData(),
        ]);
        console.log('✅ Critical data loaded — UI visible');

        // Tahap 2: Fear & Greed — ringan, tapi tidak memblokir tabel
        fetchFearGreedIndex().catch(e => console.warn('FearGreed:', e));

        // Tahap 3: Macro agenda — API lambat, defer 3 detik agar tidak menahan UI
        const agendaEl = document.getElementById('macroAgendaContent');
        if (agendaEl) agendaEl.innerHTML = `<div class="agenda-loading"><span class="g-spinner sm"></span> Memuat agenda makro...</div>`;
        setTimeout(() => {
            fetchMacroAgenda().catch(e => console.warn('MacroAgenda:', e));
        }, 3000);

    } catch (error) {
        console.error('❌ Error loading initial data:', error);
    }
}

async function loadMarketStats() {
    try {
        // Show shimmer placeholders immediately
        ['totalMarketCap','totalVolume','btcDominance','activeCryptos'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<span class="stat-shimmer"></span>';
        });
        const fgEl = document.getElementById('fearGreedBadge');
        if (fgEl) fgEl.classList.add('loading-fgi');

        const cached = cacheGet('globalStats');
        const data = cached || await fetchWithTimeout(`${COINGECKO_API}/global`, 8000).then(r => r.json());
        if (!cached) cacheSet('globalStats', data, 90_000);
        
        if (data && data.data) {
            const marketData = data.data;
            marketStatsData = marketData;

            const setStatVal = (id, text) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.textContent = text;
                el.classList.remove('updated');
                void el.offsetWidth; // reflow untuk re-trigger animasi
                el.classList.add('updated');
                setTimeout(() => el.classList.remove('updated'), 1200);
            };

            // Update market stats
            setStatVal('totalMarketCap', `$${(marketData.total_market_cap.usd / 1e12).toFixed(2)}T`);
            setStatVal('totalVolume',    `$${(marketData.total_volume.usd / 1e9).toFixed(2)}B`);
            setStatVal('btcDominance',   `${marketData.market_cap_percentage.btc.toFixed(2)}%`);
            setStatVal('activeCryptos',  marketData.active_cryptocurrencies.toLocaleString());
        }
    } catch (error) {
        console.error('Error loading market stats:', error);
        showError('Failed to load market statistics');
    }
}

async function fetchFearGreedIndex() {
    try {
        const cached = cacheGet('fearGreed');
        if (cached) { fearGreedData = cached; updateFearGreedBadge(); return; }
        const response = await fetch('https://api.alternative.me/fng/?limit=1&format=json');
        const data = await response.json();
        fearGreedData = data?.data?.[0] || null;
        if (fearGreedData) cacheSet('fearGreed', fearGreedData, 5 * 60_000); // cache 5 menit
        updateFearGreedBadge();
    } catch (error) {
        console.error('Error fetching Fear & Greed index:', error);
        fearGreedData = null;
    }
}

function updateFearGreedBadge() {
    const el = document.getElementById('fearGreedBadge');
    if (!el) return;
    el.classList.remove('loading-fgi');
    if (!fearGreedData) { el.textContent = '—'; return; }
    const v   = parseInt(fearGreedData.value) || 0;
    const lbl = fearGreedData.value_classification || '';
    const color = v >= 70 ? '#f87171'   // extreme greed
                : v >= 55 ? '#fbbf24'   // greed
                : v >= 45 ? '#94a3b8'   // neutral
                : v >= 30 ? '#60a5fa'   // fear
                :           '#a78bfa';  // extreme fear
    el.innerHTML = `<span style="color:${color};font-weight:700">${v}</span> <span style="color:#64748b;font-size:0.78rem">${lbl}</span>`;
}

async function fetchMacroAgenda() {
    try {
        // Timeout 5 detik — API ini sering lambat, jangan blokir UI
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(
            'https://api.tradingeconomics.com/calendar/country/united%20states?c=guest:guest&format=json',
            { signal: controller.signal }
        );
        clearTimeout(tid);
        const data = await response.json();
        const now = new Date();
        macroAgendaData = Array.isArray(data)
            ? data.filter(item => new Date(item.Date) >= now).slice(0, 8)
            : [];
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('⏱ Macro agenda timeout — skipped');
        } else {
            console.error('Error fetching macro agenda:', error);
        }
        macroAgendaData = [];
    }
    renderMacroAgenda();
}

function renderMacroAgenda() {
    const container = document.getElementById('macroAgendaContent');
    if (!container) return;

    if (!macroAgendaData.length) {
        container.innerHTML = '<div class="loading">Agenda belum tersedia. Coba refresh lagi.</div>';
        return;
    }

    const filtered = macroAgendaData.filter(item => {
        const name = (item.Event || '').toLowerCase();
        if (macroAgendaFilter === 'fomc') return name.includes('fomc') || name.includes('fed');
        if (macroAgendaFilter === 'cpi') return name.includes('cpi') || name.includes('inflation');
        return true;
    });

    if (!filtered.length) {
        container.innerHTML = '<div class="loading">Tidak ada agenda untuk filter ini.</div>';
        return;
    }

    const now = new Date();
    const html = filtered.map(event => {
        const eventDate = new Date(event.Date);
        const time = eventDate.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

        // Detect type
        const nameLower = (event.Event || '').toLowerCase();
        const isFOMC = nameLower.includes('fomc') || nameLower.includes('fed');
        const isCPI  = nameLower.includes('cpi') || nameLower.includes('inflation');
        const typeClass = isFOMC ? 'fomc' : isCPI ? 'cpi' : '';
        const typeBadge = isFOMC
            ? '<span class="agenda-type-badge fomc">FOMC</span>'
            : isCPI
            ? '<span class="agenda-type-badge cpi">CPI</span>'
            : '';

        // Countdown to event
        const diffMs = eventDate - now;
        const countdownStr = diffMs > 0 ? `⏰ ${formatCountdown(diffMs)} lagi` : '✅ Sudah berlalu';

        return `
            <div class="agenda-card ${typeClass}">
                <div class="agenda-time">${time} ${typeBadge}</div>
                <div class="agenda-title">${event.Event || 'Event'}</div>
                <div class="agenda-meta">${event.Country || ''} • ${event.Importance || 'Medium'}</div>
                <div class="agenda-values">
                    <span>Actual: ${event.Actual || '-'} </span>
                    <span>Forecast: ${event.Forecast || '-'} </span>
                    <span>Previous: ${event.Previous || '-'} </span>
                </div>
                <div class="agenda-countdown">${countdownStr}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function updateGlobalSessions() {
    const container = document.getElementById('globalSessionGrid');
    if (!container) return;

    // Detect user's local timezone automatically
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const sessions = [
        { name: 'Asia 🇯🇵 Tokyo',     timezone: 'Asia/Tokyo',        open: '09:00', close: '15:30', flag: '🇯🇵' },
        { name: 'Asia 🇭🇰 Hong Kong', timezone: 'Asia/Hong_Kong',    open: '09:30', close: '16:00', flag: '🇭🇰' },
        { name: 'Europe 🇬🇧 London',  timezone: 'Europe/London',     open: '08:00', close: '16:30', flag: '🇬🇧' },
        { name: 'US 🇺🇸 New York',    timezone: 'America/New_York',  open: '09:30', close: '16:00', flag: '🇺🇸' }
    ];

    const html = sessions.map(session => {
        const status = getSessionStatus(session);
        const localOpenTime  = convertToLocalTime(session.open,  session.timezone, userTimezone);
        const localCloseTime = convertToLocalTime(session.close, session.timezone, userTimezone);
        const localTZ        = userTimezone.replace('_', ' ');

        return `
            <div class="session-card ${status.isOpen ? 'open' : 'closed'}">
                <div class="session-name">${session.name}</div>
                <div class="session-time">${session.open} – ${session.close} (${session.timezone.split('/')[1].replace('_', ' ')})</div>
                <div class="session-local-time">Local: ${localOpenTime} – ${localCloseTime} (${localTZ})</div>
                <div style="margin-top:6px;">
                    <span class="session-status-badge">${status.isOpen ? '🟢 OPEN' : '🔴 CLOSED'}</span>
                </div>
                <div class="session-countdown">${status.isOpen ? '⏳ Tutup dalam ' : '⏰ Buka dalam '}${status.countdown}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function convertToLocalTime(timeStr, fromTz, toTz) {
    try {
        const [hour, minute] = timeStr.split(':').map(Number);
        const base = new Date();
        // Set time in source timezone by constructing a reference datetime string
        const srcStr = new Date(base.toLocaleDateString('en-CA', { timeZone: fromTz }) + `T${timeStr}:00`);
        return srcStr.toLocaleTimeString('en-US', {
            timeZone: toTz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    } catch {
        return timeStr;
    }
}

function getSessionStatus(session) {
    const now = getZonedDate(new Date(), session.timezone);
    const [openHour, openMinute] = session.open.split(':').map(Number);
    const [closeHour, closeMinute] = session.close.split(':').map(Number);
    const open = new Date(now);
    open.setHours(openHour, openMinute, 0, 0);
    const close = new Date(now);
    close.setHours(closeHour, closeMinute, 0, 0);

    let isOpen = now >= open && now <= close;
    let target = isOpen ? close : open;

    if (!isOpen && now > close) {
        target = new Date(open);
        target.setDate(target.getDate() + 1);
    }

    const diffMs = target - now;
    const countdown = formatCountdown(diffMs);

    return {
        isOpen,
        label: isOpen ? 'Open' : 'Closed',
        countdown,
        note: isOpen ? `Tutup ${countdown}` : `Buka ${countdown}`
    };
}

function getZonedDate(date, timeZone) {
    return new Date(date.toLocaleString('en-US', { timeZone }));
}

function formatCountdown(diffMs) {
    if (!Number.isFinite(diffMs) || diffMs <= 0) return 'sebentar lagi';
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
}

async function updateWhaleAlerts() {
    const alertContent = document.getElementById('alertContent');
    const alertStatus = document.getElementById('alertStatus');
    if (!alertContent || !alertStatus) return;

    alertStatus.textContent = 'Scanning...';
    alertContent.innerHTML = `<div class="whale-scanning"><span class="g-spinner"></span> Sedang scan whale activity…</div>`;
    const alerts = await buildWhaleAlerts();
    if (!alerts.length) {
        alertStatus.textContent = 'No alerts';
        alertContent.innerHTML = `
            <div class="no-signal">
                <div class="pulse-dot"></div>
                <p>Belum ada whale spike kuat saat ini.</p>
            </div>
        `;
        return;
    }

    alertStatus.textContent = `${alerts.length} alert`; 
    alertContent.innerHTML = alerts.map(alert => `
        <div class="alert-card ${alert.intradaySpike ? 'intraday-spike' : ''}" data-coin-id="${alert.coinId}">
            <div class="alert-title">
                ${alert.name} (${alert.symbol})
                ${alert.intradaySpike ? '<span class="spike-badge">⚡ Intraday Spike</span>' : ''}
            </div>
            <div class="alert-reason">${alert.reason}</div>
            <div class="alert-meta">Volume ratio: ${(alert.volumeRatio * 100).toFixed(2)}% • 24h: ${formatPercentage(alert.change24h)} • Intraday: ${alert.intradaySpike ? '🔥 Spike' : 'Normal'}</div>
        </div>
    `).join('');
}

async function buildWhaleAlerts() {
    const candidates = cryptoData
        .filter(coin => {
            const volumeRatio = coin.market_cap ? coin.total_volume / coin.market_cap : 0;
            return volumeRatio > 0.18 && Math.abs(coin.price_change_percentage_24h || 0) > 3;
        })
        .slice(0, 3); // ── max 3, hemat rate-limit CoinGecko

    const alerts = await Promise.all(candidates.map(async coin => {
        const volumeRatio = coin.market_cap ? coin.total_volume / coin.market_cap : 0;
        const change24h = coin.price_change_percentage_24h || 0;
        const direction = change24h >= 0 ? 'Akumulasi' : 'Distribusi';
        const intradaySpike = await fetchIntradayVolumeSpike(coin.id);
        const spikeNote = intradaySpike ? 'dengan lonjakan volume intraday' : 'tanpa spike intraday';

        return {
            coinId: coin.id,
            name: coin.name,
            symbol: coin.symbol.toUpperCase(),
            volumeRatio,
            change24h,
            intradaySpike,
            reason: `Volume tinggi + harga ${change24h >= 0 ? 'naik' : 'turun'} → indikasi ${direction} (${spikeNote})`
        };
    }));

    return alerts;
}

async function fetchIntradayVolumeSpike(coinId) {
    const CACHE_KEY = `intraday_${coinId}`;
    const cached = cacheGet(CACHE_KEY);
    if (cached !== null) return cached;

    try {
        const response = await fetch(`${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=1`);
        const data = await response.json();
        const volumes = (data?.total_volumes || []).map(point => point[1]);
        const result = volumes.length
            ? (window.AnalysisUtils?.detectVolumeSpike(volumes, 12, 1.8)?.spike || false)
            : false;
        cacheSet(CACHE_KEY, result, 5 * 60_000); // cache 5 menit
        return result;
    } catch (error) {
        console.error('Intraday volume spike error:', error);
        return false;
    }
}

// ─────────────────────────────────────────────────────────────
//  IDX + US STOCKS — Top Movers
// ─────────────────────────────────────────────────────────────

// Static stock data — realistic sample data (IDX & US).
// In production these would be fetched from a financial API.
const IDX_STOCKS_DATA = [
    { symbol:'BBCA',  name:'Bank Central Asia',       sector:'Banking',        price:9200,   change:1.32,  volume:42_500_000,  mktcap:'1.12T' },
    { symbol:'BMRI',  name:'Bank Mandiri',             sector:'Banking',        price:5975,   change:2.10,  volume:38_200_000,  mktcap:'580B'  },
    { symbol:'BBRI',  name:'Bank Rakyat Indonesia',    sector:'Banking',        price:4380,   change:-0.45, volume:61_000_000,  mktcap:'650B'  },
    { symbol:'TLKM',  name:'Telkom Indonesia',         sector:'Infrastructure', price:3130,   change:-1.08, volume:29_400_000,  mktcap:'310B'  },
    { symbol:'ASII',  name:'Astra International',      sector:'Consumer',       price:4890,   change:0.62,  volume:18_700_000,  mktcap:'198B'  },
    { symbol:'ANTM',  name:'Aneka Tambang',             sector:'Mining',         price:1655,   change:3.44,  volume:84_000_000,  mktcap:'39B'   },
    { symbol:'ADRO',  name:'Adaro Energy',              sector:'Mining',         price:2280,   change:2.78,  volume:55_300_000,  mktcap:'73B'   },
    { symbol:'ITMG',  name:'Indo Tambangraya Megah',    sector:'Mining',         price:24_450, change:4.07,  volume:4_100_000,   mktcap:'27B'   },
    { symbol:'UNVR',  name:'Unilever Indonesia',        sector:'Consumer',       price:2610,   change:-2.67, volume:12_800_000,  mktcap:'99B'   },
    { symbol:'ICBP',  name:'Indofood CBP Sukses',       sector:'Consumer',       price:10_325, change:-0.24, volume:6_200_000,   mktcap:'121B'  },
    { symbol:'BSDE',  name:'Bumi Serpong Damai',        sector:'Property',       price:1020,   change:1.99,  volume:22_100_000,  mktcap:'18B'   },
    { symbol:'HEAL',  name:'Medikaloka Hermina',        sector:'Healthcare',     price:1565,   change:-1.57, volume:9_800_000,   mktcap:'9B'    },
    { symbol:'GOTO',  name:'GoTo Gojek Tokopedia',      sector:'Technology',     price:64,     change:5.52,  volume:9_823_000_000, mktcap:'8B'  },
    { symbol:'EMTK',  name:'Elang Mahkota Teknologi',   sector:'Technology',     price:435,    change:3.10,  volume:48_200_000,  mktcap:'12B'   },
    { symbol:'JSMR',  name:'Jasa Marga',                sector:'Infrastructure', price:4130,   change:-0.84, volume:7_600_000,   mktcap:'30B'   },
    { symbol:'PTPP',  name:'PP Persero',                sector:'Infrastructure', price:785,    change:-3.19, volume:14_900_000,  mktcap:'4B'    },
    { symbol:'MIKA',  name:'Mitra Keluarga Karyasehat', sector:'Healthcare',     price:2420,   change:0.83,  volume:5_100_000,   mktcap:'29B'   },
    { symbol:'CTRA',  name:'Ciputra Development',       sector:'Property',       price:1260,   change:2.44,  volume:19_300_000,  mktcap:'23B'   },
    { symbol:'PWON',  name:'Pakuwon Jati',               sector:'Property',       price:540,    change:1.12,  volume:31_400_000,  mktcap:'26B'   },
    { symbol:'INDF',  name:'Indofood Sukses Makmur',    sector:'Consumer',       price:6425,   change:-0.77, volume:8_900_000,   mktcap:'57B'   },
];

const US_STOCKS_DATA = [
    { symbol:'NVDA',  name:'NVIDIA Corp.',              sector:'Technology',  exchange:'NASDAQ', price:875.40,  change:4.82,  volume:42_300_000, mktcap:'2.15T' },
    { symbol:'AAPL',  name:'Apple Inc.',                sector:'Technology',  exchange:'NASDAQ', price:228.50,  change:0.74,  volume:55_100_000, mktcap:'3.51T' },
    { symbol:'MSFT',  name:'Microsoft Corp.',           sector:'Technology',  exchange:'NASDAQ', price:418.30,  change:1.23,  volume:22_400_000, mktcap:'3.11T' },
    { symbol:'GOOGL', name:'Alphabet Inc.',             sector:'Technology',  exchange:'NASDAQ', price:192.75,  change:2.15,  volume:19_800_000, mktcap:'2.37T' },
    { symbol:'AMZN',  name:'Amazon.com Inc.',           sector:'Consumer',    exchange:'NASDAQ', price:210.40,  change:1.88,  volume:31_600_000, mktcap:'2.21T' },
    { symbol:'TSLA',  name:'Tesla Inc.',                sector:'Consumer',    exchange:'NASDAQ', price:248.60,  change:-3.41, volume:88_500_000, mktcap:'793B'  },
    { symbol:'META',  name:'Meta Platforms Inc.',       sector:'Technology',  exchange:'NASDAQ', price:607.20,  change:2.67,  volume:14_200_000, mktcap:'1.54T' },
    { symbol:'JPM',   name:'JPMorgan Chase & Co.',      sector:'Financials',  exchange:'NYSE',   price:228.10,  change:0.95,  volume:9_800_000,  mktcap:'655B'  },
    { symbol:'JNJ',   name:'Johnson & Johnson',         sector:'Healthcare',  exchange:'NYSE',   price:158.70,  change:-0.33, volume:7_200_000,  mktcap:'382B'  },
    { symbol:'XOM',   name:'ExxonMobil Corp.',          sector:'Energy',      exchange:'NYSE',   price:106.40,  change:1.14,  volume:16_300_000, mktcap:'458B'  },
    { symbol:'UNH',   name:'UnitedHealth Group',        sector:'Healthcare',  exchange:'NYSE',   price:538.90,  change:-1.22, volume:4_100_000,  mktcap:'497B'  },
    { symbol:'AMD',   name:'Advanced Micro Devices',    sector:'Technology',  exchange:'NASDAQ', price:178.50,  change:5.43,  volume:61_200_000, mktcap:'289B'  },
    { symbol:'BA',    name:'Boeing Co.',                sector:'Industrials', exchange:'NYSE',   price:163.20,  change:-4.87, volume:12_800_000, mktcap:'102B'  },
    { symbol:'BAC',   name:'Bank of America Corp.',     sector:'Financials',  exchange:'NYSE',   price:41.30,   change:1.76,  volume:38_900_000, mktcap:'324B'  },
    { symbol:'CVX',   name:'Chevron Corp.',             sector:'Energy',      exchange:'NYSE',   price:152.80,  change:0.62,  volume:8_700_000,  mktcap:'279B'  },
    { symbol:'COP',   name:'ConocoPhillips',            sector:'Energy',      exchange:'NYSE',   price:114.60,  change:2.38,  volume:9_100_000,  mktcap:'138B'  },
    { symbol:'CAT',   name:'Caterpillar Inc.',          sector:'Industrials', exchange:'NYSE',   price:381.50,  change:-0.58, volume:3_200_000,  mktcap:'189B'  },
    { symbol:'PFE',   name:'Pfizer Inc.',               sector:'Healthcare',  exchange:'NYSE',   price:27.40,   change:-2.19, volume:42_100_000, mktcap:'155B'  },
    { symbol:'WMT',   name:'Walmart Inc.',              sector:'Consumer',    exchange:'NYSE',   price:96.30,   change:1.51,  volume:11_400_000, mktcap:'773B'  },
    { symbol:'GE',    name:'GE Aerospace',              sector:'Industrials', exchange:'NYSE',   price:188.70,  change:3.12,  volume:8_600_000,  mktcap:'204B'  },
];

// Watchlist storage
let idxWatchlist = JSON.parse(localStorage.getItem('idxWatchlist')) || ['BBCA','BMRI','ANTM','GOTO'];
let usWatchlist  = JSON.parse(localStorage.getItem('usWatchlist'))  || ['NVDA','AAPL','TSLA','AMD'];

function loadIDXStocks() {
    renderStockMovers('idx', 'gainers');
    setupStockMoverTabs('idx');
    updateIDXSessions();
}

function loadUSStocks() {
    renderStockMovers('us', 'gainers');
    setupStockMoverTabs('us');
    updateUSSessions();
}

function setupStockMoverTabs(market) {
    document.querySelectorAll(`.stock-mover-tab[data-market="${market}"]`).forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll(`.stock-mover-tab[data-market="${market}"]`).forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderStockMovers(market, this.dataset.mover);
        });
    });
}

function renderStockMovers(market, type) {
    const gridId  = market === 'idx' ? 'idxMoversGrid' : 'usMoversGrid';
    const timeId  = market === 'idx' ? 'idxMoversTime' : 'usMoversTime';
    const grid    = document.getElementById(gridId);
    const timeEl  = document.getElementById(timeId);
    if (!grid) return;

    const allData  = market === 'idx' ? IDX_STOCKS_DATA : US_STOCKS_DATA;
    const watchlist = market === 'idx' ? idxWatchlist : usWatchlist;

    let data;
    switch (type) {
        case 'gainers':
            data = [...allData].sort((a,b) => b.change - a.change).slice(0,10);
            break;
        case 'losers':
            data = [...allData].sort((a,b) => a.change - b.change).slice(0,10);
            break;
        case 'active':
            data = [...allData].sort((a,b) => b.volume - a.volume).slice(0,10);
            break;
        case 'watchlist':
            data = allData.filter(s => watchlist.includes(s.symbol));
            if (data.length === 0) {
                grid.innerHTML = `<div class="movers-empty">⭐ Watchlist kosong — klik ⭐ pada saham untuk menambahkan</div>`;
                return;
            }
            break;
        default:
            data = allData;
    }

    const now = new Date();
    if (timeEl) timeEl.textContent = `Diperbarui ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

    const isCurrency = market === 'idx';
    grid.innerHTML = data.map((s, i) => {
        const pos   = s.change >= 0;
        const chCls = pos ? 'mover-change positive' : 'mover-change negative';
        const chSign= pos ? '+' : '';
        const priceStr = isCurrency
            ? `Rp ${s.price.toLocaleString('id-ID')}`
            : `$${s.price.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2})}`;
        const volStr = formatLargeNumber(s.volume);
        const inWL   = watchlist.includes(s.symbol);

        return `
        <div class="mover-card ${pos ? 'mover-card--up' : 'mover-card--down'}">
            <div class="mover-rank">${i+1}</div>
            <div class="mover-info">
                <div class="mover-symbol">
                    ${s.symbol}
                    <span class="mover-sector-tag">${s.sector}</span>
                    ${s.exchange ? `<span class="mover-exchange-tag">${s.exchange}</span>` : ''}
                </div>
                <div class="mover-name">${s.name}</div>
            </div>
            <div class="mover-data">
                <div class="mover-price">${priceStr}</div>
                <div class="${chCls}">${chSign}${s.change.toFixed(2)}%</div>
                <div class="mover-vol">Vol: ${volStr}</div>
                <div class="mover-mcap">MCap: ${s.mktcap}</div>
            </div>
            <button class="mover-wl-btn ${inWL ? 'in-watchlist' : ''}"
                    onclick="toggleStockWatchlist('${market}','${s.symbol}',this)"
                    title="${inWL ? 'Hapus dari watchlist' : 'Tambah ke watchlist'}">
                ${inWL ? '★' : '☆'}
            </button>
        </div>`;
    }).join('');
}

function toggleStockWatchlist(market, symbol, btn) {
    const wl = market === 'idx' ? idxWatchlist : usWatchlist;
    const key = market === 'idx' ? 'idxWatchlist' : 'usWatchlist';
    const idx = wl.indexOf(symbol);
    if (idx === -1) {
        wl.push(symbol);
        btn.textContent = '★';
        btn.classList.add('in-watchlist');
    } else {
        wl.splice(idx, 1);
        btn.textContent = '☆';
        btn.classList.remove('in-watchlist');
    }
    localStorage.setItem(key, JSON.stringify(wl));
}

function updateIDXSessions() {
    // IDX hours: Mon-Fri, WIB (UTC+7)
    const now = new Date();
    const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const day = wib.getDay(); // 0=Sun, 6=Sat
    const h = wib.getHours(), m = wib.getMinutes();
    const mins = h * 60 + m;
    const isWeekday = day >= 1 && day <= 5;

    const set = (id, status, cls) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = status;
        el.className = `session-status ${cls}`;
    };

    if (!isWeekday) {
        ['idxPreOpeningStatus','idxSession1Status','idxSession2Status','idxPostTradingStatus']
            .forEach(id => set(id, 'Weekend', 'status-closed'));
        return;
    }
    set('idxPreOpeningStatus', mins >= 525 && mins < 540 ? 'Open' : 'Closed', mins >= 525 && mins < 540 ? 'status-open' : 'status-closed');
    set('idxSession1Status',   mins >= 540 && mins < 720 ? 'Open' : 'Closed', mins >= 540 && mins < 720 ? 'status-open' : 'status-closed');
    set('idxSession2Status',   mins >= 810 && mins < 889 ? 'Open' : 'Closed', mins >= 810 && mins < 889 ? 'status-open' : 'status-closed');
    set('idxPostTradingStatus',mins >= 889 && mins < 915 ? 'Open' : 'Closed', mins >= 889 && mins < 915 ? 'status-open' : 'status-closed');
}

function updateUSSessions() {
    const now = new Date();
    const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    const mins = et.getHours() * 60 + et.getMinutes();
    const isWeekday = day >= 1 && day <= 5;

    const set = (id, status, cls) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = status;
        el.className = `session-status ${cls}`;
    };

    if (!isWeekday) {
        ['usPreMarketStatus','usRegularStatus','usAfterHoursStatus']
            .forEach(id => set(id, 'Weekend', 'status-closed'));
        return;
    }
    set('usPreMarketStatus',  mins >= 240 && mins < 570  ? 'Open' : 'Closed', mins >= 240 && mins < 570  ? 'status-open' : 'status-closed');
    set('usRegularStatus',    mins >= 570 && mins < 960  ? 'Open' : 'Closed', mins >= 570 && mins < 960  ? 'status-open' : 'status-closed');
    set('usAfterHoursStatus', mins >= 960 && mins < 1200 ? 'Open' : 'Closed', mins >= 960 && mins < 1200 ? 'status-open' : 'status-closed');
}

// ─────────────────────────────────────────────────────────────
async function loadCryptoData() {
    try {
        showLoading('cryptoTableBody');

        // ── Cache 90 detik — per_page=200 diambil dari 2 halaman paralel ──
        const CACHE_KEY = 'cryptoMarkets_v2';  // v2 = 200 koin
        const TTL = 90_000;
        let coins = cacheGet(CACHE_KEY);

        if (!coins) {
            const BASE = `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&sparkline=true&price_change_percentage=1h,24h,7d`;
            // Fetch halaman 1 & 2 paralel → total 200 koin
            const [res1, res2] = await Promise.all([
                fetchWithTimeout(`${BASE}&page=1`, 12000),
                fetchWithTimeout(`${BASE}&page=2`, 12000),
            ]);
            const [page1, page2] = await Promise.all([res1.json(), res2.json()]);
            coins = [...(Array.isArray(page1) ? page1 : []), ...(Array.isArray(page2) ? page2 : [])];
            cacheSet(CACHE_KEY, coins, TTL);
        }

        cryptoData = coins;
        filteredCryptoData = [...cryptoData];

        // Tampilkan tabel dulu — biar user nggak nunggu lama
        _applyAllFilters();
        analyzeWhaleActivity();
        analyzeMarketNarratives();

        // Whale alert butuh extra API call → defer 5 detik agar tidak blokir render awal
        setTimeout(() => updateWhaleAlerts(), 5000);

        updateLastUpdate();
        console.log(`✅ Loaded ${cryptoData.length} cryptocurrencies`);

    } catch (error) {
        console.error('Error loading crypto data:', error);
        showError('Failed to load cryptocurrency data');
    }
}

function displayCryptoData() {
    const tbody = document.getElementById('cryptoTableBody');
    if (!tbody) return;

    // Apply favorites filter if active
    let dataToDisplay = showOnlyFavorites
        ? filteredCryptoData.filter(coin => favorites.includes(coin.id))
        : filteredCryptoData;

    // Pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex   = startIndex + itemsPerPage;
    const paginatedData = dataToDisplay.slice(startIndex, endIndex);

    if (paginatedData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="18" class="dex-empty-hint">Tidak ada token yang cocok dengan filter.</td></tr>';
        updatePagination(0);
        return;
    }

    tbody.innerHTML = paginatedData.map((coin, index) => {
        const isFavorite  = favorites.includes(coin.id);
        const actualIndex = startIndex + index + 1;
        const ch1h  = coin.price_change_percentage_1h_in_currency;
        const ch24h = coin.price_change_percentage_24h;
        const ch7d  = coin.price_change_percentage_7d_in_currency;

        // Inline AI numeric score
        const aiNum = _calcAIScore(coin);
        const aiColor = aiNum >= 75 ? '#4ade80' : aiNum >= 55 ? '#fbbf24' : aiNum >= 40 ? '#94a3b8' : '#f87171';

        // Price flash: hijau jika naik, merah jika turun sejak render terakhir
        const prevPrice  = _prevPrices.get(coin.id);
        const priceFlash = prevPrice != null && prevPrice !== coin.current_price
            ? (coin.current_price > prevPrice ? ' flash-up' : ' flash-down') : '';
        _prevPrices.set(coin.id, coin.current_price);

        return `
            <tr class="dex-row${priceFlash}" data-coin-id="${coin.id}">
                <td class="td-fav">
                    <button class="btn-fav ${isFavorite ? 'active' : ''}"
                            onclick="toggleFavorite('${coin.id}')" title="Watchlist">★</button>
                </td>
                <td class="td-num">${actualIndex}</td>
                <td class="td-token">
                    <img src="${coin.image}" alt="${coin.name}" class="td-coin-img" loading="lazy">
                    <div class="td-coin-names">
                        <span class="td-coin-name">${coin.name}</span>
                        <span class="td-coin-sym">${coin.symbol.toUpperCase()}</span>
                    </div>
                </td>
                <td class="td-price">$${formatNumber(coin.current_price)}</td>
                <td class="td-age">${getAgeLabel(coin)}</td>
                <td class="td-pct ${getChangeClass(ch1h)}">${formatPercentage(ch1h)}</td>
                <td class="td-pct ${getChangeClass(ch24h)}">${formatPercentage(ch24h)}</td>
                <td class="td-pct ${getChangeClass(ch7d)}">${formatPercentage(ch7d)}</td>
                <td class="td-vol">$${formatLargeNumber(coin.total_volume)}</td>
                <td class="td-mcap">$${formatLargeNumber(coin.market_cap)}</td>
                <td class="td-liq">${getLiquidityBadge(coin)}</td>
                <td class="td-fib">${getFibLevelBadge(coin)}</td>
                <td class="td-signal">${getDailyCycleSignal(coin)}</td>
                <td class="td-futures">${getFuturesBadge(coin)}</td>
                <td class="td-whale">${getWhaleActivity(coin)}</td>
                <td class="td-ai" style="color:${aiColor};font-weight:700">${aiNum}</td>
                <td class="td-chart">${renderSparkline(coin.sparkline_in_7d?.price)}</td>
                <td class="td-action">
                    <button class="btn-analyze" onclick="analyzeCoin('${coin.id}')">▶ Analyze</button>
                </td>
            </tr>
        `;
    }).join('');

    updatePagination(dataToDisplay.length);
}

/** Estimasi umur koin berdasarkan ATL date atau market cap rank */
function getAgeLabel(coin) {
    if (coin.atl_date) {
        const ms   = Date.now() - new Date(coin.atl_date).getTime();
        const days = Math.floor(ms / 86400000);
        if (days > 365 * 3) return `<span class="age-old">${Math.floor(days/365)}y</span>`;
        if (days > 365)     return `<span class="age-mid">${Math.floor(days/365)}y ${Math.floor((days%365)/30)}m</span>`;
        if (days > 30)      return `<span class="age-mid">${Math.floor(days/30)}mo</span>`;
        return `<span class="age-new">${days}d</span>`;
    }
    const rank = coin.market_cap_rank || 999;
    if (rank <= 20) return `<span class="age-old">Established</span>`;
    return `<span class="age-mid">—</span>`;
}

/** Hitung skor AI numerik (0–100) — dipakai di tabel & scoring grid */
function _calcAIScore(coin) {
    const ch24h    = coin.price_change_percentage_24h || 0;
    const ch7d     = coin.price_change_percentage_7d_in_currency || 0;
    const volRatio = coin.market_cap ? coin.total_volume / coin.market_cap : 0;
    const spark    = coin.sparkline_in_7d?.price || [];
    let score = 50;
    if (ch24h > 5) score += 12; else if (ch24h > 0) score += 5;
    else if (ch24h < -5) score -= 12; else if (ch24h < 0) score -= 5;
    if (ch7d > 10) score += 10; else if (ch7d > 0) score += 4;
    else if (ch7d < -10) score -= 10; else if (ch7d < 0) score -= 4;
    if (volRatio > 0.3) score += 12;
    else if (volRatio > 0.1) score += 7;
    else if (volRatio < 0.02) score -= 5;
    const rank = coin.market_cap_rank || 999;
    if (rank <= 10) score += 15;
    else if (rank <= 50) score += 8;
    else if (rank <= 100) score += 3;
    const rsi = calcRSI(spark, 14);
    if (rsi < 30) score += 8;
    else if (rsi > 75) score -= 8;
    return Math.min(100, Math.max(0, Math.round(score)));
}

function renderSparkline(prices) {
    if (!prices || prices.length === 0) return '-';
    
    const max = Math.max(...prices);
    const min = Math.min(...prices);
    const range = max - min || 1;
    
    const points = prices.map((price, i) => {
        const x = (i / (prices.length - 1)) * 100;
        const y = 100 - ((price - min) / range) * 100;
        return `${x},${y}`;
    }).join(' ');
    
    const color = prices[prices.length - 1] > prices[0] ? '#00ff88' : '#ff4444';
    const fib = window.AnalysisUtils?.calculateFibonacciLevels(prices, prices.length) || null;
    const fibLevels = fib ? [0.382, 0.5, 0.618].map(ratio => {
        const level = fib.retracements.find(item => item.ratio === ratio)?.level;
        if (!level) return null;
        const y = 100 - ((level - min) / range) * 100;
        return `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="rgba(99,102,241,0.6)" stroke-width="0.8" />`;
    }).filter(Boolean).join('') : '';
    
    return `
        <svg width="100" height="30" class="sparkline">
            ${fibLevels}
            <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>
        </svg>
    `;
}

function updatePagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer) return;

    if (totalPages <= 1) {
        // Tetap tampilkan info jumlah koin meski hanya 1 halaman
        paginationContainer.innerHTML = `
            <div class="pagination-buttons">
                <span class="pagination-info">Menampilkan ${totalItems} koin</span>
            </div>`;
        return;
    }

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem   = Math.min(currentPage * itemsPerPage, totalItems);

    let html = '<div class="pagination-buttons">';

    // Info halaman
    html += `<span class="pagination-info">${startItem}–${endItem} dari ${totalItems} koin</span>`;

    // ← Prev
    html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''}
             onclick="changePage(${currentPage - 1})">← Prev</button>`;

    // Nomor halaman: tampilkan max 7 tombol dengan ellipsis
    const delta = 2;
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages ||
            (i >= currentPage - delta && i <= currentPage + delta)) {
            pages.push(i);
        }
    }

    let lastPage = 0;
    for (const p of pages) {
        if (lastPage && p - lastPage > 1) {
            html += `<span class="page-ellipsis">…</span>`;
        }
        html += `<button class="page-btn ${p === currentPage ? 'active' : ''}"
                 onclick="changePage(${p})">${p}</button>`;
        lastPage = p;
    }

    // Next →
    html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''}
             onclick="changePage(${currentPage + 1})">Next →</button>`;

    html += '</div>';
    paginationContainer.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    displayCryptoData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterCryptoData(searchTerm) {
    activeSearchTerm = searchTerm || '';
    _applyAllFilters();
}

// ─────────────────────────────────────────────────────────────
//  DEX UI: event listeners, filter, sort, modal
// ─────────────────────────────────────────────────────────────

function setupDexEventListeners() {
    // ── Timeframe buttons ──────────────────────────────────────
    document.querySelectorAll('.dex-tf-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.dex-tf-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            activeTimeframe = this.dataset.tf;  // '1h' | '24h' | '7d'
            // Only auto-switch sort if user was already sorting by a % column
            if (['1h','24h','7d'].includes(activeSortCol)) {
                activeSortCol = activeTimeframe;
                activeSortDir = 'desc';
            }
            _applyAllFilters();
            _updateSortArrows();
        });
    });

    // ── Quick filter chips ──────────────────────────────────────
    document.querySelectorAll('.dex-qf-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.dex-qf-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            activeQuickFilter = this.dataset.qf;
            currentPage = 1;
            _applyAllFilters();
        });
    });

    // ── Sortable column headers ────────────────────────────────
    document.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', function() {
            const col = this.dataset.sort;
            if (activeSortCol === col) {
                activeSortDir = activeSortDir === 'desc' ? 'asc' : 'desc';
            } else {
                activeSortCol = col;
                activeSortDir = 'desc';
            }
            currentPage = 1;
            _applyAllFilters();
            _updateSortArrows();
        });
    });

    console.log('✅ DEX event listeners ready');
}

/** Central filter + sort pipeline */
function _applyAllFilters() {
    let data = [...cryptoData];

    // 1. Search
    if (activeSearchTerm) {
        const t = activeSearchTerm.toLowerCase();
        data = data.filter(c => c.name.toLowerCase().includes(t) || c.symbol.toLowerCase().includes(t));
    }

    // 2. Quick filter
    switch (activeQuickFilter) {
        case 'trending':
            data = data.filter(c => Math.abs(c.price_change_percentage_24h || 0) > 5 && (c.total_volume / (c.market_cap || 1)) > 0.08);
            // Auto-sort: biggest absolute move first
            data.sort((a, b) => Math.abs(b.price_change_percentage_24h || 0) - Math.abs(a.price_change_percentage_24h || 0));
            break;
        case 'gainers':
            data = data.filter(c => (c.price_change_percentage_24h || 0) > 0);
            // Auto-sort: top gainer first
            data.sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
            break;
        case 'losers':
            data = data.filter(c => (c.price_change_percentage_24h || 0) < 0);
            // Auto-sort: biggest loser first
            data.sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0));
            break;
        case 'whale':
            data = data.filter(c => (c.total_volume / (c.market_cap || 1)) > 0.15);
            // Auto-sort: highest volume/mcap ratio first
            data.sort((a, b) => (b.total_volume / (b.market_cap || 1)) - (a.total_volume / (a.market_cap || 1)));
            break;
        case 'long':
            data = data.filter(c => getFuturesAnalysis(c).direction.startsWith('long'));
            break;
        case 'short':
            data = data.filter(c => getFuturesAnalysis(c).direction.startsWith('short'));
            break;
        case 'favorites':
            data = data.filter(c => favorites.includes(c.id));
            break;
        // 'all' — no filter
    }

    // 3. Modal filters
    const mf = activeModalFilters;
    if (mf.minLiquidity != null) data = data.filter(c => c.total_volume >= mf.minLiquidity);
    if (mf.maxLiquidity != null) data = data.filter(c => c.total_volume <= mf.maxLiquidity);
    if (mf.minMcap      != null) data = data.filter(c => (c.market_cap || 0) >= mf.minMcap);
    if (mf.maxMcap      != null) data = data.filter(c => (c.market_cap || 0) <= mf.maxMcap);
    if (mf.minVolume    != null) data = data.filter(c => c.total_volume >= mf.minVolume);
    if (mf.maxVolume    != null) data = data.filter(c => c.total_volume <= mf.maxVolume);
    if (mf.minChange    != null) data = data.filter(c => (c.price_change_percentage_24h || 0) >= mf.minChange);
    if (mf.maxChange    != null) data = data.filter(c => (c.price_change_percentage_24h || 0) <= mf.maxChange);
    if (mf.futures && mf.futures !== 'all') {
        data = data.filter(c => getFuturesAnalysis(c).direction.startsWith(mf.futures));
    }

    // 4. Sort
    data.sort((a, b) => {
        let va, vb;
        switch (activeSortCol) {
            case 'price':     va = a.current_price;                       vb = b.current_price; break;
            case '1h':        va = a.price_change_percentage_1h_in_currency || 0; vb = b.price_change_percentage_1h_in_currency || 0; break;
            case '24h':       va = a.price_change_percentage_24h || 0;    vb = b.price_change_percentage_24h || 0; break;
            case '7d':        va = a.price_change_percentage_7d_in_currency || 0; vb = b.price_change_percentage_7d_in_currency || 0; break;
            case 'volume':    va = a.total_volume;                        vb = b.total_volume; break;
            case 'mcap':      va = a.market_cap || 0;                     vb = b.market_cap || 0; break;
            case 'liquidity': va = a.market_cap ? a.total_volume / a.market_cap : 0;
                              vb = b.market_cap ? b.total_volume / b.market_cap : 0; break;
            case 'ai':        va = _calcAIScore(a);                       vb = _calcAIScore(b); break;
            default:          va = a.market_cap_rank || 999;              vb = b.market_cap_rank || 999;
                              return activeSortDir === 'asc' ? va - vb : vb - va;
        }
        return activeSortDir === 'asc' ? va - vb : vb - va;
    });

    filteredCryptoData = data;
    currentPage = 1;
    displayCryptoData();
    _updateActiveChips();
}

/** Update sort arrow indicators in thead */
function _updateSortArrows() {
    document.querySelectorAll('th.sortable').forEach(th => {
        const arrow = th.querySelector('.sort-arrow');
        if (!arrow) return;
        th.classList.remove('active-sort');
        if (th.dataset.sort === activeSortCol) {
            th.classList.add('active-sort');
            arrow.textContent = activeSortDir === 'desc' ? '↓' : '↑';
        } else {
            arrow.textContent = '↕';
        }
    });
}

/** Show active filter chips */
function _updateActiveChips() {
    const container = document.getElementById('activeFilterChips');
    const countBadge = document.getElementById('activeFilterCount');
    if (!container) return;

    const chips = [];
    const mf = activeModalFilters;
    if (mf.minLiquidity != null) chips.push({ label: `Liq ≥ $${formatLargeNumber(mf.minLiquidity)}`, key: 'minLiquidity' });
    if (mf.maxLiquidity != null) chips.push({ label: `Liq ≤ $${formatLargeNumber(mf.maxLiquidity)}`, key: 'maxLiquidity' });
    if (mf.minMcap      != null) chips.push({ label: `MCap ≥ $${formatLargeNumber(mf.minMcap)}`,      key: 'minMcap' });
    if (mf.maxMcap      != null) chips.push({ label: `MCap ≤ $${formatLargeNumber(mf.maxMcap)}`,      key: 'maxMcap' });
    if (mf.minVolume    != null) chips.push({ label: `Vol ≥ $${formatLargeNumber(mf.minVolume)}`,      key: 'minVolume' });
    if (mf.maxVolume    != null) chips.push({ label: `Vol ≤ $${formatLargeNumber(mf.maxVolume)}`,      key: 'maxVolume' });
    if (mf.minChange    != null) chips.push({ label: `24h ≥ ${mf.minChange}%`,  key: 'minChange' });
    if (mf.maxChange    != null) chips.push({ label: `24h ≤ ${mf.maxChange}%`,  key: 'maxChange' });
    if (mf.futures && mf.futures !== 'all') chips.push({ label: `Futures: ${mf.futures}`, key: 'futures' });
    if (activeSearchTerm) chips.push({ label: `🔍 "${activeSearchTerm}"`, key: '_search' });

    if (chips.length === 0) {
        container.style.display = 'none';
        if (countBadge) countBadge.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    if (countBadge) { countBadge.textContent = chips.length; countBadge.style.display = 'inline-flex'; }

    container.innerHTML = chips.map(chip =>
        `<span class="dex-chip">${chip.label} <button onclick="_removeChip('${chip.key}')">×</button></span>`
    ).join('');
}

function _removeChip(key) {
    if (key === '_search') {
        activeSearchTerm = '';
        const si = document.getElementById('searchCoin');
        if (si) si.value = '';
    } else {
        delete activeModalFilters[key];
    }
    _applyAllFilters();
}

// ── Filter Modal ──────────────────────────────────────────────

function openFilterModal() {
    const m = document.getElementById('filterModal');
    if (m) m.style.display = 'flex';
}

function closeFilterModal() {
    const m = document.getElementById('filterModal');
    if (m) m.style.display = 'none';
}

function applyFilters() {
    const readNum = id => {
        const v = document.getElementById(id)?.value;
        return (v !== '' && v != null && !isNaN(v)) ? parseFloat(v) : null;
    };
    const futuresVal = document.querySelector('input[name="fFutures"]:checked')?.value || 'all';

    activeModalFilters = {
        minLiquidity: readNum('fMinLiquidity'),
        maxLiquidity: readNum('fMaxLiquidity'),
        minMcap:      readNum('fMinMcap'),
        maxMcap:      readNum('fMaxMcap'),
        minVolume:    readNum('fMinVolume'),
        maxVolume:    readNum('fMaxVolume'),
        minChange:    readNum('fMinChange'),
        maxChange:    readNum('fMaxChange'),
        futures:      futuresVal,
    };
    // Remove null entries
    Object.keys(activeModalFilters).forEach(k => {
        if (activeModalFilters[k] === null) delete activeModalFilters[k];
    });

    closeFilterModal();
    currentPage = 1;
    _applyAllFilters();
}

function clearFilters() {
    activeModalFilters = {};
    // Reset inputs
    ['fMinLiquidity','fMaxLiquidity','fMinMcap','fMaxMcap','fMinVolume','fMaxVolume','fMinChange','fMaxChange']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const allRadio = document.querySelector('input[name="fFutures"][value="all"]');
    if (allRadio) allRadio.checked = true;
    _applyAllFilters();
}

/** Refresh data — invalidate cache then reload */
function refreshData() {
    // Spinner di tombol refresh
    const btn = document.getElementById('refreshBtn');
    if (btn) {
        btn.classList.add('spinning');
        setTimeout(() => btn.classList.remove('spinning'), 3000);
    }
    delete _cache['cryptoMarkets_v2'];
    delete _cache['globalStats'];
    loadMarketStats();
    loadCryptoData();
}

// ──────────────────────────────────────────────────────────────

function toggleFavorite(coinId) {    const index = favorites.indexOf(coinId);
    
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(coinId);
    }
    
    localStorage.setItem('favorites', JSON.stringify(favorites));
    displayCryptoData();
    
    console.log(`⭐ Favorite toggled for ${coinId}`);
}

function toggleFavoritesFilter() {
    showOnlyFavorites = !showOnlyFavorites;
    const btn = document.getElementById('favoritesFilterBtn');
    
    if (btn) {
        btn.innerHTML = showOnlyFavorites 
            ? '<img src="images/ic_stars.svg" style="width: 16px;"> Favorites Only'
            : '<img src="images/ic_stars.svg" style="width: 16px;"> Show All';
    }
    
    currentPage = 1;
    displayCryptoData();
}

async function analyzeCoin(coinId) {
    try {
        const coin = cryptoData.find(c => c.id === coinId);
        if (!coin) return;

        // Multi-step loading UI
        const analysisSection = document.getElementById('analysisSection');
        if (analysisSection) {
            analysisSection.style.display = 'block';
            analysisSection.scrollIntoView({ behavior: 'smooth' });
        }
        const container = document.getElementById('analysisContainer');
        if (container) {
            container.innerHTML = `
            <div class="analyze-steps">
                <div class="analyze-step active" id="astep1"><span class="step-icon"><span class="g-spinner sm"></span></span> Mengambil data detail ${coin.name}…</div>
                <div class="analyze-step" id="astep2"><span class="step-icon">⏳</span> Mengambil market chart 30 hari…</div>
                <div class="analyze-step" id="astep3"><span class="step-icon">⏳</span> Menjalankan analisis teknikal…</div>
                <div class="analyze-step" id="astep4"><span class="step-icon">⏳</span> Menghitung AI score…</div>
            </div>`;
        }

        const _step = (id, done) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (done) {
                el.classList.remove('active'); el.classList.add('done');
                el.querySelector('.step-icon').innerHTML = '';
            } else {
                el.classList.add('active');
                el.querySelector('.step-icon').innerHTML = '<span class="g-spinner sm"></span>';
            }
        };

        // Step 1: Fetch detail
        const response = await fetch(`${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&community_data=true&developer_data=true`);
        const detailedData = await response.json();
        _step('astep1', true); _step('astep2', false);

        // Step 2: Fetch chart
        const marketChart = await fetchMarketChart(coinId, 30);
        _step('astep2', true); _step('astep3', false);

        // Step 3: Technical analysis
        const expertAnalysis = buildExpertAnalysis(coin, marketChart);
        _step('astep3', true); _step('astep4', false);

        // Step 4: Render + AI score
        displayCoinAnalysis(coin, detailedData, expertAnalysis, marketChart);
        _step('astep4', true);
        renderSingleCoinAIScore(coin);

        console.log(`🔍 Analyzing ${coin.name}`);

    } catch (error) {
        console.error('Error analyzing coin:', error);
        showError('Failed to load coin analysis');
    }
}

function displayCoinAnalysis(coin, detailedData, expertAnalysis, marketChart) {
    const container = document.getElementById('analysisContainer');
    if (!container) return;
    const moonPhase = expertAnalysis?.moonPhase;
    const recommendation = expertAnalysis?.recommendation;
    const timeframes = expertAnalysis?.timeframes || [];
    const indicators = expertAnalysis?.indicators;
    const supportResistance = expertAnalysis?.supportResistance;
    const whaleInsight = expertAnalysis?.whaleInsight;
    const fibonacciInsight = expertAnalysis?.fibonacciInsight;
    const altseasonInsight = window.AnalysisUtils?.calculateAltseasonIndexProxy(cryptoData) || null;
    const btcDominance = marketStatsData?.market_cap_percentage?.btc;
    
    const html = `
        <div class="analysis-header">
            <img src="${coin.image}" alt="${coin.name}" class="analysis-coin-icon">
            <div class="analysis-title">
                <h2>${coin.name} (${coin.symbol.toUpperCase()})</h2>
                <div class="analysis-price">
                    <span class="current-price">$${formatNumber(coin.current_price)}</span>
                    <span class="${getChangeClass(coin.price_change_percentage_24h)}">
                        ${formatPercentage(coin.price_change_percentage_24h)} (24h)
                    </span>
                </div>
            </div>
            <button class="btn-close" onclick="closeAnalysis()">✕</button>
        </div>
        
        <div class="analysis-body">
            <div class="analysis-section">
                <h3><img src="images/ic_ai.svg" alt="" class="section-icon"> Expert Recommendation & Futures Signal</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">Futures Recommendation</span>
                        <span class="stat-value">${recommendation?.label || 'Neutral'}</span>
                        <span class="stat-label">${recommendation?.reason || 'Wait for confirmation.'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Support / Resistance</span>
                        <span class="stat-value">${supportResistance ? `$${formatNumber(supportResistance.support)} / $${formatNumber(supportResistance.resistance)}` : 'N/A'}</span>
                    </div>
                </div>
            </div>

            ${renderMoonPhasePanel(moonPhase, coin)}

            <div class="analysis-section">
                 <h3><img src="images/ic_monitoring.svg" alt="" class="section-icon"> Timeframe Potential</h3>
                <div class="stat-grid">
                    ${timeframes.map(tf => `
                        <div class="stat-item">
                            <span class="stat-label">${tf.label} (${tf.horizon})</span>
                            <span class="stat-value">${tf.bias}</span>
                            <span class="stat-label">${tf.change >= 0 ? '+' : ''}${tf.change.toFixed(2)}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="analysis-section">
                 <h3><img src="images/ic_dashboard_1.svg" alt="" class="section-icon"> Expert Chart (MA/EMA/MACD + S/R)</h3>
                <div class="chart-wrapper chart-wrapper--price">
                    <canvas id="expertPriceChart"></canvas>
                </div>
                <div class="chart-wrapper chart-wrapper--macd">
                    <canvas id="expertMacdChart"></canvas>
                </div>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">MA(20)</span>
                        <span class="stat-value">${indicators ? `$${formatNumber(indicators.sma20)}` : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">EMA(20)</span>
                        <span class="stat-value">${indicators ? `$${formatNumber(indicators.ema20)}` : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">MACD</span>
                        <span class="stat-value">${indicators ? formatIndicatorValue(indicators.macd) : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Signal</span>
                        <span class="stat-value">${indicators ? formatIndicatorValue(indicators.signal) : 'N/A'}</span>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                 <h3><img src="images/ic_db.svg" alt="" class="section-icon"> Market Data</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">Market Cap</span>
                        <span class="stat-value">$${formatLargeNumber(coin.market_cap)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">24h Volume</span>
                        <span class="stat-value">$${formatLargeNumber(coin.total_volume)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Circulating Supply</span>
                        <span class="stat-value">${formatLargeNumber(coin.circulating_supply)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Total Supply</span>
                        <span class="stat-value">${coin.total_supply ? formatLargeNumber(coin.total_supply) : 'N/A'}</span>
                    </div>
                </div>
            </div>
            
            <div class="analysis-section">
                 <h3><img src="images/ic_performance.svg" alt="" class="section-icon"> Price Changes</h3>
                <div class="price-changes">
                    <div class="change-item">
                        <span>1 Hour</span>
                        <span class="${getChangeClass(coin.price_change_percentage_1h_in_currency)}">
                            ${formatPercentage(coin.price_change_percentage_1h_in_currency)}
                        </span>
                    </div>
                    <div class="change-item">
                        <span>24 Hours</span>
                        <span class="${getChangeClass(coin.price_change_percentage_24h)}">
                            ${formatPercentage(coin.price_change_percentage_24h)}
                        </span>
                    </div>
                    <div class="change-item">
                        <span>7 Days</span>
                        <span class="${getChangeClass(coin.price_change_percentage_7d_in_currency)}">
                            ${formatPercentage(coin.price_change_percentage_7d_in_currency)}
                        </span>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                 <h3><img src="images/ic_connection.svg" alt="" class="section-icon"> Volume, Market Cap & Whale Insight</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">24h Volume</span>
                        <span class="stat-value">$${formatLargeNumber(coin.total_volume)}</span>
                        <span class="stat-label">Liquidity Ratio: ${(whaleInsight?.volumeRatio * 100).toFixed(2)}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Market Cap</span>
                        <span class="stat-value">$${formatLargeNumber(coin.market_cap)}</span>
                        <span class="stat-label">Supply: ${formatLargeNumber(coin.circulating_supply)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Whale Status</span>
                        <span class="stat-value">${whaleInsight?.status || 'N/A'}</span>
                        <span class="stat-label">${whaleInsight?.message || ''}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Market Activity</span>
                        <span class="stat-value">${whaleInsight?.activity || 'N/A'}</span>
                        <span class="stat-label">${whaleInsight?.activityNote || ''}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">OBV Trend (10 bars)</span>
                        <span class="stat-value">${Number.isFinite(whaleInsight?.obvTrend) ? formatIndicatorValue(whaleInsight.obvTrend) : 'N/A'}</span>
                        <span class="stat-label">${whaleInsight?.obvTrend > 0 ? 'Akumulasi menguat' : 'Distribusi meningkat'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Volume Spike</span>
                        <span class="stat-value">${whaleInsight?.volumeSpike?.spike ? 'Spike Detected' : 'Normal'}</span>
                        <span class="stat-label">Ratio: ${whaleInsight?.volumeSpike?.ratio ? whaleInsight.volumeSpike.ratio.toFixed(2) + 'x' : 'N/A'}</span>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                <h3><img src="images/ic_rules.svg" alt="" class="section-icon"> Fibonacci Potential</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">Trend Direction</span>
                        <span class="stat-value">${fibonacciInsight ? (fibonacciInsight.trend === 'down' ? 'Downtrend' : 'Uptrend') : 'N/A'}</span>
                        <span class="stat-label">${fibonacciInsight ? `High: $${formatNumber(fibonacciInsight.high)} / Low: $${formatNumber(fibonacciInsight.low)}` : 'N/A'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Retracement Levels</span>
                        <span class="stat-value">
                            ${fibonacciInsight?.retracements?.map(level => `${(level.ratio * 100).toFixed(1)}% → $${formatNumber(level.level)}`).join('<br>') || 'N/A'}
                        </span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Extension Targets</span>
                        <span class="stat-value">
                            ${fibonacciInsight?.extensions?.map(level => `${(level.ratio * 100).toFixed(1)}% → $${formatNumber(level.level)}`).join('<br>') || 'N/A'}
                        </span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Accuracy Note</span>
                        <span class="stat-value">${fibonacciInsight?.accuracy || 'Medium'}</span>
                        <span class="stat-label">${fibonacciInsight?.note || 'Gunakan sebagai area konfirmasi, bukan kepastian.'}</span>
                    </div>
                </div>
            </div>

            <div class="analysis-section">
                <h3><img src="images/ic_universe.svg" alt="" class="section-icon"> Macro Sentiment</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">Fear & Greed Index</span>
                        <span class="stat-value">${fearGreedData?.value || 'N/A'}</span>
                        <span class="stat-label">${formatFearGreedLabel(fearGreedData?.value_classification)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Altseason Index</span>
                        <span class="stat-value">${altseasonInsight ? altseasonInsight.index.toFixed(1) + '%' : 'N/A'}</span>
                        <span class="stat-label">${altseasonInsight?.label || 'N/A'} — ${altseasonInsight?.note || ''}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">BTC Dominance</span>
                        <span class="stat-value">${Number.isFinite(btcDominance) ? btcDominance.toFixed(2) + '%' : 'N/A'}</span>
                        <span class="stat-label">Dominasi market cap BTC</span>
                    </div>
                </div>
            </div>

            ${renderFuturesPanel(coin, marketChart)}

            ${renderIndicatorGuide(coin, expertAnalysis?.indicators)}

            <div class="analysis-actions">
                <button class="btn-primary" onclick="addToPortfolio('${coin.id}')">
                    Add to Portfolio
                </button>
                <button class="btn-secondary" onclick="generateExitStrategy('${coin.id}')">
                    Exit Strategy
                </button>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    if (marketChart && marketChart.prices && marketChart.prices.length) {
        renderExpertCharts(marketChart, expertAnalysis);
        renderFibLegend(expertAnalysis?.fibonacciInsight);
    }
}

function closeAnalysis() {
    const analysisSection = document.getElementById('analysisSection');
    if (analysisSection) {
        analysisSection.style.display = 'none';
    }
}

function analyzeWhaleActivity() {
    let accumulation = 0;
    let distribution = 0;
    let neutral = 0;
    
    cryptoData.forEach(coin => {
        const activity = getWhaleActivityStatus(coin);
        if (activity === '🟢 Accumulation') accumulation++;
        else if (activity === '🔴 Distribution') distribution++;
        else neutral++;
    });
    
    document.getElementById('whaleAccumulation').textContent = accumulation;
    document.getElementById('whaleDistribution').textContent = distribution;
    document.getElementById('whaleNeutral').textContent = neutral;
}

function showWhaleDetails(type) {
    // Filter coins sesuai tipe
    const filtered = cryptoData.filter(coin => {
        const status = getWhaleActivityStatus(coin);
        if (type === 'accumulation') return status === '🟢 Accumulation';
        if (type === 'distribution') return status === '🔴 Distribution';
        return status === '🟡 Neutral';
    }).slice(0, 20);

    const labels = {
        accumulation: { title: '🟢 Whale Accumulation', color: '#22c55e', desc: 'Volume tinggi + harga naik — whale sedang beli' },
        distribution:  { title: '🔴 Whale Distribution', color: '#ef4444', desc: 'Volume tinggi + harga turun — whale sedang jual' },
        neutral:       { title: '🟡 Neutral Activity',   color: '#f59e0b', desc: 'Aktivitas whale tidak dominan ke satu arah' }
    };
    const info = labels[type];

    // Buat atau reuse modal whale-details
    let modal = document.getElementById('whaleDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'whaleDetailsModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:680px;">
                <div class="modal-header">
                    <h2 id="whaleDetailsTitle"></h2>
                    <span class="close-modal" onclick="closeWhaleDetails()">&times;</span>
                </div>
                <p id="whaleDetailsDesc" style="font-size:13px;color:#94a3b8;margin:0 0 14px;"></p>
                <div id="whaleDetailsBody"></div>
            </div>
        `;
        modal.addEventListener('click', e => { if (e.target === modal) closeWhaleDetails(); });
        document.body.appendChild(modal);
    }

    document.getElementById('whaleDetailsTitle').textContent = info.title;
    document.getElementById('whaleDetailsDesc').textContent  = info.desc;

    const body = document.getElementById('whaleDetailsBody');
    if (!filtered.length) {
        body.innerHTML = '<p style="color:#64748b;text-align:center;padding:20px;">Tidak ada coin di kategori ini saat ini.</p>';
    } else {
        body.innerHTML = `
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="color:#94a3b8;border-bottom:1px solid rgba(148,163,184,0.15);">
                            <th style="padding:8px 6px;text-align:left;">#</th>
                            <th style="padding:8px 6px;text-align:left;">Coin</th>
                            <th style="padding:8px 6px;text-align:right;">Price</th>
                            <th style="padding:8px 6px;text-align:right;">24h %</th>
                            <th style="padding:8px 6px;text-align:right;">Volume / MCap</th>
                            <th style="padding:8px 6px;text-align:right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map((coin, i) => {
                            const ratio = coin.market_cap ? (coin.total_volume / coin.market_cap * 100).toFixed(1) : '—';
                            return `
                                <tr style="border-bottom:1px solid rgba(148,163,184,0.08);">
                                    <td style="padding:8px 6px;color:#64748b;">${i + 1}</td>
                                    <td style="padding:8px 6px;">
                                        <div style="display:flex;align-items:center;gap:8px;">
                                            <img src="${coin.image}" style="width:24px;height:24px;border-radius:50%;">
                                            <div>
                                                <div style="font-weight:600;">${coin.name}</div>
                                                <div style="font-size:11px;color:#64748b;">${coin.symbol.toUpperCase()}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style="padding:8px 6px;text-align:right;font-weight:600;">$${formatNumber(coin.current_price)}</td>
                                    <td style="padding:8px 6px;text-align:right;" class="${getChangeClass(coin.price_change_percentage_24h)}">${formatPercentage(coin.price_change_percentage_24h)}</td>
                                    <td style="padding:8px 6px;text-align:right;color:#a5b4fc;">${ratio}%</td>
                                    <td style="padding:8px 6px;text-align:right;">
                                        <button class="btn-action" onclick="closeWhaleDetails();analyzeCoin('${coin.id}')">Analyze</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    modal.classList.add('active');
}

function closeWhaleDetails() {
    const modal = document.getElementById('whaleDetailsModal');
    if (modal) modal.classList.remove('active');
}

function analyzeMarketNarratives() {
    const narrativeGrid = document.getElementById('narrativeGrid');
    if (!narrativeGrid) return;
    
    const narratives = [
        { name: 'DeFi', coins: ['uniswap', 'aave', 'maker'], icon: '🏦' },
        { name: 'Layer 1', coins: ['ethereum', 'solana', 'cardano'], icon: '⛓️' },
        { name: 'AI & Data', coins: ['fetch-ai', 'ocean-protocol', 'render-token'], icon: '🤖' },
        { name: 'Gaming', coins: ['immutable-x', 'the-sandbox', 'axie-infinity'], icon: '🎮' },
        { name: 'Meme Coins', coins: ['dogecoin', 'shiba-inu', 'pepe'], icon: '🐸' },
        { name: 'Infrastructure', coins: ['chainlink', 'filecoin', 'the-graph'], icon: '🏗️' }
    ];
    
    const html = narratives.map(narrative => {
        const narrativeCoins = cryptoData.filter(coin => narrative.coins.includes(coin.id));
        const avgChange = narrativeCoins.reduce((sum, coin) => 
            sum + (coin.price_change_percentage_24h || 0), 0) / narrativeCoins.length;
        
        return `
            <div class="narrative-card ${avgChange > 0 ? 'positive' : 'negative'}">
                <div class="narrative-icon">${narrative.icon}</div>
                <h4>${narrative.name}</h4>
                <div class="narrative-change ${getChangeClass(avgChange)}">
                    ${formatPercentage(avgChange)}
                </div>
                <div class="narrative-count">${narrativeCoins.length} coins</div>
            </div>
        `;
    }).join('');
    
    narrativeGrid.innerHTML = html;
}

// Utility Functions

// ─────────────────────────────────────────────────────────────────────────────
// FUTURES ANALYSIS ENGINE
// Menganalisis posisi optimal untuk trading futures: Long/Short, leverage,
// entry, TP1, TP2, SL, liquidation estimate, dan risk/reward ratio.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hitung RSI sederhana dari array harga.
 * @param {number[]} prices - array harga
 * @param {number} period  - periode (default 14)
 * @returns {number} nilai RSI 0–100
 */
function calcRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/**
 * Hitung EMA dari array harga.
 * @param {number[]} prices
 * @param {number} period
 * @returns {number} nilai EMA terakhir
 */
function calcEMA(prices, period) {
    if (!prices || prices.length < period) return prices?.at(-1) || 0;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
}

/**
 * Hitung Average True Range (ATR) — ukuran volatilitas.
 * @param {number[]} prices
 * @param {number} period
 * @returns {number} ATR
 */
function calcATR(prices, period = 14) {
    if (!prices || prices.length < period + 1) return 0;
    const trs = [];
    for (let i = 1; i < prices.length; i++) {
        trs.push(Math.abs(prices[i] - prices[i - 1]));
    }
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * Fungsi utama analisis futures.
 * Mengembalikan rekomendasi lengkap untuk trading futures.
 *
 * @param {object} coin - data koin dari CoinGecko
 * @param {object|null} marketChart - { prices: number[], volumes: number[] } dari fetchMarketChart (opsional)
 * @returns {object} FuturesResult
 */
function getFuturesAnalysis(coin, marketChart = null) {
    const price    = coin.current_price || 0;
    const ch1h     = coin.price_change_percentage_1h_in_currency || 0;
    const ch24h    = coin.price_change_percentage_24h || 0;
    const ch7d     = coin.price_change_percentage_7d_in_currency || 0;
    const volRatio = coin.market_cap ? coin.total_volume / coin.market_cap : 0;

    // Ambil harga dari sparkline 7d (168 titik = setiap jam)
    const spark   = coin.sparkline_in_7d?.price || [];
    // Harga 30d dari marketChart jika tersedia
    const hist    = marketChart?.prices?.map(p => p[1]) || spark;

    // ── Indikator teknikal ───────────────────────────────────────────
    const rsi      = calcRSI(spark, 14);
    const ema20    = calcEMA(spark, 20);
    const ema50    = calcEMA(spark, 50);
    const atr      = calcATR(spark, 14);
    const atrPct   = price > 0 ? (atr / price) * 100 : 2;  // ATR sebagai % harga

    // Support / Resistance dari persentil 7d
    const sorted   = [...spark].sort((a, b) => a - b);
    const support  = spark.length > 10 ? sorted[Math.floor(sorted.length * 0.1)] : price * 0.9;
    const resist   = spark.length > 10 ? sorted[Math.floor(sorted.length * 0.9)] : price * 1.1;
    const midLine  = (support + resist) / 2;

    // High & Low 7d
    const high7d   = spark.length ? Math.max(...spark) : price * 1.1;
    const low7d    = spark.length ? Math.min(...spark) : price * 0.9;
    const range7d  = high7d - low7d || 1;
    const posInRange = (price - low7d) / range7d; // 0 = bawah, 1 = atas

    // ── Skor sinyal (positif = bullish, negatif = bearish) ───────────
    let score = 0;
    const factors = [];

    // Faktor 1: Momentum 24h
    if (ch24h > 5)        { score += 2; factors.push(`24h +${ch24h.toFixed(1)}% ↑↑`); }
    else if (ch24h > 1)   { score += 1; factors.push(`24h +${ch24h.toFixed(1)}% ↑`); }
    else if (ch24h < -5)  { score -= 2; factors.push(`24h ${ch24h.toFixed(1)}% ↓↓`); }
    else if (ch24h < -1)  { score -= 1; factors.push(`24h ${ch24h.toFixed(1)}% ↓`); }

    // Faktor 2: Trend 7d
    if (ch7d > 10)        { score += 2; factors.push(`7d +${ch7d.toFixed(0)}% ↑↑`); }
    else if (ch7d > 0)    { score += 1; factors.push(`7d +${ch7d.toFixed(0)}% ↑`); }
    else if (ch7d < -10)  { score -= 2; factors.push(`7d ${ch7d.toFixed(0)}% ↓↓`); }
    else if (ch7d < 0)    { score -= 1; factors.push(`7d ${ch7d.toFixed(0)}% ↓`); }

    // Faktor 3: RSI
    if (rsi < 30)         { score += 2; factors.push(`RSI ${rsi.toFixed(0)} oversold`); }
    else if (rsi < 45)    { score += 1; factors.push(`RSI ${rsi.toFixed(0)} lemah`); }
    else if (rsi > 75)    { score -= 2; factors.push(`RSI ${rsi.toFixed(0)} overbought`); }
    else if (rsi > 60)    { score -= 1; factors.push(`RSI ${rsi.toFixed(0)} tinggi`); }

    // Faktor 4: EMA crossover
    if (ema20 > ema50)    { score += 1; factors.push(`EMA20 > EMA50 bullish`); }
    else if (ema20 < ema50){ score -= 1; factors.push(`EMA20 < EMA50 bearish`); }

    // Faktor 5: Posisi harga dalam range
    if (posInRange < 0.2) { score += 1; factors.push(`Harga dekat support`); }
    if (posInRange > 0.8) { score -= 1; factors.push(`Harga dekat resistensi`); }

    // Faktor 6: Volume momentum
    if (volRatio > 0.2 && ch24h > 0)  { score += 1; factors.push(`Volume spike + naik`); }
    if (volRatio > 0.2 && ch24h < 0)  { score -= 1; factors.push(`Volume spike + turun`); }

    // ── Momentum 1h untuk konfirmasi ─────────────────────────────────
    const confirmedUp   = ch1h > 0.5 && score > 0;
    const confirmedDown = ch1h < -0.5 && score < 0;

    // ── Tentukan arah ─────────────────────────────────────────────────
    let direction, dirLabel, dirColor, dirEmoji;
    if (score >= 3) {
        direction = 'long';   dirLabel = 'LONG';  dirColor = '#22c55e'; dirEmoji = '🟢';
    } else if (score <= -3) {
        direction = 'short';  dirLabel = 'SHORT'; dirColor = '#ef4444'; dirEmoji = '🔴';
    } else if (score >= 1) {
        direction = 'long_weak';  dirLabel = 'LONG (Lemah)';  dirColor = '#86efac'; dirEmoji = '↗️';
    } else if (score <= -1) {
        direction = 'short_weak'; dirLabel = 'SHORT (Lemah)'; dirColor = '#fca5a5'; dirEmoji = '↘️';
    } else {
        direction = 'neutral'; dirLabel = 'NETRAL / Hindari'; dirColor = '#94a3b8'; dirEmoji = '⚪';
    }

    // ── Leverage optimal berdasarkan volatilitas (ATR%) ───────────────
    // Semakin volatile → leverage lebih rendah
    let leverage;
    if (atrPct > 6)       leverage = 2;
    else if (atrPct > 4)  leverage = 3;
    else if (atrPct > 2.5)leverage = 5;
    else if (atrPct > 1.5)leverage = 7;
    else                  leverage = 10;

    // Kurangi leverage jika sinyal lemah atau netral
    if (direction === 'neutral')     leverage = 1;
    if (direction.includes('weak'))  leverage = Math.min(leverage, 3);

    // ── Hitung entry, TP, SL berdasarkan ATR ─────────────────────────
    const atrBuffer = atr * 0.5;  // buffer 0.5 ATR

    let entry, tp1, tp2, sl, liqEstimate;
    const rr = 2.0; // target risk/reward 1:2

    if (direction === 'long' || direction === 'long_weak') {
        entry      = price;
        sl         = Math.max(price - atr * 1.5, support * 0.995);
        const risk  = entry - sl;
        tp1        = entry + risk * rr;
        tp2        = entry + risk * rr * 1.8;
        // Estimasi liquidation (simplified: entry / (1 + 1/leverage * 0.9))
        liqEstimate = entry * (1 - (1 / leverage) * 0.9);
    } else if (direction === 'short' || direction === 'short_weak') {
        entry      = price;
        sl         = Math.min(price + atr * 1.5, resist * 1.005);
        const risk  = sl - entry;
        tp1        = entry - risk * rr;
        tp2        = entry - risk * rr * 1.8;
        liqEstimate = entry * (1 + (1 / leverage) * 0.9);
    } else {
        entry = tp1 = tp2 = sl = liqEstimate = price;
    }

    // Pastikan angka valid
    tp2  = Math.max(tp2, 0);
    sl   = Math.max(sl, 0);

    // ── Hitung risk & reward dalam % ─────────────────────────────────
    const riskPct   = entry > 0 ? Math.abs(entry - sl) / entry * 100 : 0;
    const rewardPct = entry > 0 ? Math.abs(tp1 - entry) / entry * 100 : 0;
    const rrRatio   = riskPct > 0 ? (rewardPct / riskPct).toFixed(2) : 'N/A';

    // ── Level volatilitas ─────────────────────────────────────────────
    let volatilityLevel;
    if (atrPct > 6)        volatilityLevel = 'Sangat Tinggi 🔴';
    else if (atrPct > 3.5) volatilityLevel = 'Tinggi 🟠';
    else if (atrPct > 2)   volatilityLevel = 'Sedang 🟡';
    else                   volatilityLevel = 'Rendah 🟢';

    // ── Confidence level ──────────────────────────────────────────────
    const absScore = Math.abs(score);
    let confidence;
    if (absScore >= 5 && (confirmedUp || confirmedDown)) confidence = 'Tinggi ✅';
    else if (absScore >= 3)                               confidence = 'Sedang 📊';
    else if (absScore >= 1)                               confidence = 'Lemah ⚠️';
    else                                                  confidence = 'Tidak ada ❌';

    const fmt = (n) => {
        if (!n || !Number.isFinite(n)) return '—';
        if (n >= 1000)  return `$${(n/1000).toFixed(2)}K`;
        if (n >= 1)     return `$${n.toFixed(3)}`;
        if (n >= 0.01)  return `$${n.toFixed(4)}`;
        return `$${n.toFixed(6)}`;
    };

    return {
        direction,
        dirLabel,
        dirColor,
        dirEmoji,
        score,
        leverage,
        entry:        fmt(entry),
        tp1:          fmt(tp1),
        tp2:          fmt(tp2),
        sl:           fmt(sl),
        liqEstimate:  fmt(liqEstimate),
        riskPct:      riskPct.toFixed(2),
        rewardPct:    rewardPct.toFixed(2),
        rrRatio,
        rsi:          rsi.toFixed(0),
        atrPct:       atrPct.toFixed(2),
        volatilityLevel,
        confidence,
        factors,
        support:      fmt(support),
        resistance:   fmt(resist),
        isNeutral:    direction === 'neutral',
    };
}

/**
 * Hasilkan HTML panel Futures Analysis untuk ditampilkan di detail koin.
 * @param {object} coin
 * @param {object|null} marketChart
 * @returns {string} HTML string
 */

/**
 * Hitung tanggal mulai & selesai masing-masing dari 8 fase bulan dalam siklus terdekat.
 * Mengembalikan array 8 objek { start: Date, end: Date, daysUntil: number }
 * diurutkan sesuai urutan standar: New Moon → Waning Crescent.
 */
function _getMoonPhaseDates() {
    // Referensi New Moon yang diketahui (UTC) — 29 Jan 2025 12:36 UTC
    const KNOWN_NEW_MOON = new Date('2025-01-29T12:36:00Z');
    const LUNAR_CYCLE = 29.53059; // hari
    const MS_PER_DAY  = 86400000;
    const now = new Date();

    const daysSince    = (now - KNOWN_NEW_MOON) / MS_PER_DAY;
    const cyclesElapsed = Math.floor(daysSince / LUNAR_CYCLE);

    // Offset awal setiap fase (dalam hari dari New Moon) berdasarkan astronomi:
    // New Moon=0, Waxing Crescent≈1.85, First Quarter≈7.38, Waxing Gibbous≈11.07,
    // Full Moon≈14.77, Waning Gibbous≈18.45, Last Quarter≈22.15, Waning Crescent≈25.84
    const PHASE_OFFSETS = [0, 1.85, 7.38, 11.07, 14.77, 18.45, 22.15, 25.84];

    // Hitung tanggal New Moon terdekat sebelum sekarang
    const newMoonRecent = new Date(KNOWN_NEW_MOON.getTime() + cyclesElapsed * LUNAR_CYCLE * MS_PER_DAY);

    const results = PHASE_OFFSETS.map((offset, i) => {
        const nextOffset = i < 7 ? PHASE_OFFSETS[i + 1] : LUNAR_CYCLE;
        const start = new Date(newMoonRecent.getTime() + offset * MS_PER_DAY);
        const end   = new Date(newMoonRecent.getTime() + nextOffset * MS_PER_DAY - MS_PER_DAY);
        const daysUntil = Math.ceil((start - now) / MS_PER_DAY);

        // Jika fase ini sudah lewat di siklus ini, hitung di siklus berikutnya
        const startNext = daysUntil < -Math.ceil(nextOffset - offset) + 1
            ? new Date(newMoonRecent.getTime() + (offset + LUNAR_CYCLE) * MS_PER_DAY)
            : start;
        const endNext   = daysUntil < -Math.ceil(nextOffset - offset) + 1
            ? new Date(newMoonRecent.getTime() + (nextOffset + LUNAR_CYCLE) * MS_PER_DAY - MS_PER_DAY)
            : end;
        const daysUntilFinal = Math.ceil((startNext - now) / MS_PER_DAY);

        return { start: startNext, end: endNext, daysUntil: daysUntilFinal };
    });

    return results;
}

/**
 * Format tanggal ke "24 Feb" atau "3 Mar" (bahasa Indonesia-friendly).
 */
function _fmtMoonDate(date) {
    const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
    return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/**
 * Render panel Moon Phase — penjelasan lengkap + dampak ke crypto + faktor AI score.
 */
function renderMoonPhasePanel(moonPhase, coin) {
    if (!moonPhase) return '';

    const phases = [
        { icon: '🌑', name: 'New Moon',        bias: 'Cautious',    biasColor: '#94a3b8',
          cryptoImpact: 'Sideways — volume cenderung tipis, tunggu konfirmasi arah',
          aiWeight: -5, strategy: 'Hindari entry besar. Tunggu breakout setelah fase ini.',
          detail: 'Bulan tidak terlihat. Energi rendah. Pasar crypto historis cenderung konsolidasi atau awal siklus baru.' },
        { icon: '🌒', name: 'Waxing Crescent',  bias: 'Building',    biasColor: '#fbbf24',
          cryptoImpact: 'Momentum mulai terbentuk — accumulate secara bertahap',
          aiWeight: +3, strategy: 'Mulai akumulasi dengan posisi kecil, tambah saat konfirmasi.',
          detail: 'Bulan mulai terlihat. Momentum pasar perlahan terbentuk. Altcoin sering mulai bergerak di fase ini.' },
        { icon: '🌓', name: 'First Quarter',    bias: 'Trend Shift', biasColor: '#a78bfa',
          cryptoImpact: 'Potensi breakout atau reversal — perhatikan volume',
          aiWeight: +2, strategy: 'Entry jika ada breakout dengan volume. Pasang SL ketat.',
          detail: 'Setengah bulan terlihat. Sering terjadi perubahan arah trend. Volatilitas biasanya meningkat.' },
        { icon: '🌔', name: 'Waxing Gibbous',   bias: 'Risk-On',     biasColor: '#4ade80',
          cryptoImpact: 'Trend naik menguat — momentum continuation',
          aiWeight: +5, strategy: 'Hold posisi, trail stop. Momentum sering kuat di fase ini.',
          detail: 'Bulan hampir penuh. Fase yang historis paling bullish untuk crypto. Volume naik, sentiment positif.' },
        { icon: '🌕', name: 'Full Moon',         bias: 'Exhaustion',  biasColor: '#f87171',
          cryptoImpact: 'Potensi puncak lokal — waspada reversal & volatilitas tinggi',
          aiWeight: -8, strategy: 'Ambil sebagian profit. Waspada fake breakout. Volatilitas tinggi.',
          detail: 'Bulan penuh. Historis sering terjadi spike volatilitas tinggi lalu reversal. Hati-hati FOMO.' },
        { icon: '🌖', name: 'Waning Gibbous',    bias: 'Cooling',     biasColor: '#fbbf24',
          cryptoImpact: 'Momentum melemah — ambil profit bertahap',
          aiWeight: -3, strategy: 'Kurangi posisi secara bertahap, pindah ke stablecoin sebagian.',
          detail: 'Bulan mulai menyusut. Momentum biasanya melambat. Distribusi oleh smart money sering dimulai.' },
        { icon: '🌗', name: 'Last Quarter',      bias: 'Rebalance',   biasColor: '#94a3b8',
          cryptoImpact: 'Mean reversion — hindari chase, tunggu setup baru',
          aiWeight: -2, strategy: 'Rebalance portofolio. Hindari entry baru tanpa konfirmasi kuat.',
          detail: 'Setengah bulan gelap. Pasar sering sideways atau koreksi ringan. Baik untuk evaluasi posisi.' },
        { icon: '🌘', name: 'Waning Crescent',   bias: 'Reset',       biasColor: '#60a5fa',
          cryptoImpact: 'Volume rendah, fokus high-conviction setup saja',
          aiWeight: 0, strategy: 'Patience. Simpan modal untuk New Moon berikutnya.',
          detail: 'Hampir New Moon. Volume tipis, volatilitas rendah. Waktu terbaik untuk research, bukan trading.' },
    ];

    const current = phases[moonPhase.phaseIndex] || phases[0];
    const illumPct = Math.round((moonPhase.illumination || 0) * 100);
    const daysInCycle = moonPhase.phase?.toFixed(1) ?? '—';
    const daysToFull = moonPhase.phaseIndex < 4
        ? ((4 - moonPhase.phaseIndex) * 3.7).toFixed(0)
        : ((8 - moonPhase.phaseIndex + 4) * 3.7).toFixed(0);
    const aiWeight = current.aiWeight;
    const aiWeightStr = aiWeight >= 0 ? `+${aiWeight} pts` : `${aiWeight} pts`;
    const aiWeightColor = aiWeight > 0 ? '#4ade80' : aiWeight < 0 ? '#f87171' : '#94a3b8';

    // Visual 8-phase cycle
    const cycleHtml = phases.map((p, i) => {
        const isActive = i === moonPhase.phaseIndex;
        return `<div class="moon-cycle-dot ${isActive ? 'moon-cycle-dot--active' : ''}" title="${p.name}">
            <span class="moon-cycle-icon">${p.icon}</span>
            ${isActive ? `<span class="moon-cycle-now">Saat ini</span>` : ''}
        </div>`;
    }).join('<div class="moon-cycle-line"></div>');

    return `
    <div class="analysis-section moon-phase-panel">
        <h3>🌙 Moon Phase Analysis — Faktor Siklus Lunar</h3>

        <!-- Current Phase Banner -->
        <div class="moon-current-banner">
            <div class="moon-banner-icon">${current.icon}</div>
            <div class="moon-banner-info">
                <div class="moon-banner-name">${current.name}</div>
                <div class="moon-banner-bias" style="color:${current.biasColor}">Bias: ${current.bias}</div>
                <div class="moon-banner-detail">${current.detail}</div>
            </div>
            <div class="moon-banner-stats">
                <div class="moon-stat-item">
                    <div class="moon-stat-val">${illumPct}%</div>
                    <div class="moon-stat-lbl">Iluminasi</div>
                </div>
                <div class="moon-stat-item">
                    <div class="moon-stat-val">${daysInCycle}</div>
                    <div class="moon-stat-lbl">Hari dalam Siklus</div>
                </div>
                <div class="moon-stat-item">
                    <div class="moon-stat-val" style="color:${aiWeightColor}">${aiWeightStr}</div>
                    <div class="moon-stat-lbl">Bobot AI Score</div>
                </div>
            </div>
        </div>

        <!-- 8-Phase Visual Cycle -->
        <div class="moon-cycle-row">
            ${cycleHtml}
        </div>

        <!-- Crypto Impact & Strategy -->
        <div class="moon-impact-grid">
            <div class="moon-impact-card">
                <div class="moon-impact-title">📊 Dampak ke Crypto Sekarang</div>
                <div class="moon-impact-body" style="color:${current.biasColor}">${current.cryptoImpact}</div>
            </div>
            <div class="moon-impact-card">
                <div class="moon-impact-title">🎯 Strategi Trading</div>
                <div class="moon-impact-body">${current.strategy}</div>
            </div>
        </div>

        <!-- How Moon Factors into AI Score -->
        <div class="moon-ai-explain">
            <div class="moon-ai-title">🤖 Bagaimana Moon Phase masuk ke AI Score?</div>
            <div class="moon-ai-body">
                AI Score koin ini menggunakan <strong>6 faktor</strong>. Moon Phase adalah faktor ke-7 yang ditambahkan sebagai
                <em>sentiment modifier</em> — bukan faktor teknikal murni, tapi berdasarkan data historis korelasi siklus lunar
                dengan volatilitas pasar crypto:
            </div>
            <div class="moon-phase-table">
                <div class="moon-phase-row moon-phase-row--header">
                    <span>Fase</span><span>Bias</span><span>Pengaruh AI</span><span>Tanggal</span><span>Countdown</span><span>Alasan</span>
                </div>
                ${(() => {
                    const phaseDates = _getMoonPhaseDates();
                    return phases.map((p, i) => {
                        const isActive = i === moonPhase.phaseIndex;
                        const wStr = p.aiWeight >= 0 ? `+${p.aiWeight}` : `${p.aiWeight}`;
                        const wColor = p.aiWeight > 0 ? '#4ade80' : p.aiWeight < 0 ? '#f87171' : '#94a3b8';
                        const pd = phaseDates[i];
                        const dateStr = `${_fmtMoonDate(pd.start)} – ${_fmtMoonDate(pd.end)}`;
                        let countdownEl = '';
                        if (isActive) {
                            countdownEl = `<span class="moon-now-badge">Sekarang</span>`;
                        } else if (pd.daysUntil <= 0) {
                            countdownEl = `<span style="color:#94a3b8;font-size:0.7rem">Lewat</span>`;
                        } else if (pd.daysUntil === 1) {
                            countdownEl = `<span style="color:#fbbf24;font-size:0.7rem">Besok</span>`;
                        } else {
                            countdownEl = `<span style="color:#60a5fa;font-size:0.7rem">${pd.daysUntil} hari lagi</span>`;
                        }
                        return `
                        <div class="moon-phase-row ${isActive ? 'moon-phase-row--active' : ''}">
                            <span>${p.icon} ${p.name}</span>
                            <span style="color:${p.biasColor}">${p.bias}</span>
                            <span style="color:${wColor};font-weight:700">${wStr} pts</span>
                            <span class="moon-date-range">${dateStr}</span>
                            <span class="moon-countdown">${countdownEl}</span>
                            <span style="color:#64748b;font-size:0.7rem">${p.cryptoImpact.split('—')[0].trim()}</span>
                        </div>`;
                    }).join('');
                })()}
            </div>
        </div>

        <div class="moon-disclaimer">
            💡 <strong>Catatan:</strong> Moon Phase adalah faktor <em>probabilistik</em>, bukan deterministik.
            Digunakan sebagai konteks tambahan, bukan sinyal utama. Selalu kombinasikan dengan analisis teknikal (MA/EMA/MACD) dan fundamental.
        </div>
    </div>`;
}

/**
 * Render panel edukasi MA / EMA / MACD dengan nilai aktual koin ini.
 * Menjelaskan kondisi bullish/bearish berdasarkan rumus nyata.
 */
function renderIndicatorGuide(coin, indicators) {
    const price  = coin.current_price || 0;
    const spark  = coin.sparkline_in_7d?.price || [];
    const ma20   = indicators?.sma20  ?? calcEMA(spark, 20);
    const ema20  = indicators?.ema20  ?? calcEMA(spark, 20);
    const ema50  = calcEMA(spark, 50);
    const macd   = indicators?.macd   ?? null;
    const signal = indicators?.signal ?? null;
    const hist   = indicators?.histogram ?? null;

    const fmt  = (n) => n != null && Number.isFinite(n) ? formatNumber(n) : '—';
    const fmtI = (n) => n != null && Number.isFinite(n) ? (n >= 0 ? `+${n.toFixed(4)}` : n.toFixed(4)) : '—';

    // ── Status tiap indikator ─────────────────────────────────
    const priceVsMA20  = ma20  ? (price > ma20  ? { ok: true,  label: `✅ Harga ($${fmt(price)}) > MA20 ($${fmt(ma20)})`, note: 'BULLISH — harga di atas rata-rata 20 hari' } : { ok: false, label: `❌ Harga ($${fmt(price)}) < MA20 ($${fmt(ma20)})`, note: 'BEARISH — harga di bawah rata-rata 20 hari' }) : null;
    const priceVsEMA20 = ema20 ? (price > ema20 ? { ok: true,  label: `✅ Harga ($${fmt(price)}) > EMA20 ($${fmt(ema20)})`, note: 'BULLISH — EMA responsif, sinyal cepat' } : { ok: false, label: `❌ Harga ($${fmt(price)}) < EMA20 ($${fmt(ema20)})`, note: 'BEARISH — momentum melemah' }) : null;
    const ema20v50     = (ema20 && ema50) ? (ema20 > ema50 ? { ok: true, label: `✅ EMA20 ($${fmt(ema20)}) > EMA50 ($${fmt(ema50)})`, note: 'Golden Cross area — trend naik jangka menengah' } : { ok: false, label: `❌ EMA20 ($${fmt(ema20)}) < EMA50 ($${fmt(ema50)})`, note: 'Death Cross area — trend turun jangka menengah' }) : null;
    const macdStatus   = (macd != null && signal != null) ? (macd > signal ? { ok: true,  label: `✅ MACD (${fmtI(macd)}) > Signal (${fmtI(signal)})`, note: 'BULLISH crossover — momentum naik' } : { ok: false, label: `❌ MACD (${fmtI(macd)}) < Signal (${fmtI(signal)})`, note: 'BEARISH crossover — momentum turun' }) : null;
    const histStatus   = (hist != null) ? (hist > 0 ? { ok: true,  label: `✅ Histogram: ${fmtI(hist)} (positif)`, note: 'Bullish momentum menguat' } : { ok: false, label: `❌ Histogram: ${fmtI(hist)} (negatif)`, note: 'Bearish momentum menguat' }) : null;

    const bullCount = [priceVsMA20, priceVsEMA20, ema20v50, macdStatus, histStatus].filter(x => x?.ok).length;
    const totalCnt  = [priceVsMA20, priceVsEMA20, ema20v50, macdStatus, histStatus].filter(Boolean).length;
    const overallOk = bullCount > totalCnt / 2;
    const overallColor = overallOk ? '#4ade80' : '#f87171';
    const overallLabel = bullCount === totalCnt ? '🔥 Full Bullish' : bullCount > totalCnt / 2 ? `📈 Bullish (${bullCount}/${totalCnt})` : bullCount === 0 ? '💀 Full Bearish' : `📉 Bearish (${bullCount}/${totalCnt})`;

    const row = (item) => item ? `
        <div class="ig-row ${item.ok ? 'ig-bull' : 'ig-bear'}">
            <div class="ig-label">${item.label}</div>
            <div class="ig-note">${item.note}</div>
        </div>` : '';

    return `
    <div class="analysis-section indicator-guide-panel">
        <h3>📐 Indikator Guide — MA / EMA / MACD</h3>

        <div class="ig-overall" style="border-color:${overallColor}">
            <span style="color:${overallColor};font-weight:700;font-size:1rem">${overallLabel}</span>
            <span style="color:#64748b;font-size:0.78rem">${bullCount} dari ${totalCnt} kondisi bullish terpenuhi</span>
        </div>

        <div class="ig-grid">
            <!-- MA20 -->
            <div class="ig-card">
                <div class="ig-card-title">📏 MA (Moving Average)</div>
                <div class="ig-formula">MA20 = (P₁ + P₂ + … + P₂₀) ÷ 20</div>
                <div class="ig-desc">Rata-rata harga sederhana 20 hari terakhir. Bertindak sebagai support/resistance dinamis.</div>
                <div class="ig-conditions">
                    <div class="ig-cond ig-cond-bull">✅ Bullish jika: <strong>Harga &gt; MA20</strong> — tren naik aktif</div>
                    <div class="ig-cond ig-cond-bull">✅ Bullish jika: <strong>MA20 slope naik</strong> (nilai MA20 lebih tinggi dari kemarin)</div>
                    <div class="ig-cond ig-cond-bear">❌ Bearish jika: <strong>Harga &lt; MA20</strong> — tekanan jual dominan</div>
                </div>
                ${row(priceVsMA20)}
            </div>

            <!-- EMA20 & EMA50 -->
            <div class="ig-card">
                <div class="ig-card-title">⚡ EMA (Exponential MA)</div>
                <div class="ig-formula">EMAₜ = Pₜ × k + EMAₜ₋₁ × (1−k) &nbsp; dimana k = 2÷(n+1)</div>
                <div class="ig-desc">Seperti MA tapi memberi bobot lebih pada harga terbaru. Lebih reaktif terhadap perubahan harga.</div>
                <div class="ig-conditions">
                    <div class="ig-cond ig-cond-bull">✅ Bullish jika: <strong>Harga &gt; EMA20</strong></div>
                    <div class="ig-cond ig-cond-bull">✅ Golden Cross: <strong>EMA20 memotong EMA50 dari bawah ke atas</strong></div>
                    <div class="ig-cond ig-cond-bear">❌ Death Cross: <strong>EMA20 memotong EMA50 dari atas ke bawah</strong></div>
                </div>
                ${row(priceVsEMA20)}
                ${row(ema20v50)}
            </div>

            <!-- MACD -->
            <div class="ig-card">
                <div class="ig-card-title">📊 MACD (Momentum)</div>
                <div class="ig-formula">MACD = EMA12 − EMA26 &nbsp;|&nbsp; Signal = EMA9(MACD) &nbsp;|&nbsp; Histogram = MACD − Signal</div>
                <div class="ig-desc">Mengukur kekuatan dan arah momentum. Histogram positif = momentum naik, negatif = turun.</div>
                <div class="ig-conditions">
                    <div class="ig-cond ig-cond-bull">✅ Bullish jika: <strong>MACD &gt; Signal line</strong> (bullish crossover)</div>
                    <div class="ig-cond ig-cond-bull">✅ Bullish jika: <strong>Histogram positif dan membesar</strong></div>
                    <div class="ig-cond ig-cond-bull">✅ Strong Bull jika: <strong>MACD, Signal, Histogram semua di atas 0</strong></div>
                    <div class="ig-cond ig-cond-bear">❌ Bearish jika: <strong>MACD &lt; Signal</strong> (bearish crossover)</div>
                    <div class="ig-cond ig-cond-bear">❌ Bearish jika: <strong>Histogram negatif dan membesar</strong></div>
                </div>
                ${row(macdStatus)}
                ${row(histStatus)}
            </div>
        </div>

        <div class="ig-summary">
            <strong>💡 Cara baca gabungan:</strong>
            <span>Bullish paling kuat = Harga &gt; MA20 &gt; MA50, EMA20 &gt; EMA50 (Golden Cross), MACD &gt; Signal &gt; 0, Histogram positif membesar</span>
        </div>
    </div>`;
}

function renderFuturesPanel(coin, marketChart = null) {
    const f = getFuturesAnalysis(coin, marketChart);

    if (f.isNeutral) {
        return `
        <div class="analysis-section futures-panel futures-neutral">
            <h3>⚡ Futures Analysis</h3>
            <div class="futures-neutral-msg">
                <span class="futures-dir-badge" style="background:#374151;color:#94a3b8;">⚪ NETRAL — Hindari Futures</span>
                <p>Sinyal tidak cukup kuat untuk masuk posisi futures saat ini.<br>
                Tunggu konfirmasi breakout atau reversal yang lebih jelas.</p>
                <div class="futures-disclaimer">⚠️ Futures berisiko tinggi. Selalu gunakan SL dan hanya trading dengan modal yang siap hilang.</div>
            </div>
        </div>`;
    }

    const isLong  = f.direction.startsWith('long');
    const isShort = f.direction.startsWith('short');
    const panelClass = isLong ? 'futures-long' : isShort ? 'futures-short' : '';

    return `
    <div class="analysis-section futures-panel ${panelClass}">
        <h3>⚡ Futures Analysis — ${coin.symbol.toUpperCase()}/USDT Perp</h3>

        <div class="futures-top-row">
            <!-- Arah & Leverage -->
            <div class="futures-direction-card">
                <div class="futures-dir-label">Rekomendasi</div>
                <div class="futures-dir-badge" style="color:${f.dirColor}">
                    ${f.dirEmoji} ${f.dirLabel}
                </div>
                <div class="futures-leverage-row">
                    <span class="futures-lev-label">Leverage Optimal</span>
                    <span class="futures-lev-badge" style="border-color:${f.dirColor};color:${f.dirColor}">
                        ${f.leverage}×
                    </span>
                </div>
                <div class="futures-confidence">Confidence: ${f.confidence}</div>
                <div class="futures-confidence">Volatilitas: ${f.volatilityLevel}</div>
            </div>

            <!-- Entry / TP / SL / Liq -->
            <div class="futures-levels-card">
                <table class="futures-table">
                    <thead>
                        <tr><th>Level</th><th>Harga</th><th>%</th></tr>
                    </thead>
                    <tbody>
                        <tr class="futures-row-entry">
                            <td>🎯 Entry</td>
                            <td>${f.entry}</td>
                            <td>—</td>
                        </tr>
                        <tr class="futures-row-tp1">
                            <td>✅ Take Profit 1</td>
                            <td>${f.tp1}</td>
                            <td class="tp-pct">+${f.rewardPct}%</td>
                        </tr>
                        <tr class="futures-row-tp2">
                            <td>🚀 Take Profit 2</td>
                            <td>${f.tp2}</td>
                            <td class="tp-pct">+${(parseFloat(f.rewardPct) * 1.8).toFixed(2)}%</td>
                        </tr>
                        <tr class="futures-row-sl">
                            <td>🛑 Stop Loss</td>
                            <td>${f.sl}</td>
                            <td class="sl-pct">−${f.riskPct}%</td>
                        </tr>
                        <tr class="futures-row-liq">
                            <td>💀 Est. Liquidasi</td>
                            <td>${f.liqEstimate}</td>
                            <td>pada ${f.leverage}×</td>
                        </tr>
                    </tbody>
                </table>
                <div class="futures-rr">Risk / Reward: <strong>1 : ${f.rrRatio}</strong></div>
            </div>

            <!-- Indikator -->
            <div class="futures-indicators-card">
                <div class="futures-ind-title">Indikator Teknikal</div>
                <div class="futures-ind-row"><span>RSI(14)</span><span class="${parseFloat(f.rsi) < 30 ? 'ind-oversold' : parseFloat(f.rsi) > 70 ? 'ind-overbought' : 'ind-neutral'}">${f.rsi}</span></div>
                <div class="futures-ind-row"><span>ATR%</span><span>${f.atrPct}%</span></div>
                <div class="futures-ind-row"><span>Support</span><span>${f.support}</span></div>
                <div class="futures-ind-row"><span>Resistance</span><span>${f.resistance}</span></div>
                <div class="futures-ind-title" style="margin-top:8px;">Faktor Sinyal</div>
                ${f.factors.map(fc => `<div class="futures-factor">• ${fc}</div>`).join('')}
            </div>
        </div>

        <div class="futures-disclaimer">
            ⚠️ <strong>Disclaimer:</strong> Analisis ini bersifat edukatif dan BUKAN saran keuangan.
            Futures berisiko tinggi — harga bisa bergerak berlawanan kapan saja.
            Gunakan SL wajib, posisi maksimal 1–3% dari modal, dan pahami risiko liquidasi sebelum trading.
        </div>
    </div>`;
}

// Cache in-memory untuk hasil Futures agar tidak dihitung ulang setiap render
const _futuresCache = new Map();

/**
 * Hasilkan badge mini Futures untuk tabel scanner (Long/Short ringkas).
 * Hasil di-cache berdasarkan coin.id + current_price agar tetap up-to-date saat harga berubah.
 * @param {object} coin
 * @returns {string} HTML string
 */
function getFuturesBadge(coin) {
    const cacheKey = `${coin.id}_${coin.current_price}`;
    if (_futuresCache.has(cacheKey)) return _futuresCache.get(cacheKey);

    const f = getFuturesAnalysis(coin);
    let html;
    if (f.isNeutral) {
        html = `<span class="futures-mini-badge futures-mini-neutral">⚪ —</span>`;
    } else {
        const isLong = f.direction.startsWith('long');
        const cls    = isLong ? 'futures-mini-long' : 'futures-mini-short';
        html = `<span class="futures-mini-badge ${cls}">${f.dirEmoji} ${isLong ? 'L' : 'S'} ${f.leverage}×</span>`;
    }

    _futuresCache.set(cacheKey, html);
    // Batasi ukuran cache agar tidak membesar tak terbatas
    if (_futuresCache.size > 300) {
        const firstKey = _futuresCache.keys().next().value;
        _futuresCache.delete(firstKey);
    }
    return html;
}

/**
 * Hitung sinyal actionable dari data koin.
 * Mengembalikan objek { label, html, type }
 *   type: 'buy' | 'sell' | 'wait' | 'danger' | 'hold'
 */
function getTradingSignal(coin) {
    const price    = coin.current_price || 0;
    const ch1h     = coin.price_change_percentage_1h_in_currency || 0;
    const ch24h    = coin.price_change_percentage_24h || 0;
    const ch7d     = coin.price_change_percentage_7d_in_currency || 0;
    const prices   = coin.sparkline_in_7d?.price || [];
    const volRatio = coin.market_cap ? coin.total_volume / coin.market_cap : 0;

    // Hitung support & resistance dari sparkline 7d
    let support = null, resistance = null;
    if (prices.length >= 10) {
        const sorted = [...prices].sort((a, b) => a - b);
        support    = sorted[Math.floor(sorted.length * 0.1)];   // persentil 10
        resistance = sorted[Math.floor(sorted.length * 0.9)];   // persentil 90
    }

    // Ambil ATH & ATL 7d
    const low7d  = prices.length ? Math.min(...prices) : price * 0.85;
    const high7d = prices.length ? Math.max(...prices) : price * 1.15;
    const range  = high7d - low7d || 1;

    // Posisi harga sekarang dalam range (0 = bawah, 1 = atas)
    const posInRange = (price - low7d) / range;

    // Tentukan zona
    const nearSupport    = posInRange < 0.2;   // harga dekat bawah range
    const nearResistance = posInRange > 0.8;   // harga dekat atas range
    const midZone        = posInRange >= 0.35 && posInRange <= 0.65;

    // Kondisi sinyal
    const strongBull = ch24h > 5  && ch7d > 10 && volRatio > 0.1;
    const mildBull   = ch24h > 0  && ch7d > 0;
    const strongBear = ch24h < -5 && ch7d < -10;
    const mildBear   = ch24h < 0  && ch7d < 0;
    const highRisk   = volRatio > 0.5 || Math.abs(ch24h) > 15;

    const fmt = (n) => {
        if (!n) return '—';
        if (n >= 1000) return `$${(n/1000).toFixed(1)}K`;
        if (n >= 1)    return `$${n.toFixed(2)}`;
        return `$${n.toFixed(4)}`;
    };

    // ── SINYAL RISIKO TINGGI ──────────────────────────────────────────
    if (highRisk && ch24h < -10) {
        return {
            type: 'danger',
            html: `<div class="signal-badge signal-danger">
                       ⚠️ Risiko Tinggi
                       <div class="signal-hint">Volatilitas ekstrem, hindari entry</div>
                   </div>`
        };
    }

    // ── SINYAL BELI ───────────────────────────────────────────────────
    if (strongBull && nearSupport) {
        const tp = fmt(support ? support * 1.15 : price * 1.12);
        const sl = fmt(support ? support * 0.96 : price * 0.95);
        return {
            type: 'buy',
            html: `<div class="signal-badge signal-buy">
                       🟢 Beli di ${fmt(price)}
                       <div class="signal-hint">TP: ${tp} · SL: ${sl}</div>
                   </div>`
        };
    }

    if (mildBull && nearSupport && !highRisk) {
        const waitPrice = fmt(support ? support * 1.02 : price * 0.97);
        const tp        = fmt(price * 1.08);
        return {
            type: 'buy',
            html: `<div class="signal-badge signal-buy">
                       🟢 Beli di ${fmt(price)}
                       <div class="signal-hint">TP ${tp} · konfirmasi volume</div>
                   </div>`
        };
    }

    // ── SINYAL TUNGGU / WAIT ──────────────────────────────────────────
    if (nearResistance && mildBull) {
        const waitPrice = fmt(resistance ? resistance * 0.92 : price * 0.92);
        return {
            type: 'wait',
            html: `<div class="signal-badge signal-wait">
                       ⏳ Tunggu pullback
                       <div class="signal-hint">Entry ideal ≈ ${waitPrice}</div>
                   </div>`
        };
    }

    if (midZone && ch24h > 0 && ch24h < 3) {
        const entryIdeal = fmt(support ? support * 1.01 : price * 0.96);
        return {
            type: 'wait',
            html: `<div class="signal-badge signal-wait">
                       ⏳ Tunggu di ${entryIdeal}
                       <div class="signal-hint">Belum ada konfirmasi breakout</div>
                   </div>`
        };
    }

    // ── SINYAL JUAL / DISTRIBUSI ──────────────────────────────────────
    if (nearResistance && (strongBear || ch24h < -3)) {
        const sl = fmt(resistance ? resistance * 1.03 : price * 1.03);
        return {
            type: 'sell',
            html: `<div class="signal-badge signal-sell">
                       🔴 Jual / Hindari
                       <div class="signal-hint">Resistensi kuat, SL ${sl}</div>
                   </div>`
        };
    }

    if (strongBear) {
        const reboundZone = fmt(low7d * 1.05);
        return {
            type: 'sell',
            html: `<div class="signal-badge signal-sell">
                       🔴 Distribusi
                       <div class="signal-hint">Tunggu rebound ≈ ${reboundZone}</div>
                   </div>`
        };
    }

    // ── SINYAL HOLD ───────────────────────────────────────────────────
    if (mildBull && midZone) {
        const tp = fmt(resistance || price * 1.08);
        return {
            type: 'hold',
            html: `<div class="signal-badge signal-hold">
                       🔵 Hold
                       <div class="signal-hint">Target ${tp}, tahan posisi</div>
                   </div>`
        };
    }

    // ── DEFAULT ───────────────────────────────────────────────────────
    if (ch24h < -3) {
        const waitEntry = fmt(low7d * 1.02);
        return {
            type: 'wait',
            html: `<div class="signal-badge signal-wait">
                       ⏳ Tunggu sinyal
                       <div class="signal-hint">Entry aman ≈ ${waitEntry}</div>
                   </div>`
        };
    }

    return {
        type: 'hold',
        html: `<div class="signal-badge signal-hold">
                   🔵 Netral
                   <div class="signal-hint">Pantau pergerakan volume</div>
               </div>`
    };
}

// Cache untuk signal harian agar tidak dihitung ulang tiap render
const _signalCache = new Map();

function getDailyCycleSignal(coin) {
    const key = `${coin.id}_${coin.current_price}_${coin.price_change_percentage_24h}`;
    if (_signalCache.has(key)) return _signalCache.get(key);
    const html = getTradingSignal(coin).html;
    _signalCache.set(key, html);
    if (_signalCache.size > 300) _signalCache.delete(_signalCache.keys().next().value);
    return html;
}

function getWeeklyCycleSignal(coin) {
    const ch7d  = coin.price_change_percentage_7d_in_currency || 0;
    const prices = coin.sparkline_in_7d?.price || [];
    const high7d = prices.length ? Math.max(...prices) : coin.current_price * 1.1;
    const fmt = (n) => {
        if (!n) return '—';
        if (n >= 1000) return `$${(n/1000).toFixed(1)}K`;
        if (n >= 1)    return `$${n.toFixed(2)}`;
        return `$${n.toFixed(4)}`;
    };

    if (ch7d > 20) return `<span class="weekly-badge weekly-strong">🚀 Strong +${ch7d.toFixed(0)}%</span>`;
    if (ch7d > 5)  return `<span class="weekly-badge weekly-up">📈 Uptrend +${ch7d.toFixed(0)}%</span>`;
    if (ch7d > 0)  return `<span class="weekly-badge weekly-mild">↗ Mild +${ch7d.toFixed(1)}%</span>`;
    if (ch7d > -5) return `<span class="weekly-badge weekly-mild-down">↘ Pullback ${ch7d.toFixed(1)}%</span>`;
    if (ch7d > -15)return `<span class="weekly-badge weekly-down">📉 Downtrend ${ch7d.toFixed(0)}%</span>`;
    return `<span class="weekly-badge weekly-crash">💀 Bearish ${ch7d.toFixed(0)}%</span>`;
}

function getWhaleActivity(coin) {
    const volume = coin.total_volume;
    const marketCap = coin.market_cap;
    const ratio = volume / marketCap;
    
    if (ratio > 0.3) return '🐋 High';
    if (ratio > 0.1) return '�� Medium';
    return '🐋 Low';
}

function getWhaleActivityStatus(coin) {
    const change24h = coin.price_change_percentage_24h || 0;
    const volume = coin.total_volume;
    const marketCap = coin.market_cap;
    const ratio = volume / marketCap;
    
    if (ratio > 0.2 && change24h > 0) return '🟢 Accumulation';
    if (ratio > 0.2 && change24h < 0) return '🔴 Distribution';
    return '🟡 Neutral';
}

function getAIScore(coin) {
    // Simplified AI scoring based on multiple factors
    let score = 50;
    
    // Price momentum
    if (coin.price_change_percentage_24h > 5) score += 10;
    if (coin.price_change_percentage_7d_in_currency > 10) score += 10;
    
    // Volume/Market cap ratio
    const volumeRatio = coin.total_volume / coin.market_cap;
    if (volumeRatio > 0.1) score += 10;
    
    // Market cap rank
    if (coin.market_cap_rank <= 10) score += 20;
    else if (coin.market_cap_rank <= 50) score += 10;
    
    score = Math.min(100, Math.max(0, score));
    
    if (score >= 80) return '⭐⭐⭐⭐⭐';
    if (score >= 60) return '⭐⭐⭐⭐';
    if (score >= 40) return '⭐⭐⭐';
    if (score >= 20) return '⭐⭐';
    return '⭐';
}

function getLiquidityBadge(coin) {
    const volumeRatio = coin.total_volume / coin.market_cap;
    
    if (volumeRatio > 0.3) return '💧💧💧 High';
    if (volumeRatio > 0.1) return '💧💧 Medium';
    return '💧 Low';
}

function getFibLevelBadge(coin) {
    const prices = coin.sparkline_in_7d?.price;
    if (!prices || prices.length < 5) return '<span class="fib-level-badge" title="Fibonacci Retracement — data tidak cukup">—</span>';
    const fib = window.AnalysisUtils?.calculateFibonacciLevels(prices, prices.length);
    if (!fib) return '<span class="fib-level-badge">—</span>';

    const current = coin.current_price;

    // Named levels: retracements + key extensions
    const allLevels = [
        ...fib.retracements.map(l => ({ ...l, type: 'ret' })),
        ...(fib.extensions || []).filter(l => l.ratio === 1.272 || l.ratio === 1.618).map(l => ({ ...l, type: 'ext' })),
    ];

    // Find nearest level
    const nearest = allLevels.reduce((prev, cur) =>
        Math.abs(cur.level - current) < Math.abs(prev.level - current) ? cur : prev
    );

    const position  = current >= nearest.level ? 'above' : 'below';
    const distPct   = nearest.level > 0 ? Math.abs(current - nearest.level) / nearest.level * 100 : 0;
    const arrow     = position === 'above' ? '↑' : '↓';
    const pctLabel  = `${(nearest.ratio * 100).toFixed(1)}%`;

    // Zone label — how close is price to the level?
    const isNear    = distPct < 1.5;
    const nearLabel = isNear ? ' 🎯' : '';

    // Tooltip: full explanation
    const fmt = (n) => n >= 1 ? `$${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : `$${n.toFixed(4)}`;
    const tooltip = `Fibonacci ${nearest.type === 'ext' ? 'Extension' : 'Retracement'} ${pctLabel} @ ${fmt(nearest.level)} | Harga ${position === 'above' ? 'di atas' : 'di bawah'} level ini sebesar ${distPct.toFixed(1)}%${isNear ? ' — SANGAT DEKAT level Fib!' : ''}`;

    const cls = position === 'above' ? 'above' : 'below';
    const extTag = nearest.type === 'ext' ? '<sup style="font-size:0.6rem">ext</sup>' : '';

    return `<span class="fib-level-badge ${cls}${isNear ? ' fib-near' : ''}" title="${tooltip}">${arrow} ${pctLabel}${extTag}${nearLabel}</span>`;
}

function getChangeClass(value) {
    if (!value) return '';
    return value >= 0 ? 'positive' : 'negative';
}

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    if (num >= 1) return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (num >= 0.01) return num.toFixed(4);
    return num.toFixed(8);
}

function formatLargeNumber(num) {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

function formatPercentage(value) {
    if (value === null || value === undefined) return 'N/A';
    const formatted = value.toFixed(2);
    return value >= 0 ? `+${formatted}%` : `${formatted}%`;
}

function showLoading(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        // Skeleton rows — 8 baris placeholder
        const skeletonRow = (i) => `
            <tr class="skeleton-row dex-row">
                <td><span class="skeleton-cell" style="width:18px"></span></td>
                <td><span class="skeleton-cell" style="width:20px"></span></td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px">
                        <span class="skeleton-cell" style="width:26px;height:26px;border-radius:50%"></span>
                        <div>
                            <span class="skeleton-cell" style="width:${60 + (i % 3) * 20}px;display:block;margin-bottom:4px"></span>
                            <span class="skeleton-cell" style="width:32px;display:block;height:10px"></span>
                        </div>
                    </div>
                </td>
                ${Array(15).fill(0).map((_, j) => `<td><span class="skeleton-cell" style="width:${[55,30,44,44,44,60,60,60,55,60,50,36,72,36,80][j] || 40}px"></span></td>`).join('')}
            </tr>`;
        element.innerHTML = Array.from({length: 8}, (_, i) => skeletonRow(i)).join('');
    }
}

function showError(message) {
    console.error('Error:', message);
    // Could add toast notification here
}

function updateLastUpdate() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('id-ID');
    const lastUpdateElement = document.getElementById('lastUpdate');
    if (lastUpdateElement) {
        lastUpdateElement.textContent = `Last Update: ${timeString}`;
    }
}

function updateMoonPhase() {
    const moonPhaseContainer = document.getElementById('moonPhase');
    if (!moonPhaseContainer) return;

    const moonPhase = window.AnalysisUtils?.getMoonPhaseInfo(new Date());
    const name = moonPhase?.name || 'Moon Phase';
    moonPhaseContainer.innerHTML = `
        <img src="images/ic_moon.svg" alt="" class="moon-icon">
        <span class="moon-text">${name}</span>
    `;
}

async function fetchMarketChart(coinId, days = 30) {
    try {
        const response = await fetch(`${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching market chart:', error);
        return null;
    }
}

function buildExpertAnalysis(coin, marketChart) {
    const prices = marketChart?.prices || [];
    const volumes = marketChart?.total_volumes || [];
    const priceValues = prices.map(point => point[1]);
    const volumeValues = volumes.map(point => point[1]);
    const moonPhase = window.AnalysisUtils?.getMoonPhaseInfo(new Date());

    const indicators = priceValues.length ? calculateIndicators(priceValues) : null;
    const whaleInsight = buildWhaleInsight(coin, priceValues, volumeValues);
    const supportResistance = priceValues.length
        ? window.AnalysisUtils.calculateSupportResistance(priceValues)
        : { support: coin.current_price * 0.9, resistance: coin.current_price * 1.1 };

    const timeframes = window.AnalysisUtils?.buildTimeframeSummary(prices) || [];
    const recommendation = buildFuturesRecommendation(coin, indicators, moonPhase);
    const fibonacciInsight = buildFibonacciInsight(priceValues, whaleInsight?.volumeRatio, timeframes);

    return {
        moonPhase,
        indicators,
        supportResistance,
        whaleInsight,
        fibonacciInsight,
        timeframes,
        recommendation
    };
}

function buildWhaleInsight(coin, priceValues = [], volumeValues = []) {
    const volume = coin.total_volume || 0;
    const marketCap = coin.market_cap || 0;
    const volumeRatio = marketCap ? volume / marketCap : 0;
    const change24h = coin.price_change_percentage_24h || 0;
    const obvSeries = window.AnalysisUtils?.calculateOBV(priceValues, volumeValues) || [];
    const obvTrend = obvSeries.length > 10
        ? obvSeries[obvSeries.length - 1] - obvSeries[obvSeries.length - 10]
        : 0;
    const volumeSpike = window.AnalysisUtils?.detectVolumeSpike(volumeValues, 20, 1.8) || { spike: false, ratio: 0 };

    let activity = 'Sepi';
    let activityNote = 'Volume rendah, pergerakan cenderung lambat.';
    if (volumeRatio > 0.2) {
        activity = 'Aktif';
        activityNote = 'Likuiditas tinggi, pergerakan lebih agresif.';
    } else if (volumeRatio > 0.1) {
        activity = 'Cukup Aktif';
        activityNote = 'Volume cukup sehat, peluang trading moderat.';
    }

    let status = 'Whale belum terlihat';
    let message = 'Belum ada indikasi akumulasi besar.';
    if (volumeRatio > 0.2 && change24h > 0) {
        status = 'Whale Akumulasi';
        message = 'Volume tinggi + harga naik = akumulasi.';
    } else if (volumeRatio > 0.2 && change24h < 0) {
        status = 'Whale Distribusi';
        message = 'Volume tinggi + harga turun = distribusi.';
    } else if (volumeRatio > 0.12 && Math.abs(change24h) < 2) {
        status = 'Whale Muncul';
        message = 'Volume naik tapi harga stabil.';
    }

    return {
        volumeRatio,
        activity,
        activityNote,
        status,
        message,
        obvTrend,
        volumeSpike
    };
}

function buildFibonacciInsight(priceValues = [], volumeRatio = 0, timeframes = []) {
    const fib = window.AnalysisUtils?.calculateFibonacciLevels(priceValues, 120);
    if (!fib) return null;

    const trendStrength = timeframes.find(tf => tf.label === '30D')?.change || 0;
    let accuracy = 'Medium';
    let note = 'Gunakan sebagai area konfirmasi, bukan kepastian.';

    if (Math.abs(trendStrength) > 12 && volumeRatio > 0.18) {
        accuracy = 'High';
        note = 'Trend kuat + volume tinggi, level fib lebih relevan.';
    } else if (Math.abs(trendStrength) < 5 || volumeRatio < 0.08) {
        accuracy = 'Low';
        note = 'Trend lemah/volume rendah, hati-hati false signal.';
    }

    return {
        ...fib,
        accuracy,
        note
    };
}

function calculateIndicators(priceValues) {
    const sma20Series = window.AnalysisUtils.calculateSMA(priceValues, 20);
    const ema20Series = window.AnalysisUtils.calculateEMA(priceValues, 20);
    const macdSeries = window.AnalysisUtils.calculateMACD(priceValues, 12, 26, 9);
    const lastIndex = priceValues.length - 1;

    return {
        sma20: sma20Series[lastIndex],
        ema20: ema20Series[lastIndex],
        macd: macdSeries.macd[lastIndex],
        signal: macdSeries.signal[lastIndex],
        histogram: macdSeries.histogram[lastIndex],
        macdSeries,
        sma20Series,
        ema20Series
    };
}

function buildFuturesRecommendation(coin, indicators, moonPhase) {
    const change24h = coin.price_change_percentage_24h || 0;
    const histogram = indicators?.histogram ?? 0;
    const priceAboveEma = indicators?.ema20 ? coin.current_price > indicators.ema20 : null;

    let label = 'Neutral';
    let reason = 'Trend belum jelas, tunggu konfirmasi.';

    if (priceAboveEma && histogram > 0 && change24h > 0) {
        label = 'LONG (Momentum kuat)';
        reason = 'Harga di atas EMA20, MACD positif, momentum mendukung.';
    } else if (priceAboveEma === false && histogram < 0 && change24h < 0) {
        label = 'SHORT (Momentum lemah)';
        reason = 'Harga di bawah EMA20, MACD negatif, tekanan jual dominan.';
    }

    if (moonPhase?.bias === 'Exhaustion') {
        reason += ' Full moon sering memicu volatilitas, pakai stop ketat.';
    }

    return { label, reason };
}

function renderExpertCharts(marketChart, expertAnalysis) {
    const priceCanvas = document.getElementById('expertPriceChart');
    const macdCanvas = document.getElementById('expertMacdChart');
    if (!priceCanvas || !macdCanvas) return;

    const labels = marketChart.prices.map(point => new Date(point[0]).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }));
    const prices = marketChart.prices.map(point => point[1]);
    const indicators = expertAnalysis?.indicators;

    if (analysisCharts.priceChart) analysisCharts.priceChart.destroy();
    if (analysisCharts.macdChart) analysisCharts.macdChart.destroy();

    const fibAnnotations = buildFibAnnotations(expertAnalysis?.fibonacciInsight);

    analysisCharts.priceChart = new Chart(priceCanvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Price',
                    data: prices,
                    borderColor: '#4dc9f6',
                    backgroundColor: 'rgba(77, 201, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: 'MA(20)',
                    data: indicators?.sma20Series || [],
                    borderColor: '#f67019',
                    borderWidth: 1.5,
                    pointRadius: 0
                },
                {
                    label: 'EMA(20)',
                    data: indicators?.ema20Series || [],
                    borderColor: '#537bc4',
                    borderWidth: 1.5,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true },
                annotation: {
                    annotations: {
                        support: {
                            type: 'line',
                            yMin: expertAnalysis?.supportResistance?.support,
                            yMax: expertAnalysis?.supportResistance?.support,
                            borderColor: '#22c55e',
                            borderWidth: 1.5,
                            label: { enabled: true, content: 'Support' }
                        },
                        resistance: {
                            type: 'line',
                            yMin: expertAnalysis?.supportResistance?.resistance,
                            yMax: expertAnalysis?.supportResistance?.resistance,
                            borderColor: '#ef4444',
                            borderWidth: 1.5,
                            label: { enabled: true, content: 'Resistance' }
                        },
                        ...fibAnnotations
                    }
                }
            },
            scales: {
                x: { display: true },
                y: { display: true }
            }
        }
    });

    const macdSeries = indicators?.macdSeries || { macd: [], signal: [], histogram: [] };
    analysisCharts.macdChart = new Chart(macdCanvas, {
        data: {
            labels,
            datasets: [
                {
                    type: 'bar',
                    label: 'Histogram',
                    data: macdSeries.histogram,
                    backgroundColor: macdSeries.histogram.map(value => value >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)')
                },
                {
                    type: 'line',
                    label: 'MACD',
                    data: macdSeries.macd,
                    borderColor: '#8b5cf6',
                    borderWidth: 1.5,
                    pointRadius: 0
                },
                {
                    type: 'line',
                    label: 'Signal',
                    data: macdSeries.signal,
                    borderColor: '#f97316',
                    borderWidth: 1.5,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true }
            },
            scales: {
                x: { display: true },
                y: { display: true }
            }
        }
    });
}

function buildFibAnnotations(fib) {
    if (!fib) return {};
    const lines = {};
    fib.retracements.forEach(level => {
        const key = `fib_${level.ratio}`.replace('.', '_');
        lines[key] = {
            type: 'line',
            yMin: level.level,
            yMax: level.level,
            borderColor: 'rgba(99, 102, 241, 0.6)',
            borderWidth: 1,
            label: { enabled: true, content: `Fib ${(level.ratio * 100).toFixed(1)}%`, font: { size: 10 } }
        };
    });
    fib.extensions.forEach(level => {
        const key = `fib_ext_${level.ratio}`.replace('.', '_');
        lines[key] = {
            type: 'line',
            yMin: level.level,
            yMax: level.level,
            borderColor: 'rgba(16, 185, 129, 0.6)',
            borderWidth: 1,
            label: { enabled: true, content: `Ext ${(level.ratio * 100).toFixed(1)}%`, font: { size: 10 } }
        };
    });
    return lines;
}

function renderFibLegend(fib) {
    // Find chart wrapper inside analysis container
    const wrappers = document.querySelectorAll('#analysisContainer .chart-wrapper');
    if (!wrappers.length || !fib) return;
    const firstWrapper = wrappers[0];

    // Remove existing legend if any
    const old = firstWrapper.querySelector('.fib-legend');
    if (old) old.remove();

    const retracementColors = ['#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#3730a3'];
    const extensionColors = ['#6ee7b7', '#10b981'];

    const retracementItems = fib.retracements.map((level, i) => `
        <div class="fib-legend-item">
            <span class="fib-legend-dot" style="background:${retracementColors[i] || '#6366f1'}"></span>
            <span>${(level.ratio * 100).toFixed(1)}% — $${formatNumber(level.level)}</span>
        </div>
    `).join('');

    const extensionItems = fib.extensions.map((level, i) => `
        <div class="fib-legend-item">
            <span class="fib-legend-dot" style="background:${extensionColors[i] || '#10b981'}"></span>
            <span>Ext ${(level.ratio * 100).toFixed(1)}% — $${formatNumber(level.level)}</span>
        </div>
    `).join('');

    const legend = document.createElement('div');
    legend.className = 'fib-legend';
    legend.innerHTML = `
        <div class="fib-legend-item" style="font-weight:700;color:#e2e8f0;width:100%">
            📐 Fibonacci Levels (${fib.trend === 'up' ? '📈 Uptrend' : '📉 Downtrend'} · High $${formatNumber(fib.high)} / Low $${formatNumber(fib.low)})
        </div>
        ${retracementItems}
        ${extensionItems}
    `;
    firstWrapper.appendChild(legend);
}

function formatIndicatorValue(value) {
    if (value === null || value === undefined) return 'N/A';
    return value >= 0 ? `+${value.toFixed(4)}` : value.toFixed(4);
}

function formatFearGreedLabel(label) {
    if (!label) return 'Data tidak tersedia';
    return label.replace(/_/g, ' ');
}

function startAutoRefresh() {
    // Refresh every 5 minutes
    autoRefreshInterval = setInterval(() => {
        console.log('�� Auto-refresh triggered');
        refreshAllData();
    }, 5 * 60 * 1000);
}

function refreshAllData() {
    console.log('🔄 Refreshing all data...');
    loadMarketStats();
    loadCryptoData();
    fetchFearGreedIndex();
    fetchMacroAgenda();
    updateGlobalSessions();
    updateLastUpdate();
}

// ═══════════════════════════════════════════════════════════════
//  PORTFOLIO TRACKER  —  Expert Trading Journal
// ═══════════════════════════════════════════════════════════════
const portfolioTracker = (() => {
    // ── STATE ─────────────────────────────────────────────────
    let positions   = [];   // open positions
    let trades      = [];   // closed/logged trades
    let walletAccount = null;
    let walletChainId = null;
    let walletProvider = null;
    let equityChart   = null;
    let equityPeriod  = 'all';
    let calYear       = new Date().getFullYear();
    let calMonth      = new Date().getMonth();
    let closingPosId  = null;    // id of position being closed
    let editingTradeId = null;   // id of trade being edited
    let journalFilter = { type: '', strategy: '', outcome: '' };

    const CHAIN_NAMES = { '0x1':'Ethereum','0x38':'BSC','0x89':'Polygon','0xa4b1':'Arbitrum','0x2105':'Base','0xa':'Optimism' };
    const CHAIN_NATIVE = { '0x1':'ETH','0x38':'BNB','0x89':'MATIC','0xa4b1':'ETH','0x2105':'ETH','0xa':'ETH' };
    const EMOTION_EMOJI = { Confident:'😎', Neutral:'😐', FOMO:'😰', Fear:'😨', Greedy:'🤑', Disciplined:'🎯' };
    const OUTCOME_CLASS = { WIN:'positive', LOSS:'negative', BREAK:'neutral', OPEN:'dim' };

    // ── STORAGE ───────────────────────────────────────────────
    function _save() {
        localStorage.setItem('pf_positions', JSON.stringify(positions));
        localStorage.setItem('pf_trades',    JSON.stringify(trades));
    }
    function _load() {
        positions = JSON.parse(localStorage.getItem('pf_positions')) || [];
        trades    = JSON.parse(localStorage.getItem('pf_trades'))    || [];
        // migrate legacy portfolio data
        const legacy = JSON.parse(localStorage.getItem('portfolio')) || [];
        if (legacy.length && !positions.length) {
            legacy.forEach(p => {
                positions.push({
                    id: _uid(), symbol: (p.symbol||'?').toUpperCase(),
                    name: p.name||'', chain: 'Unknown', qty: p.quantity||0,
                    entry: p.entryPrice||0, currentPrice: p.currentPrice||p.entryPrice||0,
                    dateOpened: p.addedAt||new Date().toISOString(),
                    sl:0, tp:0, notes:'', coinId: p.id||''
                });
            });
            _save();
        }
    }
    function _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

    // ── WALLET ────────────────────────────────────────────────
    async function connectWallet() {
        if (typeof window.ethereum === 'undefined') {
            alert('MetaMask tidak terdeteksi.\n\nInstall MetaMask dari https://metamask.io atau buka di browser dengan MetaMask extension.');
            return;
        }
        const btn = document.getElementById('pfConnectBtn');
        if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }
        try {
            walletProvider = window.ethereum;
            const accounts = await walletProvider.request({ method:'eth_requestAccounts' });
            walletAccount  = accounts[0];
            walletChainId  = await walletProvider.request({ method:'eth_chainId' });
            _walletUIUpdate();
            _walletListenEvents();
            _syncBadge(true);
            _fetchOnChainBalances();
        } catch(e) {
            if (e.code === 4001) alert('Koneksi dibatalkan.');
            else alert('Gagal connect wallet: ' + e.message);
        } finally {
            if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
        }
    }

    function disconnectWallet() {
        walletAccount = null; walletChainId = null; walletProvider = null;
        _walletUIUpdate();
        _syncBadge(false);
    }

    function _walletListenEvents() {
        if (!walletProvider) return;
        walletProvider.on('accountsChanged', accs => {
            walletAccount = accs[0]||null;
            if (!walletAccount) disconnectWallet(); else _walletUIUpdate();
        });
        walletProvider.on('chainChanged', id => { walletChainId = id; _walletUIUpdate(); });
    }

    async function _walletUIUpdate() {
        const connectBtn  = document.getElementById('pfConnectBtn');
        const connectedEl = document.getElementById('pfWalletConnected');
        const addrEl      = document.getElementById('pfWalletAddr');
        const netEl       = document.getElementById('pfWalletNet');
        if (walletAccount) {
            if (connectBtn)  connectBtn.style.display  = 'none';
            if (connectedEl) connectedEl.style.display = 'flex';
            if (addrEl) addrEl.textContent = walletAccount.slice(0,6)+'…'+walletAccount.slice(-4);
            if (netEl)  netEl.textContent  = CHAIN_NAMES[walletChainId] || `Chain ${walletChainId}`;
        } else {
            if (connectBtn)  connectBtn.style.display  = 'inline-flex';
            if (connectedEl) connectedEl.style.display = 'none';
        }
    }

    function _syncBadge(connected) {
        const b = document.getElementById('pfSyncBadge');
        if (!b) return;
        if (connected) {
            b.textContent = '🟢 WALLET SYNCED';
            b.style.color = '#22c55e';
        } else {
            b.textContent = '⏺ NOT SYNCED';
            b.style.color = '#64748b';
        }
    }

    async function _fetchOnChainBalances() {
        if (!walletAccount) return;
        // Use Etherscan free API (no key needed for basic balance)
        // For ERC20 tokens use Etherscan token list — graceful fallback to nothing
        try {
            const chainNum = parseInt(walletChainId, 16);
            const BASE_URLS = { 1:'https://api.etherscan.io/api', 56:'https://api.bscscan.com/api', 137:'https://api.polygonscan.com/api' };
            const base = BASE_URLS[chainNum];
            if (!base) return;
            // Fetch ERC20 token list
            const url = `${base}?module=account&action=tokentx&address=${walletAccount}&sort=desc&offset=20&page=1`;
            const resp = await fetch(url);
            const data = await resp.json();
            if (data.status !== '1' || !data.result) return;
            // Build unique token set from recent txs
            const seen = {};
            data.result.forEach(tx => {
                const sym = (tx.tokenSymbol||'').toUpperCase();
                if (!sym || seen[sym]) return;
                seen[sym] = true;
            });
            // Notify user (non-intrusive)
            const symList = Object.keys(seen).slice(0,10).join(', ');
            if (symList) {
                const n = document.createElement('div');
                n.className = 'pf-toast';
                n.innerHTML = `🔗 Tokens detected on-chain: <b>${symList}</b> — add them as positions manually.`;
                document.body.appendChild(n);
                setTimeout(()=>n.remove(), 8000);
            }
        } catch(_) { /* silently fail */ }
    }

    // ── PRICE LOOKUP ──────────────────────────────────────────
    async function _getPrice(symbol) {
        // 1. Check global cryptoData array (already loaded in scanner)
        if (typeof cryptoData !== 'undefined' && cryptoData.length) {
            const hit = cryptoData.find(c =>
                c.symbol.toLowerCase() === symbol.toLowerCase() ||
                c.id.toLowerCase() === symbol.toLowerCase()
            );
            if (hit && hit.current_price) return hit.current_price;
        }
        // 2. DEXScreener search
        try {
            const r = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(symbol)}`);
            const d = await r.json();
            const pair = (d.pairs||[]).find(p => p.baseToken?.symbol?.toUpperCase() === symbol.toUpperCase());
            if (pair && pair.priceUsd) return parseFloat(pair.priceUsd);
        } catch(_) {}
        // 3. CoinGecko simple price
        try {
            const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(symbol.toLowerCase())}&vs_currencies=usd`);
            const d = await r.json();
            const keys = Object.keys(d);
            if (keys.length) return d[keys[0]].usd;
        } catch(_) {}
        return null;
    }

    async function searchSymbol(val, hiddenId, priceId) {
        if (!val || val.length < 2) return;
        clearTimeout(searchSymbol._t);
        searchSymbol._t = setTimeout(async () => {
            const price = await _getPrice(val.trim());
            if (price) {
                const inp = document.getElementById(priceId);
                if (inp && !inp.value) inp.value = price;
                const hid = document.getElementById(hiddenId);
                if (hid) hid.value = val.trim().toLowerCase();
            }
        }, 600);
    }

    async function refreshPrices() {
        const btn = document.getElementById('pfRefreshBtn');
        if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }
        let updated = 0;
        for (const pos of positions) {
            const p = await _getPrice(pos.symbol);
            if (p) { pos.currentPrice = p; updated++; }
        }
        _save();
        renderAll();
        if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
        if (updated) _toast(`✅ Prices refreshed for ${updated} positions.`);
    }

    // ── CALCULATIONS ──────────────────────────────────────────
    function _calcStats() {
        const totalCost  = positions.reduce((s,p) => s + p.qty * p.entry, 0);
        const totalValue = positions.reduce((s,p) => s + p.qty * (p.currentPrice||p.entry), 0);
        const unrealPnL  = totalValue - totalCost;
        const unrealPct  = totalCost ? (unrealPnL / totalCost) * 100 : 0;

        const closedTrades = trades.filter(t => t.outcome !== 'OPEN');
        const realPnL    = closedTrades.reduce((s,t) => s + (t.pnl||0), 0);
        const wins       = closedTrades.filter(t => t.outcome === 'WIN');
        const losses     = closedTrades.filter(t => t.outcome === 'LOSS');
        const winRate    = closedTrades.length ? (wins.length / closedTrades.length) * 100 : null;
        const avgWin     = wins.length   ? wins.reduce((s,t)=>s+(t.pnlPct||0),0)/wins.length : null;
        const avgLoss    = losses.length ? losses.reduce((s,t)=>s+(t.pnlPct||0),0)/losses.length : null;
        const grossWin   = wins.reduce((s,t)=>s+(t.pnl||0),0);
        const grossLoss  = Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0));
        const pf         = grossLoss ? (grossWin/grossLoss) : (grossWin ? Infinity : null);

        const sortedWin  = [...wins].sort((a,b)=>(b.pnl||0)-(a.pnl||0));
        const sortedLoss = [...losses].sort((a,b)=>(a.pnl||0)-(b.pnl||0));
        const bestTrade  = sortedWin[0]  || null;
        const worstTrade = sortedLoss[0] || null;

        // Max Drawdown on equity curve
        const curve = _buildEquityCurve('all');
        let peak = 0, mdd = 0;
        curve.forEach(pt => {
            if (pt.y > peak) peak = pt.y;
            const dd = peak ? (peak - pt.y) / peak * 100 : 0;
            if (dd > mdd) mdd = dd;
        });

        // Avg hold time
        const held = closedTrades.filter(t => t.entryDate && t.exitDate);
        const avgHoldMs = held.length ? held.reduce((s,t)=>{
            return s + (new Date(t.exitDate)-new Date(t.entryDate));
        },0)/held.length : null;

        return { totalCost, totalValue, unrealPnL, unrealPct, realPnL, closedTrades,
                 wins, losses, winRate, avgWin, avgLoss, pf, bestTrade, worstTrade,
                 mdd, avgHoldMs };
    }

    // ── EQUITY CURVE ──────────────────────────────────────────
    function _buildEquityCurve(period) {
        const closed = trades.filter(t => t.outcome !== 'OPEN' && t.exitDate).sort((a,b)=>new Date(a.exitDate)-new Date(b.exitDate));
        if (!closed.length) return [];
        const now = new Date();
        const cutoff = {
            '1w': new Date(now - 7*86400000),
            '1m': new Date(now - 30*86400000),
            '3m': new Date(now - 90*86400000),
            'all': new Date(0)
        }[period] || new Date(0);
        let running = 0;
        const pts = [];
        closed.forEach(t => {
            const dt = new Date(t.exitDate);
            if (dt < cutoff) return;
            running += t.pnl||0;
            pts.push({ x: dt.toLocaleDateString(), y: parseFloat(running.toFixed(2)) });
        });
        return pts;
    }

    function setEquityPeriod(p, btn) {
        equityPeriod = p;
        document.querySelectorAll('.pf-eq-tab').forEach(b=>b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        _renderEquityChart();
    }

    function _renderEquityChart() {
        const canvas = document.getElementById('pfEquityChart');
        const empty  = document.getElementById('pfEquityEmpty');
        if (!canvas) return;
        const pts = _buildEquityCurve(equityPeriod);
        if (!pts.length) {
            canvas.style.display = 'none';
            if (empty) empty.style.display = 'flex';
            return;
        }
        canvas.style.display = 'block';
        if (empty) empty.style.display = 'none';
        const labels = pts.map(p=>p.x);
        const values = pts.map(p=>p.y);
        const isPos  = values[values.length-1] >= 0;
        if (equityChart) equityChart.destroy();
        equityChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data: values,
                    fill: true,
                    borderColor: isPos ? '#22c55e' : '#ef4444',
                    backgroundColor: isPos ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
                    borderWidth: 2,
                    pointRadius: pts.length > 60 ? 0 : 3,
                    tension: 0.35
                }]
            },
            options: {
                responsive: true,
                plugins: { legend:{ display:false }, tooltip:{ callbacks:{ label: ctx => `$${ctx.parsed.y.toFixed(2)}` } } },
                scales: {
                    x: { ticks:{ color:'#94a3b8', maxTicksLimit:8, font:{size:10} }, grid:{ color:'rgba(255,255,255,0.05)' } },
                    y: { ticks:{ color:'#94a3b8', font:{size:10}, callback: v=>`$${v}` }, grid:{ color:'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }

    // ── RENDER ALL ────────────────────────────────────────────
    function renderAll() {
        _renderDashboard();
        _renderPositions();
        _renderJournal();
        _renderAnalytics();
        _renderCalendar();
        _renderEquityChart();
    }

    function _renderDashboard() {
        const s = _calcStats();
        const fmt  = n => n >= 1000 ? n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : n.toFixed(n >= 1 ? 2 : 6);
        const fmtP = n => (n >= 0 ? '+':'')+n.toFixed(2)+'%';
        const sign = n => n >= 0 ? 'positive' : 'negative';

        _setEl('pfTotalValue',    `$${fmt(s.totalValue)}`);
        _setEl('pfTotalCost',     `Cost: $${fmt(s.totalCost)}`);
        _setEl('pfUnrealizedPnL', `$${fmt(s.unrealPnL)}`, sign(s.unrealPnL));
        _setEl('pfUnrealizedPct', fmtP(s.unrealPct),      sign(s.unrealPct));
        _setEl('pfRealizedPnL',   `$${fmt(s.realPnL)}`,   sign(s.realPnL));
        _setEl('pfTotalTrades',   `${s.closedTrades.length} closed trades`);
        _setEl('pfWinRate',       s.winRate !== null ? s.winRate.toFixed(1)+'%' : '—', s.winRate >= 50 ? 'positive' : (s.winRate !== null ? 'negative' : ''));
        _setEl('pfWinLoss',       `${s.wins.length}W / ${s.losses.length}L`);
        _setEl('pfProfitFactor',  s.pf !== null ? (isFinite(s.pf) ? s.pf.toFixed(2) : '∞') : '—', s.pf >= 1 ? 'positive' : (s.pf !== null ? 'negative' : ''));
        _setEl('pfAvgRR',         s.avgWin !== null && s.avgLoss !== null ? `Avg ${Math.abs(s.avgWin/s.avgLoss).toFixed(2)}R` : 'Avg R:R —');
        if (s.bestTrade)  { _setEl('pfBestTrade',`+${s.bestTrade.pnlPct.toFixed(2)}%`,'positive'); _setEl('pfBestTradeAsset', s.bestTrade.symbol); }
        else              { _setEl('pfBestTrade','—'); _setEl('pfBestTradeAsset','—'); }
        if (s.worstTrade) { _setEl('pfWorstTrade',`${s.worstTrade.pnlPct.toFixed(2)}%`,'negative'); _setEl('pfWorstTradeAsset', s.worstTrade.symbol); }
        else              { _setEl('pfWorstTrade','—'); _setEl('pfWorstTradeAsset','—'); }
        _setEl('pfOpenCount', positions.length);
        const openVal = positions.reduce((s,p)=>s+p.qty*(p.currentPrice||p.entry),0);
        _setEl('pfOpenValue', `$${fmt(openVal)}`);
    }

    function _setEl(id, text, cls) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        if (cls !== undefined) {
            el.className = el.className.replace(/\b(positive|negative|neutral|dim)\b/g,'').trim();
            if (cls) el.classList.add(cls);
        }
    }

    // ── RENDER OPEN POSITIONS ─────────────────────────────────
    function _renderPositions() {
        const tbody = document.getElementById('pfPositionsBody');
        if (!tbody) return;

        // Quick bar
        const qBar = document.getElementById('pfQuickBar');
        if (qBar) {
            if (!positions.length) {
                qBar.style.display = 'none';
            } else {
                qBar.style.display = 'flex';
                const totalCost = positions.reduce((s,p)=>s+p.qty*p.entry,0);
                const totalVal  = positions.reduce((s,p)=>s+p.qty*(p.currentPrice||p.entry),0);
                const pnl       = totalVal - totalCost;
                const fmt = n => n>=1000 ? n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : n.toFixed(2);
                _setEl('pfQBCost',  `$${fmt(totalCost)}`);
                _setEl('pfQBValue', `$${fmt(totalVal)}`);
                _setEl('pfQBPnL',   `${pnl>=0?'+':''}$${fmt(Math.abs(pnl))}`, pnl>=0?'positive':'negative');
                // best/worst
                const sorted = [...positions].map(p=>({sym:p.symbol, pct:p.entry?((p.currentPrice||p.entry)-p.entry)/p.entry*100:0}))
                                             .sort((a,b)=>b.pct-a.pct);
                if (sorted.length) {
                    const best = sorted[0], worst = sorted[sorted.length-1];
                    _setEl('pfQBBest',  `${best.sym} ${best.pct>=0?'+':''}${best.pct.toFixed(1)}%`,  best.pct>=0?'positive':'negative');
                    _setEl('pfQBWorst', `${worst.sym} ${worst.pct>=0?'+':''}${worst.pct.toFixed(1)}%`, worst.pct>=0?'positive':'negative');
                }
            }
        }

        if (!positions.length) {
            tbody.innerHTML = '<tr><td colspan="11" class="pf-empty">No open positions yet. Click <strong>+ Add Position</strong>.</td></tr>';
            return;
        }
        const totalVal = positions.reduce((s,p)=>s+p.qty*(p.currentPrice||p.entry),0)||1;
        tbody.innerHTML = positions.map(pos => {
            const cur   = pos.currentPrice || pos.entry;
            const val   = pos.qty * cur;
            const cost  = pos.qty * pos.entry;
            const pnl   = val - cost;
            const pnlPct= cost ? (pnl/cost)*100 : 0;
            const alloc = totalVal ? (val/totalVal)*100 : 0;
            const since = pos.dateOpened ? _daysAgo(pos.dateOpened) : '—';
            const pnlCls= pnl >= 0 ? 'positive' : 'negative';
            const sign  = pnl >= 0 ? '+' : '';
            const fmt   = n => n >= 1000 ? n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : (n >= 1 ? n.toFixed(2) : n.toFixed(6));
            return `<tr>
              <td><strong>${pos.symbol}</strong>${pos.name ? `<br><small class="dim">${pos.name}</small>` : ''}</td>
              <td><span class="pf-chain-badge" data-chain="${pos.chain||''}">${pos.chain||'—'}</span></td>
              <td>${pos.qty}</td>
              <td>$${fmt(pos.entry)}</td>
              <td>$${fmt(cur)}</td>
              <td>$${fmt(val)}</td>
              <td class="${pnlCls}">${sign}$${fmt(Math.abs(pnl))}</td>
              <td class="${pnlCls}">${sign}${pnlPct.toFixed(2)}%</td>
              <td><div class="pf-alloc-bar"><div style="width:${Math.min(alloc,100).toFixed(1)}%"></div></div><small>${alloc.toFixed(1)}%</small></td>
              <td class="dim">${since}</td>
              <td class="pf-actions">
                <button class="pf-btn-action pf-btn-close" onclick="portfolioTracker.startClosePos('${pos.id}')">Close</button>
                <button class="pf-btn-action pf-btn-del"   onclick="portfolioTracker.deletePosition('${pos.id}')">🗑</button>
              </td>
            </tr>`;
        }).join('');
    }

    // ── RENDER JOURNAL ────────────────────────────────────────
    function _renderJournal() {
        const tbody = document.getElementById('pfJournalBody');
        if (!tbody) return;
        let data = [...trades].sort((a,b)=>new Date(b.entryDate)-new Date(a.entryDate));
        if (journalFilter.type)     data = data.filter(t => t.type === journalFilter.type);
        if (journalFilter.strategy) data = data.filter(t => t.strategy === journalFilter.strategy);
        if (journalFilter.outcome)  data = data.filter(t => t.outcome === journalFilter.outcome);
        if (!data.length) {
            tbody.innerHTML = '<tr><td colspan="14" class="pf-empty">No trades match the filter. Click <strong>+ Log Trade</strong>.</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(t => {
            const pnlCls = t.pnl !== null ? (t.pnl >= 0 ? 'positive' : 'negative') : '';
            const pnlTxt = t.pnl !== null ? `${t.pnl>=0?'+':''}$${Math.abs(t.pnl).toFixed(2)}` : '—';
            const pctTxt = t.pnlPct !== null ? `${t.pnlPct>=0?'+':''}${t.pnlPct.toFixed(2)}%` : '—';
            const dur    = t.entryDate && t.exitDate ? _daysBetween(t.entryDate, t.exitDate) : '—';
            const rrTxt  = t.sl && t.tp && t.entry ? _calcRR(t).toFixed(2)+'R' : '—';
            const emo    = EMOTION_EMOJI[t.emotion]||'';
            const oc     = OUTCOME_CLASS[t.outcome]||'';
            const fmt    = n => n >= 1000 ? n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : (n>=1?n.toFixed(2):n.toFixed(6));
            return `<tr>
              <td class="dim">${t.entryDate ? new Date(t.entryDate).toLocaleDateString() : '—'}</td>
              <td><strong>${t.symbol}</strong>${t.chain?`<br><small class="dim">${t.chain}</small>`:''}</td>
              <td><span class="pf-type-badge pf-type-${t.type}">${t.type}</span></td>
              <td>$${fmt(t.entry)}</td>
              <td>${t.exit ? '$'+fmt(t.exit) : '<span class="dim">open</span>'}</td>
              <td>${t.qty}</td>
              <td class="${pnlCls}">${pnlTxt}</td>
              <td class="${pnlCls}">${pctTxt}</td>
              <td><span class="pf-strat-tag" data-strat="${t.strategy||''}">${t.strategy||'—'}</span></td>
              <td>${emo} ${t.emotion||'—'}</td>
              <td class="dim">${rrTxt}</td>
              <td class="dim">${dur}</td>
              <td class="dim" title="${t.notes||''}">${t.notes ? t.notes.slice(0,30)+(t.notes.length>30?'…':'') : '—'}</td>
              <td class="pf-actions">
                <button class="pf-btn-action pf-btn-edit" onclick="portfolioTracker.editTrade('${t.id}')">✏</button>
                <button class="pf-btn-action pf-btn-del"  onclick="portfolioTracker.deleteTrade('${t.id}')">🗑</button>
              </td>
            </tr>`;
        }).join('');
    }

    function filterJournal() {
        journalFilter.type     = document.getElementById('pfJournalTypeFilter')?.value || '';
        journalFilter.strategy = document.getElementById('pfJournalStratFilter')?.value || '';
        journalFilter.outcome  = document.getElementById('pfJournalOutcomeFilter')?.value || '';
        _renderJournal();
    }

    // ── RENDER ANALYTICS ──────────────────────────────────────
    function _renderAnalytics() {
        const s = _calcStats();
        const fmt = n => n !== null ? (n>=0?'+':'')+n.toFixed(2)+'%' : '—';
        _setEl('pfA-winRate',     s.winRate !== null ? s.winRate.toFixed(1)+'%' : '—');
        _setEl('pfA-avgWin',      fmt(s.avgWin));
        _setEl('pfA-avgLoss',     fmt(s.avgLoss));
        _setEl('pfA-pf',          s.pf !== null ? (isFinite(s.pf) ? s.pf.toFixed(2) : '∞') : '—');
        _setEl('pfA-mdd',         `-${s.mdd.toFixed(2)}%`);
        _setEl('pfA-avgHold',     s.avgHoldMs !== null ? _fmtDuration(s.avgHoldMs) : '—');
        _setEl('pfA-total',       s.closedTrades.length.toString());
        _setEl('pfA-largestWin',  s.bestTrade  ? `+$${s.bestTrade.pnl.toFixed(2)}` : '—');
        _setEl('pfA-largestLoss', s.worstTrade ? `$${s.worstTrade.pnl.toFixed(2)}` : '—');

        // Strategy breakdown
        const stratEl = document.getElementById('pfStrategyStats');
        if (stratEl) {
            const stratMap = {};
            trades.filter(t=>t.outcome!=='OPEN').forEach(t=>{
                const k = t.strategy||'Other';
                if (!stratMap[k]) stratMap[k] = { wins:0, total:0, pnl:0 };
                stratMap[k].total++;
                if (t.outcome==='WIN') stratMap[k].wins++;
                stratMap[k].pnl += t.pnl||0;
            });
            const rows = Object.entries(stratMap).sort((a,b)=>b[1].total-a[1].total);
            stratEl.innerHTML = rows.length ? rows.map(([k,v])=>`
              <div class="pf-strat-row">
                <span class="pf-strat-tag">${k}</span>
                <span>${v.total} trades</span>
                <span>${v.total?((v.wins/v.total)*100).toFixed(0):'—'}% WR</span>
                <span class="${v.pnl>=0?'positive':'negative'}">${v.pnl>=0?'+':''}$${v.pnl.toFixed(2)}</span>
              </div>`).join('') : '<div class="pf-empty-sm">No data.</div>';
        }

        // Emotion breakdown
        const emoEl = document.getElementById('pfEmotionStats');
        if (emoEl) {
            const emoMap = {};
            trades.filter(t=>t.outcome!=='OPEN').forEach(t=>{
                const k = t.emotion||'Neutral';
                if (!emoMap[k]) emoMap[k] = { wins:0, total:0 };
                emoMap[k].total++;
                if (t.outcome==='WIN') emoMap[k].wins++;
            });
            const rows = Object.entries(emoMap).sort((a,b)=>b[1].total-a[1].total);
            emoEl.innerHTML = rows.length ? rows.map(([k,v])=>`
              <div class="pf-strat-row">
                <span>${EMOTION_EMOJI[k]||''} ${k}</span>
                <span>${v.total} trades</span>
                <span>${v.total?((v.wins/v.total)*100).toFixed(0):'—'}% WR</span>
              </div>`).join('') : '<div class="pf-empty-sm">No data.</div>';
        }

        // Asset PnL bars
        const barEl = document.getElementById('pfAssetPnLBars');
        if (barEl) {
            const assetMap = {};
            trades.filter(t=>t.outcome!=='OPEN').forEach(t=>{
                const k = t.symbol||'?';
                if (!assetMap[k]) assetMap[k] = 0;
                assetMap[k] += t.pnl||0;
            });
            const sorted = Object.entries(assetMap).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,10);
            const maxAbs = sorted.length ? Math.max(...sorted.map(([,v])=>Math.abs(v))) : 1;
            barEl.innerHTML = sorted.length ? sorted.map(([sym,pnl])=>`
              <div class="pf-asset-bar-row">
                <span class="pf-asset-bar-sym">${sym}</span>
                <div class="pf-asset-bar-track">
                  <div class="pf-asset-bar-fill ${pnl>=0?'win':'loss'}" style="width:${(Math.abs(pnl)/maxAbs*100).toFixed(1)}%"></div>
                </div>
                <span class="${pnl>=0?'positive':'negative'}">${pnl>=0?'+':''}$${pnl.toFixed(2)}</span>
              </div>`).join('') : '<div class="pf-empty-sm">No closed trades yet.</div>';
        }
    }

    // ── RENDER CALENDAR ───────────────────────────────────────
    function _renderCalendar() {
        const grid  = document.getElementById('pfCalendarGrid');
        const label = document.getElementById('pfCalMonthLabel');
        if (!grid) return;
        if (label) label.textContent = new Date(calYear, calMonth, 1).toLocaleDateString('en-US',{month:'long',year:'numeric'});

        const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
        const firstDay    = new Date(calYear, calMonth, 1).getDay(); // 0=Sun

        // Build daily PnL map
        const dayMap = {};
        trades.filter(t=>t.exitDate && t.outcome!=='OPEN').forEach(t=>{
            const d = new Date(t.exitDate);
            if (d.getFullYear()!==calYear || d.getMonth()!==calMonth) return;
            const key = d.getDate();
            dayMap[key] = (dayMap[key]||0) + (t.pnl||0);
        });

        let html = '<div class="pf-cal-dow"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>';
        html += '<div class="pf-cal-days">';
        for (let i=0; i<firstDay; i++) html += '<div class="pf-cal-day pf-cal-empty"></div>';
        for (let d=1; d<=daysInMonth; d++) {
            const pnl = dayMap[d];
            let cls = 'pf-cal-day';
            let tip = '';
            if (pnl !== undefined) {
                cls += pnl >= 0 ? ' pf-cal-win' : ' pf-cal-loss';
                tip = `title="${pnl>=0?'+':''}$${pnl.toFixed(2)}"`;
            }
            const isToday = (d===new Date().getDate() && calMonth===new Date().getMonth() && calYear===new Date().getFullYear());
            if (isToday) cls += ' pf-cal-today';
            html += `<div class="${cls}" ${tip}>${d}${pnl!==undefined?`<span>${pnl>=0?'+':''}${Math.abs(pnl)>=100?Math.round(pnl):pnl.toFixed(0)}</span>`:''}</div>`;
        }
        html += '</div>';
        grid.innerHTML = html;
    }

    function prevCalMonth() { if (--calMonth < 0) { calMonth=11; calYear--; } _renderCalendar(); }
    function nextCalMonth() { if (++calMonth > 11) { calMonth=0; calYear++; } _renderCalendar(); }

    // ── SUB-TAB SWITCHING ─────────────────────────────────────
    function _initSubTabs() {
        document.querySelectorAll('.pf-subtab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pf-subtab').forEach(b=>b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.pftab;
                document.querySelectorAll('.pf-panel').forEach(p=>p.style.display='none');
                const panel = document.getElementById(`pfPanel-${tab}`);
                if (panel) panel.style.display = 'block';
                if (tab==='analytics') _renderAnalytics();
                if (tab==='calendar')  _renderCalendar();
            });
        });
    }

    // ── ADD POSITION MODAL ────────────────────────────────────
    function openAddPosition() {
        const el = document.getElementById('pfAddPositionOverlay');
        if (el) el.style.display = 'flex';
        // Pre-fill date
        const d = document.getElementById('pfPosDate');
        if (d && !d.value) d.value = new Date().toISOString().slice(0,10);
    }
    function closeAddPosition(e) {
        if (e && e.target !== document.getElementById('pfAddPositionOverlay')) return;
        const el = document.getElementById('pfAddPositionOverlay');
        if (el) el.style.display = 'none';
    }
    function savePosition() {
        const sym   = (document.getElementById('pfPosSymbol')?.value||'').trim().toUpperCase();
        const qty   = parseFloat(document.getElementById('pfPosQty')?.value||'0');
        const entry = parseFloat(document.getElementById('pfPosEntry')?.value||'0');
        if (!sym || !qty || !entry) { alert('Symbol, Quantity, dan Entry Price wajib diisi!'); return; }
        const pos = {
            id:   _uid(),
            symbol: sym,
            name:   '',
            chain:  (document.getElementById('pfPosChain')?.value||'').trim(),
            qty,
            entry,
            currentPrice: parseFloat(document.getElementById('pfPosCurrentPrice')?.value||'0') || entry,
            dateOpened: (document.getElementById('pfPosDate')?.value||new Date().toISOString().slice(0,10)),
            sl:    parseFloat(document.getElementById('pfPosSL')?.value||'0')||0,
            tp:    parseFloat(document.getElementById('pfPosTP')?.value||'0')||0,
            notes: document.getElementById('pfPosNotes')?.value||'',
            coinId: document.getElementById('pfPosCoinId')?.value||''
        };
        positions.push(pos);
        _save();
        renderAll();
        closeAddPosition();
        _clearForm(['pfPosSymbol','pfPosCoinId','pfPosChain','pfPosQty','pfPosEntry','pfPosCurrentPrice','pfPosSL','pfPosTP','pfPosNotes']);
        _toast(`✅ Position ${sym} added!`);
    }

    // ── ADD/EDIT TRADE MODAL ──────────────────────────────────
    function openAddTrade() {
        editingTradeId = null;
        _setEl('pfTradeModalTitle','📔 Log Trade');
        _clearForm(['pfTradeSymbol','pfTradeChain','pfTradeEntry','pfTradeExit','pfTradeQty','pfTradeEntryDate','pfTradeExitDate','pfTradeSL','pfTradeTP','pfTradeSize','pfTradeNotes']);
        // Pre-fill datetime
        const ed = document.getElementById('pfTradeEntryDate');
        if (ed && !ed.value) ed.value = new Date().toISOString().slice(0,16);
        const sel = document.getElementById('pfTradeOutcome');
        if (sel) sel.value = 'OPEN';
        const el = document.getElementById('pfAddTradeOverlay');
        if (el) el.style.display = 'flex';
    }
    function closeAddTrade(e) {
        if (e && e.target !== document.getElementById('pfAddTradeOverlay')) return;
        const el = document.getElementById('pfAddTradeOverlay');
        if (el) el.style.display = 'none';
        editingTradeId = null;
    }
    function saveTrade() {
        const sym   = (document.getElementById('pfTradeSymbol')?.value||'').trim().toUpperCase();
        const entry = parseFloat(document.getElementById('pfTradeEntry')?.value||'0');
        const qty   = parseFloat(document.getElementById('pfTradeQty')?.value||'0');
        if (!sym || !entry || !qty) { alert('Symbol, Entry Price, dan Quantity wajib diisi!'); return; }
        const exitVal  = parseFloat(document.getElementById('pfTradeExit')?.value||'0')||null;
        const outcome  = document.getElementById('pfTradeOutcome')?.value||'OPEN';
        const pnl      = exitVal !== null ? (outcome==='SELL'||outcome==='BUY') ? null : (exitVal - entry) * qty : null;
        const type     = document.getElementById('pfTradeType')?.value||'BUY';
        const realPnl  = exitVal !== null ? (type==='BUY' ? (exitVal-entry)*qty : (entry-exitVal)*qty) : null;
        const pnlPct   = exitVal !== null && entry ? (type==='BUY' ? (exitVal-entry)/entry*100 : (entry-exitVal)/entry*100) : null;
        const trade = {
            id:        editingTradeId || _uid(),
            symbol:    sym,
            chain:     (document.getElementById('pfTradeChain')?.value||'').trim(),
            type,
            entry,
            exit:      exitVal,
            qty,
            pnl:       realPnl,
            pnlPct,
            entryDate: document.getElementById('pfTradeEntryDate')?.value||'',
            exitDate:  document.getElementById('pfTradeExitDate')?.value||'',
            sl:        parseFloat(document.getElementById('pfTradeSL')?.value||'0')||0,
            tp:        parseFloat(document.getElementById('pfTradeTP')?.value||'0')||0,
            posSize:   parseFloat(document.getElementById('pfTradeSize')?.value||'0')||0,
            strategy:  document.getElementById('pfTradeStrategy')?.value||'Other',
            emotion:   document.getElementById('pfTradeEmotion')?.value||'Neutral',
            outcome,
            notes:     document.getElementById('pfTradeNotes')?.value||''
        };
        if (editingTradeId) {
            const idx = trades.findIndex(t=>t.id===editingTradeId);
            if (idx !== -1) trades[idx] = trade;
        } else {
            trades.push(trade);
        }
        _save();
        renderAll();
        closeAddTrade();
        _toast(`✅ Trade ${sym} saved!`);
    }
    function editTrade(id) {
        const t = trades.find(t=>t.id===id);
        if (!t) return;
        editingTradeId = id;
        _setEl('pfTradeModalTitle','✏️ Edit Trade');
        _setVal('pfTradeSymbol',    t.symbol);
        _setVal('pfTradeChain',     t.chain);
        _setVal('pfTradeType',      t.type);
        _setVal('pfTradeEntry',     t.entry);
        _setVal('pfTradeExit',      t.exit||'');
        _setVal('pfTradeQty',       t.qty);
        _setVal('pfTradeEntryDate', t.entryDate||'');
        _setVal('pfTradeExitDate',  t.exitDate||'');
        _setVal('pfTradeSL',        t.sl||'');
        _setVal('pfTradeTP',        t.tp||'');
        _setVal('pfTradeSize',      t.posSize||'');
        _setVal('pfTradeStrategy',  t.strategy);
        _setVal('pfTradeEmotion',   t.emotion);
        _setVal('pfTradeOutcome',   t.outcome);
        _setVal('pfTradeNotes',     t.notes);
        const el = document.getElementById('pfAddTradeOverlay');
        if (el) el.style.display = 'flex';
    }
    function deleteTrade(id) {
        if (!confirm('Delete this trade?')) return;
        trades = trades.filter(t=>t.id!==id);
        _save();
        renderAll();
    }

    // ── CLOSE POSITION MODAL ──────────────────────────────────
    function startClosePos(id) {
        closingPosId = id;
        const pos = positions.find(p=>p.id===id);
        if (!pos) return;
        _setEl('pfCloseSymLabel', pos.symbol);
        _setVal('pfCloseExitPrice', pos.currentPrice||pos.entry);
        _setVal('pfCloseExitDate',  new Date().toISOString().slice(0,16));
        const el = document.getElementById('pfClosePositionOverlay');
        if (el) el.style.display = 'flex';
    }
    function cancelClosePos(e) {
        if (e && e.target !== document.getElementById('pfClosePositionOverlay')) return;
        const el = document.getElementById('pfClosePositionOverlay');
        if (el) el.style.display = 'none';
        closingPosId = null;
    }
    function confirmClosePos() {
        const pos = positions.find(p=>p.id===closingPosId);
        if (!pos) return;
        const exitPrice = parseFloat(document.getElementById('pfCloseExitPrice')?.value||'0');
        if (!exitPrice) { alert('Exit price wajib diisi!'); return; }
        const exitDate  = document.getElementById('pfCloseExitDate')?.value || new Date().toISOString().slice(0,16);
        const outcome   = document.getElementById('pfCloseOutcome')?.value||'WIN';
        const emotion   = document.getElementById('pfCloseEmotion')?.value||'Neutral';
        const notes     = document.getElementById('pfCloseNotes')?.value||'';
        const pnl       = (exitPrice - pos.entry) * pos.qty;
        const pnlPct    = pos.entry ? (exitPrice - pos.entry)/pos.entry*100 : 0;
        const trade = {
            id: _uid(), symbol: pos.symbol, chain: pos.chain, type: 'BUY',
            entry: pos.entry, exit: exitPrice, qty: pos.qty, pnl, pnlPct,
            entryDate: pos.dateOpened||'', exitDate, sl: pos.sl, tp: pos.tp,
            posSize: 0, strategy: 'Other', emotion, outcome, notes: pos.notes + (notes?' | '+notes:'')
        };
        trades.push(trade);
        positions = positions.filter(p=>p.id!==closingPosId);
        _save();
        renderAll();
        cancelClosePos();
        _toast(`✅ Position ${pos.symbol} closed. PnL: ${pnl>=0?'+':''}$${pnl.toFixed(2)}`);
    }
    function deletePosition(id) {
        if (!confirm('Delete this open position?')) return;
        positions = positions.filter(p=>p.id!==id);
        _save();
        renderAll();
    }

    // ── EXPORT CSV ────────────────────────────────────────────
    function exportCSV() {
        const headers = ['Date','Symbol','Chain','Type','Entry','Exit','Qty','PnL','PnL%','Strategy','Emotion','Outcome','Notes'];
        const rows = trades.map(t=>[
            t.entryDate?new Date(t.entryDate).toLocaleDateString():'',
            t.symbol, t.chain||'', t.type,
            t.entry, t.exit||'', t.qty,
            t.pnl!==null?t.pnl.toFixed(2):'',
            t.pnlPct!==null?t.pnlPct.toFixed(2):'',
            t.strategy, t.emotion, t.outcome,
            (t.notes||'').replace(/,/g,' ')
        ]);
        const csv = [headers.join(','), ...rows.map(r=>r.join(','))].join('\n');
        const blob = new Blob([csv], { type:'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `trading-journal-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        _toast('📤 CSV exported!');
    }

    // ── HELPERS ───────────────────────────────────────────────
    function _daysAgo(dateStr) {
        const ms = Date.now() - new Date(dateStr).getTime();
        const d = Math.floor(ms/86400000);
        return d === 0 ? 'Today' : d === 1 ? '1d ago' : `${d}d ago`;
    }
    function _daysBetween(a, b) {
        const ms = new Date(b) - new Date(a);
        const d = Math.round(ms/86400000);
        return d < 1 ? '<1d' : `${d}d`;
    }
    function _fmtDuration(ms) {
        const d = Math.round(ms/86400000);
        if (d < 1) return '<1d';
        if (d < 30) return `${d}d`;
        if (d < 365) return `${Math.round(d/30)}mo`;
        return `${(d/365).toFixed(1)}y`;
    }
    function _calcRR(t) {
        if (!t.sl || !t.tp || !t.entry) return 0;
        const risk   = Math.abs(t.entry - t.sl);
        const reward = Math.abs(t.tp - t.entry);
        return risk ? reward/risk : 0;
    }
    function _clearForm(ids) {
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value=''; });
    }
    function _setVal(id, val) {
        const el = document.getElementById(id);
        if (el) el.value = val;
    }
    function _toast(msg, duration) {
        const n = document.createElement('div');
        n.className = 'pf-toast';
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(()=>n.remove(), duration || 4000);
    }

    // ── PnL ALERT (browser notification) ─────────────────────
    async function _checkPnLAlerts() {
        if (!positions.length) return;
        const alerts = [];
        for (const pos of positions) {
            const cur = pos.currentPrice || pos.entry;
            if (!pos.entry || !cur) continue;
            const pct = ((cur - pos.entry) / pos.entry) * 100;
            if (pct >= 30 && !pos._alerted30) {
                pos._alerted30 = true;
                alerts.push(`🚀 ${pos.symbol} is UP ${pct.toFixed(1)}% from your entry!`);
            }
            if (pct <= -15 && !pos._alertedSL) {
                pos._alertedSL = true;
                alerts.push(`⚠️ ${pos.symbol} is DOWN ${Math.abs(pct).toFixed(1)}% from your entry. Consider your stop-loss.`);
            }
            // TP / SL custom alerts
            if (pos.tp && cur >= pos.tp && !pos._alertedTP) {
                pos._alertedTP = true;
                alerts.push(`🎯 ${pos.symbol} hit your Take Profit target of $${pos.tp}!`);
            }
            if (pos.sl && cur <= pos.sl && !pos._alertedSL2) {
                pos._alertedSL2 = true;
                alerts.push(`🛑 ${pos.symbol} hit your Stop Loss of $${pos.sl}!`);
            }
        }
        alerts.forEach(msg => {
            _toast(msg, 7000);
            // Browser notification if permission granted
            if (Notification.permission === 'granted') {
                new Notification('📊 Portfolio Alert', { body: msg, icon: 'images/ic_logo.png' });
            }
        });
        if (alerts.length) _save();
    }

    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    // ── AUTO REFRESH (every 5 min when portfolio tab is active) ──
    let _autoRefreshTimer = null;
    function _startAutoRefresh() {
        if (_autoRefreshTimer) return;
        _autoRefreshTimer = setInterval(async () => {
            const pfPanel = document.getElementById('portfolio');
            if (!pfPanel || !pfPanel.classList.contains('active')) return;
            await refreshPrices();
            await _checkPnLAlerts();
        }, 5 * 60 * 1000);
    }

    // ── QUICK-ADD from Scanner tab ────────────────────────────
    function addFromScanner(coinId, symbol, currentPrice) {
        // Pre-fill the add position modal from scanner data
        openAddPosition();
        setTimeout(() => {
            const symEl = document.getElementById('pfPosSymbol');
            const priceEl = document.getElementById('pfPosCurrentPrice');
            const entryEl = document.getElementById('pfPosEntry');
            const hidEl = document.getElementById('pfPosCoinId');
            if (symEl) symEl.value = (symbol || coinId || '').toUpperCase();
            if (priceEl && currentPrice) priceEl.value = currentPrice;
            if (entryEl && currentPrice) entryEl.value = currentPrice;
            if (hidEl) hidEl.value = coinId || '';
        }, 50);
        // Switch to portfolio tab
        if (typeof switchTab === 'function') switchTab('portfolio');
    }

    // ── INIT ──────────────────────────────────────────────────
    function init() {
        _load();
        _initSubTabs();
        renderAll();
        _startAutoRefresh();
        requestNotificationPermission();
    }

    return {
        init, renderAll,
        connectWallet, disconnectWallet,
        openAddPosition, closeAddPosition, savePosition,
        openAddTrade, closeAddTrade, saveTrade, editTrade, deleteTrade,
        startClosePos, cancelClosePos, confirmClosePos, deletePosition,
        refreshPrices, searchSymbol, filterJournal, exportCSV,
        setEquityPeriod, prevCalMonth, nextCalMonth,
        addFromScanner
    };
})();

// Bridge: addToPortfolio called from Scanner tab "Add to Portfolio" button
function addToPortfolio(coinId) {
    const coin = (typeof cryptoData !== 'undefined' ? cryptoData : []).find(c => c.id === coinId);
    const symbol = coin ? coin.symbol : coinId;
    const price  = coin ? coin.current_price : null;
    portfolioTracker.addFromScanner(coinId, symbol, price);
}

async function loadCryptoNews() {
    const newsList = document.getElementById('newsList');
    if (!newsList) return;
    
    newsList.innerHTML = '<div class="news-loading"><span class="g-spinner"></span> Memuat berita kripto terbaru…</div>';
    
    // Mock news data
    setTimeout(() => {
        const mockNews = [
            {
                title: 'Bitcoin Reaches New All-Time High',
                description: 'BTC surpasses previous records amid institutional adoption',
                source: 'CoinDesk',
                publishedAt: new Date().toISOString(),
                sentiment: 'bullish'
            },
            {
                title: 'Ethereum Upgrade Scheduled',
                description: 'Next major network upgrade to improve scalability',
                source: 'Cointelegraph',
                publishedAt: new Date().toISOString(),
                sentiment: 'bullish'
            },
            {
                title: 'Regulatory Update: New Guidelines Released',
                description: 'SEC announces clearer crypto trading guidelines',
                source: 'Bloomberg Crypto',
                publishedAt: new Date().toISOString(),
                sentiment: 'neutral'
            }
        ];
        
        newsList.innerHTML = mockNews.map(article => `
            <div class="news-article ${article.sentiment}">
                <div class="news-header">
                    <h4>${article.title}</h4>
                    <span class="news-sentiment ${article.sentiment}">
                        ${article.sentiment === 'bullish' ? '��' : article.sentiment === 'bearish' ? '📉' : '⚖️'}
                    </span>
                </div>
                <p>${article.description}</p>
                <div class="news-footer">
                    <span class="news-source">${article.source}</span>
                    <span class="news-time">${new Date(article.publishedAt).toLocaleString()}</span>
                </div>
            </div>
        `).join('');
    }, 500);
}

function calculateAllAIScores() {
    // Jika dipanggil tanpa context koin tertentu (dari tombol AI Rank),
    // tampilkan top 20 koin terbaik dari data yang sudah ada
    const coinScoreGrid = document.getElementById('coinScoreGrid');
    if (!coinScoreGrid) return;

    const allCoins = cryptoData.slice(0, 200);
    const scored = _scoreAllCoins(allCoins);
    window._scoredCoins = scored;

    renderCoinScoreGrid(scored, 'all');

    const section = document.querySelector('.coin-scoring-section');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.querySelectorAll('.score-filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.score-filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            renderCoinScoreGrid(window._scoredCoins || [], this.dataset.filter || 'all');
        });
    });
}

/**
 * Scoring engine — dipakai oleh calculateAllAIScores dan renderSingleCoinAIScore
 */
function _scoreAllCoins(coins) {
    return coins.map(coin => {
        const ch24h    = coin.price_change_percentage_24h || 0;
        const ch7d     = coin.price_change_percentage_7d_in_currency || 0;
        const volRatio = coin.market_cap ? coin.total_volume / coin.market_cap : 0;
        const spark    = coin.sparkline_in_7d?.price || [];
        const rsi      = calcRSI(spark, 14);
        const f        = getFuturesAnalysis(coin);

        // ── 6 faktor dengan bobot jelas ──────────────────────
        const factors = [];
        let score = 50;

        // F1: Momentum 24h (max ±12)
        let f1 = 0;
        if (ch24h > 5) f1 = 12; else if (ch24h > 0) f1 = 5;
        else if (ch24h < -5) f1 = -12; else if (ch24h < 0) f1 = -5;
        score += f1;
        factors.push({ label: 'Momentum 24h', value: f1, max: 12, desc: `${ch24h >= 0 ? '+' : ''}${ch24h.toFixed(1)}%` });

        // F2: Trend 7d (max ±10)
        let f2 = 0;
        if (ch7d > 10) f2 = 10; else if (ch7d > 0) f2 = 4;
        else if (ch7d < -10) f2 = -10; else if (ch7d < 0) f2 = -4;
        score += f2;
        factors.push({ label: 'Trend 7D', value: f2, max: 10, desc: `${ch7d >= 0 ? '+' : ''}${ch7d.toFixed(1)}%` });

        // F3: Likuiditas (max +12)
        let f3 = 0;
        if (volRatio > 0.3) f3 = 12; else if (volRatio > 0.1) f3 = 7;
        else if (volRatio < 0.02) f3 = -5;
        score += f3;
        factors.push({ label: 'Likuiditas', value: f3, max: 12, desc: `Vol/MCap ${(volRatio*100).toFixed(1)}%` });

        // F4: Ranking (max +15)
        const rank = coin.market_cap_rank || 999;
        let f4 = 0;
        if (rank <= 10) f4 = 15; else if (rank <= 50) f4 = 8; else if (rank <= 100) f4 = 3;
        score += f4;
        factors.push({ label: 'Market Cap Rank', value: f4, max: 15, desc: `#${rank}` });

        // F5: RSI (max ±8)
        let f5 = 0;
        if (rsi < 30) f5 = 8; else if (rsi > 75) f5 = -8;
        else if (rsi < 45) f5 = 3; else if (rsi > 60) f5 = -3;
        score += f5;
        factors.push({ label: 'RSI(14)', value: f5, max: 8, desc: `RSI ${rsi.toFixed(0)}` });

        // F6: Futures Signal (max ±5)
        let f6 = 0;
        if (f.direction === 'long') f6 = 5;
        else if (f.direction === 'short') f6 = -5;
        else if (f.direction === 'long_weak') f6 = 2;
        else if (f.direction === 'short_weak') f6 = -2;
        score += f6;
        factors.push({ label: 'Futures Signal', value: f6, max: 5, desc: `${f.dirEmoji} ${f.dirLabel}` });

        return {
            ...coin,
            aiScore: Math.min(100, Math.max(0, Math.round(score))),
            rsi: Math.round(rsi),
            futuresDir: f.dirEmoji + ' ' + f.dirLabel,
            leverage: f.leverage,
            factors,
        };
    }).sort((a, b) => b.aiScore - a.aiScore);
}

/**
 * Render panel AI Score SATU KOIN dengan breakdown lengkap.
 * Dipanggil otomatis dari analyzeCoin().
 */
function renderSingleCoinAIScore(coin) {
    const coinScoreGrid = document.getElementById('coinScoreGrid');
    if (!coinScoreGrid) return;

    const [scored] = _scoreAllCoins([coin]);
    const sc       = scored;
    const scoreColor = sc.aiScore >= 80 ? '#4ade80' : sc.aiScore >= 65 ? '#fbbf24' : sc.aiScore >= 45 ? '#94a3b8' : '#f87171';

    const barPct = (val, max) => {
        const pct  = Math.min(100, Math.abs(val) / max * 100);
        const color = val >= 0 ? '#4ade80' : '#f87171';
        return `<div class="ai-factor-bar-wrap">
                    <div class="ai-factor-bar" style="width:${pct}%;background:${color}"></div>
                </div>`;
    };

    const factorRows = sc.factors.map(f => `
        <div class="ai-factor-row">
            <div class="ai-factor-name">${f.label}</div>
            <div class="ai-factor-desc">${f.desc}</div>
            ${barPct(f.value, f.max)}
            <div class="ai-factor-val" style="color:${f.value >= 0 ? '#4ade80' : '#f87171'}">
                ${f.value >= 0 ? '+' : ''}${f.value}
            </div>
        </div>
    `).join('');

    // Rekomendasi teks
    let recText, recColor, recIcon;
    if (sc.aiScore >= 80)      { recIcon = '🚀'; recColor = '#4ade80'; recText = 'Sangat Bullish — Setup bagus untuk entry'; }
    else if (sc.aiScore >= 65) { recIcon = '📈'; recColor = '#86efac'; recText = 'Bullish — Momentum positif, perhatikan volume'; }
    else if (sc.aiScore >= 50) { recIcon = '🔵'; recColor = '#94a3b8'; recText = 'Netral — Tunggu sinyal lebih kuat'; }
    else if (sc.aiScore >= 35) { recIcon = '📉'; recColor = '#fca5a5'; recText = 'Bearish lemah — Hati-hati, risk meningkat'; }
    else                       { recIcon = '⚠️'; recColor = '#f87171'; recText = 'Sangat Bearish — Hindari atau short only'; }

    coinScoreGrid.innerHTML = `
        <div class="single-score-panel">
            <div class="single-score-header">
                <img src="${coin.image}" alt="${coin.name}" class="score-coin-icon">
                <div>
                    <div class="single-score-name">${coin.name} <span style="color:#64748b;font-size:0.8rem">${coin.symbol.toUpperCase()}</span></div>
                    <div class="single-score-price">$${formatNumber(coin.current_price)}</div>
                </div>
                <div class="single-score-circle" style="border-color:${scoreColor}">
                    <span style="color:${scoreColor}">${sc.aiScore}</span>
                    <small>/100</small>
                </div>
            </div>

            <div class="single-score-rec" style="border-left:3px solid ${recColor}">
                ${recIcon} <strong style="color:${recColor}">${recText}</strong>
            </div>

            <div class="ai-factors-list">
                <div class="ai-factors-title">📊 Breakdown 6 Faktor</div>
                ${factorRows}
            </div>

            <div class="single-score-footer">
                <span>Futures: <strong style="color:${sc.aiScore>=50?'#4ade80':'#f87171'}">${sc.futuresDir} ${sc.leverage}×</strong></span>
                <span>RSI: <strong style="color:${sc.rsi<30?'#4ade80':sc.rsi>70?'#f87171':'#94a3b8'}">${sc.rsi}</strong></span>
                <button class="btn-analyze" style="margin-left:auto" onclick="calculateAllAIScores()">📋 Lihat Semua Koin</button>
            </div>
        </div>
    `;

    // Tampilkan section
    const section = document.querySelector('.coin-scoring-section');
    if (section) section.style.display = 'block';
}

function renderCoinScoreGrid(coins, filter) {
    const coinScoreGrid = document.getElementById('coinScoreGrid');
    if (!coinScoreGrid) return;

    let filtered = coins;
    if (filter === 'excellent') filtered = coins.filter(c => c.aiScore >= 80);
    else if (filter === 'good')  filtered = coins.filter(c => c.aiScore >= 65);
    else if (filter === 'best-liquidity') {
        filtered = [...coins].sort((a, b) => (b.total_volume / (b.market_cap||1)) - (a.total_volume / (a.market_cap||1))).slice(0, 30);
    }

    if (!filtered.length) {
        coinScoreGrid.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px">Tidak ada koin yang memenuhi filter ini.</p>';
        return;
    }

    const stars = (score) => {
        const s = Math.floor(score / 20);
        return '⭐'.repeat(Math.max(1, s));
    };
    const scoreColor = (s) => s >= 80 ? '#4ade80' : s >= 65 ? '#fbbf24' : s >= 45 ? '#94a3b8' : '#f87171';

    coinScoreGrid.innerHTML = filtered.map((coin, index) => `
        <div class="coin-score-card" data-score="${coin.aiScore}" onclick="analyzeCoin('${coin.id}')">
            <div class="score-rank">#${index + 1}</div>
            <img src="${coin.image}" alt="${coin.name}" class="score-coin-icon">
            <h4>${coin.name} <span style="font-size:0.72rem;color:#64748b">${coin.symbol.toUpperCase()}</span></h4>
            <div class="score-value" style="color:${scoreColor(coin.aiScore)}">${coin.aiScore}/100</div>
            <div class="score-stars">${stars(coin.aiScore)}</div>
            <div class="score-price">$${formatNumber(coin.current_price)}</div>
            <div style="font-size:0.72rem;color:#94a3b8;margin:4px 0">
                RSI ${coin.rsi} &nbsp;|&nbsp; ${coin.futuresDir} ${coin.leverage}×
            </div>
            <button class="btn-action" style="margin-top:8px;width:100%" onclick="event.stopPropagation();analyzeCoin('${coin.id}')">Analyze</button>
        </div>
    `).join('');
}

function generateExitStrategy(coinId) {
    const coin = cryptoData.find(c => c.id === coinId);
    if (!coin) { console.warn('Coin not found:', coinId); return; }

    // Pastikan section exit strategy terlihat
    const exitSection = document.querySelector('.exit-strategy-section');
    if (exitSection) exitSection.style.display = 'block';

    if (typeof generateAIExitStrategy === 'function') {
        generateAIExitStrategy(coin.current_price, { coin });
    } else {
        // Fallback: render langsung tanpa ai-market-expert.js
        _renderExitStrategyFallback(coin);
    }

    // Scroll ke section
    const container = document.getElementById('exitStrategyContainer');
    if (container) {
        setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
}

function _renderExitStrategyFallback(coin) {
    const container = document.getElementById('exitStrategyContainer');
    if (!container) return;

    const price   = coin.current_price;
    const spark   = coin.sparkline_in_7d?.price || [];
    const high7d  = spark.length ? Math.max(...spark) : price * 1.2;
    const low7d   = spark.length ? Math.min(...spark) : price * 0.8;
    const atr     = calcATR(spark, 14);
    const rsi     = calcRSI(spark, 14);
    const f       = getFuturesAnalysis(coin);

    const fmt = (n) => n >= 1000 ? `$${(n/1000).toFixed(2)}K` : n >= 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(5)}`;

    // Entry zones dari Fibonacci
    const range  = high7d - low7d;
    const z1     = low7d + range * 0.618;  // support kuat
    const z2     = low7d + range * 0.5;    // support sedang
    const z3     = low7d + range * 0.382;  // support konservatif

    // Exit targets
    const tp1    = price * 1.15;
    const tp2    = price * 1.30;
    const tp3    = price * 1.50;
    const sl     = price * 0.92;

    container.innerHTML = `
        <div class="exit-strategy-content">
            <div class="strategy-current-price">
                <h3>${coin.name} (${coin.symbol.toUpperCase()}) — ${fmt(price)}</h3>
                <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px">
                    <span style="color:#94a3b8;font-size:0.82rem">RSI: <strong style="color:${rsi<30?'#4ade80':rsi>70?'#f87171':'#fbbf24'}">${rsi.toFixed(0)}</strong></span>
                    <span style="color:#94a3b8;font-size:0.82rem">ATR: <strong>${fmt(atr)}</strong></span>
                    <span style="color:#94a3b8;font-size:0.82rem">Futures: <strong style="color:${f.dirColor}">${f.dirEmoji} ${f.dirLabel} ${f.leverage}×</strong></span>
                </div>
            </div>

            <div class="strategy-section">
                <h3>📍 Entry Zones (Zona Beli)</h3>
                <div class="entry-zones">
                    ${[
                        {label:'Zone 1 — Agresif', price: z1, prob:'50%', desc:'Lebih dekat harga sekarang, risk lebih tinggi', action:'⚠️ Konfirmasi volume sebelum entry'},
                        {label:'Zone 2 — Moderat ⭐', price: z2, prob:'70%', desc:'Keseimbangan risk/reward (RECOMMENDED)', action:'🟡 Tunggu candle konfirmasi'},
                        {label:'Zone 3 — Konservatif', price: z3, prob:'85%', desc:'Dekat support kuat, risk rendah', action:'🟢 Entry aman dengan SL ketat'},
                    ].map(z => `
                        <div class="entry-zone-card">
                            <div class="zone-header"><strong>${z.label}</strong></div>
                            <div class="zone-price">${fmt(z.price)}</div>
                            <div class="zone-probability">Success Rate: ${z.prob}</div>
                            <p class="zone-desc">${z.desc}</p>
                            <div class="zone-action">${z.action}</div>
                        </div>`).join('')}
                </div>
            </div>

            <div class="strategy-section">
                <h3>🎯 Exit Targets (Zona Jual)</h3>
                <div class="exit-targets">
                    ${[
                        {label:'Target 1', price: tp1, profit:'+15%', action:'Ambil 30% profit', desc:'Profit cepat'},
                        {label:'Target 2', price: tp2, profit:'+30%', action:'Ambil 40% profit', desc:'Target menengah'},
                        {label:'Target 3 🚀', price: tp3, profit:'+50%', action:'Sisa 30% posisi', desc:'Moon target'},
                    ].map(t => `
                        <div class="exit-target-card">
                            <div class="target-header"><strong>${t.label}</strong></div>
                            <div class="target-price">${fmt(t.price)}</div>
                            <div class="target-profit positive">${t.profit}</div>
                            <div class="target-action">${t.action}</div>
                            <p class="target-desc">${t.desc}</p>
                        </div>`).join('')}
                </div>
            </div>

            <div class="strategy-section stop-loss-section">
                <h3>🛑 Stop Loss (WAJIB!)</h3>
                <div class="stop-loss-card">
                    <div class="stop-loss-price">${fmt(sl)}</div>
                    <div class="stop-loss-percent negative">−8%</div>
                    <p>Lindungi modal Anda</p>
                    <div class="warning-box">⚠️ <strong>PENTING:</strong> Set SL SEBELUM masuk posisi!</div>
                </div>
            </div>

            <div class="strategy-section">
                <h3>⚖️ Risk / Reward</h3>
                <div class="risk-reward-card">
                    <div class="rr-stat"><span class="rr-label">Risk</span><span class="rr-value negative">8%</span></div>
                    <div class="rr-ratio"><strong>1.88 : 1</strong><p>Excellent</p></div>
                    <div class="rr-stat"><span class="rr-label">Reward (TP1)</span><span class="rr-value positive">15%</span></div>
                </div>
            </div>

            <div class="strategy-disclaimer">
                <p>⚠️ <strong>Disclaimer:</strong> Analisis ini bersifat edukatif dan BUKAN saran keuangan. Selalu lakukan riset mandiri.</p>
            </div>
        </div>`;
}

console.log('✅ App.js loaded successfully');

// ============================================================
//  API KEY MODAL
// ============================================================
function openApiKeysModal() {
    const modal = document.getElementById('apiKeysModal');
    if (!modal) return;
    // Load saved keys into inputs
    document.getElementById('etherscanApiKey').value  = localStorage.getItem('etherscanApiKey')  || '';
    document.getElementById('bscscanApiKey').value    = localStorage.getItem('bscscanApiKey')    || '';
    document.getElementById('heliusApiKey').value     = localStorage.getItem('heliusApiKey')     || '';
    document.getElementById('blockchainApiKey').value = localStorage.getItem('blockchainApiKey') || '';
    modal.classList.add('active');
}

function closeApiKeysModal() {
    const modal = document.getElementById('apiKeysModal');
    if (modal) modal.classList.remove('active');
}

function saveApiKeys() {
    const keys = {
        etherscanApiKey:  document.getElementById('etherscanApiKey')?.value.trim(),
        bscscanApiKey:    document.getElementById('bscscanApiKey')?.value.trim(),
        heliusApiKey:     document.getElementById('heliusApiKey')?.value.trim(),
        blockchainApiKey: document.getElementById('blockchainApiKey')?.value.trim(),
    };
    Object.entries(keys).forEach(([k, v]) => {
        if (v) localStorage.setItem(k, v);
        else   localStorage.removeItem(k);
    });
    closeApiKeysModal();
    console.log('✅ API keys saved');
}

// Close modal when clicking backdrop
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('apiKeysModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeApiKeysModal();
        });
    }
});

// ═══════════════════════════════════════════════════════════════
//  WALLET TRACKER MODULE
//  Lacak wallet siapapun di ETH / BSC / BTC / SOL
//  Notifikasi browser saat transaksi baru terdeteksi
// ═══════════════════════════════════════════════════════════════

const walletTracker = (() => {

    // ── State ──────────────────────────────────────────────────
    let wallets = [];            // { id, chain, address, label, addedAt, lastTxHash, balance, txCount, status }
    let allTxs  = [];            // accumulated transaction objects (newest first)
    let txFilter = 'all';
    let pollingInterval = null;
    const POLL_MS = 60_000;      // poll every 60 s
    const LARGE_USD = 10_000;    // ≥ $10k = "large" tx

    // ── Helpers ────────────────────────────────────────────────
    const LS_KEY  = 'wt_wallets_v2';
    const LS_TXKEY = 'wt_txs_v2';
    const save  = () => {
        localStorage.setItem(LS_KEY,   JSON.stringify(wallets));
        localStorage.setItem(LS_TXKEY, JSON.stringify(allTxs.slice(0, 200)));
    };
    const load  = () => {
        try { wallets = JSON.parse(localStorage.getItem(LS_KEY)  || '[]'); } catch { wallets = []; }
        try { allTxs  = JSON.parse(localStorage.getItem(LS_TXKEY) || '[]'); } catch { allTxs  = []; }
    };
    const uid   = () => Math.random().toString(36).slice(2, 10);
    const short = (addr) => addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : '';
    const fmtTime = (ts) => {
        const d = new Date(ts);
        return d.toLocaleDateString('id-ID') + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    };
    const getApiKey = (chain) => {
        if (chain === 'ethereum') return localStorage.getItem('etherscanApiKey') || '';
        if (chain === 'bsc')      return localStorage.getItem('bscscanApiKey')   || '';
        return '';
    };
    const chainLabel = { ethereum:'⟠ ETH', bsc:'🔶 BSC', bitcoin:'₿ BTC', solana:'◎ SOL' };
    const chainColor = { ethereum:'#627eea', bsc:'#f3ba2f', bitcoin:'#f7931a', solana:'#9945ff' };

    // ── Notification ───────────────────────────────────────────
    function requestNotifPermission() {
        if (!('Notification' in window)) {
            alert('Browser kamu tidak mendukung notifikasi desktop.');
            return;
        }
        Notification.requestPermission().then(p => {
            renderNotifBtn(p);
            if (p === 'granted') {
                new Notification('Wallet Tracker Aktif 🔔', {
                    body: 'Kamu akan dapat notifikasi saat ada transaksi baru.',
                    icon: 'images/ic_logo.png'
                });
            }
        });
    }
    function renderNotifBtn(perm) {
        const btn    = document.getElementById('wtNotifBtn');
        const banner = document.getElementById('wtNotifBanner');
        if (!btn) return;
        const p = perm || Notification.permission;
        if (p === 'granted') {
            btn.textContent = '🔔 Notifikasi Aktif';
            btn.classList.add('wt-notif-on');
            if (banner) banner.style.display = 'none';
        } else if (p === 'denied') {
            btn.textContent = '🔕 Notifikasi Diblokir';
            btn.classList.add('wt-notif-off');
            if (banner) banner.style.display = 'flex';
        } else {
            btn.textContent = '🔔 Enable Notifications';
            if (banner) banner.style.display = 'none';
        }
    }
    function sendNotif(wallet, tx) {
        if (Notification.permission !== 'granted') return;
        const dir  = tx.direction === 'in' ? '⬇ MASUK' : '⬆ KELUAR';
        const body = `${dir} ${tx.valueFormatted} • ${wallet.label || short(wallet.address)}`;
        const n = new Notification(`🔔 Transaksi ${chainLabel[wallet.chain]}`, {
            body,
            icon: 'images/ic_logo.png',
            tag : tx.hash,
        });
        n.onclick = () => {
            window.focus();
            switchTab('wallet');
        };
    }

    // ── API Fetchers ───────────────────────────────────────────
    async function fetchEthTxs(address, chain) {
        const apiDomain = chain === 'bsc' ? 'api.bscscan.com' : 'api.etherscan.io';
        const apiKey = getApiKey(chain);
        const keyParam = apiKey ? `&apikey=${apiKey}` : '';
        const url = `https://${apiDomain}/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&offset=10${keyParam}`;
        try {
            const res  = await fetchWithTimeout(url, {}, 10000);
            const json = await res.json();
            if (json.status !== '1' && json.status !== 1) return [];
            return (json.result || []).slice(0, 10).map(tx => {
                const val = parseFloat(tx.value) / 1e18;
                const dir = tx.to?.toLowerCase() === address.toLowerCase() ? 'in' : 'out';
                return {
                    hash:           tx.hash,
                    chain,
                    walletAddress:  address,
                    direction:      dir,
                    from:           tx.from,
                    to:             tx.to,
                    value:          val,
                    valueFormatted: val.toFixed(4) + (chain === 'bsc' ? ' BNB' : ' ETH'),
                    valueUsd:       val * (chain === 'bsc' ? 600 : 2600), // rough estimate
                    timestamp:      parseInt(tx.timeStamp) * 1000,
                    blockNumber:    tx.blockNumber,
                    status:         tx.txreceipt_status === '1' ? 'success' : 'fail',
                };
            });
        } catch { return []; }
    }

    async function fetchBtcTxs(address) {
        const url = `https://blockchain.info/rawaddr/${address}?limit=10&cors=true`;
        try {
            const res  = await fetchWithTimeout(url, {}, 10000);
            const json = await res.json();
            return (json.txs || []).slice(0, 10).map(tx => {
                // determine if address received BTC
                const received = (tx.out || []).some(o => o.addr === address);
                const val = (tx.result || 0) / 1e8;
                const absVal = Math.abs(val);
                return {
                    hash:           tx.hash,
                    chain:          'bitcoin',
                    walletAddress:  address,
                    direction:      received ? 'in' : 'out',
                    from:           'multiple',
                    to:             address,
                    value:          absVal,
                    valueFormatted: absVal.toFixed(6) + ' BTC',
                    valueUsd:       absVal * 95000,
                    timestamp:      (tx.time || Date.now() / 1000) * 1000,
                    blockNumber:    tx.block_height || 0,
                    status:         'success',
                };
            });
        } catch { return []; }
    }

    async function fetchSolTxs(address) {
        // Use public Solana RPC — no API key needed
        const url = 'https://api.mainnet-beta.solana.com';
        try {
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1,
                    method: 'getSignaturesForAddress',
                    params: [address, { limit: 10 }]
                })
            }, 10000);
            const json = await res.json();
            const sigs = json.result || [];
            return sigs.map(s => ({
                hash:           s.signature,
                chain:          'solana',
                walletAddress:  address,
                direction:      'out', // direction hard to determine without full parsing
                from:           address,
                to:             '—',
                value:          0,
                valueFormatted: '— SOL',
                valueUsd:       0,
                timestamp:      (s.blockTime || Date.now() / 1000) * 1000,
                blockNumber:    s.slot || 0,
                status:         s.err ? 'fail' : 'success',
            }));
        } catch { return []; }
    }

    async function fetchBalance(wallet) {
        try {
            if (wallet.chain === 'ethereum' || wallet.chain === 'bsc') {
                const apiDomain = wallet.chain === 'bsc' ? 'api.bscscan.com' : 'api.etherscan.io';
                const apiKey = getApiKey(wallet.chain);
                const kp = apiKey ? `&apikey=${apiKey}` : '';
                const url = `https://${apiDomain}/api?module=account&action=balance&address=${wallet.address}&tag=latest${kp}`;
                const res  = await fetchWithTimeout(url, {}, 8000);
                const json = await res.json();
                if (json.status === '1') return (parseFloat(json.result) / 1e18).toFixed(4);
            } else if (wallet.chain === 'bitcoin') {
                const res  = await fetchWithTimeout(`https://blockchain.info/q/addressbalance/${wallet.address}?cors=true`, {}, 8000);
                const txt  = await res.text();
                return (parseFloat(txt) / 1e8).toFixed(6);
            } else if (wallet.chain === 'solana') {
                const res = await fetchWithTimeout('https://api.mainnet-beta.solana.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getBalance', params:[wallet.address] })
                }, 8000);
                const json = await res.json();
                return ((json.result?.value || 0) / 1e9).toFixed(4);
            }
        } catch {}
        return null;
    }

    async function fetchTxsForWallet(wallet) {
        if (wallet.chain === 'ethereum' || wallet.chain === 'bsc') return fetchEthTxs(wallet.address, wallet.chain);
        if (wallet.chain === 'bitcoin')  return fetchBtcTxs(wallet.address);
        if (wallet.chain === 'solana')   return fetchSolTxs(wallet.address);
        return [];
    }

    // ── Token Holdings (ERC-20 / BEP-20) ──────────────────────
    async function fetchTokenHoldings(address, chain) {
        if (chain !== 'ethereum' && chain !== 'bsc') return [];
        const apiDomain = chain === 'bsc' ? 'api.bscscan.com' : 'api.etherscan.io';
        const apiKey    = getApiKey(chain);
        const kp        = apiKey ? `&apikey=${apiKey}` : '';
        // Get ERC-20 token transfer list — unique contracts = holdings
        const url = `https://${apiDomain}/api?module=account&action=tokentx&address=${address}&sort=desc&offset=50${kp}`;
        try {
            const res  = await fetchWithTimeout(url, {}, 12000);
            const json = await res.json();
            if (json.status !== '1') return [];
            // Deduplicate by token contract, pick latest balance-relevant entry
            const seen   = new Map();
            (json.result || []).forEach(t => {
                const key = t.contractAddress.toLowerCase();
                if (!seen.has(key)) {
                    seen.set(key, {
                        symbol:   t.tokenSymbol,
                        name:     t.tokenName,
                        decimals: parseInt(t.tokenDecimal) || 18,
                        contract: t.contractAddress,
                        lastTx:   parseInt(t.timeStamp) * 1000,
                    });
                }
            });
            return [...seen.values()].slice(0, 20);
        } catch { return []; }
    }

    async function fetchTokenBalance(address, chain, token) {
        if (chain !== 'ethereum' && chain !== 'bsc') return null;
        const apiDomain = chain === 'bsc' ? 'api.bscscan.com' : 'api.etherscan.io';
        const apiKey    = getApiKey(chain);
        const kp        = apiKey ? `&apikey=${apiKey}` : '';
        const url = `https://${apiDomain}/api?module=account&action=tokenbalance&contractaddress=${token.contract}&address=${address}&tag=latest${kp}`;
        try {
            const res  = await fetchWithTimeout(url, {}, 6000);
            const json = await res.json();
            if (json.status !== '1') return null;
            const raw  = parseFloat(json.result);
            return raw / Math.pow(10, token.decimals);
        } catch { return null; }
    }

    // ── Preview Wallet (Arkham-style) ──────────────────────────
    async function previewWallet() {
        const chain   = document.getElementById('wtChain')?.value;
        const address = document.getElementById('wtAddress')?.value.trim();
        const panel   = document.getElementById('wtPreviewPanel');
        if (!panel) return;

        if (!address) { alert('Masukkan alamat wallet terlebih dahulu.'); return; }
        if ((chain === 'ethereum' || chain === 'bsc') && !/^0x[0-9a-fA-F]{40}$/.test(address)) {
            alert('Format alamat ETH/BSC tidak valid.'); return;
        }
        if (chain === 'bitcoin' && !/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address)) {
            alert('Format alamat Bitcoin tidak valid.'); return;
        }

        // Show loading state
        panel.style.display = 'block';
        panel.innerHTML = `<div class="wt-preview-loading"><span class="wt-spinner"></span> Mengambil data wallet <span class="wt-preview-addr">${short(address)}</span>...</div>`;
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        try {
            const tempWallet = { chain, address, id: '_preview' };
            const [balance, txs, tokens] = await Promise.all([
                fetchBalance(tempWallet),
                fetchTxsForWallet(tempWallet),
                fetchTokenHoldings(address, chain),
            ]);

            // Fetch individual token balances (max 10, throttled)
            const tokenBalances = [];
            for (const tok of tokens.slice(0, 10)) {
                const bal = await fetchTokenBalance(address, chain, tok);
                if (bal !== null && bal > 0) {
                    tokenBalances.push({ ...tok, balance: bal });
                }
            }
            tokenBalances.sort((a, b) => b.balance - a.balance);

            renderPreviewPanel(panel, { chain, address, balance, txs, tokenBalances });
        } catch (e) {
            panel.innerHTML = `<div class="wt-preview-error">⚠️ Gagal mengambil data wallet. Coba lagi atau periksa alamat.<br><small>${e.message || ''}</small></div>`;
        }
    }

    function renderPreviewPanel(panel, { chain, address, balance, txs, tokenBalances }) {
        const col      = chainColor[chain] || '#888';
        const lbl      = chainLabel[chain] || chain;
        const unit     = { ethereum:'ETH', bsc:'BNB', bitcoin:'BTC', solana:'SOL' }[chain] || '';
        const alreadyTracked = wallets.some(w => w.address.toLowerCase() === address.toLowerCase() && w.chain === chain);

        // ── Top stats bar ──
        const nativeBal = balance !== null ? `${parseFloat(balance).toLocaleString('en-US', {maximumFractionDigits:6})} ${unit}` : '—';
        const txCount   = txs.length;

        // ── Holdings rows ──
        let holdingsHtml = '';
        if (chain === 'ethereum' || chain === 'bsc') {
            if (tokenBalances.length === 0) {
                holdingsHtml = `<div class="wt-preview-empty-tokens">Tidak ada token ERC-20 yang ditemukan (atau diperlukan API key).</div>`;
            } else {
                holdingsHtml = tokenBalances.map((t, i) => {
                    const balFmt = t.balance >= 1
                        ? t.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })
                        : t.balance.toFixed(6);
                    const explorerLink = chain === 'ethereum'
                        ? `https://etherscan.io/token/${t.contract}?a=${address}`
                        : `https://bscscan.com/token/${t.contract}?a=${address}`;
                    return `
                    <div class="wt-holding-row">
                        <span class="wt-holding-rank">${i + 1}</span>
                        <div class="wt-holding-info">
                            <span class="wt-holding-symbol">${t.symbol}</span>
                            <span class="wt-holding-name">${t.name}</span>
                        </div>
                        <span class="wt-holding-bal">${balFmt}</span>
                        <a class="wt-holding-link" href="${explorerLink}" target="_blank">↗</a>
                    </div>`;
                }).join('');
            }
        } else {
            holdingsHtml = `<div class="wt-preview-empty-tokens">Token holdings tersedia untuk chain ETH & BSC.</div>`;
        }

        // ── Recent txs ──
        const recentTxsHtml = txs.slice(0, 5).map(tx => {
            const dirIcon = tx.direction === 'in' ? '⬇' : '⬆';
            const dirCls  = tx.direction === 'in' ? 'wt-tx-in' : 'wt-tx-out';
            const txUrl   = txExplorerUrl(tx);
            const timeAgo = fmtTime(tx.timestamp);
            return `
            <div class="wt-preview-tx-row ${dirCls}">
                <span class="wt-tx-dir-icon">${dirIcon}</span>
                <span class="wt-preview-tx-val">${tx.valueFormatted}</span>
                ${tx.valueUsd > 0 ? `<span class="wt-preview-tx-usd">≈ $${tx.valueUsd.toLocaleString('en-US',{maximumFractionDigits:0})}</span>` : ''}
                <span class="wt-preview-tx-time">${timeAgo}</span>
                <a href="${txUrl}" target="_blank" class="wt-preview-tx-link">↗</a>
            </div>`;
        }).join('') || `<div class="wt-preview-empty-tokens">Tidak ada transaksi ditemukan.</div>`;

        panel.innerHTML = `
        <div class="wt-preview-inner">

            <!-- Header -->
            <div class="wt-preview-header">
                <div class="wt-preview-header-left">
                    <span class="wt-chain-badge" style="background:${col};font-size:0.8rem">${lbl}</span>
                    <span class="wt-preview-address" title="${address}">${address.slice(0,10)}…${address.slice(-8)}</span>
                    <button class="wt-copy-btn" onclick="navigator.clipboard.writeText('${address}').then(()=>this.textContent='✅').catch(()=>{})" title="Copy address">📋</button>
                    <a class="wt-explorer-btn" href="${explorerUrl({chain, address})}" target="_blank">🔗 Explorer</a>
                </div>
                <button class="wt-preview-close" onclick="document.getElementById('wtPreviewPanel').style.display='none'">✕</button>
            </div>

            <!-- Stats bar -->
            <div class="wt-preview-stats">
                <div class="wt-preview-stat">
                    <span class="wt-preview-stat-label">Balance</span>
                    <span class="wt-preview-stat-val">${nativeBal}</span>
                </div>
                <div class="wt-preview-stat">
                    <span class="wt-preview-stat-label">Tokens Ditemukan</span>
                    <span class="wt-preview-stat-val">${tokenBalances.length}</span>
                </div>
                <div class="wt-preview-stat">
                    <span class="wt-preview-stat-label">Tx Terakhir</span>
                    <span class="wt-preview-stat-val">${txCount}</span>
                </div>
                <div class="wt-preview-stat">
                    <span class="wt-preview-stat-label">Aktivitas Terbaru</span>
                    <span class="wt-preview-stat-val">${txs.length > 0 ? fmtTime(txs[0].timestamp) : '—'}</span>
                </div>
            </div>

            <!-- Two-column body -->
            <div class="wt-preview-body">

                <!-- Holdings -->
                <div class="wt-preview-col">
                    <div class="wt-preview-col-title">💼 Token Holdings</div>
                    <!-- Native balance -->
                    <div class="wt-holding-row wt-holding-native">
                        <span class="wt-holding-rank">★</span>
                        <div class="wt-holding-info">
                            <span class="wt-holding-symbol">${unit}</span>
                            <span class="wt-holding-name">Native Balance</span>
                        </div>
                        <span class="wt-holding-bal" style="color:${col}">${nativeBal}</span>
                        <span></span>
                    </div>
                    ${holdingsHtml}
                </div>

                <!-- Recent Txs -->
                <div class="wt-preview-col">
                    <div class="wt-preview-col-title">🕐 5 Transaksi Terbaru</div>
                    ${recentTxsHtml}
                </div>

            </div>

            <!-- Actions -->
            <div class="wt-preview-actions">
                ${alreadyTracked
                    ? `<span class="wt-preview-tracked-note">✅ Wallet ini sudah ada di tracker kamu</span>`
                    : `<button class="wt-add-btn" onclick="walletTracker.confirmAddFromPreview('${chain}','${address}')">+ Track Wallet Ini</button>`
                }
                <button class="wt-preview-dismiss" onclick="document.getElementById('wtPreviewPanel').style.display='none'">Tutup</button>
            </div>

        </div>`;
    }

    function confirmAddFromPreview(chain, address) {
        // Set form values then call addWallet
        const chainEl   = document.getElementById('wtChain');
        const addrEl    = document.getElementById('wtAddress');
        if (chainEl) chainEl.value   = chain;
        if (addrEl)  addrEl.value    = address;
        addWallet();
        document.getElementById('wtPreviewPanel').style.display = 'none';
    }


    async function refreshWallet(wallet) {
        setWalletStatus(wallet.id, 'loading');
        try {
            const fetchPromises = [fetchTxsForWallet(wallet), fetchBalance(wallet)];
            // Fetch SPL token holdings for Solana wallets
            if (wallet.chain === 'solana') {
                fetchPromises.push(fetchSolTokenHoldings(wallet.address));
            }
            const results = await Promise.all(fetchPromises);
            const [txs, balance] = results;
            const tokenHoldings  = wallet.chain === 'solana' ? (results[2] || []) : [];

            if (balance !== null) {
                wallet.balance = balance;
            }
            if (wallet.chain === 'solana' && tokenHoldings.length > 0) {
                wallet.tokenHoldings = tokenHoldings;
            }
            wallet.status = 'ok';
            wallet.lastChecked = Date.now();

            let newCount = 0;
            txs.forEach(tx => {
                const exists = allTxs.some(t => t.hash === tx.hash && t.chain === tx.chain);
                if (!exists) {
                    allTxs.unshift(tx);
                    newCount++;
                    sendNotif(wallet, tx);
                }
            });

            if (txs.length > 0) {
                wallet.lastTxHash = txs[0].hash;
                wallet.txCount = (wallet.txCount || 0) + newCount;
            }
        } catch (e) {
            wallet.status = 'error';
            console.warn('Wallet fetch error:', wallet.address, e);
        }
        save();
        renderWallets();
        renderTxList();
    }

    async function refreshAll() {
        if (wallets.length === 0) return;
        const btn = document.getElementById('wtRefreshAllBtn');
        if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }
        for (const w of wallets) {
            await refreshWallet(w);
        }
        if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
    }

    // ── Polling ────────────────────────────────────────────────
    function startPolling() {
        if (pollingInterval) return;
        pollingInterval = setInterval(refreshAll, POLL_MS);
    }
    function stopPolling() {
        if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
    }

    // ── Add / Remove ───────────────────────────────────────────
    function addWallet() {
        const chain   = document.getElementById('wtChain')?.value;
        const address = document.getElementById('wtAddress')?.value.trim();
        const label   = document.getElementById('wtLabel')?.value.trim();

        if (!address) { alert('Masukkan alamat wallet terlebih dahulu.'); return; }

        // Basic address validation
        if ((chain === 'ethereum' || chain === 'bsc') && !/^0x[0-9a-fA-F]{40}$/.test(address)) {
            alert('Format alamat ETH/BSC tidak valid. Harus dimulai dengan 0x dan 40 karakter hex.'); return;
        }
        if (chain === 'bitcoin' && !/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address)) {
            alert('Format alamat Bitcoin tidak valid.'); return;
        }
        if (chain === 'solana' && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
            alert('Format alamat Solana tidak valid. Pastikan alamat base58 yang benar (32–44 karakter).'); return;
        }

        const duplicate = wallets.find(w => w.address.toLowerCase() === address.toLowerCase() && w.chain === chain);
        if (duplicate) { alert('Wallet ini sudah dilacak.'); return; }

        const wallet = {
            id:          uid(),
            chain,
            address,
            label:       label || `Wallet ${wallets.length + 1}`,
            addedAt:     Date.now(),
            lastTxHash:  null,
            balance:     null,
            txCount:     0,
            lastChecked: null,
            status:      'pending',
        };
        wallets.push(wallet);
        save();

        document.getElementById('wtAddress').value = '';
        document.getElementById('wtLabel').value   = '';

        renderWallets();
        updateBadge();
        refreshWallet(wallet);
        startPolling();
    }

    function removeWallet(id) {
        wallets = wallets.filter(w => w.id !== id);
        allTxs  = allTxs.filter(t => {
            const w = wallets.find(x => x.address.toLowerCase() === t.walletAddress?.toLowerCase());
            return !!w;
        });
        save();
        renderWallets();
        renderTxList();
        updateBadge();
        if (wallets.length === 0) stopPolling();
    }

    function setWalletStatus(id, status) {
        const w = wallets.find(x => x.id === id);
        if (w) w.status = status;
        const card = document.querySelector(`[data-wallet-id="${id}"]`);
        if (card) {
            const dot = card.querySelector('.wt-status-dot');
            if (dot) dot.className = `wt-status-dot wt-status-${status}`;
        }
    }

    // ── Preset / Programmatic Add ──────────────────────────────
    function addPresetWallet(chain, address, label) {
        const dup = wallets.find(w => w.address === address && w.chain === chain);
        if (dup) return; // already tracking, skip
        const wallet = {
            id:          uid(),
            chain,
            address,
            label:       label || address.slice(0, 8) + '…',
            addedAt:     Date.now(),
            lastTxHash:  null,
            balance:     null,
            tokenHoldings: [],
            txCount:     0,
            lastChecked: null,
            status:      'pending',
        };
        wallets.push(wallet);
        save();
        renderWallets();
        updateBadge();
        refreshWallet(wallet);
        startPolling();
        console.log(`🔗 Preset wallet added: [${chain}] ${address}`);
    }

    // ── Solana SPL Token Holdings ──────────────────────────────
    async function fetchSolTokenHoldings(address) {
        try {
            const res = await fetchWithTimeout('https://api.mainnet-beta.solana.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1,
                    method: 'getTokenAccountsByOwner',
                    params: [
                        address,
                        { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                        { encoding: 'jsonParsed', commitment: 'confirmed' }
                    ]
                })
            }, 12000);
            const json = await res.json();
            const accounts = json.result?.value || [];
            const tokens = [];
            for (const acc of accounts) {
                const info = acc.account?.data?.parsed?.info;
                if (!info) continue;
                const amt = parseFloat(info.tokenAmount?.uiAmount || 0);
                if (amt <= 0) continue;                    // skip zero-balance
                tokens.push({
                    mint:     info.mint,
                    symbol:   info.mint.slice(0, 6) + '…', // fallback symbol
                    amount:   amt,
                    decimals: info.tokenAmount?.decimals || 0,
                });
            }
            // Sort by amount descending, take top 8 to avoid overflow
            return tokens.sort((a, b) => b.amount - a.amount).slice(0, 8);
        } catch { return []; }
    }


    function renderWallets() {
        const grid = document.getElementById('wtWalletGrid');
        if (!grid) return;
        if (wallets.length === 0) {
            grid.innerHTML = `<div class="wt-empty"><span style="font-size:2.5rem">👁</span><p>Belum ada wallet. Tambahkan di atas.</p></div>`;
            return;
        }
        grid.innerHTML = wallets.map(w => {
            const col    = chainColor[w.chain] || '#888';
            const lbl    = chainLabel[w.chain] || w.chain;
            const bal    = w.balance !== null ? w.balance : '—';
            const unit   = { ethereum:'ETH', bsc:'BNB', bitcoin:'BTC', solana:'SOL' }[w.chain] || '';
            const chk    = w.lastChecked ? fmtTime(w.lastChecked) : 'Belum dicek';
            const txs    = allTxs.filter(t => t.walletAddress?.toLowerCase() === w.address.toLowerCase());
            const newBadge = txs.length > 0 ? `<span class="wt-new-badge">${txs.length} tx</span>` : '';
            const statusCls = w.status === 'ok' ? 'wt-status-ok' : w.status === 'loading' ? 'wt-status-loading' : w.status === 'error' ? 'wt-status-error' : 'wt-status-pending';

            // SPL token holdings for Solana
            const holdings = (w.chain === 'solana' && w.tokenHoldings?.length > 0)
                ? `<div class="wt-spl-tokens">
                    <div class="wt-spl-title">SPL Tokens (${w.tokenHoldings.length})</div>
                    <div class="wt-spl-list">${w.tokenHoldings.map(t =>
                        `<span class="wt-spl-chip" title="Mint: ${t.mint}">${t.amount >= 1e6 ? (t.amount/1e6).toFixed(1)+'M' : t.amount >= 1e3 ? (t.amount/1e3).toFixed(1)+'K' : t.amount.toFixed(2)} <small>${t.symbol}</small></span>`
                    ).join('')}</div>
                   </div>`
                : '';

            return `
            <div class="wt-wallet-card" data-wallet-id="${w.id}">
                <div class="wt-card-top">
                    <span class="wt-chain-badge" style="background:${col}">${lbl}</span>
                    <span class="wt-status-dot ${statusCls}" title="${w.status}"></span>
                    ${newBadge}
                    <button class="wt-remove-btn" onclick="walletTracker.removeWallet('${w.id}')" title="Hapus wallet">✕</button>
                </div>
                <div class="wt-card-label">${w.label}</div>
                <div class="wt-card-addr" title="${w.address}">${short(w.address)}</div>
                <div class="wt-card-bal">${bal} <span class="wt-unit">${unit}</span></div>
                ${holdings}
                <div class="wt-card-meta">Cek: ${chk}</div>
                <div class="wt-card-actions">
                    <button class="wt-refresh-btn" onclick="walletTracker.refreshSingle('${w.id}')">↻ Refresh</button>
                    <a class="wt-explorer-btn" href="${explorerUrl(w)}" target="_blank">🔗 Explorer</a>
                </div>
            </div>`;
        }).join('');
    }

    function explorerUrl(w) {
        if (w.chain === 'ethereum') return `https://etherscan.io/address/${w.address}`;
        if (w.chain === 'bsc')      return `https://bscscan.com/address/${w.address}`;
        if (w.chain === 'bitcoin')  return `https://www.blockchain.com/explorer/addresses/btc/${w.address}`;
        if (w.chain === 'solana')   return `https://solscan.io/account/${w.address}`;
        return '#';
    }

    function renderTxList() {
        const list = document.getElementById('wtTxList');
        if (!list) return;

        let txs = [...allTxs];
        if (txFilter === 'in')    txs = txs.filter(t => t.direction === 'in');
        if (txFilter === 'out')   txs = txs.filter(t => t.direction === 'out');
        if (txFilter === 'large') txs = txs.filter(t => (t.valueUsd || 0) >= LARGE_USD);

        if (txs.length === 0) {
            list.innerHTML = `<div class="wt-empty"><span style="font-size:2rem">📭</span><p>Belum ada transaksi${txFilter !== 'all' ? ' untuk filter ini' : ''}.</p></div>`;
            return;
        }

        list.innerHTML = txs.slice(0, 50).map(tx => {
            const wallet   = wallets.find(w => w.address.toLowerCase() === tx.walletAddress?.toLowerCase());
            const wLabel   = wallet ? wallet.label : short(tx.walletAddress || '');
            const dirIcon  = tx.direction === 'in' ? '⬇' : '⬆';
            const dirCls   = tx.direction === 'in' ? 'wt-tx-in' : 'wt-tx-out';
            const isLarge  = (tx.valueUsd || 0) >= LARGE_USD;
            const col      = chainColor[tx.chain] || '#888';
            const lbl      = chainLabel[tx.chain] || tx.chain;
            const txUrl    = txExplorerUrl(tx);
            const statusCls = tx.status === 'fail' ? 'wt-tx-fail' : '';
            return `
            <div class="wt-tx-card ${dirCls} ${statusCls}">
                <div class="wt-tx-left">
                    <span class="wt-tx-dir-icon">${dirIcon}</span>
                    <div class="wt-tx-info">
                        <div class="wt-tx-wallet">${wLabel} ${isLarge ? '🐋' : ''}</div>
                        <div class="wt-tx-hash"><a href="${txUrl}" target="_blank">${short(tx.hash)}</a></div>
                    </div>
                </div>
                <div class="wt-tx-center">
                    <span class="wt-chain-badge" style="background:${col};font-size:0.65rem">${lbl}</span>
                    <span class="wt-tx-value">${tx.valueFormatted}</span>
                    ${tx.valueUsd > 0 ? `<span class="wt-tx-usd">≈ $${tx.valueUsd.toLocaleString('en-US',{maximumFractionDigits:0})}</span>` : ''}
                </div>
                <div class="wt-tx-right">
                    <div class="wt-tx-time">${fmtTime(tx.timestamp)}</div>
                    ${tx.status === 'fail' ? '<span class="wt-tx-fail-badge">FAILED</span>' : ''}
                </div>
            </div>`;
        }).join('');
    }

    function txExplorerUrl(tx) {
        if (tx.chain === 'ethereum') return `https://etherscan.io/tx/${tx.hash}`;
        if (tx.chain === 'bsc')      return `https://bscscan.com/tx/${tx.hash}`;
        if (tx.chain === 'bitcoin')  return `https://www.blockchain.com/explorer/transactions/btc/${tx.hash}`;
        if (tx.chain === 'solana')   return `https://solscan.io/tx/${tx.hash}`;
        return '#';
    }

    function filterTx(filter, btn) {
        txFilter = filter;
        document.querySelectorAll('.wt-tf-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderTxList();
    }

    function updateBadge() {
        const el = document.getElementById('wtWalletCount');
        if (el) el.textContent = `${wallets.length} wallet${wallets.length !== 1 ? 's' : ''}`;
    }

    // ── API Key form ───────────────────────────────────────────
    function toggleApiForm() {
        const f = document.getElementById('wtApiForm');
        if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
    }
    function saveApiKeys() {
        const eth = document.getElementById('wtEthKey')?.value.trim();
        const bsc = document.getElementById('wtBscKey')?.value.trim();
        if (eth) localStorage.setItem('etherscanApiKey', eth);
        if (bsc) localStorage.setItem('bscscanApiKey', bsc);
        toggleApiForm();
        alert('✅ API key tersimpan!');
    }

    // ── Init ───────────────────────────────────────────────────
    function refreshSingle(id) {
        const w = wallets.find(x => x.id === id);
        if (w) refreshWallet(w);
    }

    function init() {
        load();
        renderNotifBtn();
        renderWallets();
        renderTxList();
        updateBadge();

        // Pre-fill saved API keys
        const savedEth = localStorage.getItem('etherscanApiKey');
        const savedBsc = localStorage.getItem('bscscanApiKey');
        if (savedEth) { const el = document.getElementById('wtEthKey'); if (el) el.value = savedEth; }
        if (savedBsc) { const el = document.getElementById('wtBscKey'); if (el) el.value = savedBsc; }

        // Auto-load preset wallets (added once, persisted in localStorage)
        addPresetWallet('solana', '5qZN3ZZA3iArG2nzBWT4puuvbdcryboTtv3F38m47RZz', '🪐 Jupiter Wallet');

        if (wallets.length > 0) startPolling();
        console.log('💼 Wallet Tracker initialized —', wallets.length, 'wallets');
    }

    return {
        addWallet, removeWallet, refreshAll, refreshSingle,
        filterTx, toggleApiForm, saveApiKeys,
        requestNotifPermission, init,
        previewWallet, confirmAddFromPreview,
        addPresetWallet,
    };
})();

// ═══════════════════════════════════════════════════════════════
//  DEX SCANNER MODULE  — New Tokens tab  (DEXScreener API)
// ═══════════════════════════════════════════════════════════════
const dexScanner = (() => {
    const BASE = 'https://api.dexscreener.com';
    let pairs       = [];
    let filtered    = [];
    let activeChain = 'all';
    let activeTime  = '24h';
    let sortCol     = '24h';
    let sortDir     = 'desc';
    let searchTerm  = '';
    let quickFilters= {};          // { gainers, losers }
    let modalFilters= {};
    let refreshTimer= null;
    let initialized = false;

    const fmtUsd  = (n) => n == null ? '—' : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
    const fmtNum  = (n) => n == null ? '—' : n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(n);
    const fmtPct  = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
    const pctCls  = (n) => n == null ? '' : n >= 0 ? 'positive' : 'negative';
    const fmtAge  = (ms) => {
        if (!ms) return '—';
        const s = (Date.now() - ms) / 1000;
        if (s < 3600)  return Math.floor(s/60) + 'm';
        if (s < 86400) return Math.floor(s/3600) + 'h';
        return Math.floor(s/86400) + 'd';
    };

    async function fetchLatestBoosted() {
        try {
            const res  = await fetchWithTimeout(`${BASE}/token-boosts/top/v1`, 12000);
            const json = await res.json();
            // Returns array of boosted tokens; fetch their pairs
            const tokens = Array.isArray(json) ? json.slice(0, 30) : [];
            const results = [];
            for (const t of tokens) {
                try {
                    const r = await fetchWithTimeout(`${BASE}/token-pairs/v1/${t.chainId}/${t.tokenAddress}`, 8000);
                    const d = await r.json();
                    if (Array.isArray(d)) results.push(...d.slice(0, 3));
                } catch {}
            }
            return results;
        } catch { return []; }
    }

    async function fetchByChain(chain) {
        // Search for trending pairs per chain using broad query
        const queries = ['USDC', 'USDT', 'WETH', 'WBNB', 'SOL'];
        const seen = new Set();
        const results = [];
        for (const q of queries) {
            try {
                const url = `${BASE}/latest/dex/search?q=${q}`;
                const res  = await fetchWithTimeout(url, 10000);
                const json = await res.json();
                for (const p of (json.pairs || [])) {
                    if (chain !== 'all' && p.chainId !== chain) continue;
                    if (seen.has(p.pairAddress)) continue;
                    seen.add(p.pairAddress);
                    results.push(p);
                }
            } catch {}
            if (results.length >= 200) break;
        }
        return results;
    }

    async function fetchSearch(term) {
        try {
            const res  = await fetchWithTimeout(`${BASE}/latest/dex/search?q=${encodeURIComponent(term)}`, 10000);
            const json = await res.json();
            return json.pairs || [];
        } catch { return []; }
    }

    async function load(forceRefresh = false) {
        const tbody = document.getElementById('dsxTableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="dsx-loading-row"><span class="dsx-spinner"></span> Mengambil data dari DEXScreener...</td></tr>`;

        try {
            let raw = [];
            if (searchTerm.length >= 2) {
                raw = await fetchSearch(searchTerm);
            } else if (activeChain === 'all') {
                // boosted/trending tokens across all chains
                raw = await fetchLatestBoosted();
                if (raw.length < 20) raw = [...raw, ...await fetchByChain('all')];
            } else {
                raw = await fetchByChain(activeChain);
            }

            pairs = raw;
            applyFilters();
            renderStats();
            updateLastUpdate();
        } catch (e) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="dsx-loading-row" style="color:#f87171">⚠️ Gagal memuat data: ${e.message}</td></tr>`;
        }
    }

    function applyFilters() {
        let data = [...pairs];

        // Chain filter
        if (activeChain !== 'all') data = data.filter(p => p.chainId === activeChain);

        // Search
        if (searchTerm.length >= 2) {
            const q = searchTerm.toLowerCase();
            data = data.filter(p =>
                p.baseToken?.symbol?.toLowerCase().includes(q) ||
                p.baseToken?.name?.toLowerCase().includes(q) ||
                p.pairAddress?.toLowerCase().includes(q)
            );
        }

        // Quick filters
        const pct = (p) => p.priceChange?.[activeTime] ?? null;
        if (quickFilters.gainers) data = data.filter(p => (pct(p) || 0) > 0);
        if (quickFilters.losers)  data = data.filter(p => (pct(p) || 0) < 0);

        // Modal filters
        const mf = modalFilters;
        if (mf.minLiq)   data = data.filter(p => (p.liquidity?.usd || 0) >= mf.minLiq);
        if (mf.maxLiq)   data = data.filter(p => (p.liquidity?.usd || 0) <= mf.maxLiq);
        if (mf.minMcap)  data = data.filter(p => (p.marketCap || 0) >= mf.minMcap);
        if (mf.maxMcap)  data = data.filter(p => (p.marketCap || 0) <= mf.maxMcap);
        if (mf.minFdv)   data = data.filter(p => (p.fdv || 0) >= mf.minFdv);
        if (mf.maxFdv)   data = data.filter(p => (p.fdv || 0) <= mf.maxFdv);
        if (mf.minTxns)  data = data.filter(p => ((p.txns?.h24?.buys||0)+(p.txns?.h24?.sells||0)) >= mf.minTxns);
        if (mf.maxTxns)  data = data.filter(p => ((p.txns?.h24?.buys||0)+(p.txns?.h24?.sells||0)) <= mf.maxTxns);
        if (mf.minVol)   data = data.filter(p => (p.volume?.h24 || 0) >= mf.minVol);
        if (mf.maxVol)   data = data.filter(p => (p.volume?.h24 || 0) <= mf.maxVol);
        if (mf.minAge) {
            const minMs = mf.minAge * 3600000;
            data = data.filter(p => p.pairCreatedAt && (Date.now() - p.pairCreatedAt) >= minMs);
        }
        if (mf.maxAge) {
            const maxMs = mf.maxAge * 3600000;
            data = data.filter(p => p.pairCreatedAt && (Date.now() - p.pairCreatedAt) <= maxMs);
        }
        if (mf.minPct24 != null) data = data.filter(p => (p.priceChange?.h24 || 0) >= mf.minPct24);
        if (mf.maxPct24 != null) data = data.filter(p => (p.priceChange?.h24 || 0) <= mf.maxPct24);

        // Sort
        data.sort((a, b) => {
            let av, bv;
            switch (sortCol) {
                case 'price':  av = parseFloat(a.priceUsd)||0; bv = parseFloat(b.priceUsd)||0; break;
                case 'age':    av = a.pairCreatedAt||0;         bv = b.pairCreatedAt||0; break;
                case 'txns':   av = (a.txns?.h24?.buys||0)+(a.txns?.h24?.sells||0); bv = (b.txns?.h24?.buys||0)+(b.txns?.h24?.sells||0); break;
                case 'vol':    av = a.volume?.h24||0;            bv = b.volume?.h24||0; break;
                case 'makers': av = a.txns?.h24?.buys||0;        bv = b.txns?.h24?.buys||0; break;
                case '5m':     av = a.priceChange?.m5||0;        bv = b.priceChange?.m5||0; break;
                case '1h':     av = a.priceChange?.h1||0;        bv = b.priceChange?.h1||0; break;
                case '6h':     av = a.priceChange?.h6||0;        bv = b.priceChange?.h6||0; break;
                case '24h':    av = a.priceChange?.h24||0;       bv = b.priceChange?.h24||0; break;
                case 'liq':    av = a.liquidity?.usd||0;         bv = b.liquidity?.usd||0; break;
                default:       av = a.priceChange?.h24||0;       bv = b.priceChange?.h24||0;
            }
            return sortDir === 'desc' ? bv - av : av - bv;
        });

        filtered = data;
        renderTable();
        renderActiveChips();
    }

    const CHAIN_COLOR = { solana:'#9945ff', ethereum:'#627eea', bsc:'#f3ba2f', base:'#0052ff', polygon:'#8247e5', arbitrum:'#2d374b' };
    const CHAIN_ICON  = { solana:'◎', ethereum:'⟠', bsc:'🔶', base:'🔵', polygon:'🟣', arbitrum:'🔵' };

    function renderTable() {
        const tbody = document.getElementById('dsxTableBody');
        const countEl = document.getElementById('dsxRowCount');
        if (!tbody) return;
        if (countEl) countEl.textContent = `${filtered.length} pairs`;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" class="dsx-loading-row">Tidak ada pair ditemukan. Coba ubah filter atau chain.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.slice(0, 100).map((p, i) => {
            const sym     = p.baseToken?.symbol || '?';
            const name    = p.baseToken?.name   || '';
            const quote   = p.quoteToken?.symbol || '';
            const price   = parseFloat(p.priceUsd) || 0;
            const priceFmt= price >= 1 ? `$${price.toLocaleString('en-US',{maximumFractionDigits:4})}` : `$${price.toFixed(price < 0.0001 ? 8 : 6)}`;
            const age     = fmtAge(p.pairCreatedAt);
            const txns24  = (p.txns?.h24?.buys||0) + (p.txns?.h24?.sells||0);
            const vol24   = p.volume?.h24;
            const makers  = p.txns?.h24?.buys || 0;
            const pct5m   = p.priceChange?.m5;
            const pct1h   = p.priceChange?.h1;
            const pct6h   = p.priceChange?.h6;
            const pct24h  = p.priceChange?.h24;
            const liq     = p.liquidity?.usd;
            const chain   = p.chainId || '';
            const dex     = p.dexId   || '';
            const cCol    = CHAIN_COLOR[chain] || '#64748b';
            const cIcon   = CHAIN_ICON[chain] || '🔗';
            const boosts  = p.boosts?.active;
            const boostTag= boosts ? `<span class="dsx-boost-tag">⚡${boosts}</span>` : '';
            const img     = p.info?.imageUrl ? `<img src="${p.info.imageUrl}" class="dsx-token-img" onerror="this.style.display='none'">` : `<span class="dsx-token-img dsx-token-placeholder">${sym.charAt(0)}</span>`;

            return `<tr class="dsx-row" onclick="dexAnalyzer.analyzeFromPair('${p.chainId}','${p.baseToken?.address || ''}','${sym}')" title="Klik untuk analisa mendalam">
                <td class="dsx-td-num">${i+1}</td>
                <td class="dsx-td-token">
                    ${img}
                    <div class="dsx-token-info">
                        <span class="dsx-token-sym">${sym} ${boostTag}</span>
                        <span class="dsx-token-pair"><span style="color:${cCol}">${cIcon}</span> ${dex.toUpperCase()} · ${sym}/${quote}</span>
                    </div>
                </td>
                <td class="dsx-td-price">${priceFmt}</td>
                <td class="dsx-td-age">${age}</td>
                <td class="dsx-td-txns">${fmtNum(txns24)}</td>
                <td class="dsx-td-vol">${fmtUsd(vol24)}</td>
                <td class="dsx-td-makers">${fmtNum(makers)}</td>
                <td class="dsx-td-pct ${pctCls(pct5m)}">${fmtPct(pct5m)}</td>
                <td class="dsx-td-pct ${pctCls(pct1h)}">${fmtPct(pct1h)}</td>
                <td class="dsx-td-pct ${pctCls(pct6h)}">${fmtPct(pct6h)}</td>
                <td class="dsx-td-pct ${pctCls(pct24h)}">${fmtPct(pct24h)}</td>
                <td class="dsx-td-liq">${fmtUsd(liq)}</td>
            </tr>`;
        }).join('');
    }

    function renderStats() {
        const totalVol  = pairs.reduce((s, p) => s + (p.volume?.h24 || 0), 0);
        const totalTxns = pairs.reduce((s, p) => s + (p.txns?.h24?.buys||0) + (p.txns?.h24?.sells||0), 0);
        const topGainer = [...pairs].sort((a,b)=>(b.priceChange?.h24||0)-(a.priceChange?.h24||0))[0];

        const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        el('dsxTotalVol',  fmtUsd(totalVol));
        el('dsxTotalTxns', fmtNum(totalTxns));
        el('dsxPairCount', pairs.length);
        el('dsxTopGainer', topGainer ? `${topGainer.baseToken?.symbol} ${fmtPct(topGainer.priceChange?.h24)}` : '—');
    }

    function updateLastUpdate() {
        const el = document.getElementById('dsxLastUpdate');
        if (el) el.textContent = 'Updated: ' + new Date().toLocaleTimeString('id-ID');
    }

    function renderActiveChips() {
        const el = document.getElementById('dsxActiveChips');
        if (!el) return;
        const chips = [];
        const mf = modalFilters;
        if (mf.minLiq)  chips.push(`Liq ≥ ${fmtUsd(mf.minLiq)}`);
        if (mf.maxMcap) chips.push(`MCap ≤ ${fmtUsd(mf.maxMcap)}`);
        if (mf.minTxns) chips.push(`Txns ≥ ${mf.minTxns}`);
        if (mf.minVol)  chips.push(`Vol ≥ ${fmtUsd(mf.minVol)}`);
        if (mf.minPct24 != null) chips.push(`24H ≥ ${mf.minPct24}%`);
        el.innerHTML = chips.map(c => `<span class="dsx-active-chip">${c} <button onclick="dexScanner.clearChip('${c}')">✕</button></span>`).join('');

        const cnt = document.getElementById('dsxFilterCount');
        const total = Object.keys(mf).filter(k => mf[k] != null && mf[k] !== '').length;
        if (cnt) { cnt.textContent = total; cnt.style.display = total > 0 ? 'inline' : 'none'; }
    }

    function toggleQuick(type, btn) {
        quickFilters[type] = !quickFilters[type];
        if (type === 'gainers' && quickFilters.gainers) quickFilters.losers = false;
        if (type === 'losers'  && quickFilters.losers)  quickFilters.gainers = false;
        document.querySelectorAll('.dsx-qf-chip').forEach(b => b.classList.remove('active'));
        if (quickFilters.gainers) document.getElementById('dsxGainersBtn')?.classList.add('active');
        if (quickFilters.losers)  document.getElementById('dsxLosersBtn')?.classList.add('active');
        applyFilters();
    }

    function setChain(chain, btn) {
        activeChain = chain;
        document.querySelectorAll('.dsx-chain-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        load();
    }

    function openFilterModal()  { const m = document.getElementById('dsxModalOverlay'); if (m) m.style.display = 'flex'; }
    function closeFilterModal() { const m = document.getElementById('dsxModalOverlay'); if (m) m.style.display = 'none'; }

    function applyModalFilters() {
        const num = (id) => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? null : v; };
        modalFilters = {
            minLiq:   num('dsfMinLiq'),   maxLiq:   num('dsfMaxLiq'),
            minMcap:  num('dsfMinMcap'),  maxMcap:  num('dsfMaxMcap'),
            minFdv:   num('dsfMinFdv'),   maxFdv:   num('dsfMaxFdv'),
            minAge:   num('dsfMinAge'),   maxAge:   num('dsfMaxAge'),
            minTxns:  num('dsfMinTxns'),  maxTxns:  num('dsfMaxTxns'),
            minVol:   num('dsfMinVol'),   maxVol:   num('dsfMaxVol'),
            minPct24: num('dsfMinPct24'), maxPct24: num('dsfMaxPct24'),
        };
        closeFilterModal();
        applyFilters();
    }

    function resetModalFilters() {
        modalFilters = {};
        ['dsfMinLiq','dsfMaxLiq','dsfMinMcap','dsfMaxMcap','dsfMinFdv','dsfMaxFdv',
         'dsfMinAge','dsfMaxAge','dsfMinTxns','dsfMaxTxns','dsfMinVol','dsfMaxVol',
         'dsfMinPct24','dsfMaxPct24'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        applyFilters();
    }

    function clearChip() { resetModalFilters(); }

    function setupEventListeners() {
        // Chain tabs
        document.querySelectorAll('.dsx-chain-btn').forEach(btn => {
            btn.addEventListener('click', () => setChain(btn.dataset.chain, btn));
        });
        // Table header sort
        document.querySelectorAll('#dsxTable th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (sortCol === col) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
                else { sortCol = col; sortDir = 'desc'; }
                document.querySelectorAll('#dsxTable th').forEach(t => t.classList.remove('dsx-sort-active'));
                th.classList.add('dsx-sort-active');
                th.textContent = th.textContent.replace(/ [↑↓]/, '') + (sortDir === 'desc' ? ' ↓' : ' ↑');
                applyFilters();
            });
        });
        // Search
        const srch = document.getElementById('dsxSearch');
        if (srch) {
            srch.addEventListener('input', (e) => {
                searchTerm = e.target.value.trim();
                if (searchTerm.length >= 2) load();
                else applyFilters();
            });
        }
        // Time dropdown
        document.querySelectorAll('#dsxTimeDropdown button').forEach(btn => {
            btn.addEventListener('click', () => {
                activeTime = btn.dataset.time;
                const chip = document.querySelector('.dsx-tf-chip');
                if (chip) chip.textContent = `⏱ Last ${activeTime} ▾`;
                document.getElementById('dsxTimeDropdown').style.display = 'none';
                applyFilters();
            });
        });
        document.querySelector('.dsx-tf-chip')?.addEventListener('click', () => {
            const dd = document.getElementById('dsxTimeDropdown');
            if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
        });
    }

    function init() {
        if (!initialized) {
            setupEventListeners();
            initialized = true;
        }
        if (pairs.length === 0) load();
        // Auto-refresh every 30s
        if (!refreshTimer) refreshTimer = setInterval(() => load(), 30000);
    }

    return { init, load, toggleQuick, setChain, openFilterModal, closeFilterModal, applyModalFilters, resetModalFilters, clearChip };
})();


// ═══════════════════════════════════════════════════════════════
//  DEX ANALYZER MODULE  — DEXScreener-style live table
//  Row click → slide-in deep analysis panel
//  Liquidity · Holder Distribution · Contract Safety · LP Lock
//  + AI Buy Recommendation  + Web3 Trading integration
// ═══════════════════════════════════════════════════════════════
const dexAnalyzer = (() => {
    const DSX = 'https://api.dexscreener.com';
    const GPS = 'https://api.gopluslabs.io/api/v1';

    // ── State ──────────────────────────────────────────────────
    let pairs        = [];
    let filtered     = [];
    let activeChain  = 'all';
    let activeTime   = '24h';
    let sortCol      = '24h';
    let sortDir      = 'desc';
    let searchTerm   = '';
    let quickFilters = {};
    let modalFilters = {};
    let refreshTimer = null;
    let initialized  = false;
    let currentPair  = null;   // pair currently open in panel
    let currentPage  = 1;
    const PAGE_SIZE  = 20;

    // ── Format helpers ─────────────────────────────────────────
    const fmtUsd = (n) => n == null ? '—' : n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(1)}K` : `$${parseFloat(n).toFixed(2)}`;
    const fmtNum = (n) => n == null ? '—' : n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(n);
    const fmtPct = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + parseFloat(n).toFixed(2) + '%';
    const pctCls = (n) => n == null ? '' : n >= 0 ? 'positive' : 'negative';
    const fmtAge = (ms) => { if (!ms) return '—'; const s = (Date.now()-ms)/1000; if (s<3600) return Math.floor(s/60)+'m'; if (s<86400) return Math.floor(s/3600)+'h'; return Math.floor(s/86400)+'d'; };
    const priceFmt = (p) => { const n=parseFloat(p)||0; return n>=1 ? `$${n.toLocaleString('en-US',{maximumFractionDigits:4})}` : `$${n.toFixed(n<0.0001?8:6)}`; };

    const check = (b) => b ? '<span class="dxa-check">✅</span>' : '<span class="dxa-cross">❌</span>';
    const warn  = (t) => `<span class="dxa-warn">⚠️ ${t}</span>`;

    const CHAIN_COLOR = { solana:'#9945ff', ethereum:'#627eea', bsc:'#f3ba2f', base:'#0052ff', polygon:'#8247e5', arbitrum:'#28a0f0' };
    const CHAIN_ICON  = { solana:'◎', ethereum:'⟠', bsc:'🔶', base:'🔵', polygon:'🟣', arbitrum:'🔷' };

    // ── Fetch ──────────────────────────────────────────────────
    async function fetchLatestBoosted() {
        try {
            const res = await fetchWithTimeout(`${DSX}/token-boosts/top/v1`, 12000);
            const json = await res.json();
            const tokens = Array.isArray(json) ? json.slice(0, 30) : [];
            const results = [];
            for (const t of tokens) {
                try {
                    const r = await fetchWithTimeout(`${DSX}/token-pairs/v1/${t.chainId}/${t.tokenAddress}`, 8000);
                    const d = await r.json();
                    if (Array.isArray(d)) results.push(...d.slice(0, 3));
                } catch {}
            }
            return results;
        } catch { return []; }
    }

    async function fetchByChain(chain) {
        const queries = ['USDC', 'USDT', 'WETH', 'WBNB', 'SOL'];
        const seen = new Set();
        const results = [];
        for (const q of queries) {
            try {
                const res = await fetchWithTimeout(`${DSX}/latest/dex/search?q=${q}`, 10000);
                const json = await res.json();
                for (const p of (json.pairs || [])) {
                    if (chain !== 'all' && p.chainId !== chain) continue;
                    if (seen.has(p.pairAddress)) continue;
                    seen.add(p.pairAddress);
                    results.push(p);
                }
            } catch {}
            if (results.length >= 200) break;
        }
        return results;
    }

    async function fetchSearch(term) {
        try {
            const res = await fetchWithTimeout(`${DSX}/latest/dex/search?q=${encodeURIComponent(term)}`, 10000);
            const json = await res.json();
            return json.pairs || [];
        } catch { return []; }
    }

    async function fetchTokenPairs(chain, addressOrName) {
        const isEVMAddr = /^0x[0-9a-fA-F]{40}$/.test(addressOrName);
        const isSolAddr = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addressOrName);
        if (isEVMAddr || isSolAddr) {
            try {
                const res = await fetchWithTimeout(`${DSX}/token-pairs/v1/${chain}/${addressOrName}`, 6000);
                const json = await res.json();
                if (Array.isArray(json) && json.length > 0) return json;
            } catch {}
        }
        try {
            const res = await fetchWithTimeout(`${DSX}/latest/dex/search?q=${encodeURIComponent(addressOrName)}`, 6000);
            const json = await res.json();
            return (json.pairs || []).filter(p => chain === 'all' || p.chainId === chain).slice(0, 20);
        } catch { return []; }
    }

    async function fetchGoPlus(chain, address) {
        const chainMap = { ethereum:'1', bsc:'56', polygon:'137', arbitrum:'42161', base:'8453' };
        const chainId = chainMap[chain];
        if (!chainId || !address || !/^0x/.test(address)) return null;
        try {
            const res = await fetchWithTimeout(`${GPS}/token_security/${chainId}?contract_addresses=${address}`, 5000);
            const json = await res.json();
            return json.result?.[address.toLowerCase()] || null;
        } catch { return null; }
    }

    // ── Load table ─────────────────────────────────────────────
    async function load(forceRefresh = false) {
        const tbody = document.getElementById('dxaTableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="dsx-loading-row"><span class="dsx-spinner"></span> Mengambil data dari DEXScreener...</td></tr>`;
        try {
            let raw = [];
            if (searchTerm.length >= 2) {
                raw = await fetchSearch(searchTerm);
            } else if (activeChain === 'all') {
                raw = await fetchLatestBoosted();
                if (raw.length < 20) raw = [...raw, ...await fetchByChain('all')];
            } else {
                raw = await fetchByChain(activeChain);
            }
            pairs = raw;
            applyFilters();
            renderStats();
            updateLastUpdate();
        } catch (e) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="12" class="dsx-loading-row" style="color:#f87171">⚠️ Gagal memuat data: ${e.message}</td></tr>`;
        }
    }

    // ── Filter + sort ──────────────────────────────────────────
    function applyFilters() {
        let data = [...pairs];
        if (activeChain !== 'all') data = data.filter(p => p.chainId === activeChain);
        if (searchTerm.length >= 2) {
            const q = searchTerm.toLowerCase();
            data = data.filter(p => p.baseToken?.symbol?.toLowerCase().includes(q) || p.baseToken?.name?.toLowerCase().includes(q) || p.pairAddress?.toLowerCase().includes(q));
        }
        const pctKey = { '5m':'m5', '1h':'h1', '6h':'h6', '24h':'h24' }[activeTime] || 'h24';
        if (quickFilters.gainers) data = data.filter(p => (p.priceChange?.[pctKey] || 0) > 0);
        if (quickFilters.losers)  data = data.filter(p => (p.priceChange?.[pctKey] || 0) < 0);
        const mf = modalFilters;
        if (mf.minLiq)   data = data.filter(p => (p.liquidity?.usd||0) >= mf.minLiq);
        if (mf.maxLiq)   data = data.filter(p => (p.liquidity?.usd||0) <= mf.maxLiq);
        if (mf.minMcap)  data = data.filter(p => (p.marketCap||0) >= mf.minMcap);
        if (mf.maxMcap)  data = data.filter(p => (p.marketCap||0) <= mf.maxMcap);
        if (mf.minTxns)  data = data.filter(p => ((p.txns?.h24?.buys||0)+(p.txns?.h24?.sells||0)) >= mf.minTxns);
        if (mf.maxTxns)  data = data.filter(p => ((p.txns?.h24?.buys||0)+(p.txns?.h24?.sells||0)) <= mf.maxTxns);
        if (mf.minVol)   data = data.filter(p => (p.volume?.h24||0) >= mf.minVol);
        if (mf.maxVol)   data = data.filter(p => (p.volume?.h24||0) <= mf.maxVol);
        if (mf.minAge)   data = data.filter(p => p.pairCreatedAt && (Date.now()-p.pairCreatedAt) >= mf.minAge*3600000);
        if (mf.maxAge)   data = data.filter(p => p.pairCreatedAt && (Date.now()-p.pairCreatedAt) <= mf.maxAge*3600000);
        if (mf.minPct24 != null) data = data.filter(p => (p.priceChange?.h24||0) >= mf.minPct24);
        if (mf.maxPct24 != null) data = data.filter(p => (p.priceChange?.h24||0) <= mf.maxPct24);

        data.sort((a, b) => {
            let av, bv;
            switch (sortCol) {
                case 'price':  av=parseFloat(a.priceUsd)||0;   bv=parseFloat(b.priceUsd)||0; break;
                case 'age':    av=a.pairCreatedAt||0;           bv=b.pairCreatedAt||0; break;
                case 'txns':   av=(a.txns?.h24?.buys||0)+(a.txns?.h24?.sells||0); bv=(b.txns?.h24?.buys||0)+(b.txns?.h24?.sells||0); break;
                case 'vol':    av=a.volume?.h24||0;             bv=b.volume?.h24||0; break;
                case 'makers': av=a.txns?.h24?.buys||0;         bv=b.txns?.h24?.buys||0; break;
                case '5m':     av=a.priceChange?.m5||0;         bv=b.priceChange?.m5||0; break;
                case '1h':     av=a.priceChange?.h1||0;         bv=b.priceChange?.h1||0; break;
                case '6h':     av=a.priceChange?.h6||0;         bv=b.priceChange?.h6||0; break;
                case '24h':    av=a.priceChange?.h24||0;        bv=b.priceChange?.h24||0; break;
                case 'liq':    av=a.liquidity?.usd||0;          bv=b.liquidity?.usd||0; break;
                default:       av=a.priceChange?.h24||0;        bv=b.priceChange?.h24||0;
            }
            return sortDir === 'desc' ? bv - av : av - bv;
        });
        filtered = data;
        currentPage = 1;
        renderTable();
        renderActiveChips();
    }

    // ── Render table ───────────────────────────────────────────
    function renderTable() {
        const tbody = document.getElementById('dxaTableBody');
        const countEl = document.getElementById('dxaRowCount');
        if (!tbody) return;
        if (countEl) countEl.textContent = `${filtered.length} pairs`;
        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" class="dsx-loading-row">Tidak ada pair. Ubah filter atau chain.</td></tr>`;
            renderPagination();
            return;
        }
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        if (currentPage > totalPages) currentPage = 1;
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageData = filtered.slice(start, start + PAGE_SIZE);

        tbody.innerHTML = pageData.map((p, i) => {
            const sym   = p.baseToken?.symbol || '?';
            const quote = p.quoteToken?.symbol || '';
            const price = priceFmt(p.priceUsd);
            const age   = fmtAge(p.pairCreatedAt);
            const txns24= (p.txns?.h24?.buys||0)+(p.txns?.h24?.sells||0);
            const chain = p.chainId || '';
            const dex   = p.dexId   || '';
            const cCol  = CHAIN_COLOR[chain] || '#64748b';
            const cIcon = CHAIN_ICON[chain]  || '🔗';
            const boosts= p.boosts?.active;
            const btag  = boosts ? `<span class="dsx-boost-tag">⚡${boosts}</span>` : '';
            const img   = p.info?.imageUrl
                ? `<img src="${p.info.imageUrl}" class="dsx-token-img" onerror="this.style.display='none'">`
                : `<span class="dsx-token-img dsx-token-placeholder">${sym.charAt(0)}</span>`;
            const addr  = p.baseToken?.address || '';
            return `<tr class="dsx-row" onclick="dexAnalyzer.openPanel('${p.chainId}','${addr}','${sym.replace(/'/g,"\\'")}','${p.pairAddress||''}')" title="Klik untuk analisa mendalam + trading">
                <td class="dsx-td-num">${start + i + 1}</td>
                <td class="dsx-td-token">${img}<div class="dsx-token-info">
                    <span class="dsx-token-sym">${sym} ${btag}</span>
                    <span class="dsx-token-pair"><span style="color:${cCol}">${cIcon}</span> ${dex.toUpperCase()} · ${sym}/${quote}</span>
                </div></td>
                <td class="dsx-td-price">${price}</td>
                <td class="dsx-td-age">${age}</td>
                <td class="dsx-td-txns">${fmtNum(txns24)}</td>
                <td class="dsx-td-vol">${fmtUsd(p.volume?.h24)}</td>
                <td class="dsx-td-makers">${fmtNum(p.txns?.h24?.buys||0)}</td>
                <td class="dsx-td-pct ${pctCls(p.priceChange?.m5)}">${fmtPct(p.priceChange?.m5)}</td>
                <td class="dsx-td-pct ${pctCls(p.priceChange?.h1)}">${fmtPct(p.priceChange?.h1)}</td>
                <td class="dsx-td-pct ${pctCls(p.priceChange?.h6)}">${fmtPct(p.priceChange?.h6)}</td>
                <td class="dsx-td-pct ${pctCls(p.priceChange?.h24)}">${fmtPct(p.priceChange?.h24)}</td>
                <td class="dsx-td-liq">${fmtUsd(p.liquidity?.usd)}</td>
            </tr>`;
        }).join('');
        renderPagination();
    }

    function renderPagination() {
        const el = document.getElementById('dxaPagination');
        if (!el) return;
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        if (totalPages <= 1) { el.innerHTML = ''; return; }

        const maxBtn = 7;
        let pages = [];
        if (totalPages <= maxBtn) {
            pages = Array.from({length: totalPages}, (_, i) => i + 1);
        } else {
            pages = [1];
            let start = Math.max(2, currentPage - 2);
            let end   = Math.min(totalPages - 1, currentPage + 2);
            if (start > 2) pages.push('…');
            for (let i = start; i <= end; i++) pages.push(i);
            if (end < totalPages - 1) pages.push('…');
            pages.push(totalPages);
        }

        el.innerHTML = `
        <button class="dxa-pg-btn" ${currentPage===1?'disabled':''} onclick="dexAnalyzer.goPage(${currentPage-1})">‹</button>
        ${pages.map(p => p === '…'
            ? `<span class="dxa-pg-ellipsis">…</span>`
            : `<button class="dxa-pg-btn ${p===currentPage?'active':''}" onclick="dexAnalyzer.goPage(${p})">${p}</button>`
        ).join('')}
        <button class="dxa-pg-btn" ${currentPage===totalPages?'disabled':''} onclick="dexAnalyzer.goPage(${currentPage+1})">›</button>
        <span class="dxa-pg-info">Halaman ${currentPage} / ${totalPages} · ${filtered.length} pairs</span>`;
    }

    function goPage(page) {
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        renderTable();
        // Scroll table into view
        document.getElementById('dxaTable')?.scrollIntoView({behavior:'smooth', block:'start'});
    }

    function renderStats() {
        const totalVol  = pairs.reduce((s,p)=>s+(p.volume?.h24||0), 0);
        const totalTxns = pairs.reduce((s,p)=>s+(p.txns?.h24?.buys||0)+(p.txns?.h24?.sells||0), 0);
        const topGainer = [...pairs].sort((a,b)=>(b.priceChange?.h24||0)-(a.priceChange?.h24||0))[0];
        const el = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
        el('dxaTotalVol',  fmtUsd(totalVol));
        el('dxaTotalTxns', fmtNum(totalTxns));
        el('dxaPairCount', pairs.length);
        el('dxaTopGainer', topGainer ? `${topGainer.baseToken?.symbol} ${fmtPct(topGainer.priceChange?.h24)}` : '—');
    }

    function updateLastUpdate() {
        const el = document.getElementById('dxaLastUpdate');
        if (el) el.textContent = 'Updated: ' + new Date().toLocaleTimeString('id-ID');
    }

    function renderActiveChips() {
        const el = document.getElementById('dxaActiveChips');
        if (!el) return;
        const mf = modalFilters;
        const chips = [];
        if (mf.minLiq)  chips.push(`Liq ≥ ${fmtUsd(mf.minLiq)}`);
        if (mf.maxMcap) chips.push(`MCap ≤ ${fmtUsd(mf.maxMcap)}`);
        if (mf.minTxns) chips.push(`Txns ≥ ${mf.minTxns}`);
        if (mf.minVol)  chips.push(`Vol ≥ ${fmtUsd(mf.minVol)}`);
        if (mf.minPct24 != null) chips.push(`24H ≥ ${mf.minPct24}%`);
        el.innerHTML = chips.map(c=>`<span class="dsx-active-chip">${c} <button onclick="dexAnalyzer.resetModalFilters()">✕</button></span>`).join('');
        const cnt = document.getElementById('dxaFilterCount');
        const total = Object.keys(mf).filter(k=>mf[k]!=null&&mf[k]!=='').length;
        if (cnt) { cnt.textContent=total; cnt.style.display=total>0?'inline':'none'; }
    }

    // ── Quick filters ──────────────────────────────────────────
    function toggleQuick(type, btn) {
        quickFilters[type] = !quickFilters[type];
        if (type==='gainers' && quickFilters.gainers) quickFilters.losers = false;
        if (type==='losers'  && quickFilters.losers)  quickFilters.gainers = false;
        document.querySelectorAll('#dexAnalyzer .dsx-qf-chip, #dxa-analyzer .dsx-qf-chip').forEach(b=>b.classList.remove('active'));
        if (quickFilters.gainers) document.getElementById('dxaGainersBtn')?.classList.add('active');
        if (quickFilters.losers)  document.getElementById('dxaLosersBtn')?.classList.add('active');
        applyFilters();
    }

    // ── Filter modal ───────────────────────────────────────────
    function openFilterModal()  { const m=document.getElementById('dxaModalOverlay'); if(m) m.style.display='flex'; }
    function closeFilterModal() { const m=document.getElementById('dxaModalOverlay'); if(m) m.style.display='none'; }

    function applyModalFilters() {
        const num = (id) => { const v=parseFloat(document.getElementById(id)?.value); return isNaN(v)?null:v; };
        modalFilters = {
            minLiq:num('dxafMinLiq'), maxLiq:num('dxafMaxLiq'),
            minMcap:num('dxafMinMcap'), maxMcap:num('dxafMaxMcap'),
            minAge:num('dxafMinAge'), maxAge:num('dxafMaxAge'),
            minTxns:num('dxafMinTxns'), maxTxns:num('dxafMaxTxns'),
            minVol:num('dxafMinVol'), maxVol:num('dxafMaxVol'),
            minPct24:num('dxafMinPct24'), maxPct24:num('dxafMaxPct24'),
        };
        closeFilterModal();
        applyFilters();
    }

    function resetModalFilters() {
        modalFilters = {};
        ['dxafMinLiq','dxafMaxLiq','dxafMinMcap','dxafMaxMcap','dxafMinAge','dxafMaxAge',
         'dxafMinTxns','dxafMaxTxns','dxafMinVol','dxafMaxVol','dxafMinPct24','dxafMaxPct24']
            .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
        applyFilters();
    }

    // ── Side Panel ─────────────────────────────────────────────
    async function openPanel(chain, address, symbol, pairAddress) {
        // Show panel immediately
        document.getElementById('dxaPanel').classList.add('open');
        document.getElementById('dxaPanelOverlay').classList.add('visible');
        document.getElementById('dxaPanelTitle').textContent = `🔬 ${symbol}`;

        // Default ke tab Chart saat panel dibuka
        switchInnerTab('chart');

        // Reset chart area
        const tvWrap = document.getElementById('dxaTVWidget');
        if (tvWrap) tvWrap.innerHTML = '';
        const chartLoading = document.getElementById('dxaChartLoading');
        if (chartLoading) chartLoading.style.display = 'flex';

        // Show loading state di Info tab
        document.getElementById('dxaIdentity').innerHTML = '';
        document.getElementById('dxaScoreBar').innerHTML = `<div class="dxa-panel-loading-inline"><span class="dsx-spinner"></span> Mengambil data & menganalisa ${symbol}...</div>`;
        ['dxaLiqBody','dxaHolderBody','dxaContractBody','dxaLpBody'].forEach(id=>{const e=document.getElementById(id);if(e)e.innerHTML='<span style="color:#475569">Loading...</span>';});
        document.getElementById('dxaRecommendation').innerHTML = '';
        document.getElementById('dxaPairsBody').innerHTML = '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:12px"><span class="dsx-spinner"></span></td></tr>';

        // ── Show trade bar IMMEDIATELY with basic info so user can trade right away ──
        const tradeBar = document.getElementById('dxaTradeBar');
        if (tradeBar) {
            tradeBar.style.display = 'flex';
            const dexLink = document.getElementById('dxaDexLink');
            // Set preliminary DEXScreener link using whatever address/symbol we have now
            if (dexLink) {
                const q = address || symbol;
                dexLink.href = `https://dexscreener.com/${chain}/${q}`;
            }
        }
        // Pre-set current token with partial data so openSwap() can be called immediately
        currentPair = { best: { priceUsd: '…', pairAddress: pairAddress || '', url: null },
                        token: { symbol, address: address || '' }, chain, address: address || '' };
        web3Trading.setCurrentToken(currentPair);

        // ── Fire GoPlus in background (don't block trade bar) ──
        const gpPromise = fetchGoPlus(chain, address);

        // ── Fetch token pairs first (fastest, needed for full analysis) ──
        const tokenPairs = await fetchTokenPairs(chain, address || symbol).catch(() => []);

        if (tokenPairs.length === 0) {
            document.getElementById('dxaScoreBar').innerHTML = `<div style="color:#f87171;padding:12px">⚠️ Token tidak ditemukan di chain ${chain}.</div>`;
            // Trade bar already visible — keep it so user can still try open DEXScreener
            return;
        }

        const best  = [...tokenPairs].sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0))[0];
        const token = best.baseToken;
        const price = parseFloat(best.priceUsd) || 0;
        currentPair = { best, token, chain, address: token?.address || address };

        // Update trade bar & DEXScreener link with real data
        if (tradeBar) {
            const dexLink = document.getElementById('dxaDexLink');
            if (dexLink) dexLink.href = best.url || `https://dexscreener.com/${chain}/${best.pairAddress}`;
        }
        web3Trading.setCurrentToken(currentPair);

        // Show Jupiter Swap button for Solana tokens
        const jupBtn = document.getElementById('dxaJupiterSwapBtn');
        if (jupBtn) jupBtn.style.display = chain === 'solana' ? 'inline-flex' : 'none';

        // Render identity (no need to wait for GoPlus)
        _renderIdentity(best, token, price);

        // ── Render chart now that we have the real pairAddress ──
        _renderChart();

        // ── Now wait for GoPlus (already running in background, max 5s) ──
        const gp = await gpPromise.catch(() => null);

        // Scores
        const liqScore      = _analyzeLiquidity(tokenPairs, best);
        const holderScore   = _analyzeHolders(gp);
        const contractScore = _analyzeContract(gp);
        const lpScore       = _analyzeLpLock(gp, best);
        const totalScore    = liqScore.score + holderScore.score + contractScore.score + lpScore.score;

        _renderScoreBar(totalScore, liqScore, holderScore, contractScore, lpScore);

        document.getElementById('dxaLiqBody').innerHTML      = liqScore.html;
        document.getElementById('dxaHolderBody').innerHTML   = holderScore.html;
        document.getElementById('dxaContractBody').innerHTML = contractScore.html;
        document.getElementById('dxaLpBody').innerHTML       = lpScore.html;

        [['dxaLiqCard',liqScore.score],['dxaHolderCard',holderScore.score],['dxaContractCard',contractScore.score],['dxaLpCard',lpScore.score]].forEach(([id,sc])=>{
            const el=document.getElementById(id); if(!el) return;
            el.className='dxa-card '+(sc>=20?'dxa-card-good':sc>=10?'dxa-card-warn':'dxa-card-bad');
        });

        _renderRecommendation(totalScore, best, price, liqScore, holderScore, contractScore, lpScore);
        _renderPairsTable(tokenPairs);

        // ── Pass data to AI Hedge Fund Analyst ──
        if (typeof hedgeFundAI !== 'undefined') {
            hedgeFundAI.setContext(best, gp, liqScore, holderScore, contractScore, lpScore, tokenPairs);
        }
    }

    function closePanel() {
        document.getElementById('dxaPanel')?.classList.remove('open');
        document.getElementById('dxaPanelOverlay')?.classList.remove('visible');
        currentPair = null;
        // Destroy chart widget to free memory
        const tv = document.getElementById('dxaTVWidget');
        if (tv) tv.innerHTML = '';
        // Hide Jupiter swap button
        const jupBtn = document.getElementById('dxaJupiterSwapBtn');
        if (jupBtn) jupBtn.style.display = 'none';
    }

    // ── Inner tab switching ────────────────────────────────────
    let _chartInterval = '60';
    let _chartSource   = 'dexscreener';

    function switchInnerTab(tab) {
        document.querySelectorAll('.dxa-inner-tab').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-dxtab') === tab);
        });
        const tabIdMap = { chart: 'dxaTabChart', info: 'dxaTabInfo', ai: 'dxaTabAi' };
        document.querySelectorAll('.dxa-inner-panel').forEach(p => {
            p.classList.toggle('active', p.id === (tabIdMap[tab] || 'dxaTabInfo'));
        });
        // Render chart when switching to chart tab
        if (tab === 'chart' && currentPair) _renderChart();
        // Restore API key from session when switching to AI tab
        if (tab === 'ai') {
            const keyEl = document.getElementById('hfaiKeyInput');
            if (keyEl && !keyEl.value) {
                const saved = sessionStorage.getItem('hf_gemini_key') || '';
                if (saved) keyEl.value = saved;
            }
        }
    }

    // ── Chart rendering ────────────────────────────────────────
    function _renderChart() {
        const wrap    = document.getElementById('dxaTVWidget');
        const loading = document.getElementById('dxaChartLoading');
        if (!wrap || !currentPair) return;

        const pairAddr = currentPair.best?.pairAddress || '';
        const chain    = currentPair.chain || 'ethereum';
        const symbol   = currentPair.token?.symbol || '';
        const address  = currentPair.address || '';

        if (loading) loading.style.display = 'flex';
        wrap.innerHTML = '';

        if (_chartSource === 'dexscreener') {
            // DEXScreener embeddable chart iframe
            const chainSlug = chain === 'bsc' ? 'bsc'
                            : chain === 'solana' ? 'solana'
                            : chain === 'arbitrum' ? 'arbitrum'
                            : chain === 'polygon' ? 'polygon'
                            : chain === 'base' ? 'base'
                            : 'ethereum';
            const pairOrAddr = pairAddr || address;
            const src = `https://dexscreener.com/${chainSlug}/${pairOrAddr}?embed=1&theme=dark&trades=0&info=0`;
            const iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.style.cssText = 'width:100%;height:100%;border:none;display:block';
            iframe.allow = 'clipboard-write';
            iframe.onload = () => { if (loading) loading.style.display = 'none'; };
            wrap.appendChild(iframe);

        } else {
            // TradingView widget — works for tokens listed on major exchanges
            // For DEX tokens, fallback to DEXScreener if TV symbol not found
            if (loading) loading.style.display = 'none';
            const tvSymbol = _buildTVSymbol(symbol, chain);
            wrap.innerHTML = `
            <div class="tradingview-widget-container" style="height:100%;width:100%">
                <div id="tradingview_chart" style="height:100%;width:100%"></div>
                <script type="text/javascript">
                new TradingView.widget({
                    "autosize": true,
                    "symbol": "${tvSymbol}",
                    "interval": "${_chartInterval}",
                    "timezone": "Asia/Jakarta",
                    "theme": "dark",
                    "style": "1",
                    "locale": "id",
                    "toolbar_bg": "#0d1117",
                    "enable_publishing": false,
                    "hide_top_toolbar": false,
                    "hide_legend": false,
                    "save_image": false,
                    "container_id": "tradingview_chart",
                    "studies": ["RSI@tv-basicstudies","MACD@tv-basicstudies","BB@tv-basicstudies"]
                });
                <\/script>
            </div>`;
            // Load TradingView library if not loaded
            if (!window.TradingView) {
                const s = document.createElement('script');
                s.src   = 'https://s3.tradingview.com/tv.js';
                s.onload = () => { wrap.querySelector('script') && eval(wrap.querySelector('script').textContent); };
                document.head.appendChild(s);
            }
        }
    }

    function _buildTVSymbol(symbol, chain) {
        // Map common DEX tokens to TradingView symbols
        const map = {
            'BTC':'BINANCE:BTCUSDT', 'ETH':'BINANCE:ETHUSDT',
            'BNB':'BINANCE:BNBUSDT', 'SOL':'BINANCE:SOLUSDT',
            'MATIC':'BINANCE:MATICUSDT', 'ARB':'BINANCE:ARBUSDT',
            'BASE':'COINBASE:BASEUSDT',
        };
        if (map[symbol.toUpperCase()]) return map[symbol.toUpperCase()];
        // Fallback: try BYBIT or BINANCE
        return `BYBIT:${symbol.toUpperCase()}USDT`;
    }

    function setChartInterval(iv) {
        _chartInterval = iv;
        document.querySelectorAll('.dxa-iv-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-iv') === iv);
        });
        // Re-render if TradingView is active (DEXScreener doesn't support interval switching via URL easily)
        if (_chartSource === 'tradingview') _renderChart();
    }

    function setChartSource(src) {
        _chartSource = src;
        document.querySelectorAll('.dxa-src-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-src') === src);
        });
        _renderChart();
    }

    // ── Analysis helpers ───────────────────────────────────────
    function _renderIdentity(best, token, price) {
        const el = document.getElementById('dxaIdentity');
        if (!el) return;
        const img = best.info?.imageUrl
            ? `<img src="${best.info.imageUrl}" class="dxa-id-img" onerror="this.style.display='none'">`
            : `<div class="dxa-id-img dxa-id-placeholder">${token?.symbol?.charAt(0)||'?'}</div>`;
        const pct24  = best.priceChange?.h24;
        const addr   = token?.address || '';
        const links  = (best.info?.websites||[]).map(w=>`<a href="${w.url}" target="_blank" class="dxa-id-link">🌐 Web</a>`).join('') +
                       (best.info?.socials||[]).map(s=>`<a href="https://${s.platform}.com/${s.handle}" target="_blank" class="dxa-id-link">${s.platform==='twitter'?'𝕏':'📢'} ${s.platform}</a>`).join('');
        el.innerHTML = `
        <div class="dxa-id-left">${img}
            <div class="dxa-id-info">
                <div class="dxa-id-sym">${token?.symbol||'?'} <span class="dxa-id-name">${token?.name||''}</span></div>
                <div class="dxa-id-addr" title="${addr}">${addr?addr.slice(0,10)+'…'+addr.slice(-8):'—'}
                    ${addr?`<button class="wt-copy-btn" onclick="navigator.clipboard.writeText('${addr}').then(()=>this.textContent='✅')">📋</button>`:''}
                </div>
                <div class="dxa-id-links">${links}</div>
            </div>
        </div>
        <div class="dxa-id-right">
            <div class="dxa-id-price">${priceFmt(best.priceUsd)} <span class="${pctCls(pct24)}">${fmtPct(pct24)}</span></div>
            <div class="dxa-id-meta">
                <span>MCap: <b>${fmtUsd(best.marketCap)}</b></span>
                <span>FDV: <b>${fmtUsd(best.fdv)}</b></span>
                <span>Vol 24H: <b>${fmtUsd(best.volume?.h24)}</b></span>
                <span>Liq: <b>${fmtUsd(best.liquidity?.usd)}</b></span>
            </div>
            <a class="dxa-dex-link" href="${best.url||'#'}" target="_blank">🔗 Lihat di DEXScreener</a>
        </div>`;
    }

    function _analyzeLiquidity(allPairs, best) {
        const liq = best.liquidity?.usd || 0;
        const vol24 = best.volume?.h24 || 0;
        const ratio = liq > 0 ? vol24/liq : 0;
        const txns24 = (best.txns?.h24?.buys||0)+(best.txns?.h24?.sells||0);
        const bsRatio = best.txns?.h24?.sells > 0 ? (best.txns?.h24?.buys/best.txns?.h24?.sells).toFixed(2) : '—';
        const totalLiq = allPairs.reduce((s,p)=>s+(p.liquidity?.usd||0),0);
        let score=0; const rows=[];
        if (liq>=500000)      { score+=25; rows.push(`${check(true)} Liquidity sangat tinggi: <b>${fmtUsd(liq)}</b>`); }
        else if (liq>=100000) { score+=18; rows.push(`${check(true)} Liquidity cukup: <b>${fmtUsd(liq)}</b>`); }
        else if (liq>=25000)  { score+=10; rows.push(`${warn('Liquidity rendah')}: <b>${fmtUsd(liq)}</b>`); }
        else                  { score+=3;  rows.push(`${check(false)} Liquidity sangat rendah: <b>${fmtUsd(liq)}</b>`); }
        if (ratio>3)          rows.push(`${warn('Vol/Liq ratio tinggi')} ${ratio.toFixed(1)}x — kemungkinan wash trading`);
        else if (ratio>0.5)   { score+=5; rows.push(`${check(true)} Vol/Liq sehat: ${ratio.toFixed(2)}x`); }
        else                  rows.push(`${warn('Volume rendah')}: ratio ${ratio.toFixed(2)}x`);
        rows.push(`📊 Txns 24H: <b>${fmtNum(txns24)}</b> · Buy/Sell: <b>${bsRatio}</b>`);
        rows.push(`💰 Total liq semua pair: <b>${fmtUsd(totalLiq)}</b>`);
        return { score, max:30, html:rows.map(r=>`<div class="dxa-row">${r}</div>`).join('') };
    }

    function _analyzeHolders(gp) {
        if (!gp) return { score:10, max:25, html:`<div class="dxa-row">${warn('Data holder tidak tersedia')}<br><small>Masukkan EVM contract address (0x...) untuk data GoPlusLabs.</small></div>` };
        let score=0; const rows=[];
        const creatorPct = parseFloat(gp.creator_percent||0)*100;
        if (creatorPct<5)       { score+=10; rows.push(`${check(true)} Creator: <b>${creatorPct.toFixed(1)}%</b>`); }
        else if (creatorPct<15) { score+=6;  rows.push(`${warn(`Creator pegang ${creatorPct.toFixed(1)}%`)}`); }
        else                    { score+=0;  rows.push(`${check(false)} Creator pegang <b>${creatorPct.toFixed(1)}%</b> — risiko dump!`); }
        const ownerPct = parseFloat(gp.owner_percent||0)*100;
        if (ownerPct<5) { score+=8; rows.push(`${check(true)} Owner: <b>${ownerPct.toFixed(1)}%</b>`); }
        else            { score+=3; rows.push(`${warn(`Owner pegang ${ownerPct.toFixed(1)}%`)}`); }
        const holders = gp.holders||[];
        const top5Pct = holders.slice(0,5).reduce((s,h)=>s+parseFloat(h.percent||0),0)*100;
        if (top5Pct<30)      { score+=7; rows.push(`${check(true)} Top 5 holders: <b>${top5Pct.toFixed(1)}%</b> — distribusi baik`); }
        else if (top5Pct<50) { score+=3; rows.push(`${warn(`Top 5 holders ${top5Pct.toFixed(1)}%`)}`); }
        else                 { score+=0; rows.push(`${check(false)} Top 5 holders <b>${top5Pct.toFixed(1)}%</b> — konsentrasi bahaya!`); }
        const hCount = parseInt(gp.holder_count||0);
        rows.push(`👥 Total holders: <b>${fmtNum(hCount)}</b>`);
        return { score, max:25, html:rows.map(r=>`<div class="dxa-row">${r}</div>`).join('') };
    }

    function _analyzeContract(gp) {
        if (!gp) return { score:10, max:25, html:`<div class="dxa-row">${warn('Data kontrak tidak tersedia')}<br><small>Masukkan EVM contract address untuk cek via GoPlusLabs.</small></div>` };
        let score=0; const rows=[];
        const renounced = gp.owner_address==='0x0000000000000000000000000000000000000000'||gp.is_renounced==='1'||!gp.owner_address;
        if (renounced) { score+=8; rows.push(`${check(true)} Ownership sudah di-<b>renounce</b>`); }
        else           { score+=3; rows.push(`${warn('Ownership belum direnounce')}`); }
        if (gp.is_open_source==='1') { score+=6; rows.push(`${check(true)} Kontrak <b>open source</b>`); }
        else                         { score+=0; rows.push(`${check(false)} Kontrak <b>tidak open source</b>`); }
        const hp = gp.is_honeypot==='1';
        if (!hp) { score+=8; rows.push(`${check(true)} <b>Bukan honeypot</b>`); }
        else     { score+=0; rows.push(`${check(false)} ⛔ <b>HONEYPOT!</b> — JANGAN BELI!`); }
        const bt=parseFloat(gp.buy_tax||0)*100, st=parseFloat(gp.sell_tax||0)*100;
        if (bt<=5&&st<=5)   { score+=3; rows.push(`${check(true)} Tax: Buy <b>${bt.toFixed(1)}%</b> / Sell <b>${st.toFixed(1)}%</b>`); }
        else if (st>20)     { score+=0; rows.push(`${check(false)} Sell tax sangat tinggi: <b>${st.toFixed(1)}%</b>`); }
        else                { score+=1; rows.push(`${warn(`Tax: Buy ${bt.toFixed(1)}% / Sell ${st.toFixed(1)}%`)}`); }
        if (gp.is_proxy==='1') rows.push(`${warn('Kontrak proxy')} — bisa diupgrade owner`);
        return { score, max:25, html:rows.map(r=>`<div class="dxa-row">${r}</div>`).join('') };
    }

    function _analyzeLpLock(gp, best) {
        if (!gp) {
            const liq=best.liquidity?.usd||0; let score=0; const rows=[];
            if (liq>=100000) { score=10; rows.push(`${check(true)} Liq cukup besar (${fmtUsd(liq)})`); }
            else rows.push(`${warn('Tidak dapat verifikasi LP lock')} — butuh EVM contract address`);
            return { score, max:20, html:rows.map(r=>`<div class="dxa-row">${r}</div>`).join('') };
        }
        let score=0; const rows=[];
        const lpHolders = gp.lp_holders||[];
        const lockedPct = lpHolders.filter(h=>h.is_locked==='1').reduce((s,h)=>s+parseFloat(h.percent||0),0)*100;
        const burnedPct = lpHolders.filter(h=>h.is_contract==='1'&&(h.tag||'').toLowerCase().includes('burn')).reduce((s,h)=>s+parseFloat(h.percent||0),0)*100;
        if (lockedPct>=80)      { score+=15; rows.push(`${check(true)} <b>${lockedPct.toFixed(1)}%</b> LP dikunci — sangat aman`); }
        else if (lockedPct>=50) { score+=10; rows.push(`${check(true)} <b>${lockedPct.toFixed(1)}%</b> LP dikunci`); }
        else if (lockedPct>0)   { score+=5;  rows.push(`${warn(`Hanya ${lockedPct.toFixed(1)}% LP dikunci`)}`); }
        else                    { score+=0;  rows.push(`${check(false)} LP <b>tidak dikunci</b> — risiko rug pull!`); }
        if (burnedPct>0) { score+=5; rows.push(`${check(true)} <b>${burnedPct.toFixed(1)}%</b> LP sudah burned`); }
        if (lpHolders.length===0) rows.push(`${warn('Tidak ada data LP holder')}`);
        return { score, max:20, html:rows.map(r=>`<div class="dxa-row">${r}</div>`).join('') };
    }

    function _renderScoreBar(total, liq, holder, contract, lp) {
        const el = document.getElementById('dxaScoreBar');
        if (!el) return;
        const max = liq.max+holder.max+contract.max+lp.max;
        const pct = Math.round((total/max)*100);
        const grade = pct>=75 ? {label:'BAGUS',cls:'dxa-grade-good'} : pct>=50 ? {label:'CUKUP',cls:'dxa-grade-warn'} : {label:'BERISIKO',cls:'dxa-grade-bad'};
        el.innerHTML = `<div class="dxa-score-row">
            <div class="dxa-score-main"><span class="dxa-score-num">${total}<span style="font-size:1rem;color:#64748b">/${max}</span></span><span class="dxa-score-label ${grade.cls}">${grade.label}</span></div>
            <div class="dxa-score-breakdown">
                <div class="dxa-score-bar-track"><div class="dxa-score-bar-fill ${grade.cls}" style="width:${pct}%"></div></div>
                <div class="dxa-score-parts"><span>💧 Liq: ${liq.score}/${liq.max}</span><span>👥 Holder: ${holder.score}/${holder.max}</span><span>📋 Kontrak: ${contract.score}/${contract.max}</span><span>🔒 LP: ${lp.score}/${lp.max}</span></div>
            </div>
        </div>`;
    }

    function _renderRecommendation(total, best, price, liq, holder, contract, lp) {
        const el = document.getElementById('dxaRecommendation');
        if (!el) return;
        const max = liq.max+holder.max+contract.max+lp.max;
        const pct = total/max;
        const vol24 = best.volume?.h24||0;
        const pct24 = best.priceChange?.h24||0;
        let action,color,icon,detail;
        if (pct>=0.75)      { action='LAYAK DIBELI';                color='#4ade80'; icon='🟢'; detail=`Skor keamanan tinggi (${total}/${max}). Semua indikator utama baik.`; }
        else if (pct>=0.55) { action='BISA DIBELI — HATI-HATI';     color='#fbbf24'; icon='🟡'; detail='Token cukup aman, ada beberapa risiko. Masuk dengan posisi kecil.'; }
        else if (pct>=0.35) { action='TUNGGU KONFIRMASI';            color='#f97316'; icon='🟠'; detail='Tunggu volume & liq lebih tinggi sebelum masuk.'; }
        else                { action='JANGAN BELI — RISIKO TINGGI';  color='#f87171'; icon='🔴'; detail=`Skor terlalu rendah (${total}/${max}). Terlalu banyak tanda bahaya.`; }
        const entryPct   = pct>=0.55 ? 0 : (pct24<-10 ? 0 : -5);
        const entryPrice = price*(1+entryPct/100);
        const t1=price*1.30, t2=price*2.00, sl=price*0.85;
        const volMin = pct>=0.55 ? vol24*0.8 : vol24*1.5;
        el.innerHTML = `
        <div class="dxa-rec-header"><span class="dxa-rec-icon">${icon}</span><div>
            <div class="dxa-rec-action" style="color:${color}">${action}</div>
            <div class="dxa-rec-detail">${detail}</div>
        </div></div>
        <div class="dxa-targets-grid">
            <div class="dxa-target-card"><div class="dxa-target-label">📍 Entry</div><div class="dxa-target-val">${priceFmt(entryPrice)}</div><div class="dxa-target-sub">${entryPct===0?'Harga saat ini':`Koreksi ${Math.abs(entryPct)}%`}</div></div>
            <div class="dxa-target-card"><div class="dxa-target-label">🎯 Target 1</div><div class="dxa-target-val positive">${priceFmt(t1)}</div><div class="dxa-target-sub">+30%</div></div>
            <div class="dxa-target-card"><div class="dxa-target-label">🚀 Target 2</div><div class="dxa-target-val positive">${priceFmt(t2)}</div><div class="dxa-target-sub">+100%</div></div>
            <div class="dxa-target-card"><div class="dxa-target-label">🛑 Stop Loss</div><div class="dxa-target-val negative">${priceFmt(sl)}</div><div class="dxa-target-sub">-15%</div></div>
        </div>
        <div class="dxa-vol-trigger">📊 <b>Volume Trigger:</b> Masuk saat vol 24H ≥ <b>${fmtUsd(volMin)}</b></div>
        <div class="dxa-disclaimer">⚠️ <b>Disclaimer:</b> Bukan saran keuangan. Selalu DYOR. Jangan invest lebih dari yang kamu sanggup rugi.</div>`;
    }

    function _renderPairsTable(allPairs) {
        const tbody = document.getElementById('dxaPairsBody');
        if (!tbody) return;
        tbody.innerHTML = allPairs.slice(0,15).map(p => {
            const pct24=p.priceChange?.h24; const price=parseFloat(p.priceUsd)||0;
            return `<tr>
                <td>${(p.dexId||'').toUpperCase()}</td>
                <td>${p.baseToken?.symbol}/${p.quoteToken?.symbol}</td>
                <td>${priceFmt(p.priceUsd)}</td>
                <td>${fmtUsd(p.liquidity?.usd)}</td>
                <td>${fmtUsd(p.volume?.h24)}</td>
                <td>${fmtNum((p.txns?.h24?.buys||0)+(p.txns?.h24?.sells||0))}</td>
                <td class="${pctCls(pct24)}">${fmtPct(pct24)}</td>
                <td>${fmtAge(p.pairCreatedAt)}</td>
                <td>${p.boosts?.active?`⚡${p.boosts.active}`:'—'}</td>
            </tr>`;
        }).join('');
    }

    // ── Init ───────────────────────────────────────────────────
    function setupEventListeners() {
        // Chain tabs — only inside dex-analyzer tab
        document.querySelectorAll('#dxaChainTabs .dsx-chain-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                activeChain = btn.dataset.chain;
                document.querySelectorAll('#dxaChainTabs .dsx-chain-btn').forEach(b=>b.classList.remove('active'));
                btn.classList.add('active');
                load();
            });
        });
        // Sort headers
        document.querySelectorAll('#dxaTable th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (sortCol===col) sortDir = sortDir==='desc'?'asc':'desc';
                else { sortCol=col; sortDir='desc'; }
                document.querySelectorAll('#dxaTable th').forEach(t=>t.classList.remove('dsx-sort-active'));
                th.classList.add('dsx-sort-active');
                const clean = th.textContent.replace(/ [↑↓]/,'');
                th.textContent = clean + (sortDir==='desc'?' ↓':' ↑');
                applyFilters();
            });
        });
        // Search
        const srch = document.getElementById('dxaSearch');
        if (srch) srch.addEventListener('input', e => {
            searchTerm = e.target.value.trim();
            if (searchTerm.length>=2) load(); else applyFilters();
        });
        // Time dropdown
        const timeTrigger = document.getElementById('dxaTimeTrigger');
        const timeDD = document.getElementById('dxaTimeDropdown');
        if (timeTrigger && timeDD) {
            timeTrigger.addEventListener('click', e => { e.stopPropagation(); timeDD.style.display = timeDD.style.display==='none'?'block':'none'; });
            timeDD.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => {
                    activeTime = btn.dataset.time;
                    timeTrigger.textContent = `⏱ Last ${activeTime} ▾`;
                    timeDD.style.display = 'none';
                    applyFilters();
                });
            });
        }
        // Close dropdown on outside click
        document.addEventListener('click', () => { if (timeDD) timeDD.style.display='none'; });
    }

    // Legacy methods kept for backward compat (token-scanner table calls analyzeFromPair)
    async function analyzeFromPair(chain, address, symbol) {
        switchTab('dex-analyzer');
        setTimeout(() => openPanel(chain, address, symbol, ''), 300);
    }
    async function quickSearch(symbol, chain) {
        switchTab('dex-analyzer');
        setTimeout(async () => {
            const pairs = await fetchSearch(symbol);
            const p = pairs.find(x => x.chainId===chain) || pairs[0];
            if (p) openPanel(p.chainId, p.baseToken?.address||'', p.baseToken?.symbol||symbol, p.pairAddress||'');
        }, 300);
    }

    function init() {
        if (!initialized) {
            setupEventListeners();
            initialized = true;
        }
        if (pairs.length===0) load();
        if (!refreshTimer) refreshTimer = setInterval(()=>load(), 30000);
    }

    // ── Jupiter Swap integration ───────────────────────────────
    function openJupiterSwap() {
        if (!currentPair) return;
        const mint   = currentPair.address || currentPair.token?.address || '';
        const symbol = currentPair.token?.symbol || '';
        // Switch to Solana Swap tab
        switchTab('solana-swap');
        // Pass token to swap module (slight delay to ensure tab is initialized)
        setTimeout(() => {
            if (typeof solanaSwap !== 'undefined') {
                solanaSwap.setSwapToken(mint, symbol);
            }
        }, 300);
    }

    return { init, load, toggleQuick, openFilterModal, closeFilterModal, applyModalFilters, resetModalFilters, openPanel, closePanel, analyzeFromPair, quickSearch, goPage, switchInnerTab, setChartInterval, setChartSource, openJupiterSwap };
})();


// ═══════════════════════════════════════════════════════════════
//  WEB3 TRADING MODULE  — MetaMask connect + DEX swap deeplink
// ═══════════════════════════════════════════════════════════════
const web3Trading = (() => {
    let account   = null;
    let chainId   = null;
    let provider  = null;
    let currentToken = null;  // { best, token, chain, address }

    const CHAIN_NAMES = { '0x1':'Ethereum', '0x38':'BSC', '0x89':'Polygon', '0xa4b1':'Arbitrum', '0x2105':'Base', '0xa':'Optimism' };
    const CHAIN_NATIVE = { '0x1':'ETH', '0x38':'BNB', '0x89':'MATIC', '0xa4b1':'ETH', '0x2105':'ETH', '0xa':'ETH' };

    // DEX deeplink builders per chain
    const DEX_LINKS = {
        ethereum: (addr) => `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=mainnet`,
        bsc:      (addr) => `https://pancakeswap.finance/swap?outputCurrency=${addr}`,
        polygon:  (addr) => `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=polygon`,
        arbitrum: (addr) => `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=arbitrum`,
        base:     (addr) => `https://app.uniswap.org/swap?outputCurrency=${addr}&chain=base`,
        solana:   (addr) => `https://jup.ag/swap/SOL-${addr}`,
    };

    function isMetaMaskAvailable() { return typeof window.ethereum !== 'undefined'; }

    async function connect() {
        if (!isMetaMaskAvailable()) {
            alert('MetaMask tidak terdeteksi.\n\nInstall MetaMask dulu dari https://metamask.io atau gunakan browser yang sudah ada MetaMask-nya.');
            return;
        }
        const btn = document.getElementById('w3ConnectBtn');
        if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }
        try {
            provider = window.ethereum;
            const accounts = await provider.request({ method: 'eth_requestAccounts' });
            account = accounts[0];
            chainId = await provider.request({ method: 'eth_chainId' });
            _updateUI();
            _listenEvents();
        } catch (e) {
            if (e.code === 4001) alert('Koneksi wallet dibatalkan.');
            else alert('Gagal connect: ' + e.message);
        } finally {
            if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
        }
    }

    function disconnect() {
        account = null; chainId = null; provider = null;
        _updateUI();
    }

    async function _getBalance() {
        if (!provider || !account) return null;
        try {
            const hex = await provider.request({ method: 'eth_getBalance', params: [account, 'latest'] });
            const wei = parseInt(hex, 16);
            return (wei / 1e18).toFixed(4);
        } catch { return null; }
    }

    function _listenEvents() {
        if (!provider) return;
        provider.on('accountsChanged', (accounts) => {
            account = accounts[0] || null;
            if (!account) disconnect(); else _updateUI();
        });
        provider.on('chainChanged', (id) => { chainId = id; _updateUI(); });
    }

    async function _updateUI() {
        const connectBtn  = document.getElementById('w3ConnectBtn');
        const walletInfo  = document.getElementById('w3WalletInfo');
        const addrEl      = document.getElementById('w3Addr');
        const balanceEl   = document.getElementById('w3Balance');
        const netEl       = document.getElementById('w3Net');

        if (account) {
            if (connectBtn) connectBtn.style.display = 'none';
            if (walletInfo) walletInfo.style.display = 'flex';
            if (addrEl) addrEl.textContent = account.slice(0,6)+'…'+account.slice(-4);
            if (netEl)  netEl.textContent  = CHAIN_NAMES[chainId] || `Chain ${chainId}`;
            const bal = await _getBalance();
            if (balanceEl) balanceEl.textContent = bal ? `${bal} ${CHAIN_NATIVE[chainId]||''}` : '—';

            // Show Buy button in trade bar if a token is loaded
            const buyBtn = document.getElementById('dxaBuyBtn');
            if (buyBtn) buyBtn.style.display = 'inline-flex';
        } else {
            if (connectBtn) connectBtn.style.display = 'inline-flex';
            if (walletInfo) walletInfo.style.display = 'none';
        }
    }

    function setCurrentToken(tokenData) {
        currentToken = tokenData;
        // Update swap denom label
        const denomEl = document.getElementById('w3SwapDenom');
        if (denomEl && chainId) denomEl.textContent = CHAIN_NATIVE[chainId] || 'ETH';
        // Update token info in swap modal
        const infoEl = document.getElementById('w3SwapTokenInfo');
        if (infoEl && tokenData) {
            const sym   = tokenData.token?.symbol || '?';
            const chain = tokenData.chain || '';
            const rawPrice = tokenData.best?.priceUsd;
            const priceStr = rawPrice && rawPrice !== '…'
                ? `$${parseFloat(rawPrice).toFixed(6)}`
                : '<span style="color:#475569">memuat harga…</span>';
            infoEl.innerHTML = `<b>${sym}</b> <span style="color:#64748b">on ${chain}</span> · <span style="color:#a5b4fc">${priceStr}</span>`;
        }
    }

    function openSwap() {
        if (!currentToken) { alert('Pilih token dulu dari tabel.'); return; }
        const overlay = document.getElementById('w3SwapOverlay');
        if (overlay) overlay.style.display = 'flex';
        setCurrentToken(currentToken);
    }

    function closeSwap() {
        const overlay = document.getElementById('w3SwapOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function openOnDex() {
        if (!currentToken) return;
        const chain = currentToken.chain || 'ethereum';
        const addr  = currentToken.address || '';
        const builder = DEX_LINKS[chain];
        if (builder && addr) {
            window.open(builder(addr), '_blank');
        } else if (currentToken.best?.url) {
            window.open(currentToken.best.url, '_blank');
        } else {
            const sym = currentToken.token?.symbol || '';
            window.open(`https://dexscreener.com/search?q=${sym}`, '_blank');
        }
        closeSwap();
    }

    return { connect, disconnect, setCurrentToken, openSwap, closeSwap, openOnDex };
})();
