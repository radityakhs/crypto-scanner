import { bot } from './bot.js';
import { TELEGRAM_CHAT_ID } from '../config.js';
import { now, json } from '../utils.js';
import { escapeHtml, fmtPct } from '../format.js';
import { dbGet, dbAll, dbRun, getPool } from '../db/connection.js';
import sql from 'mssql';
import { numSetting, boolSetting, setSetting, activeStrategy, setActiveStrategy, strategyById, updateStrategyConfig } from '../db/settings.js';
import { candidateById, latestCandidateByMint, updateCandidateStatus } from '../db/candidates.js';
import { storeDecision, logDecisionEvent } from '../db/decisions.js';
import {
  menuKeyboard, filtersText, filtersKeyboard, agentText, agentKeyboard, navKeyboard,
  mainMenuText, walletsText, positionsText, candidateButtons, positionButtons,
  strategyMenuText, strategyKeyboard,
} from './menus.js';
import { sendTelegram, sendBatch, sendPositionOpen } from './send.js';
import { candidateSummary, formatPosition } from './format.js';
import { refreshPosition } from '../execution/positions.js';
import { executeLiveSell } from '../execution/router.js';
import { handleCallback, editMenuMessage } from './callbacks.js';
import { consumeNumericFilterInput } from './input.js';
import { runLearning, sendLessons } from '../learning/commands.js';
import { fetchWalletPnl, savedWallets } from '../enrichment/wallets.js';

