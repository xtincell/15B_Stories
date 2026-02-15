import { loadGameBook } from '../memory/documentary/loader.js';
import { initRelationship, getRelationshipsForBeat } from '../memory/persistent/npc-state.js';
import type { NPCRelationship } from '../types/game.js';

/**
 * Initialize NPC relationships for a new game session.
 * Creates relationship entries for all NPCs in the game book.
 */
export function initAllRelationships(sessionId: string, bookId: string): void {
  const book = loadGameBook(bookId);
  for (const [npcId, npc] of book.npcs) {
    initRelationship(sessionId, npcId, npc.name, npc.defaultAffinity);
  }
}

/**
 * Get NPC relationships relevant to the current beat.
 */
export function getActiveNpcRelationships(
  sessionId: string,
  bookId: string,
  beatNumber: number,
): NPCRelationship[] {
  const book = loadGameBook(bookId);
  const beat = book.beats.find(b => b.number === beatNumber);
  if (!beat) return [];

  return getRelationshipsForBeat(sessionId, beat.keyNpcIds);
}
