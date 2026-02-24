// ══════════════════════════════════════════════════════════════════════════════
//  Stock Equity AI Analyst — Institutional Research Edition
//  Powered by Google Gemini · IDX + US Markets
//  Quantitative Finance · Valuation · Market Microstructure · Macro
// ══════════════════════════════════════════════════════════════════════════════

const stockEquityAI = (() => {
    'use strict';

    // ── Gemini endpoint ────────────────────────────────────────────────────────
    const GEMINI_MODEL = 'gemini-2.0-flash';
    const GEMINI_URL   = (k) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${k}`;

    // ── System Prompt — Institutional Equity Research AI ──────────────────────
    const SYSTEM_PROMPT = `You are an institutional-grade equity research AI trained in quantitative finance, macroeconomics, valuation modeling, and market microstructure analysis.

Rules:
- You do not hallucinate missing data.
- You rely strictly on provided inputs.
- If data is insufficient, state "insufficient_data".
- You think probabilistically and structurally.
- You provide numeric probabilities (0–100 only).
- You output STRICT JSON only.
- No markdown.
- No explanations outside JSON.
- Confidence score must reflect internal consistency of metrics.
- You do not provide financial advice, only analytical output.
- All narrative fields (summary, risks, catalysts) must be in simple Indonesian language.

Step 1 — Valuation Assessment:
- PEG Ratio: if P/E and EPS growth are available, calculate PEG = P/E ÷ growth_rate
- Price vs 52W range: calculate position percentile (0=52W low, 100=52W high)
- Relative valuation: compare P/E vs sector average
- Dividend attractiveness: dividend yield vs risk-free rate proxy (IDR: 6.5%, USD: 5.3%)

Step 2 — Momentum & Technical:
- 1-day change momentum: classify as strong/moderate/weak/negative
- Volume vs average: abnormal volume = signal of institutional activity
- Beta interpretation: high beta (>1.5) = volatile, low beta (<0.7) = defensive

Step 3 — Quality Scoring (0-100):
- Profitability Score: based on ROE, EPS positivity
- Financial Health Score: based on D/E ratio
- Valuation Score: based on P/E relative to sector norms
- Momentum Score: based on price change + volume activity
- Composite Quality Score: weighted average of above

Step 4 — Structural Classification (pick ONE):
A) value_play — undervalued vs fundamentals, margin of safety present
B) growth_momentum — strong earnings growth + positive price action
C) dividend_income — high yield, stable earnings, defensive characteristics
D) turnaround_candidate — depressed price, recovery potential, elevated risk
E) speculative_position — high beta, loss-making or volatile fundamentals
F) overvalued_caution — stretched valuation vs peers, limited upside

Step 5 — Probability Estimates (0-100):
- prob_outperform_3m: probability of outperforming sector index in 3 months
- prob_outperform_12m: probability of outperforming in 12 months
- prob_positive_return_3m: probability of positive return in 3 months
- prob_drawdown_10pct: probability of 10%+ drawdown from current price
- prob_dividend_cut: probability of dividend cut (if applicable)

Step 6 — Capital Allocation Bias (pick ONE):
- strong_buy: high conviction, significant upside, strong fundamentals
- accumulate: good risk/reward, buy on dips, moderate conviction
- hold: fairly valued, no new position trigger
- reduce: stretched valuation or deteriorating fundamentals, trim
- avoid: weak fundamentals, high downside risk

