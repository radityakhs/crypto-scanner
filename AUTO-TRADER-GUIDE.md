#!/usr/bin/env bash

# ╔════════════════════════════════════════════════════════════════════════╗
# ║         AUTO-TRADER COMPLETE SYSTEM - SETUP & USAGE GUIDE             ║
# ║                                                                        ║
# ║  A production-ready auto-trading system with signal rules, risk       ║
# ║  management, order execution, and real-time performance tracking      ║
# ╚════════════════════════════════════════════════════════════════════════╝

cat << 'EOF'

╔════════════════════════════════════════════════════════════════════════╗
║                    🤖 AUTO-TRADER COMPLETE v2.0                       ║
║                  Full-Featured Trading Automation System               ║
╚════════════════════════════════════════════════════════════════════════╝

📋 WHAT'S INCLUDED:

  ✅ Signal Rules Engine
     - Automatic signal detection and evaluation
     - Configurable buy/sell thresholds
     - Support for multiple strategies (signal_follow, grid, scalp)
     - Real-time signal filtering

  ✅ Risk Management System
     - Position sizing based on risk percentage
     - Maximum daily loss limits (daily circuit breaker)
     - Maximum concurrent positions control
     - Max trades per day limit
     - Drawdown protection (auto-stop if exceeded)
     - Stop-loss & take-profit automation

  ✅ Order Execution Layer
     - THREE execution modes:
       🟡 SIMULATION: Instant fills (for testing)
       📄 PAPER: Simulated trading with proxy (no real money)
       🔴 LIVE: Real trades (requires API keys in .env)
     - Market order support
     - Order status tracking
     - Automatic position P&L calculation
     - Trade journal auto-logging

  ✅ Professional Dashboard
     - Real-time metrics (balance, equity, P&L, positions)
     - Live position tracking with current prices
     - Strategy configuration editor
     - Risk management control panel
     - Performance statistics & win rate
     - Event log with color-coded messages
     - Position management (close individual or all)

═══════════════════════════════════════════════════════════════════════════

🚀 QUICK START:

1. Navigate to HOME tab in dashboard
2. Scroll down to "🤖 AUTO-TRADER SYSTEM" section
3. Click "⚙️ Settings" tab to configure:
   - Trading mode (Simulation / Paper / Live)
   - Strategy (Signal Follow / Grid / Scalp)
   - Risk parameters (max loss, position size, etc.)
4. Click "START" button to begin auto-trading
5. Watch positions open/close automatically
6. Monitor in "📊 Overview" and "💼 Positions" tabs

═══════════════════════════════════════════════════════════════════════════

⚙️  CONFIGURATION:

Strategy Selection:
  • Signal Follow: Execute trades based on AI signal scores
  • Grid Trading: Buy dips, sell rallies (BETA)
  • Scalping: Quick in/out on small moves (BETA)

Execution Mode:
  🟡 SIMULATION (Default, Safe)
     - Instant fills at market price
     - Perfect for testing strategies
     - No API keys needed
     - Reset balancedaily

  📄 PAPER TRADING (Recommended)
     - Simulated trading with proxy
     - Realistic order execution
     - No real money at risk
     - Set BINANCE_API_KEY=""  (empty) to activate

  🔴 LIVE TRADING (Use with caution!)
     - Real trades, real money
     - Requires:
       1. BINANCE_API_KEY in .env
       2. BINANCE_SECRET_KEY in .env
     3. Start small (0.5% risk per trade)
     - Use circuit breakers (max daily loss, drawdown limit)

═══════════════════════════════════════════════════════════════════════════

💡 KEY FEATURES:

1. REAL-TIME POSITION TRACKING
   - Current price updates every 5 seconds
   - Live P&L calculation
   - Entry/Exit prices displayed
   - Stop-loss & take-profit levels visible

2. INTELLIGENT RISK MANAGEMENT
   ✓ Risk per Trade: 0.5% - 5% of account
   ✓ Max Daily Loss: Stops trading after daily loss limit
   ✓ Max Positions: 1 - 20 concurrent positions
   ✓ Max Trades/Day: 1 - 50 trades
   ✓ Drawdown Circuit Breaker: Auto-stops if equity drops >10%

3. PERFORMANCE METRICS
   - Win Rate: % of profitable trades
   - Avg Win Size: Average profit on winners
   - Avg Loss Size: Average loss on losers
   - Profit Factor: Total Wins / Total Losses
   - Total P&L: Cumulative earnings

4. EVENT LOGGING
   - Timestamped events with color coding:
     ✓ GREEN: Successful trades, opens, closes
     🟡 YELLOW: Warnings, limits reached
     ❌ RED: Errors, circuit breaker triggers
   - 100-item log history
   - Clear button for manual clearing

═══════════════════════════════════════════════════════════════════════════

📊 METRICS EXPLAINED:

Balance
  - Current available cash (not including open position equity)

Equity
  - Balance + unrealized P&L from open positions
  - True total account value

Total P&L
  - Equity - Starting Capital
  - Overall account performance

Positions
  - Number of open positions / Max allowed
  - Example: "2 / 5" means 2 open out of 5 max

Today Trades
  - Trades executed today / Max per day
  - Resets at midnight

Win Rate
  - Percentage of closed trades that were profitable
  - Example: "65%" means 65% of closed trades made money

═══════════════════════════════════════════════════════════════════════════

🛡️  RISK MANAGEMENT BEST PRACTICES:

1. Start Conservative
   - Use SIMULATION mode first
   - Trade with small risk per trade (0.5-1%)
   - Set max daily loss to 3-5%

