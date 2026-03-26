/**
 * @module game
 *
 * Types fondamentaux du jeu KinChat.
 *
 * Ce module définit toutes les structures de données centrales :
 * personnage, session, beats narratifs, PNJ, archétypes, et
 * métadonnées des livres-jeux. Ces types sont utilisés par
 * l'ensemble de l'application (moteur, mémoire, prompts, API).
 *
 * Le système de stats repose sur 4 axes cardinaux inspirés de
 * philosophies africaines : Ubuntu, Maât, Sankofa et Biso.
 */

/**
 * Bloc de statistiques du personnage.
 * Chaque stat représente un axe de valeurs cardinales (échelle 1-10).
 */
export interface StatBlock {
  /** Ubuntu (Le Lien) : communauté, empathie, diplomatie */
  ubuntu: number;
  /** Maât (La Balance) : vérité, justice, investigation */
  maat: number;
  /** Sankofa (La Mémoire) : tradition, ancêtres, rituels */
  sankofa: number;
  /** Biso (L'Étincelle) : innovation, audace, action directe */
  biso: number;
}

/** Nom d'une des 4 statistiques cardinales */
export type StatName = keyof StatBlock;

/** Liste ordonnée des noms de statistiques */
export const STAT_NAMES: StatName[] = ['ubuntu', 'maat', 'sankofa', 'biso'];

/**
 * Descriptions détaillées des 4 stats cardinales.
 * Chaque stat a une tension naturelle avec une autre stat opposée,
 * créant des dilemmes narratifs intéressants.
 */
export const STAT_DESCRIPTIONS: Record<StatName, { name: string; subtitle: string; axis: string; domain: string; tension: StatName }> = {
  ubuntu:  { name: 'Ubuntu',  subtitle: 'Le Lien',      axis: 'Communauté / Empathie',    domain: 'Diplomatie, soin, ralliement, sacrifice',            tension: 'maat' },
  maat:    { name: 'Maât',    subtitle: 'La Balance',    axis: 'Vérité / Justice',         domain: 'Investigation, jugement, dénonciation, résistance',  tension: 'ubuntu' },
  sankofa: { name: 'Sankofa', subtitle: 'La Mémoire',    axis: 'Tradition / Ancêtres',     domain: 'Rituels, esprits, connaissance ancestrale',           tension: 'biso' },
  biso:    { name: 'Biso',    subtitle: "L'Étincelle",   axis: 'Innovation / Audace',      domain: 'Action directe, combat, improvisation, invention',   tension: 'sankofa' },
};

// ── Traits de Personnalité ──

/**
 * Trait de personnalité du joueur.
 * Influence les dialogues, les réactions des PNJ et les choix proposés.
 */
export type PersonalityTrait = 'courageux' | 'prudent' | 'curieux' | 'protecteur' | 'rebelle' | 'mystique';

/**
 * Définitions complètes des traits de personnalité disponibles.
 * Le champ `narrativeHint` est injecté dans le prompt pour guider le LLM.
 */
export const PERSONALITY_TRAITS: Record<PersonalityTrait, { label: string; emoji: string; description: string; narrativeHint: string }> = {
  courageux:   { label: 'Courageux',   emoji: '🦁', description: 'Fonce tête baissée, inspire les autres',           narrativeHint: "Le personnage affronte le danger sans hésiter et galvanise ses alliés par sa bravoure. Il prend des risques là où les autres reculent." },
  prudent:     { label: 'Prudent',     emoji: '🦉', description: 'Observe, analyse, puis agit avec précision',        narrativeHint: "Le personnage préfère observer et comprendre avant d'agir. Il repère les détails que les autres manquent et anticipe les conséquences." },
  curieux:     { label: 'Curieux',     emoji: '🔮', description: 'Explore tout, pose mille questions',                narrativeHint: "Le personnage est fasciné par le monde et ne peut s'empêcher d'explorer, de toucher, de questionner. Sa curiosité le mène vers des découvertes inattendues." },
  protecteur:  { label: 'Protecteur',  emoji: '🛡️', description: 'Protège les siens, même au prix de sa sécurité',   narrativeHint: "Le personnage place toujours les autres avant lui-même. Il se sacrifie naturellement pour protéger les plus vulnérables." },
  rebelle:     { label: 'Rebelle',     emoji: '⚡', description: "Défie l'autorité, trace son propre chemin",          narrativeHint: "Le personnage remet en question les règles établies et cherche toujours une voie non-conventionnelle. Il déstabilise l'ordre en place." },
  mystique:    { label: 'Mystique',    emoji: '✨', description: "Connecté aux esprits, guidé par l'intuition",       narrativeHint: "Le personnage ressent les courants invisibles du monde et fait confiance à son intuition plutôt qu'à la logique. Les esprits lui parlent plus volontiers." },
};

