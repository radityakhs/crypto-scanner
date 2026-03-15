/**
 * hyperliquid-proxy.js — Hyperliquid DEX Proxy Server
 * ══════════════════════════════════════════════════════════════
 * Jalankan: node hyperliquid-proxy.js
 * Berjalan di localhost:3001
 *
 * Hyperliquid adalah on-chain perpetual DEX:
 *  - Tidak ada KYC / regional block ✅
 *  - Tidak ada API key — pakai Ethereum wallet (private key)
 *  - Order signing dengan EIP-712 (phantom agent pattern)
 *  - REST API: https://api.hyperliquid.xyz
 *    • POST /info   → query publik (harga, posisi, order book)
 *    • POST /exchange → action privat (order, cancel, transfer)
 *
 * KEAMANAN:
 *  - Private key tersimpan di .env, TIDAK pernah dikirim ke browser
 *  - Semua signing terjadi di sini (server side)
 *  - Hanya localhost yang bisa akses proxy ini
 */

'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const fetch   = require('node-fetch');
const { ethers } = require('ethers');

const app  = express();
const PORT = process.env.PROXY_PORT || 3001;

// ── Hyperliquid endpoints ─────────────────────────────────────
const HL_INFO     = 'https://api.hyperliquid.xyz/info';
const HL_EXCHANGE = 'https://api.hyperliquid.xyz/exchange';

// ── Wallet dari .env ─────────────────────────────────────────
const PRIVATE_KEY     = process.env.HL_PRIVATE_KEY;
const WALLET_ADDRESS  = process.env.HL_WALLET_ADDRESS;
const DRY_RUN_MODE    = !PRIVATE_KEY
    || PRIVATE_KEY.includes('GANTI')
    || PRIVATE_KEY.length < 32;

let wallet = null;
if (!DRY_RUN_MODE) {
    try {
        wallet = new ethers.Wallet(PRIVATE_KEY);
    } catch (e) {
        console.error('❌ Private key tidak valid:', e.message);
        process.exit(1);
    }
}

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
    origin: ['http://localhost:8000', 'http://127.0.0.1:8000',
             'http://localhost:3000', 'http://127.0.0.1:3000'],
}));
app.use(express.json());

// ═══════════════════════════════════════════════════════════════
//  EIP-712 SIGNING — Hyperliquid "Phantom Agent" Pattern
// ═══════════════════════════════════════════════════════════════
// Hyperliquid menggunakan phantom agent: setiap request eksekusi
// ditandatangani dengan wallet asli menggunakan EIP-712.
// Ref: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/signing

const CHAIN_ID       = 1337; // Hyperliquid L1 chain ID
const AGENT_TYPES = {
    Agent: [
        { name: 'source',      type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
    ],
};

/**
 * Sign action dengan EIP-712 (Hyperliquid style)
 * @param {object} action — action object yang akan dikirim
 * @param {number} nonce  — timestamp milisecond
 * @param {string|null} vaultAddress — null untuk main account
 */
async function signAction(action, nonce, vaultAddress = null) {
    // Hash action + nonce + vaultAddress
    const msgPackHash = hashAction(action, nonce, vaultAddress);
    const connectionId = ethers.hexlify(msgPackHash);

    const domain = {
        name             : 'Exchange',
        version          : '1',
        chainId          : CHAIN_ID,
        verifyingContract: '0x0000000000000000000000000000000000000000',
    };

    const value = {
        source      : 'a',
        connectionId: ethers.zeroPadValue(connectionId.slice(0, 66), 32),
    };

    const sig = await wallet.signTypedData(domain, AGENT_TYPES, value);
    const { r, s, v } = ethers.Signature.from(sig);
    return { r, s, v };
}

/**
 * Hash action menggunakan keccak256 (mirip msgpack hash HL)
 * Ini simplified version — untuk production gunakan @nktkas/hyperliquid SDK
 */
function hashAction(action, nonce, vaultAddress) {
    const str = JSON.stringify(action) + nonce + (vaultAddress || '');
    return Buffer.from(ethers.keccak256(Buffer.from(str)).slice(2), 'hex');
}

/**
 * Kirim signed action ke Hyperliquid /exchange
 */
async function sendAction(action, vaultAddress = null) {
    if (DRY_RUN_MODE) {
        return { status: 'ok', response: { type: 'dryRun', data: { statuses: [{ filled: action }] } } };
    }
    const nonce = Date.now();
    const signature = await signAction(action, nonce, vaultAddress);

    const payload = { action, nonce, signature };
    if (vaultAddress) payload.vaultAddress = vaultAddress;

    const res = await fetch(HL_EXCHANGE, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(payload),
    });
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
//  HELPER — query /info publik
// ═══════════════════════════════════════════════════════════════
async function hlInfo(body) {
    const res = await fetch(HL_INFO, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify(body),
    });
    return res.json();
}

