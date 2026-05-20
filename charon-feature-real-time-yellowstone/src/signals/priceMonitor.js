import { dbGet, dbAll, dbRun, getPool } from '../db/connection.js';
import { now, json } from '../utils.js';
import { fetchJupiterAsset } from '../enrichment/jupiter.js';
import { firstPositiveNumber } from '../utils.js';
import sql from 'mssql';

let candidateHandler = null;

export function setCandidateHandler(fn) { candidateHandler = fn; }

export async function storePriceAlert({ mint, strategyId, alertType, targetPriceUsd, targetAthDistancePercent, signal, expiresMs }) {
  const existing = await dbGet(`SELECT TOP 1 id FROM price_alerts WHERE mint=@p0 AND status='pending'`, [mint]);
  if (existing) return existing.id;
  return dbRun(
    `INSERT INTO price_alerts (mint,strategy_id,alert_type,target_price_usd,target_ath_distance_percent,candidate_json,signals_json,status,created_at_ms,expires_at_ms)
     OUTPUT INSERTED.id VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,'pending',@p7,@p8)`,
    [mint, strategyId, alertType, targetPriceUsd || null, targetAthDistancePercent || null, json({}), json(signal), now(), now() + (expiresMs || 24 * 60 * 60 * 1000)],
  );
}

export async function getActiveAlerts() {
  return dbAll(`SELECT * FROM price_alerts WHERE status='pending' AND expires_at_ms > @p0`, [now()]);
}

export async function getAlertStats() {
  const [p, t, e] = await Promise.all([
    dbGet(`SELECT COUNT(*) AS c FROM price_alerts WHERE status='pending'`),
    dbGet(`SELECT COUNT(*) AS c FROM price_alerts WHERE status='triggered'`),
    dbGet(`SELECT COUNT(*) AS c FROM price_alerts WHERE status='expired'`),
  ]);
  return { pending: p?.c ?? 0, triggered: t?.c ?? 0, expired: e?.c ?? 0 };
}

export async function monitorPriceAlerts() {
  const alerts = await getActiveAlerts();
  if (!alerts.length) return;
  let triggered = 0, expired = 0;
  for (const alert of alerts) {
    if (now() > alert.expires_at_ms) {
      await dbRun(`UPDATE price_alerts SET status='expired' WHERE id=@p0`, [alert.id]);
      expired++;
      continue;
    }
    try {
      const asset = await fetchJupiterAsset(alert.mint);
      const currentPrice = firstPositiveNumber(asset?.usdPrice);
      const currentMcap = firstPositiveNumber(asset?.mcap, asset?.fdv);
      if (!currentPrice) continue;
      let shouldTrigger = false;
      if (alert.target_price_usd && currentPrice <= alert.target_price_usd) shouldTrigger = true;
      if (alert.target_mcap_usd && currentMcap && currentMcap <= alert.target_mcap_usd) shouldTrigger = true;
      if (shouldTrigger && candidateHandler) {
        const signal = JSON.parse(alert.signals_json || '{}');
        await candidateHandler({ mint: alert.mint, fee: signal.feeClaim ? { mint: alert.mint, distributed: BigInt(Math.floor(signal.feeClaim.distributedSol * 1e9)), shareholders: (signal.feeClaim.shareholders || []).map(h => ({ pubkey: h.address, bps: h.bps })) } : null, signature: signal.feeClaim?.signature || null, graduatedCoin: signal.graduated || null, trendingToken: signal.trending || null, route: `dip_${alert.strategy_id}` });
        await dbRun(`UPDATE price_alerts SET status='triggered', triggered_at_ms=@p0 WHERE id=@p1`, [now(), alert.id]);
        triggered++;
        console.log(`[dip] triggered ${alert.mint.slice(0, 8)}... at $${currentPrice.toFixed(8)} (target: $${alert.target_price_usd?.toFixed(8)})`);
      }
    } catch (err) {
      console.log(`[dip] alert ${alert.id} error: ${err.message}`);
    }
  }
  if (triggered || expired) console.log(`[dip] ${triggered} triggered, ${expired} expired, ${alerts.length - triggered - expired} remaining`);
}

export async function cleanupAlerts() {
  const cutoff = now() - 7 * 24 * 60 * 60 * 1000;
  const pool = await getPool();
  const req = pool.request();
  req.input('p0', sql.BigInt, cutoff);
  const result = await req.query(`DELETE FROM price_alerts WHERE status IN ('triggered','expired') AND created_at_ms < @p0`);
  if (result.rowsAffected?.[0] > 0) console.log(`[dip] cleaned ${result.rowsAffected[0]} old alerts`);
}
