// ══════════════════════════════════════════════════════════════════════════════
//  dex-forensics.js
//  Feed Token Live (phase filter) + Full Token Forensics Panel
//  APE Meter | Risk Cards | Top Holder | LP Pool | AI Summary
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   CSS STYLES
───────────────────────────────────────────────────────────────────────────── */
(function injectStyles() {
    if (document.getElementById('dxf-styles')) return;
    const s = document.createElement('style');
    s.id = 'dxf-styles';
    s.textContent = `
/* ── Should I Ape? verdict card ──────────────────────────────── */
.dxf-verdict-card {
    border-radius:14px; padding:20px 24px; margin-bottom:16px;
    display:flex; align-items:center; gap:20px; position:relative; overflow:hidden;
}
.dxf-verdict-card::before {
    content:''; position:absolute; inset:0;
    background:linear-gradient(135deg, rgba(255,255,255,.03) 0%, transparent 60%);
}
.dxf-verdict-icon { font-size:44px; line-height:1; flex-shrink:0; }
.dxf-verdict-label {
    font-size:9px; font-weight:700; letter-spacing:.15em; text-transform:uppercase;
    opacity:.7; margin-bottom:4px;
}
.dxf-verdict-text { font-size:32px; font-weight:900; line-height:1.1; }
.dxf-verdict-sub   { font-size:11px; opacity:.75; margin-top:6px; line-height:1.5; }
.dxf-verdict-reasons { margin-top:10px; display:flex; flex-direction:column; gap:4px; }
.dxf-verdict-reason  { font-size:11px; display:flex; align-items:flex-start; gap:6px; opacity:.8; }

/* ── Phase filter buttons ─────────────────────────────────────── */
.dxa-phase-btn {
    padding:5px 12px; border-radius:20px; border:1px solid #1e3a5f;
    background:#0a1628; color:#64748b; font-size:11px; font-weight:700;
    cursor:pointer; transition:all .15s; display:inline-flex; align-items:center; gap:5px;
}
.dxa-phase-btn span { background:#0f172a; border-radius:10px; padding:1px 6px; font-size:10px; }
.dxa-phase-btn:hover { background:#0f2040; color:#94a3b8; }
.dxa-phase-btn.active { background:#1e3a5f; color:#e2e8f0; border-color:#3b82f6; }
.dxa-phase-btn.new    { border-color:#22c55e; }
.dxa-phase-btn.new.active { background:#14532d; color:#86efac; }
.dxa-phase-btn.early  { border-color:#f59e0b; }
.dxa-phase-btn.early.active { background:#422006; color:#fcd34d; }
.dxa-phase-btn.soon   { border-color:#a78bfa; }
.dxa-phase-btn.soon.active  { background:#2e1065; color:#c4b5fd; }
.dxa-phase-btn.migrated { border-color:#06b6d4; }
.dxa-phase-btn.migrated.active { background:#083344; color:#67e8f9; }
.dxa-phase-btn.dead   { border-color:#ef4444; }
.dxa-phase-btn.dead.active { background:#450a0a; color:#fca5a5; }

/* ── Feed table rows ───────────────────────────────────────────── */
.dxf-row { border-bottom:1px solid #06101e; transition:background .12s; cursor:pointer; }
.dxf-row:hover { background:#07111f; }
.dxf-phase-badge {
    display:inline-block; padding:2px 8px; border-radius:12px;
    font-size:10px; font-weight:700; text-transform:uppercase;
}
.dxf-entry-pill {
    display:inline-block; padding:3px 10px; border-radius:12px;
    font-size:10px; font-weight:700; background:#14532d; color:#4ade80;
    border:1px solid #22c55e;
}
.dxf-scan-btn {
    padding:4px 12px; border-radius:8px; border:1px solid #1e3a5f;
    background:#0a1628; color:#60a5fa; font-size:11px; font-weight:700;
    cursor:pointer; white-space:nowrap;
}
.dxf-scan-btn:hover { background:#1e3a5f; }

/* ── APE Meter ─────────────────────────────────────────────────── */
.dxf-ape-wrap {
    display:flex; align-items:center; gap:20px;
    background:#060c18; border:1px solid #1e293b; border-radius:12px; padding:16px;
    margin-bottom:12px;
}
.dxf-ape-gauge { position:relative; width:120px; height:70px; flex-shrink:0; }
.dxf-ape-gauge canvas { display:block; }
.dxf-ape-score {
    position:absolute; bottom:0; left:50%; transform:translateX(-50%);
    font-size:26px; font-weight:900; line-height:1;
}
.dxf-ape-label { font-size:9px; color:#64748b; text-transform:uppercase; letter-spacing:.1em; text-align:center; margin-top:2px; }
.dxf-ape-zone {
    display:inline-block; padding:3px 12px; border-radius:20px;
    font-size:11px; font-weight:700; margin-top:6px;
}
.dxf-ape-info { flex:1; min-width:0; }
.dxf-ape-name { font-size:18px; font-weight:800; color:#e2e8f0; }
.dxf-ape-sym  { font-size:13px; color:#64748b; margin-left:6px; }
.dxf-ape-addr { font-size:10px; color:#334155; font-family:monospace; margin-top:2px; word-break:break-all; }
.dxf-ape-ai   { font-size:12px; color:#94a3b8; line-height:1.5; margin-top:8px; border-left:2px solid #22c55e; padding-left:10px; }

/* ── KPI grid ──────────────────────────────────────────────────── */
.dxf-kpi-grid {
    display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr));
    gap:8px; margin-bottom:14px;
}
.dxf-kpi {
    background:#060c18; border:1px solid #1e293b; border-radius:10px; padding:10px 12px;
}
.dxf-kpi-label { font-size:9px; color:#475569; text-transform:uppercase; letter-spacing:.08em; margin-bottom:4px; display:flex; align-items:center; gap:4px; }
.dxf-kpi-val   { font-size:16px; font-weight:800; color:#e2e8f0; }
.dxf-kpi-sub   { font-size:10px; color:#64748b; margin-top:2px; }

/* ── Risk cards ────────────────────────────────────────────────── */
.dxf-risk-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; margin-bottom:16px; }
.dxf-risk-card {
    background:#060c18; border:1px solid #1e293b; border-radius:10px; padding:12px 14px;
    position:relative; overflow:hidden;
}
.dxf-risk-card.AMAN    { border-color:#166534; }
.dxf-risk-card.WASPADA { border-color:#854d0e; }
.dxf-risk-card.GAGAL   { border-color:#7f1d1d; }
.dxf-risk-status {
    font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
    display:flex; align-items:center; gap:4px; margin-bottom:5px;
}
.dxf-risk-status.AMAN    { color:#4ade80; }
.dxf-risk-status.WASPADA { color:#fbbf24; }
.dxf-risk-status.GAGAL   { color:#f87171; }
.dxf-risk-title { font-size:13px; font-weight:700; color:#e2e8f0; margin-bottom:4px; }
.dxf-risk-desc  { font-size:11px; color:#64748b; line-height:1.4; }

/* ── Top holder ────────────────────────────────────────────────── */
.dxf-holder-row {
    display:grid; grid-template-columns:24px 1fr 70px 60px 1fr;
    gap:8px; padding:8px 10px; border-bottom:1px solid #060c18;
    align-items:center; font-size:11px;
}
.dxf-holder-row:hover { background:#06101e; }
.dxf-holder-score {
    width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    font-size:11px; font-weight:800; background:#1e293b; color:#94a3b8; flex-shrink:0;
}
.dxf-holder-pct-bar { background:#0f172a; border-radius:3px; height:4px; margin-top:3px; }
.dxf-holder-pct-fill { height:4px; border-radius:3px; background:#3b82f6; }
.dxf-badge-burner  { background:#450a0a; color:#fca5a5; border:1px solid #ef4444; border-radius:8px; padding:1px 6px; font-size:9px; font-weight:700; }
.dxf-badge-lp      { background:#0c2a4a; color:#7dd3fc; border:1px solid #0369a1; border-radius:8px; padding:1px 6px; font-size:9px; font-weight:700; }
.dxf-badge-large   { background:#1e1b4b; color:#a5b4fc; border:1px solid #4338ca; border-radius:8px; padding:1px 6px; font-size:9px; font-weight:700; }

/* ── LP Pool ───────────────────────────────────────────────────── */
.dxf-lp-row {
    display:grid; grid-template-columns:80px 1fr 80px 80px 70px 60px;
    gap:8px; padding:8px 12px; border-bottom:1px solid #060c18; font-size:11px; align-items:center;
}
.dxf-lp-row:hover { background:#06101e; }
.dxf-section-title {
    font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;
    letter-spacing:.1em; margin:14px 0 8px; display:flex; align-items:center; gap:6px;
}
`;
    document.head.appendChild(s);
})();

