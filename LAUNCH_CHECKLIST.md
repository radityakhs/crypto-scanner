# ✅ LIVE TRADING LAUNCH CHECKLIST

## 🎯 PRE-LAUNCH VERIFICATION (Do These First)

### System Requirements
- [ ] Node.js v14+ installed (`node --version`)
- [ ] npm packages installed (`npm list | grep -i [package-name]`)
- [ ] Proxy server running (`ps aux | grep proxy-server`)
- [ ] Signal bot running (`ps aux | grep signal-bot`)
- [ ] Dashboard accessible (`curl http://localhost:8000`)

### Wallet & Network
- [ ] Jupiter wallet extension installed in browser
- [ ] Wallet connected to **MAINNET** (not devnet/testnet)
- [ ] Wallet shows real SOL balance
- [ ] Minimum 2 SOL in wallet (recommend 5+)
- [ ] No pending transactions showing "Processing..."

### Browser & Dashboard
- [ ] Open http://localhost:8000 in browser
- [ ] "Auto Trader" tab visible
- [ ] Connected wallet address displays
- [ ] Current SOL balance shows (not $1000)
- [ ] No JavaScript console errors (check F12)

---

## 📋 AUTO-TRADER.JS CONFIGURATION

### File Locations
- [ ] Located at: `/Users/radityakusuma/Documents/crypto-scanner/auto-trader.js`
- [ ] Backup created: `auto-trader.js.backup.[timestamp]`
- [ ] File readable/writable

### Core Settings (Lines 45-85)
- [ ] **Line 50**: `DRY_RUN: false` ← CRITICAL - Change to false for LIVE
- [ ] **Line 54**: `PROXY_HOST: '127.0.0.1'`
- [ ] **Line 55**: `PROXY_PORT: 3001`

### Risk Parameters (Lines 59-73) - Choose One
**If wallet >= 10 SOL:**
- [ ] RISK_PER_TRADE_PCT: 1.0 or 1.5
- [ ] MAX_OPEN_POSITIONS: 3-5
- [ ] MAX_DAILY_LOSS_PCT: 5.0

**If wallet 2-10 SOL:**
- [ ] RISK_PER_TRADE_PCT: 0.5 (RECOMMENDED)
- [ ] MAX_OPEN_POSITIONS: 2
- [ ] MAX_DAILY_LOSS_PCT: 2-3

**If wallet < 2 SOL:**
- [ ] RISK_PER_TRADE_PCT: 0.3
- [ ] MAX_OPEN_POSITIONS: 1
- [ ] MAX_DAILY_LOSS_PCT: 1.0

---

## 🚀 LAUNCH PROCEDURE

### Step 1: Pre-Flight Check (5 min)
```bash
# Verify proxy running
ps aux | grep proxy-server

# Verify signal bot running  
ps aux | grep signal-bot

# Check for errors
tail -20 proxy-server.log
tail -20 signal-bot.log
```
- [ ] Both services show in process list
- [ ] No error lines in logs
- [ ] All checks pass

### Step 2: Backup Critical Files (1 min)
```bash
# Create timestamp-labeled backup
cp auto-trader.js auto-trader.js.backup.$(date +%Y%m%d_%H%M%S)

# Verify backup exists
ls -la auto-trader.js.backup.*
```
- [ ] Backup file created successfully
- [ ] File size matches original (>100KB)

### Step 3: Edit Configuration (2 min)
**In auto-trader.js:**
1. Go to line 50
2. Find: `DRY_RUN: true,`
3. Change to: `DRY_RUN: false,`
4. Save (Ctrl+S / Cmd+S)
5. Verify in editor that change saved

- [ ] Line 50 shows `DRY_RUN: false,`
- [ ] File saved (no asterisk in tab)
- [ ] Risk parameters checked/adjusted

