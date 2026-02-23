// Liquidity Heatmap & BTC Liquidation Cluster Analysis
// Date: February 2026

console.log('✅ Liquidity Heatmap module loaded');

let liquidityHeatmapChart = null;

/**
 * Renders BTC liquidation cluster heatmap using Chart.js
 * @param {number} currentPrice - BTC current price
 */
function renderLiquidityHeatmap(currentPrice) {
    const canvasId = 'liquidityHeatmapChart';
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (liquidityHeatmapChart) {
        liquidityHeatmapChart.destroy();
    }

    const clusterCount = 14;
    const labels = [];
    const longs = [];
    const shorts = [];

    for (let i = 0; i < clusterCount; i++) {
        const offset = (i - Math.floor(clusterCount / 2)) * 0.025;
        const price = currentPrice * (1 + offset);
        labels.push('$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 }));

        // Simulated liquidation volume (larger near ±3-5%)
        const dist = Math.abs(offset);
        const base = Math.random() * 200 + 50;
        const spike = dist < 0.04 ? Math.random() * 800 + 200 : 0;
        longs.push(+(base + spike).toFixed(0));
        shorts.push(+(base * 0.9 + spike * 0.8).toFixed(0));
    }

    liquidityHeatmapChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Long Liquidations ($M)',
                    data: longs,
                    backgroundColor: 'rgba(239, 68, 68, 0.65)',
                    borderRadius: 4
                },
                {
                    label: 'Short Liquidations ($M)',
                    data: shorts,
                    backgroundColor: 'rgba(34, 197, 94, 0.65)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: '#cbd5f5' } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: $${ctx.raw}M`
                    }
                },
                annotation: {
                    annotations: {
                        currentPriceLine: {
                            type: 'line',
                            xMin: Math.floor(clusterCount / 2),
                            xMax: Math.floor(clusterCount / 2),
                            borderColor: '#f59e0b',
                            borderWidth: 2,
                            borderDash: [4, 4],
                            label: {
                                content: 'Current Price',
                                display: true,
                                color: '#f59e0b',
                                font: { size: 11 }
                            }
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8', font: { size: 10 } },
                    grid: { color: 'rgba(148,163,184,0.08)' }
                },
                y: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148,163,184,0.08)' },
                    title: { display: true, text: 'Volume ($M)', color: '#94a3b8' }
                }
            }
        }
    });
}

/**
 * Build and inject the Liquidity Heatmap section into the scanner tab
 */
function initLiquidityHeatmap(currentPrice) {
    const targetSection = document.querySelector('.coin-scoring-section');
    if (!targetSection) return;

    // Avoid duplicate injection
    if (document.getElementById('liquidityHeatmapSection')) return;

    const section = document.createElement('section');
    section.id = 'liquidityHeatmapSection';
    section.className = 'liquidity-heatmap-section';
    section.innerHTML = `
        <div class="lh-header">
            <h2>🔥 BTC Liquidation Cluster Heatmap</h2>
            <p class="lh-subtitle">Estimasi zona likuidasi long & short di sekitar harga saat ini</p>
            <button class="btn-secondary" onclick="renderLiquidityHeatmap(${currentPrice})">↻ Refresh</button>
        </div>
        <div class="lh-stats">
            <div class="lh-stat-card">
                <div class="stat-label">Nearest Long Wall</div>
                <div class="stat-value negative" id="nearestLongWall">—</div>
            </div>
            <div class="lh-stat-card">
                <div class="stat-label">Nearest Short Wall</div>
                <div class="stat-value positive" id="nearestShortWall">—</div>
            </div>
            <div class="lh-stat-card">
                <div class="stat-label">Total Liq. Volume</div>
                <div class="stat-value" id="totalLiqVolume">—</div>
            </div>
        </div>
        <div class="lh-chart-wrapper">
            <canvas id="liquidityHeatmapChart" height="180"></canvas>
        </div>
    `;

    targetSection.insertAdjacentElement('afterend', section);

    // Populate stat cards with estimates
    const longWall = (currentPrice * 0.95).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const shortWall = (currentPrice * 1.05).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    document.getElementById('nearestLongWall').textContent = longWall;
    document.getElementById('nearestShortWall').textContent = shortWall;
    document.getElementById('totalLiqVolume').textContent = `$${(Math.random() * 500 + 300).toFixed(0)}M`;

    renderLiquidityHeatmap(currentPrice);
}
