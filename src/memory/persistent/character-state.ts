import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';
import type { Character, StatBlock, InventoryItem, PersonalityTrait, Gender } from '../../types/game.js';

export function createCharacter(data: {
  name: string;
  archetype: string;
  archetypeId: string;
  gender: Gender;
  personality: PersonalityTrait;
  backstory: string;
  stats: StatBlock;
  maxHp: number;
}): Character {
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO characters (id, name, archetype, archetype_id, gender, personality, backstory, ubuntu, maat, sankofa, biso, hp, max_hp, inventory_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.archetype, data.archetypeId, data.gender, data.personality, data.backstory, data.stats.ubuntu, data.stats.maat, data.stats.sankofa, data.stats.biso, data.maxHp, data.maxHp, '[]', now);

  return {
    id,
    name: data.name,
    archetype: data.archetype,
    archetypeId: data.archetypeId,
    gender: data.gender,
    personality: data.personality,
    backstory: data.backstory,
    stats: data.stats,
    hp: data.maxHp,
    maxHp: data.maxHp,
    inventory: [],
    createdAt: now,
  };
}

export function getCharacter(id: string): Character | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToCharacter(row);
}

export function updateCharacterStats(id: string, stats: Partial<StatBlock>): void {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(stats)) {
    updates.push(`${key} = ?`);
    values.push(value);
  }

  if (updates.length > 0) {
    values.push(id);
    db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }
}

export function updateCharacterHp(id: string, hp: number): void {
  const db = getDb();
  db.prepare('UPDATE characters SET hp = ? WHERE id = ?').run(hp, id);
}

export function updateCharacterInventory(id: string, inventory: InventoryItem[]): void {
  const db = getDb();
  db.prepare('UPDATE characters SET inventory_json = ? WHERE id = ?').run(JSON.stringify(inventory), id);
}

function rowToCharacter(row: any): Character {
  return {
    id: row.id,
    name: row.name,
    archetype: row.archetype,
    archetypeId: row.archetype_id || '',
    gender: row.gender || 'masculin',
    personality: row.personality ?? 'courageux',
    backstory: row.backstory,
    stats: {
      ubuntu: row.ubuntu,
      maat: row.maat,
      sankofa: row.sankofa,
      biso: row.biso,
    },
    hp: row.hp,
    maxHp: row.max_hp,
    inventory: JSON.parse(row.inventory_json),
    createdAt: row.created_at,
  };
}