/** Liste ordonnée des traits de personnalité disponibles */
export const PERSONALITY_TRAIT_NAMES: PersonalityTrait[] = ['courageux', 'prudent', 'curieux', 'protecteur', 'rebelle', 'mystique'];

// ── Genre grammatical ──

/** Genre grammatical du personnage, utilisé pour les accords dans la narration */
export type Gender = 'masculin' | 'feminin' | 'neutre';

// ── Mode de jeu ──

/** Mode de jeu : normal (rythme libre) ou rapide (un beat par tour) */
export type GameMode = 'normal' | 'rapide';

/** Descriptions des modes de jeu pour l'interface utilisateur */
export const GAME_MODES: Record<GameMode, { label: string; description: string }> = {
  normal: { label: 'Aventure Complète', description: "L'histoire se déploie à son rythme naturel" },
  rapide: { label: 'Histoire Rapide',   description: 'Un beat par tour — l\'essentiel en 15 tours' },
};

/** Total de points de stat à répartir lors de la création du personnage */
export const STAT_TOTAL = 20;
/** Valeur minimale d'une statistique */
export const STAT_MIN = 1;
/** Valeur maximale d'une statistique */
export const STAT_MAX = 10;

/**
 * Personnage joueur avec toutes ses caractéristiques.
 * Créé lors de l'écran de création et mis à jour au fil de la partie.
 */
export interface Character {
  /** Identifiant unique du personnage */
  id: string;
  /** Nom choisi par le joueur */
  name: string;
  /** Nom affiché de l'archétype (ex : 'Guerrier Nyama') */
  archetype: string;
  /** Identifiant technique de l'archétype */
  archetypeId: string;
  /** Genre grammatical pour les accords dans la narration */
  gender: Gender;
  /** Trait de personnalité influençant la narration et les choix */
  personality: PersonalityTrait;
  /** Histoire personnelle du personnage */
  backstory: string;
  /** Bloc de statistiques cardinales */
  stats: StatBlock;
  /** Points de vie actuels */
  hp: number;
  /** Points de vie maximum */
  maxHp: number;
  /** Objets possédés par le personnage */
  inventory: InventoryItem[];
  /** Date de création du personnage */
  createdAt: string;
}

/**
 * Objet dans l'inventaire du personnage.
 * Peut modifier les stats et être utilisable en jeu.
 */
export interface InventoryItem {
  /** Identifiant unique de l'objet */
  id: string;
  /** Nom affiché de l'objet */
  name: string;
  /** Description narrative de l'objet */
  description: string;
  /** Bonus/malus de stats conférés par cet objet */
  statModifiers?: Partial<StatBlock>;
  /** Indique si l'objet peut être activement utilisé par le joueur */
  usable: boolean;
}

/**
 * Relation entre le personnage joueur et un PNJ.
 * L'affinité évolue dynamiquement selon les choix du joueur.
 */
export interface NPCRelationship {
  /** Identifiant du PNJ */
  npcId: string;
  /** Nom affiché du PNJ */
  npcName: string;
  /** Score d'affinité : de -10 (hostile) à +10 (allié fidèle) */
  affinity: number;
  /** Dernier beat où une interaction a eu lieu */
  lastInteractionBeat: number;
  /** Notes narratives sur l'historique de la relation */
  notes: string[];
}

/** Statut de la session : en cours ou terminée */
export type SessionStatus = 'in_progress' | 'completed';

/**
 * Session de jeu en cours ou terminée.
 * Contient tout l'état persistant de la partie.
 */
