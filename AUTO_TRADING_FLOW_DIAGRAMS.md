# 🎯 AUTO-TRADING ARCHITECTURE DIAGRAM

## HIGH-LEVEL SYSTEM FLOW

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      CRYPTO SCANNER AUTO-TRADING SYSTEM                 │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │    SIGNAL GENERATION LAYER      │
                    ├─────────────────────────────────┤
                    │  signal-bot.js                  │
                    │  ├─ Market Analysis             │
                    │  ├─ Bullish % Detection         │
                    │  ├─ RSI/MA Signals              │
                    │  └─ Write to signals.json       │
                    └────────────┬────────────────────┘
                                 │ signals.json
                                 ▼
    ┌──────────────────────────────────────────────────────────────┐
    │                   AUTO-TRADING ENGINE LAYER                  │
    ├──────────────────────────────────────────────────────────────┤
    │  auto-trader.js (Node.js process)                            │
    │                                                              │
    │  [1] Poll signals.json every 30s                             │
    │      └─ Extract latest signal                               │
    │                                                              │
    │  [2] Evaluate Entry Filters                                  │
    │      ├─ Confidence > 50%? ✓                                 │
    │      ├─ R:R Ratio > 1.5? ✓                                  │
    │      ├─ Bullish % > 60%? ✓                                  │
    │      └─ If all ✓ → ACCEPT, else REJECT                      │
    │                                                              │
    │  [3] Calculate Trade Parameters                              │
    │      ├─ Position Size (from risk %)                         │
    │      ├─ SL Price (support level)                            │
    │      ├─ TP1/TP2/TP3 (from signal RR)                        │
    │      └─ Trailing Stop params                                │
    │                                                              │
    │  [4] Execute Trade                                           │
    │      ├─ Build Jupiter Swap parameters                       │
    │      ├─ Estimate slippage                                   │
    │      ├─ Send via proxy-server.js                            │
    │      └─ Commit transaction on Solana                        │
    │                                                              │
    │  [5] Position Management (LIVE)                              │
    │      ├─ Monitor SL → Auto-close if hit                      │
    │      ├─ Monitor TP1 → Partial exit 50%                      │
    │      ├─ Monitor TP2 → Exit 30%                              │
    │      ├─ Monitor TP3 → Exit final 20%                        │
    │      └─ Monitor trailing stop                               │
    │                                                              │
    │  [6] Update State                                            │
    │      ├─ Write to auto-trader-state.json                     │
    │      └─ Append to trade-journal.csv                         │
    │                                                              │
    └────────┬───────────────────────────────────────┬────────────┘
             │ auto-trader-state.json                │ proxy
             │ (state updates)                       │ (execute)
             ▼                                        ▼
    ┌──────────────────────┐            ┌───────────────────────────┐
    │  HOME Dashboard      │            │   Proxy Server + Jupiter  │
    │  (index.html)        │            │   (proxy-server.js)       │
    └──────────────────────┘            │   ├─ Solana RPC endpoint  │
             │                          │   ├─ Jupiter API bridge   │
             │ [UI Layer]               │   └─ Execute swaps        │
             │ ┌─────────────────────┐  │                          │
             │ │ waBotStartPolling() │  │   [Execution Layer]      │
             │ │ every 15 seconds    │──┼──→ /api/execute-trade    │
             │ └─────────────────────┘  │       ↓                   │
             │                          │   ┌─────────────────────┐ │
             │ ┌─────────────────────┐  │   │  Solana Blockchain  │ │
             │ │ Display:            │  │   │  (Actual Execution) │ │
             │ │ • lastTrade         │  │   └─────────────────────┘ │
             │ │ • lastSignal        │  │                          │
             │ │ • Activity log      │  │                          │
             │ │ • Equity curve      │  │                          │
             │ │ • Position list     │  │                          │
             │ │ • P&L metrics       │  │                          │
             │ └─────────────────────┘  │                          │
             │                          └───────────────────────────┘
             ▼
    ┌─────────────────────────┐
    │  USER INTERACTION       │
    ├─────────────────────────┤
    │ • View trade history    │
    │ • Adjust risk level     │
    │ • Toggle Manual/Auto    │
    │ • Connect wallet        │
    │ • Monitor live P&L      │
    └─────────────────────────┘
