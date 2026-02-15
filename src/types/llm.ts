import { z } from 'zod';

// ── Zod schemas for LLM structured output ──

export const ChoiceSchema = z.object({
  id: z.string().describe('Unique choice identifier'),
  text: z.string().describe('Choice text shown to the player'),
  dominantStat: z.enum(['ubuntu', 'maat', 'sankofa', 'biso']).describe('Which stat this choice tests'),
  requiresActiveRoll: z.boolean().describe('Whether the player must roll dice'),
  dc: z.number().nullable().optional().describe('Difficulty class if active roll required'),
  riskLevel: z.enum(['low', 'medium', 'high']).describe('How risky this choice is'),
});

export const StateChangeSchema = z.object({
  type: z.enum([
    'stat_change',
    'hp_change',
    'inventory_add',
    'inventory_remove',
    'flag_set',
    'relationship_change',
    'beat_progress',
  ]),
  target: z.string().describe('Stat name, item id, flag key, or npc id'),
  value: z.union([z.number(), z.string(), z.boolean()]),
  reason: z.string().describe('Why this change happened narratively'),
});

export const DiceResultSchema = z.object({
  type: z.enum(['active', 'passive']),
  stat: z.enum(['ubuntu', 'maat', 'sankofa', 'biso']),
  roll: z.number().describe('Raw d20 roll'),
  modifier: z.number().describe('Stat modifier applied'),
  total: z.number().describe('Roll + modifier'),
  dc: z.number().describe('Difficulty class'),
  success: z.boolean(),
  description: z.string().describe('Narrative description of the roll outcome'),
});

export const TurnOutputSchema = z.object({
  narration: z.string().describe('The GM narrative text for this turn'),
  internalThoughts: z.string().describe('GM reasoning, not shown to player'),
  choices: z.array(ChoiceSchema).min(2).max(4).describe('Player choices for next turn'),
  passiveDiceResults: z.array(DiceResultSchema).describe('GM dice rolls that happened behind the scenes'),
  stateChanges: z.array(StateChangeSchema).describe('State mutations to apply'),
  beatProgress: z.object({
    currentBeat: z.number(),
    sceneInBeat: z.number(),
    readyToTransition: z.boolean().describe('Whether the narrative goal of this beat has been met'),
    transitionReason: z.string().nullable().optional().describe('Why transition is ready'),
  }),
  npcPresent: z.array(z.string()).describe('NPC IDs active in this scene'),
  moodTag: z.string().describe('Emotional tone for UI theming'),
  checkpointsMet: z.array(z.string()).nullable().optional().describe('IDs of narrative checkpoints completed this turn'),
});

export type TurnOutput = z.infer<typeof TurnOutputSchema>;
export type Choice = z.infer<typeof ChoiceSchema>;
export type StateChange = z.infer<typeof StateChangeSchema>;
export type DiceResult = z.infer<typeof DiceResultSchema>;

// ── Player input ──

export interface PlayerTurnInput {
  choiceId: string;
  diceRoll?: number;       // client-side roll if active roll was required
  freeText?: string;       // optional custom player text
}

// ── LLM adapter interface ──

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  systemPrompt: string;
  conversationHistory: ConversationMessage[];
  maxTokens: number;
}

/**
 * Callback for streaming: receives text chunks as they arrive.
 */
export type StreamCallback = (chunk: string) => void;

export interface LLMAdapter {
  generateTurn(request: LLMRequest): Promise<TurnOutput>;
  /** Stream the raw LLM response text, then return parsed output. */
  generateTurnStreaming(request: LLMRequest, onChunk: StreamCallback): Promise<TurnOutput>;
  summarize(text: string, instructions: string): Promise<string>;
  /** Flexible generation with configurable max tokens (for book generation, etc.) */
  generate(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string>;
  readonly modelId: string;
  readonly maxContextTokens: number;
}

// ── Character creation LLM output ──

export const CharacterCreationOutputSchema = z.object({
  openingNarration: z.string().describe('The opening scene narration introducing the character'),
  backstoryExpansion: z.string().describe('An expanded backstory woven from the archetype and player name'),
});

export type CharacterCreationOutput = z.infer<typeof CharacterCreationOutputSchema>;
