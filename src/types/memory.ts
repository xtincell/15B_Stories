/**
 * @module memory
 *
 * Types pour le système de mémoire à trois couches de KinChat.
 *
 * Le système de mémoire est inspiré de la mémoire humaine :
 *  - **Persistante** : journal d'actions et résumés (ce qui s'est passé)
 *  - **Documentaire** : contenu du livre-jeu (le monde et ses règles)
 *  - **Fonctionnelle** : contraintes et rythme (comment jouer maintenant)
 *
 * Ces couches sont assemblées en un {@link AssembledContext} unique
 * qui alimente le prompt système du LLM.
 */

import type { StatName } from './game.js';
import type { DiceResult, StateChange } from './llm.js';

// ── Journal d'Actions ──

/**
 * Entrée unitaire dans le journal d'actions.
 * Représente un tour de jeu complet avec le choix du joueur,
 * le résultat de dé éventuel et les changements d'état appliqués.
 */
export interface ActionEntry {
  /** Identifiant unique de l'entrée */
  id: string;
  /** Référence vers la session de jeu */
  sessionId: string;
  /** Numéro séquentiel du tour dans la session */
  turnNumber: number;
  /** Numéro du beat narratif lors de cette action */
  beat: number;
  /** Numéro de la scène au sein du beat */
  scene: number;
  /** Identifiant du choix sélectionné par le joueur */
  choiceId: string;
  /** Texte descriptif du choix (pour affichage dans l'historique) */
  choiceText: string;
  /** Statistique cardinale principalement sollicitée par ce choix */
  dominantStat: StatName;
  /** Résultat du jet de dé, absent si aucun jet n'était requis */
  diceResult?: DiceResult;
  /** Mutations d'état déclenchées par ce tour */
  stateChanges: StateChange[];
  /** Texte de narration généré par le LLM pour ce tour */
  narrationText: string;
  /** Horodatage ISO de l'action */
  timestamp: string;
}

// ── Résumés ──

/** Type de résumé : par tour individuel ou par beat complet */
export type SummaryType = 'turn' | 'beat';

/**
 * Résumé condensé d'une portion de l'histoire.
 * Utilisé pour comprimer la mémoire persistante sans perdre les moments clés.
 */
export interface ActionSummary {
  /** Identifiant unique du résumé */
  id: string;
  /** Référence vers la session de jeu */
  sessionId: string;
  /** Granularité du résumé : tour unique ou beat entier */
  type: SummaryType;
  /** Numéro du beat couvert par ce résumé */
  beatNumber: number;
  /** Dernier tour inclus dans ce résumé */
  upToTurn: number;
  /** Texte du résumé (un paragraphe) */
  summaryText: string;
  /** Date de création du résumé */
  createdAt: string;
}

// ── Contexte Assemblé (envoyé au LLM) ──

/**
 * Instantané de la mémoire persistante pour un appel LLM donné.
 * Contient les données dynamiques issues de la partie en cours.
 */
export interface PersistentMemorySnapshot {
  /** Derniers N tours en détail complet (fenêtre glissante) */
  recentActions: ActionEntry[];
  /** Un paragraphe de résumé par beat complété */
  beatSummaries: ActionSummary[];
  /** Flags du monde : décisions passées ayant des conséquences futures */
  worldFlags: Record<string, boolean | string | number>;
}

/**
 * Contexte documentaire : données statiques issues du livre-jeu.
 * Ne change pas au fil de la partie, seulement selon le beat courant.
 */
export interface DocumentaryMemoryContext {
  /** Vue d'ensemble du monde (description globale) */
  worldOverview: string;
  /** Contenu détaillé du beat narratif actuel */
  currentBeatContent: {
    /** Nom affiché du beat */
    name: string;
    /** Numéro du beat (1-15) */
    number: number;
    /** Objectif narratif que le MJ doit atteindre */
    narrativeGoal: string;
    /** Instructions secrètes pour le MJ */
    gmInstructions: string;
    /** Éléments que le MJ ne doit jamais introduire */
    forbiddenElements: string[];
    /** Condition à remplir pour passer au beat suivant */
    transitionCondition: string;
  };
  /** Fragments de lore pertinents pour le beat courant, tronqués au budget de tokens */
  relevantLore: string[];
  /** Profils des PNJ actifs dans la scène, enrichis avec l'affinité dynamique */
  activeNpcProfiles: {
    id: string;
    name: string;
    title: string;
    personality: string;
    motivations: string;
    /** Affinité courante envers le joueur (-10 à +10) */
    currentAffinity: number;
    /** Rôle spécifique du PNJ dans ce beat */
    beatRole: string;
  }[];
  /** Descriptions des lieux pertinents (réservé pour usage futur) */
  relevantLocations: string[];
}

/**
 * Contexte fonctionnel : règles, contraintes et état du rythme narratif.
 * Guide le LLM sur « comment » jouer ce tour précis.
 */
export interface FunctionalMemoryContext {
  /** Descriptions des 4 stats cardinales (domaine d'action) */
  statDefinitions: Record<StatName, string>;
  /** Classe de difficulté de base pour ce beat */
  currentDCBase: number;
  /** Contraintes narratives imposées par les instructions du MJ */
  beatConstraints: string;
  /** Rappels des décisions passées ayant des répercussions sur la scène actuelle */
  consequenceReminders: string[];
  /** État du rythme narratif pour calibrer la tension et l'urgence */
  pacingState: {
    /** Direction de la courbe de tension (montante, descendante, etc.) */
    tensionCurve: string;
    /** Tonalité émotionnelle dominante */
    emotionalTone: string;
    /** Niveau d'escalation de la scène (0.0 = calme, 1.0 = paroxysme) */
    sceneEscalation: number;
    /** Descriptions des checkpoints narratifs non encore atteints */
    checkpointsRemaining: string[];
    /** Nombre de tours déjà joués dans ce beat */
    turnsInBeat: number;
    /** Nombre maximum de tours avant progression forcée */
    maxTurns: number;
  };
}

/**
 * Contexte assemblé complet, prêt à être transformé en prompt système.
 * Regroupe les trois couches de mémoire et les métadonnées du livre.
 */
export interface AssembledContext {
  /** Mémoire persistante : historique dynamique de la partie */
  persistent: PersistentMemorySnapshot;
  /** Mémoire documentaire : contenu statique du livre-jeu */
  documentary: DocumentaryMemoryContext;
  /** Mémoire fonctionnelle : règles et rythme */
  functional: FunctionalMemoryContext;
  /** Métadonnées du livre-jeu (voix d'auteur, noms de stats, etc.) */
  bookMeta?: import('./game.js').GameBookMeta;
}

// ── Budget de Tokens ──

/**
 * Répartition du budget de tokens pour un appel LLM.
 * Permet de vérifier qu'on ne dépasse pas la fenêtre de contexte du modèle.
 */
export interface TokenBudget {
  /** Budget total disponible (fenêtre de contexte du modèle) */
  total: number;
  /** Tokens alloués au prompt système */
  systemPrompt: number;
  /** Tokens alloués à l'historique de conversation */
  history: number;
  /** Tokens réservés pour la réponse du modèle */
  response: number;
  /** Tokens effectivement consommés */
  used: number;
  /** Tokens restants disponibles */
  remaining: number;
}
