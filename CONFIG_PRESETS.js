// REAL TRADING CONFIG PRESETS
// Copy & paste ke auto-trader.js CONFIG section sesuai kebutuhan
// ==============================================================

// ============================================
// PRESET 1: ULTRA CONSERVATIVE (Recommended for first time)
// ============================================
/*
const CONFIG = {
    DRY_RUN           : false,
    PAPER_EQUITY      : 1000,        // ignored in LIVE
    
    PROXY_HOST        : '127.0.0.1',
    PROXY_PORT        : 3001,
    
    RISK_PER_TRADE_PCT: 0.5,         // Very small: 0.5% per trade
    MAX_RISK_PCT      : 0.5,         // Hard cap 0.5%
    MAX_OPEN_POSITIONS: 1,           // Only 1 position at a time!
    MAX_CORRELATED    : 1,
    
    MAX_DAILY_LOSS_PCT: 2.0,         // Stop if lose 2% today
    MAX_DRAWDOWN_PCT  : 3.0,         // Stop if drawdown > 3%
    MAX_CONSECUTIVE_LOSS: 1,         // Pause after 1 loss
    
    MIN_CONFIDENCE    : 50,          // High confidence only
    MIN_BULLISH       : 65,
    MIN_BEARISH       : 65,
    MIN_RR            : 2.0,         // Need 2:1 risk:reward
    MIN_EV            : 0.5,         // Positive expectancy required
    MAX_SIGNAL_AGE_MIN: 15,          // Fresh signals only
    
    TP1_CLOSE_PCT     : 50,
    TP2_CLOSE_PCT     : 30,
    TP3_CLOSE_PCT     : 20,
    
    TRAIL_ACTIVATE_PCT: 2.0,         // Activate trailing stop at +2%
    TRAIL_DISTANCE_PCT: 1.0,         // Conservative trailing distance
    
    POLL_INTERVAL_MS  : 30_000,
    PRICE_CHECK_MS    : 10_000,
    
    SIGNALS_FILE      : path.join(__dirname, 'signals.json'),
    STATE_FILE        : path.join(__dirname, 'auto-trader-state.json'),
    LOG_FILE          : path.join(__dirname, 'auto-trader.log'),
};
*/

// ============================================
// PRESET 2: CONSERVATIVE (Safe for live trading)
// ============================================
/*
const CONFIG = {
    DRY_RUN           : false,
    PAPER_EQUITY      : 1000,
    
    PROXY_HOST        : '127.0.0.1',
    PROXY_PORT        : 3001,
    
    RISK_PER_TRADE_PCT: 1.0,         // 1% per trade
    MAX_RISK_PCT      : 1.0,
    MAX_OPEN_POSITIONS: 2,           // Max 2 positions
    MAX_CORRELATED    : 1,
    
    MAX_DAILY_LOSS_PCT: 3.0,         // Stop if lose 3% today
    MAX_DRAWDOWN_PCT  : 5.0,         // Stop if drawdown > 5%
    MAX_CONSECUTIVE_LOSS: 2,         // Pause after 2 losses
    
    MIN_CONFIDENCE    : 40,
    MIN_BULLISH       : 60,
    MIN_BEARISH       : 60,
    MIN_RR            : 1.5,
    MIN_EV            : 0.0,         // Breakeven OK
    MAX_SIGNAL_AGE_MIN: 30,
    
    TP1_CLOSE_PCT     : 50,
    TP2_CLOSE_PCT     : 30,
    TP3_CLOSE_PCT     : 20,
    
    TRAIL_ACTIVATE_PCT: 1.5,
    TRAIL_DISTANCE_PCT: 0.8,
    
    POLL_INTERVAL_MS  : 30_000,
    PRICE_CHECK_MS    : 10_000,
    
    SIGNALS_FILE      : path.join(__dirname, 'signals.json'),
    STATE_FILE        : path.join(__dirname, 'auto-trader-state.json'),
    LOG_FILE          : path.join(__dirname, 'auto-trader.log'),
};
*/

// ============================================
// PRESET 3: MODERATE (For experienced traders)
// ============================================
/*
const CONFIG = {
    DRY_RUN           : false,
    PAPER_EQUITY      : 1000,
    
    PROXY_HOST        : '127.0.0.1',
    PROXY_PORT        : 3001,
    
    RISK_PER_TRADE_PCT: 1.5,         // 1.5% per trade
    MAX_RISK_PCT      : 1.5,
    MAX_OPEN_POSITIONS: 3,           // Max 3 positions
    MAX_CORRELATED    : 2,
    
    MAX_DAILY_LOSS_PCT: 5.0,
    MAX_DRAWDOWN_PCT  : 8.0,
    MAX_CONSECUTIVE_LOSS: 3,
    
    MIN_CONFIDENCE    : 30,
    MIN_BULLISH       : 55,
    MIN_BEARISH       : 55,
    MIN_RR            : 1.3,
    MIN_EV            : -0.2,        // Allow slight negative EV
    MAX_SIGNAL_AGE_MIN: 45,
    
    TP1_CLOSE_PCT     : 50,
    TP2_CLOSE_PCT     : 30,
    TP3_CLOSE_PCT     : 20,
    
    TRAIL_ACTIVATE_PCT: 1.5,
    TRAIL_DISTANCE_PCT: 0.8,
    
    POLL_INTERVAL_MS  : 30_000,
    PRICE_CHECK_MS    : 10_000,
    
    SIGNALS_FILE      : path.join(__dirname, 'signals.json'),
    STATE_FILE        : path.join(__dirname, 'auto-trader-state.json'),
    LOG_FILE          : path.join(__dirname, 'auto-trader.log'),
};
*/

