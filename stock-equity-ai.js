// ══════════════════════════════════════════════════════════════════════════════
//  Stock Equity AI Analyst v2 — Institutional Research Edition
//  Powered by Google Gemini · IDX + US Markets
//  Quantitative Finance · Valuation · Technical · Macro · Flow Analysis
// ══════════════════════════════════════════════════════════════════════════════

const stockEquityAI = (() => {
    'use strict';

    const GEMINI_MODEL = 'gemini-2.0-flash';
    const GEMINI_URL   = (k) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${k}`;

    // ── System Prompt v2 ──────────────────────────────────────────────────────
    const SYSTEM_PROMPT = `You are an institutional-grade equity research AI with expertise in quantitative finance, macroeconomics, valuation modeling, market microstructure, and capital allocation.

STRICT RULES:
- Output STRICT JSON only. No markdown. No text outside JSON. No code blocks.
- Use only provided data. Do not hallucinate missing metrics.
- If a field is missing, use "insufficient_data" as the value.
- All narrative fields MUST be in simple Indonesian (bahasa Indonesia), easy for a non-expert to understand.
- Numeric scores: integers 0-100 only.
- Probabilities: integers 0-100 only.

=== ANALYTICAL FRAMEWORK ===

STEP 1 — Six-Dimension Business Evaluation (score each 0-100):
1. Business Quality: ROE, ROA, net margin, competitive moat
2. Earnings Sustainability: EPS growth trend, revenue growth, free cash flow growth
3. Balance Sheet Strength: D/E ratio, interest coverage proxy, leverage risk
4. Valuation Attractiveness: P/E vs industry, P/BV, PEG, EV/EBITDA, intrinsic value gap
5. Technical Structure Strength: RSI, MACD, trend direction, relative strength vs index, volume change
6. Macro Sensitivity: interest rate sensitivity, inflation exposure, GDP cycle dependency

STEP 2 — Structural Classification (pick ONE):
- high_quality_compounder: ROE>20%, consistent earnings growth, strong balance sheet, reasonable valuation
- cyclical_opportunity: sector-driven upside, macro-aligned, earnings recovering
- deep_value: significantly below intrinsic value, asset-backed, depressed sentiment
- overvalued_growth: high growth priced in, stretched multiples (PEG>3 or P/E 40%+ above sector)
- distribution_phase: institutional selling, weakening fundamentals, high downside risk
- structurally_weak: loss-making or margin deterioration, high debt, negative earnings trend

STEP 3 — Probabilities (0-100 integers):
- upside_3_months: probability of price increase in 3 months
- upside_12_months: probability of price increase in 12 months
- downside_risk: probability of 15%+ drawdown from current price
- earnings_deterioration_risk: probability of EPS declining next quarter
- valuation_compression_risk: probability of multiple contraction in next 12 months

STEP 4 — Determine:
- fair_value_status: "undervalued" | "fairly_valued" | "overvalued"
- risk_level: "low" | "medium" | "high" | "extreme"
- capital_allocation_bias: "aggressive_buy" | "moderate_buy" | "accumulate" | "hold" | "reduce" | "avoid"

STEP 5 — Three Core Scores (0-100):
- intrinsic_conviction_score: overall confidence in fundamental value (higher = stronger conviction the stock has intrinsic worth)
- risk_adjusted_alpha_score: expected return relative to risk taken (higher = better risk/reward)
- confidence_score: internal consistency of available data (lower when key fields are missing)

SCORING ADJUSTMENT RULES (apply internally before finalizing):
- PENALIZE: if P/E > 30 AND rate_env = "rising" → reduce intrinsic_conviction_score by 8-15 points
- PENALIZE: if fcf_growth is negative AND der > 1.5 → reduce intrinsic_conviction_score by 10-20 points, increase downside_risk by 10-20
- BOOST risk_adjusted_alpha_score when ALL: roe > 20, rev_growth > 15, der < 1, rel_strength > 0
- BOOST intrinsic_conviction_score when: peg < 1 AND composite quality > 65
- REDUCE confidence_score by 5 for each critical missing field (pe, roe, eps_growth, rev_growth)
- PENALIZE overvalued_growth: if pe_vs_sector_pct > 40% → flag valuation_compression_risk high

STEP 6 — Price Targets (12 months, in local currency):
- bull_case: optimistic scenario (sector re-rating + earnings beat)
- base_case: DCF proxy / earnings growth × fair P/E or P/BV
- bear_case: downside scenario (macro headwind + multiple compression)
- methodology: brief method description

OUTPUT FORMAT — Strict JSON only:
{
  "ticker": "SYMBOL",
  "company": "Full Name",
  "market": "IDX|NYSE|NASDAQ",
  "sector": "...",
  "currency": "IDR|USD",
  "analysis_date": "YYYY-MM-DD",

  "dimension_scores": {
    "business_quality": <0-100>,
    "earnings_sustainability": <0-100>,
    "balance_sheet_strength": <0-100>,
    "valuation_attractiveness": <0-100>,
    "technical_strength": <0-100>,
    "macro_sensitivity": <0-100>,
    "composite": <0-100>
  },

  "valuation": {
    "pe_assessment": "cheap|fair|expensive|extreme|n_a",
    "pe_vs_sector": "discount|inline|premium|extreme_premium",
    "peg_assessment": "attractive|fair|stretched|very_stretched|n_a",
    "pbv_assessment": "deep_value|value|fair|expensive|n_a",
    "ev_ebitda_assessment": "cheap|fair|expensive|n_a",
    "intrinsic_value_bias": "significantly_undervalued|undervalued|fairly_valued|overvalued|significantly_overvalued",
    "fair_value_status": "undervalued|fairly_valued|overvalued"
  },

  "technical": {
    "trend": "strong_uptrend|uptrend|sideways|downtrend|strong_downtrend",
    "rsi_signal": "oversold|neutral|overbought",
    "macd_signal": "bullish|neutral|bearish",
    "volume_momentum": "surging|above_average|normal|below_average|declining",
    "relative_strength_vs_index": "outperforming|inline|underperforming"
  },

  "flow_sentiment": {
    "institutional_bias": "accumulation|neutral|distribution",
    "insider_signal": "bullish|neutral|bearish",
    "news_sentiment": "positive|neutral|negative",
    "smart_money_direction": "buying|neutral|selling"
  },

  "structural_classification": "high_quality_compounder|cyclical_opportunity|deep_value|overvalued_growth|distribution_phase|structurally_weak",
  "structural_confidence": <0-100>,
  "structural_reasoning": "<2 sentences max, factual, Indonesian>",

  "probabilities": {
    "upside_3_months": <0-100>,
    "upside_12_months": <0-100>,
    "downside_risk": <0-100>,
    "earnings_deterioration_risk": <0-100>,
    "valuation_compression_risk": <0-100>
  },

  "capital_allocation_bias": "aggressive_buy|moderate_buy|accumulate|hold|reduce|avoid",
  "capital_reasoning": "<1 sentence Indonesian>",

  "scores": {
    "intrinsic_conviction_score": <0-100>,
    "risk_adjusted_alpha_score": <0-100>,
    "confidence_score": <0-100>
  },

  "risk_level": "low|medium|high|extreme",
  "return_potential": "high|moderate|low|negative",

  "price_targets": {
    "bull_case": <number or "insufficient_data">,
    "base_case": <number or "insufficient_data">,
    "bear_case": <number or "insufficient_data">,
    "methodology": "<brief method>"
  },

  "dimension_reasoning": {
    "business_quality": "<1 kalimat: faktor utama yang mendorong skor ini — ROE/ROA/margin>",
    "earnings_sustainability": "<1 kalimat: tren EPS/revenue/FCF yang menjadi dasar skor>",
    "balance_sheet_strength": "<1 kalimat: kondisi D/E, leverage, dan risiko neraca>",
    "valuation_attractiveness": "<1 kalimat: kenapa valuasi dianggap murah/mahal/wajar berdasarkan P/E, PBV, PEG, EV/EBITDA>",
    "technical_strength": "<1 kalimat: kenapa bullish/neutral/bearish — sebutkan RSI, MACD, trend, rel_strength yang jadi dasar>",
    "macro_sensitivity": "<1 kalimat: seberapa sensitif saham ini terhadap suku bunga/inflasi/GDP>"
  },

  "score_adjustments": {
    "alpha_boosted": <true|false>,
    "alpha_boost_reason": "<jika alpha di-boost karena ROE>20+RevGrowth>15+DER<1+RelStrength>0, jelaskan dalam 1 kalimat. Jika tidak, isi null>",
    "conviction_penalized": <true|false>,
    "conviction_penalty_reason": "<jika conviction dikurangi karena PER tinggi di rising rate ATAU FCF negatif+DER>1.5, jelaskan. Jika tidak, isi null>",
    "valuation_premium_flag": <true|false>,
    "valuation_premium_reason": "<jika valuasi premium >40% di atas industri, jelaskan dampaknya. Jika tidak, isi null>",
    "missing_fields_penalty": "<daftar field kritis yang hilang dan berapa poin confidence dikurangi, atau null jika tidak ada>"
  },

  "key_risks": ["<risk 1, Indonesian>", "<risk 2, Indonesian>", "<risk 3, Indonesian>"],
  "key_catalysts": ["<catalyst 1, Indonesian>", "<catalyst 2, Indonesian>", "<catalyst 3, Indonesian>"],

  "plain_summary": "<4-5 kalimat ringkas dalam bahasa Indonesia yang mudah dipahami orang awam. Jelaskan: kondisi bisnis saham ini, apakah murah atau mahal, momentum teknikalnya, apa risikonya, dan rekomendasimu. Hindari jargon keuangan — anggap pembaca tidak punya latar belakang investasi.>"
}`;

    // ── Sector P/E benchmarks ──────────────────────────────────────────────────
    const SECTOR_PE = {
        Banking: 10, Infrastructure: 15, Consumer: 18, Mining: 8, Technology: 25,
        Healthcare: 22, Property: 9, Financials: 14, Industrials: 20, Energy: 14,
    };

    let _currentStock  = null;
    let _currentMarket = null;
    let _isLoading     = false;

    // ── Build payload ─────────────────────────────────────────────────────────
    function _buildPayload(stock, market) {
        const na = 'insufficient_data';
        const sectorPE = SECTOR_PE[stock.sector] ?? 18;

        const range = (stock.w52h ?? 0) - (stock.w52l ?? 0);
        const pct52w = range > 0
            ? Math.round(((stock.price - (stock.w52l ?? 0)) / range) * 100)
            : na;

        const float_est = stock.mktcapRaw && stock.price ? stock.mktcapRaw / stock.price : null;
        let vol_signal = na;
        if (float_est) {
            const t = (stock.volume / float_est) * 100;
            vol_signal = t > 5 ? 'ABNORMAL_HIGH' : t > 2 ? 'ABOVE_AVERAGE' : t > 0.5 ? 'NORMAL' : 'BELOW_AVERAGE';
        }

        const g = (k) => stock[k] != null ? stock[k] : na;

        return {
            ticker:   stock.symbol,
            company:  stock.name,
            market:   market === 'us' ? (stock.exchange || 'US') : 'IDX',
            sector:   stock.sector,
            currency: stock.currency || (market === 'us' ? 'USD' : 'IDR'),
            market_cap: stock.mktcap,

            price_data: {
                current:              stock.price,
                change_1d_pct:        stock.change,
                week52_high:          g('w52h'),
                week52_low:           g('w52l'),
                pct_vs_52w_range:     pct52w,
                volume_today:         stock.volume,
                volume_signal:        vol_signal,
            },

            fundamentals: {
                pe_ratio:             g('pe'),
                eps_ttm:              g('eps'),
                eps_growth_yoy_pct:   g('eps_growth'),
                revenue_growth_yoy_pct: g('rev_growth'),
                roe_pct:              g('roe'),
                roa_pct:              g('roa'),
                net_margin_pct:       g('net_margin'),
                debt_equity:          g('der'),
                free_cash_flow_growth_pct: g('fcf_growth'),
                dividend_yield_pct:   g('div'),
                beta:                 g('beta'),
                pbv:                  g('pbv'),
                peg_ratio:            g('peg'),
                ev_ebitda:            g('ev_ebitda'),
                sector_avg_pe:        sectorPE,
                pe_vs_sector_pct:     stock.pe ? parseFloat(((stock.pe / sectorPE - 1) * 100).toFixed(1)) : na,
            },

            technical: {
                rsi:                  g('rsi'),
                macd_signal:          g('macd'),
                trend_direction:      g('trend') || g('idx_trend'),
                volume_change_30d_pct: g('vol_chg_30d'),
                relative_strength_vs_index_pct: g('rel_strength'),
            },

            flow_sentiment: {
                foreign_net_flow:     g('foreign_flow'),
                institutional_ownership_pct: g('inst_own'),
                insider_activity:     g('insider'),
                news_sentiment_score: g('sentiment'),
            },

            macro_context: {
                interest_rate_env:    g('rate_env'),
                inflation_trend:      g('inflation'),
                gdp_trend:            g('gdp_trend'),
                index_trend:          g('idx_trend'),
                risk_free_rate_pct:   market === 'idx' ? 6.5 : 5.3,
                market_environment:   market === 'idx'
                    ? 'Indonesia Stock Exchange — emerging market, IDR, domestic macro'
                    : 'US equity market — developed, USD, global macro',
            },

            analyst_note: 'Use ONLY provided data. Apply all scoring rules. Penalize high PER in rising rate. Penalize weak FCF + high debt. Boost alpha when ROE>20, RevGrowth>15, DER<1, RelStrength>0. Output STRICT JSON only.',
        };
    }

    // ── Call Gemini ────────────────────────────────────────────────────────────
    async function _callGemini(apiKey, payload) {
        const body = {
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{
                role: 'user',
                parts: [{ text: 'Analyze this equity. Output strict JSON only:\n\n' + JSON.stringify(payload, null, 2) }]
            }],
            generationConfig: {
                temperature:      0.1,
                topP:             0.85,
                maxOutputTokens:  3000,
                responseMimeType: 'application/json',
            }
        };
        const resp = await fetch(GEMINI_URL(apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const e = await resp.json().catch(() => ({}));
            throw new Error(e?.error?.message || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const clean = raw.replace(/^```json?\s*/i,'').replace(/```\s*$/i,'').trim();
        return JSON.parse(clean);
    }

    // ── Open Panel ────────────────────────────────────────────────────────────
    function openPanel(market, symbol) {
        const allData = market === 'idx' ? IDX_STOCKS_DATA : US_STOCKS_DATA;
        const stock   = allData.find(s => s.symbol === symbol);
        if (!stock) return;

        _currentStock  = stock;
        _currentMarket = market;

        const sectionId   = market === 'idx' ? 'idxAnalysisSection' : 'usAnalysisSection';
        const containerId = market === 'idx' ? 'idxAnalysisContainer' : 'usAnalysisContainer';
        const section   = document.getElementById(sectionId);
        const container = document.getElementById(containerId);
        if (!section || !container) return;

        section.style.display = 'block';
        container.innerHTML   = _renderPanel(stock, market, null, false);
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── Analyze ───────────────────────────────────────────────────────────────
    async function analyze(market, symbol) {
        if (_isLoading) return;

        const keyId  = market === 'idx' ? 'idxEquityAiKey' : 'usEquityAiKey';
        const keyEl  = document.getElementById(keyId);
        const rawKey = keyEl ? keyEl.value.trim() : '';
        const apiKey = rawKey || sessionStorage.getItem('hf_gemini_key') || '';

        if (!apiKey) {
            const containerId = market === 'idx' ? 'idxAnalysisContainer' : 'usAnalysisContainer';
            const c = document.getElementById(containerId);
            if (c) c.insertAdjacentHTML('beforeend',
                `<div class="eqai-error">⚠️ Masukkan Gemini API Key. Gratis di: <a href="https://aistudio.google.com" target="_blank">aistudio.google.com</a></div>`);
            return;
        }

        const allData = market === 'idx' ? IDX_STOCKS_DATA : US_STOCKS_DATA;
        const stock   = allData.find(s => s.symbol === symbol);
        if (!stock) return;

        _currentStock  = stock;
        _currentMarket = market;
        _isLoading     = true;

        const containerId = market === 'idx' ? 'idxAnalysisContainer' : 'usAnalysisContainer';
        const container   = document.getElementById(containerId);
        if (container) container.innerHTML = _renderPanel(stock, market, null, true);

        try {
            const payload = _buildPayload(stock, market);
            const result  = await _callGemini(apiKey, payload);
            sessionStorage.setItem('hf_gemini_key', apiKey);
            if (container) container.innerHTML = _renderPanel(stock, market, result, false);
        } catch (e) {
            const c = document.getElementById(containerId);
            if (c) c.insertAdjacentHTML('beforeend',
                `<div class="eqai-error">❌ Gagal: ${e.message}<br><small>Pastikan API key valid dan kuota tidak habis.</small></div>`);
        } finally {
            _isLoading = false;
        }
    }

    // ── Render Panel ──────────────────────────────────────────────────────────
    function _renderPanel(stock, market, result, loading) {
        const isCurrency = market === 'idx';
        const priceStr   = isCurrency
            ? `Rp ${stock.price.toLocaleString('id-ID')}`
            : `$${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const chColor = stock.change >= 0 ? '#4ade80' : '#f87171';
        const chSign  = stock.change >= 0 ? '+' : '';
        const savedKey = sessionStorage.getItem('hf_gemini_key') || '';
        const keyId    = market === 'idx' ? 'idxEquityAiKey' : 'usEquityAiKey';

        const pe   = stock.pe   != null ? `${stock.pe}×`  : 'N/A';
        const roe  = stock.roe  != null ? `${stock.roe}%` : 'N/A';
        const der  = stock.der  != null ? `${stock.der}`  : 'N/A';
        const div  = stock.div  != null ? `${stock.div}%` : 'N/A';
        const beta = stock.beta != null ? `${stock.beta}` : 'N/A';
        const rsi  = stock.rsi  != null ? `RSI ${stock.rsi}` : '';
        const trend = stock.idx_trend || stock.trend || '';

        const w52range = stock.w52h && stock.w52l
            ? `${isCurrency?'Rp':'$'}${stock.w52l.toLocaleString()} – ${isCurrency?'Rp':'$'}${stock.w52h.toLocaleString()}`
            : 'N/A';
        const pos52 = stock.w52h && stock.w52l && stock.w52h > stock.w52l
            ? Math.round(((stock.price - stock.w52l) / (stock.w52h - stock.w52l)) * 100) : 0;

        const roeColor = stock.roe > 20 ? '#4ade80' : stock.roe > 10 ? '#fbbf24' : '#f87171';

        let resultHtml = '';
        if (loading) {
            resultHtml = `<div class="eqai-loading"><span class="g-spinner"></span><span>Menganalisis institutional-grade… (~10 detik)</span></div>`;
        } else if (result) {
            resultHtml = _renderResult(result, stock, isCurrency);
        } else {
            resultHtml = `
            <div class="eqai-placeholder">
                <div class="eqai-placeholder-icon">📊</div>
                <div class="eqai-placeholder-text">Klik <strong>⚡ Analisis AI</strong> untuk riset ekuitas institutional-grade.</div>
                <div class="eqai-placeholder-sub">Mencakup: 6-dimensi evaluasi bisnis, valuasi multi-metrik, teknikal, flow institusi, probabilitas return, dan harga target.</div>
            </div>`;
        }

        return `
        <div class="eqai-panel">
            <div class="eqai-header">
                <div class="eqai-header-left">
                    <div class="eqai-ticker">${stock.symbol}</div>
                    <div class="eqai-company">${stock.name}</div>
                    <div class="eqai-meta">
                        <span class="eqai-badge eqai-badge--exchange">${stock.exchange || 'IDX'}</span>
                        <span class="eqai-badge eqai-badge--sector">${stock.sector}</span>
                        ${trend ? `<span class="eqai-badge eqai-badge--trend" style="background:${trend.includes('up')?'rgba(74,222,128,0.12)':trend.includes('down')?'rgba(248,113,113,0.12)':'rgba(255,255,255,0.06)'};color:${trend.includes('up')?'#4ade80':trend.includes('down')?'#f87171':'#94a3b8'};border-color:transparent">${trend}</span>` : ''}
                        ${rsi ? `<span class="eqai-badge eqai-badge--sector" style="color:${stock.rsi>70?'#f87171':stock.rsi<30?'#4ade80':'#94a3b8'}">${rsi}</span>` : ''}
                    </div>
                </div>
                <div class="eqai-header-right">
                    <div class="eqai-price">${priceStr}</div>
                    <div class="eqai-change" style="color:${chColor}">${chSign}${stock.change.toFixed(2)}% (1D)</div>
                    <div class="eqai-mktcap">MCap: ${stock.mktcap}</div>
                </div>
            </div>

            <div class="eqai-funds-strip">
                <div class="eqai-fund-item"><span class="eqai-fund-lbl">P/E</span><span class="eqai-fund-val">${pe}</span></div>
                <div class="eqai-fund-item"><span class="eqai-fund-lbl">ROE</span><span class="eqai-fund-val" style="color:${roeColor}">${roe}</span></div>
                <div class="eqai-fund-item"><span class="eqai-fund-lbl">D/E</span><span class="eqai-fund-val">${der}</span></div>
                <div class="eqai-fund-item"><span class="eqai-fund-lbl">Dividen</span><span class="eqai-fund-val" style="color:#60a5fa">${div}</span></div>
                <div class="eqai-fund-item"><span class="eqai-fund-lbl">Beta</span><span class="eqai-fund-val" style="color:${stock.beta>1.5?'#f87171':stock.beta>1?'#fbbf24':'#94a3b8'}">${beta}</span></div>
                ${stock.pbv   != null ? `<div class="eqai-fund-item"><span class="eqai-fund-lbl">P/BV</span><span class="eqai-fund-val">${stock.pbv}×</span></div>` : ''}
                ${stock.peg   != null ? `<div class="eqai-fund-item"><span class="eqai-fund-lbl">PEG</span><span class="eqai-fund-val" style="color:${stock.peg<1?'#4ade80':stock.peg<2?'#fbbf24':'#f87171'}">${stock.peg}</span></div>` : ''}
                ${stock.net_margin != null ? `<div class="eqai-fund-item"><span class="eqai-fund-lbl">Margin</span><span class="eqai-fund-val">${stock.net_margin}%</span></div>` : ''}
                <div class="eqai-fund-item eqai-fund-item--wide">
                    <span class="eqai-fund-lbl">52W Range</span>
                    <span class="eqai-fund-val" style="font-size:0.7rem">${w52range}</span>
                    <div class="eqai-52w-bar"><div class="eqai-52w-fill" style="width:${pos52}%"></div></div>
                </div>
            </div>

            <div class="eqai-key-row">
                <span class="eqai-key-label">🔑 Gemini API Key</span>
                <input class="eqai-key-input" id="${keyId}" type="password"
                       placeholder="AIza…" value="${savedKey}"
                       onkeydown="if(event.key==='Enter')stockEquityAI.analyze('${market}','${stock.symbol}')">
                <a class="eqai-key-link" href="https://aistudio.google.com" target="_blank" rel="noopener">Gratis →</a>
            </div>

            <button class="eqai-analyze-btn ${loading ? 'eqai-analyze-btn--loading' : ''}"
                    onclick="stockEquityAI.analyze('${market}','${stock.symbol}')"
                    ${loading ? 'disabled' : ''}>
                ${loading
                    ? '<span class="g-spinner" style="width:14px;height:14px;border-width:2px"></span> Menganalisis…'
                    : '⚡ Analisis AI Sekarang'}
            </button>

            <div id="eqaiResult_${market}_${stock.symbol}">
                ${resultHtml}
            </div>
        </div>`;
    }

    // ── Render Result ─────────────────────────────────────────────────────────
    function _renderResult(r, stock, isCurrency) {
        const na = (v) => (v == null || v === 'insufficient_data') ? '—' : v;
        const fmtPrice = (v) => {
            if (!v || v === 'insufficient_data') return '—';
            return isCurrency
                ? `Rp ${Number(v).toLocaleString('id-ID')}`
                : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        };

        // ── Capital allocation meta ────────────────────────────────────────────
        const CAP_META = {
            aggressive_buy: { icon: '🚀', label: 'Masuk Agresif', color: '#4ade80' },
            moderate_buy:   { icon: '📈', label: 'Beli Moderat',  color: '#86efac' },
            accumulate:     { icon: '✅', label: 'Akumulasi',     color: '#34d399' },
            hold:           { icon: '🔵', label: 'Tahan',         color: '#fbbf24' },
            reduce:         { icon: '🛡️', label: 'Kurangi',       color: '#fb923c' },
            avoid:          { icon: '🚫', label: 'Hindari',       color: '#f87171' },
        };
        const capM = CAP_META[r.capital_allocation_bias] || { icon: '—', label: r.capital_allocation_bias || '—', color: '#94a3b8' };

        // ── Structural meta ────────────────────────────────────────────────────
        const STRUCT_META = {
            high_quality_compounder: { icon: '💎', color: '#4ade80', label: 'High Quality Compounder' },
            cyclical_opportunity:    { icon: '🔄', color: '#fbbf24', label: 'Cyclical Opportunity' },
            deep_value:              { icon: '🏷️', color: '#60a5fa', label: 'Deep Value' },
            overvalued_growth:       { icon: '⚠️', color: '#f87171', label: 'Overvalued Growth' },
            distribution_phase:      { icon: '📉', color: '#fb923c', label: 'Distribution Phase' },
            structurally_weak:       { icon: '🔴', color: '#ef4444', label: 'Structurally Weak' },
        };
        const stM = STRUCT_META[r.structural_classification] || { icon: '📊', color: '#94a3b8', label: r.structural_classification || '—' };

        // ── Risk level ─────────────────────────────────────────────────────────
        const RISK_COLOR = { low: '#4ade80', medium: '#fbbf24', high: '#fb923c', extreme: '#f87171' };
        const riskColor = RISK_COLOR[r.risk_level] || '#94a3b8';
        const riskClass = `risk-${r.risk_level || 'medium'}`;

        // ── Dimension scores ───────────────────────────────────────────────────
        const ds = r.dimension_scores || {};
        const dimBar = (val, label, color, icon, reasoning) => {
            const v = typeof val === 'number' ? val : 0;
            const isNA = val === 'insufficient_data' || val == null;
            const c = isNA ? '#475569' : color;
            const reasonHtml = reasoning
                ? `<div class="eqai-dim-reason">${reasoning}</div>`
                : '';
            return `
            <div class="eqai-score-row">
                <span class="eqai-score-lbl">${icon} ${label}</span>
                <div class="eqai-score-bar-wrap">
                    <div class="eqai-score-bar" style="width:${isNA?0:v}%;background:${c}"></div>
                </div>
                <span class="eqai-score-num" style="color:${c}">${isNA?'—':v}</span>
            </div>${reasonHtml}`;
        };
        const compV = ds.composite;
        const compColor = typeof compV === 'number'
            ? (compV >= 75 ? '#4ade80' : compV >= 55 ? '#fbbf24' : compV >= 35 ? '#fb923c' : '#f87171')
            : '#94a3b8';

        // ── Dimension reasoning ───────────────────────────────────────────────
        const dr = r.dimension_reasoning || {};

        // ── Score adjustments ─────────────────────────────────────────────────
        const sa = r.score_adjustments || {};

        // ── Probability bars ───────────────────────────────────────────────────
        const pr = r.probabilities || {};
        const probBar = (val, label, danger) => {
            const v = typeof val === 'number' ? val : 0;
            const isNA = val == null || val === 'insufficient_data';
            const barColor = danger
                ? (v > 55 ? '#f87171' : v > 35 ? '#fb923c' : '#4ade80')
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

        // ── Three core scores ─────────────────────────────────────────────────
        const sc  = r.scores || {};
        const scoreCircle = (val, label, color) => {
            const v = typeof val === 'number' ? val : '—';
            const c = typeof val === 'number'
                ? (val >= 70 ? '#4ade80' : val >= 50 ? '#fbbf24' : '#f87171') : '#475569';
            return `
            <div class="eqai-score-circle" style="border-color:${c}20">
                <div class="eqai-score-circle-val" style="color:${c}">${v}</div>
                <div class="eqai-score-circle-lbl">${label}</div>
            </div>`;
        };

        // ── Valuation ─────────────────────────────────────────────────────────
        const val = r.valuation || {};
        const IVB_COLOR = {
            significantly_undervalued: '#4ade80',
            undervalued: '#86efac',
            fairly_valued: '#fbbf24',
            overvalued: '#fb923c',
            significantly_overvalued: '#f87171',
        };
        const ivbColor = IVB_COLOR[val.intrinsic_value_bias] || '#94a3b8';

        // ── Technical ─────────────────────────────────────────────────────────
        const tech = r.technical || {};
        const TREND_COLOR = {
            strong_uptrend:'#4ade80', uptrend:'#86efac', sideways:'#94a3b8',
            downtrend:'#fca5a5', strong_downtrend:'#f87171',
        };
        const trendColor = TREND_COLOR[tech.trend] || '#94a3b8';

        // ── Flow & sentiment ──────────────────────────────────────────────────
        const flow = r.flow_sentiment || {};

        // ── Price targets ─────────────────────────────────────────────────────
        const pt = r.price_targets || {};

        // ── Lists ─────────────────────────────────────────────────────────────
        const risks = (r.key_risks || []).slice(0, 4);
        const cats  = (r.key_catalysts || []).slice(0, 4);

        return `
        <!-- ── Capital allocation + risk banner ─────────────────────────── -->
        <div class="eqai-verdict-banner" style="background:rgba(99,102,241,0.07);border-color:rgba(99,102,241,0.2)">
            <span class="eqai-verdict-icon">${capM.icon}</span>
            <div class="eqai-verdict-center">
                <span class="eqai-verdict-label" style="color:${capM.color}">${capM.label}</span>
                <span class="eqai-verdict-conf" style="color:#64748b">Return Potential: <b style="color:${r.return_potential==='high'?'#4ade80':r.return_potential==='negative'?'#f87171':'#fbbf24'}">${na(r.return_potential)}</b></span>
            </div>
            <div class="eqai-verdict-right">
                <span class="eqai-cap-alloc" style="color:${capM.color}">${na(val.fair_value_status)?.replace(/_/g,' ')}</span>
                <span class="eqai-risk-pill ${riskClass}">Risiko: ${r.risk_level || '—'}</span>
            </div>
        </div>

        <!-- ── Structural classification ────────────────────────────────── -->
        <div class="eqai-struct-card" style="border-color:${stM.color}30;background:${stM.color}08">
            <span class="eqai-struct-icon">${stM.icon}</span>
            <div class="eqai-struct-info">
                <div class="eqai-struct-label" style="color:${stM.color}">${stM.label}</div>
                <div class="eqai-struct-reasoning">${na(r.structural_reasoning)}</div>
            </div>
            <span class="eqai-struct-conf" style="color:${stM.color}">${na(r.structural_confidence)}%</span>
        </div>

        <!-- ── Three core scores ─────────────────────────────────────────── -->
        <div class="eqai-scores-trio">
            ${scoreCircle(sc.intrinsic_conviction_score, 'Conviction', '#a78bfa')}
            ${scoreCircle(sc.risk_adjusted_alpha_score,  'Alpha Score', '#60a5fa')}
            ${scoreCircle(sc.confidence_score,           'Confidence',  '#34d399')}
        </div>

        <!-- ── Score Adjustment Reasons ─────────────────────────────────── -->
        ${(sa.alpha_boost_reason || sa.conviction_penalty_reason || sa.valuation_premium_reason || sa.missing_fields_penalty) ? `
        <div class="eqai-adj-box">
            <div class="eqai-adj-title">🔧 Penjelasan Penyesuaian Skor</div>
            <div class="eqai-adj-list">
                ${sa.alpha_boosted && sa.alpha_boost_reason ? `
                <div class="eqai-adj-item eqai-adj--boost">
                    <span class="eqai-adj-icon">⬆️</span>
                    <div><span class="eqai-adj-label">Alpha Score Di-Boost</span><div class="eqai-adj-text">${sa.alpha_boost_reason}</div></div>
                </div>` : ''}
                ${sa.conviction_penalized && sa.conviction_penalty_reason ? `
                <div class="eqai-adj-item eqai-adj--penalty">
                    <span class="eqai-adj-icon">⬇️</span>
                    <div><span class="eqai-adj-label">Conviction Di-Penalti</span><div class="eqai-adj-text">${sa.conviction_penalty_reason}</div></div>
                </div>` : ''}
                ${sa.valuation_premium_flag && sa.valuation_premium_reason ? `
                <div class="eqai-adj-item eqai-adj--warning">
                    <span class="eqai-adj-icon">⚠️</span>
                    <div><span class="eqai-adj-label">Valuasi Premium Berlebih</span><div class="eqai-adj-text">${sa.valuation_premium_reason}</div></div>
                </div>` : ''}
                ${sa.missing_fields_penalty ? `
                <div class="eqai-adj-item eqai-adj--info">
                    <span class="eqai-adj-icon">ℹ️</span>
                    <div><span class="eqai-adj-label">Data Tidak Lengkap</span><div class="eqai-adj-text">${sa.missing_fields_penalty}</div></div>
                </div>` : ''}
            </div>
        </div>` : ''}

        <!-- ── Main grid ──────────────────────────────────────────────────── -->
        <div class="eqai-main-grid">

            <!-- 6-Dimension Scores -->
            <div class="eqai-section-card">
                <div class="eqai-section-title">📐 Evaluasi 6 Dimensi</div>
                <div class="eqai-composite-ring">
                    <span class="eqai-composite-val" style="color:${compColor}">${typeof compV==='number'?compV:'—'}</span>
                    <span class="eqai-composite-lbl">/100 Composite</span>
                </div>
                ${dimBar(ds.business_quality,      'Kualitas Bisnis',    '#4ade80', '🏢', dr.business_quality)}
                ${dimBar(ds.earnings_sustainability,'Keberlanjutan EPS',  '#86efac', '📈', dr.earnings_sustainability)}
                ${dimBar(ds.balance_sheet_strength, 'Kesehatan Neraca',   '#60a5fa', '🏦', dr.balance_sheet_strength)}
                ${dimBar(ds.valuation_attractiveness,'Daya Tarik Valuasi','#fbbf24', '💰', dr.valuation_attractiveness)}
                ${dimBar(ds.technical_strength,     'Teknikal',           '#a78bfa', '📊', dr.technical_strength)}
                ${dimBar(ds.macro_sensitivity,      'Sensitivitas Makro', '#fb923c', '🌍', dr.macro_sensitivity)}
            </div>

            <!-- Valuation -->
            <div class="eqai-section-card">
                <div class="eqai-section-title">💰 Valuasi Multi-Metrik</div>
                <div class="eqai-val-grid">
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">P/E Assessment</span>
                        <span class="eqai-val-val">${na(val.pe_assessment)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">vs Sektor</span>
                        <span class="eqai-val-val">${na(val.pe_vs_sector)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">PEG</span>
                        <span class="eqai-val-val">${na(val.peg_assessment)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">P/BV</span>
                        <span class="eqai-val-val">${na(val.pbv_assessment)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">EV/EBITDA</span>
                        <span class="eqai-val-val">${na(val.ev_ebitda_assessment)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-val-item">
                        <span class="eqai-val-lbl">Intrinsic Bias</span>
                        <span class="eqai-val-val" style="color:${ivbColor}">${na(val.intrinsic_value_bias)?.replace(/_/g,' ')}</span>
                    </div>
                </div>
            </div>

            <!-- Technical + Flow -->
            <div class="eqai-section-card">
                <div class="eqai-section-title">⚡ Teknikal & Flow</div>
                <div class="eqai-mom-list">
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Trend</span>
                        <span class="eqai-mom-val" style="color:${trendColor}">${na(tech.trend)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">RSI</span>
                        <span class="eqai-mom-val">${na(tech.rsi_signal)}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">MACD</span>
                        <span class="eqai-mom-val" style="color:${tech.macd_signal==='bullish'?'#4ade80':tech.macd_signal==='bearish'?'#f87171':'#94a3b8'}">${na(tech.macd_signal)}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Volume Momentum</span>
                        <span class="eqai-mom-val">${na(tech.volume_momentum)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Rel. Strength</span>
                        <span class="eqai-mom-val" style="color:${tech.relative_strength_vs_index==='outperforming'?'#4ade80':tech.relative_strength_vs_index==='underperforming'?'#f87171':'#94a3b8'}">${na(tech.relative_strength_vs_index)?.replace(/_/g,' ')}</span>
                    </div>
                    <div class="eqai-mom-item" style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;margin-top:4px">
                        <span class="eqai-mom-lbl">Institusi</span>
                        <span class="eqai-mom-val">${na(flow.institutional_bias)}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Insider</span>
                        <span class="eqai-mom-val" style="color:${flow.insider_signal==='bullish'?'#4ade80':flow.insider_signal==='bearish'?'#f87171':'#94a3b8'}">${na(flow.insider_signal)}</span>
                    </div>
                    <div class="eqai-mom-item">
                        <span class="eqai-mom-lbl">Sentimen Berita</span>
                        <span class="eqai-mom-val">${na(flow.news_sentiment)}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- ── Price Targets ──────────────────────────────────────────────── -->
        <div class="eqai-targets-row">
            <div class="eqai-section-title" style="margin-bottom:10px">🎯 Price Target 12M — ${na(pt.methodology)}</div>
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
        </div>

        <!-- ── Probability bars ───────────────────────────────────────────── -->
        <div class="eqai-section-card">
            <div class="eqai-section-title">🎲 Probabilitas Return & Risiko</div>
            ${probBar(pr.upside_3_months,             '📈 Naik 3 Bulan',              false)}
            ${probBar(pr.upside_12_months,            '📈 Naik 12 Bulan',             false)}
            ${probBar(pr.downside_risk,               '📉 Risiko Turun 15%+',          true)}
            ${probBar(pr.earnings_deterioration_risk, '⚠️ Risiko Penurunan EPS',       true)}
            ${probBar(pr.valuation_compression_risk,  '💥 Risiko Kompresi Valuasi',    true)}
        </div>

        <!-- ── Risks & Catalysts ─────────────────────────────────────────── -->
        <div class="eqai-rc-grid">
            <div class="eqai-section-card">
                <div class="eqai-section-title">⚠️ Key Risks</div>
                <ul class="eqai-list eqai-list--risks">
                    ${risks.map(r => `<li>${r}</li>`).join('') || '<li style="color:#475569">—</li>'}
                </ul>
            </div>
            <div class="eqai-section-card">
                <div class="eqai-section-title">💡 Key Catalysts</div>
                <ul class="eqai-list eqai-list--cats">
                    ${cats.map(c => `<li>${c}</li>`).join('') || '<li style="color:#475569">—</li>'}
                </ul>
            </div>
        </div>

        <!-- ── Plain-language summary ────────────────────────────────────── -->
        <div class="eqai-summary-box">
            <div class="eqai-summary-title">🗣️ Ringkasan untuk Investor Awam</div>
            <div class="eqai-summary-body">${na(r.plain_summary)}</div>
        </div>

        <!-- ── Capital reasoning ─────────────────────────────────────────── -->
        <div class="eqai-cap-reason">
            <span style="color:${capM.color};font-weight:700">${capM.icon} ${capM.label}</span>
            — ${na(r.capital_reasoning)}
        </div>

        <div class="eqai-disclaimer">
            ⚠️ <strong>Bukan rekomendasi investasi.</strong> Analisis ini dihasilkan AI berdasarkan data statis.
            Selalu lakukan riset mandiri (due diligence) dan konsultasikan dengan advisor keuangan profesional sebelum mengambil keputusan investasi.
        </div>`;
    }

    return { openPanel, analyze };

})();
