#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  Polymarket Arbitrage Bot v1
//  Jalankan: node polymarket-bot.js
//
//  STRATEGI: Market-Neutral Spread Arbitrage
//  ─────────────────────────────────────────
//  Polymarket adalah prediction market berbasis Polygon.
//  Setiap market punya dua token: YES dan NO.
//  p_yes + p_no = 1 (dalam pasar efisien)
//  Jika p_yes + p_no < 1, ada gap = spread = FREE MONEY
//
//  ARSITEKTUR:
//  ┌─────────────────────────────────────────────────────────────────────┐
//  │  1. PolymarketAPI    — Fetch markets & order book dari CLOB API     │
//  │  2. BayesianPricer   — Update P(YES) dari BTC spot correlation      │
//  │  3. SpreadDetector   — Cari edge = 1 - p_yes - p_no - cost         │
//  │  4. KellyPosition    — Sizing optimal via Kelly Criterion            │
//  │  5. EVFilter         — Hanya eksekusi jika EV > threshold           │
//  │  6. ExecLayer        — Place order via Polymarket CLOB (DRY RUN)    │
//  │  7. PnL Tracker      — Monitor posisi & P&L                         │
//  └─────────────────────────────────────────────────────────────────────┘
//
//  MODE: DRY_RUN = true (paper trading) — perlu wallet Polygon untuk live
//  PORT: 3003
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const https   = require('https');

// ══════════════════════════════════════════════════════════════════════════════
//  KONFIGURASI
// ══════════════════════════════════════════════════════════════════════════════
const CONFIG = {
    // ── Mode ──────────────────────────────────────────────────────────────────
    DRY_RUN             : true,       // true = paper trading, false = live (butuh wallet Polygon)
    PAPER_CAPITAL       : 2050,       // simulasi modal seperti di screenshot ($2,050)
    PORT                : 3003,       // port HTTP server untuk status monitoring

    // ── Polymarket API ────────────────────────────────────────────────────────
    CLOB_API            : 'https://clob.polymarket.com',
    GAMMA_API           : 'https://gamma-api.polymarket.com',

    // ── Scan ─────────────────────────────────────────────────────────────────
    SCAN_INTERVAL_MS    : 15_000,     // cek markets setiap 15 detik (273 trades/jam = ~13 detik)
    MAX_MARKETS_SCAN    : 50,         // scan top 50 markets by volume
    MIN_MARKET_VOLUME   : 5000,       // min $5,000 daily volume
    FOCUS_KEYWORDS      : ['BTC', 'bitcoin', 'ETH', 'crypto', 'price', 'above', 'below', 'reach'],

    // ── Edge Filter ──────────────────────────────────────────────────────────
    MIN_EDGE            : 0.008,      // minimum edge 0.8% (setelah biaya ~0.2%)
    TRADE_COST_PCT      : 0.002,      // biaya 0.2% per sisi (gas + spread)
    MAX_SPREAD_PCT      : 0.15,       // maksimum spread 15% (terlalu jauh dari 1 = aneh/trap)

    // ── Kelly / Risk ─────────────────────────────────────────────────────────
    KELLY_FRACTION      : 0.25,       // fractional Kelly 25%
    MAX_BET_PCT         : 0.03,       // hard cap 3% modal per trade
    MIN_BET_USD         : 10,         // minimum bet $10
    MIN_EV              : 0.005,      // minimum Expected Value 0.5%

    // ── Bayesian BTC Correlation ──────────────────────────────────────────────
    BTC_PROXY_URL       : 'https://api.hyperliquid.xyz/info',  // pakai HL proxy lokal
    LOCAL_PROXY         : 'http://127.0.0.1:3001',
    BTC_UPDATE_MS       : 30_000,     // update harga BTC setiap 30 detik

    // ── Files ─────────────────────────────────────────────────────────────────
    LOG_FILE            : path.join(__dirname, 'polymarket-bot.log'),
    STATE_FILE          : path.join(__dirname, 'polymarket-state.json'),
};