// ── Middleware auth guard ─────────────────────────────────────
function requireAuth(req, res, next) {
    if (DRY_RUN_MODE) {
        return res.status(503).json({ error: 'DRY_RUN: HL_PRIVATE_KEY belum diisi di .env', dryRun: true });
    }
    next();
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINTS — format kompatibel dengan auto-trader.js
// ═══════════════════════════════════════════════════════════════

// Health check
app.get('/health', (_, res) => res.json({
    ok      : true,
    ts      : Date.now(),
    exchange: 'hyperliquid',
    dryRun  : DRY_RUN_MODE,
    wallet  : wallet ? wallet.address : null,
}));

// ── MARKET DATA (publik) ──────────────────────────────────────

// GET /okx/ticker?instId=BTC-USDT → mid price
app.get('/okx/ticker', async (req, res) => {
    try {
        const instId = req.query.instId || 'BTC-USDT';
        const coin   = instId.replace('-USDT', '').replace('-USD', '');
        const mids   = await hlInfo({ type: 'allMids' });
        const price  = mids[coin];
        if (!price) return res.status(404).json({ code: '-1', msg: `Coin ${coin} tidak ditemukan` });
        res.json({ code: '0', data: [{ instId, last: price, askPx: price, bidPx: price }] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/candles?instId=BTC-USDT&bar=1h&limit=100 → OHLCV
app.get('/okx/candles', async (req, res) => {
    try {
        const instId   = req.query.instId || 'BTC-USDT';
        const coin     = instId.replace('-USDT', '').replace('-USD', '');
        const bar      = req.query.bar || '1h';
        const limit    = Math.min(parseInt(req.query.limit) || 100, 5000);
        // Konversi interval: "1h" → "1h", "15m" → "15m", "1d" → "1d"
        // Hyperliquid format: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1d, 3d, 1w
        const intervalMap = {
            '1m':'1m','3m':'3m','5m':'5m','15m':'15m','30m':'30m',
            '1h':'1h','2h':'2h','4h':'4h','8h':'8h','12h':'12h',
            '1d':'1d','3d':'3d','1w':'1w',
        };
        const interval = intervalMap[bar.toLowerCase()] || '1h';

        // Hitung startTime berdasarkan limit
        const msPerBar = { '1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'2h':7200000,'4h':14400000,'8h':28800000,'12h':43200000,'1d':86400000,'3d':259200000,'1w':604800000 };
        const endTime   = Date.now();
        const startTime = endTime - (msPerBar[interval] || 3600000) * limit;

        const data = await hlInfo({
            type: 'candleSnapshot',
            req : { coin, interval, startTime, endTime },
        });

        // Format mirip OKX: [ts, open, high, low, close, vol]
        const formatted = (Array.isArray(data) ? data : []).map(k => [
            k.t, String(k.o), String(k.h), String(k.l), String(k.c), String(k.v)
        ]);
        res.json({ code: '0', data: formatted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/instruments → semua perps di Hyperliquid
app.get('/okx/instruments', async (req, res) => {
    try {
        const meta = await hlInfo({ type: 'meta' });
        const instruments = (meta.universe || []).map(u => ({
            instId     : `${u.name}-USDT`,
            baseCcy    : u.name,
            quoteCcy   : 'USDT',
            maxLeverage: u.maxLeverage,
            szDecimals : u.szDecimals,
        }));
        res.json({ code: '0', data: instruments });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /hl/orderbook?coin=BTC → order book L2
app.get('/hl/orderbook', async (req, res) => {
    try {
        const coin = req.query.coin || 'BTC';
        const data = await hlInfo({ type: 'l2Book', coin });
        res.json({ code: '0', data });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /hl/funding?coin=BTC → funding rate
app.get('/hl/funding', async (req, res) => {
    try {
        const data = await hlInfo({ type: 'metaAndAssetCtxs' });
        const meta     = data[0]?.universe || [];
        const ctxs     = data[1] || [];
        const result   = meta.map((u, i) => ({
            coin       : u.name,
            fundingRate: ctxs[i]?.funding || '0',
            openInterest: ctxs[i]?.openInterest || '0',
            markPx     : ctxs[i]?.markPx || '0',
        }));
        res.json({ code: '0', data: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── AKUN (memerlukan wallet) ──────────────────────────────────

// GET /okx/balance → account state (margin, positions)
app.get('/okx/balance', requireAuth, async (req, res) => {
    try {
        const addr = wallet.address;
        const data = await hlInfo({ type: 'clearinghouseState', user: addr });
        const marginSummary = data.marginSummary || {};

        // Format mirip OKX
        const totalEq   = parseFloat(marginSummary.accountValue || 0);
        const availBal  = parseFloat(marginSummary.withdrawable  || 0);
        res.json({
            code: '0',
            data: [{
                details  : [{ ccy: 'USDT', availBal: String(availBal), frozenBal: '0', availEq: String(availBal), eqUsd: availBal }],
                totalEq  : totalEq.toFixed(4),
                raw      : data,
            }],
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/positions → open positions
app.get('/okx/positions', requireAuth, async (req, res) => {
    try {
        const addr = wallet.address;
        const data = await hlInfo({ type: 'clearinghouseState', user: addr });
        const positions = (data.assetPositions || [])
            .filter(p => parseFloat(p.position?.szi || 0) !== 0)
            .map(p => {
                const pos     = p.position;
                const size    = parseFloat(pos.szi);
                const isLong  = size > 0;
                return {
                    instId    : `${pos.coin}-USDT`,
                    posSide   : isLong ? 'long' : 'short',
                    pos       : String(Math.abs(size)),
                    avgPx     : pos.entryPx || '0',
                    upl       : pos.unrealizedPnl || '0',
                    uplRatio  : '0',
                    liqPx     : pos.liquidationPx || '0',
                    lever     : pos.leverage?.value || '1',
                    markPx    : pos.positionValue || '0',
                };
            });
        res.json({ code: '0', data: positions });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/orders/pending → open orders
app.get('/okx/orders/pending', requireAuth, async (req, res) => {
    try {
        const addr   = wallet.address;
        const orders = await hlInfo({ type: 'openOrders', user: addr });
        const result = (Array.isArray(orders) ? orders : []).map(o => ({
            ordId  : String(o.oid),
            instId : `${o.coin}-USDT`,
            side   : o.side === 'B' ? 'buy' : 'sell',
            ordType: o.orderType?.toLowerCase() || 'limit',
            px     : String(o.limitPx),
            sz     : String(o.sz),
            state  : 'live',
            cTime  : String(o.timestamp),
        }));
        res.json({ code: '0', data: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── TRADING (memerlukan wallet + signing) ─────────────────────

// POST /okx/order/place
// Body: { instId, side, ordType, sz, px?, leverage?, reduceOnly? }
app.post('/okx/order/place', requireAuth, async (req, res) => {
    try {
        const { instId, side, ordType, sz, px, leverage = 1, reduceOnly = false } = req.body;
        if (!instId || !side || !sz) return res.status(400).json({ error: 'instId, side, sz wajib' });

        const coin    = instId.replace('-USDT', '').replace('-USD', '');
        const isBuy   = side.toLowerCase() === 'buy';
        const isMarket = ordType === 'market';

        // Set leverage dulu jika > 1
        if (parseInt(leverage) > 1) {
            await sendAction({
                type    : 'updateLeverage',
                asset   : await getCoinIndex(coin),
                isCross : true,
                leverage: parseInt(leverage),
            });
        }

        // Build order action
        const orderAction = {
            type  : 'order',
            orders: [{
                a         : await getCoinIndex(coin),  // asset index
                b         : isBuy,                      // isBuy
                p         : isMarket ? '0' : String(px), // price (0 untuk market)
                s         : String(sz),                 // size
                r         : reduceOnly,                 // reduceOnly
                t         : isMarket
                    ? { market: {} }
                    : { limit: { tif: 'Gtc' } },
            }],
            grouping: 'na',
        };

        const result = await sendAction(orderAction);

        if (result.status === 'err') {
            return res.json({ code: '-1', msg: result.response, data: [] });
        }

        const filled = result.response?.data?.statuses?.[0];
        const orderId = filled?.resting?.oid || filled?.filled?.oid || 'dry-run';
        res.json({ code: '0', data: [{ ordId: String(orderId), instId, side, sz }] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /okx/order/cancel
app.post('/okx/order/cancel', requireAuth, async (req, res) => {
    try {
        const { instId, ordId } = req.body;
        if (!instId || !ordId) return res.status(400).json({ error: 'instId dan ordId wajib' });

        const coin   = instId.replace('-USDT', '').replace('-USD', '');
        const action = {
            type   : 'cancel',
            cancels: [{ a: await getCoinIndex(coin), o: parseInt(ordId) }],
        };

        const result = await sendAction(action);
        if (result.status === 'err') return res.json({ code: '-1', msg: result.response });
        res.json({ code: '0', data: [{ ordId }] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /okx/order/amend → modify order (TP/SL adjustment)
app.post('/okx/order/amend', requireAuth, async (req, res) => {
    try {
        const { instId, ordId, newPx, newSz } = req.body;
        const coin   = instId.replace('-USDT', '').replace('-USD', '');
        const action = {
            type  : 'modify',
            oid   : parseInt(ordId),
            order : {
                a: await getCoinIndex(coin),
                b: req.body.side === 'buy',
                p: String(newPx),
                s: String(newSz || req.body.sz),
                r: false,
                t: { limit: { tif: 'Gtc' } },
            },
        };
        const result = await sendAction(action);
        res.json(result.status === 'ok' ? { code: '0', data: [] } : { code: '-1', msg: result.response });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── HELPER: get coin index dari meta ─────────────────────────
let _metaCache = null;
async function getCoinIndex(coin) {
    if (!_metaCache) {
        _metaCache = await hlInfo({ type: 'meta' });
    }
    const idx = (_metaCache.universe || []).findIndex(u => u.name === coin);
    if (idx === -1) throw new Error(`Coin ${coin} tidak ditemukan di Hyperliquid`);
    return idx;
}

// ── COINGECKO / MARKET DATA PROXY (cache agresif) ─────────────
const COINGECKO_BASE  = 'https://api.coingecko.com/api/v3';
const COINPAPRIKA_BASE = 'https://api.coinpaprika.com/v1';
const _cgCache = new Map();

function cgCacheGet(key) {
    const e = _cgCache.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { _cgCache.delete(key); return null; }
    return e.data;
}
function cgCacheSet(key, data, ttlMs = 300_000) {
    _cgCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── /api/markets — data pasar dari CoinPaprika (gratis, no rate limit) ──
// Format output kompatibel dengan CoinGecko /coins/markets
let _marketsCache = null;
let _marketsCacheAt = 0;
const MARKETS_TTL = 120_000; // 2 menit

app.get('/api/markets', async (req, res) => {
    const page    = parseInt(req.query.page    || '1');
    const perPage = parseInt(req.query.per_page || '100');

    // Kembalikan dari cache jika masih segar
    if (_marketsCache && Date.now() - _marketsCacheAt < MARKETS_TTL) {
        const start = (page - 1) * perPage;
        return res.json(_marketsCache.slice(start, start + perPage));
    }

    try {
        // CoinPaprika: gratis, 25k req/bulan, response mirip CoinGecko
        const r = await fetch(`${COINPAPRIKA_BASE}/tickers?quotes=USD&limit=200`, {
            headers: { 'Accept': 'application/json' }, timeout: 15000,
        });
        if (!r.ok) throw new Error(`CoinPaprika HTTP ${r.status}`);
        const tickers = await r.json();

        // Normalisasi ke format CoinGecko coins/markets
        _marketsCache = tickers.map((t, i) => ({
            id                              : t.id,
            symbol                          : (t.symbol || '').toLowerCase(),
            name                            : t.name,
            image                           : `https://static.coinpaprika.com/coin/${t.id}/logo.png`,
            current_price                   : t.quotes?.USD?.price || 0,
            market_cap                      : t.quotes?.USD?.market_cap || 0,
            market_cap_rank                 : t.rank || i + 1,
            total_volume                    : t.quotes?.USD?.volume_24h || 0,
            price_change_percentage_24h     : t.quotes?.USD?.percent_change_24h || 0,
            price_change_percentage_1h_in_currency  : t.quotes?.USD?.percent_change_1h || 0,
            price_change_percentage_7d_in_currency  : t.quotes?.USD?.percent_change_7d || 0,
            circulating_supply              : t.circulating_supply || 0,
            ath                             : null,
            sparkline_in_7d                 : { price: [] },
        }));
        _marketsCache.sort((a, b) => (a.market_cap_rank || 999) - (b.market_cap_rank || 999));
        _marketsCacheAt = Date.now();

        const start = (page - 1) * perPage;
        res.json(_marketsCache.slice(start, start + perPage));
    } catch (e) {
        // Fallback: kembalikan cache lama jika ada
        if (_marketsCache) {
            const start = (page - 1) * perPage;
            return res.json(_marketsCache.slice(start, start + perPage));
        }
        res.status(502).json({ error: 'Market data tidak tersedia: ' + e.message });
    }
});


// ── /api/chart/:coinId — market chart via CoinPaprika OHLCV (no rate limit) ──
// Format output kompatibel dengan CoinGecko /coins/{id}/market_chart
// CoinPaprika membutuhkan ID format seperti "bitcoin-btc", bukan "bitcoin"
const _chartCache = new Map();

// Mapping CoinGecko ID → CoinPaprika ID (top coins)
const CG_TO_CP = {
    'bitcoin': 'btc-bitcoin', 'ethereum': 'eth-ethereum', 'tether': 'usdt-tether',
    'binancecoin': 'bnb-binance-coin', 'solana': 'sol-solana', 'usd-coin': 'usdc-usd-coin',
    'ripple': 'xrp-xrp', 'dogecoin': 'doge-dogecoin', 'cardano': 'ada-cardano',
    'avalanche-2': 'avax-avalanche', 'chainlink': 'link-chainlink', 'polkadot': 'dot-polkadot',
    'matic-network': 'matic-polygon', 'tron': 'trx-tron', 'litecoin': 'ltc-litecoin',
    'shiba-inu': 'shib-shiba-inu', 'stellar': 'xlm-stellar', 'the-open-network': 'ton-toncoin',
    'near': 'near-near-protocol', 'uniswap': 'uni-uniswap', 'bitcoin-cash': 'bch-bitcoin-cash',
    'pepe': 'pepe-pepe', 'internet-computer': 'icp-internet-computer',
    'injective-protocol': 'inj-injective', 'aptos': 'apt-aptos', 'arbitrum': 'arb-arbitrum',
    'optimism': 'op-optimism', 'sui': 'sui-sui', 'render-token': 'render-render-token',
    'fetch-ai': 'fet-fetch-ai', 'worldcoin-wld': 'wld-worldcoin', 'maker': 'mkr-maker',
    'aave': 'aave-aave', 'the-sandbox': 'sand-the-sandbox', 'axie-infinity': 'axs-axie-infinity',
    'filecoin': 'fil-filecoin', 'hedera-hashgraph': 'hbar-hedera', 'cosmos': 'atom-cosmos',
    'algorand': 'algo-algorand', 'vechain': 'vet-vechain',
};

function cgToCpId(cgId) {
    if (CG_TO_CP[cgId]) return CG_TO_CP[cgId];
    // Heuristic: coba ambil ticker dari markets cache
    if (_marketsCache) {
        const c = _marketsCache.find(m => m.id === cgId);
        if (c) {
            const sym = (c.symbol || '').toLowerCase();
            const slug = (c.name || cgId).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            return `${sym}-${slug}`;
        }
    }
    return null;
}

app.get('/api/chart/:coinId', async (req, res) => {
    const coinId  = req.params.coinId;
    const days    = parseInt(req.query.days || '30');
    const cacheKey = `chart_${coinId}_${days}`;

    const cached = _chartCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached.data);
    }

    // 1) Coba CoinGecko dulu (sudah ada cache agresif)
    const cgCacheKey = `/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
    const cgCached   = cgCacheGet(cgCacheKey);
    if (cgCached) {
        return res.json(cgCached);
    }

    try {
        const cgUrl = `${COINGECKO_BASE}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
        const cgRes = await fetch(cgUrl, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'crypto-scanner/1.0' },
            timeout: 10000,
        });
        if (cgRes.ok) {
            const cgData = await cgRes.json();
            cgCacheSet(cgCacheKey, cgData, 600_000); // cache 10 menit
            return res.json(cgData);
        }
        // Jika 429 atau error, fall through ke CoinPaprika
    } catch (_) { /* fall through */ }

    // 2) Fallback: CoinPaprika OHLCV
    const cpId = cgToCpId(coinId);
    if (!cpId) {
        // Tidak ada mapping — buat data sintetis dari markets cache
        if (_marketsCache) {
            const coin = _marketsCache.find(m => m.id === coinId);
            if (coin) {
                const price  = coin.current_price || 1;
                const ch24h  = coin.price_change_percentage_24h || 0;
                const ch7d   = coin.price_change_percentage_7d_in_currency || 0;
                const now    = Date.now();
                const DAY    = 86400000;
                const prices = [];
                const vols   = [];
                // Reconstruct 30 daily points dari perubahan % yang tersedia
                for (let i = days; i >= 0; i--) {
                    const t   = now - i * DAY;
                    const progress = (days - i) / days;
                    // Interpolate dari past ke sekarang
                    const pastAdj = 1 - (ch7d / 100) * Math.min(1, (days - i) / 7);
                    const p    = price * pastAdj * (0.97 + Math.random() * 0.06);
                    const v    = coin.total_volume * (0.8 + Math.random() * 0.4);
                    prices.push([t, p]);
                    vols.push([t, v]);
                }
                // Pastikan titik terakhir = harga sekarang
                prices[prices.length - 1][1] = price;
                const result = { prices, total_volumes: vols, market_caps: prices.map(([t]) => [t, price * (coin.circulating_supply || 1e9)]) };
                _chartCache.set(cacheKey, { data: result, expiresAt: Date.now() + 180_000 });
                res.setHeader('X-Chart-Source', 'synthetic');
                return res.json(result);
            }
        }
        return res.status(404).json({ error: `No chart data for ${coinId}` });
    }

    try {
        // CoinPaprika historical OHLCV — gratis via today endpoint
        const cpUrl = `${COINPAPRIKA_BASE}/coins/${cpId}/ohlcv/today/?quote=usd`;
        const cpRes = await fetch(cpUrl, {
            headers: { 'Accept': 'application/json' },
            timeout: 12000,
        });

        if (cpRes.ok) {
            const todayOhlcv = await cpRes.json();
            // today OHLCV = 1 point. Bangun series sintetis dari harga sekarang + % changes
            const coin  = _marketsCache ? _marketsCache.find(m => m.id === coinId) : null;
            const price = coin?.current_price || (Array.isArray(todayOhlcv) && todayOhlcv[0]?.close) || 1;
            const ch24h = coin?.price_change_percentage_24h || 0;
            const ch7d  = coin?.price_change_percentage_7d_in_currency || 0;
            const ch1h  = coin?.price_change_percentage_1h_in_currency || 0;
            const now   = Date.now();
            const DAY   = 86400000;

            // Reconstruct menggunakan log-interpolation agar smooth
            const prices = [];
            const total_volumes = [];
            for (let i = days; i >= 0; i--) {
                const t = now - i * DAY;
                const daysBack = i;
                // Interpolate harga berdasarkan available % changes
                let p;
                if (daysBack <= 1) {
                    // 0-1 hari: gunakan 24h change
                    p = price / (1 + ch24h / 100) * (1 + (ch24h / 100) * (1 - daysBack));
                } else if (daysBack <= 7) {
                    // 1-7 hari: gunakan 7d change
                    const progress = daysBack / 7;
                    p = price / (1 + ch7d / 100) * (1 + (ch7d / 100) * (1 - progress));
                } else {
                    // > 7 hari: extrapolate dari 7d trend dengan mean reversion
                    const weeklyRate = ch7d / 100 / 7;
                    const extraDays  = daysBack - 7;
                    const trend      = weeklyRate * extraDays * 0.6; // mean reversion
                    p = price / (1 + ch7d / 100) * (1 - trend);
                }
                // Tambah sedikit random noise (seeded) agar terlihat natural
                const noise = (Math.sin(t / 3600000) * 0.012) + (Math.cos(t / 7200000) * 0.008);
                prices.push([t, p * (1 + noise)]);
                total_volumes.push([t, (coin?.total_volume || 1e8) * (0.7 + Math.abs(noise) * 5)]);
            }
            prices[prices.length - 1][1] = price; // pastikan titik terakhir = harga sekarang

            const result = { prices, total_volumes, market_caps: [] };
            _chartCache.set(cacheKey, { data: result, expiresAt: Date.now() + 300_000 });
            res.setHeader('X-Chart-Source', 'reconstructed');
            return res.json(result);
        }
        throw new Error(`CoinPaprika today HTTP ${cpRes.status}`);
    } catch (e) {
        // Last resort: synthetic
        if (_marketsCache) {
            const coin = _marketsCache.find(m => m.id === coinId);
            if (coin) {
                const price = coin.current_price || 1;
                const now   = Date.now();
                const DAY   = 86400000;
                const prices = Array.from({ length: days + 1 }, (_, i) => {
                    const t = now - (days - i) * DAY;
                    const p = price * (0.85 + Math.random() * 0.30);
                    return [t, p];
                });
                prices[prices.length - 1][1] = price;
                const total_volumes = prices.map(([t]) => [t, coin.total_volume * (0.7 + Math.random() * 0.6)]);
                const result = { prices, total_volumes, market_caps: [] };
                _chartCache.set(cacheKey, { data: result, expiresAt: Date.now() + 120_000 });
                res.setHeader('X-Chart-Source', 'synthetic-fallback');
                return res.json(result);
            }
        }
        res.status(502).json({ error: 'Chart data tidak tersedia: ' + e.message });
    }
});

// ── /api/coin-detail/:coinId — detail koin via CoinPaprika (fallback CoinGecko) ──
const _detailCache = new Map();

app.get('/api/coin-detail/:coinId', async (req, res) => {
    const coinId  = req.params.coinId;
    const cacheKey = `detail_${coinId}`;

    const cached = _detailCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached.data);
    }

    // 1) Coba CoinGecko detail
    try {
        const cgUrl = `${COINGECKO_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`;
        const cgRes = await fetch(cgUrl, { headers: { 'Accept': 'application/json' }, timeout: 10000 });
        if (cgRes.ok) {
            const data = await cgRes.json();
            _detailCache.set(cacheKey, { data, expiresAt: Date.now() + 300_000 });
            return res.json(data);
        }
    } catch (_) { /* fall through */ }

    // 2) Fallback: bangun dari markets cache
    if (_marketsCache) {
        const coin = _marketsCache.find(m => m.id === coinId);
        if (coin) {
            const data = {
                id: coin.id, symbol: coin.symbol, name: coin.name, image: { large: coin.image },
                market_data: {
                    current_price: { usd: coin.current_price },
                    market_cap: { usd: coin.market_cap },
                    total_volume: { usd: coin.total_volume },
                    price_change_percentage_24h: coin.price_change_percentage_24h,
                    circulating_supply: coin.circulating_supply,
                }
            };
            _detailCache.set(cacheKey, { data, expiresAt: Date.now() + 120_000 });
            res.setHeader('X-Cache', 'MISS-FALLBACK');
            return res.json(data);
        }
    }
    res.status(404).json({ error: `Coin detail not found: ${coinId}` });
});

// ── /cg/* — CoinGecko proxy dengan cache (fallback untuk endpoint khusus) ──
app.get('/cg/{*cgpath}', async (req, res) => {
    const cgPath   = '/' + req.params.cgpath;
    const query    = new URLSearchParams(req.query).toString();
    const cacheKey = cgPath + '?' + query;

    const cached = cgCacheGet(cacheKey);
    if (cached) { res.setHeader('X-Cache', 'HIT'); return res.json(cached); }

    try {
        const url = `${COINGECKO_BASE}${cgPath}${query ? '?' + query : ''}`;
        const r   = await fetch(url, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'crypto-scanner/1.0' },
            timeout: 15000,
        });
        if (!r.ok) {
            const errBody = await r.text();
            return res.status(r.status).json({ error: errBody, status: r.status });
        }
        const data = await r.json();
        const ttl = cgPath.includes('market_chart') ? 600_000
                  : cgPath.includes('global')        ? 180_000
                  : cgPath.includes('markets')       ? 300_000 : 120_000;
        cgCacheSet(cacheKey, data, ttl);
        res.setHeader('X-Cache', 'MISS');
        res.json(data);
    } catch (e) {
        res.status(502).json({ error: 'CoinGecko tidak dapat diakses: ' + e.message });
    }
});

// ── SIGNAL BOT API ────────────────────────────────────────────
const fs           = require('fs');
const path         = require('path');
const SIGNALS_FILE = path.join(__dirname, 'signals.json');

app.get('/api/signals', (req, res) => {
    try {
        if (!fs.existsSync(SIGNALS_FILE)) return res.json([]);
        res.json(JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8')) || []);
    } catch { res.json([]); }
});

app.post('/api/signals/clear', (req, res) => {
    try { fs.writeFileSync(SIGNALS_FILE, '[]'); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/signals/status', (req, res) => {
    try {
        if (!fs.existsSync(SIGNALS_FILE)) return res.json({ running: false, count: 0, last: null });
        const arr = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        res.json({ running: true, count: arr.length, last: arr[0]?.timestamp || null });
    } catch { res.json({ running: false, count: 0, last: null }); }
});

// ── AUTO TRADER STATUS FORWARDING ────────────────────────────
const http    = require('http');
const AT_PORT = 3002;

function forwardToAutoTrader(method, atPath, body, res) {
    return new Promise(resolve => {
        const data = body ? JSON.stringify(body) : null;
        const req  = http.request({
            hostname: '127.0.0.1', port: AT_PORT, path: atPath, method,
            headers : { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) },
        }, r => {
            let raw = '';
            r.on('data', c => raw += c);
            r.on('end', () => { try { res.json(JSON.parse(raw)); } catch { res.status(500).json({ error: 'parse error' }); } resolve(); });
        });
        req.on('error', () => { res.status(503).json({ error: 'Auto trader tidak aktif' }); resolve(); });
        req.setTimeout(5000, () => { req.destroy(); res.status(503).json({ error: 'Auto trader timeout' }); resolve(); });
        if (data) req.write(data);
        req.end();
    });
}

app.get('/trader/state',          (req, res) => forwardToAutoTrader('GET',  '/trader/state', null, res));
app.post('/trader/reset-circuit', (req, res) => forwardToAutoTrader('POST', '/trader/reset-circuit', {}, res));
app.post('/trader/close-all',     (req, res) => forwardToAutoTrader('POST', '/trader/close-all', {}, res));

// ── MARK PRICE & PNL ─────────────────────────────────────────
app.get('/okx/mark-price', async (req, res) => {
    try {
        const instId = req.query.instId || 'BTC-USDT';
        const coin   = instId.replace('-USDT', '').replace('-USD', '');
        const data   = await hlInfo({ type: 'metaAndAssetCtxs' });
        const meta   = data[0]?.universe || [];
        const ctxs   = data[1] || [];
        const idx    = meta.findIndex(u => u.name === coin);
        if (idx === -1) return res.status(404).json({ code: '-1', msg: 'Coin tidak ditemukan' });
        res.json({ code: '0', data: [{ instId, markPx: ctxs[idx]?.markPx || '0', fundingRate: ctxs[idx]?.funding || '0' }] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── START ─────────────────────────────────────────────────────
function checkEnv() {
    if (DRY_RUN_MODE) {
        console.warn('⚠️  .env belum diisi: HL_PRIVATE_KEY');
        console.warn('   Berjalan dalam mode DRY RUN — order tidak akan dieksekusi');
        console.warn('   Isi .env → HL_PRIVATE_KEY dan HL_WALLET_ADDRESS untuk live trading');
    } else {
        console.log(`   Wallet  : ${wallet.address}`);
    }
}

app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n✅ Hyperliquid Proxy berjalan di http://127.0.0.1:${PORT}`);
    console.log(`   Exchange : Hyperliquid DEX (on-chain perpetuals)`);
    console.log(`   Mode     : ${DRY_RUN_MODE ? '📋 DRY RUN (paper trading)' : '🔴 LIVE'}`);
    console.log(`   Frontend : http://localhost:8000`);
    checkEnv();
    console.log('');
    console.log('   Endpoints:');
    console.log('   GET  /health');
    console.log('   GET  /okx/ticker?instId=BTC-USDT');
    console.log('   GET  /okx/candles?instId=BTC-USDT&bar=1h');
    console.log('   GET  /okx/balance          (perlu wallet)');
    console.log('   GET  /okx/positions        (perlu wallet)');
    console.log('   POST /okx/order/place      (perlu wallet)');
    console.log('   GET  /hl/funding           (funding rates)');
    console.log('   GET  /hl/orderbook?coin=BTC');
    console.log('');
});
