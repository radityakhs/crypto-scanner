import { dbGet, dbAll, getPool } from './connection.js';
import sql from 'mssql';

let _strategyCache = { id: null, config: null, at: 0 };

export async function setting(key, fallback = '') {
  const row = await dbGet('SELECT [value] FROM settings WHERE [key]=@p0', [key]);
  return row?.value ?? fallback;
}

export async function setSetting(key, value) {
  const pool = await getPool();
  const req = pool.request();
  req.input('k', sql.NVarChar, key);
  req.input('v', sql.NVarChar, String(value));
  await req.query(`
    MERGE settings WITH (HOLDLOCK) AS target
    USING (SELECT @k AS [key], @v AS [value]) AS source ON target.[key] = source.[key]
    WHEN MATCHED THEN UPDATE SET target.[value] = source.[value]
    WHEN NOT MATCHED THEN INSERT ([key],[value]) VALUES (source.[key], source.[value]);
  `);
}

export async function boolSetting(key, fallback = false) {
  const value = await setting(key, fallback ? 'true' : 'false');
  return value === 'true' || value === '1' || value === 'yes';
}

export async function numSetting(key, fallback = 0) {
  const value = Number(await setting(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

export async function activeStrategy() {
  if (_strategyCache.config && Date.now() - _strategyCache.at < 5000) {
    return _strategyCache.config;
  }
  const row = await dbGet('SELECT TOP 1 * FROM strategies WHERE enabled=1 ORDER BY id');
  if (!row) {
    const fallback = await strategyById('sniper');
    return fallback || _defaultStrategy();
  }
  const config = { id: row.id, name: row.name, ...JSON.parse(row.config_json) };
  _strategyCache = { id: row.id, config, at: Date.now() };
  return config;
}

export async function strategyById(id) {
  const row = await dbGet('SELECT * FROM strategies WHERE id=@p0', [id]);
  if (!row) return null;
  return { id: row.id, name: row.name, ...JSON.parse(row.config_json) };
}

export async function allStrategies() {
  const rows = await dbAll('SELECT * FROM strategies ORDER BY id');
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    enabled: Boolean(row.enabled),
    ...JSON.parse(row.config_json),
  }));
}

export async function setActiveStrategy(id) {
  const pool = await getPool();
  await pool.request().query('UPDATE strategies SET enabled=0');
  const req = pool.request();
  req.input('id', sql.NVarChar, id);
  await req.query('UPDATE strategies SET enabled=1 WHERE id=@id');
  _strategyCache = { id: null, config: null, at: 0 };
}

export async function updateStrategyConfig(id, config) {
  const pool = await getPool();
  const req = pool.request();
  req.input('cfg', sql.NVarChar, JSON.stringify(config));
  req.input('id', sql.NVarChar, id);
  await req.query('UPDATE strategies SET config_json=@cfg WHERE id=@id');
  if (_strategyCache.id === id) _strategyCache = { id: null, config: null, at: 0 };
}

export async function strategySetting(key, fallback) {
  const strat = await activeStrategy();
  if (strat[key] !== undefined && strat[key] !== null) return strat[key];
  return numSetting(key, fallback);
}

function _defaultStrategy() {
  return {
    id: 'sniper', name: 'Sniper',
    entry_mode: 'immediate', min_source_count: 2, require_fee_claim: true,
    token_age_max_ms: 3600000, min_mcap_usd: 7000, max_mcap_usd: 200000,
    min_fee_claim_sol: 0.5, min_gmgn_total_fee_sol: 10, min_holders: 0,
    max_top20_holder_percent: 100, min_saved_wallet_holders: 0, max_ath_distance_pct: 0,
    min_graduated_volume_usd: 0, trending_min_volume_usd: 0, trending_min_swaps: 0,
    trending_max_rug_ratio: 0.3, trending_max_bundler_rate: 0.5,
    position_size_sol: 0.1, max_open_positions: 3,
    tp_percent: 50, sl_percent: -25, trailing_enabled: true, trailing_percent: 20,
    partial_tp: false, partial_tp_at_percent: 0, partial_tp_sell_percent: 0,
    max_hold_ms: 0, use_llm: true, llm_min_confidence: 50,
  };
}
