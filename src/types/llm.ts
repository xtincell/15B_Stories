/**
 * @module llm
 *
 * Types et schémas Zod pour la communication avec le LLM.
 *
 * Ce module définit :
 *  - Les schémas de sortie structurée (validés par Zod) que le LLM doit respecter
 *  - Les types d'entrée du joueur
 *  - L'interface de l'adaptateur LLM (contrat pour les différents fournisseurs)
 *  - Les types pour la création de personnage assistée par LLM
 *
 * Les schémas Zod servent à la fois de validation runtime et de documentation
 * du format JSON attendu dans la réponse du modèle.
 */

import { z } from 'zod';

// ── Schémas Zod pour la sortie structurée du LLM ──

/**
 * Schéma d'un choix proposé au joueur.
 * Chaque tour, le LLM génère 2 à 4 choix avec leurs caractéristiques mécaniques.
 */
export const ChoiceSchema = z.object({
  /** Identifiant unique du choix (ex : 'choice_1') */
  id: z.string().describe('Unique choice identifier'),
  /** Texte du choix affiché au joueur */
  text: z.string().describe('Choice text shown to the player'),
  /** Stat cardinale testée si un jet de dé est requis */
  dominantStat: z.enum(['ubuntu', 'maat', 'sankofa', 'biso']).describe('Which stat this choice tests'),
  /** Indique si le joueur doit lancer les dés */
  requiresActiveRoll: z.boolean().describe('Whether the player must roll dice'),
  /** Classe de difficulté (null si pas de jet actif) */
  dc: z.number().nullable().optional().describe('Difficulty class if active roll required'),
  /** Niveau de risque pour l'indication visuelle dans l'interface */
  riskLevel: z.enum(['low', 'medium', 'high']).describe('How risky this choice is'),
});

/**
 * Schéma d'une mutation d'état déclenchée par la narration.
 * Le LLM indique quels changements appliquer au monde du jeu.
 */
export const StateChangeSchema = z.object({
  /** Type de mutation : modification de stat, PV, inventaire, flag, relation ou progression */
  type: z.enum([
    'stat_change',
    'hp_change',
    'inventory_add',
    'inventory_remove',
    'flag_set',
    'relationship_change',
    'beat_progress',
  ]),
  /** Cible de la mutation : nom de stat, ID d'objet, clé de flag ou ID de PNJ */
  target: z.string().describe('Stat name, item id, flag key, or npc id'),
  /** Valeur de la mutation (nombre, texte ou booléen selon le type) */
  value: z.union([z.number(), z.string(), z.boolean()]),
  /** Justification narrative du changement */
  reason: z.string().describe('Why this change happened narratively'),
});

/**
 * Schéma d'un résultat de jet de dé généré par le LLM.
 * Utilisé pour les jets passifs (secrets) effectués par le MJ.
 */
export const DiceResultSchema = z.object({
  /** Jet actif (joueur) ou passif (MJ en coulisses) */
  type: z.enum(['active', 'passive']),
  /** Stat utilisée pour le modificateur */
  stat: z.enum(['ubuntu', 'maat', 'sankofa', 'biso']),
  /** Résultat brut du d20 */
  roll: z.number().describe('Raw d20 roll'),
  /** Modificateur de stat appliqué */
  modifier: z.number().describe('Stat modifier applied'),
  /** Total : roll + modifier */
  total: z.number().describe('Roll + modifier'),
  /** Classe de difficulté */
  dc: z.number().describe('Difficulty class'),
  /** Succès ou échec */
  success: z.boolean(),
  /** Description narrative du résultat du jet */
  description: z.string().describe('Narrative description of the roll outcome'),
});

/**
 * Schéma principal de la sortie du LLM pour un tour de jeu.
 * Structure complète que le modèle doit produire à chaque interaction.
 */
export const TurnOutputSchema = z.object({
  /** Texte narratif du MJ affiché au joueur */
  narration: z.string().describe('The GM narrative text for this turn'),
  /** Raisonnement interne du MJ (invisible pour le joueur, utile pour le debug) */
  internalThoughts: z.string().describe('GM reasoning, not shown to player'),
  /** Choix proposés au joueur pour le prochain tour (2 à 4) */
  choices: z.array(ChoiceSchema).min(2).max(4).describe('Player choices for next turn'),
  /** Jets de dés passifs effectués en coulisses par le MJ */
  passiveDiceResults: z.array(DiceResultSchema).describe('GM dice rolls that happened behind the scenes'),
  /** Mutations d'état à appliquer après ce tour */
  stateChanges: z.array(StateChangeSchema).describe('State mutations to apply'),
  /** Information de progression dans la structure narrative */
  beatProgress: z.object({
    /** Numéro du beat courant */
    currentBeat: z.number(),
    /** Numéro de scène au sein du beat */
    sceneInBeat: z.number(),
    /** Vrai si l'objectif narratif est atteint et le beat peut se terminer */
    readyToTransition: z.boolean().describe('Whether the narrative goal of this beat has been met'),
    /** Explication de pourquoi la transition est prête */
    transitionReason: z.string().nullable().optional().describe('Why transition is ready'),
  }),
  /** IDs des PNJ présents dans cette scène */
  npcPresent: z.array(z.string()).describe('NPC IDs active in this scene'),
  /** Tag d'ambiance pour le thème visuel de l'interface */
  moodTag: z.string().describe('Emotional tone for UI theming'),
  /** IDs des checkpoints narratifs complétés ce tour (null si aucun) */
  checkpointsMet: z.array(z.string()).nullable().optional().describe('IDs of narrative checkpoints completed this turn'),
});

