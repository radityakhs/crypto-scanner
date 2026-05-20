import axios from 'axios';
import { ENABLE_LLM, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT_MS } from '../config.js';
import { now, stripThinking, strictJsonFromText } from '../utils.js';
import { numSetting } from '../db/settings.js';
import { dbAll } from '../db/connection.js';

export async function normalizeDecision(parsed, fallbackReason = '') {
  const verdict = ['BUY', 'WATCH', 'PASS'].includes(String(parsed?.verdict).toUpperCase())
    ? String(parsed.verdict).toUpperCase()
    : 'WATCH';
  return {
    verdict,
    confidence: Math.max(0, Math.min(100, Number(parsed?.confidence) || 0)),
    reason: String(parsed?.reason || fallbackReason).slice(0, 1000),
    risks: Array.isArray(parsed?.risks) ? parsed.risks.map(String).slice(0, 8) : [],
    suggested_tp_percent: Number(parsed?.suggested_tp_percent) || await numSetting('default_tp_percent', 50),
    suggested_sl_percent: Number(parsed?.suggested_sl_percent) || await numSetting('default_sl_percent', -25),
    raw: parsed,
  };
}

export async function activeLessonsForPrompt(limit = 6) {
  const rows = await dbAll(
    `SELECT TOP (@p0) lesson FROM learning_lessons WHERE status='active' ORDER BY id DESC`,
    [limit],
  );
  return rows.map(row => row.lesson);
}

export async function decideCandidateBatch(rows, triggerCandidateId = null) {
  const defaultTp = await numSetting('default_tp_percent', 50);
  const defaultSl = await numSetting('default_sl_percent', -25);
  const PASS = (reason) => ({ verdict: 'PASS', confidence: 0, reason, risks: [], selected_row: null, selected_candidate_id: null, selected_mint: null, suggested_tp_percent: defaultTp, suggested_sl_percent: defaultSl, raw: null });

  if (!rows || !rows.length) return PASS('No candidates in batch.');

  if (!ENABLE_LLM || !LLM_API_KEY) {
    const selected = rows.find(r => r.id === triggerCandidateId) || rows[0];
    return { verdict: 'BUY', confidence: 100, reason: "LLM disabled, rule-based selection.", risks: [], selected_row: selected, selected_candidate_id: selected.id, selected_mint: selected.candidate?.token?.mint || null, suggested_tp_percent: defaultTp, suggested_sl_percent: defaultSl, raw: null };
  }

  const lessons = await activeLessonsForPrompt(6);
  const compacted = rows.map(compactCandidateForLlm);
  const systemPrompt = [
    'You are a Solana memecoin trading analyst. Evaluate a batch of token candidates and select the BEST one to buy, or return PASS if none qualify.',
    lessons.length ? `\nActive lessons from past trades:\n${lessons.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : '',
  ].join('');
  const userPrompt = [
    `Evaluate these ${rows.length} candidates and select the best one, or PASS. Return JSON only:`,
    `{"verdict":"BUY"|"PASS","selected_candidate_id":<number|null>,"confidence":<0-100>,"reason":"<brief>","risks":["..."],"suggested_tp_percent":<number>,"suggested_sl_percent":<negative number>}`,
    '', 'Candidates:', JSON.stringify(compacted),
  ].join('\n');

  try {
    const resp = await axios.post(`${LLM_BASE_URL}/chat/completions`, {
      model: LLM_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.1, max_tokens: 800,
    }, { headers: { Authorization: `Bearer ${LLM_API_KEY}`, 'Content-Type': 'application/json' }, timeout: LLM_TIMEOUT_MS || 30000 });

    const rawText = resp.data?.choices?.[0]?.message?.content || '';
    const parsed = strictJsonFromText(stripThinking(rawText));
    if (!parsed) return PASS('LLM returned unparseable response.');

    const normalized = await normalizeDecision(parsed, 'LLM batch decision');
    const selectedId = Number(parsed.selected_candidate_id) || null;
    const selectedRow = selectedId ? (rows.find(r => r.id === selectedId) || null) : null;
    return { ...normalized, selected_row: selectedRow, selected_candidate_id: selectedId, selected_mint: selectedRow?.candidate?.token?.mint || null };
  } catch (err) {
    console.log(`[llm] decideCandidateBatch error: ${err.message}`);
    return PASS(`LLM error: ${err.message}`);
  }
}

export function compactCandidateForLlm(row) {
  const c = row.candidate;
  const athWindow = c.chart?.windows?.find(w => w.label === 'ath_context_24h_5m' && w.available)
    || c.chart?.windows?.find(w => w.label === 'recent_24h_5m' && w.available);
  return {
    candidate_id: row.id,
    mint: c.token?.mint,
    route: c.signals?.route,
    signals: c.signals,
    token: c.token,
    metrics: c.metrics,
    feeClaim: c.feeClaim,
    trending: c.trending,
    graduation: c.graduation,
    holders: c.holders,
    chart: {
      purpose: 'ATH/range context only. Do not treat large 24h change as bullish/bearish momentum by itself.',
      currentNative: c.chart?.currentNative,
      rangeHighNative: c.chart?.rangeHighNative,
      rangeLowNative: c.chart?.rangeLowNative,
      athNative: c.chart?.athNative,
      distanceFromAthPercent: c.chart?.distanceFromAthPercent,
      priceChangePercent24h: c.chart?.priceChangePercent24h,
      window: athWindow ? { label: athWindow.label, open: athWindow.open, high: athWindow.high, low: athWindow.low, close: athWindow.close, change: athWindow.change } : null,
    },
    savedWalletExposure: c.savedWalletExposure,
    twitterNarrative: c.twitterNarrative,
    filters: c.filters,
    createdAtMs: c.createdAtMs,
  };
}
