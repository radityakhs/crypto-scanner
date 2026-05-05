#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  whale-detector.js — Real-time Whale & Large Order Detector
//
//  Sumber data:
//    1. Whale Alert API  — transfer kripto besar on-chain (≥ $500k)
//       Docs: https://docs.whale-alert.io
//       Free tier: 10 req/mnt, data 1 jam terakhir
//
//    2. DEXScreener API  — anomali buy/sell txns di DEX (Solana & lainnya)
//       Tidak perlu API key, gratis
//
//  Output gabungan: array alert {type, symbol, usdValue, direction, source, ts}
//
//  Usage:
//    const whale = require('./whale-detector');
//    const alerts = await whale.getAlerts();          // gabungan semua sumber
//    const dex    = await whale.getDexWhaleAlerts();  // DEXScreener only
//    const wa     = await whale.getWhaleAlertTxns();  // Whale Alert only
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const https  = require('https');
const http   = require('http');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const WA_API_KEY         = process.env.WHALE_ALERT_KEY || null;  // set di .env
const WA_BASE            = 'https://api.whale-alert.io/v1';
const WA_MIN_USD         = 500_000;      // alert transfer ≥ $500k
const WA_LOOKBACK_SEC    = 3600;         // 1 jam ke belakang

const DEX_BASE           = 'https://api.dexscreener.com';
const DEX_VOL_SPIKE_X    = 3.0;         // spike jika vol5m > 3x rata-rata vol5m historis
const DEX_BUYSELL_RATIO  = 2.5;         // imbalance jika buys/sells > 2.5 atau < 0.4
const DEX_MIN_VOL_USD    = 50_000;      // abaikan pair dengan vol24h < $50k
const DEX_TOP_N          = 40;          // scan top 40 pasang Solana

// Cache internal agar tidak over-fetch
const _cache = {
    whaleAlerts : { data: [], ts: 0, ttl: 60_000  },   // refresh tiap 60s
    dexAlerts   : { data: [], ts: 0, ttl: 30_000  },   // refresh tiap 30s
    dexPairs    : { data: [], ts: 0, ttl: 120_000 },   // pairs cache 2 menit
};

// ─── HTTP UTILS ────────────────────────────────────────────────────────────────
function _fetchJson(url, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        const req = mod.get(url, { headers: { 'User-Agent': 'whale-detector/1.0', 'Accept': 'application/json' } }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { reject(new Error(`JSON parse error (status=${res.statusCode}): ${data.slice(0, 120)}`)); }
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout: ' + url)); });
    });
}