```

---

## DETAILED HOME DASHBOARD FLOW

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOME DASHBOARD (index.html)                  │
└─────────────────────────────────────────────────────────────────┘

USER OPENS DASHBOARD
    │
    ▼
┌──────────────────────────────────┐
│ Initialize Page (Lines 166-900)  │
├──────────────────────────────────┤
│ • Load localhost:8000            │
│ • Restore settings from storage  │
│ • Draw market radar              │
│ • Set up listeners               │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ WALLET CONNECTION PANEL                              │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [◎ Jupiter] ←─ USER CLICKS                         │
│      │                                              │
│      ├─ jupConnectWallet()                          │
│      │  └─ Opens Jupiter extension popup            │
│      │  └─ User approves in extension               │
│      │  └─ Returns wallet address (e.g., 8m3x...)  │
│      │                                              │
│      └─ saveWallet(addr, 'solana')                  │
│         ├─ Store in cs_wallet_addr                  │
│         ├─ Store chain in cs_wallet_chain           │
│         └─ Fetch balance from Solana RPC            │
│            (getBalance endpoint via proxy)          │
│                                                      │
│  WALLET DISPLAY                                     │
│  ├─ Address: 8m3x...7k2a                            │
│  ├─ Balance: 15.86 SOL                              │
│  ├─ Status: ✓ Connected                             │
│  └─ Network: Solana (Mainnet)                       │
│                                                      │
└──────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ TRADING CONFIG PANEL                                 │
├──────────────────────────────────────────────────────┤
│                                                      │
│  MODE SELECTOR                                      │
│  ┌─────────────┬─────────────┐                      │
│  │ ✋ Manual   │ ◉ Auto      │ ←─ USER CLICKS      │
│  └─────────────┴─────────────┘                      │
│         cs_wallet_mode = 'auto'                     │
│                                                      │
│  EXCHANGE TYPE                                      │
│  ┌──────┬──────────┬──────────┐                     │
│  │ DEX  │ CEX      │ Both     │                     │
│  └──────┴──────────┴──────────┘                     │
│         cs_wallet_exchange = 'DEX'                  │
│                                                      │
│  RISK LEVEL                                         │
│  ┌──────┬──────┬──────┐                             │
│  │ Low  │ Med  │ High │ ← USER SELECTS "Med"       │
│  │ 1%   │ 2%   │ 5%   │                             │
│  └──────┴──────┴──────┘                             │
│         cs_wallet_risk = 0.02                       │
│                                                      │
└──────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ waBotStartPolling() ACTIVATED (Lines 4940-4990)      │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Create interval: every 15 seconds                   │
│                                                      │
│ LOOP:                                               │
│  ├─ Check cs_wallet_mode → must be 'auto'           │
│  │                                                   │
│  ├─ Call waBotUpdateWalletStats()                   │
│  │  └─ Fetch SOL balance from Solana RPC            │
│  │  └─ Update display "15.23 SOL"                   │
│  │                                                   │
│  ├─ Fetch /api/auto-trader/state (from proxy)       │
│  │  └─ Get current auto-trader-state.json           │
│  │                                                   │
│  ├─ Process response data:                          │
│  │  │                                                │
│  │  ├─ if (data.lastTrade):                         │
│  │  │  ├─ waBotAddLog(`✓ Trade: ${symbol}`)         │
│  │  │  ├─ homeRadarSetState('buy' or 'sell')        │
│  │  │  ├─ Update P&L metrics                        │
│  │  │  └─ Trigger green/red burst animation        │
│  │  │                                                │
│  │  ├─ if (data.lastSignal):                        │
│  │  │  ├─ waBotAddLog(`📊 Signal: ${action}`)       │
│  │  │  └─ Trigger signal animation                  │
│  │  │                                                │
│  │  ├─ if (data.positions):                         │
│  │  │  ├─ Update positions list                     │
│  │  │  ├─ Show symbol, side, entry, P&L            │
│  │  │  └─ Refresh unrealized P&L                    │
│  │  │                                                │
│  │  └─ if (data.equity):                            │
│  │     └─ Update equity curve chart                 │
│  │                                                   │
│  └─ Sleep 15s, then repeat                          │
│                                                      │
└──────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────┐
│ REAL-TIME DASHBOARD DISPLAY                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│ KPI ROW                                              │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐         │
│ │Capital │ │ P&L    │ │ Win %  │ │Trades  │         │
│ │$10,000 │ │ +$234  │ │ 62%    │ │ 18     │         │
│ └────────┘ └────────┘ └────────┘ └────────┘         │
│                                                      │
│ CENTER: MARKET RADAR (canvas animation)             │
│  └─ Particle burst on trade execution               │
│  └─ Signal indicator (green/red)                    │
│                                                      │
│ RIGHT: ACTIVITY LOG                                  │
│  ├─ 14:23 ✓ Trade: DOGE @ $0.123                    │
│  ├─ 14:08 📊 Signal: LONG (78%)                     │
│  ├─ 13:45 ✓ Close: TP2 HIT                          │
│  ├─ 13:42 ⚠️  SL: Update to $0.110                  │
│  └─ ...                                             │
│                                                      │
│ BOTTOM: EQUITY CURVE                                │
│  └─ Real-time chart showing account growth          │
│  └─ Updates with every realized P&L                 │
│                                                      │
│ POSITIONS PANEL                                      │
│ ┌──────────────────────────────────────────┐        │
│ │ Symbol │ Entry  │ Current │ P&L   │ Side │        │
│ ├──────────────────────────────────────────┤        │
│ │ DOGE   │ 0.120 │ 0.125   │ +$48  │ LONG │        │
│ │ SOL    │ 140   │ 138     │ -$32  │ LONG │        │
│ └──────────────────────────────────────────┘        │
│                                                      │
│ BOT STATUS                                           │
│ └─ 🟢 BOT ACTIVE (Auto Mode, Risk: 2%)              │
│                                                      │
└──────────────────────────────────────────────────────┘
    │
    ▼
WAIT 15 SECONDS
    │
    ▼
REPEAT POLLING (Back to waBotStartPolling loop)
```

