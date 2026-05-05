# 🚀 REAL TRADING SETUP — Jupiter Solana Integration

**Status**: READY FOR LIVE EXECUTION  
**Target Chain**: Solana  
**Target Wallet**: Jupiter (Personal)  
**Trading Exchange**: DEX on Solana (Jupiter Swap, Raydium, etc.)  
**Date**: March 30, 2026

---

## 📋 CHECKLIST BEFORE GO LIVE

### Phase 0: Pre-Launch Safety (CRITICAL!)
- [ ] **Backup wallet private key** — Store in secure location
- [ ] **Start with SMALL position size** — Not full capital
- [ ] **Test on devnet first** (optional but recommended)
- [ ] **Review all trading parameters** — Risk settings, position size
- [ ] **Monitor API rate limits** — Jupiter, Solana RPC
- [ ] **Check gas fees** — SOL balance for transactions
- [ ] **Enable 2FA/backup codes** — If wallet has security

---

## 🔧 CONFIGURATION

### Step 1: Enable LIVE MODE in `auto-trader.js`

**Current Setting** (Line 50):
```javascript
DRY_RUN: true,    // ← CHANGE TO false
```

**Change To**:
```javascript
DRY_RUN: false,   // LIVE TRADING ENABLED
```

### Step 2: Adjust Risk Parameters

**Recommended Starting Config** (Lines 53-73):
```javascript
RISK_PER_TRADE_PCT: 0.5,      // ← Start LOW: 0.5-1% per trade
MAX_RISK_PCT      : 1.0,      // Hard cap at 1%
MAX_OPEN_POSITIONS: 2,        // ← Start with 2 positions max
MAX_DAILY_LOSS_PCT: 3.0,      // ← Stop if lose 3% today
MAX_DRAWDOWN_PCT  : 5.0,      // ← Stop if drawdown > 5%
MAX_CONSECUTIVE_LOSS: 2,      // ← Pause after 2 losses
```

### Step 3: Capital Setup

**Two Options**:

**Option A: Use Current Solana Balance** (Recommended)
- Auto trader akan detect wallet balance via RPC
- Start with available SOL in Jupiter wallet
- Risk per trade = (SOL balance × RISK_PER_TRADE_PCT)

**Option B: Set Fixed Initial Capital**
Modify Line 51:
```javascript
PAPER_EQUITY: 5.0,  // Start with 5 SOL only
```

---

## 🔑 WALLET INTEGRATION

### Jupiter Wallet Connection (Already Setup)

Your app already has Jupiter integration:
```javascript
// From index.html
async function jupConnectWallet() {
    const provider = window?.jupiter || window?.phantom?.solana || ...
    const pubkey = await provider.connect()
    localStorage.setItem('cs_wallet_addr', pubkey)
    localStorage.setItem('cs_wallet_chain', 'solana')
}
```

**What This Does**:
1. ✅ Detects Jupiter wallet extension
2. ✅ Requests permission to connect
3. ✅ Stores wallet address in localStorage
4. ✅ Enables transaction signing

---

## 🚀 EXECUTION FLOW

### Auto Trader → Jupiter Swap Flow

```
Signal Bot (signals.json)
    ↓
Auto Trader (auto-trader.js)
    ├─ Risk check ✓
    ├─ Entry filter ✓
    └─→ Proxy Server (3001)
        └─→ Jupiter SDK
            ├─ Quote swap best route
            ├─ Build transaction
            ├─ Sign with Jupiter wallet
            └─→ Submit to Solana network
                └─→ Confirm on-chain
```

### Trade Lifecycle

```
1. NEW SIGNAL detected
   ↓
2. Entry filter (confidence, RR, age check)
   ↓
3. Position size calculation
   ├─ Wallet balance × RISK_PER_TRADE_PCT
   ├─ Account for gas fees (~0.005 SOL per tx)
   └─ Confirm not exceeding MAX_OPEN_POSITIONS
   ↓
4. ENTRY ORDER EXECUTED
   ├─ Get Jupiter quote for swap
   ├─ Build transaction with SL/TP prices
   ├─ Sign with wallet
   └─ Wait for confirmation
   ↓
5. POSITION MONITORING
   ├─ Track entry price vs current price
   ├─ Update unrealized P&L
   ├─ Check Stop Loss
   ├─ Check Take Profit (TP1/TP2/TP3)
   └─ Activate trailing stop at +1.5%
   ↓
6. EXIT STRATEGY
   ├─ TP1: Close 50% at TP1 price
   ├─ TP2: Close 30% at TP2 price
   ├─ TP3: Close 20% at TP3 price
   ├─ SL: Exit if hit stop loss
   └─ Trailing SL: Protect profit
   ↓
7. RECORD TRADE
   ├─ Save to auto-trader-state.json
   ├─ Calculate realized P&L
   ├─ Update equity curve
   └─ Log to dashboard
```

---

## ⚠️ RISK MANAGEMENT

### Built-in Safety Mechanisms

1. **Position Size Limiter**
   - Max position: `(RISK_PER_TRADE_PCT % × total equity)`
   - Never risk more than `MAX_RISK_PCT` (1%)

2. **Circuit Breaker**
   - Stops trading if daily loss > `MAX_DAILY_LOSS_PCT` (3%)
   - Stops trading if drawdown > `MAX_DRAWDOWN_PCT` (5%)
   - Pauses 1 hour after `MAX_CONSECUTIVE_LOSS` (2 losses)

