/**
 * Charon Bot Panel — Frontend UI
 * Sections: Signal Feed · Positions · AI Decisions · Price Alerts · Strategy · Lessons · Wallets
 */

const CHARON_API = 'http://127.0.0.1:3001/api/charon';
const CHARON_POLL_MS = 15_000;
let _pollTimer = null;
let _activeSection = 'signals';

const SECTIONS = [
  { id: 'signals',   label: '📡 Signal Feed',  fetch: fetchSignals   },
  { id: 'positions', label: '📊 Positions',     fetch: fetchPositions },
  { id: 'decisions', label: '🧠 AI Decisions',  fetch: fetchDecisions },
  { id: 'alerts',    label: '🔔 Price Alerts',  fetch: fetchAlerts    },
  { id: 'strategy',  label: '⚙️ Strategy',      fetch: fetchStrategy  },
  { id: 'lessons',   label: '📚 Lessons',       fetch: fetchLessons   },
  { id: 'wallets',   label: '👛 Wallets',       fetch: fetchWallets   },
];

// ── Helpers ───────────────────────────────────────────────────────────
function fmtTimeAgo(ms) {
  if (!ms) return '—';
  const d = Date.now() - ms;
  if (d < 60_000) return Math.round(d/1000)+'s ago';
  if (d < 3_600_000) return Math.round(d/60_000)+'m ago';
  return Math.round(d/3_600_000)+'h ago';
}
function fmtTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',hour12:false});
}
function fmtPct(v) {
  if (v==null||isNaN(v)) return '—';
  const n=Number(v); const c=n>0?'#4ade80':n<0?'#f87171':'#94a3b8';
  return `<span style="color:${c};font-weight:700">${n>0?'+':''}${n.toFixed(2)}%</span>`;
}
function fmtSol(v){ return v==null?'—':Number(v).toFixed(4)+' SOL'; }
function shortMint(m){ return m?`${m.slice(0,6)}…${m.slice(-4)}`:'—'; }
function pumpLink(mint){
  return `<a href="https://pump.fun/${mint}" target="_blank" style="color:#a78bfa;text-decoration:none" title="${mint}">${shortMint(mint)}</a>`;
}
function verdictBadge(v){
  const m={BUY:'#4ade80',WATCH:'#fbbf24',PASS:'#f87171'};
  const c=m[v]||'#64748b';
  return `<span style="background:${c}22;color:${c};border:1px solid ${c}44;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">${v||'—'}</span>`;
}
function statusBadge(s){
  const m={open:'#4ade80',closed:'#64748b',buy:'#4ade80',watch:'#fbbf24',pass:'#f87171',pending:'#fbbf24',triggered:'#4ade80',expired:'#64748b',active:'#4ade80'};
  const c=m[s]||'#94a3b8';
  return `<span style="background:${c}22;color:${c};border:1px solid ${c}44;padding:2px 8px;border-radius:10px;font-size:11px">${s||'—'}</span>`;
}
async function apiFetch(path){ const r=await fetch(CHARON_API+path); return r.json(); }

// ── Status Bar ────────────────────────────────────────────────────────
async function updateStatusBar(){
  const el=document.getElementById('charonStatusBar'); if(!el) return;
  try{
    const s=await apiFetch('/status');
    if(!s.dbExists){ el.innerHTML=`⚠️ <b style="color:#fbbf24">Charon DB not found.</b> Jalankan dulu: <code style="color:#a78bfa">cd charon-feature-real-time-yellowstone && npm start</code>`; return; }
    const p=await apiFetch('/pnl-summary'); const d=p.data||{};
    el.innerHTML=`🟢 <b style="color:#4ade80">Charon DB Connected</b> &nbsp;·&nbsp; Open: <b style="color:#e2e8f0">${d.open??0}</b> &nbsp;·&nbsp; Closed: <b>${d.closed??0}</b> &nbsp;·&nbsp; Win Rate: <b style="color:#4ade80">${d.winRate??0}%</b> &nbsp;·&nbsp; Avg PnL: ${fmtPct(d.avgPnlPct)} &nbsp;·&nbsp; Total PnL: ${fmtPct(d.totalPnlPct)}`;
  }catch{ el.innerHTML=`❌ <b style="color:#f87171">Proxy server tidak merespons.</b>`; }
}

