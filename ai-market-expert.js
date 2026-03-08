// ══════════════════════════════════════════════════════════════════════════════
//  AI Market Expert v3 — Daily Narrative Forecaster + Scenario Chart
//  Powered by Google Gemini · Crypto & Equity Markets
//  Features: 5-day narratives, annotated chart (zones/TP/SL/patterns),
//            3 scenario paths (Bull/Bear/Base) with % confidence
// ══════════════════════════════════════════════════════════════════════════════

const aiMarketExpert = (() => {
    'use strict';

    const GEMINI_MODEL = 'gemini-2.0-flash';
    const GEMINI_URL   = (k) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${k}`;

    let _scenarioChart = null; // Chart.js instance for scenario chart

    // ── System Prompt ─────────────────────────────────────────────────────────
    const SYSTEM_PROMPT = `You are a professional crypto market analyst with expertise in price action, market cycles, liquidity dynamics, and behavioral finance. You write daily scenario narratives like a seasoned hedge fund macro trader — sharp, narrative-driven, specific.

STRICT RULES:
- Output STRICT JSON only. No markdown. No text outside JSON.
- All narrative fields MUST be in Indonesian (bahasa Indonesia).
- Be specific with price targets, time windows, and conditions.
- Each day gets a creative "phase name" (Nama Fase) that captures the market psychology — like "The Great Deception", "Accumulation in Chaos", "The Final Flush", "Silent Bull", "Whale Awakening", etc.
- Probabilities are integers 0-100. Bull + Bear + Base probabilities MUST sum to 100.
- Price targets are numbers (not strings).
- analysis_date is today's date. Days start from tomorrow.
- chart_annotations must contain realistic price levels based on actual current_price.

ANALYTICAL APPROACH:
1. Read current price, 24h change, RSI, volume trend, market structure
2. Identify the DOMINANT narrative: Are whales accumulating? Is retail FOMO-ing? Is there a liquidity grab incoming? Is there a macro catalyst?
3. For each day, project the most probable price behavior
4. Generate 3 price path scenarios (Bull/Bear/Base) with day-by-day projected prices
5. Identify key chart levels: support zones, resistance zones, TP targets, SL, patterns

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

  "chart_annotations": {
    "support_zones": [
      { "price_low": <number>, "price_high": <number>, "label": "Support Zone $XX", "strength": "strong|medium|weak" }
    ],
    "resistance_zones": [
      { "price_low": <number>, "price_high": <number>, "label": "Resistance Zone $XX", "strength": "strong|medium|weak" }
    ],
    "tp_levels": [
      { "price": <number>, "label": "TP1", "note": "<kondisi untuk capai ini>" },
      { "price": <number>, "label": "TP2", "note": "<kondisi untuk capai ini>" },
      { "price": <number>, "label": "TP3", "note": "<kondisi untuk capai ini>" }
    ],
    "sl_level": { "price": <number>, "label": "Stop Loss", "note": "<kenapa level ini sebagai SL>" },
    "pattern": {
      "name": "<nama pola teknikal dalam bahasa Inggris, misal 'Bull Flag', 'Head & Shoulders', 'Double Bottom', 'Ascending Triangle', 'Bear Wedge'>",
      "name_id": "<terjemahan bahasa Indonesia>",
      "description": "<1 kalimat penjelasan pola dan implikasinya — bahasa Indonesia>",
      "completion_price": <number atau null>,
      "target_price": <number atau null>
    },
    "direction_arrow": {
      "direction": "up|down|sideways",
      "confidence": <0-100>,
      "label": "<label singkat, misal 'Bull 68%'>"
    }
  },

  "price_scenarios": {
    "days": ["<date D+1>", "<date D+2>", "<date D+3>", "<date D+4>", "<date D+5>"],
    "bull_case": {
      "probability": <integer 0-100>,
      "label": "Bull Case",
      "color": "#4ade80",
      "prices": [<d1_price>, <d2_price>, <d3_price>, <d4_price>, <d5_price>],
      "final_target": <number>,
      "catalyst": "<1 kalimat katalis yang memicu skenario ini — bahasa Indonesia>",
      "invalidation": "<kondisi yang membatalkan skenario ini>"
    },
    "base_case": {
      "probability": <integer 0-100>,
      "label": "Base Case",
      "color": "#fbbf24",
      "prices": [<d1_price>, <d2_price>, <d3_price>, <d4_price>, <d5_price>],
      "final_target": <number>,
      "catalyst": "<1 kalimat katalis — bahasa Indonesia>",
      "invalidation": "<kondisi invalidasi>"
    },
    "bear_case": {
      "probability": <integer 0-100>,
      "label": "Bear Case",
      "color": "#f87171",
      "prices": [<d1_price>, <d2_price>, <d3_price>, <d4_price>, <d5_price>],
      "final_target": <number>,
      "catalyst": "<1 kalimat katalis — bahasa Indonesia>",
      "invalidation": "<kondisi invalidasi>"
    }
  },

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
      "phase_name": "<nama fase kreatif dalam bahasa Inggris>",
      "phase_name_id": "<terjemahan nama fase dalam bahasa Indonesia>",
      "direction": "bullish|sideways|bearish|volatile",
      "direction_confidence": <0-100>,
      "narrative": "<2-3 kalimat analisis mengapa hari ini akan berperilaku seperti ini — bahasa Indonesia>",
      "price_target_main": <number>,
      "price_target_high": <number>,
      "price_target_low": <number>,
      "critical_hours_wib": "<jam spesifik dalam WIB>",
      "critical_hours_reason": "<kenapa jam itu krusial>",
      "watch_for": "<1 kalimat: apa yang harus diperhatikan trader hari ini>",
      "alternative_scenario": "<jika skenario utama gagal, apa yang terjadi>"
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

    // ── Render Scenario Chart ─────────────────────────────────────────────────
    function _destroyScenarioChart() {
        if (_scenarioChart) { _scenarioChart.destroy(); _scenarioChart = null; }
    }

    function _renderScenarioChart(r, canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || typeof Chart === 'undefined') return;
        _destroyScenarioChart();

        const ps    = r.price_scenarios || {};
        const ann   = r.chart_annotations || {};
        const days  = ps.days || [];
        const bull  = ps.bull_case || {};
        const base  = ps.base_case || {};
        const bear  = ps.bear_case || {};
        const curr  = r.current_price || 0;

        // Labels: Today + 5 days
        const today = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        const labels = [today, ...days.map(d => {
            const dt = new Date(d);
            return dt.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
        })];

        // Each path starts from current price
        const bullPrices = [curr, ...(bull.prices || [])];
        const basePrices = [curr, ...(base.prices || [])];
        const bearPrices = [curr, ...(bear.prices || [])];

        // Build Chart.js annotations
        const annotations = {};
        let annIdx = 0;

        // Support zones
        (ann.support_zones || []).forEach((z, i) => {
            annotations[`supZone${i}`] = {
                type: 'box',
                yMin: z.price_low, yMax: z.price_high,
                backgroundColor: 'rgba(34,197,94,0.08)',
                borderColor: 'rgba(34,197,94,0.4)',
                borderWidth: 1,
                label: {
                    display: true,
                    content: z.label || `Support`,
                    color: '#4ade80',
                    font: { size: 10, weight: 'bold' },
                    position: { x: 'start', y: 'center' },
                    padding: 2,
                }
            };
        });

        // Resistance zones
        (ann.resistance_zones || []).forEach((z, i) => {
            annotations[`resZone${i}`] = {
                type: 'box',
                yMin: z.price_low, yMax: z.price_high,
                backgroundColor: 'rgba(239,68,68,0.08)',
                borderColor: 'rgba(239,68,68,0.4)',
                borderWidth: 1,
                label: {
                    display: true,
                    content: z.label || `Resistance`,
                    color: '#f87171',
                    font: { size: 10, weight: 'bold' },
                    position: { x: 'start', y: 'center' },
                    padding: 2,
                }
            };
        });

        // TP levels
        const TP_COLORS = ['#4ade80', '#86efac', '#bbf7d0'];
        (ann.tp_levels || []).forEach((tp, i) => {
            if (!tp.price) return;
            annotations[`tp${i}`] = {
                type: 'line',
                yMin: tp.price, yMax: tp.price,
                borderColor: TP_COLORS[i] || '#4ade80',
                borderWidth: 1.5,
                borderDash: [6, 3],
                label: {
                    display: true,
                    content: `${tp.label || 'TP'}: $${Number(tp.price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
                    color: TP_COLORS[i] || '#4ade80',
                    font: { size: 10, weight: 'bold' },
                    position: 'end',
                    backgroundColor: 'rgba(11,18,32,0.8)',
                    padding: { x: 4, y: 2 },
                }
            };
        });

        // SL level
        if (ann.sl_level?.price) {
            annotations['sl'] = {
                type: 'line',
                yMin: ann.sl_level.price, yMax: ann.sl_level.price,
                borderColor: '#ef4444',
                borderWidth: 1.5,
                borderDash: [4, 4],
                label: {
                    display: true,
                    content: `SL: $${Number(ann.sl_level.price).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
                    color: '#f87171',
                    font: { size: 10, weight: 'bold' },
                    position: 'end',
                    backgroundColor: 'rgba(11,18,32,0.8)',
                    padding: { x: 4, y: 2 },
                }
            };
        }

        // Current price line
        annotations['currentPrice'] = {
            type: 'line',
            yMin: curr, yMax: curr,
            borderColor: 'rgba(148,163,184,0.5)',
            borderWidth: 1,
            borderDash: [2, 4],
            label: {
                display: true,
                content: `Now: $${Number(curr).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
                color: '#94a3b8',
                font: { size: 9 },
                position: 'start',
                backgroundColor: 'rgba(11,18,32,0.8)',
                padding: { x: 4, y: 2 },
            }
        };

        _scenarioChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: `🐂 Bull Case (${bull.probability || 0}%)`,
                        data: bullPrices,
                        borderColor: '#4ade80',
                        backgroundColor: 'rgba(74,222,128,0.05)',
                        borderWidth: 2.5,
                        pointRadius: [6, 4, 4, 4, 4, 4],
                        pointBackgroundColor: '#4ade80',
                        pointBorderColor: '#0b1220',
                        pointBorderWidth: 2,
                        tension: 0.35,
                        fill: false,
                    },
                    {
                        label: `⚖️ Base Case (${base.probability || 0}%)`,
                        data: basePrices,
                        borderColor: '#fbbf24',
                        backgroundColor: 'rgba(251,191,36,0.05)',
                        borderWidth: 2.5,
                        pointRadius: [6, 4, 4, 4, 4, 4],
                        pointBackgroundColor: '#fbbf24',
                        pointBorderColor: '#0b1220',
                        pointBorderWidth: 2,
                        tension: 0.35,
                        fill: false,
                    },
                    {
                        label: `🐻 Bear Case (${bear.probability || 0}%)`,
                        data: bearPrices,
                        borderColor: '#f87171',
                        backgroundColor: 'rgba(248,113,113,0.05)',
                        borderWidth: 2.5,
                        pointRadius: [6, 4, 4, 4, 4, 4],
                        pointBackgroundColor: '#f87171',
                        pointBorderColor: '#0b1220',
                        pointBorderWidth: 2,
                        tension: 0.35,
                        fill: false,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: { size: 11 },
                            boxWidth: 20,
                            padding: 12,
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15,23,42,0.95)',
                        borderColor: 'rgba(148,163,184,0.2)',
                        borderWidth: 1,
                        titleColor: '#e2e8f0',
                        bodyColor: '#94a3b8',
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed.y;
                                const fmt = v >= 1000
                                    ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
                                    : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
                                const chg = curr > 0 ? ((v - curr) / curr * 100).toFixed(2) : 0;
                                const sign = chg >= 0 ? '+' : '';
                                return ` ${ctx.dataset.label?.split(' (')[0]}: ${fmt} (${sign}${chg}%)`;
                            }
                        }
                    },
                    annotation: { annotations }
                },
                scales: {
                    x: {
                        ticks: { color: '#64748b', font: { size: 10 } },
                        grid: { color: 'rgba(148,163,184,0.06)' },
                    },
                    y: {
                        ticks: {
                            color: '#64748b',
                            font: { size: 10 },
                            callback: (v) => {
                                if (v >= 1000) return '$' + (v/1000).toFixed(0) + 'K';
                                return '$' + v.toFixed(2);
                            }
                        },
                        grid: { color: 'rgba(148,163,184,0.06)' },
                    }
                }
            }
        });
    }

    // ── Render result ─────────────────────────────────────────────────────────
    function _renderResult(r, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const na = (v) => v != null ? v : '—';
        const fmtPrice = (v) => {
            if (!v) return '—';
            if (v >= 1000) return '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
            return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
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

        const biasM     = BIAS_META[r.weekly_bias] || BIAS_META.sideways;
        const scenarios = r.daily_scenarios || [];
        const kl        = r.key_levels || {};
        const tf        = r.trading_framework || {};
        const ps        = r.price_scenarios || {};
        const ann       = r.chart_annotations || {};
        const bull      = ps.bull_case || {};
        const base      = ps.base_case || {};
        const bear      = ps.bear_case || {};
        const pattern   = ann.pattern || {};
        const arrow     = ann.direction_arrow || {};

        // Direction arrow meta
        const arrowMeta = arrow.direction === 'up'
            ? { icon: '↗', color: '#4ade80', label: arrow.label || 'Bullish' }
            : arrow.direction === 'down'
                ? { icon: '↘', color: '#f87171', label: arrow.label || 'Bearish' }
                : { icon: '→', color: '#fbbf24', label: arrow.label || 'Sideways' };

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
                    <div class="ame-price">${fmtPrice(r.current_price)}</div>
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

            <!-- ══════════════════════════════════════════════════════
                 SCENARIO CHART SECTION
                 ══════════════════════════════════════════════════ -->
            <div class="ame-chart-section">
                <div class="ame-chart-header">
                    <div class="ame-chart-title">
                        📈 ${na(r.asset)} — Proyeksi Harga 5 Hari
                        ${pattern.name ? `<span class="ame-pattern-badge">🔷 ${pattern.name}</span>` : ''}
                    </div>
                    <div class="ame-chart-arrow" style="color:${arrowMeta.color};background:${arrowMeta.color}18;border:1px solid ${arrowMeta.color}40">
                        <span class="ame-arrow-icon">${arrowMeta.icon}</span>
                        <span class="ame-arrow-label">${arrowMeta.label}</span>
                        <span class="ame-arrow-conf">${arrow.confidence || 0}%</span>
                    </div>
                </div>

                <!-- Chart Canvas -->
                <div class="ame-chart-wrap">
                    <canvas id="ameScenarioChart" height="320"></canvas>
                </div>

                <!-- Chart Legend / Annotations info -->
                <div class="ame-chart-legend">
                    ${(ann.support_zones || []).map(z =>
                        `<div class="ame-legend-item" style="border-left:3px solid #4ade80">
                            <span class="ame-legend-dot" style="background:#4ade8033"></span>
                            <span>${z.label || 'Support'}</span>
                        </div>`
                    ).join('')}
                    ${(ann.resistance_zones || []).map(z =>
                        `<div class="ame-legend-item" style="border-left:3px solid #f87171">
                            <span class="ame-legend-dot" style="background:#f8717133"></span>
                            <span>${z.label || 'Resistance'}</span>
                        </div>`
                    ).join('')}
                    ${(ann.tp_levels || []).map((tp, i) =>
                        `<div class="ame-legend-item" style="border-left:3px solid #4ade80">
                            <span>🎯 ${tp.label}: ${fmtPrice(tp.price)}</span>
                        </div>`
                    ).join('')}
                    ${ann.sl_level?.price ? `
                    <div class="ame-legend-item" style="border-left:3px solid #ef4444">
                        <span>🛑 Stop Loss: ${fmtPrice(ann.sl_level.price)}</span>
                    </div>` : ''}
                </div>

                <!-- Pattern Box -->
                ${pattern.name ? `
                <div class="ame-pattern-box">
                    <div class="ame-pattern-header">
                        <span class="ame-pattern-icon">🔷</span>
                        <span class="ame-pattern-name">${pattern.name}</span>
                        <span class="ame-pattern-name-id">"${pattern.name_id}"</span>
                        ${pattern.target_price ? `<span class="ame-pattern-target">→ Target: ${fmtPrice(pattern.target_price)}</span>` : ''}
                    </div>
                    <div class="ame-pattern-desc">${pattern.description || ''}</div>
                </div>` : ''}
            </div>

            <!-- ══════════════════════════════════════════════════════
                 3-SCENARIO CARDS (Bull / Base / Bear)
                 ══════════════════════════════════════════════════ -->
            <div class="ame-scenarios-3-grid">

                <!-- Scenario A — Bull Case -->
                <div class="ame-scenario-card ame-scenario-bull">
                    <div class="ame-sc-header">
                        <div class="ame-sc-label">📗 Skenario A — Bull Case</div>
                        <div class="ame-sc-prob" style="background:#4ade8022;color:#4ade80;border:1px solid #4ade8040">
                            ${bull.probability || 0}%
                        </div>
                    </div>
                    <div class="ame-sc-target">🎯 Target: <strong>${fmtPrice(bull.final_target)}</strong></div>
                    <div class="ame-sc-catalyst">
                        <span class="ame-sc-catalyst-icon">⚡</span>
                        <span>${bull.catalyst || '—'}</span>
                    </div>
                    <div class="ame-sc-invalidation">
                        <span class="ame-sc-inv-icon">❌</span>
                        <span class="ame-sc-inv-label">Invalidasi:</span>
                        ${bull.invalidation || '—'}
                    </div>
                    <div class="ame-sc-path">
                        ${(bull.prices || []).map((p, i) => `
                        <div class="ame-sc-path-day">
                            <span class="ame-sc-path-d">D+${i+1}</span>
                            <span class="ame-sc-path-p" style="color:#4ade80">${fmtPrice(p)}</span>
                        </div>`).join('')}
                    </div>
                </div>

                <!-- Scenario B — Base Case -->
                <div class="ame-scenario-card ame-scenario-base">
                    <div class="ame-sc-header">
                        <div class="ame-sc-label">📙 Skenario B — Base Case</div>
                        <div class="ame-sc-prob" style="background:#fbbf2422;color:#fbbf24;border:1px solid #fbbf2440">
                            ${base.probability || 0}%
                        </div>
                    </div>
                    <div class="ame-sc-target">🎯 Target: <strong>${fmtPrice(base.final_target)}</strong></div>
                    <div class="ame-sc-catalyst">
                        <span class="ame-sc-catalyst-icon">⚡</span>
                        <span>${base.catalyst || '—'}</span>
                    </div>
                    <div class="ame-sc-invalidation">
                        <span class="ame-sc-inv-icon">❌</span>
                        <span class="ame-sc-inv-label">Invalidasi:</span>
                        ${base.invalidation || '—'}
                    </div>
                    <div class="ame-sc-path">
                        ${(base.prices || []).map((p, i) => `
                        <div class="ame-sc-path-day">
                            <span class="ame-sc-path-d">D+${i+1}</span>
                            <span class="ame-sc-path-p" style="color:#fbbf24">${fmtPrice(p)}</span>
                        </div>`).join('')}
                    </div>
                </div>

                <!-- Scenario C — Bear Case -->
                <div class="ame-scenario-card ame-scenario-bear">
                    <div class="ame-sc-header">
                        <div class="ame-sc-label">📕 Skenario C — Bear Case</div>
                        <div class="ame-sc-prob" style="background:#f8717122;color:#f87171;border:1px solid #f8717140">
                            ${bear.probability || 0}%
                        </div>
                    </div>
                    <div class="ame-sc-target">🎯 Target: <strong>${fmtPrice(bear.final_target)}</strong></div>
                    <div class="ame-sc-catalyst">
                        <span class="ame-sc-catalyst-icon">⚡</span>
                        <span>${bear.catalyst || '—'}</span>
                    </div>
                    <div class="ame-sc-invalidation">
                        <span class="ame-sc-inv-icon">❌</span>
                        <span class="ame-sc-inv-label">Invalidasi:</span>
                        ${bear.invalidation || '—'}
                    </div>
                    <div class="ame-sc-path">
                        ${(bear.prices || []).map((p, i) => `
                        <div class="ame-sc-path-day">
                            <span class="ame-sc-path-d">D+${i+1}</span>
                            <span class="ame-sc-path-p" style="color:#f87171">${fmtPrice(p)}</span>
                        </div>`).join('')}
                    </div>
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
                        <span class="ame-level-vals">${(kl.strong_support||[]).map(fmtPrice).join(' · ')}</span>
                    </div>
                    <div class="ame-level-item ame-level--resistance">
                        <span class="ame-level-lbl">Resistance Kuat</span>
                        <span class="ame-level-vals">${(kl.strong_resistance||[]).map(fmtPrice).join(' · ')}</span>
                    </div>
                    <div class="ame-level-item ame-level--pivot">
                        <span class="ame-level-lbl">Pivot Kritis</span>
                        <span class="ame-level-vals">${fmtPrice(kl.critical_pivot)}</span>
                    </div>
                    <div class="ame-level-item ame-level--inv-bull">
                        <span class="ame-level-lbl">Invalidasi Bull</span>
                        <span class="ame-level-vals">${fmtPrice(kl.invalidation_bull)}</span>
                    </div>
                    <div class="ame-level-item ame-level--inv-bear">
                        <span class="ame-level-lbl">Invalidasi Bear</span>
                        <span class="ame-level-vals">${fmtPrice(kl.invalidation_bear)}</span>
                    </div>
                </div>
            </div>

            <!-- ── Daily Scenarios ─────────────────────────────────── -->
            <div class="ame-scenarios-title">📅 Skenario Harian (5 Hari ke Depan)</div>
            <div class="ame-scenarios-list">
                ${scenarios.map((day) => {
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
                            <span class="ame-target-val">${fmtPrice(day.price_target_low)}</span>
                        </div>
                        <div class="ame-target-item ame-target--main">
                            <span class="ame-target-lbl">🎯 Target</span>
                            <span class="ame-target-val">${fmtPrice(day.price_target_main)}</span>
                        </div>
                        <div class="ame-target-item ame-target--high">
                            <span class="ame-target-lbl">🐂 High</span>
                            <span class="ame-target-val">${fmtPrice(day.price_target_high)}</span>
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

        // Draw scenario chart after DOM is painted
        requestAnimationFrame(() => _renderScenarioChart(r, 'ameScenarioChart'));
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
