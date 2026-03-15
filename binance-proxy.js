/**
 * binance-proxy.js — Binance API Proxy Server
 * Jalankan: node binance-proxy.js
 * Berjalan di localhost:3001 — tidak terekspos ke internet
 *
 * KEAMANAN:
 *  - API key tersimpan di .env (tidak pernah dikirim ke browser)
 *  - Semua request di-sign HMAC-SHA256 di sini, bukan di browser
 *  - Tidak butuh Passphrase (Binance hanya API Key + Secret Key)
 */

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const fetch    = require('node-fetch');

const app  = express();
const PORT = process.env.PROXY_PORT || 3001;

const BINANCE_BASE        = 'https://api.binance.com';       // private (balance, order)
const BINANCE_PUBLIC_BASE = 'https://data-api.binance.vision'; // public  (ticker, candles) — accessible dari ID
const API_KEY      = process.env.BINANCE_API_KEY;
const SECRET_KEY   = process.env.BINANCE_SECRET_KEY;

// ── CORS: hanya dari localhost ────────────────────────────────
app.use(cors({
    origin: ['http://localhost:8000', 'http://127.0.0.1:8000',
             'http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
}));
app.use(express.json());

// ── Cek .env ─────────────────────────────────────────────────
const DRY_RUN_MODE = !API_KEY || API_KEY === 'GANTI_DENGAN_BINANCE_API_KEY';

function checkEnv() {
    const missing = [];
    if (!API_KEY    || API_KEY    === 'GANTI_DENGAN_BINANCE_API_KEY')    missing.push('BINANCE_API_KEY');
    if (!SECRET_KEY || SECRET_KEY === 'GANTI_DENGAN_BINANCE_SECRET_KEY') missing.push('BINANCE_SECRET_KEY');
    if (missing.length) {
        console.warn('⚠️  .env belum diisi:', missing.join(', '));
        console.warn('   Berjalan dalam mode DRY RUN — endpoint private dinonaktifkan.');
    }
}

// ── HMAC-SHA256 Signature (Binance style) ─────────────────────
function sign(queryString) {
    return crypto
        .createHmac('sha256', SECRET_KEY)
        .update(queryString)
        .digest('hex');
}

// ── Headers untuk request private ────────────────────────────
function privateHeaders() {
    return { 'X-MBX-APIKEY': API_KEY, 'Content-Type': 'application/json' };
}

// ── Helper: GET dengan signature ─────────────────────────────
async function binanceGet(path, params = {}) {
    params.timestamp = Date.now();
    params.recvWindow = 10000;
    const qs  = new URLSearchParams(params).toString();
    const sig = sign(qs);
    const url = `${BINANCE_BASE}${path}?${qs}&signature=${sig}`;
    const res = await fetch(url, { headers: privateHeaders() });
    return res.json();
}

// ── Helper: POST dengan signature ────────────────────────────
async function binancePost(path, params = {}) {
    params.timestamp  = Date.now();
    params.recvWindow = 10000;
    const qs  = new URLSearchParams(params).toString();
    const sig = sign(qs);
    const url = `${BINANCE_BASE}${path}?${qs}&signature=${sig}`;
    const res = await fetch(url, { method: 'POST', headers: privateHeaders() });
    return res.json();
}

// ── Helper: DELETE dengan signature ──────────────────────────
async function binanceDelete(path, params = {}) {
    params.timestamp  = Date.now();
    params.recvWindow = 10000;
    const qs  = new URLSearchParams(params).toString();
    const sig = sign(qs);
    const url = `${BINANCE_BASE}${path}?${qs}&signature=${sig}`;
    const res = await fetch(url, { method: 'DELETE', headers: privateHeaders() });
    return res.json();
}

// ── Middleware auth guard ─────────────────────────────────────
function requireAuth(req, res, next) {
    if (DRY_RUN_MODE) {
        return res.status(503).json({ error: 'DRY_RUN: API key belum diisi di .env', dryRun: true });
    }
    next();
}

// ═══════════════════════════════════════════════════════════════
//  ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// Health check
app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now(), exchange: 'binance', dryRun: DRY_RUN_MODE }));

// ── AKUN ──────────────────────────────────────────────────────

