// ══════════════════════════════════════════════════════════════════════════════
//  dex-screener-api.js — DEXScreener API wrapper
//  Fetch trending tokens & gainers dari DEXScreener (no API key needed)
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const fetch = require('node-fetch');

const BASE = 'https://api.dexscreener.com';

// ── Helpers ───────────────────────────────────────────────────────────────────
async function _get(url, timeout = 10000) {
    // Support both relative path and full URL
    const fullUrl = url.startsWith('http') ? url : `${BASE}${url}`;
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeout);
    try {
        const r = await fetch(fullUrl, {
            signal : ctrl.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 CryptoScanner/1.0' },
        });
        clearTimeout(tid);
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${fullUrl}`);
        return await r.json();
    } finally {
        clearTimeout(tid);
    }
}

// ── Parse pair object to normalized format ────────────────────────────────────
function parsePair(p) {
    if (!p || !p.baseToken) return null;

    const age24h = p.pairCreatedAt
        ? (Date.now() - p.pairCreatedAt) / 3600000     // hours
        : 9999;

    // DEXScreener tidak expose makers langsung — estimasi dari txns unik
    // Gunakan (buys24h / avg_txns_per_maker) sebagai proxy
    const buys24h  = p.txns?.h24?.buys  || 0;
    const sells24h = p.txns?.h24?.sells || 0;
    const txns24h  = buys24h + sells24h;
    // Proxy makers: biasanya ~30-50% dari total txns (rough estimate)
    const makerEst = Math.round(txns24h * 0.4);

    return {
        // Identity
        pairAddress : p.pairAddress,
        chain       : p.chainId,
        dex         : p.dexId,
        baseSymbol  : p.baseToken.symbol,
        baseName    : p.baseToken.name,
        baseMint    : p.baseToken.address,
        quoteSymbol : p.quoteToken?.symbol || 'SOL',
        quoteMint   : p.quoteToken?.address || '',
        url         : p.url,

        // Price
        priceUsd    : parseFloat(p.priceUsd || 0),
        priceNative : parseFloat(p.priceNative || 0),

        // Age
        ageHours    : age24h,
        pairCreatedAt: p.pairCreatedAt,

        // Volume
        vol5m       : p.volume?.m5  || 0,
        vol1h       : p.volume?.h1  || 0,
        vol6h       : p.volume?.h6  || 0,
        vol24h      : p.volume?.h24 || 0,

        // Price change %
        chg5m       : p.priceChange?.m5  || 0,
        chg1h       : p.priceChange?.h1  || 0,
        chg6h       : p.priceChange?.h6  || 0,
        chg24h      : p.priceChange?.h24 || 0,

        // Transactions
        txns5m      : (p.txns?.m5?.buys  || 0) + (p.txns?.m5?.sells  || 0),
        txns1h      : (p.txns?.h1?.buys  || 0) + (p.txns?.h1?.sells  || 0),
        txns24h,
        buys5m      : p.txns?.m5?.buys   || 0,
        sells5m     : p.txns?.m5?.sells  || 0,
        buys1h      : p.txns?.h1?.buys   || 0,
        sells1h     : p.txns?.h1?.sells  || 0,
        buys24h,
        sells24h,

        // Liquidity
        liquidityUsd: p.liquidity?.usd   || 0,
        fdv         : p.fdv              || 0,
        mcap        : p.marketCap        || 0,

        // Makers (estimated dari txns, karena DEXScreener tidak expose)
        makers24h   : makerEst,
        makers1h    : Math.round(((p.txns?.h1?.buys||0)+(p.txns?.h1?.sells||0)) * 0.4),
        makers5m    : Math.round(((p.txns?.m5?.buys||0)+(p.txns?.m5?.sells||0)) * 0.4),

        // Boosts
        boosts      : p.boosts?.active  || 0,

        // Social info
        imageUrl    : p.info?.imageUrl  || '',
        socials     : p.info?.socials   || [],
    };
}

// ══════════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch top gainers dari DEXScreener
 * Strategy: search multiple pump.fun / trending queries dan gabungkan
 * @param {string} chain  — 'solana' | 'bsc' | 'ethereum' | 'base' | '' (all)
 * @param {string} period — '5m' | '1h' | '6h' | '24h' (unused in API, filter manual)
 */
async function getTopGainers(chain = 'solana', period = '24h') {
    // DEXScreener public search endpoint (no API key)
    const queries  = ['pumpfun', 'pump', 'sol meme', 'solana new'];
    const results  = [];
    const seen     = new Set();

    for (const q of queries) {
        try {
            const data  = await _get(`/latest/dex/search?q=${encodeURIComponent(q)}`);
            const pairs = (data.pairs || []);
            for (const p of pairs) {
                if (!seen.has(p.pairAddress) && (!chain || p.chainId === chain)) {
                    seen.add(p.pairAddress);
                    const parsed = parsePair(p);
                    if (parsed) results.push(parsed);
                }
            }
        } catch (e) { /* continue */ }
    }

    // Sort by 24h change desc
    results.sort((a, b) => b.chg24h - a.chg24h);
    return results;
}

/**
 * Search token by symbol or address
 */
async function searchToken(query) {
    const data  = await _get(`/latest/dex/search?q=${encodeURIComponent(query)}`);
    return (data.pairs || []).map(parsePair).filter(Boolean);
}

/**
 * Get pairs by token address (contract address / mint)
 */
async function getTokenPairs(mintOrAddress) {
    const data = await _get(`/latest/dex/tokens/${mintOrAddress}`);
    return (data.pairs || []).map(parsePair).filter(Boolean);
}

/**
 * Get latest listed tokens (baru lahir)
 * Fetch via beberapa query + filter age < 6h
 */
async function getNewTokens(chain = 'solana') {
    const data = await _get(`/latest/dex/search?q=pumpfun`);
    const pairs = (data.pairs || []).map(parsePair).filter(Boolean);
    return pairs
        .filter(p => (!chain || p.chain === chain) && p.ageHours < 6)
        .sort((a, b) => a.ageHours - b.ageHours);
}

/**
 * Get pair detail by pair address
 */
async function getPair(pairAddress, chain = 'solana') {
    try {
        const data  = await _get(`/latest/dex/pairs/${chain}/${pairAddress}`);
        const pairs = data.pairs || (data.pair ? [data.pair] : []);
        return pairs.map(parsePair).filter(Boolean);
    } catch {
        // Fallback: coba via tokens endpoint
        return [];
    }
}

/**
 * Fetch trending tokens via DEXScreener token profiles (curated)
 */
async function getTrendingTokens() {
    const data = await _get('/token-profiles/latest/v1');
    return (Array.isArray(data) ? data : []).slice(0, 50).map(t => ({
        chain       : t.chainId,
        baseMint    : t.tokenAddress,
        url         : t.url,
        description : t.description,
        links       : t.links,
    }));
}

/**
 * Fetch token boosts (tokens being boosted right now — high momentum signal)
 */
async function getBoostedTokens() {
    const data = await _get('/token-boosts/latest/v1');
    return (Array.isArray(data) ? data : []).slice(0, 50).map(t => ({
        chain    : t.chainId,
        baseMint : t.tokenAddress,
        boosts   : t.amount,
        url      : t.url,
    }));
}

/**
 * Get top boosted tokens saat ini
 */
async function getTopBoosted() {
    const data = await _get('/token-boosts/top/v1');
    return (Array.isArray(data) ? data : []).slice(0, 50).map(t => ({
        chain    : t.chainId,
        baseMint : t.tokenAddress,
        boosts   : t.totalAmount,
        url      : t.url,
    }));
}

module.exports = {
    getTopGainers,
    searchToken,
    getTokenPairs,
    getNewTokens,
    getPair,
    getTrendingTokens,
    getBoostedTokens,
    getTopBoosted,
    parsePair,
};
