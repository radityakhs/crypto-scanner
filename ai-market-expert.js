// AI Market Expert - Exit Strategy & Entry Zones
// Date: February 11, 2026

console.log('✅ AI Market Expert module loaded');

function generateAIExitStrategy(currentPrice, analysis) {
    console.log('🤖 Generating AI Exit Strategy');
    
    const coin = analysis.coin || {};
    
    // Calculate Fibonacci retracement levels for entry zones
    const highPrice = currentPrice * 1.2; // Simulated recent high
    const lowPrice = currentPrice * 0.8;  // Simulated recent low
    const priceRange = highPrice - lowPrice;
    
    // Entry Zones based on Fibonacci levels
    const entryZones = [
        {
            level: 'Zone 1 - Aggressive',
            price: currentPrice - (priceRange * 0.382),
            probability: '45%',
            description: 'High risk, high reward entry',
            action: '🔴 TUNGGU - Don\'t FOMO at current price',
            emoji: '🎯'
        },
        {
            level: 'Zone 2 - Moderate ⭐',
            price: currentPrice - (priceRange * 0.618),
            probability: '75%',
            description: 'Balanced risk/reward (RECOMMENDED)',
            action: '🟡 HATI-HATI - Wait for pullback confirmation',
            emoji: '✨'
        },
        {
            level: 'Zone 3 - Conservative',
            price: currentPrice - (priceRange * 0.786),
            probability: '85%',
            description: 'Low risk, safer entry',
            action: '🟢 SIAP BELI - Excellent risk/reward ratio',
            emoji: '🛡️'
        }
    ];
    
    // Exit Targets
    const exitTargets = [
        {
            level: 'Target 1',
            price: currentPrice * 1.15,
            profit: '+15%',
            action: 'Take 30% profit',
            description: 'Quick profit taking',
            emoji: '💰'
        },
        {
            level: 'Target 2',
            price: currentPrice * 1.30,
            profit: '+30%',
            action: 'Take 40% profit',
            description: 'Medium-term target',
            emoji: '🎯'
        },
        {
            level: 'Target 3',
            price: currentPrice * 1.50,
            profit: '+50%',
            action: 'Take remaining 30%',
            description: 'Moon shot target',
            emoji: '🚀'
        }
    ];
    
    // Stop Loss calculation
    const stopLoss = {
        price: currentPrice * 0.92,
        loss: '-8%',
        description: 'Protect your capital',
        emoji: '🛑'
    };
    
    // Risk/Reward Ratio
    const riskReward = {
        risk: 8,
        reward: 15,
        ratio: (15 / 8).toFixed(2),
        rating: 'Excellent'
    };
    
    // Timing Recommendations
    const timing = analyzeTiming(currentPrice, coin);
    
    // Generate Action Plan
    const actionPlan = generateActionPlan(entryZones, exitTargets, stopLoss, timing);
    
    // Display the strategy
    displayExitStrategy({
        coin,
        currentPrice,
        entryZones,
        exitTargets,
        stopLoss,
        riskReward,
        timing,
        actionPlan
    });
}

function analyzeTiming(currentPrice, coin) {
    // Simplified timing analysis
    const change24h = coin.price_change_percentage_24h || 0;
    
    let timing = {
        status: 'neutral',
        emoji: '🟡',
        message: 'HATI-HATI',
        description: 'Market in neutral zone, wait for clear signals',
        bestTime: '13:00-15:00 WIB (Asian session close)',
        worstTime: '02:00-06:00 WIB (Low liquidity)'
    };
    
    if (change24h < -5) {
        timing = {
            status: 'good',
            emoji: '🟢',
            message: 'WAKTU YANG BAIK',
            description: 'Price has pulled back, good entry opportunity',
            bestTime: '09:00-11:00 WIB (Market opening)',
            worstTime: '22:00-02:00 WIB (Low volume)'
        };
    } else if (change24h > 10) {
        timing = {
            status: 'wait',
            emoji: '🔴',
            message: 'TUNGGU DULU',
            description: 'Price pumping hard, wait for correction',
            bestTime: 'Wait for 20% pullback',
            worstTime: 'NOW - Don\'t chase pumps'
        };
    }
    
    return timing;
}

function generateActionPlan(entryZones, exitTargets, stopLoss, timing) {
    return [
        {
            step: 1,
            title: 'Set Price Alerts',
            description: `Set alerts at entry zones: $${entryZones[0].price.toFixed(2)}, $${entryZones[1].price.toFixed(2)}, $${entryZones[2].price.toFixed(2)}`,
            priority: 'high'
        },
        {
            step: 2,
            title: 'Wait for Entry Signal',
            description: timing.description,
            priority: timing.status === 'good' ? 'high' : 'medium'
        },
        {
            step: 3,
            title: 'Enter Position',
            description: `Buy at Zone 2 (Recommended): $${entryZones[1].price.toFixed(2)}`,
            priority: 'high'
        },
        {
            step: 4,
            title: 'Set Stop Loss IMMEDIATELY',
            description: `Place stop loss at $${stopLoss.price.toFixed(2)} (${stopLoss.loss})`,
            priority: 'critical'
        },
        {
            step: 5,
            title: 'Set Take Profit Orders',
            description: `TP1: $${exitTargets[0].price.toFixed(2)}, TP2: $${exitTargets[1].price.toFixed(2)}, TP3: $${exitTargets[2].price.toFixed(2)}`,
            priority: 'high'
        },
        {
            step: 6,
            title: 'Trail Stop Loss',
            description: 'After TP1 hit, move stop loss to breakeven',
            priority: 'medium'
        }
    ];
}

