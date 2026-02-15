import { getDb } from './db.js';
import { getActionsByBeat, saveSummary, getLatestSummaryTurn } from './action-journal.js';
import type { ActionEntry } from '../../types/memory.js';
import type { LLMAdapter } from '../../types/llm.js';

const DETAIL_WINDOW = 5; // keep last N turns in full detail
const SUMMARIZE_EVERY = 5; // trigger summarization every N turns

/**
 * Check if we need to run narrative compression and do it.
 * Called after each turn is processed.
 */
export async function maybeSummarize(
  sessionId: string,
  currentTurn: number,
  summarizer: LLMAdapter,
): Promise<void> {
  if (currentTurn < SUMMARIZE_EVERY + DETAIL_WINDOW) return;
  if (currentTurn % SUMMARIZE_EVERY !== 0) return;

  const lastSummarizedTurn = getLatestSummaryTurn(sessionId);
  const turnsToSummarize = getActionsInRange(sessionId, lastSummarizedTurn + 1, currentTurn - DETAIL_WINDOW);

  if (turnsToSummarize.length === 0) return;

  const text = turnsToSummarize.map(a =>
    `Tour ${a.turnNumber} (Beat ${a.beat}): ${a.choiceText}${a.diceResult ? ` [${a.diceResult.success ? 'succès' : 'échec'}]` : ''}`
  ).join('\n');

  const summary = await summarizer.summarize(text,
    'Résume ces actions de jeu RPG en préservant : décisions clés, conséquences importantes, relations PNJ modifiées, flags monde posés. Maximum 3 phrases concises en français.'
  );

  saveSummary({
    sessionId,
    type: 'turn',
    beatNumber: turnsToSummarize[turnsToSummarize.length - 1].beat,
    upToTurn: currentTurn - DETAIL_WINDOW,
    summaryText: summary,
  });
}

/**
 * Create a beat summary when transitioning to next beat.
 * Compresses all actions from the completed beat into 1 paragraph.
 */
export async function summarizeBeat(
  sessionId: string,
  beatNumber: number,
  lastTurn: number,
  summarizer: LLMAdapter,
): Promise<void> {
  const actions = getActionsByBeat(sessionId, beatNumber);
  if (actions.length === 0) return;

  const text = actions.map(a =>
    `Tour ${a.turnNumber}: ${a.choiceText}. ${a.narrationText.slice(0, 200)}`
  ).join('\n');

  const summary = await summarizer.summarize(text,
    `Résume le Beat ${beatNumber} de cette aventure RPG en 1 paragraphe. Préserve : les décisions majeures, conséquences narratives, évolution des relations, événements marquants. Style : narratif et concis, en français.`
  );

  saveSummary({
    sessionId,
    type: 'beat',
    beatNumber,
    upToTurn: lastTurn,
    summaryText: summary,
  });
}

function getActionsInRange(sessionId: string, fromTurn: number, toTurn: number): ActionEntry[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM action_journal WHERE session_id = ? AND turn_number >= ? AND turn_number <= ? ORDER BY turn_number ASC'
  ).all(sessionId, fromTurn, toTurn) as any[];

  return rows.map((row: any) => ({
    id: row.id,
    sessionId: row.session_id,
    turnNumber: row.turn_number,
    beat: row.beat,
    scene: row.scene,
    choiceId: row.choice_id,
    choiceText: row.choice_text,
    dominantStat: row.dominant_stat,
    diceResult: row.dice_result_json ? JSON.parse(row.dice_result_json) : undefined,
    stateChanges: JSON.parse(row.state_changes_json),
    narrationText: row.narration_text,
    timestamp: row.timestamp,
  }));
}
