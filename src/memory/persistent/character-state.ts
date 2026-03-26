/**
 * @module character-state
 * @description Gestion de l'état des personnages joueurs en base de données.
 * CRUD sur les personnages : création, lecture, mise à jour des statistiques,
 * points de vie et inventaire. Les personnages sont liés aux sessions via character_id.
 */

import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';
import type { Character, StatBlock, InventoryItem, PersonalityTrait, Gender } from '../../types/game.js';

/**
 * @description Crée un nouveau personnage joueur en base de données.
 * Les PV démarrent au maximum et l'inventaire est vide.
 * @param {object} data - Données de création du personnage
 * @param {string} data.name - Nom du personnage
 * @param {string} data.archetype - Nom de l'archétype choisi
 * @param {string} data.archetypeId - Identifiant technique de l'archétype
 * @param {Gender} data.gender - Genre du personnage
 * @param {PersonalityTrait} data.personality - Trait de personnalité dominant
 * @param {string} data.backstory - Histoire personnelle du personnage
 * @param {StatBlock} data.stats - Statistiques initiales (ubuntu, maat, sankofa, biso)
 * @param {number} data.maxHp - Points de vie maximum
 * @returns {Character} Le personnage créé avec tous ses champs
 */
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

/**
 * @description Récupère un personnage par son identifiant.
 * @param {string} id - Identifiant unique du personnage
 * @returns {Character | null} Le personnage ou null si introuvable
 */
export function getCharacter(id: string): Character | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(id) as any;
  if (!row) return null;
  return rowToCharacter(row);
}

/**
 * @description Met à jour partiellement les statistiques d'un personnage.
 * Construit dynamiquement la requête SQL à partir des stats fournies.
 * @param {string} id - Identifiant du personnage
 * @param {Partial<StatBlock>} stats - Statistiques à modifier (seules les clés fournies sont mises à jour)
 */
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

/**
 * @description Met à jour les points de vie d'un personnage.
 * @param {string} id - Identifiant du personnage
 * @param {number} hp - Nouvelle valeur de PV
 */
export function updateCharacterHp(id: string, hp: number): void {
  const db = getDb();
  db.prepare('UPDATE characters SET hp = ? WHERE id = ?').run(hp, id);
}

/**
 * @description Remplace l'inventaire complet d'un personnage.
 * L'inventaire est sérialisé en JSON pour le stockage SQLite.
 * @param {string} id - Identifiant du personnage
 * @param {InventoryItem[]} inventory - Nouvel inventaire complet
 */
export function updateCharacterInventory(id: string, inventory: InventoryItem[]): void {
  const db = getDb();
  db.prepare('UPDATE characters SET inventory_json = ? WHERE id = ?').run(JSON.stringify(inventory), id);
}

/**
 * @description Convertit une ligne SQL brute en objet Character typé.
 * Applique des valeurs par défaut pour les champs potentiellement absents
 * (rétrocompatibilité avec les anciennes versions du schéma).
 */
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