// ============================================
// PRESET 4: AGGRESSIVE (For advanced traders only!)
// ============================================
/*
const CONFIG = {
    DRY_RUN           : false,
    PAPER_EQUITY      : 1000,
    
    PROXY_HOST        : '127.0.0.1',
    PROXY_PORT        : 3001,
    
    RISK_PER_TRADE_PCT: 2.0,         // 2% per trade (max allowed!)
    MAX_RISK_PCT      : 2.0,
    MAX_OPEN_POSITIONS: 5,           // Max 5 positions
    MAX_CORRELATED    : 2,
    
    MAX_DAILY_LOSS_PCT: 8.0,         // More room for loss
    MAX_DRAWDOWN_PCT  : 10.0,
    MAX_CONSECUTIVE_LOSS: 4,
    
    MIN_CONFIDENCE    : 20,
    MIN_BULLISH       : 50,
    MIN_BEARISH       : 50,
    MIN_RR            : 1.2,
    MIN_EV            : -0.5,
    MAX_SIGNAL_AGE_MIN: 60,
    
    TP1_CLOSE_PCT     : 40,          // Different TP allocation
    TP2_CLOSE_PCT     : 40,
    TP3_CLOSE_PCT     : 20,
    
    TRAIL_ACTIVATE_PCT: 1.0,         // Tighter trailing
    TRAIL_DISTANCE_PCT: 0.5,
    
    POLL_INTERVAL_MS  : 30_000,
    PRICE_CHECK_MS    : 10_000,
    
    SIGNALS_FILE      : path.join(__dirname, 'signals.json'),
    STATE_FILE        : path.join(__dirname, 'auto-trader-state.json'),
    LOG_FILE          : path.join(__dirname, 'auto-trader.log'),
};
*/

// ============================================
// HOW TO USE THESE PRESETS
// ============================================
/*

1. Open auto-trader.js

2. Find the CONFIG section (around line 49)

3. Replace the ENTIRE CONFIG object with one of the presets above

4. Uncomment the chosen preset (remove /* at start and */ at end)

5. Save file

6. Restart auto-trader

EXAMPLE - To use PRESET 1 (ULTRA CONSERVATIVE):

   Before:
   --------
   const CONFIG = {
       DRY_RUN: true,
       PAPER_EQUITY: 1000,
       ...
   };

   After:
   ------
   const CONFIG = {
       DRY_RUN: false,       // ← LIVE ENABLED
       PAPER_EQUITY: 1000,
       RISK_PER_TRADE_PCT: 0.5,
       ...
   };

*/

// ============================================
// PARAMETER EXPLANATION
// ============================================
/*

DRY_RUN: boolean
  • true = paper trading (fake money, no real execution)
  • false = REAL TRADING (actual on-chain execution)

RISK_PER_TRADE_PCT: number (0.1 - 2.0)
  • How much % of total capital to risk per trade
  • Lower = safer but smaller profits
  • 1% = if you have 10 SOL, max loss per trade is 0.1 SOL

MAX_RISK_PCT: number
  • Hard limit on risk per trade (safety ceiling)
  • Should equal or exceed RISK_PER_TRADE_PCT

MAX_OPEN_POSITIONS: number (1-5)
  • How many trades can be open simultaneously
  • 1 = safest (only 1 trade at a time)
  • 5 = max allowed by system

MAX_DAILY_LOSS_PCT: number (1-10)
  • If daily loss exceeds this, stop trading for rest of day
  • Lower = more conservative

MAX_DRAWDOWN_PCT: number (1-15)
  • If largest peak-to-trough loss exceeds this, pause trading
  • Protects against losing all capital

MAX_CONSECUTIVE_LOSS: number (1-5)
  • After N losses in a row, pause for 1 hour
  • Helps prevent "revenge trading"

MIN_CONFIDENCE: number (20-80)
  • Only accept signals with confidence >= this value
  • Higher = fewer but higher-quality signals

MIN_BULLISH / MIN_BEARISH: number (50-75)
  • For LONG trades: need >= MIN_BULLISH % bullish
  • For SHORT trades: need >= MIN_BEARISH % bearish
  • Higher = more conviction needed

MIN_RR (Risk:Reward ratio): number (1.0-2.5)
  • Minimum reward for every $ risked
  • 1.5 = if risk $100, must reward $150+
  • Higher = better trades but fewer opportunities

MIN_EV (Expected Value): number (-1.0 to +1.0)
  • Positive = expected profit over many trades
  • Negative = might lose money long-term
  • Higher = better odds but harder to achieve

*/

module.exports = {}; // Empty export to make this valid JS

