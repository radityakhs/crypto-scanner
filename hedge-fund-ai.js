// ══════════════════════════════════════════════════════════════════════════════
//  Hedge Fund AI Analyst  v3
//  Powered by Google Gemini — Advanced Whale & Structure Detection
//  WAS · SDS · LSS · DI · SWQS · SMI · Structural Classification · Capital Bias
// ══════════════════════════════════════════════════════════════════════════════

const hedgeFundAI = (() => {
    'use strict';

    // ── Gemini endpoint ────────────────────────────────────────────────────────
    const GEMINI_MODEL = 'gemini-2.0-flash';
    const GEMINI_URL   = (k) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${k}`;

    // ── Extended system prompt v3 — Advanced Hedge Fund Detection ─────────────
    const SYSTEM_PROMPT = `You are operating in advanced hedge fund detection mode.

Your objective is to detect hidden whale positioning, liquidity traps, sniper flips, fake breakouts, and controlled pump structures.

Rules:
- You NEVER hallucinate missing data.
- You ONLY use the provided metrics.
- If data is insufficient, state "insufficient_data" for that field.
- You think probabilistically and relationally — analyze behavior BETWEEN metrics.
- You do not give financial advice.
- You output STRICT JSON only — no markdown, no text outside JSON.
- All probabilities must be numeric (0-100).
- Confidence score must reflect internal consistency of all metrics.

Step 1 — Derive composite scores if raw data allows:
- WAS (Whale Accumulation Score 0-100): top holder % trend + buy/sell ratio + large wallet dominance
- SDS (Sniper Detection Score 0-100): early wallet concentration + txn velocity at token launch (inverse: higher = safer)
- LSS (Liquidity Stability Score 0-100): liq stability + vol/liq ratio + LP lock status
- DI  (Distribution Index 0-100): holder distribution quality — higher = better distributed
- SWQS (Smart Wallet Quality Score 0-100): contract safety composite
- SMI (Smart Money Index 0-100): weighted average of WAS + SWQS + LSS

Step 2 — Analyze RELATIONAL behavior between metrics:
- WAS vs PriceChange24h: Is accumulation silent (price flat + WAS high) or noisy?
- VolumeChange24h vs price volatility: Is volume organic or manipulated?
- SDS vs DI: Are early snipers still holding? Is distribution genuinely spreading?
- SMI vs LiquidityChange24h: Is smart money adding or removing liquidity?
- HolderGrowth24h vs Top10HolderChange24h: Is growth real retail or whale wallet splitting?

Step 3 — Structural Classification (pick ONE):
A) early_smart_money_accumulation — whales quietly buying, price suppressed, volume low
B) controlled_pump_setup — SMI high, volume rising, smart money in control before pump
C) sniper_flip_cycle — SDS low, DI low, snipers rotating, retail buying tops
D) retail_exit_liquidity — distribution phase, smart money exiting into retail FOMO
E) structural_weakness — inconsistent metrics, low confidence across all signals

Step 4 — Calculate probabilities (0-100):
- accumulation: probability that whales are currently accumulating
- controlled_pump: probability of a coordinated price move soon
- distribution: probability that insiders are currently selling
- manipulation: probability of artificial price/volume activity
- rug_risk: probability of liquidity removal or exit scam

Step 5 — Capital Positioning Bias (pick ONE based on risk/reward):
- aggressive_allocation: high conviction, strong signals, enter large
- moderate_allocation: good signals with some risk, enter partial
- observational: mixed signals, monitor but don't enter yet
- defensive: warning signs present, reduce exposure
- avoid: critical risks detected, stay out

