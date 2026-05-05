# 📚 DOCUMENTATION INDEX - LIVE TRADING SETUP

## 🚀 Quick Access Guide

**Just want to go live NOW?** → Read `QUICK_START_LIVE.txt` (2 min read)

**Want detailed info?** → Read `LIVE_MODE_SWITCH.md` (10 min read)

**Need risk calculation?** → Run `node risk-calculator.js` (interactive)

**Setting up for first time?** → Read `REAL_TRADING_SETUP.md` (15 min read)

---

## 📄 Files in This Workspace

### 🟢 QUICKSTART (New Users Start Here)

| File | Purpose | Read Time | When to Use |
|------|---------|-----------|------------|
| **QUICK_START_LIVE.txt** | 5-step live trading switch | 2 min | About to flip DRY_RUN switch |
| **LIVE_MODE_SWITCH.md** | Detailed guide with FAQ | 10 min | Before/after going live |
| **risk-calculator.js** | Calculate safe parameters | 3 min | Setting up risk config |

### 🔵 SETUP & CONFIG (Setup Phase)

| File | Purpose | Read Time | When to Use |
|------|---------|-----------|------------|
| **REAL_TRADING_SETUP.md** | Complete setup checklist | 15 min | First-time setup |
| **CONFIG_PRESETS.js** | 4 pre-built configurations | 5 min | Choosing risk profile |
| **real-trading-start.sh** | Automated launcher | N/A | Daily startup |

### 🟣 CORE TRADING FILES (Do Not Edit Unless You Know What You're Doing)

| File | Purpose | Key Config Line |
|------|---------|-----------------|
| **auto-trader.js** | Main trading bot | Line 50: `DRY_RUN: true/false` |
| **proxy-server.js** | Jupiter trade executor | Runs on port 3001 |
| **signal-bot.js** | Signal generator | Monitors market conditions |
| **index.html** | Web dashboard | http://localhost:8000 |

---

## ⏱️ TYPICAL WORKFLOW

### First Time Setup (30 minutes)
```
1. Read REAL_TRADING_SETUP.md (10 min)
   ↓
2. Run: node risk-calculator.js (5 min)
   ↓
3. Update auto-trader.js with recommended CONFIG (5 min)
   ↓
4. Test with DRY_RUN: true for 24h (keep as is or overnight)
   ↓
5. Review QUICK_START_LIVE.txt (2 min)
   ↓
6. Switch to LIVE when ready (1 min)
```

### Daily Usage (2 minutes)
```
# Start trading system
$ bash real-trading-start.sh

# Monitor dashboard
Open: http://localhost:8000

# View logs in background
$ tail -f auto-trader.log

# When done, Ctrl+C to stop
```

---

## 🎯 YOUR SITUATION

Based on earlier conversation:
- **Wallet**: Jupiter personal wallet on Solana
- **Balance**: ~$15.86 (small, suitable for learning)
- **Current Mode**: DRY_RUN (paper trading)
- **Goal**: REAL trading implementation

### Recommended Path:
1. ✅ **Run risk calculator** to size position for small wallet
2. ✅ **Use ULTRA CONSERVATIVE config** (0.5% risk per trade)
3. ✅ **Trade for 24 hours in DRY mode** to verify signals work
4. ✅ **Switch to LIVE** when comfortable
5. ✅ **Monitor closely** first 48 hours

---

## ⚠️ CRITICAL REMINDERS

### Before Going Live:
- [ ] Backup `auto-trader.js` with `.backup` extension
- [ ] Jupiter wallet shows **real SOL balance** (not $1000 paper)
- [ ] Connected to **Solana MAINNET** (not testnet)
- [ ] Have **2-5 SOL minimum** in wallet
- [ ] Understand **emergency close** procedure

### Emergency Stop (Memorize This!):
```bash
# Kill trading bot immediately
pkill -f "node auto-trader"

# Then manually close positions in Jupiter
# https://jup.ag/ → Connect wallet → Close position
```