2. Position Sizing
   - Automatic: Based on stop-loss distance
   - Formula: RiskAmount / (Entry - Stop Loss)
   - Never risk more than intended per trade

3. Time Limits
   - Min Hold: 1-5 minutes (avoid excessive churn)
   - Max Hold: 30 minutes - 1 hour (lock in profits, limit losses)

4. Circuit Breakers
   - Daily Loss Limit: If you hit -5% in a day, stop trading
   - Drawdown Limit: If equity drops >10%, auto-stop
   - Max Positions: Don't over-concentrate risk

═══════════════════════════════════════════════════════════════════════════

📝 SIGNAL REQUIREMENTS:

For signals to work, your signals.json must have:

{
  "symbol": "BTCUSDT",           // Trading pair
  "signal": "LONG" or "BUY",     // Signal type
  "score": 75,                   // 0-100 confidence score
  "price": 42500.50,             // Current market price
  "timestamp": "2024-03-30T10:15:00Z",
  "signalReason": "RSI oversold + volume spike"
}

The auto-trader will:
  1. Check signal score >= buyThreshold (default 60)
  2. Verify signal type is LONG/BUY
  3. Calculate position size based on risk
  4. Execute market order
  5. Set stop-loss and take-profit
  6. Monitor until exit condition triggered

═══════════════════════════════════════════════════════════════════════════

🔧 API INTEGRATION:

For LIVE or PAPER modes, you need a proxy server (included: binance-proxy.js)

Required Environment Variables (.env):
  BINANCE_API_KEY=your_api_key_here
  BINANCE_SECRET_KEY=your_secret_key_here
  PROXY_PORT=3001  (optional)

The proxy:
  - Signs all requests with HMAC-SHA256
  - Never exposes API keys to browser
  - Handles rate limiting
  - Provides paper trading simulation

═══════════════════════════════════════════════════════════════════════════

📊 PERFORMANCE TRACKING:

All trades are automatically logged to:
  - Browser localStorage (cs_journal_v1)
  - AutoTraderComplete.getTrades() in console

Export data:
  1. Go to Settings tab
  2. Click "Export Data"
  3. Save JSON file for external analysis

Metrics tracked:
  - Total trades executed
  - Win rate %
  - Average win / loss sizes
  - Profit factor
  - Max drawdown
  - Daily P&L

═══════════════════════════════════════════════════════════════════════════

⚠️  IMPORTANT WARNINGS:

1. This is for EDUCATIONAL purposes
   - Test thoroughly in SIMULATION mode first
   - Never trade real money without backtesting
   - Start with small amounts in LIVE mode

2. Network Issues
   - System depends on signal generation (signals.json)
   - If signals stop, no new trades will open
   - Existing positions still have auto-exit rules

3. System Failures
   - If browser crashes, positions remain open
   - Monitor account regularly
   - Use exchange's own stop-losses as backup

4. API Rate Limits
   - Binance has rate limits: ~1200 requests/minute
   - 5-second update cycle = 720 requests/hour (safe)
   - Adjust if you see rate-limit errors in log

═══════════════════════════════════════════════════════════════════════════

🔍 TROUBLESHOOTING:

Issue: "No signals found" in log
Fix: Check signals.json exists and has valid data

Issue: Orders not executing
Fix: 
  - In SIMULATION mode? Should execute instantly
  - In PAPER mode? Check binance-proxy is running (curl http://localhost:3001/health)
  - In LIVE mode? Check .env has API credentials

Issue: Positions not updating
Fix: 
  - Check network (should update every 5 seconds)
  - Open browser console (F12) for error messages
  - Verify proxy health: http://localhost:3001/health

Issue: "Daily loss limit reached"
Fix: This is WORKING! System is protecting your account.
     To continue trading, either:
     - Wait until next day (limit resets at midnight)
     - Increase maxDailyLoss% in Settings (risky!)

═══════════════════════════════════════════════════════════════════════════

💻 DEVELOPER NOTES:

Main Components:
  ✅ auto-trader-complete.js (500 lines)
     - Core engine: Rules, Orders, Strategies, PositionManager
     - Public API: start(), stop(), setState(), getState()

  ✅ auto-trader-dashboard.js (400 lines)
     - UI template, CSS, event handlers
     - Tabs: Overview, Positions, Settings, Log
     - Auto-updates every 100ms via browser refresh loop

HTML Integration:
  - Container: <div id="autoTraderDashboardContainer">
  - Init: AutoTraderDashboard.init('#autoTraderDashboardContainer')
  - Triggers on HOME tab opening

State Management:
  - Persisted to localStorage as 'atc_v2'
  - Survives page refresh
  - Can export/import JSON

Extensibility:
  - Add new strategies in Strategies object
  - Add new rules in Rules object
  - Add new metrics to state.stats
  - Customize UI in dashboard template()

═══════════════════════════════════════════════════════════════════════════

📞 SUPPORT:

For bugs/issues:
  1. Check browser console (F12 > Console tab)
  2. Look for error messages in Auto-Trader log
  3. Verify proxy health
  4. Check signals.json has valid data
  5. Try SIMULATION mode first

Recommended Reading:
  - Crypto Scanner README.md
  - binance-proxy.js comments
  - auto-trader-complete.js code comments
  - Strategy rules in Orders and Strategies sections

═══════════════════════════════════════════════════════════════════════════

✅ READY TO TRADE!

Next steps:
  1. Open http://localhost:8000 in browser
  2. Click HOME tab
  3. Scroll to Auto-Trader Dashboard
  4. Start in SIMULATION mode
  5. Test different strategies
  6. Graduate to PAPER → LIVE when confident

Good luck! 🚀

EOF
