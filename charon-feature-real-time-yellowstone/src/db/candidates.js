import { dbGet, dbAll, dbTransaction, getPool } from './connection.js';
import { now, safeJson, json } from '../utils.js';
import { numSetting } from './settings.js';
import sql from 'mssql';

export function candidateSignalKey(candidate, signature = null) {
  if (signature) return `${signature}:${candidate.token.mint}`;
  const route = candidate.signals?.route || 'signal';
  const bucket = Math.floor(Number(candidate.createdAtMs || now()) / (5 * 60 * 1000));
  return `${route}:${candidate.token.mint}:${bucket}`;
}

export async function upsertCandidate(candidate, signature) {
  const signalKey = candidateSignalKey(candidate, signature);
  return dbTransaction(async (tx) => {
    const existing = await tx(
      'SELECT id FROM candidates WHERE signal_key=@p0',
      [signalKey],
    );
    if (existing.recordset[0]) {
      await tx(
        `UPDATE candidates SET status=@p0, updated_at_ms=@p1, candidate_json=@p2, filter_result_json=@p3 WHERE id=@p4`,
        [candidate.filters.passed ? 'candidate' : 'filtered', now(), json(candidate), json(candidate.filters), existing.recordset[0].id],
      );
      return existing.recordset[0].id;
    }
    const res = await tx(
      `INSERT INTO candidates (mint,status,created_at_ms,updated_at_ms,signature,signal_key,candidate_json,filter_result_json)
       OUTPUT INSERTED.id
       VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7)`,
      [candidate.token.mint, candidate.filters.passed ? 'candidate' : 'filtered', now(), now(), signature, signalKey, json(candidate), json(candidate.filters)],
    );
    return res.id;
  });
}

export async function updateCandidateStatus(candidateId, status) {
  await dbGet('UPDATE candidates SET status=@p0, updated_at_ms=@p1 WHERE id=@p2', [status, now(), candidateId]);
}

export async function updateCandidateSnapshot(candidateId, candidate, status = null) {
  await dbGet(
    `UPDATE candidates SET status=COALESCE(@p0,status), updated_at_ms=@p1, candidate_json=@p2, filter_result_json=@p3 WHERE id=@p4`,
    [status, now(), json(candidate), json(candidate.filters || {}), candidateId],
  );
}

export async function candidateById(id) {
  const row = await dbGet('SELECT * FROM candidates WHERE id=@p0', [id]);
  return row ? { ...row, candidate: safeJson(row.candidate_json, {}) } : null;
}

export async function candidatesByIds(ids) {
  const rows = await Promise.all(ids.map(id => candidateById(Number(id))));
  return rows.filter(Boolean);
}

export async function latestCandidateByMint(mint) {
  const row = await dbGet('SELECT TOP 1 * FROM candidates WHERE mint=@p0 ORDER BY id DESC', [mint]);
  return row ? { ...row, candidate: safeJson(row.candidate_json, {}) } : null;
}

export async function recentEligibleCandidates(limit = 10) {
  const maxAgeMs = await numSetting('llm_candidate_max_age_ms', 10 * 60 * 1000);
  const cutoff = now() - Math.max(30_000, maxAgeMs);
  const rows = await dbAll(
    `SELECT TOP (@p1) * FROM candidates
     WHERE status IN ('candidate','watch','buy','pass')
       AND created_at_ms >= @p0
       AND id NOT IN (SELECT COALESCE(candidate_id,-1) FROM dry_run_positions WHERE status='open')
     ORDER BY id DESC`,
    [cutoff, limit],
  );
  return rows.map(row => ({ ...row, candidate: safeJson(row.candidate_json, {}) })).reverse();
}
