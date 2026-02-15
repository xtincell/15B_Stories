import { loadGameBook } from './loader.js';
import type { BeatDefinition, NPCProfile, BeatPacing } from '../../types/game.js';

/**
 * Get the beat definition for a specific beat number.
 */
export function getBeatDefinition(bookId: string, beatNumber: number): BeatDefinition | null {
  const book = loadGameBook(bookId);
  return book.beats.find(b => b.number === beatNumber) ?? null;
}

/**
 * Get NPC profiles relevant to a specific beat, enriched with current affinity.
 */
export function getNpcsForBeat(
  bookId: string,
  beatNumber: number,
  currentAffinities: Map<string, number>,
): { id: string; name: string; title: string; personality: string; motivations: string; currentAffinity: number; beatRole: string }[] {
  const book = loadGameBook(bookId);
  const beat = book.beats.find(b => b.number === beatNumber);
  if (!beat) return [];

  const profiles: ReturnType<typeof getNpcsForBeat> = [];

  for (const npcId of beat.keyNpcIds) {
    const npc = book.npcs.get(npcId);
    if (!npc) continue;

    const beatRole = npc.beatRoles[beatNumber] ?? 'présent dans la scène';
    const currentAffinity = currentAffinities.get(npcId) ?? npc.defaultAffinity;

    profiles.push({
      id: npc.id,
      name: npc.name,
      title: npc.title,
      personality: npc.personality,
      motivations: npc.motivations,
      currentAffinity,
      beatRole,
    });
  }

  return profiles;
}

/**
 * Get all beat definitions (for beat tracker UI).
 */
export function getAllBeats(bookId: string): { number: number; name: string; slug: string }[] {
  const book = loadGameBook(bookId);
  return book.beats.map(b => ({
    number: b.number,
    name: b.name,
    slug: b.slug,
  }));
}

/**
 * Create initial pacing state for a beat.
 */
export function createInitialPacing(beat: BeatDefinition): BeatPacing {
  return {
    tensionCurve: beat.initialPacing.tensionCurve,
    emotionalTone: beat.initialPacing.emotionalTone,
    narrativeCheckpoints: beat.initialPacing.narrativeCheckpoints.map(cp => ({ ...cp })),
    maxTurnsBeforeForceProgress: beat.initialPacing.maxTurnsBeforeForceProgress,
    sceneEscalation: 0.0,
    turnsInBeat: 0,
  };
}
