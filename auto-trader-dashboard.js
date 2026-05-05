/**
 * ╔════════════════════════════════════════════════════════════════════════╗
 * ║      AUTO-TRADER DASHBOARD — Professional UI Component               ║
 * ║      Real-time metrics, strategy editor, risk controls               ║
 * ╚════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

window.AutoTraderDashboard = (function () {
    let _containerEl = null;
    let _activeTab = 'overview';

    function template() {
        return `
        <div class="atc-dashboard">
            <!-- Header -->
            <div class="atc-header">
                <div class="atc-header-left">
                    <h2 class="atc-title">🤖 AUTO-TRADER SYSTEM</h2>
                    <div class="atc-status-bar">
                        <span id="atcStatus" class="atc-status-light">⚫ STOPPED</span>
                        <span id="atcMode" class="atc-badge">SIMULATION</span>
                        <span id="atcStrategy" class="atc-badge">signal_follow</span>
                    </div>
                </div>
                <div class="atc-header-right">
                    <button id="atcBtnStart" class="atc-btn atc-btn-start" onclick="AutoTraderComplete.start()">START</button>
                    <button id="atcBtnStop" class="atc-btn atc-btn-stop" onclick="AutoTraderComplete.stop()" style="display:none">STOP</button>
                    <button id="atcBtnCloseAll" class="atc-btn atc-btn-danger" onclick="AutoTraderComplete.closeAllPositions()">CLOSE ALL</button>
                </div>
            </div>

            <!-- Metrics Grid -->
            <div class="atc-metrics-grid">
                <div class="atc-metric-card">
                    <div class="atc-metric-label">Balance</div>
                    <div id="atcBalance" class="atc-metric-value">$10,000.00</div>
                </div>
                <div class="atc-metric-card">
                    <div class="atc-metric-label">Equity</div>
                    <div id="atcEquity" class="atc-metric-value">$10,000.00</div>
                </div>
                <div class="atc-metric-card">
                    <div class="atc-metric-label">Total P&L</div>
                    <div id="atcPnL" class="atc-metric-value">+$0.00</div>
                </div>
                <div class="atc-metric-card">
                    <div class="atc-metric-label">Positions</div>
                    <div id="atcPositions" class="atc-metric-value">0 / 5</div>
                </div>
                <div class="atc-metric-card">
                    <div class="atc-metric-label">Today Trades</div>
                    <div id="atcTodayTrades" class="atc-metric-value">0 / 10</div>
                </div>
                <div class="atc-metric-card">
                    <div class="atc-metric-label">Today P&L</div>
                    <div id="atcTodayPnL" class="atc-metric-value">+$0.00</div>
                </div>
                <div class="atc-metric-card">
                    <div class="atc-metric-label">Win Rate</div>
                    <div id="atcWinRate" class="atc-metric-value">—</div>
                </div>
                <div class="atc-metric-card">
                    <div class="atc-metric-label">Total P&L (All)</div>
                    <div id="atcTotalPnL" class="atc-metric-value">+$0.00</div>
                </div>
            </div>

            <!-- Tab Navigation -->
            <div class="atc-tab-nav">
                <button class="atc-tab-btn active" onclick="AutoTraderDashboard.switchTab('overview')">📊 Overview</button>
                <button class="atc-tab-btn" onclick="AutoTraderDashboard.switchTab('positions')">💼 Positions</button>
                <button class="atc-tab-btn" onclick="AutoTraderDashboard.switchTab('settings')">⚙️ Settings</button>
                <button class="atc-tab-btn" onclick="AutoTraderDashboard.switchTab('log')">📜 Log</button>
            </div>

            <!-- OVERVIEW TAB -->
            <div class="atc-tab-content active" data-tab="overview">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem">
                    <!-- Strategy Info -->
                    <div class="atc-section">
                        <h3 class="atc-section-title">📋 Strategy Configuration</h3>
                        <div class="atc-config-group">
                            <div class="atc-config-row">
                                <span>Strategy:</span>
                                <select id="atcStrategySelect" onchange="AutoTraderComplete.setState('strategy', this.value)" class="atc-select">
                                    <option value="signal_follow">Signal Follow</option>
                                    <option value="grid">Grid Trading (Beta)</option>
                                    <option value="scalp">Scalping (Beta)</option>
                                </select>
                            </div>
                            <div class="atc-config-row">
                                <span>Mode:</span>
                                <select id="atcModeSelect" onchange="AutoTraderComplete.setState('mode', this.value)" class="atc-select">
                                    <option value="simulation">🟡 Simulation</option>
                                    <option value="paper">📄 Paper Trading</option>
                                    <option value="live">🔴 Live Trading</option>
                                </select>
                            </div>
                            <div class="atc-config-row">
                                <span>Buy Threshold:</span>
                                <div class="atc-input-group">
                                    <input type="range" id="atcBuyThreshold" min="20" max="90" value="60" onchange="AutoTraderComplete.setState('buyThreshold', +this.value)" class="atc-slider">
                                    <span id="atcBuyThresholdVal">60</span>
                                </div>
                            </div>
                            <div class="atc-config-row">
                                <span>Sell Threshold:</span>
                                <div class="atc-input-group">
                                    <input type="range" id="atcSellThreshold" min="10" max="70" value="40" onchange="AutoTraderComplete.setState('sellThreshold', +this.value)" class="atc-slider">
                                    <span id="atcSellThresholdVal">40</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Risk Management -->
                    <div class="atc-section">
                        <h3 class="atc-section-title">🛡️ Risk Management</h3>
                        <div class="atc-config-group">
                            <div class="atc-config-row">
                                <span>Risk per Trade:</span>
                                <div class="atc-input-group">
                                    <input type="range" id="atcRiskPerTrade" min="0.5" max="5" step="0.5" value="1" onchange="AutoTraderComplete.setState('riskPerTrade', +this.value)" class="atc-slider">
                                    <span id="atcRiskPerTradeVal">1</span>%
                                </div>
                            </div>
                            <div class="atc-config-row">
                                <span>Max Daily Loss:</span>
                                <div class="atc-input-group">
                                    <input type="range" id="atcMaxDailyLoss" min="2" max="20" value="5" onchange="AutoTraderComplete.setState('maxDailyLoss', +this.value)" class="atc-slider">
                                    <span id="atcMaxDailyLossVal">5</span>%
                                </div>
                            </div>
                            <div class="atc-config-row">
                                <span>Max Positions:</span>
                                <div class="atc-input-group">
                                    <input type="range" id="atcMaxPositions" min="1" max="20" value="5" onchange="AutoTraderComplete.setState('maxPositions', +this.value)" class="atc-slider">
                                    <span id="atcMaxPositionsVal">5</span>
                                </div>
                            </div>
                            <div class="atc-config-row">
                                <span>Max Trades/Day:</span>
                                <div class="atc-input-group">
                                    <input type="range" id="atcMaxTradesPerDay" min="1" max="50" value="10" onchange="AutoTraderComplete.setState('maxTradesPerDay', +this.value)" class="atc-slider">
                                    <span id="atcMaxTradesPerDayVal">10</span>
                                </div>
                            </div>
                            <div class="atc-config-row">
                                <span>Max Drawdown:</span>
                                <div class="atc-input-group">
                                    <input type="range" id="atcMaxDrawdown" min="5" max="50" value="10" onchange="AutoTraderComplete.setState('maxDrawdown', +this.value)" class="atc-slider">
                                    <span id="atcMaxDrawdownVal">10</span>%
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Position Sizing -->
                <div class="atc-section">
                    <h3 class="atc-section-title">📐 Position Sizing</h3>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem">
                        <div>
                            <label style="display:block;font-size:11px;color:var(--text3);margin-bottom:0.25rem">TP Ratio</label>
                            <div class="atc-input-group">
                                <input type="range" id="atcTPRatio" min="1" max="10" step="0.5" value="2" onchange="AutoTraderComplete.setState('takeProfitRatio', +this.value)" class="atc-slider">
                                <span id="atcTPRatioVal">2</span>%
                            </div>
                        </div>
                        <div>
                            <label style="display:block;font-size:11px;color:var(--text3);margin-bottom:0.25rem">SL Ratio</label>
                            <div class="atc-input-group">
                                <input type="range" id="atcSLRatio" min="0.5" max="5" step="0.5" value="1" onchange="AutoTraderComplete.setState('stopLossRatio', +this.value)" class="atc-slider">
                                <span id="atcSLRatioVal">1</span>%
                            </div>
                        </div>
                        <div>
                            <label style="display:block;font-size:11px;color:var(--text3);margin-bottom:0.25rem">Min Hold Time</label>
                            <select id="atcMinHold" onchange="AutoTraderComplete.setState('minHoldTime', +this.value)" class="atc-select">
                                <option value="30000">30s</option>
                                <option value="60000" selected>1m</option>
                                <option value="300000">5m</option>
                                <option value="900000">15m</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;font-size:11px;color:var(--text3);margin-bottom:0.25rem">Max Hold Time</label>
                            <select id="atcMaxHold" onchange="AutoTraderComplete.setState('maxHoldTime', +this.value)" class="atc-select">
                                <option value="600000">10m</option>
                                <option value="1800000">30m</option>
                                <option value="3600000" selected>1h</option>
                                <option value="86400000">1d</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <!-- POSITIONS TAB -->
            <div class="atc-tab-content" data-tab="positions">
                <div class="atc-section">
                    <h3 class="atc-section-title">💼 Open Positions</h3>
                    <div id="atcPositionsList" style="display:grid;gap:0.75rem">
                        <div style="color:var(--text3);padding:1rem;text-align:center">No open positions</div>
                    </div>
                </div>
            </div>

            <!-- SETTINGS TAB -->
            <div class="atc-tab-content" data-tab="settings">
                <div class="atc-section">
                    <h3 class="atc-section-title">⚙️ System Settings</h3>
                    <div class="atc-config-group">
                        <div class="atc-config-row">
                            <span>Starting Capital:</span>
                            <input type="number" id="atcCapital" value="10000" onchange="AutoTraderComplete.setState('capital', +this.value)" class="atc-input" min="100">
                        </div>
                        <div class="atc-config-row">
                            <span>Current Balance:</span>
                            <span id="settingsBalance" style="font-family:monospace">$10,000.00</span>
                        </div>
                        <div class="atc-config-row">
                            <button class="atc-btn atc-btn-secondary" onclick="AutoTraderDashboard.resetStats()">Reset Statistics</button>
                            <button class="atc-btn atc-btn-secondary" onclick="AutoTraderDashboard.exportData()">Export Data</button>
                            <button class="atc-btn atc-btn-danger" onclick="AutoTraderDashboard.resetAll()">Reset All</button>
                        </div>
                    </div>
                </div>

                <div class="atc-section">
                    <h3 class="atc-section-title">📊 Performance Summary</h3>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; font-size: 13px">
                        <div>
                            <div style="color:var(--text3);margin-bottom:0.25rem">Total Trades</div>
                            <div id="settingsTotalTrades" style="font-size:18px;font-weight:bold">0</div>
                        </div>
                        <div>
                            <div style="color:var(--text3);margin-bottom:0.25rem">Win Rate</div>
                            <div id="settingsWinRate" style="font-size:18px;font-weight:bold">—</div>
                        </div>
                        <div>
                            <div style="color:var(--text3);margin-bottom:0.25rem">Avg Win Size</div>
                            <div id="settingsAvgWin" style="font-size:18px;font-weight:bold;color:#4ade80">$0.00</div>
                        </div>
                        <div>
                            <div style="color:var(--text3);margin-bottom:0.25rem">Avg Loss Size</div>
                            <div id="settingsAvgLoss" style="font-size:18px;font-weight:bold;color:#f87171">$0.00</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- LOG TAB -->
            <div class="atc-tab-content" data-tab="log">
                <div class="atc-section">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                        <h3 class="atc-section-title">📜 Event Log</h3>
                        <button class="atc-btn atc-btn-secondary" onclick="AutoTraderDashboard.clearLog()">Clear</button>
                    </div>
                    <div id="atcLogList" style="max-height:400px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:1rem;font-family:monospace;font-size:12px">
                        <div style="color:var(--text3)">Waiting for events...</div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    function styles() {
        return `
        <style>
        .atc-dashboard {
            background: linear-gradient(135deg, rgba(15,23,42,0.8), rgba(30,41,59,0.8));
            border-radius: 12px;
            padding: 1.5rem;
            border: 1px solid rgba(99,102,241,0.2);
            margin-bottom: 2rem;
        }

        /* Header */
        .atc-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid rgba(99,102,241,0.2);
        }

        .atc-header-left, .atc-header-right {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .atc-title {
            margin: 0;
            font-size: 18px;
            font-weight: 700;
            color: #fff;
        }

        .atc-status-bar {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
        }

        .atc-status-light {
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
        }

        .atc-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            background: rgba(99,102,241,0.2);
            color: #c7d2fe;
            border: 1px solid rgba(99,102,241,0.3);
        }

        /* Buttons */
        .atc-btn {
            padding: 0.5rem 1rem;
            border-radius: 6px;
            border: 1px solid transparent;
            font-weight: 600;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .atc-btn-start {
            background: linear-gradient(135deg, #4ade80, #22c55e);
            color: #000;
            border-color: #4ade80;
        }

        .atc-btn-start:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(74,222,128,0.3);
        }

        .atc-btn-stop {
            background: linear-gradient(135deg, #f87171, #ef4444);
            color: #fff;
            border-color: #f87171;
        }

        .atc-btn-stop:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(248,113,113,0.3);
        }

        .atc-btn-danger {
            background: transparent;
            color: #f87171;
            border-color: #f87171;
        }

        .atc-btn-danger:hover {
            background: rgba(248,113,113,0.1);
        }

        .atc-btn-secondary {
            background: rgba(99,102,241,0.1);
            color: #c7d2fe;
            border-color: rgba(99,102,241,0.3);
        }

        .atc-btn-secondary:hover {
            background: rgba(99,102,241,0.2);
        }

        /* Metrics Grid */
        .atc-metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }

        .atc-metric-card {
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(99,102,241,0.2);
            border-radius: 8px;
            padding: 0.75rem;
            text-align: center;
        }

        .atc-metric-label {
            font-size: 11px;
            color: var(--text3);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 0.25rem;
        }

        .atc-metric-value {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
            font-family: 'Monaco', monospace;
        }

        /* Tabs */
        .atc-tab-nav {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1.5rem;
            border-bottom: 1px solid rgba(99,102,241,0.2);
            flex-wrap: wrap;
        }

        .atc-tab-btn {
            padding: 0.5rem 1rem;
            background: transparent;
            border: none;
            color: var(--text3);
            cursor: pointer;
            font-weight: 600;
            font-size: 12px;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }

        .atc-tab-btn:hover {
            color: var(--text2);
        }

        .atc-tab-btn.active {
            color: #6366f1;
            border-bottom-color: #6366f1;
        }

        .atc-tab-content {
            display: none;
        }

        .atc-tab-content.active {
            display: block;
        }

        /* Sections */
        .atc-section {
            background: rgba(0,0,0,0.2);
            border: 1px solid rgba(99,102,241,0.15);
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1rem;
        }

        .atc-section-title {
            margin: 0 0 1rem 0;
            font-size: 13px;
            font-weight: 700;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* Config Groups */
        .atc-config-group {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .atc-config-row {
            display: flex;
            align-items: center;
            gap: 1rem;
            font-size: 13px;
        }

        .atc-config-row > span:first-child {
            flex-shrink: 0;
            width: 140px;
            color: var(--text2);
        }

        /* Inputs */
        .atc-input,
        .atc-select {
            flex: 1;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(99,102,241,0.2);
            border-radius: 4px;
            color: #fff;
            padding: 0.5rem;
            font-size: 12px;
            font-family: inherit;
        }

        .atc-input:focus,
        .atc-select:focus {
            outline: none;
            border-color: #6366f1;
            box-shadow: 0 0 8px rgba(99,102,241,0.2);
        }

        .atc-input-group {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex: 1;
        }

        .atc-slider {
            flex: 1;
            height: 4px;
            border-radius: 2px;
            background: rgba(99,102,241,0.2);
            outline: none;
            -webkit-appearance: none;
            appearance: none;
        }

        .atc-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #6366f1;
            cursor: pointer;
            transition: all 0.2s;
        }

        .atc-slider::-webkit-slider-thumb:hover {
            background: #818cf8;
            transform: scale(1.2);
        }

        .atc-slider::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #6366f1;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
        }

        .atc-slider::-moz-range-thumb:hover {
            background: #818cf8;
            transform: scale(1.2);
        }

        /* Position Cards */
        .atc-position-card {
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(99,102,241,0.2);
            border-radius: 8px;
            padding: 0.75rem;
            font-size: 12px;
        }

        .atc-pos-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid rgba(99,102,241,0.15);
        }

        .atc-symbol {
            font-weight: 700;
            font-size: 14px;
            color: #fff;
        }

        .atc-side-badge {
            padding: 0.25rem 0.5rem;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            background: rgba(99,102,241,0.2);
            color: #c7d2fe;
        }

        .atc-pnl-pos {
            color: #4ade80;
            font-weight: 600;
        }

        .atc-pnl-neg {
            color: #f87171;
            font-weight: 600;
        }

        .atc-pos-details {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 0.5rem;
            margin-bottom: 0.75rem;
            color: var(--text2);
            font-family: monospace;
        }

        .atc-btn-close {
            width: 100%;
            padding: 0.5rem;
            background: rgba(248,113,113,0.15);
            color: #f87171;
            border: 1px solid rgba(248,113,113,0.3);
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.2s;
        }

        .atc-btn-close:hover {
            background: rgba(248,113,113,0.25);
            border-color: #f87171;
        }

        @media (max-width: 900px) {
            .atc-metrics-grid {
                grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
            }
        }
        </style>
        `;
    }

    return {
        init: function(containerSelector) {
            _containerEl = document.querySelector(containerSelector);
            if (!_containerEl) return;

            // Add styles
            const styleEl = document.createElement('style');
            styleEl.textContent = styles();
            document.head.appendChild(styleEl);

            // Add HTML
            _containerEl.innerHTML = template();

            // Initialize module if needed
            if (AutoTraderComplete) {
                AutoTraderComplete.init();
            }

            this.updateAll();
        },

        switchTab: function(tabName) {
            _activeTab = tabName;
            if (!_containerEl) return;

            // Hide all tabs
            _containerEl.querySelectorAll('.atc-tab-content').forEach(el => {
                el.classList.remove('active');
            });

            // Remove active from buttons
            _containerEl.querySelectorAll('.atc-tab-btn').forEach(el => {
                el.classList.remove('active');
            });

            // Show active tab
            const activeTab = _containerEl.querySelector('[data-tab="' + tabName + '"]');
            if (activeTab) activeTab.classList.add('active');

            // Mark button active
            const btns = _containerEl.querySelectorAll('.atc-tab-btn');
            const btnIndex = { overview: 0, positions: 1, settings: 2, log: 3 };
            if (btnIndex[tabName] !== undefined && btns[btnIndex[tabName]]) {
                btns[btnIndex[tabName]].classList.add('active');
            }

            this.updateTabContent(tabName);
        },

        updateTabContent: function(tabName) {
            if (tabName === 'positions' && AutoTraderComplete) {
                AutoTraderComplete.getState = AutoTraderComplete.getState || function() { return {}; };
            }
        },

        updateAll: function() {
            if (!AutoTraderComplete) return;

            // Update metrics
            if (typeof AutoTraderComplete.getState === 'function') {
                AutoTraderComplete.getState = AutoTraderComplete.getState || function() { return {}; };
            }

            // Update UI elements
            const updateSlider = (id, key) => {
                const el = document.getElementById(id);
                if (el) {
                    const state = AutoTraderComplete.getState();
                    el.value = state[key] || el.value;
                    const valEl = document.getElementById(id + 'Val');
                    if (valEl) valEl.textContent = state[key] || el.value;
                }
            };

            updateSlider('atcBuyThreshold', 'buyThreshold');
            updateSlider('atcSellThreshold', 'sellThreshold');
            updateSlider('atcRiskPerTrade', 'riskPerTrade');
            updateSlider('atcMaxDailyLoss', 'maxDailyLoss');
            updateSlider('atcMaxPositions', 'maxPositions');
            updateSlider('atcMaxTradesPerDay', 'maxTradesPerDay');
            updateSlider('atcMaxDrawdown', 'maxDrawdown');
        },

        resetStats: function() {
            if (confirm('Reset all statistics?')) {
                const state = AutoTraderComplete.getState();
                state.stats = {
                    totalTrades: 0,
                    winningTrades: 0,
                    losingTrades: 0,
                    avgWinSize: 0,
                    avgLossSize: 0,
                    winRate: 0,
                    profitFactor: 1,
                    totalPnl: 0,
                    maxDrawdownPercent: 0,
                };
                AutoTraderComplete.getLog = function() { return []; };
                alert('Statistics reset');
            }
        },

        resetAll: function() {
            if (confirm('Reset EVERYTHING? This cannot be undone.')) {
                if (confirm('Are you absolutely sure?')) {
                    localStorage.removeItem('atc_v2');
                    location.reload();
                }
            }
        },

        exportData: function() {
            const state = AutoTraderComplete.getState();
            const data = JSON.stringify(state, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'auto-trader-export-' + Date.now() + '.json';
            a.click();
            URL.revokeObjectURL(url);
        },

        clearLog: function() {
            if (confirm('Clear event log?')) {
                AutoTraderComplete.getLog = function() { return []; };
                const el = document.getElementById('atcLogList');
                if (el) el.innerHTML = '<div style="color:var(--text3)">Log cleared</div>';
            }
        }
    };
})();
