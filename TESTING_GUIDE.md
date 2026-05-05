# Visual Testing Guide - Wallet Persistence Fixes

**Quick Reference for Testing All 5 Features**

---

## 🏠 Feature 1: Home Tab is Default

### Before Fix ❌
```
Page Load
  ↓
Shows: Crypto Scanner Tab (not what user wants!)
```

### After Fix ✅
```
Page Load
  ↓
Shows: Home Tab (with Bot Live Panel, wallet tracker)
```

**How to verify:**
1. Open page in new browser window
2. First tab should be **Home** (not Scanner)
3. You should see:
   - 🟢 Bot Live Panel
   - 💰 Wallet Tracker section
   - 📊 Trading Journal
   - Not the Crypto Scanner table

---

## 📑 Feature 2: Tab Persistence

### Before Fix ❌
```
User Action          Page State          After Refresh
──────────────────   ─────────────       ──────────────
1. On Home tab       → Home visible      → Always: Scanner!
2. Click "Scanner"   → Scanner visible   → Always: Scanner!
3. Click "Portfolio" → Portfolio visible → Always: Scanner! 😱
```

### After Fix ✅
```
User Action          Page State          After Refresh
──────────────────   ─────────────       ──────────────
1. On Home tab       → Home visible      → Home visible ✅
2. Click "Scanner"   → Scanner visible   → Scanner visible ✅
3. Click "Portfolio" → Portfolio visible → Portfolio visible ✅
```

**How to verify:**
1. Open page → Click "Crypto Scanner" tab
2. Press `F5` to refresh
3. ✅ You should STAY on Crypto Scanner tab
4. Click "Portfolio" tab
5. Press `F5`
6. ✅ You should STAY on Portfolio tab

---

## 👤 Feature 3: Wallet Connection Persistence

### Before Fix ❌
```
Action                          localStorage     After Refresh
──────────────────────────      ──────────────   ─────────────
Connect Jupiter wallet          ✅ Saved         ❌ Lost!
  Address: 7UcWs...fxaZ9
  Chain: solana
  
Result: Need to reconnect after every refresh 😤
```

### After Fix ✅
```
Action                          localStorage     After Refresh
──────────────────────────      ──────────────   ─────────────
Connect Jupiter wallet          ✅ Saved         ✅ Restored!
  Address: 7UcWs...fxaZ9
  Chain: solana
  
Result: Wallet stays connected, no re-connect needed ✅
```

