import { dbAll } from '../db/connection.js';
import { now, safeJson } from '../utils.js';

export function positionSnapshotCandidate(position) {
  return safeJson(position.snapshot_json, {})?.candidate || {};
}

export async function summarizeLearningWindow(windowMs) {
  const cutoff = now() - windowMs;
  const positions = await dbAll(
    `SELECT * FROM dry_run_positions WHERE opened_at_ms >= @p0 AND COALESCE(execution_mode,'dry_run')='dry_run' ORDER BY opened_at_ms ASC`,
    [cutoff],
  );
  const closed = positions.filter(p => p.status === 'closed');
  const winners = closed.filter(p => Number(p.pnl_percent || 0) > 0);
  const losers = closed.filter(p => Number(p.pnl_percent || 0) < 0);
  const totalPnlPercent = closed.reduce((s, p) => s + Number(p.pnl_percent || 0), 0);
  const totalPnlSol = closed.reduce((s, p) => s + Number(p.pnl_sol || 0), 0);
  const byRoute = new Map();
  for (const p of closed) {
    const candidate = positionSnapshotCandidate(p);
    const route = candidate.signals?.route || candidate.signals?.label || 'unknown';
    const row = byRoute.get(route) || { route, count: 0, wins: 0, losses: 0, pnlPercent: 0, pnlSol: 0 };
    row.count += 1;
    row.wins += Number(p.pnl_percent || 0) > 0 ? 1 : 0;
    row.losses += Number(p.pnl_percent || 0) < 0 ? 1 : 0;
    row.pnlPercent += Number(p.pnl_percent || 0);
    row.pnlSol += Number(p.pnl_sol || 0);
    byRoute.set(route, row);
  }
  const batches = await dbAll(
    `SELECT verdict, COUNT(*) AS count, AVG(confidence) AS avg_confidence FROM llm_batches WHERE created_at_ms >= @p0 GROUP BY verdict`,
    [cutoff],
  );
  const actions = await dbAll(
    `SELECT action, COUNT(*) AS count FROM decision_logs WHERE at_ms >= @p0 GROUP BY action ORDER BY count DESC`,
    [cutoff],
  );
  const mkRow = p => ({ mint: p.mint, symbol: p.symbol, pnlPercent: Number(p.pnl_percent || 0), exitReason: p.exit_reason, entryMcap: p.entry_mcap, exitMcap: p.exit_mcap, route: positionSnapshotCandidate(p).signals?.route || 'unknown' });
  const best = [...closed].sort((a, b) => Number(b.pnl_percent || 0) - Number(a.pnl_percent || 0)).slice(0, 5).map(mkRow);
  const worst = [...closed].sort((a, b) => Number(a.pnl_percent || 0) - Number(b.pnl_percent || 0)).slice(0, 5).map(mkRow);
  return {
    windowMs, fromMs: cutoff, toMs: now(),
    positions: {
      opened: positions.length, closed: closed.length, open: positions.length - closed.length,
      wins: winners.length, losses: losers.length,
      winRate: closed.length ? winners.length / closed.length * 100 : null,
      totalPnlPercent, avgPnlPercent: closed.length ? totalPnlPercent / closed.length : null, totalPnlSol,
      byRoute: [...byRoute.values()].map(row => ({ ...row, winRate: row.count ? row.wins / row.count * 100 : null, avgPnlPercent: row.count ? row.pnlPercent / row.count : null })).sort((a, b) => b.pnlPercent - a.pnlPercent),
      best, worst,
    },
    llm: { batches, actions },
  };
}
