import type { StatBlock, StatName } from '../types/game.js';
import type { DiceRollRequest, DiceRollResult } from '../types/engine.js';
import { getStatModifier } from './stats.js';

/**
 * Roll a single d20.
 */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Roll with advantage (roll twice, take highest).
 */
function rollWithAdvantage(): number {
  return Math.max(rollD20(), rollD20());
}

/**
 * Roll with disadvantage (roll twice, take lowest).
 */
function rollWithDisadvantage(): number {
  return Math.min(rollD20(), rollD20());
}

/**
 * Perform a full dice roll with stat modifier and DC check.
 */
export function rollDice(request: DiceRollRequest, stats: StatBlock): DiceRollResult {
  let roll: number;

  if (request.advantage && !request.disadvantage) {
    roll = rollWithAdvantage();
  } else if (request.disadvantage && !request.advantage) {
    roll = rollWithDisadvantage();
  } else {
    roll = rollD20();
  }

  const modifier = getStatModifier(stats, request.stat);
  const total = roll + modifier;
  const criticalSuccess = roll === 20;
  const criticalFailure = roll === 1;

  // Natural 20 always succeeds, natural 1 always fails
  const success = criticalSuccess ? true : criticalFailure ? false : total >= request.dc;

  return {
    roll,
    modifier,
    total,
    dc: request.dc,
    success,
    criticalSuccess,
    criticalFailure,
  };
}

/**
 * Get the base DC for a given beat number.
 * Beats 1-3: DC 8 (easy, tutorial)
 * Beats 4-6: DC 10 (moderate)
 * Beats 7-9: DC 12 (challenging)
 * Beats 10-12: DC 14 (hard)
 * Beats 13-15: DC 16 (climactic)
 */
export function getBaseDC(beatNumber: number): number {
  if (beatNumber <= 3) return 8;
  if (beatNumber <= 6) return 10;
  if (beatNumber <= 9) return 12;
  if (beatNumber <= 12) return 14;
  return 16;
}
