import type { StatName } from './game.js';
import type { DiceResult, StateChange } from './llm.js';

// ── Action Journal ──

export interface ActionEntry {
  id: string;
  sessionId: string;
  turnNumber: number;
  beat: number;
  scene: number;
  choiceId: string;
  choiceText: string;
  dominantStat: StatName;
  diceResult?: DiceResult;
  stateChanges: StateChange[];
  narrationText: string;
  timestamp: string;
}

// ── Summaries ──

export type SummaryType = 'turn' | 'beat';

export interface ActionSummary {
  id: string;
  sessionId: string;
  type: SummaryType;
  beatNumber: number;
  upToTurn: number;
  summaryText: string;
  createdAt: string;
}

// ── Assembled Context (what gets sent to the LLM) ──

export interface PersistentMemorySnapshot {
  recentActions: ActionEntry[];       // last N turns in full detail
  beatSummaries: ActionSummary[];     // 1 paragraph per completed beat
  worldFlags: Record<string, boolean | string | number>;
}

export interface DocumentaryMemoryContext {
  worldOverview: string;
  currentBeatContent: {
    name: string;
    number: number;
    narrativeGoal: string;
    gmInstructions: string;
    forbiddenElements: string[];
    transitionCondition: string;
  };
  relevantLore: string[];
  activeNpcProfiles: {
    id: string;
    name: string;
    title: string;
    personality: string;
    motivations: string;
    currentAffinity: number;
    beatRole: string;
  }[];
  relevantLocations: string[];
}

export interface FunctionalMemoryContext {
  statDefinitions: Record<StatName, string>;
  currentDCBase: number;
  beatConstraints: string;
  consequenceReminders: string[];     // past decisions relevant now
  pacingState: {
    tensionCurve: string;
    emotionalTone: string;
    sceneEscalation: number;
    checkpointsRemaining: string[];
    turnsInBeat: number;
    maxTurns: number;
  };
}

export interface AssembledContext {
  persistent: PersistentMemorySnapshot;
  documentary: DocumentaryMemoryContext;
  functional: FunctionalMemoryContext;
  bookMeta?: import('./game.js').GameBookMeta;
}

// ── Token Budget ──

export interface TokenBudget {
  total: number;
  systemPrompt: number;
  history: number;
  response: number;
  used: number;
  remaining: number;
}
