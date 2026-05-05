# 🚀 SWITCHING TO LIVE MODE

## ⚠️ CRITICAL: Read This First!

Before switching `DRY_RUN: true` → `DRY_RUN: false`, make sure:

1. ✅ **Jupiter wallet connected** with your personal Solana wallet
2. ✅ **Sufficient SOL balance** (recommend 5+ SOL minimum, start with 2-3 SOL)
3. ✅ **Mainnet verified** (NOT testnet/devnet)
4. ✅ **Risk parameters reviewed** and acceptable to you
5. ✅ **Emergency exit procedure understood** (see below)

---

## 3-STEP SWITCH PROCESS

### Step 1: Backup Current Config
```bash
# Make a backup of auto-trader.js
cp auto-trader.js auto-trader.js.backup.$(date +%s)
```

### Step 2: Change DRY_RUN Flag

**File**: `auto-trader.js`  
**Line**: 50

**Before**:
```javascript
DRY_RUN: true,    // paper trading
```

**After**:
```javascript
DRY_RUN: false,   // LIVE REAL TRADING
```

### Step 3: Restart Auto Trader
```bash
# Kill existing process
pkill -f "node auto-trader"

# Wait 2 seconds
sleep 2

# Start fresh
node auto-trader.js
```

---

## CURRENT CONFIG (auto-trader.js lines 50-73)

```javascript
DRY_RUN           : true,      // ← CHANGE THIS TO false
PAPER_EQUITY      : 1000,      // ignored in live mode

// Risk Parameters
RISK_PER_TRADE_PCT: 1.5,       // 1.5% per trade
MAX_RISK_PCT      : 2.0,       // hard cap
MAX_OPEN_POSITIONS: 5,         // max concurrent trades
MAX_DAILY_LOSS_PCT: 5.0,       // stop if lose 5% today
MAX_DRAWDOWN_PCT  : 8.0,       // stop if drawdown > 8%
MAX_CONSECUTIVE_LOSS: 3,       // pause after 3 losses
```

### ⚠️ Risk Assessment

At **1.5% per trade** with **$15.86 wallet** (from earlier):
- Max loss per trade: **$0.24**
- With 5 max positions: **$1.19 max exposure**
- This is VERY risky. Recommend:

| Action | Risk Params | Description |
|--------|-------------|-------------|
| **SAFEST** | 0.5% per trade, 1 position max | Ultra conservative - start here |
| **SAFE** | 1.0% per trade, 2 positions max | Good for learning |
| **CURRENT** | 1.5% per trade, 5 positions max | Too aggressive for $15.86 wallet |

---

## RECOMMENDED: Conservative Start

Before going live with current config, consider lowering risk:

### Option A: Keep Current Config (Aggressive)
- Works if you plan to deposit more SOL soon
- Positions will be small due to wallet size
- Higher liquidation risk

### Option B: Reduce Risk (Recommended ⭐)
```javascript
// Line 59: Change this
RISK_PER_TRADE_PCT: 0.5,       // was 1.5%

// Line 60: Change this
MAX_RISK_PCT: 0.5,              // was 2.0%

// Line 62: Change this
MAX_OPEN_POSITIONS: 2,          // was 5

// Line 65: Change this
MAX_CONSECUTIVE_LOSS: 1,        // was 3
```

This means:
- Max loss per trade: **$0.08** (0.5% of $15.86)
- Max exposure: **$0.16** (2 positions × 0.08)
- More sustainable for small wallet

---

## MONITORING AFTER LIVE SWITCH

### Check 1: Verify Live Mode Activated
```bash
grep "DRY_RUN" auto-trader.js | head -1
# Should show: DRY_RUN: false,
```

### Check 2: Monitor First 10 Minutes
```bash
# Watch logs in real-time
tail -f auto-trader.log | grep -E "LIVE|TRADE|ERROR"
```

### Check 3: Watch Dashboard
- Open http://localhost:8000
- Go to "Auto Trader" tab
- Wallet should show REAL balance
- Equity should update from ACTUAL trades

