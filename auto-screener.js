// ══════════════════════════════════════════════════════════════════════════════
//  Auto Screener v1 — Filter top 500 coins by trading strategy
//  Strategies: Breakout | Oversold Bounce | Trend Following | Momentum | Volume Spike
//  Runs entirely client-side using window.cryptoData (top 500 coins from app.js)
// ══════════════════════════════════════════════════════════════════════════════

const autoScreener = (() => {
    'use strict';

    let _currentStrategy = 'breakout';
    let _results = [];
    let _inited = false;

    // ── Strategy Definitions ─────────────────────────────────────────────────
    const STRATEGIES = {
        breakout: {
            name: 'Breakout',
            icon: '🚀',
            color: '#22c55e',
            desc: 'Coin dengan kenaikan harga signifikan + volume tinggi. Potensi kelanjutan tren naik kuat.',
            score(c) {
                const ch24 = c.price_change_percentage_24h ?? 0;
                const ch7d = c.price_change_percentage_7d_in_currency ?? 0;
                const volMcap = c.market_cap > 0 ? (c.total_volume / c.market_cap) : 0;
                if (ch24 < 3) return null;
                const s = (ch24 * 2.5) + (ch7d > 0 ? ch7d * 0.8 : 0) + (volMcap * 60);
                return {
                    score: s,
                    signals: [
                        ch24 > 15 ? '🔥 Monster breakout' : ch24 > 8 ? '🚀 Strong breakout' : '📈 Breakout',
                        volMcap > 0.5  ? '🐋 Vol/MC >50%' : volMcap > 0.2 ? '📊 Volume spike' : '📊 Normal vol',
                        ch7d > 15 ? '✅ 7d strong bull' : ch7d > 0 ? '➡️ 7d positive' : '⚠️ 7d still red',
                    ],
                };
            },
        },

        oversold: {
            name: 'Oversold Bounce',
            icon: '📉',
            color: '#f59e0b',
            desc: 'Coin yang turun tajam dan berpotensi rebound. Area entry menarik untuk contrarian trader.',
            score(c) {
                const ch24 = c.price_change_percentage_24h ?? 0;
                const ch7d = c.price_change_percentage_7d_in_currency ?? 0;
                if (ch24 > -3) return null;
                const drop = Math.abs(ch24);
                const weeklyDrop = ch7d < 0 ? Math.abs(ch7d) : 0;
                const s = drop * 2.5 + weeklyDrop * 0.8;
                return {
                    score: s,
                    signals: [
                        drop > 20 ? `🔴 Extreme drop -${drop.toFixed(1)}%` : `🔴 Drop -${drop.toFixed(1)}%`,
                        weeklyDrop > 25 ? '⚡ Weekly -25%+ oversold' : weeklyDrop > 10 ? '⚡ Weekly weak' : '📅 7d mild',
                        '💡 Potential bounce zone',
                    ],
                };
            },
        },

        trend: {
            name: 'Trend Following',
            icon: '📈',
            color: '#3b82f6',
            desc: 'Coin dengan tren naik konsisten di semua timeframe. Ikuti momentum yang sudah terbentuk.',
            score(c) {
                const ch24 = c.price_change_percentage_24h ?? 0;
                const ch7d = c.price_change_percentage_7d_in_currency ?? 0;
                if (ch24 < 1 || ch7d < 5) return null;
                const s = ch24 * 2 + ch7d * 1.5;
                return {
                    score: s,
                    signals: [
                        `📅 7d: +${ch7d.toFixed(1)}%`,
                        `📅 24h: +${ch24.toFixed(1)}%`,
                        '✅ Multi-TF bullish',
                    ],
                };
            },
        },

        momentum: {
            name: 'Momentum',
            icon: '💥',
            color: '#a855f7',
            desc: 'Top gainer 24 jam dengan volume besar. High risk high reward — cocok untuk scalp/swing jangka pendek.',
            score(c) {
                const ch24 = c.price_change_percentage_24h ?? 0;
                const vol  = c.total_volume ?? 0;
                if (ch24 < 5) return null;
                const volScore = Math.log10(Math.max(vol, 1)) / 10;
                const s = ch24 * 3.5 + volScore * 25;
                return {
                    score: s,
                    signals: [
                        `🔥 +${ch24.toFixed(1)}% 24h`,
                        vol > 500_000_000 ? '💰 Vol >$500M' : vol > 100_000_000 ? '💰 Vol >$100M' : vol > 10_000_000 ? '💰 Vol >$10M' : '💰 Vol <$10M',
                        c.market_cap_rank <= 50 ? '🏆 Top 50 MC' : c.market_cap_rank <= 200 ? '📌 Top 200' : '🔍 Mid/Small cap',
                    ],
                };
            },
        },

        volume_spike: {
            name: 'Volume Spike',
            icon: '🐋',
            color: '#06b6d4',
            desc: 'Coin dengan volume tidak normal vs market cap — sinyal akumulasi besar atau aktivitas whale.',
            score(c) {
                const vol = c.total_volume ?? 0;
                const mc  = c.market_cap > 0 ? c.market_cap : 1;
                const ratio = vol / mc;
                if (ratio < 0.25) return null;
                const ch24 = c.price_change_percentage_24h ?? 0;
                const s = ratio * 120 + Math.abs(ch24) * 0.5;
                return {
                    score: s,
                    signals: [
                        `🐋 Vol/MC: ${(ratio * 100).toFixed(1)}%`,
                        ratio > 1.5 ? '⚠️ Extreme whale activity' : ratio > 0.75 ? '🐋 High whale signal' : '📊 Above-avg volume',
                        ch24 > 0 ? `🟢 Price +${ch24.toFixed(1)}%` : ch24 < 0 ? `🔴 Price ${ch24.toFixed(1)}% (accumulation?)` : '⚪ Price flat',
                    ],
                };
            },
        },
    };

    // ── Screener logic ────────────────────────────────────────────────────────
    function _runScreen(strategy) {
        const data = window.cryptoData;
        if (!data || !data.length) return [];
        const strat = STRATEGIES[strategy];
        if (!strat) return [];

        const results = [];
        for (const coin of data) {
            const r = strat.score(coin);
            if (r !== null) results.push({ coin, score: r.score, signals: r.signals });
        }
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 30);
    }

    // ── Format helpers ────────────────────────────────────────────────────────
    function _fmtP(p) {
        if (!p && p !== 0) return '$—';
        if (p >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
        if (p >= 1)    return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 3 });
        if (p >= 0.01) return '$' + p.toFixed(5);
        return '$' + p.toFixed(8);
    }
    function _fmtV(v) {
        if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
        if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
        if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
        return '$' + (v ?? 0).toFixed(0);
    }

    // ── Render full UI ────────────────────────────────────────────────────────
    function render() {
        const container = document.getElementById('autoScreenerContainer');
        if (!container) return;

        const data = window.cryptoData;
        const ready = data && data.length > 0;

        container.innerHTML = `
<div class="screener-wrap">

  <!-- Header -->
  <div class="screener-header">
    <div>
      <h2 class="screener-title">🎯 Auto-Screener</h2>
      <p class="screener-subtitle">
        Scan otomatis <strong style="color:#f1f5f9">${ready ? data.length : '…'}</strong> coin top market cap berdasarkan strategi trading
      </p>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span id="screenerTs" style="font-size:11px;color:#475569"></span>
      <button onclick="autoScreener.refresh()" class="screener-refresh-btn">↻ Refresh</button>
    </div>
  </div>

  <!-- Strategy buttons -->
  <div class="screener-strategy-row" id="screenerStrategyRow">
    ${Object.entries(STRATEGIES).map(([key, s]) => `
      <button class="strategy-btn ${key === _currentStrategy ? 'strategy-btn--active' : ''}"
              data-strategy="${key}"
              style="--sc:${s.color}"
              onclick="autoScreener.selectStrategy('${key}')">
        <span class="strat-icon">${s.icon}</span>
        <span class="strat-name">${s.name}</span>
      </button>
    `).join('')}
  </div>

  <!-- Strategy desc -->
  <div class="screener-desc" id="screenerDesc">${STRATEGIES[_currentStrategy].desc}</div>

  <!-- Results table -->
  <div id="screenerResults">
    ${!ready
        ? `<div class="screener-loading"><span class="g-spinner"></span><span>Menunggu data crypto dimuat…</span></div>`
        : _renderTable(_runScreen(_currentStrategy))
    }
  </div>

</div>`;
    }

    function _renderTable(results) {
        if (!results.length) {
            return `<div class="pt-empty" style="margin-top:32px">
              <div class="pt-empty-icon">🔍</div>
              <div class="pt-empty-title">Tidak ada coin yang memenuhi kriteria saat ini</div>
              <div class="pt-empty-sub">Coba strategi lain atau tunggu kondisi pasar berubah.</div>
            </div>`;
        }

        const colorCh = (v) => v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#94a3b8';

        const rows = results.map((r, i) => {
            const c    = r.coin;
            const ch24 = c.price_change_percentage_24h ?? 0;
            const ch7d = c.price_change_percentage_7d_in_currency ?? 0;
            const volMcRatio = c.market_cap > 0
                ? (c.total_volume / c.market_cap * 100).toFixed(1) + '%'
                : '—';
            const safeId   = c.id?.replace(/'/g, '');
            const safeSym  = c.symbol?.toUpperCase();
            const safeName = (c.name || '').replace(/'/g, '');

            return `
<tr class="screener-row" onclick="autoScreener.analyze('${safeId}','${safeSym}','${safeName}')">
  <td class="screener-rank-cell"><span class="screener-rank">${i + 1}</span></td>
  <td class="screener-coin-cell">
    <div style="display:flex;align-items:center;gap:8px">
      <img src="${c.image || ''}" alt="${safeSym}" width="26" height="26" style="border-radius:50%;object-fit:cover" onerror="this.style.display='none'">
      <div>
        <div style="font-weight:700;color:#f1f5f9;font-size:13px">${safeSym}</div>
        <div style="font-size:11px;color:#64748b;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name}</div>
      </div>
    </div>
  </td>
  <td style="color:#64748b;font-size:12px">#${c.market_cap_rank || '?'}</td>
  <td style="color:#e2e8f0;font-weight:600;font-size:13px">${_fmtP(c.current_price)}</td>
  <td style="color:${colorCh(ch24)};font-weight:700">${ch24 > 0 ? '+' : ''}${ch24.toFixed(2)}%</td>
  <td style="color:${colorCh(ch7d)}">${ch7d > 0 ? '+' : ''}${ch7d.toFixed(2)}%</td>
  <td style="color:#94a3b8;font-size:12px">${_fmtV(c.total_volume)}</td>
  <td style="color:${parseFloat(volMcRatio) > 50 ? '#f59e0b' : '#64748b'};font-size:12px">${volMcRatio}</td>
  <td>
    <div style="display:flex;flex-wrap:wrap;gap:3px">
      ${r.signals.map(sig => `<span class="screener-signal">${sig}</span>`).join('')}
    </div>
  </td>
  <td onclick="event.stopPropagation()">
    <div style="display:flex;gap:4px">
      <button onclick="autoScreener.analyze('${safeId}','${safeSym}','${safeName}')" class="screener-act-btn" title="Analisa teknikal">📊</button>
      <a href="https://www.coingecko.com/en/coins/${safeId}" target="_blank" class="screener-act-btn" title="CoinGecko">🦎</a>
      <a href="https://www.tradingview.com/chart/?symbol=${safeSym}USDT" target="_blank" class="screener-act-btn" title="TradingView">📈</a>
    </div>
  </td>
</tr>`;
        }).join('');

        return `
<div style="overflow-x:auto;border-radius:12px;border:1px solid #1e293b">
  <table class="screener-table">
    <thead>
      <tr>
        <th>#</th><th>Coin</th><th>Rank MC</th><th>Harga</th><th>24h</th><th>7d</th>
        <th>Volume 24h</th><th>Vol/MC</th><th>Sinyal Strategi</th><th>Aksi</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</div>
<div style="margin-top:10px;font-size:11px;color:#475569;text-align:center">
  Menampilkan ${results.length} coin terbaik dari ${window.cryptoData?.length || 0} coin •
  <span style="color:#${STRATEGIES[_currentStrategy].color.replace('#','')}">Strategi: ${STRATEGIES[_currentStrategy].icon} ${STRATEGIES[_currentStrategy].name}</span>
  • Klik baris untuk analisa
</div>`;
    }

    // ── Public API ────────────────────────────────────────────────────────────
    function selectStrategy(key) {
        _currentStrategy = key;

        // Update button states
        document.querySelectorAll('.strategy-btn').forEach(btn => {
            btn.classList.toggle('strategy-btn--active', btn.dataset.strategy === key);
        });

        // Update description
        const descEl = document.getElementById('screenerDesc');
        if (descEl) descEl.textContent = STRATEGIES[key]?.desc || '';

        // Re-render results
        _results = _runScreen(key);
        const resEl = document.getElementById('screenerResults');
        if (resEl) resEl.innerHTML = _renderTable(_results);

        _updateTs();
    }

    function refresh() {
        const resEl = document.getElementById('screenerResults');
        if (resEl) resEl.innerHTML = `<div class="screener-loading"><span class="g-spinner"></span><span>Memperbarui…</span></div>`;
        setTimeout(() => {
            _results = _runScreen(_currentStrategy);
            if (resEl) resEl.innerHTML = _renderTable(_results);
            _updateTs();
        }, 200);
    }

    function analyze(coinId, symbol, name) {
        const coin = window.cryptoData?.find(c => c.id === coinId);
        if (coin) {
            if (typeof window.analyzeCoin === 'function') window.analyzeCoin(coinId);
        } else if (typeof window._analyzeUnlistedCoin === 'function') {
            window._analyzeUnlistedCoin(coinId, symbol, name);
        }
    }

    function _updateTs() {
        const el = document.getElementById('screenerTs');
        if (el) el.textContent = 'Update: ' + new Date().toLocaleTimeString('id-ID');
    }

    function init() {
        if (_inited) return;
        _inited = true;
        render();
        // If cryptoData not yet loaded, poll until ready
        if (!window.cryptoData?.length) {
            const t = setInterval(() => {
                if (window.cryptoData?.length > 0) {
                    clearInterval(t);
                    render();
                    _updateTs();
                }
            }, 1500);
        } else {
            _updateTs();
        }
    }

    return { init, render, refresh, selectStrategy, analyze };
})();