### Step 4: Restart Auto Trader (2 min)
```bash
# Kill old process
pkill -f "node auto-trader"

# Wait 2 seconds
sleep 2

# Start fresh - in foreground so you can monitor
node auto-trader.js
```

- [ ] Process killed successfully
- [ ] New process starts cleanly
- [ ] No immediate errors in console

### Step 5: Verify Live Mode (1 min)
Look for these exact messages in the terminal:
```
[LIVE] LIVE MODE ENABLED - REAL TRADING ACTIVE
[INFO] Connected to Proxy at 127.0.0.1:3001
[INFO] Wallet loaded: <your-wallet-address>
[INFO] Starting polling...
```

- [ ] LIVE MODE message appears
- [ ] Wallet address displays
- [ ] No "ERROR" or "CRITICAL" messages
- [ ] Polling interval shows "30 sec"

---

## 🖥️ DASHBOARD VERIFICATION

### Open Dashboard (1 min)
```
URL: http://localhost:8000
Click: "Auto Trader" tab
```

Check these items:

**Wallet Section:**
- [ ] Connected wallet address shows
- [ ] Shows real SOL balance (not "$1000.00")
- [ ] Balance matches Jupiter wallet

**Status Section:**
- [ ] Status shows "LIVE MODE ENABLED"
- [ ] Proxy status "Connected"
- [ ] Last signal time shows recent timestamp

**Activity Log:**
- [ ] Timestamps updating (not frozen)
- [ ] Activity entries appearing (entries refresh every 30 sec)

---

## 📊 FIRST TRADE PREPARATION

### Understand the Flow
1. Signal bot generates signal
2. Auto trader receives signal
3. Entry filter evaluates (confidence, bullish%, RR ratio)
4. If accepted: Execute trade via proxy → Jupiter
5. Monitor: Trailing stop, SL/TP levels
6. Exit: Manual close or automatic at SL/TP

### Know Your Limits
- [ ] Max loss per trade understood
- [ ] Daily loss limit known
- [ ] Drawdown limit known
- [ ] Can close all positions manually if needed

### Establish Emergency Procedures
- [ ] Know how to kill bot: `pkill -f "node auto-trader"`
- [ ] Know how to close position manually in Jupiter
- [ ] Have Discord/Telegram alert setup (if available)
- [ ] Know how to revert to DRY_RUN if needed

---

## 🟢 GO/NO-GO DECISION

### GO LIVE if All Checked:
- [ ] System checks passed (7/7)
- [ ] Configuration verified (all values set)
- [ ] Backup created and verified
- [ ] Live mode confirmed in logs
- [ ] Dashboard shows real balance
- [ ] Understand all risk parameters
- [ ] Emergency procedures memorized
- [ ] Wallet has sufficient SOL (2+ minimum)
- [ ] Ready to monitor first 24 hours

### DO NOT GO LIVE if Any Issues:
- [ ] Dashboard not loading
- [ ] Wallet balance shows $1000 (paper mode indicator)
- [ ] Configuration file has errors
- [ ] Proxy or signal bot not running
- [ ] Uncertain about any risk parameter
- [ ] Insufficient SOL balance
- [ ] Haven't created backup

---

## ⚠️ CRITICAL DURING FIRST TRADE

### When Signal Arrives (First 2 minutes)
1. **Watch Dashboard Activity Log** - signal should appear
2. **Monitor Entry Filter Evaluation**:
   - See acceptance or rejection reason
   - If rejected: Normal, system working correctly
3. **If Accepted - Watch Execution**:
   - Should see "Executing REAL order..." message
   - Check for any errors
4. **Confirm Trade Executed**:
   - Check dashboard: new position appears
   - Check Jupiter wallet: open position shows
   - Check auto-trader.log: "LIVE EXECUTED" message

### If Something Goes Wrong:
```bash
# IMMEDIATE ACTION - Kill process
pkill -f "node auto-trader"

# Then investigate
tail -100 auto-trader.log | grep -A5 -B5 ERROR
```

