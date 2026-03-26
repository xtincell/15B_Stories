/**
 * @module beat-content
 * @description Module d'accès au contenu narratif des beats.
 * Fournit les définitions de beats, les profils PNJ contextualisés
 * et l'état initial de rythme pour chaque beat du livre de jeu.
 */

import { loadGameBook } from './loader.js';
import type { BeatDefinition, NPCProfile, BeatPacing } from '../../types/game.js';

/**
 * @description Récupère la définition d'un beat spécifique par son numéro.
 * @param {string} bookId - Identifiant unique du livre de jeu
 * @param {number} beatNumber - Numéro du beat recherché (1-15)
 * @returns {BeatDefinition | null} La définition du beat, ou null si introuvable
 */
export function getBeatDefinition(bookId: string, beatNumber: number): BeatDefinition | null {
  const book = loadGameBook(bookId);
  return book.beats.find(b => b.number === beatNumber) ?? null;
}

/**
 * @description Récupère les profils PNJ pertinents pour un beat, enrichis avec l'affinité courante.
 * Combine les données statiques du livre (personnalité, motivations) avec l'état dynamique
 * de la session (affinité actuelle du joueur envers chaque PNJ).
 * @param {string} bookId - Identifiant unique du livre de jeu
 * @param {number} beatNumber - Numéro du beat courant
 * @param {Map<string, number>} currentAffinities - Affinités courantes joueur-PNJ issues de la session
 * @returns {Array} Tableau de profils PNJ enrichis avec leur rôle dans le beat et l'affinité courante
 */
export function getNpcsForBeat(
  bookId: string,
  beatNumber: number,
  currentAffinities: Map<string, number>,
): { id: string; name: string; title: string; personality: string; motivations: string; currentAffinity: number; beatRole: string }[] {
  const book = loadGameBook(bookId);
  const beat = book.beats.find(b => b.number === beatNumber);
  if (!beat) return [];

  const profiles: ReturnType<typeof getNpcsForBeat> = [];

  for (const npcId of beat.keyNpcIds) {
    const npc = book.npcs.get(npcId);
    if (!npc) continue;

    // Utilise le rôle spécifique au beat ou un rôle générique par défaut
    const beatRole = npc.beatRoles[beatNumber] ?? 'présent dans la scène';
    // Privilégie l'affinité dynamique de la session, sinon l'affinité par défaut du PNJ
    const currentAffinity = currentAffinities.get(npcId) ?? npc.defaultAffinity;

    profiles.push({
      id: npc.id,
      name: npc.name,
      title: npc.title,
      personality: npc.personality,
      motivations: npc.motivations,
      currentAffinity,
      beatRole,
    });
  }

  return profiles;
}

/**
 * @description Récupère la liste simplifiée de tous les beats du livre.
 * Utilisé principalement par l'interface de suivi de progression (beat tracker UI).
 * @param {string} bookId - Identifiant unique du livre de jeu
 * @returns {Array<{number: number, name: string, slug: string}>} Liste ordonnée des beats avec numéro, nom et slug
 */
export function getAllBeats(bookId: string): { number: number; name: string; slug: string }[] {
  const book = loadGameBook(bookId);
  return book.beats.map(b => ({
    number: b.number,
    name: b.name,
    slug: b.slug,
  }));
}

/**
 * @description Crée l'état initial de rythme narratif pour un beat.
 * Les checkpoints sont clonés pour éviter de muter la définition statique du livre.
 * L'escalade et le compteur de tours démarrent à zéro.
 * @param {BeatDefinition} beat - Définition du beat source
 * @returns {BeatPacing} État de rythme initialisé, prêt pour le suivi de progression
 */
export function createInitialPacing(beat: BeatDefinition): BeatPacing {
  return {
    tensionCurve: beat.initialPacing.tensionCurve,
    emotionalTone: beat.initialPacing.emotionalTone,
    // Clone profond des checkpoints pour ne pas muter les données du livre
    narrativeCheckpoints: beat.initialPacing.narrativeCheckpoints.map(cp => ({ ...cp })),
    maxTurnsBeforeForceProgress: beat.initialPacing.maxTurnsBeforeForceProgress,
    sceneEscalation: 0.0,
    turnsInBeat: 0,
  };
}
