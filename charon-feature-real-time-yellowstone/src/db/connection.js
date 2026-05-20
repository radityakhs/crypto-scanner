import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const _sqlConfig = {
  server: process.env.MSSQL_SERVER || '127.0.0.1',
  port: Number(process.env.MSSQL_PORT || 1433),
  user: process.env.MSSQL_USER || 'SA',
  password: process.env.MSSQL_PASSWORD || 'Bni1234/',
  database: process.env.MSSQL_DATABASE || 'charon_db',
  options: {
    encrypt: process.env.MSSQL_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let _pool = null;

export async function getPool() {
  if (_pool && _pool.connected) return _pool;
  _pool = await sql.connect(_sqlConfig);
  return _pool;
}

/**
 * Helpers that mimic better-sqlite3 API but async.
 * Each function accepts (sqlText, paramsArray) where params are
 * positional placeholders written as @p0, @p1, ... in the SQL.
 */

export async function dbAll(sqlText, params = []) {
  const pool = await getPool();
  const req = pool.request();
  params.forEach((v, i) => req.input(`p${i}`, v ?? null));
  const result = await req.query(sqlText);
  return result.recordset || [];
}

export async function dbGet(sqlText, params = []) {
  const rows = await dbAll(sqlText, params);
  return rows[0] ?? null;
}

export async function dbRun(sqlText, params = []) {
  const pool = await getPool();
  const req = pool.request();
  params.forEach((v, i) => req.input(`p${i}`, v ?? null));
  const result = await req.query(sqlText);
  // For INSERT with OUTPUT INSERTED.id, return the id
  const row = result.recordset?.[0];
  return row ? Number(row.id ?? row.ID ?? 0) : 0;
}

export async function dbTransaction(fn) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    // Provide a scoped query helper that uses this transaction
    const txQuery = async (sqlText, params = []) => {
      const req = new sql.Request(transaction);
      params.forEach((v, i) => req.input(`p${i}`, v ?? null));
      const result = await req.query(sqlText);
      const row = result.recordset?.[0];
      return { recordset: result.recordset || [], id: row ? Number(row.id ?? row.ID ?? 0) : 0 };
    };
    const result = await fn(txQuery);
    await transaction.commit();
    return result;
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

export async function initDb() {
  const pool = await getPool();

  // Tables are pre-created in SQL Server.
  // This function seeds default settings and strategies if not present.

  // ── Ensure columns exist (SQL Server ALTER TABLE IF NOT EXISTS column) ──
  async function ensureColumn(table, column, ddl) {
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME='${table}' AND COLUMN_NAME='${column}'
      ) ALTER TABLE ${table} ADD ${column} ${ddl}
    `);
  }
  await ensureColumn('candidates', 'signal_key', 'NVARCHAR(500)');
  await ensureColumn('dry_run_positions', 'execution_mode', "NVARCHAR(50) DEFAULT 'dry_run'");
  await ensureColumn('dry_run_positions', 'entry_signature', 'NVARCHAR(255)');
  await ensureColumn('dry_run_positions', 'exit_signature', 'NVARCHAR(255)');
  await ensureColumn('dry_run_positions', 'token_amount_raw', 'NVARCHAR(MAX)');
  await ensureColumn('dry_run_positions', 'strategy_id', "NVARCHAR(100) DEFAULT 'sniper'");
  await ensureColumn('dry_run_positions', 'partial_tp_done', 'INT DEFAULT 0');
  await ensureColumn('decision_logs', 'strategy_id', 'NVARCHAR(100)');

  const defaults = {
    agent_enabled: 'true',
    trading_mode: process.env.TRADING_MODE || 'dry_run',
    llm_candidate_pick_count: process.env.LLM_CANDIDATE_PICK_COUNT || '10',
    llm_candidate_max_age_ms: process.env.LLM_CANDIDATE_MAX_AGE_MS || String(10 * 60 * 1000),
    llm_min_confidence: '75',
    max_open_positions: process.env.MAX_OPEN_POSITIONS || '3',
    dry_run_buy_sol: '0.1',
    default_tp_percent: '50',
    default_sl_percent: '-25',
    default_trailing_enabled: 'true',
    default_trailing_percent: '20',
    min_fee_claim_sol: process.env.MIN_FEE_CLAIM_SOL || '2',
    min_mcap_usd: '0',
    max_mcap_usd: '0',
    min_gmgn_total_fee_sol: '0',
    min_graduated_volume_usd: '0',
    max_top20_holder_percent: '100',
    min_saved_wallet_holders: '0',
    gmgn_request_delay_ms: process.env.GMGN_REQUEST_DELAY_MS || '2500',
    gmgn_max_retries: process.env.GMGN_MAX_RETRIES || '2',
    trending_enabled: process.env.TRENDING_ENABLED || 'true',
    trending_source: process.env.TRENDING_SOURCE || 'jupiter',
    trending_allow_degen: process.env.TRENDING_ALLOW_DEGEN || 'false',
    trending_interval: process.env.TRENDING_INTERVAL || '5m',
    trending_limit: process.env.TRENDING_LIMIT || '100',
    trending_order_by: process.env.TRENDING_ORDER_BY || 'volume',
    trending_min_volume_usd: process.env.TRENDING_MIN_VOLUME_USD || '0',
    trending_min_swaps: process.env.TRENDING_MIN_SWAPS || '0',
    trending_max_rug_ratio: process.env.TRENDING_MAX_RUG_RATIO || '0.3',
    trending_max_bundler_rate: process.env.TRENDING_MAX_BUNDLER_RATE || '0.5',
  };
  for (const [key, value] of Object.entries(defaults)) {
    const req = pool.request();
    req.input('k', sql.NVarChar, key);
    req.input('v', sql.NVarChar, String(value));
    await req.query(`IF NOT EXISTS (SELECT 1 FROM settings WHERE [key]=@k)
      INSERT INTO settings ([key],[value]) VALUES (@k,@v)`);
  }

  const ts = Date.now();
  const strategies = [
    ['sniper', 'Sniper', 1, {
      entry_mode:'immediate', min_source_count:2, require_fee_claim:true,
      token_age_max_ms:3600000, min_mcap_usd:7000, max_mcap_usd:200000,
      min_fee_claim_sol:0.5, min_gmgn_total_fee_sol:10, min_holders:0,
      max_top20_holder_percent:100, min_saved_wallet_holders:0, max_ath_distance_pct:0,
      min_graduated_volume_usd:0, trending_min_volume_usd:0, trending_min_swaps:0,
      trending_max_rug_ratio:0.3, trending_max_bundler_rate:0.5,
      position_size_sol:0.1, max_open_positions:3, tp_percent:50, sl_percent:-25,
      trailing_enabled:true, trailing_percent:20, partial_tp:false,
      partial_tp_at_percent:0, partial_tp_sell_percent:0, max_hold_ms:0,
      use_llm:true, llm_min_confidence:50,
    }],
    ['dip_buy', 'Dip Buy', 0, {
      entry_mode:'wait_for_dip', min_source_count:1, require_fee_claim:false,
      token_age_max_ms:86400000, min_mcap_usd:25000, max_mcap_usd:500000,
      min_fee_claim_sol:0, min_gmgn_total_fee_sol:0, min_holders:0,
      max_top20_holder_percent:100, min_saved_wallet_holders:0, max_ath_distance_pct:-40,
      min_graduated_volume_usd:0, trending_min_volume_usd:0, trending_min_swaps:0,
      trending_max_rug_ratio:0.3, trending_max_bundler_rate:0.5,
      position_size_sol:0.05, max_open_positions:3, tp_percent:30, sl_percent:-20,
      trailing_enabled:true, trailing_percent:15, partial_tp:false,
      partial_tp_at_percent:0, partial_tp_sell_percent:0, max_hold_ms:0,
      use_llm:true, llm_min_confidence:60,
    }],
    ['smart_money', 'Smart Money', 0, {
      entry_mode:'immediate', min_source_count:2, require_fee_claim:false,
      token_age_max_ms:86400000, min_mcap_usd:10000, max_mcap_usd:1000000,
      min_fee_claim_sol:0, min_gmgn_total_fee_sol:0, min_holders:1000,
      max_top20_holder_percent:50, min_saved_wallet_holders:0, max_ath_distance_pct:0,
      min_graduated_volume_usd:0, trending_min_volume_usd:5000, trending_min_swaps:100,
      trending_max_rug_ratio:0.2, trending_max_bundler_rate:0.3,
      position_size_sol:0.1, max_open_positions:3, tp_percent:100, sl_percent:-25,
      trailing_enabled:false, trailing_percent:0, partial_tp:true,
      partial_tp_at_percent:100, partial_tp_sell_percent:50, max_hold_ms:0,
      use_llm:true, llm_min_confidence:70,
    }],
    ['degen', 'Degen', 0, {
      entry_mode:'immediate', min_source_count:1, require_fee_claim:false,
      token_age_max_ms:3600000, min_mcap_usd:5000, max_mcap_usd:100000,
      min_fee_claim_sol:0, min_gmgn_total_fee_sol:0, min_holders:0,
      max_top20_holder_percent:100, min_saved_wallet_holders:0, max_ath_distance_pct:0,
      min_graduated_volume_usd:0, trending_min_volume_usd:0, trending_min_swaps:0,
      trending_max_rug_ratio:0.5, trending_max_bundler_rate:0.7,
      position_size_sol:0.05, max_open_positions:5, tp_percent:30, sl_percent:-15,
      trailing_enabled:true, trailing_percent:10, partial_tp:false,
      partial_tp_at_percent:0, partial_tp_sell_percent:0, max_hold_ms:0,
      use_llm:false, llm_min_confidence:0,
    }],
  ];
  for (const [id, name, enabled, config] of strategies) {
    const req = pool.request();
    req.input('id', sql.NVarChar, id);
    req.input('nm', sql.NVarChar, name);
    req.input('en', sql.Int, enabled);
    req.input('cfg', sql.NVarChar, JSON.stringify(config));
    req.input('ts', sql.BigInt, ts);
    await req.query(`IF NOT EXISTS (SELECT 1 FROM strategies WHERE id=@id)
      INSERT INTO strategies (id,name,enabled,config_json,created_at_ms) VALUES (@id,@nm,@en,@cfg,@ts)`);
  }
  console.log('✅ [Charon] SQL Server DB initialized');
}

// Legacy stub for compatibility (unused but keeps old imports from crashing)
export function ensureColumn() {}

// Unused placeholder — real tables are in SQL Server