3. **Stop Loss & Take Profit**
   - Automatic SL at entry - (risk distance)
   - Tiered TP: 50% / 30% / 20%
   - Trailing SL activates at +1.5% profit

4. **Gas Fee Protection**
   - Reserves ~0.005 SOL for each transaction
   - Won't trade if gas > position profit

---

## 📊 MONITORING DASHBOARD

### Real-Time Metrics (Auto-Update)

**Home Dashboard Shows**:
- 💰 Wallet Balance: Current SOL balance
- 📈 Equity Curve: Cumulative P&L
- 🎯 Open Positions: Active trades
- 📊 Win Rate: % of profitable trades
- 🔴 Daily Loss: Loss so far today
- ⚠️ Circuit Status: Active/Paused

**Bot Live Panel Shows**:
- ✅ Connection Status
- 🤖 Last Trade: Symbol @ price
- 📊 Signal Activity: Real-time signals
- 📋 Activity Log: Trade events

---

## 🔍 TROUBLESHOOTING

### Common Issues

| Issue | Solution |
|-------|----------|
| **Wallet not detected** | Install Jupiter extension, refresh page |
| **Transaction failed** | Check SOL balance (need for gas) |
| **No trades executing** | Check MIN_CONFIDENCE, MIN_RR settings |
| **Slow execution** | Jupiter RPC throttling — wait or check network |
| **Gas too high** | Wait for lower congestion period |
| **Circuit breaker triggered** | Loss limit hit — will resume tomorrow 00:00 UTC |

### Emergency Procedures

**If wrong trade executed**:
1. Click "Close All" in Auto Trader tab
2. Manual close in Jupiter app as backup
3. Review logs to find issue

**If bot not responding**:
1. `pkill -f "node auto-trader"`
2. Check logs: `tail -100 auto-trader.log`
3. Restart: `node auto-trader.js`

---

## 📈 FIRST TRADE WALKTHROUGH

### Expected Sequence

```
1. Open http://localhost:8000
   ↓
2. Connect Jupiter wallet (Home tab)
   - Click "◎ Jupiter"
   - Approve connection
   - Shows: "0x... connected to Solana"
   ↓
3. Set wallet mode to AUTO
   - Click "Mode: Auto"
   - Shows: "Monitoring X signals"
   ↓
4. Start auto-trader
   - Terminal: node auto-trader.js
   - Shows: "🔴 LIVE TRADING mode"
   ↓
5. Wait for signal
   - Signal Terminal shows new signal
   - Bot evaluates: confidence, RR, age
   ↓
6. TRADE EXECUTED! 🎉
   - Activity Log shows: "✓ Trade: BTC @ $50000"
   - Radar animation triggers
   - Position appears in "Open Positions"
   ↓
7. Monitor until exit
   - Watch P&L update every 10 sec
   - See TP1/TP2/TP3 hits or SL trigger
```

---

## 🛡️ LIVE TRADING BEST PRACTICES

### DO ✅
- ✅ Start with small position size (0.5-1 SOL)
- ✅ Monitor first 10 trades closely
- ✅ Review logs daily
- ✅ Adjust risk based on results
- ✅ Keep wallet funded for gas
- ✅ Document all settings changes

### DON'T ❌
- ❌ Skip safety checks before go-live
- ❌ Risk more than 1-2% per trade
- ❌ Leave bot unattended for 24h
- ❌ Change settings during active trades
- ❌ Trade during extreme volatility
- ❌ Hold all capital in hot wallet

---

## 📞 SUPPORT CHECKLIST

**Before asking for help, verify**:
- [ ] Wallet is connected to correct network
- [ ] Has sufficient SOL for gas (~0.05 SOL minimum)
- [ ] Signal Bot is running (`node signal-bot.js`)
- [ ] Proxy is running (`node binance-proxy.js`)
- [ ] Auto Trader shows "LIVE TRADING" in logs
- [ ] No circuit breaker active

---

## 🎯 SUCCESS METRICS

### Track These Metrics Weekly

```
Win Rate:     Target > 50%
Profit Factor: Target > 1.5
Max Drawdown: Target < 10%
Daily Loss:    Target < 5%
Avg Trade:     Should be positive
```

If metrics trending negative → Pause trading → Review settings → Adjust

---

## 🔐 SECURITY REMINDERS

1. **Never share private key** — Only Jupiter extension handles it
2. **Whitelist RPC endpoint** — Only call from localhost
3. **Review transactions** — Check that Jupiter approval is for correct swap
4. **Monitor gas usage** — High fees mean market stress
5. **Backup seed phrase** — If Jupiter wallet lost, can restore

---

## 📝 NEXT STEPS

1. **Save this file** — Reference for troubleshooting
2. **Change DRY_RUN to false** in `auto-trader.js`
3. **Review settings above** — Adjust risk to your comfort level
4. **Start with 1-2 SOL** — Small amount to test execution
5. **Monitor first 24h** — Watch dashboard closely
6. **Document results** — Keep notes for optimization

---

**Good luck! 🚀 Ready to trade?**

Questions? Check logs:
- `tail -200 auto-trader.log`
- Browser console (F12)
- Signal Terminal for signal details

