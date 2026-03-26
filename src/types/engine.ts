/**
 * @module engine
 *
 * Types liés au moteur de jeu : résolution des jets de dés
 * et vérification des transitions entre beats narratifs.
 *
 * Le système de dés utilise un d20 classique avec modificateur de stat.
 * Les transitions de beat sont contrôlées par plusieurs conditions
 * narratives qui doivent être remplies avant de progresser.
 */

import type { StatName } from './game.js';

/**
 * Requête de jet de dé soumise au moteur de résolution.
 * Peut être active (le joueur lance) ou passive (le MJ lance en secret).
 */
export interface DiceRollRequest {
  /** Type de jet : 'active' = visible par le joueur, 'passive' = jet secret du MJ */
  type: 'active' | 'passive';
  /** Statistique cardinale utilisée pour le modificateur */
  stat: StatName;
  /** Classe de difficulté à atteindre ou dépasser */
  dc: number;
  /** Si vrai, lance 2d20 et garde le meilleur résultat */
  advantage?: boolean;
  /** Si vrai, lance 2d20 et garde le pire résultat */
  disadvantage?: boolean;
}

/**
 * Résultat d'un jet de dé après résolution complète.
 * Contient le détail du calcul pour l'affichage et le journal d'actions.
 */
export interface DiceRollResult {
  /** Résultat brut du d20 (1-20) */
  roll: number;
  /** Modificateur de stat appliqué (stat - 5) */
  modifier: number;
  /** Total final : roll + modifier */
  total: number;
  /** Classe de difficulté contre laquelle le jet est évalué */
  dc: number;
  /** Vrai si total >= dc */
  success: boolean;
  /** Réussite critique : 20 naturel sur le dé */
  criticalSuccess: boolean;
  /** Échec critique : 1 naturel sur le dé */
  criticalFailure: boolean;
}

/**
 * Résultat de la vérification de transition entre deux beats narratifs.
 * Utilisé par le moteur pour décider si l'histoire peut avancer.
 */
export interface BeatTransitionCheck {
  /** Indique si toutes les conditions de transition sont remplies */
  canTransition: boolean;
  /** Numéro du beat actuel (1-15) */
  currentBeat: number;
  /** Numéro du prochain beat visé */
  nextBeat: number;
  /** Explication textuelle de la décision de transition */
  reason: string;
  /** Vrai si le nombre minimum de scènes pour ce beat est atteint */
  minimumScenesMet: boolean;
  /** Vrai si l'objectif narratif du beat est considéré accompli */
  narrativeGoalMet: boolean;
  /** Vrai si tous les checkpoints narratifs sont complétés */
  checkpointsComplete: boolean;
}
