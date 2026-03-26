/**
 * @module npc-manager
 * @description Gestion des personnages non-joueurs (PNJ) et de leurs relations.
 *
 * Ce module assure l'initialisation des relations PNJ en début de partie
 * et la récupération des PNJ pertinents pour un beat donné. Il sert de
 * couche d'abstraction entre la définition statique des PNJ (dans le livre)
 * et leur état dynamique (affinité, historique) en session.
 */

import { loadGameBook } from '../memory/documentary/loader.js';
import { initRelationship, getRelationshipsForBeat } from '../memory/persistent/npc-state.js';
import type { NPCRelationship } from '../types/game.js';

/**
 * Initialise les relations avec tous les PNJ pour une nouvelle session de jeu.
 *
 * Parcourt tous les PNJ définis dans le livre et crée une entrée de relation
 * en base avec leur affinité par défaut. Doit être appelé une seule fois
 * au démarrage d'une nouvelle partie.
 *
 * @param sessionId - Identifiant unique de la session de jeu
 * @param bookId - Identifiant du livre-jeu contenant les définitions de PNJ
 */
export function initAllRelationships(sessionId: string, bookId: string): void {
  const book = loadGameBook(bookId);
  for (const [npcId, npc] of book.npcs) {
    initRelationship(sessionId, npcId, npc.name, npc.defaultAffinity);
  }
}

/**
 * Récupère les relations PNJ pertinentes pour le beat courant.
 *
 * Seuls les PNJ référencés dans le champ `keyNpcIds` du beat sont retournés,
 * afin de ne fournir au LLM que les personnages actifs dans la scène.
 *
 * @param sessionId - Identifiant unique de la session de jeu
 * @param bookId - Identifiant du livre-jeu
 * @param beatNumber - Numéro du beat courant (1 à 15)
 * @returns Tableau des relations PNJ actives pour ce beat (peut être vide si le beat est introuvable)
 */
export function getActiveNpcRelationships(
  sessionId: string,
  bookId: string,
  beatNumber: number,
): NPCRelationship[] {
  const book = loadGameBook(bookId);
  const beat = book.beats.find(b => b.number === beatNumber);
  if (!beat) return [];

  return getRelationshipsForBeat(sessionId, beat.keyNpcIds);
}
