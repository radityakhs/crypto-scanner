#!/usr/bin/env node

/**
 * RISK CALCULATOR FOR AUTO TRADER
 * 
 * Calculate safe risk parameters based on your wallet size
 * 
 * Usage:
 * $ node risk-calculator.js
 * 
 * Then follow prompts to input wallet size and risk tolerance
 */

const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║           AUTO TRADER - RISK PARAMETER CALCULATOR                       ║');
    console.log('║  Calculate safe CONFIG values based on your wallet size & risk tolerance ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

    // Get wallet size
    const walletInput = await question('💰 Enter your wallet size in SOL (e.g., 5 or 10.5): ');
    const walletSize = parseFloat(walletInput);
    
    if (isNaN(walletSize) || walletSize <= 0) {
        console.error('❌ Invalid wallet size');
        rl.close();
        return;
    }

    console.log('\n📊 RISK TOLERANCE OPTIONS:\n');
    console.log('   1 = ULTRA CONSERVATIVE (safest, learn trading)');
    console.log('   2 = CONSERVATIVE (safe, moderate profits)');
    console.log('   3 = MODERATE (balanced risk/reward)');
    console.log('   4 = AGGRESSIVE (experienced traders only)');
    
    const riskInput = await question('\n🎯 Choose risk level (1-4): ');
    const riskLevel = parseInt(riskInput);

    if (![1, 2, 3, 4].includes(riskLevel)) {
        console.error('❌ Invalid choice');
        rl.close();
        return;
    }

    // Generate recommendations
    const recommendations = getRecommendations(walletSize, riskLevel);

    // Display results
    console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ RECOMMENDED PARAMETERS                            ║');
    console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

    console.log(`📈 Wallet Size: ${walletSize} SOL`);
    console.log(`⚠️  Risk Level: ${['', 'ULTRA CONSERVATIVE', 'CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'][riskLevel]}\n`);

    console.log('UPDATE THESE VALUES IN auto-trader.js (around line 59-73):\n');

    console.log(`✏️  RISK_PER_TRADE_PCT : ${recommendations.riskPerTrade},`);
    console.log(`✏️  MAX_RISK_PCT       : ${recommendations.maxRisk},`);
    console.log(`✏️  MAX_OPEN_POSITIONS : ${recommendations.maxPositions},`);
    console.log(`✏️  MAX_DAILY_LOSS_PCT : ${recommendations.maxDailyLoss},`);
    console.log(`✏️  MAX_DRAWDOWN_PCT   : ${recommendations.maxDrawdown},`);
    console.log(`✏️  MAX_CONSECUTIVE_LOSS: ${recommendations.maxConsecutiveLoss},\n`);

    // Calculate actual amounts
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    console.log('💡 WHAT THIS MEANS IN REAL NUMBERS:\n');

    const maxLossPerTrade = (walletSize * recommendations.riskPerTrade / 100).toFixed(4);
    const maxExposure = (maxLossPerTrade * recommendations.maxPositions).toFixed(4);
    const maxDailyLoss = (walletSize * recommendations.maxDailyLoss / 100).toFixed(4);
    const maxDrawdown = (walletSize * recommendations.maxDrawdown / 100).toFixed(4);

    console.log(`   🎲 Max loss per trade: ${maxLossPerTrade} SOL`);
    console.log(`   📊 Max total exposure: ${maxExposure} SOL (${recommendations.maxPositions} positions)`);
    console.log(`   📅 Max daily loss: ${maxDailyLoss} SOL`);
    console.log(`   📉 Max drawdown: ${maxDrawdown} SOL\n`);

    // Trade examples
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    console.log('📌 EXAMPLE TRADE WITH THESE PARAMETERS:\n');

    const exampleRiskAmount = maxLossPerTrade;
    const minReward = exampleRiskAmount * 1.5; // 1.5:1 ratio
    
    console.log(`   Entry Price:       $10.00`);
    console.log(`   Stop Loss:         $ 9.50`);
    console.log(`   Take Profit:       $11.25`);
    console.log(`   Position Size:     ${exampleRiskAmount} SOL`);
    console.log(`   Risk if SL hit:    ${exampleRiskAmount} SOL`);
    console.log(`   Reward if TP hit:  ${minReward.toFixed(4)} SOL (1.5:1 ratio)\n`);

    // Safety tips
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    console.log('⚠️  SAFETY TIPS BEFORE GOING LIVE:\n');
    console.log('   ✓ Never use 100% of wallet - keep 20% reserve');
    console.log('   ✓ Start with ULTRA CONSERVATIVE for first week');
    console.log('   ✓ Increase risk level only after 50+ successful trades');
    console.log('   ✓ Monitor first 24 hours closely');
    console.log('   ✓ Have emergency stop-loss procedure ready');
    console.log('   ✓ Review daily results and adjust if needed\n');

    // Next steps
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    console.log('📝 NEXT STEPS:\n');
    console.log('   1. Copy the CONFIG values above');
    console.log('   2. Open auto-trader.js in editor');
    console.log('   3. Find lines 59-73 (RISK CONFIGURATION section)');
    console.log('   4. Replace with values above');
    console.log('   5. Change line 50: DRY_RUN: false');
    console.log('   6. Save and restart: pkill -f "node auto-trader" && node auto-trader.js');
    console.log('   7. Monitor dashboard at http://localhost:8000\n');

    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    console.log('See LIVE_MODE_SWITCH.md for detailed walkthrough');
    console.log('See QUICK_START_LIVE.txt for quick reference\n');

    rl.close();
}

function getRecommendations(walletSize, riskLevel) {
    // Adjust recommendations based on wallet size
    // Smaller wallets need lower per-trade risk to avoid overexposure
    
    let riskMultiplier = 1.0;
    if (walletSize < 2) riskMultiplier = 0.5;      // < 2 SOL: reduce risk
    else if (walletSize < 5) riskMultiplier = 0.75; // 2-5 SOL: moderate reduction
    else if (walletSize > 50) riskMultiplier = 1.2; // > 50 SOL: slightly increase

    const configs = {
        1: { // ULTRA CONSERVATIVE
            riskPerTrade: Math.max(0.3, 0.5 * riskMultiplier),
            maxRisk: Math.max(0.3, 0.5 * riskMultiplier),
            maxPositions: 1,
            maxDailyLoss: 1.5,
            maxDrawdown: 3.0,
            maxConsecutiveLoss: 1
        },
        2: { // CONSERVATIVE
            riskPerTrade: Math.max(0.5, 1.0 * riskMultiplier),
            maxRisk: Math.max(0.5, 1.0 * riskMultiplier),
            maxPositions: 2,
            maxDailyLoss: 3.0,
            maxDrawdown: 5.0,
            maxConsecutiveLoss: 2
        },
        3: { // MODERATE
            riskPerTrade: Math.max(1.0, 1.5 * riskMultiplier),
            maxRisk: Math.max(1.0, 1.5 * riskMultiplier),
            maxPositions: 3,
            maxDailyLoss: 5.0,
            maxDrawdown: 8.0,
            maxConsecutiveLoss: 3
        },
        4: { // AGGRESSIVE
            riskPerTrade: Math.min(2.0, 2.0 * riskMultiplier),
            maxRisk: 2.0,
            maxPositions: 5,
            maxDailyLoss: 8.0,
            maxDrawdown: 10.0,
            maxConsecutiveLoss: 4
        }
    };

    return configs[riskLevel];
}

main();
