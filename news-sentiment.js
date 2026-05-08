// ══════════════════════════════════════════════════════════════
//  NEWS SENTIMENT  — Crypto News with AI Sentiment Scoring
// ══════════════════════════════════════════════════════════════
const NewsSentiment = (function () {
    'use strict';

    const PROXY = 'http://127.0.0.1:3001';
    let _open = false;

    function init() {
        // Inject modal HTML
        if (document.getElementById('ns-modal')) return;
        const modal = document.createElement('div');
        modal.id = 'ns-modal';
        modal.innerHTML = `
<div id="ns-backdrop" onclick="NewsSentiment.closeModal()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;"></div>
<div id="ns-box" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(600px,95vw);max-height:80vh;background:#0d1929;border:1px solid #1e3a5f;border-radius:16px;z-index:9001;display:none;flex-direction:column;overflow:hidden;">
  <div style="padding:16px 20px;background:#0a1628;border-bottom:1px solid #1e3a5f;display:flex;align-items:center;justify-content:space-between;">
    <div style="font-size:15px;font-weight:700;color:#e2e8f0">📰 Crypto News Sentiment</div>
    <div style="display:flex;gap:8px;align-items:center">
      <button onclick="NewsSentiment.refresh()" style="background:#1e3a5f;border:none;border-radius:8px;padding:5px 12px;color:#94a3b8;cursor:pointer;font-size:12px">🔄 Refresh</button>
      <button onclick="NewsSentiment.closeModal()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:18px;line-height:1">✕</button>
    </div>
  </div>
  <div id="ns-body" style="padding:16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px;">
    <div style="text-align:center;color:#475569;padding:40px 0">Loading berita...</div>
  </div>
  <div id="ns-footer" style="padding:10px 16px;background:#0a1628;border-top:1px solid #1e3a5f;font-size:11px;color:#475569;text-align:center">
    Source: CryptoPanic · Scored by AI · Cache 10 menit
  </div>
</div>`;
        document.body.appendChild(modal);
    }

    function openModal() {
        const backdrop = document.getElementById('ns-backdrop');
        const box      = document.getElementById('ns-box');
        if (!backdrop || !box) { init(); return setTimeout(openModal, 100); }
        backdrop.style.display = 'block';
        box.style.display = 'flex';
        _open = true;
        refresh();
    }

    function closeModal() {
        document.getElementById('ns-backdrop').style.display = 'none';
        document.getElementById('ns-box').style.display = 'none';
        _open = false;
    }

    async function refresh() {
        const body = document.getElementById('ns-body');
        if (!body) return;
        body.innerHTML = '<div style="text-align:center;color:#475569;padding:40px 0">⏳ Mengambil & menganalisis berita...</div>';
        try {
            const r = await fetch(`${PROXY}/api/news-sentiment`);
            const d = await r.json();
            if (!d.ok || !d.news?.length) {
                body.innerHTML = `<div style="text-align:center;color:#ef4444;padding:40px 0">❌ ${d.error || 'Gagal memuat berita'}</div>`;
                return;
            }
            // Overall sentiment bar
            const bulls = d.news.filter(n => n.sentiment === 'bullish').length;
            const bears = d.news.filter(n => n.sentiment === 'bearish').length;
            const neutrals = d.news.filter(n => n.sentiment === 'neutral').length;
            const total = d.news.length;
            const bullPct = Math.round(bulls / total * 100);
            const bearPct = Math.round(bears / total * 100);
            let overallClr = '#94a3b8', overallTxt = '😐 Neutral';
            if (bulls > bears + neutrals) { overallClr = '#10b981'; overallTxt = '🚀 Bullish'; }
            else if (bears > bulls + neutrals) { overallClr = '#ef4444'; overallTxt = '📉 Bearish'; }

            const items = d.news.map(n => {
                const clr   = n.sentiment === 'bullish' ? '#10b981' : n.sentiment === 'bearish' ? '#ef4444' : '#94a3b8';
                const emoji = n.sentiment === 'bullish' ? '🚀' : n.sentiment === 'bearish' ? '📉' : '😐';
                const badge = n.sentiment === 'bullish' ? 'BULLISH' : n.sentiment === 'bearish' ? 'BEARISH' : 'NEUTRAL';
                return `<div style="background:#0a1628;border:1px solid ${clr}33;border-radius:10px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start">
  <div style="font-size:20px;margin-top:2px">${emoji}</div>
  <div style="flex:1;min-width:0">
    <div style="font-size:13px;color:#cbd5e1;line-height:1.4;margin-bottom:6px">${n.title}</div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:10px;font-weight:700;color:${clr};background:${clr}22;padding:2px 8px;border-radius:99px">${badge}</span>
      <div style="flex:1;height:4px;background:#1e293b;border-radius:2px;overflow:hidden">
        <div style="width:${n.score}%;height:100%;background:${clr};border-radius:2px"></div>
      </div>
      <span style="font-size:11px;color:${clr};font-weight:600">${n.score}</span>
    </div>
  </div>
</div>`;
            }).join('');

            body.innerHTML = `
<div style="background:#0a1628;border:1px solid #1e3a5f;border-radius:10px;padding:12px 16px;margin-bottom:4px">
  <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">Sentiment Keseluruhan</div>
  <div style="display:flex;align-items:center;gap:10px">
    <div style="font-size:20px;font-weight:700;color:${overallClr}">${overallTxt}</div>
    <div style="flex:1;height:8px;background:#1e293b;border-radius:4px;overflow:hidden;display:flex">
      <div style="width:${bullPct}%;background:#10b981"></div>
      <div style="width:${bearPct}%;background:#ef4444"></div>
    </div>
  </div>
  <div style="font-size:11px;color:#64748b;margin-top:6px">🚀 ${bulls} Bullish · 📉 ${bears} Bearish · 😐 ${neutrals} Neutral</div>
  ${d.cached ? '<div style="font-size:10px;color:#475569;margin-top:4px">📦 Data dari cache</div>' : ''}
</div>
${items}`;
        } catch (e) {
            body.innerHTML = `<div style="text-align:center;color:#ef4444;padding:40px 0">❌ Error: ${e.message}</div>`;
        }
    }

    return { init, openModal, closeModal, refresh };
})();