---

## SIGNAL GENERATION TO TRADE EXECUTION

```
┌────────────────────────────────────────────────────────────────┐
│                    SIGNAL-BOT.JS GENERATES SIGNAL               │
└────────────────────────────────────────────────────────────────┘
    │
    ├─ Analyze market conditions
    │  ├─ Calculate bullish %
    │  ├─ Check RSI levels
    │  ├─ Verify MA alignment
    │  └─ Compute reward:risk ratio
    │
    └─ Generate signal object:
        {
          timestamp: "2025-01-15T14:23:00Z",
          symbol: "DOGE",
          action: "LONG",
          confidence: 78,
          bullishPercent: 72,
          rewardRatio: 2.5,
          riskRatio: 1.0,
          entryPrice: 0.120,
          supportPrice: 0.108,    // SL
          targetPrice1: 0.135,
          targetPrice2: 0.150,
          targetPrice3: 0.165,
          description: "Strong bullish setup..."
        }
        │
        ▼ Write to signals.json
        
┌────────────────────────────────────────────────────────────────┐
│                  AUTO-TRADER.JS POLLS SIGNAL                   │
└────────────────────────────────────────────────────────────────┘
    │
    ├─ Every 30 seconds
    │  └─ Read signals.json
    │
    ├─ Extract latest signal
    │  └─ LONG DOGE at $0.120
    │
    ├─ Evaluate Entry Filters:
    │  ├─ ✓ Confidence (78) > MIN (50)
    │  ├─ ✓ Bullish % (72) > MIN (60)
    │  ├─ ✓ R:R Ratio (2.5) > MIN (1.5)
    │  └─ ✓ All filters pass!
    │
    ├─ DECISION: ACCEPT TRADE
    │  ├─ Read wallet risk % from localStorage
    │  │  └─ Risk per trade: 2% of $10,000 = $200
    │  │
    │  ├─ Calculate position size
    │  │  └─ Position value: $200 / (1.0% risk) = $20,000
    │  │  └─ Tokens to buy: $20,000 / $0.120 = ~166,667 DOGE
    │  │
    │  ├─ Build trade parameters
    │  │  ├─ Entry: $0.120 (now price)
    │  │  ├─ SL: $0.108 (support/signal.supportPrice)
    │  │  ├─ TP1: $0.135 (50% exit)
    │  │  ├─ TP2: $0.150 (30% exit)
    │  │  ├─ TP3: $0.165 (20% exit)
    │  │  └─ Trailing Stop: 5% below highest
    │  │
    │  └─ Send execution request
    │     │
    │     └─ Call proxy-server.js endpoint:
    │        POST /api/execute-trade
    │        └─ Body: {
    │             token: "DOGE",
    │             side: "LONG",
    │             amount: 166667,
    │             entryPrice: 0.120,
    │             slPrice: 0.108,
    │             tp1: 0.135,
    │             tp2: 0.150,
    │             tp3: 0.165
    │           }
    │
    └─ Update auto-trader-state.json:
        {
          lastTrade: {
            symbol: "DOGE",
            side: "LONG",
            entryPrice: 0.120,
            quantity: 166667,
            timestamp: "2025-01-15T14:23:05Z"
          },
          positions: [{
            symbol: "DOGE",
            side: "LONG",
            entryPrice: 0.120,
            quantity: 166667,
            slPrice: 0.108,
            tp1: 0.135,
            tp2: 0.150,
            tp3: 0.165,
            status: "OPEN"
          }],
          equity: 10234,
          totalPnL: 234
        }
        │
        ▼ Proxy server executes swap on Solana
        
┌────────────────────────────────────────────────────────────────┐
│                 SOLANA BLOCKCHAIN EXECUTION                    │
└────────────────────────────────────────────────────────────────┘
    │
    ├─ Build Jupiter swap transaction
    │  ├─ From: User's SOL wallet
    │  ├─ To: DEX (Jupiter route)
    │  ├─ Swap: $20,000 SOL → ~166,667 DOGE
    │  ├─ Slippage: 0.5%
    │  └─ Compute budget: 200k compute units
    │
    ├─ Simulate transaction
    │  └─ Check: Sufficient funds? ✓ Can execute? ✓
    │
    ├─ Sign transaction
    │  └─ Use Jupiter wallet signer (via extension)
    │
    ├─ Submit to blockchain
    │  └─ Broadcast to Solana RPC
    │
    ├─ Wait for confirmation
    │  └─ Slot finality: confirmed
    │
    └─ Return transaction hash
        │
        ▼ Response to auto-trader
        
┌────────────────────────────────────────────────────────────────┐
│             HOME DASHBOARD DETECTS TRADE VIA POLLING            │
└────────────────────────────────────────────────────────────────┘
    │
    ├─ waBotStartPolling() runs every 15 seconds
    │
    ├─ Fetch /api/auto-trader/state
    │  └─ Reads updated auto-trader-state.json
    │
    ├─ Find lastTrade present:
    │  {
    │    symbol: "DOGE",
    │    entryPrice: 0.120,
    │    timestamp: "2025-01-15T14:23:05Z"
    │  }
    │
    ├─ HOME Dashboard Actions:
    │  ├─ waBotAddLog("✓ Trade: DOGE @ $0.120")
    │  ├─ homeRadarSetState('buy', 2000)
    │  │  └─ Trigger green burst animation
    │  ├─ Update KPI metrics
    │  │  └─ Trade count: 18 → 19
    │  └─ Show in activity log
    │
    └─ User sees live execution!
        └─ 14:23 ✓ Trade: DOGE @ $0.120
```

