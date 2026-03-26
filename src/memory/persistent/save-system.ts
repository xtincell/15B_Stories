/**
 * @module save-system
 * @description Système de sauvegarde et chargement de parties.
 * Capture un instantané complet de l'état du jeu (personnage, session,
 * actions récentes, résumés, historique de conversation) dans un blob JSON
 * stocké en base. Permet la sauvegarde manuelle, le listage et la suppression.
 */

import { v4 as uuid } from 'uuid';
import { getDb } from './db.js';
import { getCharacter } from './character-state.js';
import { getSession } from './world-state.js';
import { getRecentActions, getBeatSummaries, getConversationHistory } from './action-journal.js';

/**
 * @description Métadonnées d'une sauvegarde, sans le contenu de l'instantané.
 * Utilisé pour l'affichage dans la liste des sauvegardes.
 */
export interface SaveMetadata {
  id: string;
  saveName: string;
  characterName: string;
  beatNumber: number;
  createdAt: string;
}

/**
 * @description Instantané complet de l'état du jeu au moment de la sauvegarde.
 * Contient toutes les données nécessaires pour restaurer une partie.
 */
export interface SaveSnapshot {
  character: any;
  session: any;
  recentActions: any[];
  beatSummaries: any[];
  conversationCache: any[];
}

/**
 * @description Crée une sauvegarde complète de la partie en cours.
 * Capture un instantané de l'état du personnage, de la session, des actions
 * et de l'historique de conversation, puis le stocke en base sous forme de JSON.
 * @param {string} sessionId - Identifiant de la session à sauvegarder
 * @param {string} saveName - Nom donné par le joueur à cette sauvegarde
 * @returns {SaveMetadata} Métadonnées de la sauvegarde créée
 * @throws {Error} Si la session ou le personnage n'existent pas
 */
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

/**
 * @description Liste toutes les sauvegardes existantes, triées par date décroissante.
 * @returns {SaveMetadata[]} Liste des métadonnées de sauvegarde
 */
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

/**
 * @description Charge l'instantané complet d'une sauvegarde.
 * @param {string} saveId - Identifiant de la sauvegarde
 * @returns {SaveSnapshot | null} L'instantané désérialisé ou null si introuvable
 */
export function loadSave(saveId: string): SaveSnapshot | null {
  const db = getDb();
  const row = db.prepare('SELECT snapshot_json FROM saves WHERE id = ?').get(saveId) as any;
  if (!row) return null;
  return JSON.parse(row.snapshot_json);
}

/**
 * @description Supprime une sauvegarde par son identifiant.
 * @param {string} saveId - Identifiant de la sauvegarde à supprimer
 * @returns {boolean} Vrai si une sauvegarde a effectivement été supprimée
 */
export function deleteSave(saveId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM saves WHERE id = ?').run(saveId);
  return result.changes > 0;
}
