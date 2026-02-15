import type { FunctionalMemoryContext } from '../../types/memory.js';
import type { GameSession, Character, BeatPacing } from '../../types/game.js';
import { getBeatDefinition } from '../documentary/beat-content.js';
import { getWorldFlags } from '../persistent/world-state.js';
import { STAT_DESCRIPTIONS } from '../../types/game.js';

/**
 * Build the functional memory context for a turn.
 * This provides the rules and constraints the LLM must follow.
 */
export function buildRulesContext(
  session: GameSession,
  character: Character,
  pacing: BeatPacing,
): FunctionalMemoryContext {
  const beat = getBeatDefinition(session.bookId, session.currentBeat);
  if (!beat) throw new Error(`Beat ${session.currentBeat} not found`);

  const worldFlags = getWorldFlags(session.id);
  const consequenceReminders = deriveConsequences(worldFlags, session.currentBeat);

  return {
    statDefinitions: {
      ubuntu: STAT_DESCRIPTIONS.ubuntu.domain,
      maat: STAT_DESCRIPTIONS.maat.domain,
      sankofa: STAT_DESCRIPTIONS.sankofa.domain,
      biso: STAT_DESCRIPTIONS.biso.domain,
    },
    currentDCBase: beat.dcBase,
    beatConstraints: beat.gmInstructions,
    consequenceReminders,
    pacingState: {
      tensionCurve: pacing.tensionCurve,
      emotionalTone: pacing.emotionalTone,
      sceneEscalation: pacing.sceneEscalation,
      checkpointsRemaining: pacing.narrativeCheckpoints
        .filter(cp => !cp.met)
        .map(cp => cp.description),
      turnsInBeat: pacing.turnsInBeat,
      maxTurns: pacing.maxTurnsBeforeForceProgress,
    },
  };
}

/**
 * Derive consequence reminders from world flags.
 * Maps flags to human-readable reminders for the LLM.
 */
function deriveConsequences(
  worldFlags: Record<string, boolean | string | number>,
  currentBeat: number,
): string[] {
  const reminders: string[] = [];

  for (const [key, value] of Object.entries(worldFlags)) {
    // Skip internal flags
    if (key.startsWith('_')) continue;

    if (typeof value === 'boolean' && value) {
      reminders.push(formatFlagAsReminder(key));
    } else if (typeof value === 'string' && value) {
      reminders.push(`${formatFlagAsReminder(key)} : ${value}`);
    } else if (typeof value === 'number') {
      reminders.push(`${formatFlagAsReminder(key)} : ${value}`);
    }
  }

  return reminders;
}

function formatFlagAsReminder(flag: string): string {
  return flag
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}