### Check 4: First Trade Execution
When signal arrives:
1. Watch "Entry Filter" for acceptance
2. See "Executing ORDER" in logs
3. Trade appears in dashboard
4. Monitor SL/TP mechanics

---

## 🚨 EMERGENCY PROCEDURES

### If Something Goes Wrong

**Immediate Action** (within 10 seconds):
```bash
# Kill the bot immediately
pkill -f "node auto-trader"

# Check what happened
tail -50 auto-trader.log
```

**Manual Position Close**:
1. Go to Jupiter website (https://jup.ag/)
2. Connect wallet
3. Find open position manually
4. Close it directly in Jupiter UI

**Check for Slippage Issues**:
```bash
# Search logs for slippage errors
grep -i "slippage" auto-trader.log | tail -20
```

**Revert to Paper Trading**:
```bash
# Change line 50 back to:
DRY_RUN: true,

# Restart
pkill -f "node auto-trader"
sleep 2
node auto-trader.js
```

---

## 🟢 SUCCESS SIGNS

After switching to live mode:

- [ ] `DRY_RUN: false` confirmed in logs
- [ ] Wallet address displays in Bot Live Panel
- [ ] Real SOL balance shows (not $1000 paper equity)
- [ ] Status shows "LIVE MODE ENABLED"
- [ ] First signal gets accepted/rejected based on filters
- [ ] Trade executes on Jupiter when signal passes filters
- [ ] P&L updates with actual results

---

## 📊 WHAT TO EXPECT FIRST 24H

### Realistic Baseline (1.5% risk, 5 positions):
- **Win Rate**: 40-50% typical
- **Avg Trade P&L**: ±0.5-1.5% per trade
- **Best Case**: +2-3% profit (7-10 good trades)
- **Worst Case**: -2-3% loss (hits daily stop)

### With Conservative Config (0.5% risk, 2 positions):
- **Win Rate**: Similar 40-50%
- **Avg Trade P&L**: ±0.3-0.5% per trade
- **Best Case**: +0.8-1.5% profit
- **Worst Case**: -0.8-1.5% loss

---

## ❓ FAQ

**Q: Can I switch back to DRY_RUN?**
A: Yes, just change `false` back to `true` and restart. No data loss.

**Q: What if I deposit more SOL?**
A: Risk amounts automatically scale based on actual wallet balance. Just keep positions open and it adjusts.

**Q: How do I know if a trade is real vs simulated?**
A: Check `auto-trader.log`:
- LIVE: `[LIVE] Executing trade...`
- Paper: `[DRY_RUN] Simulating trade...`

**Q: What's the minimum wallet balance?**
A: Technically 0.1 SOL works, but:
- 0.1-1 SOL: Positions very tiny, mostly for learning
- 1-5 SOL: Good for testing, positions meaningful but small
- 5+ SOL: Comfortable for real trading

**Q: Can I use it on testnet first?**
A: Not easily. It's configured for Solana mainnet. To use testnet:
1. Edit RPC endpoints in proxy-server.js
2. Change Jupiter endpoints
3. Use testnet wallet with test SOL
(This requires more config changes - ask if you want to do this)

---

## NEXT: After Successful Switch

Once live mode is running and first trades execute:

1. **Monitor 24 hours** - let it trade normally
2. **Review metrics** - check P&L, win rate, drawdown
3. **Adjust if needed** - tighten stops, reduce risk if losses
4. **Scale up carefully** - add capital slowly (1 SOL at a time)

---

## ✅ CHECKLIST BEFORE CLICKING GO-LIVE

- [ ] Backup auto-trader.js with `.backup` extension
- [ ] Jupiter wallet connected to MAINNET
- [ ] Solana wallet shows real balance (not $1000)
- [ ] Minimum 2 SOL in wallet
- [ ] Risk parameters acceptable for wallet size
- [ ] Read emergency procedures above
- [ ] Dashboard accessible at http://localhost:8000
- [ ] Proxy server running (`tail -f proxy-server.log`)
- [ ] Signal bot running (`tail -f signal-bot.log`)
- [ ] Logs for auto-trader show clean startup

---

**Once all checked: Edit auto-trader.js line 50 and change DRY_RUN to false! 🚀**