export async function handleMessage(msg) {
  const text = (msg.text || '').trim();
  const chatId = msg.chat.id;
  if (await consumeNumericFilterInput(chatId, text, msg.message_id)) return;
  if (!text.startsWith('/')) return;
  if (text.startsWith('/menu')) return sendMenu(chatId);
  if (text.startsWith('/positions')) return sendPositions(chatId);
  if (text.startsWith('/filters')) return bot.sendMessage(chatId, await filtersText(), { parse_mode: 'HTML' });
  if (text.startsWith('/strategy')) {
    const parts = text.split(/\s+/);
    const id = parts[1];
    if (!id) return bot.sendMessage(chatId, await strategyMenuText(), { parse_mode: 'HTML', ...await strategyKeyboard() });
    const valid = ['sniper', 'dip_buy', 'smart_money', 'degen'];
    if (!valid.includes(id)) return bot.sendMessage(chatId, `Unknown strategy. Valid: ${valid.join(', ')}`);
    await setActiveStrategy(id);
    return bot.sendMessage(chatId, await strategyMenuText(), { parse_mode: 'HTML', ...await strategyKeyboard() });
  }
  if (text.startsWith('/stratset')) {
    const parts = text.split(/\s+/);
    const [, id, key, ...rest] = parts;
    const value = rest.join(' ');
    if (!id || !key || !value) return bot.sendMessage(chatId, 'Usage: /stratset <strategy_id> <key> <value>\n\nExample: /stratset sniper tp_percent 75');
    const strat = await strategyById(id);
    if (!strat) return bot.sendMessage(chatId, `Strategy "${id}" not found.`);
    const numKeys = new Set(['tp_percent','sl_percent','position_size_sol','max_open_positions','min_mcap_usd','max_mcap_usd','min_holders','max_top20_holder_percent','trailing_percent','partial_tp_at_percent','partial_tp_sell_percent','max_hold_ms','llm_min_confidence','min_source_count','min_fee_claim_sol','min_gmgn_total_fee_sol','max_ath_distance_pct','token_age_max_ms','trending_min_volume_usd','trending_min_swaps','trending_max_rug_ratio','trending_max_bundler_rate','min_saved_wallet_holders','min_graduated_volume_usd']);
    const boolKeys = new Set(['trailing_enabled','partial_tp','use_llm','require_fee_claim']);
    const newConfig = { ...strat }; delete newConfig.id; delete newConfig.name;
    if (numKeys.has(key)) newConfig[key] = Number(value);
    else if (boolKeys.has(key)) newConfig[key] = value === 'true' || value === '1' || value === 'yes';
    else newConfig[key] = value;
    await updateStrategyConfig(id, newConfig);
    return bot.sendMessage(chatId, `Updated ${id}.${key} = ${value}\n\n${await strategyMenuText()}`, { parse_mode: 'HTML' });
  }
  if (text.startsWith('/pnl')) return sendPnl(chatId);
  if (text.startsWith('/learn')) { const windowArg = text.split(/\s+/)[1] || '12h'; return runLearning(chatId, windowArg); }
  if (text.startsWith('/lessons')) return sendLessons(chatId);
  if (text.startsWith('/candidate')) {
    const mint = text.split(/\s+/)[1];
    if (!mint) return bot.sendMessage(chatId, 'Usage: /candidate <mint>');
    const row = await latestCandidateByMint(mint);
    if (!row) return bot.sendMessage(chatId, 'Candidate not found.');
    return sendCandidate(chatId, row.id);
  }
  if (text.startsWith('/walletadd')) {
    const [, label, address] = text.split(/\s+/);
    if (!label || !address) return bot.sendMessage(chatId, 'Usage: /walletadd <label> <address>');
    const pool = await getPool();
    const req = pool.request();
    req.input('lb', sql.NVarChar, label); req.input('addr', sql.NVarChar, address); req.input('ts', sql.BigInt, now());
    await req.query(`MERGE saved_wallets WITH (HOLDLOCK) AS t USING (SELECT @lb AS label, @addr AS address, @ts AS created_at_ms) AS s ON t.label=s.label WHEN MATCHED THEN UPDATE SET t.address=s.address WHEN NOT MATCHED THEN INSERT (label,address,created_at_ms) VALUES (s.label,s.address,s.created_at_ms);`);
    return bot.sendMessage(chatId, `Saved wallet ${label}.`);
  }
  if (text.startsWith('/walletremove')) {
    const label = text.split(/\s+/)[1];
    if (!label) return bot.sendMessage(chatId, 'Usage: /walletremove <label>');
    await dbRun('DELETE FROM saved_wallets WHERE label=@p0', [label]);
    return bot.sendMessage(chatId, `Removed ${label}.`);
  }
  if (text.startsWith('/wallets')) return handleCallback({ id: 'manual', data: 'menu:wallets', message: { chat: { id: chatId } } });
  if (text.startsWith('/setfilter')) {
    const { key, value } = parseSetFilter(text);
    const valid = new Set(['min_fee_claim_sol','min_mcap_usd','max_mcap_usd','min_gmgn_total_fee_sol','min_graduated_volume_usd','max_top20_holder_percent','min_saved_wallet_holders','trending_enabled','trending_source','trending_allow_degen','trending_interval','trending_limit','trending_order_by','trending_min_volume_usd','trending_min_swaps','trending_max_rug_ratio','trending_max_bundler_rate','trading_mode','llm_min_confidence','llm_candidate_pick_count','llm_candidate_max_age_ms','max_open_positions','dry_run_buy_sol','default_tp_percent','default_sl_percent','default_trailing_enabled','default_trailing_percent']);
    if (!valid.has(key) || value == null) return bot.sendMessage(chatId, `Usage: /setfilter &lt;name&gt; &lt;value&gt;\n\n${await filtersText()}`, { parse_mode: 'HTML' });
    await setSetting(key, value === 'off' ? '0' : value);
    return bot.sendMessage(chatId, await filtersText(), { parse_mode: 'HTML' });
  }
}

export async function sendCandidate(chatId, id) {
  const row = await candidateById(id);
  if (!row) return bot.sendMessage(chatId, 'Candidate not found.');
  const decision = await dbGet('SELECT TOP 1 * FROM llm_decisions WHERE candidate_id=@p0 ORDER BY id DESC', [id]);
  await bot.sendMessage(chatId, candidateSummary(row.candidate, decision), { parse_mode: 'HTML', disable_web_page_preview: true, ...candidateButtons(id, decision) });
}

export async function sendPositions(chatId) {
  const rows = await dbAll('SELECT TOP 12 * FROM dry_run_positions ORDER BY id DESC');
  const text = rows.length ? rows.map(formatPosition).join('\n\n') : 'No dry-run positions yet.';
  await bot.sendMessage(chatId, `📍 <b>Positions</b>\n\n${text}`, { parse_mode: 'HTML', disable_web_page_preview: true });
}