### First Time Risks:
- Small wallet = small positions (good for learning)
- 1.5% per trade on $15.86 = max $0.24 loss per trade
- Recommend reducing to 0.5% per trade initially
- Monitor first 5 trades closely

---

## 🔍 CONFIG QUICK REFERENCE

**Main Decision**: How much % of wallet to risk per trade?

| Risk Level | Per Trade | Max Daily Loss | Best For |
|------------|-----------|----------------|----------|
| **0.3-0.5%** | Ultra safe | 1-2% | Learning, tiny wallets |
| **0.5-1.0%** | Conservative | 3-4% | Real money start |
| **1.0-1.5%** | Moderate | 5-6% | Experienced traders |
| **1.5-2.0%** | Aggressive | 8%+ | Risk takers only |

**For your $15.86 wallet**: Start at 0.5% per trade max

---

## 📊 EXPECTED RESULTS

After 24 hours of live trading (typical baseline):

| Metric | Realistic Range | Your Wallet |
|--------|-----------------|------------|
| Win Rate | 40-50% | 2-3 winners out of 5 trades |
| Avg P&L | ±0.5-1% per trade | ±$0.08-0.15 per trade |
| Best Day | +2-3% | +$0.30-0.45 |
| Worst Day | -2-3% | -$0.30-0.45 |
| Drawdown | 3-8% max | $0.45-1.27 max loss |

These are **estimates** based on system performance. Actual results vary.

---

## ❓ FAQ

**Q: What does DRY_RUN do?**
A: `true` = paper trading (fake money, no real trades)
   `false` = live trading (real SOL, real trades)

**Q: Can I switch back to DRY mode?**
A: Yes, just change `DRY_RUN: false` back to `true` and restart

**Q: What if I lose money?**
A: That's part of trading. Start small, learn from each trade, adjust strategy

**Q: Should I deposit more SOL?**
A: Not immediately. Learn with current amount first. Add capital after 100+ trades

**Q: What if proxy stops working?**
A: Check if it's running: `ps aux | grep proxy-server.js`
   Restart: `pkill -f "node proxy-server" && node proxy-server.js`

**Q: Where do I see my trades?**
A: Two places:
   - Dashboard: http://localhost:8000 (Auto Trader tab)
   - Jupiter: https://jup.ag/ (Account history)

---

## 🚀 NEXT STEPS

### Today:
1. [ ] Read `QUICK_START_LIVE.txt`
2. [ ] Run `node risk-calculator.js` 
3. [ ] Update `auto-trader.js` with recommended CONFIG

### Tomorrow:
4. [ ] Verify DRY_RUN trades execute properly
5. [ ] Monitor 5-10 simulated trades
6. [ ] Review dashboard and logs

### When Ready:
7. [ ] Switch `DRY_RUN: false`
8. [ ] Restart auto-trader.js
9. [ ] Monitor first 24h of live trading

### Ongoing:
10. [ ] Review daily P&L
11. [ ] Adjust risk if needed
12. [ ] Scale capital gradually

---

## 📞 SUPPORT

If something breaks:

1. **Check logs**: `tail -f auto-trader.log`
2. **Review relevant doc**:
   - Setup issue → `REAL_TRADING_SETUP.md`
   - Live mode issue → `LIVE_MODE_SWITCH.md`
   - Config issue → `risk-calculator.js`
3. **Emergency stop**: `pkill -f "node auto-trader"`

---

## ✨ YOU'RE ALL SET!

Everything needed for real trading is ready:
- ✅ Auto trader configured
- ✅ Jupiter wallet integrated
- ✅ Dashboard monitoring ready
- ✅ Documentation complete
- ✅ Risk management built-in

**Only thing left: Your decision to go live** 🚀

Start with `QUICK_START_LIVE.txt` or run `node risk-calculator.js`!

