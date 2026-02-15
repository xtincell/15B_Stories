import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';
import type { ActionEntry, ActionSummary, SummaryType } from '../../types/memory.js';

export function logAction(entry: Omit<ActionEntry, 'id' | 'timestamp'>): ActionEntry {
  const db = getDb();
  const id = uuid();
  const timestamp = new Date().toISOString();

  db.prepare(`
    INSERT INTO action_journal (id, session_id, turn_number, beat, scene, choice_id, choice_text, dominant_stat, dice_result_json, state_changes_json, narration_text, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.sessionId,
    entry.turnNumber,
    entry.beat,
    entry.scene,
    entry.choiceId,
    entry.choiceText,
    entry.dominantStat,
    entry.diceResult ? JSON.stringify(entry.diceResult) : null,
    JSON.stringify(entry.stateChanges),
    entry.narrationText,
    timestamp,
  );

  return { ...entry, id, timestamp };
}

export function getRecentActions(sessionId: string, limit: number = 5): ActionEntry[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM action_journal WHERE session_id = ? ORDER BY turn_number DESC LIMIT ?'
  ).all(sessionId, limit) as any[];

  return rows.reverse().map(rowToActionEntry);
}

export function getActionsByBeat(sessionId: string, beatNumber: number): ActionEntry[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM action_journal WHERE session_id = ? AND beat = ? ORDER BY turn_number ASC'
  ).all(sessionId, beatNumber) as any[];

  return rows.map(rowToActionEntry);
}

export function getActionCount(sessionId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM action_journal WHERE session_id = ?').get(sessionId) as any;
  return row.count;
}

// ── Summaries ──

export function saveSummary(data: {
  sessionId: string;
  type: SummaryType;
  beatNumber: number;
  upToTurn: number;
  summaryText: string;
}): ActionSummary {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO action_summaries (id, session_id, type, beat_number, up_to_turn, summary_text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.sessionId, data.type, data.beatNumber, data.upToTurn, data.summaryText, now);

  return { id, ...data, createdAt: now };
}

export function getBeatSummaries(sessionId: string): ActionSummary[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM action_summaries WHERE session_id = ? AND type = 'beat' ORDER BY beat_number ASC"
  ).all(sessionId) as any[];

  return rows.map(rowToSummary);
}

export function getLatestSummaryTurn(sessionId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT MAX(up_to_turn) as max_turn FROM action_summaries WHERE session_id = ?'
  ).get(sessionId) as any;
  return row?.max_turn ?? 0;
}

// ── Conversation Cache ──

export function cacheConversationMessage(sessionId: string, turnNumber: number, role: 'user' | 'assistant', content: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO conversation_cache (id, session_id, turn_number, role, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), sessionId, turnNumber, role, content, new Date().toISOString());
}

export function getConversationHistory(sessionId: string, limit: number = 10): { role: 'user' | 'assistant'; content: string }[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT role, content FROM conversation_cache WHERE session_id = ? ORDER BY turn_number DESC, created_at ASC LIMIT ?'
  ).all(sessionId, limit * 2) as any[]; // *2 because each turn has user+assistant

  return rows.reverse();
}

// ── Row mappers ──

function rowToActionEntry(row: any): ActionEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnNumber: row.turn_number,
    beat: row.beat,
    scene: row.scene,
    choiceId: row.choice_id,
    choiceText: row.choice_text,
    dominantStat: row.dominant_stat,
    diceResult: row.dice_result_json ? JSON.parse(row.dice_result_json) : undefined,
    stateChanges: JSON.parse(row.state_changes_json),
    narrationText: row.narration_text,
    timestamp: row.timestamp,
  };
}

function rowToSummary(row: any): ActionSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    beatNumber: row.beat_number,
    upToTurn: row.up_to_turn,
    summaryText: row.summary_text,
    createdAt: row.created_at,
  };
}