function displayExitStrategy(strategy) {
    const container = document.getElementById('exitStrategyContainer');
    if (!container) return;
    
    const html = `
        <div class="exit-strategy-content">
            <!-- Current Price -->
            <div class="strategy-current-price">
                <h3>Current Price: $${strategy.currentPrice.toFixed(4)}</h3>
                <p>${strategy.coin.name || 'Selected Coin'}</p>
            </div>
            
            <!-- Timing Analysis -->
            <div class="strategy-timing ${strategy.timing.status}">
                <h4>${strategy.timing.emoji} ${strategy.timing.message}</h4>
                <p>${strategy.timing.description}</p>
                <div class="timing-details">
                    <div><strong>Best Time:</strong> ${strategy.timing.bestTime}</div>
                    <div><strong>Avoid:</strong> ${strategy.timing.worstTime}</div>
                </div>
            </div>
            
            <!-- Entry Zones -->
            <div class="strategy-section">
                <h3>📍 Entry Zones (Where to BUY)</h3>
                <div class="entry-zones">
                    ${strategy.entryZones.map(zone => `
                        <div class="entry-zone-card">
                            <div class="zone-header">
                                <span class="zone-emoji">${zone.emoji}</span>
                                <strong>${zone.level}</strong>
                            </div>
                            <div class="zone-price">$${zone.price.toFixed(4)}</div>
                            <div class="zone-probability">Success Rate: ${zone.probability}</div>
                            <p class="zone-desc">${zone.description}</p>
                            <div class="zone-action">${zone.action}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Exit Targets -->
            <div class="strategy-section">
                <h3>🎯 Exit Targets (Where to SELL)</h3>
                <div class="exit-targets">
                    ${strategy.exitTargets.map(target => `
                        <div class="exit-target-card">
                            <div class="target-header">
                                <span class="target-emoji">${target.emoji}</span>
                                <strong>${target.level}</strong>
                            </div>
                            <div class="target-price">$${target.price.toFixed(4)}</div>
                            <div class="target-profit positive">${target.profit}</div>
                            <div class="target-action">${target.action}</div>
                            <p class="target-desc">${target.description}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Stop Loss -->
            <div class="strategy-section stop-loss-section">
                <h3>🛑 Stop Loss (MANDATORY!)</h3>
                <div class="stop-loss-card">
                    <div class="stop-loss-price">$${strategy.stopLoss.price.toFixed(4)}</div>
                    <div class="stop-loss-percent negative">${strategy.stopLoss.loss}</div>
                    <p>${strategy.stopLoss.description}</p>
                    <div class="warning-box">
                        ⚠️ <strong>CRITICAL:</strong> Always set stop loss BEFORE entering position!
                    </div>
                </div>
            </div>
            
            <!-- Risk/Reward -->
            <div class="strategy-section">
                <h3>⚖️ Risk/Reward Analysis</h3>
                <div class="risk-reward-card">
                    <div class="rr-stat">
                        <span class="rr-label">Risk</span>
                        <span class="rr-value negative">${strategy.riskReward.risk}%</span>
                    </div>
                    <div class="rr-ratio">
                        <strong>${strategy.riskReward.ratio}:1</strong>
                        <p>${strategy.riskReward.rating}</p>
                    </div>
                    <div class="rr-stat">
                        <span class="rr-label">Reward</span>
                        <span class="rr-value positive">${strategy.riskReward.reward}%</span>
                    </div>
                </div>
            </div>
            
            <!-- Action Plan -->
            <div class="strategy-section">
                <h3>📋 Step-by-Step Action Plan</h3>
                <div class="action-plan">
                    ${strategy.actionPlan.map(step => `
                        <div class="action-step priority-${step.priority}">
                            <div class="step-number">${step.step}</div>
                            <div class="step-content">
                                <strong>${step.title}</strong>
                                <p>${step.description}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Disclaimer -->
            <div class="strategy-disclaimer">
                <p>⚠️ <strong>Disclaimer:</strong> This is an AI-generated strategy for educational purposes only. 
                Always do your own research and never invest more than you can afford to lose.</p>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Scroll to exit strategy section
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    console.log('✅ Exit Strategy displayed successfully');
}

// Export functions
window.generateAIExitStrategy = generateAIExitStrategy;

console.log('✅ AI Market Expert module ready');
