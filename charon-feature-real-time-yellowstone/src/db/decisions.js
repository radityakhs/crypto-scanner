import { dbGet, dbAll, dbRun } from './connection.js';
import { now, safeJson, json } from '../utils.js';

export async function storeDecision(candidateId, candidate, decision) {
  return dbRun(
    `INSERT INTO llm_decisions (candidate_id,mint,created_at_ms,verdict,confidence,reason,risks_json,raw_json)
     OUTPUT INSERTED.id
     VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7)`,
    [candidateId, candidate.token.mint, now(), decision.verdict, decision.confidence, decision.reason || null, json(decision.risks || []), json(decision)],
  );
}

export async function storeBatchDecision(triggerCandidateId, rows, batchDecision) {
  const selectedRow = batchDecision.selected_row;
  return dbRun(
    `INSERT INTO llm_batches (created_at_ms,trigger_candidate_id,selected_candidate_id,selected_mint,verdict,confidence,reason,risks_json,raw_json,candidate_ids_json)
     OUTPUT INSERTED.id
     VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9)`,
    [now(), triggerCandidateId, selectedRow?.id || null, selectedRow?.candidate?.token?.mint || null, batchDecision.verdict, batchDecision.confidence, batchDecision.reason || null, json(batchDecision.risks || []), json(batchDecision), json(rows.map(r => r.id))],
  );
}

export async function batchById(batchId) {
  const batch = await dbGet('SELECT * FROM llm_batches WHERE id=@p0', [batchId]);
  if (!batch) return null;
  const candidateIds = safeJson(batch.candidate_ids_json, []);
  const candidateRows = await Promise.all(candidateIds.map(async id => {
    const row = await dbGet('SELECT * FROM candidates WHERE id=@p0', [id]);
    return row ? { ...row, candidate: safeJson(row.candidate_json, {}) } : null;
  }));
  return { ...batch, rows: candidateRows.filter(Boolean) };
}

export async function logDecisionEvent({
  batchId = null, triggerCandidateId = null, selectedRow = null,
  rows = [], decision = {}, mode = 'dry_run', action,
  guardrails = {}, execution = {},
}) {
  const selectedCandidate = selectedRow?.candidate || null;
  const strategyId = selectedCandidate?.filters?.strategy
    || rows.find(r => r?.candidate?.filters?.strategy)?.candidate?.filters?.strategy
    || null;
  await dbRun(
    `INSERT INTO decision_logs (at_ms,batch_id,trigger_candidate_id,selected_candidate_id,selected_mint,mode,action,verdict,confidence,reason,guardrails_json,token_json,candidate_json,batch_json,execution_json,strategy_id)
     VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,@p11,@p12,@p13,@p14,@p15)`,
    [
      now(), batchId, triggerCandidateId, selectedRow?.id || null,
      selectedCandidate?.token?.mint || decision.selected_mint || null,
      mode, action, decision.verdict || null, decision.confidence ?? null, decision.reason || null,
      json(guardrails), json(selectedCandidate?.token || null), json(selectedCandidate || null),
      json(rows.map(row => {
        if (!row) return null;
        const c = row.candidate;
        return { candidateId: row.id, mint: c.token?.mint, route: c.signals?.route, signals: c.signals, token: c.token, metrics: c.metrics, feeClaim: c.feeClaim, trending: c.trending, holders: { count: c.holders?.count, top20Percent: c.holders?.top20Percent, maxHolderPercent: c.holders?.maxHolderPercent, top20: c.holders?.top20 }, chart: c.chart, savedWalletExposure: c.savedWalletExposure, twitterNarrative: c.twitterNarrative, filters: c.filters, createdAtMs: c.createdAtMs };
      })),
      json(execution), strategyId,
    ],
  );
}