Output STRICT JSON only — no markdown, no text outside JSON:
{
  "ticker": "SYMBOL",
  "company": "Full Name",
  "market": "IDX|NYSE|NASDAQ",
  "sector": "...",
  "currency": "IDR|USD",
  "timestamp": <unix seconds>,
  "analysis_date": "YYYY-MM-DD",

  "valuation": {
    "pe_ratio": <float or "insufficient_data">,
    "pe_assessment": "cheap|fair|expensive|extreme|n_a",
    "pe_vs_sector": "discount|inline|premium|extreme_premium",
    "peg_ratio": <float or "insufficient_data">,
    "price_vs_52w_percentile": <0-100>,
    "div_yield_attractiveness": "high|moderate|low|none",
    "intrinsic_value_bias": "undervalued|fairly_valued|overvalued|data_insufficient"
  },

  "quality_scores": {
    "profitability": <0-100 or "insufficient_data">,
    "financial_health": <0-100 or "insufficient_data">,
    "valuation_score": <0-100 or "insufficient_data">,
    "momentum": <0-100 or "insufficient_data">,
    "composite_quality": <0-100 or "insufficient_data">
  },

  "momentum_analysis": {
    "price_trend_1d": "STRONG_UP|UP|FLAT|DOWN|STRONG_DOWN",
    "volume_signal": "ABNORMAL_HIGH|ABOVE_AVERAGE|NORMAL|BELOW_AVERAGE",
    "beta_category": "very_volatile|volatile|moderate|defensive|very_defensive",
    "institutional_activity_signal": "accumulation|neutral|distribution",
    "52w_position": "near_high|upper_half|middle|lower_half|near_low"
  },

  "structural_classification": "value_play|growth_momentum|dividend_income|turnaround_candidate|speculative_position|overvalued_caution",
  "structural_confidence": <0-100>,
  "structural_reasoning": "<2 sentences max, factual, in Indonesian>",

  "probabilities": {
    "prob_outperform_3m": <0-100>,
    "prob_outperform_12m": <0-100>,
    "prob_positive_return_3m": <0-100>,
    "prob_drawdown_10pct": <0-100>,
    "prob_dividend_cut": <0-100 or "not_applicable">
  },

  "capital_allocation": "strong_buy|accumulate|hold|reduce|avoid",
  "capital_reasoning": "<1 sentence in Indonesian>",

  "price_targets": {
    "bull_case": <float or "insufficient_data">,
    "base_case": <float or "insufficient_data">,
    "bear_case": <float or "insufficient_data">,
    "methodology": "<brief method used, e.g. P/E rerating, DCF proxy>"
  },

  "overall_verdict": "STRONG_BUY|BUY|ACCUMULATE|HOLD|REDUCE|AVOID|INSUFFICIENT_DATA",
  "verdict_confidence": <0-100>,
  "risk_level": "HIGH|MEDIUM|LOW",
  "return_potential": "HIGH|MODERATE|LOW|NEGATIVE",

  "key_risks": ["<risk 1 in Indonesian>", "<risk 2 in Indonesian>", "<risk 3 in Indonesian>"],
  "key_catalysts": ["<catalyst 1 in Indonesian>", "<catalyst 2 in Indonesian>", "<catalyst 3 in Indonesian>"],
  "analyst_summary": "<3-4 kalimat dalam bahasa Indonesia yang mudah dipahami orang awam. Jelaskan kondisi fundamental, valuasi, dan outlook saham ini.>"
}`;

    // ── Sector P/E benchmarks ──────────────────────────────────────────────────
    const SECTOR_PE = {
        // IDX
        Banking: 10, Infrastructure: 15, Consumer: 18, Mining: 8, Technology: 25,
        Healthcare: 22, Property: 9, Financials: 12,
        // US
        Industrials: 20, Energy: 14,
    };

    // ── State ──────────────────────────────────────────────────────────────────
    let _currentStock  = null;
    let _currentMarket = null;
    let _isLoading     = false;

    // ── Build payload from stock record ───────────────────────────────────────
    function _buildPayload(stock, market) {
        const na = 'insufficient_data';
        const sectorPE = SECTOR_PE[stock.sector] ?? 18;

        // 52W position percentile
        const range = stock.w52h - stock.w52l;
        const pct52w = range > 0 ? Math.round(((stock.price - stock.w52l) / range) * 100) : na;

        // Volume signal (rough heuristic — avg daily vol estimate)
        // We don't have historical avg; use mktcap / price as proxy for float
        const float_est = stock.mktcapRaw / stock.price;
        const turnover_pct = float_est > 0 ? (stock.volume / float_est) * 100 : null;
        let volume_signal = na;
        if (turnover_pct !== null) {
            if (turnover_pct > 5)       volume_signal = 'ABNORMAL_HIGH';
            else if (turnover_pct > 2)  volume_signal = 'ABOVE_AVERAGE';
            else if (turnover_pct > 0.5)volume_signal = 'NORMAL';
            else                         volume_signal = 'BELOW_AVERAGE';
        }

        return {
            ticker:   stock.symbol,
            company:  stock.name,
            market:   market === 'us' ? (stock.exchange || 'US') : 'IDX',
            sector:   stock.sector,
            currency: stock.currency || (market === 'us' ? 'USD' : 'IDR'),
            price: {
                current:     stock.price,
                change_1d_pct: stock.change,
                week52_high: stock.w52h  ?? na,
                week52_low:  stock.w52l  ?? na,
                pct_vs_52w_range: pct52w,
            },
            market_data: {
                market_cap:         stock.mktcap,
                market_cap_raw:     stock.mktcapRaw ?? na,
                volume_today:       stock.volume,
                exchange:           stock.exchange  ?? (market === 'idx' ? 'IDX' : na),
                turnover_pct_float: turnover_pct !== null ? parseFloat(turnover_pct.toFixed(3)) : na,
                volume_signal,
            },
            fundamentals: {
                pe_ratio:         stock.pe   ?? na,
                eps_ttm:          stock.eps  ?? na,
                roe_pct:          stock.roe  ?? na,
                debt_equity:      stock.der  ?? na,
                dividend_yield_pct: stock.div ?? na,
                beta:             stock.beta  ?? na,
                sector_avg_pe:    sectorPE,
                pe_vs_sector_pct: stock.pe ? parseFloat(((stock.pe / sectorPE - 1) * 100).toFixed(1)) : na,
            },
            context: {
                analysis_date: new Date().toISOString().split('T')[0],
                market_environment: market === 'idx'
                    ? 'Indonesia Stock Exchange — emerging market, IDR denomination, domestic macro exposure'
                    : 'US equity market — developed market, USD denomination, global macro exposure',
                risk_free_rate_pct: market === 'idx' ? 6.5 : 5.3,
                analyst_note: 'Use only provided data. Do not hallucinate missing financials.',
            }
        };
    }

    // ── Call Gemini ────────────────────────────────────────────────────────────
    async function _callGemini(apiKey, payload) {
        const userMsg =
            `Analyze this equity using ONLY the provided data. Output strict JSON only:\n\n`
            + JSON.stringify(payload, null, 2);

        const body = {
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userMsg }] }],
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                maxOutputTokens: 2500,
                responseMimeType: 'application/json',
            }
        };

        const resp = await fetch(GEMINI_URL(apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err?.error?.message || `HTTP ${resp.status}`);
        }

        const data    = await resp.json();
        const raw     = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
        return JSON.parse(cleaned);
    }

    // ── Public: open AI panel for a stock ─────────────────────────────────────
    function openPanel(market, symbol) {
        const allData = market === 'idx'
            ? (typeof IDX_STOCKS_DATA !== 'undefined' ? IDX_STOCKS_DATA : [])
            : (typeof US_STOCKS_DATA  !== 'undefined' ? US_STOCKS_DATA  : []);
        const stock = allData.find(s => s.symbol === symbol);
        if (!stock) return;

        _currentStock  = stock;
        _currentMarket = market;

        // Show the analysis section
        const sectionId   = market === 'idx' ? 'idxAnalysisSection' : 'usAnalysisSection';
        const containerId = market === 'idx' ? 'idxAnalysisContainer' : 'usAnalysisContainer';
        const section     = document.getElementById(sectionId);
        const container   = document.getElementById(containerId);
        if (!section || !container) return;

        section.style.display = 'block';
        container.innerHTML   = _renderPanel(stock, market, null, false);
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── Public: trigger analysis ───────────────────────────────────────────────
    async function analyze(market, symbol) {
        if (_isLoading) return;

        const keyId   = market === 'idx' ? 'idxEquityAiKey' : 'usEquityAiKey';
        const keyEl   = document.getElementById(keyId);
        const apiKey  = keyEl ? keyEl.value.trim() : '';

        // Also fall back to DEX Analyzer saved key
        const savedKey = apiKey || sessionStorage.getItem('hf_gemini_key') || '';
        if (!savedKey) {
            _updateContainer(market, symbol,
                `<div class="eqai-error">⚠️ Masukkan Gemini API Key. Gratis di: <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a></div>`);
            return;
        }
        if (keyEl && savedKey) keyEl.value = savedKey;

        const allData = market === 'idx' ? IDX_STOCKS_DATA : US_STOCKS_DATA;
        const stock   = allData.find(s => s.symbol === symbol);
        if (!stock) return;

        _currentStock  = stock;
        _currentMarket = market;

        _isLoading = true;
        const containerId = market === 'idx' ? 'idxAnalysisContainer' : 'usAnalysisContainer';
        const container   = document.getElementById(containerId);
        if (container) {
            container.innerHTML = _renderPanel(stock, market, null, true);
        }

        try {
            const payload = _buildPayload(stock, market);
            const result  = await _callGemini(savedKey, payload);
            sessionStorage.setItem('hf_gemini_key', savedKey);
            if (container) {
                container.innerHTML = _renderPanel(stock, market, result, false);
            }
        } catch (e) {
            _updateContainer(market, symbol,
                `<div class="eqai-error">❌ Gagal: ${e.message}</div>`);
        } finally {
            _isLoading = false;
        }
    }

    function _updateContainer(market, symbol, html) {
        const containerId = market === 'idx' ? 'idxAnalysisContainer' : 'usAnalysisContainer';
        const container   = document.getElementById(containerId);
        if (container) container.insertAdjacentHTML('beforeend', html);
    }

    // ── Render Panel ───────────────────────────────────────────────────────────
    function _renderPanel(stock, market, result, loading) {
        const isCurrency = market === 'idx';
        const priceStr   = isCurrency
            ? `Rp ${stock.price.toLocaleString('id-ID')}`
            : `$${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const chColor    = stock.change >= 0 ? '#4ade80' : '#f87171';
        const chSign     = stock.change >= 0 ? '+' : '';
        const savedKey   = sessionStorage.getItem('hf_gemini_key') || '';

        // Key input area
        const keyId = market === 'idx' ? 'idxEquityAiKey' : 'usEquityAiKey';
        const keyInput = `
        <div class="eqai-key-row">
            <span class="eqai-key-label">🔑 Gemini API Key</span>
            <input class="eqai-key-input" id="${keyId}" type="password"
                   placeholder="AIza..." value="${savedKey}"
                   onkeydown="if(event.key==='Enter')stockEquityAI.analyze('${market}','${stock.symbol}')">
            <a class="eqai-key-link" href="https://aistudio.google.com" target="_blank" rel="noopener">Gratis →</a>
        </div>`;

        // Header
        const header = `
        <div class="eqai-header">
            <div class="eqai-header-left">
                <div class="eqai-ticker">${stock.symbol}</div>
                <div class="eqai-company">${stock.name}</div>
                <div class="eqai-meta">
                    ${stock.exchange ? `<span class="eqai-badge eqai-badge--exchange">${stock.exchange}</span>` : '<span class="eqai-badge eqai-badge--exchange">IDX</span>'}
                    <span class="eqai-badge eqai-badge--sector">${stock.sector}</span>
                </div>
            </div>
            <div class="eqai-header-right">
                <div class="eqai-price">${priceStr}</div>
                <div class="eqai-change" style="color:${chColor}">${chSign}${stock.change.toFixed(2)}% (1D)</div>
                <div class="eqai-mktcap">MCap: ${stock.mktcap}</div>
            </div>
        </div>`;

        // Quick fundamentals strip
        const pe    = stock.pe   != null ? `${stock.pe}×` : 'N/A';
        const eps   = stock.eps  != null ? (isCurrency ? `Rp${stock.eps}` : `$${stock.eps}`) : 'N/A';
        const roe   = stock.roe  != null ? `${stock.roe}%` : 'N/A';
        const der   = stock.der  != null ? `${stock.der}` : 'N/A';
        const div   = stock.div  != null ? `${stock.div}%` : 'N/A';
        const beta  = stock.beta != null ? `${stock.beta}` : 'N/A';
        const w52   = stock.w52h && stock.w52l
            ? `${isCurrency?'Rp':'$'}${stock.w52l.toLocaleString()} – ${isCurrency?'Rp':'$'}${stock.w52h.toLocaleString()}`
            : 'N/A';
        const range = stock.w52h && stock.w52l ? stock.w52h - stock.w52l : 0;
        const pos52 = range > 0 ? ((stock.price - stock.w52l) / range * 100).toFixed(0) : 0;

        const fundsStrip = `
        <div class="eqai-funds-strip">
            <div class="eqai-fund-item"><span class="eqai-fund-lbl">P/E</span><span class="eqai-fund-val">${pe}</span></div>
            <div class="eqai-fund-item"><span class="eqai-fund-lbl">EPS</span><span class="eqai-fund-val">${eps}</span></div>
            <div class="eqai-fund-item"><span class="eqai-fund-lbl">ROE</span><span class="eqai-fund-val" style="color:${stock.roe>20?'#4ade80':stock.roe>10?'#fbbf24':'#f87171'}">${roe}</span></div>
            <div class="eqai-fund-item"><span class="eqai-fund-lbl">D/E</span><span class="eqai-fund-val">${der}</span></div>
            <div class="eqai-fund-item"><span class="eqai-fund-lbl">Dividen</span><span class="eqai-fund-val" style="color:#60a5fa">${div}</span></div>
            <div class="eqai-fund-item"><span class="eqai-fund-lbl">Beta</span><span class="eqai-fund-val">${beta}</span></div>
            <div class="eqai-fund-item eqai-fund-item--wide">
                <span class="eqai-fund-lbl">52W Range</span>
                <span class="eqai-fund-val" style="font-size:0.7rem">${w52}</span>
                <div class="eqai-52w-bar"><div class="eqai-52w-fill" style="width:${pos52}%"></div></div>
            </div>
        </div>`;

        // Analyze button
        const analyzeBtn = `
        <button class="eqai-analyze-btn ${loading ? 'eqai-analyze-btn--loading' : ''}"
                onclick="stockEquityAI.analyze('${market}','${stock.symbol}')"
                ${loading ? 'disabled' : ''}>
            ${loading
                ? '<span class="g-spinner" style="width:14px;height:14px;border-width:2px"></span> Menganalisis…'
                : '⚡ Analisis AI Sekarang'}
        </button>`;

        // Result rendering
        let resultHtml = '';
        if (loading) {
            resultHtml = `
            <div class="eqai-loading">
                <span class="g-spinner"></span>
                <span>Meminta analisis institutional-grade dari AI… (~5-10 detik)</span>
            </div>`;
        } else if (result) {
            resultHtml = _renderResult(result, stock, isCurrency);
        } else {
            resultHtml = `
            <div class="eqai-placeholder">
                <div class="eqai-placeholder-icon">📊</div>
                <div class="eqai-placeholder-text">Klik <strong>Analisis AI</strong> untuk mendapatkan riset ekuitas institutional-grade dari Gemini AI.</div>
                <div class="eqai-placeholder-sub">Analisis mencakup: valuasi, kualitas fundamental, momentum, probabilitas return, risiko & katalis.</div>
            </div>`;
        }

        return `
        <div class="eqai-panel">
            ${header}
            ${fundsStrip}
            ${keyInput}
            ${analyzeBtn}
            <div class="eqai-result" id="eqaiResult_${market}_${stock.symbol}">
                ${resultHtml}
            </div>
        </div>`;
    }

    // ── Render AI Result ───────────────────────────────────────────────────────
    function _renderResult(r, stock, isCurrency) {
        const na = (v) => v == null || v === 'insufficient_data' ? '—' : v;

        // Verdict
        const VERDICT_META = {
            STRONG_BUY:        { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', icon: '🚀', label: 'STRONG BUY' },
            BUY:               { color: '#86efac', bg: 'rgba(134,239,172,0.1)',  icon: '📈', label: 'BUY' },
            ACCUMULATE:        { color: '#34d399', bg: 'rgba(52,211,153,0.1)',   icon: '✅', label: 'ACCUMULATE' },
            HOLD:              { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   icon: '🔵', label: 'HOLD' },
            REDUCE:            { color: '#fb923c', bg: 'rgba(251,146,60,0.1)',   icon: '⚠️', label: 'REDUCE' },
            AVOID:             { color: '#f87171', bg: 'rgba(248,113,113,0.12)', icon: '🚫', label: 'AVOID' },
            INSUFFICIENT_DATA: { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',icon: '❓', label: 'DATA KURANG' },
        };
        const vm = VERDICT_META[r.overall_verdict] || VERDICT_META.INSUFFICIENT_DATA;

        // Capital allocation map
        const CAP_META = {
            strong_buy: { icon: '🔥', label: 'Masuk Besar', color: '#4ade80' },
            accumulate: { icon: '✅', label: 'Akumulasi', color: '#34d399' },
            hold:       { icon: '👁️', label: 'Tahan', color: '#fbbf24' },
            reduce:     { icon: '🛡️', label: 'Kurangi', color: '#fb923c' },
            avoid:      { icon: '🚫', label: 'Hindari', color: '#f87171' },
        };
        const capM = CAP_META[r.capital_allocation] || { icon: '—', label: r.capital_allocation, color: '#94a3b8' };

        // Structural classification map
        const STRUCT_META = {
            value_play:          { icon: '💎', color: '#fbbf24', label: 'Value Play' },
            growth_momentum:     { icon: '🚀', color: '#4ade80', label: 'Growth Momentum' },
            dividend_income:     { icon: '💰', color: '#60a5fa', label: 'Dividend Income' },
            turnaround_candidate:{ icon: '🔄', color: '#a78bfa', label: 'Turnaround' },
            speculative_position:{ icon: '🎲', color: '#f97316', label: 'Spekulatif' },
            overvalued_caution:  { icon: '⚠️', color: '#f87171', label: 'Overvalued' },
        };
        const stM = STRUCT_META[r.structural_classification] || { icon: '📊', color: '#94a3b8', label: r.structural_classification };

        // Quality scores
        const qs = r.quality_scores || {};
        const scoreBar = (val, label, color) => {
            const v = typeof val === 'number' ? val : 0;
            const isNA = val === 'insufficient_data' || val == null;
            return `
            <div class="eqai-score-row">
                <span class="eqai-score-lbl">${label}</span>
                <div class="eqai-score-bar-wrap">
                    <div class="eqai-score-bar" style="width:${isNA?0:v}%;background:${color}"></div>
                </div>
                <span class="eqai-score-num" style="color:${color}">${isNA?'—':v}</span>
            </div>`;
        };

        const compositeColor = (v) => {
            if (typeof v !== 'number') return '#94a3b8';
            return v >= 75 ? '#4ade80' : v >= 55 ? '#fbbf24' : v >= 35 ? '#fb923c' : '#f87171';
        };
        const compQ = qs.composite_quality;
        const compColor = compositeColor(compQ);

        // Price targets
        const pt = r.price_targets || {};
        const fmtPrice = (v) => {
            if (v === 'insufficient_data' || v == null) return '—';
            return isCurrency
                ? `Rp ${Number(v).toLocaleString('id-ID')}`
                : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        };

        // Probabilities
        const pr = r.probabilities || {};
        const probBar = (val, label, danger) => {
            const v = typeof val === 'number' ? val : 0;
            const isNA = val === 'insufficient_data' || val == null || val === 'not_applicable';
            const barColor = danger
                ? (v > 50 ? '#f87171' : v > 30 ? '#fb923c' : '#4ade80')
                : (v > 65 ? '#4ade80' : v > 45 ? '#fbbf24' : '#f87171');
            return `
            <div class="eqai-prob-row">
                <span class="eqai-prob-lbl">${label}</span>
                <div class="eqai-prob-bar-wrap">
                    <div class="eqai-prob-bar" style="width:${isNA?0:v}%;background:${barColor}"></div>
                </div>
                <span class="eqai-prob-num" style="color:${barColor}">${isNA?'N/A':v+'%'}</span>
            </div>`;
        };

        // Valuation
        const val = r.valuation || {};
        const IVB_COLOR = {
            undervalued: '#4ade80', fairly_valued: '#fbbf24',
            overvalued: '#f87171', data_insufficient: '#94a3b8',
        };
        const ivbColor = IVB_COLOR[val.intrinsic_value_bias] || '#94a3b8';

        // Momentum
        const mom = r.momentum_analysis || {};
        const TREND_COLOR = {
            STRONG_UP:'#4ade80', UP:'#86efac', FLAT:'#94a3b8',
            DOWN:'#fca5a5', STRONG_DOWN:'#f87171',
        };
        const trendColor = TREND_COLOR[mom.price_trend_1d] || '#94a3b8';

        // Risk/Catalysts
        const risks = (r.key_risks || []).slice(0, 4);
        const cats  = (r.key_catalysts || []).slice(0, 4);

        return `
        <!-- Verdict Banner -->
        <div class="eqai-verdict-banner" style="background:${vm.bg};border-color:${vm.color}30">
            <span class="eqai-verdict-icon">${vm.icon}</span>
            <div class="eqai-verdict-center">
                <span class="eqai-verdict-label" style="color:${vm.color}">${vm.label}</span>
                <span class="eqai-verdict-conf">Keyakinan ${na(r.verdict_confidence)}%</span>
            </div>
            <div class="eqai-verdict-right">
                <span class="eqai-cap-alloc" style="color:${capM.color}">${capM.icon} ${capM.label}</span>
                <span class="eqai-risk-pill risk-${(r.risk_level||'').toLowerCase()}">${r.risk_level || '—'}</span>
            </div>
        </div>

        <!-- Structural Classification -->
        <div class="eqai-struct-card" style="border-color:${stM.color}30;background:${stM.color}0a">
            <span class="eqai-struct-icon">${stM.icon}</span>
            <div class="eqai-struct-info">
                <div class="eqai-struct-label" style="color:${stM.color}">${stM.label}</div>
                <div class="eqai-struct-reasoning">${na(r.structural_reasoning)}</div>
            </div>
            <span class="eqai-struct-conf">${na(r.structural_confidence)}%</span>
        </div>

        <!-- Main Grid: Quality + Valuation + Momentum -->
        <div class="eqai-main-grid">

            <!-- Quality Scores -->
            <div class="eqai-section-card">
                <div class="eqai-section-title">📊 Quality Score</div>
                <div class="eqai-composite-ring">
                    <span class="eqai-composite-val" style="color:${compColor}">${typeof compQ === 'number' ? compQ : '—'}</span>
                    <span class="eqai-composite-lbl">/100</span>
                </div>
                ${scoreBar(qs.profitability,    '💹 Profitabilitas', '#4ade80')}
                ${scoreBar(qs.financial_health, '🏦 Kesehatan Keuangan', '#60a5fa')}
                ${scoreBar(qs.valuation_score,  '⚖️ Valuasi', '#fbbf24')}
                ${scoreBar(qs.momentum,         '⚡ Momentum', '#a78bfa')}
            </div>

            <!-- Valuation -->
            <div class="eqai-section-card">
                <div class="eqai-section-title">💰 Valuasi</div>
                <div class="eqai-val-grid">
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">P/E Assessment</span>
                        <span class="eqai-val-val">${na(val.pe_assessment)?.replace('_',' ')}</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">P/E vs Sektor</span>
                        <span class="eqai-val-val">${na(val.pe_vs_sector)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">PEG Ratio</span>
                        <span class="eqai-val-val">${na(val.peg_ratio)}</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">Posisi 52W</span>
                        <span class="eqai-val-val">${na(val.price_vs_52w_percentile)}%</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">Yield Dividen</span>
                        <span class="eqai-val-val">${na(val.div_yield_attractiveness)}</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">Intrinsic Bias</span>
                        <span class="eqai-val-val" style="color:${ivbColor}">${na(val.intrinsic_value_bias)?.replace(/_/g,' ')}</span>
                    </div>
                </div>
            </div>

            <!-- Momentum -->
            <div class="eqai-section-card">
                <div class="eqai-section-title">⚡ Momentum</div>
                <div class="eqai-mom-list">
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Tren 1D</span>
                        <span class="eqai-mom-val" style="color:${trendColor}">${na(mom.price_trend_1d)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Volume Signal</span>
                        <span class="eqai-mom-val">${na(mom.volume_signal)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Kategori Beta</span>
                        <span class="eqai-mom-val">${na(mom.beta_category)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Aktivitas Institusi</span>
                        <span class="eqai-mom-val">${na(mom.institutional_activity_signal)}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Posisi 52W</span>
                        <span class="eqai-mom-val">${na(mom['52w_position'])?.replace(/_/g,' ')}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Price Targets -->
        <div class="eqai-targets-row">
            <div class="eqai-section-title" style="margin-bottom:10px">🎯 Price Target (12M)</div>
            <div class="eqai-targets-grid">
                <div class="eqai-target-item eqai-target--bear">
                    <span class="eqai-target-lbl">🐻 Bear Case</span>
                    <span class="eqai-target-val">${fmtPrice(pt.bear_case)}</span>
                </div>
                <div class="eqai-target-item eqai-target--base">
                    <span class="eqai-target-lbl">📊 Base Case</span>
                    <span class="eqai-target-val">${fmtPrice(pt.base_case)}</span>
                </div>
                <div class="eqai-target-item eqai-target--bull">
                    <span class="eqai-target-lbl">🐂 Bull Case</span>
                    <span class="eqai-target-val">${fmtPrice(pt.bull_case)}</span>
                </div>
            </div>
            ${pt.methodology ? `<div class="eqai-target-method">Metode: ${pt.methodology}</div>` : ''}
        </div>

        <!-- Probabilities -->
        <div class="eqai-section-card" style="margin-top:12px">
            <div class="eqai-section-title">🎲 Probabilitas Return</div>
            ${probBar(pr.prob_outperform_3m,     'Outperform Sektor 3M', false)}
            ${probBar(pr.prob_outperform_12m,    'Outperform Sektor 12M', false)}
            ${probBar(pr.prob_positive_return_3m,'Return Positif 3M', false)}
            ${probBar(pr.prob_drawdown_10pct,    'Risiko Drawdown 10%+', true)}
            ${probBar(pr.prob_dividend_cut,      'Risiko Potong Dividen', true)}
        </div>

        <!-- Risks & Catalysts -->
        <div class="eqai-rc-grid">
            <div class="eqai-section-card eqai-risks">
                <div class="eqai-section-title">⚠️ Key Risks</div>
                <ul class="eqai-list eqai-list--risks">
                    ${risks.map(r => `<li>${r}</li>`).join('') || '<li style="color:#64748b">—</li>'}
                </ul>
            </div>
            <div class="eqai-section-card eqai-catalysts">
                <div class="eqai-section-title">💡 Key Catalysts</div>
                <ul class="eqai-list eqai-list--cats">
                    ${cats.map(c => `<li>${c}</li>`).join('') || '<li style="color:#64748b">—</li>'}
                </ul>
            </div>
        </div>

        <!-- Analyst Summary -->
        <div class="eqai-summary-box">
            <div class="eqai-summary-title">🏦 Analyst Summary</div>
            <div class="eqai-summary-body">${na(r.analyst_summary)}</div>
        </div>

        <!-- Capital reasoning -->
        <div class="eqai-cap-reason">
            <span style="color:${capM.color};font-weight:700">${capM.icon} ${capM.label}</span>
            — ${na(r.capital_reasoning)}
        </div>

        <div class="eqai-disclaimer">
            ⚠️ Analisis ini dihasilkan oleh AI berdasarkan data yang tersedia. <strong>Bukan rekomendasi investasi.</strong>
            Selalu lakukan riset mandiri dan konsultasikan dengan advisor keuangan profesional.
        </div>`;
    }

    // ── Public API ─────────────────────────────────────────────────────────────
    return { openPanel, analyze };

})();
