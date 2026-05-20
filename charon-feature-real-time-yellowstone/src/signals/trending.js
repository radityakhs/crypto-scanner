import axios from 'axios';
import { JUPITER_API_KEY, JSON_HEADERS, TRENDING_LOOKBACK_MS } from '../config.js';
import { now, json } from '../utils.js';
import { numSetting, boolSetting, setting } from '../db/settings.js';
import { dbRun } from '../db/connection.js';
import { gmgnBackoffActive, setGmgnBackoff, gmgnFetch, normalizedTrendingRows } from '../enrichment/gmgn.js';
import { normalizeJupiterTrendingRow } from '../enrichment/jupiter.js';

export const trending = new Map();
let degenHandler = null;

export function setDegenHandler(fn) { degenHandler = fn; }

export async function storeSignalEvent(mint, kind, source, payload) {
  await dbRun(
    'INSERT INTO signal_events (mint,kind,at_ms,source,payload_json) VALUES (@p0,@p1,@p2,@p3,@p4)',
    [mint, kind, now(), source, json(payload)],
  );
}

export async function trendingSignalPass(row) {
  const volume = Number(row?.volume ?? 0);
  const swaps = Number(row?.swaps ?? 0);
  const rugRatio = Number(row?.rug_ratio ?? 0);
  const bundlerRate = Number(row?.bundler_rate ?? 0);
  const minVolume = await numSetting('trending_min_volume_usd', 0);
  const minSwaps = await numSetting('trending_min_swaps', 0);
  const maxRugRatio = await numSetting('trending_max_rug_ratio', 0.3);
  const maxBundlerRate = await numSetting('trending_max_bundler_rate', 0.5);
  if (minVolume > 0 && (!Number.isFinite(volume) || volume < minVolume)) return false;
  if (minSwaps > 0 && (!Number.isFinite(swaps) || swaps < minSwaps)) return false;
  if (maxRugRatio > 0 && Number.isFinite(rugRatio) && rugRatio > maxRugRatio) return false;
  if (maxBundlerRate > 0 && Number.isFinite(bundlerRate) && bundlerRate > maxBundlerRate) return false;
  if (row?.is_wash_trading === true || row?.is_wash_trading === 1) return false;
  return true;
}

export async function fetchJupiterTrendingRows(interval, limit) {
  if (!JUPITER_API_KEY) { console.log('[trending:jupiter] JUPITER_API_KEY missing'); return []; }
  const supported = new Set(['5m', '1h', '6h', '24h']);
  const window = supported.has(interval) ? interval : '5m';
  const url = new URL(`https://api.jup.ag/tokens/v2/toptrending/${window}`);
  url.searchParams.set('limit', String(limit));
  const res = await axios.get(url.toString(), { timeout: 10_000, headers: { ...JSON_HEADERS, 'x-api-key': JUPITER_API_KEY } });
  const rows = Array.isArray(res.data) ? res.data : [];
  return rows.map((row, index) => normalizeJupiterTrendingRow(row, window, index + 1));
}

export async function fetchGmgnTrendingRows(interval, limit) {
  if (gmgnBackoffActive('trending')) return [];
  const payload = await gmgnFetch('/v1/market/rank', {
    params: { chain: 'sol', interval, limit, order_by: await setting('trending_order_by', 'volume'), direction: 'desc', filters: ['renounced', 'frozen', 'not_wash_trading'], platforms: ['Pump.fun', 'meteora_virtual_curve', 'pool_pump_amm'] },
  });
  return normalizedTrendingRows(payload).map((row, index) => ({ ...row, interval, rank: index + 1, source: 'gmgn_market_rank' }));
}

export async function fetchGmgnTrending() {
  if (!await boolSetting('trending_enabled', true)) { trending.clear(); return; }
  const interval = await setting('trending_interval', '5m');
  const limit = Math.max(1, Math.min(200, Math.floor(await numSetting('trending_limit', 100))));
  const source = await setting('trending_source', 'jupiter');
  try {
    const rows = source === 'gmgn'
      ? await fetchGmgnTrendingRows(interval, Math.min(100, limit))
      : await fetchJupiterTrendingRows(interval, limit);
    const seenAt = now();
    const cutoff = seenAt - TRENDING_LOOKBACK_MS;
    for (const [mint, token] of trending) {
      if (Number(token.seenAt || 0) < cutoff) trending.delete(mint);
    }
    let tracked = 0;
    for (const [index, row] of rows.entries()) {
      const mint = row?.address || row?.mint;
      if (!mint || !String(mint).endsWith('pump') || !await trendingSignalPass(row)) continue;
      const token = { ...row, address: mint, interval, rank: index + 1, seenAt };
      trending.set(mint, token);
      tracked += 1;
      await storeSignalEvent(mint, 'trending', token.source || source, token);
      if (degenHandler) await degenHandler(mint, token);
    }
    console.log(`[trending:${source}] loaded ${rows.length}, accepted ${tracked}, tracking ${trending.size}`);
  } catch (err) {
    if (source === 'gmgn') setGmgnBackoff('trending', err);
    const status = err.response?.status || '';
    const body = err.response?.data;
    const resetAt = body?.reset_at ? ` reset_at=${body.reset_at}` : '';
    if (source !== 'gmgn' || (status !== 403 && status !== 429)) console.log(`[trending:${source}] ${status} ${body?.code || ''} ${body?.message || err.message}${resetAt}`);
  }
}
