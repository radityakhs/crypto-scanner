/**
 * Risk Calculator UI — Hitung lot size, R:R ratio, risk %
 */
const RiskCalc = (() => {
    function injectStyles() {
        if (document.getElementById('rc-styles')) return;
        const s = document.createElement('style');
        s.id = 'rc-styles';
        s.textContent = `
#rc-modal-overlay { display:none; position:fixed; inset:0; z-index:10002;
    background:rgba(0,0,0,.75); backdrop-filter:blur(4px);
    align-items:center; justify-content:center; padding:16px; }
#rc-modal-overlay.open { display:flex !important; }
#rc-modal { width:min(540px,100%); max-height:88vh;
    background:#0a0e1a; border:1px solid #1e3a5f;
    border-radius:16px; overflow:hidden; display:flex; flex-direction:column;
    box-shadow:0 24px 60px #00000088; }
.rc-header { padding:14px 18px; background:linear-gradient(135deg,#0a0f1e,#0d1b2e);
    border-bottom:1px solid #1e3a5f; display:flex; align-items:center; gap:10px; flex-shrink:0; }
.rc-header h3 { margin:0; font-size:15px; font-weight:700; color:#e2e8f0; flex:1; }
.rc-close-btn { background:none; border:none; color:#64748b; font-size:20px; cursor:pointer; }
.rc-close-btn:hover { color:#e2e8f0; }
.rc-body { padding:20px; overflow-y:auto; flex:1; }
.rc-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
@media(max-width:440px){ .rc-grid { grid-template-columns:1fr; } }
.rc-field { display:flex; flex-direction:column; gap:4px; }
.rc-label { font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:.06em; }
.rc-input-wrap { position:relative; }
.rc-input { width:100%; background:#111827; border:1px solid #374151; border-radius:8px;
    padding:9px 36px 9px 12px; color:#e2e8f0; font-size:14px; outline:none; box-sizing:border-box; }
.rc-input:focus { border-color:#3b82f6; }
.rc-input-suffix { position:absolute; right:10px; top:50%; transform:translateY(-50%);
    font-size:12px; color:#64748b; pointer-events:none; }
.rc-results { margin-top:18px; display:none; }
.rc-results.show { display:block; }
.rc-results-title { font-size:12px; color:#64748b; text-transform:uppercase;
    letter-spacing:.08em; font-weight:700; margin-bottom:10px; }
.rc-result-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; margin-bottom:14px; }
.rc-result-card { background:#111827; border:1px solid #1e293b; border-radius:10px; padding:12px; text-align:center; }
.rc-result-card.highlight { border-color:#3b82f680; background:#1e3a5f33; }
.rc-result-val { font-size:20px; font-weight:900; color:#e2e8f0; }
.rc-result-lbl { font-size:11px; color:#64748b; margin-top:3px; }
.rc-rr-section { background:#111827; border:1px solid #1e293b; border-radius:10px; padding:14px; margin-bottom:14px; }
.rc-rr-title { font-size:12px; color:#94a3b8; margin-bottom:8px; }
.rc-rr-bar-bg { height:10px; background:#1e293b; border-radius:5px; overflow:hidden; margin-bottom:6px; }
.rc-rr-bar { height:100%; border-radius:5px; transition:width .4s; }
.rc-rr-labels { display:flex; justify-content:space-between; font-size:10px; color:#475569; }
.rc-summary { background:linear-gradient(135deg,#0f172a,#111827); border:1px solid #1e293b;
    border-radius:10px; padding:14px; font-size:12px; color:#94a3b8; line-height:1.8; }
.rc-summary b { color:#e2e8f0; }
.rc-summary .rc-verdict { font-size:14px; font-weight:800; margin-bottom:6px; }
.rc-lev-warn { background:#450a0a; border:1px solid #dc262655; border-radius:8px;
    padding:8px 12px; font-size:11px; color:#f87171; margin-top:10px; display:none; }
        `;
        document.head.appendChild(s);
    }

    function injectModal() {
        if (document.getElementById('rc-modal-overlay')) return;
        const div = document.createElement('div');
        div.id = 'rc-modal-overlay';
        div.onclick = (e) => { if (e.target === div) RiskCalc.closeModal(); };
        div.innerHTML = `
        <div id="rc-modal">
            <div class="rc-header">
                <h3>🎯 Risk Calculator</h3>
                <button class="rc-close-btn" onclick="RiskCalc.closeModal()">✕</button>
            </div>
            <div class="rc-body">
                <div class="rc-grid">
                    <div class="rc-field">
                        <div class="rc-label">Modal Trading ($)</div>
                        <div class="rc-input-wrap">
                            <input id="rc-capital" class="rc-input" type="number" placeholder="1000" value="1000" oninput="RiskCalc.calc()"/>
                            <span class="rc-input-suffix">$</span>
                        </div>
                    </div>
                    <div class="rc-field">
                        <div class="rc-label">Risk Per Trade (%)</div>
                        <div class="rc-input-wrap">
                            <input id="rc-risk-pct" class="rc-input" type="number" placeholder="2" value="2" step="0.5" oninput="RiskCalc.calc()"/>
                            <span class="rc-input-suffix">%</span>
                        </div>
                    </div>
                    <div class="rc-field">
                        <div class="rc-label">Harga Entry ($)</div>
                        <div class="rc-input-wrap">
                            <input id="rc-entry" class="rc-input" type="number" placeholder="80000" oninput="RiskCalc.calc()"/>
                            <span class="rc-input-suffix">$</span>
                        </div>
                    </div>
                    <div class="rc-field">
                        <div class="rc-label">Stop Loss ($)</div>
                        <div class="rc-input-wrap">
                            <input id="rc-sl" class="rc-input" type="number" placeholder="78000" oninput="RiskCalc.calc()"/>
                            <span class="rc-input-suffix">$</span>
                        </div>
                    </div>
                    <div class="rc-field">
                        <div class="rc-label">Take Profit ($)</div>
                        <div class="rc-input-wrap">
                            <input id="rc-tp" class="rc-input" type="number" placeholder="84000" oninput="RiskCalc.calc()"/>
                            <span class="rc-input-suffix">$</span>
                        </div>
                    </div>
                    <div class="rc-field">
                        <div class="rc-label">Leverage (opsional)</div>
                        <div class="rc-input-wrap">
                            <input id="rc-lev" class="rc-input" type="number" placeholder="1" value="1" min="1" max="100" oninput="RiskCalc.calc()"/>
                            <span class="rc-input-suffix">x</span>
                        </div>
                    </div>
                </div>
                <div id="rc-lev-warn" class="rc-lev-warn">
                    ⚠️ Leverage > 5x — risiko likuidasi sangat tinggi! Gunakan dengan hati-hati.
                </div>
                <div id="rc-results" class="rc-results">
                    <div class="rc-results-title">📊 Hasil Kalkulasi</div>
                    <div class="rc-result-grid">
                        <div class="rc-result-card highlight">
                            <div class="rc-result-val" id="rc-lot-size">—</div>
                            <div class="rc-result-lbl">Ukuran Posisi ($)</div>
                        </div>
                        <div class="rc-result-card highlight">
                            <div class="rc-result-val" id="rc-units">—</div>
                            <div class="rc-result-lbl">Jumlah Unit/Koin</div>
                        </div>
                        <div class="rc-result-card">
                            <div class="rc-result-val" id="rc-risk-dollar">—</div>
                            <div class="rc-result-lbl">Max Kerugian ($)</div>
                        </div>
                        <div class="rc-result-card">
                            <div class="rc-result-val" id="rc-profit">—</div>
                            <div class="rc-result-lbl">Target Profit ($)</div>
                        </div>
                    </div>
                    <div class="rc-rr-section">
                        <div class="rc-rr-title">⚖️ Risk : Reward Ratio</div>
                        <div class="rc-rr-bar-bg"><div class="rc-rr-bar" id="rc-rr-bar" style="width:0%;background:#4ade80"></div></div>
                        <div class="rc-rr-labels"><span>Risk</span><span id="rc-rr-label">—</span><span>Reward</span></div>
                    </div>
                    <div class="rc-summary" id="rc-summary"></div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div);
    }

    function calc() {
        const capital  = parseFloat(document.getElementById('rc-capital')?.value) || 0;
        const riskPct  = parseFloat(document.getElementById('rc-risk-pct')?.value) || 0;
        const entry    = parseFloat(document.getElementById('rc-entry')?.value) || 0;
        const sl       = parseFloat(document.getElementById('rc-sl')?.value) || 0;
        const tp       = parseFloat(document.getElementById('rc-tp')?.value) || 0;
        const leverage = Math.max(1, parseFloat(document.getElementById('rc-lev')?.value) || 1);
        const resultsEl = document.getElementById('rc-results');
        const levWarnEl = document.getElementById('rc-lev-warn');
        if (levWarnEl) levWarnEl.style.display = leverage > 5 ? 'block' : 'none';
        if (!capital || !riskPct || !entry || !sl) { if (resultsEl) resultsEl.classList.remove('show'); return; }
        const riskPerTrade = capital * (riskPct / 100);
        const slPct        = Math.abs((entry - sl) / entry);
        if (slPct === 0) return;
        const lotSize      = (riskPerTrade / slPct) * leverage;
        const units        = lotSize / entry;
        const riskDollar   = riskPerTrade;
        const profitDollar = tp > 0 ? Math.abs(tp - entry) * units : null;
        const rr           = tp > 0 ? Math.abs(tp - entry) / Math.abs(entry - sl) : null;
        const rrBarPct     = rr ? Math.min(100, (rr / (rr + 1)) * 100) : 0;
        const rrColor      = rr >= 2 ? '#4ade80' : rr >= 1 ? '#fbbf24' : '#f87171';
        let verdict = '';
        if      (rr === null) verdict = `<span style="color:#94a3b8">📊 Masukkan TP untuk lihat R:R</span>`;
        else if (rr >= 3)     verdict = `<span style="color:#4ade80">🔥 Excellent! R:R sangat bagus (${rr.toFixed(2)})</span>`;
        else if (rr >= 2)     verdict = `<span style="color:#4ade80">✅ Setup Bagus — R:R ${rr.toFixed(2)}</span>`;
        else if (rr >= 1)     verdict = `<span style="color:#fbbf24">⚠️ R:R cukup — pertimbangkan naikkan TP (${rr.toFixed(2)})</span>`;
        else                  verdict = `<span style="color:#f87171">❌ R:R buruk (${rr?.toFixed(2)}) — perbaiki setup dulu</span>`;
        const isLong      = entry > sl;
        const slPctDisp   = (slPct * 100).toFixed(2);
        const tpPctDisp   = tp > 0 ? (Math.abs(tp - entry) / entry * 100).toFixed(2) : null;
        const set = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };
        set('rc-lot-size',    '$' + lotSize.toLocaleString('en-US', {maximumFractionDigits:2}));
        set('rc-units',       units < 0.0001 ? units.toExponential(3) : units.toFixed(4));
        set('rc-risk-dollar', `<span style="color:#f87171">-$${riskDollar.toFixed(2)}</span>`);
        set('rc-profit',      profitDollar != null ? `<span style="color:#4ade80">+$${profitDollar.toFixed(2)}</span>` : '—');
        const rrBarEl = document.getElementById('rc-rr-bar');
        if (rrBarEl) { rrBarEl.style.width = rrBarPct + '%'; rrBarEl.style.background = rrColor; }
        set('rc-rr-label', rr != null ? `1 : ${rr.toFixed(2)}` : '—');
        set('rc-summary', `
            <div class="rc-verdict">${verdict}</div>
            <b>Arah:</b> ${isLong ? '🟢 LONG (Buy)' : '🔴 SHORT (Sell)'} &nbsp;|&nbsp;
            <b>Modal:</b> $${capital.toLocaleString()} &nbsp;|&nbsp; <b>Risk:</b> ${riskPct}% = $${riskDollar.toFixed(2)}<br>
            <b>Jarak SL:</b> ${slPctDisp}%${tpPctDisp ? ` &nbsp;|&nbsp; <b>Jarak TP:</b> ${tpPctDisp}%` : ''}<br>
            <b>Posisi:</b> $${lotSize.toLocaleString('en-US',{maximumFractionDigits:2})} ${leverage > 1 ? `(leverage ${leverage}x)` : '(spot)'}
        `);
        if (resultsEl) resultsEl.classList.add('show');
    }

    function openModal() {
        injectStyles();
        injectModal();
        document.getElementById('rc-modal-overlay').classList.add('open');
        setTimeout(calc, 50);
    }

    function closeModal() {
        const el = document.getElementById('rc-modal-overlay');
        if (el) el.classList.remove('open');
    }

    function init() { injectStyles(); injectModal(); }

    return { init, openModal, closeModal, calc };
})();
