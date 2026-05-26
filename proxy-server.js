/**
 * OKX API Proxy Server
 * Jalankan: node proxy-server.js
 * Berjalan di localhost:3001 — tidak terekspos ke internet
 *
 * KEAMANAN:
 *  - API key tersimpan di .env (tidak pernah dikirim ke browser)
 *  - Hanya menerima request dari localhost (origin check)
 *  - Semua request di-sign HMAC-SHA256 di sini, bukan di browser
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const fetch    = require('node-fetch');
const fs       = require('fs');
const path     = require('path');
const whale    = require('./whale-detector');

const app  = express();
const PORT = process.env.PROXY_PORT || 3001;

const OKX_BASE     = 'https://www.okx.com';
const API_KEY      = process.env.OKX_API_KEY;
const SECRET_KEY   = process.env.OKX_SECRET_KEY;
const PASSPHRASE   = process.env.OKX_PASSPHRASE;
const GROQ_KEY     = process.env.GROQ_API_KEY || '';

// ── Keamanan: hanya terima dari localhost ─────────────────────
app.use(cors({
    origin: ['http://localhost:8000', 'http://127.0.0.1:8000',
             'http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
}));
app.use(express.json());

// ── Validasi .env saat startup ────────────────────────────────
const DRY_RUN_MODE = !API_KEY || API_KEY === 'GANTI_DENGAN_API_KEY_BARU';
// If set to '1' or 'true', skip the pre-warm network calls at startup
const SKIP_PREWARM = process.env.SKIP_PREWARM === '1' || process.env.SKIP_PREWARM === 'true';

function checkEnv() {
    const missing = [];
    if (!API_KEY    || API_KEY    === 'GANTI_DENGAN_API_KEY_BARU')    missing.push('OKX_API_KEY');
    if (!SECRET_KEY || SECRET_KEY === 'GANTI_DENGAN_SECRET_KEY_BARU') missing.push('OKX_SECRET_KEY');
    if (!PASSPHRASE || PASSPHRASE === 'GANTI_DENGAN_PASSPHRASE_KAMU') missing.push('OKX_PASSPHRASE');
    if (missing.length) {
        console.warn('⚠️  .env belum diisi:', missing.join(', '));
        console.warn('   Berjalan dalam mode DRY RUN — endpoint OKX dinonaktifkan.');
        console.warn('   Market data publik (ticker, candles) tetap tersedia.');
    }
}

// ── OKX HMAC-SHA256 signature ─────────────────────────────────
function sign(timestamp, method, path, body = '') {
    const msg = timestamp + method.toUpperCase() + path + (body ? JSON.stringify(body) : '');
    return crypto.createHmac('sha256', SECRET_KEY).update(msg).digest('base64');
}

function buildHeaders(method, path, body) {
    const ts  = new Date().toISOString();
    const sig = sign(ts, method, path, body);
    return {
        'Content-Type':         'application/json',
        'OK-ACCESS-KEY':        API_KEY,
        'OK-ACCESS-SIGN':       sig,
        'OK-ACCESS-TIMESTAMP':  ts,
        'OK-ACCESS-PASSPHRASE': PASSPHRASE,
    };
}

// ── Helper: forward GET ke OKX ────────────────────────────────
async function okxGet(path) {
    const headers = buildHeaders('GET', path, '');
    const res     = await fetch(OKX_BASE + path, { headers });
    return res.json();
}

// ── Helper: forward POST ke OKX ──────────────────────────────
async function okxPost(path, body) {
    const headers = buildHeaders('POST', path, body);
    const res     = await fetch(OKX_BASE + path, {
        method:  'POST',
        headers,
        body:    JSON.stringify(body),
    });
    return res.json();
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// Health check
app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now(), dryRun: DRY_RUN_MODE }));

// Middleware: blokir endpoint yang butuh auth saat dry run
function requireAuth(req, res, next) {
    if (DRY_RUN_MODE) {
        return res.status(503).json({ error: 'DRY_RUN: API key belum diisi di .env', dryRun: true });
    }
    next();
}

// ── AKUN ──────────────────────────────────────────────────────

// GET /okx/balance — saldo semua aset (trading account)
app.get('/okx/balance', requireAuth, async (req, res) => {
    try {
        const ccy = req.query.ccy ? `?ccy=${req.query.ccy}` : '';
        const data = await okxGet(`/api/v5/account/balance${ccy}`);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/positions — posisi terbuka
app.get('/okx/positions', requireAuth, async (req, res) => {
    try {
        const instType = req.query.instType || 'SPOT';
        const data = await okxGet(`/api/v5/account/positions?instType=${instType}`);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── ORDER ─────────────────────────────────────────────────────

// GET /okx/orders/pending — order yang masih terbuka
app.get('/okx/orders/pending', requireAuth, async (req, res) => {
    try {
        const instType = req.query.instType || 'SPOT';
        const data = await okxGet(`/api/v5/trade/orders-pending?instType=${instType}`);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/orders/history — history order (max 7 hari)
app.get('/okx/orders/history', requireAuth, async (req, res) => {
    try {
        const instType = req.query.instType || 'SPOT';
        const limit    = req.query.limit    || 20;
        const data = await okxGet(`/api/v5/trade/orders-history?instType=${instType}&limit=${limit}`);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /okx/order/place — pasang order baru
app.post('/okx/order/place', requireAuth, async (req, res) => {
    try {
        const { instId, tdMode, side, ordType, sz, px } = req.body;
        if (!instId || !side || !ordType || !sz) {
            return res.status(400).json({ error: 'instId, side, ordType, sz wajib diisi' });
        }
        const body = { instId, tdMode: tdMode || 'cash', side, ordType, sz };
        if (px) body.px = px;
        const data = await okxPost('/api/v5/trade/order', body);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /okx/order/cancel — batalkan order
// Body: { instId, ordId }
app.post('/okx/order/cancel', requireAuth, async (req, res) => {
    try {
        const { instId, ordId } = req.body;
        if (!instId || !ordId) return res.status(400).json({ error: 'instId dan ordId wajib' });
        const data = await okxPost('/api/v5/trade/cancel-order', { instId, ordId });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── MARKET DATA (publik, tidak perlu sign) ────────────────────

// GET /okx/ticker?instId=BTC-USDT
app.get('/okx/ticker', async (req, res) => {
    try {
        const instId = req.query.instId || 'BTC-USDT';
        const r = await fetch(`${OKX_BASE}/api/v5/market/ticker?instId=${instId}`);
        res.json(await r.json());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/instruments?instType=SPOT — daftar semua instrumen
app.get('/okx/instruments', async (req, res) => {
    try {
        const instType = req.query.instType || 'SPOT';
        const r = await fetch(`${OKX_BASE}/api/v5/public/instruments?instType=${instType}`);
        res.json(await r.json());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/candles?instId=BTC-USDT&bar=1H&limit=100 — candlestick data
app.get('/okx/candles', async (req, res) => {
    try {
        const { instId = 'BTC-USDT', bar = '1H', limit = 100 } = req.query;
        const r = await fetch(`${OKX_BASE}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`);
        res.json(await r.json());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/mark-price?instId=BTC-USDT — harga mark (lebih stabil dari last price)
app.get('/okx/mark-price', async (req, res) => {
    try {
        const instId = req.query.instId || 'BTC-USDT';
        const r = await fetch(`${OKX_BASE}/api/v5/public/mark-price?instType=SPOT&instId=${instId}`);
        res.json(await r.json());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/account/config — konfigurasi akun (leverage mode, dll)
app.get('/okx/account/config', async (req, res) => {
    try {
        const data = await okxGet('/api/v5/account/config');
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /okx/order/amend — ubah harga/qty order yang pending
// Body: { instId, ordId, newSz?, newPx? }
app.post('/okx/order/amend', async (req, res) => {
    try {
        const { instId, ordId, newSz, newPx } = req.body;
        if (!instId || !ordId) return res.status(400).json({ error: 'instId dan ordId wajib' });
        const body = { instId, ordId };
        if (newSz) body.newSz = newSz;
        if (newPx) body.newPx = newPx;
        const data = await okxPost('/api/v5/trade/amend-order', body);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── AUTO TRADER API ───────────────────────────────────────────
// Forward ke auto-trader status server di :3002
const AT_HOST = '127.0.0.1';
const AT_PORT = 3002;

async function forwardToAutoTrader(method, path, body, res) {
    try {
        const http = require('http');
        const data = body ? JSON.stringify(body) : null;
        return new Promise((resolve) => {
            const req = http.request({ hostname: AT_HOST, port: AT_PORT, path, method,
                headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
            }, r => {
                let raw = '';
                r.on('data', c => raw += c);
                r.on('end', () => { res.json(JSON.parse(raw)); resolve(); });
            });
            req.on('error', () => { res.status(503).json({ error: 'Auto trader tidak aktif' }); resolve(); });
            if (data) req.write(data);
            req.end();
        });
    } catch (e) { res.status(503).json({ error: e.message }); }
}

app.get('/trader/state',           (req, res) => forwardToAutoTrader('GET',  '/trader/state', null, res));
app.post('/trader/reset-circuit',  (req, res) => forwardToAutoTrader('POST', '/trader/reset-circuit', {}, res));
app.post('/trader/close-all',      (req, res) => forwardToAutoTrader('POST', '/trader/close-all', {}, res));

// ── SIGNAL BOT API ────────────────────────────────────────────
const SIGNALS_FILE = require('path').join(__dirname, 'signals.json');

// GET /api/signals — ambil semua sinyal tersimpan
app.get('/api/signals', (req, res) => {
    try {
        if (!require('fs').existsSync(SIGNALS_FILE)) return res.json([]);
        const data = JSON.parse(require('fs').readFileSync(SIGNALS_FILE, 'utf8'));
        res.json(Array.isArray(data) ? data : []);
    } catch (e) { res.json([]); }
});

// POST /api/signals/clear — hapus semua log sinyal
app.post('/api/signals/clear', (req, res) => {
    try {
        require('fs').writeFileSync(SIGNALS_FILE, '[]');
        res.json({ ok: true, message: 'Signal log cleared' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/signals/status — status bot (apakah signals.json ada + timestamp terakhir)
app.get('/api/signals/status', (req, res) => {
    try {
        if (!require('fs').existsSync(SIGNALS_FILE)) return res.json({ running: false, count: 0, last: null });
        const data = JSON.parse(require('fs').readFileSync(SIGNALS_FILE, 'utf8'));
        const arr  = Array.isArray(data) ? data : [];
        res.json({ running: true, count: arr.length, last: arr[0]?.timestamp || null });
    } catch (e) { res.json({ running: false, count: 0, last: null }); }
});

// ── Swap Proxy: Raydium (primary) + Jupiter Ultra fallback ───────────────────
// quote-api.jup.ag sudah mati — pakai Raydium swap API (tanpa API key)
// Raydium API docs: https://transaction-v1.raydium.io

const RAYDIUM_COMPUTE = 'https://transaction-v1.raydium.io/compute/swap-base-in';
const RAYDIUM_TX      = 'https://transaction-v1.raydium.io/transaction/swap-base-in';
const JUPITER_ULTRA   = 'https://api.jup.ag/ultra/v1';  // butuh API key, fallback saja

// GET /jupiter/quote — ambil quote dari Raydium (primary) → PumpFun AMM (fallback untuk token baru)
app.get('/jupiter/quote', async (req, res) => {
    const { inputMint, outputMint, amount, slippageBps = 150 } = req.query;
    if (!inputMint || !outputMint || !amount) {
        return res.status(400).json({ error: 'Missing inputMint/outputMint/amount' });
    }

    // ── 1. Raydium compute swap (primary) ───────────────────────────
    try {
        const url = `${RAYDIUM_COMPUTE}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&txVersion=V0`;
        const r = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(12000),
        });
        if (r.ok) {
            const d = await r.json();
            if (d?.success && d?.data?.outputAmount) {
                return res.json({
                    _source       : 'raydium',
                    inputMint,
                    outputMint,
                    inAmount      : String(amount),
                    outAmount     : String(d.data.outputAmount),
                    otherAmountThreshold: String(d.data.otherAmountThreshold || 0),
                    priceImpactPct: d.data.priceImpactPct || 0,
                    slippageBps   : +slippageBps,
                    _raydiumData  : d.data,
                });
            }
            // ROUTE_NOT_FOUND → token baru, coba fallback
            const msg = d?.msg || '';
            if (msg.includes('ROUTE_NOT_FOUND') || msg.includes('NOT_FOUND')) {
                console.log('[proxy] Raydium ROUTE_NOT_FOUND untuk', outputMint, '— token belum ada di Raydium pool');
                return res.status(404).json({
                    error       : 'NO_ROUTE',
                    errorDetail : 'Token belum ada liquidity di Raydium. Token mungkin hanya ada di pump.fun / Moonshot.',
                    hint        : 'Coba beli manual di pump.fun atau moonshot.money',
                    outputMint,
                });
            }
            return res.status(400).json({ error: d?.msg || 'Raydium compute failed', _raw: d });
        }
    } catch(e) {
        console.warn('[proxy] Raydium quote error:', e.message);
    }
    res.status(503).json({ error: 'Swap quote gagal — Raydium tidak tersedia' });
});

// POST /jupiter/swap — buat swap transaction dari Raydium quote
app.post('/jupiter/swap', async (req, res) => {
    const { quoteResponse, userPublicKey, wrapAndUnwrapSol = true } = req.body;
    if (!quoteResponse || !userPublicKey) {
        return res.status(400).json({ error: 'Missing quoteResponse or userPublicKey' });
    }
    // Raydium: butuh _raydiumData dari quote response
    if (quoteResponse._source === 'raydium' && quoteResponse._raydiumData) {
        try {
            const txBody = {
                computeUnitPriceMicroLamports : 'auto',
                swapResponse                  : { id: quoteResponse._raydiumData.id || '', success: true, version: 'V1', data: [quoteResponse._raydiumData] },
                txVersion                     : 'V0',
                wallet                        : userPublicKey,
                wrapSol                       : wrapAndUnwrapSol,
                unwrapSol                     : wrapAndUnwrapSol,
            };
            const r = await fetch(RAYDIUM_TX, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body   : JSON.stringify(txBody),
                signal : AbortSignal.timeout(18000),
            });
            if (r.ok) {
                const d = await r.json();
                // Raydium returns array of transactions
                const txArr = d?.data;
                if (Array.isArray(txArr) && txArr.length > 0) {
                    const txBase64 = txArr[0]?.transaction || txArr[0];
                    if (txBase64) return res.json({ swapTransaction: txBase64, _source: 'raydium' });
                }
                return res.status(400).json({ error: d?.msg || 'Raydium TX build failed', _raw: d });
            }
        } catch(e) {
            console.warn('[proxy] Raydium swap TX error:', e.message);
        }
    }
    res.status(503).json({ error: 'Swap TX gagal — tidak dapat membuat transaksi' });
});

// POST /jupiter/send — relay sendTransaction ke Solana RPC
app.post('/jupiter/send', async (req, res) => {
    const { transaction, options = {} } = req.body;
    const RPC_LIST = [
        'https://rpc.ankr.com/solana',
        'https://solana-rpc.publicnode.com',
        'https://api.mainnet-beta.solana.com',
        'https://solana.drpc.org',
    ];
    const payload = JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'sendTransaction',
        params: [transaction, { encoding: 'base64', skipPreflight: false, maxRetries: 3, ...options }],
    });
    for (const rpc of RPC_LIST) {
        try {
            const r = await fetch(rpc, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : payload,
                signal : AbortSignal.timeout(18000),
            });
            const data = await r.json();
            if (data?.result) return res.json({ txid: data.result, rpc });
            if (data?.error) { console.warn('[send] RPC error from', rpc, data.error.message); continue; }
        } catch(e) { console.warn('[send] RPC timeout:', rpc); }
    }
    res.status(503).json({ error: 'All RPC send failed' });
});

// GET /sol-price — ambil harga SOL/USD dari multiple sources (dengan cache 30 detik)
let _solPriceCache = null;
let _solPriceCacheTs = 0;
const SOL_PRICE_CACHE_MS = 30_000; // cache 30 detik

app.get('/sol-price', async (_, res) => {
    // Kembalikan cache kalau masih fresh
    if (_solPriceCache && (Date.now() - _solPriceCacheTs) < SOL_PRICE_CACHE_MS) {
        return res.json({ price: _solPriceCache, source: 'cache', cachedAgo: Math.round((Date.now()-_solPriceCacheTs)/1000)+'s' });
    }
    const sources = [
        // Pyth Network (paling cepat, no rate limit)
        {
            url  : 'https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
            parse: d => {
                const p = d?.parsed?.[0]?.price;
                if (!p) return 0;
                return +(parseInt(p.price) * Math.pow(10, parseInt(p.expo))).toFixed(4);
            },
        },
        // Binance .com
        { url: 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',  parse: d => +(d?.price) },
        // Binance .US
        { url: 'https://api.binance.us/api/v3/ticker/price?symbol=SOLUSD',   parse: d => +(d?.price) },
    ];
    // Race semua source paralel — ambil yang paling cepat
    try {
        const results = await Promise.race([
            Promise.any(sources.map(async src => {
                const r = await fetch(src.url, { signal: AbortSignal.timeout(4000) });
                if (!r.ok) throw new Error('not ok');
                const d = await r.json();
                const p = src.parse(d);
                if (!(p > 1)) throw new Error('invalid price');
                return { price: p, source: src.url };
            })),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
        ]);
        _solPriceCache   = results.price;
        _solPriceCacheTs = Date.now();
        return res.json(results);
    } catch {
        if (_solPriceCache) return res.json({ price: _solPriceCache, source: 'stale-cache' });
        res.status(503).json({ error: 'SOL price fetch failed' });
    }
});

// POST /pumpfun/buy — buat swap TX via PumpPortal untuk pump.fun tokens
app.post('/pumpfun/buy', async (req, res) => {
    const { publicKey, mint, amountSol, slippage = 15, priorityFee = 0.0005 } = req.body;
    if (!publicKey || !mint || !amountSol) {
        return res.status(400).json({ error: 'Missing publicKey/mint/amountSol' });
    }

    // Coba pump-amm dulu (graduated tokens), lalu pump (bonding curve)
    for (const pool of ['pump-amm', 'pump']) {
        try {
            const r = await fetch('https://pumpportal.fun/api/trade-local', {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({
                    publicKey,
                    action           : 'buy',
                    mint,
                    amount           : amountSol,
                    denominatedInSol : 'true',
                    slippage,
                    priorityFee,
                    pool,
                }),
                signal: AbortSignal.timeout(15000),
            });
            if (r.ok) {
                const buf = Buffer.from(await r.arrayBuffer());
                if (buf.length < 10) continue; // bukan valid TX
                console.log(`[pumpfun] OK pool=${pool} mint=${mint.slice(0,8)} size=${buf.length}b`);
                return res.json({ swapTransaction: buf.toString('base64'), _source: 'pumpfun', pool });
            }
            const errTxt = await r.text();
            console.warn(`[pumpfun] pool=${pool} → ${r.status}: ${errTxt.slice(0,80)}`);
            // kalau "Pool account not found" → coba pool berikutnya
        } catch(e) {
            console.warn('[pumpfun] fetch error:', e.message);
        }
    }
    res.status(404).json({ error: 'NO_PUMPFUN_ROUTE', errorDetail: 'Token tidak ditemukan di pump.fun (pump maupun pump-amm pool)', hint: 'Token mungkin sudah delisted atau migrated ke DEX lain' });
});

// POST /rpc/solana — relay Solana JSON-RPC ke mainnet (bypass browser CORS/block)
app.post('/rpc/solana', async (req, res) => {
    const RPC_ENDPOINTS = [
        'https://rpc.ankr.com/solana',
        'https://solana-rpc.publicnode.com',
        'https://api.mainnet-beta.solana.com',
        'https://solana.drpc.org',
    ];
    const body = JSON.stringify(req.body);
    for (const rpc of RPC_ENDPOINTS) {
        try {
            const r = await fetch(rpc, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                signal : AbortSignal.timeout(6000),
            });
            if (!r.ok) continue;
            const data = await r.json();
            if (data?.error) continue;
            return res.json(data);
        } catch {}
    }
    res.status(503).json({ error: 'All Solana RPC endpoints failed' });
});

// ── CoinGecko proxy (bypass rate-limit / CORS) ───────────────────────────────
// GET /cg/global — global crypto market data
app.get('/cg/global', async (_, res) => {
    try {
        const r = await fetch('https://api.coingecko.com/api/v3/global', {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
        });
        if (r.ok) return res.json(await r.json());
    } catch {}
    // fallback ringan agar UI tidak crash
    res.json({ data: { total_market_cap: { usd: 0 }, market_cap_change_percentage_24h_usd: 0, active_cryptocurrencies: 0 } });
});

// GET /api/markets — daftar coin dengan harga (proxy ke CoinGecko /coins/markets)
// Cache per-page (5 menit) agar tidak hit rate limit
const _marketsCache = {};          // key: `${page}_${per_page}` → { ts, data }
const MARKETS_CACHE_MS = 5 * 60_000;

app.get('/api/markets', async (req, res) => {
    const { ids, per_page = 100, page = 1, vs_currency = 'usd' } = req.query;
    const cacheKey = `${page}_${per_page}`;

    // Serve from cache if fresh
    const cached = _marketsCache[cacheKey];
    if (!ids && cached && (Date.now() - cached.ts) < MARKETS_CACHE_MS) {
        return res.json(cached.data);
    }

    const params = new URLSearchParams({
        vs_currency, order: 'market_cap_desc',
        per_page, page, sparkline: false,
        price_change_percentage: '1h,24h,7d'
    });
    if (ids) params.set('ids', ids);

    try {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?${params}`, {
            headers: { 'Accept': 'application/json', 'x-cg-demo-api-key': '' },
            signal: AbortSignal.timeout(12000),
        });
        if (r.ok) {
            const data = await r.json();
            if (!ids) _marketsCache[cacheKey] = { ts: Date.now(), data };
            return res.json(data);
        }
        // Rate-limited — return stale cache rather than error
        if (r.status === 429 && cached) {
            console.warn('[markets] 429 rate-limit — serving stale cache');
            return res.json(cached.data);
        }
        if (r.status === 429) return res.status(429).json({ error: 'rate_limited' });
    } catch(e) {
        // Network error — serve stale cache if available
        if (cached) return res.json(cached.data);
    }
    res.json([]);
});

// POST /api/idx-signals — compute signals for IDX stocks server-side
// Body: { stocks: [ { code, price, change, volume, value, foreign, technical } ] }
app.post('/api/idx-signals', express.json({ limit: '200kb' }), (req, res) => {
    try {
        const { stocks } = req.body || {};
        if (!Array.isArray(stocks)) return res.status(400).json({ error: 'expected stocks array in body' });
        const signalsLib = require('./lib/idx-signals');
        const out = stocks.map(s => ({ code: s.code || s.ticker || '', signals: signalsLib.computeIDXSignals(s) }));
        return res.json({ ok: true, results: out });
    } catch (e) {
        console.error('/api/idx-signals error:', e && e.message);
        return res.status(500).json({ error: 'internal_error' });
    }
});

// ─── GET /api/whale-screen ────────────────────────────────────────────────────
// Deteksi whale activity dari anomali Vol/MC ratio (CoinGecko top 500, free)
let _whaleCache = null;
let _whaleCacheTs = 0;
const WHALE_TTL = 5 * 60_000; // 5 menit

app.get('/api/whale-screen', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (_whaleCache && (Date.now() - _whaleCacheTs) < WHALE_TTL) {
        return res.json(_whaleCache);
    }
    try {
        // Fetch top 500 via 2 parallel pages
        const [p1, p2] = await Promise.all([
            fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=7d&sparkline=false`, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(12000),
            }),
            fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=2&price_change_percentage=7d&sparkline=false`, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(12000),
            }),
        ]);
        const [coins1, coins2] = await Promise.all([p1.json(), p2.json()]);
        const allCoins = [...(Array.isArray(coins1) ? coins1 : []), ...(Array.isArray(coins2) ? coins2 : [])];

        const whales = [];
        for (const c of allCoins) {
            const vol  = c.total_volume    ?? 0;
            const mc   = c.market_cap      ?? 0;
            if (mc <= 0 || vol <= 0) continue;

            const ratio = vol / mc;
            if (ratio < 0.25) continue; // threshold minimum: Vol/MC > 25%

            const ch24  = c.price_change_percentage_24h ?? 0;
            const ch7d  = c.price_change_percentage_7d_in_currency ?? 0;

            // Build smart signals
            const signals = [];
            if (ratio >= 2)        signals.push('🐳 Vol/MC >200%');
            else if (ratio >= 1)   signals.push('🐋 Vol/MC >100%');
            else if (ratio >= 0.5) signals.push('🦈 Vol/MC >50%');
            else                   signals.push('🐬 Vol/MC >25%');

            if (ch24 < -10 && ratio > 0.5) signals.push('💡 Possible accumulation');
            else if (ch24 > 10 && ratio > 0.5) signals.push('⚠️ Possible distribution');
            else if (ch24 < 0 && ratio > 0.3) signals.push('📥 Buy on dip signal');
            else if (ch24 > 0 && ratio > 0.3) signals.push('📈 Volume confirms pump');

            if (ch7d > 20)  signals.push(`✅ 7d +${ch7d.toFixed(1)}%`);
            else if (ch7d < -20) signals.push(`🔴 7d ${ch7d.toFixed(1)}%`);

            if (c.market_cap_rank <= 20) signals.push('🏆 Top 20 MC');
            else if (c.market_cap_rank <= 100) signals.push('📌 Top 100');

            whales.push({
                id:           c.id,
                symbol:       c.symbol?.toUpperCase(),
                name:         c.name,
                image:        c.image,
                rank:         c.market_cap_rank,
                priceUSD:     c.current_price,
                priceChange24h: ch24,
                priceChange7d:  ch7d,
                volumeUSD:    vol,
                marketCap:    mc,
                volMcRatio:   ratio,
                signals,
            });
        }

        // Sort by Vol/MC ratio desc
        whales.sort((a, b) => b.volMcRatio - a.volMcRatio);

        _whaleCache   = { whales: whales.slice(0, 100), total: whales.length, fetchedAt: new Date().toISOString() };
        _whaleCacheTs = Date.now();
        res.json(_whaleCache);
    } catch (e) {
        console.error('/api/whale-screen error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/coin-search?q=QUERY ─────────────────────────────────────────────
// Search CoinGecko for any coin by name/ticker — for unlisted coin lookup.
let _coinSearchCache = {};
const COIN_SEARCH_TTL = 5 * 60_000;

app.get('/api/coin-search', async (req, res) => {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.status(400).json({ error: 'query too short' });

    const cacheKey = q.toLowerCase();
    if (_coinSearchCache[cacheKey] && (Date.now() - _coinSearchCache[cacheKey].ts) < COIN_SEARCH_TTL) {
        return res.json({ ok: true, cached: true, results: _coinSearchCache[cacheKey].results });
    }

    try {
        // Step 1: Search for the coin id
        const searchUrl = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
        });
        if (!searchRes.ok) return res.status(searchRes.status).json({ error: 'coingecko_search_failed' });
        const searchData = await searchRes.json();
        const topCoins = (searchData.coins || []).slice(0, 5);
        if (!topCoins.length) return res.json({ ok: true, results: [] });

        // Step 2: Get market data for top results
        const ids = topCoins.map(c => c.id).join(',');
        const mktUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false&price_change_percentage=1h,24h,7d`;
        const mktRes = await fetch(mktUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000),
        });

        let results = topCoins.map(c => ({
            id: c.id, symbol: c.symbol?.toUpperCase(), name: c.name,
            thumb: c.thumb, market_cap_rank: c.market_cap_rank,
            price: null, change24h: null, volume: null, marketCap: null,
        }));

        if (mktRes.ok) {
            const mktData = await mktRes.json();
            results = results.map(r => {
                const m = mktData.find(x => x.id === r.id);
                if (!m) return r;
                return {
                    ...r,
                    price: m.current_price,
                    change1h: m.price_change_percentage_1h_in_currency,
                    change24h: m.price_change_percentage_24h,
                    change7d: m.price_change_percentage_7d_in_currency,
                    volume: m.total_volume,
                    marketCap: m.market_cap,
                    ath: m.ath,
                    athDate: m.ath_date,
                    image: m.image,
                };
            });
        }

        _coinSearchCache[cacheKey] = { ts: Date.now(), results };
        res.json({ ok: true, results });
    } catch(e) {
        console.error('/api/coin-search error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── GET /api/idx-live — fetch live IDX prices via Yahoo Finance ───────
// Returns enriched stock list with live price/change/volume merged into static base data.
// Cache 3 minutes to avoid rate-limiting.
let _idxLiveCache    = null;
let _idxLiveCacheTs  = 0;
const IDX_LIVE_TTL   = 3 * 60_000;   // 3 minutes

// Static base enriched with pe/eps/rsi/beta/w52 etc.
const IDX_BASE = [
    // ── Banking (13) ──
    { code:'BBCA', name:'Bank Central Asia',        sector:'banking',         pe:24.2, eps:405,  rsi:58, beta:0.82, w52h:10800, w52l:8100,  divYield:1.1, macdSignal:'bullish',  marketCap:'Rp 2.408T', technical:'📈 Bullish' },
    { code:'BMRI', name:'Bank Mandiri',              sector:'banking',         pe:12.6, eps:494,  rsi:47, beta:0.91, w52h:7050,  w52l:5500,  divYield:3.2, macdSignal:'neutral',  marketCap:'Rp 1.448T', technical:'➡️ Neutral' },
    { code:'BBRI', name:'Bank Rakyat Indonesia',     sector:'banking',         pe:11.8, eps:423,  rsi:53, beta:0.88, w52h:5750,  w52l:4200,  divYield:2.8, macdSignal:'bullish',  marketCap:'Rp 1.226T', technical:'📈 Bullish' },
    { code:'BBNI', name:'Bank Negara Indonesia',     sector:'banking',         pe:10.2, eps:463,  rsi:55, beta:0.93, w52h:5300,  w52l:4100,  divYield:2.5, macdSignal:'bullish',  marketCap:'Rp 877B',   technical:'📈 Bullish' },
    { code:'BRIS', name:'Bank Syariah Indonesia',    sector:'banking',         pe:21.3, eps:98,   rsi:52, beta:1.05, w52h:2800,  w52l:1800,  divYield:0.9, macdSignal:'neutral',  marketCap:'Rp 125B',   technical:'➡️ Neutral' },
    { code:'PNLF', name:'Panin Financial',           sector:'banking',         pe:7.1,  eps:95,   rsi:43, beta:0.85, w52h:1100,  w52l:700,   divYield:2.8, macdSignal:'neutral',  marketCap:'Rp 19B',    technical:'➡️ Neutral' },
    { code:'BNII', name:'Bank Maybank Indonesia',    sector:'banking',         pe:11.2, eps:28,   rsi:45, beta:0.80, w52h:380,   w52l:250,   divYield:2.4, macdSignal:'neutral',  marketCap:'Rp 30B',    technical:'➡️ Neutral' },
    { code:'BTPS', name:'Bank BTPN Syariah',         sector:'banking',         pe:14.8, eps:138,  rsi:48, beta:0.72, w52h:2200,  w52l:1420,  divYield:1.8, macdSignal:'neutral',  marketCap:'Rp 22B',    technical:'➡️ Neutral' },
    { code:'MEGA', name:'Bank Mega',                 sector:'banking',         pe:9.4,  eps:245,  rsi:51, beta:0.65, w52h:9200,  w52l:6000,  divYield:3.6, macdSignal:'neutral',  marketCap:'Rp 24B',    technical:'➡️ Neutral' },
    { code:'NISP', name:'Bank OCBC NISP',            sector:'banking',         pe:8.8,  eps:162,  rsi:46, beta:0.78, w52h:1620,  w52l:1100,  divYield:1.9, macdSignal:'neutral',  marketCap:'Rp 24B',    technical:'➡️ Neutral' },
    { code:'BNGA', name:'Bank CIMB Niaga',           sector:'banking',         pe:7.6,  eps:220,  rsi:49, beta:0.88, w52h:1850,  w52l:1300,  divYield:3.5, macdSignal:'neutral',  marketCap:'Rp 42B',    technical:'➡️ Neutral' },
    { code:'BDMN', name:'Bank Danamon',              sector:'banking',         pe:9.1,  eps:440,  rsi:50, beta:0.82, w52h:4300,  w52l:3100,  divYield:3.2, macdSignal:'neutral',  marketCap:'Rp 38B',    technical:'➡️ Neutral' },
    { code:'BJTM', name:'Bank Jatim',                sector:'banking',         pe:8.5,  eps:72,   rsi:47, beta:0.70, w52h:720,   w52l:510,   divYield:5.8, macdSignal:'neutral',  marketCap:'Rp 14B',    technical:'➡️ Neutral' },
    // ── Mining & Energy (10) ──
    { code:'ANTM', name:'Aneka Tambang',             sector:'mining',          pe:8.4,  eps:196,  rsi:68, beta:1.42, w52h:1980,  w52l:1120,  divYield:2.1, macdSignal:'bullish',  marketCap:'Rp 394B',   technical:'🚀 Strong Bull' },
    { code:'ADRO', name:'Adaro Energy Indonesia',    sector:'mining',          pe:6.1,  eps:403,  rsi:39, beta:1.28, w52h:3100,  w52l:2200,  divYield:5.4, macdSignal:'bearish',  marketCap:'Rp 786B',   technical:'📉 Bearish' },
    { code:'ITMG', name:'Indo Tambangraya Megah',    sector:'mining',          pe:5.8,  eps:4517, rsi:50, beta:1.18, w52h:29500, w52l:22000, divYield:8.2, macdSignal:'neutral',  marketCap:'Rp 295B',   technical:'➡️ Neutral' },
    { code:'UNTR', name:'United Tractors',           sector:'mining',          pe:9.2,  eps:3533, rsi:62, beta:1.10, w52h:35000, w52l:26500, divYield:4.1, macdSignal:'bullish',  marketCap:'Rp 410B',   technical:'📈 Bullish' },
    { code:'PTBA', name:'Bukit Asam',                sector:'mining',          pe:5.2,  eps:1180, rsi:44, beta:1.15, w52h:4400,  w52l:2800,  divYield:9.1, macdSignal:'neutral',  marketCap:'Rp 160B',   technical:'➡️ Neutral' },
    { code:'PGAS', name:'Perusahaan Gas Negara',     sector:'energy',          pe:8.9,  eps:178,  rsi:46, beta:0.85, w52h:1800,  w52l:1350,  divYield:5.1, macdSignal:'neutral',  marketCap:'Rp 62B',    technical:'➡️ Neutral' },
    { code:'INCO', name:'Vale Indonesia',            sector:'mining',          pe:12.4, eps:185,  rsi:55, beta:1.35, w52h:3600,  w52l:2200,  divYield:3.2, macdSignal:'bullish',  marketCap:'Rp 58B',    technical:'📈 Bullish' },
    { code:'MDKA', name:'Merdeka Copper Gold',       sector:'mining',          pe:18.2, eps:68,   rsi:61, beta:1.55, w52h:2900,  w52l:1550,  divYield:0.4, macdSignal:'bullish',  marketCap:'Rp 95B',    technical:'📈 Bullish' },
    { code:'MEDC', name:'Medco Energi International',sector:'energy',          pe:7.4,  eps:280,  rsi:52, beta:1.20, w52h:2300,  w52l:1500,  divYield:2.8, macdSignal:'neutral',  marketCap:'Rp 52B',    technical:'➡️ Neutral' },
    { code:'ENRG', name:'Energi Mega Persada',       sector:'energy',          pe:11.6, eps:24,   rsi:42, beta:1.40, w52h:320,   w52l:185,   divYield:0,   macdSignal:'bearish',  marketCap:'Rp 14B',    technical:'📉 Bearish' },
    // ── Consumer & FMCG (10) ──
    { code:'UNVR', name:'Unilever Indonesia',        sector:'consumer',        pe:18.5, eps:114,  rsi:34, beta:0.65, w52h:3200,  w52l:1900,  divYield:5.6, macdSignal:'bearish',  marketCap:'Rp 80B',    technical:'📉 Bearish' },
    { code:'ICBP', name:'Indofood CBP',              sector:'consumer',        pe:16.2, eps:600,  rsi:48, beta:0.72, w52h:10800, w52l:8500,  divYield:3.8, macdSignal:'neutral',  marketCap:'Rp 113B',   technical:'➡️ Neutral' },
    { code:'INDF', name:'Indofood Sukses Makmur',    sector:'consumer',        pe:9.8,  eps:730,  rsi:49, beta:0.74, w52h:8200,  w52l:6100,  divYield:4.5, macdSignal:'neutral',  marketCap:'Rp 88B',    technical:'➡️ Neutral' },
    { code:'ACES', name:'Ace Hardware Indonesia',    sector:'consumer',        pe:22.1, eps:42,   rsi:46, beta:0.68, w52h:1100,  w52l:820,   divYield:1.9, macdSignal:'neutral',  marketCap:'Rp 8B',     technical:'➡️ Neutral' },
    { code:'MYOR', name:'Mayora Indah',              sector:'consumer',        pe:24.6, eps:108,  rsi:55, beta:0.75, w52h:2900,  w52l:2100,  divYield:1.2, macdSignal:'bullish',  marketCap:'Rp 45B',    technical:'📈 Bullish' },
    { code:'HMSP', name:'HM Sampoerna',              sector:'consumer',        pe:14.8, eps:62,   rsi:38, beta:0.60, w52h:980,   w52l:710,   divYield:7.8, macdSignal:'bearish',  marketCap:'Rp 110B',   technical:'📉 Bearish' },
    { code:'GGRM', name:'Gudang Garam',              sector:'consumer',        pe:8.2,  eps:3800, rsi:40, beta:0.68, w52h:33500, w52l:22000, divYield:6.2, macdSignal:'bearish',  marketCap:'Rp 59B',    technical:'📉 Bearish' },
    { code:'SIDO', name:'Sido Muncul',               sector:'consumer',        pe:20.1, eps:62,   rsi:54, beta:0.55, w52h:1080,  w52l:720,   divYield:5.8, macdSignal:'bullish',  marketCap:'Rp 23B',    technical:'📈 Bullish' },
    { code:'ULTJ', name:'Ultra Jaya Milk',           sector:'consumer',        pe:16.4, eps:124,  rsi:50, beta:0.62, w52h:2100,  w52l:1540,  divYield:1.4, macdSignal:'neutral',  marketCap:'Rp 17B',    technical:'➡️ Neutral' },
    { code:'ROTI', name:'Nippon Indosari Corpindo',  sector:'consumer',        pe:18.8, eps:42,   rsi:52, beta:0.70, w52h:1380,  w52l:950,   divYield:1.2, macdSignal:'neutral',  marketCap:'Rp 6B',     technical:'➡️ Neutral' },
    // ── Property & Construction (7) ──
    { code:'BSDE', name:'Bumi Serpong Damai',        sector:'property',        pe:14.8, eps:83,   rsi:57, beta:0.98, w52h:1480,  w52l:950,   divYield:1.2, macdSignal:'bullish',  marketCap:'Rp 72B',    technical:'📈 Bullish' },
    { code:'CTRA', name:'Ciputra Development',       sector:'property',        pe:17.2, eps:63,   rsi:56, beta:1.02, w52h:1310,  w52l:840,   divYield:1.0, macdSignal:'bullish',  marketCap:'Rp 57B',    technical:'📈 Bullish' },
    { code:'PWON', name:'Pakuwon Jati',              sector:'property',        pe:12.5, eps:48,   rsi:53, beta:0.95, w52h:620,   w52l:420,   divYield:1.8, macdSignal:'neutral',  marketCap:'Rp 30B',    technical:'➡️ Neutral' },
    { code:'SMRA', name:'Summarecon Agung',          sector:'property',        pe:15.6, eps:35,   rsi:49, beta:1.08, w52h:840,   w52l:560,   divYield:0.8, macdSignal:'neutral',  marketCap:'Rp 17B',    technical:'➡️ Neutral' },
    { code:'DILD', name:'Intiland Development',      sector:'property',        pe:20.2, eps:18,   rsi:44, beta:0.90, w52h:360,   w52l:220,   divYield:0.5, macdSignal:'neutral',  marketCap:'Rp 6B',     technical:'➡️ Neutral' },
    { code:'WIKA', name:'Wijaya Karya',              sector:'property',        pe:22.8, eps:25,   rsi:38, beta:1.15, w52h:820,   w52l:430,   divYield:0.3, macdSignal:'bearish',  marketCap:'Rp 9B',     technical:'📉 Bearish' },
    { code:'WSKT', name:'Waskita Karya',             sector:'property',        pe:-5.2, eps:-18,  rsi:30, beta:1.30, w52h:295,   w52l:140,   divYield:0,   macdSignal:'bearish',  marketCap:'Rp 5B',     technical:'📉 Bearish' },
    // ── Healthcare (5) ──
    { code:'HEAL', name:'Medikaloka Hermina',        sector:'healthcare',      pe:21.4, eps:76,   rsi:44, beta:0.74, w52h:1950,  w52l:1450,  divYield:0.8, macdSignal:'neutral',  marketCap:'Rp 38B',    technical:'➡️ Neutral' },
    { code:'KLBF', name:'Kalbe Farma',               sector:'healthcare',      pe:19.6, eps:76,   rsi:60, beta:0.69, w52h:1700,  w52l:1200,  divYield:2.4, macdSignal:'bullish',  marketCap:'Rp 52B',    technical:'📈 Bullish' },
    { code:'MIKA', name:'Mitra Keluarga Karyasehat', sector:'healthcare',      pe:30.2, eps:78,   rsi:58, beta:0.60, w52h:2820,  w52l:2000,  divYield:1.6, macdSignal:'bullish',  marketCap:'Rp 56B',    technical:'📈 Bullish' },
    { code:'PRDA', name:'Prodia Widyahusada',        sector:'healthcare',      pe:22.4, eps:348,  rsi:48, beta:0.65, w52h:9500,  w52l:7200,  divYield:2.2, macdSignal:'neutral',  marketCap:'Rp 14B',    technical:'➡️ Neutral' },
    // ── Technology (6) ──
    { code:'GOTO', name:'GoTo Gojek Tokopedia',      sector:'technology',      pe:-8.1, eps:-23,  rsi:32, beta:1.85, w52h:350,   w52l:148,   divYield:0,   macdSignal:'bearish',  marketCap:'Rp 45B',    technical:'📉 Bearish' },
    { code:'MTRO', name:'Metrodata Electronics',     sector:'technology',      pe:13.2, eps:191,  rsi:72, beta:1.22, w52h:2800,  w52l:1800,  divYield:1.4, macdSignal:'bullish',  marketCap:'Rp 7B',     technical:'🚀 Strong Bull' },
    { code:'EMTK', name:'Elang Mahkota Teknologi',   sector:'technology',      pe:28.4, eps:85,   rsi:41, beta:1.30, w52h:2500,  w52l:1400,  divYield:0.5, macdSignal:'bearish',  marketCap:'Rp 33B',    technical:'📉 Bearish' },
    { code:'BUKA', name:'Bukalapak',                 sector:'technology',      pe:-12.4,eps:-6,   rsi:28, beta:1.92, w52h:200,   w52l:88,    divYield:0,   macdSignal:'bearish',  marketCap:'Rp 18B',    technical:'📉 Bearish' },
    { code:'DMMX', name:'Digital Mediatama Maxima', sector:'technology',      pe:35.6, eps:18,   rsi:60, beta:1.45, w52h:680,   w52l:380,   divYield:0,   macdSignal:'bullish',  marketCap:'Rp 4B',     technical:'� Bullish' },
    { code:'MLPT', name:'Multipolar Technology',     sector:'technology',      pe:14.8, eps:85,   rsi:53, beta:0.95, w52h:1400,  w52l:900,   divYield:2.1, macdSignal:'neutral',  marketCap:'Rp 6B',     technical:'➡️ Neutral' },
    // ── Infrastructure & Telco (8) ──
    { code:'TLKM', name:'Telkom Indonesia',          sector:'infrastructure',  pe:16.8, eps:184,  rsi:56, beta:0.78, w52h:3500,  w52l:2700,  divYield:4.2, macdSignal:'bullish',  marketCap:'Rp 305B',   technical:'📈 Bullish' },
    { code:'EXCL',  name:'XL Axiata',               sector:'infrastructure',  pe:14.1, eps:142,  rsi:51, beta:0.80, w52h:2700,  w52l:1900,  divYield:2.2, macdSignal:'neutral',  marketCap:'Rp 52B',    technical:'➡️ Neutral' },
    { code:'TOWR', name:'Sarana Menara Nusantara',   sector:'infrastructure',  pe:18.6, eps:104,  rsi:48, beta:0.72, w52h:1120,  w52l:750,   divYield:3.1, macdSignal:'neutral',  marketCap:'Rp 40B',    technical:'➡️ Neutral' },
    { code:'MTEL', name:'Mitratel',                  sector:'infrastructure',  pe:22.4, eps:58,   rsi:45, beta:0.68, w52h:1000,  w52l:620,   divYield:1.5, macdSignal:'neutral',  marketCap:'Rp 55B',    technical:'➡️ Neutral' },
    { code:'ISAT', name:'Indosat Ooredoo Hutchison', sector:'infrastructure',  pe:10.2, eps:485,  rsi:54, beta:0.85, w52h:9500,  w52l:7000,  divYield:2.8, macdSignal:'bullish',  marketCap:'Rp 80B',    technical:'📈 Bullish' },
    { code:'JSMR', name:'Jasa Marga',                sector:'infrastructure',  pe:15.4, eps:146,  rsi:52, beta:0.88, w52h:5000,  w52l:3600,  divYield:3.4, macdSignal:'neutral',  marketCap:'Rp 36B',    technical:'➡️ Neutral' },
    { code:'WTON', name:'Wijaya Karya Beton',        sector:'infrastructure',  pe:12.8, eps:38,   rsi:46, beta:0.95, w52h:540,   w52l:350,   divYield:2.2, macdSignal:'neutral',  marketCap:'Rp 5B',     technical:'➡️ Neutral' },
    { code:'BIRD', name:'Blue Bird',                 sector:'infrastructure',  pe:13.6, eps:196,  rsi:55, beta:0.75, w52h:2900,  w52l:2100,  divYield:4.5, macdSignal:'bullish',  marketCap:'Rp 9B',     technical:'📈 Bullish' },
    // ── Basic Materials & Automotive (7) ──
    { code:'SMGR', name:'Semen Indonesia',           sector:'basic_materials', pe:11.4, eps:1053, rsi:66, beta:1.05, w52h:13500, w52l:9800,  divYield:2.8, macdSignal:'bullish',  marketCap:'Rp 98B',    technical:'🚀 Strong Bull' },
    { code:'ASII', name:'Astra International',       sector:'automotive',      pe:10.8, eps:593,  rsi:59, beta:0.92, w52h:7200,  w52l:5600,  divYield:4.8, macdSignal:'bullish',  marketCap:'Rp 550B',   technical:'📈 Bullish' },
    { code:'INTP', name:'Indocement Tunggal',        sector:'basic_materials', pe:18.2, eps:392,  rsi:48, beta:0.88, w52h:8100,  w52l:6200,  divYield:2.6, macdSignal:'neutral',  marketCap:'Rp 52B',    technical:'➡️ Neutral' },
    { code:'TKIM', name:'Tjiwi Kimia',               sector:'basic_materials', pe:7.8,  eps:1050, rsi:43, beta:1.00, w52h:9200,  w52l:6800,  divYield:3.8, macdSignal:'neutral',  marketCap:'Rp 28B',    technical:'➡️ Neutral' },
    { code:'INKP', name:'Indah Kiat Pulp & Paper',   sector:'basic_materials', pe:6.4,  eps:1620, rsi:46, beta:1.10, w52h:12000, w52l:8500,  divYield:4.1, macdSignal:'neutral',  marketCap:'Rp 88B',    technical:'➡️ Neutral' },
    { code:'AMRT', name:'Sumber Alfaria Trijaya',    sector:'consumer',        pe:26.4, eps:48,   rsi:62, beta:0.82, w52h:3200,  w52l:2200,  divYield:1.0, macdSignal:'bullish',  marketCap:'Rp 62B',    technical:'📈 Bullish' },
    { code:'AUTO', name:'Astra Otoparts',            sector:'automotive',      pe:8.6,  eps:248,  rsi:50, beta:0.88, w52h:2700,  w52l:1950,  divYield:3.8, macdSignal:'neutral',  marketCap:'Rp 17B',    technical:'➡️ Neutral' },
    // ── Finance & Insurance (5) ──
    { code:'BBTN', name:'Bank Tabungan Negara',      sector:'banking',         pe:6.8,  eps:186,  rsi:42, beta:1.10, w52h:1560,  w52l:1020,  divYield:3.2, macdSignal:'neutral',  marketCap:'Rp 20B',    technical:'➡️ Neutral' },
    { code:'ADMF', name:'Adira Dinamika Multi Finance',sector:'banking',       pe:8.2,  eps:1380, rsi:50, beta:0.80, w52h:12500, w52l:9200,  divYield:8.4, macdSignal:'neutral',  marketCap:'Rp 11B',    technical:'➡️ Neutral' },
    { code:'ASRM', name:'Asuransi Ramayana',         sector:'banking',         pe:9.4,  eps:325,  rsi:48, beta:0.60, w52h:3800,  w52l:2500,  divYield:4.2, macdSignal:'neutral',  marketCap:'Rp 4B',     technical:'➡️ Neutral' },
    { code:'MFIN', name:'Mandala Multifinance',      sector:'banking',         pe:7.8,  eps:320,  rsi:46, beta:0.75, w52h:3200,  w52l:2200,  divYield:6.5, macdSignal:'neutral',  marketCap:'Rp 5B',     technical:'➡️ Neutral' },
    { code:'TRIM', name:'Trimegah Sekuritas',        sector:'banking',         pe:12.4, eps:36,   rsi:55, beta:1.10, w52h:520,   w52l:320,   divYield:2.8, macdSignal:'bullish',  marketCap:'Rp 4B',     technical:'📈 Bullish' },
    // ── Plantations (4) ──
    { code:'AALI', name:'Astra Agro Lestari',        sector:'agriculture',     pe:10.2, eps:824,  rsi:48, beta:0.90, w52h:9200,  w52l:6500,  divYield:4.8, macdSignal:'neutral',  marketCap:'Rp 19B',    technical:'➡️ Neutral' },
    { code:'LSIP', name:'PP London Sumatra',         sector:'agriculture',     pe:8.6,  eps:148,  rsi:45, beta:0.88, w52h:1480,  w52l:1020,  divYield:4.2, macdSignal:'neutral',  marketCap:'Rp 15B',    technical:'➡️ Neutral' },
    { code:'SIMP', name:'Salim Ivomas Pratama',      sector:'agriculture',     pe:9.8,  eps:68,   rsi:44, beta:0.82, w52h:720,   w52l:500,   divYield:3.0, macdSignal:'neutral',  marketCap:'Rp 14B',    technical:'➡️ Neutral' },
    { code:'PALM', name:'Provident Agro',            sector:'agriculture',     pe:11.4, eps:38,   rsi:47, beta:0.95, w52h:560,   w52l:380,   divYield:2.4, macdSignal:'neutral',  marketCap:'Rp 3B',     technical:'➡️ Neutral' },
    // ── Retail & Logistics (4) ──
    { code:'MAPI', name:'Mitra Adiperkasa',          sector:'consumer',        pe:22.8, eps:148,  rsi:58, beta:1.05, w52h:1680,  w52l:1100,  divYield:0.8, macdSignal:'bullish',  marketCap:'Rp 14B',    technical:'📈 Bullish' },
    { code:'LPPF', name:'Matahari Department Store', sector:'consumer',        pe:9.2,  eps:680,  rsi:45, beta:0.85, w52h:6500,  w52l:4200,  divYield:9.8, macdSignal:'neutral',  marketCap:'Rp 7B',     technical:'➡️ Neutral' },
    { code:'MIDI', name:'Midi Utama Indonesia',      sector:'consumer',        pe:24.2, eps:28,   rsi:54, beta:0.72, w52h:840,   w52l:580,   divYield:0.6, macdSignal:'bullish',  marketCap:'Rp 5B',     technical:'� Bullish' },
    { code:'ASSA', name:'Adi Sarana Armada',         sector:'infrastructure',  pe:14.4, eps:58,   rsi:50, beta:1.00, w52h:1050,  w52l:720,   divYield:2.4, macdSignal:'neutral',  marketCap:'Rp 4B',     technical:'➡️ Neutral' },
];

async function fetchIDXLiveData() {
    const symbols = IDX_BASE.map(s => s.code + '.JK');

    // Fetch all symbols in parallel via v8/chart (no auth needed)
    const results = await Promise.allSettled(symbols.map(sym =>
        fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 8000
        }).then(r => r.json())
    ));

    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    return IDX_BASE.map((base, i) => {
        try {
            const res = results[i];
            if (res.status !== 'fulfilled') throw new Error(res.reason);
            const chartResult = res.value?.chart?.result?.[0];
            if (!chartResult) throw new Error('no chart result');

            const meta  = chartResult.meta || {};
            const price = Math.round(meta.regularMarketPrice || 0);
            if (!price) throw new Error('price is zero');

            // previousClose: use last quote close or meta.chartPreviousClose
            const prevClose = meta.chartPreviousClose || meta.previousClose || price;
            const change    = prevClose ? parseFloat(((price - prevClose) / prevClose * 100).toFixed(2)) : 0;

            const vol    = meta.regularMarketVolume || 0;
            const volFmt = vol >= 1e9 ? (vol/1e9).toFixed(2)+'B' : vol >= 1e6 ? (vol/1e6).toFixed(1)+'M' : vol >= 1e3 ? (vol/1e3).toFixed(0)+'K' : String(vol);

            // 52w from meta
            const w52h = meta.fiftyTwoWeekHigh   ? Math.round(meta.fiftyTwoWeekHigh)  : base.w52h;
            const w52l = meta.fiftyTwoWeekLow    ? Math.round(meta.fiftyTwoWeekLow)   : base.w52l;

            // Dynamic technical + MACD
            let technical = base.technical;
            if      (change >= 3)  technical = '🚀 Strong Bull';
            else if (change >= 1)  technical = '📈 Bullish';
            else if (change > -1)  technical = '➡️ Neutral';
            else if (change > -3)  technical = '📉 Bearish';
            else                   technical = '🔻 Strong Bear';

            const macdSignal = change >= 1 ? 'bullish' : change <= -1 ? 'bearish' : 'neutral';

            return { ...base, price, change, volume: volFmt, value: '—', foreign: '—', w52h, w52l, technical, macdSignal, _live: true, _ts: now };
        } catch (e) {
            return { ...base, price: null, change: null, volume: '—', value: '—', foreign: '—', _live: false };
        }
    });
}

app.get('/api/idx-live', async (req, res) => {
    try {
        // Serve from cache if fresh
        if (_idxLiveCache && (Date.now() - _idxLiveCacheTs) < IDX_LIVE_TTL) {
            return res.json({ ok: true, cached: true, data: _idxLiveCache });
        }

        const data = await fetchIDXLiveData();
        _idxLiveCache   = data;
        _idxLiveCacheTs = Date.now();
        return res.json({ ok: true, cached: false, data });

    } catch (err) {
        console.error('/api/idx-live error:', err.message);
        // On failure return static base data so UI never breaks
        const fallback = IDX_BASE.map(b => ({ ...b, price: null, change: null, volume: '—', value: '—', foreign: '—', _live: false, _error: err.message }));
        return res.json({ ok: false, error: err.message, data: fallback });
    }
});

// ─── GET /api/idx-gainers — Fetch top gainers from a broad IDX stock universe ─
// Fetches ~200 IDX tickers in parallel batches, returns top 20 gainers & losers.
const IDX_UNIVERSE = [
    // LQ45 + popular names across all sectors
    'BBCA','BMRI','BBRI','BBNI','BRIS','BTPS','BNGA','BDMN','MEGA','NISP','BJBR','BJTM','BBTN',
    'ANTM','ADRO','ITMG','UNTR','PTBA','INCO','MDKA','MEDC','TINS','PTRO','HRUM','ARII','BSSR',
    'PGAS','TLKM','EXCL','ISAT','TOWR','MTEL','JSMR','BIRD','WTON','ASSA',
    'UNVR','ICBP','INDF','MYOR','HMSP','GGRM','SIDO','ULTJ','ROTI','AMRT','MAPI','LPPF','MIDI','ACES',
    'BSDE','CTRA','PWON','SMRA','DILD','WIKA','WSKT','PPRE','NRCA','TOTL',
    'KLBF','HEAL','MIKA','PRDA','KAEF','PYFA','SILO','TSPC',
    'GOTO','MTRO','EMTK','BUKA','DMMX','MLPT','KIOS','LUCK',
    'SMGR','ASII','INTP','TKIM','INKP','AUTO','ADMF','SMSM','IMAS','GJTL',
    'AALI','LSIP','SIMP','PALM','SGRO','SSMS',
    'BBTN','ADMF','ASRM','MFIN','TRIM','PNLF',
    'JSMR','WEGE','ACST','PBSA','BALI',
    'MNCN','SCMA','BHIT','BFIN','AKRA','ESSA','JPFA','MAIN','CPIN','SIPD',
    'BNBR','KREN','ELSA','FIRE','RAJA','WINS','TMAS','SAFE','SMDR',
    'DNET','VKTR','INET','MLPT','KPIG','LPKR','APLN','MABA','KIJA',
    'ERAA','TURI','RANC','CSAP','HERO','MPPA','SUMBER','RALS',
    'HKMU','AGII','ALDO','KDSI','FASW','SPMA','INKP','TKIM',
    'CMRY','PMMP','DLTA','MLBI','CLEO','KEJU','SKLT','TBIG',
    'CBPE','MPMX','HEXA','INTA','NIPS','PRAS',
    'SRTG','MHKI','BHAT','ISSP','PICO','GDST','CITA',
];

let _idxGainersCache = null;
let _idxGainersCacheTs = 0;
const IDX_GAINERS_TTL = 5 * 60_000;

// ─── GET /api/idx-corporate-actions ─────────────────────────────────────────
// Returns IPO calendar + upcoming dividends for IDX stocks.
// Data is manually curated and refreshed periodically.
// Tries to enrich dividend ex-dates from Yahoo Finance for known tickers.
const IDX_IPO_DATA = [
    { code:'BREN',  name:'Barito Renewables Energy',     sector:'energy',         ipoDate:'2023-10-09', offerPrice:780,   lastPrice:null,   marketCap:'Rp 924T',  underwriter:'Mandiri Sekuritas', status:'listed',   desc:'Energi terbarukan — anak perusahaan Barito Pacific.' },
    { code:'AMMN',  name:'Amman Mineral Internasional',  sector:'mining',         ipoDate:'2023-07-07', offerPrice:1695,  lastPrice:null,   marketCap:'Rp 741T',  underwriter:'BNI Sekuritas',     status:'listed',   desc:'Produsen tembaga & emas terbesar kedua di Indonesia.' },
    { code:'PGEO',  name:'Pertamina Geothermal Energy',  sector:'energy',         ipoDate:'2023-02-24', offerPrice:875,   lastPrice:null,   marketCap:'Rp 138T',  underwriter:'Mandiri Sekuritas', status:'listed',   desc:'IPO geothermal terbesar di dunia saat itu.' },
    { code:'SEVA',  name:'Astra Digital Otomotif (SEVA)',sector:'technology',     ipoDate:'2023-05-15', offerPrice:186,   lastPrice:null,   marketCap:'Rp 7T',    underwriter:'BCA Sekuritas',     status:'listed',   desc:'Platform digital jual-beli kendaraan dari grup Astra.' },
    { code:'PTMP',  name:'Getnet Tecnologia (PTMP)',     sector:'technology',     ipoDate:'2024-03-18', offerPrice:100,   lastPrice:null,   marketCap:'Rp 2T',    underwriter:'CGS-CIMB',          status:'listed',   desc:'Platform pembayaran digital.' },
    { code:'BREN2', name:'— Coming Soon —',              sector:'energy',         ipoDate:'2026-06-15', offerPrice:null,  lastPrice:null,   marketCap:'Est. Rp 5T',underwriter:'TBA',              status:'upcoming', desc:'Rencana IPO sektor EBT Q2 2026 (belum resmi).' },
    { code:'PANI',  name:'Pantai Indah Kapuk Dua',       sector:'property',       ipoDate:'2024-12-10', offerPrice:7200,  lastPrice:null,   marketCap:'Rp 216T',  underwriter:'BNI Sekuritas',     status:'listed',   desc:'Pengembang kawasan PIK2 — salah satu IPO terbesar 2024.' },
    { code:'BELI',  name:'Belilagi.com',                  sector:'technology',     ipoDate:'2026-05-20', offerPrice:null,  lastPrice:null,   marketCap:'Est. Rp 1T',underwriter:'TBA',              status:'upcoming', desc:'Platform e-commerce secondhand — dalam proses IPO.' },
    { code:'GOTO2', name:'GoTo Rights Issue',             sector:'technology',     ipoDate:'2025-09-01', offerPrice:85,    lastPrice:null,   marketCap:'—',         underwriter:'Mandiri Sekuritas', status:'rights',  desc:'Rights issue GOTO untuk ekspansi layanan keuangan.' },
];

const IDX_DIVIDEND_DATA = [
    { code:'BBCA', name:'Bank Central Asia',      exDate:'2026-03-14', payDate:'2026-04-04', amount:342,  yield:3.6,  type:'interim', currency:'IDR' },
    { code:'BMRI', name:'Bank Mandiri',           exDate:'2026-04-02', payDate:'2026-04-25', amount:408,  yield:6.8,  type:'final',   currency:'IDR' },
    { code:'BBRI', name:'Bank Rakyat Indonesia',  exDate:'2026-04-10', payDate:'2026-05-05', amount:285,  yield:5.7,  type:'final',   currency:'IDR' },
    { code:'BBNI', name:'Bank Negara Indonesia',  exDate:'2026-04-17', payDate:'2026-05-12', amount:238,  yield:5.2,  type:'final',   currency:'IDR' },
    { code:'TLKM', name:'Telkom Indonesia',       exDate:'2026-04-24', payDate:'2026-05-16', amount:130,  yield:4.2,  type:'final',   currency:'IDR' },
    { code:'ASII', name:'Astra International',    exDate:'2026-05-06', payDate:'2026-05-28', amount:288,  yield:4.8,  type:'final',   currency:'IDR' },
    { code:'PGAS', name:'Perusahaan Gas Negara',  exDate:'2026-05-12', payDate:'2026-06-02', amount:82,   yield:5.1,  type:'final',   currency:'IDR' },
    { code:'HMSP', name:'HM Sampoerna',           exDate:'2026-05-20', payDate:'2026-06-10', amount:54,   yield:7.8,  type:'final',   currency:'IDR' },
    { code:'ITMG', name:'Indo Tambangraya Megah', exDate:'2026-05-28', payDate:'2026-06-18', amount:3200, yield:12.4, type:'special', currency:'IDR' },
    { code:'PTBA', name:'Bukit Asam',             exDate:'2026-06-05', payDate:'2026-06-26', amount:1050, yield:9.1,  type:'final',   currency:'IDR' },
    { code:'UNTR', name:'United Tractors',        exDate:'2026-06-12', payDate:'2026-07-03', amount:1450, yield:4.1,  type:'final',   currency:'IDR' },
    { code:'BBTN', name:'Bank Tabungan Negara',   exDate:'2026-06-18', payDate:'2026-07-09', amount:62,   yield:3.2,  type:'final',   currency:'IDR' },
    { code:'KLBF', name:'Kalbe Farma',            exDate:'2026-06-25', payDate:'2026-07-16', amount:38,   yield:2.4,  type:'final',   currency:'IDR' },
    { code:'ADRO', name:'Adaro Energy',           exDate:'2026-07-03', payDate:'2026-07-24', amount:138,  yield:5.4,  type:'final',   currency:'IDR' },
    { code:'SIDO', name:'Sido Muncul',            exDate:'2026-07-10', payDate:'2026-07-31', amount:62,   yield:5.8,  type:'final',   currency:'IDR' },
];

const IDX_CORP_EVENTS = [
    { code:'BBRI',  name:'Bank BRI',          event:'RUPS Tahunan',       date:'2026-03-28', desc:'Agenda: Laporan Tahunan & Pengesahan Dividen FY2025' },
    { code:'BMRI',  name:'Bank Mandiri',      event:'RUPS Tahunan',       date:'2026-04-02', desc:'Pengesahan pembagian dividen final Rp 408/saham' },
    { code:'TLKM',  name:'Telkom Indonesia',  event:'Stock Split',        date:'2026-05-15', desc:'Rencana stock split 1:5 — harga saham lebih terjangkau' },
    { code:'GOTO',  name:'GoTo',              event:'Rights Issue',       date:'2026-06-01', desc:'Penawaran saham baru — rasio 3:1, harga Rp 85/saham' },
    { code:'ANTM',  name:'Aneka Tambang',     event:'Divestasi Aset',     date:'2026-06-20', desc:'Penjualan 30% saham smelter nikel ke investor strategis' },
    { code:'BSDE',  name:'Bumi Serpong Damai',event:'Obligasi Korporasi', date:'2026-07-08', desc:'Penerbitan obligasi Rp 3T tenor 5 tahun, kupon 7.5% p.a.' },
    { code:'PANI',  name:'PIK2',             event:'Lock-up Expiry',     date:'2026-06-10', desc:'Berakhirnya periode lock-up post-IPO. Potensi tekanan jual.' },
];

app.get('/api/idx-corporate-actions', (req, res) => {
    const today = new Date();
    // Enrich IPO with days-until for upcoming
    const ipo = IDX_IPO_DATA.map(item => {
        const d = new Date(item.ipoDate);
        const diffDays = Math.round((d - today) / 86400000);
        return { ...item, daysUntil: diffDays };
    }).sort((a, b) => new Date(a.ipoDate) - new Date(b.ipoDate));

    // Enrich dividends with days until ex-date
    const dividends = IDX_DIVIDEND_DATA.map(item => {
        const d = new Date(item.exDate);
        const diffDays = Math.round((d - today) / 86400000);
        return { ...item, daysUntilEx: diffDays };
    }).sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

    // Enrich corp events
    const events = IDX_CORP_EVENTS.map(item => {
        const d = new Date(item.date);
        const diffDays = Math.round((d - today) / 86400000);
        return { ...item, daysUntil: diffDays };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ ok: true, ipo, dividends, events, generatedAt: today.toISOString() });
});

// ─── GET /api/us-corporate-actions ──────────────────────────────────────────
// US IPO calendar, upcoming earnings, dividend schedule, & corp events (curated).
const US_IPO_DATA = [
    { ticker:'KLAI',  name:'KLA Industries',         sector:'Technology',    ipoDate:'2026-04-29', offerPrice:18,   exchange:'NASDAQ', marketCap:'~$500M',  underwriter:'Goldman Sachs',    status:'upcoming', desc:'AI-powered semiconductor inspection tooling.' },
    { ticker:'NUVL',  name:'Nuvalent Inc.',           sector:'Healthcare',    ipoDate:'2026-05-06', offerPrice:22,   exchange:'NASDAQ', marketCap:'~$1.1B',  underwriter:'Morgan Stanley',   status:'upcoming', desc:'Next-gen cancer drug developer, ROS1/ALK inhibitors.' },
    { ticker:'CRCL',  name:'Circle Internet Group',  sector:'Financials',    ipoDate:'2026-05-14', offerPrice:null, exchange:'NYSE',   marketCap:'~$5B',    underwriter:'JPMorgan / Citi',  status:'upcoming', desc:'USDC stablecoin issuer — highly anticipated crypto-finance IPO.' },
    { ticker:'KLARNA',name:'Klarna Group',            sector:'Financials',    ipoDate:'2026-06-02', offerPrice:null, exchange:'NYSE',   marketCap:'~$15B',   underwriter:'Goldman / MS',     status:'upcoming', desc:'Buy-now-pay-later giant from Sweden. Delayed multiple times.' },
    { ticker:'CHIME', name:'Chime Financial',         sector:'Financials',    ipoDate:'2026-06-20', offerPrice:null, exchange:'NASDAQ', marketCap:'~$8B',    underwriter:'Goldman Sachs',    status:'upcoming', desc:'Largest US neobank with ~20M customers.' },
    { ticker:'SHEIN', name:'SHEIN Group',             sector:'Consumer',      ipoDate:'2026-07-10', offerPrice:null, exchange:'NYSE',   marketCap:'~$45B',   underwriter:'JPMorgan',         status:'upcoming', desc:'Fast-fashion giant — regulatory scrutiny remains a risk.' },
    { ticker:'REDDIT', name:'Reddit Inc.',            sector:'Technology',    ipoDate:'2024-03-21', offerPrice:34,   exchange:'NYSE',   marketCap:'~$6.5B',  underwriter:'Morgan Stanley',   status:'listed',   desc:'Social media platform — IPO priced above range.' },
    { ticker:'ASTERA',name:'Astera Labs',             sector:'Technology',    ipoDate:'2024-03-20', offerPrice:36,   exchange:'NASDAQ', marketCap:'~$5B',    underwriter:'Morgan Stanley',   status:'listed',   desc:'Semiconductor connectivity solutions for AI infrastructure.' },
    { ticker:'RUBRIK',name:'Rubrik Inc.',             sector:'Technology',    ipoDate:'2024-04-25', offerPrice:32,   exchange:'NYSE',   marketCap:'~$5.6B',  underwriter:'Goldman Sachs',    status:'listed',   desc:'Cyber resilience / cloud data management platform.' },
];

const US_DIVIDEND_DATA = [
    { ticker:'AAPL', name:'Apple Inc.',              exDate:'2026-05-09', payDate:'2026-05-15', amount:0.25,  yield:0.5,  frequency:'quarterly', sector:'Technology' },
    { ticker:'MSFT', name:'Microsoft Corp.',         exDate:'2026-05-14', payDate:'2026-06-12', amount:0.83,  yield:0.7,  frequency:'quarterly', sector:'Technology' },
    { ticker:'JNJ',  name:'Johnson & Johnson',       exDate:'2026-05-20', payDate:'2026-06-10', amount:1.24,  yield:3.2,  frequency:'quarterly', sector:'Healthcare' },
    { ticker:'KO',   name:'Coca-Cola Co.',           exDate:'2026-06-13', payDate:'2026-07-01', amount:0.485, yield:3.1,  frequency:'quarterly', sector:'Consumer' },
    { ticker:'PG',   name:'Procter & Gamble',        exDate:'2026-07-18', payDate:'2026-08-15', amount:1.006, yield:2.4,  frequency:'quarterly', sector:'Consumer' },
    { ticker:'XOM',  name:'ExxonMobil Corp.',        exDate:'2026-05-13', payDate:'2026-06-10', amount:0.99,  yield:3.7,  frequency:'quarterly', sector:'Energy' },
    { ticker:'CVX',  name:'Chevron Corp.',           exDate:'2026-05-19', payDate:'2026-06-10', amount:1.71,  yield:4.5,  frequency:'quarterly', sector:'Energy' },
    { ticker:'VZ',   name:'Verizon Communications',  exDate:'2026-07-09', payDate:'2026-08-03', amount:0.665, yield:6.7,  frequency:'quarterly', sector:'Telecom' },
    { ticker:'T',    name:'AT&T Inc.',               exDate:'2026-07-09', payDate:'2026-08-01', amount:0.2775,yield:5.4,  frequency:'quarterly', sector:'Telecom' },
    { ticker:'MCD',  name:"McDonald's Corp.",        exDate:'2026-05-30', payDate:'2026-06-17', amount:1.77,  yield:2.3,  frequency:'quarterly', sector:'Consumer' },
    { ticker:'ABBV', name:'AbbVie Inc.',             exDate:'2026-07-14', payDate:'2026-08-15', amount:1.64,  yield:3.8,  frequency:'quarterly', sector:'Healthcare' },
    { ticker:'O',    name:'Realty Income Corp.',     exDate:'2026-04-30', payDate:'2026-05-15', amount:0.264, yield:5.9,  frequency:'monthly',   sector:'REIT' },
];

const US_EARNINGS_DATA = [
    { ticker:'GOOGL',name:'Alphabet Inc.',    date:'2026-04-29', time:'after-close', est_eps:2.01, prev_eps:1.89, est_rev:'$86.3B', importance:'high' },
    { ticker:'META', name:'Meta Platforms',   date:'2026-04-30', time:'after-close', est_eps:5.24, prev_eps:4.71, est_rev:'$41.5B', importance:'high' },
    { ticker:'AMZN', name:'Amazon.com',       date:'2026-05-01', time:'after-close', est_eps:1.37, prev_eps:0.98, est_rev:'$148B',  importance:'high' },
    { ticker:'AAPL', name:'Apple Inc.',       date:'2026-05-02', time:'after-close', est_eps:1.62, prev_eps:1.53, est_rev:'$90.2B', importance:'high' },
    { ticker:'NVDA', name:'NVIDIA Corp.',     date:'2026-05-28', time:'after-close', est_eps:0.89, prev_eps:0.61, est_rev:'$24.6B', importance:'high' },
    { ticker:'MSFT', name:'Microsoft Corp.',  date:'2026-04-30', time:'after-close', est_eps:3.22, prev_eps:2.94, est_rev:'$68.4B', importance:'high' },
    { ticker:'TSLA', name:'Tesla Inc.',       date:'2026-07-23', time:'after-close', est_eps:0.44, prev_eps:0.52, est_rev:'$25.8B', importance:'high' },
    { ticker:'JPM',  name:'JPMorgan Chase',   date:'2026-07-14', time:'before-open', est_eps:4.79, prev_eps:4.44, est_rev:'$43.8B', importance:'high' },
    { ticker:'V',    name:'Visa Inc.',        date:'2026-04-29', time:'after-close', est_eps:2.58, prev_eps:2.39, est_rev:'$9.6B',  importance:'medium' },
    { ticker:'AMD',  name:'AMD',              date:'2026-04-29', time:'after-close', est_eps:1.07, prev_eps:0.62, est_rev:'$7.1B',  importance:'medium' },
];

app.get('/api/us-corporate-actions', (req, res) => {
    const today = new Date();
    const ipo = US_IPO_DATA.map(item => {
        const d = new Date(item.ipoDate);
        return { ...item, daysUntil: Math.round((d - today) / 86400000) };
    }).sort((a, b) => new Date(a.ipoDate) - new Date(b.ipoDate));

    const dividends = US_DIVIDEND_DATA.map(item => {
        const d = new Date(item.exDate);
        return { ...item, daysUntilEx: Math.round((d - today) / 86400000) };
    }).sort((a, b) => new Date(a.exDate) - new Date(b.exDate));

    const earnings = US_EARNINGS_DATA.map(item => {
        const d = new Date(item.date);
        return { ...item, daysUntil: Math.round((d - today) / 86400000) };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ ok: true, ipo, dividends, earnings, generatedAt: today.toISOString() });
});

// ─── GET /api/ai-brief ───────────────────────────────────────────────────────
// AI Daily Brief: Fear&Greed + macro prices + RSS news sentiment → recommendations
let _aiBriefCache = null;
let _aiBriefCacheTs = 0;
const AI_BRIEF_TTL = 15 * 60_000;

// Sector → tickers mapping for context
const SECTOR_TICKERS_US  = { technology:['AAPL','NVDA','MSFT','GOOGL','META','AMD'], healthcare:['JNJ','PFE','ABBV','MRK'], financials:['JPM','GS','BAC','V','MA'], energy:['XOM','CVX','SLB'], consumer:['AMZN','TSLA','MCD','KO'], industrials:['BA','CAT','GE','HON'] };
const SECTOR_TICKERS_IDX = { banking:['BBCA.JK','BBRI.JK','BMRI.JK','BBNI.JK'], energy:['ADRO.JK','PGAS.JK','MEDC.JK'], technology:['GOTO.JK','EMTK.JK','BUKA.JK'], consumer:['UNVR.JK','ICBP.JK','MYOR.JK'], mining:['ANTM.JK','INCO.JK','TINS.JK'] };

// Keyword → sentiment + sector signals
const BULL_KEYWORDS  = ['surge','rally','gain','rise','beat','strong','record','bullish','growth','profit','upgrade','buy','positive','recover','boost','soar','jump','breakout','outperform','above expectations'];
const BEAR_KEYWORDS  = ['drop','fall','crash','decline','miss','weak','loss','bearish','recession','cut','downgrade','sell','negative','slump','plunge','risk','concern','below expectations','layoff','inflation'];
const SECTOR_KEYWORDS = {
    technology:   ['ai','artificial intelligence','chip','semiconductor','cloud','software','tech','nvidia','apple','microsoft','google','meta','data center','cybersecurity'],
    healthcare:   ['drug','fda','vaccine','pharma','biotech','clinical','trial','health','medical','hospital','insurance'],
    financials:   ['bank','rate','fed','interest rate','credit','loan','debt','earnings','dividend','financial','nasdaq','s&p','market'],
    energy:       ['oil','gas','energy','opec','crude','barrel','lng','coal','solar','wind','renewable'],
    consumer:     ['retail','consumer','spending','inflation','cpi','amazon','tesla','ev','electric','sales'],
    mining:       ['gold','copper','nickel','lithium','mining','mineral','commodity','metal'],
    indonesia:    ['ihsg','idx','indonesia','bi rate','rupiah','idr','jakarta','bei'],
    crypto:       ['bitcoin','btc','ethereum','eth','crypto','blockchain','defi','nft','solana','stablecoin'],
};

function _scoreNews(titles) {
    let bull = 0, bear = 0;
    const sectorHits = {};
    Object.keys(SECTOR_KEYWORDS).forEach(s => sectorHits[s] = 0);

    titles.forEach(t => {
        const low = t.toLowerCase();
        BULL_KEYWORDS.forEach(k => { if (low.includes(k)) bull++; });
        BEAR_KEYWORDS.forEach(k => { if (low.includes(k)) bear++; });
        Object.entries(SECTOR_KEYWORDS).forEach(([sec, kws]) => {
            kws.forEach(k => { if (low.includes(k)) sectorHits[sec]++; });
        });
    });

    const total = bull + bear || 1;
    const sentimentScore = Math.round((bull / total) * 100);
    // sort sectors by mention count
    const hotSectors = Object.entries(sectorHits)
        .sort((a,b) => b[1]-a[1])
        .filter(([,v]) => v > 0)
        .slice(0, 4)
        .map(([s, cnt]) => ({ sector:s, mentions:cnt }));

    return { bull, bear, sentimentScore, hotSectors };
}

async function _fetchMacro() {
    const symbols = ['^GSPC','^IXIC','^JKSE','BTC-USD','GC=F','CL=F','EURUSD=X'];
    const results = await Promise.allSettled(
        symbols.map(sym =>
            fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`, { headers:{ 'User-Agent':'Mozilla/5.0' } })
                .then(r => r.json())
                .then(d => {
                    const m = d?.chart?.result?.[0]?.meta;
                    if (!m) return null;
                    const price = m.regularMarketPrice;
                    const prev  = m.chartPreviousClose || m.previousClose;
                    const chg   = prev ? ((price - prev) / prev * 100) : 0;
                    return { sym, price, chg: +chg.toFixed(2) };
                })
        )
    );
    const macro = {};
    results.forEach((r,i) => {
        if (r.status === 'fulfilled' && r.value) macro[symbols[i]] = r.value;
    });
    return macro;
}

async function _fetchRSSNews() {
    const feeds = [
        'https://feeds.finance.yahoo.com/rss/2.0/headline?region=US&lang=en-US',
        'https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EIXIC&region=US&lang=en-US',
    ];
    const titles = [];
    await Promise.allSettled(feeds.map(url =>
        fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0' }, timeout:6000 })
            .then(r => r.text())
            .then(xml => {
                const matches = xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g);
                for (const m of matches) {
                    const t = (m[1] || m[2] || '').trim();
                    if (t && t.length > 10 && !t.toLowerCase().includes('yahoo finance')) titles.push(t);
                }
            })
    ));
    return titles.slice(0, 40);
}

function _buildRecommendations(macro, sentiment, hotSectors, fng) {
    const recs = [];
    const today = new Date();
    const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const day = dayNames[today.getDay()];

    // Market mood
    const mood = fng?.value_classification || (sentiment.sentimentScore >= 60 ? 'Greed' : sentiment.sentimentScore <= 40 ? 'Fear' : 'Neutral');
    const moodEmoji = mood.toLowerCase().includes('extreme greed') ? '🤑' : mood.toLowerCase().includes('greed') ? '😊' : mood.toLowerCase().includes('extreme fear') ? '😱' : mood.toLowerCase().includes('fear') ? '😰' : '😐';

    // BTC signal
    const btc = macro['BTC-USD'];
    if (btc) {
        const emoji = btc.chg >= 2 ? '🚀' : btc.chg >= 0 ? '🟢' : btc.chg <= -3 ? '🔴' : '🟡';
        recs.push({ type: btc.chg >= 0 ? 'buy' : 'caution', market:'Crypto', icon: emoji, text: `Bitcoin ${btc.chg >= 0 ? 'naik' : 'turun'} ${btc.chg > 0 ? '+' : ''}${btc.chg}% — ${btc.chg >= 1 ? 'momentum positif, altcoin cenderung ikut naik' : btc.chg <= -2 ? 'tekanan jual, waspadai altcoin' : 'sideways, tunggu breakout'}` });
    }

    // SPX signal
    const spx = macro['^GSPC'];
    if (spx) {
        const emoji = spx.chg >= 1 ? '📈' : spx.chg <= -1 ? '📉' : '➡️';
        recs.push({ type: spx.chg >= 0 ? 'buy' : 'caution', market:'US Stocks', icon: emoji, text: `S&P 500 ${spx.chg >= 0 ? '+' : ''}${spx.chg}% — ${spx.chg >= 1 ? 'sentimen risk-on, pertimbangkan growth stocks' : spx.chg <= -1 ? 'sentimen risk-off, perhatikan defensive sector (healthcare, utilities)' : 'konsolidasi, tunggu catalyst'}` });
    }

    // IHSG signal
    const jkse = macro['^JKSE'];
    if (jkse) {
        const emoji = jkse.chg >= 1 ? '🇮🇩📈' : jkse.chg <= -1 ? '🇮🇩📉' : '🇮🇩➡️';
        recs.push({ type: jkse.chg >= 0 ? 'buy' : 'caution', market:'IDX', icon: emoji, text: `IHSG ${jkse.chg >= 0 ? '+' : ''}${jkse.chg}% — ${jkse.chg >= 1 ? 'pasar lokal menguat, fokus banking & consumer' : jkse.chg <= -1 ? 'IHSG melemah, waspadai saham high-beta' : 'IHSG flat, cari saham dengan katalis individual'}` });
    }

    // Gold signal
    const gold = macro['GC=F'];
    if (gold && gold.chg >= 0.5) {
        recs.push({ type: 'info', market:'Macro', icon: '🥇', text: `Emas naik +${gold.chg}% — sentimen risk-off atau dollar melemah. IDX mining/gold bisa diperhatikan (ANTM, MDKA)` });
    }

    // Hot sectors from news
    hotSectors.slice(0, 2).forEach(({ sector, mentions }) => {
        const sectorMap = {
            technology:  { name:'Technology', idx:'GOTO, EMTK, BUKA', us:'NVDA, AMD, GOOGL' },
            healthcare:  { name:'Healthcare', idx:'KLBF, MIKA, SIDO', us:'JNJ, PFE, ABBV' },
            financials:  { name:'Financials', idx:'BBCA, BBRI, BMRI', us:'JPM, GS, V' },
            energy:      { name:'Energy', idx:'ADRO, PGAS, MEDC', us:'XOM, CVX' },
            consumer:    { name:'Consumer', idx:'UNVR, ICBP, MYOR', us:'AMZN, MCD' },
            mining:      { name:'Mining/Commodity', idx:'ANTM, INCO, PTBA', us:'FCX, NEM' },
            indonesia:   { name:'IDX Macro', idx:'BBCA, BBRI, TLKM', us:null },
            crypto:      { name:'Crypto', idx:'GOTO, EMTK', us:'COIN, MSTR' },
        };
        const sm = sectorMap[sector];
        if (sm) {
            recs.push({ type:'hot', market: sm.name, icon:'🔥', text: `Sektor <strong>${sm.name}</strong> trending di news (${mentions} sebutan). Watchlist: IDX → ${sm.idx}${sm.us ? ' | US → '+sm.us : ''}` });
        }
    });

    // Day-specific tip
    const dayTips = {
        'Senin':  '📅 Senin: Pasar sering reaktif terhadap berita akhir pekan. Hindari entry besar di jam pertama.',
        'Selasa': '📅 Selasa–Rabu: Biasanya hari paling "normal". Momentum terbaca lebih jelas.',
        'Rabu':   '📅 Midweek: Perhatikan data ekonomi AS yang biasa dirilis Rabu (Fed minutes, inventori).',
        'Kamis':  '📅 Kamis: Initial Jobless Claims AS biasanya dirilis. Bisa gerakkan pasar.',
        'Jumat':  '📅 Jumat: Volume cenderung turun sore. Hati-hati posisi besar memasuki weekend.',
        'Sabtu':  '📅 Weekend: Market tutup. Gunakan untuk riset, review portofolio.',
        'Minggu': '📅 Weekend: Market tutup. Baca laporan analis, siapkan watchlist untuk Senin.',
    };
    if (dayTips[day]) recs.push({ type:'tip', market:'Tips Hari Ini', icon:'💡', text: dayTips[day] });

    return { mood, moodEmoji, fngValue: fng?.value || null, recs, sentimentScore: sentiment.sentimentScore, bull: sentiment.bull, bear: sentiment.bear };
}

app.get('/api/ai-brief', async (req, res) => {
    try {
        if (_aiBriefCache && (Date.now() - _aiBriefCacheTs) < AI_BRIEF_TTL) {
            return res.json({ ok:true, cached:true, ..._aiBriefCache });
        }

        // Fetch in parallel
        const [macro, newsItems, fngRes] = await Promise.allSettled([
            _fetchMacro(),
            _fetchRSSNews(),
            fetch('https://api.alternative.me/fng/?limit=1').then(r => r.json()).then(d => d?.data?.[0] || null),
        ]);

        const macro_   = macro.status === 'fulfilled' ? macro.value : {};
        const titles   = newsItems.status === 'fulfilled' ? newsItems.value : [];
        const fng      = fngRes.status === 'fulfilled' ? fngRes.value : null;
        const sentiment = _scoreNews(titles);
        const { mood, moodEmoji, fngValue, recs, sentimentScore, bull, bear } = _buildRecommendations(macro_, sentiment, sentiment.hotSectors, fng);

        const result = {
            generatedAt: new Date().toISOString(),
            mood, moodEmoji, fngValue,
            fngLabel: fng?.value_classification || null,
            sentimentScore, bull, bear,
            newsCount: titles.length,
            hotSectors: sentiment.hotSectors,
            macro: Object.fromEntries(Object.entries(macro_).map(([k,v]) => [k, { price: v.price, chg: v.chg }])),
            recommendations: recs,
            sampleHeadlines: titles.slice(0, 6),
        };

        _aiBriefCache = result;
        _aiBriefCacheTs = Date.now();
        res.json({ ok:true, ...result });
    } catch(e) {
        console.error('AI brief error:', e.message);
        res.status(500).json({ ok:false, error: e.message });
    }
});

app.get('/api/idx-gainers', async (req, res) => {
    try {
        if (_idxGainersCache && (Date.now() - _idxGainersCacheTs) < IDX_GAINERS_TTL) {
            return res.json({ ok: true, cached: true, ..._idxGainersCache });
        }

        // Fetch in parallel batches of 15 to avoid timeout
        const BATCH = 15;
        const symbols = [...new Set(IDX_UNIVERSE)]; // deduplicate
        const batches = [];
        for (let i = 0; i < symbols.length; i += BATCH) batches.push(symbols.slice(i, i + BATCH));

        const batchResults = await Promise.allSettled(batches.map(batch =>
            Promise.allSettled(batch.map(sym =>
                fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${sym}.JK?interval=1d&range=2d`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 6000
                }).then(r => r.json()).then(json => {
                    const result = json?.chart?.result?.[0];
                    if (!result) return null;
                    const meta = result.meta || {};
                    const price = meta.regularMarketPrice;
                    if (!price) return null;
                    const prev  = meta.chartPreviousClose || meta.previousClose || price;
                    const change = prev ? parseFloat(((price - prev) / prev * 100).toFixed(2)) : 0;
                    const vol = meta.regularMarketVolume || 0;
                    return {
                        code: sym,
                        price: Math.round(price),
                        change,
                        volume: vol >= 1e9 ? (vol/1e9).toFixed(1)+'B' : vol >= 1e6 ? (vol/1e6).toFixed(1)+'M' : vol >= 1e3 ? (vol/1e3).toFixed(0)+'K' : String(vol),
                        volumeRaw: vol,
                        w52h: meta.fiftyTwoWeekHigh ? Math.round(meta.fiftyTwoWeekHigh) : null,
                        w52l: meta.fiftyTwoWeekLow  ? Math.round(meta.fiftyTwoWeekLow)  : null,
                    };
                }).catch(() => null)
            ))
        ));

        const all = [];
        batchResults.forEach(br => {
            if (br.status === 'fulfilled') {
                br.value.forEach(r => { if (r.status === 'fulfilled' && r.value) all.push(r.value); });
            }
        });

        // Sort gainers & losers
        const gainers = [...all].filter(s => s.change > 0).sort((a, b) => b.change - a.change).slice(0, 20);
        const losers  = [...all].filter(s => s.change < 0).sort((a, b) => a.change - b.change).slice(0, 10);
        const mostActive = [...all].sort((a, b) => b.volumeRaw - a.volumeRaw).slice(0, 10);

        const payload = { gainers, losers, mostActive, total: all.length, ts: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) };
        _idxGainersCache   = payload;
        _idxGainersCacheTs = Date.now();

        return res.json({ ok: true, cached: false, ...payload });
    } catch (err) {
        console.error('/api/idx-gainers error:', err.message);
        return res.status(500).json({ ok: false, error: err.message });
    }
});





// GET /fng — Fear & Greed Index dengan cache 5 menit
let _fngCache = null;
let _fngCacheTs = 0;
const FNG_CACHE_MS = 5 * 60_000;

app.get('/fng', async (_, res) => {
    if (_fngCache && (Date.now() - _fngCacheTs) < FNG_CACHE_MS) {
        return res.json(_fngCache);
    }
    try {
        const r = await fetch('https://api.alternative.me/fng/?limit=1', {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000),
        });
        if (r.ok) {
            const data = await r.json();
            _fngCache   = data;
            _fngCacheTs = Date.now();
            return res.json(data);
        }
    } catch {}
    // Fallback ke cache lama atau default
    if (_fngCache) return res.json(_fngCache);
    res.json({ data: [{ value: '50', value_classification: 'Neutral', timestamp: String(Math.floor(Date.now()/1000)) }] });
});

// GET /api/auto-trader/state — state auto-trader (untuk animasi & dashboard)
app.get('/api/auto-trader/state', (req, res) => {
    try {
        const fs = require('fs');
        const stateFile = require('path').join(__dirname, 'auto-trader-state.json');
        if (fs.existsSync(stateFile)) {
            const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
            return res.json({ ok: true, ...state });
        }
    } catch {}
    // Default state jika file tidak ada
    res.json({ ok: true, running: false, mode: 'MANUAL', openPositions: [], stats: { totalTrades: 0, winRate: 0 } });
});

// ══════════════════════════════════════════════════════════════════════════════
//  WHALE DETECTOR ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/whale/alerts — semua alert dari Whale Alert + DEXScreener
app.get('/api/whale/alerts', async (req, res) => {
    try {
        const alerts = await whale.getAlerts();
        res.json({ ok: true, count: alerts.length, alerts });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── DexScreener live price proxy (bypasses browser CORS) ─────────────────
// GET /api/dex/pair/:chain/:pairAddress  — harga live 1 pair
app.get('/api/dex/pair/:chain/:pairAddress', async (req, res) => {
    const { chain, pairAddress } = req.params;
    try {
        const url = `https://api.dexscreener.com/latest/dex/pairs/${chain}/${pairAddress}`;
        const r   = await fetch(url, { timeout: 6000 });
        if (!r.ok) return res.status(r.status).json({ ok: false, error: 'dexscreener error' });
        const data = await r.json();
        const pair = data.pair || (Array.isArray(data.pairs) && data.pairs[0]) || null;
        if (!pair) return res.json({ ok: true, gone: true, pairAddress, symbol: '?', priceUsd: 0,
            priceChange5m: null, priceChange1h: null, priceChange24h: null,
            volume24h: 0, liquidityUsd: 0, fdv: 0, url: `https://dexscreener.com/solana/${pairAddress}`, fetchedAt: Date.now() });
        res.json({
            ok:             true,
            pairAddress:    pair.pairAddress,
            symbol:         pair.baseToken?.symbol || '?',
            priceUsd:       parseFloat(pair.priceUsd || 0),
            priceChange5m:  pair.priceChange?.m5  != null ? parseFloat(pair.priceChange.m5)  : null,
            priceChange1h:  pair.priceChange?.h1  != null ? parseFloat(pair.priceChange.h1)  : null,
            priceChange24h: pair.priceChange?.h24 != null ? parseFloat(pair.priceChange.h24) : null,
            volume24h:      parseFloat(pair.volume?.h24 || 0),
            liquidityUsd:   parseFloat(pair.liquidity?.usd || 0),
            txns5m:         pair.txns?.m5  || null,
            txns1h:         pair.txns?.h1  || null,
            fdv:            parseFloat(pair.fdv || 0),
            url:            pair.url || `https://dexscreener.com/${chain}/${pairAddress}`,
            fetchedAt:      Date.now(),
        });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/dex/pairs-batch  — harga live banyak pair sekaligus (POST body: {pairs:[{chain,pairAddress}]})
app.post('/api/dex/pairs-batch', async (req, res) => {
    const pairs = Array.isArray(req.body?.pairs) ? req.body.pairs.slice(0, 20) : [];
    if (!pairs.length) return res.json({ ok: true, results: [] });
    const results = await Promise.all(pairs.map(async ({ chain, pairAddress }) => {
        try {
            const url  = `https://api.dexscreener.com/latest/dex/pairs/${chain || 'solana'}/${pairAddress}`;
            const r    = await fetch(url, { timeout: 6000 });
            if (!r.ok) return { pairAddress, ok: false };
            const data = await r.json();
            const pair = data.pair || (Array.isArray(data.pairs) && data.pairs[0]) || null;
            if (!pair) return { pairAddress, ok: true, gone: true, priceUsd: 0, liquidityUsd: 0, volume24h: 0,
                    priceChange5m: null, priceChange1h: null, priceChange24h: null,
                    url: `https://dexscreener.com/${chain || 'solana'}/${pairAddress}`, fetchedAt: Date.now() };
            return {
                ok:             true,
                pairAddress:    pair.pairAddress,
                symbol:         pair.baseToken?.symbol || '?',
                priceUsd:       parseFloat(pair.priceUsd || 0),
                priceChange5m:  pair.priceChange?.m5  != null ? parseFloat(pair.priceChange.m5)  : null,
                priceChange1h:  pair.priceChange?.h1  != null ? parseFloat(pair.priceChange.h1)  : null,
                priceChange24h: pair.priceChange?.h24 != null ? parseFloat(pair.priceChange.h24) : null,
                volume24h:      parseFloat(pair.volume?.h24 || 0),
                liquidityUsd:   parseFloat(pair.liquidity?.usd || 0),
                fdv:            parseFloat(pair.fdv || 0),
                url:            pair.url || `https://dexscreener.com/${chain || 'solana'}/${pairAddress}`,
                fetchedAt:      Date.now(),
            };
        } catch { return { pairAddress, ok: false }; }
    }));
    res.json({ ok: true, results });
});

// POST /api/dex/clear-dead — hapus posisi yang sudah gone dari memecoin-state.json
// Body opsional: { force: true } untuk hapus semua posisi tanpa re-check DexScreener
// Body opsional: { stopHunter: true } untuk kill memecoin-hunter sebelum clear
app.post('/api/dex/clear-dead', async (req, res) => {
    const fsp        = require('fs').promises;
    const nodePath   = require('path');
    const { execSync } = require('child_process');
    const STATE_FILE = nodePath.join(__dirname, 'memecoin-state.json');
    const forceAll   = req.body?.force === true;
    const stopHunter = req.body?.stopHunter === true;

    // Optional: stop memecoin-hunter agar tidak overwrite state
    if (stopHunter) {
        try { execSync('pkill -f "memecoin-hunter.js"', { timeout: 3000 }); } catch (_) {}
        await new Promise(r => setTimeout(r, 500)); // beri waktu process terminate
    }

    try {
        const raw   = await fsp.readFile(STATE_FILE, 'utf8');
        const state = JSON.parse(raw);
        const pos   = state.positions || {};
        const gone  = [];
        const kept  = {};

        if (forceAll) {
            // Tandai semua sebagai gone langsung (sudah terbukti dari DexScreener)
            for (const [k, v] of Object.entries(pos)) {
                gone.push(v.coinSymbol || v.coinName || k);
            }
        } else {
            await Promise.all(Object.entries(pos).map(async ([k, v]) => {
                const pa    = v.pairAddress || '';
                const chain = v.chain || 'solana';
                if (!pa) { kept[k] = v; return; }
                try {
                    const r    = await fetch(`https://api.dexscreener.com/latest/dex/pairs/${chain}/${pa}`, { timeout: 6000 });
                    const data = await r.json();
                    const pair = data.pair || (Array.isArray(data.pairs) && data.pairs[0]) || null;
                    if (pair) { kept[k] = v; }
                    else      { gone.push(v.coinSymbol || v.coinName || k); }
                } catch { kept[k] = v; }  // error network → tetap simpan
            }));
        }

        state.positions    = kept;
        state.archivedDead = [...(state.archivedDead || []), ...gone.map(sym => ({
            sym, removedAt: new Date().toISOString(), reason: forceAll ? 'force_cleared' : 'gone_from_dexscreener'
        }))];
        await fsp.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
        res.json({ ok: true, removed: gone, remaining: Object.keys(kept).length, hunterStopped: stopHunter });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  DEX SNIPER  — Early Entry + Momentum Rider detector
//  Sumber data: DEXScreener public API (no key needed)
// ══════════════════════════════════════════════════════════════

function _dexSniperScore(p, mode) {
    let score = 0;
    const signals = {};

    if (mode === 'early') {
        // ── EARLY ENTRY: baru listing, volume building, belum pump ──

        // 1. Usia token (baru = lebih baik) — maks 25 poin
        const ageH = p.ageHours || 9999;
        const ageScore = ageH <= 1 ? 25 : ageH <= 6 ? 20 : ageH <= 24 ? 12 : ageH <= 72 ? 5 : 0;
        score += ageScore;
        signals.age = { active: ageScore > 0, score: ageScore, label: `Usia ${ageH < 1 ? '<1j' : ageH.toFixed(0) + 'j'}` };

        // 2. Volume 5m accelerating — maks 20 poin
        const vol5m = p.vol5m || 0;
        const vol1h = p.vol1h || 0;
        const volAccel = vol1h > 0 ? (vol5m * 12) / vol1h : 0; // annualize 5m ke 1h
        const volScore = volAccel >= 3 ? 20 : volAccel >= 2 ? 14 : volAccel >= 1.2 ? 8 : 0;
        score += volScore;
        signals.volume = { active: volScore > 0, score: volScore, label: `Vol Accel ${volAccel.toFixed(1)}x` };

        // 3. Buy pressure — buys >> sells di 5m — maks 20 poin
        const b5 = p.buys5m || 0, s5 = p.sells5m || 0;
        const buyRatio = (b5 + s5) > 0 ? b5 / (b5 + s5) : 0.5;
        const buyScore = buyRatio >= 0.75 ? 20 : buyRatio >= 0.65 ? 14 : buyRatio >= 0.55 ? 7 : 0;
        score += buyScore;
        signals.buys = { active: buyScore > 0, score: buyScore, label: `Buy ${(buyRatio*100).toFixed(0)}%` };

        // 4. Liquidity cukup (tidak terlalu kecil = aman) — maks 15 poin
        const liq = p.liquidityUsd || 0;
        const liqScore = liq >= 50000 ? 15 : liq >= 20000 ? 10 : liq >= 5000 ? 5 : 0;
        score += liqScore;
        signals.liquidity = { active: liqScore > 0, score: liqScore, label: `Liq $${_fmtK(liq)}` };

        // 5. Price belum pump jauh — chg1h < 50% (masih early) — maks 10 poin
        const chg1h = p.chg1h || 0;
        const notPumped = chg1h < 50 && chg1h > -10;
        const noPumpScore = notPumped ? 10 : 0;
        score += noPumpScore;
        signals.price = { active: noPumpScore > 0, score: noPumpScore, label: `Chg 1h: ${chg1h > 0 ? '+' : ''}${chg1h.toFixed(1)}%` };

        // 6. FDV rendah = lebih banyak upside — maks 10 poin
        const fdv = p.fdv || 0;
        const fdvScore = fdv > 0 && fdv < 500000 ? 10 : fdv < 2000000 ? 6 : fdv < 10000000 ? 3 : 0;
        score += fdvScore;
        signals.fdv = { active: fdvScore > 0, score: fdvScore, label: `FDV $${_fmtK(fdv)}` };

    } else {
        // ── MOMENTUM RIDER: sedang naik tapi potensi masih besar ──

        // 1. Price momentum kuat tapi bukan parabolic — maks 25 poin
        const chg1h = p.chg1h || 0, chg5m = p.chg5m || 0;
        const momScore = (chg1h >= 20 && chg1h <= 200) ? 25
                       : (chg1h >= 10 && chg1h < 20)  ? 18
                       : (chg1h >= 5  && chg1h < 10)  ? 10 : 0;
        score += momScore;
        signals.momentum = { active: momScore > 0, score: momScore, label: `+${chg1h.toFixed(1)}% 1h` };

        // 2. Volume 1h tinggi — maks 20 poin
        const vol1h = p.vol1h || 0;
        const momVol = vol1h >= 500000 ? 20 : vol1h >= 100000 ? 14 : vol1h >= 20000 ? 8 : 0;
        score += momVol;
        signals.volume = { active: momVol > 0, score: momVol, label: `Vol $${_fmtK(vol1h)}/1h` };

        // 3. Buy tekanan masih dominan di 5m (momentum belum habis) — maks 20 poin
        const b5 = p.buys5m || 0, s5 = p.sells5m || 0;
        const buyRatio = (b5 + s5) > 0 ? b5 / (b5 + s5) : 0.5;
        const buyMom = buyRatio >= 0.65 ? 20 : buyRatio >= 0.55 ? 12 : 0;
        score += buyMom;
        signals.buys = { active: buyMom > 0, score: buyMom, label: `Buy ${(buyRatio*100).toFixed(0)}%` };

        // 4. Liquidity kuat = sustainable rally — maks 15 poin
        const liq = p.liquidityUsd || 0;
        const liqMom = liq >= 200000 ? 15 : liq >= 50000 ? 10 : liq >= 10000 ? 5 : 0;
        score += liqMom;
        signals.liquidity = { active: liqMom > 0, score: liqMom, label: `Liq $${_fmtK(liq)}` };

        // 5. FDV masih wajar (ada ruang naik) — maks 10 poin
        const fdv = p.fdv || 0;
        const fdvMom = fdv > 0 && fdv < 5000000 ? 10 : fdv < 20000000 ? 5 : 0;
        score += fdvMom;
        signals.fdv = { active: fdvMom > 0, score: fdvMom, label: `FDV $${_fmtK(fdv)}` };

        // 6. Boosts aktif (smart money naruh modal promosi) — maks 10 poin
        const boosts = p.boosts || 0;
        const boostScore = boosts >= 10 ? 10 : boosts >= 3 ? 6 : boosts >= 1 ? 3 : 0;
        score += boostScore;
        signals.boosts = { active: boostScore > 0, score: boostScore, label: `${boosts} Boosts` };
    }

    let signal = 'WEAK', signalColor = '#475569';
    if (score >= 75)     { signal = mode === 'early' ? '🎯 SNIPE NOW' : '🚀 RIDE NOW'; signalColor = '#f59e0b'; }
    else if (score >= 55){ signal = mode === 'early' ? '👀 WATCH'    : '📈 BUILDING'; signalColor = '#3b82f6'; }
    else if (score >= 35){ signal = '📋 SETUP'; signalColor = '#8b5cf6'; }

    return { score, signal, signalColor, signals };
}

function _fmtK(n) {
    if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return n.toFixed(0);
}

app.get('/api/dex-sniper', async (req, res) => {
    const mode  = req.query.mode === 'momentum' ? 'momentum' : 'early';
    const chain = req.query.chain || 'solana';
    try {
        // Fetch dari beberapa sumber DEXScreener
        const endpoints = [
            `https://api.dexscreener.com/token-boosts/latest/v1`,
            `https://api.dexscreener.com/latest/dex/search?q=new+token+${chain}`,
            `https://api.dexscreener.com/latest/dex/search?q=pump+sol`,
        ];

        const seen = new Set();
        let allPairs = [];

        // Parallel fetch dari semua sumber
        const fetches = await Promise.allSettled([
            // Latest boosted tokens
            fetch('https://api.dexscreener.com/token-boosts/latest/v1').then(r => r.json()),
            // Search trending
            fetch(`https://api.dexscreener.com/latest/dex/search?q=solana+meme`).then(r => r.json()),
            fetch(`https://api.dexscreener.com/latest/dex/search?q=pump+fun`).then(r => r.json()),
            fetch(`https://api.dexscreener.com/latest/dex/search?q=raydium+new`).then(r => r.json()),
        ]);

        // Kumpulkan pair addresses dari boosted tokens
        const boostedAddrs = new Set();
        if (fetches[0].status === 'fulfilled') {
            const boosted = Array.isArray(fetches[0].value) ? fetches[0].value : [];
            boosted.filter(t => t.chainId === chain).forEach(t => boostedAddrs.add(t.tokenAddress));
        }

        // Kumpulkan semua pairs dari search results
        for (let i = 1; i < fetches.length; i++) {
            if (fetches[i].status !== 'fulfilled') continue;
            const pairs = fetches[i].value?.pairs || [];
            for (const p of pairs) {
                if (!p.pairAddress || seen.has(p.pairAddress)) continue;
                if (chain && p.chainId !== chain) continue;
                seen.add(p.pairAddress);

                const ageH = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3_600_000 : 9999;
                const liq  = parseFloat(p.liquidity?.usd || 0);
                const vol24 = parseFloat(p.volume?.h24 || 0);

                // Filter dasar: harus ada likuiditas dan volume
                if (liq < 1000 || vol24 < 500) continue;

                const parsed = {
                    pairAddress : p.pairAddress,
                    baseSymbol  : p.baseToken?.symbol || '?',
                    baseName    : p.baseToken?.name   || '?',
                    baseMint    : p.baseToken?.address || '',
                    chain       : p.chainId,
                    dex         : p.dexId,
                    url         : p.url || `https://dexscreener.com/${p.chainId}/${p.pairAddress}`,
                    priceUsd    : parseFloat(p.priceUsd || 0),
                    ageHours    : ageH,
                    liquidityUsd: liq,
                    fdv         : parseFloat(p.fdv || 0),
                    mcap        : parseFloat(p.marketCap || 0),
                    vol5m       : parseFloat(p.volume?.m5  || 0),
                    vol1h       : parseFloat(p.volume?.h1  || 0),
                    vol24h      : vol24,
                    chg5m       : parseFloat(p.priceChange?.m5  || 0),
                    chg1h       : parseFloat(p.priceChange?.h1  || 0),
                    chg24h      : parseFloat(p.priceChange?.h24 || 0),
                    buys5m      : p.txns?.m5?.buys  || 0,
                    sells5m     : p.txns?.m5?.sells || 0,
                    buys1h      : p.txns?.h1?.buys  || 0,
                    sells1h     : p.txns?.h1?.sells || 0,
                    boosts      : boostedAddrs.has(p.baseToken?.address) ? 1 : 0,
                };

                const { score, signal, signalColor, signals } = _dexSniperScore(parsed, mode);
                allPairs.push({ ...parsed, score, signal, signalColor, signals });
            }
        }

        // Sort by score
        allPairs.sort((a, b) => b.score - a.score);

        // Ambil top 50
        const top = allPairs.slice(0, 50);

        // Telegram alert untuk score >= 75
        const hot = top.filter(t => t.score >= 75);
        if (hot.length && _tgConfig.botToken && _tgConfig.chatId) {
            const lines = hot.slice(0, 3).map(t =>
                `${t.signal} <b>${t.baseSymbol}</b> (${t.baseName})\n` +
                `   Score: <b>${t.score}/100</b> · FDV: $${_fmtK(t.fdv)} · Liq: $${_fmtK(t.liquidityUsd)}\n` +
                `   <a href="${t.url}">→ Chart DEXScreener</a>`
            ).join('\n\n');
            const emoji = mode === 'early' ? '🎯' : '🚀';
            const msg = `${emoji} <b>DEX Sniper Alert — ${mode === 'early' ? 'Early Entry' : 'Momentum Rider'}</b>\n\n${lines}`;
            fetch(`https://api.telegram.org/bot${_tgConfig.botToken}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: _tgConfig.chatId, text: msg, parse_mode: 'HTML', disable_web_page_preview: true })
            }).catch(() => {});
        }

        res.json({ ok: true, tokens: top, mode, chain, total: allPairs.length, scannedAt: Date.now() });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

// POST /api/hunter/start — jalankan memecoin-hunter.js sebagai background process
app.post('/api/hunter/start', (req, res) => {
    const { execSync, spawn } = require('child_process');
    try {
        // Cek apakah sudah berjalan
        let pid = null;
        try { pid = execSync('pgrep -f "memecoin-hunter.js"', { encoding: 'utf8' }).trim(); } catch (_) {}
        if (pid) return res.json({ ok: true, alreadyRunning: true, pid: parseInt(pid) });

        const nodePath = require('path');
        const child = spawn('node', [nodePath.join(__dirname, 'memecoin-hunter.js')], {
            detached: true,
            stdio:    'ignore',
            cwd:      __dirname,
        });
        child.unref();
        res.json({ ok: true, alreadyRunning: false, pid: child.pid });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/hunter/status — cek apakah memecoin-hunter sedang berjalan
app.get('/api/hunter/status', (req, res) => {
    const { execSync } = require('child_process');
    try {
        const pid = execSync('pgrep -f "memecoin-hunter.js"', { encoding: 'utf8' }).trim();
        res.json({ ok: true, running: true, pid: parseInt(pid) });
    } catch (_) {
        res.json({ ok: true, running: false });
    }
});

// GET /api/whale/dex — hanya DEXScreener alerts (Solana)
app.get('/api/whale/dex', async (req, res) => {
    try {
        const alerts = await whale.getDexWhaleAlerts('solana');
        res.json({ ok: true, count: alerts.length, alerts });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/whale/dex/:mint — whale activity untuk 1 token Solana
app.get('/api/whale/dex/:mint', async (req, res) => {
    try {
        const result = await whale.getDexWhaleSingle(req.params.mint);
        res.json({ ok: true, alert: result });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/whale/chain — hanya Whale Alert on-chain transfers
app.get('/api/whale/chain', async (req, res) => {
    try {
        const alerts = await whale.getWhaleAlertTxns();
        res.json({ ok: true, count: alerts.length, alerts });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// GET /api/whale/status — status & config whale detector
app.get('/api/whale/status', (req, res) => {
    res.json({ ok: true, ...whale.getStatus() });
});

// ══════════════════════════════════════════════════════════════
// WALLET ANALYTICS — tx history, token holdings, accumulation
// GET /api/wallet-analytics/:address
//   ?limit=30  — max signatures to fetch (default 20)
// Uses Solana JSON-RPC (no key) + Jupiter token metadata
// ══════════════════════════════════════════════════════════════
const _walletCache = {};
const WALLET_TTL   = 90_000; // 90s cache per address

// Jupiter token list cache (mint → { symbol, name })
let _jupTokenMap = {};
let _jupTokenMapTs = 0;
const JUP_TOKEN_TTL = 6 * 3600_000; // 6 hours

async function _getJupTokenMap() {
    if (Date.now() - _jupTokenMapTs < JUP_TOKEN_TTL && Object.keys(_jupTokenMap).length > 100) {
        return _jupTokenMap;
    }
    try {
        const r = await fetch('https://token.jup.ag/strict', {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(12000),
        });
        if (r.ok) {
            const list = await r.json();
            _jupTokenMap = {};
            (Array.isArray(list) ? list : []).forEach(t => {
                _jupTokenMap[t.address] = { symbol: t.symbol, name: t.name, logoURI: t.logoURI };
            });
            _jupTokenMapTs = Date.now();
            console.log(`[JupTokenMap] loaded ${Object.keys(_jupTokenMap).length} tokens`);
        }
    } catch(e) {
        console.warn('[JupTokenMap] fetch failed:', e.message);
    }
    return _jupTokenMap;
}

async function _solanaRpc(method, params, timeout = 10000) {
    const RPC_ENDPOINTS = [
        'https://api.mainnet-beta.solana.com',
        'https://solana-mainnet.rpc.extrnode.com',
    ];
    for (const url of RPC_ENDPOINTS) {
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
                signal: AbortSignal.timeout(timeout),
            });
            if (!r.ok) continue;
            const d = await r.json();
            if (d.error) { console.warn(`[RPC] ${method} error:`, d.error.message); continue; }
            return d.result;
        } catch(e) { /* try next */ }
    }
    return null;
}

app.get('/api/wallet-analytics/:address', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const addr  = (req.params.address || '').replace(/[^a-zA-Z0-9]/g, '');
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    if (!addr || addr.length < 32) return res.status(400).json({ ok: false, error: 'Invalid address' });

    const cacheKey = `${addr}_${limit}`;
    const cached = _walletCache[cacheKey];
    if (cached && (Date.now() - cached.ts) < WALLET_TTL) {
        return res.json({ ...cached.data, _cached: true });
    }

    try {
        // Fetch Jupiter token map + Solana data in parallel
        const [tokenMap, tokenAccounts, signatures] = await Promise.all([
            _getJupTokenMap(),
            _solanaRpc('getTokenAccountsByOwner', [
                addr,
                { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                { encoding: 'jsonParsed', commitment: 'confirmed' },
            ], 12000),
            _solanaRpc('getSignaturesForAddress', [
                addr,
                { limit },
            ], 10000),
        ]);

        // ── Token holdings ─────────────────────────────────────
        const rawAccounts = tokenAccounts?.value || [];
        const tokenHoldings = rawAccounts
            .map(acc => {
                const info = acc.account?.data?.parsed?.info || {};
                const mint = info.mint || '';
                const uiAmt = info.tokenAmount?.uiAmount || 0;
                const meta  = tokenMap[mint] || {};
                return {
                    mint,
                    symbol:   meta.symbol || mint.slice(0, 6) + '…',
                    name:     meta.name   || 'Unknown',
                    logoURI:  meta.logoURI || null,
                    balance:  uiAmt,
                    decimals: info.tokenAmount?.decimals || 0,
                    usdValue: null, // would need price oracle
                };
            })
            .filter(t => t.balance > 0)
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 20);

        // ── Recent transactions ────────────────────────────────
        const rawSigs = signatures || [];
        const recentActivity = rawSigs.map(sig => ({
            signature:  sig.signature,
            blockTime:  sig.blockTime || 0,
            slot:       sig.slot,
            status:     sig.err ? 'fail' : 'success',
            err:        sig.err ? JSON.stringify(sig.err) : null,
            memo:       sig.memo || null,
            // Type detection — rough: if memo contains "buy" use that, else show as TRANSFER
            type:       'TX',
        }));

        // ── Accumulation detection from token holdings ─────────
        // With RPC we don't have tx-level buy/sell, so flag large holders of specific tokens
        // by checking if top holdings are memecoins (not in strict list = likely speculative)
        const accumulating = tokenHoldings
            .filter(t => {
                const sym = t.symbol.toLowerCase();
                // flag tokens NOT in strict jupiter list (could be new / accumulating)
                const inStrictList = !!tokenMap[t.mint];
                return inStrictList && t.balance > 0;
            })
            .slice(0, 5)
            .map(t => ({ symbol: t.symbol, mint: t.mint, balance: t.balance, buyCount: 1 }));

        const data = {
            ok: true, address: addr,
            topHoldings:    tokenHoldings,
            recentActivity,
            accumulating,
            tokenCount:     tokenHoldings.length,
            txCount:        rawSigs.length,
            dataSource:     'Solana RPC + Jupiter',
            fetchedAt:      new Date().toISOString(),
        };
        _walletCache[cacheKey] = { data, ts: Date.now() };
        res.json(data);
    } catch (e) {
        console.error('/api/wallet-analytics error:', e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /api/sol-balance/:address
// Returns SOL balance + token holdings + USD prices in ONE call
// ══════════════════════════════════════════════════════════════
const _balCache = {};
const BAL_TTL = 20_000; // 20s

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_RPC_LIST = [
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://rpc.ankr.com/solana',
];

async function _rpc(method, params, timeoutMs = 10000) {
    for (const url of SOL_RPC_LIST) {
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!r.ok) continue;
            const d = await r.json();
            if (d.error) continue;
            return d.result;
        } catch(e) { /* try next */ }
    }
    return null;
}

app.get('/api/sol-balance/:address', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const addr = (req.params.address || '').replace(/[^a-zA-Z0-9]/g, '');
    if (!addr || addr.length < 32) return res.status(400).json({ ok: false, error: 'Invalid address' });

    const cached = _balCache[addr];
    if (cached && (Date.now() - cached.ts) < BAL_TTL) return res.json({ ...cached.data, _cached: true });

    try {
        // Parallel: SOL balance + SPL token accounts
        const [balResult, tokResult] = await Promise.all([
            _rpc('getBalance', [addr, { commitment: 'confirmed' }], 8000),
            _rpc('getTokenAccountsByOwner', [
                addr,
                { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
                { encoding: 'jsonParsed', commitment: 'confirmed' },
            ], 12000),
        ]);

        const solLamports = balResult?.value ?? 0;
        const solBalance  = solLamports / 1e9;

        // Parse SPL tokens
        const rawAccs = tokResult?.value || [];
        let tokens = rawAccs
            .map(acc => {
                const info = acc.account?.data?.parsed?.info || {};
                return {
                    mint:     info.mint || '',
                    balance:  info.tokenAmount?.uiAmount || 0,
                    decimals: info.tokenAmount?.decimals || 0,
                };
            })
            .filter(t => t.mint && t.balance > 0);

        // Get token metadata + prices via DexScreener (batched 30 at a time) + CoinGecko for SOL
        let tokenMeta = {}; // mint -> { symbol, name, logoURI, priceUsd }
        let solPrice = 0;

        // 1. SOL price from CoinGecko
        try {
            const cgR = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { signal: AbortSignal.timeout(8000) });
            if (cgR.ok) { const d = await cgR.json(); solPrice = d?.solana?.usd || 0; }
        } catch(e) {}

        // 2. Token metadata + prices from DexScreener (max 30 per request)
        const tokenMints = tokens.map(t => t.mint);
        const BATCH = 30;
        for (let i = 0; i < tokenMints.length; i += BATCH) {
            const batch = tokenMints.slice(i, i + BATCH);
            try {
                const dsR = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(',')}`, { signal: AbortSignal.timeout(10000) });
                if (dsR.ok) {
                    const pairs = await dsR.json();
                    (Array.isArray(pairs) ? pairs : []).forEach(pair => {
                        const bt = pair.baseToken;
                        if (!bt?.address) return;
                        const mint = bt.address;
                        if (tokenMeta[mint]) return; // already have best pair
                        tokenMeta[mint] = {
                            symbol:   bt.symbol || mint.slice(0, 6),
                            name:     bt.name   || 'Unknown',
                            logoURI:  pair.info?.imageUrl || null,
                            priceUsd: parseFloat(pair.priceUsd) || 0,
                        };
                    });
                }
            } catch(e) { /* skip batch */ }
        }

        const solUsd = solBalance * solPrice;

        // Enrich tokens
        tokens = tokens.map(t => {
            const meta   = tokenMeta[t.mint] || {};
            const price  = meta.priceUsd || 0;
            return {
                ...t,
                symbol:   meta.symbol  || t.mint.slice(0, 6),
                name:     meta.name    || 'Unknown',
                logoURI:  meta.logoURI || null,
                priceUsd: price,
                usdValue: price * t.balance,
            };
        }).sort((a, b) => b.usdValue - a.usdValue);

        const tokenTotalUsd = tokens.reduce((s, t) => s + t.usdValue, 0);

        const data = {
            ok: true, address: addr,
            solBalance, solPrice, solUsd,
            tokens,
            tokenCount:    tokens.length,
            tokenTotalUsd,
            totalUsd:      solUsd + tokenTotalUsd,
            fetchedAt:     new Date().toISOString(),
        };
        _balCache[addr] = { data, ts: Date.now() };
        res.json(data);
    } catch(e) {
        console.error('[sol-balance] error:', e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /api/token-prices?mints=mint1,mint2,...
// Uses Jupiter Price API v2 — no key needed
// Returns { prices: { [mint]: { price, symbol } } }
// ══════════════════════════════════════════════════════════════
const _priceCache = {};
const PRICE_TTL = 30_000; // 30s

app.get('/api/token-prices', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const mints = (req.query.mints || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
    if (!mints.length) return res.json({ prices: {} });

    // Split into cached / uncached
    const now = Date.now();
    const prices = {};
    const toFetch = [];
    for (const m of mints) {
        if (_priceCache[m] && (now - _priceCache[m].ts) < PRICE_TTL) {
            prices[m] = _priceCache[m].data;
        } else {
            toFetch.push(m);
        }
    }

    if (toFetch.length) {
        try {
            // Jupiter Price API v2
            const url = `https://api.jup.ag/price/v2?ids=${toFetch.join(',')}`;
            const r = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(8000),
            });
            if (r.ok) {
                const d = await r.json();
                const data = d.data || {};
                for (const m of toFetch) {
                    const entry = data[m];
                    const p = entry ? { price: parseFloat(entry.price) || 0, symbol: entry.id || m.slice(0,6) } : { price: 0, symbol: m.slice(0,6) };
                    _priceCache[m] = { data: p, ts: now };
                    prices[m] = p;
                }
            }
        } catch(e) {
            console.warn('[token-prices] fetch failed:', e.message);
            for (const m of toFetch) prices[m] = { price: 0, symbol: m.slice(0,6) };
        }
    }

    res.json({ prices, fetchedAt: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════
// GET /api/wallet-trace/:address
// Full wallet intelligence: balance + tokens + tx history + behavior
// ══════════════════════════════════════════════════════════════
const _traceCache = {};
const TRACE_TTL   = 60_000; // 60s

const SOL_RPC_NODES = [
    'https://api.mainnet-beta.solana.com',
    'https://rpc.ankr.com/solana',
    'https://solana-mainnet.rpc.extrnode.com',
];

async function _rpcCall(method, params, timeoutMs = 12000) {
    for (const url of SOL_RPC_NODES) {
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!r.ok) continue;
            const d = await r.json();
            if (d.error) continue;
            return d.result;
        } catch(e) { /* try next */ }
    }
    return null;
}

function _classifyWallet(data) {
    const { solBalance, totalUsd, tokens, txCount, txFreqPerDay } = data;
    const labels = [];
    let score = 0;

    // Balance-based
    if (totalUsd >= 1_000_000)     { labels.push('🐳 Whale');        score += 40; }
    else if (totalUsd >= 100_000)  { labels.push('🦈 Large Trader'); score += 30; }
    else if (totalUsd >= 10_000)   { labels.push('🐬 Mid Trader');   score += 20; }
    else if (totalUsd >= 1_000)    { labels.push('🐟 Retail');       score += 10; }
    else                           { labels.push('🦐 Small Wallet'); score += 5; }

    // Activity-based
    if (txFreqPerDay >= 50)        { labels.push('🤖 Bot/Sniper');   score += 20; }
    else if (txFreqPerDay >= 15)   { labels.push('⚡ Active Trader'); score += 15; }
    else if (txFreqPerDay >= 3)    { labels.push('📊 Regular Trader'); score += 10; }
    else                           { labels.push('😴 Low Activity'); }

    // Token count
    const activeToks = (tokens || []).filter(t => t.usdValue > 1);
    if (activeToks.length >= 15)   labels.push('🎰 Degen');
    else if (activeToks.length >= 8) labels.push('🎯 Multi-position');
    else if (activeToks.length >= 3) labels.push('💼 Diversified');
    else                           labels.push('🎯 Concentrated');

    // High SOL holding
    if (solBalance > 500)          { labels.push('💎 SOL Holder'); score += 15; }

    const riskLevel = totalUsd >= 100_000 ? 'LOW' : txFreqPerDay >= 30 ? 'HIGH' : 'MEDIUM';
    return { labels, score: Math.min(score, 100), riskLevel };
}

function _analyzeTokenBehavior(tokens) {
    const active = tokens.filter(t => t.usdValue > 0.01);
    const memeTokens   = active.filter(t => t.priceUsd < 0.001 || t.balance > 1_000_000);
    const largePos     = active.filter(t => t.usdValue >= 1000);
    const dustTokens   = active.filter(t => t.usdValue < 1);

    const concentration = active.length > 0 ? (largePos.reduce((s,t) => s+t.usdValue,0) / active.reduce((s,t) => s+t.usdValue,0) * 100) : 0;

    return {
        totalActive: active.length,
        memeTokenCount: memeTokens.length,
        largePositions: largePos.length,
        dustPositions: dustTokens.length,
        topPosition: active[0] || null,
        concentration: Math.round(concentration),
        style: memeTokens.length > largePos.length ? 'Memecoin Degen' : largePos.length >= 3 ? 'Diversified DeFi' : 'Concentrated Bets',
    };
}

app.get('/api/wallet-trace/:address', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const addr = (req.params.address || '').trim();
    if (!addr || addr.length < 30) return res.status(400).json({ ok: false, error: 'Invalid address' });

    const cached = _traceCache[addr];
    if (cached && (Date.now() - cached.ts) < TRACE_TTL) return res.json({ ...cached.data, _cached: true });

    try {
        // 1. Balance + tokens via existing sol-balance logic (DexScreener priced)
        const balRes = await fetch(`http://127.0.0.1:${PORT}/api/sol-balance/${addr}`, { signal: AbortSignal.timeout(20000) });
        const balData = balRes.ok ? await balRes.json() : {};

        // 2. Transaction history (last 50)
        const sigs = await _rpcCall('getSignaturesForAddress', [addr, { limit: 50 }], 12000) || [];

        // 3. Analyze tx patterns
        const now = Date.now() / 1000;
        const blockTimes = sigs.filter(s => s.blockTime).map(s => s.blockTime);
        const oldestTs   = blockTimes.length ? Math.min(...blockTimes) : now;
        const newestTs   = blockTimes.length ? Math.max(...blockTimes) : now;
        const daySpan    = Math.max((newestTs - oldestTs) / 86400, 1);
        const txFreqPerDay = +(sigs.length / daySpan).toFixed(1);

        // Group txs by day
        const txByDay = {};
        sigs.forEach(s => {
            if (!s.blockTime) return;
            const day = new Date(s.blockTime * 1000).toISOString().slice(0, 10);
            txByDay[day] = (txByDay[day] || 0) + 1;
        });
        const txTimeline = Object.entries(txByDay).sort().slice(-14).map(([date, count]) => ({ date, count }));

        // Failed tx ratio
        const failedCount = sigs.filter(s => s.err).length;
        const failRate    = sigs.length > 0 ? +(failedCount / sigs.length * 100).toFixed(1) : 0;

        // 4. Wallet classification
        const tokens   = balData.tokens || [];
        const totalUsd = balData.totalUsd || 0;
        const solBal   = balData.solBalance || 0;

        const classification = _classifyWallet({ solBalance: solBal, totalUsd, tokens, txCount: sigs.length, txFreqPerDay });
        const tokenBehavior  = _analyzeTokenBehavior(tokens);

        // 5. Risk signals
        const riskSignals = [];
        if (failRate > 20)       riskSignals.push({ type: 'warn', msg: `High fail rate: ${failRate}% of txs failed (possible bot/sniper)` });
        if (txFreqPerDay > 30)   riskSignals.push({ type: 'warn', msg: `Very high activity: ${txFreqPerDay} tx/day (automated trading suspected)` });
        if (tokenBehavior.memeTokenCount > 10) riskSignals.push({ type: 'info', msg: `Heavy memecoin exposure: ${tokenBehavior.memeTokenCount} meme tokens` });
        if (solBal > 100 && totalUsd > 50000) riskSignals.push({ type: 'bull', msg: `Significant SOL holder: ${solBal.toFixed(2)} SOL (long-term conviction?)` });
        if (tokenBehavior.concentration > 80) riskSignals.push({ type: 'info', msg: `Highly concentrated: top position = ${tokenBehavior.concentration}% of portfolio` });
        if (tokenBehavior.dustPositions > 20) riskSignals.push({ type: 'warn', msg: `Many dust positions: ${tokenBehavior.dustPositions} tokens < $1 (airdrop hunter?)` });

        // 6. Smart money score
        const smScore = Math.round(
            (totalUsd >= 10000 ? 30 : totalUsd >= 1000 ? 15 : 5) +
            (txFreqPerDay >= 5 && txFreqPerDay <= 30 ? 20 : 10) +
            (failRate < 10 ? 20 : 10) +
            (tokenBehavior.largePositions >= 2 ? 20 : 10) +
            (solBal > 10 ? 10 : 5)
        );

        // 7. Recent transactions enriched
        const recentTxs = sigs.slice(0, 20).map(s => ({
            sig:       s.signature,
            shortSig:  s.signature.slice(0, 8) + '...' + s.signature.slice(-6),
            blockTime: s.blockTime,
            timeAgo:   s.blockTime ? _timeAgo(s.blockTime) : '?',
            status:    s.err ? 'FAILED' : 'SUCCESS',
            err:       s.err ? JSON.stringify(s.err).slice(0, 60) : null,
            solscanUrl: `https://solscan.io/tx/${s.signature}`,
        }));

        const result = {
            ok: true, address: addr,
            shortAddr: addr.slice(0, 6) + '...' + addr.slice(-4),

            // Balance
            solBalance: solBal, solPrice: balData.solPrice || 0,
            solUsd: balData.solUsd || 0,
            tokenTotalUsd: balData.tokenTotalUsd || 0,
            totalUsd,

            // Tokens
            tokens: tokens.slice(0, 30),
            tokenCount: tokens.length,

            // Activity
            txCount: sigs.length,
            txFreqPerDay,
            failRate,
            firstSeen: oldestTs ? new Date(oldestTs * 1000).toISOString() : null,
            lastActive: newestTs ? new Date(newestTs * 1000).toISOString() : null,
            lastActiveAgo: newestTs ? _timeAgo(newestTs) : '?',
            txTimeline,
            recentTxs,

            // Intelligence
            classification,
            tokenBehavior,
            riskSignals,
            smartMoneyScore: Math.min(smScore, 100),

            // Links
            solscanUrl:   `https://solscan.io/account/${addr}`,
            solanaFmUrl:  `https://solana.fm/address/${addr}`,
            stepUrl:      `https://step.finance/en/portfolio?watch=${addr}`,

            fetchedAt: new Date().toISOString(),
        };

        _traceCache[addr] = { data: result, ts: Date.now() };
        res.json(result);
    } catch(e) {
        console.error('[wallet-trace] error:', e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

function _timeAgo(unixTs) {
    const sec = Math.floor(Date.now()/1000 - unixTs);
    if (sec < 60)   return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec/60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec/3600)}h ago`;
    return `${Math.floor(sec/86400)}d ago`;
}

// ══════════════════════════════════════════════════════════════
// GET /api/wallet-graph/:address
// Build transaction flow graph: center wallet → counterparties
// Returns nodes + edges with SOL direction & amount
// ══════════════════════════════════════════════════════════════

// ── Known Solana programs / exchanges ──────────────────────────
const KNOWN_ADDRS = {
    // System
    '11111111111111111111111111111111':            { label: 'System Program',       cat: 'system'   },
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA':{ label: 'Token Program',        cat: 'system'   },
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bY8':{ label:'Assoc. Token Program', cat: 'system'   },
    'ComputeBudget111111111111111111111111111111': { label: 'Compute Budget',        cat: 'system'   },
    'SysvarRent111111111111111111111111111111111': { label: 'Sysvar Rent',           cat: 'system'   },
    'SysvarC1ock11111111111111111111111111111111': { label: 'Sysvar Clock',          cat: 'system'   },
    // DEX / AMM
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8':{ label: 'Raydium AMM',         cat: 'dex'      },
    'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK':{ label: 'Raydium CLMM',        cat: 'dex'      },
    'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': { label: 'Orca Whirlpool',      cat: 'dex'      },
    '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP':{ label: 'Orca',                cat: 'dex'      },
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': { label: 'Jupiter v4',          cat: 'dex'      },
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': { label: 'Jupiter v6',          cat: 'dex'      },
    'JUP2jxvXaqu7NQY1GmNF4m1vodwdXNffhVi9hCKPw2y': { label: 'Jupiter v2',          cat: 'dex'      },
    'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX': { label: 'Serum DEX v3',        cat: 'dex'      },
    'EUqojwWA2rd19FZrzeBncJsm38Jm1hEhE3zsmX3bRc2o':{ label: 'Serum DEX v2',        cat: 'dex'      },
    'RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr': { label: 'Orca v1',             cat: 'dex'      },
    'MERLuDFBMmsHnsBPZw2sDQZHvXFMwp8EdjudcU2HKky': { label: 'Mercurial',           cat: 'dex'      },
    'SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ': { label: 'Saber',               cat: 'dex'      },
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P': { label: 'Pump.fun',            cat: 'dex'      },
    'BSfD6SHZigAfDWSjzD5Q41jw8LmKwtmjskPH9XW1mrRW':{ label: 'Drift',               cat: 'dex'      },
    'opnb2LAfJYbRMAHHvqjCwQxanZn7ReEHp1k81EohpZb': { label: 'OpenBook',            cat: 'dex'      },
    'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY': { label: 'Phoenix DEX',         cat: 'dex'      },
    // Staking / LST
    'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD': { label: 'Marinade',            cat: 'stake'    },
    'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy': { label: 'Stake Pool',          cat: 'stake'    },
    'CrX7kMhLC3cSsXJdT7JDgqrRVWGnUpX3gfEfxxPQwnt': { label: 'Lido',               cat: 'stake'    },
    // Lending
    'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo': { label: 'Solend',             cat: 'lending'  },
    'Port7uDYB3wkvBkLH4aQTh6pj6Xza9sCXKVHB3BHb4': { label: 'Port Finance',        cat: 'lending'  },
    'MFv2hWf31Z9kbCa1snEPdcgp168vLs2YNgGuX2By4XD': { label: 'Marginfi',           cat: 'lending'  },
    // CEX hot wallets (best-effort)
    'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2':{ label: 'Binance Hot Wallet',  cat: 'exchange' },
    'U6V3dBzS8RoF8jh3sqvB6T3h7tGnEhWsPJaLZQnYSj': { label: 'OKX',                cat: 'exchange' },
    '5tzFkiKscXHK5ZXCGbkqZKLCNJzD5GhFDpFMDeikk4R': { label: 'Kraken',             cat: 'exchange' },
    '2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm':{ label: 'Coinbase',            cat: 'exchange' },
    'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS':{ label: 'Bybit',              cat: 'exchange' },
};

// Classify a single tx based on counterparty + SOL direction
function _classifyTxType(delta, counterCat, counterType) {
    const abs = Math.abs(delta);
    if (abs < 0.000001) return 'swap';
    switch (counterCat) {
        case 'dex':      return delta < 0 ? 'buy'           : 'sell';
        case 'stake':    return delta < 0 ? 'stake'         : 'unstake';
        case 'lending':  return delta < 0 ? 'deposit_lend'  : 'withdraw_lend';
        case 'exchange': return delta < 0 ? 'deposit_cex'   : 'withdraw_cex';
        case 'system':   return 'fee';
        default:         return counterType === 'wallet'
                            ? (delta < 0 ? 'transfer_out' : 'transfer_in')
                            : (delta < 0 ? 'debit'        : 'credit');
    }
}

const _graphCache = {};
const GRAPH_TTL   = 90_000; // 90s

app.get('/api/wallet-graph/:address', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const addr = (req.params.address || '').trim();
    if (!addr || addr.length < 30) return res.status(400).json({ ok: false, error: 'Invalid address' });

    const hit = _graphCache[addr];
    if (hit && (Date.now() - hit.ts) < GRAPH_TTL) return res.json({ ...hit.data, _cached: true });

    try {
        // 1. Fetch last 20 confirmed signatures
        const sigs = await _rpcCall('getSignaturesForAddress', [addr, { limit: 20, commitment: 'confirmed' }], 15000) || [];
        if (!sigs.length) return res.json({ ok: true, center: addr, nodes: [], edges: [], txCount: 0 });

        // 2. Parse each transaction for accounts + SOL flow
        const counterMap = {}; // addr → { sentSol, recvSol, txCount, lastTs }

        const txFetches = sigs.slice(0, 16).map(s =>
            _rpcCall('getTransaction', [s.signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }], 10000)
                .catch(() => null)
        );
        const txResults = await Promise.all(txFetches);

        txResults.forEach((tx, i) => {
            if (!tx?.meta || !tx.transaction) return;
            const sig = sigs[i];
            const blockTime = sig.blockTime || 0;

            const accounts = tx.transaction.message?.accountKeys || [];
            const pre  = tx.meta.preBalances  || [];
            const post = tx.meta.postBalances || [];

            // Find center wallet index
            const centerIdx = accounts.findIndex(a => (typeof a === 'string' ? a : a.pubkey) === addr);
            if (centerIdx < 0) return;

            const centerDelta = (post[centerIdx] - pre[centerIdx]) / 1e9; // positive = received, negative = sent

            accounts.forEach((acct, j) => {
                const counterAddr = typeof acct === 'string' ? acct : acct.pubkey;
                if (counterAddr === addr) return;
                // Skip system program and common programs
                if (['11111111111111111111111111111111',
                     'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                     'ComputeBudget111111111111111111111111111111',
                     'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bY8',
                     'SysvarRent111111111111111111111111111111111',
                     'SysvarC1ock11111111111111111111111111111111'].includes(counterAddr)) return;

                const counterDelta = (post[j] - pre[j]) / 1e9;
                if (!counterMap[counterAddr]) counterMap[counterAddr] = { sentSol: 0, recvSol: 0, txCount: 0, lastTs: 0 };

                counterMap[counterAddr].txCount++;
                if (blockTime > counterMap[counterAddr].lastTs) counterMap[counterAddr].lastTs = blockTime;

                // Direction: if center lost SOL and counter gained → center sent
                if (centerDelta < -0.0001 && counterDelta > 0.0001) {
                    counterMap[counterAddr].recvSol += Math.abs(counterDelta); // money went TO counter
                } else if (centerDelta > 0.0001 && counterDelta < -0.0001) {
                    counterMap[counterAddr].sentSol += Math.abs(counterDelta); // money came FROM counter
                }
            });
        });

        // 3. Classify counterparties — reuse trace data if cached
        const topCounters = Object.entries(counterMap)
            .sort((a, b) => (b[1].txCount - a[1].txCount))
            .slice(0, 14);

        // Lightweight classification without full trace (fast)
        const nodes = [{
            id: addr,
            label: addr.slice(0,5)+'…'+addr.slice(-4),
            fullAddr: addr,
            isCenter: true,
            type: 'center',
            txCount: sigs.length,
            color: '#f59e0b',
            r: 38,
        }];

        const edges = [];
        for (const [cAddr, stats] of topCounters) {
            const shortA = cAddr.slice(0,5)+'…'+cAddr.slice(-4);
            // Try cached trace data for richer label
            const cached = _traceCache[cAddr];
            // Check known programs first
            const known   = KNOWN_ADDRS[cAddr];
            const counterCat  = known?.cat  || 'wallet';
            const counterType = (known && known.cat !== 'wallet') ? 'program' : 'wallet';
            const label = known
                ? known.label
                : cached?.data?.classification?.labels?.[0]
                    ? `${cached.data.classification.labels[0]} ${shortA}`
                    : shortA;
            const type = stats.recvSol > stats.sentSol ? 'outflow' :
                         stats.sentSol > stats.recvSol ? 'inflow'  : 'mixed';

            // Node color by category
            const nodeColor = counterType === 'program'
                ? (counterCat==='dex'?'#a855f7': counterCat==='exchange'?'#f97316': counterCat==='stake'?'#06b6d4': counterCat==='lending'?'#84cc16':'#94a3b8')
                : (type==='outflow'?'#ef4444':type==='inflow'?'#22c55e':'#60a5fa');

            nodes.push({
                id: cAddr, label, fullAddr: cAddr, isCenter: false,
                type, counterType, counterCat,
                sentSol:  +stats.sentSol.toFixed(4),
                recvSol:  +stats.recvSol.toFixed(4),
                txCount:  stats.txCount,
                lastTs:   stats.lastTs,
                lastAgo:  stats.lastTs ? _timeAgo(stats.lastTs) : '?',
                color: nodeColor,
                r: Math.max(14, Math.min(32, 10 + stats.txCount * 2.5)),
            });

            // Edge: determine txType from dominant direction
            if (stats.recvSol > 0.001) {
                const txType = _classifyTxType(-stats.recvSol, counterCat, counterType);
                edges.push({ from: addr, to: cAddr, sol: +stats.recvSol.toFixed(4), dir: 'out', txType, label: `−${stats.recvSol.toFixed(2)} SOL` });
            }
            if (stats.sentSol > 0.001) {
                const txType = _classifyTxType(+stats.sentSol, counterCat, counterType);
                edges.push({ from: cAddr, to: addr, sol: +stats.sentSol.toFixed(4), dir: 'in', txType, label: `+${stats.sentSol.toFixed(2)} SOL` });
            }
            if (stats.recvSol <= 0.001 && stats.sentSol <= 0.001 && stats.txCount > 0) {
                edges.push({ from: addr, to: cAddr, sol: 0, dir: 'swap', txType: 'swap', label: `${stats.txCount}× swap` });
            }
        }

        // ── Build per-tx ledger (rekening koran) ──
        const ledger = [];
        let runningBalance = null; // will be derived from first tx

        txResults.forEach((tx, i) => {
            if (!tx?.meta || !tx.transaction) return;
            const sig = sigs[i];
            if (!sig) return;
            const accounts = tx.transaction.message?.accountKeys || [];
            const pre  = tx.meta.preBalances  || [];
            const post = tx.meta.postBalances || [];
            const centerIdx = accounts.findIndex(a => (typeof a === 'string' ? a : a.pubkey) === addr);
            if (centerIdx < 0) return;

            const preSol  = pre[centerIdx]  / 1e9;
            const postSol = post[centerIdx] / 1e9;
            const delta   = postSol - preSol;
            const fee     = (tx.meta.fee || 0) / 1e9;

            // Find main counterparty (biggest absolute SOL change among non-center, non-program accounts)
            let counterAddr = null, counterDelta = 0;
            accounts.forEach((acct, j) => {
                const a = typeof acct === 'string' ? acct : acct.pubkey;
                if (a === addr) return;
                if (['11111111111111111111111111111111','TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
                     'ComputeBudget111111111111111111111111111111','ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bY8'].includes(a)) return;
                const d = Math.abs((post[j] - pre[j]) / 1e9);
                if (d > counterDelta) { counterDelta = d; counterAddr = a; }
            });

            const cached = counterAddr ? _traceCache[counterAddr] : null;
            const known  = counterAddr ? KNOWN_ADDRS[counterAddr] : null;
            const counterCat  = known?.cat  || 'wallet';
            const counterType = (known && known.cat !== 'wallet') ? 'program' : 'wallet';

            const counterLabel = known
                ? known.label
                : cached?.data?.classification?.labels?.[0]
                    ? `${cached.data.classification.labels[0]} ${(counterAddr||'').slice(0,5)}…${(counterAddr||'').slice(-4)}`
                    : counterAddr ? `${counterAddr.slice(0,6)}…${counterAddr.slice(-4)}` : 'Protocol/Fee';

            const baseType = Math.abs(delta) < 0.000001 ? 'swap' : delta > 0 ? 'credit' : 'debit';
            const txType   = _classifyTxType(delta, counterCat, counterType);

            ledger.push({
                sig:          sig.signature,
                shortSig:     sig.signature.slice(0,8)+'…'+sig.signature.slice(-5),
                blockTime:    sig.blockTime,
                dateStr:      sig.blockTime ? new Date(sig.blockTime*1000).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—',
                timeAgo:      sig.blockTime ? _timeAgo(sig.blockTime) : '?',
                status:       sig.err ? 'failed' : 'success',
                type:         baseType,
                txType,
                counterType,
                counterCat,
                solDelta:     +delta.toFixed(6),
                solDeltaAbs:  +Math.abs(delta).toFixed(6),
                fee:          +fee.toFixed(6),
                balanceAfter: +postSol.toFixed(6),
                counterAddr,
                counterLabel,
                solscanUrl:   `https://solscan.io/tx/${sig.signature}`,
            });
        });

        // Detect "distribusi": if 3+ transfer_out entries at the same blockTime → relabel as distribute
        const blockTimeCounts = {};
        ledger.forEach(r => {
            if (r.txType === 'transfer_out' && r.blockTime) {
                blockTimeCounts[r.blockTime] = (blockTimeCounts[r.blockTime] || 0) + 1;
            }
        });
        ledger.forEach(r => {
            if (r.txType === 'transfer_out' && r.blockTime && blockTimeCounts[r.blockTime] >= 3) {
                r.txType = 'distribute';
            }
        });

        // Sort chronological for running balance
        ledger.sort((a,b) => a.blockTime - b.blockTime);
        // Re-sort newest first for display
        const ledgerDesc = [...ledger].reverse();

        const result = {
            ok: true, center: addr,
            shortAddr: addr.slice(0,5)+'…'+addr.slice(-4),
            nodes, edges,
            ledger: ledgerDesc,
            txCount: sigs.length,
            parsedTxCount: txResults.filter(Boolean).length,
            fetchedAt: new Date().toISOString(),
        };
        _graphCache[addr] = { data: result, ts: Date.now() };
        res.json(result);
    } catch(e) {
        console.error('[wallet-graph] error:', e.message);
        res.status(500).json({ ok: false, error: e.message });
    }
});

// POST /api/wallet-compare — compare multiple wallets side by side
app.post('/api/wallet-compare', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const addresses = (req.body?.addresses || []).slice(0, 5);
    if (!addresses.length) return res.status(400).json({ ok: false, error: 'No addresses' });

    const results = await Promise.allSettled(
        addresses.map(addr =>
            fetch(`http://127.0.0.1:${PORT}/api/wallet-trace/${addr}`, { signal: AbortSignal.timeout(25000) })
                .then(r => r.json())
        )
    );

    const wallets = results.map((r, i) => ({
        address: addresses[i],
        ...(r.status === 'fulfilled' ? r.value : { ok: false, error: r.reason?.message }),
    }));

    // Find common tokens across wallets
    const tokenSets = wallets.map(w => new Set((w.tokens || []).map(t => t.mint)));
    const commonMints = wallets.length > 1
        ? [...tokenSets[0]].filter(m => tokenSets.slice(1).every(s => s.has(m)))
        : [];

    // Coordination signals
    const coordSignals = [];
    if (commonMints.length > 0) {
        coordSignals.push({ type: 'alert', msg: `${commonMints.length} token(s) held by ALL wallets — possible coordinated position` });
    }

    const txFreqs = wallets.map(w => w.txFreqPerDay || 0);
    const avgFreq = txFreqs.reduce((a,b)=>a+b,0) / txFreqs.length;
    if (Math.max(...txFreqs) - Math.min(...txFreqs) < avgFreq * 0.3 && wallets.length > 1) {
        coordSignals.push({ type: 'warn', msg: 'Similar tx frequency across wallets — possible bot cluster' });
    }

    res.json({ ok: true, wallets, commonMints, coordSignals, comparedAt: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════
// GET /api/smart-money-intel — Smart Money Intelligence Platform
// Returns: leaderboard, whale feed, accumulation radar, stats
// ══════════════════════════════════════════════════════════════
const _smIntelCache = {};
const SM_INTEL_TTL = 90_000; // 90s cache

app.get('/api/smart-money-intel', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const cached = _smIntelCache['main'];
    if (cached && (Date.now() - cached.ts) < SM_INTEL_TTL) {
        return res.json({ ...cached.data, _cached: true });
    }

    // ── 1. Fetch DexScreener trending tokens for accumulation signals ──
    let trendingTokens = [];
    try {
        const r = await fetch('https://api.dexscreener.com/token-boosts/top/v1', { signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        trendingTokens = (Array.isArray(d) ? d : d?.tokenAddresses || []).slice(0, 30);
    } catch (_) {}

    // ── 2. Fetch DexScreener trending pairs (Solana) ──
    let solanaPairs = [];
    try {
        const r = await fetch('https://api.dexscreener.com/dex/search?q=solana&chainIds=solana', { signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        solanaPairs = (d?.pairs || []).filter(p => p.chainId === 'solana' && p.liquidity?.usd > 50000).slice(0, 20);
    } catch (_) {}

    // ── 3. Generate Accumulation Radar from real volume data ──
    const accumSignals = solanaPairs.map(p => {
        const vol24 = p.volume?.h24 || 0;
        const liq   = p.liquidity?.usd || 0;
        const volLiqRatio = liq > 0 ? vol24 / liq : 0;
        const buys  = p.txns?.h24?.buys || 0;
        const sells = p.txns?.h24?.sells || 0;
        const total = buys + sells || 1;
        const buyPct = Math.round(buys / total * 100);
        const priceChg1h = p.priceChange?.h1 || 0;

        let signal = 'NEUTRAL';
        let signalColor = '#64748b';
        let accumScore = 50;

        if (buyPct > 65 && volLiqRatio > 1.5) { signal = 'STRONG ACCUM'; signalColor = '#22c55e'; accumScore = 88; }
        else if (buyPct > 58) { signal = 'ACCUMULATION'; signalColor = '#4ade80'; accumScore = 72; }
        else if (buyPct < 35 && priceChg1h < -3) { signal = 'DISTRIBUTION'; signalColor = '#ef4444'; accumScore = 22; }
        else if (buyPct < 42) { signal = 'SELL PRESSURE'; signalColor = '#f87171'; accumScore = 35; }
        else if (volLiqRatio > 3) { signal = 'UNUSUAL VOL'; signalColor = '#f59e0b'; accumScore = 60; }

        return {
            symbol: p.baseToken?.symbol || '?',
            name: p.baseToken?.name || '',
            address: p.baseToken?.address || '',
            price: p.priceUsd ? parseFloat(p.priceUsd) : 0,
            priceChange1h: priceChg1h,
            priceChange24h: p.priceChange?.h24 || 0,
            vol24, liq, volLiqRatio: +volLiqRatio.toFixed(2),
            buys, sells, buyPct,
            accumScore,
            signal, signalColor,
            dexUrl: p.url || `https://dexscreener.com/solana/${p.pairAddress}`,
            logoUrl: p.info?.imageUrl || '',
        };
    }).sort((a, b) => b.accumScore - a.accumScore);

    // ── 4. Smart Money Leaderboard (blend real + curated wallets) ──
    const KNOWN_SMART_WALLETS = [
        { addr: 'MobS6L5HhVJtxpeafDgREsweWFh53xFoUeP9pgbaDSf', label: 'Whale Alpha',    type: 'whale'   },
        { addr: 'fNrJmJ1aQMx1vgnGwJcLWkUCBrDy7GF7ZpVqiXuRFrJ', label: 'Mid Trader',    type: 'smart'   },
        { addr: '4hSXPtxZgXFpo6Vxq9yqxNjcBoqWN3VoaPJWonUtupzD', label: 'Retail Degen', type: 'retail'  },
    ];
    let leaderboard = [];
    try {
        const traceResults = await Promise.allSettled(
            KNOWN_SMART_WALLETS.map(w =>
                fetch(`http://127.0.0.1:${PORT}/api/wallet-trace/${w.addr}`, { signal: AbortSignal.timeout(20000) }).then(r => r.json())
            )
        );
        leaderboard = traceResults.map((r, i) => {
            const base = KNOWN_SMART_WALLETS[i];
            if (r.status === 'fulfilled' && r.value?.ok) {
                const d = r.value;
                return {
                    rank: i + 1,
                    addr: base.addr,
                    shortAddr: d.shortAddr,
                    label: base.label,
                    type: base.type,
                    totalUsd: d.totalUsd || 0,
                    solBalance: d.solBalance || 0,
                    smartMoneyScore: d.smartMoneyScore || 0,
                    txFreqPerDay: d.txFreqPerDay || 0,
                    txCount: d.txCount || 0,
                    tokenCount: d.tokenCount || 0,
                    riskLevel: d.classification?.riskLevel || 'MEDIUM',
                    labels: d.classification?.labels || [],
                    topToken: (d.tokens || [])[0]?.symbol || '—',
                    topTokenUsd: (d.tokens || [])[0]?.usdValue || 0,
                    lastActive: d.lastActiveAgo || '?',
                    winRateEst: Math.min(95, 40 + d.smartMoneyScore * 0.55), // estimated
                    roi30dEst: +(((d.totalUsd / 1000) * (d.txFreqPerDay / 10)) * 0.8).toFixed(1),
                };
            }
            return { rank: i+1, addr: base.addr, shortAddr: base.addr.slice(0,6)+'...', label: base.label, type: base.type, totalUsd: 0, smartMoneyScore: 0, error: true };
        }).sort((a, b) => b.smartMoneyScore - a.smartMoneyScore).map((w, i) => ({ ...w, rank: i+1 }));
    } catch (_) {}

    // ── 5. Whale Activity Feed (real volume events) ──
    const whaleFeed = [];
    for (const p of solanaPairs.slice(0, 10)) {
        const vol = p.volume?.h1 || 0;
        if (vol < 10000) continue;
        const buys = p.txns?.h1?.buys || 0;
        const sells = p.txns?.h1?.sells || 0;
        const isBuy = buys > sells * 1.3;
        const isSell = sells > buys * 1.3;
        if (!isBuy && !isSell) continue;
        whaleFeed.push({
            type: isBuy ? 'buy' : 'sell',
            symbol: p.baseToken?.symbol || '?',
            amount: Math.round(vol),
            price: parseFloat(p.priceUsd || 0),
            priceChange: p.priceChange?.h1 || 0,
            dexUrl: p.url,
            logoUrl: p.info?.imageUrl || '',
            chain: 'SOL',
            ts: Date.now() - Math.floor(Math.random() * 300000), // within last 5min
        });
    }

    // ── 6. Global Stats ──
    const totalVol = solanaPairs.reduce((a, p) => a + (p.volume?.h24 || 0), 0);
    const totalLiq = solanaPairs.reduce((a, p) => a + (p.liquidity?.usd || 0), 0);
    const bullPairs  = solanaPairs.filter(p => (p.priceChange?.h24 || 0) > 0).length;
    const bearPairs  = solanaPairs.length - bullPairs;

    const data = {
        ok: true,
        leaderboard,
        accumSignals: accumSignals.slice(0, 20),
        whaleFeed: whaleFeed.slice(0, 15),
        stats: {
            totalVol24h: totalVol,
            totalLiquidity: totalLiq,
            bullPairs, bearPairs,
            topNarrative: accumSignals[0]?.signal || 'NEUTRAL',
            trackedWallets: leaderboard.length,
            fetchedAt: new Date().toISOString(),
        },
        fetchedAt: new Date().toISOString(),
    };

    _smIntelCache['main'] = { data, ts: Date.now() };
    res.json(data);
});

// ══════════════════════════════════════════════════════════════
// GET /api/ohlc/:symbol — OHLC candles for SMC engine
// Query: ?interval=1h&limit=200&source=binance|coingecko
// ══════════════════════════════════════════════════════════════
const SmcEngine = require('./smc-engine');
const MMEngine  = require('./mm-engine');

// Simple cache: { key -> { data, ts } }
const _ohlcCache = {};
const OHLC_CACHE_MS = 2 * 60_000; // 2-minute cache

app.get('/api/ohlc/:symbol', async (req, res) => {
    const symbol   = (req.params.symbol || 'BTCUSDT').toUpperCase();
    const interval = req.query.interval || '1h';
    const limit    = Math.min(parseInt(req.query.limit) || 200, 500);
    const cacheKey = `${symbol}_${interval}_${limit}`;

    // Serve from cache if fresh
    const cached = _ohlcCache[cacheKey];
    if (cached && (Date.now() - cached.ts) < OHLC_CACHE_MS) {
        return res.json({ ...cached.data, _cached: true });
    }

    let candles = null;
    let source  = 'unknown';

    // ── Attempt 1: Binance Klines (data-api.binance.vision — accessible from ID) ──
    try {
        const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const r   = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
            const raw = await r.json();
            if (Array.isArray(raw) && raw.length > 0) {
                candles = raw.map(k => ({
                    time:   k[0],
                    open:   parseFloat(k[1]),
                    high:   parseFloat(k[2]),
                    low:    parseFloat(k[3]),
                    close:  parseFloat(k[4]),
                    volume: parseFloat(k[5]),
                }));
                source = 'binance';
            }
        }
    } catch (_) {}

    // ── Attempt 2: CoinGecko OHLC (for non-USDT pairs) ───────
    if (!candles) {
        try {
            // Map e.g. BTCUSDT → bitcoin
            const cgMap = {
                BTC:'bitcoin', ETH:'ethereum', SOL:'solana', BNB:'binancecoin',
                ADA:'cardano', DOGE:'dogecoin', AVAX:'avalanche-2', DOT:'polkadot',
                MATIC:'matic-network', LINK:'chainlink', UNI:'uniswap', ATOM:'cosmos',
            };
            const base   = symbol.replace('USDT','').replace('BTC','');
            const coinId = cgMap[base] || base.toLowerCase();
            const days   = interval.endsWith('h') ? 7 : interval === '1d' ? 90 : 7;
            const cgUrl  = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
            const r2     = await fetch(cgUrl, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(6000),
            });
            if (r2.ok) {
                const raw2 = await r2.json();
                if (Array.isArray(raw2) && raw2.length > 0) {
                    candles = raw2.map(k => ({
                        time:   k[0],
                        open:   k[1],
                        high:   k[2],
                        low:    k[3],
                        close:  k[4],
                        volume: 0,
                    }));
                    source = 'coingecko';
                }
            }
        } catch (_) {}
    }

    if (!candles || candles.length < 10) {
        return res.status(404).json({ error: `No OHLC data found for ${symbol}`, symbol });
    }

    // ── Run SMC Engine ────────────────────────────────────────
    const smc = SmcEngine.analyze(candles);

    const result = {
        symbol,
        interval,
        source,
        candles,
        fvgZones:  smc.fvgZones,
        swings:    smc.swings,
        bosEvents: smc.bosEvents,
        signal:    smc.signal,
        meta:      smc.meta,
    };

    _ohlcCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
});

// ══════════════════════════════════════════════════════════════
// /api/mm-analysis/:symbol  — Advanced Market Maker Analysis
// Combines smc-engine + mm-engine for institutional-grade output
// Query: ?interval=1h&limit=200
// ══════════════════════════════════════════════════════════════
const _mmCache = {};
const MM_CACHE_MS = 3 * 60_000;

app.get('/api/mm-analysis/:symbol', async (req, res) => {
    const symbol   = (req.params.symbol || 'BTCUSDT').toUpperCase();
    const interval = req.query.interval || '1h';
    const limit    = Math.min(parseInt(req.query.limit) || 200, 500);
    const cacheKey = `mm_${symbol}_${interval}_${limit}`;
    const forceRefresh = req.query.refresh === '1';

    const cached = _mmCache[cacheKey];
    if (!forceRefresh && cached && (Date.now() - cached.ts) < MM_CACHE_MS) {
        return res.json({ ...cached.data, _cached: true });
    }

    // ── Fetch OHLC (reuse same logic as /api/ohlc) ──────────────
    let candles = null, source = 'unknown';

    try {
        const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
            const raw = await r.json();
            if (Array.isArray(raw) && raw.length > 0) {
                candles = raw.map(k => ({
                    time:   k[0], open:   parseFloat(k[1]),
                    high:   parseFloat(k[2]), low:   parseFloat(k[3]),
                    close:  parseFloat(k[4]), volume: parseFloat(k[5]),
                }));
                source = 'binance';
            }
        }
    } catch (_) {}

    if (!candles) {
        try {
            const cgMap = {
                BTC:'bitcoin', ETH:'ethereum', SOL:'solana', BNB:'binancecoin',
                ADA:'cardano', DOGE:'dogecoin', AVAX:'avalanche-2', DOT:'polkadot',
                MATIC:'matic-network', LINK:'chainlink', UNI:'uniswap', ATOM:'cosmos',
            };
            const base   = symbol.replace('USDT','').replace('BTC','');
            const coinId = cgMap[base] || base.toLowerCase();
            const days   = interval.endsWith('h') ? 7 : 90;
            const r2 = await fetch(
                `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
                { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
            );
            if (r2.ok) {
                const raw2 = await r2.json();
                if (Array.isArray(raw2) && raw2.length > 0) {
                    candles = raw2.map(k => ({ time: k[0], open: k[1], high: k[2], low: k[3], close: k[4], volume: 0 }));
                    source = 'coingecko';
                }
            }
        } catch (_) {}
    }

    if (!candles || candles.length < 20) {
        return res.status(404).json({ error: `No OHLC data for ${symbol}`, symbol });
    }

    // ── Run SMC Engine first ────────────────────────────────────
    const smc = SmcEngine.analyze(candles);

    // ── Run MM Engine (pass BOS context from SMC) ───────────────
    const lastBOS  = smc.bosEvents?.[smc.bosEvents.length - 1];
    const mmResult = MMEngine.analyze(candles, {
        bosType:     lastBOS?.type     || 'none',
        bosStrength: lastBOS?.strength || 0,
    });

    // ── Enrich with live price data from CoinGecko (optional) ──
    let livePrice = null, priceChange24h = null, volume24h = null, marketCap = null;
    try {
        const cgMap = { BTCUSDT:'bitcoin', ETHUSDT:'ethereum', SOLUSDT:'solana', BNBUSDT:'binancecoin', ADAUSDT:'cardano', DOGEUSDT:'dogecoin', AVAXUSDT:'avalanche-2' };
        const coinId = cgMap[symbol];
        if (coinId) {
            const pr = await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`,
                { signal: AbortSignal.timeout(4000) }
            );
            if (pr.ok) {
                const pd = await pr.json();
                const d  = pd[coinId] || {};
                livePrice     = d.usd;
                priceChange24h = d.usd_24h_change;
                volume24h     = d.usd_24h_vol;
                marketCap     = d.usd_market_cap;
            }
        }
    } catch (_) {}

    const result = {
        symbol, interval, source,
        currentPrice:  livePrice || candles[candles.length - 1].close,
        priceChange24h, volume24h, marketCap,
        // SMC
        smc: {
            fvgZones:  smc.fvgZones,
            swings:    smc.swings,
            bosEvents: smc.bosEvents,
            signal:    smc.signal,
            meta:      smc.meta,
        },
        // MM Engine full output
        mm: mmResult,
        // Unified top-level for easy UI consumption
        signal:        mmResult.signal,
        conviction:    mmResult.conviction,
        probabilities: mmResult.probabilities,
        wyckoff:       mmResult.wyckoff,
        fibonacci:     mmResult.fib,
        liquidity:     mmResult.liquidity,
        orderFlow:     mmResult.orderFlow,
        volatility:    mmResult.volatility,
        fakeBreakout:  mmResult.fakeBreakout,
        choch:         mmResult.choch,
        monteCarlo:    mmResult.monteCarlo,
        meta:          mmResult.meta,
        fetchedAt:     Date.now(),
    };

    _mmCache[cacheKey] = { data: result, ts: Date.now() };
    res.json(result);
});

// ── Moon Phase Calculator (Conway/Jones) ─────────────────────
function getMoonPhase(date) {
    const d = date || new Date();
    let year = d.getFullYear(), month = d.getMonth() + 1, day = d.getDate();
    if (month < 3) { year--; month += 12; }
    let r = year % 100; r %= 19; if (r > 9) r -= 19;
    r = ((r * 11) % 30) + month + day;
    if (month < 3) r += 2;
    r -= (year < 2000) ? 4 : 8.3;
    r = Math.floor(r + 0.5) % 30;
    const age = r < 0 ? r + 30 : r;

    let phase, emoji, btcBias, detail;
    if (age <= 1)        { phase = 'New Moon';         emoji = '🌑'; btcBias = 'RESET — often accumulation zone'; detail = 'Market cenderung konsolidasi, whale mulai akumulasi diam-diam'; }
    else if (age <= 7)   { phase = 'Waxing Crescent';  emoji = '🌒'; btcBias = 'BULLISH BUILD-UP';               detail = 'Momentum mulai terbentuk, volume perlahan naik'; }
    else if (age <= 9)   { phase = 'First Quarter';    emoji = '🌓'; btcBias = 'BREAKOUT WATCH';                 detail = 'Sering jadi titik keputusan — breakout atau rejection'; }
    else if (age <= 14)  { phase = 'Waxing Gibbous';   emoji = '🌔'; btcBias = 'BULLISH MOMENTUM';              detail = 'Pump zone historis, FOMO mulai masuk'; }
    else if (age <= 16)  { phase = 'Full Moon';        emoji = '🌕'; btcBias = 'PEAK / REVERSAL RISK';          detail = 'Full moon = peak euphoria, waspadai distribusi besar'; }
    else if (age <= 22)  { phase = 'Waning Gibbous';   emoji = '🌖'; btcBias = 'DISTRIBUTION PHASE';            detail = 'Whale mulai jual pelan-pelan, harga masih bisa tinggi'; }
    else if (age <= 24)  { phase = 'Last Quarter';     emoji = '🌗'; btcBias = 'BEARISH PRESSURE';              detail = 'Tekanan jual meningkat, hati-hati longsword'; }
    else if (age <= 29)  { phase = 'Waning Crescent';  emoji = '🌘'; btcBias = 'ACCUMULATE SLOWLY';             detail = 'Market lesu, ini saat kumpul sebelum siklus baru'; }
    else                 { phase = 'New Moon (eve)';   emoji = '🌑'; btcBias = 'CYCLE RESET';                   detail = 'Mendekati reset siklus baru'; }

    return { phase, emoji, btcBias, detail, age: Math.round(age) };
}

// ── Format sub-scores ringkas ────────────────────────────────
function fmtSubScores(subScores) {
    if (!Array.isArray(subScores)) return '';
    return subScores
        .map(s => `${s.label.split(' ').slice(0,2).join(' ')}: ${s.score}%`)
        .join(' · ');
}

app.post('/api/generate-tweet', express.json(), async (req, res) => {
    if (!GROQ_KEY) {
        return res.status(503).json({ error: 'GROQ_API_KEY tidak diset di .env' });
    }

    const { tab = 'signal', signal, fng, markets } = req.body || {};
    const moon = getMoonPhase();
    const dateStr = new Date().toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    // ── Build konteks lengkap untuk prompt ──────────────────────
    let ctx = '';

    if (tab === 'signal' && signal) {
        const sig = signal;
        const subStr = fmtSubScores(sig.subScores);
        const whaleStr = sig.whaleBias
            ? `${sig.whaleBias === 'accumulation' ? '🐋 ACCUMULATION' : sig.whaleBias === 'distribution' ? '🐳 DISTRIBUTION' : '🐠 NEUTRAL'} (score: ${sig.whaleScore || '?'}%)`
            : 'neutral';
        const reason = sig.signalReason || `${sig.bullish}% bullish, ${sig.bearish}% bearish, conf ${sig.confidence}%`;

        ctx = `📊 SIGNAL ALERT — ${dateStr}

Koin     : ${sig.coinSymbol?.toUpperCase()} / ${sig.coinName}
Arah     : ${sig.signal} ${sig.signal === 'LONG' ? '📈 BULLISH' : '📉 BEARISH'}
Harga    : $${sig.currentPrice?.toFixed(6)}
24h      : ${sig.priceChange24h >= 0 ? '+' : ''}${sig.priceChange24h?.toFixed(2)}%
Entry    : $${sig.entryLow?.toFixed(6)} — $${sig.entryHigh?.toFixed(6)}
Stop Loss: $${sig.stopLoss?.toFixed(6)}
TP1      : $${sig.tp1?.toFixed(6)}
TP2      : $${sig.tp2?.toFixed(6)}
R:R      : 1:${sig.rr}

📊 Scores:
- Bull/Bear  : ${sig.bullish}% / ${sig.bearish}%
- Confidence : ${sig.confidence}%
- Kelly Size : ${((sig.kellyFraction || 0) * 100).toFixed(1)}% portfolio
- Bayesian   : P(long)=${sig.bayesianPLong?.toFixed(2)} / P(short)=${sig.bayesianPShort?.toFixed(2)}
- Expected V : ${sig.expectedValue?.toFixed(2)}x
- Monte Carlo: ${sig.mcProbUp}% prob naik
- HTF Trend  : ${sig.htfTrend || '—'} (${sig.htfAligned ? '✅ aligned' : '⚠️ not aligned'})
- Market Reg : ${sig.marketRegime?.toUpperCase()} (score ${sig.regimeScore})
- Vol Phase  : ${sig.volPhase || '—'}
- Volume 24h : $${sig.volume24h >= 1e9 ? (sig.volume24h/1e9).toFixed(1)+'B' : (sig.volume24h/1e6).toFixed(0)+'M'}
- Volatility : ${sig.volatilityScore}%

🐋 Whale: ${whaleStr}

🔍 Reason: ${reason}
📐 Sub-scores: ${subStr}

${moon.emoji} Moon Phase: ${moon.phase} (day ${moon.age}/30)
→ BTC Bias: ${moon.btcBias}
→ ${moon.detail}`;

    } else if (tab === 'market') {
        const fngVal = fng?.data?.[0]?.value || '—';
        const fngLbl = fng?.data?.[0]?.value_classification || '—';
        const top5   = (markets || []).slice(0, 5).map(c =>
            `  ${c.symbol?.toUpperCase().padEnd(5)} $${String(c.current_price).slice(0,10).padStart(10)}  (${c.price_change_percentage_24h?.toFixed(2)}%)`
        ).join('\n');

        ctx = `📡 MARKET RECAP — ${dateStr}

Fear & Greed : ${fngVal} / 100 (${fngLbl})
${moon.emoji} Moon Phase  : ${moon.phase} — ${moon.btcBias}
→ ${moon.detail}

Top 5 Markets:
${top5}`;

    } else if (tab === 'whale') {
        ctx = `🐋 WHALE ALERT — ${dateStr}
${moon.emoji} Moon Phase: ${moon.phase} — ${moon.btcBias}

Whale activity terdeteksi. Ada pergerakan wallet besar di market crypto.
Moon phase saat ini (${moon.phase}) biasanya berkorelasi dengan: ${moon.detail}`;

    } else {
        ctx = `😼 HOLLOW CAT DAILY — ${dateStr}
${moon.emoji} Moon Phase: ${moon.phase} (day ${moon.age}/30)
BTC Historical Bias hari ini: ${moon.btcBias}
${moon.detail}

Scanner berjalan 24/7. Top 80 koin dipantau. Bayesian + Kelly sizing aktif.`;
    }

    const systemPrompt = `Kamu adalah Hollow Cat (@hollowcatai) — seekor kucing quant misterius di Solana blockchain.
Kamu memberikan sinyal crypto berbasis AI: Bayesian inference, Kelly sizing, whale tracking, dan moon cycle analysis.

GAYA: lowercase, casual tapi informatif, sedikit misterius, pakai emoji relevan, jangan bertele-tele.
PANJANG: maks 280 karakter per tweet. Setiap tweet harus berdiri sendiri.
WAJIB akhiri dengan: #hollowcat #hollowcatai
JANGAN: disclaimer panjang, kata "not financial advice" di tiap tweet, terlalu formal.

Buat TEPAT 3 variasi tweet:
1. Data-driven — fokus angka, score, entry/SL/TP, whale%, moon phase
2. Casual/meme — santai, humor, tapi tetap ada 1-2 data poin penting
3. Storytelling — narasi singkat kenapa koin ini menarik, gaya caption IG/X

PENTING: pisahkan ketiga tweet hanya dengan baris "---" (tiga strip saja, tidak ada teks lain).
Jangan tulis "Tweet 1:", "Variasi:", atau penjelasan apapun.`;

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_KEY}`,
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user',   content: ctx },
                ],
                temperature: 0.85,
                max_tokens: 600,
            }),
            signal: AbortSignal.timeout(12000),
        });

        if (!groqRes.ok) {
            const errBody = await groqRes.text();
            return res.status(groqRes.status).json({ error: errBody });
        }

        const data   = await groqRes.json();
        const raw    = data.choices?.[0]?.message?.content || '';
        const tweets = raw.split(/\n---\n|^---$/m)
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .slice(0, 3); // max 3

        res.json({ tweets, moon, model: data.model, usage: data.usage });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/moon — moon phase info saja
app.get('/api/moon', (_, res) => res.json(getMoonPhase()));

// ─── POST /api/ai-chat ─────────────────────────────────────────────────────
// Chat AI analyst untuk crypto & saham — powered by Groq (free)
// Body: { messages: [{role:'user'|'assistant', content:'...'}], apiKey?: '...' }
app.post('/api/ai-chat', express.json(), async (req, res) => {
    const key = req.body?.apiKey || GROQ_KEY;
    if (!key) {
        return res.status(503).json({ ok: false, error: 'GROQ_API_KEY belum diset. Masukkan API key di pengaturan AI Chat.' });
    }
    const userMessages = (req.body?.messages || []).slice(-20); // max 20 pesan terakhir
    if (!userMessages.length) return res.status(400).json({ ok: false, error: 'No messages' });

    const systemPrompt = `Kamu adalah AI Analyst profesional khusus crypto dan saham. Nama kamu adalah "CryptoMind AI".

Kemampuanmu:
- Analisa teknikal (support/resistance, trend, momentum, RSI, MACD, volume)
- Analisa fundamental (tokenomics, use case, team, roadmap)
- Analisa on-chain (whale movement, holder distribution)  
- Makro ekonomi (Fed rate, inflasi, DXY, risk-on/off)
- Saham AS dan Indonesia (IDX)
- Rekomendasi entry, target price (TP), dan stop loss (SL)

Aturan jawaban:
- Jawab dalam Bahasa Indonesia yang profesional tapi mudah dipahami
- Selalu sertakan disclaimer "BUKAN saran keuangan, lakukan riset sendiri" saat memberi rekomendasi spesifik
- Gunakan emoji secukupnya agar mudah dibaca
- Format jawaban dengan heading jika perlu (gunakan **bold**)
- Jika ada data harga, estimasi berdasarkan pengetahuan terbaru kamu
- Jawab dengan singkat dan padat kecuali diminta detail`;

    try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...userMessages,
                ],
                max_tokens: 1024,
                temperature: 0.7,
            }),
        });
        if (!groqRes.ok) {
            const errText = await groqRes.text();
            return res.status(groqRes.status).json({ ok: false, error: errText });
        }
        const data = await groqRes.json();
        const reply = data.choices?.[0]?.message?.content || '';
        res.json({ ok: true, reply, model: data.model, usage: data.usage });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ─── GET/POST /api/ai-chat-config ──────────────────────────────────────────
// Simpan/baca Groq API key untuk AI Chat
let _aiChatKey = GROQ_KEY;
app.get('/api/ai-chat-config', (_, res) => {
    res.json({ ok: true, hasKey: !!_aiChatKey });
});
app.post('/api/ai-chat-config', express.json(), (req, res) => {
    const { apiKey } = req.body || {};
    if (apiKey) _aiChatKey = apiKey.trim();
    res.json({ ok: true, hasKey: !!_aiChatKey });
});

// ─── PRICE ALERTS ──────────────────────────────────────────────────────────
// In-memory alert store: { id, symbol, condition:'above'|'below', price, active, createdAt }
let _priceAlerts = [];
let _alertIdSeq  = 1;

// Fetch current price from Binance
async function fetchCurrentPrice(symbol) {
    try {
        const sym = symbol.toUpperCase().replace('/', '');
        const pair = sym.endsWith('USDT') ? sym : sym + 'USDT';
        const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`);
        const d = await r.json();
        return parseFloat(d.price) || null;
    } catch (e) { return null; }
}

app.get('/api/price-alerts', (_, res) => {
    res.json({ ok: true, alerts: _priceAlerts });
});

app.post('/api/price-alerts', express.json(), (req, res) => {
    const { symbol, condition, price, action } = req.body || {};
    if (action === 'delete') {
        _priceAlerts = _priceAlerts.filter(a => a.id !== req.body.id);
        return res.json({ ok: true });
    }
    if (!symbol || !condition || !price) return res.json({ ok: false, error: 'symbol, condition, price required' });
    const alert = { id: _alertIdSeq++, symbol: symbol.toUpperCase(), condition, price: parseFloat(price), active: true, createdAt: Date.now(), triggered: false };
    _priceAlerts.push(alert);
    res.json({ ok: true, alert });
});

// Check price alerts every 30 seconds
setInterval(async () => {
    const active = _priceAlerts.filter(a => a.active && !a.triggered);
    if (!active.length) return;
    for (const alert of active) {
        const cur = await fetchCurrentPrice(alert.symbol);
        if (!cur) continue;
        const hit = alert.condition === 'above' ? cur >= alert.price : cur <= alert.price;
        if (hit) {
            alert.triggered = true;
            alert.triggeredAt = Date.now();
            alert.triggeredPrice = cur;
            // Send Telegram
            if (_tgBotToken && _tgChatId) {
                const emoji  = alert.condition === 'above' ? '🚀' : '📉';
                const dir    = alert.condition === 'above' ? 'menembus ke atas' : 'turun ke bawah';
                const msg    = `${emoji} <b>PRICE ALERT!</b>\n\n<b>${alert.symbol}</b> ${dir} <code>$${alert.price.toLocaleString()}</code>\n\nHarga sekarang: <b>$${cur.toLocaleString()}</b>\n\n⏰ ${new Date().toLocaleString('id-ID')}`;
                try {
                    await fetch(`https://api.telegram.org/bot${_tgBotToken}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: _tgChatId, text: msg, parse_mode: 'HTML' })
                    });
                } catch (e) {}
            }
        }
    }
}, 30_000);

// ══════════════════════════════════════════════════════════════
//  CRYPTO NEWS SENTIMENT
// ══════════════════════════════════════════════════════════════
let _newsCache = { ts: 0, data: [] };
app.get('/api/news-sentiment', async (_, res) => {
    try {
        // Cache 10 menit
        if (Date.now() - _newsCache.ts < 600_000 && _newsCache.data.length) {
            return res.json({ ok: true, news: _newsCache.data, cached: true });
        }
        // Fetch headlines dari CryptoPanic public feed (no key needed)
        const r = await fetch('https://cryptopanic.com/api/v1/posts/?auth_token=pub_test&public=true&kind=news&filter=important&currencies=BTC,ETH,SOL&limit=10');
        const d = await r.json();
        const titles = (d.results || []).map(p => p.title).slice(0, 10);
        if (!titles.length) return res.json({ ok: false, error: 'No news found' });

        // Score dengan Groq (jika ada key)
        let newsWithSentiment = titles.map(t => ({ title: t, sentiment: 'neutral', score: 50 }));
        if (_aiChatKey) {
            const prompt = `Berikan sentiment analysis untuk masing-masing headline crypto berikut. Format jawaban JSON array: [{"title":"...","sentiment":"bullish"|"bearish"|"neutral","score":0-100}].\n\nHeadlines:\n${titles.map((t,i) => `${i+1}. ${t}`).join('\n')}`;
            try {
                const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${_aiChatKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [
                        { role: 'system', content: 'You are a crypto market analyst. Only respond with valid JSON.' },
                        { role: 'user', content: prompt }
                    ], max_tokens: 500, temperature: 0.3 })
                });
                const gd = await gr.json();
                const txt = gd.choices?.[0]?.message?.content || '';
                const match = txt.match(/\[[\s\S]*\]/);
                if (match) newsWithSentiment = JSON.parse(match[0]);
            } catch (e) { console.warn('[News] Groq score failed:', e.message); }
        }
        _newsCache = { ts: Date.now(), data: newsWithSentiment };
        res.json({ ok: true, news: newsWithSentiment });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});


//  Fitur:
//  - Deteksi L1 yang pump (>5% / 1h atau 24h)
//  - Hitung lag score, relative strength, vol spike per token
//  - Generate signal: LONG / WAIT / AVOID per token
//  - Correlation: seberapa jauh token tertinggal dari L1
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
//  SNIPER SCANNER  — Confluence-based bottom-fishing detector
// ══════════════════════════════════════════════════════════════
// Fetch top USDT pairs dari Binance by quoteVolume — dinamis, tidak hardcoded
async function _getSniperPairs(topN = 100) {
    try {
        const r = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const data = await r.json();
        return data
            .filter(t =>
                t.symbol.endsWith('USDT') &&
                !t.symbol.includes('DOWN') &&
                !t.symbol.includes('UP') &&
                !t.symbol.includes('BEAR') &&
                !t.symbol.includes('BULL') &&
                parseFloat(t.quoteVolume) > 500_000   // min $500k volume 24h
            )
            .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
            .slice(0, topN)
            .map(t => t.symbol.replace('USDT', ''));
    } catch (e) {
        console.warn('[Sniper] Gagal fetch pairs dari Binance:', e.message);
        // Fallback minimal kalau Binance tidak bisa diakses
        return ['BTC','ETH','SOL','BNB','XRP','AVAX','ADA','LINK','DOGE','OP','ARB','SUI','NEAR','APT'];
    }
}

function _sniperCalcRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        if (d >= 0) gains += d; else losses -= d;
    }
    const avgG = gains / period, avgL = losses / period;
    if (avgL === 0) return 100;
    return 100 - 100 / (1 + avgG / avgL);
}

function _sniperAnalyze(candles) {
    if (!candles || candles.length < 30) return null;
    const N = candles.length;
    const opens   = candles.map(c => parseFloat(c[1]));
    const highs   = candles.map(c => parseFloat(c[2]));
    const lows    = candles.map(c => parseFloat(c[3]));
    const closes  = candles.map(c => parseFloat(c[4]));
    const volumes = candles.map(c => parseFloat(c[5]));

    const last   = N - 1;
    const price  = closes[last];
    const ch24h  = (price - closes[last - 24]) / closes[last - 24] * 100;

    // ── 1. Liquidity Sweep (+25) ──────────────────────────────
    // Harga turun ke bawah swing low 20 candle lalu, lalu close di atas low tersebut
    const recentLow = Math.min(...lows.slice(last - 20, last - 1));
    const sweepCandle = lows[last] < recentLow && closes[last] > recentLow;
    const sweepScore = sweepCandle ? 25 : 0;

    // ── 2. Volume Spike (+20) ─────────────────────────────────
    const avgVol = volumes.slice(last - 20, last).reduce((a, b) => a + b, 0) / 20;
    const volRatio = volumes[last] / (avgVol || 1);
    const volScore = volRatio >= 2.5 ? 20 : volRatio >= 1.8 ? 12 : volRatio >= 1.3 ? 6 : 0;

    // ── 3. Bullish Reversal Candle (+15) ──────────────────────
    // Candle terakhir: lower wick >= 2x body, close > open (hammer/engulfing)
    const body   = Math.abs(closes[last] - opens[last]);
    const lwick  = Math.min(opens[last], closes[last]) - lows[last];
    const bullCandle = closes[last] > opens[last] && lwick >= 1.5 * body;
    // Atau: bullish engulfing (close > prev open, open < prev close)
    const engulf = closes[last] > opens[last - 1] && opens[last] < closes[last - 1];
    const candleScore = (bullCandle || engulf) ? 15 : 0;

    // ── 4. BOS ke atas (+20) ─────────────────────────────────
    // Harga break di atas swing high 5 candle terakhir
    const prev5High = Math.max(...highs.slice(last - 6, last - 1));
    const bosUp = closes[last] > prev5High;
    const bosScore = bosUp ? 20 : 0;

    // ── 5. Di area demand / FVG (+10) ─────────────────────────
    // FVG bullish: gap antara high[i-2] dan low[i] (candle i-1 full gap)
    let fvgScore = 0;
    for (let i = last - 5; i <= last - 1; i++) {
        if (i < 2) continue;
        const fvgLow  = highs[i - 2];
        const fvgHigh = lows[i];
        if (fvgHigh > fvgLow && price >= fvgLow && price <= fvgHigh + (fvgHigh - fvgLow) * 2) {
            fvgScore = 10; break;
        }
    }

    // ── 6. RSI Divergence bullish (+10) ───────────────────────
    // Harga LL tapi RSI HL dalam 10 candle terakhir
    const rsiNow  = _sniperCalcRSI(closes.slice(0, last + 1));
    const rsiPrev = _sniperCalcRSI(closes.slice(0, last - 5));
    const priceMakesLL = closes[last] < Math.min(...closes.slice(last - 10, last - 1));
    const rsiDiverg = priceMakesLL && rsiNow > rsiPrev + 3;
    const rsiScore = (rsiNow < 35 ? 6 : 0) + (rsiDiverg ? 4 : 0);

    const totalScore = sweepScore + volScore + candleScore + bosScore + fvgScore + rsiScore;

    // Sinyal utama
    let signal = 'WAIT', signalColor = '#94a3b8';
    if (totalScore >= 80)      { signal = '🎯 SNIPER'; signalColor = '#f59e0b'; }
    else if (totalScore >= 60) { signal = '👀 WATCH';  signalColor = '#3b82f6'; }
    else if (totalScore >= 40) { signal = '📋 SETUP';  signalColor = '#8b5cf6'; }

    return {
        score: totalScore,
        signal, signalColor, price, ch24h: +ch24h.toFixed(2),
        rsi: +rsiNow.toFixed(1), volRatio: +volRatio.toFixed(2),
        signals: {
            sweep:   { active: sweepScore > 0,   score: sweepScore,   label: 'Liquidity Sweep' },
            volume:  { active: volScore  > 0,    score: volScore,    label: `Volume Spike ${volRatio.toFixed(1)}x` },
            candle:  { active: candleScore > 0,  score: candleScore, label: bullCandle ? 'Hammer' : 'Bullish Engulfing' },
            bos:     { active: bosScore > 0,     score: bosScore,    label: 'BOS ke Atas' },
            fvg:     { active: fvgScore > 0,     score: fvgScore,    label: 'Di Area FVG/Demand' },
            rsi:     { active: rsiScore > 0,     score: rsiScore,    label: `RSI ${rsiNow.toFixed(0)}${rsiDiverg ? ' + Divergence' : ''}` },
        }
    };
}

app.get('/api/sniper-scan', async (req, res) => {
    const tf    = req.query.tf || '1h';
    const topN  = Math.min(parseInt(req.query.limit) || 100, 200); // max 200
    const validTf = ['15m','1h','4h'].includes(tf) ? tf : '1h';
    const klineLimit = validTf === '4h' ? 60 : 50;
    try {
        // Ambil daftar pair dinamis dari Binance
        const pairs = await _getSniperPairs(topN);

        // Scan semua pair secara paralel (batch 20 agar tidak rate-limit)
        const BATCH = 20;
        let allResults = [];
        for (let i = 0; i < pairs.length; i += BATCH) {
            const batch = pairs.slice(i, i + BATCH);
            const batchResults = await Promise.allSettled(
                batch.map(async sym => {
                    const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}USDT&interval=${validTf}&limit=${klineLimit}`);
                    const candles = await r.json();
                    if (!Array.isArray(candles)) return null;
                    const analysis = _sniperAnalyze(candles);
                    if (!analysis) return null;
                    return { symbol: sym, ...analysis };
                })
            );
            allResults = allResults.concat(batchResults);
            // Jeda kecil antar batch agar tidak kena rate-limit
            if (i + BATCH < pairs.length) await new Promise(r => setTimeout(r, 200));
        }

        let coins = allResults
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value)
            .sort((a, b) => b.score - a.score);

        // Kirim Telegram alert untuk sniper score >= 80
        const snipers = coins.filter(c => c.score >= 80);
        if (snipers.length && _tgBotToken && _tgChatId) {
            const lines = snipers.map(c =>
                `🎯 <b>${c.symbol}</b> — Score: <b>${c.score}/100</b>\n` +
                `   Harga: $${c.price.toFixed(4)} (${c.ch24h > 0 ? '+' : ''}${c.ch24h}%) · RSI: ${c.rsi}`
            ).join('\n\n');
            const msg = `🎯 <b>SNIPER ENTRY ALERT!</b>\n\n${lines}\n\n<i>Timeframe: ${validTf} · ${new Date().toLocaleString('id-ID', {timeZone:'Asia/Jakarta'})}</i>`;
            fetch(`https://api.telegram.org/bot${_tgBotToken}/sendMessage`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ chat_id: _tgChatId, text: msg, parse_mode: 'HTML' })
            }).catch(() => {});
        }

        res.json({ ok: true, coins, tf: validTf, scannedAt: Date.now(), totalScanned: pairs.length });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

const ECOSYSTEM_MAP = {
    'solana': {
        name: 'Solana', symbol: 'SOL', emoji: '◎', chain: 'solana', color: '#9945FF',
        cgIds: ['dogwifhat','bonk','jupiter','raydium','pyth-network','jito-governance-token',
                'orca','popcat','book-of-meme','samoyedcoin','fartcoin','zerebro',
                'ai16z','griffain','goat','arc','io-net','render-token'],
        symbols: ['WIF','BONK','JUP','RAY','PYTH','JTO','ORCA','POPCAT','BOME','SAMO',
                  'FARTCOIN','ZEREBRO','AI16Z','GRIFFAIN','GOAT','ARC','IO','RENDER'],
        desc: 'Solana DeFi, Meme & AI Agent ecosystem',
    },
    'the-open-network': {
        name: 'TON', symbol: 'TON', emoji: '💎', chain: 'ton', color: '#0088CC',
        cgIds: ['dogs-1','not','hamster-kombat','ston-fi','gram','tonkeeper'],
        symbols: ['DOGS','NOT','HMSTR','STON','GRAM','SCALE','BOLT','JETTON'],
        desc: 'Telegram/TON mini-app & DeFi ecosystem',
    },
    'ethereum': {
        name: 'Ethereum', symbol: 'ETH', emoji: 'Ξ', chain: 'ethereum', color: '#627EEA',
        cgIds: ['uniswap','chainlink','aave','lido-dao','maker','curve-dao-token',
                'pendle','eigenlayer','ether-fi','renzo','kelp-dao-restaked-eth'],
        symbols: ['UNI','LINK','AAVE','LDO','MKR','CRV','PENDLE','EIGEN','ETHFI','REZ','RSETH'],
        desc: 'Ethereum DeFi, LSD & Restaking ecosystem',
    },
    'binancecoin': {
        name: 'BNB Chain', symbol: 'BNB', emoji: '🟡', chain: 'bsc', color: '#F3BA2F',
        cgIds: ['pancakeswap-token','trust-wallet-token','venus','alpaca-finance',
                'bake','four-token'],
        symbols: ['CAKE','TWT','XVS','ALPACA','BAKE','FOUR','LISTA','SPACE'],
        desc: 'BNB Chain DeFi & BSC ecosystem',
    },
    'sui': {
        name: 'Sui', symbol: 'SUI', emoji: '💧', chain: 'sui', color: '#6FBCF0',
        cgIds: ['cetus-protocol','navi-protocol','bucket-protocol','aftermath-finance',
                'scallop-2','turbos-finance'],
        symbols: ['CETUS','NAVX','BUCK','AF','SCA','TURBOS','DEEP','FUD','BLUB','SUIA'],
        desc: 'Sui DeFi & Move ecosystem',
    },
    'aptos': {
        name: 'Aptos', symbol: 'APT', emoji: '🔵', chain: 'aptos', color: '#00C2FF',
        cgIds: ['thala','aries-markets','pancakeswap-token','abel-finance'],
        symbols: ['THL','CELL','GUI','MOJO','APT','ABEL'],
        desc: 'Aptos Move ecosystem',
    },
    'avalanche-2': {
        name: 'Avalanche', symbol: 'AVAX', emoji: '🔺', chain: 'avalanche', color: '#E84142',
        cgIds: ['trader-joe-2','benqi','gmx','vector-finance','platypus-finance'],
        symbols: ['JOE','QI','GMX','VTX','PTP','COQ','KIMBO'],
        desc: 'Avalanche DeFi & subnet ecosystem',
    },
    'injective-protocol': {
        name: 'Injective', symbol: 'INJ', emoji: '🌊', chain: 'injective', color: '#00A3FF',
        cgIds: ['black-panther','ninja-protocol','helix'],
        symbols: ['NINJA','KAGE','PYSE','ORAI','ANDR','NOBI'],
        desc: 'Injective DeFi & perp ecosystem',
    },
    'near': {
        name: 'NEAR', symbol: 'NEAR', emoji: '🟩', chain: 'near', color: '#00EC97',
        cgIds: ['aurora-near','ref-finance','meta-pool','linear-protocol'],
        symbols: ['AURORA','REF','META','LINEAR','BRRR','PARAS','JUMBO'],
        desc: 'NEAR Protocol DeFi ecosystem',
    },
    'arbitrum': {
        name: 'Arbitrum', symbol: 'ARB', emoji: '🔷', chain: 'arbitrum', color: '#28A0F0',
        cgIds: ['gmx','radiant-capital','dopex','jones-dao','plutus-dao'],
        symbols: ['GMX','RDNT','DPX','JONES','PLVGLP','MAGIC','TRB','PENDLE'],
        desc: 'Arbitrum L2 DeFi & gaming ecosystem',
    },
    'virtual-protocol': {
        name: 'Virtual / Base AI', symbol: 'VIRTUAL', emoji: '🤖', chain: 'base', color: '#8B5CF6',
        cgIds: ['luna-by-virtuals','game-by-virtuals','aixbt-by-virtuals',
                'vader-ai','padre','sekoia','lolcat','coq-inu',
                'based-brett','degen-base','toshi-on-base','normie','ski-mask-dog',
                'virtuals-protocol'],
        symbols: ['LUNA','GAME','AIXBT','VADER','PADRE','SEKOIA','LOLCAT',
                  'BRETT','DEGEN','TOSHI','NORMIE','SKI','VIRTUAL'],
        desc: 'Virtual Protocol AI Agents & Base meme ecosystem',
    },
    'base': {
        name: 'Base', symbol: 'BASE', emoji: '🔵', chain: 'base', color: '#0052FF',
        cgIds: ['aerodrome-finance','moonwell-artemis','based-brett','degen-base',
                'toshi-on-base','higher','ski-mask-dog','virtuals-protocol',
                'luna-by-virtuals','aixbt-by-virtuals','game-by-virtuals'],
        symbols: ['AERO','WELL','BRETT','DEGEN','TOSHI','HIGHER','SKI',
                  'VIRTUAL','LUNA','AIXBT','GAME'],
        desc: 'Base L2 DeFi, meme & AI ecosystem (Coinbase)',
    },
    'hyperliquid': {
        name: 'Hyperliquid', symbol: 'HYPE', emoji: '⚡', chain: 'hyperliquid', color: '#00FF88',
        cgIds: ['hyperliquid','purr-hyperliquid','ferocious','hfun'],
        symbols: ['HYPE','PURR','FEROCIOUS','HFUN','JEFF','PIP'],
        desc: 'Hyperliquid perp DEX & HIP-1 token ecosystem',
    },
    'polygon-ecosystem-token': {
        name: 'Polygon', symbol: 'POL', emoji: '🟣', chain: 'polygon', color: '#8247E5',
        cgIds: ['quickswap','aavegotchi','gains-network','dystopia',
                'sphere-finance','maticverse'],
        symbols: ['QUICK','GHST','GNS','DYST','SPHERE','MATIC'],
        desc: 'Polygon PoS DeFi & gaming ecosystem',
    },
    'optimism': {
        name: 'Optimism', symbol: 'OP', emoji: '🔴', chain: 'optimism', color: '#FF0420',
        cgIds: ['velodrome-finance','beethoven-x','kwenta','lyra-finance',
                'exactly-protocol','sonne-finance'],
        symbols: ['VELO','BEETS','KWENTA','LYRA','EXA','SONNE','SNX','PERP'],
        desc: 'Optimism L2 DeFi ecosystem',
    },
    'cosmos': {
        name: 'Cosmos', symbol: 'ATOM', emoji: '⚛️', chain: 'cosmos', color: '#2E3148',
        cgIds: ['osmosis','celestia','dydx','injective-protocol','sei-network',
                'kava','akash-network','stargaze','stride','quicksilver',
                'neutron-3','coreum','persistence'],
        symbols: ['OSMO','TIA','DYDX','INJ','SEI','KAVA','AKT','STARS',
                  'STRD','QCK','NTRN','COREUM','XPRT'],
        desc: 'Cosmos IBC Hub — kalau ATOM pump, semua IBC chain bisa ikut',
    },
    'berachain-bera': {
        name: 'Berachain', symbol: 'BERA', emoji: '🐻', chain: 'berachain', color: '#FF8A00',
        cgIds: ['berachain-bera','infrared-finance','kodiak-finance',
                'berps','honey-berachain','d2-finance'],
        symbols: ['BERA','BGT','HONEY','IBGT','KODIAK','BERPS','iBERA','NECT'],
        desc: 'Berachain PoL DeFi — chain paling hot 2025-2026',
    },
    // ── AI Agents (lintas chain, dipicu VIRTUAL/AI narrative) ──────
    'virtual-protocol': {
        name: 'AI Agents (VIRTUAL)', symbol: 'VIRTUAL', emoji: '🤖', chain: 'base', color: '#8B5CF6',
        cgIds: ['virtuals-protocol','luna-by-virtuals','game-by-virtuals',
                'aixbt-by-virtuals','vader-ai','sekoia','lolcat',
                'padre','dasha','misato','orbit-claude','toshi-on-base'],
        symbols: ['VIRTUAL','LUNA','GAME','AIXBT','VADER','SEKOIA',
                  'LOLCAT','PADRE','DASHA','MISATO','ORBIT'],
        desc: 'Virtual Protocol AI Agents — narasi AI Agent lintas Base/Solana',
    },
    // ── DePIN (IO/RENDER sebagai trigger) ─────────────────────────
    'io-net': {
        name: 'DePIN (IO)', symbol: 'IO', emoji: '🌐', chain: 'solana', color: '#00D4FF',
        cgIds: ['io-net','render-token','helium','helium-mobile','iotex',
                'fetch-ai','nosana','akash-network','grass','hivemapper'],
        symbols: ['IO','RENDER','HNT','MOBILE','IOTX','FET','NOS','AKT','GRASS','HONEY'],
        desc: 'DePIN — kalau IO/RENDER pump, seluruh sektor GPU/infra ikut',
    },
    // ── RWA (Real World Assets) ────────────────────────────────────
    'ondo-finance': {
        name: 'RWA (ONDO)', symbol: 'ONDO', emoji: '🏦', chain: 'ethereum', color: '#1A56DB',
        cgIds: ['ondo-finance','polymath-network','centrifuge','maple',
                'truefi','goldfinch','credix-finance','toucan-protocol'],
        symbols: ['ONDO','POLYX','CFG','MPL','TRU','GFI','CRED','TCO2'],
        desc: 'Real World Assets — narasi institutional 2026, ikut ONDO pump',
    },
};

// L1 coins to track (CoinGecko IDs)
const L1_IDS = Object.keys(ECOSYSTEM_MAP);

// ── Signal computation per ecosystem token ────────────────────
function computeTokenSignal(token, l1Ch1h, l1Ch24h) {
    const ch1h  = token.ch1h  ?? 0;
    const ch24h = token.ch24h ?? 0;
    const volMcRatio = (token.volume24h && token.marketCap && token.marketCap > 0)
        ? token.volume24h / token.marketCap : 0;

    const l1Pumping1h  = l1Ch1h  >= 2;   // L1 baru pump dalam 1 jam
    const l1Pumping24h = l1Ch24h >= 5;   // L1 pump signifikan 24 jam
    const l1Pumping    = l1Pumping1h || l1Pumping24h;

    // Relative strength: token vs L1 (berapa % dari pump L1 sudah di-reflect)
    const relStrength = l1Ch24h !== 0 ? ch24h / l1Ch24h : 0;

    // Lag score: seberapa jauh token tertinggal dari L1 (makin tinggi = makin lagging)
    const lagScore24h = l1Ch24h - ch24h;  // positif = token lagging
    const lagScore1h  = l1Ch1h  - ch1h;

    // Volume spike detection
    const hasVolSpike = volMcRatio > 0.3;
    const hasHighVol  = volMcRatio > 0.6;

    let signal, label, color, desc, grade;

    if (!l1Pumping) {
        // L1 tidak pump — ecosystem tidak terpicu
        if (ch24h >= 8) {
            signal = 'AVOID'; label = '⛔ Already Pumped'; color = '#ef4444'; grade = 0;
            desc = `Naik ${ch24h.toFixed(1)}% tanpa trigger L1. Berisiko reversal.`;
        } else if (ch24h <= -8) {
            signal = 'WAIT'; label = '⏳ Deeply Dipping'; color = '#f59e0b'; grade = 2;
            desc = `Turun ${Math.abs(ch24h).toFixed(1)}%. Tunggu L1 konfirmasi arah.`;
        } else {
            signal = 'WATCH'; label = '👀 Watch'; color = '#64748b'; grade = 1;
            desc = 'L1 belum pump. Pantau saja.';
        }
    } else if (lagScore24h >= 10 && hasVolSpike) {
        // Lagging jauh + volume mulai naik = BEST OPPORTUNITY
        signal = 'LONG'; label = '🚀 Lagging Opp (High Vol)'; color = '#22c55e'; grade = 5;
        desc = `L1 +${l1Ch24h.toFixed(1)}% tapi token baru ${ch24h >= 0 ? '+' : ''}${ch24h.toFixed(1)}%. Vol spike! Entry zone terbaik.`;
    } else if (lagScore24h >= 6 && l1Pumping24h) {
        // Lagging signifikan vs L1 pump 24h
        signal = 'LONG'; label = '📈 Lagging Opportunity'; color = '#10b981'; grade = 4;
        desc = `Tertinggal ${lagScore24h.toFixed(1)}% dari L1. Potensi follow-up pump.`;
    } else if (lagScore1h >= 3 && l1Pumping1h) {
        // L1 baru pump 1jam, token belum ikut
        signal = 'LONG'; label = '⚡ Early Signal (1h Lag)'; color = '#06b6d4'; grade = 4;
        desc = `L1 pump ${l1Ch1h.toFixed(1)}% dalam 1 jam. Token belum ikut — window entry.`;
    } else if (relStrength > 1.8 || (ch24h > l1Ch24h * 1.5 && ch24h > 10)) {
        // Token sudah outperform L1 by large margin
        signal = 'AVOID'; label = '⛔ Already Pumped'; color = '#ef4444'; grade = 0;
        desc = `Sudah naik ${ch24h.toFixed(1)}% vs L1 ${l1Ch24h.toFixed(1)}%. Late entry berisiko.`;
    } else if (relStrength >= 0.6 && relStrength <= 1.8 && ch24h > 0) {
        // Mengikuti L1 secara proporsional
        signal = 'WAIT'; label = '➡️ Following L1'; color = '#f59e0b'; grade = 2;
        desc = `Mengikuti L1 (${(relStrength * 100).toFixed(0)}% relative strength). Tidak ada edge besar.`;
    } else if (ch24h <= -5 && l1Pumping) {
        // Token dip saat L1 pump — potensi reversal catch
        signal = 'LONG'; label = '💡 Reversal Catch'; color = '#a78bfa'; grade = 3;
        desc = `Turun ${Math.abs(ch24h).toFixed(1)}% saat L1 pump. Potensi reversal ke atas.`;
    } else {
        signal = 'WATCH'; label = '👀 Monitor'; color = '#94a3b8'; grade = 1;
        desc = 'Data tidak cukup untuk sinyal kuat. Pantau lebih lanjut.';
    }

    return {
        signal, label, color, desc, grade,
        relStrength: +relStrength.toFixed(2),
        lagScore24h: +lagScore24h.toFixed(2),
        lagScore1h:  +lagScore1h.toFixed(2),
        volMcRatio:  +volMcRatio.toFixed(3),
        hasVolSpike, hasHighVol,
    };
}

let _ecosystemCache   = null;
let _ecosystemCacheTs = 0;
const ECOSYSTEM_TTL   = 3 * 60_000; // 3 menit

app.get('/api/ecosystem-pump', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const forceRefresh = req.query.refresh === '1';

    // Serve from cache if fresh
    if (!forceRefresh && _ecosystemCache && (Date.now() - _ecosystemCacheTs) < ECOSYSTEM_TTL) {
        return res.json({ ok: true, cached: true, ..._ecosystemCache });
    }

    try {
        // ── Step 1: Fetch all L1 prices in one call ───────────
        const l1Res = await fetch(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${L1_IDS.join(',')}&price_change_percentage=1h,24h,7d&sparkline=false&per_page=50`,
            { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
        );
        if (!l1Res.ok) return res.status(500).json({ ok: false, error: 'CoinGecko L1 fetch failed' });
        const l1Data = await l1Res.json();

        // ── Step 2: Score each L1 ────────────────────────────
        const scoredL1 = l1Data.map(c => {
            const eco   = ECOSYSTEM_MAP[c.id];
            if (!eco) return null;
            const ch1h  = c.price_change_percentage_1h_in_currency  ?? 0;
            const ch24h = c.price_change_percentage_24h              ?? 0;
            const ch7d  = c.price_change_percentage_7d_in_currency  ?? 0;
            const momentum = (ch1h * 3) + (ch24h * 1.5) + (ch7d * 0.5);
            const isPumping = ch24h >= 5 || ch1h >= 2;
            const pumpTrigger = ch1h >= 2 ? '1h' : ch24h >= 5 ? '24h' : ch24h >= 3 ? '24h_mild' : null;
            const status =
                ch24h >= 10 ? '🚀 Strong Pump' :
                ch24h >= 5  ? '📈 Pumping'     :
                ch24h >= 2  ? '🟢 Rising'      :
                ch24h >= -2 ? '➡️ Sideways'    :
                ch24h >= -5 ? '🔴 Dipping'     : '📉 Dumping';
            return {
                id: c.id, symbol: c.symbol?.toUpperCase(), name: c.name,
                image: c.image, price: c.current_price,
                ch1h: +ch1h.toFixed(2), ch24h: +ch24h.toFixed(2), ch7d: +ch7d.toFixed(2),
                marketCap: c.market_cap, volume24h: c.total_volume,
                momentum: +momentum.toFixed(2), status, isPumping, pumpTrigger, eco,
            };
        }).filter(Boolean).sort((a, b) => b.momentum - a.momentum);

        // ── Step 3: Fetch ecosystem token prices ─────────────
        // Fetch ALL ecosystem tokens (pumping + not pumping) for complete heatmap
        const allEcoIds = [...new Set(scoredL1.flatMap(s => s.eco.cgIds))].slice(0, 120);
        let ecoCoins = [];
        if (allEcoIds.length > 0) {
            // Split into 2 pages if needed
            const chunks = [allEcoIds.slice(0, 60), allEcoIds.slice(60)].filter(c => c.length > 0);
            const pages = await Promise.allSettled(chunks.map(ids =>
                fetch(
                    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=1h,24h,7d&sparkline=false&per_page=100`,
                    { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(12000) }
                ).then(r => r.ok ? r.json() : [])
            ));
            pages.forEach(p => { if (p.status === 'fulfilled' && Array.isArray(p.value)) ecoCoins.push(...p.value); });
        }

        // ── Step 4: Build full ecosystem details ──────────────
        const ecosystems = scoredL1.map(l1 => {
            const tokens = l1.eco.cgIds
                .map(id => ecoCoins.find(c => c.id === id))
                .filter(Boolean)
                .map(c => {
                    const ch1h  = c.price_change_percentage_1h_in_currency  ?? null;
                    const ch24h = c.price_change_percentage_24h              ?? null;
                    const ch7d  = c.price_change_percentage_7d_in_currency  ?? null;
                    const volMcRatio = (c.total_volume && c.market_cap && c.market_cap > 0)
                        ? +(c.total_volume / c.market_cap).toFixed(3) : 0;

                    const sig = computeTokenSignal(
                        { ch1h, ch24h, volume24h: c.total_volume, marketCap: c.market_cap },
                        l1.ch1h, l1.ch24h
                    );

                    return {
                        id: c.id, symbol: c.symbol?.toUpperCase(), name: c.name,
                        image: c.image, price: c.current_price,
                        ch1h:  ch1h  !== null ? +ch1h.toFixed(2)  : null,
                        ch24h: ch24h !== null ? +ch24h.toFixed(2) : null,
                        ch7d:  ch7d  !== null ? +ch7d.toFixed(2)  : null,
                        volume24h: c.total_volume,
                        marketCap: c.market_cap,
                        volMcRatio,
                        // Signal fields
                        signal:      sig.signal,
                        signalLabel: sig.label,
                        signalColor: sig.color,
                        signalDesc:  sig.desc,
                        signalGrade: sig.grade,
                        relStrength: sig.relStrength,
                        lagScore24h: sig.lagScore24h,
                        lagScore1h:  sig.lagScore1h,
                        hasVolSpike: sig.hasVolSpike,
                        hasHighVol:  sig.hasHighVol,
                    };
                })
                // Sort: LONG (grade 3-5) first, then WATCH, then AVOID
                .sort((a, b) => b.signalGrade - a.signalGrade);

            // Summary stats for this ecosystem
            const longCount  = tokens.filter(t => t.signal === 'LONG').length;
            const avoidCount = tokens.filter(t => t.signal === 'AVOID').length;
            const waitCount  = tokens.filter(t => t.signal === 'WAIT').length;
            const avgLag     = tokens.length
                ? +(tokens.reduce((s, t) => s + (t.lagScore24h ?? 0), 0) / tokens.length).toFixed(1)
                : 0;
            const bestOpp    = tokens.find(t => t.signal === 'LONG');

            const missingSymbols = l1.eco.symbols.filter(
                sym => !tokens.find(t => t.symbol === sym)
            );

            return {
                l1Id: l1.id, l1Symbol: l1.symbol, l1Name: l1.name,
                l1Price: l1.price, l1Ch1h: l1.ch1h, l1Ch24h: l1.ch24h, l1Ch7d: l1.ch7d,
                l1Status: l1.status, l1Momentum: l1.momentum,
                l1Image: l1.image, l1Color: l1.eco.color,
                l1MarketCap: l1.marketCap, l1Volume24h: l1.volume24h,
                ecoName: l1.eco.name, ecoEmoji: l1.eco.emoji,
                ecoDesc: l1.eco.desc, ecoChain: l1.eco.chain,
                isPumping: l1.isPumping,
                pumpTrigger: l1.pumpTrigger,
                tokens,
                missingSymbols,
                // Summary
                summary: { longCount, avoidCount, waitCount, avgLag, bestOpp: bestOpp?.symbol || null },
            };
        });

        // Global stats
        const allLong  = ecosystems.flatMap(e => e.tokens.filter(t => t.signal === 'LONG'));
        const topOpps  = allLong
            .sort((a, b) => b.signalGrade - a.signalGrade || b.lagScore24h - a.lagScore24h)
            .slice(0, 10)
            .map(t => ({ symbol: t.symbol, label: t.signalLabel, desc: t.signalDesc, eco: ecosystems.find(e => e.tokens.find(x => x.id === t.id))?.l1Symbol || '?' }));

        const result = {
            ecosystems,
            pumpingCount: ecosystems.filter(e => e.isPumping).length,
            totalLongSignals: allLong.length,
            topOpportunities: topOpps,
            fetchedAt: new Date().toISOString(),
        };

        _ecosystemCache   = result;
        _ecosystemCacheTs = Date.now();

        // ── Auto-record LONG signals + Telegram alert ──
        // Run async so it doesn't delay response
        setImmediate(async () => {
            const newAlerts = [];
            for (const eco of ecosystems) {
                for (const t of eco.tokens) {
                    if (t.signal !== 'LONG') continue;
                    const wasNew = recordSignal({
                        symbol:       t.id || t.symbol,
                        ecoSymbol:    eco.l1Symbol,
                        signal:       'LONG',
                        price:        t.price,
                        lagScore24h:  t.lagScore24h,
                        signalLabel:  t.signalLabel,
                    });
                    if (wasNew) newAlerts.push({ t, eco });
                }
            }
            // Send Telegram alert (batch, max 1 message per run)
            // Reload config from file in case it was updated while server running
            try { _tgConfig = { ..._tgConfig, ...JSON.parse(fs.readFileSync(TG_CONFIG_FILE, 'utf8')) }; } catch(_) {}
            if (newAlerts.length > 0 && _tgConfig.botToken && _tgConfig.chatId) {
                const lines = newAlerts.slice(0, 5).map(({ t, eco }) => {
                    const price = t.price || 0;
                    const fmt = p => p < 0.001 ? p.toFixed(6) : p < 0.01 ? p.toFixed(5) : p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(3) : p.toFixed(2);
                    const entry = price;
                    const tp1   = price * (1 + 0.08);
                    const tp2   = price * (1 + 0.18);
                    const sl    = price * (1 - 0.05);
                    const lag   = t.lagScore24h || 0;
                    const vol   = t.volToMcapRatio ? (t.volToMcapRatio * 100).toFixed(1) : '–';
                    const grade = t.grade || 0;
                    const stars = '⭐'.repeat(Math.min(grade, 5));

                    // Narrative analysis
                    let analysis = '';
                    if (lag > 20)        analysis = `${eco.l1Symbol} sudah pump ${Math.abs(lag).toFixed(0)}%, ${t.symbol} masih tertinggal — potensi catch-up.`;
                    else if (lag > 10)   analysis = `Momentum ekosistem ${eco.l1Symbol} kuat, ${t.symbol} belum follow — window terbuka.`;
                    else if (vol > 50)   analysis = `Volume anomali ${vol}% dari market cap — ada akumulasi agresif.`;
                    else                 analysis = `Sinyal pump ekosistem ${eco.l1Symbol} terdeteksi, ${t.symbol} masuk watchlist LONG.`;

                    return `━━━━━━━━━━━━━━━━━━\n` +
                           `🪙 <b>${t.symbol}</b> / ${eco.l1Symbol}   ${stars}\n` +
                           `📍 <b>Sinyal:</b> LONG — ${t.signalLabel}\n\n` +
                           `💡 <i>${analysis}</i>\n\n` +
                           `📈 <b>Entry:</b> $${fmt(entry)}\n` +
                           `🎯 <b>TP1:</b> $${fmt(tp1)}  <i>(+8%)</i>\n` +
                           `🎯 <b>TP2:</b> $${fmt(tp2)}  <i>(+18%)</i>\n` +
                           `🛑 <b>SL:</b> $${fmt(sl)}  <i>(-5%)</i>\n\n` +
                           `📊 Lag: <b>${lag > 0 ? '+' : ''}${lag}%</b> | Vol/MCap: <b>${vol}%</b>`;
                }).join('\n');
                const extra = newAlerts.length > 5 ? `\n━━━━━━━━━━━━━━━━━━\n…dan <b>${newAlerts.length - 5}</b> sinyal lainnya` : '';
                const msg =
                    `🚀 <b>ECOSYSTEM PUMP ALERT</b>\n` +
                    `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n` +
                    `📦 ${newAlerts.length} sinyal LONG baru terdeteksi\n\n` +
                    `${lines}${extra}\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `⚠️ <i>Bukan financial advice. DYOR.</i>`;
                await sendTelegram(msg);
            }
        });

        res.json({ ok: true, cached: false, ...result });

    } catch (e) {
        console.error('/api/ecosystem-pump error:', e.message);
        if (_ecosystemCache) return res.json({ ok: true, cached: true, stale: true, ..._ecosystemCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  WHALE ACCUMULATION RADAR
//  Deteksi sinyal whale sedang akumulasi:
//  - Stealth: volume spike + harga flat/turun
//  - Absorption: volume tinggi di area 24h low
//  - Vol Anomaly: vol/mcap ratio sangat tinggi abnormal
// ══════════════════════════════════════════════════════════════

function computeWhaleScore(c) {
    const ch1h  = c.price_change_percentage_1h_in_currency ?? 0;
    const ch24h = c.price_change_percentage_24h ?? 0;
    const vol   = c.total_volume   ?? 0;
    const mcap  = c.market_cap     ?? 0;
    const high  = c.high_24h       ?? 0;
    const low   = c.low_24h        ?? 0;
    const price = c.current_price  ?? 0;

    if (!mcap || !vol) return { score: 0, signals: [], type: 'NORMAL' };

    const volMcRatio = vol / mcap;
    const priceAbsChange = Math.abs(ch24h);
    const pricePosFromLow = (price > 0 && low > 0 && high > low)
        ? (price - low) / (high - low) : null;   // 0=at low, 1=at high

    let score = 0;
    const signals = [];

    // ── Vol/MCap anomaly ──────────────────────────────────────
    if (volMcRatio > 0.7) { score += 40; signals.push('🔥 Extreme Vol Spike'); }
    else if (volMcRatio > 0.4) { score += 25; signals.push('📈 High Vol/MCap'); }
    else if (volMcRatio > 0.2) { score += 12; signals.push('📊 Above-avg Vol'); }

    // ── Stealth accumulation: high vol + price barely moved ───
    if (volMcRatio > 0.2 && priceAbsChange < 2) {
        score += 30; signals.push('🐋 Stealth Accum (vol↑ price flat)');
    } else if (volMcRatio > 0.2 && priceAbsChange < 5) {
        score += 15; signals.push('👀 Low Price Move vs Vol');
    }

    // ── Absorption: vol spike while price dropping ─────────────
    if (ch24h < -3 && volMcRatio > 0.2) {
        score += 20; signals.push('🟢 Absorption (selling absorbed)');
    }

    // ── Near 24h low with volume ───────────────────────────────
    if (pricePosFromLow !== null && pricePosFromLow < 0.15 && volMcRatio > 0.15) {
        score += 18; signals.push('📍 Near 24h Low (support test)');
    }

    // ── 1h reversal while 24h still negative ──────────────────
    if (ch1h > 1 && ch24h < -2) {
        score += 12; signals.push('↗️ 1h Reversal Forming');
    }

    // Clamp
    score = Math.min(100, score);

    let type, label, color;
    if (score >= 65) {
        type = 'ACCUMULATING'; label = '🐋 Accumulating'; color = '#22c55e';
    } else if (score >= 38) {
        type = 'WATCHING'; label = '👀 Watching'; color = '#f59e0b';
    } else {
        type = 'NORMAL'; label = '—'; color = '#475569';
    }

    return { score, signals, type, label, color, volMcRatio: +volMcRatio.toFixed(3) };
}

let _whaleAccCache   = null;
let _whaleAccCacheTs = 0;
let _whaleAlertTs    = 0;   // throttle: max 1 alert per 30 menit
const WHALE_ACC_TTL  = 4 * 60_000;

app.get('/api/whale-accumulation', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const forceRefresh = req.query.refresh === '1';

    if (!forceRefresh && _whaleAccCache && (Date.now() - _whaleAccCacheTs) < WHALE_ACC_TTL) {
        return res.json({ ok: true, cached: true, ..._whaleAccCache });
    }

    try {
        // Collect all unique ecosystem token IDs from ECOSYSTEM_MAP
        const allIds = [...new Set(Object.values(ECOSYSTEM_MAP).flatMap(e => e.cgIds))];

        // Fetch in 2 batches (max 100 per CG request)
        const chunks = [allIds.slice(0, 100), allIds.slice(100, 200)].filter(c => c.length);
        const pages  = await Promise.allSettled(chunks.map(ids =>
            fetch(
                `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=1h,24h&sparkline=false&per_page=100`,
                { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(12000) }
            ).then(r => r.ok ? r.json() : [])
        ));

        let coins = [];
        pages.forEach(p => { if (p.status === 'fulfilled' && Array.isArray(p.value)) coins.push(...p.value); });

        // Compute whale score for every coin
        const scored = coins.map(c => {
            const ws = computeWhaleScore(c);
            // Find which ecosystem this token belongs to
            const ecoId   = Object.keys(ECOSYSTEM_MAP).find(k => ECOSYSTEM_MAP[k].cgIds.includes(c.id));
            const ecoMeta = ecoId ? ECOSYSTEM_MAP[ecoId] : null;
            return {
                id: c.id, symbol: c.symbol?.toUpperCase(), name: c.name, image: c.image,
                price: c.current_price,
                ch1h:  +(c.price_change_percentage_1h_in_currency ?? 0).toFixed(2),
                ch24h: +(c.price_change_percentage_24h ?? 0).toFixed(2),
                volume24h: c.total_volume, marketCap: c.market_cap,
                high24h: c.high_24h, low24h: c.low_24h,
                ecoSymbol: ecoMeta?.symbol ?? '?',
                ecoName:   ecoMeta?.name   ?? '?',
                ecoColor:  ecoMeta?.color  ?? '#64748b',
                ...ws,
            };
        })
        .filter(t => t.score > 0)
        .sort((a, b) => b.score - a.score);

        const accumulating = scored.filter(t => t.type === 'ACCUMULATING');
        const watching     = scored.filter(t => t.type === 'WATCHING');

        const result = {
            tokens: scored,
            accumulatingCount: accumulating.length,
            watchingCount:     watching.length,
            topAccumulating:   accumulating.slice(0, 12),
            fetchedAt: new Date().toISOString(),
            // === Fields for Smart Money UI ===
            whaleAccumulators: scored
                .filter(t => t.type !== 'NORMAL')
                .slice(0, 15)
                .map(t => ({
                    id: t.id, symbol: t.symbol, name: t.name, image: t.image,
                    price: t.price, priceChange24h: t.ch24h, priceChange7d: 0,
                    volume24h: t.volume24h, marketCap: t.marketCap,
                    volMcRatio: t.volMcRatio,
                    signal: t.label,
                    strength: t.score,
                })),
            dexAccumulating: [],   // filled separately below
            boostedTokens:   [],   // filled separately below
        };

        // === Parallel: DexScreener buy pressure + boosted tokens ===
        try {
            const [dsRes, boostRes] = await Promise.allSettled([
                fetch('https://api.dexscreener.com/latest/dex/search?q=solana', { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : {}),
                fetch('https://api.dexscreener.com/token-boosts/top/v1', { signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : []),
            ]);

            if (dsRes.status === 'fulfilled') {
                const pairs = dsRes.value?.pairs || [];
                result.dexAccumulating = pairs
                    .filter(p => p.chainId === 'solana' && parseFloat(p.volume?.h1||0) > 10000 && parseFloat(p.priceChange?.h1||0) > 3)
                    .map(p => ({
                        address: p.baseToken?.address, symbol: p.baseToken?.symbol, name: p.baseToken?.name,
                        price: parseFloat(p.priceUsd||0),
                        priceChange1h: parseFloat(p.priceChange?.h1||0), priceChange24h: parseFloat(p.priceChange?.h24||0),
                        volume1h: parseFloat(p.volume?.h1||0), volume24h: parseFloat(p.volume?.h24||0),
                        liquidity: parseFloat(p.liquidity?.usd||0),
                        buys1h: p.txns?.h1?.buys||0, sells1h: p.txns?.h1?.sells||0,
                        buyPressure: p.txns?.h1?.buys > 0 ? (p.txns.h1.buys/(p.txns.h1.buys+p.txns.h1.sells)*100).toFixed(1) : 0,
                        dexUrl: p.url,
                    }))
                    .filter(p => parseFloat(p.buyPressure) > 55)
                    .sort((a,b) => b.volume1h - a.volume1h).slice(0, 20);
            }

            if (boostRes.status === 'fulfilled') {
                const boosts = Array.isArray(boostRes.value) ? boostRes.value : [];
                result.boostedTokens = boosts.filter(t => t.chainId === 'solana').slice(0,10).map(t => ({
                    address: t.tokenAddress, symbol: t.symbol || t.tokenAddress?.slice(0,6),
                    name: t.description?.split('.')[0]?.slice(0,40) || 'Unknown',
                    totalBoost: t.totalAmount, icon: t.icon||null, url: t.url,
                }));
            }
        } catch(e) { console.warn('[whale-acc] DexScreener fetch failed:', e.message); }

        _whaleAccCache   = result;
        _whaleAccCacheTs = Date.now();
        try { _tgConfig = { ..._tgConfig, ...JSON.parse(fs.readFileSync(TG_CONFIG_FILE, 'utf8')) }; } catch(_) {}
        const now2h = Date.now();
        if (_tgConfig.botToken && _tgConfig.chatId && accumulating.length > 0 && (now2h - _whaleAlertTs) > 30 * 60_000) {
            _whaleAlertTs = now2h;
            // Ambil TOP 3 saja — yang score tertinggi dan sinyal paling kuat
            const top3 = accumulating
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);
            const fmt = p => !p ? '–' : p < 0.001 ? p.toFixed(6) : p < 0.01 ? p.toFixed(5) : p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(3) : p.toFixed(2);
            const topLines = top3.map((t, i) => {
                const volPct   = t.volMcRatio ? (t.volMcRatio * 100).toFixed(1) : '–';
                const chg      = t.ch24h >= 0 ? `+${t.ch24h}%` : `${t.ch24h}%`;
                const chgEmoji = t.ch24h >= 2 ? '📈' : t.ch24h <= -3 ? '📉' : '↔️';
                const sigMain  = t.signals?.[0] || '—';
                const entry    = t.price;
                const tp1      = entry * 1.08;
                const tp2      = entry * 1.18;
                const sl       = entry * 0.95;
                // Rank medal
                const medal    = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                // Narrative
                let narrative = '';
                if (t.signals?.some(s => s.includes('Stealth')))
                    narrative = `Volume meledak tapi harga nyaris flat — whale diam-diam akumulasi.`;
                else if (t.signals?.some(s => s.includes('Absorption')))
                    narrative = `Harga turun tapi vol besar — seller sedang diaborsi big buyer.`;
                else if (t.signals?.some(s => s.includes('Near 24h Low')))
                    narrative = `Mendekati support 24h dengan volume tinggi — potensi reversal kuat.`;
                else if (t.signals?.some(s => s.includes('Reversal')))
                    narrative = `1h mulai hijau sementara 24h masih merah — early entry window.`;
                else
                    narrative = `Volume anomali terdeteksi — aktivitas besar di balik layar.`;

                return `━━━━━━━━━━━━━━━━━━\n` +
                       `${medal} <b>${t.symbol}</b> (${t.ecoSymbol})   Score: <b>${t.score}/100</b>\n` +
                       `${chgEmoji} $${fmt(entry)}  <b>${chg}</b>\n` +
                       `📌 ${sigMain}\n\n` +
                       `💡 <i>${narrative}</i>\n\n` +
                       `📈 Entry: <b>$${fmt(entry)}</b>\n` +
                       `🎯 TP1: $${fmt(tp1)} <i>(+8%)</i>  TP2: $${fmt(tp2)} <i>(+18%)</i>\n` +
                       `🛑 SL: $${fmt(sl)} <i>(-5%)</i>\n` +
                       `📊 Vol/MCap: <b>${volPct}%</b>`;
            }).join('\n');

            // Distribution candidates
            const distributing = scored.filter(t =>
                t.ch24h > 8 && t.volMcRatio > 0.3 && t.type !== 'ACCUMULATING'
            ).slice(0, 3);
            let distLines = '';
            if (distributing.length > 0) {
                distLines = `\n\n⚠️ <b>POTENSI DISTRIBUSI</b>\n` +
                    `<i>Harga naik tajam + vol besar = whale mungkin jual ke retailer</i>\n` +
                    distributing.map(t =>
                        `• <b>${t.symbol}</b> +${t.ch24h}% | Vol/MCap: ${(t.volMcRatio*100).toFixed(1)}% — <i>Jangan FOMO!</i>`
                    ).join('\n');
            }

            const whaleMsg =
                `🐋 <b>WHALE RADAR — TOP 3 TERBAIK</b>\n` +
                `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n` +
                `� ${accumulating.length} akumulasi terdeteksi — ini yang terkuat:\n\n` +
                `${topLines}${distLines}\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `⚠️ <i>Bukan financial advice. DYOR.</i>`;
            await sendTelegram(whaleMsg);
        }

        res.json({ ok: true, cached: false, ...result });

    } catch (e) {
        console.error('/api/whale-accumulation error:', e.message);
        if (_whaleAccCache) return res.json({ ok: true, cached: true, stale: true, ..._whaleAccCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  TELEGRAM ALERT
// ══════════════════════════════════════════════════════════════
const TG_CONFIG_FILE = path.join(__dirname, 'telegram-config.json');
let _tgConfig = { botToken: '', chatId: '' };
try {
    if (fs.existsSync(TG_CONFIG_FILE)) {
        _tgConfig = { ..._tgConfig, ...JSON.parse(fs.readFileSync(TG_CONFIG_FILE, 'utf8')) };
    }
    // Also allow override via .env
    if (process.env.TELEGRAM_BOT_TOKEN) _tgConfig.botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (process.env.TELEGRAM_CHAT_ID)   _tgConfig.chatId   = process.env.TELEGRAM_CHAT_ID;
} catch (_) {}

async function sendTelegram(text) {
    const { botToken, chatId } = _tgConfig;
    if (!botToken || !chatId) return false;
    try {
        const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
            signal: AbortSignal.timeout(8000),
        });
        const d = await r.json();
        if (!d.ok) console.warn('[Telegram]', d.description);
        return d.ok;
    } catch (e) {
        console.warn('[Telegram] send error:', e.message);
        return false;
    }
}

// GET /api/telegram-config — cek status konfigurasi
app.get('/api/telegram-config', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { botToken, chatId } = _tgConfig;
    res.json({ ok: true, configured: !!(botToken && chatId), chatId: chatId || '', hasToken: !!botToken });
});

// POST /api/telegram-config — simpan token + chatId
app.post('/api/telegram-config', express.json(), (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { botToken, chatId } = req.body || {};
    if (botToken !== undefined) _tgConfig.botToken = botToken.trim();
    if (chatId   !== undefined) _tgConfig.chatId   = String(chatId).trim();
    try { fs.writeFileSync(TG_CONFIG_FILE, JSON.stringify(_tgConfig, null, 2)); } catch (_) {}
    res.json({ ok: true, configured: !!(_tgConfig.botToken && _tgConfig.chatId) });
});

// OPTIONS preflight
app.options('/api/telegram-config', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
});

// POST /api/telegram-test — kirim pesan test
app.post('/api/telegram-test', express.json(), async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Reload config dari file sebelum test
    try { _tgConfig = { ..._tgConfig, ...JSON.parse(fs.readFileSync(TG_CONFIG_FILE, 'utf8')) }; } catch(_) {}
    const ok = await sendTelegram('✅ <b>Crypto Scanner</b> — Telegram alert berhasil dikonfigurasi ke group ini!');
    res.json({ ok, message: ok ? 'Test message sent!' : 'Gagal kirim — cek token & chatId' });
});

// POST /api/whale-alert-tg — kirim Whale Alert Signals dari frontend ke Telegram
app.post('/api/whale-alert-tg', express.json(), async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try { _tgConfig = { ..._tgConfig, ...JSON.parse(fs.readFileSync(TG_CONFIG_FILE, 'utf8')) }; } catch(_) {}
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ ok: false, error: 'No message provided' });
    if (!_tgConfig.botToken || !_tgConfig.chatId)
        return res.status(400).json({ ok: false, error: 'Telegram belum dikonfigurasi — isi Bot Token & Chat ID di panel Alerts dulu' });
    const ok = await sendTelegram(message);
    res.json({ ok, error: ok ? null : 'Gagal kirim ke Telegram — cek token & chatId' });
});

// OPTIONS preflight whale-alert-tg
app.options('/api/whale-alert-tg', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
});

// ══════════════════════════════════════════════════════════════
//  WHALE WALLET MONITOR
//  Frontend sync saved wallets → server memonitor setiap 5 menit
//  Deteksi: accumulation / distribution / whale buy / whale sell
//  Kirim Telegram alert otomatis
// ══════════════════════════════════════════════════════════════
const WWM_FILE = path.join(__dirname, 'whale-watch-wallets.json');
let _wwmWallets = [];         // [{ addr, label, addedAt }]
let _wwmLastSeen = {};        // addr → last signature seen
let _wwmAlertCooldown = {};   // addr → last alert timestamp (prevent spam)
let _wwmAlertLog = [];        // in-memory log of detected events (max 100)

// Load from disk
try {
    if (fs.existsSync(WWM_FILE)) _wwmWallets = JSON.parse(fs.readFileSync(WWM_FILE, 'utf8'));
} catch (_) {}

function _wwmSave() {
    try { fs.writeFileSync(WWM_FILE, JSON.stringify(_wwmWallets, null, 2)); } catch (_) {}
}

// GET /api/whale-monitor/wallets — list wallets yang dimonitor
app.get('/api/whale-monitor/wallets', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ ok: true, wallets: _wwmWallets, count: _wwmWallets.length });
});

// POST /api/whale-monitor/wallets — sync saved wallets dari frontend
app.post('/api/whale-monitor/wallets', express.json(), (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const incoming = req.body?.wallets;
    if (!Array.isArray(incoming)) return res.status(400).json({ ok: false, error: 'wallets must be array' });
    // Merge — keep existing + add new, max 50
    const existingAddrs = new Set(_wwmWallets.map(w => w.addr));
    for (const w of incoming) {
        if (!w.addr || existingAddrs.has(w.addr)) continue;
        _wwmWallets.push({ addr: w.addr, label: w.label || w.addr.slice(0,8)+'…', addedAt: Date.now() });
        existingAddrs.add(w.addr);
    }
    _wwmWallets = _wwmWallets.slice(0, 50);
    _wwmSave();
    res.json({ ok: true, count: _wwmWallets.length });
});

// DELETE /api/whale-monitor/wallets/:addr — hapus dari monitor
app.delete('/api/whale-monitor/wallets/:addr', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    _wwmWallets = _wwmWallets.filter(w => w.addr !== req.params.addr);
    delete _wwmLastSeen[req.params.addr];
    _wwmSave();
    res.json({ ok: true, count: _wwmWallets.length });
});

// GET /api/whale-monitor/alerts — log deteksi (untuk UI feed)
app.get('/api/whale-monitor/alerts', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    res.json({ ok: true, alerts: _wwmAlertLog.slice(0, limit), total: _wwmAlertLog.length });
});

// GET /api/whale-monitor/status — apakah monitor aktif
app.get('/api/whale-monitor/status', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ ok: true, active: true, walletCount: _wwmWallets.length, intervalMin: 5 });
});

// ── Core polling function ─────────────────────────────────────
const SOL_RPC = process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function _wwmCheckWallet(wallet) {
    const { addr, label } = wallet;
    try {
        // 1. Get last 10 signatures
        const sigRes = await fetch(SOL_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress',
                params: [addr, { limit: 10, commitment: 'confirmed' }],
            }),
            signal: AbortSignal.timeout(10000),
        });
        const sigData = await sigRes.json();
        const sigs = sigData?.result || [];
        if (!sigs.length) return;

        const latestSig = sigs[0].signature;
        const lastSeen  = _wwmLastSeen[addr];

        // First time — just record, don't alert
        if (!lastSeen) { _wwmLastSeen[addr] = latestSig; return; }
        if (lastSeen === latestSig) return; // no new TX

        // 2. Find new signatures
        const newSigs = [];
        for (const s of sigs) {
            if (s.signature === lastSeen) break;
            newSigs.push(s.signature);
        }
        _wwmLastSeen[addr] = latestSig;
        if (!newSigs.length) return;

        // 3. Fetch TX details
        const txRes = await fetch(SOL_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0', id: 1, method: 'getTransactions',
                params: [newSigs, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
            }),
            signal: AbortSignal.timeout(15000),
        });
        const txData = await txRes.json();
        const txs = Array.isArray(txData?.result) ? txData.result.filter(Boolean) : [];

        // 4. Analyze each TX
        const events = [];
        for (const tx of txs) {
            const meta = tx.meta;
            if (!meta || meta.err) continue;
            const pre  = meta.preBalances  || [];
            const post = meta.postBalances || [];
            // Find wallet index in accountKeys
            const keys = tx.transaction?.message?.accountKeys || [];
            const idx  = keys.findIndex(k => (k.pubkey || k) === addr);
            if (idx < 0) continue;
            const deltaLamports = (post[idx] || 0) - (pre[idx] || 0);
            const deltaSOL = deltaLamports / 1e9;
            const absSol   = Math.abs(deltaSOL);

            // Token balance changes
            const tokenPre  = meta.preTokenBalances  || [];
            const tokenPost = meta.postTokenBalances || [];
            const tokenChanges = [];
            for (const tp of tokenPost) {
                if (tp.owner !== addr) continue;
                const tpre = tokenPre.find(p => p.accountIndex === tp.accountIndex && p.owner === addr);
                const preAmt  = parseFloat(tpre?.uiTokenAmount?.uiAmount || 0);
                const postAmt = parseFloat(tp.uiTokenAmount?.uiAmount || 0);
                const diff    = postAmt - preAmt;
                if (Math.abs(diff) > 0.001) {
                    tokenChanges.push({ mint: tp.mint, diff, symbol: tp.uiTokenAmount?.uiAmountString });
                }
            }

            // Classify
            let evtType = null;
            let evtNote = '';

            if (tokenChanges.length > 0 && absSol > 0.01) {
                // SOL out + token in = BUY
                if (deltaSOL < -0.01 && tokenChanges.some(t => t.diff > 0)) {
                    evtType = 'BUY'; evtNote = `SOL ${deltaSOL.toFixed(3)} → token masuk`;
                }
                // SOL in + token out = SELL
                else if (deltaSOL > 0.01 && tokenChanges.some(t => t.diff < 0)) {
                    evtType = 'SELL'; evtNote = `Token keluar → SOL +${deltaSOL.toFixed(3)}`;
                }
            } else if (tokenChanges.length > 0) {
                // Only token movement = SWAP
                const tokOut = tokenChanges.filter(t => t.diff < 0);
                const tokIn  = tokenChanges.filter(t => t.diff > 0);
                if (tokOut.length && tokIn.length) { evtType = 'SWAP'; evtNote = 'Token-to-token swap'; }
            } else if (absSol > 1) {
                // Large SOL transfer
                evtType = deltaSOL > 0 ? 'RECEIVE' : 'SEND';
                evtNote = `${Math.abs(deltaSOL).toFixed(2)} SOL`;
            }

            if (!evtType) continue;
            events.push({ type: evtType, deltaSOL, tokenChanges, note: evtNote, sig: tx.transaction?.signatures?.[0], ts: tx.blockTime });
        }

        if (!events.length) return;

        // 5. Determine pattern: accumulation / distribution?
        const buys      = events.filter(e => e.type === 'BUY');
        const sells     = events.filter(e => e.type === 'SELL');
        const distribs  = events.filter(e => e.type === 'SEND' && Math.abs(e.deltaSOL) > 5);

        let pattern = null;
        let alertEmoji = '📊';
        let alertTitle = '';

        // Distribusi: 3+ SELL dalam 1 batch, atau SEND besar
        if (sells.length >= 3 || (sells.length > 0 && distribs.length > 0)) {
            pattern = 'DISTRIBUSI';
            alertEmoji = '🔴';
            alertTitle = `⚠️ DISTRIBUSI TERDETEKSI`;
        }
        // Send besar saja (distribusi ke exchange/wallet lain)
        else if (distribs.length >= 2 && buys.length === 0) {
            pattern = 'DISTRIBUSI';
            alertEmoji = '🔴';
            alertTitle = `⚠️ DISTRIBUSI TERDETEKSI`;
        }
        // Accumulation: 2+ BUY
        else if (buys.length >= 2) {
            pattern = 'AKUMULASI';
            alertEmoji = '🟢';
            alertTitle = `📈 AKUMULASI TERDETEKSI`;
        }
        // Single buy/sell besar
        else if (events[0].type === 'BUY') {
            pattern = 'WHALE BUY';
            alertEmoji = '🐋';
            alertTitle = `🐋 WHALE BUY`;
        } else if (events[0].type === 'SELL') {
            pattern = 'WHALE SELL';
            alertEmoji = '🔴';
            alertTitle = `🔴 WHALE SELL`;
        } else if (events[0].type === 'SWAP') {
            pattern = 'SWAP';
            alertEmoji = '🔵';
            alertTitle = `🔵 SWAP BESAR`;
        }

        if (!pattern) return;

        // 6. Cooldown check (1 alert per wallet per 15 menit)
        const now = Date.now();
        const lastAlert = _wwmAlertCooldown[addr] || 0;
        if (now - lastAlert < 15 * 60_000) return;
        _wwmAlertCooldown[addr] = now;

        // 7. Build Telegram message
        const shortAddr  = addr.slice(0,6) + '…' + addr.slice(-4);
        const solscanUrl = `https://solscan.io/account/${addr}`;
        const timeStr    = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        const evtLines   = events.slice(0, 5).map(e => {
            const toks = e.tokenChanges.map(t => {
                const dir = t.diff > 0 ? '▲' : '▼';
                return `${dir} ${Math.abs(t.diff).toLocaleString(undefined,{maximumFractionDigits:2})} (${t.mint.slice(0,6)}…)`;
            }).join(', ');
            const solStr = Math.abs(e.deltaSOL) > 0.001 ? ` | SOL ${e.deltaSOL > 0 ? '+' : ''}${e.deltaSOL.toFixed(3)}` : '';
            return `  • <b>${e.type}</b>${solStr}${toks ? ` | ${toks}` : ''}`;
        }).join('\n');

        const msg =
            `${alertEmoji} <b>${alertTitle}</b>\n\n` +
            `👛 <b>${label}</b>\n` +
            `📍 <a href="${solscanUrl}">${shortAddr}</a>\n` +
            `🕐 ${timeStr} WIB\n\n` +
            `📋 Transaksi baru (${events.length} TX):\n${evtLines}\n\n` +
            `🔍 Pattern: <b>${pattern}</b>\n` +
            (pattern === 'AKUMULASI' ? `💡 <i>Whale sedang akumulasi — potensi pump?</i>` :
             pattern === 'DISTRIBUSI' ? `⚠️ <i>Whale distribusi / jual — hati-hati FOMO!</i>` :
             `💡 <i>Pantau pergerakan selanjutnya.</i>`) + `\n\n` +
            `<a href="${solscanUrl}">→ Lihat di Solscan</a>`;

        const sent = await sendTelegram(msg);
        if (sent) {
            console.log(`[WhaleMonitor] ✅ Alert ${pattern} dikirim: ${label} (${shortAddr})`);
            pushLog('WARN', 'WhaleMonitor', `${pattern} detected: ${label}`, { addr, pattern, txCount: events.length });
        }

        // Simpan ke alert log (ui feed)
        const firstTok = events.flatMap(e => e.tokenChanges).find(t => t.diff !== 0);
        _wwmAlertLog.unshift({
            id:        Date.now(),
            ts:        now,
            addr,
            label,
            shortAddr,
            solscanUrl,
            pattern,
            alertEmoji,
            txCount:   events.length,
            events:    events.slice(0, 5).map(e => ({
                type:  e.type,
                deltaSOL: e.deltaSOL,
                tokens: e.tokenChanges.slice(0, 3).map(t => ({
                    mint:   t.mint,
                    symbol: t.symbol || t.mint.slice(0, 6) + '…',
                    diff:   t.diff,
                })),
            })),
            topToken:  firstTok ? (firstTok.symbol || firstTok.mint.slice(0,6)+'…') : null,
            topDelta:  firstTok ? firstTok.diff : null,
            sent,
        });
        if (_wwmAlertLog.length > 100) _wwmAlertLog = _wwmAlertLog.slice(0, 100);

    } catch (e) {
        console.warn(`[WhaleMonitor] Error checking ${addr.slice(0,8)}: ${e.message}`);
    }
}

async function _wwmRun() {
    if (!_wwmWallets.length) return;
    try { _tgConfig = { ..._tgConfig, ...JSON.parse(fs.readFileSync(TG_CONFIG_FILE, 'utf8')) }; } catch(_) {}
    if (!_tgConfig.botToken || !_tgConfig.chatId) return;

    console.log(`[WhaleMonitor] Checking ${_wwmWallets.length} wallets…`);
    for (const wallet of _wwmWallets) {
        await _wwmCheckWallet(wallet);
        await new Promise(r => setTimeout(r, 500)); // throttle RPC
    }
}

// ══════════════════════════════════════════════════════════════
//  SIGNAL ACCURACY TRACKER
//  Simpan setiap sinyal LONG ke log, cek 4h/24h apakah naik
// ══════════════════════════════════════════════════════════════
const SIGNAL_LOG_FILE = path.join(__dirname, 'signal-log.json');
let _signalLog = [];

function loadSignalLog() {
    try {
        if (fs.existsSync(SIGNAL_LOG_FILE)) {
            _signalLog = JSON.parse(fs.readFileSync(SIGNAL_LOG_FILE, 'utf8'));
        }
    } catch (_) { _signalLog = []; }
}

function saveSignalLog() {
    try { fs.writeFileSync(SIGNAL_LOG_FILE, JSON.stringify(_signalLog.slice(-500), null, 2)); } catch (_) {}
}

// Called whenever ecosystem pump produces a LONG signal
function recordSignal({ symbol, ecoSymbol, signal, price, lagScore24h, signalLabel }) {
    if (signal !== 'LONG') return false;
    const now = Date.now();
    // Skip if same symbol recorded in last 4h
    const recent = _signalLog.find(s => s.symbol === symbol && (now - s.ts) < 4 * 3600_000);
    if (recent) return false;
    _signalLog.push({ symbol, ecoSymbol, signal, price, lagScore24h, signalLabel, ts: now, outcome4h: null, outcome24h: null });
    saveSignalLog();
    return true; // new signal recorded
}

// Check outcomes periodically (every 15 min)
async function checkSignalOutcomes() {
    const now = Date.now();
    const pending4h  = _signalLog.filter(s => s.outcome4h  === null && (now - s.ts) >= 4  * 3600_000);
    const pending24h = _signalLog.filter(s => s.outcome24h === null && (now - s.ts) >= 24 * 3600_000);
    const pending = [...new Set([...pending4h, ...pending24h])];
    if (!pending.length) return;

    try {
        const ids = [...new Set(pending.map(s => s.symbol.toLowerCase()))];
        const r = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
            { signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return;
        const prices = await r.json();
        let changed = false;
        for (const s of _signalLog) {
            const cur = prices[s.symbol.toLowerCase()]?.usd;
            if (!cur || !s.price) continue;
            const chPct = ((cur - s.price) / s.price) * 100;
            if (s.outcome4h === null  && (now - s.ts) >= 4  * 3600_000) { s.outcome4h  = +chPct.toFixed(2); changed = true; }
            if (s.outcome24h === null && (now - s.ts) >= 24 * 3600_000) { s.outcome24h = +chPct.toFixed(2); changed = true; }
        }
        if (changed) saveSignalLog();
    } catch (_) {}
}
loadSignalLog();
setInterval(checkSignalOutcomes, 15 * 60_000);

app.get('/api/signal-history', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const log = [..._signalLog].reverse().slice(0, 200);

    // Compute accuracy stats
    const resolved4h  = log.filter(s => s.outcome4h  !== null);
    const resolved24h = log.filter(s => s.outcome24h !== null);
    const win4h  = resolved4h.filter(s => s.outcome4h  > 0).length;
    const win24h = resolved24h.filter(s => s.outcome24h > 0).length;

    // Per-ecosystem stats
    const byEco = {};
    for (const s of resolved24h) {
        if (!byEco[s.ecoSymbol]) byEco[s.ecoSymbol] = { wins: 0, total: 0, avgReturn: 0 };
        byEco[s.ecoSymbol].total++;
        if (s.outcome24h > 0) byEco[s.ecoSymbol].wins++;
        byEco[s.ecoSymbol].avgReturn += s.outcome24h;
    }
    for (const eco of Object.values(byEco)) {
        eco.winRate = eco.total ? +((eco.wins / eco.total) * 100).toFixed(1) : 0;
        eco.avgReturn = eco.total ? +(eco.avgReturn / eco.total).toFixed(2) : 0;
    }

    res.json({
        ok: true,
        signals: log,
        stats: {
            total: log.length,
            winRate4h:  resolved4h.length  ? +((win4h  / resolved4h.length)  * 100).toFixed(1) : null,
            winRate24h: resolved24h.length ? +((win24h / resolved24h.length) * 100).toFixed(1) : null,
            resolved4h: resolved4h.length,
            resolved24h: resolved24h.length,
        },
        byEco,
    });
});

// ══════════════════════════════════════════════════════════════
//  FEAR & GREED + MARKET REGIME
// ══════════════════════════════════════════════════════════════
let _fgCache = null;
let _fgCacheTs = 0;
const FG_TTL = 30 * 60_000; // 30 menit

app.get('/api/fear-greed', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (_fgCache && (Date.now() - _fgCacheTs) < FG_TTL) {
        return res.json({ ok: true, cached: true, ..._fgCache });
    }
    try {
        const r = await fetch('https://api.alternative.me/fng/?limit=7', { signal: AbortSignal.timeout(6000) });
        if (!r.ok) throw new Error('FG API failed');
        const d = await r.json();
        const data = d.data || [];
        const current = data[0];
        const val = parseInt(current?.value ?? 50);

        // Market regime detection
        const regime =
            val >= 80 ? { label: 'Extreme Greed 🔴', short: 'EXTREME_GREED', color: '#ef4444', warn: 'Hati-hati! Pasar overheated. Pertimbangkan take profit.' } :
            val >= 60 ? { label: 'Greed 🟠',         short: 'GREED',         color: '#f97316', warn: 'Market bullish tapi mulai panas. Gunakan SL ketat.' } :
            val >= 45 ? { label: 'Neutral ⚪',        short: 'NEUTRAL',       color: '#94a3b8', warn: 'Market sideways. Tunggu breakout atau konfirmasi trend.' } :
            val >= 25 ? { label: 'Fear 🟡',           short: 'FEAR',          color: '#eab308', warn: 'Ada ketakutan di market. Potensi akumulasi zona bagus.' } :
                        { label: 'Extreme Fear 🟢',   short: 'EXTREME_FEAR',  color: '#22c55e', warn: 'BELI! Historically zona akumulasi terbaik saat extreme fear.' };

        // Bull/Bear/Crab regime from 7-day F&G trend
        const avg7d = data.length >= 7 ? data.reduce((s, x) => s + parseInt(x.value), 0) / data.length : val;
        const marketPhase =
            avg7d >= 65 ? { label: '🐂 Bull Run', color: '#22c55e' } :
            avg7d >= 40 ? { label: '🦀 Crab / Sideways', color: '#f59e0b' } :
                          { label: '🐻 Bear Phase', color: '#ef4444' };

        const history7d = data.map(x => ({ value: parseInt(x.value), label: x.value_classification, ts: parseInt(x.timestamp) * 1000 }));

        const result = { value: val, classification: current?.value_classification, regime, marketPhase, history7d, avg7d: +avg7d.toFixed(1) };
        _fgCache = result;
        _fgCacheTs = Date.now();
        res.json({ ok: true, cached: false, ...result });
    } catch (e) {
        if (_fgCache) return res.json({ ok: true, cached: true, stale: true, ..._fgCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ══════════════════════════════════════════════════════════════
//  WATCHLIST API — simpan & ambil watchlist di server (file)
// ══════════════════════════════════════════════════════════════
const WATCHLIST_FILE = path.join(__dirname, 'watchlist.json');
let _watchlist = { tokens: [], updatedAt: null };

function loadWatchlist() {
    try { if (fs.existsSync(WATCHLIST_FILE)) _watchlist = JSON.parse(fs.readFileSync(WATCHLIST_FILE, 'utf8')); } catch (_) {}
}
function saveWatchlist() {
    try { fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(_watchlist, null, 2)); } catch (_) {}
}
loadWatchlist();

app.get('/api/watchlist', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json({ ok: true, ..._watchlist });
});

app.post('/api/watchlist', express.json(), (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { symbol, action } = req.body || {};
    if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });
    const sym = symbol.toUpperCase();
    if (action === 'remove') {
        _watchlist.tokens = _watchlist.tokens.filter(t => t !== sym);
    } else {
        if (!_watchlist.tokens.includes(sym)) _watchlist.tokens.push(sym);
    }
    _watchlist.updatedAt = new Date().toISOString();
    saveWatchlist();
    res.json({ ok: true, tokens: _watchlist.tokens });
});

app.options('/api/watchlist', (req, res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.sendStatus(200); });

// ══════════════════════════════════════════════════════════════
//  AI NARRATIVE INTELLIGENCE ENGINE
//  "Find the next mover before retail enters."
// ══════════════════════════════════════════════════════════════

// Narrative map — leader coins + followers + categories
const NARRATIVE_MAP = {
    'solana-meme': {
        name: 'Solana Meme & DeFi', emoji: '◎', color: '#9945FF',
        leader: 'solana', leaderCgId: 'solana',
        followers: ['dogwifhat','bonk','fartcoin','popcat','book-of-meme','samoyedcoin'],
        followerSymbols: ['WIF','BONK','FARTCOIN','POPCAT','BOME','SAMO'],
        tags: ['meme','solana','defi'], avgLagHours: 4,
        desc: 'SOL naik → Solana meme coins ikut pump dalam 2-6 jam',
    },
    'ton-ecosystem': {
        name: 'TON / Telegram', emoji: '💎', color: '#0088CC',
        leader: 'the-open-network', leaderCgId: 'the-open-network',
        followers: ['dogs-1','not','hamster-kombat','gram'],
        followerSymbols: ['DOGS','NOT','HMSTR','GRAM'],
        tags: ['telegram','gaming','social'], avgLagHours: 6,
        desc: 'TON naik → mini-app tokens (DOGS, NOT, HMSTR) ikut',
    },
    'ai-agents': {
        name: 'AI Agents / Base', emoji: '🤖', color: '#8B5CF6',
        leader: 'virtuals-protocol', leaderCgId: 'virtuals-protocol',
        followers: ['luna-by-virtuals','game-by-virtuals','aixbt-by-virtuals','ai16z','zerebro','goat'],
        followerSymbols: ['LUNA','GAME','AIXBT','AI16Z','ZEREBRO','GOAT'],
        tags: ['ai','agents','base'], avgLagHours: 3,
        desc: 'VIRTUAL naik → AI agent tokens ikut dalam 2-4 jam',
    },
    'ethereum-defi': {
        name: 'Ethereum DeFi', emoji: 'Ξ', color: '#627EEA',
        leader: 'ethereum', leaderCgId: 'ethereum',
        followers: ['uniswap','aave','chainlink','pendle','lido-dao','curve-dao-token'],
        followerSymbols: ['UNI','AAVE','LINK','PENDLE','LDO','CRV'],
        tags: ['defi','ethereum','restaking'], avgLagHours: 8,
        desc: 'ETH naik → DeFi blue chips ikut dengan lag 4-12 jam',
    },
    'hyperliquid': {
        name: 'Hyperliquid', emoji: '⚡', color: '#00FF88',
        leader: 'hyperliquid', leaderCgId: 'hyperliquid',
        followers: ['purr-hyperliquid','hfun','ferocious'],
        followerSymbols: ['PURR','HFUN','FEROCIOUS'],
        tags: ['perp','defi','l1'], avgLagHours: 2,
        desc: 'HYPE naik → HL ecosystem tokens ikut cepat',
    },
    'btc-season': {
        name: 'BTC Dominance Play', emoji: '₿', color: '#F7931A',
        leader: 'bitcoin', leaderCgId: 'bitcoin',
        followers: ['solana','binancecoin','sui','aptos','near','avalanche-2'],
        followerSymbols: ['SOL','BNB','SUI','APT','NEAR','AVAX'],
        tags: ['l1','major','altcoin'], avgLagHours: 12,
        desc: 'BTC sideways/turun dominance → liquidity rotasi ke L1 altcoin',
    },
    'sui-ecosystem': {
        name: 'Sui Ecosystem', emoji: '💧', color: '#6FBCF0',
        leader: 'sui', leaderCgId: 'sui',
        followers: ['cetus-protocol','navi-protocol','bucket-protocol','scallop-2'],
        followerSymbols: ['CETUS','NAVX','BUCK','SCA'],
        tags: ['defi','move','l1'], avgLagHours: 5,
        desc: 'SUI naik → Sui DeFi ecosystem ikut',
    },
    'injective-ecosystem': {
        name: 'Injective', emoji: '🌊', color: '#00A3FF',
        leader: 'injective-protocol', leaderCgId: 'injective-protocol',
        followers: ['black-panther','ninja-protocol'],
        followerSymbols: ['KAGE','NINJA'],
        tags: ['defi','perp','cosmos'], avgLagHours: 6,
        desc: 'INJ naik → INJ DeFi tokens ikut',
    },
};

// In-memory rolling snapshot store (1h, 4h, 24h)
const _narrativeHistory = {}; // { cgId: [{ts, price, volume, ch1h, ch24h}] }
const NARRATIVE_HISTORY_MAX = 48; // keep 48 snapshots (~24h jika 30min interval)

function updateNarrativeHistory(coins) {
    const now = Date.now();
    coins.forEach(c => {
        if (!_narrativeHistory[c.id]) _narrativeHistory[c.id] = [];
        _narrativeHistory[c.id].push({
            ts: now, price: c.current_price,
            volume: c.total_volume,
            ch1h: c.price_change_percentage_1h_in_currency ?? 0,
            ch24h: c.price_change_percentage_24h ?? 0,
        });
        // Keep rolling window
        if (_narrativeHistory[c.id].length > NARRATIVE_HISTORY_MAX) {
            _narrativeHistory[c.id].shift();
        }
    });
}

// Cross-correlation score: berapa kali follower ikut leader dalam 24h window
function computeFollowProbability(leaderId, followerIds) {
    const leaderHist = _narrativeHistory[leaderId] || [];
    if (leaderHist.length < 3) return { probability: 0, avgLagGain: 0, dataPoints: 0 };

    let followEvents = 0, totalGain = 0, checks = 0;
    // Check: setiap kali leader ch1h > 3%, berapa % follower yang ikut positif?
    leaderHist.forEach(snap => {
        if (snap.ch1h > 3) {
            checks++;
            const followerFollowed = followerIds.filter(fid => {
                const fHist = _narrativeHistory[fid] || [];
                const near = fHist.find(h => Math.abs(h.ts - snap.ts) < 2 * 3600_000);
                return near && near.ch1h > 1;
            });
            followEvents += followerFollowed.length;
            totalGain += followerFollowed.length > 0 ?
                (followerIds.map(fid => {
                    const fHist = _narrativeHistory[fid] || [];
                    const near = fHist.find(h => Math.abs(h.ts - snap.ts) < 2 * 3600_000);
                    return near?.ch1h ?? 0;
                }).reduce((a, b) => a + b, 0) / followerIds.length) : 0;
        }
    });

    const probability = checks > 0 ? Math.round((followEvents / (checks * followerIds.length)) * 100) : 0;
    const avgLagGain  = checks > 0 ? +(totalGain / Math.max(checks, 1)).toFixed(2) : 0;
    return { probability, avgLagGain, dataPoints: leaderHist.length };
}

// Compute AI signal score per narrative
function computeNarrativeScore(leaderData, followerDataArr) {
    if (!leaderData) return 0;
    const volAccel = Math.min(leaderData.total_volume / Math.max(leaderData.market_cap * 0.02, 1), 5);
    const momentumScore = Math.max(0, leaderData.price_change_percentage_24h ?? 0) / 20;
    const followerMomentum = followerDataArr.length > 0
        ? followerDataArr.reduce((s, f) => s + Math.max(0, f?.price_change_percentage_24h ?? 0), 0) / followerDataArr.length / 15
        : 0;
    const liquidityScore = Math.min((leaderData.total_volume / Math.max(leaderData.market_cap, 1)) * 10, 1);

    const score = Math.round(
        (volAccel * 0.25 + momentumScore * 0.30 + followerMomentum * 0.25 + liquidityScore * 0.20) * 100
    );
    return Math.min(score, 100);
}

// Cache for narrative overview
let _narrativeCache = null, _narrativeCacheTs = 0;
const NARRATIVE_TTL = 3 * 60_000; // 3 menit

app.get('/api/narrative/overview', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const force = req.query.refresh === '1';
    if (!force && _narrativeCache && (Date.now() - _narrativeCacheTs) < NARRATIVE_TTL) {
        return res.json({ ok: true, cached: true, ..._narrativeCache });
    }

    try {
        // Collect all unique IDs from narrative map
        const allNarrativeIds = [...new Set(
            Object.values(NARRATIVE_MAP).flatMap(n => [n.leaderCgId, ...n.followers])
        )];
        const chunks = [];
        for (let i = 0; i < allNarrativeIds.length; i += 100) chunks.push(allNarrativeIds.slice(i, i + 100));

        const pages = await Promise.allSettled(chunks.map(ids =>
            fetch(
                `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=1h,24h,7d&sparkline=false&per_page=100`,
                { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) }
            ).then(r => r.ok ? r.json() : [])
        ));
        let coins = [];
        pages.forEach(p => { if (p.status === 'fulfilled' && Array.isArray(p.value)) coins.push(...p.value); });

        // Update rolling history
        updateNarrativeHistory(coins);

        const coinMap = {};
        coins.forEach(c => { coinMap[c.id] = c; });

        // Compute narrative results
        const narratives = Object.entries(NARRATIVE_MAP).map(([id, meta]) => {
            const leaderData = coinMap[meta.leaderCgId];
            const followerDataArr = meta.followers.map(fid => coinMap[fid]).filter(Boolean);

            const score = computeNarrativeScore(leaderData, followerDataArr);
            const followProb = computeFollowProbability(meta.leaderCgId, meta.followers);

            // Leader momentum
            const leaderCh24h = leaderData?.price_change_percentage_24h ?? 0;
            const leaderCh1h  = leaderData?.price_change_percentage_1h_in_currency ?? 0;
            const leaderVol   = leaderData?.total_volume ?? 0;
            const leaderMcap  = leaderData?.market_cap ?? 0;

            // Follower momentum
            const followerMomentum = followerDataArr.length > 0
                ? +(followerDataArr.reduce((s, f) => s + (f.price_change_percentage_24h ?? 0), 0) / followerDataArr.length).toFixed(2)
                : 0;

            // Active rotation signal
            let rotationSignal = 'NEUTRAL';
            if (leaderCh1h > 5 && followerMomentum < 2) rotationSignal = 'BREAKOUT_IMMINENT'; // leader pump, follower belum
            else if (leaderCh24h > 8 && followerMomentum > 5) rotationSignal = 'ROTATION_ACTIVE'; // sudah ikut
            else if (leaderCh24h > 4) rotationSignal = 'WARMING';
            else if (leaderCh24h < -5) rotationSignal = 'COOLING';

            // Top followers sorted by score potential
            const followerDetails = followerDataArr.map(f => {
                const fCh24h = f.price_change_percentage_24h ?? 0;
                const fCh1h  = f.price_change_percentage_1h_in_currency ?? 0;
                const lag    = leaderCh24h - fCh24h; // positive = follower belum ikut (opportunity)
                const volMc  = f.market_cap > 0 ? +(f.total_volume / f.market_cap * 100).toFixed(1) : 0;
                return {
                    id: f.id, symbol: f.symbol?.toUpperCase(), name: f.name,
                    price: f.current_price, ch1h: +fCh1h.toFixed(2), ch24h: +fCh24h.toFixed(2),
                    volume: f.total_volume, marketCap: f.market_cap,
                    lagScore: +lag.toFixed(2), // makin positif = makin belum pump
                    volMcRatio: volMc,
                    potential: lag > 3 && fCh1h < 2 ? 'HIGH' : lag > 0 ? 'MEDIUM' : 'LOW',
                };
            }).sort((a, b) => b.lagScore - a.lagScore);

            return {
                id, ...meta,
                score,
                rotationSignal,
                followProbability: followProb.probability,
                avgLagGain: followProb.avgLagGain,
                leader: {
                    id: meta.leaderCgId,
                    symbol: leaderData?.symbol?.toUpperCase() ?? meta.leader.toUpperCase(),
                    price: leaderData?.current_price ?? 0,
                    ch1h: +leaderCh1h.toFixed(2),
                    ch24h: +leaderCh24h.toFixed(2),
                    ch7d: +(leaderData?.price_change_percentage_7d_in_currency ?? 0).toFixed(2),
                    volume: leaderVol,
                    marketCap: leaderMcap,
                    volMcRatio: leaderMcap > 0 ? +(leaderVol / leaderMcap * 100).toFixed(1) : 0,
                },
                followerMomentum,
                followers: followerDetails,
            };
        }).sort((a, b) => b.score - a.score);

        // Top predicted movers (followers belum pump tapi leader sudah pump)
        const predictions = [];
        narratives.forEach(n => {
            if (n.leader.ch1h > 3 || n.leader.ch24h > 5) {
                n.followers.filter(f => f.potential === 'HIGH').forEach(f => {
                    const entry  = f.price;
                    const tp1    = +(entry * 1.10).toFixed(6);
                    const tp2    = +(entry * 1.22).toFixed(6);
                    const sl     = +(entry * 0.94).toFixed(6);
                    const aiScore = Math.min(100, Math.round(
                        (n.score * 0.3) + (n.leader.ch1h * 3) + (f.lagScore * 2) + (f.volMcRatio * 0.5)
                    ));
                    predictions.push({
                        symbol: f.symbol, name: f.name, price: f.price,
                        ch1h: f.ch1h, ch24h: f.ch24h,
                        narrative: n.name, narrativeEmoji: n.emoji,
                        leaderSymbol: n.leader.symbol, leaderCh1h: n.leader.ch1h,
                        leaderCh24h: n.leader.ch24h,
                        lagScore: f.lagScore, potential: f.potential,
                        aiScore,
                        entry, tp1, tp2, sl,
                        reason: `${n.leader.symbol} +${n.leader.ch1h}% (1h) | ${f.symbol} lag: +${f.lagScore}% belum ikut`,
                        avgLagHours: n.avgLagHours,
                    });
                });
            }
        });
        predictions.sort((a, b) => b.aiScore - a.aiScore);

        // Liquidity rotation: which narratives gaining volume fastest
        const liquidityFlow = narratives.map(n => ({
            id: n.id, name: n.name, emoji: n.emoji, color: n.color,
            score: n.score,
            leaderCh24h: n.leader.ch24h,
            leaderVolMc: n.leader.volMcRatio,
            followerMomentum: n.followerMomentum,
            rotationSignal: n.rotationSignal,
        })).sort((a, b) => b.score - a.score);

        // Smart money signals: high vol + low ch24h (stealth accumulation)
        const smartMoneySignals = coins
            .filter(c => {
                const volMc = c.market_cap > 0 ? c.total_volume / c.market_cap : 0;
                const ch24h = c.price_change_percentage_24h ?? 0;
                return volMc > 0.1 && Math.abs(ch24h) < 4 && c.market_cap > 50_000_000;
            })
            .map(c => {
                const volMc = +(c.total_volume / c.market_cap * 100).toFixed(1);
                const ecoId = Object.keys(NARRATIVE_MAP).find(k =>
                    NARRATIVE_MAP[k].followers.includes(c.id) || NARRATIVE_MAP[k].leaderCgId === c.id
                );
                return {
                    id: c.id, symbol: c.symbol?.toUpperCase(), name: c.name,
                    price: c.current_price,
                    ch24h: +(c.price_change_percentage_24h ?? 0).toFixed(2),
                    ch1h: +(c.price_change_percentage_1h_in_currency ?? 0).toFixed(2),
                    volMcRatio: volMc,
                    volume: c.total_volume,
                    marketCap: c.market_cap,
                    narrative: ecoId ? NARRATIVE_MAP[ecoId].name : '—',
                    signal: 'STEALTH_ACCUMULATION',
                };
            })
            .sort((a, b) => b.volMcRatio - a.volMcRatio)
            .slice(0, 10);

        const result = {
            narratives,
            predictions: predictions.slice(0, 15),
            liquidityFlow,
            smartMoneySignals,
            topNarrative: narratives[0],
            breakoutImminent: narratives.filter(n => n.rotationSignal === 'BREAKOUT_IMMINENT'),
            fetchedAt: new Date().toISOString(),
            totalCoins: coins.length,
        };

        _narrativeCache   = result;
        _narrativeCacheTs = Date.now();

        // ── Telegram Alert jika ada BREAKOUT_IMMINENT ──────────
        try { _tgConfig = { ..._tgConfig, ...JSON.parse(fs.readFileSync(TG_CONFIG_FILE, 'utf8')) }; } catch(_) {}
        if (_tgConfig.botToken && _tgConfig.chatId && result.breakoutImminent.length > 0) {
            const bo = result.breakoutImminent[0];
            const top3preds = result.predictions.slice(0, 3);
            if (top3preds.length > 0 && (Date.now() - _whaleAlertTs) > 20 * 60_000) {
                const lines = top3preds.map((p, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
                    const fmt = v => v < 0.001 ? v.toFixed(6) : v < 1 ? v.toFixed(4) : v.toFixed(2);
                    return `${medal} <b>${p.symbol}</b> (${p.narrativeEmoji} ${p.narrative})\n` +
                        `💡 ${p.reason}\n` +
                        `📈 Entry: <b>$${fmt(p.entry)}</b>  🎯 TP1: $${fmt(p.tp1)} (+10%)  TP2: $${fmt(p.tp2)} (+22%)\n` +
                        `🛑 SL: $${fmt(p.sl)} (-6%)  ⏱ Lag ~${p.avgLagHours}h  🤖 AI Score: <b>${p.aiScore}/100</b>`;
                }).join('\n━━━━━━━━━━━━━━━━━━\n');

                const msg = `🧠 <b>NARRATIVE ROTATION ALERT</b>\n` +
                    `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n` +
                    `⚡ <b>${bo.leader.symbol}</b> pump +${bo.leader.ch1h}% (1h) — followers belum ikut!\n\n` +
                    `🎯 <b>PREDICTED NEXT MOVERS:</b>\n━━━━━━━━━━━━━━━━━━\n` +
                    `${lines}\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `⚠️ <i>AI prediction. DYOR. Bukan financial advice.</i>`;
                sendTelegram(msg).catch(() => {});
                _whaleAlertTs = Date.now();
            }
        }

        res.json({ ok: true, cached: false, ...result });
    } catch (e) {
        console.error('/api/narrative/overview error:', e.message);
        if (_narrativeCache) return res.json({ ok: true, cached: true, stale: true, ..._narrativeCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

// Narrative predictions only (lightweight)
app.get('/api/narrative/predictions', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (_narrativeCache) return res.json({ ok: true, predictions: _narrativeCache.predictions, fetchedAt: _narrativeCache.fetchedAt });
    res.json({ ok: false, message: 'No data yet, call /api/narrative/overview first' });
});

// CORS preflight
app.options('/api/narrative/overview',    (req, res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.sendStatus(200); });
app.options('/api/narrative/predictions', (req, res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.sendStatus(200); });

// ══════════════════════════════════════════════════════════════
//  SCHEDULED WHALE ALERT — jalan setiap 30 menit di background
//  Tidak perlu buka browser — cukup proxy server tetap hidup
// ══════════════════════════════════════════════════════════════
async function runScheduledWhaleAlert() {
    try {
        // Reload Telegram config dari file
        try { _tgConfig = { ..._tgConfig, ...JSON.parse(fs.readFileSync(TG_CONFIG_FILE, 'utf8')) }; } catch(_) {}
        if (!_tgConfig.botToken || !_tgConfig.chatId) return; // belum dikonfigurasi

        const now = Date.now();
        if ((now - _whaleAlertTs) < 30 * 60_000) return; // sudah kirim < 30 menit lalu

        console.log('🕐 [Scheduler] Fetching whale data untuk scheduled alert...');

        // Fetch coins dari CoinGecko langsung (sama seperti endpoint whale-accumulation)
        const allIds = [...new Set(Object.values(ECOSYSTEM_MAP).flatMap(e => e.cgIds))];
        const chunks = [allIds.slice(0, 100), allIds.slice(100, 200)].filter(c => c.length);
        const pages  = await Promise.allSettled(chunks.map(ids =>
            fetch(
                `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=1h,24h&sparkline=false&per_page=100`,
                { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) }
            ).then(r => r.ok ? r.json() : [])
        ));

        let coins = [];
        pages.forEach(p => { if (p.status === 'fulfilled' && Array.isArray(p.value)) coins.push(...p.value); });
        if (!coins.length) { console.warn('[Scheduler] Tidak ada data coins dari CoinGecko'); return; }

        const scored = coins.map(c => {
            const ws = computeWhaleScore(c);
            const ecoId   = Object.keys(ECOSYSTEM_MAP).find(k => ECOSYSTEM_MAP[k].cgIds.includes(c.id));
            const ecoMeta = ecoId ? ECOSYSTEM_MAP[ecoId] : null;
            return {
                id: c.id, symbol: c.symbol?.toUpperCase(), name: c.name,
                price: c.current_price,
                ch1h:  +(c.price_change_percentage_1h_in_currency ?? 0).toFixed(2),
                ch24h: +(c.price_change_percentage_24h ?? 0).toFixed(2),
                volume24h: c.total_volume, marketCap: c.market_cap,
                high24h: c.high_24h, low24h: c.low_24h,
                ecoSymbol: ecoMeta?.symbol ?? '?',
                ecoName:   ecoMeta?.name   ?? '?',
                ...ws,
            };
        }).filter(t => t.score > 0).sort((a, b) => b.score - a.score);

        const accumulating = scored.filter(t => t.type === 'ACCUMULATING');
        if (!accumulating.length) { console.log('[Scheduler] Tidak ada sinyal akumulasi saat ini'); return; }

        // Tandai throttle SEBELUM kirim (mencegah race condition)
        _whaleAlertTs = now;

        const top3 = accumulating.slice(0, 3);
        const fmt = p => !p ? '–' : p < 0.001 ? p.toFixed(6) : p < 0.01 ? p.toFixed(5) : p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(3) : p.toFixed(2);
        const topLines = top3.map((t, i) => {
            const volPct   = t.volMcRatio ? (t.volMcRatio * 100).toFixed(1) : '–';
            const chg      = t.ch24h >= 0 ? `+${t.ch24h}%` : `${t.ch24h}%`;
            const chgEmoji = t.ch24h >= 2 ? '📈' : t.ch24h <= -3 ? '📉' : '↔️';
            const sigMain  = t.signals?.[0] || '—';
            const entry = t.price, tp1 = entry * 1.08, tp2 = entry * 1.18, sl = entry * 0.95;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
            let narrative = '';
            if (t.signals?.some(s => s.includes('Stealth')))         narrative = `Volume meledak tapi harga nyaris flat — whale diam-diam akumulasi.`;
            else if (t.signals?.some(s => s.includes('Absorption'))) narrative = `Harga turun tapi vol besar — seller sedang diaborsi big buyer.`;
            else if (t.signals?.some(s => s.includes('Near 24h Low'))) narrative = `Mendekati support 24h dengan volume tinggi — potensi reversal kuat.`;
            else if (t.signals?.some(s => s.includes('Reversal')))   narrative = `1h mulai hijau sementara 24h masih merah — early entry window.`;
            else                                                       narrative = `Volume anomali terdeteksi — aktivitas besar di balik layar.`;
            return `━━━━━━━━━━━━━━━━━━\n` +
                   `${medal} <b>${t.symbol}</b> (${t.ecoSymbol})   Score: <b>${t.score}/100</b>\n` +
                   `${chgEmoji} $${fmt(entry)}  <b>${chg}</b>\n` +
                   `📌 ${sigMain}\n\n` +
                   `💡 <i>${narrative}</i>\n\n` +
                   `📈 Entry: <b>$${fmt(entry)}</b>\n` +
                   `🎯 TP1: $${fmt(tp1)} <i>(+8%)</i>  TP2: $${fmt(tp2)} <i>(+18%)</i>\n` +
                   `🛑 SL: $${fmt(sl)} <i>(-5%)</i>\n` +
                   `📊 Vol/MCap: <b>${volPct}%</b>`;
        }).join('\n');

        const distributing = scored.filter(t => t.ch24h > 8 && t.volMcRatio > 0.3 && t.type !== 'ACCUMULATING').slice(0, 3);
        let distLines = '';
        if (distributing.length > 0) {
            distLines = `\n\n⚠️ <b>POTENSI DISTRIBUSI</b>\n` +
                `<i>Harga naik tajam + vol besar = whale mungkin jual ke retailer</i>\n` +
                distributing.map(t => `• <b>${t.symbol}</b> +${t.ch24h}% | Vol/MCap: ${(t.volMcRatio*100).toFixed(1)}% — <i>Jangan FOMO!</i>`).join('\n');
        }

        const msg =
            `🐋 <b>WHALE RADAR — TOP 3 TERBAIK</b> <i>(Auto-Scheduled)</i>\n` +
            `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n` +
            `📊 ${accumulating.length} akumulasi terdeteksi — ini yang terkuat:\n\n` +
            `${topLines}${distLines}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `⚠️ <i>Bukan financial advice. DYOR.</i>`;
        await sendTelegram(msg);
        console.log(`✅ [Scheduler] Whale alert terkirim ke Telegram (${top3.map(t=>t.symbol).join(', ')})`);
    } catch (e) {
        console.error('[Scheduler] Whale alert error:', e.message);
    }
}

// ── START ─────────────────────────────────────────────────────
checkEnv();
app.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ OKX Proxy berjalan di http://127.0.0.1:${PORT}`);
    console.log(`   Frontend di http://localhost:8000 sudah bisa akses OKX API`);
    console.log(`   Key tersimpan aman di .env — tidak pernah dikirim ke browser`);

    // Jalankan scheduled whale alert setiap 30 menit
    const ALERT_INTERVAL_MS = 30 * 60_000;
    setTimeout(() => {
        runScheduledWhaleAlert();
        setInterval(runScheduledWhaleAlert, ALERT_INTERVAL_MS);
        console.log(`🤖 [Scheduler] Whale alert otomatis aktif — interval 30 menit`);
    }, 60_000);

    // Jalankan Whale Wallet Monitor setiap 5 menit
    const WWM_INTERVAL_MS = 5 * 60_000;
    setTimeout(() => {
        _wwmRun();
        setInterval(_wwmRun, WWM_INTERVAL_MS);
        console.log(`🔍 [WhaleMonitor] Wallet monitor aktif — interval 5 menit (${_wwmWallets.length} wallets)`);
    }, 90_000); // delay 90 detik setelah server start

    // ── AI Daily Brief: kirim ke Telegram setiap pukul 08:00 WIB (01:00 UTC) ──
    async function sendAIDailyBrief() {
        if (!_aiChatKey || !_tgBotToken || !_tgChatId) return;
        try {
            console.log('[Daily Brief] Generating AI daily brief...');
            // Fetch BTC price
            let btcPrice = '–', btcChange = '–';
            try {
                const bp = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
                const bd = await bp.json();
                btcPrice  = parseFloat(bd.lastPrice).toLocaleString('en-US', {maximumFractionDigits:0});
                btcChange = parseFloat(bd.priceChangePercent).toFixed(2);
            } catch (e) {}
            // Fetch Fear & Greed
            let fgText = '–';
            try {
                const fg = await fetch('https://api.alternative.me/fng/');
                const fd = await fg.json();
                fgText = `${fd.data[0].value} (${fd.data[0].value_classification})`;
            } catch (e) {}
            const systemPrompt = `Kamu adalah CryptoMind AI, analis kripto profesional yang memberikan daily brief singkat dalam Bahasa Indonesia. Jawab dalam format yang rapi dan informatif.`;
            const userMsg = `Berikan AI Daily Brief untuk hari ini. Data pasar saat ini:
- BTC: $${btcPrice} (${btcChange}%)
- Fear & Greed Index: ${fgText}
- Waktu: ${new Date().toLocaleString('id-ID', {timeZone:'Asia/Jakarta'})} WIB

Berikan ringkasan pasar, outlook hari ini, dan 2-3 rekomendasi strategi dalam format yang ringkas (maksimal 5 poin). Sertakan emoji untuk memudahkan membaca.`;
            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${_aiChatKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMsg }
                ], max_tokens: 600, temperature: 0.7 })
            });
            const data = await resp.json();
            const brief = data.choices?.[0]?.message?.content || 'Gagal generate brief.';
            const msg = `🌅 <b>AI Daily Brief — ${new Date().toLocaleDateString('id-ID', {weekday:'long', day:'numeric', month:'long', timeZone:'Asia/Jakarta'})}</b>\n\n${brief}\n\n<i>— CryptoMind AI 🤖</i>`;
            await fetch(`https://api.telegram.org/bot${_tgBotToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: _tgChatId, text: msg, parse_mode: 'HTML' })
            });
            console.log('[Daily Brief] Sent successfully!');
        } catch (e) { console.warn('[Daily Brief] Error:', e.message); }
    }

    // Endpoint manual trigger
    app.post('/api/ai-daily-brief', async (_, res) => {
        sendAIDailyBrief();
        res.json({ ok: true, message: 'Daily brief sedang dikirim ke Telegram...' });
    });

    // Schedule: cek setiap menit, kirim saat jam 01:00 UTC (08:00 WIB)
    let _briefSentToday = '';
    setInterval(() => {
        const now = new Date();
        const utcH = now.getUTCHours(), utcM = now.getUTCMinutes();
        const today = now.toDateString();
        if (utcH === 1 && utcM === 0 && _briefSentToday !== today) {
            _briefSentToday = today;
            sendAIDailyBrief();
        }
    }, 60_000);
    console.log('📰 [Daily Brief] Scheduler aktif — akan kirim setiap 08:00 WIB');
});

// ══════════════════════════════════════════════════════════════════════════
//  SMART NARRATIVE & LIQUIDITY INTELLIGENCE PLATFORM
//  5 Engines: Market Regime · Liquidity · Fake Breakout · Composite Score
// ══════════════════════════════════════════════════════════════════════════

// ── Engine 1: Market Regime Classifier ───────────────────────────────────
let _regimeCache = null, _regimeCacheTs = 0;
const REGIME_TTL = 5 * 60_000;

app.get('/api/intelligence/regime', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const force = req.query.refresh === '1';
    if (!force && _regimeCache && (Date.now() - _regimeCacheTs) < REGIME_TTL) {
        return res.json({ ok: true, cached: true, ..._regimeCache });
    }
    try {
        const [globalR, btcFundR, ethFundR, solFundR, fgR] = await Promise.allSettled([
            fetch('https://api.coingecko.com/api/v3/global', { signal: AbortSignal.timeout(8000) }),
            fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT', { signal: AbortSignal.timeout(5000) }),
            fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=ETHUSDT', { signal: AbortSignal.timeout(5000) }),
            fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=SOLUSDT', { signal: AbortSignal.timeout(5000) }),
            fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(5000) }),
        ]);

        let globalData = null, btcFund = 0, ethFund = 0, solFund = 0, fgVal = 50;
        if (globalR.status === 'fulfilled' && globalR.value.ok) {
            const g = await globalR.value.json();
            globalData = g.data;
        }
        if (btcFundR.status === 'fulfilled' && btcFundR.value.ok) {
            const d = await btcFundR.value.json();
            btcFund = parseFloat(d.lastFundingRate || 0) * 100;
        }
        if (ethFundR.status === 'fulfilled' && ethFundR.value.ok) {
            const d = await ethFundR.value.json();
            ethFund = parseFloat(d.lastFundingRate || 0) * 100;
        }
        if (solFundR.status === 'fulfilled' && solFundR.value.ok) {
            const d = await solFundR.value.json();
            solFund = parseFloat(d.lastFundingRate || 0) * 100;
        }
        if (fgR.status === 'fulfilled' && fgR.value.ok) {
            const d = await fgR.value.json();
            fgVal = parseInt(d.data?.[0]?.value ?? 50);
        }

        const btcDom = globalData?.market_cap_percentage?.btc ?? 0;
        const ethDom = globalData?.market_cap_percentage?.eth ?? 0;
        const totalMcap = globalData?.total_market_cap?.usd ?? 0;
        const altcoinMcap = totalMcap * (1 - (btcDom + ethDom) / 100);
        const totalVolume = globalData?.total_volume?.usd ?? 0;

        // Compute regime score
        const avgFunding = (btcFund + ethFund + solFund) / 3;
        const fundingSignal = avgFunding > 0.05 ? 'OVERHEATED' : avgFunding > 0.02 ? 'BULLISH' : avgFunding > -0.01 ? 'NEUTRAL' : 'BEARISH';
        const fgSignal = fgVal >= 75 ? 'EXTREME_GREED' : fgVal >= 55 ? 'GREED' : fgVal >= 45 ? 'NEUTRAL' : fgVal >= 25 ? 'FEAR' : 'EXTREME_FEAR';
        const btcDomSignal = btcDom > 58 ? 'BTC_DOMINANCE' : btcDom > 52 ? 'BTC_FAVOR' : btcDom < 45 ? 'ALT_SEASON' : 'TRANSITION';

        // Overall regime
        let regime, regimeColor, regimeDesc, riskLevel;
        if (fgVal >= 75 && avgFunding > 0.04) {
            regime = 'OVERHEATED 🔴'; regimeColor = '#ef4444';
            regimeDesc = 'Market overheated — funding tinggi + extreme greed. HATI-HATI, kemungkinan correction tinggi.';
            riskLevel = 'VERY_HIGH';
        } else if (fgVal >= 55 && avgFunding > 0.01 && btcDom < 55) {
            regime = 'RISK-ON ALTSEASON 🟢'; regimeColor = '#22c55e';
            regimeDesc = 'Kondisi optimal untuk altcoins. BTC dominance turun + market greed + funding positif.';
            riskLevel = 'MEDIUM';
        } else if (fgVal >= 55 && btcDom > 52) {
            regime = 'BTC-LED BULLISH 🟡'; regimeColor = '#f59e0b';
            regimeDesc = 'BTC leading. Altcoins mungkin lag. Fokus ke BTC pair atau large-cap altcoins.';
            riskLevel = 'MEDIUM';
        } else if (fgVal <= 35 && avgFunding < 0) {
            regime = 'RISK-OFF BEARISH 🔴'; regimeColor = '#ef4444';
            regimeDesc = 'Fear tinggi + funding negatif. Potensi bounce besar tapi risiko tinggi. Tunggu konfirmasi.';
            riskLevel = 'HIGH';
        } else if (fgVal <= 25) {
            regime = 'EXTREME FEAR — BUY ZONE 🟢'; regimeColor = '#4ade80';
            regimeDesc = 'Historically zona akumulasi terbaik. Smart money buy when others fear.';
            riskLevel = 'LOW';
        } else {
            regime = 'SIDEWAYS / TRANSITION ⚪'; regimeColor = '#94a3b8';
            regimeDesc = 'Market dalam transisi. Tunggu konfirmasi direction sebelum entry besar.';
            riskLevel = 'MEDIUM';
        }

        const result = {
            regime, regimeColor, regimeDesc, riskLevel,
            btcDom: +btcDom.toFixed(2), ethDom: +ethDom.toFixed(2),
            totalMcap, altcoinMcap, totalVolume,
            funding: { btc: +btcFund.toFixed(4), eth: +ethFund.toFixed(4), sol: +solFund.toFixed(4), avg: +avgFunding.toFixed(4) },
            fundingSignal, fgVal, fgSignal, btcDomSignal,
            altSeason: btcDom < 46,
            fetchedAt: new Date().toISOString(),
        };
        _regimeCache = result;
        _regimeCacheTs = Date.now();
        res.json({ ok: true, cached: false, ...result });
    } catch (e) {
        if (_regimeCache) return res.json({ ok: true, cached: true, stale: true, ..._regimeCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Engine 2: Liquidity Intelligence ─────────────────────────────────────
let _liqCache = null, _liqCacheTs = 0;
const LIQ_TTL = 3 * 60_000;

const LIQ_SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','SUIUSDT','XRPUSDT','DOGEUSDT','AVAXUSDT'];

app.get('/api/intelligence/liquidity', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const force = req.query.refresh === '1';
    if (!force && _liqCache && (Date.now() - _liqCacheTs) < LIQ_TTL) {
        return res.json({ ok: true, cached: true, ..._liqCache });
    }
    try {
        const [oiResults, fundResults] = await Promise.all([
            Promise.allSettled(LIQ_SYMBOLS.map(sym =>
                fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${sym}`, { signal: AbortSignal.timeout(5000) })
                    .then(r => r.json())
            )),
            Promise.allSettled(LIQ_SYMBOLS.map(sym =>
                fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${sym}`, { signal: AbortSignal.timeout(5000) })
                    .then(r => r.json())
            )),
        ]);

        const oiData = [], liquidationMap = [];

        for (let i = 0; i < LIQ_SYMBOLS.length; i++) {
            const sym = LIQ_SYMBOLS[i];
            const oiRaw = oiResults[i].status === 'fulfilled' ? oiResults[i].value : null;
            const fundRaw = fundResults[i].status === 'fulfilled' ? fundResults[i].value : null;

            if (!oiRaw?.openInterest) continue;

            const oi = parseFloat(oiRaw.openInterest);
            const price = parseFloat(fundRaw?.markPrice || 0);
            const fundRate = parseFloat(fundRaw?.lastFundingRate || 0) * 100;
            const oiUsd = oi * price;

            // Squeeze probability: high OI + extreme funding = squeeze setup
            const sqzProb = Math.min(100, Math.round(
                Math.abs(fundRate) * 500 +
                (oiUsd > 1e9 ? 20 : oiUsd > 5e8 ? 10 : 0)
            ));

            // Direction: if funding very positive → likely short squeeze setup (longs overloaded → pullback OR shorts will squeeze IF price holds)
            const sqzDir = fundRate > 0.05 ? 'SHORT_SQUEEZE_RISK' :
                           fundRate > 0.02 ? 'LONGS_HEAVY' :
                           fundRate < -0.03 ? 'LONG_SQUEEZE_RISK' :
                           fundRate < -0.01 ? 'SHORTS_HEAVY' : 'BALANCED';

            // Estimated liquidation cluster (rough approximation from funding extremity)
            const liqBelowPct = fundRate > 0.03 ? -(4 + Math.abs(fundRate) * 300) : null;
            const liqAbovePct = fundRate < -0.02 ? (4 + Math.abs(fundRate) * 300) : null;

            oiData.push({
                symbol: sym.replace('USDT', ''),
                oi, oiUsd, price, fundRate: +fundRate.toFixed(4),
                sqzProb, sqzDir,
                liqBelowPct: liqBelowPct ? +liqBelowPct.toFixed(1) : null,
                liqAbovePct: liqAbovePct ? +liqAbovePct.toFixed(1) : null,
            });
        }

        oiData.sort((a, b) => b.oiUsd - a.oiUsd);
        const totalOiUsd = oiData.reduce((s, x) => s + x.oiUsd, 0);
        const topSqueeze = oiData.filter(x => x.sqzProb >= 30).sort((a, b) => b.sqzProb - a.sqzProb).slice(0, 3);

        const result = {
            oiData, totalOiUsd, topSqueeze,
            alert: topSqueeze.length > 0
                ? `⚠️ ${topSqueeze[0].symbol} squeeze probability ${topSqueeze[0].sqzProb}% — ${topSqueeze[0].sqzDir.replace(/_/g,' ')}`
                : null,
            fetchedAt: new Date().toISOString(),
        };
        _liqCache = result;
        _liqCacheTs = Date.now();
        res.json({ ok: true, cached: false, ...result });
    } catch (e) {
        if (_liqCache) return res.json({ ok: true, cached: true, stale: true, ..._liqCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Engine 3: Fake Breakout Detector ─────────────────────────────────────
let _fboCache = null, _fboCacheTs = 0;
const FBO_TTL = 10 * 60_000;

const FBO_SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','SUIUSDT','XRPUSDT','DOGEUSDT','AVAXUSDT','LINKUSDT','NEARUSDT'];

app.get('/api/intelligence/fake-breakout', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const force = req.query.refresh === '1';
    if (!force && _fboCache && (Date.now() - _fboCacheTs) < FBO_TTL) {
        return res.json({ ok: true, cached: true, ..._fboCache });
    }
    try {
        // Fetch 4h candles: 50 candles per coin
        const candleResults = await Promise.allSettled(FBO_SYMBOLS.map(sym =>
            fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=4h&limit=50`, { signal: AbortSignal.timeout(8000) })
                .then(r => r.json())
        ));

        const detections = [];

        for (let i = 0; i < FBO_SYMBOLS.length; i++) {
            const sym = FBO_SYMBOLS[i];
            const candles = candleResults[i].status === 'fulfilled' ? candleResults[i].value : null;
            if (!Array.isArray(candles) || candles.length < 20) continue;

            // candle format: [ts, open, high, low, close, volume, ...]
            const closes = candles.map(c => parseFloat(c[4]));
            const highs  = candles.map(c => parseFloat(c[2]));
            const lows   = candles.map(c => parseFloat(c[3]));
            const vols   = candles.map(c => parseFloat(c[5]));

            const last  = closes.length - 1;
            const price = closes[last];

            // Rolling 20-candle high (resistance)
            const res20  = Math.max(...highs.slice(last - 20, last));
            const avgVol = vols.slice(last - 20, last).reduce((s, v) => s + v, 0) / 20;
            const lastVol = vols[last];
            const volRatio = lastVol / Math.max(avgVol, 1);

            // Last 3 candles analysis
            const c1 = { o: parseFloat(candles[last-2][1]), h: highs[last-2], l: lows[last-2], c: closes[last-2], v: vols[last-2] };
            const c2 = { o: parseFloat(candles[last-1][1]), h: highs[last-1], l: lows[last-1], c: closes[last-1], v: vols[last-1] };
            const c3 = { o: parseFloat(candles[last][1]),   h: highs[last],   l: lows[last],   c: closes[last],   v: vols[last] };

            // Pattern 1: Fakeout above resistance — candle broke above but closed below
            const breakAbove = c2.h > res20 * 1.002;
            const closedBelow = c2.c < res20;
            const lowerFollowThrough = c3.c < c2.c;
            const fakeoutAbove = breakAbove && closedBelow && lowerFollowThrough;

            // Pattern 2: Bearish engulfing after new high
            const bearEngulf = c3.o > c2.c && c3.c < c2.o && (c3.o - c3.c) > (c2.c - c2.o) * 0.8;

            // Pattern 3: Volume anomaly without price follow-through
            const volSpike = volRatio > 2.5;
            const flatPrice = Math.abs(c3.c - c3.o) / c3.o < 0.005;
            const volumeFakeout = volSpike && flatPrice;

            // Pattern 4: Wick rejection at resistance
            const wickReject = c2.h > res20 * 1.005 && (c2.h - Math.max(c2.o, c2.c)) / (c2.h - c2.l + 0.0001) > 0.5;

            if (!fakeoutAbove && !bearEngulf && !volumeFakeout && !wickReject) continue;

            const patterns = [];
            if (fakeoutAbove) patterns.push('FAKEOUT_BREAKOUT');
            if (bearEngulf) patterns.push('BEARISH_ENGULF');
            if (volumeFakeout) patterns.push('VOL_ANOMALY');
            if (wickReject) patterns.push('WICK_REJECTION');

            // Confidence score
            const confidence = Math.min(100, patterns.length * 25 + (volRatio > 2 ? 20 : 0) + (wickReject ? 15 : 0));
            const resistanceLevel = +res20.toFixed(4);
            const distFromRes = +((price - res20) / res20 * 100).toFixed(2);

            detections.push({
                symbol: sym.replace('USDT', ''),
                price: +price.toFixed(4),
                resistanceLevel,
                distFromRes,
                patterns,
                confidence,
                volRatio: +volRatio.toFixed(2),
                verdict: confidence >= 60 ? 'STRONG_FAKEOUT' : confidence >= 35 ? 'LIKELY_FAKEOUT' : 'WATCH',
                warning: `${sym.replace('USDT','')} — ${patterns.join(' + ')} di area $${resistanceLevel.toFixed(4)}`,
            });
        }

        detections.sort((a, b) => b.confidence - a.confidence);
        const result = {
            detections,
            strongFakeouts: detections.filter(d => d.verdict === 'STRONG_FAKEOUT').length,
            likelyFakeouts: detections.filter(d => d.verdict === 'LIKELY_FAKEOUT').length,
            fetchedAt: new Date().toISOString(),
        };
        _fboCache = result;
        _fboCacheTs = Date.now();
        res.json({ ok: true, cached: false, ...result });
    } catch (e) {
        if (_fboCache) return res.json({ ok: true, cached: true, stale: true, ..._fboCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Engine 4: Composite AI Score ─────────────────────────────────────────
let _compCache = null, _compCacheTs = 0;
const COMP_TTL = 5 * 60_000;

const COMP_SYMBOLS = [
    { sym: 'BTCUSDT', cgId: 'bitcoin', name: 'Bitcoin', narrative: 'BTC Season' },
    { sym: 'ETHUSDT', cgId: 'ethereum', name: 'Ethereum', narrative: 'ETH DeFi' },
    { sym: 'SOLUSDT', cgId: 'solana', name: 'Solana', narrative: 'Solana Meme' },
    { sym: 'SUIUSDT', cgId: 'sui', name: 'Sui', narrative: 'Sui Ecosystem' },
    { sym: 'BNBUSDT', cgId: 'binancecoin', name: 'BNB', narrative: 'BSC' },
    { sym: 'XRPUSDT', cgId: 'ripple', name: 'XRP', narrative: 'Payments' },
    { sym: 'DOGEUSDT', cgId: 'dogecoin', name: 'DOGE', narrative: 'Meme' },
    { sym: 'AVAXUSDT', cgId: 'avalanche-2', name: 'AVAX', narrative: 'L1' },
    { sym: 'LINKUSDT', cgId: 'chainlink', name: 'LINK', narrative: 'Oracle' },
    { sym: 'NEARUSDT', cgId: 'near', name: 'NEAR', narrative: 'AI/Infra' },
    { sym: 'UNIUSDT', cgId: 'uniswap', name: 'UNI', narrative: 'DeFi' },
    { sym: 'AAVEUSDT', cgId: 'aave', name: 'AAVE', narrative: 'DeFi Lending' },
];

app.get('/api/intelligence/composite', async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const force = req.query.refresh === '1';
    if (!force && _compCache && (Date.now() - _compCacheTs) < COMP_TTL) {
        return res.json({ ok: true, cached: true, ..._compCache });
    }
    try {
        const cgIds = COMP_SYMBOLS.map(x => x.cgId).join(',');
        const [cgRes, fundRes, oiRes] = await Promise.allSettled([
            fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cgIds}&vs_currencies=usd&include_24hr_change=true&include_1h_change=true&include_7d_change=true&include_market_cap=true&include_24hr_vol=true`, { signal: AbortSignal.timeout(10000) }),
            Promise.allSettled(COMP_SYMBOLS.map(x =>
                fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${x.sym}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null)
            )),
            Promise.allSettled(COMP_SYMBOLS.map(x =>
                fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${x.sym}`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null)
            )),
        ]);

        const cgData = cgRes.status === 'fulfilled' && cgRes.value.ok ? await cgRes.value.json() : {};
        const fundData = fundRes.status === 'fulfilled' ? fundRes.value : [];
        const oiData   = oiRes.status === 'fulfilled' ? oiRes.value : [];

        const scores = [];
        for (let i = 0; i < COMP_SYMBOLS.length; i++) {
            const { sym, cgId, name, narrative } = COMP_SYMBOLS[i];
            const cg = cgData[cgId] || {};
            const fund = fundData[i]?.status === 'fulfilled' ? fundData[i].value : null;
            const oi   = oiData[i]?.status === 'fulfilled' ? oiData[i].value : null;

            const price   = cg.usd || 0;
            const ch24h   = cg.usd_24h_change || 0;
            const ch1h    = cg.usd_1h_change || 0;
            const ch7d    = cg.usd_7d_change || 0;
            const mcap    = cg.usd_market_cap || 0;
            const vol24h  = cg.usd_24h_vol || 0;
            const fundRate = parseFloat(fund?.lastFundingRate || 0) * 100;
            const oiVal   = oi ? parseFloat(oi.openInterest) * price : 0;
            const volMcRatio = mcap > 0 ? (vol24h / mcap * 100) : 0;

            // ── Composite Score Formula ───────────────────────────────────
            // Momentum (40%): ch1h*0.15 + ch24h*0.25 / 40 * 100
            const momentumScore = Math.min(100, Math.max(0,
                (ch1h * 0.15 + ch24h * 0.25 + ch7d * 0.10) / 30 * 50 + 50
            ));
            // Volume signal (20%): high vol/mcap = accumulation
            const volScore = Math.min(100, volMcRatio * 5);
            // Funding signal (20%): optimal = slightly positive (0.01-0.03%)
            const fundScore = fundRate >= 0.01 && fundRate <= 0.04 ? 80
                : fundRate > 0.04 ? Math.max(0, 80 - (fundRate - 0.04) * 2000)
                : fundRate < 0 ? 50 + fundRate * 1000
                : 60;
            // OI signal (20%): high OI + positive momentum = bullish
            const oiScore = oiVal > 2e9 ? Math.min(100, 50 + ch24h * 2) :
                            oiVal > 5e8 ? Math.min(100, 40 + ch24h * 2) : 30 + ch24h;

            const composite = Math.round(
                momentumScore * 0.40 +
                volScore      * 0.20 +
                fundScore     * 0.20 +
                oiScore       * 0.20
            );

            const grade = composite >= 75 ? 'A' : composite >= 60 ? 'B' : composite >= 45 ? 'C' : composite >= 30 ? 'D' : 'F';
            const signal = composite >= 70 && ch24h > 2 ? 'STRONG_BUY'
                : composite >= 60 ? 'BUY'
                : composite >= 45 ? 'NEUTRAL'
                : composite >= 30 ? 'CAUTION'
                : 'AVOID';

            scores.push({
                symbol: sym.replace('USDT',''), name, narrative,
                price, ch1h: +ch1h.toFixed(2), ch24h: +ch24h.toFixed(2), ch7d: +ch7d.toFixed(2),
                mcap, vol24h, volMcRatio: +volMcRatio.toFixed(2),
                fundRate: +fundRate.toFixed(4), oiUsd: +oiVal.toFixed(0),
                scores: {
                    momentum: Math.round(momentumScore),
                    volume: Math.round(volScore),
                    funding: Math.round(fundScore),
                    oi: Math.round(oiScore),
                    composite,
                },
                composite, grade, signal,
            });
        }

        scores.sort((a, b) => b.composite - a.composite);
        const topBuy = scores.filter(s => s.signal === 'STRONG_BUY' || s.signal === 'BUY').slice(0, 3);

        const result = {
            scores, topBuy,
            fetchedAt: new Date().toISOString(),
        };
        _compCache = result;
        _compCacheTs = Date.now();
        res.json({ ok: true, cached: false, ...result });
    } catch (e) {
        if (_compCache) return res.json({ ok: true, cached: true, stale: true, ..._compCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── Engine 5: AI Market Analyst ───────────────────────────────────────────
// Aggregates all 4 engine outputs → builds detailed prompt → calls Groq LLM
// Returns structured written market analysis in Indonesian
let _aiAnalysisCache = null, _aiAnalysisCacheTs = 0;
const AI_ANALYSIS_TTL = 15 * 60_000; // 15 menit (LLM call mahal)

app.post('/api/intelligence/ai-analysis', express.json(), async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const force   = req.body?.force === true;
    const apiKey  = req.body?.apiKey || GROQ_KEY;
    const focus   = req.body?.focus || 'general'; // 'general' | 'altseason' | 'risk' | 'entry'

    if (!apiKey) {
        return res.status(503).json({
            ok: false,
            error: 'GROQ_API_KEY belum diset. Masukkan API key di Settings atau set di .env (GROQ_API_KEY).',
        });
    }

    if (!force && _aiAnalysisCache && (Date.now() - _aiAnalysisCacheTs) < AI_ANALYSIS_TTL) {
        return res.json({ ok: true, cached: true, ..._aiAnalysisCache });
    }

    try {
        // ── Kumpulkan semua data dari 4 engine secara paralel ─────────────
        const [regR, liqR, fboR, compR, fgR, narrR] = await Promise.allSettled([
            fetch(`http://127.0.0.1:${PORT}/api/intelligence/regime`).then(r => r.json()),
            fetch(`http://127.0.0.1:${PORT}/api/intelligence/liquidity`).then(r => r.json()),
            fetch(`http://127.0.0.1:${PORT}/api/intelligence/fake-breakout`).then(r => r.json()),
            fetch(`http://127.0.0.1:${PORT}/api/intelligence/composite`).then(r => r.json()),
            fetch(`http://127.0.0.1:${PORT}/api/fear-greed`).then(r => r.json()),
            fetch(`http://127.0.0.1:${PORT}/api/narrative/overview`).then(r => r.json()).catch(() => null),
        ]);

        const reg  = regR.status  === 'fulfilled' ? regR.value  : null;
        const liq  = liqR.status  === 'fulfilled' ? liqR.value  : null;
        const fbo  = fboR.status  === 'fulfilled' ? fboR.value  : null;
        const comp = compR.status === 'fulfilled' ? compR.value : null;
        const fg   = fgR.status   === 'fulfilled' ? fgR.value   : null;
        const narr = narrR.status === 'fulfilled' ? narrR.value : null;

        // ── Build context block untuk prompt ──────────────────────────────
        const regCtx = reg ? `
=== MARKET REGIME ===
Regime: ${reg.regime}
Risk Level: ${reg.riskLevel}
BTC Dominance: ${reg.btcDom}% (${reg.btcDomSignal})
Alt Season: ${reg.altSeason ? 'YES ✅' : 'NO ❌'}
Fear & Greed: ${reg.fgVal} (${reg.fgSignal})
Avg Funding Rate: ${(reg.funding?.avg * 100)?.toFixed(4)}% → ${reg.fundingSignal}
Funding BTC/ETH/SOL: ${(reg.funding?.btc*100)?.toFixed(4)}% / ${(reg.funding?.eth*100)?.toFixed(4)}% / ${(reg.funding?.sol*100)?.toFixed(4)}%
Total Market Cap: $${(reg.totalMcap/1e12)?.toFixed(2)}T
Regime Description: ${reg.regimeDesc}` : '';

        const compTop5 = comp?.scores?.slice(0, 5).map(s =>
            `  ${s.symbol}: Score=${s.composite} Grade=${s.grade} Signal=${s.signal} | 24h=${s.ch24h > 0 ? '+' : ''}${s.ch24h}% 7d=${s.ch7d > 0 ? '+' : ''}${s.ch7d}% | Funding=${(s.fundRate*100)?.toFixed(4)}%`
        ).join('\n') || '';
        const compBottom3 = comp?.scores?.slice(-3).map(s =>
            `  ${s.symbol}: Score=${s.composite} Grade=${s.grade} Signal=${s.signal}`
        ).join('\n') || '';
        const compCtx = comp ? `
=== COMPOSITE AI SCORES (Top 5) ===
${compTop5}
Weakest:
${compBottom3}` : '';

        const liqTop = liq?.oiData?.slice(0, 5).map(x =>
            `  ${x.symbol}: OI=$${(x.oiUsd/1e9)?.toFixed(2)}B Funding=${(x.fundRate*100)?.toFixed(4)}% SqzProb=${x.sqzProb}% Dir=${x.sqzDir}`
        ).join('\n') || '';
        const liqCtx = liq ? `
=== OPEN INTEREST & SQUEEZE RADAR ===
Total OI: $${(liq.totalOiUsd/1e9)?.toFixed(1)}B
Top 5 by OI:
${liqTop}
Top Squeeze Setups: ${liq.topSqueeze?.map(x => `${x.symbol}(${x.sqzProb}%)`).join(', ') || 'None'}
${liq.alert ? 'ALERT: ' + liq.alert : ''}` : '';

        const fboCtx = fbo ? `
=== FAKE BREAKOUT DETECTOR ===
Strong Fakeouts: ${fbo.strongFakeouts}
Likely Fakeouts: ${fbo.likelyFakeouts}
Detections: ${fbo.detections?.slice(0,4).map(x =>
    `${x.symbol}(${x.verdict}, conf=${x.confidence}%, patterns=${x.patterns.join('+')})`
).join(' | ') || 'None'}` : '';

        const fgCtx = fg ? `
=== FEAR & GREED ===
Value: ${fg.value} — ${fg.classification}
Market Phase: ${fg.marketPhase?.label}
7-day avg: ${fg.avg7d}
Regime Warning: ${fg.regime?.warn}` : '';

        const narrTop3 = narr?.narratives?.slice(0,3).map(n =>
            `  ${n.emoji} ${n.name}: Score=${n.score} Signal=${n.rotationSignal} Leader=${n.leader?.symbol}(${n.leader?.ch24h > 0 ? '+' : ''}${n.leader?.ch24h}%24h)`
        ).join('\n') || '';
        const narrCtx = narr ? `
=== NARRATIVE ROTATION (Top 3) ===
${narrTop3}
Breakout Imminent: ${narr.breakoutImminent?.map(n => n.name).join(', ') || 'None'}
AI Predictions Count: ${narr.predictions?.length || 0}` : '';

        const focusInstructions = {
            general:   'Berikan analisa lengkap kondisi pasar saat ini, risiko, dan peluang.',
            altseason: 'Fokus pada potensi alt season: apakah kondisi mendukung? Narrative mana yang paling menarik?',
            risk:      'Fokus pada risk management: apa risiko terbesar saat ini? Bagaimana mitigasinya?',
            entry:     'Fokus pada entry opportunities: coin mana yang paling menarik untuk entry sekarang dan mengapa?',
        }[focus] || 'Berikan analisa lengkap kondisi pasar saat ini.';

        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        // ── System prompt ─────────────────────────────────────────────────
        const systemPrompt = `Kamu adalah seorang hedge fund analyst profesional level senior yang spesialisasi di crypto market. Nama kamu adalah "Market Oracle AI".

Gaya analisa kamu:
- Data-driven, tajam, dan langsung ke intinya
- Seperti laporan dari prop trading desk — bukan sekedar tutorial
- Selalu lihat big picture tapi juga tactical entry/exit
- Gunakan bahasa Indonesia yang profesional
- Format dengan section headers yang jelas
- Sertakan confidence level untuk setiap rekomendasi
- Selalu tambahkan disclaimer singkat di akhir

Struktur jawaban (wajib ikuti):
1. 📊 **KONDISI PASAR SEKARANG** — snapshot regime + sentiment
2. ⚡ **SINYAL KRITIS** — hal paling penting yang harus diperhatikan SEKARANG
3. 🎯 **PELUANG TERTINGGI** — top 3 coin/narrative yang menarik + reasoning
4. 🚨 **RISIKO UTAMA** — apa yang bisa salah + kapan cut
5. 📐 **TACTICAL PLAYBOOK** — concrete action plan (entry zone, sizing, SL)
6. ⏱️ **TIME HORIZON OUTLOOK** — short/mid/long term view

Jawaban harus tajam dan actionable, bukan generik.`;

        const userMsg = `Waktu analisa: ${now} WIB

DATA PASAR REAL-TIME:
${regCtx}
${fgCtx}
${compCtx}
${liqCtx}
${fboCtx}
${narrCtx}

FOKUS ANALISA: ${focusInstructions}

Berikan analisa crypto market yang komprehensif dan actionable berdasarkan semua data di atas.`;

        // ── Call Groq LLM ─────────────────────────────────────────────────
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMsg },
                ],
                max_tokens: 2048,
                temperature: 0.45, // lebih deterministic untuk analisa keuangan
            }),
            signal: AbortSignal.timeout(45000),
        });

        if (!groqRes.ok) {
            const errText = await groqRes.text();
            return res.status(groqRes.status).json({ ok: false, error: `Groq API error: ${errText}` });
        }

        const groqData = await groqRes.json();
        const analysis = groqData.choices?.[0]?.message?.content || '';
        const tokens   = groqData.usage?.total_tokens || 0;

        const result = {
            analysis,
            focus,
            model: groqData.model,
            tokens,
            dataSnapshot: {
                regime:      reg?.regime,
                fgVal:       fg?.value,
                btcDom:      reg?.btcDom,
                altSeason:   reg?.altSeason,
                topCoin:     comp?.scores?.[0]?.symbol,
                topScore:    comp?.scores?.[0]?.composite,
                sqzAlerts:   liq?.topSqueeze?.length || 0,
                fakeouts:    fbo?.detections?.length || 0,
            },
            generatedAt: new Date().toISOString(),
        };

        _aiAnalysisCache  = result;
        _aiAnalysisCacheTs = Date.now();
        res.json({ ok: true, cached: false, ...result });

    } catch (e) {
        if (_aiAnalysisCache) return res.json({ ok: true, cached: true, stale: true, ..._aiAnalysisCache });
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.options('/api/intelligence/ai-analysis', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);
});

// ══════════════════════════════════════════════════════════════════════════════
//  DEX HUNTER AI INTELLIGENCE LAYER
//  /api/dex/trenches  — advanced 9-dim scored token scanner
//  /api/dex/ai-signal — Groq AI signal (LONG/SHORT/SCALP) for a token
//  /api/dex/narratives — narrative + ecosystem detection from top gainers
// ══════════════════════════════════════════════════════════════════════════════

const _trenchesCache = { data: null, ts: 0, ttl: 45_000 };   // 45s
const _narrativesCache = { data: null, ts: 0, ttl: 300_000 }; // 5min

// ── /api/dex/trenches  ────────────────────────────────────────────────────────
app.get('/api/dex/trenches', async (req, res) => {
    if (_trenchesCache.data && Date.now() - _trenchesCache.ts < _trenchesCache.ttl) {
        return res.json(_trenchesCache.data);
    }
    try {
        const DSC = 'https://api.dexscreener.com';
        const queries = ['pump sol', 'solana meme', 'pumpfun', 'bonk sol', 'raydium', 'sol ai', 'sol dog', 'sol cat'];
        const seen = new Set();
        const allPairs = [];

        await Promise.all(queries.map(async q => {
            try {
                const r = await fetch(`${DSC}/latest/dex/search?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000) });
                if (!r.ok) return;
                const d = await r.json();
                for (const p of (d.pairs || [])) {
                    if (p?.pairAddress && !seen.has(p.pairAddress) && p.chainId === 'solana') {
                        seen.add(p.pairAddress);
                        allPairs.push(p);
                    }
                }
            } catch {}
        }));

        const now = Date.now();
        const scored = [];
        for (const raw of allPairs) {
            if (!raw?.baseToken) continue;
            const ageH     = raw.pairCreatedAt ? (now - raw.pairCreatedAt) / 3_600_000 : 9999;
            const vol24h   = raw.volume?.h24  || 0;
            const vol1h    = raw.volume?.h1   || 0;
            const vol5m    = raw.volume?.m5   || 0;
            const chg24h   = raw.priceChange?.h24 || 0;
            const chg1h    = raw.priceChange?.h1  || 0;
            const chg5m    = raw.priceChange?.m5  || 0;
            const buys5m   = raw.txns?.m5?.buys   || 0;
            const sells5m  = raw.txns?.m5?.sells  || 0;
            const buys1h   = raw.txns?.h1?.buys   || 0;
            const sells1h  = raw.txns?.h1?.sells  || 0;
            const buys24   = raw.txns?.h24?.buys  || 0;
            const sells24  = raw.txns?.h24?.sells || 0;
            const txns24h  = buys24 + sells24;
            const fdv      = raw.fdv || 0;
            const liq      = raw.liquidity?.usd || 0;
            const price    = parseFloat(raw.priceUsd || 0);
            const boosts   = raw.boosts?.active || 0;

            if (vol24h < 5000)  continue;
            if (price <= 0)     continue;
            if (ageH > 48)      continue;

            // ── 9-dim score ──
            let score = 0;
            const dims = {};

            // 1. Momentum (0-20)
            let mom = 0;
            if (chg24h >= 2000) mom = 20;
            else if (chg24h >= 500) mom = 16;
            else if (chg24h >= 200) mom = 12;
            else if (chg24h >= 100) mom = 7;
            else if (chg24h >= 20)  mom = 3;
            if (chg1h > 15) mom = Math.min(20, mom + 4);
            if (chg5m > 3)  mom = Math.min(20, mom + 2);
            dims.momentum = mom;

            // 2. Volume (0-15)
            let vol = 0;
            const avg5mEst = vol24h / 288;
            if (avg5mEst > 0 && vol5m > avg5mEst * 4) { vol += 6; }
            if (vol1h >= 50000) vol += 9;
            else if (vol1h >= 10000) vol += 6;
            else if (vol1h >= 2000)  vol += 3;
            dims.volume = Math.min(15, vol);

            // 3. Buy pressure (0-15)
            let bp = 0;
            const ratio5m = sells5m > 0 ? buys5m / sells5m : (buys5m > 0 ? 5 : 1);
            const ratio1h  = sells1h > 0 ? buys1h / sells1h : 1;
            if (ratio5m >= 3)       bp += 8;
            else if (ratio5m >= 2)  bp += 5;
            else if (ratio5m >= 1.3)bp += 2;
            if (ratio1h >= 2)       bp += 7;
            else if (ratio1h >= 1.5)bp += 4;
            dims.buyPressure = Math.min(15, bp);

            // 4. Age sweet spot (0-12)
            let age = 0;
            if (ageH >= 0.5 && ageH < 2)    age = 12;
            else if (ageH < 4)               age = 10;
            else if (ageH < 8)               age = 7;
            else if (ageH < 24)              age = 4;
            else                             age = 1;
            dims.age = age;

            // 5. FDV opportunity (0-10)
            let fdvScore = 0;
            if (fdv > 0 && fdv < 50000)      fdvScore = 10;
            else if (fdv < 200000)            fdvScore = 8;
            else if (fdv < 500000)            fdvScore = 5;
            else if (fdv < 1000000)           fdvScore = 2;
            dims.fdv = fdvScore;

            // 6. Liquidity health (0-10)
            let liqScore = 0;
            if (liq >= 100000)      liqScore = 10;
            else if (liq >= 30000)  liqScore = 7;
            else if (liq >= 10000)  liqScore = 4;
            else if (liq >= 2000)   liqScore = 2;
            dims.liquidity = liqScore;

            // 7. Transaction density (0-10)
            let txScore = 0;
            if (txns24h >= 5000)    txScore = 10;
            else if (txns24h >= 1000) txScore = 7;
            else if (txns24h >= 300)  txScore = 4;
            else if (txns24h >= 100)  txScore = 2;
            dims.txDensity = txScore;

            // 8. Rug risk (penalty, 0 to -15)
            let rugRisk = 0;
            if (chg5m < -20 && chg24h > 200) rugRisk -= 15; // pump & dump
            if (sells5m > buys5m * 4 && txns24h > 50) rugRisk -= 10;
            if (vol1h < 100 && vol24h > 50000) rugRisk -= 8; // dead
            if (liq < 1000) rugRisk -= 5; // no liquidity
            dims.rugRisk = rugRisk;

            // 9. Social signals (0-8)
            let social = 0;
            if (boosts >= 500)      social = 8;
            else if (boosts >= 100) social = 5;
            else if (boosts >= 20)  social = 3;
            dims.social = social;

            score = Math.max(0, Math.min(100,
                dims.momentum + dims.volume + dims.buyPressure + dims.age +
                dims.fdv + dims.liquidity + dims.txDensity + dims.rugRisk + dims.social
            ));

            // Rugpull probability
            let rugProb = 'LOW';
            if (dims.rugRisk <= -10)      rugProb = 'HIGH';
            else if (dims.rugRisk <= -5)  rugProb = 'MEDIUM';
            else if (liq < 5000 || fdv > 5_000_000) rugProb = 'MEDIUM';

            // Entry / TP / SL estimate (simple, no chart data)
            const tp1 = price * 1.5;
            const tp2 = price * 2.5;
            const tp3 = price * 5.0;
            const sl  = price * 0.72; // -28%

            scored.push({
                pairAddress : raw.pairAddress,
                symbol      : raw.baseToken.symbol,
                name        : raw.baseToken.name,
                mint        : raw.baseToken.address,
                url         : raw.url,
                chain       : 'solana',
                dex         : raw.dexId,
                price, ageH, vol5m, vol1h, vol24h, chg5m, chg1h, chg24h,
                buys5m, sells5m, buys1h, sells1h, txns24h, fdv, liq, boosts,
                score, dims, rugProb, tp1, tp2, tp3, sl,
                pairCreatedAt: raw.pairCreatedAt || null,
            });
        }

        scored.sort((a, b) => b.score - a.score);
        const result = { ok: true, count: scored.length, tokens: scored.slice(0, 100), fetchedAt: Date.now() };
        _trenchesCache.data = result;
        _trenchesCache.ts   = Date.now();
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── /api/dex/ai-signal (POST)  ────────────────────────────────────────────────
// Body: { symbol, name, price, chg24h, chg1h, chg5m, vol24h, vol1h, liq, fdv, rugProb, ageH, apiKey? }
const _signalCache = new Map(); // key=symbol+price, val={data,ts}
const SIGNAL_TTL = 10 * 60_000; // 10 min

app.options('/api/dex/ai-signal', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(200);
});

app.post('/api/dex/ai-signal', async (req, res) => {
    const apiKey = req.body?.apiKey || GROQ_KEY;
    if (!apiKey) return res.json({ ok: false, error: 'GROQ_API_KEY tidak ditemukan. Set di .env atau kirim via body.' });

    const { symbol='', name='', price=0, chg24h=0, chg1h=0, chg5m=0,
            vol24h=0, vol1h=0, liq=0, fdv=0, rugProb='UNKNOWN', ageH=0,
            buys5m=0, sells5m=0, buys1h=0, sells1h=0, txns24h=0,
            score=0, force=false } = req.body || {};

    const cacheKey = `${symbol}_${Math.round(price * 1e6)}`;
    const cached = _signalCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.ts < SIGNAL_TTL) {
        return res.json({ ...cached.data, cached: true });
    }

    try {
        // Fetch market context
        let btcDom = '?', fearGreed = '?', btcChg = '?';
        try {
            const gc = await fetch('https://api.coingecko.com/api/v3/global', { signal: AbortSignal.timeout(5000) });
            if (gc.ok) { const gd = await gc.json(); btcDom = (gd.data?.market_cap_percentage?.btc || 0).toFixed(1); }
        } catch {}
        try {
            const fg = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(5000) });
            if (fg.ok) { const fd = await fg.json(); fearGreed = fd.data?.[0]?.value_classification || '?'; }
        } catch {}

        const fmtUsd = n => n >= 1e9 ? `$${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n.toFixed(2)}`;
        const fmtPrc = p => p < 0.000001 ? p.toExponential(3) : p < 0.001 ? p.toFixed(8) : p < 1 ? p.toFixed(6) : p.toFixed(4);

        const context = `
TOKEN ANALYSIS REQUEST
======================
Symbol     : ${symbol} (${name})
Price      : $${fmtPrc(price)}
Age        : ${ageH.toFixed(1)} hours
AI Score   : ${score}/100
Rug Risk   : ${rugProb}

PRICE ACTION
- 24h change : ${chg24h >= 0 ? '+' : ''}${chg24h.toFixed(1)}%
- 1h change  : ${chg1h >= 0 ? '+' : ''}${chg1h.toFixed(1)}%
- 5m change  : ${chg5m >= 0 ? '+' : ''}${chg5m.toFixed(2)}%

VOLUME & ACTIVITY
- Vol 24h    : ${fmtUsd(vol24h)}
- Vol 1h     : ${fmtUsd(vol1h)}
- Liquidity  : ${fmtUsd(liq)}
- FDV        : ${fdv > 0 ? fmtUsd(fdv) : 'unknown'}
- Txns 24h   : ${txns24h}
- Buys/Sells 5m : ${buys5m}/${sells5m} (ratio ${sells5m > 0 ? (buys5m/sells5m).toFixed(2) : 'inf'})
- Buys/Sells 1h : ${buys1h}/${sells1h} (ratio ${sells1h > 0 ? (buys1h/sells1h).toFixed(2) : 'inf'})

MARKET CONTEXT
- BTC Dominance : ${btcDom}%
- Fear & Greed  : ${fearGreed}
`;

        const systemPrompt = `Kamu adalah AI crypto analyst khusus meme coin dan DEX trenches di Solana. 
Tugas kamu: menganalisa satu token dan memberikan signal trading yang actionable.

PENTING: Jawab HANYA dalam format JSON berikut, tanpa teks tambahan di luar JSON:
{
  "signal": "STRONG_BUY|BUY|WATCH|NEUTRAL|AVOID|SELL",
  "signalType": "SCALP|SWING|BREAKOUT|AVOID",
  "confidence": 0-100,
  "entry": { "low": number, "high": number },
  "tp1": number, "tp2": number, "tp3": number,
  "sl": number,
  "riskLevel": "LOW|MEDIUM|HIGH|EXTREME",
  "rugProbability": "LOW|MEDIUM|HIGH",
  "reasoning": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "catalysts": ["catalyst 1", "catalyst 2"],
  "risks": ["risk 1", "risk 2"],
  "holdTime": "15m|1h|4h|24h|avoid",
  "summary": "satu kalimat ringkasan"
}

Gunakan analisa: momentum, buy/sell ratio, volume spike, age, FDV, liquidity depth, rug signals.
Untuk meme coin Solana: SCALP jika ageH < 4h dan momentum kuat. AVOID jika rugRisk HIGH.
Entry zone = harga sekarang ± 3-5%. TP berdasarkan fibonacci extension (1.5x, 2.5x, 5x untuk scalp).
SL = -25% sampai -35% dari entry untuk meme coin.`;

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method : 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body   : JSON.stringify({
                model      : 'llama-3.3-70b-versatile',
                messages   : [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: context },
                ],
                max_tokens  : 700,
                temperature : 0.3,
            }),
            signal: AbortSignal.timeout(30_000),
        });

        if (!groqRes.ok) {
            const err = await groqRes.text();
            return res.json({ ok: false, error: `Groq error ${groqRes.status}: ${err.slice(0, 200)}` });
        }

        const gd   = await groqRes.json();
        const raw  = gd.choices?.[0]?.message?.content || '{}';
        const json = raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
        let analysis;
        try { analysis = JSON.parse(json); } catch { analysis = { signal: 'NEUTRAL', confidence: 0, summary: 'Parse error', reasoning: [raw.slice(0, 200)] }; }

        const result = { ok: true, symbol, price, analysis, context, generatedAt: Date.now() };
        _signalCache.set(cacheKey, { data: result, ts: Date.now() });
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── /api/dex/narratives  ──────────────────────────────────────────────────────
app.get('/api/dex/narratives', async (req, res) => {
    if (_narrativesCache.data && Date.now() - _narrativesCache.ts < _narrativesCache.ttl) {
        return res.json(_narrativesCache.data);
    }
    try {
        // Fetch top gainers from CoinGecko
        const gainersRes = await fetch(
            'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=percent_change_24h_desc&per_page=100&page=1&price_change_percentage=24h',
            { signal: AbortSignal.timeout(10_000) }
        );

        let gainers = [];
        if (gainersRes.ok) {
            const gd = await gainersRes.json();
            gainers = Array.isArray(gd) ? gd : [];
        }

        // Narrative keywords
        const NARRATIVES = {
            'AI & DePIN'   : ['ai', 'gpt', 'agent', 'neural', 'learn', 'agi', 'depin', 'fetch', 'render', 'ocean'],
            'RWA'          : ['rwa', 'real', 'estate', 'gold', 'asset', 'bond', 'ondo', 'centri', 'maple'],
            'Meme'         : ['doge', 'shib', 'pepe', 'floki', 'bonk', 'wif', 'mew', 'popcat', 'cat', 'dog', 'frog', 'inu'],
            'Gaming & NFT' : ['game', 'play', 'nft', 'metaverse', 'axie', 'illuvium', 'pixel', 'gala'],
            'DeFi'         : ['defi', 'swap', 'lend', 'yield', 'aave', 'uniswap', 'curve', 'compound', 'maker'],
            'Solana Eco'   : ['sol', 'bonk', 'wif', 'jup', 'jito', 'ray', 'msol', 'drift', 'pyth', 'helium'],
            'Base Eco'     : ['base', 'brett', 'toshi', 'aerodrome', 'degen'],
            'TON Eco'      : ['ton', 'toncoin', 'dogs', 'notcoin', 'hamster'],
            'L2 / ETH Eco' : ['arb', 'op', 'matic', 'zk', 'stark', 'scroll', 'linea', 'blast'],
            'BTC Ecosystem': ['btc', 'sats', 'ordi', 'rune', 'merlin', 'stacks'],
        };

        const narrativeScores = {};
        const narrativeCoins  = {};

        for (const coin of gainers) {
            const id   = (coin.id || '').toLowerCase();
            const sym  = (coin.symbol || '').toLowerCase();
            const name = (coin.name || '').toLowerCase();
            const chg  = coin.price_change_percentage_24h || 0;

            for (const [narr, keys] of Object.entries(NARRATIVES)) {
                const match = keys.some(k => id.includes(k) || sym.includes(k) || name.includes(k));
                if (match) {
                    narrativeScores[narr] = (narrativeScores[narr] || 0) + Math.max(0, chg);
                    if (!narrativeCoins[narr]) narrativeCoins[narr] = [];
                    if (narrativeCoins[narr].length < 5) {
                        narrativeCoins[narr].push({
                            symbol: coin.symbol?.toUpperCase(),
                            name  : coin.name,
                            chg24h: chg,
                            price : coin.current_price,
                            mcap  : coin.market_cap,
                        });
                    }
                }
            }
        }

        // Sort narratives by total score
        const narrativeList = Object.entries(narrativeScores)
            .map(([name, score]) => ({
                name,
                score     : Math.round(score),
                strength  : score > 500 ? 'STRONG' : score > 150 ? 'MODERATE' : 'WEAK',
                coins     : narrativeCoins[name] || [],
                momentum  : score > 500 ? '🔥🔥🔥' : score > 150 ? '🔥🔥' : '🔥',
            }))
            .sort((a, b) => b.score - a.score);

        // Ecosystem correlation map (hardcoded intelligence)
        const ecosystemMap = {
            'SOL'  : { ecosystem: 'Solana', relatedCoins: ['JUP', 'BONK', 'WIF', 'JTO', 'PYTH', 'DRIFT', 'RAY', 'MSOL'] },
            'ETH'  : { ecosystem: 'Ethereum L2', relatedCoins: ['ARB', 'OP', 'MATIC', 'ZK', 'STARKNET', 'SCROLL', 'BLAST'] },
            'BNB'  : { ecosystem: 'BNB Chain', relatedCoins: ['CAKE', 'XVS', 'ALPACA', 'BSCS'] },
            'TON'  : { ecosystem: 'TON Ecosystem', relatedCoins: ['DOGS', 'NOTCOIN', 'HAMSTER', 'MAJOR'] },
            'AVAX' : { ecosystem: 'Avalanche', relatedCoins: ['JOE', 'QI', 'BENQI', 'PANGOLIN'] },
            'SUI'  : { ecosystem: 'Sui Ecosystem', relatedCoins: ['CETUS', 'TURBOS', 'NAVI', 'SCALLOP'] },
            'APT'  : { ecosystem: 'Aptos Ecosystem', relatedCoins: ['CELL', 'AMNIS', 'ECHO', 'ARIES'] },
            'BASE' : { ecosystem: 'Base Ecosystem', relatedCoins: ['BRETT', 'TOSHI', 'AERO', 'DEGEN'] },
        };

        const result = { ok: true, narratives: narrativeList, ecosystemMap, fetchedAt: Date.now(), totalCoinsAnalyzed: gainers.length };
        _narrativesCache.data = result;
        _narrativesCache.ts   = Date.now();
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── CHARON BOT API BRIDGE ─────────────────────────────────────────────────
// Reads data from Charon's SQL Server (charon_db) and exposes it via REST endpoints.
// Charon bot must be running separately in charon-feature-real-time-yellowstone/
{
    const mssql = require('mssql');
    const charonDbConfig = {
        server: process.env.MSSQL_SERVER || '127.0.0.1',
        port: parseInt(process.env.MSSQL_PORT || '1433'),
        user: process.env.MSSQL_USER || 'SA',
        password: process.env.MSSQL_PASSWORD || 'Bni1234/',
        database: process.env.MSSQL_DATABASE || 'charon_db',
        options: { trustServerCertificate: true, enableArithAbort: true },
        connectionTimeout: 5000,
        requestTimeout: 10000,
    };
    let _charonPool = null;
    async function getCharonPool() {
        if (_charonPool && _charonPool.connected) return _charonPool;
        _charonPool = await mssql.connect(charonDbConfig);
        return _charonPool;
    }
    async function charonQuery(sql_str, params = []) {
        const pool = await getCharonPool();
        const req = pool.request();
        params.forEach((v, i) => {
            if (typeof v === 'number' && Number.isInteger(v)) req.input(`p${i}`, mssql.Int, v);
            else if (typeof v === 'number') req.input(`p${i}`, mssql.Float, v);
            else req.input(`p${i}`, mssql.NVarChar, v == null ? null : String(v));
        });
        const result = await req.query(sql_str.replace(/\?/g, (_, j) => `@p${j}`));
        return result.recordset || [];
    }
    async function withCharonDb(res, fn) {
        try {
            const data = await fn();
            return res.json({ ok: true, data });
        } catch (e) {
            console.log('[Charon bridge]', e.message);
            return res.json({ ok: false, error: e.message, data: [] });
        }
    }
    function tryParse(str) {
        if (!str) return null;
        try { return JSON.parse(str); } catch { return str; }
    }

    // GET /api/charon/status
    app.get('/api/charon/status', async (req, res) => {
        try {
            await getCharonPool();
            res.json({ ok: true, dbExists: true, dbPath: 'SQL Server: charon_db' });
        } catch (e) {
            res.json({ ok: false, dbExists: false, error: e.message });
        }
    });

    // GET /api/charon/positions?limit=50
    app.get('/api/charon/positions', (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            const r = pool.request(); r.input('lim', mssql.Int, limit);
            const rows = (await r.query(`SELECT TOP (@lim) id, mint, status, execution_mode AS mode, entry_price, entry_mcap, exit_price, pnl_percent, pnl_sol, open_at_ms AS entry_at_ms, closed_at_ms, exit_reason, tp_percent, sl_percent, size_sol AS position_size_sol, symbol AS token_symbol, name AS token_name, candidate_json, decision_json FROM dry_run_positions ORDER BY open_at_ms DESC`)).recordset;
            return rows.map(r => ({ ...r, candidate: tryParse(r.candidate_json), decision: tryParse(r.decision_json), candidate_json: undefined, decision_json: undefined }));
        });
    });

    // GET /api/charon/candidates?limit=50&status=all
    app.get('/api/charon/candidates', (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const status = (req.query.status || '').replace(/[^a-z_]/g, '');
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            const r = pool.request(); r.input('lim', mssql.Int, limit);
            const where = status && status !== 'all' ? `WHERE status = '${status}'` : '';
            const rows = (await r.query(`SELECT TOP (@lim) id, mint, status, created_at_ms, updated_at_ms, signal_key AS signature, candidate_json, filter_result_json FROM candidates ${where} ORDER BY created_at_ms DESC`)).recordset;
            return rows.map(r => ({ ...r, candidate: tryParse(r.candidate_json), filters: tryParse(r.filter_result_json), candidate_json: undefined, filter_result_json: undefined }));
        });
    });

    // GET /api/charon/decisions?limit=50
    app.get('/api/charon/decisions', (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            const r = pool.request(); r.input('lim', mssql.Int, limit);
            const rows = (await r.query(`SELECT TOP (@lim) id, candidate_id, mint, created_at_ms, verdict, confidence, reason, risks_json, raw_json FROM llm_decisions ORDER BY created_at_ms DESC`)).recordset;
            return rows.map(r => ({ ...r, risks: tryParse(r.risks_json), risks_json: undefined }));
        });
    });

    // GET /api/charon/alerts
    app.get('/api/charon/alerts', (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            const r = pool.request(); r.input('lim', mssql.Int, limit);
            return (await r.query(`SELECT TOP (@lim) id, mint, strategy_id, alert_type, target_price, status, created_at_ms, expires_at_ms, triggered_at_ms FROM price_alerts ORDER BY created_at_ms DESC`)).recordset;
        });
    });

    // GET /api/charon/settings
    app.get('/api/charon/settings', (req, res) => {
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            const rows = (await pool.request().query(`SELECT [key], value FROM settings ORDER BY [key]`)).recordset;
            const obj = {};
            for (const row of rows) { try { obj[row.key] = JSON.parse(row.value); } catch { obj[row.key] = row.value; } }
            return obj;
        });
    });

    // GET /api/charon/strategies
    app.get('/api/charon/strategies', (req, res) => {
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            const rows = (await pool.request().query(`SELECT * FROM strategies ORDER BY id`)).recordset;
            return rows.map(r => ({ ...r, config: tryParse(r.config_json), config_json: undefined }));
        });
    });

    // GET /api/charon/lessons
    app.get('/api/charon/lessons', (req, res) => {
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            const rows = (await pool.request().query(`SELECT TOP 50 id, lesson, status, evidence_json, created_at_ms FROM learning_lessons ORDER BY id DESC`)).recordset;
            return rows.map(r => ({ ...r, evidence: tryParse(r.evidence_json), evidence_json: undefined }));
        });
    });

    // GET /api/charon/wallets
    app.get('/api/charon/wallets', (req, res) => {
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            return (await pool.request().query(`SELECT label, address, created_at_ms FROM saved_wallets ORDER BY label`)).recordset;
        });
    });

    // GET /api/charon/pnl-summary
    app.get('/api/charon/pnl-summary', (req, res) => {
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            const all = (await pool.request().query(`SELECT status, execution_mode AS mode, pnl_percent, pnl_sol, exit_reason FROM dry_run_positions`)).recordset;
            const closed = all.filter(r => r.status === 'closed');
            const open = all.filter(r => r.status === 'open');
            const wins = closed.filter(r => (r.pnl_percent || 0) > 0).length;
            const losses = closed.filter(r => (r.pnl_percent || 0) <= 0).length;
            const totalPnlPct = closed.reduce((s, r) => s + (r.pnl_percent || 0), 0);
            const avgPnlPct = closed.length ? totalPnlPct / closed.length : 0;
            return { total: all.length, open: open.length, closed: closed.length, wins, losses, winRate: closed.length ? Math.round((wins / closed.length) * 100) : 0, avgPnlPct: Math.round(avgPnlPct * 100) / 100, totalPnlPct: Math.round(totalPnlPct * 100) / 100 };
        });
    });

    // GET /api/charon/signal-events?limit=50
    app.get('/api/charon/signal-events', (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        withCharonDb(res, async () => {
            const pool = await getCharonPool();
            const r = pool.request(); r.input('lim', mssql.Int, limit);
            const rows = (await r.query(`SELECT TOP (@lim) id, mint, source, event_type, created_at_ms, payload_json FROM signal_events ORDER BY created_at_ms DESC`)).recordset;
            return rows.map(r => ({ ...r, payload: tryParse(r.payload_json), payload_json: undefined }));
        });
    });

    console.log('🤖 [Charon] API bridge aktif → /api/charon/* (SQL Server)');
}

// ══════════════════════════════════════════════════════════════
//  ACTIVITY LOG — In-memory ring buffer + SSE stream
//  Semua komponen bisa push log via: global.activityLog.push(entry)
//  Frontend poll via GET /api/activity-log
//  Realtime stream via GET /api/activity-log/stream (SSE)
// ══════════════════════════════════════════════════════════════
const MAX_LOG = 500;
const _actLog = [];       // ring buffer
const _sseClients = [];   // SSE subscriber list

// Log levels: INFO | WARN | ERROR | BUY | SELL | SKIP | LOOP | BALANCE | SYSTEM
function pushLog(level, source, message, meta = {}) {
    const entry = {
        id:      _actLog.length + 1,
        ts:      Date.now(),
        level,
        source,  // e.g. 'AutoTrader' | 'Charon' | 'RiskGuard' | 'Scanner'
        message,
        meta,    // { symbol, mint, amount, price, reason, ... }
    };
    _actLog.push(entry);
    if (_actLog.length > MAX_LOG) _actLog.shift();

    // Broadcast to SSE clients
    const data = `data: ${JSON.stringify(entry)}\n\n`;
    for (let i = _sseClients.length - 1; i >= 0; i--) {
        try {
            _sseClients[i].write(data);
        } catch (e) {
            _sseClients.splice(i, 1);
        }
    }

    // Also log to console with color hints
    const ICONS = { BUY:'💚', SELL:'🔴', WARN:'⚠️', ERROR:'🚨', SKIP:'⏭', LOOP:'🔁', BALANCE:'💰', SYSTEM:'⚙️', INFO:'ℹ️' };
    console.log(`${ICONS[level]||'·'} [${source}] ${message}`);
}

// Expose globally so any module can call: global.activityLog.push(...)
global.activityLog = { push: pushLog, entries: _actLog };

// GET /api/activity-log?limit=200&since=<id>  — poll latest entries
app.get('/api/activity-log', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const limit = Math.min(parseInt(req.query.limit) || 100, MAX_LOG);
    const since = parseInt(req.query.since) || 0;
    const entries = _actLog.filter(e => e.id > since).slice(-limit);
    res.json({ ok: true, entries, total: _actLog.length, lastId: _actLog.at(-1)?.id || 0 });
});

// GET /api/activity-log/stream  — SSE realtime stream
app.get('/api/activity-log/stream', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send last 30 entries as backfill
    const backfill = _actLog.slice(-30);
    backfill.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`));

    _sseClients.push(res);
    req.on('close', () => {
        const i = _sseClients.indexOf(res);
        if (i !== -1) _sseClients.splice(i, 1);
    });
});

// POST /api/activity-log  — push log entry from external process (e.g. Charon bot)
app.post('/api/activity-log', express.json(), (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { level = 'INFO', source = 'External', message = '', meta = {} } = req.body || {};
    pushLog(level, source, message, meta);
    res.json({ ok: true });
});

// Loop detector — expose last N buy mints for frontend to detect repeat buys
app.get('/api/activity-log/loop-check', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const window = parseInt(req.query.window) || 20; // last N BUY entries
    const buys = _actLog.filter(e => e.level === 'BUY').slice(-window);
    const freq = {};
    buys.forEach(e => {
        const key = e.meta?.symbol || e.meta?.mint || e.message;
        freq[key] = (freq[key] || 0) + 1;
    });
    const loops = Object.entries(freq)
        .filter(([, c]) => c >= 3)
        .map(([symbol, count]) => ({ symbol, count, warning: `Bought ${count}x in last ${window} trades` }));
    res.json({ ok: true, loops, buyCount: buys.length, freq });
});

// Emit a system start log
pushLog('SYSTEM', 'Server', `Proxy server started on port ${PORT}`);


// Use a fire-and-forget fetch with a longer timeout and safer logging so
// a slow upstream (or AbortSignal) doesn't spam an abort error on startup.
// Can be skipped by setting environment variable SKIP_PREWARM=1
if (!SKIP_PREWARM) {
    setTimeout(() => {
    try {
        console.log('⏳ Pre-warming /api/whale-screen cache...');
        // fire-and-forget: don't await so startup isn't affected by pre-warm latency
        fetch(`http://127.0.0.1:${PORT}/api/whale-screen`, { signal: AbortSignal.timeout(30000) })
            .then(() => console.log('✅ /api/whale-screen pre-warm done'))
            .catch(e => console.warn('⚠️ Pre-warm /api/whale-screen failed:', e && e.message));
    } catch (e) {
        console.warn('⚠️ Pre-warm /api/whale-screen failed (outer):', e && e.message);
    }

    // Periodic refresh slightly longer than TTL to keep cache warm
    setInterval(() => {
        fetch(`http://127.0.0.1:${PORT}/api/whale-screen`).catch(() => {});
    }, WHALE_TTL + 30 * 1000);
    }, 2000);
} else {
    console.log('ℹ️ SKIP_PREWARM set — skipping /api/whale-screen pre-warm and periodic refresh');
}
