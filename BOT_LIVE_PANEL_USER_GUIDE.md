# 🤖 Bot Live Panel - User Guide

## 📱 Visual Overview

### Before: Mode: Manual
```
┌─────────────────────────────────────────────┐
│ 🔘 Mode: Manual    📊 Signal    ⚙️ Config  │
│                                             │
│ Wallet Panel (Minimal - Connected only)    │
│ Address: 1a2b...c3d4                       │
│ Chain: solana                               │
│ Status: Siap digunakan                     │
└─────────────────────────────────────────────┘
```

### After: Mode: Auto (Wallet Live Panel)
```
┌──────────────────────────────────────────────────────────────┐
│ 🔘 Mode: Auto    📊 Signal    ⚙️ Config                      │
│                                                               │
│ ├─────── WALLET AUTO STATUS ───────────────────────────────┤
│ │                                                            │
│ │  🟢 BOT AKTIF — Monitoring sinyal...    📊 3 sinyal      │
│ │  ─────────────────────────────────────────────────────   │
│ │
│ │  ┌─────────────┬──────────────┬──────────────┐            │
│ │  │SOL Balance  │Wallet        │Connection    │            │
│ │  │─────────────│──────────────│──────────────│            │
│ │  │5.1234 SOL   │1a2b...c3d4   │✓ Connected   │            │
│ │  │≈ $430.54    │              │Siap          │            │
│ │  │             │              │monitoring    │            │
│ │  └─────────────┴──────────────┴──────────────┘            │
│ │
│ │  📋 Activity Log                          [Clear]         │
│ │  ─────────────────────────────────────────────────────   │
│ │  [10:30:45] 🤖 Bot polling dimulai                       │
│ │  [10:30:46] ✓ Saldo: 5.1234 SOL                         │
│ │  [10:30:50] ✓ Trade: BTC/USDT @ $43000                  │
│ │  [10:31:01] 📊 Sinyal: BUY (95%)                        │
│ │  [10:31:15] ✓ Saldo: 5.1234 SOL                         │
│ │  ...scrollable feed...                                    │
│ │
│ └────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────┘
```

---

## 🚀 Step-by-Step Usage

### 1️⃣ Connect Your Wallet

```
1. Open app at http://localhost:8000
2. Go to "WALLET" tab
3. Click "Connect Wallet via Jupiter"
4. Approve wallet connection in Jupiter popup
5. Verify address appears in wallet panel
```

**What happens behind the scenes:**
- Wallet address saved to `localStorage` as `cs_wallet_addr`
- Chain saved as `cs_wallet_chain` (normalized to `'solana'`)
- Wallet panel updates with address

---

### 2️⃣ Switch to Mode: Auto

```
1. Click button: Mode: Auto
2. Watch wallet panel EXPAND to show live monitoring
3. See "🟢 BOT AKTIF" status with green dot
4. Notice activity log starts populating
```

**What happens:**
- Mode saved to `localStorage` as `cs_wallet_mode = 'auto'`
- Polling starts (15-second refresh cycle)
- First entry appears: "🤖 Bot polling dimulai"

---

### 3️⃣ Watch Real-time Data

```
Polling Cycle (every 15 seconds):
├─ [1] Fetch Solana wallet balance
│  ├─ Shows: "5.1234 SOL" (balance)
│  └─ Shows: "≈ $430.54" (USD equivalent @ ~$84/SOL)
│
├─ [2] Check connection status
│  └─ Shows: "✓ Connected" (green checkmark)
│
└─ [3] Fetch bot state (trades, signals)
   ├─ If trade executed: "✓ Trade: BTC/USDT @ $43000"
   └─ If signal generated: "📊 Sinyal: BUY (95%)"
```

**Activity Log Colors:**
- 🟢 **Green** = Success (balance updated, trade executed)
- 🔴 **Red** = Error (connection failed, timeout)
- ⚪ **Gray** = Info (bot started, polling cycle)
- 🟡 **Yellow** = Warning (not used yet)

---

### 4️⃣ Clear Log (Optional)

```
1. Click "[Clear]" button in Activity Log header
2. Log entries disappear
3. Shows placeholder: "Log bersih — bot siap monitoring"
```

---

### 5️⃣ Switch Back to Manual Mode

```
1. Click button: Mode: Manual
2. Watch wallet panel COLLAPSE back to minimal view
3. See final entry: "⏹ Polling berhenti"
4. Polling stops (no more RPC calls)
```

---