export async function sendPosition(chatId, id, query = null) {
  let row = await dbGet('SELECT * FROM dry_run_positions WHERE id=@p0', [id]);
  if (!row) return bot.sendMessage(chatId, 'Position not found.');
  if (row.status === 'open') {
    const refreshed = await refreshPosition(row, { autoExit: row.execution_mode !== 'live' }).catch((err) => { console.log(`[position] refresh ${id} ${err.message}`); return null; });
    if (refreshed) row = { ...row, ...refreshed };
  }
  const buttons = row.status === 'open' ? positionButtons(id) : {};
  if (query) return editMenuMessage(query, formatPosition(row), buttons);
  await bot.sendMessage(chatId, formatPosition(row), { parse_mode: 'HTML', disable_web_page_preview: true, ...buttons });
}

export async function closePosition(chatId, id, reason) {
  const row = await dbGet('SELECT * FROM dry_run_positions WHERE id=@p0', [id]);
  if (!row || row.status !== 'open') return bot.sendMessage(chatId, 'Open position not found.');
  const result = await refreshPosition(row, { autoExit: false });
  const price = result?.price ?? row.high_water_price ?? row.entry_price;
  const mcap = result?.mcap ?? row.high_water_mcap ?? row.entry_mcap;
  const pnlPercent = row.entry_mcap ? (Number(mcap) / Number(row.entry_mcap) - 1) * 100 : 0;
  const pnlSol = Number(row.size_sol) * pnlPercent / 100;
  let sell = null;
  if (row.execution_mode === 'live') sell = await executeLiveSell(row, reason);
  await dbRun(`UPDATE dry_run_positions SET status='closed',closed_at_ms=@p0,exit_price=@p1,exit_mcap=@p2,exit_reason=@p3,pnl_percent=@p4,pnl_sol=@p5,exit_signature=@p6 WHERE id=@p7`, [now(), price, mcap, reason, pnlPercent, pnlSol, sell?.signature || null, id]);
  await dbRun(`INSERT INTO dry_run_trades (position_id,mint,side,at_ms,price,mcap,size_sol,token_amount_est,reason,payload_json) VALUES (@p0,@p1,'sell',@p2,@p3,@p4,@p5,@p6,@p7,@p8)`, [id, row.mint, now(), price, mcap, row.size_sol, row.token_amount_est, reason, json({ pnlPercent, pnlSol, sell })]);
  const label = row.execution_mode === 'live' ? 'Closed live position' : 'Closed dry-run position';
  await bot.sendMessage(chatId, `${label} #${id}: ${escapeHtml(reason)} ${fmtPct(pnlPercent)}`, { parse_mode: 'HTML' });
}

export async function updatePositionRule(chatId, id, field, nextValue, query = null) {
  if (!Number.isFinite(nextValue)) return bot.sendMessage(chatId, 'Invalid value.');
  await dbRun(`UPDATE dry_run_positions SET ${field}=@p0 WHERE id=@p1`, [nextValue, id]);
  const row = await dbGet('SELECT * FROM dry_run_positions WHERE id=@p0', [id]);
  if (row) {
    const pool = await getPool();
    const req = pool.request();
    req.input('id', sql.Int, id); req.input('tp', sql.Float, row.tp_percent); req.input('sl', sql.Float, row.sl_percent); req.input('te', sql.Int, row.trailing_enabled); req.input('tpct', sql.Float, row.trailing_percent); req.input('ts', sql.BigInt, now());
    await req.query(`MERGE tp_sl_rules WITH (HOLDLOCK) AS t USING (SELECT @id AS position_id) AS s ON t.position_id=s.position_id WHEN MATCHED THEN UPDATE SET t.tp_percent=@tp,t.sl_percent=@sl,t.trailing_enabled=@te,t.trailing_percent=@tpct,t.updated_at_ms=@ts WHEN NOT MATCHED THEN INSERT (position_id,tp_percent,sl_percent,trailing_enabled,trailing_percent,updated_at_ms) VALUES (@id,@tp,@sl,@te,@tpct,@ts);`);
  }
  await sendPosition(chatId, id, query);
}

