# 📋 HOME DASHBOARD AUTO-TRADING - QUICK REFERENCE CARD

Print this page and keep it visible while trading!

---

## ✅ PRE-TRADING CHECKLIST

```
BEFORE YOU START:

System:
  ☐ Node.js installed (v16+)
  ☐ All npm modules installed
  ☐ Python3 available for HTTP server

Code:
  ☐ signal-bot.js exists
  ☐ auto-trader.js exists  
  ☐ proxy-server.js exists
  ☐ index.html exists

Files:
  ☐ signals.json exists or will be created
  ☐ auto-trader-state.json exists or will be created
  ☐ trade-journal.csv exists or will be created

Wallet:
  ☐ Jupiter wallet extension installed
  ☐ Wallet funded with 15.86 SOL
  ☐ Solana MAINNET selected (not devnet)
  ☐ Wallet shows in browser extension
```

---

## 🚀 5-MINUTE STARTUP

```
STEP 1: Open 4 Terminals

Terminal 1:
  Command: node proxy-server.js
  Status: Running? → "Server running on port 3001"

Terminal 2:
  Command: node signal-bot.js
  Status: Running? → "Starting signal-bot..."

Terminal 3:
  Command: node auto-trader.js
  Status: Running? → "Auto-trader initialized"

Terminal 4:
  Command: python3 -m http.server 8000
  Status: Running? → "Serving HTTP on 0.0.0.0 port 8000"


STEP 2: Open Browser

  URL: http://localhost:8000
  Page Load: Should see dashboard
  Tab: Click "HOME"


STEP 3: Connect Wallet

  Button: "◎ Jupiter" (left panel, top)
  Action: Click button
  Extension: Approve in Jupiter popup
  Wait: Connecting... → Connected
  Display: 
    - Address: 8m3x...7k2a ✓
    - Balance: 15.86 SOL ✓
    - Status: ✓ Connected ✓


STEP 4: Enable Auto Mode

  Button: Currently shows "✋ Manual"
  Action: Click "◉ Auto"
  Wait: Page updates
  Display:
    - "◉ Auto" button highlighted ✓
    - Status: "🟢 BOT ACTIVE" ✓
    - Risk buttons active ✓


STEP 5: Set Risk Level

  Buttons: Low (1%) / Med (2%) / High (5%)
  Action: Click "Med" (recommended)
  Display:
    - "Med" highlighted ✓
    - Status still: "🟢 BOT ACTIVE" ✓
    - Your risk per trade: 2% × $15.86 = $0.317


STEP 6: Start Monitoring

  You're now LIVE! Dashboard monitoring is active:
    - Activity log ready
    - Market radar animating
    - Position tracking enabled
    - Polling every 15 seconds
```

---

## 📊 WHAT TO EXPECT (First 30 Minutes)

```
TIME    EVENT                          WHAT YOU'LL SEE
────────────────────────────────────────────────────────────
0:00    Dashboard opens               Wallet connected
                                      BOT ACTIVE showing

1-5m    First signal generated        Activity log:
                                      "📊 Signal: LONG (78%) DOGE"
                                      
                                      Radar animates

5-10m   Signal evaluation             Activity log updates
        Trade executes                "✓ Trade: DOGE @ $0.120"
                                      
                                      Green radar burst
                                      Position appears in list

10-20m  Position monitoring           Price updates
        Waiting for SL/TP             P&L changes
                                      Unrealized P&L updating

20-25m  Take profit hit               Activity log:
        TP1 or TP2 executes           "💰 TP1: Sold 50%, +$0.15"
                                      
                                      Equity curve updates

25-30m  Position closed               Activity log:
        All exits executed            "✓ CLOSED: +$0.45 total"
                                      
                                      Position removed
                                      Trade in journal
                                      Equity updated
                                      
        Ready for next signal!        Waiting...
```

---

## 👀 MONITORING DASHBOARD

### Activity Log Format
```
HH:MM [ICON] ACTION: Details

Examples:
  14:23 📊 Signal: LONG (78%) DOGE | Entry: 0.120 | RR: 2.5:1
  14:24 ✓ Trade: DOGE @ $0.120 | Position: +26,000 units
  14:27 💰 TP1 HIT! Sold 50% | Realized: +$0.15
  14:32 💰 TP3 HIT! Sold final | Realized: +$0.30
  14:35 ✓ CLOSED: All targets! | Total: +$0.45
  
  Or:
  14:20 ⚠️ SL HIT | Closed at loss: -$0.32
  14:18 ⚠️ Signal rejected (confidence 45% < 50%)
```

### KPI Row (Top)
```
Capital: Shows account equity
  (Placeholder $10,000 or actual from wallet)

P&L: Total realized profit/loss
  (Updates each time trade closes)

Win %: Win rate percentage
  (= winning trades / total trades)

Total Trades: Count of completed trades
  (Increments with each new trade)
```