---

## POSITION MANAGEMENT LOOP

```
AFTER TRADE EXECUTION, AUTO-TRADER MONITORS POSITION
    │
    ├─ Every 5 seconds (config.CHECK_PRICE_INTERVAL):
    │  │
    │  └─ Fetch current DOGE price from DEX
    │     └─ Current: $0.125 (entry was $0.120, +4.1%)
    │
    ├─ Compare with levels:
    │  │
    │  ├─ Entry: $0.120 ✓ (reference)
    │  ├─ SL: $0.108 ❌ (not hit, price above)
    │  ├─ TP1: $0.135 ❌ (not hit yet)
    │  ├─ TP2: $0.150 ❌ (not hit yet)
    │  ├─ TP3: $0.165 ❌ (not hit yet)
    │  ├─ Trailing Stop: $0.119 (max price - 5%)
    │  │
    │  └─ ALL GOOD - Position still open
    │
    └─ Continue monitoring...
    
    ▼ [5 minutes later]
    
    Current price: $0.135 (hit TP1!)
    │
    ├─ TP1 TRIGGERED
    │  ├─ Action: Sell 50% of position
    │  ├─ Sell amount: 166,667 * 0.5 = 83,333 DOGE
    │  ├─ Expected proceeds: $11,249 (83,333 * $0.135)
    │  ├─ Realized P&L: +$1,249 (50% of position)
    │  │
    │  ├─ Execute sell via Jupiter
    │  │  └─ Transaction sent → confirmed
    │  │
    │  └─ Update position:
    │     ├─ Remaining: 83,334 DOGE (50%)
    │     ├─ Status: TP1_PARTIAL_EXIT
    │     ├─ Average entry still: $0.120
    │     └─ Trailing stop now: $0.128 (max so far)
    │
    ├─ Update auto-trader-state.json
    │  └─ lastTrade: "DOGE TP1 hit, 50% exit"
    │
    └─ HOME dashboard polling detects:
        ├─ Activity log: "💰 TP1: Sold 50%, +$1,249"
        ├─ Equity update: $10,000 → $11,249
        └─ Position update: Remaining 83,334 DOGE
        
    ▼ [Continue monitoring remaining 50%]
    
    Current price: $0.165 (hit TP3!)
    │
    ├─ TP3 TRIGGERED
    │  ├─ Action: Sell final 20%
    │  ├─ Sell amount: 83,334 DOGE
    │  ├─ Expected proceeds: $13,750 (83,334 * $0.165)
    │  ├─ Realized P&L: +$4,250 (final 20%)
    │  │
    │  └─ Position is now CLOSED
    │
    ├─ Trade Summary:
    │  ├─ TP1 Exit: +$1,249 (50%)
    │  ├─ TP2 Exit: +$2,750 (30%)
    │  ├─ TP3 Exit: +$4,250 (20%)
    │  ├─ Total Profit: +$8,249
    │  ├─ ROI: +82.5%
    │  └─ Status: CLOSED
    │
    ├─ Update journal
    │  └─ Append trade to trade-journal.csv
    │
    └─ HOME dashboard shows:
        ├─ Activity log: "✓ CLOSED: All targets hit! +$8,249"
        ├─ Equity: $11,249 → $18,249
        ├─ Position removed from open list
        ├─ P&L Chart: Shows equity spike
        └─ Trade added to journal
        
    ▼ READY FOR NEXT SIGNAL
    └─ Wait for signal-bot to generate new signal...
```

