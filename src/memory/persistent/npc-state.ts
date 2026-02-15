import { getDb } from './db.js';
import { upsertRelationship, getRelationship } from './world-state.js';
import { clampAffinity } from '../../engine/stats.js';
import type { NPCRelationship } from '../../types/game.js';

export function updateAffinity(sessionId: string, npcId: string, delta: number, beat: number, note?: string): NPCRelationship | null {
  const existing = getRelationship(sessionId, npcId);
  if (!existing) return null;

  const updated: NPCRelationship = {
    ...existing,
    affinity: clampAffinity(existing.affinity + delta),
    lastInteractionBeat: beat,
    notes: note ? [...existing.notes, note] : existing.notes,
  };

  upsertRelationship(sessionId, updated);
  return updated;
}

export function initRelationship(sessionId: string, npcId: string, npcName: string, defaultAffinity: number = 0): void {
  upsertRelationship(sessionId, {
    npcId,
    npcName,
    affinity: clampAffinity(defaultAffinity),
    lastInteractionBeat: 0,
    notes: [],
  });
}

export function getRelationshipsForBeat(sessionId: string, npcIds: string[]): NPCRelationship[] {
  if (npcIds.length === 0) return [];
  const db = getDb();
  const placeholders = npcIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT * FROM npc_relationships WHERE session_id = ? AND npc_id IN (${placeholders})`
  ).all(sessionId, ...npcIds) as any[];

  return rows.map(row => ({
    npcId: row.npc_id,
    npcName: row.npc_name,
    affinity: row.affinity,
    lastInteractionBeat: row.last_interaction_beat,
    notes: JSON.parse(row.notes_json),
  }));
}
