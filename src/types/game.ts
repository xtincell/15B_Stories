// Core game types for KinChat

export interface StatBlock {
  ubuntu: number;    // Community/Empathy (1-10)
  maat: number;      // Truth/Justice (1-10)
  sankofa: number;   // Tradition/Ancestors (1-10)
  biso: number;      // Innovation/Audacity (1-10)
}

export type StatName = keyof StatBlock;

export const STAT_NAMES: StatName[] = ['ubuntu', 'maat', 'sankofa', 'biso'];

export const STAT_DESCRIPTIONS: Record<StatName, { name: string; subtitle: string; axis: string; domain: string; tension: StatName }> = {
  ubuntu:  { name: 'Ubuntu',  subtitle: 'Le Lien',      axis: 'Communauté / Empathie',    domain: 'Diplomatie, soin, ralliement, sacrifice',            tension: 'maat' },
  maat:    { name: 'Maât',    subtitle: 'La Balance',    axis: 'Vérité / Justice',         domain: 'Investigation, jugement, dénonciation, résistance',  tension: 'ubuntu' },
  sankofa: { name: 'Sankofa', subtitle: 'La Mémoire',    axis: 'Tradition / Ancêtres',     domain: 'Rituels, esprits, connaissance ancestrale',           tension: 'biso' },
  biso:    { name: 'Biso',    subtitle: "L'Étincelle",   axis: 'Innovation / Audace',      domain: 'Action directe, combat, improvisation, invention',   tension: 'sankofa' },
};

// ── Personality Traits ──

export type PersonalityTrait = 'courageux' | 'prudent' | 'curieux' | 'protecteur' | 'rebelle' | 'mystique';

export const PERSONALITY_TRAITS: Record<PersonalityTrait, { label: string; emoji: string; description: string; narrativeHint: string }> = {
  courageux:   { label: 'Courageux',   emoji: '🦁', description: 'Fonce tête baissée, inspire les autres',           narrativeHint: "Le personnage affronte le danger sans hésiter et galvanise ses alliés par sa bravoure. Il prend des risques là où les autres reculent." },
  prudent:     { label: 'Prudent',     emoji: '🦉', description: 'Observe, analyse, puis agit avec précision',        narrativeHint: "Le personnage préfère observer et comprendre avant d'agir. Il repère les détails que les autres manquent et anticipe les conséquences." },
  curieux:     { label: 'Curieux',     emoji: '🔮', description: 'Explore tout, pose mille questions',                narrativeHint: "Le personnage est fasciné par le monde et ne peut s'empêcher d'explorer, de toucher, de questionner. Sa curiosité le mène vers des découvertes inattendues." },
  protecteur:  { label: 'Protecteur',  emoji: '🛡️', description: 'Protège les siens, même au prix de sa sécurité',   narrativeHint: "Le personnage place toujours les autres avant lui-même. Il se sacrifie naturellement pour protéger les plus vulnérables." },
  rebelle:     { label: 'Rebelle',     emoji: '⚡', description: "Défie l'autorité, trace son propre chemin",          narrativeHint: "Le personnage remet en question les règles établies et cherche toujours une voie non-conventionnelle. Il déstabilise l'ordre en place." },
  mystique:    { label: 'Mystique',    emoji: '✨', description: "Connecté aux esprits, guidé par l'intuition",       narrativeHint: "Le personnage ressent les courants invisibles du monde et fait confiance à son intuition plutôt qu'à la logique. Les esprits lui parlent plus volontiers." },
};

export const PERSONALITY_TRAIT_NAMES: PersonalityTrait[] = ['courageux', 'prudent', 'curieux', 'protecteur', 'rebelle', 'mystique'];

// ── Gender ──

export type Gender = 'masculin' | 'feminin' | 'neutre';

// ── Game Mode ──

export type GameMode = 'normal' | 'rapide';

export const GAME_MODES: Record<GameMode, { label: string; description: string }> = {
  normal: { label: 'Aventure Complète', description: "L'histoire se déploie à son rythme naturel" },
  rapide: { label: 'Histoire Rapide',   description: 'Un beat par tour — l\'essentiel en 15 tours' },
};

export const STAT_TOTAL = 20;
export const STAT_MIN = 1;
export const STAT_MAX = 10;