---

## LOCAL STORAGE SCHEMA

HOME Dashboard uses localStorage to persist settings:

```javascript
// Wallet configuration
cs_wallet_addr       // e.g., "8m3x...7k2a"
cs_wallet_chain      // "solana" or "ethereum"
cs_wallet_exchange   // "DEX" | "CEX" | "Both"
cs_wallet_mode       // "manual" | "auto"
cs_wallet_risk       // 0.01, 0.02, or 0.05

// Trading journal
cs_journal_v1        // Array of manual trades [{...}]

// UI state
cs_home_tab          // Current active tab
cs_home_refresh      // Last refresh timestamp
```

Auto-trader.js reads these values to configure itself:

```javascript
// auto-trader.js startup
const walletAddr = localStorage.getItem('cs_wallet_addr');
const mode = localStorage.getItem('cs_wallet_mode');     // 'auto' = trading on
const riskPerTrade = localStorage.getItem('cs_wallet_risk'); // 0.02 = 2% risk
const exchange = localStorage.getItem('cs_wallet_exchange'); // 'DEX' or 'CEX'

// Then polls every 30 seconds and respects these values
```

---

## COMPLETE TRADING WORKFLOW FROM START TO FINISH

```
[USER ACTION] Open dashboard
    ↓
[SYSTEM] Load index.html (HTTP server 8000)
    ↓
[USER ACTION] Connect Jupiter wallet
    ├─ Click "◎ Jupiter" button
    ├─ Approve in Jupiter extension
    ├─ Address saved to localStorage
    └─ SOL balance fetched
    ↓
[USER ACTION] Click "Auto" mode
    ├─ cs_wallet_mode = 'auto'
    ├─ waBotStartPolling() starts
    └─ 🟢 BOT ACTIVE status shows
    ↓
[USER ACTION] Select risk level "Med 2%"
    ├─ cs_wallet_risk = 0.02
    └─ Auto-trader reads this value
    ↓
[SYSTEM] waBotStartPolling() runs every 15s
    ├─ Fetches wallet balance
    ├─ Fetches auto-trader state
    ├─ Updates activity log
    └─ Refreshes positions display
    ↓
[SIGNAL-BOT] Generates signal (every 30-60 seconds)
    ├─ Analyzes market
    ├─ Creates signal object
    └─ Writes to signals.json
    ↓
[AUTO-TRADER] Polls signals.json (every 30s)
    ├─ Reads signal
    ├─ Evaluates filters
    ├─ If all pass → execute trade
    ├─ Call proxy to execute Jupiter swap
    └─ Update auto-trader-state.json
    ↓
[HOME DASHBOARD] Detects trade (next poll in 15s)
    ├─ Activity log: "✓ Trade executed"
    ├─ Radar animates (green burst)
    ├─ Metrics update
    └─ Position shows in list
    ↓
[AUTO-TRADER] Monitors position (every 5s)
    ├─ Check SL, TP1, TP2, TP3
    ├─ If hit → execute exit
    └─ Update state
    ↓
[HOME DASHBOARD] Detects position update (next poll)
    ├─ Activity log: "💰 TP1 hit"
    ├─ Equity curve updates
    ├─ P&L recalculates
    └─ Position status changes
    ↓
[AUTO-TRADER] Closes final position
    ├─ All targets hit or SL triggered
    ├─ Trade complete
    └─ Journal updated
    ↓
[HOME DASHBOARD] Shows final result
    ├─ Activity log: "✓ CLOSED"
    ├─ Equity increased
    ├─ Position removed
    └─ Trade in journal
    ↓
REPEAT: Wait for next signal → back to step [SIGNAL-BOT]
```

