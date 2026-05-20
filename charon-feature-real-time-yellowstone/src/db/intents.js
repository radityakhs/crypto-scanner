import { dbGet, dbRun } from './connection.js';
import { now, safeJson, json } from '../utils.js';
import { numSetting } from './settings.js';

export async function createTradeIntent(candidateId, candidate, decision, mode, status, side = 'buy') {
  const sizeSol = await numSetting('dry_run_buy_sol', 0.1);
  return dbRun(
    `INSERT INTO trade_intents (candidate_id,mint,mode,status,created_at_ms,updated_at_ms,side,size_sol,confidence,reason,llm_decision_id,payload_json)
     OUTPUT INSERTED.id
     VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,@p11)`,
    [candidateId, candidate.token.mint, mode, status, now(), now(), side, sizeSol, decision.confidence, decision.reason, decision.id || null, json({ candidate, decision, mode, status })],
  );
}

export async function intentById(id) {
  const row = await dbGet('SELECT * FROM trade_intents WHERE id=@p0', [id]);
  return row ? { ...row, payload: safeJson(row.payload_json, {}) } : null;
}
