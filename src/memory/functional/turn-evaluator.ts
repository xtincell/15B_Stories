import type { TurnOutput, PlayerTurnInput, Choice } from '../../types/llm.js';
import type { Character, GameSession } from '../../types/game.js';
import { applyStateChanges } from '../../engine/consequences.js';
import { advancePacing, checkBeatTransition } from '../../engine/beat-manager.js';
import { getBeatDefinition } from '../../memory/documentary/beat-content.js';
import { logAction, cacheConversationMessage } from '../../memory/persistent/action-journal.js';
import { updateSession, getSession } from '../../memory/persistent/world-state.js';
import { getCharacter } from '../../memory/persistent/character-state.js';
import { maybeSummarize, summarizeBeat } from '../../memory/persistent/summarizer.js';
import { getDb } from '../../memory/persistent/db.js';
import type { LLMAdapter } from '../../types/llm.js';
import type { DiceRollResult } from '../../types/engine.js';

export interface TurnResult {
  output: TurnOutput;
  diceResult?: DiceRollResult;
  stateLog: { applied: string[]; rejected: string[] };
  beatTransitioned: boolean;
  newBeat?: number;
  /** True when beat 15 is completed — the adventure is over */
  gameCompleted: boolean;
  /** Updated character after state changes applied */
  updatedCharacter: Character;
  /** Updated session after turn processing */
  updatedSession: GameSession;
}

/**
 * Process a turn: validate LLM output, apply state changes, check beat transition.
 * This is the post-LLM processing pipeline.
 *
 * Key optimizations:
 * - All DB writes are wrapped in a single transaction (atomic + faster).
 * - Summarization is fire-and-forget (does NOT block the response).
 * - Updated state is returned directly, eliminating redundant DB reads in the route.
 */
export async function evaluateTurn(
  output: TurnOutput,
  playerInput: PlayerTurnInput,
  previousChoice: Choice | undefined,
  character: Character,
  session: GameSession,
  diceResult: DiceRollResult | undefined,
  summarizer: LLMAdapter,
): Promise<TurnResult> {
  // 1. Validate and clamp LLM output
  const validatedOutput = validateOutput(output, session);

  const turnNumber = session.turnCount + 1;
  let beatTransitioned = false;
  let newBeat: number | undefined;
  let gameCompleted = false;

  // 2. Run ALL synchronous DB operations in a single transaction
  const db = getDb();
  const runTransaction = db.transaction(() => {
    // 2a. Apply state changes (character stats, HP, inventory, flags, relationships)
    const stateLog = applyStateChanges(
      validatedOutput.stateChanges,
      character,
      session.id,
      session.currentBeat,
    );

    // 2b. Update pacing (mark checkpoints, advance escalation, evolve emotional tone)
    // In quick mode, force ALL checkpoints as met so transition is guaranteed
    const isQuick = session.gameMode === 'rapide';
    let effectiveCheckpoints: string[] | undefined = validatedOutput.checkpointsMet ?? undefined;
    if (isQuick) {
      const beatDef = getBeatDefinition(session.bookId, session.currentBeat);
      if (beatDef) {
        effectiveCheckpoints = beatDef.initialPacing.narrativeCheckpoints.map(cp => cp.id);
      }
    }
    advancePacing(
      session.id,
      session.currentBeat,
      session.bookId,
      effectiveCheckpoints,
      validatedOutput.moodTag,
    );

    // 2c. Log action to journal
    logAction({
      sessionId: session.id,
      turnNumber,
      beat: session.currentBeat,
      scene: session.currentScene,
      choiceId: playerInput.choiceId,
      choiceText: previousChoice?.text ?? playerInput.choiceId,
      dominantStat: previousChoice?.dominantStat ?? 'ubuntu',
      diceResult: diceResult ? {
        type: 'active',
        stat: previousChoice?.dominantStat ?? 'ubuntu',
        roll: diceResult.roll,
        modifier: diceResult.modifier,
        total: diceResult.total,
        dc: diceResult.dc,
        success: diceResult.success,
        description: '',
      } : undefined,
      stateChanges: validatedOutput.stateChanges,
      narrationText: validatedOutput.narration,
    });

    // 2d. Cache conversation messages for LLM context
    cacheConversationMessage(session.id, turnNumber, 'user', `Choix: ${playerInput.choiceId}`);
    cacheConversationMessage(session.id, turnNumber, 'assistant', validatedOutput.narration.slice(0, 500));

    // 2e. Check beat transition — ALWAYS check, not just when LLM says ready.
    // This ensures forceProgress kicks in even if the LLM never sets readyToTransition.
    // In quick mode ('rapide'), always force transition — 1 beat per turn.
    const isQuickMode = session.gameMode === 'rapide';
    const llmWantsTransition = isQuickMode || validatedOutput.beatProgress.readyToTransition;
    const transition = checkBeatTransition(
      session.id,
      session.currentBeat,
      session.bookId,
      llmWantsTransition,
      isQuickMode,
    );

    if (transition.canTransition && session.currentBeat < 15) {
      beatTransitioned = true;
      newBeat = transition.nextBeat;

      updateSession(session.id, {
        currentBeat: newBeat,
        currentScene: 1,
        turnCount: turnNumber,
      });
    } else if (transition.canTransition && session.currentBeat >= 15) {
      // Beat 15 completed — the adventure is over
      gameCompleted = true;
      updateSession(session.id, {
        turnCount: turnNumber,
        status: 'completed',
        completedAt: new Date().toISOString(),
      });
    } else {
      updateSession(session.id, {
        turnCount: turnNumber,
        currentScene: session.currentScene + 1,
      });
    }

    return stateLog;
  });

  const stateLog = runTransaction();

  // 3. Read updated state from DB (transaction already committed)
  const updatedSession = getSession(session.id)!;
  const updatedCharacter = getCharacter(session.characterId)!;

  // 4. Fire-and-forget: summarization runs in background, does NOT block the response
  if (beatTransitioned) {
    summarizeBeat(session.id, session.currentBeat, turnNumber, summarizer).catch(err => {
      console.error('[Summarizer] Beat summary failed (non-blocking):', err.message);
    });
  }
  maybeSummarize(session.id, turnNumber, summarizer).catch(err => {
    console.error('[Summarizer] Narrative compression failed (non-blocking):', err.message);
  });

  return {
    output: validatedOutput,
    diceResult,
    stateLog,
    beatTransitioned,
    newBeat,
    gameCompleted,
    updatedCharacter,
    updatedSession,
  };
}

/**
 * Validate and fix LLM output to ensure consistency.
 */
function validateOutput(output: TurnOutput, session: GameSession): TurnOutput {
  if (output.beatProgress.currentBeat !== session.currentBeat) {
    output.beatProgress.currentBeat = session.currentBeat;
  }

  if (output.choices.length < 2) {
    output.choices.push({
      id: 'fallback-observe',
      text: 'Observer la situation attentivement',
      dominantStat: 'maat',
      requiresActiveRoll: false,
      riskLevel: 'low',
    });
  }
  if (output.choices.length > 4) {
    output.choices = output.choices.slice(0, 4);
  }

  return output;
}
