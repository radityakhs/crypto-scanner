// Stock Analysis Module – IDX & US Stocks detail panel
// Loaded by index.html; provides showIDXStockAnalysis() & showUSStockAnalysis()
console.log('✅ stock-analysis.js loaded');

/**
 * Render a detail analysis panel for an IDX stock inside #idxAnalysisContainer.
 * @param {Object} stock  – { code, name, sector, price, change, volume, value, foreign, marketCap, technical }
 */
function showIDXStockAnalysis(stock) {
    const section = document.getElementById('idxAnalysisSection');
    const container = document.getElementById('idxAnalysisContainer');
    if (!section || !container) return;

    const changeClass = stock.change >= 0 ? 'positive' : 'negative';
    const changeSign  = stock.change >= 0 ? '+' : '';

    container.innerHTML = `
        <div class="analysis-header">
            <div class="analysis-title">
                <h2>${stock.code} – ${stock.name}</h2>
                <div class="analysis-price">
                    <span class="current-price">Rp ${Number(stock.price).toLocaleString('id-ID')}</span>
                    <span class="${changeClass}">${changeSign}${stock.change}%</span>
                </div>
            </div>
            <button class="btn-close" onclick="closeIDXAnalysis()">✕</button>
        </div>

        <div class="analysis-body">
            <div class="analysis-section">
                <h3>📊 Market Data</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">Sector</span>
                        <span class="stat-value">${stock.sector || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Volume</span>
                        <span class="stat-value">${stock.volume || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Value (Rp)</span>
                        <span class="stat-value">${stock.value || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Foreign Flow</span>
                        <span class="stat-value">${stock.foreign || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Market Cap</span>
                        <span class="stat-value">${stock.marketCap || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Technical Signal</span>
                        <span class="stat-value">${stock.technical || '—'}</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
}

function closeIDXAnalysis() {
    const section = document.getElementById('idxAnalysisSection');
    if (section) section.style.display = 'none';
}

/**
 * Render a detail analysis panel for a US stock inside #usAnalysisContainer.
 * @param {Object} stock  – { ticker, name, sector, price, change, volume, marketCap, pe, eps, technical }
 */
function showUSStockAnalysis(stock) {
    const section = document.getElementById('usAnalysisSection');
    const container = document.getElementById('usAnalysisContainer');
    if (!section || !container) return;

    const changeClass = stock.change >= 0 ? 'positive' : 'negative';
    const changeSign  = stock.change >= 0 ? '+' : '';

    container.innerHTML = `
        <div class="analysis-header">
            <div class="analysis-title">
                <h2>${stock.ticker} – ${stock.name}</h2>
                <div class="analysis-price">
                    <span class="current-price">$${Number(stock.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    <span class="${changeClass}">${changeSign}${stock.change}%</span>
                </div>
            </div>
            <button class="btn-close" onclick="closeUSAnalysis()">✕</button>
        </div>

        <div class="analysis-body">
            <div class="analysis-section">
                <h3>📊 Market Data</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <span class="stat-label">Sector</span>
                        <span class="stat-value">${stock.sector || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Volume</span>
                        <span class="stat-value">${stock.volume || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Market Cap</span>
                        <span class="stat-value">${stock.marketCap || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">P/E Ratio</span>
                        <span class="stat-value">${stock.pe || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">EPS</span>
                        <span class="stat-value">${stock.eps || '—'}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Technical Signal</span>
                        <span class="stat-value">${stock.technical || '—'}</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth' });
}

function closeUSAnalysis() {
    const section = document.getElementById('usAnalysisSection');
    if (section) section.style.display = 'none';
}
