// ─── AI Daily Brief ──────────────────────────────────────────────────────────
// Fetches /api/ai-brief → renders full-width panel on the home tab.
// Auto-refreshes every 15 minutes.

(function() {
    let _briefTimer = null;

    // Called when home tab becomes active (or on first load)
    window.loadAIDailyBrief = async function(silent = false) {
        const panel = document.getElementById('aiDailyBriefPanel');
        if (!panel) return;

        if (!silent) {
            panel.innerHTML = `
                <div style="background:linear-gradient(135deg,#0f172a 0%,#0d1f35 100%);border:1px solid #1e3a5f;border-radius:16px;padding:16px 22px;color:#475569;font-size:12px;display:flex;align-items:center;gap:10px;">
                    <span style="font-size:18px;animation:spin 1s linear infinite;display:inline-block;">⏳</span>
                    <span>Menganalisa pasar dan berita terkini…</span>
                </div>`;
        }

        let data;
        try {
            const r = await fetch('http://127.0.0.1:3001/api/ai-brief');
            data = await r.json();
        } catch(e) {
            if (!silent) panel.innerHTML = `<div style="background:#0f172a;border:1px solid #ef444430;border-radius:16px;padding:14px 20px;color:#ef4444;font-size:12px;">⚠ AI Brief gagal memuat: ${e.message} <button onclick="loadAIDailyBrief()" style="margin-left:12px;background:#1e293b;border:1px solid #334155;color:#38bdf8;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px;">↺ Retry</button></div>`;
            return;
        }

        if (!data.ok) return;
        _renderBrief(panel, data);

        // Auto-refresh every 15 min
        if (_briefTimer) clearInterval(_briefTimer);
        _briefTimer = setInterval(() => window.loadAIDailyBrief(true), 15 * 60_000);
    };

    function _macroLabel(sym) {
        const map = { '^GSPC':'S&P 500','^IXIC':'NASDAQ','^JKSE':'IHSG','BTC-USD':'BTC','GC=F':'Gold','CL=F':'Oil','EURUSD=X':'EUR/USD' };
        return map[sym] || sym;
    }

    function _fmtPrice(sym, price) {
        if (sym === 'BTC-USD') return '$' + Number(price).toLocaleString('en-US', { maximumFractionDigits:0 });
        if (sym === '^JKSE')   return Number(price).toLocaleString('id-ID', { maximumFractionDigits:0 });
        if (sym === 'EURUSD=X') return price.toFixed(4);
        return '$' + Number(price).toLocaleString('en-US', { maximumFractionDigits:2 });
    }

    function _renderBrief(panel, d) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
        const dateStr = now.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

        // Fear & Greed meter
        const fngVal = d.fngValue ? parseInt(d.fngValue) : null;
        const fngColor = fngVal === null ? '#64748b' : fngVal >= 75 ? '#ef4444' : fngVal >= 55 ? '#f59e0b' : fngVal >= 45 ? '#a3e635' : fngVal >= 25 ? '#22c55e' : '#38bdf8';
        const fngAngle = fngVal !== null ? (fngVal / 100 * 180) : 90; // 0=180deg(left), 100=0deg(right)

        // Sentiment bar
        const total = (d.bull || 0) + (d.bear || 0) || 1;
        const bullPct = Math.round((d.bull / total) * 100);
        const bearPct = 100 - bullPct;
        const sentColor = bullPct >= 60 ? '#22c55e' : bullPct <= 40 ? '#ef4444' : '#f59e0b';

        // Macro ticker pills
        const macroPills = Object.entries(d.macro || {}).map(([sym, v]) => {
            if (!v || v.price == null) return '';
            const up = v.chg >= 0;
            const color = up ? '#22c55e' : '#ef4444';
            const arrow = up ? '▲' : '▼';
            return `<div style="background:#1e293b;border:1px solid ${color}30;border-radius:10px;padding:5px 12px;display:flex;flex-direction:column;align-items:center;min-width:80px;">
                <span style="color:#64748b;font-size:9px;font-weight:600;letter-spacing:.5px;">${_macroLabel(sym)}</span>
                <span style="color:#e2e8f0;font-size:12px;font-weight:700;">${_fmtPrice(sym, v.price)}</span>
                <span style="color:${color};font-size:11px;font-weight:600;">${arrow} ${up?'+':''}${v.chg}%</span>
            </div>`;
        }).join('');

        // Recommendation cards
        const recTypeStyle = {
            buy:     { bg:'#052e1630', border:'#22c55e40', accent:'#22c55e', badge:'BUY SIGNAL' },
            caution: { bg:'#431a0530', border:'#f59e0b40', accent:'#f59e0b', badge:'CAUTION'    },
            info:    { bg:'#1e1b4b30', border:'#6366f140', accent:'#6366f1', badge:'INFO'       },
            hot:     { bg:'#450a0a30', border:'#ef444440', accent:'#ef4444', badge:'HOT SECTOR' },
            tip:     { bg:'#0f2a1a30', border:'#34d39940', accent:'#34d399', badge:'TIPS'       },
        };

        const recCards = (d.recommendations || []).map(rec => {
            const st = recTypeStyle[rec.type] || recTypeStyle.info;
            return `<div style="background:${st.bg};border:1px solid ${st.border};border-radius:12px;padding:12px 16px;display:flex;gap:12px;align-items:flex-start;">
                <span style="font-size:20px;line-height:1.2;">${rec.icon}</span>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="background:${st.accent}22;color:${st.accent};border:1px solid ${st.accent}44;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;letter-spacing:.5px;">${st.badge}</span>
                        <span style="color:#94a3b8;font-size:10px;">${rec.market}</span>
                    </div>
                    <div style="color:#cbd5e1;font-size:12px;line-height:1.5;">${rec.text}</div>
                </div>
            </div>`;
        }).join('');

        // Headlines
        const headlines = (d.sampleHeadlines || []).map(h =>
            `<div style="color:#94a3b8;font-size:11px;padding:4px 0;border-bottom:1px solid #1e293b;">• ${h}</div>`
        ).join('');

        // Hot sectors badges
        const hotBadges = (d.hotSectors || []).slice(0,5).map(s =>
            `<span style="background:#f59e0b22;color:#f59e0b;border:1px solid #f59e0b40;padding:2px 10px;border-radius:12px;font-size:10px;font-weight:600;">${s.sector} <span style="opacity:.6">${s.mentions}x</span></span>`
        ).join('');

        // Gauge SVG (semicircle)
        const gaugePath = `M 10 60 A 50 50 0 0 1 90 60`;
        const needleRad = ((180 - fngAngle) * Math.PI) / 180;
        const nx = 50 + 38 * Math.cos(needleRad);
        const ny = 60 - 38 * Math.sin(needleRad);

        panel.innerHTML = `
        <div style="background:linear-gradient(135deg,#0a0f1e 0%,#0d1b2e 100%);border:1px solid #1e3a5f;border-radius:18px;padding:18px 22px;overflow:hidden;">

            <!-- Header row -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="background:linear-gradient(135deg,#6366f1,#38bdf8);border-radius:10px;padding:6px 10px;font-size:16px;">🤖</div>
                    <div>
                        <div style="color:#e2e8f0;font-size:15px;font-weight:700;">AI Daily Brief</div>
                        <div style="color:#475569;font-size:11px;">${dateStr} · Diperbarui ${timeStr} ${d.cached ? '(cached)' : '(live)'}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <!-- Fear & Greed badge -->
                    ${fngVal !== null ? `<div style="background:#1e293b;border:1px solid ${fngColor}40;border-radius:12px;padding:6px 14px;text-align:center;">
                        <div style="color:#64748b;font-size:9px;font-weight:600;letter-spacing:.5px;">FEAR & GREED</div>
                        <div style="color:${fngColor};font-size:20px;font-weight:800;line-height:1.1;">${fngVal}</div>
                        <div style="color:${fngColor};font-size:9px;">${d.fngLabel || ''}</div>
                    </div>` : ''}
                    <!-- Sentiment -->
                    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:6px 14px;min-width:100px;">
                        <div style="color:#64748b;font-size:9px;font-weight:600;letter-spacing:.5px;margin-bottom:4px;">NEWS SENTIMENT</div>
                        <div style="background:#0f172a;border-radius:6px;height:8px;overflow:hidden;margin-bottom:3px;">
                            <div style="width:${bullPct}%;height:100%;background:linear-gradient(90deg,#22c55e,#86efac);border-radius:6px;transition:width .5s;"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:#22c55e;font-size:10px;">🐂 ${d.bull || 0}</span>
                            <span style="color:${sentColor};font-size:10px;font-weight:700;">${bullPct}% Bull</span>
                            <span style="color:#ef4444;font-size:10px;">🐻 ${d.bear || 0}</span>
                        </div>
                    </div>
                    <button onclick="loadAIDailyBrief()" style="background:#1e293b;border:1px solid #334155;color:#6366f1;padding:7px 14px;border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;">↺ Refresh</button>
                </div>
            </div>

            <!-- Macro ticker strip -->
            <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;margin-bottom:16px;scrollbar-width:none;">
                ${macroPills}
            </div>

            <!-- Hot sectors -->
            ${hotBadges ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
                <span style="color:#475569;font-size:10px;font-weight:600;">🔥 TRENDING:</span>
                ${hotBadges}
                <span style="color:#475569;font-size:10px;">dari ${d.newsCount || 0} berita</span>
            </div>` : ''}

            <!-- Main grid: recs + headlines -->
            <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;">

                <!-- Left: Recommendations -->
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <div style="color:#64748b;font-size:10px;font-weight:600;letter-spacing:.5px;margin-bottom:2px;">📊 ANALISA & REKOMENDASI HARI INI</div>
                    ${recCards || '<div style="color:#475569;font-size:12px;">Tidak ada rekomendasi saat ini.</div>'}
                </div>

                <!-- Right: Headlines + mood -->
                <div>
                    <div style="color:#64748b;font-size:10px;font-weight:600;letter-spacing:.5px;margin-bottom:8px;">📰 HEADLINE TERKINI</div>
                    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:10px 14px;max-height:280px;overflow-y:auto;">
                        ${headlines || '<div style="color:#475569;font-size:11px;">Tidak ada berita terbaru.</div>'}
                    </div>
                    <div style="margin-top:10px;background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:10px 14px;">
                        <div style="color:#475569;font-size:10px;margin-bottom:6px;">⚠️ DISCLAIMER</div>
                        <div style="color:#334155;font-size:10px;line-height:1.5;">Analisa ini bersifat informatif berdasarkan data publik (RSS news, Yahoo Finance, Fear&Greed Index). <strong style="color:#475569;">Bukan saran investasi.</strong> Selalu lakukan riset sendiri (DYOR) sebelum trading.</div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    // Auto-load when home tab is visible
    document.addEventListener('DOMContentLoaded', () => {
        // Load immediately if home tab is active
        setTimeout(() => {
            if (document.getElementById('home')?.classList.contains('active') ||
                document.getElementById('aiDailyBriefPanel')) {
                window.loadAIDailyBrief();
            }
        }, 800);

        // Hook into tab switching
        document.querySelectorAll('[data-tab="home"], [onclick*="home"]').forEach(btn => {
            btn.addEventListener('click', () => {
                setTimeout(() => window.loadAIDailyBrief(true), 200);
            });
        });
    });
})();
