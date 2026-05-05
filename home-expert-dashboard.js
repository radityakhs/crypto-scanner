// ══════════════════════════════════════════════════════════════════════════════
// 🚀 EXPERT AUTO-TRADING DASHBOARD — Improved HOME Tab Logic
// ══════════════════════════════════════════════════════════════════════════════
// 
// Key Improvements:
// 1. Search-first wallet connection (localStorage before API)
// 2. Expert settings panel (all visible before trading)
// 3. One-click START button (pre-flight checks)
// 4. Efficient monitoring (not constant polling)
// 5. Professional status indicators
//
// ══════════════════════════════════════════════════════════════════════════════

window.HomeExpertDashboard = (function() {
    'use strict';
    
    const MODULE_NAME = 'HomeExpertDashboard';
    let _initialized = false;
    let _tradingActive = false;
    let _lastMonitorState = null;
    let _monitorInterval = null;
    
    // ═════════════════════════════════════════════════════════════════════════
    // 1. SMART WALLET CONNECTION (Search-first approach)
    // ═════════════════════════════════════════════════════════════════════════
    
    /**
     * Auto-search for existing wallet connection
     * Step 1: Check localStorage
     * Step 2: Check Jupiter extension
     * Step 3: Show manual input
     */
    function autoSearchWallet() {
        log('[Auto Search] Starting wallet search...');
        
        // Step 1: Check localStorage
        const saved = localStorage.getItem('cs_wallet_addr');
        const savedChain = localStorage.getItem('cs_wallet_chain') || 'solana';
        
        if (saved) {
            log(`[Auto Search] Found saved wallet: ${saved.slice(0,6)}...`);
            // Just load it, don't hit API yet
            showSavedWalletStatus(saved, savedChain);
            return;
        }
        
        log('[Auto Search] No saved wallet, checking extensions...');
        
        // Step 2: Check Jupiter extension availability
        const hasJupiter = window?.jupiter || window?.phantom?.solana || window?.solana;
        if (hasJupiter) {
            log('[Auto Search] Jupiter/Phantom found!');
            showJupiterAvailable();
            return;
        }
        
        log('[Auto Search] No extension found, show manual input');
        
        // Step 3: Show manual wallet search
        showWalletSearchInput();
    }
    
    function showSavedWalletStatus(addr, chain) {
        const statusEl = document.getElementById('homeExWalletStatus');
        const connPanel = document.getElementById('homeExWalletConnection');
        
        if (!statusEl) return;
        
        // Normalize chain
        chain = chain === 'sol' ? 'solana' : chain === 'eth' ? 'ethereum' : chain;
        
        statusEl.innerHTML = `
            <div class="hex-status-card" style="border-left: 4px solid #4ade80;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 0.85rem; color: var(--text3); margin-bottom: 4px;">🟢 CONNECTED</div>
                        <div style="font-size: 1.1rem; font-family: monospace; font-weight: bold;">
                            ${addr.slice(0,6)}...${addr.slice(-4)}
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text3); margin-top: 2px;">
                            ${chain === 'solana' ? '◎ Solana Mainnet' : '⟠ ' + chain}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <button class="hex-btn-small" onclick="homeExChangeSavedWallet()">
                            Change
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Hide manual input panel
        if (connPanel) connPanel.style.display = 'none';
        
        // Load saved settings
        setTimeout(() => loadSavedSettings(), 500);
    }
    
    function showJupiterAvailable() {
        const connPanel = document.getElementById('homeExWalletConnection');
        if (!connPanel) return;
        
        connPanel.innerHTML = `
            <div class="hex-panel" style="border: 2px dashed #6366f1;">
                <div style="text-align: center; padding: 20px;">
                    <div style="font-size: 1.2rem; margin-bottom: 10px;">◎ Jupiter Wallet Detected</div>
                    <div style="color: var(--text3); margin-bottom: 16px; font-size: 0.9rem;">
                        Found Jupiter/Phantom extension. Click to connect.
                    </div>
                    <button class="hex-btn" onclick="homeExConnectJupiter()">
                        🔗 Connect Jupiter Wallet
                    </button>
                    <div style="color: var(--text3); margin-top: 16px; font-size: 0.85rem;">
                        — or paste wallet address —
                    </div>
                    <div style="display: flex; gap: 8px; margin-top: 8px;">
                        <input type="text" id="homeExManualAddr" placeholder="Solana address (8m3x...)" 
                               style="flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
                        <button class="hex-btn-small" onclick="homeExCheckManualWallet()">
                            Check
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    function showWalletSearchInput() {
        const connPanel = document.getElementById('homeExWalletConnection');
        if (!connPanel) return;
        
        connPanel.innerHTML = `
            <div class="hex-panel">
                <div style="padding: 16px;">
                    <div style="margin-bottom: 12px; font-weight: 600;">Enter Wallet Address</div>
                    <div style="display: flex; gap: 8px;">
                        <input type="text" id="homeExManualAddr" placeholder="Paste your Solana address here..." 
                               style="flex: 1; padding: 10px; border: 1px solid var(--border); border-radius: 4px; font-family: monospace;">
                        <button class="hex-btn" onclick="homeExCheckManualWallet()">
                            🔍 Check
                        </button>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text3); margin-top: 8px;">
                        💡 We'll verify address and fetch balance once.
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * Connect to Jupiter wallet
     * Only called when user explicitly clicks button
     */
    async function homeExConnectJupiter() {
        log('[Jupiter Connect] Starting...');
        const btn = event.target;
        const original = btn.textContent;
        btn.textContent = '⏳ Connecting...';
        btn.disabled = true;
        
        try {
            const provider = window?.jupiter || window?.phantom?.solana || window?.solana;
            if (!provider) throw new Error('Wallet extension not found');
            
            let pubkey;
            if (provider.isConnected && provider.publicKey) {
                pubkey = provider.publicKey.toString();
            } else {
                const resp = await provider.connect();
                pubkey = (resp?.publicKey || provider.publicKey)?.toString();
            }
            
            if (!pubkey) throw new Error('No public key returned');
            
            log(`[Jupiter Connect] Got address: ${pubkey}`);
            
            // Save and validate
            await homeExValidateAndSaveWallet(pubkey, 'solana');
            
        } catch(e) {
            if (e.code !== 4001) { // Not user rejection
                showError(`Jupiter Connect Error: ${e.message}`);
            }
            log(`[Jupiter Connect] Error: ${e.message}`);
        } finally {
            btn.textContent = original;
            btn.disabled = false;
        }
    }
    
    /**
     * Check manually entered wallet
     * Only validates and saves, doesn't start trading
     */
    async function homeExCheckManualWallet() {
        const input = document.getElementById('homeExManualAddr');
        if (!input) return;
        
        const addr = input.value.trim();
        if (!addr) {
            showError('Please enter wallet address');
            return;
        }
        
        log(`[Manual Wallet] Validating: ${addr.slice(0,6)}...`);
        
        try {
            // Basic validation
            if (addr.length < 32 || addr.length > 44) {
                throw new Error('Invalid address length');
            }
            
            // Save and validate
            await homeExValidateAndSaveWallet(addr, 'solana');
            
        } catch(e) {
            showError(`Wallet Check Error: ${e.message}`);
            log(`[Manual Wallet] Error: ${e.message}`);
        }
    }
    
    /**
     * Validate wallet and fetch balance ONCE
     * This is the ONLY place we hit the API for balance
     */
    async function homeExValidateAndSaveWallet(addr, chain) {
        log(`[Validate Wallet] Checking: ${addr.slice(0,6)}...`);
        
        const statusEl = document.getElementById('homeExWalletStatus');
        if (!statusEl) return;
        
        // Show loading
        statusEl.innerHTML = `<div class="hex-loading">Validating wallet...</div>`;
        
        try {
            // Fetch balance ONCE from Solana RPC
            const response = await fetch('https://api.mainnet-beta.solana.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'getBalance',
                    params: [addr]
                }),
                signal: AbortSignal.timeout(5000)
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            if (result.error) throw new Error(result.error.message);
            
            const lamports = result.result?.value;
            if (lamports == null) throw new Error('Could not fetch balance');
            
            const solBalance = lamports / 1e9;
            const usdValue = solBalance * 84; // Placeholder rate
            
            log(`[Validate Wallet] Success! Balance: ${solBalance.toFixed(4)} SOL`);
            
            // Save to localStorage
            localStorage.setItem('cs_wallet_addr', addr);
            localStorage.setItem('cs_wallet_chain', chain);
            localStorage.setItem('cs_wallet_balance', solBalance.toFixed(4));
            localStorage.setItem('cs_wallet_balance_usd', usdValue.toFixed(2));
            localStorage.setItem('cs_wallet_checked_at', new Date().toISOString());
            
            // Show success
            showSavedWalletStatus(addr, chain);
            
            // Show settings panel
            setTimeout(() => {
                const settingsPanel = document.getElementById('homeExSettings');
                if (settingsPanel) settingsPanel.style.display = 'block';
            }, 300);
            
        } catch(e) {
            showError(`Wallet Validation Error: ${e.message}`);
            log(`[Validate Wallet] Error: ${e.message}`);
            
            // Show retry option
            showWalletSearchInput();
        }
    }
    
    function homeExChangeSavedWallet() {
        log('[Change Wallet] Showing manual input...');
        localStorage.removeItem('cs_wallet_addr');
        localStorage.removeItem('cs_wallet_chain');
        localStorage.removeItem('cs_wallet_balance');
        autoSearchWallet();
    }
    
    // ═════════════════════════════════════════════════════════════════════════
    // 2. EXPERT SETTINGS PANEL
    // ═════════════════════════════════════════════════════════════════════════
    
    const STRATEGIES = {
        'best-results': {
            name: 'Best Backtest Results',
            winRate: 62,
            sharpe: 1.8,
            dd: -8.5,
            pf: 2.1,
            desc: 'Optimal settings dari DEX backtest',
            settings: { minConfidence: 50, minRR: 1.5 }
        },
        'conservative': {
            name: 'Conservative (Low Risk)',
            winRate: 72,
            sharpe: 2.2,
            dd: -4.2,
            pf: 2.8,
            desc: 'Lebih selective, jarang trade',
            settings: { minConfidence: 70, minRR: 2.0 }
        },
        'aggressive': {
            name: 'Aggressive (High Risk)',
            winRate: 55,
            sharpe: 1.2,
            dd: -15.0,
            pf: 1.8,
            desc: 'Lebih sering trade, higher DD',
            settings: { minConfidence: 40, minRR: 1.2 }
        }
    };
    
    function loadSavedSettings() {
        log('[Settings] Loading saved settings...');
        
        const cfg = JSON.parse(localStorage.getItem('cs_wallet_cfg') || '{}');
        const settingsPanel = document.getElementById('homeExSettings');
        
        if (!settingsPanel) return;
        
        const balance = parseFloat(localStorage.getItem('cs_wallet_balance') || '0');
        
        settingsPanel.innerHTML = `
            <div class="hex-panel">
                <div style="padding: 16px;">
                    
                    <!-- Exchange Type -->
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                            📍 Exchange Type
                        </label>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                            <button class="hex-setting-btn ${cfg.exchange === 'DEX' ? 'active' : ''}" 
                                    onclick="homeExSetExchange('DEX')">
                                DEX (Jupiter)
                            </button>
                            <button class="hex-setting-btn ${cfg.exchange === 'CEX' ? 'active' : ''}" 
                                    onclick="homeExSetExchange('CEX')">
                                CEX (OKX)
                            </button>
                            <button class="hex-setting-btn ${cfg.exchange === 'Both' ? 'active' : ''}" 
                                    onclick="homeExSetExchange('Both')">
                                Both
                            </button>
                        </div>
                    </div>
                    
                    <!-- Risk Level -->
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                            💰 Risk Per Trade
                        </label>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                            ${[
                                { val: '0.01', label: 'Low 1%', riskAmt: balance * 0.01 },
                                { val: '0.02', label: 'Med 2%', riskAmt: balance * 0.02 },
                                { val: '0.05', label: 'High 5%', riskAmt: balance * 0.05 }
                            ].map(r => `
                                <button class="hex-setting-btn ${cfg.risk === r.val ? 'active' : ''}" 
                                        onclick="homeExSetRisk('${r.val}')">
                                    <div>${r.label}</div>
                                    <div style="font-size: 0.75rem; color: var(--text3);">
                                        ≈ $${r.riskAmt.toFixed(2)}
                                    </div>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Strategy -->
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                            📊 Strategy Selection
                        </label>
                        <select id="homeExStrategySelect" onchange="homeExSetStrategy(this.value)" 
                                style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 4px;">
                            ${Object.entries(STRATEGIES).map(([k, v]) => `
                                <option value="${k}" ${cfg.strategy === k ? 'selected' : ''}>
                                    ${v.name}
                                </option>
                            `).join('')}
                        </select>
                        ${(() => {
                            const sel = STRATEGIES[cfg.strategy || 'best-results'];
                            return `
                                <div style="margin-top: 8px; padding: 10px; background: var(--bg2); border-radius: 4px; font-size: 0.85rem;">
                                    <div>${sel.desc}</div>
                                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px; color: var(--text3);">
                                        <div>Win: ${sel.winRate}%</div>
                                        <div>Sharpe: ${sel.sharpe}</div>
                                        <div>DD: ${sel.dd}%</div>
                                        <div>PF: ${sel.pf}x</div>
                                    </div>
                                </div>
                            `;
                        })()}
                    </div>
                    
                    <!-- Safety Checks -->
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                            🛡️ Safety Checks
                        </label>
                        <div style="display: grid; gap: 8px;">
                            ${[
                                { id: 'stopDD', label: 'Stop if drawdown < ', default: '-15%', val: cfg.stopDD || '-15' },
                                { id: 'stopWR', label: 'Stop if win rate < ', default: '50%', val: cfg.stopWR || '50' },
                                { id: 'dailyLoss', label: 'Daily loss limit', default: '$100', val: cfg.dailyLoss || '100' },
                                { id: 'maxPos', label: 'Max position size', default: '$500', val: cfg.maxPos || '500' }
                            ].map(s => `
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <input type="checkbox" id="check_${s.id}" 
                                           ${cfg[s.id + '_enabled'] ? 'checked' : ''} 
                                           onchange="homeExToggleSafetyCheck('${s.id}')">
                                    <label style="flex: 1; margin: 0; font-size: 0.9rem;">
                                        ${s.label}
                                    </label>
                                    <input type="number" id="input_${s.id}" value="${s.val}" 
                                           style="width: 80px; padding: 4px; border: 1px solid var(--border); border-radius: 4px;"
                                           onchange="homeExUpdateSafetyValue('${s.id}', this.value)">
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                </div>
            </div>
        `;
    }
    
    function homeExSetExchange(ex) {
        log(`[Settings] Exchange changed to: ${ex}`);
        const cfg = JSON.parse(localStorage.getItem('cs_wallet_cfg') || '{}');
        cfg.exchange = ex;
        localStorage.setItem('cs_wallet_cfg', JSON.stringify(cfg));
        loadSavedSettings();
    }
    
    function homeExSetRisk(risk) {
        log(`[Settings] Risk changed to: ${risk}`);
        const cfg = JSON.parse(localStorage.getItem('cs_wallet_cfg') || '{}');
        cfg.risk = risk;
        localStorage.setItem('cs_wallet_cfg', JSON.stringify(cfg));
        loadSavedSettings();
    }
    
    function homeExSetStrategy(strategy) {
        log(`[Settings] Strategy changed to: ${strategy}`);
        const cfg = JSON.parse(localStorage.getItem('cs_wallet_cfg') || '{}');
        cfg.strategy = strategy;
        localStorage.setItem('cs_wallet_cfg', JSON.stringify(cfg));
        loadSavedSettings();
    }
    
    function homeExToggleSafetyCheck(id) {
        log(`[Settings] Safety check toggled: ${id}`);
        const cfg = JSON.parse(localStorage.getItem('cs_wallet_cfg') || '{}');
        const checkbox = document.getElementById(`check_${id}`);
        cfg[id + '_enabled'] = checkbox.checked;
        localStorage.setItem('cs_wallet_cfg', JSON.stringify(cfg));
    }
    
    function homeExUpdateSafetyValue(id, val) {
        log(`[Settings] Safety value updated: ${id} = ${val}`);
        const cfg = JSON.parse(localStorage.getItem('cs_wallet_cfg') || '{}');
        cfg[id] = val;
        localStorage.setItem('cs_wallet_cfg', JSON.stringify(cfg));
    }
    
    // ═════════════════════════════════════════════════════════════════════════
    // 3. ONE-CLICK START BUTTON
    // ═════════════════════════════════════════════════════════════════════════
    
    async function homeExStartAutoTrading() {
        log('[Start Auto Trading] Pre-flight checks...');
        
        const btn = event.target;
        const original = btn.textContent;
        btn.disabled = true;
        
        try {
            // Pre-flight checks (no API calls, just memory checks)
            const checks = [
                {
                    name: 'Wallet Connected',
                    check: () => !!localStorage.getItem('cs_wallet_addr')
                },
                {
                    name: 'Balance Available',
                    check: () => {
                        const bal = parseFloat(localStorage.getItem('cs_wallet_balance') || '0');
                        return bal > 0.1; // At least 0.1 SOL
                    }
                },
                {
                    name: 'Settings Configured',
                    check: () => {
                        const cfg = JSON.parse(localStorage.getItem('cs_wallet_cfg') || '{}');
                        return cfg.exchange && cfg.risk;
                    }
                }
            ];
            
            const statusEl = document.getElementById('homeExStartStatus');
            if (statusEl) statusEl.innerHTML = '';
            
            for (let check of checks) {
                btn.textContent = `⏳ ${check.name}...`;
                
                if (!check.check()) {
                    throw new Error(`${check.name}: FAILED`);
                }
                
                if (statusEl) {
                    const item = document.createElement('div');
                    item.textContent = `✓ ${check.name}`;
                    item.style.color = '#4ade80';
                    item.style.marginBottom = '4px';
                    statusEl.appendChild(item);
                }
                
                log(`[Pre-flight] ✓ ${check.name}`);
            }
            
            // All checks passed
            log('[Start Auto Trading] All checks passed! Enabling auto mode...');
            
            localStorage.setItem('cs_wallet_mode', 'auto');
            localStorage.setItem('cs_trading_started_at', new Date().toISOString());
            
            _tradingActive = true;
            
            // Update UI
            btn.textContent = '⏸ Pause Trading';
            btn.className = 'hex-btn hex-btn-danger';
            btn.onclick = homeExStopAutoTrading;
            
            // Show live monitoring
            const monitorPanel = document.getElementById('homeExLiveMonitor');
            if (monitorPanel) {
                monitorPanel.style.display = 'block';
            }
            
            // Start efficient monitoring
            startEfficientMonitoring();
            
            // Show success message
            if (statusEl) {
                const success = document.createElement('div');
                success.innerHTML = `
                    <div style="margin-top: 12px; padding: 12px; background: rgba(74, 222, 128, 0.1); border-radius: 4px; border-left: 3px solid #4ade80; color: #4ade80;">
                        🟢 AUTO-TRADING ACTIVE
                        <div style="font-size: 0.85rem; color: var(--text3); margin-top: 4px;">
                            Started at ${new Date().toLocaleTimeString()}
                        </div>
                    </div>
                `;
                statusEl.appendChild(success);
            }
            
        } catch(e) {
            showError(`Pre-flight Check Failed: ${e.message}`);
            log(`[Start Auto Trading] Error: ${e.message}`);
        } finally {
            btn.disabled = false;
            if (!_tradingActive) {
                btn.textContent = original;
            }
        }
    }
    
    function homeExStopAutoTrading() {
        log('[Stop Auto Trading] Disabling...');
        
        localStorage.setItem('cs_wallet_mode', 'manual');
        _tradingActive = false;
        
        if (_monitorInterval) {
            clearInterval(_monitorInterval);
            _monitorInterval = null;
        }
        
        const btn = event.target;
        btn.textContent = '🚀 Start Auto Trading';
        btn.className = 'hex-btn hex-btn-success';
        btn.onclick = homeExStartAutoTrading;
        btn.disabled = false;
        
        showSuccess('Auto trading paused');
        log('[Stop Auto Trading] Done');
    }
    
    // ═════════════════════════════════════════════════════════════════════════
    // 4. EFFICIENT MONITORING (NOT constant polling)
    // ═════════════════════════════════════════════════════════════════════════
    
    function startEfficientMonitoring() {
        log('[Monitoring] Starting efficient monitoring...');
        
        if (_monitorInterval) clearInterval(_monitorInterval);
        
        // Monitor every 30 seconds instead of 15
        _monitorInterval = setInterval(async () => {
            if (!_tradingActive) {
                clearInterval(_monitorInterval);
                return;
            }
            
            updateMonitorDisplay();
        }, 30000); // Every 30 seconds
        
        // Initial update immediately
        updateMonitorDisplay();
    }
    
    async function updateMonitorDisplay() {
        log('[Monitor] Updating display...');
        
        const monitorEl = document.getElementById('homeExLiveMonitorContent');
        if (!monitorEl) return;
        
        try {
            // Fetch auto-trader state ONLY if trading active
            const response = await fetch('/api/auto-trader/state', {
                signal: AbortSignal.timeout(3000)
            });
            
            if (!response.ok) throw new Error('Cannot reach auto-trader');
            
            const state = await response.json();
            
            // Only update if state changed
            const stateStr = JSON.stringify(state);
            if (stateStr === _lastMonitorState) {
                log('[Monitor] No changes, skipping update');
                return;
            }
            
            _lastMonitorState = stateStr;
            
            // Render monitor content
            const html = renderMonitorContent(state);
            monitorEl.innerHTML = html;
            
            log('[Monitor] Display updated');
            
        } catch(e) {
            log(`[Monitor] Error: ${e.message}`);
            monitorEl.innerHTML = `
                <div style="padding: 12px; background: var(--bg2); border-left: 3px solid #f87171; border-radius: 4px; color: #f87171;">
                    ⚠️ Cannot connect to auto-trader
                    <div style="font-size: 0.85rem; color: var(--text3); margin-top: 4px;">
                        ${e.message}
                    </div>
                </div>
            `;
        }
    }
    
    function renderMonitorContent(state) {
        const positions = state?.positions || [];
        const lastTrade = state?.lastTrade;
        const lastSignal = state?.lastSignal;
        const balance = parseFloat(localStorage.getItem('cs_wallet_balance') || '0');
        
        return `
            <div style="display: grid; gap: 12px;">
                
                <!-- Trading Status -->
                <div class="hex-panel" style="border-left: 4px solid #4ade80;">
                    <div style="padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 0.85rem; color: var(--text3);">Status</div>
                            <div style="font-size: 1.1rem; font-weight: bold; color: #4ade80;">
                                🟢 TRADING ACTIVE
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.85rem; color: var(--text3);">Positions</div>
                            <div style="font-size: 1.4rem; font-weight: bold;">
                                ${positions.length}
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Recent Signal -->
                ${lastSignal ? `
                    <div class="hex-panel" style="border-left: 4px solid #6366f1;">
                        <div style="padding: 12px;">
                            <div style="font-size: 0.85rem; color: var(--text3);">Latest Signal</div>
                            <div style="display: flex; gap: 8px; margin-top: 8px; align-items: center;">
                                <span style="font-size: 1.2rem;">
                                    ${lastSignal.action === 'LONG' ? '📈' : '📉'}
                                </span>
                                <div>
                                    <div style="font-weight: bold;">
                                        ${lastSignal.symbol} ${lastSignal.action}
                                    </div>
                                    <div style="font-size: 0.85rem; color: var(--text3);">
                                        Confidence: ${lastSignal.confidence}% | ${new Date(lastSignal.timestamp).toLocaleTimeString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : ''}
                
                <!-- Open Positions -->
                ${positions.length > 0 ? `
                    <div>
                        <div style="font-weight: 600; margin-bottom: 8px;">Open Positions</div>
                        <div style="display: grid; gap: 8px;">
                            ${positions.map(p => {
                                const pnlClass = (p.unrealizedPnL || 0) >= 0 ? '#4ade80' : '#f87171';
                                return `
                                    <div class="hex-panel" style="padding: 12px;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <div>
                                                <div style="font-weight: bold; margin-bottom: 4px;">${p.symbol}</div>
                                                <div style="font-size: 0.85rem; color: var(--text3);">
                                                    Entry: $${(+p.entryPrice).toFixed(4)} | 
                                                    Current: $${(+p.currentPrice).toFixed(4)}
                                                </div>
                                            </div>
                                            <div style="text-align: right;">
                                                <div style="color: ${pnlClass}; font-weight: bold;">
                                                    ${(p.unrealizedPnL || 0) >= 0 ? '+' : ''}$${(+p.unrealizedPnL).toFixed(2)}
                                                </div>
                                                <div style="font-size: 0.8rem; color: var(--text3);">
                                                    ${p.side}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : `
                    <div style="padding: 12px; background: var(--bg2); border-radius: 4px; color: var(--text3); font-size: 0.9rem;">
                        💡 No open positions yet. Waiting for signal...
                    </div>
                `}
                
            </div>
        `;
    }
    
    // ═════════════════════════════════════════════════════════════════════════
    // 5. UTILITY FUNCTIONS
    // ═════════════════════════════════════════════════════════════════════════
    
    function log(msg) {
        console.log(`[${MODULE_NAME}] ${msg}`);
    }
    
    function showError(msg) {
        const el = document.getElementById('homeExError');
        if (!el) return;
        
        el.innerHTML = `
            <div style="padding: 12px; background: rgba(248, 113, 113, 0.1); border-left: 3px solid #f87171; border-radius: 4px; color: #f87171;">
                ❌ ${msg}
            </div>
        `;
        setTimeout(() => el.innerHTML = '', 5000);
    }
    
    function showSuccess(msg) {
        const el = document.getElementById('homeExSuccess');
        if (!el) return;
        
        el.innerHTML = `
            <div style="padding: 12px; background: rgba(74, 222, 128, 0.1); border-left: 3px solid #4ade80; border-radius: 4px; color: #4ade80;">
                ✓ ${msg}
            </div>
        `;
        setTimeout(() => el.innerHTML = '', 3000);
    }
    
    // ═════════════════════════════════════════════════════════════════════════
    // 6. INITIALIZATION
    // ═════════════════════════════════════════════════════════════════════════
    
    function init() {
        if (_initialized) return;
        _initialized = true;
        
        log('Initializing Expert Dashboard...');
        
        // Auto-search wallet on tab open
        setTimeout(() => autoSearchWallet(), 300);
        
        // Check if already trading
        const mode = localStorage.getItem('cs_wallet_mode');
        if (mode === 'auto') {
            log('Restoring trading session...');
            _tradingActive = true;
            const btn = document.getElementById('homeExStartBtn');
            if (btn) {
                btn.textContent = '⏸ Pause Trading';
                btn.className = 'hex-btn hex-btn-danger';
                btn.onclick = homeExStopAutoTrading;
            }
            const monitorPanel = document.getElementById('homeExLiveMonitor');
            if (monitorPanel) monitorPanel.style.display = 'block';
            startEfficientMonitoring();
        }
    }
    
    // Public API
    return {
        init: init,
        connect: homeExConnectJupiter,
        checkManual: homeExCheckManualWallet,
        setExchange: homeExSetExchange,
        setRisk: homeExSetRisk,
        setStrategy: homeExSetStrategy,
        start: homeExStartAutoTrading,
        stop: homeExStopAutoTrading
    };
    
})();

// Auto-init when HOME tab opens
document.addEventListener('tabchange', function(e) {
    if (e.detail === 'home') {
        setTimeout(() => HomeExpertDashboard.init(), 100);
    }
});

