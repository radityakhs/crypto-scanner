/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║   AI NARRATIVE INTELLIGENCE PLATFORM                        ║
 * ║   "Find the next mover before retail enters."               ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Fitur:
 * - Narrative Heatmap (momentum per ekosistem)
 * - Leader → Follower Radar (rotation detection)
 * - AI Prediction Table (next movers)
 * - Smart Money Signals (stealth accumulation)
 * - Liquidity Flow Map
 * - Realtime Telegram alerts saat BREAKOUT_IMMINENT
 */
const NarrativeIntelligence = (() => {
    const API = 'http://127.0.0.1:3001/api/narrative/overview';
    let _data = null, _timer = null, _subTab = 'heatmap';

    // ── Styles ────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('ni-styles')) return;
        const s = document.createElement('style');
        s.id = 'ni-styles';
        s.textContent = `
/* ── Root ─────────────────────────────── */
#narrativeIntelligencePanel{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;padding:0 0 32px}
.ni-header{background:linear-gradient(135deg,#060d1f 0%,#0d1433 40%,#0a0e1a 100%);border:1px solid #1e3a5f;border-radius:16px;padding:20px 24px;margin-bottom:16px;position:relative;overflow:hidden}
.ni-header::before{content:'';position:absolute;top:-40px;right:-40px;width:200px;height:200px;background:radial-gradient(circle,rgba(139,92,246,.15) 0%,transparent 70%);pointer-events:none}
.ni-header-top{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.ni-header-badge{background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:4px 12px;border-radius:20px;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#fff}
.ni-header h2{margin:0;font-size:20px;font-weight:800;background:linear-gradient(135deg,#e2e8f0,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.ni-header-sub{font-size:12px;color:#64748b;margin-top:2px}
.ni-header-stats{display:flex;gap:16px;margin-top:12px;flex-wrap:wrap}
.ni-stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 16px;text-align:center}
.ni-stat-val{font-size:18px;font-weight:800;line-height:1}
.ni-stat-lbl{font-size:10px;color:#64748b;margin-top:3px;text-transform:uppercase;letter-spacing:.05em}

/* ── Sub-tab bar ─────────────────────────── */
.ni-tabs{display:flex;gap:4px;margin-bottom:16px;overflow-x:auto;padding-bottom:2px}
.ni-tab{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px 16px;cursor:pointer;font-size:12px;font-weight:600;color:#64748b;white-space:nowrap;transition:all .2s}
.ni-tab:hover{background:rgba(139,92,246,.15);color:#a78bfa;border-color:#7c3aed}
.ni-tab.active{background:linear-gradient(135deg,rgba(124,58,237,.3),rgba(79,70,229,.3));color:#a78bfa;border-color:#7c3aed;box-shadow:0 0 12px rgba(124,58,237,.2)}

/* ── Cards & Grid ─────────────────────────── */
.ni-section{display:none}
.ni-section.active{display:block}
.ni-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ni-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
@media(max-width:900px){.ni-grid-2,.ni-grid-3{grid-template-columns:1fr}}
.ni-card{background:#0a0e1a;border:1px solid #1e293b;border-radius:14px;overflow:hidden}
.ni-card-header{padding:12px 16px;display:flex;align-items:center;gap:8px;border-bottom:1px solid #1e293b;background:linear-gradient(135deg,#0a0e1a,#0d1b2e)}
.ni-card-header h3{margin:0;font-size:13px;font-weight:700;color:#e2e8f0;flex:1}
.ni-card-body{padding:14px 16px}

/* ── Narrative Heatmap ─────────────────────── */
.ni-heatmap{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.ni-eco-card{border-radius:12px;padding:14px;border:1px solid transparent;cursor:pointer;transition:all .25s;position:relative;overflow:hidden}
.ni-eco-card::before{content:'';position:absolute;inset:0;opacity:.06;background:var(--eco-color,#7c3aed)}
.ni-eco-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.4)}
.ni-eco-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.ni-eco-emoji{font-size:20px;width:32px;text-align:center}
.ni-eco-name{font-size:13px;font-weight:700;color:#e2e8f0;flex:1}
.ni-eco-score{font-size:20px;font-weight:900;line-height:1}
.ni-eco-bar-wrap{height:4px;background:rgba(255,255,255,.08);border-radius:2px;margin:6px 0}
.ni-eco-bar{height:100%;border-radius:2px;transition:width .6s ease}
.ni-eco-stats{display:flex;gap:8px;font-size:11px;flex-wrap:wrap}
.ni-eco-stat{padding:2px 8px;border-radius:12px;font-weight:600;background:rgba(255,255,255,.06)}
.ni-eco-signal{position:absolute;top:10px;right:10px;font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;letter-spacing:.05em;text-transform:uppercase}
.sig-BREAKOUT_IMMINENT{background:rgba(239,68,68,.2);color:#f87171;border:1px solid rgba(239,68,68,.4);animation:pulse-red 1.5s infinite}
.sig-ROTATION_ACTIVE{background:rgba(34,197,94,.2);color:#4ade80;border:1px solid rgba(34,197,94,.4)}
.sig-WARMING{background:rgba(251,146,60,.2);color:#fb923c;border:1px solid rgba(251,146,60,.4)}
.sig-COOLING{background:rgba(148,163,184,.12);color:#475569;border:1px solid rgba(148,163,184,.2)}
.sig-NEUTRAL{background:rgba(148,163,184,.08);color:#475569;border:1px solid transparent}
@keyframes pulse-red{0%,100%{box-shadow:0 0 0 rgba(239,68,68,0)}50%{box-shadow:0 0 8px rgba(239,68,68,.6)}}

/* ── Prediction Table ─────────────────────── */
.ni-pred-table{width:100%;border-collapse:collapse}
.ni-pred-table th{padding:8px 12px;text-align:left;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #1e293b;font-weight:600;background:#070b14}
.ni-pred-table td{padding:10px 12px;border-bottom:1px solid #0f172a;font-size:12px;vertical-align:middle}
.ni-pred-table tr:hover td{background:rgba(255,255,255,.025)}
.ni-pred-sym{font-weight:800;font-size:13px;color:#e2e8f0}
.ni-pred-narrative{display:inline-block;font-size:10px;padding:2px 7px;border-radius:10px;background:rgba(124,58,237,.15);color:#a78bfa;font-weight:600}
.ni-ai-bar{display:flex;align-items:center;gap:6px}
.ni-ai-bar-bg{flex:1;height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden}
.ni-ai-bar-fill{height:100%;border-radius:3px;transition:width .5s}
.ni-ai-val{font-size:12px;font-weight:800;min-width:28px;text-align:right}
.ni-pot-HIGH{color:#4ade80;font-weight:700}
.ni-pot-MEDIUM{color:#fb923c;font-weight:700}
.ni-pot-LOW{color:#475569}
.ni-entry-tp{font-size:11px;color:#64748b;line-height:1.6}
.ni-entry-tp b{color:#e2e8f0}

/* ── Smart Money ─────────────────────────── */
.ni-sm-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #0f172a}
.ni-sm-item:last-child{border-bottom:none}
.ni-sm-sym{font-size:14px;font-weight:800;min-width:60px;color:#e2e8f0}
.ni-sm-narrative{font-size:10px;color:#64748b;margin-top:1px}
.ni-sm-mid{flex:1}
.ni-sm-price{font-size:13px;color:#94a3b8}
.ni-sm-chg{font-size:12px;font-weight:700;min-width:50px;text-align:right}
.ni-sm-vol-wrap{min-width:80px;text-align:right}
.ni-sm-vol-badge{display:inline-block;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;background:rgba(139,92,246,.15);color:#a78bfa}

/* ── Liquidity Flow ─────────────────────── */
.ni-flow-item{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #0f172a}
.ni-flow-item:last-child{border-bottom:none}
.ni-flow-rank{font-size:18px;min-width:28px;text-align:center}
.ni-flow-mid{flex:1}
.ni-flow-name{font-size:13px;font-weight:700;color:#e2e8f0}
.ni-flow-tags{font-size:10px;color:#64748b;margin-top:1px}
.ni-flow-bar-wrap{width:120px}
.ni-flow-bar-bg{height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden}
.ni-flow-bar-fill{height:100%;border-radius:4px;transition:width .6s}
.ni-flow-score{font-size:18px;font-weight:900;min-width:36px;text-align:right}

/* ── Leader/Follower Radar ─────────────────── */
.ni-lf-item{border:1px solid #1e293b;border-radius:12px;padding:14px;margin-bottom:10px;background:rgba(255,255,255,.02)}
.ni-lf-leader-row{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.ni-lf-leader-sym{font-size:16px;font-weight:900;color:#e2e8f0}
.ni-lf-leader-eco{font-size:11px;color:#64748b}
.ni-lf-leader-ch{font-size:13px;font-weight:700}
.ni-lf-prob{font-size:10px;padding:3px 8px;border-radius:10px;background:rgba(34,197,94,.12);color:#4ade80;font-weight:700;margin-left:auto}
.ni-lf-followers{display:flex;flex-wrap:wrap;gap:6px}
.ni-lf-fol{padding:5px 10px;border-radius:8px;font-size:11px;font-weight:700;display:flex;align-items:center;gap:4px;border:1px solid transparent}
.ni-lf-fol-HIGH{background:rgba(34,197,94,.12);color:#4ade80;border-color:rgba(34,197,94,.3)}
.ni-lf-fol-MEDIUM{background:rgba(251,146,60,.1);color:#fb923c;border-color:rgba(251,146,60,.3)}
.ni-lf-fol-LOW{background:rgba(71,85,105,.12);color:#475569;border-color:transparent}
.ni-lf-lag{font-size:9px;opacity:.7}

/* ── Loading / Empty ─────────────────────── */
.ni-loading{padding:40px;text-align:center;color:#475569;font-size:13px}
.ni-loading-spinner{display:inline-block;width:24px;height:24px;border:2px solid #1e293b;border-top-color:#7c3aed;border-radius:50%;animation:ni-spin .8s linear infinite;margin-bottom:10px}
@keyframes ni-spin{to{transform:rotate(360deg)}}
.ni-alert-banner{border-radius:12px;padding:14px 18px;margin-bottom:12px;display:flex;align-items:center;gap:12px;border:1px solid}
.ni-alert-breakout{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.3);color:#fca5a5}
.ni-alert-breakout .ni-alert-icon{font-size:20px}
.ni-refresh-btn{background:rgba(124,58,237,.2);border:1px solid rgba(124,58,237,.4);color:#a78bfa;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px;font-weight:600;transition:all .2s}
.ni-refresh-btn:hover{background:rgba(124,58,237,.35)}
.ni-last-update{font-size:10px;color:#475569;text-align:right;margin-bottom:8px}
`;
        document.head.appendChild(s);
    }

    // ── Helpers ────────────────────────────────────────────────
    const fmtPrice = p => {
        if (!p) return '–';
        return p < 0.001 ? p.toFixed(6) : p < 0.01 ? p.toFixed(5) : p < 1 ? p.toFixed(4) : p < 100 ? p.toFixed(3) : p.toFixed(2);
    };
    const fmtChg = v => v >= 0 ? `+${v}%` : `${v}%`;
    const chgColor = v => v >= 3 ? '#4ade80' : v >= 0 ? '#86efac' : v >= -3 ? '#f87171' : '#ef4444';
    const aiColor  = s => s >= 75 ? '#4ade80' : s >= 50 ? '#fb923c' : s >= 30 ? '#eab308' : '#475569';
    const scoreColor = s => s >= 70 ? '#4ade80' : s >= 45 ? '#fb923c' : s >= 20 ? '#eab308' : '#475569';
    const fmtVol   = v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : `$${(v/1e3).toFixed(0)}K`;

    // ── Sub-tab switch ──────────────────────────────────────────
    function switchSubTab(tab) {
        _subTab = tab;
        document.querySelectorAll('.ni-tab').forEach(el => {
            el.classList.toggle('active', el.dataset.niTab === tab);
        });
        document.querySelectorAll('.ni-section').forEach(el => {
            el.classList.toggle('active', el.dataset.niSection === tab);
        });
    }

    // ── Render Functions ────────────────────────────────────────

    function renderHeader(d) {
        const bo = d.breakoutImminent?.length ?? 0;
        const topN = d.topNarrative;
        return `
        <div class="ni-header">
            <div class="ni-header-top">
                <span class="ni-header-badge">🧠 AI Narrative Intelligence</span>
                <button class="ni-refresh-btn" onclick="NarrativeIntelligence.refresh(true)">⟳ Refresh</button>
            </div>
            <h2>Find the Next Mover Before Retail Enters</h2>
            <div class="ni-header-sub">Narrative rotation · Ecosystem momentum · Leader/Follower radar · Smart money detection</div>
            <div class="ni-header-stats">
                <div class="ni-stat">
                    <div class="ni-stat-val" style="color:#a78bfa">${d.narratives?.length ?? 0}</div>
                    <div class="ni-stat-lbl">Narratives Tracked</div>
                </div>
                <div class="ni-stat">
                    <div class="ni-stat-val" style="color:${bo > 0 ? '#f87171' : '#4ade80'}">${bo}</div>
                    <div class="ni-stat-lbl">Breakout Imminent</div>
                </div>
                <div class="ni-stat">
                    <div class="ni-stat-val" style="color:#fb923c">${d.predictions?.length ?? 0}</div>
                    <div class="ni-stat-lbl">AI Predictions</div>
                </div>
                <div class="ni-stat">
                    <div class="ni-stat-val" style="color:#4ade80">${d.smartMoneySignals?.length ?? 0}</div>
                    <div class="ni-stat-lbl">Smart Money Signals</div>
                </div>
                ${topN ? `<div class="ni-stat">
                    <div class="ni-stat-val" style="color:${scoreColor(topN.score)}">${topN.emoji} ${topN.name.split('/')[0].trim()}</div>
                    <div class="ni-stat-lbl">Top Narrative</div>
                </div>` : ''}
            </div>
        </div>`;
    }

    function renderBreakoutBanners(d) {
        if (!d.breakoutImminent?.length) return '';
        return d.breakoutImminent.map(n =>
            `<div class="ni-alert-banner ni-alert-breakout">
                <span class="ni-alert-icon">🚨</span>
                <div style="flex:1">
                    <strong>${n.emoji} ${n.name} — BREAKOUT IMMINENT</strong><br>
                    <span style="font-size:12px">${n.leader.symbol} +${n.leader.ch1h}% (1h) tapi followers belum pump. Window entry terbuka!</span>
                </div>
                <span style="font-size:11px;opacity:.6">Score: ${n.score}</span>
            </div>`
        ).join('');
    }

    function renderHeatmap(narratives) {
        return `<div class="ni-heatmap">
            ${narratives.map(n => {
                const barW = Math.min(100, n.score);
                const c = n.color || '#7c3aed';
                return `<div class="ni-eco-card" style="--eco-color:${c};background:linear-gradient(135deg,rgba(0,0,0,.6),rgba(0,0,0,.4));border-color:${c}30"
                    onclick="NarrativeIntelligence._showEco('${n.id}')">
                    <span class="ni-eco-signal sig-${n.rotationSignal}">${
                        n.rotationSignal === 'BREAKOUT_IMMINENT' ? '🚨 BREAKOUT' :
                        n.rotationSignal === 'ROTATION_ACTIVE'   ? '🔥 ACTIVE'  :
                        n.rotationSignal === 'WARMING'           ? '📈 WARMING' :
                        n.rotationSignal === 'COOLING'           ? '❄️ COOLING' : '—'
                    }</span>
                    <div class="ni-eco-header">
                        <span class="ni-eco-emoji">${n.emoji}</span>
                        <div style="flex:1">
                            <div class="ni-eco-name">${n.name}</div>
                            <div style="font-size:10px;color:#475569">${n.leader.symbol}</div>
                        </div>
                        <div class="ni-eco-score" style="color:${scoreColor(n.score)}">${n.score}</div>
                    </div>
                    <div class="ni-eco-bar-wrap"><div class="ni-eco-bar" style="width:${barW}%;background:${c}"></div></div>
                    <div class="ni-eco-stats">
                        <span class="ni-eco-stat" style="color:${chgColor(n.leader.ch24h)}">${fmtChg(n.leader.ch24h)} 24h</span>
                        <span class="ni-eco-stat" style="color:${chgColor(n.leader.ch1h)}">${fmtChg(n.leader.ch1h)} 1h</span>
                        <span class="ni-eco-stat" style="color:#94a3b8">Followers: ${n.followerMomentum >= 0 ? '+' : ''}${n.followerMomentum}%</span>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    }

    function renderPredictions(predictions) {
        if (!predictions?.length) return '<div class="ni-loading">Tidak ada prediksi saat ini — tunggu leader coins pump dulu.</div>';
        return `<div style="overflow-x:auto">
        <table class="ni-pred-table">
            <thead><tr>
                <th>#</th><th>Token</th><th>Narrative</th><th>Leader Signal</th>
                <th>Lag Score</th><th>AI Score</th><th>Entry / TP / SL</th><th>~Lag</th>
            </tr></thead>
            <tbody>
            ${predictions.map((p, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
                return `<tr>
                    <td>${medal}</td>
                    <td>
                        <div class="ni-pred-sym">${p.symbol}</div>
                        <div style="font-size:10px;color:#475569">$${fmtPrice(p.price)}</div>
                        <div style="font-size:10px;color:${chgColor(p.ch24h)}">${fmtChg(p.ch24h)} 24h</div>
                    </td>
                    <td><span class="ni-pred-narrative">${p.narrativeEmoji} ${p.narrative}</span></td>
                    <td>
                        <div style="font-size:12px;font-weight:700;color:#a78bfa">${p.leaderSymbol}</div>
                        <div style="font-size:11px;color:${chgColor(p.leaderCh1h)}">${fmtChg(p.leaderCh1h)} 1h</div>
                        <div style="font-size:11px;color:${chgColor(p.leaderCh24h)}">${fmtChg(p.leaderCh24h)} 24h</div>
                    </td>
                    <td>
                        <span class="ni-pot-${p.potential}" title="Leader pump ${p.lagScore}% lebih tinggi dari follower">
                            +${p.lagScore}% lag
                        </span>
                    </td>
                    <td>
                        <div class="ni-ai-bar">
                            <div class="ni-ai-bar-bg"><div class="ni-ai-bar-fill" style="width:${p.aiScore}%;background:${aiColor(p.aiScore)}"></div></div>
                            <div class="ni-ai-val" style="color:${aiColor(p.aiScore)}">${p.aiScore}</div>
                        </div>
                    </td>
                    <td class="ni-entry-tp">
                        📈 Entry: <b>$${fmtPrice(p.entry)}</b><br>
                        🎯 TP1: $${fmtPrice(p.tp1)} <span style="color:#4ade80">(+10%)</span><br>
                        🎯 TP2: $${fmtPrice(p.tp2)} <span style="color:#22c55e">(+22%)</span><br>
                        🛑 SL: $${fmtPrice(p.sl)} <span style="color:#f87171">(-6%)</span>
                    </td>
                    <td style="color:#94a3b8;font-size:11px">~${p.avgLagHours}h</td>
                </tr>`;
            }).join('')}
            </tbody>
        </table></div>`;
    }

    function renderSmartMoney(signals) {
        if (!signals?.length) return '<div class="ni-loading">Tidak ada sinyal smart money terdeteksi saat ini.</div>';
        return signals.map(s => `
            <div class="ni-sm-item">
                <div>
                    <div class="ni-sm-sym">${s.symbol}</div>
                    <div class="ni-sm-narrative">${s.narrative}</div>
                </div>
                <div class="ni-sm-mid">
                    <div class="ni-sm-price">$${fmtPrice(s.price)}</div>
                    <div style="font-size:10px;color:#64748b">Vol: ${fmtVol(s.volume)}</div>
                </div>
                <div style="text-align:right">
                    <div class="ni-sm-chg" style="color:${chgColor(s.ch24h)}">${fmtChg(s.ch24h)}</div>
                    <div style="font-size:10px;color:#64748b">${s.ch1h >= 0 ? '+' : ''}${s.ch1h}% 1h</div>
                </div>
                <div class="ni-sm-vol-wrap">
                    <div class="ni-sm-vol-badge">Vol/MCap: ${s.volMcRatio}%</div>
                    <div style="font-size:9px;color:#475569;margin-top:3px;text-align:center">STEALTH</div>
                </div>
            </div>`
        ).join('');
    }

    function renderLiquidityFlow(flows) {
        const max = flows[0]?.score || 100;
        const ranks = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
        return flows.map((f, i) => `
            <div class="ni-flow-item">
                <div class="ni-flow-rank">${ranks[i] || (i+1)}</div>
                <div class="ni-flow-mid">
                    <div class="ni-flow-name">${f.emoji} ${f.name}</div>
                    <div class="ni-flow-tags">
                        <span style="color:${chgColor(f.leaderCh24h)}">${fmtChg(f.leaderCh24h)} leader</span>
                        · <span style="color:${chgColor(f.followerMomentum)}">${fmtChg(f.followerMomentum)} followers</span>
                        · <span class="sig-${f.rotationSignal}" style="font-size:9px;padding:1px 5px;border-radius:6px">${f.rotationSignal.replace('_',' ')}</span>
                    </div>
                </div>
                <div class="ni-flow-bar-wrap">
                    <div class="ni-flow-bar-bg"><div class="ni-flow-bar-fill" style="width:${(f.score/max*100).toFixed(0)}%;background:${f.color || '#7c3aed'}"></div></div>
                    <div style="font-size:10px;color:#475569;margin-top:2px;text-align:right">Vol/MCap: ${f.leaderVolMc}%</div>
                </div>
                <div class="ni-flow-score" style="color:${scoreColor(f.score)}">${f.score}</div>
            </div>`
        ).join('');
    }

    function renderLeaderFollower(narratives) {
        return narratives.filter(n => n.leader.ch1h > 1 || n.leader.ch24h > 2 || n.score > 20).map(n => {
            const topFollowers = n.followers.slice(0, 8);
            return `<div class="ni-lf-item">
                <div class="ni-lf-leader-row">
                    <span style="font-size:18px">${n.emoji}</span>
                    <div>
                        <div class="ni-lf-leader-sym">${n.leader.symbol}</div>
                        <div class="ni-lf-leader-eco">${n.name}</div>
                    </div>
                    <span class="ni-lf-leader-ch" style="color:${chgColor(n.leader.ch1h)}">${fmtChg(n.leader.ch1h)} 1h</span>
                    <span class="ni-lf-leader-ch" style="color:${chgColor(n.leader.ch24h)};margin-left:4px">${fmtChg(n.leader.ch24h)} 24h</span>
                    <span class="ni-lf-prob">${n.followProbability}% follow prob</span>
                </div>
                <div style="font-size:10px;color:#475569;margin-bottom:8px">
                    ⏱ Avg lag: ~${n.avgLagHours}h · 💡 ${n.desc}
                </div>
                <div class="ni-lf-followers">
                    ${topFollowers.map(f => `
                        <div class="ni-lf-fol ni-lf-fol-${f.potential}" title="Lag: +${f.lagScore}% | ${f.ch24h}% 24h">
                            <span>${f.symbol}</span>
                            <span style="color:${chgColor(f.ch24h)}">${fmtChg(f.ch24h)}</span>
                            ${f.potential === 'HIGH' ? '<span class="ni-lf-lag">⚡</span>' : ''}
                        </div>`
                    ).join('')}
                </div>
            </div>`;
        }).join('') || '<div class="ni-loading">Tidak ada leader yang aktif bergerak saat ini.</div>';
    }

    // ── Main render ─────────────────────────────────────────────
    function render(d) {
        _data = d;
        const el = document.getElementById('narrativeIntelligencePanel');
        if (!el) return;
        const ts = d.fetchedAt ? new Date(d.fetchedAt).toLocaleString('id-ID') : '—';

        el.innerHTML = `
        ${renderHeader(d)}
        ${renderBreakoutBanners(d)}
        <div class="ni-last-update">⏱ Update: ${ts} · ${d.totalCoins} coins · <span style="color:${d.cached ? '#475569' : '#4ade80'}">${d.cached ? 'cached' : 'fresh'}</span></div>
        <div class="ni-tabs">
            <button class="ni-tab ${_subTab==='heatmap'?'active':''}" data-ni-tab="heatmap" onclick="NarrativeIntelligence._tab('heatmap')">🌡️ Narrative Heatmap</button>
            <button class="ni-tab ${_subTab==='predictions'?'active':''}" data-ni-tab="predictions" onclick="NarrativeIntelligence._tab('predictions')">🤖 AI Predictions</button>
            <button class="ni-tab ${_subTab==='lf-radar'?'active':''}" data-ni-tab="lf-radar" onclick="NarrativeIntelligence._tab('lf-radar')">📡 Leader/Follower Radar</button>
            <button class="ni-tab ${_subTab==='liquidity'?'active':''}" data-ni-tab="liquidity" onclick="NarrativeIntelligence._tab('liquidity')">💰 Liquidity Flow</button>
            <button class="ni-tab ${_subTab==='smart-money'?'active':''}" data-ni-tab="smart-money" onclick="NarrativeIntelligence._tab('smart-money')">🐋 Smart Money</button>
        </div>

        <!-- 🌡️ Heatmap -->
        <div class="ni-section ${_subTab==='heatmap'?'active':''}" data-ni-section="heatmap">
            <div class="ni-card">
                <div class="ni-card-header">
                    <h3>🌡️ Narrative Momentum Heatmap</h3>
                    <span style="font-size:11px;color:#475569">Score = AI signal strength 0–100</span>
                </div>
                <div class="ni-card-body">${renderHeatmap(d.narratives || [])}</div>
            </div>
        </div>

        <!-- 🤖 Predictions -->
        <div class="ni-section ${_subTab==='predictions'?'active':''}" data-ni-section="predictions">
            <div class="ni-card">
                <div class="ni-card-header">
                    <h3>🤖 AI Predicted Next Movers</h3>
                    <span style="font-size:11px;color:#475569">Leader sudah pump, follower belum ikut = window entry</span>
                </div>
                <div class="ni-card-body">${renderPredictions(d.predictions)}</div>
            </div>
        </div>

        <!-- 📡 Leader/Follower Radar -->
        <div class="ni-section ${_subTab==='lf-radar'?'active':''}" data-ni-section="lf-radar">
            <div class="ni-card">
                <div class="ni-card-header">
                    <h3>📡 Leader → Follower Radar</h3>
                    <span style="font-size:11px;color:#475569">⚡ = high potential (belum ikut leader)</span>
                </div>
                <div class="ni-card-body">${renderLeaderFollower(d.narratives || [])}</div>
            </div>
        </div>

        <!-- 💰 Liquidity Flow -->
        <div class="ni-section ${_subTab==='liquidity'?'active':''}" data-ni-section="liquidity">
            <div class="ni-card">
                <div class="ni-card-header">
                    <h3>💰 Liquidity Rotation Map</h3>
                    <span style="font-size:11px;color:#475569">Narrative mana yang sedang dapat inflow terbesar</span>
                </div>
                <div class="ni-card-body">${renderLiquidityFlow(d.liquidityFlow || [])}</div>
            </div>
        </div>

        <!-- 🐋 Smart Money -->
        <div class="ni-section ${_subTab==='smart-money'?'active':''}" data-ni-section="smart-money">
            <div class="ni-card">
                <div class="ni-card-header">
                    <h3>🐋 Smart Money — Stealth Accumulation</h3>
                    <span style="font-size:11px;color:#475569">Vol/MCap tinggi tapi harga flat = big buyer akumulasi diam-diam</span>
                </div>
                <div class="ni-card-body">${renderSmartMoney(d.smartMoneySignals)}</div>
            </div>
        </div>`;
    }

    function renderLoading() {
        const el = document.getElementById('narrativeIntelligencePanel');
        if (!el) return;
        el.innerHTML = `<div class="ni-loading">
            <div class="ni-loading-spinner"></div>
            <div>Loading Narrative Intelligence…</div>
            <div style="font-size:11px;margin-top:6px">Fetching ${Object.keys({}).length} narratives from CoinGecko…</div>
        </div>`;
    }

    // ── Public API ──────────────────────────────────────────────
    async function refresh(force = false) {
        if (!_data) renderLoading();
        try {
            const url = force ? `${API}?refresh=1` : API;
            const r = await fetch(url);
            const d = await r.json();
            if (d.ok) render(d);
            else {
                const el = document.getElementById('narrativeIntelligencePanel');
                if (el) el.innerHTML = `<div class="ni-loading" style="color:#f87171">⚠️ Error: ${d.error || 'Gagal fetch data'}</div>`;
            }
        } catch (e) {
            const el = document.getElementById('narrativeIntelligencePanel');
            if (el) el.innerHTML = `<div class="ni-loading" style="color:#f87171">⚠️ Proxy offline: ${e.message}</div>`;
        }
    }

    function init() {
        injectStyles();
        refresh();
        if (_timer) clearInterval(_timer);
        _timer = setInterval(() => refresh(false), 3 * 60_000); // auto refresh 3 menit
    }

    return {
        init,
        refresh: (force) => refresh(force === true),
        _tab: switchSubTab,
        _showEco: (id) => {
            // Show leader/follower detail for clicked ecosystem
            if (_data) {
                const n = _data.narratives?.find(x => x.id === id);
                if (n) { _subTab = 'lf-radar'; refresh(false).then(() => {}); switchSubTab('lf-radar'); }
            }
        },
    };
})();
