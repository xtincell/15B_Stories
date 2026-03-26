/**
 * @module lore-index
 * @description Index de recherche et d'accès au lore (univers narratif).
 * Permet de récupérer les fragments de lore, descriptions de lieux
 * et de rechercher dans l'ensemble du contenu narratif du livre de jeu.
 */

import { loadGameBook, type GameBook } from './loader.js';
import type { BeatDefinition } from '../../types/game.js';

/**
 * @description Récupère les fragments de lore pertinents pour un beat donné.
 * Recherche d'abord dans les fichiers de lore, puis dans les descriptions de lieux,
 * en utilisant les clés de lore définies dans le beat.
 * @param {string} bookId - Identifiant unique du livre de jeu
 * @param {number} beatNumber - Numéro du beat courant
 * @returns {string[]} Fragments de lore (contenu markdown) associés au beat
 */
export function getLoreForBeat(bookId: string, beatNumber: number): string[] {
  const book = loadGameBook(bookId);
  const beat = book.beats.find(b => b.number === beatNumber);
  if (!beat) return [];

  const fragments: string[] = [];

  for (const key of beat.loreKeys) {
    // Priorité au lore thématique (monde, histoire, esprits...)
    const loreContent = book.lore.get(key);
    if (loreContent) {
      fragments.push(loreContent);
      continue;
    }

    // Repli sur les descriptions de lieux si la clé ne correspond pas à du lore
    const locationContent = book.locations.get(key);
    if (locationContent) {
      fragments.push(locationContent);
    }
  }

  return fragments;
}

/**
 * @description Récupère les descriptions de lieux associés à un beat.
 * Utilise les identifiants de lieux définis dans la définition du beat.
 * @param {string} bookId - Identifiant unique du livre de jeu
 * @param {number} beatNumber - Numéro du beat courant
 * @returns {string[]} Descriptions markdown des lieux du beat
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
 * @description Recherche dans tout le lore et les lieux par mot-clé (recherche textuelle simple).
 * La recherche est insensible à la casse et parcourt l'intégralité du contenu.
 * @param {string} bookId - Identifiant unique du livre de jeu
 * @param {string} keyword - Mot-clé à rechercher dans le contenu
 * @returns {string[]} Fragments de lore et descriptions de lieux contenant le mot-clé
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