export async function toggleTrailing(chatId, id, query = null) {
  const row = await dbGet('SELECT * FROM dry_run_positions WHERE id=@p0', [id]);
  if (!row) return bot.sendMessage(chatId, 'Position not found.');
  const next = row.trailing_enabled ? 0 : 1;
  await dbRun('UPDATE dry_run_positions SET trailing_enabled=@p0 WHERE id=@p1', [next, id]);
  const pool = await getPool();
  const req = pool.request();
  req.input('id', sql.Int, id); req.input('tp', sql.Float, row.tp_percent); req.input('sl', sql.Float, row.sl_percent); req.input('te', sql.Int, next); req.input('tpct', sql.Float, row.trailing_percent); req.input('ts', sql.BigInt, now());
  await req.query(`MERGE tp_sl_rules WITH (HOLDLOCK) AS t USING (SELECT @id AS position_id) AS s ON t.position_id=s.position_id WHEN MATCHED THEN UPDATE SET t.tp_percent=@tp,t.sl_percent=@sl,t.trailing_enabled=@te,t.trailing_percent=@tpct,t.updated_at_ms=@ts WHEN NOT MATCHED THEN INSERT (position_id,tp_percent,sl_percent,trailing_enabled,trailing_percent,updated_at_ms) VALUES (@id,@tp,@sl,@te,@tpct,@ts);`);
  await sendPosition(chatId, id, query);
}

export function setupTelegram() {
  bot.setMyCommands([
    { command: 'menu', description: 'Open Charon menu' },
    { command: 'strategy', description: 'Show/switch strategy' },
    { command: 'stratset', description: 'Set strategy config (stratset id key value)' },
    { command: 'positions', description: 'Show dry-run positions' },
    { command: 'candidate', description: 'Show candidate by mint' },
    { command: 'filters', description: 'Show filters' },
    { command: 'pnl', description: 'Show saved-wallet PnL' },
    { command: 'learn', description: 'Run manual learning report' },
    { command: 'lessons', description: 'Show active screening lessons' },
    { command: 'setfilter', description: 'Set a filter value' },
    { command: 'walletadd', description: 'Save wallet for exposure/PnL' },
    { command: 'walletremove', description: 'Remove saved wallet' },
    { command: 'wallets', description: 'List saved wallets' },
  ]).catch(err => console.log(`[telegram] commands ${err.message}`));
  bot.on('callback_query', query => handleCallback(query).catch(err => console.log(`[callback] ${err.message}`)));
  bot.on('message', msg => handleMessage(msg).catch(err => console.log(`[message] ${err.message}`)));
  bot.on('polling_error', err => console.log(`[telegram] polling ${err.message}`));
}

async function sendMenu(chatId = TELEGRAM_CHAT_ID) {
  const { TELEGRAM_TOPIC_ID } = await import('../config.js');
  await bot.sendMessage(chatId, mainMenuText(), {
    parse_mode: 'HTML', disable_web_page_preview: true,
    ...(TELEGRAM_TOPIC_ID ? { message_thread_id: Number(TELEGRAM_TOPIC_ID) } : {}),
    ...menuKeyboard(),
  });
}

async function sendPnl(chatId, query = null) {
  const wallets = await savedWallets();
  if (!wallets.length) {
    const text = '📊 <b>PnL</b>\n\nNo saved wallets. Use /walletadd &lt;label&gt; &lt;address&gt;.';
    return query ? editMenuMessage(query, text, navKeyboard()) : bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
  }
  const chunks = [];
  for (const wallet of wallets) {
    const pnl = await fetchWalletPnl(wallet.address).catch(() => null);
    if (!pnl) { chunks.push(`• <b>${escapeHtml(wallet.label)}</b>: no data`); continue; }
    chunks.push([`• <b>${escapeHtml(wallet.label)}</b>`, `Win: ${fmtPct(pnl.winRate)} · PnL: ${fmtPct(pnl.totalPnlPercent)}`, `Trades: ${pnl.totalTrades} · Wins: ${pnl.wins}`].join('\n'));
  }
  const text = `📊 <b>PnL</b>\n\n${chunks.join('\n\n')}`;
  return query ? editMenuMessage(query, text, navKeyboard()) : bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

function parseSetFilter(text) {
  const parts = text.trim().split(/\s+/);
  return { key: parts[1], value: parts[2] };
}
