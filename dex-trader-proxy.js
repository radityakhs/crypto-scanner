#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
//  dex-trader-proxy.js — DEX Trader Proxy Server (port 3004)
//
//  Bridge antara memecoin-hunter.js dan Jupiter API untuk live swap di Solana
//  DRY RUN mode default — set SOLANA_PRIVATE_KEY di .env untuk live trading
//
//  Endpoints:
//    GET  /state          → state lengkap (positions, closed trades, stats)
//    GET  /positions      → open positions saja
//    GET  /scan           → trigger manual scan sekarang
//    POST /buy            → { outputMint, amountUsd } → buy via Jupiter
//    POST /sell           → { pairAddress, reason }   → manual sell
//    POST /close-all      → tutup semua posisi
//    GET  /journal        → trade journal format teks
//
//  Jalankan: node dex-trader-proxy.js
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

require('dotenv').config();

const express  = require('express');
const fetch    = require('node-fetch');
const fs       = require('fs');
const path     = require('path');

const app      = express();
const PORT     = 3004;
const STATE_F  = path.join(__dirname, 'memecoin-state.json');

app.use(express.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ── Config ────────────────────────────────────────────────────────────────────
const PRIVATE_KEY  = process.env.SOLANA_PRIVATE_KEY || '';
const DRY_RUN      = !PRIVATE_KEY || process.env.DRY_RUN === 'true';
const RPC_URL      = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const SOL_MINT     = 'So11111111111111111111111111111111111111112';
const USDC_MINT    = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUPITER_API  = 'https://quote-api.jup.ag/v6';
const SLIPPAGE_BPS = 500;   // 5% slippage untuk memecoin

// ── State helpers ─────────────────────────────────────────────────────────────
function loadState() {
    try {
        if (fs.existsSync(STATE_F))
            return JSON.parse(fs.readFileSync(STATE_F, 'utf8'));
    } catch {}
    return { positions: {}, closedTrades: [], totalPnl: 0, dailyPnl: 0, stats: {} };
}

function saveState(state) {
    fs.writeFileSync(STATE_F, JSON.stringify(state, null, 2));
}

// ── Jupiter Quote & Swap ──────────────────────────────────────────────────────

/**
 * Ambil quote dari Jupiter untuk swap inputMint → outputMint
 * @param {string} inputMint
 * @param {string} outputMint
 * @param {number} amountLamports — amount dalam lamports (SOL) atau base unit
 */
async function getJupiterQuote(inputMint, outputMint, amountLamports) {
    const url = `${JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${SLIPPAGE_BPS}&onlyDirectRoutes=false`;
    const r   = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`Jupiter quote HTTP ${r.status}`);
    return await r.json();
}

/**
 * Execute swap via Jupiter (butuh private key wallet Solana)
 * Catatan: Ini memerlukan @solana/web3.js + Keypair
 * Untuk sekarang, dry run saja + tampilkan quote
 */