---

## 📈 MONITORING CHECKLIST

### Every 30 Minutes (First Hour)
- [ ] Dashboard still shows live mode
- [ ] Recent activity visible (not frozen)
- [ ] P&L updates if position open
- [ ] Logs showing polling activity

### Every 4 Hours (First Day)
- [ ] Multiple trades executed (or zero if no good signals)
- [ ] No repeated errors in logs
- [ ] Daily P&L tracking accurately
- [ ] Drawdown within limits

### Daily (Ongoing)
- [ ] Check morning: overnight positions closed?
- [ ] Review: win rate, average P&L
- [ ] Verify: no circuit breakers hit
- [ ] Decide: continue or adjust parameters?

---

## 📝 LOGGING & RECORD KEEPING

### Auto Trader Logs
```bash
# View live logs
tail -f auto-trader.log

# Search for trades
grep "EXECUTED\|ENTRY\|EXIT" auto-trader.log

# Find errors
grep "ERROR\|CRITICAL" auto-trader.log
```

### Dashboard Records
- [ ] Screenshot initial balance
- [ ] Screenshot first trade
- [ ] Note time of first trade
- [ ] Record daily P&L

### Trade Journal
- [ ] Manual: Update any trades in dashboard journal
- [ ] Systematic: Auto trader logs in auto-trader-state.json

---

## 🛑 EMERGENCY PROCEDURES

### If Bot Misbehaves:
1. Kill immediately: `pkill -f "node auto-trader"`
2. Check logs: `tail -200 auto-trader.log`
3. Close positions manually in Jupiter
4. Fix issue before restarting

### If Experiencing Losses:
1. Don't panic - normal part of trading
2. Review last 5 trades in logs
3. Check if SL/TP working correctly
4. Verify risk parameters are correct
5. Consider reducing position size
6. Continue monitoring

### If System Crash/Shutdown:
1. Restart: `node auto-trader.js`
2. Monitor: Dashboard should show same positions
3. Check: Positions still open in Jupiter
4. Verify: State file not corrupted

### If Wallet Gets Locked:
1. Don't try to force trade
2. Kill bot: `pkill -f "node auto-trader"`
3. Wait: Let wallet settle
4. Check: Jupiter for stuck transactions
5. Restart: Try again after 2 minutes

---

## ✨ SUCCESS CRITERIA - FIRST 24H

Consider it successful if:
- ✅ At least 1 real trade executed
- ✅ No system crashes or unrecoverable errors
- ✅ P&L tracking accurately
- ✅ SL/TP working as intended
- ✅ Can manually close positions
- ✅ Dashboard reflects actual trades
- ✅ No funds missing

Any of above fails:
- ⚠️ Review logs to understand why
- ⚠️ Fix issue
- ⚠️ Switch back to DRY_RUN for testing
- ⚠️ Try again

---

## 📞 AFTER FIRST 24 HOURS

Review these metrics:
- [ ] Total trades executed: _____
- [ ] Win rate: _____%
- [ ] Total P&L: _____ SOL
- [ ] Largest win: _____ SOL
- [ ] Largest loss: _____ SOL
- [ ] Max drawdown: _____%

If positive: Consider scaling up capital ✅
If negative: Review trades and adjust parameters ⚠️
If no trades: Signals not triggering - review thresholds

---

## 🎉 CONGRATULATIONS!

If you've checked everything above and traded live, you've successfully:
- ✅ Set up production trading system
- ✅ Connected real wallet
- ✅ Executed real trades
- ✅ Managed risk properly
- ✅ Monitored live performance

**Next Goal:** Consistency - achieving positive P&L over 30+ days

**Remember:** Small consistent wins beat big risky moves. Trade safe!

---

**Last Updated**: Current session
**Document Version**: 1.0
**For Questions**: See README_LIVE_TRADING.md or LIVE_MODE_SWITCH.md

