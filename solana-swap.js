/**
 * solana-swap.js — Jupiter Plugin Swap
 *
 * Menggunakan Jupiter Plugin (v4) yang sudah include:
 *   - Wallet connect built-in (Phantom, Backpack, Solflare, Jupiter Wallet, dll)
 *   - Best-route swap via Jupiter aggregator
 *   - UI lengkap out-of-the-box — tidak perlu Phantom manual
 *
 * CDN: https://terminal.jup.ag/main-v4.js
 */

const solanaSwap = (() => {
    const JUPITER_CDN  = 'https://terminal.jup.ag/main-v4.js';
    const SOL_MINT     = 'So11111111111111111111111111111111111111112';
    const USDC_MINT    = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const CONTAINER_ID = 'jupiterTerminalContainer';

    let _scriptLoaded = false;
    let _initialized  = false;
    let _pendingMint  = null;   // mint dari DEX Analyzer

    // ── Common SPL token presets ───────────────────────────────
    const QUICK_TOKENS = [
        { symbol: 'SOL',    mint: SOL_MINT,                                          label: '◎ SOL'    },
        { symbol: 'USDC',   mint: USDC_MINT,                                         label: '� USDC'   },
        { symbol: 'JUP',    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',    label: '🪐 JUP'    },
        { symbol: 'BONK',   mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',   label: '🐕 BONK'   },
        { symbol: 'WIF',    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',   label: '🐶 WIF'    },
        { symbol: 'PYTH',   mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',   label: '🔮 PYTH'   },
        { symbol: 'POPCAT', mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',   label: '🐱 POPCAT' },
        { symbol: 'TRUMP',  mint: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',   label: '🎩 TRUMP'  },
    ];

    // ── Load Jupiter Plugin script (once) ─────────────────────
    function _loadScript(cb) {
        if (_scriptLoaded) { cb?.(); return; }
        if (document.getElementById('_jupScript')) { _scriptLoaded = true; cb?.(); return; }
        _setStatus('Memuat Jupiter Plugin…', 'loading');
        const s   = document.createElement('script');
        s.id      = '_jupScript';
        s.src     = JUPITER_CDN;
        s.onload  = () => { _scriptLoaded = true; console.log('🪐 Jupiter Plugin loaded'); cb?.(); };
        s.onerror = () => _setStatus('Gagal memuat Jupiter Plugin. Periksa koneksi internet.', 'error');
        document.head.appendChild(s);
    }

    // ── Init / re-init Jupiter widget ─────────────────────────
    function _launchJupiter(inputMint = null, outputMint = null) {
        _loadScript(() => {
            if (typeof window.Jupiter === 'undefined') {
                _setStatus('Jupiter belum siap, tunggu sebentar…', 'warn');
                setTimeout(() => _launchJupiter(inputMint, outputMint), 800);
                return;
            }
            // Close existing instance to avoid duplicate
            try { window.Jupiter.close(); } catch {}

            window.Jupiter.init({
                displayMode: 'integrated',
                integratedTargetId: CONTAINER_ID,
                strictTokenList: false,          // allow memecoin / newly listed
                defaultExplorer: 'Solscan',
                formProps: {
                    swapMode:          'ExactIn',
                    initialInputMint:  inputMint  || USDC_MINT,
                    initialOutputMint: outputMint || SOL_MINT,
                    fixedOutputMint:   false,
                },
            });

            _setStatus('Jupiter siap — connect wallet di dalam widget & mulai swap!', 'ok');
        });
    }

    // ── Status bar ─────────────────────────────────────────────
    function _setStatus(msg, type = 'idle') {
        const el = document.getElementById('swapStatus');
        if (!el) return;
        el.textContent = msg;
        el.className   = `swap-status swap-status-${type}`;
    }

    // ── Render quick token buttons ─────────────────────────────
    function _renderQuickTokens() {
        const wrap = document.getElementById('swapQuickTokens');
        if (!wrap) return;
        wrap.innerHTML = QUICK_TOKENS.map(t =>
            `<button class="swap-quick-btn" onclick="solanaSwap.quickSwap('${t.mint}','${t.symbol}')">${t.label}</button>`
        ).join('');
    }

    // ── Public: Quick swap preset ──────────────────────────────
    function quickSwap(mint, symbol) {
        const lbl = document.getElementById('swapTargetToken');
        if (lbl) lbl.textContent = `→ ${symbol}`;
        _launchJupiter(USDC_MINT, mint);   // swap USDC → token
    }

    // ── Public: Set token from DEX Analyzer ───────────────────
    function setSwapToken(mint, symbol) {
        _pendingMint = mint;
        const lbl = document.getElementById('swapTargetToken');
        if (lbl) lbl.textContent = symbol ? `→ ${symbol}` : '';
        if (_scriptLoaded && typeof window.Jupiter !== 'undefined') {
            _launchJupiter(USDC_MINT, mint);
        }
    }

    // ── Public: Init (called when tab opened) ─────────────────
    function init() {
        _renderQuickTokens();

        if (!_initialized) {
            _initialized = true;
            // Listen for token events from DEX Analyzer
            document.addEventListener('swapTokenSelected', (e) => {
                const { mint, symbol } = e.detail || {};
                if (mint) setSwapToken(mint, symbol);
            });
            console.log('🪐 Solana Swap module initialized');
        }

        // Launch Jupiter: with pending mint (from DEX Analyzer) or defaults
        if (_pendingMint) {
            _launchJupiter(USDC_MINT, _pendingMint);
            _pendingMint = null;
        } else {
            _launchJupiter();
        }
    }

    return { init, quickSwap, setSwapToken };
})();