// GET /okx/balance → Binance account balance (format kompatibel)
app.get('/okx/balance', requireAuth, async (req, res) => {
    try {
        const data = await binanceGet('/api/v3/account');
        if (data.code && data.code < 0) return res.status(400).json({ code: String(data.code), msg: data.msg });

        // Format mirip OKX agar auto-trader.js tetap kompatibel
        const details = (data.balances || [])
            .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
            .map(b => ({
                ccy      : b.asset,
                availBal : b.free,
                frozenBal: b.locked,
                availEq  : b.free,
                eqUsd    : 0, // akan di-update oleh ticker
            }));

        // Hitung estimasi USD untuk USDT/BUSD/USDC
        let totalUsd = 0;
        for (const d of details) {
            if (['USDT','BUSD','USDC','FDUSD'].includes(d.ccy)) {
                d.eqUsd  = parseFloat(d.availBal) + parseFloat(d.frozenBal);
                totalUsd += d.eqUsd;
            }
        }

        res.json({ code: '0', data: [{ details, totalEq: totalUsd.toFixed(4) }] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/orders/pending → open orders
app.get('/okx/orders/pending', requireAuth, async (req, res) => {
    try {
        const data = await binanceGet('/api/v3/openOrders');
        if (data.code && data.code < 0) return res.json({ code: String(data.code), msg: data.msg, data: [] });

        // Format mirip OKX
        const orders = (Array.isArray(data) ? data : []).map(o => ({
            ordId    : String(o.orderId),
            instId   : o.symbol,
            side     : o.side.toLowerCase(),
            ordType  : o.type.toLowerCase(),
            px       : o.price,
            sz       : o.origQty,
            accFillSz: o.executedQty,
            state    : o.status.toLowerCase(),
            cTime    : String(o.time),
        }));
        res.json({ code: '0', data: orders });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/orders/history → order history
app.get('/okx/orders/history', requireAuth, async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit) || 20, 500);
        const symbol = req.query.symbol || '';
        const params = { limit };
        if (symbol) params.symbol = symbol;
        const data = await binanceGet('/api/v3/allOrders', params);
        if (!Array.isArray(data)) return res.json({ code: '-1', msg: data.msg || 'error', data: [] });

        const orders = data.slice(-limit).reverse().map(o => ({
            ordId    : String(o.orderId),
            instId   : o.symbol,
            side     : o.side.toLowerCase(),
            ordType  : o.type.toLowerCase(),
            px       : o.price,
            sz       : o.origQty,
            accFillSz: o.executedQty,
            fillPx   : o.price,
            state    : o.status.toLowerCase(),
            cTime    : String(o.time),
        }));
        res.json({ code: '0', data: orders });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /okx/order/place → place order
// Body: { instId, side, ordType, sz, px? }
// instId format: "BTC-USDT" → dikonversi ke "BTCUSDT"
app.post('/okx/order/place', requireAuth, async (req, res) => {
    try {
        const { instId, side, ordType, sz, px } = req.body;
        if (!instId || !side || !ordType || !sz) {
            return res.status(400).json({ error: 'instId, side, ordType, sz wajib diisi' });
        }

        // Konversi format: "BTC-USDT" → "BTCUSDT"
        const symbol   = instId.replace('-', '');
        const bnSide   = side.toUpperCase();   // BUY / SELL
        const bnType   = ordType === 'market' ? 'MARKET' : 'LIMIT';
        const params   = { symbol, side: bnSide, type: bnType };

        if (bnType === 'MARKET') {
            // Market order: gunakan quoteOrderQty (dalam USDT) atau quantity (dalam coin)
            // sz bisa dalam coin atau USDT — kita coba qty dulu
            params.quantity = parseFloat(sz).toFixed(8);
        } else {
            // Limit order
            params.quantity    = parseFloat(sz).toFixed(8);
            params.price       = parseFloat(px).toFixed(8);
            params.timeInForce = 'GTC';
        }

        const data = await binancePost('/api/v3/order', params);

        if (data.code && data.code < 0) {
            return res.json({ code: String(data.code), msg: data.msg, data: [] });
        }

        // Format response mirip OKX
        res.json({ code: '0', data: [{ ordId: String(data.orderId), clOrdId: data.clientOrderId }] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /okx/order/cancel → cancel order
app.post('/okx/order/cancel', requireAuth, async (req, res) => {
    try {
        const { instId, ordId } = req.body;
        if (!instId || !ordId) return res.status(400).json({ error: 'instId dan ordId wajib' });

        const symbol = instId.replace('-', '');
        const data   = await binanceDelete('/api/v3/order', { symbol, orderId: ordId });

        if (data.code && data.code < 0) {
            return res.json({ code: String(data.code), msg: data.msg });
        }
        res.json({ code: '0', data: [{ ordId: String(data.orderId) }] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── MARKET DATA (publik, tidak perlu sign) ────────────────────

// GET /okx/ticker?instId=BTC-USDT → harga last
app.get('/okx/ticker', async (req, res) => {
    try {
        const instId  = req.query.instId || 'BTC-USDT';
        const symbol  = instId.replace('-', '');
        // Pakai public endpoint (data-api.binance.vision) yang accessible dari Indonesia
        const r = await fetch(`${BINANCE_PUBLIC_BASE}/api/v3/ticker/price?symbol=${symbol}`);
        const d = await r.json();
        if (d.code) return res.status(400).json(d);

        // Format mirip OKX
        res.json({ code: '0', data: [{ instId, last: d.price, askPx: d.price, bidPx: d.price }] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/ticker/24hr?instId=BTC-USDT → 24hr stats
app.get('/okx/ticker/24hr', async (req, res) => {
    try {
        const instId = req.query.instId || 'BTC-USDT';
        const symbol = instId.replace('-', '');
        const r = await fetch(`${BINANCE_PUBLIC_BASE}/api/v3/ticker/24hr?symbol=${symbol}`);
        res.json(await r.json());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/candles?instId=BTC-USDT&bar=1h&limit=100 → candlestick
app.get('/okx/candles', async (req, res) => {
    try {
        const instId   = req.query.instId || 'BTC-USDT';
        const symbol   = instId.replace('-', '');
        // Konversi format bar: "1H" → "1h", "15m" → "15m"
        const interval = (req.query.bar || '1h').toLowerCase();
        const limit    = Math.min(parseInt(req.query.limit) || 100, 1000);
        const r = await fetch(`${BINANCE_PUBLIC_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
        const data = await r.json();
        // Format mirip OKX: [ts, open, high, low, close, vol]
        const formatted = (Array.isArray(data) ? data : []).map(k => [
            k[0], k[1], k[2], k[3], k[4], k[5]
        ]);
        res.json({ code: '0', data: formatted });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /okx/instruments → daftar semua SPOT pairs USDT
app.get('/okx/instruments', async (req, res) => {
    try {
        const r    = await fetch(`${BINANCE_PUBLIC_BASE}/api/v3/exchangeInfo`);
        const data = await r.json();
        const instruments = (data.symbols || [])
            .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .map(s => ({ instId: `${s.baseAsset}-USDT`, baseCcy: s.baseAsset, quoteCcy: 'USDT' }));
        res.json({ code: '0', data: instruments });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── SIGNAL BOT API ────────────────────────────────────────────
const fs           = require('fs');
const SIGNALS_FILE = require('path').join(__dirname, 'signals.json');

app.get('/api/signals', (req, res) => {
    try {
        if (!fs.existsSync(SIGNALS_FILE)) return res.json([]);
        const data = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        res.json(Array.isArray(data) ? data : []);
    } catch { res.json([]); }
});

app.post('/api/signals/clear', (req, res) => {
    try {
        fs.writeFileSync(SIGNALS_FILE, '[]');
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/signals/status', (req, res) => {
    try {
        if (!fs.existsSync(SIGNALS_FILE)) return res.json({ running: false, count: 0, last: null });
        const arr = JSON.parse(fs.readFileSync(SIGNALS_FILE, 'utf8'));
        res.json({ running: true, count: arr.length, last: arr[0]?.timestamp || null });
    } catch { res.json({ running: false, count: 0, last: null }); }
});

// ── AUTO TRADER API ───────────────────────────────────────────
const http    = require('http');
const AT_PORT = 3002;

async function forwardToAutoTrader(method, path, body, res) {
    try {
        const data = body ? JSON.stringify(body) : null;
        return new Promise(resolve => {
            const req = http.request({
                hostname: '127.0.0.1', port: AT_PORT, path, method,
                headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
            }, r => {
                let raw = '';
                r.on('data', c => raw += c);
                r.on('end', () => { try { res.json(JSON.parse(raw)); } catch { res.status(500).json({ error: 'parse error' }); } resolve(); });
            });
            req.on('error', () => { res.status(503).json({ error: 'Auto trader tidak aktif' }); resolve(); });
            if (data) req.write(data);
            req.end();
        });
    } catch (e) { res.status(503).json({ error: e.message }); }
}

app.get('/trader/state',          (req, res) => forwardToAutoTrader('GET',  '/trader/state', null, res));
app.post('/trader/reset-circuit', (req, res) => forwardToAutoTrader('POST', '/trader/reset-circuit', {}, res));
app.post('/trader/close-all',     (req, res) => forwardToAutoTrader('POST', '/trader/close-all', {}, res));

// ── START ─────────────────────────────────────────────────────
checkEnv();
app.listen(PORT, '127.0.0.1', () => {
    console.log(`✅ Binance Proxy berjalan di http://127.0.0.1:${PORT}`);
    console.log(`   Exchange : Binance`);
    console.log(`   Mode     : ${DRY_RUN_MODE ? '📋 DRY RUN' : '🔴 LIVE'}`);
    console.log(`   Frontend : http://localhost:8000`);
});