**How to verify:**
1. On Home tab, click "◎ Jupiter" button (or Ethereum button)
2. Connect wallet (if already connected, you'll see address)
3. You should see: `7UcWs...fxaZ9` and `◎ Solana` badge
4. Press `F5` to refresh
5. ✅ Wallet should STILL be showing as connected
6. ✅ Chain should STILL show as `Solana` (not Ethereum!)

**Correct Output:**
```
✅ Wallet: 7UcWs...fxaZ9
✅ Chain: ◎ Solana    (NOT ⟠ Ethereum)
```

---

## 🏦 Feature 4: Exchange Selection Persistence

### Before Fix ❌
```
Home Tab Panel:
─────────────────────────────────
├── Exchange Selector
│   ├── OKX      ← Default
│   ├── Binance
│   └── DEX

Action                 State After          After Refresh
──────────────────     ────────────────     ──────────────
Click "Binance"        Binance highlighted  ❌ Back to OKX!
Click "DEX"            DEX highlighted      ❌ Back to OKX!

Result: Always resets to OKX 😤
```

### After Fix ✅
```
Action                 State After          After Refresh
──────────────────     ────────────────     ──────────────
Click "Binance"        Binance highlighted  ✅ Binance still highlighted!
Click "DEX"            DEX highlighted      ✅ DEX still highlighted!
Click "OKX"            OKX highlighted      ✅ OKX still highlighted!

Result: Remembers your choice ✅
```

**How to verify:**
1. On Home tab, look for exchange buttons: **OKX | Binance | DEX**
2. Click "Binance" button (it highlights)
3. Refresh page (`F5`)
4. ✅ "Binance" button should STILL be highlighted
5. Click "DEX" button
6. Refresh page
7. ✅ "DEX" button should STILL be highlighted

**Expected visual:**
```
Exchange Tab:
┌─────────────────────────────┐
│ OKX    │ Binance│  DEX      │
├─────────────────────────────┤
           ↑↑↑↑↑
    Highlighted = Selected
```

---

## ⚠️ Feature 5: Risk Per Trade Persistence

### Before Fix ❌
```
Wallet Config Panel:
─────────────────────────────────
├── Risk Selection
│   ├── Low 1%     ← Shows but clicking didn't save
│   ├── Med 2%     ← Default
│   └── High 5%

Action                 State After          After Refresh
──────────────────     ────────────────     ──────────────
Click "High 5%"        High highlighted     ❌ Back to Med 2%!
Click "Low 1%"         Low highlighted      ❌ Back to Med 2%!

Result: Never remembers your risk choice 😤
```

### After Fix ✅
```
Action                 State After          After Refresh
──────────────────     ────────────────     ──────────────
Click "High 5%"        High highlighted     ✅ High still highlighted!
Click "Low 1%"         Low highlighted      ✅ Low still highlighted!

Result: Remembers your risk setting ✅
```

**How to verify:**
1. On Home tab, look for risk buttons in **Wallet Config Panel**:
   - Low 1% (with 🟢 icon)
   - Med 2% (with 🟠 icon) - Default
   - High 5% (with 🔴 icon)

2. Click "High 5%" button (should highlight/become active)
3. Refresh page (`F5`)
4. ✅ "High 5%" button should STILL be active
5. Click "Low 1%" button
6. Refresh page
7. ✅ "Low 1%" button should STILL be active

**Expected visual before/after:**
```
Risk Selection:
┌──────────────────────────────────┐
│ [Low 1%] [Med 2%*] [High 5%]    │  ← Before (*=active)
└──────────────────────────────────┘

After clicking High:
┌──────────────────────────────────┐
│ [Low 1%] [Med 2%] [High 5%*]    │  ← After (*=active)
└──────────────────────────────────┘

After refresh:
┌──────────────────────────────────┐
│ [Low 1%] [Med 2%] [High 5%*]    │  ← Still active! ✅
└──────────────────────────────────┘
```

---

## 🎯 Feature 6: Wallet Chain Shows Correctly

### Before Fix ❌
```
Wallet Connected:
┌────────────────────────────────────┐
│ Wallet: 7UcWs...fxaZ9             │
│ Chain: ⟠ ETHEREUM   ← WRONG! 😤   │
│ (Even though using Jupiter/Solana) │
└────────────────────────────────────┘
```

### After Fix ✅
```
Wallet Connected:
┌────────────────────────────────────┐
│ Wallet: 7UcWs...fxaZ9             │
│ Chain: ◎ SOLANA   ← CORRECT! ✅   │
│ (Shows Solana for Jupiter wallet)  │
└────────────────────────────────────┘
```

**How to verify:**
1. Connect Jupiter wallet (click ◎ Jupiter button)
2. Look at wallet info badge showing address
3. ✅ Chain badge should show **◎ Solana** (not ⟠ Ethereum)
4. Refresh page
5. ✅ Chain should STILL show **◎ Solana**

---

## 🧪 Complete Persistence Test

**Test the ENTIRE system working together:**

### Step-by-Step Test

```
Step 1: Fresh Start
────────────────────
├─ Open page in new window / incognito
├─ Verify: Home tab is shown ✅
├─ Verify: OKX exchange selected ✅
└─ Verify: Med 2% risk selected ✅

Step 2: Connect Wallet
────────────────────
├─ Click ◎ Jupiter button
├─ Connect wallet (you may need to approve in wallet)
├─ Verify: Wallet address shows (e.g., 7UcWs...fxaZ9) ✅
├─ Verify: Chain shows ◎ Solana ✅
└─ Verify: Wallet Config Panel appears ✅

Step 3: Change Exchange
────────────────────
├─ Click "Binance" exchange button
├─ Verify: Binance button is highlighted ✅
└─ Continue to next step

Step 4: Change Risk
────────────────────
├─ Click "High 5%" risk button
├─ Verify: High 5% button is highlighted ✅
└─ Continue to next step

Step 5: Switch Tab
────────────────────
├─ Click "Crypto Scanner" tab
├─ Verify: Scanner tab opens ✅
└─ Continue to next step

Step 6: THE BIG TEST - Refresh Page
────────────────────
Press F5 or Cmd+R to refresh

After Refresh, verify ALL of the following:
├─ Tab: Crypto Scanner is STILL active ✅
├─ Wallet: Still showing (7UcWs...fxaZ9) ✅
├─ Chain: Still showing ◎ Solana ✅
├─ Exchange: Binance button still highlighted ✅
└─ Risk: High 5% button still highlighted ✅

SUCCESS! All 5 features working together! 🎉
```

---

## 🔍 Browser Developer Tools Check

**Open browser console (F12) and check:**

```javascript
// Copy-paste this in Console tab:
console.table({
  'Current Tab': localStorage.getItem('cs_current_tab') || '(none)',
  'Wallet Connected': localStorage.getItem('cs_wallet_addr') ? '✅ Yes' : '❌ No',
  'Wallet Chain': localStorage.getItem('cs_wallet_chain') || '(none)',
  'Exchange': localStorage.getItem('cs_wallet_exchange') || 'okx (default)',
  'Risk': JSON.parse(localStorage.getItem('cs_wallet_cfg') || '{}').risk || 'mid (default)',
})

// Expected output:
┌─────────────────────┬──────────────────────┐
│   (index)           │      Values          │
├─────────────────────┼──────────────────────┤
│ Current Tab         │ scanner              │
│ Wallet Connected    │ ✅ Yes               │
│ Wallet Chain        │ solana               │
│ Exchange            │ binance              │
│ Risk                │ high                 │
└─────────────────────┴──────────────────────┘
```

---

## ⚡ Quick Checklist

- [ ] **Home tab loads first** (not Scanner)
- [ ] **Tab persists** after refresh (test all tabs)
- [ ] **Wallet stays connected** after refresh
- [ ] **Wallet chain shows Solana** (not Ethereum)
- [ ] **Exchange selection persists** (test OKX/Binance/DEX)
- [ ] **Risk selection persists** (test Low/Mid/High)
- [ ] **All 5 features work together** in complete test
- [ ] **No errors in console** (F12 → Console tab)
- [ ] **Works in multiple browsers** (Chrome, Firefox, Safari)

---

## 📝 Success Criteria

### ✅ Must Have (Required)
- [ ] Home tab is default
- [ ] Tab selection persists
- [ ] Wallet persists with correct chain
- [ ] Exchange persists
- [ ] Risk persists
- [ ] No JavaScript errors

### ✅ Should Have (Nice to Have)
- [ ] Works in incognito/private mode
- [ ] Works on mobile browsers
- [ ] Performance is snappy (<1s load)
- [ ] Can clear data easily

### ✅ Nice to Have (Future)
- [ ] Cloud sync across devices
- [ ] Export/import settings
- [ ] Analytics on tab usage
- [ ] Keyboard shortcuts

---

## 🎓 Learning Resources

See detailed docs:
1. `PERSISTENCE_SUMMARY.md` - Overview
2. `WALLET_PERSISTENCE_FIXES.md` - Test cases
3. `IMPLEMENTATION_DETAILS.md` - Technical deep dive
4. `test-persistence.js` - Testing utilities

---

**Status:** ✅ All 5 features implemented and ready for testing!
