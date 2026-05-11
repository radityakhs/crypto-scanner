// ══════════════════════════════════════════════════════════════
//  DEX SNIPER  — Early Entry & Momentum Rider
//  Mencari token DEX yang siap disnipe sebelum harga loncat
// ══════════════════════════════════════════════════════════════
const DexSniper = (function () {
    'use strict';

    const PROXY = 'http://127.0.0.1:3001';
    let _mode  = 'early';    // 'early' | 'momentum'
    let _chain = 'solana';

    function init() {
        // noop — panel di-render dari index.html
    }

    // ─── SCAN ─────────────────────────────────────────────────
    async function runScan() {
        _renderLoading();
        try {
            const r = await fetch(`${PROXY}/api/dex-sniper?mode=${_mode}&chain=${_chain}`);
            const d = await r.json();
            if (!d.ok) throw new Error(d.error || 'Gagal scan DEX');
            _renderResults(d.tokens || [], d);
        } catch (e) {
            _renderError(e.message);
        }
    }

    function setMode(m) {
        _mode = m;
        ['early','momentum'].forEach(x => {
            const btn = document.getElementById(`ds-mode-${x}`);
            if (!btn) return;
            const isActive = x === m;
            btn.style.background = isActive ? (x === 'early' ? '#065f46' : '#1e3a8a') : '#1e293b';
            btn.style.color      = isActive ? (x === 'early' ? '#34d399' : '#93c5fd') : '#64748b';
            btn.style.borderColor= isActive ? (x === 'early' ? '#10b981' : '#3b82f6') : '#1e3a5f';
        });
        runScan();
    }

    function setChain(c) {
        _chain = c;
        ['solana','ethereum','bsc','base'].forEach(x => {
            const btn = document.getElementById(`ds-chain-${x}`);
            if (btn) {
                btn.style.background = x === c ? '#1e40af' : '#1e293b';
                btn.style.color      = x === c ? '#93c5fd' : '#64748b';
            }
        });
        runScan();
    }

    // ─── RENDER ───────────────────────────────────────────────
    function _renderLoading() {
        const body = document.getElementById('ds-body');
        if (!body) return;
        body.innerHTML = `
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding:16px">
${Array(6).fill(0).map(() => `
<div style="background:#0a1628;border:1px solid #1e3a5f;border-radius:12px;padding:16px;animation:pulse 1.5s infinite">
  <div style="background:#1e3a5f;height:14px;border-radius:4px;width:50%;margin-bottom:10px"></div>
  <div style="background:#1e3a5f;height:10px;border-radius:4px;width:80%;margin-bottom:6px"></div>
  <div style="background:#1e3a5f;height:6px;border-radius:3px;width:100%;margin-bottom:4px"></div>
  <div style="background:#1e3a5f;height:6px;border-radius:3px;width:70%"></div>
</div>`).join('')}
</div>`;
    }

    function _renderError(msg) {
        const body = document.getElementById('ds-body');
        if (!body) return;
        body.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#ef4444">❌ ${msg}<br><small style="color:#475569">Pastikan proxy server berjalan di port 3001</small></div>`;
    }

    function _fmt(n) {
        if (!n) return '$0';
        if (n >= 1e9) return '$' + (n/1e9).toFixed(1) + 'B';
        if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
        if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K';
        return '$' + n.toFixed(0);
    }

    function _fmtPrice(p) {
        if (!p) return '$0';
        if (p < 0.000001) return '$' + p.toExponential(2);
        if (p < 0.001)    return '$' + p.toFixed(7);
        if (p < 1)        return '$' + p.toFixed(4);
        return '$' + p.toFixed(2);
    }

    function _ageStr(h) {
        if (h < 1)   return Math.round(h * 60) + 'm';
        if (h < 24)  return h.toFixed(0) + 'j';
        return (h / 24).toFixed(0) + 'h';
    }

    function _renderResults(tokens, meta) {
        const body = document.getElementById('ds-body');
        if (!body) return;

        const hot    = tokens.filter(t => t.score >= 75);
        const watch  = tokens.filter(t => t.score >= 55 && t.score < 75);
        const setup  = tokens.filter(t => t.score >= 35 && t.score < 55);
        const ts     = meta.scannedAt ? new Date(meta.scannedAt).toLocaleTimeString('id-ID') : '–';
        const isEarly = _mode === 'early';

        // Summary bar
        let html = `
<div style="padding:10px 16px;background:#0a1628;border-bottom:1px solid #1e3a5f;display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:12px">
  <span style="color:#64748b">📡 ${ts} · <b style="color:#94a3b8">${meta.total || 0}</b> pair dipindai</span>
  <span style="background:#f59e0b22;color:#f59e0b;padding:2px 10px;border-radius:99px;font-weight:700">${isEarly ? '🎯' : '🚀'} ${hot.length} Hot</span>
  <span style="background:#3b82f622;color:#3b82f6;padding:2px 10px;border-radius:99px;font-weight:700">👀 ${watch.length} Watch</span>
  <span style="background:#8b5cf622;color:#8b5cf6;padding:2px 10px;border-radius:99px;font-weight:700">📋 ${setup.length} Setup</span>
  <button onclick="DexSniper.runScan()" style="margin-left:auto;background:#1e3a5f;border:none;border-radius:8px;padding:4px 14px;color:#94a3b8;cursor:pointer">🔄 Refresh</button>
</div>`;

        if (!tokens.length) {
            html += `<div style="text-align:center;padding:60px;color:#475569">😴 Tidak ada token yang memenuhi kriteria saat ini.<br><small>Coba ganti chain atau mode.</small></div>`;
            body.innerHTML = html;
            return;
        }

        // Mode description
        html += `
<div style="padding:8px 16px;font-size:11px;color:#475569;background:#060f1e;border-bottom:1px solid #0f2035">
  ${isEarly
    ? '🎯 <b style="color:#10b981">Early Entry</b> — Token baru listing, volume mulai terbentuk, belum pump. Risiko tinggi tapi reward besar.'
    : '🚀 <b style="color:#3b82f6">Momentum Rider</b> — Token sedang naik dengan volume kuat. Potensi masih ada, masuk saat momentum terjaga.'}
  &nbsp;·&nbsp; ⚠️ Selalu DYOR, pastikan kontrak aman sebelum beli.
</div>`;

        html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;padding:16px">`;

        const allShow = [...hot, ...watch, ...setup];
        allShow.forEach(t => {
            const clr      = t.score >= 75 ? (isEarly ? '#10b981' : '#3b82f6') : t.score >= 55 ? '#f59e0b' : '#8b5cf6';
            const bdr      = `${clr}55`;
            const chgClr   = t.chg1h >= 0 ? '#10b981' : '#ef4444';
            const scorePct = Math.min(100, t.score);
            const badges   = Object.values(t.signals || {}).filter(s => s.active)
                .map(s => `<span style="background:${clr}20;color:${clr};padding:2px 7px;border-radius:99px;font-size:10px;font-weight:600">✓ ${s.label}</span>`)
                .join('');

            // Buy pressure bar
            const b = t.buys5m || 0, s = t.sells5m || 0, tot = b + s || 1;
            const buyPct = Math.round(b / tot * 100);

            // Jupiter / DEX buy link (Solana only)
            const buyLink = t.chain === 'solana' && t.baseMint
                ? `https://jup.ag/swap/SOL-${t.baseMint}`
                : t.url;

            html += `
<div style="background:#0a1628;border:1px solid ${bdr};border-left:3px solid ${clr};border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px">

  <!-- Header -->
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
    <div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
        <span style="font-size:15px;font-weight:800;color:#e2e8f0">${t.baseSymbol}</span>
        <span style="font-size:10px;font-weight:700;color:${clr};background:${clr}22;padding:1px 8px;border-radius:99px">${t.signal}</span>
      </div>
      <div style="font-size:11px;color:#64748b;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.baseName}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:13px;font-weight:700;color:#e2e8f0">${_fmtPrice(t.priceUsd)}</div>
      <div style="font-size:11px;color:${chgClr}">${t.chg1h >= 0 ? '+' : ''}${t.chg1h.toFixed(1)}% 1h</div>
    </div>
  </div>

  <!-- Score bar -->
  <div>
    <div style="display:flex;justify-content:space-between;margin-bottom:3px">
      <span style="font-size:10px;color:#475569">Sniper Score</span>
      <span style="font-size:12px;font-weight:800;color:${clr}">${t.score}<span style="font-size:9px;color:#475569">/100</span></span>
    </div>
    <div style="height:5px;background:#1e293b;border-radius:3px;overflow:hidden">
      <div style="width:${scorePct}%;height:100%;background:linear-gradient(90deg,${clr}88,${clr});border-radius:3px"></div>
    </div>
  </div>

  <!-- Badges -->
  <div style="display:flex;flex-wrap:wrap;gap:3px">${badges || '<span style="font-size:10px;color:#334155">Belum ada sinyal kuat</span>'}</div>

  <!-- Stats row -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:8px 0;border-top:1px solid #1e293b;border-bottom:1px solid #1e293b">
    <div style="text-align:center">
      <div style="font-size:9px;color:#475569;margin-bottom:2px">FDV</div>
      <div style="font-size:11px;font-weight:600;color:#94a3b8">${_fmt(t.fdv)}</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:9px;color:#475569;margin-bottom:2px">LIKUIDITAS</div>
      <div style="font-size:11px;font-weight:600;color:#94a3b8">${_fmt(t.liquidityUsd)}</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:9px;color:#475569;margin-bottom:2px">USIA</div>
      <div style="font-size:11px;font-weight:600;color:#94a3b8">${_ageStr(t.ageHours)}</div>
    </div>
  </div>

  <!-- Buy pressure bar -->
  <div>
    <div style="display:flex;justify-content:space-between;font-size:9px;color:#475569;margin-bottom:3px">
      <span>🟢 Beli ${buyPct}%</span>
      <span>Merah ${100-buyPct}% 🔴</span>
    </div>
    <div style="height:4px;background:#ef444433;border-radius:2px;overflow:hidden">
      <div style="width:${buyPct}%;height:100%;background:#10b981;border-radius:2px"></div>
    </div>
  </div>

  <!-- Vol -->
  <div style="font-size:10px;color:#475569">
    Vol 5m: <b style="color:#94a3b8">${_fmt(t.vol5m)}</b> &nbsp;·&nbsp;
    Vol 1h: <b style="color:#94a3b8">${_fmt(t.vol1h)}</b> &nbsp;·&nbsp;
    DEX: <b style="color:#64748b">${t.dex || '–'}</b>
  </div>

  <!-- Action buttons -->
  <div style="display:flex;gap:6px;margin-top:2px">
    <a href="${t.url}" target="_blank"
       style="flex:1;text-align:center;background:#1e3a5f;color:#94a3b8;text-decoration:none;border-radius:8px;padding:6px 0;font-size:11px;font-weight:600">
      📊 Chart
    </a>
    <a href="${buyLink}" target="_blank"
       style="flex:1;text-align:center;background:linear-gradient(135deg,${clr}cc,${clr});color:#000;text-decoration:none;border-radius:8px;padding:6px 0;font-size:11px;font-weight:700">
      ${t.chain === 'solana' ? '⚡ Buy via Jup' : '💱 Buy'}
    </a>
  </div>

</div>`;
        });

        html += '</div>';
        html += `<div style="padding:10px 16px 20px;font-size:11px;color:#334155;text-align:center">
          ⚠️ DYOR — Selalu cek kontrak di <a href="https://rugcheck.xyz" target="_blank" style="color:#475569">rugcheck.xyz</a> sebelum beli · Score bukan jaminan profit
        </div>`;

        body.innerHTML = html;
    }

    return { init, runScan, setMode, setChain };
})();
