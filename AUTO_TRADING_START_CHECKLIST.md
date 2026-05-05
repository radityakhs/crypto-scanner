# 🚀 AUTO-TRADING START CHECKLIST

**Goal**: Start live auto-trading from HOME dashboard in 5 minutes  
**Wallet**: $15.86 SOL  
**Target**: Automate signal execution with risk management  

---

## ✅ PRE-TRADING CHECKLIST (Do Once)

### System Prerequisites
- [ ] Node.js installed (v16+)
- [ ] npm modules installed (`npm install` was run)
- [ ] macOS terminal open (zsh)

### Code Files Ready
- [ ] `signal-bot.js` exists
- [ ] `auto-trader.js` exists
- [ ] `proxy-server.js` exists
- [ ] `index.html` exists (Dashboard)
- [ ] `package.json` has dependencies

### Database Files Ready
- [ ] `signals.json` exists
- [ ] `auto-trader-state.json` exists (or will be created)
- [ ] `trade-journal.csv` exists (or will be created)

### Extension Ready
- [ ] Jupiter wallet extension installed in browser
- [ ] Wallet funded with 15.86 SOL
- [ ] Solana mainnet selected (not devnet)

---

## 🎯 QUICK START (Do Every Trading Session)

### Step 1: Start Services (5 minutes)

```bash
# Terminal 1: Proxy Server
node proxy-server.js
# Expected output: "Server running on port 3001"

# Terminal 2: Signal Bot  
node signal-bot.js
# Expected output: "Starting signal-bot..." (signals generated every 30-60s)

# Terminal 3: Auto Trader
node auto-trader.js
# Expected output: "Auto-trader initialized"

# Terminal 4: HTTP Server (if needed)
python3 -m http.server 8000
# Expected output: "Serving HTTP on 0.0.0.0 port 8000"
```

### Step 2: Open Dashboard

```
Browser: http://localhost:8000
Click: HOME tab (or refresh if already open)
```

### Step 3: Connect Wallet

```
1. Locate: "◎ Jupiter" button (left panel, top)
2. Click: Button
3. Approve: Jupiter extension popup
4. Wait: "Connecting..." → "✓ Connected"
5. Verify: 
   - Address shows (8m3x...7k2a)
   - Balance shows (15.86 SOL)
   - Status shows "✓ Connected"
```

### Step 4: Enable Auto Mode

```
1. Locate: "Mode" buttons (below wallet)
   - Currently shows: "✋ Manual"
2. Click: "◉ Auto" button
3. Wait: Page updates
4. Verify:
   - Button highlight changes to "Auto"
   - Status bar shows "🟢 BOT ACTIVE"
   - "Risk Level" buttons become active
```

### Step 5: Set Risk Level

```
1. Locate: "Risk Level" buttons
2. Options:
   - Low  (1% per trade)  ← Safe for learning
   - Med  (2% per trade)  ← Recommended
   - High (5% per trade)  ← Aggressive
3. Click: "Med" (recommended)
4. Verify: Button highlights
5. Calculation: 2% × $15.86 = $0.317 per trade
   - Max position size: ~$3.17 (for DEX trades)
```

### Step 6: Monitor Dashboard

```
Dashboard now shows:
- [ ] Wallet stats (address, balance, status)
- [ ] "🟢 BOT ACTIVE" indicator
- [ ] Risk level: "2%"
- [ ] Activity log (starting to fill)
- [ ] Market radar animating
- [ ] KPI metrics

What happens next:
- Signal-bot generates signal (1-5 minutes)
- Auto-trader evaluates it (30s poll cycle)
- If accepted → trade executes (sees in activity log)
- Home dashboard shows "✓ Trade: TOKEN @ $X.XX"
```

---

## 🎬 LIVE TRADING BEHAVIOR

### Expected First 30 Minutes:

```
0:00  - Dashboard opens, wallet connected
5:00  - First signal generated
       Activity log: "📊 Signal: LONG (65%) DOGE"
6:00  - Auto-trader evaluates signal
       If filters pass → "✓ Trade: DOGE @ $0.120"
       If filters fail → Activity log: "⚠️ Signal rejected (confidence too low)"
10:00 - Position monitoring active
       Activity log shows price updates
       Radar animates on position changes
20:00 - Position exits (SL, TP1, TP2, or TP3 hit)
       Activity log: "💰 TP1: Sold 50%, +$0.15"
       Equity updates
       Position removed from list
25:00 - Ready for next signal
       Cycle repeats
```

### Typical Trade Example (With $0.317 risk @ 2%):

```
Signal Generated:
- Symbol: DOGE
- Action: LONG
- Confidence: 78%
- Entry: $0.120
- Support (SL): $0.108
- Target1: $0.135 (profit: +$0.15)

Auto-trader calculates:
- Risk: $0.317 (2% of $15.86)
- Risk per unit: $0.120 - $0.108 = $0.012
- Position size: $0.317 / $0.012 = 26.4 SOL → ~220 DOGE

Trade execution:
- Sends: 220 DOGE via Jupiter
- Receives: ~$26.40 worth of SOL equivalent
- Open price: $0.120

Monitoring:
- IF price hits $0.135 → Sell 50% (110 DOGE)
  Profit: +$0.15 realized
  
- IF price stays above $0.120 but hits $0.150:
  Sell another 30% (66 DOGE)
  Profit: +$0.20 more
  
- IF price hits $0.165:
  Sell final 20% (44 DOGE)
  Profit: +$0.30 more
  
Total potential profit: +$0.65 on one trade
(This is hypothetical based on signal levels)

If stopped out:
- IF price hits $0.108 (SL):
  Loss: -$0.317
  Position closed, wait for next signal
```

---