// ── Nav ───────────────────────────────────────────────────────────────
function renderNav(){
  const el=document.getElementById('charonNav'); if(!el) return;
  el.innerHTML=SECTIONS.map(s=>`<button class="charon-nav-btn${_activeSection===s.id?' active':''}" onclick="window._charonSwitchSection('${s.id}')">${s.label}</button>`).join('');
}
window._charonSwitchSection=function(id){
  _activeSection=id; renderNav();
  SECTIONS.forEach(s=>{const el=document.getElementById('charonSec_'+s.id); if(el) el.style.display=s.id===id?'':'none';});
  const sec=SECTIONS.find(s=>s.id===id); if(sec) sec.fetch();
};

// ── Signal Feed ───────────────────────────────────────────────────────
async function fetchSignals(){
  const el=document.getElementById('charonSec_signals'); if(!el) return;
  el.innerHTML=`<div class="charon-section-title">📡 Live Signal Feed</div><div style="color:#64748b;font-size:13px">Loading…</div>`;
  try{
    const res=await apiFetch('/candidates?limit=50');
    if(!res.ok){el.innerHTML=`<div class="charon-section-title">📡 Live Signal Feed</div><div style="color:#f87171">${res.error}</div>`;return;}
    const rows=res.data||[];
    if(!rows.length){el.innerHTML=`<div class="charon-section-title">📡 Live Signal Feed</div><div style="color:#64748b;padding:40px;text-align:center">Belum ada signal masuk.<br><small>Charon bot harus berjalan untuk mendeteksi fee claims & trending.</small></div>`;return;}
    el.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="charon-section-title" style="margin:0">📡 Live Signal Feed</div>
        <span style="font-size:11px;color:#64748b">${rows.length} candidates</span>
      </div>
      <div style="overflow-x:auto"><table class="charon-table">
        <thead><tr><th>Token</th><th>Mint</th><th>Status</th><th>Route</th><th>MCap</th><th>Holders</th><th>Fee</th><th>Age</th></tr></thead>
        <tbody>${rows.map(r=>{
          const c=r.candidate||{},tok=c.token||{},m=c.metrics||{},fee=c.feeClaim||{};
          return `<tr>
            <td><b style="color:#e2e8f0">${tok.symbol||'—'}</b><br><span style="color:#64748b;font-size:10px">${tok.name||''}</span></td>
            <td class="mono">${pumpLink(r.mint)}</td>
            <td>${statusBadge(r.status)}</td>
            <td><span style="font-size:11px;color:#a78bfa">${c.signals?.route||'—'}</span></td>
            <td style="color:#cbd5e1">${m.mcapUsd?'$'+Number(m.mcapUsd).toLocaleString('en',{maximumFractionDigits:0}):'—'}</td>
            <td>${m.holders??'—'}</td>
            <td>${fee.sol?fmtSol(fee.sol):'—'}</td>
            <td style="color:#64748b;font-size:11px">${fmtTimeAgo(r.created_at_ms)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }catch(e){el.innerHTML=`<div class="charon-section-title">📡 Live Signal Feed</div><div style="color:#f87171">Error: ${e.message}</div>`;}
}

// ── Positions ─────────────────────────────────────────────────────────
async function fetchPositions(){
  const el=document.getElementById('charonSec_positions'); if(!el) return;
  el.innerHTML=`<div class="charon-section-title">📊 Positions</div><div style="color:#64748b;font-size:13px">Loading…</div>`;
  try{
    const res=await apiFetch('/positions?limit=50');
    if(!res.ok){el.innerHTML=`<div class="charon-section-title">📊 Positions</div><div style="color:#f87171">${res.error}</div>`;return;}
    const rows=res.data||[];
    if(!rows.length){el.innerHTML=`<div class="charon-section-title">📊 Positions</div><div style="color:#64748b;padding:40px;text-align:center">Belum ada posisi.</div>`;return;}
    const renderRows=list=>list.map(r=>{
      const tok=r.candidate?.token||{};
      return `<tr>
        <td><b style="color:#e2e8f0">${r.token_symbol||tok.symbol||'—'}</b></td>
        <td class="mono">${pumpLink(r.mint)}</td>
        <td>${statusBadge(r.status)}</td>
        <td style="font-size:11px;color:#64748b">${r.mode||'—'}</td>
        <td style="color:#cbd5e1">${r.entry_price_usd?'$'+Number(r.entry_price_usd).toFixed(6):'—'}</td>
        <td>${fmtPct(r.pnl_percent)}</td>
        <td style="font-size:10px;color:#94a3b8">${r.exit_reason||'—'}</td>
        <td style="color:#64748b;font-size:11px">${fmtTimeAgo(r.entry_at_ms)}</td>
      </tr>`;
    }).join('');
    const open=rows.filter(r=>r.status==='open'), closed=rows.filter(r=>r.status!=='open');
    const th=`<thead><tr><th>Token</th><th>Mint</th><th>Status</th><th>Mode</th><th>Entry</th><th>PnL</th><th>Exit Reason</th><th>Age</th></tr></thead>`;
    el.innerHTML=`<div class="charon-section-title">📊 Positions</div>
      ${open.length?`<div style="font-size:12px;font-weight:700;color:#4ade80;margin-bottom:8px">🟢 Open (${open.length})</div><div style="overflow-x:auto;margin-bottom:20px"><table class="charon-table">${th}<tbody>${renderRows(open)}</tbody></table></div>`:''}
      <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:8px">📁 Closed (${closed.length})</div>
      <div style="overflow-x:auto"><table class="charon-table">${th}<tbody>${renderRows(closed)}</tbody></table></div>`;
  }catch(e){el.innerHTML=`<div class="charon-section-title">📊 Positions</div><div style="color:#f87171">Error: ${e.message}</div>`;}
}

// ── AI Decisions ──────────────────────────────────────────────────────
async function fetchDecisions(){
  const el=document.getElementById('charonSec_decisions'); if(!el) return;
  el.innerHTML=`<div class="charon-section-title">🧠 AI Decisions</div><div style="color:#64748b;font-size:13px">Loading…</div>`;
  try{
    const res=await apiFetch('/decisions?limit=50');
    if(!res.ok){el.innerHTML=`<div class="charon-section-title">�� AI Decisions</div><div style="color:#f87171">${res.error}</div>`;return;}
    const rows=res.data||[];
    if(!rows.length){el.innerHTML=`<div class="charon-section-title">🧠 AI Decisions</div><div style="color:#64748b;padding:40px;text-align:center">Belum ada keputusan AI.<br><small>Aktifkan ENABLE_LLM=true dan set LLM_API_KEY di .env Charon.</small></div>`;return;}
    el.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="charon-section-title" style="margin:0">🧠 AI Decisions</div>
        <span style="font-size:11px;color:#64748b">${rows.length} decisions</span>
      </div>
      <div style="overflow-x:auto"><table class="charon-table">
        <thead><tr><th>Verdict</th><th>Mint</th><th>Confidence</th><th>Reason</th><th>Risks</th><th>Time</th></tr></thead>
        <tbody>${rows.map(r=>`<tr>
          <td>${verdictBadge(r.verdict)}</td>
          <td class="mono">${pumpLink(r.mint)}</td>
          <td><span style="color:#fbbf24;font-weight:700">${r.confidence??'—'}%</span></td>
          <td style="max-width:260px;color:#94a3b8;font-size:11px">${(r.reason||'—').slice(0,120)}${(r.reason||'').length>120?'…':''}</td>
          <td style="font-size:10px;color:#f87171">${(r.risks||[]).slice(0,3).join(', ')||'—'}</td>
          <td style="color:#64748b;font-size:11px">${fmtTimeAgo(r.created_at_ms)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }catch(e){el.innerHTML=`<div class="charon-section-title">🧠 AI Decisions</div><div style="color:#f87171">Error: ${e.message}</div>`;}
}

// ── Price Alerts ──────────────────────────────────────────────────────
async function fetchAlerts(){
  const el=document.getElementById('charonSec_alerts'); if(!el) return;
  el.innerHTML=`<div class="charon-section-title">🔔 Price Alerts</div><div style="color:#64748b;font-size:13px">Loading…</div>`;
  try{
    const res=await apiFetch('/alerts?limit=50');
    if(!res.ok){el.innerHTML=`<div class="charon-section-title">🔔 Price Alerts</div><div style="color:#f87171">${res.error}</div>`;return;}
    const rows=res.data||[];
    if(!rows.length){el.innerHTML=`<div class="charon-section-title">🔔 Price Alerts</div><div style="color:#64748b;padding:40px;text-align:center">Belum ada price alert.<br><small>Dip buy strategy akan membuat alert otomatis.</small></div>`;return;}
    el.innerHTML=`<div class="charon-section-title">🔔 Price Alerts (Dip Monitor)</div>
      <div style="overflow-x:auto"><table class="charon-table">
        <thead><tr><th>Mint</th><th>Type</th><th>Target</th><th>Status</th><th>Strategy</th><th>Created</th><th>Expires</th></tr></thead>
        <tbody>${rows.map(r=>`<tr>
          <td class="mono">${pumpLink(r.mint)}</td>
          <td style="font-size:11px;color:#a78bfa">${r.alert_type||'—'}</td>
          <td style="color:#fbbf24">${r.target_price_usd?'$'+Number(r.target_price_usd).toFixed(8):'—'}</td>
          <td>${statusBadge(r.status)}</td>
          <td style="font-size:11px;color:#64748b">${r.strategy_id||'—'}</td>
          <td style="font-size:11px;color:#64748b">${fmtTimeAgo(r.created_at_ms)}</td>
          <td style="font-size:11px;color:#64748b">${fmtTimeAgo(r.expires_at_ms)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }catch(e){el.innerHTML=`<div class="charon-section-title">🔔 Price Alerts</div><div style="color:#f87171">Error: ${e.message}</div>`;}
}

// ── Strategy & Settings ───────────────────────────────────────────────
async function fetchStrategy(){
  const el=document.getElementById('charonSec_strategy'); if(!el) return;
  el.innerHTML=`<div class="charon-section-title">⚙️ Strategy & Settings</div><div style="color:#64748b;font-size:13px">Loading…</div>`;
  try{
    const [sRes,stRes]=await Promise.all([apiFetch('/settings'),apiFetch('/strategies')]);
    const settings=sRes.data||{}, strategies=stRes.data||[];
    const stHtml=strategies.length?`
      <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin:0 0 10px">📋 Strategies (${strategies.length})</div>
      ${strategies.map(s=>`<div style="background:#0f172a;border:1px solid ${s.active?'#22c55e44':'#1e293b'};border-radius:8px;padding:12px;margin-bottom:10px">
        <div style="font-weight:700;color:#4ade80;margin-bottom:6px">${s.name||s.id} ${s.active?'<span style="font-size:10px;background:#4ade8022;color:#4ade80;padding:2px 6px;border-radius:8px;margin-left:6px">ACTIVE</span>':''}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:4px;font-size:11px;color:#94a3b8">
          ${Object.entries(s.config||{}).map(([k,v])=>`<div><span style="color:#64748b">${k}:</span> <span style="color:#cbd5e1">${v}</span></div>`).join('')}
        </div>
      </div>`).join('')}<div style="height:16px"></div>` : '';
    el.innerHTML=`<div class="charon-section-title">⚙️ Strategy & Settings</div>
      ${stHtml}
      <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin-bottom:10px">🔧 Runtime Settings</div>
      <div style="overflow-x:auto"><table class="charon-table">
        <thead><tr><th>Key</th><th>Value</th></tr></thead>
        <tbody>${Object.entries(settings).map(([k,v])=>`<tr>
          <td class="mono" style="color:#a78bfa;font-size:11px">${k}</td>
          <td style="color:#e2e8f0;font-size:12px">${typeof v==='object'?`<code style="font-size:10px;color:#94a3b8">${JSON.stringify(v).slice(0,80)}</code>`:String(v)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }catch(e){el.innerHTML=`<div class="charon-section-title">⚙️ Strategy & Settings</div><div style="color:#f87171">Error: ${e.message}</div>`;}
}

// ── Learning Lessons ──────────────────────────────────────────────────
async function fetchLessons(){
  const el=document.getElementById('charonSec_lessons'); if(!el) return;
  el.innerHTML=`<div class="charon-section-title">📚 Lessons</div><div style="color:#64748b;font-size:13px">Loading…</div>`;
  try{
    const res=await apiFetch('/lessons');
    if(!res.ok){el.innerHTML=`<div class="charon-section-title">📚 Lessons</div><div style="color:#f87171">${res.error}</div>`;return;}
    const rows=res.data||[];
    if(!rows.length){el.innerHTML=`<div class="charon-section-title">📚 Lessons</div><div style="color:#64748b;padding:40px;text-align:center">Belum ada lessons.<br><small>Dibuat otomatis setelah cukup data dry-run terkumpul.</small></div>`;return;}
    el.innerHTML=`<div class="charon-section-title">📚 Learning Lessons (AI Generated)</div>
      ${rows.map((r,i)=>`<div style="background:#0f172a;border:1px solid ${r.status==='active'?'#22c55e44':'#1e293b'};border-radius:10px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="flex:1;color:#e2e8f0;font-size:13px;line-height:1.6">${i+1}. ${r.lesson}</div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">${statusBadge(r.status)}<span style="font-size:10px;color:#64748b">${fmtTimeAgo(r.created_at_ms)}</span></div>
        </div>
        ${r.evidence?`<div style="margin-top:8px;font-size:10px;color:#64748b;font-family:monospace;background:#0a0f1a;padding:6px 8px;border-radius:6px;overflow:auto;max-height:60px">${JSON.stringify(r.evidence).slice(0,200)}</div>`:''}
      </div>`).join('')}`;
  }catch(e){el.innerHTML=`<div class="charon-section-title">📚 Lessons</div><div style="color:#f87171">Error: ${e.message}</div>`;}
}

// ── Saved Wallets ─────────────────────────────────────────────────────
async function fetchWallets(){
  const el=document.getElementById('charonSec_wallets'); if(!el) return;
  el.innerHTML=`<div class="charon-section-title">👛 Wallets</div><div style="color:#64748b;font-size:13px">Loading…</div>`;
  try{
    const res=await apiFetch('/wallets');
    if(!res.ok){el.innerHTML=`<div class="charon-section-title">👛 Wallets</div><div style="color:#f87171">${res.error}</div>`;return;}
    const rows=res.data||[];
    if(!rows.length){el.innerHTML=`<div class="charon-section-title">👛 Wallets</div><div style="color:#64748b;padding:40px;text-align:center">Belum ada saved wallet.<br><small>Tambah via Telegram: /addwallet &lt;label&gt; &lt;address&gt;</small></div>`;return;}
    el.innerHTML=`<div class="charon-section-title">👛 Smart Money / Saved Wallets (${rows.length})</div>
      <div style="overflow-x:auto"><table class="charon-table">
        <thead><tr><th>Label</th><th>Address</th><th>Added</th></tr></thead>
        <tbody>${rows.map(r=>`<tr>
          <td style="color:#e2e8f0;font-weight:600">${r.label}</td>
          <td class="mono"><a href="https://solscan.io/account/${r.address}" target="_blank" style="color:#a78bfa;text-decoration:none">${r.address.slice(0,8)}…${r.address.slice(-6)}</a></td>
          <td style="color:#64748b;font-size:11px">${fmtTime(r.created_at_ms)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }catch(e){el.innerHTML=`<div class="charon-section-title">👛 Wallets</div><div style="color:#f87171">Error: ${e.message}</div>`;}
}

// ── Init / Destroy ────────────────────────────────────────────────────
function initCharonPanel(){
  _activeSection='signals';
  renderNav();
  updateStatusBar();
  SECTIONS.forEach(s=>{const el=document.getElementById('charonSec_'+s.id); if(el) el.style.display=s.id===_activeSection?'':'none';});
  fetchSignals();
  _pollTimer=setInterval(()=>{
    updateStatusBar();
    const sec=SECTIONS.find(s=>s.id===_activeSection); if(sec) sec.fetch();
  }, CHARON_POLL_MS);
}

function destroyCharonPanel(){
  if(_pollTimer){clearInterval(_pollTimer);_pollTimer=null;}
}

// Expose ke global
window._charonInit = initCharonPanel;
window._charonDestroy = destroyCharonPanel;
window.charonRefresh = function(){ destroyCharonPanel(); initCharonPanel(); };
