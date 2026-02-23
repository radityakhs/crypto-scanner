// Market Movers Module - Top Gainers, Losers, New Listings, Trending
// Date: February 11, 2026

console.log('✅ Market Movers module loaded');

let currentMoversTab = 'gainers';

function initializeTopMovers() {
    console.log('🚀 Initializing Top Movers section');
    
    // Setup tab switching
    document.querySelectorAll('.mover-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabType = e.currentTarget.getAttribute('data-tab');
            switchMoversTab(tabType);
        });
    });
    
    // Load initial data
    loadTopGainers();
}

function switchMoversTab(tabType) {
    currentMoversTab = tabType;
    
    // Update active tab
    document.querySelectorAll('.mover-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.getAttribute('data-tab') === tabType) {
            tab.classList.add('active');
        }
    });
    
    // Load appropriate data
    switch(tabType) {
        case 'gainers':
            loadTopGainers();
            break;
        case 'losers':
            loadTopLosers();
            break;
        case 'new-listings':
            loadNewListings();
            break;
        case 'trending':
            loadTrendingCoins();
            break;
    }
}

async function loadTopGainers() {
    const container = document.getElementById('topMoversContent');
    if (!container) return;
    
    container.innerHTML = '<div class="movers-loading"><span class="g-spinner"></span> Memuat top gainers…</div>';
    
    try {
        const response = await fetch(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=percent_change_desc&per_page=8&page=1&sparkline=false&price_change_percentage=24h'
        );
        const data = await response.json();
        
        displayMoversGrid(data, 'gainer');
    } catch (error) {
        console.error('Error loading top gainers:', error);
        container.innerHTML = '<div class="error">Failed to load top gainers</div>';
    }
}

async function loadTopLosers() {
    const container = document.getElementById('topMoversContent');
    if (!container) return;
    
    container.innerHTML = '<div class="movers-loading"><span class="g-spinner"></span> Memuat top losers…</div>';
    
    try {
        const response = await fetch(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h'
        );
        const data = await response.json();
        
        // Sort by lowest 24h change
        const losers = data.sort((a, b) => 
            (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0)
        ).slice(0, 8);
        
        displayMoversGrid(losers, 'loser');
    } catch (error) {
        console.error('Error loading top losers:', error);
        container.innerHTML = '<div class="error">Failed to load top losers</div>';
    }
}

async function loadNewListings() {
    const container = document.getElementById('topMoversContent');
    if (!container) return;
    
    container.innerHTML = '<div class="movers-loading"><span class="g-spinner"></span> Memuat new listings…</div>';
    
    try {
        // Get recently added coins (approximation using market cap and age)
        const response = await fetch(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_asc&per_page=100&page=1&sparkline=false'
        );
        const data = await response.json();
        
        // Filter for "newer" coins (lower market cap as proxy)
        const newCoins = data.slice(50, 58);
        
        displayMoversGrid(newCoins, 'new', true);
    } catch (error) {
        console.error('Error loading new listings:', error);
        container.innerHTML = '<div class="error">Failed to load new listings</div>';
    }
}

async function loadTrendingCoins() {
    const container = document.getElementById('topMoversContent');
    if (!container) return;
    
    container.innerHTML = '<div class="movers-loading"><span class="g-spinner"></span> Memuat trending coins…</div>';
    
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/search/trending');
        const data = await response.json();
        
        if (data.coins) {
            const trendingCoins = data.coins.slice(0, 8).map(item => item.item);
            displayTrendingGrid(trendingCoins);
        }
    } catch (error) {
        console.error('Error loading trending coins:', error);
        container.innerHTML = '<div class="error">Failed to load trending coins</div>';
    }
}

function displayMoversGrid(coins, type, isNew = false) {
    const container = document.getElementById('topMoversContent');
    if (!container) return;
    
    const html = `
        <div class="movers-grid">
            ${coins.map(coin => `
                <div class="mover-card ${type}" onclick="showCoinDetails('${coin.id}')">
                    ${isNew ? '<span class="new-badge">NEW</span>' : ''}
                    <img src="${coin.image}" alt="${coin.name}" class="mover-icon">
                    <h4>${coin.name}</h4>
                    <p class="mover-symbol">${coin.symbol.toUpperCase()}</p>
                    <div class="mover-price">$${formatMoverPrice(coin.current_price)}</div>
                    <div class="mover-change ${coin.price_change_percentage_24h >= 0 ? 'positive' : 'negative'}">
                        ${formatPercentage(coin.price_change_percentage_24h)} (24h)
                    </div>
                    <div class="mover-stats">
                        <div class="mover-stat">
                            <span class="stat-label">Volume</span>
                            <span class="stat-value">$${formatLargeNumber(coin.total_volume)}</span>
                        </div>
                        <div class="mover-stat">
                            <span class="stat-label">Market Cap</span>
                            <span class="stat-value">$${formatLargeNumber(coin.market_cap)}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    container.innerHTML = html;
}

function displayTrendingGrid(coins) {
    const container = document.getElementById('topMoversContent');
    if (!container) return;
    
    const html = `
        <div class="movers-grid">
            ${coins.map((coin, index) => `
                <div class="mover-card trending" onclick="showCoinDetails('${coin.id}')">
                    <div class="trending-rank">#${index + 1}</div>
                    <img src="${coin.thumb}" alt="${coin.name}" class="mover-icon">
                    <h4>${coin.name}</h4>
                    <p class="mover-symbol">${coin.symbol.toUpperCase()}</p>
                    <div class="trending-badge">🔥 Trending</div>
                    <div class="mover-stats">
                        <div class="mover-stat">
                            <span class="stat-label">Rank</span>
                            <span class="stat-value">#${coin.market_cap_rank || 'N/A'}</span>
                        </div>
                        <div class="mover-stat">
                            <span class="stat-label">Score</span>
                            <span class="stat-value">${coin.score || 0}</span>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    container.innerHTML = html;
}

function showCoinDetails(coinId) {
    console.log(`Showing details for ${coinId}`);
    
    // Switch to scanner tab
    const scannerTab = document.querySelector('[data-tab="scanner"]');
    if (scannerTab) {
        scannerTab.click();
    }
    
    // Analyze the coin
    setTimeout(() => {
        if (typeof analyzeCoin === 'function') {
            analyzeCoin(coinId);
        }
    }, 500);
}

function formatMoverPrice(price) {
    if (price >= 1) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 0.01) return price.toFixed(4);
    return price.toFixed(8);
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
    const formatted = Math.abs(value).toFixed(2);
    return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
}

console.log('✅ Market Movers module ready');
