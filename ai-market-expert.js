// ══════════════════════════════════════════════════════════════════════════════
//  AI Market Expert v2 — Daily Narrative Forecaster
//  Powered by Google Gemini · Crypto & Equity Markets
//  Generates day-by-day scenario narratives like a professional market analyst
// ══════════════════════════════════════════════════════════════════════════════

const aiMarketExpert = (() => {
    'use strict';

    const GEMINI_MODEL = 'gemini-2.0-flash';
    const GEMINI_URL   = (k) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${k}`;

    // ── System Prompt ─────────────────────────────────────────────────────────
    const SYSTEM_PROMPT = `You are a professional crypto market analyst with expertise in price action, market cycles, liquidity dynamics, and behavioral finance. You write daily scenario narratives like a seasoned hedge fund macro trader — sharp, narrative-driven, specific.

STRICT RULES:
- Output STRICT JSON only. No markdown. No text outside JSON.
- All narrative fields MUST be in Indonesian (bahasa Indonesia).
- Be specific with price targets, time windows, and conditions.
- Each day gets a creative "phase name" (Nama Fase) that captures the market psychology — like "The Great Deception", "Accumulation in Chaos", "The Final Flush", "Silent Bull", "Whale Awakening", etc.
- Probabilities are integers 0-100.
- Price targets are numbers (not strings).
- analysis_date is today's date. Days start from tomorrow.

ANALYTICAL APPROACH:
1. Read current price, 24h change, RSI, volume trend, market structure
2. Identify the DOMINANT narrative: Are whales accumulating? Is retail FOMO-ing? Is there a liquidity grab incoming? Is there a macro catalyst?
3. For each day, project the most probable price behavior with:
   - A named phase (creative, evocative)
   - Direction bias (bullish/sideways/bearish/volatile)
   - Detailed narrative (2-3 sentences) explaining WHY this day will behave this way
   - Price targets (key levels to watch)
   - Critical time windows (jam krusial) — specific hours in WIB when key moves are most likely
   - Alternative scenario (what invalidates this view)
4. End with an overall weekly outlook and key levels to watch

OUTPUT FORMAT — Strict JSON only:
{
  "asset": "SYMBOL",
  "asset_name": "Full Name",
  "analysis_date": "YYYY-MM-DD",
  "current_price": <number>,
  "weekly_bias": "bullish|sideways|bearish|volatile",
  "weekly_bias_confidence": <0-100>,
  "weekly_summary": "<2-3 kalimat ringkasan outlook mingguan dalam bahasa Indonesia>",

  "dominant_narrative": "<1 kalimat: apa yang sebenarnya terjadi di pasar sekarang — siapa yang mengontrol, apa yang mereka lakukan>",

  "key_levels": {
    "strong_support": [<price1>, <price2>],
    "strong_resistance": [<price1>, <price2>],
    "critical_pivot": <price>,
    "invalidation_bull": <price>,
    "invalidation_bear": <price>
  },

  "daily_scenarios": [
    {
      "day": 1,
      "date": "YYYY-MM-DD",
      "day_name": "<nama hari dalam bahasa Indonesia, misal Senin>",
      "phase_name": "<nama fase kreatif dalam bahasa Inggris, misal 'The Great Deception'>",
      "phase_name_id": "<terjemahan nama fase dalam bahasa Indonesia>",
      "direction": "bullish|sideways|bearish|volatile",
      "direction_confidence": <0-100>,
      "narrative": "<2-3 kalimat analisis mengapa hari ini akan berperilaku seperti ini — sebut faktor spesifik: likuidasi posisi, akumulasi whale, reaktif terhadap news, dll. Bahasa Indonesia.>",
      "price_target_main": <number>,
      "price_target_high": <number>,
      "price_target_low": <number>,
      "critical_hours_wib": "<jam spesifik dalam WIB ketika gerakan besar paling mungkin terjadi, misal '20.00–23.00 WIB (Sesi New York)'>",
      "critical_hours_reason": "<kenapa jam itu krusial — sesi trading apa, event apa>",
      "watch_for": "<1 kalimat: apa yang harus diperhatikan trader hari ini>",
      "alternative_scenario": "<jika skenario utama gagal, apa yang terjadi — sebutkan kondisi invalidasi dan target alternatif>"
    }
  ],

  "trading_framework": {
    "entry_strategy": "<kapan dan bagaimana masuk posisi — bahasa Indonesia>",
    "risk_management": "<stop loss dan position sizing yang disarankan>",
    "key_catalyst_this_week": "<1-2 event atau faktor yang paling berpengaruh minggu ini>",
    "biggest_risk": "<risiko terbesar yang bisa membalikkan semua skenario>"
  },

  "disclaimer": "Analisis ini dibuat AI untuk tujuan edukasi. Bukan saran keuangan. Selalu lakukan riset mandiri."
}`;

    // ── Build payload ─────────────────────────────────────────────────────────
    function _buildPayload(asset) {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];

        return {
            asset_symbol:    asset.symbol,
            asset_name:      asset.name,
            analysis_date:   dateStr,
            days_to_forecast: 5,

            current_market: {
                price:            asset.price,
                change_24h_pct:   asset.change24h,
                change_7d_pct:    asset.change7d  || null,
                volume_24h:       asset.volume24h || null,
                market_cap:       asset.marketCap || null,
                rsi_14:           asset.rsi       || null,
                macd_signal:      asset.macd      || null,
                trend:            asset.trend     || null,
                dominance:        asset.dominance || null,
                fear_greed_index: asset.fearGreed || null,
            },

            market_context: {
                btc_dominance:      asset.btcDominance  || null,
                total_market_cap:   asset.totalMarket   || null,
                defi_tvl:           asset.defiTvl       || null,
                recent_news:        asset.recentNews    || 'No specific news provided',
                macro_environment:  'Fed rate stable, crypto market in consolidation phase',
                upcoming_events:    asset.upcomingEvents || 'No specific events',
            },

            analyst_instruction: `Generate a 5-day daily scenario narrative starting from tomorrow (${new Date(today.getTime()+86400000).toISOString().split('T')[0]}). Each day must have a creative phase name, specific price targets, and critical WIB hours. Be bold and specific like a professional macro analyst. Output STRICT JSON only.`
        };
    }

    // ── Call Gemini ────────────────────────────────────────────────────────────
    async function _callGemini(apiKey, payload) {
        const body = {
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{
                role: 'user',
                parts: [{ text: 'Generate daily scenario narrative for this asset. Output strict JSON only:\n\n' + JSON.stringify(payload, null, 2) }]
            }],
            generationConfig: {
                temperature:      0.4,
                topP:             0.9,
                maxOutputTokens:  4000,
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

    // ── Render result ─────────────────────────────────────────────────────────
    function _renderResult(r, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const na = (v) => v != null ? v : '—';
        const fmtPrice = (v, sym) => {
            if (!v) return '—';
            const isUSD = sym !== 'IDR';
            return isUSD
                ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                : `Rp ${Number(v).toLocaleString('id-ID')}`;
        };

        const BIAS_META = {
            bullish:   { icon: '📈', color: '#4ade80', label: 'Bullish' },
            sideways:  { icon: '➡️', color: '#fbbf24', label: 'Sideways' },
            bearish:   { icon: '📉', color: '#f87171', label: 'Bearish' },
            volatile:  { icon: '⚡', color: '#a78bfa', label: 'Volatile' },
        };

        const DIR_META = {
            bullish:  { icon: '📈', color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.25)' },
            sideways: { icon: '➡️', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.25)' },
            bearish:  { icon: '📉', color: '#f87171', bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.25)' },
            volatile: { icon: '⚡', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)' },
        };

        const biasM = BIAS_META[r.weekly_bias] || BIAS_META.sideways;
        const scenarios = r.daily_scenarios || [];
        const kl = r.key_levels || {};
        const tf = r.trading_framework || {};

        const isCrypto = !r.asset?.match(/^[A-Z]{2,4}(\.B)?$/) || true;
        const curr = r.asset?.includes('IDR') ? 'IDR' : 'USD';

        container.innerHTML = `
        <div class="ame-panel">

            <!-- ── Header ──────────────────────────────────────────── -->
            <div class="ame-header">
                <div class="ame-header-left">
                    <div class="ame-ticker">${na(r.asset)}</div>
                    <div class="ame-asset-name">${na(r.asset_name)}</div>
                    <div class="ame-date">📅 Analisis: ${na(r.analysis_date)}</div>
                </div>
                <div class="ame-header-right">
                    <div class="ame-price">$${Number(r.current_price||0).toLocaleString('en-US',{maximumFractionDigits:0})}</div>
                    <div class="ame-bias-badge" style="color:${biasM.color};background:${biasM.color}18;border:1px solid ${biasM.color}40">
                        ${biasM.icon} Outlook: <strong>${biasM.label}</strong>
                    </div>
                    <div class="ame-bias-conf">Confidence: ${na(r.weekly_bias_confidence)}%</div>
                </div>
            </div>

            <!-- ── Dominant Narrative ───────────────────────────────── -->
            <div class="ame-narrative-box">
                <div class="ame-narrative-icon">🎭</div>
                <div>
                    <div class="ame-narrative-title">Narasi Dominan Pasar</div>
                    <div class="ame-narrative-text">${na(r.dominant_narrative)}</div>
                </div>
            </div>

            <!-- ── Weekly Summary ──────────────────────────────────── -->
            <div class="ame-weekly-summary">
                <div class="ame-weekly-title">📊 Ringkasan Mingguan</div>
                <div class="ame-weekly-text">${na(r.weekly_summary)}</div>
            </div>

            <!-- ── Key Levels ──────────────────────────────────────── -->
            <div class="ame-levels-row">
                <div class="ame-levels-title">🗺️ Level Kunci</div>
                <div class="ame-levels-grid">
                    <div class="ame-level-item ame-level--support">
                        <span class="ame-level-lbl">Support Kuat</span>
                        <span class="ame-level-vals">${(kl.strong_support||[]).map(p=>fmtPrice(p,curr)).join(' · ')}</span>
                    </div>
                    <div class="ame-level-item ame-level--resistance">
                        <span class="ame-level-lbl">Resistance Kuat</span>
                        <span class="ame-level-vals">${(kl.strong_resistance||[]).map(p=>fmtPrice(p,curr)).join(' · ')}</span>
                    </div>
                    <div class="ame-level-item ame-level--pivot">
                        <span class="ame-level-lbl">Pivot Kritis</span>
                        <span class="ame-level-vals">${fmtPrice(kl.critical_pivot,curr)}</span>
                    </div>
                    <div class="ame-level-item ame-level--inv-bull">
                        <span class="ame-level-lbl">Invalidasi Bull</span>
                        <span class="ame-level-vals">${fmtPrice(kl.invalidation_bull,curr)}</span>
                    </div>
                    <div class="ame-level-item ame-level--inv-bear">
                        <span class="ame-level-lbl">Invalidasi Bear</span>
                        <span class="ame-level-vals">${fmtPrice(kl.invalidation_bear,curr)}</span>
                    </div>
                </div>
            </div>

            <!-- ── Daily Scenarios ─────────────────────────────────── -->
            <div class="ame-scenarios-title">📅 Skenario Harian (5 Hari ke Depan)</div>
            <div class="ame-scenarios-list">
                ${scenarios.map((day, i) => {
                    const dm = DIR_META[day.direction] || DIR_META.sideways;
                    return `
                <div class="ame-day-card" style="border-color:${dm.border};background:${dm.bg}">
                    <div class="ame-day-header">
                        <div class="ame-day-left">
                            <div class="ame-day-num">Hari ${day.day}</div>
                            <div class="ame-day-date">${na(day.day_name)}, ${na(day.date)}</div>
                        </div>
                        <div class="ame-day-phase">
                            <div class="ame-phase-name">${na(day.phase_name)}</div>
                            <div class="ame-phase-name-id" style="color:${dm.color}">"${na(day.phase_name_id)}"</div>
                        </div>
                        <div class="ame-day-dir" style="color:${dm.color}">
                            ${dm.icon} ${na(day.direction).charAt(0).toUpperCase()+na(day.direction).slice(1)}
                            <div class="ame-day-conf">${na(day.direction_confidence)}%</div>
                        </div>
                    </div>

                    <div class="ame-day-narrative">${na(day.narrative)}</div>

                    <div class="ame-day-targets">
                        <div class="ame-target-item ame-target--low">
                            <span class="ame-target-lbl">🐻 Low</span>
                            <span class="ame-target-val">${fmtPrice(day.price_target_low,curr)}</span>
                        </div>
                        <div class="ame-target-item ame-target--main">
                            <span class="ame-target-lbl">🎯 Target</span>
                            <span class="ame-target-val">${fmtPrice(day.price_target_main,curr)}</span>
                        </div>
                        <div class="ame-target-item ame-target--high">
                            <span class="ame-target-lbl">🐂 High</span>
                            <span class="ame-target-val">${fmtPrice(day.price_target_high,curr)}</span>
                        </div>
                    </div>

                    <div class="ame-day-clock">
                        <span class="ame-clock-icon">⏰</span>
                        <div>
                            <div class="ame-clock-time" style="color:${dm.color}">${na(day.critical_hours_wib)}</div>
                            <div class="ame-clock-reason">${na(day.critical_hours_reason)}</div>
                        </div>
                    </div>

                    <div class="ame-day-watch">
                        <span class="ame-watch-icon">👁️</span>
                        <span class="ame-watch-text">${na(day.watch_for)}</span>
                    </div>

                    <div class="ame-day-alt">
                        <span class="ame-alt-icon">🔄</span>
                        <div>
                            <span class="ame-alt-label">Skenario Alternatif:</span>
                            <span class="ame-alt-text">${na(day.alternative_scenario)}</span>
                        </div>
                    </div>
                </div>`;
                }).join('')}
            </div>

            <!-- ── Trading Framework ────────────────────────────────── -->
            <div class="ame-framework">
                <div class="ame-framework-title">🎯 Framework Trading Minggu Ini</div>
                <div class="ame-framework-grid">
                    <div class="ame-fw-item">
                        <span class="ame-fw-icon">📍</span>
                        <div>
                            <div class="ame-fw-label">Strategi Entry</div>
                            <div class="ame-fw-text">${na(tf.entry_strategy)}</div>
                        </div>
                    </div>
                    <div class="ame-fw-item">
                        <span class="ame-fw-icon">🛡️</span>
                        <div>
                            <div class="ame-fw-label">Risk Management</div>
                            <div class="ame-fw-text">${na(tf.risk_management)}</div>
                        </div>
                    </div>
                    <div class="ame-fw-item">
                        <span class="ame-fw-icon">⚡</span>
                        <div>
                            <div class="ame-fw-label">Katalis Minggu Ini</div>
                            <div class="ame-fw-text">${na(tf.key_catalyst_this_week)}</div>
                        </div>
                    </div>
                    <div class="ame-fw-item">
                        <span class="ame-fw-icon">⚠️</span>
                        <div>
                            <div class="ame-fw-label">Risiko Terbesar</div>
                            <div class="ame-fw-text">${na(tf.biggest_risk)}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="ame-disclaimer">
                ⚠️ <strong>Bukan rekomendasi investasi.</strong> Analisis ini dihasilkan AI untuk tujuan edukasi.
                Selalu lakukan riset mandiri dan kelola risiko sebelum mengambil keputusan trading.
            </div>
        </div>`;
    }

    // ── Public: analyze ───────────────────────────────────────────────────────
    async function analyze(apiKey, asset, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!apiKey || !apiKey.trim()) {
            container.innerHTML = `<div class="ame-error">⚠️ Masukkan Gemini API Key terlebih dahulu.</div>`;
            return;
        }

        container.innerHTML = `
        <div class="ame-loading">
            <span class="g-spinner"></span>
            <span>AI sedang menyusun skenario 5 hari ke depan untuk <strong>${asset.symbol}</strong>…</span>
        </div>`;

        try {
            const payload = _buildPayload(asset);
            const result  = await _callGemini(apiKey.trim(), payload);
            sessionStorage.setItem('hf_gemini_key', apiKey.trim());
            _renderResult(result, containerId);
        } catch (e) {
            container.innerHTML = `<div class="ame-error">❌ Gagal: ${e.message}<br><small>Pastikan API key valid dan kuota tidak habis.</small></div>`;
        }
    }

    return { analyze };
})();

// ── Legacy shim — backward compat with app.js generateExitStrategy() ─────────
function generateAIExitStrategy(currentPrice, payload) {
    const containerId = 'exitStrategyContainer';
    const keyInput = document.getElementById('ameKeyInput');
    const savedKey = sessionStorage.getItem('hf_gemini_key') || '';
    const apiKey   = (keyInput && keyInput.value.trim()) || savedKey;

    const coin = (payload && payload.coin) || {};

    const asset = {
        symbol:    (coin.symbol  || 'CRYPTO').toUpperCase(),
        name:      coin.name     || coin.id   || 'Crypto Asset',
        price:     currentPrice  || coin.current_price || 0,
        change24h: coin.price_change_percentage_24h || null,
        change7d:  coin.price_change_percentage_7d  || null,
        volume24h: coin.total_volume   || null,
        marketCap: coin.market_cap     || null,
        rsi:       coin.rsi            || null,
        trend:     coin.trend          || null,
        fearGreed: null,
    };

    aiMarketExpert.analyze(apiKey, asset, containerId);
}

window.generateAIExitStrategy = generateAIExitStrategy;
console.log('✅ AI Market Expert v2 loaded');