## 🔍 What Each Panel Section Shows

### Status Header
```
┌──────────────────────────────────────────────────┐
│ 🟢 BOT AKTIF — Monitoring sinyal...  📊 3 sinyal│
└──────────────────────────────────────────────────┘
 ↑                ↑                        ↑
 Animated         Current status          Signal
 pulse dot        message                 count badge
```

**Status Colors:**
- 🟢 Green = Bot actively monitoring
- ⏸️ Gray = Paused (when mode ≠ auto)

---

### Wallet Stats Grid (3 Columns)

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| **SOL Balance** | **Wallet Address** | **Connection Status** |
| 5.1234 SOL | 1a2b...c3d4 | ✓ Connected |
| ≈ $430.54 | (truncated) | Siap monitoring |

**Updates:** Every 15s (when polling active)
**Data Source:** Solana RPC (getBalance endpoint)
**Timeout:** 5 seconds (shows "-" if timeout)

---

### Activity Log

```
┌─────────────────────────────────────────┐
│ 📋 Activity Log              [Clear]    │
├─────────────────────────────────────────┤
│ [HH:MM:SS] message...                   │
│ [HH:MM:SS] message...                   │
│ [HH:MM:SS] message...                   │
│ ...scrollable up to 15 entries...       │
└─────────────────────────────────────────┘
```

**Features:**
- Auto-scrolls to show latest entries first
- Max 15 entries (older ones auto-removed)
- Timestamp in HH:MM:SS format
- Color-coded by message type
- Manual clear button

**Example Messages:**
```
[10:30:45] 🤖 Bot polling dimulai
[10:30:46] ✓ Saldo: 5.1234 SOL
[10:30:50] ✓ Trade: BTC/USDT @ $43000
[10:31:01] 📊 Sinyal: BUY (95%)
[10:31:15] ✓ Saldo: 5.1234 SOL
[10:31:30] Error fetch balance: timeout
```

---

## 🔄 Polling Lifecycle

### State Machine

```
                    ┌─────────────────┐
                    │   DISCONNECTED  │
                    │   (No wallet)   │
                    └────────┬────────┘
                             │
                    [Connect wallet]
                             │
                    ┌────────▼────────┐
                    │   CONNECTED     │
                    │  (Manual mode)  │
                    └────────┬────────┘
                             │
                    [Switch to Auto]
                             │
                    ┌────────▼─────────────┐
                    │ POLLING ACTIVE      │
                    │ ┌──────────────────┐│
                    │ │ Every 15 seconds:││
                    │ │ • Fetch RPC     ││
                    │ │ • Log events    ││
                    │ │ • Update UI     ││
                    │ └──────────────────┘│
                    └────────┬────────────┘
                             │
                    [Switch to Manual]
                             │
                    ┌────────▼────────┐
                    │   CONNECTED     │
                    │  (Manual mode)  │
                    └─────────────────┘
```

---

## 📊 Real-World Example Timeline

```
10:30:00 — User switches to Mode: Auto
┣─ Panel expands, "🤖 Bot polling dimulai"
┣─ First RPC call fetches balance

10:30:02 — RPC responds with balance
┣─ Shows: "5.1234 SOL" + "≈ $430.54"
┣─ Logs: "✓ Saldo: 5.1234 SOL"

10:30:15 — Second polling cycle (15s interval)
┣─ RPC call #2 (balance check again)
┣─ Shows same balance (no change)
┣─ Logs: "✓ Saldo: 5.1234 SOL"

10:30:30 — Bot executes trade
┣─ Auto-trader sends data to /api/auto-trader/state
┣─ Polling detects trade & logs: "✓ Trade: BTC/USDT @ $43000"

10:30:45 — Third polling cycle
┣─ RPC call #3
┣─ Balance may have changed (shows new SOL/USD)

10:31:00 — Trading generates signal
┣─ Polling detects signal & logs: "📊 Sinyal: BUY (95%)"

10:31:15 — Fourth polling cycle
┣─ RPC call continues...

10:35:00 — User clicks Mode: Manual
┣─ Polling stops immediately
┣─ Final log: "⏹ Polling berhenti"
┣─ Panel collapses back to minimal
```

---

## 🎯 What's Being Monitored

### Wallet Balance
- **Source:** Solana RPC (api.mainnet-beta.solana.com)
- **Frequency:** Every 15 seconds (when polling active)
- **Displays:** SOL amount + USD equivalent
- **Timeout:** 5 seconds
- **Format:** "5.1234 SOL" + "≈ $430.54"

