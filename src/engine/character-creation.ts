import { loadGameBook } from '../memory/documentary/loader.js';
import { createCharacter } from '../memory/persistent/character-state.js';
import { validateStatBlock } from './stats.js';
import type { Character, StatBlock, Archetype, PersonalityTrait, Gender } from '../types/game.js';
import { PERSONALITY_TRAIT_NAMES } from '../types/game.js';

/**
 * Get available archetypes for a game book.
 */
export function getArchetypes(bookId: string): Archetype[] {
  const book = loadGameBook(bookId);
  return Array.from(book.archetypes.values());
}

/**
 * Create a new character with validation.
 */
export function createNewCharacter(
  bookId: string,
  name: string,
  archetypeId: string,
  stats: StatBlock,
  personality: PersonalityTrait = 'courageux',
  gender: Gender = 'masculin',
  backstory?: string,
): Character {
  const book = loadGameBook(bookId);

  // Validate archetype
  const archetype = book.archetypes.get(archetypeId);
  if (!archetype) {
    throw new Error(`Unknown archetype: ${archetypeId}`);
  }

  // Validate stats
  const validation = validateStatBlock(stats);
  if (!validation.valid) {
    throw new Error(`Invalid stats: ${validation.errors.join(', ')}`);
  }

  // Validate personality
  if (!PERSONALITY_TRAIT_NAMES.includes(personality)) {
    throw new Error(`Unknown personality: ${personality}`);
  }

  // Create character
  return createCharacter({
    name,
    archetype: archetype.name,
    archetypeId,
    gender,
    personality,
    backstory: backstory ?? archetype.backstoryHook,
    stats,
    maxHp: book.meta.maxHp,
  });
}
