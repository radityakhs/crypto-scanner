// ══════════════════════════════════════════════════════════════════════════════
//  dex-hunter-ui.js — Frontend UI untuk DEX Hunter tab
//  Terhubung ke dex-trader-proxy.js (port 3004)
//  dan DEXScreener API langsung untuk live scan kandidat
// ══════════════════════════════════════════════════════════════════════════════
'use strict';

const dexHunterUI = (() => {
    const PROXY    = 'http://127.0.0.1:3004';
    const DSC_API  = 'https://api.dexscreener.com';
    let _pollTimer = null;
    let _scanning  = false;

    // ── Helpers ───────────────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);

    function fmtPnl(n) {
        if (n == null || isNaN(n)) return '<span class="dh-pnl-zero">—</span>';
        const cls = n > 0 ? 'dh-pnl-pos' : n < 0 ? 'dh-pnl-neg' : 'dh-pnl-zero';
        const str = (n >= 0 ? '+$' : '-$') + Math.abs(n).toFixed(2);
        return `<span class="${cls}">${str}</span>`;
    }

    function fmtPct(n) {
        if (n == null || isNaN(n)) return '—';
        const cls = n > 0 ? 'dh-pnl-pos' : n < 0 ? 'dh-pnl-neg' : 'dh-pnl-zero';
        return `<span class="${cls}">${n >= 0 ? '+' : ''}${n.toFixed(1)}%</span>`;
    }

    function fmtTime(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit', month: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    }

    function fmtDur(openedAt, closedAt) {
        const ms  = new Date(closedAt || Date.now()).getTime() - new Date(openedAt).getTime();
        const min = Math.floor(ms / 60000);
        if (min < 60)   return `${min}m`;
        if (min < 1440) return `${Math.floor(min / 60)}h ${min % 60}m`;
        return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
    }

    function fmtPrice(p) {
        if (!p || p === 0) return '—';
        if (p < 0.000001) return '$' + p.toExponential(3);
        if (p < 0.001)    return '$' + p.toFixed(8);
        if (p < 1)        return '$' + p.toFixed(6);
        return '$' + p.toFixed(4);
    }

    function kFmt(n) {
        if (!n) return '0';
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return Math.round(n).toString();
    }

    function scoreClass(s) {
        if (s >= 80) return 'dh-score-hi';
        if (s >= 60) return 'dh-score-mid';
        return 'dh-score-lo';
    }

    function setBadge(text, cls) {
        const el = $('dh-status-badge');
        if (!el) return;
        el.textContent = text;
        el.className   = 'dh-badge ' + cls;
    }

    // ── Fetch state dari proxy port 3004 ──────────────────────────────────────
    async function fetchState() {
        try {
            const r = await fetch(`${PROXY}/state`, { signal: AbortSignal.timeout(4000) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            renderState(d);
            setBadge('🟢 ONLINE', 'dh-badge dh-badge-dry');

            // Mode badge
            const mb = $('dh-mode-badge');
            if (mb) {
                mb.style.display = 'inline-block';
                mb.textContent   = d.dryRun ? '📄 DRY RUN' : '🔴 LIVE';
                mb.className     = 'dh-badge ' + (d.dryRun ? 'dh-badge-dry' : 'dh-badge-live');
            }
        } catch (e) {
            setBadge('🔌 OFFLINE — jalankan: node dex-trader-proxy.js', 'dh-badge dh-badge-off');
            const mb = $('dh-mode-badge');
            if (mb) mb.style.display = 'none';
        }

        // Juga fetch trade history
        try {
            const r = await fetch(`${PROXY}/trades?limit=30`, { signal: AbortSignal.timeout(4000) });
            if (r.ok) {
                const d = await r.json();
                renderTrades(d.trades || []);
            }
        } catch {}
    }

    // ── Render KPI + positions ────────────────────────────────────────────────
    function renderState(d) {
        const stats = d.stats || {};
        const wr    = stats.totalTrades > 0
            ? (stats.wins / stats.totalTrades * 100).toFixed(1) + '%'
            : '—';

        // KPI
        setKpi('dh-total-pnl',    fmtPnl(d.totalPnl));
        setKpi('dh-daily-pnl',    fmtPnl(d.dailyPnl));
        setKpi('dh-open-count',   (d.openCount || 0) + ' / 5');
        setKpi('dh-total-trades', stats.totalTrades || 0);
        setKpi('dh-winrate',      wr);
        setKpi('dh-best',         fmtPnl(stats.bestTrade));

        if ($('dh-wl'))
            $('dh-wl').textContent = `${stats.wins || 0}W / ${stats.losses || 0}L`;

        // Positions
        renderPositions(d.positions || {});
    }

    function setKpi(id, html) {
        const el = $(id);
        if (el) el.innerHTML = html;
    }

    function renderPositions(positions) {
        const tbody = $('dh-positions-body');
        if (!tbody) return;

        const list = Object.values(positions);
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#475569;padding:20px">Tidak ada posisi terbuka</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(p => {
            const pnlPct = p.currentPrice > 0 && p.entryPrice > 0
                ? ((p.currentPrice - p.entryPrice) / p.entryPrice * 100)
                : null;
            const sc = scoreClass(p.score || 0);
            const dur = fmtDur(p.openedAt, null);
            const tp  = [p.tp1Price, p.tp2Price, p.tp3Price].map(t => t ? fmtPrice(t) : '—').join(' / ');

            return `<tr>
                <td><b style="color:#e2e8f0">${p.coinSymbol}</b><br><span style="font-size:10px;color:#64748b">${(p.baseName || '').slice(0, 20)}</span></td>
                <td><span style="font-size:10px;color:#475569">${p.chain || 'SOL'} / ${p.dex || '—'}</span></td>
                <td>${fmtPrice(p.entryPrice)}</td>
                <td>${fmtPrice(p.currentPrice)}</td>
                <td>${fmtPct(pnlPct)}</td>
                <td>$${(p.sizeUsd || 0).toFixed(2)}</td>
                <td style="color:#f87171;font-size:11px">${fmtPrice(p.stopLoss)}</td>
                <td style="font-size:11px;color:#4ade80">${tp}</td>
                <td><span class="dh-badge-score ${sc}">${p.score || '—'}</span></td>
                <td style="font-size:11px;color:#64748b">${dur}</td>
                <td>
                    <button class="dh-btn dh-btn-danger" style="padding:4px 10px;font-size:11px"
                        onclick="dexHunterUI.manualSell('${p.pairAddress}')">Sell</button>
                    <a href="${p.url || '#'}" target="_blank" class="dh-link" style="margin-left:4px">DSC↗</a>
                </td>
            </tr>`;
        }).join('');
    }

    function renderTrades(trades) {
        const tbody = $('dh-trades-body');
        if (!tbody) return;

        if (!trades.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#475569;padding:20px">Belum ada riwayat trade</td></tr>';
            return;
        }

        tbody.innerHTML = trades.map(t => {
            const icon = t.pnlUsd > 0 ? '✅' : t.pnlUsd < 0 ? '🔴' : '⬜';
            const sc   = scoreClass(t.score || 0);
            return `<tr>
                <td>${icon} <b style="color:#e2e8f0">${t.coinSymbol || '?'}</b>
                    <a href="${t.url || '#'}" target="_blank" class="dh-link" style="margin-left:4px">↗</a></td>
                <td style="font-size:11px">${fmtTime(t.openedAt)}</td>
                <td style="font-size:11px">${fmtTime(t.closedAt)}</td>
                <td>${fmtPrice(t.entryPrice)}</td>
                <td>${fmtPrice(t.exitPrice)}</td>
                <td>${fmtPnl(t.pnlUsd)}</td>
                <td style="font-size:11px;color:#94a3b8">${t.reason || '—'}</td>
                <td style="font-size:11px;color:#64748b">${fmtDur(t.openedAt, t.closedAt)}</td>
                <td><span class="dh-badge-score ${sc}">${t.score || '—'}</span></td>
            </tr>`;
        }).join('');
    }

    // ── Live Scan dari DEXScreener (langsung dari browser) ────────────────────
    async function scanNow() {
        if (_scanning) return;
        _scanning = true;

        const grid  = $('dh-candidates-grid');
        const count = $('dh-scan-count');
        const last  = $('dh-last-scan');

        if (grid)  grid.innerHTML = '<div style="color:#64748b;font-size:13px;padding:10px 0">🔍 Scanning DEXScreener...</div>';
        if (count) count.textContent = '';

        try {
            // Fetch beberapa query pump.fun/solana
            const queries = ['pumpfun', 'pump sol', 'solana meme'];
            const allPairs = [];
            const seen     = new Set();

            for (const q of queries) {
                try {
                    const r = await fetch(`${DSC_API}/latest/dex/search?q=${encodeURIComponent(q)}`, {
                        signal: AbortSignal.timeout(8000),
                    });
                    if (!r.ok) continue;
                    const d = await r.json();
                    for (const p of (d.pairs || [])) {
                        if (!seen.has(p.pairAddress) && p.chainId === 'solana') {
                            seen.add(p.pairAddress);
                            allPairs.push(p);
                        }
                    }
                } catch {}
            }

            // Parse + filter + score
            const candidates = [];
            for (const raw of allPairs) {
                const p = parsePair(raw);
                if (!p) continue;

                // Basic filter
                if (p.ageHours > 24)     continue;
                if (p.vol24h < 10000)    continue;
                if (p.vol1h < 500)       continue;
                if (p.txns24h < 200)     continue;
                if (p.chg24h < 150)      continue;
                if (p.priceUsd <= 0)     continue;

                // Rug check
                if (p.chg5m < -25 && p.chg24h > 300)               continue;
                if (p.sells5m > p.buys5m * 4 && p.txns5m > 20)     continue;
                if (p.vol1h < 100 && p.vol24h > 50000)              continue;

                // Score
                const { score, reasons } = scoreToken(p);
                if (score < 60) continue;

                candidates.push({ ...p, score, reasons });
            }

            candidates.sort((a, b) => b.score - a.score);

            if (count) count.textContent = `— ${candidates.length} kandidat dari ${allPairs.length} token`;
            if (last)  last.textContent  = 'Last scan: ' + new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' });

            if (!grid) return;

            if (!candidates.length) {
                grid.innerHTML = '<div style="color:#475569;font-size:13px;padding:10px 0">Tidak ada kandidat yang memenuhi kriteria saat ini. Coba lagi dalam 30 detik.</div>';
                return;
            }

            grid.innerHTML = candidates.slice(0, 12).map(p => {
                const chgClass = p.chg24h >= 0 ? '' : 'dh-cc-chg-neg';
                const has1h    = p.chg1h !== 0;
                const has5m    = p.chg5m !== 0;
                return `
                <div class="dh-candidate-card">
                    <div class="dh-cc-top">
                        <div>
                            <div class="dh-cc-sym">${p.baseSymbol}
                                <span class="dh-badge-score ${scoreClass(p.score)}" style="font-size:10px;margin-left:6px">${p.score}/100</span>
                            </div>
                            <div class="dh-cc-name">${(p.baseName || '').slice(0, 30)}</div>
                        </div>
                        <div class="dh-cc-chg ${chgClass}">+${p.chg24h.toFixed(0)}%</div>
                    </div>
                    <div class="dh-cc-reasons">📡 ${p.reasons.join(' · ')}</div>
                    <div class="dh-cc-stats">
                        <span class="dh-cc-stat">⏰ <b>${p.ageHours.toFixed(1)}h</b></span>
                        <span class="dh-cc-stat">📊 vol: <b>$${kFmt(p.vol24h)}</b></span>
                        <span class="dh-cc-stat">🔄 txns: <b>${p.txns24h}</b></span>
                        <span class="dh-cc-stat">💹 FDV: <b>$${kFmt(p.fdv)}</b></span>
                        ${has1h ? `<span class="dh-cc-stat">1h: <b style="color:${p.chg1h >= 0 ? '#4ade80' : '#f87171'}">${p.chg1h >= 0 ? '+' : ''}${p.chg1h.toFixed(0)}%</b></span>` : ''}
                        ${has5m ? `<span class="dh-cc-stat">5m: <b style="color:${p.chg5m >= 0 ? '#4ade80' : '#f87171'}">${p.chg5m >= 0 ? '+' : ''}${p.chg5m.toFixed(1)}%</b></span>` : ''}
                        <span class="dh-cc-stat">💰 <b>${fmtPrice(p.priceUsd)}</b></span>
                    </div>
                    <div class="dh-cc-actions">
                        <button class="dh-cc-buy" onclick="dexHunterUI.dryBuy('${p.baseMint}','${p.baseSymbol}','${p.pairAddress}',${p.priceUsd},${p.score})">
                            🟢 DRY BUY $20
                        </button>
                        <a href="${p.url}" target="_blank" class="dh-link" style="align-self:center;margin-left:8px">DEXScreener ↗</a>
                        <a href="https://www.pump.fun/${p.baseMint}" target="_blank" class="dh-link" style="align-self:center;margin-left:6px">pump.fun ↗</a>
                    </div>
                </div>`;
            }).join('');

        } catch (e) {
            if (grid) grid.innerHTML = `<div style="color:#f87171;font-size:13px;padding:10px 0">❌ Error: ${e.message}</div>`;
        } finally {
            _scanning = false;
        }
    }

    // ── Scoring (mirror dari memecoin-hunter.js, untuk frontend) ─────────────
    function parsePair(raw) {
        if (!raw || !raw.baseToken) return null;
        const ageH   = raw.pairCreatedAt ? (Date.now() - raw.pairCreatedAt) / 3600000 : 9999;
        const buys24 = raw.txns?.h24?.buys  || 0;
        const sells24= raw.txns?.h24?.sells || 0;
        return {
            pairAddress : raw.pairAddress,
            chain       : raw.chainId,
            dex         : raw.dexId,
            baseSymbol  : raw.baseToken.symbol,
            baseName    : raw.baseToken.name,
            baseMint    : raw.baseToken.address,
            url         : raw.url,
            priceUsd    : parseFloat(raw.priceUsd || 0),
            ageHours    : ageH,
            vol1h       : raw.volume?.h1   || 0,
            vol24h      : raw.volume?.h24  || 0,
            chg5m       : raw.priceChange?.m5  || 0,
            chg1h       : raw.priceChange?.h1  || 0,
            chg24h      : raw.priceChange?.h24 || 0,
            txns5m      : (raw.txns?.m5?.buys  || 0) + (raw.txns?.m5?.sells  || 0),
            txns24h     : buys24 + sells24,
            buys5m      : raw.txns?.m5?.buys  || 0,
            sells5m     : raw.txns?.m5?.sells || 0,
            buys1h      : raw.txns?.h1?.buys  || 0,
            sells1h     : raw.txns?.h1?.sells || 0,
            fdv         : raw.fdv || 0,
            boosts      : raw.boosts?.active || 0,
        };
    }

    function scoreToken(t) {
        let score = 0;
        const reasons = [];

        // Momentum (30pt)
        if (t.chg24h >= 1000)      { score += 30; reasons.push(`+${Math.round(t.chg24h)}%🔥`); }
        else if (t.chg24h >= 500)  { score += 25; reasons.push(`+${Math.round(t.chg24h)}%`); }
        else if (t.chg24h >= 200)  { score += 20; reasons.push(`+${Math.round(t.chg24h)}%`); }
        else if (t.chg24h >= 150)  { score += 12; reasons.push(`+${Math.round(t.chg24h)}%`); }

        if (t.chg1h > 10) { score += 5; reasons.push(`1h:+${Math.round(t.chg1h)}%`); }
        if (t.chg5m > 2)  { score += 5; reasons.push(`5m:+${t.chg5m.toFixed(1)}%`); }

        // Volume (25pt)
        if (t.vol1h >= 10000)       { score += 10; reasons.push(`vol:$${kFmt(t.vol1h)}`); }
        else if (t.vol1h >= 2000)   { score += 6;  reasons.push(`vol:$${kFmt(t.vol1h)}`); }

        if (t.txns24h >= 2000)      { score += 8; reasons.push(`txns:${t.txns24h}`); }
        else if (t.txns24h >= 500)  { score += 4; reasons.push(`txns:${t.txns24h}`); }

        if (t.buys1h > t.sells1h * 1.5) { score += 7; reasons.push('buy>sell'); }

        // Makers estimate (20pt)
        const mk = Math.round(t.txns24h * 0.4);
        if (mk >= 500)      { score += 20; reasons.push(`~${mk}makers🔥`); }
        else if (mk >= 200) { score += 15; reasons.push(`~${mk}makers`); }
        else if (mk >= 100) { score += 10; reasons.push(`~${mk}makers`); }
        else if (mk >= 50)  { score += 5;  reasons.push(`~${mk}makers`); }

        // Age sweet spot (15pt)
        if (t.ageHours >= 1 && t.ageHours <= 6)   { score += 15; reasons.push(`age:${t.ageHours.toFixed(1)}h🎯`); }
        else if (t.ageHours <= 12)                 { score += 10; reasons.push(`age:${t.ageHours.toFixed(1)}h`); }
        else if (t.ageHours <= 24)                 { score += 5; }

        // FDV (10pt)
        if (t.fdv > 0 && t.fdv < 100000)    { score += 10; reasons.push(`fdv:$${kFmt(t.fdv)}🎯`); }
        else if (t.fdv < 500000)             { score += 7;  reasons.push(`fdv:$${kFmt(t.fdv)}`); }
        else if (t.fdv < 1000000)            { score += 4; }

        // Boosts
        if (t.boosts >= 500)      { score += 5; reasons.push(`boost:${t.boosts}⚡`); }
        else if (t.boosts >= 100) { score += 3; reasons.push(`boost:${t.boosts}`); }

        return { score: Math.max(0, Math.min(100, score)), reasons };
    }

    // ── Actions ───────────────────────────────────────────────────────────────
    async function manualSell(pairAddress) {
        if (!confirm('Yakin ingin menutup posisi ini?')) return;
        try {
            const r = await fetch(`${PROXY}/sell`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ pairAddress, reason: 'Manual sell via UI' }),
            });
            const d = await r.json();
            if (d.success) {
                alert(`✅ Posisi ditutup! P&L: ${d.pnlUsd >= 0 ? '+' : ''}$${(d.pnlUsd || 0).toFixed(2)}`);
            } else {
                alert('❌ Gagal: ' + (d.error || 'unknown'));
            }
        } catch (e) {
            alert('❌ Error: ' + e.message + '\nPastikan dex-trader-proxy.js berjalan (port 3004)');
        }
        await fetchState();
    }

    async function closeAll() {
        if (!confirm('Tutup SEMUA posisi DEX Hunter sekarang?')) return;
        try {
            const r = await fetch(`${PROXY}/close-all`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ reason: 'Manual close-all via UI' }),
            });
            const d = await r.json();
            alert(`✅ ${d.closedCount || 0} posisi ditutup.`);
        } catch (e) {
            alert('❌ Error: ' + e.message);
        }
        await fetchState();
    }

    // Dry buy manual dari kandidat scan
    async function dryBuy(mint, symbol, pairAddress, price, score) {
        if (!confirm(`📄 DRY BUY ${symbol} @ ${fmtPrice(price)}\nScore: ${score}/100\n\nLanjutkan?`)) return;
        try {
            const r = await fetch(`${PROXY}/buy`, {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ outputMint: mint, amountUsd: 20, symbol }),
            });
            const d = await r.json();
            if (d.success) {
                alert(`✅ ${d.dryRun ? '[DRY RUN]' : '[LIVE]'} BUY ${symbol} berhasil!\nPrice Impact: ${(d.priceImpact * 100 || 0).toFixed(2)}%`);
            } else {
                alert('❌ Gagal: ' + (d.error || 'unknown'));
            }
        } catch (e) {
            alert('❌ Error: ' + e.message + '\nPastikan dex-trader-proxy.js berjalan (port 3004)');
        }
    }

    async function scanNowWrapper() {
        await scanNow();
    }

    // ── Polling ───────────────────────────────────────────────────────────────
    function startPolling(ms = 8000) {
        if (_pollTimer) clearInterval(_pollTimer);
        _pollTimer = setInterval(fetchState, ms);
    }

    function stopPolling() {
        if (_pollTimer) clearInterval(_pollTimer);
    }

    // ── Public ────────────────────────────────────────────────────────────────
    return { fetchState, scanNow: scanNowWrapper, closeAll, manualSell, dryBuy, startPolling, stopPolling };
})();
