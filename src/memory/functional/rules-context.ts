/**
 * @module rules-context
 * @description Construction du contexte de règles fonctionnelles pour le LLM.
 * Assemble les contraintes de jeu (statistiques, DC, rythme, conséquences)
 * en un objet structuré injecté dans le prompt du LLM à chaque tour.
 * Ce module fait le pont entre la mémoire persistante et les instructions du LLM.
 */

import type { FunctionalMemoryContext } from '../../types/memory.js';
import type { GameSession, Character, BeatPacing } from '../../types/game.js';
import { getBeatDefinition } from '../documentary/beat-content.js';
import { getWorldFlags } from '../persistent/world-state.js';
import { STAT_DESCRIPTIONS } from '../../types/game.js';

/**
 * @description Construit le contexte de mémoire fonctionnelle pour un tour de jeu.
 * Fournit au LLM les règles et contraintes à respecter : définitions des stats,
 * difficulté de base, instructions narratives, rappels de conséquences et état du rythme.
 * @param {GameSession} session - Session de jeu courante
 * @param {Character} character - Personnage du joueur
 * @param {BeatPacing} pacing - État de rythme narratif du beat courant
 * @returns {FunctionalMemoryContext} Contexte structuré pour le prompt LLM
 * @throws {Error} Si le beat courant n'existe pas dans le livre
 */
export function buildRulesContext(
  session: GameSession,
  character: Character,
  pacing: BeatPacing,
): FunctionalMemoryContext {
  const beat = getBeatDefinition(session.bookId, session.currentBeat);
  if (!beat) throw new Error(`Beat ${session.currentBeat} not found`);

  const worldFlags = getWorldFlags(session.id);
  // Transforme les flags monde en rappels lisibles pour guider la cohérence narrative du LLM
  const consequenceReminders = deriveConsequences(worldFlags, session.currentBeat);

  return {
    statDefinitions: {
      ubuntu: STAT_DESCRIPTIONS.ubuntu.domain,
      maat: STAT_DESCRIPTIONS.maat.domain,
      sankofa: STAT_DESCRIPTIONS.sankofa.domain,
      biso: STAT_DESCRIPTIONS.biso.domain,
    },
    currentDCBase: beat.dcBase,
    beatConstraints: beat.gmInstructions,
    consequenceReminders,
    pacingState: {
      tensionCurve: pacing.tensionCurve,
      emotionalTone: pacing.emotionalTone,
      sceneEscalation: pacing.sceneEscalation,
      checkpointsRemaining: pacing.narrativeCheckpoints
        .filter(cp => !cp.met)
        .map(cp => cp.description),
      turnsInBeat: pacing.turnsInBeat,
      maxTurns: pacing.maxTurnsBeforeForceProgress,
    },
  };
}

/**
 * @description Dérive des rappels de conséquences à partir des flags monde.
 * Transforme les flags actifs en phrases lisibles pour que le LLM
 * tienne compte des décisions passées du joueur dans sa narration.
 * @param {Record<string, boolean | string | number>} worldFlags - Drapeaux d'état du monde
 * @param {number} currentBeat - Numéro du beat courant (réservé pour filtrage futur)
 * @returns {string[]} Liste de rappels en langage naturel
 */
function deriveConsequences(
  worldFlags: Record<string, boolean | string | number>,
  currentBeat: number,
): string[] {
  const reminders: string[] = [];

  for (const [key, value] of Object.entries(worldFlags)) {
    // Les flags préfixés par "_" sont internes au moteur et ne concernent pas le LLM
    if (key.startsWith('_')) continue;

    if (typeof value === 'boolean' && value) {
      reminders.push(formatFlagAsReminder(key));
    } else if (typeof value === 'string' && value) {
      reminders.push(`${formatFlagAsReminder(key)} : ${value}`);
    } else if (typeof value === 'number') {
      reminders.push(`${formatFlagAsReminder(key)} : ${value}`);
    }
  }

  return reminders;
}

/**
 * @description Convertit un identifiant de flag (snake_case) en texte lisible (Title Case).
 * @param {string} flag - Nom du flag à formater
 * @returns {string} Texte formaté pour affichage
 */
function formatFlagAsReminder(flag: string): string {
  return flag
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}