/** Type inféré de la sortie complète d'un tour */
export type TurnOutput = z.infer<typeof TurnOutputSchema>;
/** Type inféré d'un choix proposé au joueur */
export type Choice = z.infer<typeof ChoiceSchema>;
/** Type inféré d'une mutation d'état */
export type StateChange = z.infer<typeof StateChangeSchema>;
/** Type inféré d'un résultat de jet de dé */
export type DiceResult = z.infer<typeof DiceResultSchema>;

// ── Entrée du joueur ──

/**
 * Données envoyées par le client lorsque le joueur fait un choix.
 */
export interface PlayerTurnInput {
  /** ID du choix sélectionné, ou 'free-text' pour une action libre */
  choiceId: string;
  /** Résultat du jet de dé côté client (si un jet actif était requis) */
  diceRoll?: number;
  /** Texte libre optionnel saisi par le joueur */
  freeText?: string;
}

// ── Interface de l'adaptateur LLM ──

/**
 * Message dans l'historique de conversation entre le joueur et le MJ.
 */
export interface ConversationMessage {
  /** Rôle de l'émetteur : 'user' (joueur) ou 'assistant' (MJ/LLM) */
  role: 'user' | 'assistant';
  /** Contenu textuel du message */
  content: string;
}

/**
 * Requête complète prête à être envoyée à un adaptateur LLM.
 */
export interface LLMRequest {
  /** Prompt système complet (contexte + instructions + templates) */
  systemPrompt: string;
  /** Historique de conversation pour maintenir la cohérence narrative */
  conversationHistory: ConversationMessage[];
  /** Nombre maximum de tokens pour la réponse du modèle */
  maxTokens: number;
}

/**
 * Callback de streaming : reçoit les fragments de texte au fur et à mesure.
 * @param chunk - Fragment de texte reçu du LLM
 */
export type StreamCallback = (chunk: string) => void;

/**
 * Contrat d'interface pour les adaptateurs LLM (Anthropic, OpenAI, etc.).
 * Chaque fournisseur implémente cette interface pour être interchangeable.
 */
export interface LLMAdapter {
  /**
   * Génère la sortie structurée d'un tour de jeu.
   * @param request - Requête LLM complète
   * @returns Sortie structurée validée par Zod
   */
  generateTurn(request: LLMRequest): Promise<TurnOutput>;
  /**
   * Génère un tour en streaming (texte affiché progressivement).
   * @param request - Requête LLM complète
   * @param onChunk - Callback appelé pour chaque fragment de texte reçu
   * @returns Sortie structurée complète une fois le streaming terminé
   */
  generateTurnStreaming(request: LLMRequest, onChunk: StreamCallback): Promise<TurnOutput>;
  /**
   * Résume un texte selon des instructions données.
   * Utilisé pour comprimer l'historique de la mémoire persistante.
   * @param text - Texte à résumer
   * @param instructions - Directives de résumé
   * @returns Texte résumé
   */
  summarize(text: string, instructions: string): Promise<string>;
  /**
   * Génération flexible avec budget de tokens configurable.
   * Utilisé pour la génération de livres-jeux et autres tâches hors-partie.
   * @param systemPrompt - Prompt système
   * @param userPrompt - Prompt utilisateur
   * @param maxTokens - Limite de tokens optionnelle
   * @returns Texte généré
   */
  generate(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string>;
  /** Identifiant du modèle utilisé (ex : 'claude-3-opus') */
  readonly modelId: string;
  /** Taille maximale de la fenêtre de contexte en tokens */
  readonly maxContextTokens: number;
}

// ── Sortie LLM pour la création de personnage ──

/**
 * Schéma de la sortie LLM lors de la création d'un personnage.
 * Le LLM génère une narration d'ouverture et enrichit le backstory.
 */
export const CharacterCreationOutputSchema = z.object({
  /** Narration de la scène d'ouverture présentant le personnage */
  openingNarration: z.string().describe('The opening scene narration introducing the character'),
  /** Backstory enrichi tissé à partir de l'archétype et du nom du joueur */
  backstoryExpansion: z.string().describe('An expanded backstory woven from the archetype and player name'),
});

/** Type inféré de la sortie de création de personnage */
export type CharacterCreationOutput = z.infer<typeof CharacterCreationOutputSchema>;
