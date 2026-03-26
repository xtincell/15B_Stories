/**
 * @module action-journal
 * @description Journal des actions du joueur et système de résumés.
 * Enregistre chaque action de jeu (choix, jets de dés, changements d'état)
 * dans une base SQLite, et fournit les méthodes de lecture, de résumé
 * et de cache de conversation pour alimenter le contexte du LLM.
 */

import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';
import type { ActionEntry, ActionSummary, SummaryType } from '../../types/memory.js';

/**
 * @description Enregistre une action dans le journal.
 * Crée un identifiant unique et un horodatage, puis insère en base.
 * @param {Omit<ActionEntry, 'id' | 'timestamp'>} entry - Données de l'action (sans id ni timestamp)
 * @returns {ActionEntry} L'entrée complète avec id et timestamp générés
 */
export function logAction(entry: Omit<ActionEntry, 'id' | 'timestamp'>): ActionEntry {
  const db = getDb();
  const id = uuid();
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO action_journal (id, session_id, turn_number, beat, scene, choice_id, choice_text, dominant_stat, dice_result_json, state_changes_json, narration_text, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.sessionId,
    entry.turnNumber,
    entry.beat,
    entry.scene,
    entry.choiceId,
    entry.choiceText,
    entry.dominantStat,
    entry.diceResult ? JSON.stringify(entry.diceResult) : null,
    JSON.stringify(entry.stateChanges),
    entry.narrationText,
    timestamp,
  );

  return { ...entry, id, timestamp };
}

/**
 * @description Récupère les N dernières actions d'une session, ordonnées chronologiquement.
 * Les résultats sont inversés après requête DESC pour obtenir l'ordre chronologique.
 * @param {string} sessionId - Identifiant de la session
 * @param {number} limit - Nombre maximum d'actions à retourner (défaut: 5)
 * @returns {ActionEntry[]} Actions récentes en ordre chronologique
 */
export function getRecentActions(sessionId: string, limit: number = 5): ActionEntry[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM action_journal WHERE session_id = ? ORDER BY turn_number DESC LIMIT ?'
  ).all(sessionId, limit) as any[];

  return rows.reverse().map(rowToActionEntry);
}

/**
 * @description Récupère toutes les actions d'un beat spécifique, en ordre chronologique.
 * @param {string} sessionId - Identifiant de la session
 * @param {number} beatNumber - Numéro du beat
 * @returns {ActionEntry[]} Actions du beat en ordre chronologique
 */
export function getActionsByBeat(sessionId: string, beatNumber: number): ActionEntry[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM action_journal WHERE session_id = ? AND beat = ? ORDER BY turn_number ASC'
  ).all(sessionId, beatNumber) as any[];

  return rows.map(rowToActionEntry);
}

/**
 * @description Compte le nombre total d'actions enregistrées pour une session.
 * @param {string} sessionId - Identifiant de la session
 * @returns {number} Nombre d'actions
 */
export function getActionCount(sessionId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM action_journal WHERE session_id = ?').get(sessionId) as any;
  return row.count;
}

// ── Résumés ──

/**
 * @description Enregistre un résumé narratif (par tour ou par beat) en base.
 * @param {object} data - Données du résumé
 * @param {string} data.sessionId - Identifiant de la session
 * @param {SummaryType} data.type - Type de résumé ('turn' ou 'beat')
 * @param {number} data.beatNumber - Numéro du beat concerné
 * @param {number} data.upToTurn - Dernier tour couvert par ce résumé
 * @param {string} data.summaryText - Texte du résumé généré par le LLM
 * @returns {ActionSummary} Le résumé complet avec id et horodatage
 */
export function saveSummary(data: {
  sessionId: string;
  type: SummaryType;
  beatNumber: number;
  upToTurn: number;
  summaryText: string;
}): ActionSummary {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO action_summaries (id, session_id, type, beat_number, up_to_turn, summary_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.sessionId, data.type, data.beatNumber, data.upToTurn, data.summaryText, now);

  return { id, ...data, createdAt: now };
}

/**
 * @description Récupère tous les résumés de beat d'une session, ordonnés par numéro de beat.
 * @param {string} sessionId - Identifiant de la session
 * @returns {ActionSummary[]} Résumés de beat en ordre croissant
 */
export function getBeatSummaries(sessionId: string): ActionSummary[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM action_summaries WHERE session_id = ? AND type = 'beat' ORDER BY beat_number ASC"
  ).all(sessionId) as any[];

  return rows.map(rowToSummary);
}

/**
 * @description Retourne le numéro du dernier tour couvert par un résumé.
 * Permet de déterminer à partir de quel tour reprendre la résumérisation.
 * @param {string} sessionId - Identifiant de la session
 * @returns {number} Numéro du dernier tour résumé, ou 0 si aucun résumé
 */
export function getLatestSummaryTurn(sessionId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT MAX(up_to_turn) as max_turn FROM action_summaries WHERE session_id = ?'
  ).get(sessionId) as any;
  return row?.max_turn ?? 0;
}

// ── Cache de conversation ──

/**
 * @description Enregistre un message de conversation (utilisateur ou assistant) dans le cache.
 * Ces messages alimentent l'historique de conversation injecté dans le prompt du LLM.
 * @param {string} sessionId - Identifiant de la session
 * @param {number} turnNumber - Numéro du tour
 * @param {'user' | 'assistant'} role - Rôle de l'émetteur du message
 * @param {string} content - Contenu du message
 */
export function cacheConversationMessage(sessionId: string, turnNumber: number, role: 'user' | 'assistant', content: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO conversation_cache (id, session_id, turn_number, role, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), sessionId, turnNumber, role, content, new Date().toISOString());
}

/**
 * @description Récupère l'historique de conversation récent pour le contexte LLM.
 * @param {string} sessionId - Identifiant de la session
 * @param {number} limit - Nombre de tours à récupérer (défaut: 10)
 * @returns {Array<{role: 'user' | 'assistant', content: string}>} Messages en ordre chronologique
 */
export function getConversationHistory(sessionId: string, limit: number = 10): { role: 'user' | 'assistant'; content: string }[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT role, content FROM conversation_cache WHERE session_id = ? ORDER BY turn_number DESC, created_at ASC LIMIT ?'
  ).all(sessionId, limit * 2) as any[]; // x2 car chaque tour contient un message user + assistant

  return rows.reverse();
}

// ── Mappers ligne SQL -> objet TypeScript ──

/**
 * @description Convertit une ligne SQL brute en objet ActionEntry typé.
 * Désérialise les champs JSON (diceResult, stateChanges).
 */
function rowToActionEntry(row: any): ActionEntry {
  return {
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
  };
}

/**
 * @description Convertit une ligne SQL brute en objet ActionSummary typé.
 */
function rowToSummary(row: any): ActionSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    beatNumber: row.beat_number,
    upToTurn: row.up_to_turn,
    summaryText: row.summary_text,
    createdAt: row.created_at,
  };
}