// ══════════════════════════════════════════════════════════════════════════════
//  LOGGER
// ══════════════════════════════════════════════════════════════════════════════
function log(msg, level = 'INFO') {
    const ts   = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const icons = { INFO: 'ℹ️ ', TRADE: '💰', WARN: '⚠️ ', ERROR: '❌', WIN: '✅', LOSS: '🔴', SYSTEM: '⚙️ ', SCAN: '🔍', ARB: '⚡' };
    const line = `[${ts}] ${icons[level] || ''}[${level}] ${msg}`;
    console.log(line);
    try { fs.appendFileSync(CONFIG.LOG_FILE, line + '\n'); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
//  HTTP HELPER
// ══════════════════════════════════════════════════════════════════════════════
function fetchJSON(url, options = {}) {
    return new Promise((resolve, reject) => {
        const lib     = url.startsWith('https') ? https : http;
        const timeout = options.timeout || 8000;
        const req = lib.get(url, { headers: { 'User-Agent': 'PolyArbBot/1.0', ...(options.headers || {}) } }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error(`JSON parse error. Status: ${res.statusCode}. Body: ${raw.slice(0, 200)}`)); }
            });
        });
        req.on('error', reject);
        req.setTimeout(timeout, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    });
}

function postJSON(url, body) {
    return new Promise((resolve, reject) => {
        const data    = JSON.stringify(body);
        const parsed  = new URL(url);
        const options = {
            hostname: parsed.hostname,
            port    : parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path    : parsed.pathname + parsed.search,
            method  : 'POST',
            headers : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        };
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request(options, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(new Error(`JSON parse: ${raw.slice(0, 100)}`)); }
            });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
        req.write(data);
        req.end();
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════════════════════════
let STATE = {
    running          : false,
    capital          : CONFIG.PAPER_CAPITAL,
    peakCapital      : CONFIG.PAPER_CAPITAL,
    totalPnl         : 0,
    totalTrades      : 0,
    wins             : 0,
    losses           : 0,
    tradesThisHour   : 0,
    hourlyReset      : Date.now() + 3600000,
    openPositions    : [],   // array of Position objects
    closedTrades     : [],   // history
    btcPrice         : null, // current BTC spot price
    btcPriceHistory  : [],   // last 20 BTC prices for trend
    lastScanTime     : null,
    scanCount        : 0,
    marketsScanned   : 0,
    opportunitiesFound: 0,
};

function loadState() {
    try {
        if (fs.existsSync(CONFIG.STATE_FILE)) {
            const s = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
            STATE = { ...STATE, ...s };
            log(`State loaded: capital=$${STATE.capital.toFixed(2)}, ${STATE.openPositions.length} posisi terbuka`, 'SYSTEM');
        }
    } catch (e) { log(`Gagal load state: ${e.message}`, 'WARN'); }
}

function saveState() {
    try { fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(STATE, null, 2)); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
//  POLYMARKET API
// ══════════════════════════════════════════════════════════════════════════════
const polyAPI = {
    /**
     * Fetch active markets dari Gamma API (lebih lengkap dari CLOB)
     * Returns list of market objects dengan p_yes, p_no, volume
     */
    async getMarkets(limit = CONFIG.MAX_MARKETS_SCAN) {
        try {
            // Gamma API: markets sorted by volume
            const url = `${CONFIG.GAMMA_API}/markets?active=true&closed=false&limit=${limit}&order=volumeNum&ascending=false`;
            const data = await fetchJSON(url);
            return Array.isArray(data) ? data : (data.markets || []);
        } catch (e) {
            log(`Gamma API error: ${e.message}`, 'WARN');
            return [];
        }
    },

    /**
     * Fetch order book dari CLOB untuk satu market (token ID)
     * Digunakan untuk mendapatkan best bid/ask yang lebih akurat
     */
    async getOrderBook(tokenId) {
        try {
            const url = `${CONFIG.CLOB_API}/book?token_id=${tokenId}`;
            return await fetchJSON(url);
        } catch (e) {
            return null;
        }
    },

    /**
     * Fetch single market detail
     */
    async getMarket(conditionId) {
        try {
            const url = `${CONFIG.GAMMA_API}/markets/${conditionId}`;
            return await fetchJSON(url);
        } catch (e) {
            return null;
        }
    },

    /**
     * Parse harga YES/NO dari market object
     * Polymarket menyimpan harga dalam format string "0.52" (= 52 sen per kontrak)
     */
    parsePrices(market) {
        const outcomePrices = market.outcomePrices;
        const outcomes      = market.outcomes;
        if (!outcomePrices || !outcomes) return null;
        try {
            const prices = JSON.parse(outcomePrices);
            const labels = JSON.parse(outcomes);
            const yesIdx = labels.findIndex(l => l.toLowerCase() === 'yes');
            const noIdx  = labels.findIndex(l => l.toLowerCase() === 'no');
            if (yesIdx === -1 || noIdx === -1) return null;
            return {
                pYes: parseFloat(prices[yesIdx]),
                pNo : parseFloat(prices[noIdx]),
            };
        } catch { return null; }
    },
};

// ══════════════════════════════════════════════════════════════════════════════
//  BAYESIAN PRICER
//  Update P(YES) berdasarkan BTC spot correlation
//  Prinsip: pasar crypto prediction sering lag dari spot market
//  Contoh: BTC naik 3% tapi "BTC > $80k by Friday" masih di 52% → underpriced
// ══════════════════════════════════════════════════════════════════════════════
const bayesianPricer = {
    /**
     * Hitung "fair value" P(YES) untuk market yang berhubungan dengan BTC/crypto
     * Menggunakan momentum BTC 30 menit sebagai signal
     */
    calcFairValue(market, pYesCurrent, btcPrice, btcHistory) {
        if (!btcPrice || btcHistory.length < 3) return pYesCurrent;

        const question  = (market.question || market.title || '').toLowerCase();
        const isBullish = question.includes('above') || question.includes('higher') || question.includes('reach') || question.includes('>');
        const isBearish = question.includes('below') || question.includes('lower') || question.includes('<');

        // Tidak ada correlation dengan BTC
        if (!isBullish && !isBearish) return pYesCurrent;

        // Hitung BTC momentum (% change dari 5 data point lalu)
        const btcOld   = btcHistory[Math.max(0, btcHistory.length - 5)];
        const btcMomentum = btcOld > 0 ? ((btcPrice - btcOld) / btcOld) : 0;

        // Seberapa kuat correlation: market yang menyebut "BTC" lebih kuat
        const correlationStrength = question.includes('btc') || question.includes('bitcoin') ? 0.4 : 0.2;

        // Bayesian update: adjustment berdasarkan momentum
        let fairAdj = btcMomentum * correlationStrength * (isBullish ? 1 : -1);
        fairAdj = Math.max(-0.15, Math.min(0.15, fairAdj)); // max ±15% adjustment

        return Math.max(0.01, Math.min(0.99, pYesCurrent + fairAdj));
    },

    /**
     * Hitung P(YES) via Bayesian update dari multiple evidence
     */
    updateProbability(priorP, evidences) {
        let pYes  = priorP;
        let pNo   = 1 - priorP;

        for (const { likelihood_yes, likelihood_no } of evidences) {
            const pEvidence = likelihood_yes * pYes + likelihood_no * pNo;
            if (pEvidence <= 0) continue;
            pYes = (likelihood_yes * pYes) / pEvidence;
            pNo  = (likelihood_no  * pNo)  / pEvidence;
            const total = pYes + pNo;
            pYes /= total;
            pNo  /= total;
        }

        return { pYes: Math.max(0.01, Math.min(0.99, pYes)), pNo: Math.max(0.01, Math.min(0.99, pNo)) };
    }
};

// ══════════════════════════════════════════════════════════════════════════════
//  SPREAD DETECTOR
//  Core logic: Edge = 1 - p_yes - p_no - (2 * cost)
//  Jika p_yes + p_no < 1 → ada mispricing → beli keduanya → guaranteed profit
//  Contoh:
//    p_yes = 0.47, p_no = 0.48  → sum = 0.95 → edge = 0.05 − cost = ~4.8% net
//    Beli 1 YES + 1 NO → bayar $0.95 → redeem $1.00 → profit 5% (risk-free)
// ══════════════════════════════════════════════════════════════════════════════
const spreadDetector = {
    /**
     * Analisa satu market untuk menemukan spread opportunity
     */
    analyze(market, pYes, pNo, fairPYes) {
        const sum        = pYes + pNo;
        const rawEdge    = 1 - sum;
        const netEdge    = rawEdge - (2 * CONFIG.TRADE_COST_PCT);  // biaya 2 sisi
        const spreadPct  = 1 - sum;  // gap dari 1

        // EV per dollar invested
        // Strategy A: Beli YES + NO (market neutral arb)
        //   Bayar: p_yes + p_no = sum, Terima: $1.00 (salah satu pasti menang)
        //   Profit: 1 - sum - cost
        const evArb = netEdge;

        // Strategy B: Directional bet berdasarkan Bayesian fair value
        //   Jika p_yes << fair_p_yes → beli YES (underpriced)
        const yesDiscount = fairPYes - pYes;  // positif = YES underpriced
        const evDirectional = yesDiscount > 0
            ? (yesDiscount * fairPYes) - CONFIG.TRADE_COST_PCT
            : ((-yesDiscount) * (1 - fairPYes)) - CONFIG.TRADE_COST_PCT;

        return {
            sum,
            rawEdge     : +rawEdge.toFixed(4),
            netEdge     : +netEdge.toFixed(4),
            spreadPct   : +spreadPct.toFixed(4),
            evArb       : +evArb.toFixed(4),
            evDirectional: +evDirectional.toFixed(4),
            yesDiscount : +yesDiscount.toFixed(4),
            strategy    : netEdge >= CONFIG.MIN_EDGE ? 'ARB'
                        : (evDirectional >= CONFIG.MIN_EV && Math.abs(yesDiscount) > 0.05) ? 'DIRECTIONAL'
                        : 'WAIT',
            bestEV      : Math.max(evArb, evDirectional),
        };
    }
};

// ══════════════════════════════════════════════════════════════════════════════
//  KELLY POSITION SIZER
// ══════════════════════════════════════════════════════════════════════════════
const kellyPosition = {
    /**
     * Hitung optimal bet size menggunakan Kelly Criterion
     * Untuk arbitrage: p = probabilitas menang (hampir 1.0 untuk pure arb)
     * Untuk directional: p = Bayesian P(YES) atau P(NO)
     */
    calcSize(capital, pWin, payoffRatio, strategy) {
        let fullKelly;

        if (strategy === 'ARB') {
            // Pure arbitrage: hampir risk-free, tapi ada execution risk
            // Gunakan konservatif karena market bisa bergerak sebelum fill
            const pWinArb = 0.92;  // 92% (ada 8% execution/liquidity risk)
            const b       = payoffRatio;
            const q       = 1 - pWinArb;
            fullKelly = (b * pWinArb - q) / b;
        } else {
            // Directional: standard Kelly
            const p = Math.max(0.1, Math.min(0.9, pWin));
            const q = 1 - p;
            const b = payoffRatio;
            fullKelly = (b * p - q) / b;
        }

        if (fullKelly <= 0) return 0;

        const fractionalKelly = fullKelly * CONFIG.KELLY_FRACTION;
        const betPct = Math.min(fractionalKelly, CONFIG.MAX_BET_PCT);
        const betUsd = capital * betPct;

        return Math.max(0, betUsd);
    },

    /**
     * Hitung Expected Value per dollar risked
     */
    expectedValue(pWin, payoffRatio, cost = CONFIG.TRADE_COST_PCT) {
        return +(pWin * payoffRatio - (1 - pWin) - cost).toFixed(4);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
//  EXECUTION LAYER (DRY RUN)
// ══════════════════════════════════════════════════════════════════════════════
const execLayer = {
    /**
     * Eksekusi trade (DRY RUN = simulasi, live = butuh Polymarket wallet)
     */
    async execute(opportunity) {
        const { market, strategy, pYes, pNo, netEdge, evArb, evDirectional, betUsd, side } = opportunity;
        const bestEV   = strategy === 'ARB' ? evArb : evDirectional;
        const marketId = market.conditionId || market.id;

        if (betUsd < CONFIG.MIN_BET_USD) {
            log(`Skip ${marketId}: bet terlalu kecil $${betUsd.toFixed(2)}`, 'WARN');
            return null;
        }

        const tradeId = `PM-${Date.now()}`;
        const entry = {
            id          : tradeId,
            timestamp   : new Date().toISOString(),
            marketId,
            question    : (market.question || market.title || '').slice(0, 80),
            strategy,
            side,          // 'YES', 'NO', atau 'BOTH' (arb)
            pYes        : +pYes.toFixed(4),
            pNo         : +pNo.toFixed(4),
            netEdge     : +netEdge.toFixed(4),
            ev          : +bestEV.toFixed(4),
            betUsd      : +betUsd.toFixed(2),
            status      : 'OPEN',
            openTime    : Date.now(),
            // Estimasi outcome (untuk DRY RUN simulation)
            expectedReturn: +(betUsd * (1 + bestEV)).toFixed(2),
        };

        if (CONFIG.DRY_RUN) {
            log(`[DRY RUN] ${strategy} | ${side} | Market: "${entry.question.slice(0,50)}..."`, 'ARB');
            log(`  pYes=${pYes.toFixed(3)} pNo=${pNo.toFixed(3)} Edge=${(netEdge*100).toFixed(2)}% EV=${(bestEV*100).toFixed(2)}% Bet=$${betUsd.toFixed(2)}`, 'TRADE');

            // Simulasi: untuk arb, langsung "resolve" dengan profit setelah beberapa detik
            STATE.openPositions.push(entry);
            STATE.capital -= betUsd;
            STATE.tradesThisHour++;
            STATE.totalTrades++;

            // Untuk DRY RUN: simulasi resolusi di masa depan (10-60 menit)
            const resolveIn = Math.random() * 50 * 60 * 1000 + 10 * 60 * 1000;
            setTimeout(() => this.simulateResolve(entry), resolveIn);

            saveState();
            return entry;
        }

        // LIVE: perlu implementasi wallet signing Polygon (EIP-712 + CTF Exchange)
        log(`Live trading memerlukan wallet Polygon & USDC. Set DRY_RUN=false dan isi .env`, 'WARN');
        return null;
    },

    /**
     * DRY RUN: simulasi resolusi trade
     * Arb trades: 92% win (execution risk)
     * Directional: win rate sesuai EV
     */
    simulateResolve(entry) {
        const idx = STATE.openPositions.findIndex(p => p.id === entry.id);
        if (idx === -1) return;

        const isWin = entry.strategy === 'ARB'
            ? Math.random() < 0.92
            : Math.random() < (0.5 + entry.ev);

        const pnl = isWin
            ? entry.betUsd * entry.ev
            : -entry.betUsd * (1 - entry.ev);

        entry.status    = 'CLOSED';
        entry.closeTime = Date.now();
        entry.pnl       = +pnl.toFixed(2);
        entry.win       = isWin;

        STATE.openPositions.splice(idx, 1);
        STATE.closedTrades.push(entry);
        if (STATE.closedTrades.length > 500) STATE.closedTrades = STATE.closedTrades.slice(-500);

        STATE.capital  += entry.betUsd + pnl; // kembalikan modal + profit/loss
        STATE.totalPnl += pnl;
        if (isWin) STATE.wins++; else STATE.losses++;
        if (STATE.capital > STATE.peakCapital) STATE.peakCapital = STATE.capital;

        const icon = isWin ? '✅' : '🔴';
        log(`${icon} [DRY RUN RESOLVED] ${entry.strategy} ${entry.side} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | Capital: $${STATE.capital.toFixed(2)}`,
            isWin ? 'WIN' : 'LOSS');
        saveState();
    }
};

// ══════════════════════════════════════════════════════════════════════════════
//  BTC PRICE TRACKER
// ══════════════════════════════════════════════════════════════════════════════
async function updateBTCPrice() {
    try {
        // Coba via local proxy dulu
        const resp = await fetchJSON(`${CONFIG.LOCAL_PROXY}/okx/ticker?instId=BTC-USDT`);
        const price = parseFloat(resp?.data?.[0]?.last || resp?.data?.[0]?.bidPx || 0);
        if (price > 0) {
            STATE.btcPrice = price;
            STATE.btcPriceHistory.push(price);
            if (STATE.btcPriceHistory.length > 20) STATE.btcPriceHistory.shift();
            return price;
        }
    } catch {}

    try {
        // Fallback: Hyperliquid langsung
        const resp = await postJSON('https://api.hyperliquid.xyz/info', { type: 'allMids' });
        const price = parseFloat(resp?.BTC || 0);
        if (price > 0) {
            STATE.btcPrice = price;
            STATE.btcPriceHistory.push(price);
            if (STATE.btcPriceHistory.length > 20) STATE.btcPriceHistory.shift();
            return price;
        }
    } catch (e) {
        log(`BTC price update failed: ${e.message}`, 'WARN');
    }
    return STATE.btcPrice;
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN SCAN LOOP
// ══════════════════════════════════════════════════════════════════════════════
async function runScan() {
    STATE.scanCount++;
    STATE.lastScanTime = new Date().toISOString();

    // Reset hourly counter
    if (Date.now() > STATE.hourlyReset) {
        log(`Trades jam ini: ${STATE.tradesThisHour} | Total: ${STATE.totalTrades} | PnL: +$${STATE.totalPnl.toFixed(2)}`, 'SYSTEM');
        STATE.tradesThisHour = 0;
        STATE.hourlyReset    = Date.now() + 3600000;
    }

    // Update BTC price
    const btcPrice = await updateBTCPrice();
    if (!btcPrice) {
        log('BTC price tidak tersedia — scan ditunda', 'WARN');
        return;
    }

    // Fetch markets
    let markets;
    try {
        markets = await polyAPI.getMarkets(CONFIG.MAX_MARKETS_SCAN);
    } catch (e) {
        log(`Gagal fetch Polymarket markets: ${e.message}`, 'ERROR');
        return;
    }

    if (!Array.isArray(markets) || markets.length === 0) {
        log('Tidak ada markets diterima dari Gamma API', 'WARN');
        return;
    }

    STATE.marketsScanned += markets.length;
    let oppsFound = 0;

    for (const market of markets) {
        // Skip jika tidak ada data harga
        const prices = polyAPI.parsePrices(market);
        if (!prices) continue;

        const { pYes, pNo } = prices;

        // Validasi dasar
        if (pYes <= 0 || pNo <= 0 || pYes >= 1 || pNo >= 1) continue;
        if (pYes + pNo > 1.15) continue;  // gap terlalu besar = suspicious

        // Volume filter
        const volume = parseFloat(market.volumeNum || market.volume || 0);
        if (volume < CONFIG.MIN_MARKET_VOLUME) continue;

        // Bayesian fair value berdasarkan BTC correlation
        const fairPYes = bayesianPricer.calcFairValue(
            market, pYes, btcPrice, STATE.btcPriceHistory
        );

        // Detect edge
        const analysis = spreadDetector.analyze(market, pYes, pNo, fairPYes);

        if (analysis.strategy === 'WAIT') continue;
        if (analysis.bestEV < CONFIG.MIN_EV) continue;

        oppsFound++;
        STATE.opportunitiesFound++;

        // Hitung Kelly bet
        const pWin     = analysis.strategy === 'ARB' ? 0.92 : Math.max(pYes, pNo);
        const payoff   = analysis.strategy === 'ARB'
            ? (1 / (pYes + pNo) - 1)  // profit dari arb
            : Math.abs(fairPYes - pYes) * 5;  // estimasi reversion profit

        const betUsd   = kellyPosition.calcSize(STATE.capital, pWin, payoff, analysis.strategy);
        const ev       = kellyPosition.expectedValue(pWin, payoff);

        if (betUsd < CONFIG.MIN_BET_USD || ev < CONFIG.MIN_EV) continue;

        const side = analysis.strategy === 'ARB' ? 'BOTH'
                   : (analysis.yesDiscount > 0 ? 'YES' : 'NO');

        log(`⚡ OPPORTUNITY | ${analysis.strategy} | ${side} | Edge=${(analysis.netEdge*100).toFixed(2)}% EV=${(ev*100).toFixed(2)}% Bet=$${betUsd.toFixed(2)}`, 'ARB');
        log(`  Market: "${(market.question || market.title || '').slice(0, 70)}"`, 'ARB');
        log(`  pYes=${pYes.toFixed(3)} pNo=${pNo.toFixed(3)} sum=${(pYes+pNo).toFixed(3)} fairPYes=${fairPYes.toFixed(3)}`, 'ARB');

        await execLayer.execute({
            market, strategy: analysis.strategy, side,
            pYes, pNo,
            netEdge : analysis.netEdge,
            evArb   : analysis.evArb,
            evDirectional: analysis.evDirectional,
            betUsd, ev,
        });

        await sleep(200); // jangan terlalu agresif
    }

    if (oppsFound === 0) {
        process.stdout.write(`  [Scan #${STATE.scanCount}] ${markets.length} markets — tidak ada edge. BTC: $${btcPrice?.toFixed(0)}\r`);
    } else {
        log(`Scan #${STATE.scanCount}: ${oppsFound} peluang ditemukan dari ${markets.length} markets`, 'SCAN');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  HTTP STATUS SERVER (port 3003)
// ══════════════════════════════════════════════════════════════════════════════
function startStatusServer() {
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        if (req.url === '/health') {
            return res.end(JSON.stringify({ ok: true, mode: CONFIG.DRY_RUN ? 'DRY_RUN' : 'LIVE' }));
        }

        if (req.url === '/state' || req.url === '/trader/state') {
            const winRate = STATE.totalTrades > 0
                ? ((STATE.wins / Math.max(1, STATE.wins + STATE.losses)) * 100).toFixed(1)
                : '—';
            const drawdown = STATE.peakCapital > 0
                ? (((STATE.peakCapital - STATE.capital) / STATE.peakCapital) * 100).toFixed(2)
                : '0.00';
            return res.end(JSON.stringify({
                mode              : CONFIG.DRY_RUN ? 'DRY_RUN' : 'LIVE',
                capital           : +STATE.capital.toFixed(2),
                peakCapital       : +STATE.peakCapital.toFixed(2),
                totalPnl          : +STATE.totalPnl.toFixed(2),
                roi               : +(((STATE.capital - CONFIG.PAPER_CAPITAL) / CONFIG.PAPER_CAPITAL) * 100).toFixed(2),
                totalTrades       : STATE.totalTrades,
                tradesThisHour    : STATE.tradesThisHour,
                wins              : STATE.wins,
                losses            : STATE.losses,
                winRate           : winRate + '%',
                drawdownPct       : parseFloat(drawdown),
                openPositions     : STATE.openPositions.length,
                closedTrades      : STATE.closedTrades.slice(-20),
                btcPrice          : STATE.btcPrice,
                lastScanTime      : STATE.lastScanTime,
                scanCount         : STATE.scanCount,
                marketsScanned    : STATE.marketsScanned,
                opportunitiesFound: STATE.opportunitiesFound,
            }));
        }

        if (req.url === '/positions') {
            return res.end(JSON.stringify(STATE.openPositions));
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(CONFIG.PORT, '127.0.0.1', () => {
        log(`Status server berjalan di http://127.0.0.1:${CONFIG.PORT}/state`, 'SYSTEM');
    });
    return server;
}

// ══════════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('\n' + '═'.repeat(62));
    console.log('  ⚡  Polymarket Arbitrage Bot v1');
    console.log(`  Mode    : ${CONFIG.DRY_RUN ? '📄 DRY RUN (Paper Trading)' : '🔴 LIVE TRADING'}`);
    console.log(`  Capital : $${CONFIG.PAPER_CAPITAL.toLocaleString()}`);
    console.log(`  Strategy: Spread Arb + Bayesian Directional`);
    console.log(`  Engine  : Bayesian Pricer + Kelly Criterion`);
    console.log(`  Min Edge: ${(CONFIG.MIN_EDGE * 100).toFixed(1)}%  |  Min EV: ${(CONFIG.MIN_EV * 100).toFixed(1)}%`);
    console.log(`  Scan    : setiap ${CONFIG.SCAN_INTERVAL_MS / 1000}s  |  Top ${CONFIG.MAX_MARKETS_SCAN} markets`);
    console.log('═'.repeat(62) + '\n');

    if (!CONFIG.DRY_RUN) {
        console.log('⚠️  LIVE MODE — pastikan .env berisi POLY_PRIVATE_KEY dan USDC di Polygon!');
        await sleep(3000);
    }

    loadState();
    startStatusServer();

    // BTC price pertama kali
    const btcFirst = await updateBTCPrice();
    log(`BTC spot price: $${btcFirst?.toLocaleString() || 'N/A'}`, 'SYSTEM');

    // Scan pertama langsung
    await runScan();

    // Polling loop
    log(`Scanning Polymarket setiap ${CONFIG.SCAN_INTERVAL_MS / 1000} detik...`, 'SYSTEM');
    setInterval(runScan, CONFIG.SCAN_INTERVAL_MS);
    setInterval(updateBTCPrice, CONFIG.BTC_UPDATE_MS);
}

main().catch(err => {
    log(`Fatal error: ${err.message}`, 'ERROR');
    console.error(err.stack);
    process.exit(1);
});
