/**
 * @module stats
 * @description Utilitaires de gestion des statistiques du personnage.
 *
 * Ce module fournit les fonctions de calcul de modificateurs, de validation
 * des blocs de stats et de clamping des valeurs dans leurs plages légales.
 * Les quatre stats internes (ubuntu, maat, sankofa, biso) ont chacune une
 * plage de 1 à 10, pour un total obligatoire de 20.
 */

import type { StatBlock, StatName } from '../types/game.js';

/**
 * Calcule le modificateur pour une valeur de stat.
 *
 * La formule est linéaire : valeur - 5. Ainsi une stat de 5 donne
 * un modificateur neutre (0), tandis que 1 donne -4 et 10 donne +5.
 *
 * @param statValue - Valeur brute de la statistique (1 à 10)
 * @returns Le modificateur calculé (entre -4 et +5)
 */
export function getModifier(statValue: number): number {
  return statValue - 5;
}

/**
 * Récupère le modificateur d'une stat spécifique depuis un bloc de statistiques.
 *
 * @param stats - Bloc complet des statistiques du personnage
 * @param stat - Nom de la statistique à consulter
 * @returns Le modificateur calculé pour cette stat
 */
export function getStatModifier(stats: StatBlock, stat: StatName): number {
  return getModifier(stats[stat]);
}

/**
 * Valide qu'un bloc de statistiques respecte les contraintes du système de jeu.
 *
 * Contraintes vérifiées :
 * - Le total des 4 stats doit être exactement 20
 * - Chaque stat doit être un entier entre 1 et 10
 *
 * @param stats - Bloc de statistiques à valider
 * @returns Un objet contenant un booléen de validité et la liste des erreurs détectées
 */
export function validateStatBlock(stats: StatBlock): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const total = stats.ubuntu + stats.maat + stats.sankofa + stats.biso;

  if (total !== 20) {
    errors.push(`Stat total must be 20, got ${total}`);
  }

  for (const [name, value] of Object.entries(stats)) {
    if (value < 1 || value > 10) {
      errors.push(`${name} must be between 1 and 10, got ${value}`);
    }
    if (!Number.isInteger(value)) {
      errors.push(`${name} must be an integer, got ${value}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Restreint une valeur de stat à la plage légale [1, 10].
 *
 * Arrondit d'abord à l'entier le plus proche, puis clamp entre 1 et 10.
 *
 * @param value - Valeur brute à contraindre
 * @returns La valeur arrondie et contrainte dans la plage [1, 10]
 */
export function clampStat(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

/**
 * Restreint une valeur d'affinité à la plage légale [-10, +10].
 *
 * Utilisé pour les relations avec les PNJ. L'arrondi garantit des valeurs entières.
 *
 * @param value - Valeur brute d'affinité à contraindre
 * @returns La valeur arrondie et contrainte dans la plage [-10, +10]
 */
export function clampAffinity(value: number): number {
  return Math.max(-10, Math.min(10, Math.round(value)));
}
