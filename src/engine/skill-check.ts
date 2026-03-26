/**
 * @module skill-check
 * @description Interface de haut niveau pour les tests de compétence.
 *
 * Ce module expose les fonctions de test actif (le joueur lance), passif
 * (le MJ lance en coulisses) et de formatage des résultats en texte lisible.
 * Il délègue la mécanique de dés au module `dice`.
 */

import type { StatBlock, StatName } from '../types/game.js';
import type { DiceRollRequest, DiceRollResult } from '../types/engine.js';
import { rollDice } from './dice.js';

/**
 * Effectue un test de compétence actif : d20 + modificateur de stat contre un DC.
 *
 * Le joueur voit le résultat du lancer. Supporte les options d'avantage
 * et de désavantage pour moduler la difficulté selon le contexte narratif.
 *
 * @param stats - Bloc de statistiques du personnage
 * @param stat - Nom de la stat utilisée pour le test
 * @param dc - Classe de difficulté à atteindre
 * @param options - Options optionnelles d'avantage/désavantage
 * @returns Résultat détaillé du lancer de dé
 */
export function skillCheck(
  stats: StatBlock,
  stat: StatName,
  dc: number,
  options?: { advantage?: boolean; disadvantage?: boolean },
): DiceRollResult {
  const request: DiceRollRequest = {
    type: 'active',
    stat,
    dc,
    advantage: options?.advantage,
    disadvantage: options?.disadvantage,
  };

  return rollDice(request, stats);
}

/**
 * Effectue un test de compétence passif (le MJ lance en coulisses).
 *
 * Utilisé pour les perceptions automatiques, les intuitions ou les checks
 * que le joueur ne doit pas savoir qu'ils ont lieu.
 *
 * @param stats - Bloc de statistiques du personnage
 * @param stat - Nom de la stat utilisée pour le test
 * @param dc - Classe de difficulté à atteindre
 * @returns Résultat détaillé du lancer de dé
 */
export function passiveCheck(
  stats: StatBlock,
  stat: StatName,
  dc: number,
): DiceRollResult {
  const request: DiceRollRequest = {
    type: 'passive',
    stat,
    dc,
  };

  return rollDice(request, stats);
}

/**
 * Formate un résultat de dé en chaîne lisible pour l'affichage au joueur.
 *
 * Produit un texte du type : "ubuntu: d20(14) +3 = 17 vs DC 12 — Succès"
 * avec gestion des cas critiques (réussite et échec).
 *
 * @param result - Résultat du lancer de dé à formater
 * @param stat - Nom de la stat utilisée, affiché en préfixe
 * @returns Chaîne formatée décrivant le résultat du test
 */
export function formatDiceResult(result: DiceRollResult, stat: StatName): string {
  const modSign = result.modifier >= 0 ? '+' : '';
  let text = `${stat}: d20(${result.roll}) ${modSign}${result.modifier} = ${result.total} vs DC ${result.dc}`;

  if (result.criticalSuccess) {
    text += ' — SUCCÈS CRITIQUE !';
  } else if (result.criticalFailure) {
    text += ' — ÉCHEC CRITIQUE !';
  } else if (result.success) {
    text += ' — Succès';
  } else {
    text += ' — Échec';
  }

  return text;
}