export interface GameSession {
  /** Identifiant unique de la session */
  id: string;
  /** Référence vers le personnage joué */
  characterId: string;
  /** Identifiant du livre-jeu utilisé */
  bookId: string;
  /** Mode de jeu choisi (normal ou rapide) */
  gameMode: GameMode;
  /** Beat narratif courant dans la structure en 15 beats (1-15) */
  currentBeat: number;
  /** Numéro de scène au sein du beat courant */
  currentScene: number;
  /** Nombre total de tours joués dans cette session */
  turnCount: number;
  /** Flags du monde : mémorise les décisions ayant des conséquences futures */
  worldFlags: Record<string, boolean | string | number>;
  /** Relations du joueur avec les PNJ rencontrés */
  relationships: NPCRelationship[];
  /** Statut courant de la session */
  status: SessionStatus;
  /** Date de fin de la partie (si terminée) */
  completedAt?: string;
  /** Date de création de la session */
  createdAt: string;
  /** Date de dernière mise à jour */
  updatedAt: string;
}

/** Direction de la courbe de tension narrative */
export type TensionCurve = 'rising' | 'falling' | 'plateau' | 'climax';

/** Tonalité émotionnelle dominante d'une scène */
export type EmotionalTone = 'wonder' | 'dread' | 'hope' | 'grief' | 'triumph' | 'tension' | 'serenity' | 'rage';

/**
 * Point de passage narratif à atteindre dans un beat.
 * Le LLM doit accomplir ces checkpoints avant la transition.
 */
export interface NarrativeCheckpoint {
  /** Identifiant unique du checkpoint */
  id: string;
  /** Description de ce qui doit être accompli */
  description: string;
  /** Vrai si le checkpoint a été atteint */
  met: boolean;
}

/**
 * État du rythme narratif pour un beat donné.
 * Contrôle la tension, l'urgence et la progression de l'histoire.
 */
export interface BeatPacing {
  /** Direction actuelle de la courbe de tension */
  tensionCurve: TensionCurve;
  /** Tonalité émotionnelle que le LLM doit maintenir */
  emotionalTone: EmotionalTone;
  /** Liste des checkpoints narratifs à accomplir */
  narrativeCheckpoints: NarrativeCheckpoint[];
  /** Niveau d'escalation : 0.0 (début tranquille) à 1.0 (conclusion urgente) */
  sceneEscalation: number;
  /** Nombre max de tours avant progression forcée au beat suivant */
  maxTurnsBeforeForceProgress: number;
  /** Nombre de tours déjà joués dans ce beat */
  turnsInBeat: number;
}

/**
 * Définition d'un beat narratif dans la structure en 15 beats.
 * Chaque beat correspond à un moment clé du récit (Save the Cat).
 */
export interface BeatDefinition {
  /** Numéro du beat dans la séquence (1-15) */
  number: number;
  /** Nom du beat (ex : 'Opening Image', 'Catalyst') */
  name: string;
  /** Identifiant URL-friendly */
  slug: string;
  /** Description du beat pour les auteurs */
  description: string;
  /** Nombre minimum de scènes avant de pouvoir quitter ce beat */
  minScenes: number;
  /** Nombre maximum de scènes conseillé */
  maxScenes: number;
  /** Classe de difficulté de base pour les jets dans ce beat */
  dcBase: number;
  /** Objectif narratif que le MJ doit atteindre */
  narrativeGoal: string;
  /** Condition à remplir pour déclencher la transition au beat suivant */
  transitionCondition: string;
  /** IDs des PNJ clés impliqués dans ce beat */
  keyNpcIds: string[];
  /** IDs des lieux pertinents pour ce beat */
  locationIds: string[];
  /** Clés de lore à charger pour ce beat */
  loreKeys: string[];
  /** Instructions secrètes pour le MJ (non visibles par le joueur) */
  gmInstructions: string;
  /** Éléments que le MJ ne doit jamais introduire dans ce beat */
  forbiddenElements: string[];
  /** Tonalités émotionnelles suggérées pour ce beat */
  suggestedMoodTags: EmotionalTone[];
  /** Configuration initiale du rythme (sans les champs dynamiques) */
  initialPacing: Omit<BeatPacing, 'turnsInBeat' | 'sceneEscalation'>;
}

/**
 * Profil complet d'un personnage non-joueur (PNJ).
 * Défini dans le livre-jeu, enrichi dynamiquement par l'affinité.
 */
