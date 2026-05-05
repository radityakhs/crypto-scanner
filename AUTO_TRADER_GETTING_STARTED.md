# 🤖 AUTO-TRADER SYSTEM — GETTING STARTED

## ✅ Status: READY (SIMULATION MODE)

The auto-trader system is **COMPLETE** and **INSTALLED** in your dashboard!

**What You Have:**
- ✅ Complete trading engine (auto-trader-complete.js)
- ✅ Professional dashboard UI (auto-trader-dashboard.js)
- ✅ Risk management system
- ✅ Signal-based strategy engine
- ✅ Position tracking & management
- ✅ Real-time performance metrics

**What's Running:**
- 🟡 **SIMULATION MODE** (safe, no real money)
- Paper mode available (connect exchange API)
- Live mode available (requires API keys)

---

## 🚀 QUICK START (5 MINUTES)

### 1️⃣ Start Services

```bash
cd /Users/radityakusuma/Documents/crypto-scanner

# Terminal 1: Start Binance Proxy
node binance-proxy.js

# Terminal 2: Start HTTP Server
python3 -m http.server 8000
```

### 2️⃣ Open Dashboard

```
http://localhost:8000
```

Click on **HOME** tab → Scroll down → You'll see the **AUTO-TRADER SYSTEM** dashboard

### 3️⃣ Configure Auto-Trader

In the **AUTO-TRADER SYSTEM** panel:

1. **Overview Tab:**
   - Strategy: `Signal Follow` ✓
   - Mode: `Simulation` (safe) ✓
   - Buy Threshold: 60 (adjust if needed)
   - Sell Threshold: 40 (adjust if needed)

2. **Risk Management Tab:**
   - Risk per Trade: 1% (start small!)
   - Max Daily Loss: 5% (circuit breaker)
   - Max Positions: 5 (concurrent trades)
   - Max Trades/Day: 10 (daily limit)

### 4️⃣ START AUTO-TRADER

Click green **START** button in the header

**What Happens:**
- System polls signals every 5 seconds
- Automatically executes trades when signals appear
- Updates positions in real-time
- Tracks P&L and statistics
- Shows logs of all trades

### 5️⃣ Monitor

- **Overview Tab:** See live metrics
- **Positions Tab:** Open trades with P&L
- **Settings Tab:** Performance summary
- **Log Tab:** Event feed with timestamps

---

## 🎯 UNDERSTANDING THE DASHBOARD

### Metrics Grid

```
┌─────────────────────────────────────┐
│ Balance: $10,000.00                 │  ← Current account value
│ Equity: $10,000.00                  │  ← Balance + open P&L
│ Total P&L: +$0.00                   │  ← Realized profit/loss
│ Positions: 0 / 5                    │  ← Open positions
│ Today Trades: 0 / 10                │  ← Trades executed today
│ Today P&L: +$0.00                   │  ← Today's profit/loss
│ Win Rate: —                         │  ← % of winning trades
│ Total P&L (All): +$0.00             │  ← Cumulative all trades
└─────────────────────────────────────┘
```

### Signal Follow Strategy

**How it works:**

```
1. Polls signals.json every 5 seconds
2. Checks if signal score >= Buy Threshold (60)
3. If TRUE and position slots available:
   - Calculates position size based on risk %
   - Places BUY market order
   - Sets Stop-Loss and Take-Profit prices
   - Adds position to tracking
4. Monitors open positions:
   - Checks if profit target hit → SELL
   - Checks if stop-loss hit → SELL
   - Checks if max hold time reached → SELL
5. Closes position, updates statistics
```

### Risk Management Features

| Feature | Purpose | Default |
|---------|---------|---------|
| **Risk per Trade** | % of capital risked per trade | 1% |
| **Max Daily Loss** | Daily loss limit (circuit breaker) | 5% |
| **Max Positions** | Max concurrent open trades | 5 |
| **Max Trades/Day** | Daily trade limit | 10 |
| **Max Drawdown** | Equity drawdown circuit breaker | 10% |

---

## 📊 SIMULATION VS OTHER MODES

### 🟡 Simulation Mode (Current - RECOMMENDED)

- **No real money risked**
- **Instant fills** at signal price
- **Perfect for testing strategies**
- All P&L is simulated
- No exchange API needed

**Use for:**
- Testing strategy configuration
- Understanding system behavior
- Building confidence before live

### 📄 Paper Mode

- Uses exchange API
- Real market data
- No money exchanged
- Realistic order fills
- Good for risk-free practice

**Requires:** Exchange API keys

### 🔴 Live Mode

- **REAL money at risk**
- **Real orders execute**
- **Real P&L**
- Requires full authentication
- ⚠️ BE CAREFUL WITH SETTINGS

**Only after you're comfortable with Simulation**

---

## 🛑 SAFETY FEATURES