async function executeJupiterSwap(quote, walletPublicKey) {
    if (DRY_RUN) {
        // Simulasi saja
        return {
            success  : true,
            dryRun   : true,
            txHash   : 'DRY_RUN_' + Date.now(),
            inAmount : quote.inAmount,
            outAmount: quote.outAmount,
            priceImpactPct: quote.priceImpactPct,
        };
    }

    // LIVE: kirim ke Jupiter swap endpoint
    // Perlu serialisasi transaction + sign dengan private key
    // Ini memerlukan @solana/web3.js — install dulu jika live mode
    try {
        const swapResp = await fetch(`${JUPITER_API}/swap`, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({
                quoteResponse        : quote,
                userPublicKey        : walletPublicKey,
                wrapAndUnwrapSol     : true,
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: 'auto',
            }),
        });

        if (!swapResp.ok) throw new Error(`Jupiter swap HTTP ${swapResp.status}`);
        const swapData = await swapResp.json();

        // Di sini harusnya sign & submit transaction via @solana/web3.js
        // Untuk sekarang return swapTransaction untuk di-sign manual
        return {
            success         : true,
            swapTransaction : swapData.swapTransaction,
            note            : 'Transaction perlu di-sign via Phantom/CLI solana. Set up @solana/web3.js untuk auto-sign.',
        };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ── USDC amount → lamports SOL equivalent ─────────────────────────────────────
async function usdToLamports(amountUsd) {
    try {
        const r    = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const data = await r.json();
        const sol  = data?.solana?.usd || 150;
        const lamports = Math.floor((amountUsd / sol) * 1e9);
        return { lamports, solPrice: sol, solAmount: amountUsd / sol };
    } catch {
        // Fallback: estimasi SOL $150
        return { lamports: Math.floor((amountUsd / 150) * 1e9), solPrice: 150, solAmount: amountUsd / 150 };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// GET /state
app.get('/state', (req, res) => {
    const state = loadState();
    res.json({
        ok       : true,
        dryRun   : DRY_RUN,
        positions: state.positions || {},
        stats    : state.stats || {},
        totalPnl : state.totalPnl || 0,
        dailyPnl : state.dailyPnl || 0,
        openCount: Object.keys(state.positions || {}).length,
        trades   : (state.closedTrades || []).length,
    });
});

// GET /positions
app.get('/positions', (req, res) => {
    const state = loadState();
    const pos   = Object.values(state.positions || {});
    res.json({ ok: true, count: pos.length, positions: pos });
});

// GET /trades
app.get('/trades', (req, res) => {
    const state  = loadState();
    const limit  = parseInt(req.query.limit) || 50;
    const trades = (state.closedTrades || []).slice(0, limit);
    res.json({ ok: true, count: trades.length, trades });
});

// POST /buy — { outputMint, amountUsd, symbol? }
app.post('/buy', async (req, res) => {
    const { outputMint, amountUsd = 20, symbol = '?' } = req.body;

    if (!outputMint) return res.json({ success: false, error: 'outputMint required' });

    try {
        const { lamports, solPrice, solAmount } = await usdToLamports(amountUsd);
        const quote = await getJupiterQuote(SOL_MINT, outputMint, lamports);

        const result = await executeJupiterSwap(quote, process.env.SOLANA_WALLET_ADDRESS || '');

        res.json({
            success     : result.success,
            dryRun      : DRY_RUN,
            symbol,
            outputMint,
            amountUsd,
            solAmount   : solAmount.toFixed(6),
            solPrice,
            lamports,
            priceImpact : quote.priceImpactPct,
            outAmount   : quote.outAmount,
            txHash      : result.txHash || null,
            note        : result.note || null,
            error       : result.error || null,
        });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// POST /sell — { pairAddress, reason, exitPrice? }
app.post('/sell', (req, res) => {
    const { pairAddress, reason = 'Manual sell', exitPrice } = req.body;
    if (!pairAddress) return res.json({ success: false, error: 'pairAddress required' });

    const state = loadState();
    const pos   = (state.positions || {})[pairAddress];
    if (!pos) return res.json({ success: false, error: 'Posisi tidak ditemukan' });

    const price = exitPrice || pos.currentPrice || pos.entryPrice;
    const pnl   = (price - pos.entryPrice) / pos.entryPrice * pos.sizeUsd;

    // Pindah ke closed trades
    const closed = { ...pos, exitPrice: price, closedAt: new Date().toISOString(), reason, pnlUsd: pnl };
    state.closedTrades = [closed, ...(state.closedTrades || [])];
    delete state.positions[pairAddress];
    state.totalPnl = (state.totalPnl || 0) + pnl;
    state.dailyPnl = (state.dailyPnl || 0) + pnl;
    if (state.stats) {
        state.stats.totalTrades = (state.stats.totalTrades || 0) + 1;
        if (pnl > 0) state.stats.wins = (state.stats.wins || 0) + 1;
        else state.stats.losses = (state.stats.losses || 0) + 1;
    }
    saveState(state);

    res.json({ success: true, dryRun: DRY_RUN, pnlUsd: pnl, closed });
});

// POST /close-all
app.post('/close-all', (req, res) => {
    const { reason = 'Manual close-all' } = req.body;
    const state  = loadState();
    const closed = [];

    for (const [pa, pos] of Object.entries(state.positions || {})) {
        const price = pos.currentPrice || pos.entryPrice;
        const pnl   = (price - pos.entryPrice) / pos.entryPrice * pos.sizeUsd;
        const c     = { ...pos, exitPrice: price, closedAt: new Date().toISOString(), reason, pnlUsd: pnl };
        state.closedTrades = [c, ...(state.closedTrades || [])];
        state.totalPnl = (state.totalPnl || 0) + pnl;
        state.dailyPnl = (state.dailyPnl || 0) + pnl;
        closed.push(c);
        delete state.positions[pa];
    }

    saveState(state);
    res.json({ success: true, closedCount: closed.length, trades: closed });
});

// GET /journal — human-readable trade journal
app.get('/journal', (req, res) => {
    const state  = loadState();
    const pos    = Object.values(state.positions || {});
    const trades = state.closedTrades || [];
    const TZ     = 'Asia/Jakarta';

    const fmt = iso => iso ? new Date(iso).toLocaleString('id-ID', { timeZone: TZ }) : '—';
    const pnls = n => n == null ? '—' : (n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`);

    let txt = `\n📊 MEMECOIN TRADE JOURNAL\n${'═'.repeat(60)}\n`;
    txt += `Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Total P&L: ${pnls(state.totalPnl)}\n\n`;

    txt += `🟢 OPEN POSITIONS (${pos.length})\n`;
    for (const p of pos) {
        const pct = p.currentPrice > 0
            ? ((p.currentPrice - p.entryPrice) / p.entryPrice * 100).toFixed(1)
            : '—';
        txt += `  ${p.coinSymbol} | Entry: $${p.entryPrice} | Now: $${p.currentPrice || '?'} | ${pct}%\n`;
        txt += `    Opened: ${fmt(p.openedAt)} | SL: $${p.stopLoss?.toExponential(4)} | Score: ${p.score}/100\n`;
        txt += `    TP1: +${50}% | TP2: +${100}% | TP3: +${300}%\n`;
    }

    txt += `\n📋 CLOSED TRADES (${trades.length} total)\n`;
    for (const [i, t] of trades.slice(0, 30).entries()) {
        const icon = t.pnlUsd > 0 ? '✅' : '🔴';
        txt += `  ${icon} ${(i+1).toString().padStart(2)}. ${t.coinSymbol} | ${fmt(t.openedAt)} → ${fmt(t.closedAt)}\n`;
        txt += `     Entry: $${t.entryPrice} → Exit: $${t.exitPrice} | P&L: ${pnls(t.pnlUsd)} | ${t.reason}\n`;
    }

    res.type('text/plain').send(txt);
});

// GET /quote — preview harga Jupiter tanpa eksekusi
app.get('/quote', async (req, res) => {
    const { mint, usd = 20 } = req.query;
    if (!mint) return res.json({ error: 'mint required' });
    try {
        const { lamports, solPrice } = await usdToLamports(parseFloat(usd));
        const quote = await getJupiterQuote(SOL_MINT, mint, lamports);
        res.json({
            ok          : true,
            inputMint   : SOL_MINT,
            outputMint  : mint,
            amountUsd   : usd,
            solPrice,
            lamports,
            outAmount   : quote.outAmount,
            priceImpact : quote.priceImpactPct,
            routes      : quote.routePlan?.length,
        });
    } catch (e) {
        res.json({ ok: false, error: e.message });
    }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
    ok     : true,
    port   : PORT,
    dryRun : DRY_RUN,
    ts     : new Date().toISOString(),
    wallet : process.env.SOLANA_WALLET_ADDRESS ? '✅ configured' : '⚠️  not set',
}));

// ══════════════════════════════════════════════════════════════════════════════
//  START SERVER
// ══════════════════════════════════════════════════════════════════════════════
app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🚀 DEX Trader Proxy running on http://127.0.0.1:${PORT}`);
    console.log(`   Mode    : ${DRY_RUN ? '📄 DRY RUN' : '🔴 LIVE TRADING'}`);
    console.log(`   Wallet  : ${process.env.SOLANA_WALLET_ADDRESS || '⚠️  SOLANA_WALLET_ADDRESS not set in .env'}`);
    console.log(`   RPC     : ${RPC_URL}`);
    console.log('');
    console.log('   Endpoints:');
    console.log(`   GET  http://127.0.0.1:${PORT}/state`);
    console.log(`   GET  http://127.0.0.1:${PORT}/positions`);
    console.log(`   GET  http://127.0.0.1:${PORT}/trades`);
    console.log(`   GET  http://127.0.0.1:${PORT}/journal`);
    console.log(`   POST http://127.0.0.1:${PORT}/buy    { outputMint, amountUsd }`);
    console.log(`   POST http://127.0.0.1:${PORT}/sell   { pairAddress, reason }`);
    console.log(`   POST http://127.0.0.1:${PORT}/close-all`);
    console.log('');

    if (!DRY_RUN) {
        console.log('⚠️  LIVE MODE AKTIF — swap akan dieksekusi!');
        console.log('⚠️  Untuk live swap, tambahkan @solana/web3.js:');
        console.log('   npm install @solana/web3.js @solana/spl-token');
    } else {
        console.log('📄 DRY RUN mode — set SOLANA_PRIVATE_KEY + SOLANA_WALLET_ADDRESS di .env untuk live');
    }
    console.log('');
});

module.exports = app;