/* ─────────────────────────────────────────────────────────────────────────────
   FEED TOKEN LIVE
───────────────────────────────────────────────────────────────────────────── */
const DexFeed = (() => {
    const PROXY = window.PROXY_BASE || 'http://127.0.0.1:3001';
    let _tokens = [];
    let _phase  = 'all';
    let _timer  = null;

    const fmtUsd = n => {
        if (!n || isNaN(n)) return '$0';
        if (n >= 1e9) return '$' + (n/1e9).toFixed(2)+'B';
        if (n >= 1e6) return '$' + (n/1e6).toFixed(1)+'M';
        if (n >= 1e3) return '$' + (n/1e3).toFixed(0)+'K';
        return '$' + n.toFixed(0);
    };

    const phaseMeta = {
        NEW:      { label:'NEW',      bg:'#14532d', color:'#86efac', border:'#22c55e' },
        RUNNER:   { label:'RUNNER',   bg:'#1e3a5f', color:'#93c5fd', border:'#3b82f6' },
        EARLY:    { label:'EARLY',    bg:'#422006', color:'#fcd34d', border:'#f59e0b' },
        SOON:     { label:'SOON',     bg:'#2e1065', color:'#c4b5fd', border:'#a78bfa' },
        MIGRATED: { label:'MIGRATED', bg:'#083344', color:'#67e8f9', border:'#06b6d4' },
        DEAD:     { label:'DEAD',     bg:'#450a0a', color:'#fca5a5', border:'#ef4444' },
    };

    function phaseBadge(phase) {
        const m = phaseMeta[phase] || { label:phase, bg:'#1e293b', color:'#94a3b8', border:'#334155' };
        return `<span class="dxf-phase-badge" style="background:${m.bg};color:${m.color};border:1px solid ${m.border}">${m.label}</span>`;
    }

    function entryStatus(t) {
        if (t.phase === 'DEAD')   return `<span style="color:#64748b;font-size:10px">—</span>`;
        if (t.apeScore >= 7)      return `<span class="dxf-entry-pill">● ENTRY</span>`;
        if (t.apeScore >= 5)      return `<span class="dxf-entry-pill" style="background:#422006;color:#fcd34d;border-color:#f59e0b">● WATCH</span>`;
        return `<span class="dxf-entry-pill" style="background:#450a0a;color:#fca5a5;border-color:#ef4444">● AVOID</span>`;
    }

    function render() {
        const tbody = document.getElementById('dxaFeedBody');
        if (!tbody) return;

        const filtered = _phase === 'all' ? _tokens : _tokens.filter(t => t.phase === _phase);

        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:#334155">Tidak ada token di fase ini.</td></tr>`;
            return;
        }

        tbody.innerHTML = filtered.slice(0, 50).map(t => {
            const c5m  = t.ch5m  >= 0 ? '#4ade80' : '#f87171';
            const c1h  = t.ch1h  >= 0 ? '#4ade80' : '#f87171';
            const mcapStr = t.mcap > 0 ? fmtUsd(t.mcap) + (t.phase === 'NEW' || t.phase === 'EARLY' ? ' (bonding)' : '') : '—';
            return `
            <tr class="dxf-row" onclick="DexForensics.open('${t.address}','${t.symbol}')">
                <td style="padding:10px 12px">
                    <div style="display:flex;align-items:center;gap:8px">
                        ${t.logoUrl ? `<img src="${t.logoUrl}" style="width:28px;height:28px;border-radius:50%;background:#0f172a" onerror="this.style.display='none'">` : `<div style="width:28px;height:28px;border-radius:50%;background:#1e293b;display:flex;align-items:center;justify-content:center;font-size:12px">◎</div>`}
                        <div>
                            <div style="font-weight:700;color:#e2e8f0;font-size:12px">$${t.symbol}</div>
                            <div style="font-size:10px;color:#475569">${(t.name||'').slice(0,20)}</div>
                        </div>
                    </div>
                </td>
                <td style="padding:10px">${phaseBadge(t.phase)}</td>
                <td style="padding:10px;text-align:right;color:#94a3b8;font-size:11px">${t.ageFmt}</td>
                <td style="padding:10px;text-align:right;color:#94a3b8;font-size:11px">${mcapStr}</td>
                <td style="padding:10px;text-align:right;color:#94a3b8;font-size:11px">${fmtUsd(t.liq)}</td>
                <td style="padding:10px;text-align:right;color:${c5m};font-size:11px;font-weight:700">${fmtUsd(t.vol5m)}</td>
                <td style="padding:10px;text-align:right;color:#94a3b8;font-size:11px">${t.txns5m}</td>
                <td style="padding:10px;text-align:right;font-size:11px;font-weight:700;color:${t.buys5m > t.sells5m ? '#4ade80':'#f87171'}">${t.buys5m}/${t.sells5m}</td>
                <td style="padding:10px;text-align:center">${entryStatus(t)}</td>
                <td style="padding:10px;text-align:center">
                    <button class="dxf-scan-btn" onclick="event.stopPropagation();DexForensics.open('${t.address}','${t.symbol}')">SCAN</button>
                </td>
            </tr>`;
        }).join('');
    }

    function updateCounts() {
        const phases = ['all','RUNNER','NEW','EARLY','SOON','MIGRATED','DEAD'];
        phases.forEach(p => {
            const el = document.getElementById('dxaPhaseCount_' + p);
            if (!el) return;
            el.textContent = p === 'all' ? _tokens.length : _tokens.filter(t => t.phase === p).length;
        });
    }

    async function load(force = false) {
        const metaEl = document.getElementById('dxaFeedMeta');
        if (metaEl) metaEl.textContent = 'Mengambil data live…';
        try {
            const r = await fetch(`${PROXY}/api/dex-feed/live${force ? '?refresh=1' : ''}`, { signal: AbortSignal.timeout(15000) });
            const d = await r.json();
            if (d.ok && d.tokens) {
                _tokens = d.tokens;
                updateCounts();
                render();
                if (metaEl) {
                    const t = new Date(d.fetchedAt);
                    metaEl.textContent = `${_tokens.length} token Solana aktif · refresh ${t.getHours().toString().padStart(2,'0')}.${t.getMinutes().toString().padStart(2,'0')}.${t.getSeconds().toString().padStart(2,'0')} · stream live · data ${Math.round((Date.now()-t.getTime())/1000)} detik lalu`;
                }
            }
        } catch (e) {
            const tbody = document.getElementById('dxaFeedBody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#ef4444">Gagal memuat feed: ${e.message}</td></tr>`;
        }
    }

    function setPhase(phase, btn) {
        _phase = phase;
        document.querySelectorAll('.dxa-phase-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        render();
    }

    function init() {
        load();
        _timer = setInterval(() => load(), 30000);
    }

    return { init, load, setPhase };
})();

/* ─────────────────────────────────────────────────────────────────────────────
   DEX FORENSICS PANEL
───────────────────────────────────────────────────────────────────────────── */
const DexForensics = (() => {
    const PROXY = window.PROXY_BASE || 'http://127.0.0.1:3001';
    let _current = null;

    const fmtUsd = n => {
        if (!n || isNaN(n)) return '$0';
        if (n >= 1e9) return '$' + (n/1e9).toFixed(2)+'B';
        if (n >= 1e6) return '$' + (n/1e6).toFixed(1)+'M';
        if (n >= 1e3) return '$' + (n/1e3).toFixed(0)+'K';
        return '$' + n.toFixed(0);
    };

    const pct = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
    const pctCol = n => n >= 0 ? '#4ade80' : '#f87171';

    /* ── APE Meter gauge (canvas arc) ───────────────────────────── */
    function drawApeMeter(score, zone, zoneColor) {
        const c = document.getElementById('dxfApeMeterCanvas');
        if (!c) return;
        const ctx = c.getContext('2d');
        const W = c.width = 120, H = c.height = 72;
        ctx.clearRect(0, 0, W, H);

        const cx = W / 2, cy = H - 4;
        const r  = 48, lw = 10;
        const startAngle = Math.PI;
        const endAngle   = 2 * Math.PI;

        // Background arc
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth   = lw;
        ctx.lineCap     = 'round';
        ctx.stroke();

        // Color zones: 1-3 red, 4-5 orange, 6-7 blue, 8-10 green
        const zones = [
            { from:0.00, to:0.30, color:'#ef4444' },
            { from:0.30, to:0.50, color:'#f97316' },
            { from:0.50, to:0.70, color:'#3b82f6' },
            { from:0.70, to:1.00, color:'#22c55e' },
        ];
        zones.forEach(z => {
            ctx.beginPath();
            ctx.arc(cx, cy, r, startAngle + z.from * Math.PI, startAngle + z.to * Math.PI);
            ctx.strokeStyle = z.color;
            ctx.lineWidth   = lw;
            ctx.lineCap     = 'butt';
            ctx.stroke();
        });

        // Needle
        const angle = startAngle + ((score - 1) / 9) * Math.PI;
        const nx = cx + (r - 8) * Math.cos(angle);
        const ny = cy + (r - 8) * Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        ctx.stroke();

        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    /* ── Render ──────────────────────────────────────────────────── */
    function render(d) {
        const el = document.getElementById('dxaForensicsBody');
        if (!el) return;

        const riskIcon = s => s === 'AMAN' ? '✅' : s === 'WASPADA' ? '⚠️' : '❌';

        el.innerHTML = `
        <!-- Should I Ape? Verdict -->
        <div class="dxf-verdict-card" style="background:${d.verdictBg};border:2px solid ${d.verdictColor}33;color:${d.verdictColor}">
            <div class="dxf-verdict-icon">${d.verdictIcon}</div>
            <div style="flex:1;min-width:0">
                <div class="dxf-verdict-label">SHOULD I APE? — VERDICT SAAT INI</div>
                <div class="dxf-verdict-text">${d.verdict === 'APE SEKARANG' ? 'Ape sekarang' : d.verdict === 'BOLEH APE' ? 'Boleh ape' : d.verdict === 'TUNGGU DULU' ? 'Tunggu dulu' : 'Jangan ape dulu'}</div>
                <div class="dxf-verdict-reasons">
                    ${(d.verdictReasons||[]).map(r => `<div class="dxf-verdict-reason"><span style="opacity:.5">·</span><span>${r}</span></div>`).join('')}
                </div>
            </div>
            <div style="flex-shrink:0;text-align:right">
                <div style="font-size:40px;font-weight:900;line-height:1">${d.apeScore}<span style="font-size:16px;opacity:.5">/10</span></div>
                <div style="font-size:9px;opacity:.6;letter-spacing:.1em;text-transform:uppercase;margin-top:2px">APE SCORE</div>
                <div style="margin-top:6px">
                    <span style="background:${d.verdictColor}22;border:1px solid ${d.verdictColor}44;border-radius:20px;padding:3px 12px;font-size:10px;font-weight:700">${d.zone}</span>
                </div>
            </div>
        </div>

        <!-- Score breakdown row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
            ${[
                { label:'BAHAYA', range:'1–3', color:'#ef4444', active: d.apeScore <= 3 },
                { label:'PVP',    range:'4–5', color:'#f97316', active: d.apeScore >= 4 && d.apeScore <= 5 },
                { label:'MULAI MATANG', range:'6–7', color:'#3b82f6', active: d.apeScore >= 6 && d.apeScore <= 7 },
                { label:'AMAN',  range:'8–10', color:'#22c55e', active: d.apeScore >= 8 },
            ].map(z => `
                <div style="background:${z.active ? z.color+'22' : '#060c18'};border:1px solid ${z.active ? z.color : '#1e293b'};border-radius:8px;padding:8px;text-align:center">
                    <div style="font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${z.active ? z.color : '#475569'}">${z.label}</div>
                    <div style="font-size:10px;color:${z.active ? z.color : '#334155'};margin-top:2px">${z.range}</div>
                </div>`).join('')}
        </div>

        <!-- APE Meter -->
        <div class="dxf-ape-wrap">
            <div>
                <div class="dxf-ape-gauge">
                    <canvas id="dxfApeMeterCanvas"></canvas>
                    <div class="dxf-ape-score" style="color:${d.zoneColor}">${d.apeScore}</div>
                </div>
                <div class="dxf-ape-label">APE METER</div>
                <div style="text-align:center">
                    <span class="dxf-ape-zone" style="background:${d.zoneColor}22;color:${d.zoneColor};border:1px solid ${d.zoneColor}55">${d.zone === 'BAHAYA' ? '⚠️ ZONA BAHAYA' : d.zone}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:8px;color:#334155;margin-top:4px;width:120px">
                    <span>BAHAYA</span><span>PVP</span><span>MATANG</span><span>AMAN</span>
                </div>
            </div>
            <div class="dxf-ape-info">
                <div>
                    <span class="dxf-ape-name">${d.name}</span>
                    <span class="dxf-ape-sym">$${d.symbol}</span>
                </div>
                <div class="dxf-ape-addr">${d.address}</div>
                <div style="font-size:10px;color:#475569;margin-top:4px">
                    PUMPSWAP + SOLANA RPC + BIRDEYE OVERVIEW
                    <button onclick="navigator.clipboard.writeText('${d.address}')" style="margin-left:8px;background:#1e293b;color:#94a3b8;border:none;border-radius:4px;padding:2px 8px;font-size:10px;cursor:pointer">📋 Salin CA</button>
                </div>
                ${d.aiSummary ? `
                <div style="background:#060d18;border:1px solid #1e3a5f;border-radius:8px;padding:12px;margin-top:10px">
                    <div style="font-size:9px;font-weight:700;color:#3b82f6;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">RINGKASAN AI</div>
                    <div style="font-size:12px;color:#94a3b8;line-height:1.6">${d.aiSummary}</div>
                </div>` : ''}
            </div>
        </div>

        <!-- Source / confidence -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
            <div style="background:#060c18;border:1px solid #1e293b;border-radius:8px;padding:10px">
                <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">⚙️ SUMBER DATA</div>
                <div style="font-size:11px;font-weight:700;color:#e2e8f0">Pumpswap + Solana RPC + Birdeye overview</div>
            </div>
            <div style="background:#060c18;border:1px solid #1e293b;border-radius:8px;padding:10px">
                <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">📊 KEYAKINAN DATA</div>
                <div style="font-size:22px;font-weight:900;color:#e2e8f0">${d.topHolders?.length > 0 ? Math.min(95,60+d.topHolders.length*3) : 50}%</div>
            </div>
            <div style="background:#060c18;border:1px solid #1e293b;border-radius:8px;padding:10px">
                <div style="font-size:9px;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">⚠️ RISIKO UTAMA</div>
                <div style="font-size:11px;font-weight:700;color:#f87171">${
                    d.supplyTop10Pct > 80 ? 'supply holder terkonsentrasi'
                    : d.bundleRisk === 'HIGH' ? 'bundle dev terdeteksi'
                    : d.liq < 5000 ? 'likuiditas sangat rendah'
                    : d.burnerCount >= 3 ? 'banyak burner wallet'
                    : 'dalam batas wajar'
                }</div>
            </div>
        </div>

        <!-- Forensik Real-time KPIs -->
        <div class="dxf-section-title">🔬 FORENSIK REAL-TIME</div>
        <div class="dxf-kpi-grid">
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">💰 HARGA</div>
                <div class="dxf-kpi-val" style="font-size:13px">${d.price < 0.000001 ? d.price.toExponential(3) : d.price < 0.001 ? d.price.toFixed(8) : d.price < 1 ? d.price.toFixed(6) : d.price.toFixed(4)}</div>
                <div class="dxf-kpi-sub">$</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">⏱️ UMUR LIVE</div>
                <div class="dxf-kpi-val" style="font-size:13px">${d.ageFmt || '—'}</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">📊 MCAP / FDV</div>
                <div class="dxf-kpi-val" style="font-size:13px;color:${d.mcap>0?'#e2e8f0':'#475569'}">${fmtUsd(d.mcap)}</div>
                <div class="dxf-kpi-sub">${d.lpStatus}</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">💧 LIKUIDITAS</div>
                <div class="dxf-kpi-val" style="font-size:13px;color:${d.liq>20000?'#4ade80':d.liq>5000?'#fbbf24':'#f87171'}">${fmtUsd(d.liq)}</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">🔄 STATUS LP</div>
                <div class="dxf-kpi-val" style="font-size:11px;color:${d.lpStatus==='Bonding curve'?'#f97316':'#4ade80'}">${d.lpStatus}</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">📈 VOLUME 5M / 1H</div>
                <div class="dxf-kpi-val" style="font-size:11px">${fmtUsd(d.vol5m)}</div>
                <div class="dxf-kpi-sub">${fmtUsd(d.vol1h)} 1H</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">🔁 TRANSAKSI 5M / 1H</div>
                <div class="dxf-kpi-val" style="font-size:13px">${d.txns5m}</div>
                <div class="dxf-kpi-sub">${d.txns1h} 1H</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">📊 BUY / SELL 5M</div>
                <div class="dxf-kpi-val" style="font-size:13px;color:${d.buys5m>d.sells5m?'#4ade80':'#f87171'}">${d.buys5m} / ${d.sells5m}</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">📉 HARGA 5M / 1H</div>
                <div class="dxf-kpi-val" style="font-size:11px;color:${pctCol(d.ch5m)}">${pct(d.ch5m||0)}</div>
                <div class="dxf-kpi-sub" style="color:${pctCol(d.ch1h)}">${pct(d.ch1h||0)} 1H</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">📊 RASIO VOL/LP</div>
                <div class="dxf-kpi-val" style="font-size:13px;color:${d.volLiqRatio>3?'#f97316':'#4ade80'}">${d.volLiqRatio}×</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">🏆 SUPPLY TOP 10</div>
                <div class="dxf-kpi-val" style="color:${d.supplyTop10Pct>80?'#f87171':d.supplyTop10Pct>60?'#fbbf24':'#4ade80'}">${d.supplyTop10Pct}%</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">👥 OWNER UNIK</div>
                <div class="dxf-kpi-val" style="color:${d.ownerUnique>=7?'#4ade80':d.ownerUnique>=4?'#fbbf24':'#f87171'}">${d.ownerUnique}</div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">🐳 WHALE / BURNER</div>
                <div class="dxf-kpi-val">${d.whaleCount} / <span style="color:${d.burnerCount>=3?'#f87171':'#94a3b8'}">${d.burnerCount}</span></div>
            </div>
            <div class="dxf-kpi">
                <div class="dxf-kpi-label">🔢 JUMLAH PAIR</div>
                <div class="dxf-kpi-val">${d.pairCount}</div>
            </div>
        </div>

        <!-- Risk checks grid -->
        <div class="dxf-section-title">🛡️ PEMERIKSAAN RISIKO</div>
        <div class="dxf-risk-grid">
            ${(d.riskChecks || []).map(c => `
            <div class="dxf-risk-card ${c.status}">
                <div class="dxf-risk-status ${c.status}">${riskIcon(c.status)} ${c.status}</div>
                <div class="dxf-risk-title">${c.label}</div>
                <div class="dxf-risk-desc">${c.desc}</div>
            </div>`).join('')}
        </div>

        <!-- Top Holder Snapshot -->
        <div class="dxf-section-title">📌 SNAPSHOT TOP HOLDER</div>
        <div style="background:#060c18;border:1px solid #1e293b;border-radius:10px;overflow:hidden;margin-bottom:14px">
            <!-- Summary -->
            <div style="padding:10px 12px;border-bottom:1px solid #0f172a">
                ${[
                    `Top 10 memegang ${d.supplyTop10Pct}% supply.`,
                    `${d.ownerUnique} owner unik terbaca dari top holder.`,
                    d.burnerCount > 0 ? `${d.burnerCount} burner wallet terdeteksi.` : null,
                    (d.bundleRisk === 'HIGH' || d.bundleRisk === 'MEDIUM') ? `Risiko cluster/bundle ${d.bundleRisk === 'HIGH' ? 'tinggi' : 'sedang'} dari konsentrasi holder dan burner.` : null,
                ].filter(Boolean).map(t => `<div style="font-size:11px;color:#64748b;padding:2px 0">• ${t}</div>`).join('')}
            </div>
            <!-- Header -->
            <div class="dxf-holder-row" style="background:#06101e;color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:.08em">
                <span>#</span><span>WALLET</span><span>% SUPPLY</span><span>SKOR</span><span>LABEL</span>
            </div>
            ${(d.topHolders || []).map((h, i) => `
            <div class="dxf-holder-row">
                <span style="color:#475569;font-size:10px">${h.rank}</span>
                <div>
                    <div style="font-size:11px;font-weight:700;color:#e2e8f0;font-family:monospace">${h.shortOwner}</div>
                    <div style="font-size:9px;color:#475569">${h.isBurner ? 'holder' : 'holder'} · ${h.pct}% supply</div>
                </div>
                <div>
                    <div style="font-size:12px;font-weight:700;color:${h.pct>20?'#f87171':h.pct>5?'#fbbf24':'#e2e8f0'}">${h.pct}%</div>
                    <div class="dxf-holder-pct-bar"><div class="dxf-holder-pct-fill" style="width:${Math.min(100,h.pct*1.5)}%;background:${h.pct>20?'#ef4444':h.pct>5?'#f59e0b':'#3b82f6'}"></div></div>
                </div>
                <div class="dxf-holder-score" style="background:${h.score>=50?'#1e3a5f':h.score>=30?'#422006':'#450a0a'};color:${h.score>=50?'#93c5fd':h.score>=30?'#fcd34d':'#fca5a5'}">${h.score}</div>
                <div>
                    ${h.isBurner ? '<span class="dxf-badge-burner">Burner, Supply besar</span>'
                    : h.isLP ? '<span class="dxf-badge-lp">LP / pair account</span>'
                    : h.pct > 5 ? '<span class="dxf-badge-large">Large Wallet</span>'
                    : `<span style="font-size:10px;color:#475569">${h.solBalance > 0 ? h.solBalance.toFixed(1)+' SOL' : '—'}</span>`}
                </div>
            </div>`).join('') || '<div style="text-align:center;padding:20px;color:#475569">Data holder belum tersedia (RPC limit)</div>'}
        </div>

        <!-- LP Pools -->
        ${(d.lpPools || []).length > 0 ? `
        <div class="dxf-section-title">💧 LIQUIDITY POOL</div>
        <div style="background:#060c18;border:1px solid #1e293b;border-radius:10px;overflow:hidden;margin-bottom:14px">
            <div class="dxf-lp-row" style="background:#06101e;color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:.08em">
                <span>DEX</span><span>PAIR</span><span>NILAI LP</span><span>BASE/QUOTE</span><span>PAIR AKTIF</span><span></span>
            </div>
            ${d.lpPools.map(lp => `
            <div class="dxf-lp-row">
                <span style="color:#e2e8f0;font-weight:700;font-size:11px">${lp.dex}</span>
                <span style="font-family:monospace;font-size:10px;color:#60a5fa">${lp.shortPair}</span>
                <span style="font-weight:700;color:#e2e8f0;font-size:11px">${fmtUsd(lp.liquidityUsd)}</span>
                <span style="font-size:10px;color:#64748b">${(lp.baseAmt/1e6||0).toFixed(1)}M / ${(lp.quoteAmt||0).toFixed(2)}</span>
                <span style="font-size:10px;color:${lp.isActive?'#4ade80':'#64748b'}">${lp.isActive ? '✅' : '—'}</span>
                <span></span>
            </div>`).join('')}
        </div>` : ''}

        <!-- Footer actions -->
        <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
            <a href="${d.dexUrl}" target="_blank" style="background:#0a1628;color:#60a5fa;border:1px solid #1e3a5f;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;text-decoration:none">📊 Buka di DexScreener ↗</a>
            <a href="https://solscan.io/token/${d.address}" target="_blank" style="background:#0a1628;color:#94a3b8;border:1px solid #1e293b;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;text-decoration:none">🔍 Solscan ↗</a>
            <button onclick="DexForensics.refresh()" style="background:#0a1628;color:#94a3b8;border:1px solid #1e293b;border-radius:8px;padding:7px 14px;font-size:12px;cursor:pointer">↻ Refresh</button>
        </div>
        `;

        // Draw APE meter after DOM is set
        requestAnimationFrame(() => drawApeMeter(d.apeScore, d.zone, d.zoneColor));
    }

    async function open(address, symbol) {
        if (!address) return;
        _current = address;

        // Open side panel dan switch ke tab forensics
        if (typeof dexAnalyzer !== 'undefined') {
            dexAnalyzer.openPanel({ pairAddress: address, baseToken: { symbol: symbol || address.slice(0,6) } });
            setTimeout(() => dexAnalyzer.switchInnerTab('forensics'), 100);
        }

        const el = document.getElementById('dxaForensicsBody');
        if (!el) return;
        el.innerHTML = `<div style="text-align:center;padding:50px;color:#475569"><div style="font-size:28px;margin-bottom:10px">🔍</div>Menganalisis ${symbol || address.slice(0,8)}…</div>`;

        try {
            const r = await fetch(`${PROXY}/api/dex-forensics/${address}`, { signal: AbortSignal.timeout(20000) });
            const d = await r.json();
            if (d.ok) {
                _current = address;
                render(d);
            } else {
                el.innerHTML = `<div style="text-align:center;padding:40px;color:#f87171">❌ ${d.error || 'Gagal mengambil data forensik'}</div>`;
            }
        } catch (e) {
            el.innerHTML = `<div style="text-align:center;padding:40px;color:#f87171">❌ Koneksi gagal: ${e.message}</div>`;
        }
    }

    async function refresh() {
        if (_current) {
            const r = await fetch(`${PROXY}/api/dex-forensics/${_current}?refresh=1`, { signal: AbortSignal.timeout(20000) });
            const d = await r.json();
            if (d.ok) render(d);
        }
    }

    return { open, refresh };
})();

/* ─────────────────────────────────────────────────────────────────────────────
   HOOK: Integrasikan dengan dexAnalyzer (buka forensics dari klik tabel)
───────────────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    // Tunggu dexAnalyzer tersedia lalu patch openPanel
    const tryPatch = () => {
        if (typeof dexAnalyzer !== 'undefined' && dexAnalyzer.switchInnerTab) {
            const origSwitch = dexAnalyzer.switchInnerTab.bind(dexAnalyzer);
            dexAnalyzer.switchInnerTab = (tab) => {
                origSwitch(tab);
                // Tambah/hide panel forensics
                const fPanel = document.getElementById('dxaTabForensics');
                if (fPanel) fPanel.classList.toggle('active', tab === 'forensics');
            };
        } else {
            setTimeout(tryPatch, 500);
        }
    };
    tryPatch();

    // Init feed
    DexFeed.init();
});
