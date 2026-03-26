/**
 * @module dice
 * @description Système de lancer de dés du moteur de jeu.
 *
 * Implémente un système de résolution basé sur le d20, inspiré des jeux de rôle
 * classiques. Gère les lancers normaux, avec avantage/désavantage, les réussites
 * et échecs critiques, ainsi que le calcul de la difficulté de base par beat.
 */

import type { StatBlock, StatName } from '../types/game.js';
import type { DiceRollRequest, DiceRollResult } from '../types/engine.js';
import { getStatModifier } from './stats.js';

/**
 * Lance un unique dé à 20 faces.
 *
 * @returns Un entier aléatoire entre 1 et 20 inclus
 */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Lance avec avantage : deux d20, on garde le meilleur résultat.
 *
 * @returns Le plus haut des deux lancers
 */
function rollWithAdvantage(): number {
  return Math.max(rollD20(), rollD20());
}

/**
 * Lance avec désavantage : deux d20, on garde le pire résultat.
 *
 * @returns Le plus bas des deux lancers
 */
function rollWithDisadvantage(): number {
  return Math.min(rollD20(), rollD20());
}

/**
 * Effectue un lancer de dé complet avec modificateur de stat et vérification contre le DC.
 *
 * Si avantage et désavantage sont tous les deux actifs, ils s'annulent
 * et un lancer normal est effectué.
 *
 * @param request - Paramètres du lancer (type, stat, DC, avantage/désavantage)
 * @param stats - Bloc de statistiques du personnage pour calculer le modificateur
 * @returns Résultat détaillé du lancer incluant réussite/échec et critiques
 */
export function rollDice(request: DiceRollRequest, stats: StatBlock): DiceRollResult {
  let roll: number;

  // L'avantage et le désavantage simultanés s'annulent mutuellement
  if (request.advantage && !request.disadvantage) {
    roll = rollWithAdvantage();
  } else if (request.disadvantage && !request.advantage) {
    roll = rollWithDisadvantage();
  } else {
    roll = rollD20();
  }

  const modifier = getStatModifier(stats, request.stat);
  const total = roll + modifier;
  const criticalSuccess = roll === 20;
  const criticalFailure = roll === 1;

  // Un 20 naturel réussit toujours, un 1 naturel échoue toujours,
  // indépendamment du modificateur et du DC
  const success = criticalSuccess ? true : criticalFailure ? false : total >= request.dc;

  return {
    roll,
    modifier,
    total,
    dc: request.dc,
    success,
    criticalSuccess,
    criticalFailure,
  };
}

/**
 * Détermine la difficulté de base (DC) en fonction du numéro de beat.
 *
 * La difficulté augmente progressivement pour accompagner la montée en tension
 * narrative de la structure en 15 beats :
 * - Beats 1-3 : DC 8 (tutoriel, mise en place)
 * - Beats 4-6 : DC 10 (modéré, premiers défis)
 * - Beats 7-9 : DC 12 (exigeant, montée en puissance)
 * - Beats 10-12 : DC 14 (difficile, épreuves majeures)
 * - Beats 13-15 : DC 16 (climax, résolution finale)
 *
 * @param beatNumber - Numéro du beat (1 à 15)
 * @returns La difficulté de base correspondante
 */
export function getBaseDC(beatNumber: number): number {
  if (beatNumber <= 3) return 8;
  if (beatNumber <= 6) return 10;
  if (beatNumber <= 9) return 12;
  if (beatNumber <= 12) return 14;
  return 16;
}
