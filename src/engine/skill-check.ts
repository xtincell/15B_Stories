import type { StatBlock, StatName } from '../types/game.js';
import type { DiceRollRequest, DiceRollResult } from '../types/engine.js';
import { rollDice } from './dice.js';

/**
 * Perform a skill check: roll d20 + stat modifier vs DC.
 */
export function skillCheck(
  stats: StatBlock,
  stat: StatName,
  dc: number,
  options?: { advantage?: boolean; disadvantage?: boolean },
): DiceRollResult {
  const request: DiceRollRequest = {
    type: 'active',
    stat,
    dc,
    advantage: options?.advantage,
    disadvantage: options?.disadvantage,
  };

  return rollDice(request, stats);
}

/**
 * Perform a passive skill check (GM rolls behind the scenes).
 */
export function passiveCheck(
  stats: StatBlock,
  stat: StatName,
  dc: number,
): DiceRollResult {
  const request: DiceRollRequest = {
    type: 'passive',
    stat,
    dc,
  };

  return rollDice(request, stats);
}

/**
 * Format a dice result into a human-readable string.
 */
export function formatDiceResult(result: DiceRollResult, stat: StatName): string {
  const modSign = result.modifier >= 0 ? '+' : '';
  let text = `${stat}: d20(${result.roll}) ${modSign}${result.modifier} = ${result.total} vs DC ${result.dc}`;

  if (result.criticalSuccess) {
    text += ' — SUCCÈS CRITIQUE !';
  } else if (result.criticalFailure) {
    text += ' — ÉCHEC CRITIQUE !';
  } else if (result.success) {
    text += ' — Succès';
  } else {
    text += ' — Échec';
  }

  return text;
}