Output STRICT JSON only — no markdown, no explanation outside JSON:
{
  "token": "SYMBOL",
  "chain": "...",
  "timestamp": <unix seconds>,

  "core_scores": {
    "WAS":  <0-100 or "insufficient_data">,
    "SDS":  <0-100 or "insufficient_data">,
    "LSS":  <0-100 or "insufficient_data">,
    "DI":   <0-100 or "insufficient_data">,
    "SWQS": <0-100 or "insufficient_data">,
    "SMI":  <0-100 or "insufficient_data">
  },

  "market_metrics": {
    "PriceChange24h":       <float pct or "insufficient_data">,
    "VolumeChange24h":      <float pct or "insufficient_data">,
    "LiquidityChange24h":   <float pct or "insufficient_data">,
    "HolderGrowth24h":      <float pct or "insufficient_data">,
    "Top10HolderChange24h": <float pct or "insufficient_data">
  },

  "relational_analysis": {
    "WAS_vs_price":    "<insight in 1 sentence>",
    "volume_vs_vol":   "<insight in 1 sentence>",
    "SDS_vs_DI":       "<insight in 1 sentence>",
    "SMI_vs_liq":      "<insight in 1 sentence>",
    "holder_vs_top10": "<insight in 1 sentence>"
  },

  "structural_classification": "early_smart_money_accumulation|controlled_pump_setup|sniper_flip_cycle|retail_exit_liquidity|structural_weakness",
  "structural_confidence": <0-100>,
  "structural_reasoning": "<2 sentences max, factual>",

  "dominant_phase": "stealth_accumulation|breakout_preparation|sniper_dominance|distribution_phase|weak_structure",
  "phase_confidence": <0-100>,
  "phase_reasoning": "<1-2 sentences>",

  "probabilities": {
    "accumulation":     <0-100>,
    "controlled_pump":  <0-100>,
    "distribution":     <0-100>,
    "manipulation":     <0-100>,
    "rug_risk":         <0-100>,
    "pre_pump_probability": <0-100>,
    "smart_money_control":  <0-100>,
    "retail_trap_risk":     <0-100>
  },

  "capital_positioning": "aggressive_allocation|moderate_allocation|observational|defensive|avoid",
  "capital_reasoning": "<1 sentence>",

  "structure": {
    "market_bias":      "bullish|neutral|bearish",
    "liquidity_health": "strong|moderate|weak",
    "entry_quality":    "excellent|good|risky|avoid"
  },

  "signals": {
    "liquidity": {
      "score": <0-25>, "probability_rug": <0-100>,
      "vol_liq_ratio": <float>, "assessment": "STRONG|ADEQUATE|WEAK|CRITICAL", "notes": "<concise>"
    },
    "holders": {
      "score": <0-25>, "concentration_risk": <0-100>,
      "whale_dominance": <0-100>, "assessment": "HEALTHY|MODERATE|CONCENTRATED|DANGEROUS", "notes": "<concise>"
    },
    "contract": {
      "score": <0-25>, "honeypot_probability": <0-100>,
      "rug_vector_count": <int>, "assessment": "SAFE|CAUTION|RISKY|CRITICAL", "flags": []
    },
    "lp_lock": {
      "score": <0-25>, "probability_lp_pull": <0-100>,
      "locked_pct": <0-100>, "assessment": "LOCKED|PARTIAL|UNLOCKED|UNKNOWN"
    }
  },

  "price_action": {
    "trend_24h": "STRONG_BULLISH|BULLISH|NEUTRAL|BEARISH|STRONG_BEARISH",
    "trend_1h":  "STRONG_BULLISH|BULLISH|NEUTRAL|BEARISH|STRONG_BEARISH",
    "momentum_score": <0-100>,
    "buy_sell_pressure": "HEAVY_BUY|BUY|NEUTRAL|SELL|HEAVY_SELL",
    "wash_trading_risk": <0-100>
  },

  "alpha_signal_strength": <0-100>,
  "confidence_score":      <0-100>,
  "overall_verdict": "STRONG_BUY|BUY|HOLD|AVOID|STRONG_AVOID|INSUFFICIENT_DATA",
  "risk_level": "HIGH|MEDIUM|LOW",

  "probability_profit_7d":  <0-100>,
  "probability_profit_30d": <0-100>,
  "probability_rug_30d":    <0-100>,
  "total_safety_score":     <0-100>,

  "key_risks":     ["<risk in simple Indonesian language>"],
  "key_catalysts": ["<catalyst in simple Indonesian language>"],
  "analyst_summary": "<2-3 sentences in simple Indonesian, factual only, for non-expert audience>"
}`;

    // ── State ──────────────────────────────────────────────────────────────────
    let _currentMetrics = null;
    let _lastResult     = null;
    let _isLoading      = false;

    // ── Derive best-effort computed scores from raw data ───────────────────────
    function _deriveScores(best, gp, liqScore, holderScore, contractScore, lpScore) {
        const na = 'insufficient_data';

        // LSS — Liquidity Stability Score
        const liqUsd  = best?.liquidity?.usd || 0;
        const vol24   = best?.volume?.h24    || 0;
        const volLiq  = liqUsd > 0 ? vol24 / liqUsd : null;
        let LSS = na;
        if (liqScore && liqUsd > 0) {
            let s = Math.round((liqScore.score / (liqScore.max || 25)) * 60);
            if (volLiq !== null) {
                if (volLiq < 0.5) s += 25;
                else if (volLiq < 1.5) s += 15;
                else if (volLiq < 3) s += 5;
            }
            if (lpScore) s += Math.round((lpScore.score / (lpScore.max || 20)) * 15);
            LSS = Math.min(100, s);
        }

        // SWQS — Smart Wallet Quality Score (contract safety proxy)
        let SWQS = na;
        if (contractScore) {
            SWQS = Math.min(100, Math.round((contractScore.score / (contractScore.max || 25)) * 100));
        }

        // DI — Distribution Index (lower concentration = higher score)
        let DI = na;
        if (gp && gp.holders) {
            const holders  = gp.holders || [];
            const top10Pct = holders.slice(0, 10).reduce((s, h) => s + parseFloat(h.percent || 0), 0) * 100;
            if (top10Pct <= 20)      DI = 90;
            else if (top10Pct <= 35) DI = 70;
            else if (top10Pct <= 50) DI = 50;
            else if (top10Pct <= 70) DI = 30;
            else                     DI = 10;
        } else if (holderScore) {
            DI = Math.min(100, Math.round((holderScore.score / (holderScore.max || 25)) * 100));
        }

        // WAS — Whale Accumulation Score (buy pressure proxy)
        const buys  = best?.txns?.h24?.buys  || 0;
        const sells = best?.txns?.h24?.sells || 0;
        const pct24 = best?.priceChange?.h24 || 0;
        let WAS = na;
        if (buys + sells > 0) {
            const bsRatio = buys / (buys + sells); // 0-1, higher = more buys
            let s = Math.round(bsRatio * 60);
            if (pct24 > 10)       s += 25;
            else if (pct24 > 0)   s += 15;
            else if (pct24 > -5)  s += 5;
            WAS = Math.min(100, s);
        }

        // SDS — Sniper Detection Score (inverse: lower sniper risk = higher score)
        let SDS = na;
        if (gp) {
            const creatorPct = parseFloat(gp.creator_percent || 0) * 100;
            const top5Pct    = (gp.holders || []).slice(0, 5).reduce((s, h) => s + parseFloat(h.percent || 0), 0) * 100;
            // High early concentration → high sniper risk → low SDS
            let risk = 0;
            if (creatorPct > 10) risk += 40;
            else if (creatorPct > 5) risk += 20;
            if (top5Pct > 60)    risk += 40;
            else if (top5Pct > 40) risk += 20;
            SDS = Math.max(0, 100 - risk);
        }

        // SMI — Smart Money Index (WAS + SWQS + LSS) / 3
        let SMI = na;
        const scores = [WAS, SWQS, LSS].filter(v => typeof v === 'number');
        if (scores.length === 3) SMI = Math.round(scores.reduce((a, b) => a + b, 0) / 3);

        return { WAS, SDS, LSS, DI, SWQS, SMI };
    }

    // ── Build full metrics payload ─────────────────────────────────────────────
    function buildMetricsPayload(best, gp, liqScore, holderScore, contractScore, lpScore, tokenPairs) {
        const na = 'insufficient_data';

        const price   = parseFloat(best?.priceUsd) || 0;
        const liqUsd  = best?.liquidity?.usd || 0;
        const vol24   = best?.volume?.h24    || 0;
        const vol6    = best?.volume?.h6     || 0;
        const vol1    = best?.volume?.h1     || 0;
        const volM5   = best?.volume?.m5     || 0;
        const pct24   = best?.priceChange?.h24 || 0;
        const pct6    = best?.priceChange?.h6  || 0;
        const pct1    = best?.priceChange?.h1  || 0;
        const pctM5   = best?.priceChange?.m5  || 0;
        const buys24  = best?.txns?.h24?.buys  || 0;
        const sells24 = best?.txns?.h24?.sells || 0;
        const fdv     = best?.fdv || 0;
        const mcap    = best?.marketCap || best?.fdv || 0;
        const totalLiq = tokenPairs
            ? tokenPairs.reduce((s, p) => s + (p?.liquidity?.usd || 0), 0)
            : liqUsd;
        const pairCnt  = tokenPairs ? tokenPairs.length : 1;
        const volLiqRatio = liqUsd > 0 ? parseFloat((vol24 / liqUsd).toFixed(4)) : na;

        // GoPlus security
        let security = na;
        if (gp) {
            const lpHolders  = gp.lp_holders || [];
            const holders    = gp.holders    || [];
            const lockedPct  = lpHolders.filter(h => h.is_locked === '1')
                .reduce((s, h) => s + parseFloat(h.percent || 0), 0) * 100;
            const burnedPct  = lpHolders
                .filter(h => h.is_contract === '1' && (h.tag || '').toLowerCase().includes('burn'))
                .reduce((s, h) => s + parseFloat(h.percent || 0), 0) * 100;
            const top5Pct    = holders.slice(0, 5).reduce((s, h) => s + parseFloat(h.percent || 0), 0) * 100;
            const top10Pct   = holders.slice(0, 10).reduce((s, h) => s + parseFloat(h.percent || 0), 0) * 100;
            const creatorPct = parseFloat(gp.creator_percent || 0) * 100;
            const ownerPct   = parseFloat(gp.owner_percent   || 0) * 100;
            const renounced  = gp.owner_address === '0x0000000000000000000000000000000000000000'
                || gp.is_renounced === '1' || !gp.owner_address;

            security = {
                is_honeypot:             gp.is_honeypot === '1',
                is_open_source:          gp.is_open_source === '1',
                is_proxy:                gp.is_proxy === '1',
                is_mintable:             gp.is_mintable === '1',
                is_blacklisted:          gp.is_blacklisted === '1',
                can_take_back_ownership: gp.can_take_back_ownership === '1',
                hidden_owner:            gp.hidden_owner === '1',
                ownership_renounced:     renounced,
                buy_tax_pct:             parseFloat(gp.buy_tax  || 0) * 100,
                sell_tax_pct:            parseFloat(gp.sell_tax || 0) * 100,
                holder_count:            parseInt(gp.holder_count || 0),
                creator_pct:             parseFloat(creatorPct.toFixed(2)),
                owner_pct:               parseFloat(ownerPct.toFixed(2)),
                top5_holders_pct:        parseFloat(top5Pct.toFixed(2)),
                top10_holders_pct:       parseFloat(top10Pct.toFixed(2)),
                lp_locked_pct:           parseFloat(lockedPct.toFixed(2)),
                lp_burned_pct:           parseFloat(burnedPct.toFixed(2)),
                lp_holder_count:         lpHolders.length
            };
        }

        // Derived computed scores
        const derived = _deriveScores(best, gp, liqScore, holderScore, contractScore, lpScore);

        return {
            token: {
                symbol:       best?.baseToken?.symbol  || na,
                name:         best?.baseToken?.name    || na,
                address:      best?.baseToken?.address || na,
                chain:        best?.chainId            || na,
                dex:          best?.dexId              || na,
                pair_address: best?.pairAddress        || na
            },
            price:   { usd: price, fdv_usd: fdv || na, mcap_usd: mcap || na },
            liquidity: {
                best_pair_usd:     liqUsd,
                total_all_pairs:   totalLiq,
                pair_count:        pairCnt,
                vol_liq_ratio_24h: volLiqRatio
            },
            volume:        { h24: vol24, h6: vol6, h1: vol1, m5: volM5 },
            price_change:  { h24_pct: pct24, h6_pct: pct6, h1_pct: pct1, m5_pct: pctM5 },
            transactions_24h: {
                buys: buys24, sells: sells24, total: buys24 + sells24,
                buy_sell_ratio: sells24 > 0 ? parseFloat((buys24 / sells24).toFixed(3)) : na
            },
            security,
            safety_scores: {
                liquidity: { score: liqScore?.score  ?? na, max: liqScore?.max  ?? na },
                holders:   { score: holderScore?.score ?? na, max: holderScore?.max ?? na },
                contract:  { score: contractScore?.score ?? na, max: contractScore?.max ?? na },
                lp_lock:   { score: lpScore?.score   ?? na, max: lpScore?.max   ?? na },
                total:     (liqScore?.score ?? 0) + (holderScore?.score ?? 0)
                           + (contractScore?.score ?? 0) + (lpScore?.score ?? 0),
                max_total: (liqScore?.max ?? 0) + (holderScore?.max ?? 0)
                           + (contractScore?.max ?? 0) + (lpScore?.max ?? 0)
            },
            // Derived composite scores (best-effort from available data)
            derived_scores: {
                WAS:  derived.WAS,
                SDS:  derived.SDS,
                LSS:  derived.LSS,
                DI:   derived.DI,
                SWQS: derived.SWQS,
                SMI:  derived.SMI
            }
        };
    }

    // ── Set context from openPanel ─────────────────────────────────────────────
    function setContext(best, gp, liqScore, holderScore, contractScore, lpScore, tokenPairs) {
        _currentMetrics = buildMetricsPayload(best, gp, liqScore, holderScore, contractScore, lpScore, tokenPairs);
        _lastResult     = null;
    }

    // ── Call Gemini ────────────────────────────────────────────────────────────
    async function _callGemini(apiKey, payload) {
        const userMsg =
            `Analyze this token using ONLY the provided on-chain metrics. Output strict JSON only:\n\n`
            + JSON.stringify(payload, null, 2);

        const body = {
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userMsg }] }],
            generationConfig: {
                temperature: 0.1, topP: 0.8,
                maxOutputTokens: 2000,
                responseMimeType: 'application/json'
            }
        };

        const resp = await fetch(GEMINI_URL(apiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
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

    // ── Public: analyze ────────────────────────────────────────────────────────
    async function analyzeToken(apiKey) {
        if (!_currentMetrics) {
            _renderError('Buka token di DEX Analyzer terlebih dahulu, lalu klik ⚡ Analyze.');
            return;
        }
        if (!apiKey || !apiKey.trim()) {
            _renderError('Masukkan Gemini API Key. Gratis di: aistudio.google.com');
            return;
        }
        if (_isLoading) return;

        _isLoading = true;
        _renderLoading(_currentMetrics.token?.symbol || '…');

        try {
            const result = await _callGemini(apiKey.trim(), _currentMetrics);
            _lastResult  = result;
            _renderResult(result);
            sessionStorage.setItem('hf_gemini_key', apiKey.trim());
        } catch (e) {
            _renderError(`Gagal: ${e.message}`);
        } finally {
            _isLoading = false;
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  RENDERING
    // ══════════════════════════════════════════════════════════════════════

    const _g = (id) => document.getElementById(id);

    function _renderLoading(sym) {
        const el = _g('hfaiContent'); if (!el) return;
        el.innerHTML = `
        <div class="hfai-loading">
            <div class="hfai-spinner"></div>
            <div class="hfai-loading-text">
                <span class="hfai-loading-label">Analyzing <strong>${sym}</strong>…</span>
                <span class="hfai-loading-sub">Quantitative AI memproses on-chain metrics &amp; phase detection</span>
            </div>
        </div>`;
    }

    function _renderError(msg) {
        const el = _g('hfaiContent'); if (!el) return;
        el.innerHTML = `<div class="hfai-error"><span class="hfai-error-icon">⚠️</span><span>${msg}</span></div>`;
    }

    // helpers
    function _pct(v)     { return typeof v === 'number' ? `${v}%` : (v || '—'); }
    function _num(v)     { return typeof v === 'number' ? v : (v || '—'); }
    function _score(s,m) { return (typeof s === 'number' && typeof m === 'number') ? `${s}/${m}` : (s || '—'); }

    function _bar(v, inverse = false) {
        if (typeof v !== 'number') return '';
        const c = Math.min(100, Math.max(0, v));
        const col = inverse
            ? (c <= 30 ? '#4ade80' : c <= 60 ? '#fbbf24' : '#f87171')
            : (c >= 70 ? '#4ade80' : c >= 40 ? '#fbbf24' : '#f87171');
        return `<div class="hfai-bar-track"><div class="hfai-bar-fill" style="width:${c}%;background:${col}"></div></div>`;
    }

    function _scoreBar(v) {
        if (typeof v !== 'number') return '';
        const c   = Math.min(100, Math.max(0, v));
        const col = c >= 70 ? '#4ade80' : c >= 40 ? '#fbbf24' : '#f87171';
        return `
        <div class="hfai-score-bar-wrap">
            <div class="hfai-bar-track" style="height:8px">
                <div class="hfai-bar-fill" style="width:${c}%;background:${col};height:8px"></div>
            </div>
            <span class="hfai-score-bar-val" style="color:${col}">${c}</span>
        </div>`;
    }

    const _VERDICT = {
        STRONG_BUY:        { icon: '🚀', cls: 'hfai-verdict-buy-strong',   label: 'STRONG BUY' },
        BUY:               { icon: '🟢', cls: 'hfai-verdict-buy',          label: 'BUY' },
        HOLD:              { icon: '🟡', cls: 'hfai-verdict-hold',         label: 'HOLD' },
        AVOID:             { icon: '🟠', cls: 'hfai-verdict-avoid',        label: 'AVOID' },
        STRONG_AVOID:      { icon: '🔴', cls: 'hfai-verdict-avoid-strong', label: 'STRONG AVOID' },
        INSUFFICIENT_DATA: { icon: '⚪', cls: 'hfai-verdict-unknown',      label: 'INSUFFICIENT DATA' }
    };
    const _RISK = {
        LOW:    { cls: 'hfai-risk-low',    label: 'LOW RISK' },
        MEDIUM: { cls: 'hfai-risk-medium', label: 'MEDIUM RISK' },
        HIGH:   { cls: 'hfai-risk-high',   label: 'HIGH RISK' }
    };
    const _ASSESS_COLOR = {
        STRONG: '#4ade80', ADEQUATE: '#86efac', WEAK: '#fbbf24', CRITICAL: '#f87171',
        HEALTHY: '#4ade80', MODERATE: '#86efac', CONCENTRATED: '#fbbf24', DANGEROUS: '#f87171',
        SAFE: '#4ade80', CAUTION: '#fbbf24', RISKY: '#f97316',
        LOCKED: '#4ade80', PARTIAL: '#fbbf24', UNLOCKED: '#f87171', UNKNOWN: '#94a3b8',
        BULLISH: '#4ade80', STRONG_BULLISH: '#22c55e', NEUTRAL: '#94a3b8',
        BEARISH: '#f97316', STRONG_BEARISH: '#f87171',
        bullish: '#4ade80', neutral: '#94a3b8', bearish: '#f87171',
        strong: '#4ade80', moderate: '#fbbf24', weak: '#f97316',
        excellent: '#4ade80', good: '#86efac', risky: '#fbbf24', avoid: '#f87171'
    };

    const _PHASE_META = {
        stealth_accumulation:  { icon: '🔍', color: '#6366f1', label: 'STEALTH ACCUMULATION',  id: 'Akumulasi Diam-diam' },
        breakout_preparation:  { icon: '⚡', color: '#22c55e', label: 'BREAKOUT PREPARATION',   id: 'Persiapan Breakout' },
        sniper_dominance:      { icon: '🎯', color: '#f97316', label: 'SNIPER DOMINANCE',       id: 'Dominasi Sniper' },
        distribution_phase:    { icon: '📉', color: '#f87171', label: 'DISTRIBUTION PHASE',     id: 'Fase Distribusi' },
        weak_structure:        { icon: '⚠️', color: '#fbbf24', label: 'WEAK STRUCTURE',         id: 'Struktur Lemah' }
    };

    const _STRUCT_META = {
        early_smart_money_accumulation: {
            icon: '🐋', color: '#6366f1',
            label: 'Early Smart Money Accumulation',
            id:    'A — Akumulasi Whale Diam-diam',
            desc:  'Whale & smart money sedang beli secara diam-diam. Harga masih flat, volume rendah. Ini bisa jadi setup sebelum pump besar.'
        },
        controlled_pump_setup: {
            icon: '🚀', color: '#22c55e',
            label: 'Controlled Pump Setup',
            id:    'B — Setup Pump Terkontrol',
            desc:  'Smart money sudah masuk banyak, volume mulai naik. Ada indikasi pump yang terkoordinasi akan segera terjadi.'
        },
        sniper_flip_cycle: {
            icon: '🎯', color: '#f97316',
            label: 'Sniper Flip Cycle',
            id:    'C — Siklus Flip Sniper',
            desc:  'Wallet sniper (pembeli pertama) masih mendominasi dan sedang flip ke retail. Hati-hati beli di atas — kamu bisa jadi exit liquidity mereka.'
        },
        retail_exit_liquidity: {
            icon: '📤', color: '#f87171',
            label: 'Retail Exit Liquidity',
            id:    'D — Jebakan FOMO Retail',
            desc:  'Insider & whale sedang jual ke retail yang FOMO. Volume naik tapi distribusi melebar. Risiko tinggi untuk masuk sekarang.'
        },
        structural_weakness: {
            icon: '💤', color: '#fbbf24',
            label: 'Structural Weakness',
            id:    'E — Struktur Lemah',
            desc:  'Sinyal tidak konsisten, tidak ada arah yang jelas. Data tidak cukup untuk membuat keputusan tegas.'
        }
    };

    const _CAPITAL_META = {
        aggressive_allocation: {
            icon: '🔥', color: '#22c55e',
            label: 'Aggressive Allocation',
            id:    'Masuk Besar',
            desc:  'Sinyal sangat kuat. Setup ideal. Boleh alokasi besar dengan manajemen risiko ketat.'
        },
        moderate_allocation: {
            icon: '✅', color: '#4ade80',
            label: 'Moderate Allocation',
            id:    'Masuk Sebagian',
            desc:  'Sinyal bagus tapi ada beberapa risiko. Masuk dengan posisi sebagian dulu, observasi sebelum tambah.'
        },
        observational: {
            icon: '👁️', color: '#fbbf24',
            label: 'Observational',
            id:    'Pantau Dulu',
            desc:  'Sinyal campur aduk. Belum waktunya masuk. Set alert dan tunggu konfirmasi lebih jelas.'
        },
        defensive: {
            icon: '🛡️', color: '#f97316',
            label: 'Defensive',
            id:    'Kurangi Eksposur',
            desc:  'Ada tanda peringatan. Kalau sudah punya posisi, pertimbangkan kurangi. Jangan tambah sekarang.'
        },
        avoid: {
            icon: '🚫', color: '#f87171',
            label: 'Avoid',
            id:    'Jangan Masuk',
            desc:  'Risiko kritis terdeteksi. Hindari token ini. Jangan FOMO.'
        }
    };

    function _trendColor(t) {
        if (!t) return '#94a3b8';
        if (t.includes('STRONG_BULL')) return '#22c55e';
        if (t.includes('BULL'))        return '#4ade80';
        if (t.includes('STRONG_BEAR')) return '#f87171';
        if (t.includes('BEAR'))        return '#f97316';
        return '#94a3b8';
    }

    function _renderResult(r) {
        const el = _g('hfaiContent'); if (!el) return;

        const verdict  = _VERDICT[r.overall_verdict]                    || _VERDICT.HOLD;
        const risk     = _RISK[r.risk_level]                            || _RISK.MEDIUM;
        const cs       = r.core_scores            || {};
        const mm       = r.market_metrics         || {};
        const probs    = r.probabilities          || {};
        const struct   = r.structure              || {};
        const rel      = r.relational_analysis    || {};
        const sig      = r.signals                || {};
        const liq      = sig.liquidity            || {};
        const hld      = sig.holders              || {};
        const ctr      = sig.contract             || {};
        const lp       = sig.lp_lock              || {};
        const pa       = r.price_action           || {};
        const flags    = ctr.flags                || [];

        const phase    = _PHASE_META[r.dominant_phase]              || { icon: '❓', color: '#94a3b8', label: r.dominant_phase || 'UNKNOWN', id: '—' };
        const strClass = _STRUCT_META[r.structural_classification]  || { icon: '❓', color: '#94a3b8', label: r.structural_classification || '—', id: '—', desc: '' };
        const capital  = _CAPITAL_META[r.capital_positioning]       || { icon: '❓', color: '#94a3b8', label: r.capital_positioning || '—', id: '—', desc: '' };

        // Relational rows: label → key → description for lay audience
        const relRows = [
            { icon: '🐋', label: 'Whale vs Harga',     key: 'WAS_vs_price',    hint: 'Apakah whale akumulasi diam-diam atau harga sudah dipompa?' },
            { icon: '📊', label: 'Volume vs Volatilitas', key: 'volume_vs_vol', hint: 'Volume tinggi tapi harga diam = manipulasi? Atau organik?' },
            { icon: '🎯', label: 'Sniper vs Distribusi', key: 'SDS_vs_DI',      hint: 'Sniper masih pegang atau sudah buang ke retail?' },
            { icon: '🧠', label: 'Smart Money vs Likuiditas', key: 'SMI_vs_liq', hint: 'Smart money tambah atau tarik likuiditas?' },
            { icon: '👥', label: 'Holder Baru vs Top 10', key: 'holder_vs_top10', hint: 'Holder baru = retail asli atau whale split wallet?' }
        ];

        el.innerHTML = `
        <div class="hfai-result">

            <!-- ══ VERDICT HEADER ══ -->
            <div class="hfai-header">
                <div class="hfai-verdict ${verdict.cls}">
                    <span class="hfai-verdict-icon">${verdict.icon}</span>
                    <span class="hfai-verdict-label">${verdict.label}</span>
                </div>
                <div class="hfai-header-meta">
                    <span class="hfai-token-name">${r.token || '—'} <span class="hfai-chain">${r.chain || ''}</span></span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                        <span class="hfai-risk-badge ${risk.cls}">${risk.label}</span>
                        <span class="hfai-conf-inline">Confidence: <strong>${r.confidence_score ?? '—'}%</strong></span>
                        <span class="hfai-conf-inline">Alpha: <strong>${r.alpha_signal_strength ?? '—'}%</strong></span>
                    </div>
                </div>
            </div>

            <!-- ══ STRUCTURAL CLASSIFICATION (A-E) ══ -->
            <div class="hfai-struct-class-card" style="border-color:${strClass.color}33;background:${strClass.color}0d">
                <div class="hfai-struct-class-top">
                    <span class="hfai-struct-class-icon">${strClass.icon}</span>
                    <div class="hfai-struct-class-info">
                        <div class="hfai-struct-class-id" style="color:${strClass.color}">${strClass.id}</div>
                        <div class="hfai-struct-class-label">${strClass.label}</div>
                    </div>
                    <div class="hfai-struct-class-conf">
                        <span style="color:${strClass.color};font-size:1.2rem;font-weight:800">${r.structural_confidence ?? '—'}%</span>
                        <span style="font-size:0.68rem;color:#64748b">structural confidence</span>
                    </div>
                </div>
                <div class="hfai-struct-class-desc">${strClass.desc}</div>
                ${r.structural_reasoning ? `<div class="hfai-struct-class-reason">"${r.structural_reasoning}"</div>` : ''}
            </div>

            <!-- ══ CAPITAL POSITIONING BIAS ══ -->
            <div class="hfai-capital-bias" style="border-color:${capital.color}44;background:${capital.color}0d">
                <div class="hfai-capital-left">
                    <span class="hfai-capital-icon">${capital.icon}</span>
                    <div>
                        <div class="hfai-capital-id" style="color:${capital.color}">${capital.id}</div>
                        <div class="hfai-capital-label">${capital.label}</div>
                    </div>
                </div>
                <div class="hfai-capital-desc">${capital.desc}</div>
                ${r.capital_reasoning ? `<div class="hfai-capital-reason">${r.capital_reasoning}</div>` : ''}
            </div>

            <!-- ══ DOMINANT PHASE ══ -->
            <div class="hfai-phase-card" style="border-color:${phase.color}22;background:${phase.color}0a">
                <div class="hfai-phase-left">
                    <span class="hfai-phase-icon">${phase.icon}</span>
                    <div>
                        <div class="hfai-phase-sublabel">Fase Dominan</div>
                        <div class="hfai-phase-label" style="color:${phase.color}">${phase.id || phase.label}</div>
                        <div class="hfai-phase-reasoning">${r.phase_reasoning || ''}</div>
                    </div>
                </div>
                <div class="hfai-phase-conf">
                    <span class="hfai-phase-conf-val" style="color:${phase.color}">${r.phase_confidence ?? '—'}%</span>
                    <span class="hfai-phase-conf-lbl">phase confidence</span>
                </div>
            </div>

            <!-- ══ CORE SCORES ══ -->
            <div class="hfai-section-title">📊 Core Scores</div>
            <div class="hfai-core-scores-grid">
                ${[
                    ['WAS',  'Akumulasi Whale',      'Seberapa banyak whale sedang beli',             cs.WAS ],
                    ['SDS',  'Deteksi Sniper',        'Seberapa aman dari sniper wallet',              cs.SDS ],
                    ['LSS',  'Stabilitas Likuiditas', 'Seberapa stabil likuiditas token ini',          cs.LSS ],
                    ['DI',   'Distribusi Holder',     'Seberapa merata distribusi kepemilikan',        cs.DI  ],
                    ['SWQS', 'Kualitas Kontrak',      'Seberapa aman kontrak smart contract-nya',      cs.SWQS],
                    ['SMI',  'Smart Money Index',     'Indeks gabungan aktivitas smart money',         cs.SMI ]
                ].map(([abbr, iLabel, hint, val]) => `
                <div class="hfai-cs-card" title="${hint}">
                    <div class="hfai-cs-abbr">${abbr}</div>
                    <div class="hfai-cs-val">${typeof val === 'number' ? val : '—'}</div>
                    ${_scoreBar(typeof val === 'number' ? val : null)}
                    <div class="hfai-cs-label">${iLabel}</div>
                </div>`).join('')}
            </div>

            <!-- ══ ALPHA + CONFIDENCE ══ -->
            <div class="hfai-alpha-row">
                <div class="hfai-alpha-card">
                    <div class="hfai-alpha-label">⚡ Alpha Signal Strength</div>
                    <div class="hfai-alpha-hint">Seberapa kuat sinyal keuntungan terdeteksi</div>
                    <div class="hfai-alpha-val">${r.alpha_signal_strength ?? '—'}%</div>
                    ${_bar(r.alpha_signal_strength)}
                </div>
                <div class="hfai-alpha-card">
                    <div class="hfai-alpha-label">🎯 Confidence Score</div>
                    <div class="hfai-alpha-hint">Seberapa yakin AI dengan analisa ini</div>
                    <div class="hfai-alpha-val">${r.confidence_score ?? '—'}%</div>
                    ${_bar(r.confidence_score)}
                </div>
            </div>

            <!-- ══ PROBABILITIES — 5 MAIN ══ -->
            <div class="hfai-section-title">🎲 Probabilitas Aktivitas On-Chain</div>
            <div class="hfai-prob5-grid">
                ${[
                    { icon:'🐋', key:'accumulation',    label:'Akumulasi',          hint:'Peluang whale sedang kumpulkan token',         inv:false },
                    { icon:'🚀', key:'controlled_pump', label:'Pump Terkontrol',    hint:'Peluang pump terkoordinasi akan terjadi',       inv:false },
                    { icon:'📤', key:'distribution',    label:'Distribusi/Jual',    hint:'Peluang insider sedang jual ke retail',         inv:true  },
                    { icon:'🤖', key:'manipulation',    label:'Manipulasi Harga',   hint:'Peluang harga/volume dimanipulasi',             inv:true  },
                    { icon:'💀', key:'rug_risk',        label:'Risiko Rug Pull',    hint:'Peluang likuiditas dicabut atau exit scam',     inv:true  }
                ].map(p => `
                <div class="hfai-prob5-card" title="${p.hint}">
                    <div class="hfai-prob5-icon">${p.icon}</div>
                    <div class="hfai-prob5-label">${p.label}</div>
                    <div class="hfai-prob5-hint">${p.hint}</div>
                    <div class="hfai-prob5-val">${_pct(probs[p.key])}</div>
                    ${_bar(probs[p.key], p.inv)}
                </div>`).join('')}
            </div>

            <!-- ══ RELATIONAL ANALYSIS ══ -->
            <div class="hfai-section-title">🔗 Analisa Relasional (Hubungan Antar Metrik)</div>
            <div class="hfai-relational-list">
                ${relRows.map(row => `
                <div class="hfai-rel-row">
                    <div class="hfai-rel-left">
                        <span class="hfai-rel-icon">${row.icon}</span>
                        <div>
                            <div class="hfai-rel-label">${row.label}</div>
                            <div class="hfai-rel-hint">${row.hint}</div>
                        </div>
                    </div>
                    <div class="hfai-rel-insight">${rel[row.key] || '—'}</div>
                </div>`).join('')}
            </div>

            <!-- ══ MARKET STRUCTURE ══ -->
            <div class="hfai-section-title">🏗️ Struktur Pasar</div>
            <div class="hfai-structure-row">
                <div class="hfai-struct-card">
                    <span class="hfai-struct-label">Arah Pasar</span>
                    <span class="hfai-struct-val" style="color:${_ASSESS_COLOR[struct.market_bias]||'#94a3b8'}">
                        ${{bullish:'📈 Bullish',neutral:'➡️ Netral',bearish:'📉 Bearish'}[struct.market_bias] || (struct.market_bias||'—').toUpperCase()}
                    </span>
                </div>
                <div class="hfai-struct-card">
                    <span class="hfai-struct-label">Kesehatan Likuiditas</span>
                    <span class="hfai-struct-val" style="color:${_ASSESS_COLOR[struct.liquidity_health]||'#94a3b8'}">
                        ${{strong:'💪 Kuat',moderate:'🟡 Sedang',weak:'⚠️ Lemah'}[struct.liquidity_health] || (struct.liquidity_health||'—').toUpperCase()}
                    </span>
                </div>
                <div class="hfai-struct-card">
                    <span class="hfai-struct-label">Kualitas Entry</span>
                    <span class="hfai-struct-val" style="color:${_ASSESS_COLOR[struct.entry_quality]||'#94a3b8'}">
                        ${{excellent:'🟢 Sangat Bagus',good:'✅ Bagus',risky:'⚠️ Berisiko',avoid:'🚫 Hindari'}[struct.entry_quality] || (struct.entry_quality||'—').toUpperCase()}
                    </span>
                </div>
            </div>

            <!-- ══ MARKET METRICS 24H ══ -->
            <div class="hfai-section-title">📡 Perubahan 24 Jam</div>
            <div class="hfai-mm-grid">
                ${[
                    ['💲 Perubahan Harga',      mm.PriceChange24h,       false, 'Naik/turun harga dalam 24 jam'],
                    ['📊 Perubahan Volume',     mm.VolumeChange24h,      false, 'Naik/turun volume trading 24 jam'],
                    ['💧 Perubahan Likuiditas', mm.LiquidityChange24h,   false, 'Likuiditas bertambah atau berkurang'],
                    ['👥 Pertumbuhan Holder',   mm.HolderGrowth24h,      false, 'Bertambah berapa persen holder baru'],
                    ['🐋 Perubahan Top 10',     mm.Top10HolderChange24h, true,  'Top 10 wallet tambah atau kurangi kepemilikan']
                ].map(([label, val, inv, hint]) => {
                    const isNum = typeof val === 'number';
                    const col   = !isNum ? '#94a3b8'
                        : inv ? (val <= 0 ? '#4ade80' : '#f87171')
                               : (val >= 0 ? '#4ade80' : '#f87171');
                    const disp  = isNum ? (val >= 0 ? `+${val.toFixed(2)}%` : `${val.toFixed(2)}%`) : (val || '—');
                    return `<div class="hfai-mm-item" title="${hint}">
                        <span class="hfai-mm-label">${label}</span>
                        <span class="hfai-mm-val" style="color:${col}">${disp}</span>
                    </div>`;
                }).join('')}
            </div>

            <!-- ══ ON-CHAIN SIGNALS ══ -->
            <div class="hfai-section-title">🔬 Sinyal On-Chain</div>
            <div class="hfai-signal-grid">
                <div class="hfai-signal-card">
                    <div class="hfai-sig-header"><span>💧 Likuiditas</span><span class="hfai-sig-score">${_score(liq.score,25)}</span></div>
                    <div class="hfai-sig-assess" style="color:${_ASSESS_COLOR[liq.assessment]||'#94a3b8'}">${liq.assessment||'—'}</div>
                    <div class="hfai-sig-row"><span>Risiko Rug</span><strong>${_pct(liq.probability_rug)}</strong></div>
                    <div class="hfai-sig-row"><span>Rasio Vol/Liq</span><strong>${_num(liq.vol_liq_ratio)}</strong></div>
                    <div class="hfai-sig-notes">${liq.notes||''}</div>
                </div>
                <div class="hfai-signal-card">
                    <div class="hfai-sig-header"><span>👥 Holder</span><span class="hfai-sig-score">${_score(hld.score,25)}</span></div>
                    <div class="hfai-sig-assess" style="color:${_ASSESS_COLOR[hld.assessment]||'#94a3b8'}">${hld.assessment||'—'}</div>
                    <div class="hfai-sig-row"><span>Risiko Konsentrasi</span><strong>${_pct(hld.concentration_risk)}</strong></div>
                    <div class="hfai-sig-row"><span>Dominasi Whale</span><strong>${_pct(hld.whale_dominance)}</strong></div>
                    <div class="hfai-sig-notes">${hld.notes||''}</div>
                </div>
                <div class="hfai-signal-card">
                    <div class="hfai-sig-header"><span>📋 Kontrak</span><span class="hfai-sig-score">${_score(ctr.score,25)}</span></div>
                    <div class="hfai-sig-assess" style="color:${_ASSESS_COLOR[ctr.assessment]||'#94a3b8'}">${ctr.assessment||'—'}</div>
                    <div class="hfai-sig-row"><span>Prob. Honeypot</span><strong>${_pct(ctr.honeypot_probability)}</strong></div>
                    <div class="hfai-sig-row"><span>Vektor Risiko</span><strong>${_num(ctr.rug_vector_count)}</strong></div>
                    ${flags.length?`<div class="hfai-flags">${flags.map(f=>`<span class="hfai-flag">${f}</span>`).join('')}</div>`:''}
                </div>
                <div class="hfai-signal-card">
                    <div class="hfai-sig-header"><span>🔒 LP Lock</span><span class="hfai-sig-score">${_score(lp.score,25)}</span></div>
                    <div class="hfai-sig-assess" style="color:${_ASSESS_COLOR[lp.assessment]||'#94a3b8'}">${lp.assessment||'—'}</div>
                    <div class="hfai-sig-row"><span>Prob. LP Ditarik</span><strong>${_pct(lp.probability_lp_pull)}</strong></div>
                    <div class="hfai-sig-row"><span>% LP Terkunci</span><strong>${_pct(lp.locked_pct)}</strong></div>
                </div>
            </div>

            <!-- ══ PRICE ACTION ══ -->
            <div class="hfai-pa-wrap">
                <div class="hfai-section-title">📈 Aksi Harga</div>
                <div class="hfai-pa-grid">
                    <div class="hfai-pa-item"><span>Tren 24H</span><strong style="color:${_trendColor(pa.trend_24h)}">${(pa.trend_24h||'—').replace(/_/g,' ')}</strong></div>
                    <div class="hfai-pa-item"><span>Tren 1H</span><strong style="color:${_trendColor(pa.trend_1h)}">${(pa.trend_1h||'—').replace(/_/g,' ')}</strong></div>
                    <div class="hfai-pa-item"><span>Momentum</span><strong>${_pct(pa.momentum_score)}</strong></div>
                    <div class="hfai-pa-item"><span>Tekanan Beli/Jual</span><strong>${(pa.buy_sell_pressure||'—').replace(/_/g,' ')}</strong></div>
                    <div class="hfai-pa-item"><span>Risiko Wash Trade</span><strong>${_pct(pa.wash_trading_risk)}</strong></div>
                </div>
            </div>

            <!-- ══ SMART MONEY PROBS ══ -->
            <div class="hfai-prob-grid">
                <div class="hfai-prob-card">
                    <div class="hfai-prob-icon">📈</div>
                    <div class="hfai-prob-label">Prob. Pre-Pump</div>
                    <div class="hfai-prob-val">${_pct(probs.pre_pump_probability)}</div>
                    ${_bar(probs.pre_pump_probability)}
                </div>
                <div class="hfai-prob-card">
                    <div class="hfai-prob-icon">🧠</div>
                    <div class="hfai-prob-label">Kontrol Smart Money</div>
                    <div class="hfai-prob-val">${_pct(probs.smart_money_control)}</div>
                    ${_bar(probs.smart_money_control)}
                </div>
                <div class="hfai-prob-card">
                    <div class="hfai-prob-icon">🪤</div>
                    <div class="hfai-prob-label">Risiko Jebakan Retail</div>
                    <div class="hfai-prob-val">${_pct(probs.retail_trap_risk)}</div>
                    ${_bar(probs.retail_trap_risk,true)}
                </div>
                <div class="hfai-prob-card">
                    <div class="hfai-prob-icon">🛡️</div>
                    <div class="hfai-prob-label">Safety Score</div>
                    <div class="hfai-prob-val">${_pct(r.total_safety_score)}</div>
                    ${_bar(r.total_safety_score)}
                </div>
            </div>

            <!-- ══ PROFIT PROBS ══ -->
            <div class="hfai-prob-grid" style="grid-template-columns:repeat(3,1fr)">
                <div class="hfai-prob-card">
                    <div class="hfai-prob-icon">🗓️</div>
                    <div class="hfai-prob-label">Profit 7 Hari</div>
                    <div class="hfai-prob-val">${_pct(r.probability_profit_7d)}</div>
                    ${_bar(r.probability_profit_7d)}
                </div>
                <div class="hfai-prob-card">
                    <div class="hfai-prob-icon">📅</div>
                    <div class="hfai-prob-label">Profit 30 Hari</div>
                    <div class="hfai-prob-val">${_pct(r.probability_profit_30d)}</div>
                    ${_bar(r.probability_profit_30d)}
                </div>
                <div class="hfai-prob-card">
                    <div class="hfai-prob-icon">💀</div>
                    <div class="hfai-prob-label">Rug Risk 30 Hari</div>
                    <div class="hfai-prob-val">${_pct(r.probability_rug_30d)}</div>
                    ${_bar(r.probability_rug_30d,true)}
                </div>
            </div>

            <!-- ══ RISKS / CATALYSTS ══ -->
            <div class="hfai-risks-catalysts">
                ${(r.key_risks&&r.key_risks.length)?`
                <div class="hfai-list-card hfai-list-risks">
                    <div class="hfai-section-title">⚠️ Risiko Utama</div>
                    <ul>${r.key_risks.map(x=>`<li>${x}</li>`).join('')}</ul>
                </div>`:''}
                ${(r.key_catalysts&&r.key_catalysts.length)?`
                <div class="hfai-list-card hfai-list-catalysts">
                    <div class="hfai-section-title">🚀 Katalis Positif</div>
                    <ul>${r.key_catalysts.map(x=>`<li>${x}</li>`).join('')}</ul>
                </div>`:''}
            </div>

            <!-- ══ AI SUMMARY ══ -->
            ${r.analyst_summary?`
            <div class="hfai-confidence-wrap">
                <div class="hfai-section-title" style="margin-bottom:6px">💬 Ringkasan AI (untuk Pemula)</div>
                <div class="hfai-summary">${r.analyst_summary}</div>
            </div>`:''}

            <!-- ══ RAW JSON ══ -->
            <div class="hfai-json-wrap">
                <button class="hfai-json-toggle" onclick="this.nextElementSibling.classList.toggle('hfai-json-visible')">
                    { } Lihat Raw JSON
                </button>
                <pre class="hfai-json-pre">${JSON.stringify(r,null,2)}</pre>
            </div>

            <div class="hfai-disclaimer">⚠️ Bukan saran keuangan. Output AI untuk edukasi &amp; riset saja. Selalu DYOR sebelum berinvestasi.</div>
        </div>`;
    }

    // ── Public trigger ─────────────────────────────────────────────────────────
    function triggerAnalysis() {
        const keyEl  = _g('hfaiKeyInput');
        const apiKey = keyEl ? keyEl.value.trim()
                             : (sessionStorage.getItem('hf_gemini_key') || '');
        analyzeToken(apiKey);
    }

    function initPanel() {} // kept for API compatibility

    function refreshAnalyzeButton() {
        if (!_lastResult && !_isLoading) {
            const keyEl = _g('hfaiKeyInput');
            if (keyEl && !keyEl.value) {
                const saved = sessionStorage.getItem('hf_gemini_key') || '';
                if (saved) keyEl.value = saved;
            }
        }
    }

    return { setContext, buildMetricsPayload, analyzeToken, triggerAnalysis, initPanel, refreshAnalyzeButton };
})();

console.log('✅ Hedge Fund AI v3 loaded');
