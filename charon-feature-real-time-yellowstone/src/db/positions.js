import { dbGet, dbAll, dbRun, dbTransaction } from './connection.js';
import { now, json } from '../utils.js';
import { numSetting, boolSetting, setting, activeStrategy } from './settings.js';

export async function openPositions() {
  return dbAll(`SELECT * FROM dry_run_positions WHERE status='open' ORDER BY opened_at_ms DESC`);
}

export async function openPositionCount() {
  const row = await dbGet(`SELECT COUNT(*) AS cnt FROM dry_run_positions WHERE status='open'`);
  return row?.cnt ?? 0;
}

export async function canOpenMorePositions() {
  const strat = await activeStrategy();
  const max = strat.max_open_positions ?? await numSetting('max_open_positions', 3);
  if (max <= 0) return true;
  return (await openPositionCount()) < max;
}

export async function tradingMode() {
  const mode = await setting('trading_mode', 'dry_run');
  return ['dry_run', 'confirm', 'live'].includes(mode) ? mode : 'dry_run';
}

export async function allPositions(limit = 10) {
  return dbAll(`SELECT TOP (@p0) * FROM dry_run_positions ORDER BY id DESC`, [limit]);
}

export async function createDryRunPosition(candidateId, candidate, decision, reason = 'llm_buy') {
  const strat = await activeStrategy();
  const sizeSol = strat.position_size_sol ?? await numSetting('dry_run_buy_sol', 0.1);
  const entryPrice = Number(candidate.metrics.priceUsd || 0) || null;
  const entryMcap = Number(candidate.metrics.marketCapUsd || candidate.metrics.graduatedMarketCapUsd || 0) || null;
  const tp = Number(decision.suggested_tp_percent || strat.tp_percent || await numSetting('default_tp_percent', 50));
  const sl = Number(decision.suggested_sl_percent || strat.sl_percent || await numSetting('default_sl_percent', -25));
  const trailingEnabled = (strat.trailing_enabled ?? await boolSetting('default_trailing_enabled', true)) ? 1 : 0;
  const trailingPercent = strat.trailing_percent ?? await numSetting('default_trailing_percent', 20);

  return dbTransaction(async (tx) => {
    const existing = await tx(
      `SELECT TOP 1 id FROM dry_run_positions WHERE mint=@p0 AND status='open'`,
      [candidate.token.mint],
    );
    if (existing.recordset[0]) return existing.recordset[0].id;

    const ins = await tx(
      `INSERT INTO dry_run_positions (candidate_id,mint,symbol,status,opened_at_ms,size_sol,entry_price,entry_mcap,token_amount_est,high_water_price,high_water_mcap,tp_percent,sl_percent,trailing_enabled,trailing_percent,trailing_armed,llm_decision_id,strategy_id,snapshot_json)
       OUTPUT INSERTED.id
       VALUES (@p0,@p1,@p2,'open',@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,@p11,@p12,@p13,0,@p14,@p15,@p16)`,
      [candidateId, candidate.token.mint, candidate.token.symbol, now(), sizeSol, entryPrice, entryMcap, null, entryPrice, entryMcap, tp, sl, trailingEnabled, trailingPercent, decision.id || null, strat.id, json({ candidate, decision, reason, strategy: strat.id })],
    );
    const positionId = ins.id;
    await tx(
      `INSERT INTO dry_run_trades (position_id,mint,side,at_ms,price,mcap,size_sol,token_amount_est,reason,payload_json) VALUES (@p0,@p1,'buy',@p2,@p3,@p4,@p5,@p6,@p7,@p8)`,
      [positionId, candidate.token.mint, now(), entryPrice, entryMcap, sizeSol, null, reason, json({ candidateId, decision })],
    );
    await tx(
      `INSERT INTO tp_sl_rules (position_id,tp_percent,sl_percent,trailing_enabled,trailing_percent,updated_at_ms) VALUES (@p0,@p1,@p2,@p3,@p4,@p5)`,
      [positionId, tp, sl, trailingEnabled, trailingPercent, now()],
    );
    return positionId;
  });
}

export async function createLivePosition(candidateId, candidate, decision, swap, reason = 'live_buy') {
  const strat = await activeStrategy();
  const sizeSol = strat.position_size_sol ?? await numSetting('dry_run_buy_sol', 0.1);
  const entryPrice = Number(candidate.metrics.priceUsd || 0) || null;
  const entryMcap = Number(candidate.metrics.marketCapUsd || candidate.metrics.graduatedMarketCapUsd || 0) || null;
  const tp = Number(decision.suggested_tp_percent || strat.tp_percent || await numSetting('default_tp_percent', 50));
  const sl = Number(decision.suggested_sl_percent || strat.sl_percent || await numSetting('default_sl_percent', -25));
  const trailingEnabled = (strat.trailing_enabled ?? await boolSetting('default_trailing_enabled', true)) ? 1 : 0;
  const trailingPercent = strat.trailing_percent ?? await numSetting('default_trailing_percent', 20);

  return dbTransaction(async (tx) => {
    const existing = await tx(
      `SELECT TOP 1 id FROM dry_run_positions WHERE mint=@p0 AND status='open'`,
      [candidate.token.mint],
    );
    if (existing.recordset[0]) return existing.recordset[0].id;

    const ins = await tx(
      `INSERT INTO dry_run_positions (candidate_id,mint,symbol,status,opened_at_ms,size_sol,entry_price,entry_mcap,token_amount_est,high_water_price,high_water_mcap,tp_percent,sl_percent,trailing_enabled,trailing_percent,trailing_armed,llm_decision_id,execution_mode,entry_signature,token_amount_raw,strategy_id,snapshot_json)
       OUTPUT INSERTED.id
       VALUES (@p0,@p1,@p2,'open',@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,@p11,@p12,@p13,0,@p14,'live',@p15,@p16,@p17,@p18)`,
      [candidateId, candidate.token.mint, candidate.token.symbol, now(), sizeSol, entryPrice, entryMcap, null, entryPrice, entryMcap, tp, sl, trailingEnabled, trailingPercent, decision.id || null, swap.signature, swap.outputAmount || null, strat.id, json({ candidate, decision, reason, swap, strategy: strat.id })],
    );
    const positionId = ins.id;
    await tx(
      `INSERT INTO dry_run_trades (position_id,mint,side,at_ms,price,mcap,size_sol,token_amount_est,reason,payload_json) VALUES (@p0,@p1,'buy',@p2,@p3,@p4,@p5,@p6,@p7,@p8)`,
      [positionId, candidate.token.mint, now(), entryPrice, entryMcap, sizeSol, null, reason, json({ candidateId, decision, swap })],
    );
    await tx(
      `INSERT INTO tp_sl_rules (position_id,tp_percent,sl_percent,trailing_enabled,trailing_percent,updated_at_ms) VALUES (@p0,@p1,@p2,@p3,@p4,@p5)`,
      [positionId, tp, sl, trailingEnabled, trailingPercent, now()],
    );
    return positionId;
  });
}