function _isCacheValid(entry) {
    return entry.data.length > 0 && (Date.now() - entry.ts) < entry.ttl;
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUMBER 1: WHALE ALERT API
//  Deteksi transfer besar antar wallet / exchange
//  Butuh API key (free tier tersedia di whale-alert.io)
// ══════════════════════════════════════════════════════════════════════════════
async function getWhaleAlertTxns() {
    if (_isCacheValid(_cache.whaleAlerts)) return _cache.whaleAlerts.data;

    if (!WA_API_KEY) {
        // Tanpa API key — return demo data agar UI tidak kosong
        return _demoWhaleAlerts();
    }

    try {
        const now   = Math.floor(Date.now() / 1000);
        const start = now - WA_LOOKBACK_SEC;
        const url   = `${WA_BASE}/transactions?api_key=${WA_API_KEY}&min_value=${WA_MIN_USD}&start=${start}&limit=50&cursor=0`;

        const { status, body } = await _fetchJson(url);
        if (status === 401) throw new Error('Whale Alert API key invalid atau expired');
        if (status === 429) throw new Error('Whale Alert rate limit — tunggu 1 menit');
        if (status !== 200 || !body.transactions) throw new Error(`Whale Alert status ${status}`);

        const alerts = body.transactions.map(tx => _parseWhaleTx(tx)).filter(Boolean);
        _cache.whaleAlerts = { data: alerts, ts: Date.now(), ttl: 60_000 };
        return alerts;
    } catch (e) {
        console.error('[WhaleDetector] Whale Alert error:', e.message);
        // Kembalikan data lama jika ada, atau demo
        return _cache.whaleAlerts.data.length ? _cache.whaleAlerts.data : _demoWhaleAlerts();
    }
}

function _parseWhaleTx(tx) {
    if (!tx || !tx.symbol) return null;
    const usdVal   = tx.amount_usd || 0;
    if (usdVal < WA_MIN_USD) return null;

    const from     = tx.from?.owner_type || tx.from?.wallet_type || 'unknown';
    const to       = tx.to?.owner_type   || tx.to?.wallet_type   || 'unknown';

    // Tentukan arah: exchange inflow = bearish, outflow = bullish
    let direction = 'TRANSFER';
    if (to === 'exchange')    direction = 'EXCHANGE_INFLOW';   // kemungkinan SELL
    if (from === 'exchange')  direction = 'EXCHANGE_OUTFLOW';  // kemungkinan BUY
    if (to === 'exchange' && from === 'exchange') direction = 'EXCHANGE_TO_EXCHANGE';

    const icon = direction === 'EXCHANGE_INFLOW'  ? '🔴' :
                 direction === 'EXCHANGE_OUTFLOW' ? '🟢' : '🔵';

    return {
        id        : tx.id || String(tx.timestamp),
        type      : 'WHALE_ALERT',
        source    : 'whale-alert.io',
        symbol    : (tx.symbol || '').toUpperCase(),
        chain     : tx.blockchain || 'unknown',
        usdValue  : Math.round(usdVal),
        amount    : tx.amount || 0,
        direction,
        icon,
        from      : from,
        to        : to,
        fromAddr  : tx.from?.address ? tx.from.address.slice(0, 8) + '...' : '?',
        toAddr    : tx.to?.address   ? tx.to.address.slice(0, 8)   + '...' : '?',
        hash      : tx.hash          ? tx.hash.slice(0, 12) + '...' : null,
        ts        : tx.timestamp * 1000,
        age       : _ageStr(tx.timestamp * 1000),
        label     : `${icon} ${_fmt(usdVal)} ${(tx.symbol||'').toUpperCase()} — ${_dirLabel(direction)}`,
    };
}

// Demo data saat API key belum diset
function _demoWhaleAlerts() {
    const now = Date.now();
    return [
        { id: 'd1', type: 'WHALE_ALERT', source: 'demo', symbol: 'BTC', chain: 'bitcoin', usdValue: 12_500_000, amount: 125, direction: 'EXCHANGE_INFLOW',  icon: '🔴', from: 'unknown', to: 'exchange', fromAddr: 'abc123...', toAddr: 'binance', hash: null, ts: now - 300_000, age: '5 mnt lalu', label: '🔴 $12.5M BTC → Exchange (possible SELL)', demo: true },
        { id: 'd2', type: 'WHALE_ALERT', source: 'demo', symbol: 'ETH', chain: 'ethereum', usdValue: 8_200_000, amount: 2500, direction: 'EXCHANGE_OUTFLOW', icon: '🟢', from: 'exchange', to: 'unknown', fromAddr: 'coinbase', toAddr: 'def456...', hash: null, ts: now - 720_000, age: '12 mnt lalu', label: '🟢 $8.2M ETH Exchange → Wallet (possible BUY)', demo: true },
        { id: 'd3', type: 'WHALE_ALERT', source: 'demo', symbol: 'SOL', chain: 'solana',   usdValue: 3_100_000, amount: 20000, direction: 'TRANSFER',         icon: '🔵', from: 'unknown', to: 'unknown', fromAddr: 'ghi789...', toAddr: 'jkl012...', hash: null, ts: now - 1_500_000, age: '25 mnt lalu', label: '🔵 $3.1M SOL Wallet → Wallet', demo: true },
    ];
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUMBER 2: DEXSCREENER — Large Order Detection
//  Deteksi anomali buy/sell di DEX lewat perbandingan txns & volume
//  Tidak perlu API key
// ══════════════════════════════════════════════════════════════════════════════
async function getDexWhaleAlerts(chain = 'solana') {
    if (_isCacheValid(_cache.dexAlerts)) return _cache.dexAlerts.data;

    try {
        // Fetch top pairs by volume via beberapa query
        const pairs = await _fetchTopDexPairs(chain);
        const alerts = [];

        for (const p of pairs.slice(0, DEX_TOP_N)) {
            const a = _analyzeDexPair(p);
            if (a) alerts.push(a);
        }

        // Sort: nilai USD terbesar duluan
        alerts.sort((a, b) => b.usdValue - a.usdValue);

        _cache.dexAlerts = { data: alerts, ts: Date.now(), ttl: 30_000 };
        return alerts;
    } catch (e) {
        console.error('[WhaleDetector] DEXScreener error:', e.message);
        return _cache.dexAlerts.data;
    }
}

async function _fetchTopDexPairs(chain) {
    if (_isCacheValid(_cache.dexPairs)) return _cache.dexPairs.data;

    const queries = ['sol', 'solana', 'pump', 'bonk'];
    const seen    = new Set();
    const results = [];

    for (const q of queries) {
        try {
            const { status, body } = await _fetchJson(`${DEX_BASE}/latest/dex/search?q=${q}`);
            if (status !== 200 || !Array.isArray(body.pairs)) continue;
            for (const p of body.pairs) {
                if (!p?.pairAddress || seen.has(p.pairAddress)) continue;
                if (chain && p.chainId !== chain) continue;
                if ((p.volume?.h24 || 0) < DEX_MIN_VOL_USD) continue;
                seen.add(p.pairAddress);
                results.push(p);
            }
        } catch { /* skip query */ }
    }

    _cache.dexPairs = { data: results, ts: Date.now(), ttl: 120_000 };
    return results;
}

function _analyzeDexPair(p) {
    if (!p?.baseToken) return null;

    const sym      = (p.baseToken.symbol || '').toUpperCase();
    const vol5m    = p.volume?.m5   || 0;
    const vol1h    = p.volume?.h1   || 0;
    const vol24h   = p.volume?.h24  || 0;
    const buys5m   = p.txns?.m5?.buys  || 0;
    const sells5m  = p.txns?.m5?.sells || 0;
    const buys1h   = p.txns?.h1?.buys  || 0;
    const sells1h  = p.txns?.h1?.sells || 0;
    const chg5m    = p.priceChange?.m5  || 0;
    const chg1h    = p.priceChange?.h1  || 0;
    const liq      = p.liquidity?.usd || 0;

    if (vol24h < DEX_MIN_VOL_USD) return null;

    const alerts = [];

    // ── Deteksi 1: Volume spike 5m vs rata-rata 5m (vol24h / 288 candle) ──
    const avg5m = vol24h / 288;
    if (avg5m > 0 && vol5m > avg5m * DEX_VOL_SPIKE_X) {
        const spikeX     = (vol5m / avg5m).toFixed(1);
        const direction  = chg5m > 0 ? 'BUY_SPIKE'  : 'SELL_SPIKE';
        const icon       = chg5m > 0 ? '🟢' : '🔴';
        alerts.push({
            subtype   : 'VOLUME_SPIKE',
            direction,
            icon,
            usdValue  : Math.round(vol5m),
            label     : `${icon} ${sym} Volume Spike ${spikeX}x normal (5m) — ${_fmt(vol5m)} | ${chg5m > 0 ? '+' : ''}${chg5m.toFixed(1)}%`,
            detail    : `Vol5m=$${_fmt(vol5m)} vs avg=$${_fmt(avg5m)} | Spike ${spikeX}x`,
        });
    }

    // ── Deteksi 2: Buy/Sell imbalance 5m ──
    if (buys5m + sells5m >= 5) {
        const ratio = sells5m > 0 ? buys5m / sells5m : buys5m;
        if (ratio >= DEX_BUYSELL_RATIO) {
            alerts.push({
                subtype  : 'BUY_IMBALANCE',
                direction: 'STRONG_BUY',
                icon     : '🟢',
                usdValue : Math.round(vol5m),
                label    : `🟢 ${sym} Buy Pressure ${buys5m}B/${sells5m}S (${ratio.toFixed(1)}x) — ${_fmt(vol5m)} 5m`,
                detail   : `Buys5m=${buys5m} Sells5m=${sells5m} ratio=${ratio.toFixed(2)}`,
            });
        } else if (sells5m > 0 && buys5m / sells5m <= (1 / DEX_BUYSELL_RATIO)) {
            alerts.push({
                subtype  : 'SELL_IMBALANCE',
                direction: 'STRONG_SELL',
                icon     : '🔴',
                usdValue : Math.round(vol5m),
                label    : `🔴 ${sym} Sell Pressure ${sells5m}S/${buys5m}B (${(sells5m/buys5m).toFixed(1)}x) — ${_fmt(vol5m)} 5m`,
                detail   : `Buys5m=${buys5m} Sells5m=${sells5m}`,
            });
        }
    }

    // ── Deteksi 3: Large single volume vs liquidity (whale relative to pool) ──
    if (liq > 0 && vol5m > liq * 0.1) {
        const pct = ((vol5m / liq) * 100).toFixed(1);
        alerts.push({
            subtype  : 'LIQ_PRESSURE',
            direction: chg5m >= 0 ? 'BUY_PRESSURE' : 'SELL_PRESSURE',
            icon     : chg5m >= 0 ? '🟡' : '🟠',
            usdValue : Math.round(vol5m),
            label    : `${chg5m >= 0 ? '🟡' : '🟠'} ${sym} Vol5m=${pct}% of Liquidity — ${_fmt(vol5m)} vs pool $${_fmt(liq)}`,
            detail   : `Liq=$${_fmt(liq)} Vol5m=$${_fmt(vol5m)} (${pct}% of pool)`,
        });
    }

    if (alerts.length === 0) return null;

    // Ambil alert dengan dampak terbesar
    const best = alerts.sort((a, b) => b.usdValue - a.usdValue)[0];

    return {
        id         : `dex_${p.pairAddress}_${Date.now()}`,
        type       : 'DEX_WHALE',
        source     : 'dexscreener.com',
        symbol     : sym,
        chain      : p.chainId || 'solana',
        mint       : p.baseToken.address,
        pairAddr   : p.pairAddress,
        usdValue   : best.usdValue,
        direction  : best.direction,
        icon       : best.icon,
        subtype    : best.subtype,
        label      : best.label,
        detail     : best.detail,
        priceUsd   : parseFloat(p.priceUsd || 0),
        chg5m,
        chg1h,
        vol5m,
        vol1h,
        vol24h,
        buys5m,
        sells5m,
        buys1h,
        sells1h,
        liq,
        ts         : Date.now(),
        age        : 'sekarang',
        allAlerts  : alerts,
    };
}

// Fetch whale activity untuk SATU mint address spesifik
async function getDexWhaleSingle(mintAddress) {
    try {
        const { status, body } = await _fetchJson(`${DEX_BASE}/latest/dex/tokens/${mintAddress}`);
        if (status !== 200 || !Array.isArray(body.pairs)) return null;
        // Ambil pair dengan volume terbesar
        const pairs = body.pairs.sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0));
        for (const p of pairs.slice(0, 3)) {
            const a = _analyzeDexPair(p);
            if (a) return a;
        }
        return null;
    } catch { return null; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  GABUNGAN: getAlerts()
//  Return semua alert dari semua sumber, diurutkan dari terbaru
// ══════════════════════════════════════════════════════════════════════════════
async function getAlerts() {
    const [waAlerts, dexAlerts] = await Promise.allSettled([
        getWhaleAlertTxns(),
        getDexWhaleAlerts('solana'),
    ]);

    const all = [
        ...(waAlerts.status  === 'fulfilled' ? waAlerts.value  : []),
        ...(dexAlerts.status === 'fulfilled' ? dexAlerts.value : []),
    ];

    // Sort by usdValue desc
    all.sort((a, b) => b.usdValue - a.usdValue);
    return all;
}

// ─── UTILITIES ─────────────────────────────────────────────────────────────────
function _fmt(n) {
    if (!n || isNaN(n)) return '0';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
}

function _ageStr(ts) {
    const diff = Date.now() - ts;
    const min  = Math.floor(diff / 60_000);
    if (min < 1)  return 'baru saja';
    if (min < 60) return `${min} mnt lalu`;
    const hr = Math.floor(min / 60);
    return `${hr} jam lalu`;
}

function _dirLabel(dir) {
    const map = {
        EXCHANGE_INFLOW:        'ke Exchange (possible SELL)',
        EXCHANGE_OUTFLOW:       'dari Exchange (possible BUY)',
        EXCHANGE_TO_EXCHANGE:   'Exchange → Exchange',
        TRANSFER:               'Wallet → Wallet',
    };
    return map[dir] || dir;
}

// ─── STATUS / HEALTH ──────────────────────────────────────────────────────────
function getStatus() {
    return {
        whaleAlertApiKey  : WA_API_KEY ? '✅ set' : '❌ tidak di-set (mode demo)',
        whaleAlertCacheAge: _cache.whaleAlerts.ts ? Math.round((Date.now() - _cache.whaleAlerts.ts) / 1000) + 's lalu' : 'belum fetch',
        dexCacheAge       : _cache.dexAlerts.ts   ? Math.round((Date.now() - _cache.dexAlerts.ts)   / 1000) + 's lalu' : 'belum fetch',
        dexPairsCacheAge  : _cache.dexPairs.ts    ? Math.round((Date.now() - _cache.dexPairs.ts)    / 1000) + 's lalu' : 'belum fetch',
        config: { WA_MIN_USD, WA_LOOKBACK_SEC, DEX_VOL_SPIKE_X, DEX_BUYSELL_RATIO, DEX_MIN_VOL_USD, DEX_TOP_N },
    };
}

module.exports = {
    getAlerts,
    getWhaleAlertTxns,
    getDexWhaleAlerts,
    getDexWhaleSingle,
    getStatus,
};