### Exchange Positions (Right Panel)
```
Symbol │ Entry  │ Current │ P&L   │ Side
──────────────────────────────────────────
DOGE   │ 0.120  │ 0.125   │ +$48  │ LONG
SOL    │ 140    │ 138     │ -$32  │ LONG
```

### Equity Curve (Bottom)
```
Chart showing account value over time
- Flat when no trades
- Spikes up when profitable trades close
- Spikes down when losing trades close
- Shows your account growth visually
```

---

## 🛑 EMERGENCY STOPS

### Quick Pause (Fastest)
```
Action: Click "✋ Manual" button
Result: Polling stops immediately
        No new trades will execute
        Wallet still connected
        
To Resume: Click "◉ Auto" again
```

### Complete Stop
```
Terminal where auto-trader running:
  Ctrl+C
  
Result: Auto-trader process terminates
        No more trade execution
        Dashboard continues polling (but no updates)
```

### Dashboard Only
```
Action: Close browser or HOME tab
Result: Dashboard monitoring stops
        Auto-trader still running in background
        
To Resume: Open dashboard again
          Auto mode still enabled
          Polling resumes
```

---

## ⚠️ WARNING SIGNS

| Sign | Meaning | Action |
|------|---------|--------|
| Activity log shows old items only | UI buffer limit reached | Normal, check auto-trader-state.json for full history |
| No signals after 10 min | Signal bot might be stuck | Check signal-bot.js terminal for errors |
| Trades not executing despite signals | Entry filters rejecting signals | Check MIN_CONFIDENCE in auto-trader.js (maybe lower it) |
| Wallet balance shows $0 | Wrong chain selected | Verify cs_wallet_chain = "solana" in browser dev console |
| "BOT ACTIVE" not showing | Auto mode not enabled | Click "◉ Auto" button |
| Positions won't close | TP prices too high | Adjust TARGET_PROFIT_PERCENT in auto-trader.js |
| Can't connect Jupiter wallet | Extension issue | Check Jupiter extension is enabled, refresh page |

---

## 📱 DASHBOARD STATUS INDICATORS

### Green Indicators ✅ (Good)
```
🟢 BOT ACTIVE          → System ready to trade
✓ Connected            → Wallet connected
✓ Trade: TOKEN @ $X    → Trade executed successfully
✓ CLOSED               → Position closed with profit
```

### Yellow Indicators ⚠️ (Caution)
```
⚠️ SL HIT              → Position closed at loss (normal)
⚠️ Update SL           → Stop loss was adjusted
📊 Signal: LONG        → Evaluating, waiting to execute
```

### Red Indicators ❌ (Issues)
```
✗ Disconnected         → Wallet not connected
✗ Connection Error     → Proxy server not responding
❌ FAILED              → Trade execution failed
```

---

## 🔧 QUICK COMMANDS

### Check Services Running
```bash
ps aux | grep -E "node|python" | grep -v grep
# Should see: node proxy-server, node signal-bot, node auto-trader, python3 http.server
```

### Check Current State
```bash
curl http://localhost:3001/api/auto-trader/state | jq
# Shows: Current positions, lastTrade, equity, P&L
```

### View Recent Signals
```bash
tail -5 signals.json | jq '.[] | "\(.symbol) \(.action) \(.confidence)%"'
# Shows: Last 5 signals
```

### Check Wallet Balance
```bash
curl http://localhost:3001/api/wallet/balance?addr=YOUR_ADDRESS | jq
# Shows: Real SOL balance from blockchain
```

### View Trade Journal
```bash
tail -10 trade-journal.csv
# Shows: Last 10 closed trades with P&L
```

---

## 💾 DATA FILES TO MONITOR

```
signals.json
  └─ Created by: signal-bot.js
  └─ Updated: Every signal generation (1-5 min)
  └─ Contains: Latest signals with entry/exit levels
  └─ Used by: auto-trader.js to evaluate entries

auto-trader-state.json
  └─ Created by: auto-trader.js
  └─ Updated: Every trade execution, every position update
  └─ Contains: Current positions, lastTrade, equity, P&L
  └─ Used by: HOME dashboard polling (every 15s)

trade-journal.csv
  └─ Created by: auto-trader.js
  └─ Updated: Every trade close
  └─ Contains: Symbol, Entry, Exit, Profit, Date, Time
  └─ Used by: Calculate win rate, total trades, P&L
```

### Check File Updates
```bash
watch -n 1 'tail -1 auto-trader-state.json | jq ".lastTrade"'
# Watch trades being executed in real-time (updates every 1 sec)

watch -n 5 'grep "$(date +%Y-%m-%d)" trade-journal.csv | wc -l'
# Watch number of closed trades today (updates every 5 sec)
```

---

