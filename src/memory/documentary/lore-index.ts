import { loadGameBook, type GameBook } from './loader.js';
import type { BeatDefinition } from '../../types/game.js';

/**
 * Get lore fragments relevant to a specific beat.
 * Returns lore content filtered by the beat's loreKeys.
 */
export function getLoreForBeat(bookId: string, beatNumber: number): string[] {
  const book = loadGameBook(bookId);
  const beat = book.beats.find(b => b.number === beatNumber);
  if (!beat) return [];

  const fragments: string[] = [];

  for (const key of beat.loreKeys) {
    // Check lore files
    const loreContent = book.lore.get(key);
    if (loreContent) {
      fragments.push(loreContent);
      continue;
    }

    // Check locations
    const locationContent = book.locations.get(key);
    if (locationContent) {
      fragments.push(locationContent);
    }
  }

  return fragments;
}

/**
 * Get location descriptions relevant to a beat.
 */
export function getLocationsForBeat(bookId: string, beatNumber: number): string[] {
  const book = loadGameBook(bookId);
  const beat = book.beats.find(b => b.number === beatNumber);
  if (!beat) return [];

  const descriptions: string[] = [];
  for (const locId of beat.locationIds) {
    const content = book.locations.get(locId);
    if (content) {
      descriptions.push(content);
    }
  }

  return descriptions;
}

/**
 * Search lore by keyword (simple text search).
 */
export function searchLore(bookId: string, keyword: string): string[] {
  const book = loadGameBook(bookId);
  const results: string[] = [];
  const lowerKeyword = keyword.toLowerCase();

  for (const [key, content] of book.lore) {
    if (content.toLowerCase().includes(lowerKeyword)) {
      results.push(content);
    }
  }

  for (const [key, content] of book.locations) {
    if (content.toLowerCase().includes(lowerKeyword)) {
      results.push(content);
    }
  }

  return results;
}