export interface Character {
  id: string;
  name: string;
  archetype: string;
  archetypeId: string;
  gender: Gender;
  personality: PersonalityTrait;
  backstory: string;
  stats: StatBlock;
  hp: number;
  maxHp: number;
  inventory: InventoryItem[];
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string;
  statModifiers?: Partial<StatBlock>;
  usable: boolean;
}

export interface NPCRelationship {
  npcId: string;
  npcName: string;
  affinity: number;       // -10 to +10
  lastInteractionBeat: number;
  notes: string[];
}

export type SessionStatus = 'in_progress' | 'completed';

export interface GameSession {
  id: string;
  characterId: string;
  bookId: string;
  gameMode: GameMode;
  currentBeat: number;    // 1-15
  currentScene: number;
  turnCount: number;
  worldFlags: Record<string, boolean | string | number>;
  relationships: NPCRelationship[];
  status: SessionStatus;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TensionCurve = 'rising' | 'falling' | 'plateau' | 'climax';
export type EmotionalTone = 'wonder' | 'dread' | 'hope' | 'grief' | 'triumph' | 'tension' | 'serenity' | 'rage';

export interface NarrativeCheckpoint {
  id: string;
  description: string;
  met: boolean;
}

export interface BeatPacing {
  tensionCurve: TensionCurve;
  emotionalTone: EmotionalTone;
  narrativeCheckpoints: NarrativeCheckpoint[];
  sceneEscalation: number;  // 0.0 to 1.0
  maxTurnsBeforeForceProgress: number;
  turnsInBeat: number;
}

export interface BeatDefinition {
  number: number;         // 1-15
  name: string;
  slug: string;
  description: string;
  minScenes: number;
  maxScenes: number;
  dcBase: number;
  narrativeGoal: string;
  transitionCondition: string;
  keyNpcIds: string[];
  locationIds: string[];
  loreKeys: string[];
  gmInstructions: string;
  forbiddenElements: string[];
  suggestedMoodTags: EmotionalTone[];
  initialPacing: Omit<BeatPacing, 'turnsInBeat' | 'sceneEscalation'>;
}

export interface NPCProfile {
  id: string;
  name: string;
  title: string;
  personality: string;
  motivations: string;
  defaultAffinity: number;
  beatRoles: Record<number, string>; // beat number -> role in that beat
}

export interface Archetype {
  id: string;
  name: string;
  description: string;
  suggestedStats: StatBlock;
  startingItems: string[];
  backstoryHook: string;
}

export interface GameBookMeta {
  // Core identity
  id: string;
  name: string;
  version: string;
  description: string;
  maxHp: number;

  // Display
  author?: string;
  language?: string;
  subtitle?: string;
  tagline?: string;
  iconSymbol?: string;
  tags?: string[];

  // Stats — 4 fixed axes (ubuntu/maat/sankofa/biso), book-specific naming
  statNames: Record<StatName, string>;
  statDescriptions?: Record<StatName, { subtitle: string; axis: string }>;

  // Archetype & personality gender maps (moved from client hardcode)
  archetypeGenderMaps?: Record<string, Record<string, string>>;
  personalityGenderMaps?: Record<string, Record<string, string>>;
  archetypeDescriptions?: Record<string, string>;

  // Dynamic lore loading
  loreManifest?: { files: string[]; locationsDir?: string };

  // Theme
  theme?: { cssFile?: string };

  // Author personality — injected into system prompt for narrative voice
  authorVoice?: {
    identity: string;      // "Tu es [nom], auteur(e) de [genre]..."
    style: string;         // Description du style d'écriture
    influences: string;    // Auteurs/œuvres qui colorent la voix
    strengths: string;     // Ce dans quoi cet auteur excelle
    audience: string;      // Public cible et attentes
    tone: string;          // Directives de ton spécifiques
    avoidances: string;    // Ce que cet auteur ne fait JAMAIS
  };

  // Per-book loading messages (client-side)
  loadingMessages?: {
    flavors: string[];     // Messages pendant les tours ("Le MJ tisse...")
    tips: string[];        // Tips en overlay ("Chaque valeur influence...")
    overlayPhases: { title: string; sub: string; progress: number }[];
  };
}
