/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   PHANTOM WALLET — Global Solana Wallet Integration          ║
 * ║   Non-custodial · All transactions signed by user wallet     ║
 * ║   Works across all tabs: DEX Hunter, AI Terminal, Swap       ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
const PhantomWallet = (() => {
    const PROXY = 'http://127.0.0.1:3001';
    let _provider = null;
    let _connected = false;
    let _publicKey = null;
    let _balance = 0;
    let _balanceUsd = 0;
    let _tokens = [];
    let _listeners = [];
    let _solPrice = 0;

    // ─── Styles ───────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('pw-styles')) return;
        const s = document.createElement('style');
        s.id = 'pw-styles';
        s.textContent = `
/* ── Phantom Modal ───────────────────────────────────────────── */
#pwModal {
    position: fixed; inset: 0; z-index: 10000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,.75); backdrop-filter: blur(4px);
    animation: pw-fade-in .2s ease;
}
@keyframes pw-fade-in { from{opacity:0} to{opacity:1} }
.pw-modal-box {
    background: #0a0e1a; border: 1px solid #1e3a5f;
    border-radius: 20px; padding: 28px; width: 360px; max-width: 95vw;
    box-shadow: 0 24px 80px rgba(0,0,0,.8);
    animation: pw-slide-up .25s ease;
}
@keyframes pw-slide-up { from{transform:translateY(24px);opacity:0} to{transform:translateY(0);opacity:1} }
.pw-modal-title {
    font-size: 18px; font-weight: 900; color: #f1f5f9;
    text-align: center; margin-bottom: 6px;
}
.pw-modal-sub {
    font-size: 12px; color: #64748b; text-align: center; margin-bottom: 24px;
}
.pw-wallet-option {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; background: #0f172a; border: 1px solid #1e293b;
    border-radius: 12px; cursor: pointer; margin-bottom: 10px;
    transition: all .2s;
}
.pw-wallet-option:hover { background: #1e293b; border-color: #334155; transform: translateY(-1px); }
.pw-wallet-option.detecting { opacity: .6; cursor: default; }
.pw-wallet-icon {
    width: 42px; height: 42px; border-radius: 10px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 24px;
}
.pw-wallet-name { font-size: 14px; font-weight: 700; color: #e2e8f0; }
.pw-wallet-desc { font-size: 11px; color: #64748b; }
.pw-detect-badge {
    margin-left: auto; padding: 2px 8px; border-radius: 10px;
    font-size: 10px; font-weight: 700;
}
.pw-detect-found { background: rgba(34,197,94,.15); color: #4ade80; border: 1px solid rgba(34,197,94,.3); }
.pw-detect-missing { background: rgba(100,116,139,.1); color: #64748b; border: 1px solid #1e293b; }
.pw-modal-close {
    width: 100%; margin-top: 8px; padding: 10px; background: transparent;
    border: 1px solid #1e293b; color: #64748b; border-radius: 10px;
    font-size: 12px; cursor: pointer; transition: all .15s;
}
.pw-modal-close:hover { background: #1e293b; color: #e2e8f0; }
.pw-modal-warning {
    background: rgba(245,158,11,.08); border: 1px solid rgba(245,158,11,.2);
    border-radius: 8px; padding: 10px 12px; font-size: 11px; color: #fbbf24;
    margin-bottom: 16px; line-height: 1.5;
}

/* ── Global Wallet Status Bar ────────────────────────────────── */
#pwStatusBar {
    display: none;
    position: fixed; bottom: 0; left: 0; right: 0;
    background: linear-gradient(90deg, #060912, #0a0e1a);
    border-top: 1px solid #1e293b;
    padding: 8px 20px; z-index: 9000;
    font-size: 12px; align-items: center; gap: 16px; flex-wrap: wrap;
}
#pwStatusBar.visible { display: flex; }
.pw-sb-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
    animation: pw-pulse 2s infinite;
}
@keyframes pw-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
.pw-sb-addr { font-family: monospace; color: #60a5fa; font-size: 11px; }
.pw-sb-balance { color: #4ade80; font-weight: 700; }
.pw-sb-usd { color: #64748b; }
.pw-sb-actions { display: flex; gap: 6px; margin-left: auto; }
.pw-sb-btn {
    padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
    cursor: pointer; border: none; transition: opacity .15s;
}
.pw-sb-btn:hover { opacity: .8; }
.pw-sb-disconnect { background: #1e293b; border: 1px solid #334155; color: #94a3b8; }
.pw-sb-copy { background: transparent; border: 1px solid #334155; color: #64748b; }

/* ── Quick Buy Drawer ────────────────────────────────────────── */
#pwQuickBuyDrawer {
    position: fixed; bottom: 52px; right: 20px;
    background: #0a0e1a; border: 1px solid #1e3a5f; border-radius: 14px;
    padding: 16px; width: 300px; z-index: 9001;
    box-shadow: 0 8px 32px rgba(0,0,0,.6);
    display: none;
}
#pwQuickBuyDrawer.visible { display: block; animation: pw-slide-up .2s ease; }
.pw-qb-title { font-size: 13px; font-weight: 800; color: #e2e8f0; margin-bottom: 12px; }
.pw-qb-input-row { display: flex; gap: 6px; margin-bottom: 10px; }
.pw-qb-input {
    flex: 1; background: #060912; border: 1px solid #1e293b; color: #e2e8f0;
    border-radius: 7px; padding: 8px 10px; font-size: 12px; outline: none;
    transition: border-color .2s;
}
.pw-qb-input:focus { border-color: #7c3aed; }
.pw-qb-execute {
    background: linear-gradient(135deg, #16a34a, #22c55e);
    border: none; color: #fff; border-radius: 7px; padding: 8px 14px;
    font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.pw-qb-execute:hover { opacity: .85; }
.pw-qb-presets { display: flex; gap: 5px; margin-bottom: 10px; }
.pw-qb-preset {
    flex: 1; background: #1e293b; border: 1px solid #334155; color: #94a3b8;
    border-radius: 5px; padding: 5px; font-size: 11px; font-weight: 600;
    cursor: pointer; text-align: center; transition: all .15s;
}
.pw-qb-preset:hover { background: #334155; color: #e2e8f0; }
.pw-qb-close {
    position: absolute; top: 10px; right: 10px;
    background: none; border: none; color: #475569; cursor: pointer; font-size: 16px;
}
`;
        document.head.appendChild(s);
    }

    // ─── Detect Providers ─────────────────────────────────────────
    function detectPhantom() {
        return window.solana || window.phantom?.solana;
    }
    function detectBackpack() {
        return window.backpack;
    }
    function detectSolflare() {
        return window.solflare;
    }

    // ─── Connect Flow ─────────────────────────────────────────────
    async function connect(walletType = 'phantom') {
        injectStyles();

        // If already connected, show status
        if (_connected) {
            showStatusBar();
            return { ok: true, address: _publicKey };
        }

        // Auto-detect available wallet
        const phantom = detectPhantom();
        if (!phantom && walletType === 'phantom') {
            showConnectModal();
            return { ok: false, error: 'Phantom not installed' };
        }

        try {
            const provider = phantom || detectBackpack() || detectSolflare();
            if (!provider) {
                showConnectModal();
                return { ok: false, error: 'No wallet found' };
            }

            const resp = await provider.connect();
            _provider = provider;
            _connected = true;
            _publicKey = resp.publicKey.toString();

            // Setup disconnect listener
            provider.on('disconnect', () => handleDisconnect());
            provider.on('accountChanged', (pk) => {
                if (pk) { _publicKey = pk.toString(); fetchBalance(); }
                else handleDisconnect();
            });

            await fetchBalance();
            await fetchSolPrice();
            showStatusBar();
            notifyListeners('connect', { address: _publicKey, balance: _balance });

            // Update all wallet buttons in UI
            updateAllButtons();

            console.log(`[PhantomWallet] Connected: ${_publicKey}`);
            return { ok: true, address: _publicKey, balance: _balance };
        } catch (e) {
            if (e.code === 4001) {
                console.log('[PhantomWallet] User rejected connection');
                return { ok: false, error: 'User rejected' };
            }
            console.error('[PhantomWallet] Connect error:', e);
            return { ok: false, error: e.message };
        }
    }

    function disconnect() {
        if (_provider) {
            try { _provider.disconnect(); } catch (e) { }
        }
        handleDisconnect();
    }

    function handleDisconnect() {
        _connected = false;
        _publicKey = null;
        _balance = 0;
        _provider = null;
        _tokens = [];
        hideStatusBar();
        notifyListeners('disconnect', {});
        updateAllButtons();
        console.log('[PhantomWallet] Disconnected');
    }

    // ─── Balance & Price ──────────────────────────────────────────
    async function fetchBalance() {
        if (!_connected || !_publicKey) return;
        try {
            // Use proxy RPC endpoint
            const r = await fetch(`${PROXY}/rpc/solana`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', id: 1,
                    method: 'getBalance',
                    params: [_publicKey, { commitment: 'confirmed' }]
                })
            });
            const data = await r.json();
            if (data?.result?.value !== undefined) {
                _balance = data.result.value / 1e9;
                updateBalanceDisplay();
            }
        } catch (e) {
            // Fallback: use provider directly
            try {
                if (_provider?.request) {
                    const resp = await _provider.request({
                        method: 'getBalance',
                        params: [_publicKey]
                    });
                    if (resp?.value !== undefined) _balance = resp.value / 1e9;
                }
            } catch (e2) { /* silent */ }
        }
    }

    async function fetchSolPrice() {
        try {
            const r = await fetch(`${PROXY}/sol-price`);
            const d = await r.json();
            _solPrice = d?.price || d?.usd || 0;
            _balanceUsd = _balance * _solPrice;
            updateBalanceDisplay();
        } catch (e) { /* silent */ }
    }

    function updateBalanceDisplay() {
        const balEl = document.getElementById('pwSbBalance');
        const usdEl = document.getElementById('pwSbUsd');
        if (balEl) balEl.textContent = _balance.toFixed(4) + ' SOL';
        if (usdEl && _solPrice) usdEl.textContent = `≈ $${(_balance * _solPrice).toFixed(2)}`;

        // Update AI Terminal wallet stats
        const aitBal = document.getElementById('aitWalletUsd');
        if (aitBal && _solPrice) aitBal.textContent = `$${(_balance * _solPrice).toFixed(2)}`;
        const aitTok = document.getElementById('aitWalletTokens');
        if (aitTok) aitTok.textContent = _tokens.length + ' tokens';
    }

    // ─── Status Bar ───────────────────────────────────────────────
    function showStatusBar() {
        let bar = document.getElementById('pwStatusBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'pwStatusBar';
            document.body.appendChild(bar);
        }
        bar.innerHTML = `
            <div class="pw-sb-dot"></div>
            <span class="pw-sb-addr" title="${_publicKey}">${shortAddr(_publicKey)}</span>
            <span class="pw-sb-balance" id="pwSbBalance">${_balance.toFixed(4)} SOL</span>
            <span class="pw-sb-usd" id="pwSbUsd">${_solPrice ? '≈ $' + (_balance * _solPrice).toFixed(2) : ''}</span>
            <div class="pw-sb-actions">
                <button class="pw-sb-btn pw-sb-copy" onclick="PhantomWallet.copyAddress()" title="Copy address">📋 Copy</button>
                <button class="pw-sb-btn pw-sb-disconnect" onclick="PhantomWallet.disconnect()">Disconnect</button>
            </div>
        `;
        bar.className = 'visible';

        // Add bottom padding to body so content not hidden
        document.body.style.paddingBottom = '52px';
    }

    function hideStatusBar() {
        const bar = document.getElementById('pwStatusBar');
        if (bar) bar.className = '';
        document.body.style.paddingBottom = '';
    }

    // ─── Connect Modal ────────────────────────────────────────────
    function showConnectModal() {
        let modal = document.getElementById('pwModal');
        if (modal) { modal.remove(); }

        const phantom = detectPhantom();
        const backpack = detectBackpack();
        const solflare = detectSolflare();

        modal = document.createElement('div');
        modal.id = 'pwModal';
        modal.innerHTML = `
            <div class="pw-modal-box">
                <div class="pw-modal-title">👻 Connect Wallet</div>
                <div class="pw-modal-sub">Choose your Solana wallet to start trading</div>
                <div class="pw-modal-warning">
                    🔒 We never store your private key. All transactions require your wallet signature.
                </div>
                <div class="pw-wallet-option ${!phantom ? 'detecting' : ''}" onclick="${phantom ? 'PhantomWallet.connectWith(\'phantom\')' : 'PhantomWallet.installPhantom()'}">
                    <div class="pw-wallet-icon" style="background:linear-gradient(135deg,#4e44ce,#8b5cf6)">👻</div>
                    <div>
                        <div class="pw-wallet-name">Phantom</div>
                        <div class="pw-wallet-desc">Most popular Solana wallet</div>
                    </div>
                    <span class="pw-detect-badge ${phantom ? 'pw-detect-found' : 'pw-detect-missing'}">${phantom ? 'Detected ✓' : 'Install →'}</span>
                </div>
                <div class="pw-wallet-option ${!backpack ? 'detecting' : ''}" onclick="${backpack ? 'PhantomWallet.connectWith(\'backpack\')' : ''}">
                    <div class="pw-wallet-icon" style="background:linear-gradient(135deg,#1a1a2e,#7c3aed)">🎒</div>
                    <div>
                        <div class="pw-wallet-name">Backpack</div>
                        <div class="pw-wallet-desc">Multi-chain wallet by Coral</div>
                    </div>
                    <span class="pw-detect-badge ${backpack ? 'pw-detect-found' : 'pw-detect-missing'}">${backpack ? 'Detected ✓' : 'Not found'}</span>
                </div>
                <div class="pw-wallet-option ${!solflare ? 'detecting' : ''}" onclick="${solflare ? 'PhantomWallet.connectWith(\'solflare\')' : ''}">
                    <div class="pw-wallet-icon" style="background:linear-gradient(135deg,#f59e0b,#f97316)">🔆</div>
                    <div>
                        <div class="pw-wallet-name">Solflare</div>
                        <div class="pw-wallet-desc">Hardware wallet support</div>
                    </div>
                    <span class="pw-detect-badge ${solflare ? 'pw-detect-found' : 'pw-detect-missing'}">${solflare ? 'Detected ✓' : 'Not found'}</span>
                </div>
                <button class="pw-modal-close" onclick="document.getElementById('pwModal').remove()">Cancel</button>
            </div>
        `;
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    }

    async function connectWith(walletType) {
        document.getElementById('pwModal')?.remove();
        await connect(walletType);
    }

    function installPhantom() {
        window.open('https://phantom.app/', '_blank');
        document.getElementById('pwModal')?.remove();
    }

    // ─── Sign & Execute Transaction ───────────────────────────────
    async function signAndSend(txBase64) {
        if (!_connected || !_provider) {
            return { ok: false, error: 'Wallet not connected' };
        }
        try {
            // Decode base64 tx
            const txBytes = Uint8Array.from(atob(txBase64), c => c.charCodeAt(0));

            // Sign via wallet
            const { signature } = await _provider.signAndSendTransaction({
                serialize: () => txBytes,
                serializeMessage: () => txBytes,
            });

            return { ok: true, signature };
        } catch (e) {
            if (e.code === 4001) return { ok: false, error: 'User rejected transaction' };
            return { ok: false, error: e.message };
        }
    }

    // Jupiter Swap execution
    async function executeSwap(inputMint, outputMint, amountSol) {
        if (!_connected || !_provider) {
            await connect();
            if (!_connected) return { ok: false, error: 'Wallet not connected' };
        }

        const lamports = Math.floor(amountSol * 1e9);
        try {
            // 1. Get Jupiter quote
            const quoteR = await fetch(`${PROXY}/jupiter/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${lamports}&slippage=1`);
            const quote = await quoteR.json();
            if (!quote.outAmount) return { ok: false, error: 'No route found' };

            // 2. Get swap transaction
            const swapR = await fetch(`${PROXY}/jupiter/swap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quoteResponse: quote,
                    userPublicKey: _publicKey,
                    wrapUnwrapSOL: true,
                })
            });
            const swapData = await swapR.json();
            if (!swapData.swapTransaction) return { ok: false, error: 'Could not build transaction' };

            // 3. Decode and sign
            const txBytes = Uint8Array.from(atob(swapData.swapTransaction), c => c.charCodeAt(0));
            const { VersionedTransaction } = await import('https://esm.sh/@solana/web3.js@1.95.8');
            const tx = VersionedTransaction.deserialize(txBytes);
            const signedTx = await _provider.signTransaction(tx);

            // 4. Send via proxy
            const sendR = await fetch(`${PROXY}/jupiter/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction: btoa(String.fromCharCode(...signedTx.serialize())) })
            });
            const result = await sendR.json();
            if (result.signature) {
                await fetchBalance();
                return { ok: true, signature: result.signature };
            }
            return { ok: false, error: result.error || 'Send failed' };
        } catch (e) {
            console.error('[PhantomWallet] Swap error:', e);
            return { ok: false, error: e.message };
        }
    }

    // ─── Quick Buy from any tab ───────────────────────────────────
    async function quickBuy(mint, symbol, amountSol = 0.05) {
        if (!_connected) {
            const r = await connect();
            if (!r.ok) return { ok: false, error: 'Wallet not connected' };
        }

        const SOL_MINT = 'So11111111111111111111111111111111111111112';
        if (window.AiTerminal) {
            window.AiTerminal.showToast('signal', `Buying ${symbol}`, `Executing ${amountSol} SOL via Jupiter…`);
        }

        const result = await executeSwap(SOL_MINT, mint, amountSol);

        if (result.ok) {
            if (window.AiTerminal) {
                window.AiTerminal.showToast('signal', `✅ ${symbol} Bought!`, `TX: ${result.signature?.slice(0, 16)}…`);
            }
        } else {
            if (window.AiTerminal) {
                window.AiTerminal.showToast('danger', `Buy Failed`, result.error);
            }
        }
        return result;
    }

    // ─── Event system ─────────────────────────────────────────────
    function on(event, cb) {
        _listeners.push({ event, cb });
    }
    function notifyListeners(event, data) {
        _listeners.filter(l => l.event === event).forEach(l => l.cb(data));
    }

    // ─── UI Helpers ───────────────────────────────────────────────
    function updateAllButtons() {
        document.querySelectorAll('[data-phantom-connect]').forEach(btn => {
            if (_connected) {
                btn.textContent = `👻 ${shortAddr(_publicKey)}`;
                btn.setAttribute('onclick', 'PhantomWallet.disconnect()');
                btn.style.background = 'linear-gradient(135deg,#14532d,#16a34a)';
            } else {
                btn.textContent = '👻 Connect Phantom';
                btn.setAttribute('onclick', 'PhantomWallet.connect()');
                btn.style.background = '';
            }
        });
        // Update AI terminal header button
        if (window.AiTerminal) {
            AiTerminal.updatePhantomBtn?.();
        }
    }

    function copyAddress() {
        if (_publicKey) {
            navigator.clipboard.writeText(_publicKey).then(() => {
                if (window.AiTerminal) AiTerminal.showToast('info', 'Copied!', _publicKey.slice(0, 20) + '…');
            });
        }
    }

    function shortAddr(a) {
        if (!a || a.length < 10) return a || '—';
        return a.slice(0, 4) + '…' + a.slice(-4);
    }

    // ─── Getters ──────────────────────────────────────────────────
    function isConnected() { return _connected; }
    function address() { return _publicKey; }
    function balance() { return _balance; }
    function balanceUsd() { return _balanceUsd; }
    function solPrice() { return _solPrice; }
    function provider() { return _provider; }

    // ─── Init ─────────────────────────────────────────────────────
    function init() {
        injectStyles();
        // Auto-reconnect if user was previously connected
        const phantom = detectPhantom();
        if (phantom?.isConnected) {
            phantom.connect({ onlyIfTrusted: true })
                .then(resp => {
                    _provider = phantom;
                    _connected = true;
                    _publicKey = resp.publicKey.toString();
                    phantom.on('disconnect', handleDisconnect);
                    fetchBalance();
                    fetchSolPrice();
                    showStatusBar();
                    updateAllButtons();
                    console.log('[PhantomWallet] Auto-reconnected:', _publicKey);
                })
                .catch(() => { /* no previous session */ });
        }
    }

    return {
        init, connect, disconnect, connectWith, installPhantom,
        quickBuy, executeSwap, signAndSend,
        isConnected, address, balance, balanceUsd, solPrice, provider,
        copyAddress, updateAllButtons,
        on,
    };
})();