### Bot Activity
- **Source:** `/api/auto-trader/state` endpoint
- **Frequency:** Every 15 seconds
- **Displays:** Recent trades + signals
- **Timeout:** 3 seconds
- **Resilient:** Continues even if endpoint unavailable

### Connection Status
- **Check:** Wallet address exists + valid
- **Display:** "✓ Connected" or "✗ Not connected"
- **Update Frequency:** Every polling cycle

---

## 🛠️ Troubleshooting

### Q: Balance shows "-" or doesn't update
**A:** Check these:
```
1. Is wallet address valid? (Check localStorage → cs_wallet_addr)
2. Is Solana RPC online?
   curl https://api.mainnet-beta.solana.com -X POST
3. Does wallet have SOL? (Maybe balance is 0?)
4. Check browser console for errors (F12 → Console)
5. Try manual fetch in console:
   waBotUpdateWalletStats()
```

### Q: Polling doesn't start after Mode: Auto
**A:** Check:
```
1. Is wallet connected? (See address in panel)
2. Open console: console.log(_waBotPoll)
   Should show setInterval ID (number), not null
3. Check localStorage: console.log(localStorage.getItem('cs_wallet_mode'))
   Should be 'auto'
4. Any JavaScript errors? (F12 → Console → Red messages)
```

### Q: Activity log is empty
**A:**
```
1. Auto-trader may not be running or executing trades yet
2. Manual test in console: waBotAddLog('test', 'success')
3. Check if /api/auto-trader/state endpoint exists
   curl http://localhost/api/auto-trader/state
```

### Q: Panel disappears when I switch modes
**A:** This is normal! When mode ≠ auto:
```
1. Polling stops (no more updates)
2. Panel shows minimal view
3. Switch back to Auto to resume monitoring
```

---

## 💾 Local Data Persistence

When you refresh the page:
```
localStorage saves:
├─ cs_wallet_addr → Wallet address stays connected
├─ cs_wallet_chain → Chain stays as 'solana'
└─ cs_wallet_mode → Mode stays as 'auto'
    └─ Polling will auto-resume! (if was active)
```

---

## 📱 Mobile Responsiveness

Panel is designed to work on:
- ✅ Desktop (full width)
- ✅ Tablet (responsive grid)
- ✅ Mobile (stacked layout if needed)

**Note:** Scrollable activity log works on all devices.

---

## 🔐 Security Notes

### Data Transmitted:
- ✅ Your wallet address (public, no private key)
- ✅ RPC calls to Solana (standard API, no auth needed)
- ✅ No private keys sent
- ✅ No API keys transmitted

### Local Storage:
- Wallet address: ✅ Safe (public info)
- Mode setting: ✅ Safe (user preference)
- No sensitive data stored

---

## 🎓 Learning Path

### New User:
1. Read this guide
2. Connect wallet
3. Switch to Auto mode
4. Watch activity log for 1-2 minutes
5. Check localStorage in DevTools

### Developer:
1. Read `BOT_LIVE_PANEL_DOCS.md` (technical API details)
2. Check `IMPLEMENTATION_SUMMARY.md` (code architecture)
3. Inspect functions in browser console
4. Run: `node test-bot-live-panel.js` (verification)

---

## 📞 Quick Console Commands

### Check polling status:
```javascript
console.log(_waBotPoll);  // null = stopped, ID = running
```

### View all logs:
```javascript
console.log(_waBotLogs);  // Array of log objects
```

### Add test log:
```javascript
waBotAddLog('Test message', 'success');
```

### Check wallet connection:
```javascript
console.log({
    addr: localStorage.getItem('cs_wallet_addr'),
    chain: localStorage.getItem('cs_wallet_chain'),
    mode: localStorage.getItem('cs_wallet_mode')
});
```

### Manual wallet update:
```javascript
waBotUpdateWalletStats();  // Fetch balance immediately
```

### Start/stop polling:
```javascript
waBotStartPolling();  // Start 15s cycle
waBotStopPolling();   // Stop cycle
```

---

## 🚀 Next Steps

✅ Bot Live Panel is now active!

**Try it:**
1. Open http://localhost:8000
2. Connect wallet
3. Switch to Mode: Auto
4. Watch real-time updates

**Questions?**
- Check `BOT_LIVE_PANEL_DOCS.md` for technical details
- Open DevTools (F12) to inspect data
- Try console commands above

Selamat monitoring! 🎯