## 📈 TRADE EXAMPLE WITH YOUR WALLET

### Setup (Your $15.86 SOL)
```
Risk per trade: 2%
Risk amount: 2% × $15.86 = $0.317

If signal is:
  Entry: $0.120
  SL: $0.108
  Risk per unit: $0.120 - $0.108 = $0.012
  
Position size = Risk / Risk per unit
              = $0.317 / $0.012
              = 26.4 SOL worth
```

### Profit/Loss Scenarios
```
Scenario 1: ALL TARGETS HIT (Best case)
  TP1 @ $0.135: +$0.15 (50% sold)
  TP2 @ $0.150: +$0.20 (30% sold)
  TP3 @ $0.165: +$0.30 (20% sold)
  Total: +$0.65 profit (6.5% ROI)
  Result: Account 15.86 → 16.51 SOL ✅

Scenario 2: TP1 then SL (Mixed)
  TP1 @ $0.135: +$0.15 (50% sold)
  SL @ $0.108: -$0.16 (50% remaining sold at loss)
  Total: -$0.01 loss
  Result: Account 15.86 → 15.85 SOL ⚠️

Scenario 3: SL HIT (Worst case, but limited)
  SL @ $0.108: -$0.32 (100% sold at stop loss)
  Total: -$0.32 loss
  Result: Account 15.86 → 15.54 SOL (limited loss) ✓
```

### What You See on Dashboard
```
Entry Executed:
  Activity Log: "✓ Trade: DOGE @ $0.120"
  Position: DOGE | 0.120 | 0.120 | $0 | LONG
  KPI Trades: 0 → 1

Taking Profits:
  Activity Log: "💰 TP1: Sold 50%, +$0.15"
  P&L: $0 → +$0.15
  Position: DOGE | 0.120 | 0.135 | +$0.15

All Closed:
  Activity Log: "✓ CLOSED: +$0.65 total"
  P&L: +$0.15 → +$0.65
  Position: Removed from list
  Equity: 15.86 → 16.51 SOL
  Win %: 100% (1 trade won)
```

---

## 🎯 TRADING GOALS FOR FIRST SESSION

### Conservative Approach (Learning)
- [ ] Complete startup without errors (5 min)
- [ ] See first signal appear (1-5 min)
- [ ] See first trade execute (5-10 min)
- [ ] Watch position management (10-20 min)
- [ ] See first trade close (20-30 min)
- [ ] Verify P&L updates correctly
- [ ] Stop and review what happened

### Active Approach (Testing)
- [ ] Complete startup (5 min)
- [ ] Watch 3-5 trades execute
- [ ] Monitor different entry/exit scenarios
- [ ] Verify activity log accuracy
- [ ] Check trade journal after session
- [ ] Calculate win rate manually

### Full Day (Validation)
- [ ] Run continuously for 4-8 hours
- [ ] Document all trades in separate file
- [ ] Verify equity curve matches P&L
- [ ] Check max drawdown
- [ ] Verify signal quality
- [ ] Ready for longer sessions

---

## ✅ SUCCESS CHECKLIST

After first trade closes, verify:

```
[ ] Activity log shows entry timestamp
[ ] Activity log shows exit timestamp
[ ] Profit/loss amount is correct
[ ] Position was removed from list
[ ] P&L metric updated in KPI
[ ] Equity curve shows the trade
[ ] Trade appears in trade-journal.csv
[ ] Win rate calculated correctly (or 100% if first trade)
[ ] Next signal detected automatically
[ ] Ready for next cycle
```

---

## 🎓 LEARNING CHECKLIST

```
After First 5 Trades, You Should Understand:

[ ] How signals are generated and displayed
[ ] How entry filters work (why some signals rejected)
[ ] How position size is calculated (risk %)
[ ] How SL/TP works (partially exit strategy)
[ ] How P&L is tracked in real-time
[ ] How equity curve reflects account growth
[ ] How to read activity log properly
[ ] What average trade duration is
[ ] What your win rate looks like
[ ] Whether you want to adjust risk level
```

---

## 🏁 YOU'RE READY! START NOW!

```
✅ HOME Dashboard: COMPLETE
✅ Signal Integration: COMPLETE
✅ Auto Trader: READY
✅ Risk Management: CONFIGURED
✅ Live Monitoring: ACTIVE

ACTION: Start 3 services → Open dashboard → Connect wallet → Click Auto

TIME TO FIRST TRADE: ~5 minutes
TIME TO FIRST CLOSE: ~20-30 minutes
TIME TO FIRST PROFIT: DEPENDS ON SIGNALS & BACKTEST QUALITY

GOOD LUCK! 🚀
```

---

**Print this page and keep it nearby while trading!**
**Bookmark: http://localhost:8000 for quick access**
**Most Important: Monitor the first 30 minutes carefully before leaving unattended!**

