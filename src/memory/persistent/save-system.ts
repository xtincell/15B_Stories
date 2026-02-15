import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';
import { getCharacter } from './character-state.js';
import { getSession } from './world-state.js';
import { getRecentActions, getBeatSummaries, getConversationHistory } from './action-journal.js';

export interface SaveMetadata {
  id: string;
  saveName: string;
  characterName: string;
  beatNumber: number;
  createdAt: string;
}

export interface SaveSnapshot {
  character: any;
  session: any;
  recentActions: any[];
  beatSummaries: any[];
  conversationCache: any[];
}

export function saveGame(sessionId: string, saveName: string): SaveMetadata {
  const db = getDb();
  const session = getSession(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const character = getCharacter(session.characterId);
  if (!character) throw new Error(`Character ${session.characterId} not found`);

  const snapshot: SaveSnapshot = {
    character,
    session,
    recentActions: getRecentActions(sessionId, 100), // save all actions
    beatSummaries: getBeatSummaries(sessionId),
    conversationCache: getConversationHistory(sessionId, 50),
  };

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO saves (id, session_id, save_name, character_name, beat_number, snapshot_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, saveName, character.name, session.currentBeat, JSON.stringify(snapshot), now);

  return { id, saveName, characterName: character.name, beatNumber: session.currentBeat, createdAt: now };
}

export function listSaves(): SaveMetadata[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, save_name, character_name, beat_number, created_at FROM saves ORDER BY created_at DESC'
  ).all() as any[];

  return rows.map(row => ({
    id: row.id,
    saveName: row.save_name,
    characterName: row.character_name,
    beatNumber: row.beat_number,
    createdAt: row.created_at,
  }));
}

export function loadSave(saveId: string): SaveSnapshot | null {
  const db = getDb();
  const row = db.prepare('SELECT snapshot_json FROM saves WHERE id = ?').get(saveId) as any;
  if (!row) return null;
  return JSON.parse(row.snapshot_json);
}

export function deleteSave(saveId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM saves WHERE id = ?').run(saveId);
  return result.changes > 0;
}
