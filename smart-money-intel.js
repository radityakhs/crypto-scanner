/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║   SMART MONEY INTELLIGENCE PLATFORM                          ║
 * ║   Sidebar Menu: Smart Money                                  ║
 * ║   Arkham + Nansen + GMGN style — Solana focused              ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const SmartMoneyIntel = (() => {
    const BASE = 'http://localhost:3001';
    let _sub = 'live';        // active sub-tab
    let _graphAnim = null;    // requestAnimationFrame handle
    let _rendered = false;    // prevent double-render on first load

    // ── CSS injection (once) ──────────────────────────────────────
    function _injectCss() {
        if (document.getElementById('smiCss')) return;
        const s = document.createElement('style');
        s.id = 'smiCss';
        s.textContent = `
        #smIntelRoot {
            font-family: 'Inter', 'Segoe UI', sans-serif;
            background: #020617;
            color: #e2e8f0;
            min-height: 100%;
        }
        .smi-topbar {
            display: flex; align-items: center; gap: 12px;
            padding: 16px 20px; background: #020617;
            border-bottom: 1px solid #0f172a; flex-wrap: wrap;
        }
        .smi-title { font-size: 20px; font-weight: 900; color: #f8fafc; }
        .smi-badge {
            font-size: 10px; font-weight: 700; padding: 3px 10px;
            border-radius: 20px; background: rgba(59,130,246,.15);
            color: #60a5fa; border: 1px solid rgba(59,130,246,.3);
            text-transform: uppercase; letter-spacing: .06em;
        }
        .smi-badge-live {
            background: rgba(34,197,94,.15); color: #22c55e;
            border-color: rgba(34,197,94,.3);
            animation: smiPulse 2s infinite;
        }
        @keyframes smiPulse {
            0%,100% { opacity:1; } 50% { opacity:.5; }
        }
        .smi-refresh-btn {
            margin-left: auto; background: #0f172a; border: 1px solid #1e293b;
            color: #64748b; padding: 6px 14px; border-radius: 7px;
            font-size: 12px; font-weight: 600; cursor: pointer;
            transition: all .2s;
        }
        .smi-refresh-btn:hover { border-color: #334155; color: #94a3b8; }
        /* Sub-nav */
        .smi-subnav {
            display: flex; gap: 4px; padding: 10px 20px;
            background: #020617; border-bottom: 1px solid #0f172a;
            overflow-x: auto;
        }
        .smi-subnav::-webkit-scrollbar { height: 3px; }
        .smi-subnav::-webkit-scrollbar-thumb { background: #1e293b; }
        .smi-sub-btn {
            padding: 7px 16px; border-radius: 7px;
            border: 1px solid #1e293b; background: transparent;
            color: #475569; font-size: 12px; font-weight: 600;
            cursor: pointer; white-space: nowrap; transition: all .2s; flex-shrink: 0;
        }
        .smi-sub-btn.active {
            background: rgba(59,130,246,.12);
            border-color: rgba(59,130,246,.4); color: #60a5fa;
        }
        .smi-sub-btn:hover:not(.active) { border-color: #334155; color: #94a3b8; }
        /* Content */
        .smi-content { padding: 20px; }
        /* KPI row */
        .smi-kpi-row {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
            gap: 10px; margin-bottom: 20px;
        }
        .smi-kpi {
            background: #0a0e1a; border: 1px solid #1e293b;
            border-radius: 10px; padding: 14px;
        }
        .smi-kpi-label { font-size: 10px; color: #475569; margin-bottom: 5px; text-transform: uppercase; letter-spacing: .05em; }
        .smi-kpi-value { font-size: 22px; font-weight: 900; }
        /* Section title */
        .smi-sec-title {
            font-size: 12px; font-weight: 700; color: #475569;
            text-transform: uppercase; letter-spacing: .06em; margin: 18px 0 10px;
        }
        .smi-sec-title:first-child { margin-top: 0; }
        /* Table card */
        .smi-card {
            background: #0a0e1a; border: 1px solid #1e293b;
            border-radius: 10px; overflow: hidden; margin-bottom: 16px;
        }
        .smi-card-hdr {
            display: grid; gap: 8px; padding: 8px 14px;
            font-size: 9px; color: #334155; font-weight: 700;
            text-transform: uppercase; border-bottom: 1px solid #0f172a;
        }
        .smi-row {
            display: grid; gap: 8px; padding: 10px 14px;
            border-bottom: 1px solid #060d1a; align-items: center;
            transition: background .15s; cursor: pointer;
        }
        .smi-row:hover { background: rgba(59,130,246,.04); }
        /* Feed */
        .smi-feed-item {
            display: flex; align-items: center; gap: 12px;
            padding: 11px 16px; border-bottom: 1px solid #060d1a;
            transition: background .15s; cursor: pointer;
        }
        .smi-feed-item:hover { background: rgba(255,255,255,.02); }
        .smi-dot {
            width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
            animation: smiPulse 2s infinite;
        }
        /* Score bar */
        .smi-bar-wrap {
            background: #1e293b; border-radius: 3px; height: 4px; flex: 1;
        }
        .smi-bar-fill { height: 100%; border-radius: 3px; transition: width .8s; }
        /* Signal pill */
        .smi-pill {
            padding: 3px 9px; border-radius: 20px;
            font-size: 10px; font-weight: 700; letter-spacing: .04em;
            display: inline-block;
        }
        /* Graph */
        .smi-graph-wrap {
            background: #020617; border: 1px solid #1e293b;
            border-radius: 10px; overflow: hidden; position: relative;
            margin-bottom: 16px;
        }
        #smiGraphCanvas { display: block; width: 100%; cursor: grab; }
        #smiGraphCanvas:active { cursor: grabbing; }
        /* Tracer */
        .smi-tracer-input {
            width: 100%; background: #020617; border: 1px solid #1e293b;
            border-radius: 6px; padding: 10px; color: #94a3b8;
            font-family: monospace; font-size: 12px; resize: vertical;
            min-height: 80px; box-sizing: border-box; outline: none;
        }
        .smi-btn-primary {
            background: linear-gradient(135deg,#3b82f6,#1d4ed8);
            color: #fff; border: none; padding: 8px 18px;
            border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer;
        }
        .smi-btn-purple {
            background: linear-gradient(135deg,#8b5cf6,#6d28d9);
            color: #fff; border: none; padding: 8px 18px;
            border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer;
        }
        .smi-btn-ghost {
            background: transparent; border: 1px solid #334155;
            color: #64748b; padding: 8px 14px;
            border-radius: 7px; font-size: 11px; cursor: pointer;
        }
        .smi-empty { text-align: center; padding: 30px; color: #334155; font-size: 13px; }
        /* Telegram */
        .smi-tg-input {
            width: 100%; background: #020617; border: 1px solid #1e293b;
            border-radius: 5px; padding: 8px 10px; color: #94a3b8;
            font-family: monospace; font-size: 12px; outline: none;
            box-sizing: border-box;
        }
        /* Spinner */
        .smi-spinner {
            width: 20px; height: 20px; border: 2px solid #1e293b;
            border-top-color: #3b82f6; border-radius: 50%;
            animation: smiSpin .7s linear infinite; display: inline-block;
        }
        @keyframes smiSpin { to { transform: rotate(360deg); } }
        /* Wallet card */
        .smi-wallet-card {
            background: #0f172a; border: 1px solid #1e293b;
            border-radius: 10px; margin-bottom: 14px; overflow: hidden;
        }
        `;
        document.head.appendChild(s);
    }

    // ── Helper formatters ─────────────────────────────────────────
    function fmtUsd(n) {
        if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
        if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
        return (+n).toFixed(0);
    }
    function fmtAgo(ts) {
        const m = Math.round((Date.now() - ts) / 60000);
        if (m < 1) return 'just now';
        if (m < 60) return m + 'm ago';
        return Math.round(m/60) + 'h ago';
    }

    // ── Main render entry ─────────────────────────────────────────
    function render() {
        _injectCss();
        const root = document.getElementById('smIntelRoot');
        if (!root) return;

        root.innerHTML = `
        <div class="smi-topbar">
            <div class="smi-title">🧠 Smart Money Intelligence</div>
            <span class="smi-badge smi-badge-live">● LIVE</span>
            <span class="smi-badge">Solana · Arkham-style</span>
            <button class="smi-refresh-btn" onclick="SmartMoneyIntel.refresh()">🔄 Refresh</button>
        </div>
        <div class="smi-subnav" id="smiSubnav">
            ${[
                ['live',   '🧠 SM Live'],
                ['tracer', '🔍 Wallet Tracer'],
                ['accum',  '📊 Accum Radar'],
                ['graph',  '🌐 Wallet Graph'],
                ['alerts', '🚨 Alerts & Telegram'],
            ].map(([id, label]) => `
                <button class="smi-sub-btn ${_sub===id?'active':''}" id="smiBtn-${id}"
                    onclick="SmartMoneyIntel.switchSub('${id}')">
                    ${label}
                </button>
            `).join('')}
        </div>
        <div id="smiSubContent"></div>`;

        _renderSub(_sub);
    }

    function switchSub(sub) {
        _sub = sub;
        document.querySelectorAll('.smi-sub-btn').forEach(b =>
            b.classList.toggle('active', b.id === `smiBtn-${sub}`)
        );
        if (_graphAnim) { cancelAnimationFrame(_graphAnim); _graphAnim = null; }
        _renderSub(sub);
    }

    function refresh() {
        if (_graphAnim) { cancelAnimationFrame(_graphAnim); _graphAnim = null; }
        _renderSub(_sub);
    }

    function _renderSub(sub) {
        const map = { live: _renderLive, tracer: _renderTracer, accum: _renderAccum, graph: _renderGraph, alerts: _renderAlerts };
        if (map[sub]) map[sub]();
    }

    // ── 1. SM Live ────────────────────────────────────────────────
    async function _renderLive() {
        const el = document.getElementById('smiSubContent');
        if (!el) return;
        el.innerHTML = `<div style="padding:30px;text-align:center"><div class="smi-spinner"></div><div style="color:#334155;margin-top:10px;font-size:13px">Fetching smart money intelligence…</div></div>`;

        let data = null;
        try { const r = await fetch(`${BASE}/api/smart-money-intel`); data = await r.json(); } catch (e) {}
        if (!data?.ok) { el.innerHTML = `<div class="smi-empty">⚠️ Data tidak tersedia. Pastikan server berjalan.</div>`; return; }

        const st = data.stats || {};
        const lb = data.leaderboard || [];
        const wf = data.whaleFeed  || [];
        const ts = st.fetchedAt ? new Date(st.fetchedAt).toLocaleTimeString('id-ID') : '—';

        el.innerHTML = `<div class="smi-content">
            <!-- KPI strip -->
            <div class="smi-kpi-row">
                ${[
                    ['💰 24h Volume', '$'+fmtUsd(st.totalVol24h||0), '#60a5fa'],
                    ['🏊 Liquidity', '$'+fmtUsd(st.totalLiquidity||0), '#a78bfa'],
                    ['📈 Bull Pairs', st.bullPairs||0, '#22c55e'],
                    ['📉 Bear Pairs', st.bearPairs||0, '#ef4444'],
                    ['🧠 Tracked Wallets', st.trackedWallets||0, '#f59e0b'],
                    ['🎯 Top Signal', st.topNarrative||'—', '#22c55e'],
                ].map(([lbl, val, col]) => `
                    <div class="smi-kpi">
                        <div class="smi-kpi-label">${lbl}</div>
                        <div class="smi-kpi-value" style="color:${col}">${val}</div>
                    </div>
                `).join('')}
            </div>

            <!-- Leaderboard -->
            <div class="smi-sec-title">🏆 Smart Money Leaderboard</div>
            <div class="smi-card">
                <div class="smi-card-hdr" style="grid-template-columns:28px 1fr 90px 90px 70px 80px">
                    <span>#</span><span>Wallet</span><span style="text-align:right">Total</span>
                    <span style="text-align:right">SM Score</span><span style="text-align:right">TX/day</span>
                    <span style="text-align:right">Win%</span>
                </div>
                ${lb.length ? lb.map((w, i) => {
                    const rankEmoji = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}`;
                    const smCol = w.smartMoneyScore>=70?'#22c55e':w.smartMoneyScore>=45?'#f59e0b':'#ef4444';
                    const typeCol = w.type==='whale'?'#60a5fa':w.type==='smart'?'#a78bfa':'#94a3b8';
                    const wr = w.winRateEst ? w.winRateEst.toFixed(0) : '?';
                    return `
                    <div class="smi-row" style="grid-template-columns:28px 1fr 90px 90px 70px 80px"
                        onclick="SmartMoneyIntel.openWalletDetail('${w.addr}','${w.label}')">
                        <div style="font-size:14px;text-align:center">${rankEmoji}</div>
                        <div>
                            <div style="font-size:13px;font-weight:700;color:#e2e8f0">${w.label}</div>
                            <div style="font-size:10px;font-family:monospace;color:#334155">${w.shortAddr||''}</div>
                            <div style="display:flex;gap:4px;margin-top:3px">
                                ${(w.labels||[]).slice(0,2).map(l => `<span style="background:#0f172a;color:${typeCol};padding:1px 6px;border-radius:10px;font-size:9px;border:1px solid ${typeCol}33">${l}</span>`).join('')}
                            </div>
                        </div>
                        <div style="text-align:right;font-size:13px;font-weight:700;color:#e2e8f0">$${fmtUsd(w.totalUsd||0)}</div>
                        <div style="text-align:right">
                            <div style="font-size:13px;font-weight:700;color:${smCol}">${w.smartMoneyScore}/100</div>
                            <div class="smi-bar-wrap" style="margin-top:3px">
                                <div class="smi-bar-fill" style="width:${w.smartMoneyScore}%;background:${smCol}"></div>
                            </div>
                        </div>
                        <div style="text-align:right;font-size:12px;color:${w.txFreqPerDay>20?'#f59e0b':'#94a3b8'}">${w.txFreqPerDay}</div>
                        <div style="text-align:right;font-size:12px;font-weight:600;color:#22c55e">${wr}%</div>
                    </div>`;
                }).join('') : `<div class="smi-empty">No wallet data</div>`}
            </div>

            <!-- Whale Feed -->
            <div class="smi-sec-title">🐋 Whale Activity Feed — Realtime</div>
            <div class="smi-card">
                ${wf.length ? wf.map(w => {
                    const isBuy = w.type==='buy';
                    const col = isBuy?'#22c55e':'#ef4444';
                    return `
                    <div class="smi-feed-item" onclick="window.open('${w.dexUrl}','_blank')">
                        <div class="smi-dot" style="background:${col}"></div>
                        ${w.logoUrl ? `<img src="${w.logoUrl}" width="26" height="26" style="border-radius:50%;background:#0f172a" onerror="this.style.display='none'">` : `<div style="font-size:18px">${isBuy?'📈':'📉'}</div>`}
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:700;color:#e2e8f0">
                                ${isBuy?'📈':'📉'} ${w.symbol} — $${fmtUsd(w.amount)} ${w.type.toUpperCase()}
                            </div>
                            <div style="font-size:10px;color:#475569">
                                ${w.chain} · $${w.price<0.001?w.price.toExponential(2):w.price.toFixed(4)} · ${w.priceChange>=0?'+':''}${(w.priceChange||0).toFixed(1)}% 1h
                            </div>
                        </div>
                        <div style="font-size:10px;color:#334155;white-space:nowrap">${fmtAgo(w.ts)}</div>
                    </div>`;
                }).join('') : `<div class="smi-empty">Monitoring aktif. Menunggu whale activity…</div>`}
            </div>

            <div style="text-align:right;font-size:10px;color:#1e293b">Updated: ${ts}</div>
        </div>`;
    }

    // ── Saved Wallets (shared across Tracer + Graph) ─────────────
    const SW_KEY = 'sm_saved_wallets';

    function _swLoad() {
        try { return JSON.parse(localStorage.getItem(SW_KEY) || '[]'); } catch(_) { return []; }
    }
    function _swSave(list) {
        localStorage.setItem(SW_KEY, JSON.stringify(list));
    }
    function saveWallet(addr, label, smScore, totalUsd) {
        const list = _swLoad();
        if (list.find(w => w.addr === addr)) {
            _swNotify(`⚠️ Wallet ${addr.slice(0,8)}… sudah tersimpan`); return;
        }
        list.unshift({ addr, label: label||addr.slice(0,6)+'…'+addr.slice(-4), smScore:smScore||0, totalUsd:totalUsd||0, addedAt: Date.now() });
        _swSave(list.slice(0, 50)); // max 50
        _swNotify(`✅ Wallet disimpan: ${addr.slice(0,8)}…`);
        // Refresh panels if visible
        _swRefreshPanel('smiWtSavedList');
        _swRefreshPanel('smiGraphSavedList');
    }
    function removeWallet(addr) {
        _swSave(_swLoad().filter(w => w.addr !== addr));
        _swRefreshPanel('smiWtSavedList');
        _swRefreshPanel('smiGraphSavedList');
    }
    function _swNotify(msg) {
        const el = document.getElementById('smiSwNotify');
        if (!el) return;
        el.textContent = msg;
        el.style.opacity = '1';
        setTimeout(() => { if(el) el.style.opacity='0'; }, 2500);
    }
    function _swRefreshPanel(panelId) {
        const el = document.getElementById(panelId);
        if (!el) return;
        if (panelId === 'smiWtSavedList') el.innerHTML = _swTracerPanel();
        else el.innerHTML = _swGraphPanel();
    }
    function _swTracerPanel() {
        const list = _swLoad();
        if (!list.length) return `<div style="color:#334155;font-size:12px;padding:10px 0;text-align:center">Belum ada wallet tersimpan.<br>Trace wallet lalu klik 💾 Simpan.</div>`;
        return list.map(w => `
            <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid #0f172a;cursor:pointer"
                onclick="SmartMoneyIntel.loadSavedToTracer('${w.addr}')"
                onmouseover="this.style.background='rgba(59,130,246,.06)'" onmouseout="this.style.background=''">
                <div style="flex:1;min-width:0">
                    <div style="font-size:11px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.label}</div>
                    <div style="font-size:9px;font-family:monospace;color:#334155">${w.addr.slice(0,10)}…${w.addr.slice(-4)}</div>
                </div>
                <div style="text-align:right;flex-shrink:0">
                    <div style="font-size:10px;font-weight:700;color:${w.smScore>=70?'#22c55e':w.smScore>=45?'#f59e0b':'#ef4444'}">${w.smScore}/100</div>
                    <div style="font-size:9px;color:#475569">$${fmtUsd(w.totalUsd||0)}</div>
                </div>
                <button onclick="event.stopPropagation();SmartMoneyIntel.removeWallet('${w.addr}')"
                    style="background:transparent;border:none;color:#334155;cursor:pointer;font-size:14px;padding:0 2px;flex-shrink:0" title="Hapus">×</button>
            </div>`).join('');
    }
    function _swGraphPanel() {
        const list = _swLoad();
        if (!list.length) return `<div style="color:#334155;font-size:11px;padding:8px;text-align:center">Belum ada wallet tersimpan</div>`;
        return list.map(w => `
            <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid #0f172a;cursor:pointer"
                onclick="SmartMoneyIntel.loadSavedToGraph('${w.addr}')"
                onmouseover="this.style.background='rgba(59,130,246,.08)'" onmouseout="this.style.background=''">
                <div style="width:7px;height:7px;border-radius:50%;background:${w.smScore>=70?'#22c55e':w.smScore>=45?'#f59e0b':'#ef4444'};flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:11px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${w.label}</div>
                    <div style="font-size:9px;font-family:monospace;color:#334155">${w.addr.slice(0,8)}…</div>
                </div>
                <span style="font-size:9px;color:${w.smScore>=70?'#22c55e':w.smScore>=45?'#f59e0b':'#ef4444'};font-weight:700">${w.smScore}</span>
            </div>`).join('');
    }
    function loadSavedToTracer(addr) {
        const ta = document.getElementById('smiWtInput');
        if (!ta) return;
        const cur = ta.value.trim();
        if (!cur.includes(addr)) ta.value = cur ? cur+'\n'+addr : addr;
        ta.scrollIntoView({ behavior:'smooth', block:'center' });
    }
    function loadSavedToGraph(addr) {
        const inp = document.getElementById('smiGraphInput');
        if (inp) { inp.value = addr; SmartMoneyIntel.searchGraph(); }
    }

    // ── 2. Wallet Tracer ─────────────────────────────────────────
    function _renderTracer() {
        const el = document.getElementById('smiSubContent');
        if (!el) return;
        el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 280px;gap:14px;padding:20px;min-height:600px" id="smiTracerGrid">
            <!-- LEFT: main area -->
            <div>
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
                    <div style="font-size:16px;font-weight:700;color:#f8fafc">🔍 Wallet Intelligence Tracer</div>
                    <span class="smi-badge">Solana RPC + DexScreener</span>
                    <span id="smiSwNotify" style="font-size:11px;color:#22c55e;margin-left:4px;transition:opacity .4s;opacity:0"></span>
                </div>

                <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px;margin-bottom:12px">
                    <div style="font-size:11px;color:#64748b;margin-bottom:8px">📋 Wallet address (1 per baris, max 5)</div>
                    <textarea class="smi-tracer-input" id="smiWtInput"
                        placeholder="MobS6L5HhVJtxpeafDgREsweWFh53xFoUeP9pgbaDSf&#10;fNrJmJ1aQMx1vgnGwJcLWkUCBrDy7GF7ZpVqiXuRFrJ&#10;4hSXPtxZgXFpo6Vxq9yqxNjcBoqWN3VoaPJWonUtupzD"></textarea>
                    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
                        <button class="smi-btn-primary" onclick="SmartMoneyIntel.trace()">🔍 Trace Wallets</button>
                        <button class="smi-btn-purple" onclick="SmartMoneyIntel.compare()">⚖️ Compare & Find Links</button>
                        <button class="smi-btn-ghost" onclick="document.getElementById('smiWtInput').value='';document.getElementById('smiWtOut').innerHTML=''">✕ Clear</button>
                    </div>
                </div>

                <!-- Quick presets -->
                <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
                    <span style="font-size:11px;color:#334155">Quick load:</span>
                    ${[
                        ['MobS6…aDSf','MobS6L5HhVJtxpeafDgREsweWFh53xFoUeP9pgbaDSf'],
                        ['fNrJm…RFrJ','fNrJmJ1aQMx1vgnGwJcLWkUCBrDy7GF7ZpVqiXuRFrJ'],
                        ['4hSXP…upzD','4hSXPtxZgXFpo6Vxq9yqxNjcBoqWN3VoaPJWonUtupzD'],
                        ['All 3','ALL'],
                    ].map(([lbl, addr]) => `
                        <button onclick="SmartMoneyIntel.preset('${addr}')"
                            style="background:#0f172a;border:1px solid #1e293b;color:#64748b;padding:3px 10px;border-radius:4px;font-size:11px;cursor:pointer;font-family:monospace">
                            ${lbl}
                        </button>
                    `).join('')}
                </div>

                <div id="smiWtOut"></div>
            </div>

            <!-- RIGHT: saved wallets panel -->
            <div>
                <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:10px;overflow:hidden;position:sticky;top:10px">
                    <div style="padding:10px 12px;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:8px">
                        <span style="font-size:13px;font-weight:700;color:#e2e8f0">📌 Saved Wallets</span>
                        <span style="background:#1e293b;color:#64748b;padding:1px 8px;border-radius:20px;font-size:10px">${_swLoad().length}</span>
                        <button onclick="SmartMoneyIntel._wtExportSaved()" title="Export CSV"
                            style="margin-left:auto;background:transparent;border:none;color:#334155;cursor:pointer;font-size:12px">⬇ CSV</button>
                    </div>
                    <div id="smiWtSavedList" style="max-height:480px;overflow-y:auto">
                        ${_swTracerPanel()}
                    </div>
                </div>
            </div>
        </div>`;

        // Responsive: stack on narrow
        const grid = document.getElementById('smiTracerGrid');
        if (grid && grid.parentElement.clientWidth < 700) {
            grid.style.gridTemplateColumns = '1fr';
        }
    }

    function preset(addr) {
        const ta = document.getElementById('smiWtInput');
        if (!ta) return;
        const ALL = 'MobS6L5HhVJtxpeafDgREsweWFh53xFoUeP9pgbaDSf\nfNrJmJ1aQMx1vgnGwJcLWkUCBrDy7GF7ZpVqiXuRFrJ\n4hSXPtxZgXFpo6Vxq9yqxNjcBoqWN3VoaPJWonUtupzD';
        if (addr === 'ALL') { ta.value = ALL; return; }
        const cur = ta.value.trim();
        ta.value = cur ? cur + '\n' + addr : addr;
    }

    function _wtExportSaved() {
        const list = _swLoad();
        if (!list.length) return;
        const rows = ['Address,Label,SM Score,Total USD,Added'].concat(
            list.map(w => `${w.addr},"${w.label}",${w.smScore},${w.totalUsd},${new Date(w.addedAt).toLocaleDateString('id-ID')}`)
        );
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'saved_wallets.csv'; a.click();
    }

    async function trace() {
        const ta = document.getElementById('smiWtInput');
        const out = document.getElementById('smiWtOut');
        if (!ta || !out) return;
        const addrs = ta.value.split('\n').map(s=>s.trim()).filter(s=>s.length>=30).slice(0,5);
        if (!addrs.length) { out.innerHTML = '<div style="color:#ef4444;padding:10px">⚠️ Masukkan minimal 1 wallet address valid</div>'; return; }
        out.innerHTML = `<div style="color:#3b82f6;padding:20px;text-align:center"><div class="smi-spinner" style="margin:0 auto 8px"></div>Tracing ${addrs.length} wallet(s)…</div>`;
        const results = await Promise.allSettled(addrs.map(addr => fetch(`${BASE}/api/wallet-trace/${addr}`).then(r=>r.json())));
        const wallets = results.map((r,i) => r.status==='fulfilled' ? r.value : { ok:false, address:addrs[i], error:r.reason?.message });
        out.innerHTML = wallets.map(w => _walletCard(w)).join('');
    }

    async function compare() {
        const ta = document.getElementById('smiWtInput');
        const out = document.getElementById('smiWtOut');
        if (!ta || !out) return;
        const addrs = ta.value.split('\n').map(s=>s.trim()).filter(s=>s.length>=30).slice(0,5);
        if (addrs.length < 2) { out.innerHTML = '<div style="color:#ef4444;padding:10px">⚠️ Butuh minimal 2 wallet</div>'; return; }
        out.innerHTML = `<div style="color:#8b5cf6;padding:20px;text-align:center"><div class="smi-spinner" style="margin:0 auto 8px"></div>Comparing ${addrs.length} wallets…</div>`;
        const r = await fetch(`${BASE}/api/wallet-compare`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ addresses: addrs }),
        }).then(r=>r.json());
        if (!r.ok) { out.innerHTML = `<div style="color:#ef4444;padding:10px">❌ ${r.error}</div>`; return; }

        let html = '';
        if (r.coordSignals?.length) {
            html += `<div style="background:#1c1917;border:1px solid #f59e0b;border-radius:10px;padding:14px;margin-bottom:14px">
                <div style="font-size:13px;font-weight:700;color:#f59e0b;margin-bottom:8px">🔗 COORDINATION SIGNALS</div>
                ${r.coordSignals.map(s=>`
                    <div style="display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #292524;align-items:center">
                        <span>${s.type==='alert'?'🚨':'⚠️'}</span>
                        <span style="font-size:12px;color:#fbbf24">${s.msg}</span>
                    </div>`).join('')}
            </div>`;
        }
        if (r.commonMints?.length) {
            html += `<div style="background:#0f172a;border:1px solid #3b82f6;border-radius:10px;padding:14px;margin-bottom:14px">
                <div style="font-size:13px;font-weight:700;color:#3b82f6;margin-bottom:8px">🎯 ${r.commonMints.length} Token Dipegang Semua Wallet</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px">
                    ${r.commonMints.map(m=>`<span style="background:#1e3a5f;color:#93c5fd;padding:3px 10px;border-radius:20px;font-family:monospace;font-size:11px">${m.slice(0,8)}…${m.slice(-4)}</span>`).join('')}
                </div>
            </div>`;
        }
        // comparison table
        html += `<div style="overflow-x:auto;margin-bottom:14px">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#0f172a;border-bottom:2px solid #1e293b">
                <th style="padding:10px;text-align:left;color:#475569">Metric</th>
                ${r.wallets.map(w=>`<th style="padding:10px;text-align:right;color:#94a3b8;font-family:monospace">${w.shortAddr||w.address?.slice(0,8)}</th>`).join('')}
            </tr></thead>
            <tbody>
                ${[
                    ['💰 Total USD', w=>`$${fmtUsd(w.totalUsd||0)}`],
                    ['◎ SOL', w=>`${(w.solBalance||0).toFixed(2)}`],
                    ['🪙 Tokens', w=>w.tokenCount||0],
                    ['📊 TX Count', w=>w.txCount||0],
                    ['⚡ TX/day', w=>w.txFreqPerDay||0],
                    ['❌ Fail Rate', w=>`${w.failRate||0}%`],
                    ['🧠 SM Score', w=>`${w.smartMoneyScore||0}/100`],
                    ['📅 Last Active', w=>w.lastActiveAgo||'?'],
                ].map(([label, fn])=>`
                    <tr style="border-bottom:1px solid #0f172a">
                        <td style="padding:8px 10px;color:#64748b">${label}</td>
                        ${r.wallets.map(w=>`<td style="padding:8px 10px;text-align:right;color:#e2e8f0">${fn(w)}</td>`).join('')}
                    </tr>`).join('')}
            </tbody>
        </table></div>`;
        html += r.wallets.map(w => _walletCard(w)).join('');
        out.innerHTML = html;
    }

    function _walletCard(w) {
        if (!w.ok) return `
        <div class="smi-wallet-card" style="border-color:#ef4444;padding:14px;margin-bottom:12px">
            <div style="color:#ef4444;font-family:monospace;font-size:12px">${w.address}</div>
            <div style="color:#ef4444;font-size:12px;margin-top:6px">❌ ${w.error||'Fetch failed'}</div>
        </div>`;
        const cls = w.classification || {};
        const tb  = w.tokenBehavior || {};
        const smCol = w.smartMoneyScore>=70?'#22c55e':w.smartMoneyScore>=45?'#f59e0b':'#ef4444';
        return `
        <div class="smi-wallet-card">
            <div style="background:linear-gradient(90deg,#020617,#0f172a);padding:12px 16px;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <div style="font-family:monospace;font-size:12px;color:#3b82f6;font-weight:600">${w.shortAddr}</div>
                <div style="font-size:10px;color:#334155;font-family:monospace">${w.address}</div>
                <div style="margin-left:auto;display:flex;gap:5px;flex-wrap:wrap">
                    ${(cls.labels||[]).map(l=>`<span style="background:#1e293b;color:#94a3b8;padding:2px 8px;border-radius:20px;font-size:10px">${l}</span>`).join('')}
                </div>
            </div>
            <div style="padding:8px 16px;background:#020617;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:10px">
                <div style="font-size:11px;color:#475569;min-width:110px">🧠 SM Score</div>
                <div class="smi-bar-wrap"><div class="smi-bar-fill" style="width:${w.smartMoneyScore||0}%;background:${smCol}"></div></div>
                <div style="font-size:13px;font-weight:700;color:${smCol};min-width:40px;text-align:right">${w.smartMoneyScore||0}/100</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:1px;background:#1e293b">
                ${[
                    ['💰 Total', `$${fmtUsd(w.totalUsd||0)}`, w.totalUsd>=10000?'#22c55e':'#e2e8f0'],
                    ['◎ SOL', (w.solBalance||0).toFixed(3), '#a78bfa'],
                    ['🪙 Tokens', w.tokenCount||0, '#60a5fa'],
                    ['⚡ TX/day', w.txFreqPerDay||0, w.txFreqPerDay>20?'#f59e0b':'#94a3b8'],
                    ['❌ Fail%', `${w.failRate||0}%`, w.failRate>15?'#ef4444':'#22c55e'],
                    ['📅 Active', w.lastActiveAgo||'?', '#64748b'],
                    ['🎯 Style', tb.style||'?', '#94a3b8'],
                    ['📊 TXs', w.txCount||0, '#94a3b8'],
                ].map(([lbl,val,col])=>`
                    <div style="background:#0f172a;padding:9px 12px">
                        <div style="font-size:9px;color:#475569;margin-bottom:2px">${lbl}</div>
                        <div style="font-size:13px;font-weight:600;color:${col}">${val}</div>
                    </div>`).join('')}
            </div>
            ${(w.riskSignals||[]).length ? `
            <div style="padding:8px 14px;border-top:1px solid #1e293b;display:flex;flex-wrap:wrap;gap:5px">
                ${w.riskSignals.map(s=>{
                    const col = s.type==='warn'?'#f59e0b':s.type==='bull'?'#22c55e':'#3b82f6';
                    return `<div style="background:#0a0a0a;border:1px solid ${col}33;border-radius:5px;padding:3px 9px;font-size:10px;color:${col}">${s.msg}</div>`;
                }).join('')}
            </div>` : ''}
            ${(w.tokens||[]).filter(t=>t.usdValue>0.01).length ? `
            <div style="border-top:1px solid #1e293b">
                <div style="padding:8px 14px;font-size:10px;font-weight:700;color:#475569;border-bottom:1px solid #0f172a;text-transform:uppercase">🪙 Top Holdings</div>
                ${(w.tokens||[]).filter(t=>t.usdValue>0.01).slice(0,8).map((t,i)=>`
                <div style="display:flex;align-items:center;gap:10px;padding:5px 14px;${i%2===0?'background:#020617':''}">
                    ${t.logoURI?`<img src="${t.logoURI}" width="16" height="16" style="border-radius:50%" onerror="this.style.display='none'">`:
                    '<div style="width:16px;height:16px;border-radius:50%;background:#1e293b"></div>'}
                    <div style="flex:1;font-size:12px;color:#e2e8f0">${t.symbol}</div>
                    <div style="font-size:12px;color:#22c55e;font-weight:600">$${fmtUsd(t.usdValue)}</div>
                    <div style="font-size:10px;color:#475569">${w.totalUsd>0?(t.usdValue/w.totalUsd*100).toFixed(1):0}%</div>
                </div>`).join('')}
            </div>` : ''}
            <div style="padding:9px 14px;border-top:1px solid #1e293b;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                <a href="${w.solscanUrl}" target="_blank" style="color:#3b82f6;font-size:11px;text-decoration:none">🔗 Solscan</a>
                <a href="${w.solanaFmUrl}" target="_blank" style="color:#8b5cf6;font-size:11px;text-decoration:none">🔗 Solana.fm</a>
                <a href="${w.stepUrl}" target="_blank" style="color:#22c55e;font-size:11px;text-decoration:none">🔗 Step Finance</a>
                <button onclick="SmartMoneyIntel.saveWallet('${w.address}','${(w.label||w.address.slice(0,8)).replace(/'/g,'')}',${w.smScore||0},${w.totalUsd||0})"
                    style="margin-left:auto;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.25);color:#60a5fa;padding:3px 10px;border-radius:5px;font-size:11px;cursor:pointer">
                    💾 Simpan
                </button>
            </div>
        </div>`;
    }

    // ── 3. Accumulation Radar ────────────────────────────────────
    async function _renderAccum() {
        const el = document.getElementById('smiSubContent');
        if (!el) return;
        el.innerHTML = `<div style="padding:30px;text-align:center"><div class="smi-spinner" style="margin:0 auto 8px"></div><div style="color:#334155;font-size:13px">Menganalisis akumulasi & distribusi…</div></div>`;
        let data = null;
        try { const r = await fetch(`${BASE}/api/smart-money-intel`); data = await r.json(); } catch(e) {}
        const signals = data?.accumSignals || [];
        if (!signals.length) { el.innerHTML = `<div class="smi-empty">Tidak ada sinyal saat ini.</div>`; return; }
        const accumCnt  = signals.filter(s=>s.signal.includes('ACCUM')).length;
        const distCnt   = signals.filter(s=>s.signal.includes('DISTRIB')).length;
        const neutralCnt = signals.length - accumCnt - distCnt;

        el.innerHTML = `<div class="smi-content">
            <!-- Summary -->
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
                <div class="smi-kpi" style="border-color:#166534;background:#0a1a0a;text-align:center">
                    <div style="font-size:28px;font-weight:900;color:#22c55e">${accumCnt}</div>
                    <div style="font-size:11px;color:#475569">Accumulation</div>
                </div>
                <div class="smi-kpi" style="border-color:#7f1d1d;background:#1a0a0a;text-align:center">
                    <div style="font-size:28px;font-weight:900;color:#ef4444">${distCnt}</div>
                    <div style="font-size:11px;color:#475569">Distribution</div>
                </div>
                <div class="smi-kpi" style="text-align:center">
                    <div style="font-size:28px;font-weight:900;color:#64748b">${neutralCnt}</div>
                    <div style="font-size:11px;color:#475569">Neutral</div>
                </div>
            </div>

            <div class="smi-sec-title">📊 Accumulation / Distribution Radar — Solana</div>
            <div class="smi-card">
                <div class="smi-card-hdr" style="grid-template-columns:34px 1fr 70px 65px 70px 120px">
                    <span></span><span>Token</span><span style="text-align:right">Price</span>
                    <span style="text-align:right">Buy%</span><span style="text-align:right">Vol/Liq</span>
                    <span style="text-align:right">Signal</span>
                </div>
                ${signals.map(s => {
                    const p24c = s.priceChange24h>=0?'#4ade80':'#f87171';
                    const buyc = s.buyPct>60?'#22c55e':s.buyPct<40?'#ef4444':'#94a3b8';
                    const vlc  = s.volLiqRatio>2?'#f97316':s.volLiqRatio>1?'#fbbf24':'#60a5fa';
                    const pFmt = s.price<0.000001?s.price.toExponential(2):s.price<0.001?s.price.toFixed(6):s.price<1?s.price.toFixed(4):s.price.toFixed(2);
                    return `
                    <div class="smi-row" style="grid-template-columns:34px 1fr 70px 65px 70px 120px"
                        onclick="window.open('${s.dexUrl}','_blank')">
                        ${s.logoUrl
                            ? `<img src="${s.logoUrl}" width="26" height="26" style="border-radius:50%;background:#0f172a" onerror="this.outerHTML='<div style=width:26px;height:26px;border-radius:50%;background:#1e293b></div>'">`
                            : `<div style="width:26px;height:26px;border-radius:50%;background:#1e293b"></div>`}
                        <div>
                            <div style="font-size:12px;font-weight:700;color:#e2e8f0">${s.symbol}</div>
                            <div style="font-size:9px;color:#334155">${(s.name||'').slice(0,18)}</div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:11px;color:#94a3b8">$${pFmt}</div>
                            <div style="font-size:10px;color:${p24c}">${s.priceChange24h>=0?'+':''}${(s.priceChange24h||0).toFixed(1)}%</div>
                        </div>
                        <div style="text-align:right;font-size:13px;font-weight:700;color:${buyc}">${s.buyPct}%</div>
                        <div style="text-align:right;font-size:12px;font-weight:600;color:${vlc}">${s.volLiqRatio}x</div>
                        <div style="text-align:right">
                            <span class="smi-pill" style="background:${s.signalColor}18;color:${s.signalColor};border:1px solid ${s.signalColor}33">
                                ${s.signal}
                            </span>
                        </div>
                    </div>`;
                }).join('')}
            </div>

            <!-- Legend -->
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:6px;font-size:10px">
                ${[
                    ['#22c55e','STRONG ACCUM — buy pressure tinggi + vol/liq tinggi'],
                    ['#4ade80','ACCUMULATION — buy% > 58%'],
                    ['#f59e0b','UNUSUAL VOL — volume anomali'],
                    ['#f97316','SELL PRESSURE — dominasi seller'],
                    ['#ef4444','DISTRIBUTION — sell off aktif'],
                ].map(([col,desc])=>`
                    <div style="display:flex;align-items:center;gap:5px">
                        <div style="width:8px;height:8px;border-radius:50%;background:${col}"></div>
                        <span style="color:#334155">${desc}</span>
                    </div>`).join('')}
            </div>
        </div>`;
    }

    // ── 4. Wallet Graph ──────────────────────────────────────────
    function _renderGraph() {
        const el = document.getElementById('smiSubContent');
        if (!el) return;
        el.innerHTML = `<div class="smi-content">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
                <div style="font-size:16px;font-weight:700;color:#f8fafc">🌐 Wallet Flow Graph</div>
                <span class="smi-badge">On-chain · Real Transaction Flow</span>
            </div>

            <!-- Saved wallet picker -->
            <div style="background:#0a0e1a;border:1px solid #1e293b;border-radius:10px;margin-bottom:10px;overflow:hidden">
                <div style="padding:8px 12px;border-bottom:1px solid #0f172a;display:flex;align-items:center;gap:8px">
                    <span style="font-size:11px;font-weight:700;color:#64748b">📌 Saved Wallets</span>
                    <span style="font-size:10px;color:#334155">(klik untuk map flow)</span>
                </div>
                <div id="smiGraphSavedList" style="max-height:140px;overflow-y:auto">${_swGraphPanel()}</div>
            </div>

            <!-- Search bar -->
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px;margin-bottom:14px">
                <div style="font-size:11px;color:#64748b;margin-bottom:8px">🔍 Atau masukkan wallet address:</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <input id="smiGraphInput" placeholder="Solana wallet address (44 karakter)…"
                        style="flex:1;min-width:240px;background:#020617;border:1px solid #1e293b;border-radius:6px;padding:9px 12px;color:#94a3b8;font-family:monospace;font-size:12px;outline:none"
                        onkeydown="if(event.key==='Enter') SmartMoneyIntel.searchGraph()">
                    <button class="smi-btn-primary" onclick="SmartMoneyIntel.searchGraph()">🗺️ Map Flow</button>
                    <button class="smi-btn-ghost" onclick="SmartMoneyIntel.resetGraph()">🔄 Reset</button>
                </div>
                <!-- Quick presets -->
                <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
                    <span style="font-size:10px;color:#334155">Quick:</span>
                    ${[
                        ['MobS6…aDSf','MobS6L5HhVJtxpeafDgREsweWFh53xFoUeP9pgbaDSf'],
                        ['fNrJm…RFrJ','fNrJmJ1aQMx1vgnGwJcLWkUCBrDy7GF7ZpVqiXuRFrJ'],
                        ['4hSXP…upzD','4hSXPtxZgXFpo6Vxq9yqxNjcBoqWN3VoaPJWonUtupzD'],
                    ].map(([l,a])=>`<button onclick="document.getElementById('smiGraphInput').value='${a}';SmartMoneyIntel.searchGraph()"
                        style="background:#0a0e1a;border:1px solid #1e293b;color:#475569;padding:2px 9px;border-radius:4px;font-size:10px;cursor:pointer;font-family:monospace">${l}</button>`).join('')}
                </div>
            </div>

            <!-- Canvas area -->
            <div class="smi-graph-wrap" style="position:relative">
                <canvas id="smiGraphCanvas" height="500"></canvas>
                <div id="smiGraphTip" style="position:absolute;display:none;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px;font-size:12px;color:#e2e8f0;pointer-events:none;min-width:180px;max-width:240px;z-index:99"></div>
                <div id="smiGraphOverlay" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.7);border-radius:10px">
                    <div style="text-align:center;color:#334155">
                        <div style="font-size:48px;margin-bottom:10px">🌐</div>
                        <div style="font-size:13px;color:#475569">Pilih dari saved wallets<br>atau masukkan address di atas</div>
                    </div>
                </div>
            </div>

            <!-- Legend -->
            <div style="display:flex;flex-wrap:wrap;gap:10px;padding:10px 0;font-size:11px">
                ${[['#f59e0b','⭐ Wallet Dicari'],['#22c55e','⬇ Inflow (terima SOL)'],['#ef4444','⬆ Outflow (kirim SOL)'],['#60a5fa','↔ Interaksi']].map(([c,l])=>`
                <div style="display:flex;align-items:center;gap:5px;color:#475569">
                    <div style="width:9px;height:9px;border-radius:50%;background:${c}"></div><span>${l}</span>
                </div>`).join('')}
            </div>
            <!-- Node shape legend -->
            <div style="display:flex;flex-wrap:wrap;gap:8px;padding-bottom:10px;font-size:11px">
                <div style="display:flex;align-items:center;gap:5px;color:#475569"><div style="width:10px;height:10px;border-radius:50%;background:#60a5fa"></div><span>● Lingkaran = User Wallet</span></div>
                <div style="display:flex;align-items:center;gap:5px;color:#475569"><div style="width:10px;height:10px;transform:rotate(45deg);background:#a855f7"></div><span>◆ Berlian = Program/Smart Contract</span></div>
                ${[['#a855f7','🔄 DEX/AMM'],['#f97316','🏦 CEX Exchange'],['#06b6d4','🥩 Staking'],['#84cc16','🏗 Lending']].map(([c,l])=>`
                <div style="display:flex;align-items:center;gap:4px;color:#475569">
                    <div style="width:7px;height:7px;transform:rotate(45deg);background:${c}"></div><span>${l}</span>
                </div>`).join('')}
            </div>
            <div style="font-size:11px;color:#334155">💡 Drag nodes · Hover untuk detail · Double-click node untuk map wallet itu · Click untuk trace di tab Wallet Tracer</div>

            <!-- Transaction list & rekening koran -->
            <div id="smiGraphList"></div>
        </div>`;
    }

    async function searchGraph() {
        const input = document.getElementById('smiGraphInput');
        const addr  = (input?.value || '').trim();
        if (!addr || addr.length < 30) {
            input?.focus();
            return;
        }
        if (_graphAnim) { cancelAnimationFrame(_graphAnim); _graphAnim = null; }

        // Show loading on canvas
        const overlay = document.getElementById('smiGraphOverlay');
        if (overlay) {
            overlay.style.display = 'flex';
            overlay.innerHTML = `<div style="text-align:center">
                <div class="smi-spinner" style="margin:0 auto 10px"></div>
                <div style="color:#64748b;font-size:13px">Fetching on-chain transactions…<br><span style="font-size:10px;color:#334155">Parsing ${addr.slice(0,8)}…</span></div>
            </div>`;
        }

        let data = null;
        try {
            const r = await fetch(`${BASE}/api/wallet-graph/${addr}`);
            data = await r.json();
        } catch(e) {}

        if (!data?.ok) {
            if (overlay) {
                overlay.innerHTML = `<div style="text-align:center;color:#ef4444;font-size:13px">
                    ❌ ${data?.error || 'Gagal fetch — pastikan server berjalan'}
                </div>`;
            }
            return;
        }

        if (overlay) overlay.style.display = 'none';
        _drawFlowGraph(data);
        _renderGraphList(data);
    }

    function _drawFlowGraph(data) {
        const canvas = document.getElementById('smiGraphCanvas');
        if (!canvas) return;
        if (_graphAnim) { cancelAnimationFrame(_graphAnim); _graphAnim = null; }

        const tip = document.getElementById('smiGraphTip');
        const ctx  = canvas.getContext('2d');
        const W    = canvas.parentElement.clientWidth || 800;
        const H    = 500;
        canvas.width = W; canvas.height = H;

        // Build physics nodes from API data
        const nodeMap = {};
        const physNodes = data.nodes.map((n, i) => {
            const angle = n.isCenter ? 0 : ((i - 1) / Math.max(data.nodes.length - 1, 1)) * Math.PI * 2;
            const dist  = n.isCenter ? 0 : 170 + Math.random() * 60;
            const obj = {
                ...n,
                x: W/2 + (n.isCenter ? 0 : Math.cos(angle) * dist),
                y: H/2 + (n.isCenter ? 0 : Math.sin(angle) * dist),
                vx: 0, vy: 0,
                pulse: Math.random() * Math.PI * 2,
            };
            nodeMap[n.id] = obj;
            return obj;
        });

        // Map edges to node objects
        const physEdges = data.edges.map(e => ({
            ...e,
            a: nodeMap[e.from],
            b: nodeMap[e.to],
        })).filter(e => e.a && e.b);

        // Mark the single biggest-sol edge (by absolute SOL value)
        const maxSolVal = Math.max(0, ...physEdges.map(e => e.sol || 0));
        physEdges.forEach(e => { e.isBiggest = maxSolVal > 0 && e.sol === maxSolVal; });
        // Mark target node of biggest edge for special rendering
        physEdges.forEach(e => {
            if (e.isBiggest) {
                if (e.b) e.b.isBiggest = true;
                if (e.a && !e.a.isCenter) e.a.isBiggest = true;
            }
        });

        let dragging = null, dragOx = 0, dragOy = 0, hovIdx = -1, clickStart = null;

        const getNode = (mx,my) => physNodes.findIndex(n => Math.hypot(n.x-mx,n.y-my) < n.r+6);

        canvas.onmousedown = e => {
            const rect=canvas.getBoundingClientRect();
            const mx=e.clientX-rect.left, my=e.clientY-rect.top;
            const idx=getNode(mx,my);
            if(idx>=0){ dragging=idx; dragOx=physNodes[idx].x-mx; dragOy=physNodes[idx].y-my; clickStart={mx,my}; }
        };
        canvas.onmouseup = e => {
            if(dragging!==null){
                const rect=canvas.getBoundingClientRect();
                const mx=e.clientX-rect.left, my=e.clientY-rect.top;
                const moved = clickStart && Math.hypot(mx-clickStart.mx, my-clickStart.my) < 6;
                if(moved) {
                    const n = physNodes[dragging];
                    if(e.detail===2) {
                        // double-click → search this wallet in the graph
                        const inp = document.getElementById('smiGraphInput');
                        if(inp) { inp.value = n.id; SmartMoneyIntel.searchGraph(); }
                    } else if(!n.isCenter) {
                        SmartMoneyIntel.openWalletDetail(n.id, n.label);
                    }
                }
                dragging=null; clickStart=null;
            }
        };
        canvas.onmousemove = e => {
            const rect=canvas.getBoundingClientRect();
            const mx=e.clientX-rect.left, my=e.clientY-rect.top;
            if(dragging!==null){
                physNodes[dragging].x=mx+dragOx; physNodes[dragging].y=my+dragOy;
                physNodes[dragging].vx=physNodes[dragging].vy=0; return;
            }
            hovIdx=getNode(mx,my);
            if(hovIdx>=0 && tip){
                const n=physNodes[hovIdx];
                const dirLabel = n.isCenter ? '⭐ Wallet Dicari' :
                    n.type==='inflow'  ? '⬇ Mengirim SOL ke wallet ini' :
                    n.type==='outflow' ? '⬆ Menerima SOL dari wallet ini' : '↔ Interaksi (swap/token)';
                const counterTypeLbl = n.isCenter ? '' : n.counterType === 'program'
                    ? `<div style="font-size:10px;color:#a855f7;margin-bottom:3px">⚙️ Program / Smart Contract · ${n.counterCat||''}</div>`
                    : `<div style="font-size:10px;color:#60a5fa;margin-bottom:3px">👤 User Wallet</div>`;
                tip.style.display='block';
                tip.style.left = Math.min(mx+14, W-250)+'px';
                tip.style.top  = Math.max(my-10, 4)+'px';
                tip.innerHTML = `
                    <div style="font-weight:700;color:${n.color};margin-bottom:4px">${dirLabel}</div>
                    ${counterTypeLbl}
                    ${n.isBiggest?`<div style="color:#fbbf24;font-size:11px;font-weight:700;margin-bottom:4px">⚡ Transaksi Terbesar (${maxSolVal} SOL)</div>`:''}
                    <div style="font-family:monospace;font-size:10px;color:#64748b;word-break:break-all;margin-bottom:6px">${n.id}</div>
                    ${n.txCount?`<div style="font-size:11px;color:#94a3b8">🔄 ${n.txCount} transaksi bersama</div>`:''}
                    ${n.recvSol>0?`<div style="font-size:11px;color:#ef4444">⬆ Outflow: ${n.recvSol} SOL diterima</div>`:''}
                    ${n.sentSol>0?`<div style="font-size:11px;color:#22c55e">⬇ Inflow: ${n.sentSol} SOL dikirim</div>`:''}
                    ${n.lastAgo?`<div style="font-size:10px;color:#475569;margin-top:4px">Terakhir: ${n.lastAgo}</div>`:''}
                    ${!n.isCenter?'<div style="font-size:10px;color:#3b82f6;margin-top:5px">Click → trace · 2×Click → map flow</div>':''}`;
            } else if(tip) { tip.style.display='none'; }
        };
        canvas.onmouseleave = () => { hovIdx=-1; if(tip) tip.style.display='none'; };

        // Arrow helper
        function drawArrow(ctx, x1,y1,x2,y2,color,progress,label,isBiggest) {
            const dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy)||1;
            const ux=dx/len, uy=dy/len;
            // Shorten to node edge
            const fromN = physNodes.find(n=>Math.hypot(n.x-x1,n.y-y1)<5);
            const toN   = physNodes.find(n=>Math.hypot(n.x-x2,n.y-y2)<5);
            const sx = x1 + ux*(fromN?.r||16), sy = y1 + uy*(fromN?.r||16);
            const ex = x2 - ux*(toN?.r||16),   ey = y2 - uy*(toN?.r||16);

            if (isBiggest) {
                // ── BIGGEST EDGE: thick gold glow line ──
                // Outer glow halo
                ctx.save();
                ctx.strokeStyle = '#fbbf2440'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
                ctx.strokeStyle = '#fbbf2428'; ctx.lineWidth = 22;
                ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
                ctx.restore();

                // Main gold line
                ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();

                // Arrowhead (bigger, gold)
                const headLen = 13;
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath();
                ctx.moveTo(ex,ey);
                ctx.lineTo(ex-headLen*(ux-uy*.45), ey-headLen*(uy+ux*.45));
                ctx.lineTo(ex-headLen*(ux+uy*.45), ey-headLen*(uy-ux*.45));
                ctx.closePath(); ctx.fill();

                // Two animated dots (chasing each other)
                const p1 = progress, p2 = (progress + 0.4) % 1;
                [p1, p2].forEach((prog, di) => {
                    const px=sx+(ex-sx)*prog, py=sy+(ey-sy)*prog;
                    const dotR = di===0 ? 5 : 3.5;
                    // Glow around dot
                    const dotGlow = ctx.createRadialGradient(px,py,0,px,py,dotR*3);
                    dotGlow.addColorStop(0, '#fbbf2488'); dotGlow.addColorStop(1, '#fbbf2400');
                    ctx.fillStyle = dotGlow; ctx.beginPath(); ctx.arc(px,py,dotR*3,0,Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(px,py,dotR,0,Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#fff8'; ctx.beginPath(); ctx.arc(px-dotR*.3,py-dotR*.3,dotR*.35,0,Math.PI*2); ctx.fill();
                });

                // Edge label (bigger, gold)
                if (label && len > 60) {
                    const mx=(sx+ex)/2-uy*18, my=(sy+ey)/2+ux*18;
                    // Badge background
                    ctx.save();
                    ctx.fillStyle='#1a0f00'; ctx.strokeStyle='#fbbf24'; ctx.lineWidth=1.2;
                    const tw = ctx.measureText('⚡ '+label).width + 10;
                    ctx.beginPath(); ctx.roundRect(mx-tw/2-2, my-9, tw+4, 18, 5); ctx.fill(); ctx.stroke();
                    ctx.fillStyle='#fbbf24'; ctx.font='bold 10px sans-serif';
                    ctx.textAlign='center'; ctx.textBaseline='middle';
                    ctx.fillText('⚡ '+label, mx, my);
                    ctx.restore();
                }
            } else {
                // ── NORMAL EDGE ──
                ctx.strokeStyle=color+'88'; ctx.lineWidth=1.8; ctx.setLineDash([]);
                ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();

                // Arrowhead
                const headLen=8;
                ctx.fillStyle=color;
                ctx.beginPath();
                ctx.moveTo(ex,ey);
                ctx.lineTo(ex-headLen*(ux-uy*.4), ey-headLen*(uy+ux*.4));
                ctx.lineTo(ex-headLen*(ux+uy*.4), ey-headLen*(uy-ux*.4));
                ctx.closePath(); ctx.fill();

                // Animated dot
                const px=sx+(ex-sx)*progress, py=sy+(ey-sy)*progress;
                ctx.fillStyle=color; ctx.beginPath(); ctx.arc(px,py,3,0,Math.PI*2); ctx.fill();

                // Edge label
                if(label && len > 80) {
                    const mx=(sx+ex)/2-uy*14, my=(sy+ey)/2+ux*14;
                    ctx.fillStyle=color+'cc'; ctx.font='600 10px sans-serif';
                    ctx.textAlign='center'; ctx.textBaseline='middle';
                    ctx.fillText(label.slice(0,14), mx, my);
                }
            }
        }

        let frame=0;
        function animate() {
            if(!document.getElementById('smiGraphCanvas')) return;
            _graphAnim=requestAnimationFrame(animate);
            frame++;
            ctx.clearRect(0,0,W,H);

            // Background grid
            ctx.strokeStyle='rgba(30,41,59,.2)'; ctx.lineWidth=.8;
            for(let x=0;x<W;x+=60){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
            for(let y=0;y<H;y+=60){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}

            // Physics simulation
            for(let i=0;i<physNodes.length;i++){
                const ni=physNodes[i];
                for(let j=i+1;j<physNodes.length;j++){
                    const nj=physNodes[j];
                    const dx=nj.x-ni.x, dy=nj.y-ni.y, dist=Math.sqrt(dx*dx+dy*dy)||1;
                    const minD=ni.r+nj.r+50;
                    if(dist<minD){
                        const f=(minD-dist)/dist*.06;
                        if(i!==dragging){ni.vx-=dx*f; ni.vy-=dy*f;}
                        if(j!==dragging){nj.vx+=dx*f; nj.vy+=dy*f;}
                    }
                }
                if(i!==dragging && !ni.isCenter){
                    ni.vx+=(W/2-ni.x)*.0008; ni.vy+=(H/2-ni.y)*.0008;
                    ni.x+=ni.vx; ni.y+=ni.vy;
                    ni.vx*=.86; ni.vy*=.86;
                    ni.x=Math.max(ni.r+10,Math.min(W-ni.r-10,ni.x));
                    ni.y=Math.max(ni.r+10,Math.min(H-ni.r-10,ni.y));
                }
            }

            // Draw edges with arrows — normal ones first, biggest on top
            physEdges.filter(e=>!e.isBiggest).forEach(e=>{
                if(!e.a||!e.b) return;
                const col = e.dir==='in'?'#22c55e':e.dir==='out'?'#ef4444':'#60a5fa';
                const prog = (frame % 90) / 90;
                drawArrow(ctx, e.a.x,e.a.y, e.b.x,e.b.y, col, prog, e.label, false);
            });
            physEdges.filter(e=>e.isBiggest).forEach(e=>{
                if(!e.a||!e.b) return;
                const prog = (frame % 60) / 60;
                drawArrow(ctx, e.a.x,e.a.y, e.b.x,e.b.y, '#fbbf24', prog, e.label, true);
            });

            // Draw nodes
            physNodes.forEach((n,i)=>{
                const hov=i===hovIdx; n.pulse+=.05;
                const r=n.r+(hov?3:0);
                const isProgram = n.counterType === 'program';

                // Outer glow
                const glow=ctx.createRadialGradient(n.x,n.y,r*.2,n.x,n.y,r*2.5);
                glow.addColorStop(0,n.color+(n.isCenter?'50':hov?'35':'18'));
                glow.addColorStop(1,n.color+'00');
                ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(n.x,n.y,r*2.5,0,Math.PI*2); ctx.fill();

                if (isProgram) {
                    // ── PROGRAM NODE: diamond / rotated-square shape ──
                    const catIconMap = { dex:'🔄', exchange:'🏦', stake:'🥩', lending:'🏗', system:'⚙️' };
                    const catLabel   = { dex:'DEX', exchange:'CEX', stake:'STAKE', lending:'LEND', system:'SYS' };
                    ctx.save();
                    ctx.translate(n.x, n.y);
                    ctx.rotate(Math.PI / 4); // 45°
                    const bodyGr = ctx.createLinearGradient(-r,-r,r,r);
                    bodyGr.addColorStop(0, n.color+'ee'); bodyGr.addColorStop(1, n.color+'77');
                    ctx.fillStyle = bodyGr;
                    ctx.strokeStyle = n.color + (hov?'ff':'aa');
                    ctx.lineWidth = hov ? 2.5 : 1.8;
                    ctx.beginPath();
                    ctx.rect(-r, -r, r*2, r*2);
                    ctx.fill(); ctx.stroke();
                    ctx.restore();

                    // Category sub-label
                    const subLbl = catLabel[n.counterCat] || n.counterCat || 'PROG';
                    ctx.fillStyle = n.color + 'cc'; ctx.font = 'bold 8px sans-serif';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(catIconMap[n.counterCat]||'⚙', n.x, n.y - r - 14);
                    ctx.fillStyle = '#f8fafc'; ctx.font = `${hov?700:500} ${Math.max(8,Math.min(r*.4,12))}px sans-serif`;
                    ctx.fillText(n.label.slice(0,10), n.x, n.y);
                    ctx.fillStyle = n.color + 'aa'; ctx.font = 'bold 8px sans-serif';
                    ctx.fillText(subLbl, n.x, n.y + r*.5 + 2);

                    // Hover ring
                    if (hov) {
                        ctx.strokeStyle = n.color + '55'; ctx.lineWidth = 1.2; ctx.setLineDash([4,4]);
                        ctx.beginPath(); ctx.arc(n.x, n.y, r+11, 0, Math.PI*2); ctx.stroke();
                        ctx.setLineDash([]);
                    }
                } else {
                    // ── WALLET NODE: normal circle ──
                    const gr=ctx.createRadialGradient(n.x-r*.3,n.y-r*.3,r*.1,n.x,n.y,r);
                    gr.addColorStop(0,n.color+'ee'); gr.addColorStop(1,n.color+'77');
                    ctx.fillStyle=gr; ctx.strokeStyle=n.color+(hov||n.isCenter?'ff':'aa');
                    ctx.lineWidth=n.isCenter?2.5:hov?2:1.5;
                    ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2); ctx.fill(); ctx.stroke();

                    // Center pulse ring
                    if(n.isCenter){
                        const pr = r + 8 + Math.sin(n.pulse)*4;
                        ctx.strokeStyle=n.color+'44'; ctx.lineWidth=1.5;
                        ctx.beginPath(); ctx.arc(n.x,n.y,pr,0,Math.PI*2); ctx.stroke();
                    }

                    // Label
                    ctx.fillStyle='#f8fafc'; ctx.font=`${n.isCenter||hov?700:500} ${Math.max(9,Math.min(r*.48,14))}px sans-serif`;
                    ctx.textAlign='center'; ctx.textBaseline='middle';
                    ctx.fillText(n.label.slice(0,11), n.x, n.y);
                }

                // Biggest-edge node: gold crown ring + spinning dashed ring
                if(n.isBiggest && !n.isCenter){
                    // Spinning dashed halo
                    ctx.save();
                    ctx.translate(n.x, n.y);
                    ctx.rotate(frame * 0.025);
                    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.beginPath(); ctx.arc(0,0,r+9,0,Math.PI*2); ctx.stroke();
                    ctx.restore();
                    // Pulsing gold glow ring
                    const pulseR = r + 14 + Math.sin(n.pulse * 1.8) * 5;
                    ctx.strokeStyle = '#fbbf2455'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
                    ctx.beginPath(); ctx.arc(n.x,n.y,pulseR,0,Math.PI*2); ctx.stroke();
                    // ⚡ crown label above node
                    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 11px sans-serif';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
                    ctx.fillText('⚡ TERBESAR', n.x, n.y - r - 13);
                }

                // TX count badge (wallet nodes only)
                if(!isProgram && !n.isCenter && n.txCount){
                    ctx.fillStyle='#0f172a'; ctx.strokeStyle=n.color+'88'; ctx.lineWidth=1;
                    ctx.beginPath(); ctx.arc(n.x+r*.7,n.y-r*.7,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
                    ctx.fillStyle=n.color; ctx.font='bold 8px sans-serif';
                    ctx.textAlign='center'; ctx.textBaseline='middle';
                    ctx.fillText(n.txCount>99?'99+':n.txCount, n.x+r*.7, n.y-r*.7);
                }
            });
        }
        animate();
    }

    function _renderGraphList(data) {
        const el = document.getElementById('smiGraphList');
        if (!el) return;
        const peers = data.nodes.filter(n => !n.isCenter);

        // ── Rekening Koran (Bank Statement Ledger) ──
        const ledger = data.ledger || [];
        let ledgerHtml = '';
        if (ledger.length) {
            // running balance display: show from oldest to newest (reverse order for display)
            const rows = [...ledger].reverse(); // oldest first for real statement feel
            // Find the biggest absolute SOL movement
            const maxSolTx = Math.max(0, ...rows.map(r => parseFloat(r.solDeltaAbs)||0));

            // txType display config
            const TX_META = {
                buy:           { icon:'🟢', label:'BUY',          bg:'rgba(34,197,94,.15)',   fg:'#22c55e' },
                sell:          { icon:'🔴', label:'SELL',         bg:'rgba(239,68,68,.15)',   fg:'#ef4444' },
                swap:          { icon:'🔵', label:'SWAP',         bg:'rgba(96,165,250,.15)',  fg:'#60a5fa' },
                stake:         { icon:'🟣', label:'STAKE',        bg:'rgba(168,85,247,.15)',  fg:'#a855f7' },
                unstake:       { icon:'🟡', label:'UNSTAKE',      bg:'rgba(234,179,8,.15)',   fg:'#eab308' },
                deposit_lend:  { icon:'🏦', label:'LENDING+',     bg:'rgba(132,204,22,.15)',  fg:'#84cc16' },
                withdraw_lend: { icon:'🏦', label:'LENDING−',     bg:'rgba(251,146,60,.15)',  fg:'#fb923c' },
                deposit_cex:   { icon:'🏦', label:'DEPOSIT CEX',  bg:'rgba(239,68,68,.15)',   fg:'#f87171' },
                withdraw_cex:  { icon:'🏦', label:'WITHDRAW CEX', bg:'rgba(34,197,94,.15)',   fg:'#4ade80' },
                transfer_out:  { icon:'➡',  label:'TRANSFER',     bg:'rgba(239,68,68,.10)',   fg:'#fca5a5' },
                transfer_in:   { icon:'⬅',  label:'TRANSFER',     bg:'rgba(34,197,94,.10)',   fg:'#86efac' },
                distribute:    { icon:'📤', label:'DISTRIBUSI',   bg:'rgba(251,191,36,.15)',  fg:'#fbbf24' },
                fee:           { icon:'⚙️', label:'FEE',          bg:'rgba(100,116,139,.15)', fg:'#64748b' },
                debit:         { icon:'⬆',  label:'KELUAR',       bg:'rgba(239,68,68,.10)',   fg:'#ef4444' },
                credit:        { icon:'⬇',  label:'MASUK',        bg:'rgba(34,197,94,.10)',   fg:'#22c55e' },
            };
            function _txBadge(txType) {
                const m = TX_META[txType] || TX_META.debit;
                return `<span style="display:inline-flex;align-items:center;gap:3px;background:${m.bg};color:${m.fg};border:1px solid ${m.fg}33;padding:1px 7px;border-radius:20px;font-size:9px;font-weight:700;white-space:nowrap">${m.icon} ${m.label}</span>`;
            }

            ledgerHtml = `
            <div class="smi-sec-title" style="margin-top:18px">
                💳 Rekening Koran — Mutasi Transaksi
                <span style="font-size:10px;color:#334155;font-weight:400;margin-left:6px">${ledger.length} transaksi terakhir</span>
                <button onclick="SmartMoneyIntel._exportLedger()" style="margin-left:auto;float:right;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.2);color:#60a5fa;padding:2px 10px;border-radius:4px;font-size:10px;cursor:pointer">⬇ Export CSV</button>
            </div>
            <!-- Legend row -->
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;font-size:10px">
                ${Object.entries(TX_META).filter(([k])=>['buy','sell','swap','stake','withdraw_cex','deposit_cex','transfer_out','transfer_in','distribute'].includes(k))
                    .map(([k,m])=>`<span style="background:${m.bg};color:${m.fg};padding:1px 8px;border-radius:20px;border:1px solid ${m.fg}33">${m.icon} ${m.label}</span>`).join('')}
            </div>
            <div style="overflow-x:auto;margin-bottom:18px">
            <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead>
                    <tr style="background:#0a0e1a;color:#334155;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px">
                        <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #1e293b">Tanggal</th>
                        <th style="padding:8px 10px;text-align:center;border-bottom:1px solid #1e293b">Jenis TX</th>
                        <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #1e293b">Ke / Dari</th>
                        <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #1e293b;color:#ef4444">Debit ◎</th>
                        <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #1e293b;color:#22c55e">Kredit ◎</th>
                        <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #1e293b">Saldo ◎</th>
                        <th style="padding:8px 10px;text-align:center;border-bottom:1px solid #1e293b">Status</th>
                        <th style="padding:8px 10px;text-align:center;border-bottom:1px solid #1e293b"></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((row, idx) => {
                        const solAmt = parseFloat(row.solDeltaAbs) || 0;
                        const isBig = maxSolTx > 0 && solAmt === maxSolTx;
                        const rowBg = isBig
                            ? 'background:linear-gradient(90deg,rgba(251,191,36,.08) 0%,rgba(251,191,36,.04) 100%)'
                            : idx % 2 === 0 ? 'background:#050a14' : '';
                        const borderStr = isBig ? 'border-bottom:1px solid rgba(251,191,36,.25);border-left:2px solid #fbbf24' : 'border-bottom:1px solid #0a0e1a';
                        const counterShort = row.counterAddr ? row.counterAddr.slice(0,8)+'…'+row.counterAddr.slice(-4) : '—';
                        const isProgram = row.counterType === 'program';
                        const catIconMap = { dex:'🔄', exchange:'🏦', stake:'🥩', lending:'🏗', system:'⚙️' };
                        const catIcon = catIconMap[row.counterCat] || '👤';
                        const counterTypeLabel = isProgram
                            ? `<span style="font-size:9px;background:rgba(168,85,247,.15);color:#a855f7;border:1px solid #a855f754;padding:0 5px;border-radius:10px;margin-left:3px">${catIcon} Program</span>`
                            : `<span style="font-size:9px;background:rgba(59,130,246,.1);color:#60a5fa;border:1px solid #60a5fa33;padding:0 5px;border-radius:10px;margin-left:3px">👤 Wallet</span>`;
                        return `
                        <tr style="${rowBg};${borderStr}" onmouseover="this.style.background='${isBig?'rgba(251,191,36,.14)':'rgba(59,130,246,.05)'}'" onmouseout="this.style.background='${isBig?'rgba(251,191,36,.08)':idx%2===0?'#050a14':''}'">
                            <td style="padding:7px 10px;color:${isBig?'#fbbf24':'#475569'};white-space:nowrap;font-family:monospace;font-size:10px">${row.dateStr||'—'}</td>
                            <td style="padding:7px 10px;text-align:center;white-space:nowrap">
                                ${_txBadge(row.txType || row.type)}
                                ${isBig?`<br><span style="font-size:8px;color:#fbbf24;font-weight:700">⚡ Terbesar</span>`:''}
                            </td>
                            <td style="padding:7px 10px;max-width:220px">
                                <div style="display:flex;align-items:flex-start;gap:5px">
                                    <div style="flex:1;min-width:0">
                                        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:3px">
                                            <span style="font-size:11px;color:${isBig?'#fde68a':'#e2e8f0'};font-weight:${isBig?'700':'600'}">${row.counterLabel||counterShort}</span>
                                            ${counterTypeLabel}
                                        </div>
                                        ${row.counterAddr?`<div style="font-size:9px;font-family:monospace;color:#1e293b;margin-top:2px">${counterShort}</div>`:''}
                                    </div>
                                </div>
                            </td>
                            <td style="padding:7px 10px;text-align:right;color:${isBig&&row.type==='debit'?'#fbbf24':'#ef4444'};font-weight:${isBig?'800':'600'};font-family:monospace;font-size:${isBig?'13':'12'}px">${row.type==='debit'?row.solDeltaAbs+' ◎':'—'}</td>
                            <td style="padding:7px 10px;text-align:right;color:${isBig&&row.type==='credit'?'#fbbf24':'#22c55e'};font-weight:${isBig?'800':'600'};font-family:monospace;font-size:${isBig?'13':'12'}px">${row.type==='credit'?row.solDeltaAbs+' ◎':row.type==='swap'?'swap':'—'}</td>
                            <td style="padding:7px 10px;text-align:right;color:${isBig?'#fde68a':'#94a3b8'};font-family:monospace">${row.balanceAfter!=null?row.balanceAfter+' ◎':'—'}</td>
                            <td style="padding:7px 10px;text-align:center">
                                <span style="padding:2px 7px;border-radius:20px;font-size:9px;font-weight:700;${row.status==='success'?'background:rgba(34,197,94,.12);color:#22c55e':'background:rgba(239,68,68,.12);color:#ef4444'}">
                                    ${row.status==='success'?'✓ OK':'✗ Fail'}
                                </span>
                            </td>
                            <td style="padding:7px 10px;text-align:center">
                                <a href="${row.solscanUrl}" target="_blank" style="color:${isBig?'#fbbf24':'#334155'};text-decoration:none;font-size:11px" title="Lihat di Solscan">🔗</a>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
            </div>`;
        }

        if (!peers.length && !ledger.length) { el.innerHTML = `<div class="smi-empty">Tidak ada data ditemukan</div>`; return; }

        el.innerHTML = ledgerHtml + (peers.length ? `
        <div class="smi-sec-title" style="margin-top:4px">📋 ${peers.length} Wallet Berinteraksi — ${data.txCount} TX terakhir dianalisis</div>
        <div class="smi-card">
            <div class="smi-card-hdr" style="grid-template-columns:28px 1fr 80px 80px 80px 80px">
                <span>#</span><span>Wallet</span>
                <span style="text-align:right">TX</span>
                <span style="text-align:right">⬇ Inflow</span>
                <span style="text-align:right">⬆ Outflow</span>
                <span style="text-align:right">Terakhir</span>
            </div>
            ${peers.map((n,i)=>{
                const dirIcon = n.type==='inflow'?'⬇':n.type==='outflow'?'⬆':'↔';
                const dirCol  = n.type==='inflow'?'#22c55e':n.type==='outflow'?'#ef4444':'#60a5fa';
                return `
                <div class="smi-row" style="grid-template-columns:28px 1fr 80px 80px 80px 80px"
                    onclick="SmartMoneyIntel.openWalletDetail('${n.id}','${n.label.replace(/'/g,'')}')"
                    ondblclick="document.getElementById('smiGraphInput').value='${n.id}';SmartMoneyIntel.searchGraph()">
                    <div style="font-size:10px;color:#334155;text-align:center">${i+1}</div>
                    <div>
                        <div style="display:flex;align-items:center;gap:5px">
                            <span style="color:${dirCol};font-size:13px">${dirIcon}</span>
                            <span style="font-size:12px;color:#e2e8f0;font-family:monospace">${n.id.slice(0,8)}…${n.id.slice(-5)}</span>
                        </div>
                        <div style="font-size:10px;color:#334155;margin-top:1px">${n.label}</div>
                    </div>
                    <div style="text-align:right;font-size:13px;font-weight:700;color:${dirCol}">${n.txCount}</div>
                    <div style="text-align:right;font-size:12px;color:#22c55e">${n.sentSol>0?'+'+n.sentSol+' ◎':'—'}</div>
                    <div style="text-align:right;font-size:12px;color:#ef4444">${n.recvSol>0?'-'+n.recvSol+' ◎':'—'}</div>
                    <div style="text-align:right;font-size:11px;color:#334155">${n.lastAgo||'?'}</div>
                </div>`;
            }).join('')}
        </div>` : '') + `
        <div style="font-size:10px;color:#1e293b;text-align:right;margin-top:4px">
            ${data._cached?'🗄 Cached · ':''}Dianalisis ${data.parsedTxCount||0} dari ${data.txCount||0} TX · ${new Date(data.fetchedAt).toLocaleTimeString('id-ID')}
        </div>`;

        // Store ledger for CSV export
        window._smiLastLedger = { addr: data.center, ledger };
    }

    function _exportLedger() {
        const d = window._smiLastLedger;
        if (!d || !d.ledger.length) return;
        const rows = ['Tanggal,Keterangan,Counterparty,Debit,Kredit,Saldo,Status,TX Hash'].concat(
            [...d.ledger].reverse().map(r =>
                `"${r.dateStr}","${r.counterLabel||''}","${r.counterAddr||''}",` +
                `"${r.type==='debit'?r.solDeltaAbs:''}","${r.type==='credit'?r.solDeltaAbs:r.type==='swap'?'swap':''}",` +
                `"${r.balanceAfter!=null?r.balanceAfter:''}","${r.status}","${r.sig}"`
            )
        );
        const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `ledger_${d.addr.slice(0,8)}_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
    }


    function resetGraph() {
        if(_graphAnim){ cancelAnimationFrame(_graphAnim); _graphAnim=null; }
        _renderGraph();
    }

    // ── 5. Alerts & Telegram ─────────────────────────────────────
    async function _renderAlerts() {
        const el = document.getElementById('smiSubContent');
        if (!el) return;
        let data = null;
        try { const r = await fetch(`${BASE}/api/smart-money-intel`); data = await r.json(); } catch(e) {}
        const wf    = data?.whaleFeed   || [];
        const accum = (data?.accumSignals||[]).filter(s=>s.accumScore>=72).slice(0,6);
        const sevColor = { HIGH:'#ef4444', MED:'#f59e0b', LOW:'#3b82f6' };

        const alerts = [];
        wf.forEach(w => {
            const isBuy = w.type==='buy';
            alerts.push({
                sev: w.amount>50000?'HIGH':w.amount>10000?'MED':'LOW',
                type: isBuy?'WHALE BUY':'WHALE SELL', icon: isBuy?'🐋':'🔴',
                title: `${w.symbol} — $${fmtUsd(w.amount)} ${w.type.toUpperCase()}`,
                detail: `Price: $${w.price<0.001?w.price.toExponential(2):w.price.toFixed(4)} | 1h: ${w.priceChange>=0?'+':''}${(w.priceChange||0).toFixed(1)}%`,
                chain: w.chain, ts: w.ts, url: w.dexUrl,
            });
        });
        accum.forEach(s => {
            alerts.push({
                sev: s.signal.includes('STRONG')?'HIGH':'MED',
                type: 'SMART MONEY ENTRY', icon: '🧠',
                title: `${s.symbol} — ${s.signal}`,
                detail: `Buy: ${s.buyPct}% | Vol/Liq: ${s.volLiqRatio}x | 24h: ${s.priceChange24h>=0?'+':''}${(s.priceChange24h||0).toFixed(1)}%`,
                chain: 'SOL', ts: Date.now()-Math.floor(Math.random()*600000), url: s.dexUrl,
            });
        });
        alerts.sort((a,b)=>b.ts-a.ts);

        // Load existing config from server first, then render
        let _tgCfg = { hasToken: false, chatId: '', configured: false };
        let _monSt = { active: false, walletCount: 0, intervalMin: 5 };
        try { const r = await fetch(`${BASE}/api/telegram-config`); _tgCfg = await r.json(); } catch(_) {}
        try { const r = await fetch(`${BASE}/api/whale-monitor/status`); _monSt = await r.json(); } catch(_) {}
        const savedWallets = _swLoad();

        el.innerHTML = `<div class="smi-content">
            <!-- Whale Wallet Monitor -->
            <div style="background:#0a0e1a;border:1px solid ${_tgCfg.configured?'#1e3a5f':'#3b1f1f'};border-radius:10px;padding:16px;margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
                    <div style="font-size:14px;font-weight:700;color:#fbbf24">🔍 Whale Wallet Monitor</div>
                    <span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;
                        background:${_monSt.walletCount>0?'rgba(34,197,94,.15)':'rgba(100,116,139,.1)'};
                        color:${_monSt.walletCount>0?'#22c55e':'#64748b'};
                        border:1px solid ${_monSt.walletCount>0?'rgba(34,197,94,.3)':'#1e293b'}">
                        ${_monSt.walletCount>0?`✅ ${_monSt.walletCount} wallet aktif`:'⏸ Belum ada wallet'}
                    </span>
                    <!-- Telegram status badge — pakai config yang sama di bawah -->
                    <span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;
                        background:${_tgCfg.configured?'rgba(96,165,250,.1)':'rgba(239,68,68,.1)'};
                        color:${_tgCfg.configured?'#60a5fa':'#ef4444'};
                        border:1px solid ${_tgCfg.configured?'rgba(96,165,250,.2)':'rgba(239,68,68,.2)'}">
                        ${_tgCfg.configured?'📱 Telegram OK':'⚠️ Telegram belum diset'}
                    </span>
                    <span style="font-size:10px;color:#334155;margin-left:auto">📡 Polling 5 menit · Solana RPC</span>
                </div>
                ${!_tgCfg.configured ? `
                <div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:8px 12px;margin-bottom:10px;font-size:11px;color:#fca5a5">
                    ⚠️ Telegram belum dikonfigurasi — isi Bot Token & Chat ID di panel di bawah dulu, kemudian sync wallet.
                </div>` : ''}
                <div style="font-size:11px;color:#475569;line-height:1.7;margin-bottom:10px">
                    Bot otomatis kirim alert ke <b style="color:#60a5fa">Telegram yang sama</b> saat mendeteksi 
                    <b style="color:#22c55e">Akumulasi</b> atau <b style="color:#ef4444">Distribusi</b> dari wallet tersimpan.
                    Cooldown 15 menit per wallet untuk mencegah spam.
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <button class="smi-btn-primary"
                        style="background:${_tgCfg.configured?'linear-gradient(135deg,#d97706,#f59e0b)':'linear-gradient(135deg,#374151,#4b5563)'};
                               opacity:${_tgCfg.configured?'1':'0.6'};cursor:${_tgCfg.configured?'pointer':'not-allowed'}"
                        onclick="${_tgCfg.configured?'SmartMoneyIntel.syncWalletMonitor()':'void(0)'}"
                        title="${_tgCfg.configured?`Sync ${savedWallets.length} saved wallet ke server`:'Setup Telegram dulu di bawah'}">
                        📤 Sync ${savedWallets.length} Wallet ke Monitor
                    </button>
                    <span id="smiMonSt" style="font-size:11px;color:#475569"></span>
                </div>
                ${_monSt.walletCount > 0 ? `
                <div style="margin-top:10px;background:#050a0f;border-radius:6px;padding:10px;font-size:11px;color:#475569">
                    <b style="color:#94a3b8">Wallet yang dimonitor (${_monSt.walletCount}):</b>
                    <div id="smiMonWallets" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">
                        <span style="color:#334155">Memuat…</span>
                    </div>
                </div>` : ''}
            </div>
            <!-- Telegram Config -->
            <div style="background:#0a0e1a;border:1px solid #1e3a5f;border-radius:10px;padding:16px;margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
                    <div style="font-size:14px;font-weight:700;color:#60a5fa">📱 Telegram Alert Config</div>
                    <span style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;
                        background:${_tgCfg.configured?'rgba(34,197,94,.15)':'rgba(100,116,139,.1)'};
                        color:${_tgCfg.configured?'#22c55e':'#64748b'};
                        border:1px solid ${_tgCfg.configured?'rgba(34,197,94,.3)':'#1e293b'}">
                        ${_tgCfg.configured?'✅ Terkonfigurasi':'⚠️ Belum dikonfigurasi'}
                    </span>
                    <span style="font-size:11px;color:#334155;margin-left:auto">
                        Config disimpan di <code style="background:#0f172a;padding:1px 5px;border-radius:3px;color:#7dd3fc;font-size:10px">telegram-config.json</code> (server)
                    </span>
                </div>
                <div style="font-size:11px;color:#475569;margin-bottom:10px;line-height:1.6">
                    Config ini dipakai oleh <b style="color:#fbbf24">Whale Monitor</b>, 
                    <b style="color:#a78bfa">DEX Sniper</b>, dan <b style="color:#34d399">Scheduled Alert</b> — satu config untuk semua.
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                    <div>
                        <div style="font-size:11px;color:#475569;margin-bottom:5px">Bot Token</div>
                        <input id="smiTgToken" type="password" placeholder="${_tgCfg.hasToken?'••••••• (sudah tersimpan)':'123456:ABC-DEF…'}"
                            class="smi-tg-input">
                        ${_tgCfg.hasToken?'<div style="font-size:10px;color:#22c55e;margin-top:3px">✅ Token aktif — kosongkan untuk tidak mengubah</div>':''}
                    </div>
                    <div>
                        <div style="font-size:11px;color:#475569;margin-bottom:5px">Chat ID</div>
                        <input id="smiTgChat" placeholder="-100123456789" class="smi-tg-input"
                            value="${_tgCfg.chatId||''}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
                    <div>
                        <div style="font-size:11px;color:#475569;margin-bottom:5px">🤖 Topic ID — Signal &amp; Bot Alert</div>
                        <input id="smiTgTopic" placeholder="2" class="smi-tg-input"
                            value="${_tgCfg.topicId||'2'}">
                        <div style="font-size:10px;color:#64748b;margin-top:3px">Whale signal, auto-trader, news</div>
                    </div>
                    <div>
                        <div style="font-size:11px;color:#475569;margin-bottom:5px">💼 Topic ID — Wallet Tracker</div>
                        <input id="smiTgWalletTopic" placeholder="294" class="smi-tg-input"
                            value="${_tgCfg.walletTopicId||'294'}">
                        <div style="font-size:10px;color:#64748b;margin-top:3px">Aktivitas wallet &amp; smart money</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                    <button class="smi-btn-primary" style="background:linear-gradient(135deg,#0ea5e9,#0284c7)"
                        onclick="SmartMoneyIntel.testTg()">📤 Test Alert</button>
                    <button class="smi-btn-primary" style="background:linear-gradient(135deg,#059669,#10b981)"
                        onclick="SmartMoneyIntel.saveTg()">💾 Simpan Config</button>
                    <span id="smiTgSt" style="font-size:11px;color:#475569"></span>
                </div>
                <div style="margin-top:10px;font-size:11px;color:#334155;line-height:1.7">
                    Triggers: 🐋 Whale buy/sell &gt;$10K · 🧠 Smart money entry · 📊 Strong accumulation · ⚠️ Distribution detected
                </div>
            </div>

            <!-- Alert Feed -->
            <div class="smi-sec-title" style="display:flex;align-items:center;justify-content:space-between">
                <span>🚨 Smart Money Alert Feed</span>
                <div style="display:flex;gap:6px">
                    <button onclick="SmartMoneyIntel.runMonitorNow(this)" style="background:linear-gradient(135deg,#16a34a,#15803d);border:none;color:#fff;padding:3px 10px;border-radius:6px;font-size:10px;cursor:pointer">▶ Run Check</button>
                    <button onclick="SmartMoneyIntel.injectTestAlert(this)" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;color:#fff;padding:3px 10px;border-radius:6px;font-size:10px;cursor:pointer">🧪 Test Alert</button>
                    <button onclick="SmartMoneyIntel.refreshAlerts()" style="background:none;border:1px solid #1e293b;color:#475569;padding:3px 10px;border-radius:6px;font-size:10px;cursor:pointer">↻ Refresh</button>
                </div>
            </div>
            <div id="smiAlertFeed">
                <div class="smi-empty">⏳ Memuat alert log…</div>
            </div>
        </div>`;

        // Load alert log async setelah render
        _loadAlertFeed();
    }

    async function _loadAlertFeed() {
        const el = document.getElementById('smiAlertFeed');
        if (!el) return;

        let wwmAlerts = [];
        try {
            const r = await fetch(`${BASE}/api/whale-monitor/alerts?limit=20`);
            const d = await r.json();
            wwmAlerts = d.alerts || [];
        } catch(_) {}

        // Also include whaleFeed from smart-money-intel API
        let wfAlerts = [];
        try {
            const r2 = await fetch(`${BASE}/api/smart-money-intel`);
            const d2 = await r2.json();
            const wf = d2?.whaleFeed || [];
            wfAlerts = wf.map(w => ({
                _src: 'market',
                ts: w.ts,
                pattern: w.type === 'buy' ? 'WHALE BUY' : 'WHALE SELL',
                alertEmoji: w.type === 'buy' ? '🐋' : '🔴',
                topToken: w.symbol,
                amount: w.amount,
                price: w.price,
                priceChange: w.priceChange,
                dexUrl: w.dexUrl,
                chain: 'SOL',
            }));
        } catch(_) {}

        if (!wwmAlerts.length && !wfAlerts.length) {
            el.innerHTML = `
            <div style="background:#050a0f;border:1px solid #1e293b;border-radius:10px;padding:20px;text-align:center">
                <div style="font-size:32px;margin-bottom:8px">🔍</div>
                <div style="color:#475569;font-size:12px">Belum ada alert.</div>
                <div style="color:#334155;font-size:11px;margin-top:4px">Monitor sedang berjalan — alert muncul saat wallet tersimpan melakukan transaksi besar.</div>
            </div>`;
            return;
        }

        const patternColor = { 'AKUMULASI':'#22c55e', 'DISTRIBUSI':'#ef4444', 'WHALE BUY':'#34d399', 'WHALE SELL':'#f87171', 'SWAP':'#60a5fa', default:'#94a3b8' };
        const fmtNum = n => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : n?.toFixed?.(2) ?? '–';

        // Wallet-level alerts (from monitor)
        const walletCards = wwmAlerts.map(a => {
            const col = patternColor[a.pattern] || patternColor.default;
            const tokLines = (a.events || []).flatMap(e => e.tokens || []).slice(0, 3).map(t => {
                const dir = t.diff > 0 ? '▲' : '▼';
                return `<span style="background:#0f172a;border:1px solid #1e293b;border-radius:4px;padding:1px 6px;font-size:10px;color:${t.diff>0?'#22c55e':'#ef4444'}">${dir} ${Math.abs(t.diff) > 1e6 ? fmtNum(Math.abs(t.diff)) : Math.abs(t.diff).toLocaleString(undefined,{maximumFractionDigits:2})} ${t.symbol}</span>`;
            }).join(' ');
            const solChange = (a.events || []).reduce((sum, e) => sum + (e.deltaSOL || 0), 0);
            const solStr = Math.abs(solChange) > 0.01 ? `${solChange > 0 ? '+' : ''}${solChange.toFixed(3)} SOL` : '';

            return `
            <div style="background:#0a0e1a;border:1px solid ${col}33;border-left:3px solid ${col};border-radius:10px;padding:14px;margin-bottom:8px">
                <!-- Header row -->
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <span style="font-size:16px">${a.alertEmoji}</span>
                        <span style="font-size:12px;font-weight:700;color:${col}">${a.pattern}</span>
                        <span style="font-size:10px;color:#475569">${fmtAgo(a.ts)}</span>
                        ${a.sent ? '<span style="background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);border-radius:10px;padding:1px 7px;font-size:9px;color:#60a5fa">📱 Terkirim Telegram</span>' : ''}
                    </div>
                    <span style="font-size:10px;color:#334155;white-space:nowrap">${a.txCount} TX</span>
                </div>

                <!-- Wallet info box -->
                <div style="background:#050a0f;border:1px solid #1e293b;border-radius:7px;padding:10px;margin-bottom:10px">
                    <div style="font-size:10px;color:#475569;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px">👛 Wallet</div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <span style="font-size:13px;font-weight:700;color:#e2e8f0">${a.label}</span>
                        <!-- Full address dengan copy -->
                        <div style="display:flex;align-items:center;gap:4px;background:#0f172a;border:1px solid #1e293b;border-radius:5px;padding:3px 8px">
                            <code id="waddr_${a.id}" style="font-size:10px;color:#7dd3fc;letter-spacing:.3px;user-select:all">${a.addr}</code>
                            <button onclick="SmartMoneyIntel._copyAddr('waddr_${a.id}', this)"
                                style="background:none;border:none;cursor:pointer;padding:0 2px;font-size:12px;color:#475569;transition:color .2s"
                                title="Copy address">📋</button>
                        </div>
                        <a href="${a.solscanUrl}" target="_blank"
                            style="font-size:10px;color:#60a5fa;text-decoration:none;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2);border-radius:5px;padding:2px 7px">
                            🔗 Solscan
                        </a>
                    </div>
                </div>

                <!-- Token & SOL summary -->
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    ${tokLines || '<span style="color:#334155;font-size:10px">Tidak ada perubahan token</span>'}
                    ${solStr ? `<span style="background:#0f172a;border:1px solid #1e293b;border-radius:4px;padding:1px 6px;font-size:10px;color:${solChange>0?'#22c55e':'#ef4444'}">${solStr}</span>` : ''}
                </div>
            </div>`;
        }).join('');

        // Market-level alerts (from whaleFeed)
        const marketCards = wfAlerts.slice(0, 5).map(a => {
            const col = a.pattern.includes('BUY') ? '#34d399' : '#f87171';
            const ch = a.priceChange ?? 0;
            return `
            <div style="background:#0a0e1a;border:1px solid ${col}22;border-left:3px solid ${col};border-radius:10px;padding:12px;margin-bottom:6px;display:flex;align-items:center;gap:10px">
                <span style="font-size:18px">${a.alertEmoji}</span>
                <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <span style="font-size:12px;font-weight:700;color:#e2e8f0">${a.topToken} — $${fmtNum(a.amount)} ${a.pattern}</span>
                        <span style="font-size:10px;color:${ch>=0?'#22c55e':'#ef4444'}">${ch>=0?'+':''}${ch.toFixed(2)}% 1h</span>
                    </div>
                    <div style="font-size:10px;color:#475569;margin-top:2px">
                        Harga: $${a.price < 0.001 ? a.price.toExponential(2) : a.price.toFixed(4)} · Chain: ${a.chain}
                        ${a.dexUrl ? `· <a href="${a.dexUrl}" target="_blank" style="color:#60a5fa">DEX Chart</a>` : ''}
                    </div>
                </div>
                <div style="font-size:10px;color:#334155;white-space:nowrap">${fmtAgo(a.ts)}</div>
            </div>`;
        }).join('');

        el.innerHTML = `
        ${wwmAlerts.length ? `<div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">� Wallet Monitor Alerts</div>` : ''}
        ${walletCards}
        ${wfAlerts.length ? `<div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px">🌊 Market Volume Alerts</div>` : ''}
        ${marketCards}`;
    }

    function _copyAddr(elId, btn) {
        const el = document.getElementById(elId);
        if (!el) return;
        navigator.clipboard.writeText(el.textContent.trim()).then(() => {
            const orig = btn.textContent;
            btn.textContent = '✅';
            btn.style.color = '#22c55e';
            setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
        }).catch(() => {
            // fallback
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('copy');
            btn.textContent = '✅';
            setTimeout(() => { btn.textContent = '📋'; }, 1500);
        });
    }

    async function refreshAlerts() {
        const el = document.getElementById('smiAlertFeed');
        if (el) el.innerHTML = '<div class="smi-empty">⏳ Memuat…</div>';
        await _loadAlertFeed();
    }

    async function runMonitorNow(btn) {
        const orig = btn.textContent;
        btn.textContent = '⏳ Checking…';
        btn.disabled = true;
        try {
            const r = await fetch(`${BASE}/api/whale-monitor/run-now`, { method: 'POST' });
            const d = await r.json();
            if (d.ok) {
                btn.textContent = '✅ Running!';
                btn.style.background = 'linear-gradient(135deg,#16a34a,#15803d)';
                // Refresh feed setelah 8 detik (beri waktu cek selesai)
                setTimeout(() => refreshAlerts(), 8000);
            } else {
                btn.textContent = '⚠️ No Wallets';
                btn.style.background = '#dc2626';
                alert('Belum ada wallet yang dimonitor.\n\nCara menambahkan:\n1. Pergi ke tab Smart Money Intel\n2. Buka sub-menu "Wallet Tracer"\n3. Simpan wallet ke "Saved Wallets"\n4. Kembali ke Alerts → klik "Sync ke Monitor"');
            }
        } catch (e) {
            btn.textContent = '❌ Error';
        }
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; btn.style.background = 'linear-gradient(135deg,#16a34a,#15803d)'; }, 3000);
    }

    async function injectTestAlert(btn) {
        const orig = btn.textContent;
        btn.textContent = '⏳…';
        btn.disabled = true;
        try {
            const patterns = ['AKUMULASI','DISTRIBUSI','WHALE BUY','WHALE SELL'];
            const pattern = patterns[Math.floor(Math.random() * patterns.length)];
            const r = await fetch(`${BASE}/api/whale-monitor/test-alert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pattern }),
            });
            const d = await r.json();
            if (d.ok) {
                btn.textContent = '✅ Done';
                await refreshAlerts();
            } else {
                btn.textContent = '❌';
            }
        } catch(e) {
            btn.textContent = '❌ Error';
        }
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
    }

    // ── Stub functions (referenced in HTML / export but defined elsewhere) ──
    function openWalletDetail(addr, label) {
        // Show wallet detail — minimal modal
        const existing = document.getElementById('smiWalletModal');
        if (existing) existing.remove();
        const m = document.createElement('div');
        m.id = 'smiWalletModal';
        m.style.cssText = 'position:fixed;inset:0;z-index:9900;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center';
        m.innerHTML = `<div style="background:#030b15;border:1px solid #1e293b;border-radius:14px;padding:24px;width:420px;max-width:90vw">
            <div style="display:flex;justify-content:space-between;margin-bottom:14px">
                <div style="font-size:14px;font-weight:800;color:#e2e8f0">🔍 ${label||addr.slice(0,8)+'…'}</div>
                <button onclick="document.getElementById('smiWalletModal').remove()" style="background:none;border:none;color:#64748b;font-size:18px;cursor:pointer">✕</button>
            </div>
            <div style="font-size:10px;font-family:monospace;color:#475569;word-break:break-all;margin-bottom:14px">${addr}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <a href="https://solscan.io/account/${addr}" target="_blank" style="background:#0f172a;border:1px solid #1e293b;color:#60a5fa;border-radius:6px;padding:6px 14px;font-size:11px;text-decoration:none">🔍 Solscan↗</a>
                <a href="https://de.fi/scanner?address=${addr}" target="_blank" style="background:#0f172a;border:1px solid #1e293b;color:#a78bfa;border-radius:6px;padding:6px 14px;font-size:11px;text-decoration:none">🛡 DeFi Scanner↗</a>
            </div>
        </div>`;
        m.addEventListener('click', e => { if (e.target === m) m.remove(); });
        document.body.appendChild(m);
    }
    async function syncWalletMonitor() {
        const st = document.getElementById('smiTgSt');
        if (st) { st.textContent = 'Syncing…'; st.style.color='#94a3b8'; }
        try {
            const saved = _swLoad();
            const r = await fetch(`${BASE}/api/whale-monitor/sync`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ wallets: saved }) });
            const d = await r.json();
            if (st) { st.textContent = d.ok ? '✅ Synced '+saved.length+' wallet' : '❌ Gagal sync'; st.style.color = d.ok?'#4ade80':'#f87171'; }
        } catch(e) { if (st) { st.textContent = '❌ '+e.message; st.style.color='#f87171'; } }
    }
    function removeFromMonitor(addr) {
        const saved = _swLoad().filter(w => w.addr !== addr);
        _swSave(saved);
        _swRefreshPanel('smiSavedList');
    }

    // ── Telegram Config Save / Test ───────────────────────────────
    async function saveTg() {        const token  = (document.getElementById('smiTgToken')?.value || '').trim();
        const chatId = (document.getElementById('smiTgChat')?.value  || '').trim();
        const topicId = (document.getElementById('smiTgTopic')?.value || '2').trim();
        const walletTopicId = (document.getElementById('smiTgWalletTopic')?.value || '294').trim();
        const st     = document.getElementById('smiTgSt');
        if (!chatId) { if (st) { st.textContent = '⚠ Chat ID wajib diisi'; st.style.color='#f87171'; } return; }
        if (!topicId || !Number.isFinite(Number(topicId))) { if (st) { st.textContent = '⚠ Topic ID signal wajib angka'; st.style.color='#f87171'; } return; }
        if (!walletTopicId || !Number.isFinite(Number(walletTopicId))) { if (st) { st.textContent = '⚠ Topic ID wallet wajib angka'; st.style.color='#f87171'; } return; }
        if (st) { st.textContent = 'Menyimpan…'; st.style.color='#94a3b8'; }
        try {
            const body = { chatId, topicId, walletTopicId };
            if (token) body.botToken = token;
            const r = await fetch(`${BASE}/api/telegram-config`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
            const d = await r.json();
            if (st) { st.textContent = d.ok ? '✅ Tersimpan' : ('❌ '+(d.error||'Gagal')); st.style.color = d.ok ? '#4ade80' : '#f87171'; }
            if (d.ok) setTimeout(() => _smRenderAlerts && _smRenderAlerts(), 500);
        } catch(e) {
            if (st) { st.textContent = '❌ Error: '+e.message; st.style.color='#f87171'; }
        }
    }
    async function testTg() {
        const st = document.getElementById('smiTgSt');
        if (st) { st.textContent = 'Mengirim test…'; st.style.color='#94a3b8'; }
        try {
            const r = await fetch(`${BASE}/api/telegram-test`, { method:'POST', headers:{'Content-Type':'application/json'}, body: '{}' });
            const d = await r.json();
            if (st) { st.textContent = d.ok ? '✅ Test terkirim!' : ('❌ '+(d.error||'Gagal')); st.style.color = d.ok ? '#4ade80' : '#f87171'; }
        } catch(e) {
            if (st) { st.textContent = '❌ '+e.message; st.style.color='#f87171'; }
        }
    }

    // ── Public API ────────────────────────────────────────────────
    return { render, switchSub, refresh, trace, compare, preset, resetGraph, searchGraph,
             saveWallet, removeWallet, loadSavedToTracer, loadSavedToGraph,
             _wtExportSaved, _exportLedger,
             saveTg, testTg, openWalletDetail,
             syncWalletMonitor, removeFromMonitor,
             refreshAlerts, runMonitorNow, injectTestAlert, _copyAddr };
})();
