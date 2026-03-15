// test-dex.js — full pipeline test (v2.0 compatible)
'use strict';
const dex = require('./dex-screener-api');
const { scoreToken, isRug, passesFilter, CFG } = require('./memecoin-hunter');

(async () => {
  console.log('=== MEMECOIN HUNTER v2.0 — Pipeline Test ===\n');
  console.log('Fetching top gainers dari DEXScreener (Solana 1h)...');
  const pairs = await dex.getTopGainers('solana', '1h');
  console.log('Total pairs ditemukan:', pairs.length, '\n');

  // Full pipeline v2.0
  let filtered = 0, rugCount = 0, candidates = [];
  for (const p of pairs) {
    const f = passesFilter(p);
    if (!f.ok) { continue; }
    filtered++;
    const rug = isRug(p);
    if (rug.rug) { rugCount++; continue; }
    const { score, signals } = scoreToken(p);
    if (score >= CFG.MIN_SCORE) candidates.push({ ...p, score, signals });
  }

  candidates.sort((a, b) => b.score - a.score);

  console.log(`Hasil pipeline: ${pairs.length} total | ${filtered} lolos filter | ${rugCount} rug removed | ${candidates.length} kandidat BUY\n`);
  console.log('='.repeat(72));
  console.log('TOP KANDIDAT EARLY ENTRY (score >= ' + CFG.MIN_SCORE + ')');
  console.log('='.repeat(72));

  candidates.slice(0, 10).forEach((p, i) => {
    const { meta } = scoreToken(p);
    console.log(`\n${i+1}. ${p.baseSymbol} (${p.baseName})`);
    console.log(`   Score    : ${p.score}/100`);
    console.log(`   Signals  : ${p.signals.join(' | ')}`);
    console.log(`   Velocity : ${(meta && meta.velocityRatio) ? meta.velocityRatio.toFixed(1) + 'x' : '--'} | Buy/Sell 1h: ${(meta && meta.buyRatio1h) ? meta.buyRatio1h.toFixed(1) + 'x' : '--'}`);
    console.log(`   chg5m    : ${p.chg5m >= 0 ? '+' : ''}${p.chg5m.toFixed(1)}% | chg1h: ${p.chg1h >= 0 ? '+' : ''}${p.chg1h.toFixed(1)}% | chg24h: ${p.chg24h >= 0 ? '+' : ''}${p.chg24h.toFixed(0)}%`);
    console.log(`   Vol1h    : $${Math.round(p.vol1h)} | Txns1h: ${p.txns1h} | Buys1h: ${p.buys1h}`);
    console.log(`   Age      : ${(p.ageHours * 60).toFixed(0)}min | FDV: $${Math.round(p.fdv)}`);
    console.log(`   URL      : ${p.url}`);
  });

  if (candidates.length === 0) {
    console.log('\n  Tidak ada kandidat saat ini — coba lagi dalam beberapa menit.');
    console.log('  Tip: early entry window sempit, scan ulang tiap 20 detik.');
  }

  console.log('\n');
  console.log('Fetching boosted tokens...');
  const boosted = await dex.getBoostedTokens();
  console.log('Boosted Solana:', boosted.filter(b => b.chain === 'solana').length, 'tokens');

  console.log('\n=== Done ===');
  console.log('Untuk simulasi real-time: node dex-simulate.js');
  console.log('Untuk auto-trade DRY RUN: node memecoin-hunter.js');
  process.exit(0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
