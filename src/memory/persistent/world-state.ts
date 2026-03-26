/**
 * @module world-state
 * @description Gestion de l'état du monde et des sessions de jeu.
 * CRUD complet sur les sessions (création, lecture, mise à jour, suppression),
 * gestion des flags monde (drapeaux narratifs), des relations PNJ
 * et des parties terminées. C'est la couche de persistance principale
 * pour toutes les données dynamiques d'une partie.
 */

import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';
import type { GameSession, GameMode, SessionStatus, NPCRelationship } from '../../types/game.js';

/**
 * @description Crée une nouvelle session de jeu en base de données.
 * Initialise le beat à 1, la scène à 1, le compteur de tours à 0 et les flags monde vides.
 * @param {string} characterId - Identifiant du personnage associé
 * @param {string} bookId - Identifiant du livre de jeu
 * @param {GameMode} gameMode - Mode de jeu ('normal' ou 'rapide', défaut: 'normal')
 * @returns {GameSession} La session créée avec tous ses champs initialisés
 */
export function createSession(characterId: string, bookId: string, gameMode: GameMode = 'normal'): GameSession {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sessions (id, character_id, book_id, game_mode, current_beat, current_scene, turn_count, world_flags_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, 0, '{}', ?, ?)
  `).run(id, characterId, bookId, gameMode, now, now);

  return {
    id,
    characterId,
    bookId,
    gameMode,
    currentBeat: 1,
    currentScene: 1,
    turnCount: 0,
    worldFlags: {},
    relationships: [],
    status: 'in_progress' as SessionStatus,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * @description Récupère une session de jeu complète depuis la base, incluant les relations PNJ.
 * @param {string} id - Identifiant de la session
 * @returns {GameSession | null} La session complète ou null si introuvable
 */
export function getSession(id: string): GameSession | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any;
  if (!row) return null;

  const relationships = getRelationships(id);

  return {
    id: row.id,
    characterId: row.character_id,
    bookId: row.book_id,
    gameMode: row.game_mode ?? 'normal',
    currentBeat: row.current_beat,
    currentScene: row.current_scene,
    turnCount: row.turn_count,
    worldFlags: JSON.parse(row.world_flags_json),
    relationships,
    status: (row.status ?? 'in_progress') as SessionStatus,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @description Met à jour partiellement une session de jeu.
 * Construit dynamiquement la requête SQL à partir des champs fournis.
 * Le champ updated_at est toujours mis à jour automatiquement.
 * @param {string} id - Identifiant de la session
 * @param {object} updates - Champs à mettre à jour (tous optionnels)
 */
export function updateSession(id: string, updates: {
  currentBeat?: number;
  currentScene?: number;
  turnCount?: number;
  worldFlags?: Record<string, boolean | string | number>;
  status?: SessionStatus;
  completedAt?: string;
}): void {
  const db = getDb();
  const sets: string[] = ['updated_at = ?'];
  const values: any[] = [new Date().toISOString()];

  if (updates.currentBeat !== undefined) { sets.push('current_beat = ?'); values.push(updates.currentBeat); }
  if (updates.currentScene !== undefined) { sets.push('current_scene = ?'); values.push(updates.currentScene); }
  if (updates.turnCount !== undefined) { sets.push('turn_count = ?'); values.push(updates.turnCount); }
  if (updates.worldFlags !== undefined) { sets.push('world_flags_json = ?'); values.push(JSON.stringify(updates.worldFlags)); }
  if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
  if (updates.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(updates.completedAt); }

  values.push(id);
  db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * @description Définit ou met à jour un flag monde dans une session.
 * Les flags monde sont des drapeaux narratifs (ex: "village_détruit", "allié_trahi")
 * qui influencent le comportement du LLM et les transitions de beat.
 * @param {string} sessionId - Identifiant de la session
 * @param {string} key - Clé du flag
 * @param {boolean | string | number} value - Valeur du flag
 */
export function setWorldFlag(sessionId: string, key: string, value: boolean | string | number): void {
  const session = getSession(sessionId);
  if (!session) return;
  const flags = { ...session.worldFlags, [key]: value };
  updateSession(sessionId, { worldFlags: flags });
}

/**
 * @description Récupère tous les flags monde d'une session.
 * @param {string} sessionId - Identifiant de la session
 * @returns {Record<string, boolean | string | number>} Dictionnaire des flags monde
 */
export function getWorldFlags(sessionId: string): Record<string, boolean | string | number> {
  const db = getDb();
  const row = db.prepare('SELECT world_flags_json FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!row) return {};
  return JSON.parse(row.world_flags_json);
}

// ── Relations PNJ ──

/**
 * @description Récupère toutes les relations PNJ d'une session.
 * Utilisé en interne par getSession pour hydrater la session complète.
 * @param {string} sessionId - Identifiant de la session
 * @returns {NPCRelationship[]} Liste des relations PNJ
 */
function getRelationships(sessionId: string): NPCRelationship[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM npc_relationships WHERE session_id = ?').all(sessionId) as any[];
  return rows.map(row => ({
    npcId: row.npc_id,
    npcName: row.npc_name,
    affinity: row.affinity,
    lastInteractionBeat: row.last_interaction_beat,
    notes: JSON.parse(row.notes_json),
  }));
}

/**
 * @description Insère ou met à jour une relation PNJ (upsert via ON CONFLICT).
 * Si la relation existe déjà, seuls l'affinité, le dernier beat d'interaction et les notes sont mis à jour.
 * @param {string} sessionId - Identifiant de la session
 * @param {NPCRelationship} rel - Données de la relation à insérer ou mettre à jour
 */
export function upsertRelationship(sessionId: string, rel: NPCRelationship): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO npc_relationships (id, session_id, npc_id, npc_name, affinity, last_interaction_beat, notes_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, npc_id) DO UPDATE SET
      affinity = excluded.affinity,
      last_interaction_beat = excluded.last_interaction_beat,
      notes_json = excluded.notes_json
  `).run(uuid(), sessionId, rel.npcId, rel.npcName, rel.affinity, rel.lastInteractionBeat, JSON.stringify(rel.notes));
}