export interface NPCProfile {
  /** Identifiant unique du PNJ */
  id: string;
  /** Nom complet du PNJ */
  name: string;
  /** Titre ou fonction du PNJ (ex : 'Chef du village') */
  title: string;
  /** Description de la personnalité pour guider le LLM */
  personality: string;
  /** Motivations profondes du PNJ */
  motivations: string;
  /** Affinité de départ envers le joueur */
  defaultAffinity: number;
  /** Rôle du PNJ dans chaque beat (numéro de beat -> description du rôle) */
  beatRoles: Record<number, string>;
}

/**
 * Archétype de personnage proposé lors de la création.
 * Fournit des stats suggérées et un point de départ narratif.
 */
export interface Archetype {
  /** Identifiant unique de l'archétype */
  id: string;
  /** Nom affiché de l'archétype */
  name: string;
  /** Description pour aider le joueur à choisir */
  description: string;
  /** Répartition de stats recommandée */
  suggestedStats: StatBlock;
  /** Objets de départ offerts par cet archétype */
  startingItems: string[];
  /** Accroche narrative pour le backstory */
  backstoryHook: string;
}

/**
 * Métadonnées d'un livre-jeu.
 *
 * Chaque livre-jeu est un univers narratif complet avec ses propres
 * noms de stats, sa voix d'auteur, ses archétypes et son thème visuel.
 * Ces métadonnées sont chargées au démarrage et injectées dans le prompt.
 */
export interface GameBookMeta {
  // ── Identité du livre ──
  /** Identifiant unique du livre (ex : 'kinshasa-2087') */
  id: string;
  /** Nom complet du livre */
  name: string;
  /** Version du livre (semver) */
  version: string;
  /** Description courte pour le catalogue */
  description: string;
  /** Points de vie maximum pour les personnages de ce livre */
  maxHp: number;

  // ── Affichage ──
  /** Nom de l'auteur du livre */
  author?: string;
  /** Code langue (ex : 'fr') */
  language?: string;
  /** Sous-titre optionnel */
  subtitle?: string;
  /** Accroche marketing courte */
  tagline?: string;
  /** Symbole/emoji représentant le livre dans le catalogue */
  iconSymbol?: string;
  /** Tags de classification (genres, thèmes) */
  tags?: string[];

  // ── Stats : 4 axes fixes renommés par livre ──
  /** Noms personnalisés des 4 stats pour ce livre */
  statNames: Record<StatName, string>;
  /** Descriptions enrichies des stats (sous-titre et axe) */
  statDescriptions?: Record<StatName, { subtitle: string; axis: string }>;

  // ── Accords grammaticaux des archétypes et personnalités ──
  /** Déclinaisons genrées des noms d'archétypes (archétype -> genre -> nom) */
  archetypeGenderMaps?: Record<string, Record<string, string>>;
  /** Déclinaisons genrées des traits de personnalité */
  personalityGenderMaps?: Record<string, Record<string, string>>;
  /** Descriptions des archétypes pour l'écran de création */
  archetypeDescriptions?: Record<string, string>;

  // ── Chargement dynamique du lore ──
  /** Manifeste des fichiers de lore à charger */
  loreManifest?: { files: string[]; locationsDir?: string };

  // ── Thème visuel ──
  /** Configuration du thème CSS spécifique au livre */
  theme?: { cssFile?: string };

  // ── Voix d'auteur : personnalité narrative injectée dans le prompt ──
  /**
   * Personnalité narrative du MJ pour ce livre.
   * Permet de donner une voix unique à chaque livre-jeu.
   */
  authorVoice?: {
    /** Identité du MJ : "Tu es [nom], auteur(e) de [genre]..." */
    identity: string;
    /** Description du style d'écriture */
    style: string;
    /** Auteurs et oeuvres qui influencent la voix narrative */
    influences: string;
    /** Forces narratives spécifiques de cet auteur */
    strengths: string;
    /** Public cible et ses attentes */
    audience: string;
    /** Directives de ton et registre */
    tone: string;
    /** Ce que cet auteur ne fait JAMAIS */
    avoidances: string;
  };

  // ── Messages de chargement (côté client) ──
  /**
   * Messages affichés pendant les temps de chargement.
   * Personnalisés par livre pour maintenir l'immersion.
   */
  loadingMessages?: {
    /** Messages d'ambiance pendant la génération des tours */
    flavors: string[];
    /** Conseils de jeu affichés en overlay */
    tips: string[];
    /** Phases de l'overlay de chargement avec progression */
    overlayPhases: { title: string; sub: string; progress: number }[];
  };
}
