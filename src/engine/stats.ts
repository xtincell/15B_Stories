import type { StatBlock, StatName } from '../types/game.js';

/**
 * Calculate the modifier for a stat value.
 * stat 1 -> -4, stat 5 -> 0, stat 10 -> +5
 */
export function getModifier(statValue: number): number {
  return statValue - 5;
}

/**
 * Get the modifier for a specific stat from a stat block.
 */
export function getStatModifier(stats: StatBlock, stat: StatName): number {
  return getModifier(stats[stat]);
}

/**
 * Validate that a stat block has legal values.
 */
export function validateStatBlock(stats: StatBlock): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const total = stats.ubuntu + stats.maat + stats.sankofa + stats.biso;

  if (total !== 20) {
    errors.push(`Stat total must be 20, got ${total}`);
  }

  for (const [name, value] of Object.entries(stats)) {
    if (value < 1 || value > 10) {
      errors.push(`${name} must be between 1 and 10, got ${value}`);
    }
    if (!Number.isInteger(value)) {
      errors.push(`${name} must be an integer, got ${value}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Clamp a stat value to legal range.
 */
export function clampStat(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

/**
 * Clamp an affinity value to legal range (-10 to +10).
 */
export function clampAffinity(value: number): number {
  return Math.max(-10, Math.min(10, Math.round(value)));
}