/**
 * @description Récupère une relation PNJ spécifique.
 * @param {string} sessionId - Identifiant de la session
 * @param {string} npcId - Identifiant du PNJ
 * @returns {NPCRelationship | null} La relation ou null si inexistante
 */
export function getRelationship(sessionId: string, npcId: string): NPCRelationship | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM npc_relationships WHERE session_id = ? AND npc_id = ?').get(sessionId, npcId) as any;
  if (!row) return null;
  return {
    npcId: row.npc_id,
    npcName: row.npc_name,
    affinity: row.affinity,
    lastInteractionBeat: row.last_interaction_beat,
    notes: JSON.parse(row.notes_json),
  };
}

// ── Parties terminées ──

/**
 * @description Résumé d'une partie terminée, utilisé pour l'affichage dans l'historique.
 */
export interface CompletedGameSummary {
  sessionId: string;
  characterName: string;
  archetype: string;
  archetypeId: string;
  gameMode: string;
  bookId: string;
  turnCount: number;
  completedAt: string;
}

/**
 * @description Récupère la liste de toutes les parties terminées avec leurs métadonnées.
 * Joint la table sessions avec characters pour enrichir le résumé.
 * @returns {CompletedGameSummary[]} Parties terminées triées par date de fin décroissante
 */
export function getCompletedSessions(): CompletedGameSummary[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.id, s.completed_at, s.turn_count, s.game_mode, s.book_id,
           c.name AS character_name, c.archetype, c.archetype_id
    FROM sessions s
    JOIN characters c ON s.character_id = c.id
    WHERE s.status = 'completed'
    ORDER BY s.completed_at DESC
  `).all() as any[];

  return rows.map(r => ({
    sessionId: r.id,
    characterName: r.character_name,
    archetype: r.archetype,
    archetypeId: r.archetype_id ?? '',
    gameMode: r.game_mode,
    bookId: r.book_id ?? 'kinara',
    turnCount: r.turn_count,
    completedAt: r.completed_at,
  }));
}

/**
 * @description Supprime une session et toutes ses données associées (cascade manuelle).
 * L'ordre de suppression respecte les dépendances entre tables car le schéma
 * ne définit pas de ON DELETE CASCADE.
 * @param {string} id - Identifiant de la session à supprimer
 */
export function deleteSession(id: string): void {
  const db = getDb();
  const session = db.prepare('SELECT character_id FROM sessions WHERE id = ?').get(id) as any;
  if (!session) return;

  // Suppression en cascade manuelle — respecte l'ordre des dépendances
  db.prepare('DELETE FROM conversation_cache WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM beat_pacing WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM action_summaries WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM action_journal WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM npc_relationships WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM saves WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  db.prepare('DELETE FROM characters WHERE id = ?').run(session.character_id);
}