---

## COMMUNICATION PROTOCOL

### 1. Signal Bot → Auto Trader
```
FILE: signals.json
Format: JSON array

[
  {
    "timestamp": "2025-01-15T14:23:00Z",
    "symbol": "DOGE",
    "action": "LONG",
    "confidence": 78,
    "bullishPercent": 72,
    "rewardRatio": 2.5,
    "riskRatio": 1.0,
    "entryPrice": 0.120,
    "supportPrice": 0.108,
    "targetPrice1": 0.135,
    "targetPrice2": 0.150,
    "targetPrice3": 0.165
  },
  // ... older signals
]
```

### 2. Auto Trader → Home Dashboard
```
FILE/API: auto-trader-state.json
Access via: GET /api/auto-trader/state (proxy)

{
  "mode": "auto",
  "status": "trading",
  "wallet": "8m3x...7k2a",
  "equity": 10234,
  "totalPnL": 234,
  "lastTrade": {
    "symbol": "DOGE",
    "side": "LONG",
    "entryPrice": 0.120,
    "quantity": 166667,
    "timestamp": "2025-01-15T14:23:05Z"
  },
  "lastSignal": {
    "symbol": "DOGE",
    "action": "LONG",
    "confidence": 78,
    "timestamp": "2025-01-15T14:23:00Z"
  },
  "positions": [
    {
      "symbol": "DOGE",
      "side": "LONG",
      "entryPrice": 0.120,
      "quantity": 166667,
      "currentPrice": 0.125,
      "unrealizedPnL": 833,
      "slPrice": 0.108,
      "tp1": 0.135,
      "tp2": 0.150,
      "tp3": 0.165,
      "status": "OPEN"
    }
  ],
  "recentTrades": [
    // last 10 closed trades
  ]
}
```

### 3. Home Dashboard → Auto Trader (via localStorage)
```
localStorage:
- cs_wallet_mode: "auto" or "manual"
- cs_wallet_risk: 0.01, 0.02, or 0.05
- cs_wallet_exchange: "DEX", "CEX", or "Both"

Auto-trader reads these on startup and polls loop
```

### 4. Auto Trader → Jupiter (via Proxy)
```
Proxy Server acts as bridge:

POST /api/execute-trade
Body: {
  "token": "DOGE",
  "side": "LONG",
  "amount": 166667,
  "slippage": 0.5,
  "slPrice": 0.108,
  "tp1": 0.135,
  "tp2": 0.150,
  "tp3": 0.165
}

Response: {
  "txHash": "5qc1...",
  "status": "confirmed",
  "actualAmount": 166400,
  "actualPrice": 0.1202
}
```

---

## MONITORING CHECKLIST

When HOME dashboard is running, you should see:

- [ ] Wallet address displayed (8m3x...7k2a)
- [ ] SOL balance showing (15.86 SOL)
- [ ] "🟢 BOT ACTIVE" status visible
- [ ] Activity log with timestamps
- [ ] Market radar animating
- [ ] KPI metrics updating
- [ ] Signal count incrementing (every 30-60s)
- [ ] Equity curve existing (flat if no trades yet)
- [ ] Positions panel (empty if no open trades)
- [ ] P&L showing (0 if no trades yet)

When auto-trader is executing:

- [ ] Activity log shows trade execution
- [ ] Radar green burst animates
- [ ] Position appears in positions list
- [ ] Unrealized P&L updates
- [ ] Equity curve shows spike

When trade closes:

- [ ] Activity log shows "CLOSED"
- [ ] Position removed from list
- [ ] Realized P&L added to total
- [ ] Equity curve updated
- [ ] Trade added to journal

---

**If you see all these checkmarks, your auto-trading is FULLY OPERATIONAL! 🚀**