1. **Daily Loss Limit**
   - If today's loss > Max Daily Loss %
   - ALL TRADING STOPS automatically

2. **Drawdown Circuit Breaker**
   - If equity drawdown > Max Drawdown %
   - System stops opening new trades

3. **Position Limits**
   - Max concurrent positions prevent over-exposure
   - Max trades/day prevents over-trading

4. **Time-Based Exits**
   - Min Hold Time: Don't exit too fast
   - Max Hold Time: Close stale positions

5. **Always in Simulation**
   - No real money until you explicitly change mode
   - Starting with safe defaults

---

## 📈 WHAT TO EXPECT

### First Trade (in Simulation)

1. Signal appears in signals.json
2. Dashboard captures it
3. Auto-trader checks conditions
4. If conditions met → Position opens
5. Log shows: "🟢 OPEN: BTC qty:0.001 @ $45,000"

### Position Tracking

- Real-time P&L calculation
- Shows entry, current, SL, TP prices
- Updates every 5 seconds
- Manual close button available

### Performance Tracking

As trades complete:
- Win rate % calculates
- P&L accumulates
- Equity curve builds
- Statistics update

---

## ⚙️ ADVANCED CONFIGURATION

### Strategy Parameters

**Overview Tab → Strategy Configuration**

```
Buy Threshold:   60  (signal score to enter)
Sell Threshold:  40  (signal score to exit)
```

**Position Sizing Tab**

```
TP Ratio:        2%  (take profit distance)
SL Ratio:        1%  (stop loss distance)
Min Hold Time:   1m  (don't exit before)
Max Hold Time:   1h  (auto-exit after)
```

### Risk Settings

**Risk Management Tab**

Adjust based on your comfort:
- Conservative: 0.5% risk, 2% daily loss
- Moderate: 1% risk, 5% daily loss  ← Current
- Aggressive: 2% risk, 10% daily loss

---

## 🔧 TROUBLESHOOTING

### Auto-trader not starting?

1. Check if services running:
   ```bash
   curl http://localhost:3001/health
   curl http://localhost:8000/index.html
   ```

2. Check browser console (F12) for errors

3. Verify auto-trader-complete.js loaded:
   ```javascript
   // In console:
   typeof AutoTraderComplete  // Should be "object"
   typeof AutoTraderDashboard // Should be "object"
   ```

### No signals appearing?

1. Check if signals.json exists
2. Check if proxy is responding
3. Verify HOME tab is active
4. Check browser console for fetch errors

### Trades not executing?

1. Check if conditions are met:
   - Signal score >= Buy Threshold
   - Position slots available
   - Daily loss not exceeded
   - Drawdown not exceeded

2. Check Log tab for error messages

3. Try lowering Buy Threshold temporarily

---

## 📝 TYPICAL WORKFLOW

**Day 1:**
- Start in Simulation mode
- Create sample signals.json
- Test with Buy Threshold = 50 (easier to trigger)
- Watch positions open/close
- Verify P&L calculations

**Day 2:**
- Adjust strategy parameters
- Test different thresholds
- Fine-tune risk settings
- Build confidence

**Day 3+:**
- Consider Paper mode (real data, no risk)
- Connect exchange API
- Run with real data
- Eventually: Live mode (if desired)

---

## 🎓 SIGNAL FORMAT

For auto-trader to work, signals.json must be:

```json
[
  {
    "symbol": "BTCUSDT",
    "coin": "BTC",
    "signal": "LONG",
    "score": 75,
    "price": 45000,
    "timestamp": "2026-03-30T23:00:00Z",
    "signalReason": "Buy signal from AI"
  }
]
```

**Key fields:**
- `signal`: "LONG" or "SHORT"
- `score`: 0-100 (higher = more confident)
- `price`: Current price
- `symbol`: Trading pair

---

## ✨ NEXT STEPS

1. **Read:** This document completely
2. **Test:** Start in Simulation mode
3. **Monitor:** Watch first few trades
4. **Adjust:** Fine-tune parameters
5. **Upgrade:** Try Paper mode when comfortable
6. **Verify:** Real API connection if going Live

---

## 📞 QUICK REFERENCE

**Keyboard shortcuts in dashboard:**

- Click **START** → Begins trading
- Click **STOP** → Pauses trading
- Click **CLOSE ALL** → Closes all positions
- Click tab buttons → Switch dashboard views

**Status indicators:**

- 🟢 = Running / Positive
- 🔴 = Stopped / Negative / Error
- 🟡 = Warning / Simulation
- ⚫ = Off / Neutral

**Color meanings:**

- Green (#4ade80) = Profit / Buy signal
- Red (#f87171) = Loss / Sell signal
- Blue (#6366f1) = Neutral / Info

---

**Remember:** Start small, test thoroughly, never risk more than you can afford to lose! 🚀