## 📊 MONITORING DURING TRADING

### Activity Log Meanings

| Log | Meaning | Action |
|-----|---------|--------|
| 📊 Signal: LONG (78%) | New signal generated | Auto-trader evaluating |
| ✓ Trade: TOKEN @ $X | Trade executed | Position opened |
| 💰 TP1: Sold 50% | First target hit | 50% profit taken |
| 💰 TP2: Exit 30% | Second target hit | Additional 30% closed |
| ✓ CLOSED: Final target | All position closed | P&L locked in |
| ⚠️ SL HIT | Stop loss triggered | Position closed at loss |
| ⚠️ Signal rejected | Filters not passed | Waiting for next signal |

### Dashboard Updates

- **Activity Log**: New entries every few seconds (when trading)
- **Equity Curve**: Updates every time trade closes
- **Positions Panel**: Shows open trades, updates prices
- **KPI Row**: Trade count increases, P&L updates, win rate recalculates
- **Radar Animation**: Green burst on buy, red burst on sell
- **Status**: "BOT ACTIVE" stays green as long as Auto mode enabled

---

## 🛑 HOW TO STOP TRADING

### Method 1: Pause (Fastest)
```
1. Click: "✋ Manual" button
2. Result: Polling stops, bot pauses
3. Wallet still connected
4. Can restart by clicking "Auto" again
```

### Method 2: Kill Process (Complete Stop)
```bash
# Terminal where auto-trader is running:
Ctrl+C

# Or from another terminal:
pkill -f "node auto-trader"
```

### Method 3: Dashboard Closed (Partial Stop)
```
1. Close browser or HOME tab
2. Result: Dashboard polling stops
3. Auto-trader still running in background
4. Reopen dashboard to resume monitoring
```

---

## ⚠️ RISK WARNINGS

### Before You Start:

1. **DRY_RUN Mode Check**
   ```bash
   grep "DRY_RUN" auto-trader.js
   # If shows: DRY_RUN: false → LIVE TRADING (real money moves)
   # If shows: DRY_RUN: true → SIMULATION (no real trades)
   ```

2. **Wallet Balance Verification**
   ```bash
   # Check you see 15.86 SOL in dashboard
   # This is your ACTUAL trading capital
   # Make sure it's what you intend to risk
   ```

3. **Filter Settings Check**
   ```bash
   grep -A 5 "ENTRY_FILTERS" auto-trader.js
   # Review minimum confidence, R:R ratio, etc.
   # These protect you from bad signals
   ```

4. **Position Size Check**
   ```bash
   # At 2% risk on $15.86 SOL
   # Max position value: ~$3.17 per trade
   # This is small enough for learning without massive loss risk
   ```

### Common Issues & Fixes:

| Issue | Cause | Fix |
|-------|-------|-----|
| "Connected but balance shows $0" | Wrong chain | Check cs_wallet_chain = 'solana' |
| "BOT ACTIVE but no trades" | Signals not passing filters | Lower MIN_CONFIDENCE in auto-trader.js |
| "Activity log only shows old items" | UI buffer limit (15 items) | Check auto-trader-state.json for full history |
| "Position won't close" | TP prices too high | Adjust TARGET_PROFIT_PERCENT in auto-trader.js |
| "Can't connect Jupiter wallet" | Extension issue | Reinstall extension, check mainnet selected |

---

## 📈 SUCCESS INDICATORS

### First Trade - What Good Looks Like:

✅ All visible:
- 📊 Signal appears in activity log
- ✓ Trade executes within 30-60 seconds
- Position appears in "Exchange Positions" 
- Radar green burst animates
- KPI "Trades" increments
- Equity curve exists and flat (waiting for exit)

### Position Management - What Good Looks Like:

✅ For each position:
- Price updates every 5-15 seconds
- Unrealized P&L updates live
- When SL/TP hit, position automatically closes
- Activity log confirms exit with profit/loss
- Trade added to journal
- Equity updates

### Multiple Trades - Pattern:

✅ Trading session should show:
```
T+5min  📊 Signal 1 → ✓ Trade
T+20min 💰 TP1: +$0.15 (closed 50%)
T+35min 💰 TP3: +$0.30 (closed final)
        Total P&L: +$0.45 ✓

T+45min 📊 Signal 2 → ✓ Trade
T+60min ⚠️ SL HIT: -$0.32
        Total P&L: +$0.13 ✓

T+75min 📊 Signal 3 → Waiting...
```

---

## 📝 TROUBLESHOOTING COMMANDS

If something goes wrong:

```bash
# Check proxy server is running
curl http://localhost:3001/api/health

# Check auto-trader state
curl http://localhost:3001/api/auto-trader/state | jq

# Check signals being generated
curl http://localhost:3001/api/signals | jq '.[] | .symbol, .action' | head -20

# Check wallet balance
curl http://localhost:3001/api/wallet/balance?addr=YOUR_ADDRESS

# View last 20 trades
tail -20 trade-journal.csv

# Watch auto-trader logs
tail -f auto-trader-state.json

# Verify all processes running
ps aux | grep -E "node|python" | grep -v grep
```

---

## ✨ YOUR TRADING DASHBOARD IS READY!

### Summary:
- [x] HOME dashboard has all UI components
- [x] Wallet integration complete
- [x] Auto mode toggle functional
- [x] Real-time polling active
- [x] Signal flow connected
- [x] Position monitoring working
- [x] P&L tracking enabled

### To start trading:
1. Start 3 services (proxy, signal-bot, auto-trader)
2. Open http://localhost:8000
3. Connect Jupiter wallet
4. Click "Auto" mode
5. Set risk level
6. Watch it trade! 🚀

**Good luck! Start small with 2% risk and learn the system before increasing! 📊**
