/**
 * @module npc-state
 * @description Gestion de l'état des relations PNJ dans une session de jeu.
 * Fournit les opérations de mise à jour d'affinité, d'initialisation de relation
 * et de récupération des relations pertinentes pour un beat donné.
 * L'affinité est toujours bornée (clamp) pour rester dans les limites du système de jeu.
 */

import { getDb } from './db.js';
import { upsertRelationship, getRelationship } from './world-state.js';
import { clampAffinity } from '../../engine/stats.js';
import type { NPCRelationship } from '../../types/game.js';

/**
 * @description Met à jour l'affinité d'un PNJ avec un delta (positif ou négatif).
 * L'affinité résultante est bornée par clampAffinity. Ajoute éventuellement
 * une note narrative au journal de la relation.
 * @param {string} sessionId - Identifiant de la session
 * @param {string} npcId - Identifiant du PNJ
 * @param {number} delta - Variation d'affinité à appliquer
 * @param {number} beat - Numéro du beat où l'interaction a lieu
 * @param {string} [note] - Note optionnelle décrivant la raison du changement
 * @returns {NPCRelationship | null} Relation mise à jour, ou null si le PNJ n'existe pas en session
 */
export function updateAffinity(sessionId: string, npcId: string, delta: number, beat: number, note?: string): NPCRelationship | null {
  const existing = getRelationship(sessionId, npcId);
  if (!existing) return null;

  const updated: NPCRelationship = {
    ...existing,
    affinity: clampAffinity(existing.affinity + delta),
    lastInteractionBeat: beat,
    notes: note ? [...existing.notes, note] : existing.notes,
  };

  upsertRelationship(sessionId, updated);
  return updated;
}

/**
 * @description Initialise une relation PNJ dans une session avec une affinité par défaut.
 * Appelé en début de partie pour chaque PNJ du livre.
 * @param {string} sessionId - Identifiant de la session
 * @param {string} npcId - Identifiant du PNJ
 * @param {string} npcName - Nom affiché du PNJ
 * @param {number} defaultAffinity - Affinité initiale (défaut: 0)
 */
export function initRelationship(sessionId: string, npcId: string, npcName: string, defaultAffinity: number = 0): void {
  upsertRelationship(sessionId, {
    npcId,
    npcName,
    affinity: clampAffinity(defaultAffinity),
    lastInteractionBeat: 0,
    notes: [],
  });
}

/**
 * @description Récupère les relations PNJ pertinentes pour un beat donné.
 * Effectue une requête IN pour charger uniquement les PNJ présents dans le beat.
 * @param {string} sessionId - Identifiant de la session
 * @param {string[]} npcIds - Liste des identifiants PNJ à récupérer
 * @returns {NPCRelationship[]} Relations trouvées pour les PNJ demandés
 */
export function getRelationshipsForBeat(sessionId: string, npcIds: string[]): NPCRelationship[] {
  if (npcIds.length === 0) return [];
  const db = getDb();
  // Construction dynamique des placeholders pour la clause IN
  const placeholders = npcIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT * FROM npc_relationships WHERE session_id = ? AND npc_id IN (${placeholders})`
  ).all(sessionId, ...npcIds) as any[];

  return rows.map(row => ({
    npcId: row.npc_id,
    npcName: row.npc_name,
    affinity: row.affinity,
    lastInteractionBeat: row.last_interaction_beat,
    notes: JSON.parse(row.notes_json),
  }));
}
