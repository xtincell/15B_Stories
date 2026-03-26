/**
 * @module summarizer
 * @description Système de compression narrative par résumérisation.
 * Gère deux types de résumés :
 * - Résumés de tours (turn) : compression glissante des anciens tours pour limiter
 *   la taille du contexte LLM tout en préservant les décisions clés.
 * - Résumés de beat : synthèse narrative d'un beat complet lors de la transition.
 * La résumérisation est asynchrone et non bloquante (fire-and-forget).
 */

import { getDb } from './db.js';
import { getActionsByBeat, saveSummary, getLatestSummaryTurn } from './action-journal.js';
import type { ActionEntry } from '../../types/memory.js';
import type { LLMAdapter } from '../../types/llm.js';

/** Nombre de tours récents conservés en détail complet (non résumés) */
const DETAIL_WINDOW = 5;
/** Fréquence de déclenchement de la résumérisation (tous les N tours) */
const SUMMARIZE_EVERY = 5;

/**
 * @description Vérifie si une compression narrative est nécessaire et l'exécute le cas échéant.
 * Appelé après chaque tour. Ne se déclenche que si suffisamment de tours se sont écoulés
 * et que le modulo de fréquence est atteint. Préserve toujours les N derniers tours en détail.
 * @param {string} sessionId - Identifiant de la session
 * @param {number} currentTurn - Numéro du tour qui vient d'être traité
 * @param {LLMAdapter} summarizer - Adaptateur LLM pour générer le résumé
 */
export async function maybeSummarize(
  sessionId: string,
  currentTurn: number,
  summarizer: LLMAdapter,
): Promise<void> {
  // Ne résume pas tant qu'il n'y a pas assez de tours pour remplir la fenêtre de détail
  if (currentTurn < SUMMARIZE_EVERY + DETAIL_WINDOW) return;
  if (currentTurn % SUMMARIZE_EVERY !== 0) return;

  const lastSummarizedTurn = getLatestSummaryTurn(sessionId);
  // Ne résume que les tours entre le dernier résumé et la fenêtre de détail
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
 * @description Crée un résumé narratif lors de la transition vers le beat suivant.
 * Compresse toutes les actions du beat terminé en un paragraphe concis
 * qui préserve les décisions majeures, conséquences et évolutions de relations.
 * @param {string} sessionId - Identifiant de la session
 * @param {number} beatNumber - Numéro du beat qui vient de se terminer
 * @param {number} lastTurn - Numéro du dernier tour du beat
 * @param {LLMAdapter} summarizer - Adaptateur LLM pour générer le résumé
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

/**
 * @description Récupère les actions dans un intervalle de tours (bornes incluses).
 * Utilisé par maybeSummarize pour cibler les tours à compresser.
 * @param {string} sessionId - Identifiant de la session
 * @param {number} fromTurn - Premier tour de l'intervalle (inclus)
 * @param {number} toTurn - Dernier tour de l'intervalle (inclus)
 * @returns {ActionEntry[]} Actions dans l'intervalle, en ordre chronologique
 */
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
