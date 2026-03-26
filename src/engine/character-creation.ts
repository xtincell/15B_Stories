/**
 * @module character-creation
 * @description Création et validation des personnages joueurs.
 *
 * Ce module gère le processus de création d'un nouveau personnage :
 * récupération des archétypes disponibles, validation des stats,
 * vérification de la personnalité et du genre, puis persistance en base.
 */

import { loadGameBook } from '../memory/documentary/loader.js';
import { createCharacter } from '../memory/persistent/character-state.js';
import { validateStatBlock } from './stats.js';
import type { Character, StatBlock, Archetype, PersonalityTrait, Gender } from '../types/game.js';
import { PERSONALITY_TRAIT_NAMES } from '../types/game.js';

/**
 * Récupère la liste des archétypes disponibles pour un livre-jeu donné.
 *
 * @param bookId - Identifiant du livre-jeu
 * @returns Tableau des archétypes définis dans le livre
 */
export function getArchetypes(bookId: string): Archetype[] {
  const book = loadGameBook(bookId);
  return Array.from(book.archetypes.values());
}

/**
 * Crée un nouveau personnage joueur après validation complète.
 *
 * Valide successivement l'archétype, le bloc de stats et le trait de personnalité
 * avant de déléguer la création effective à la couche de persistance.
 * Si aucune backstory n'est fournie, celle de l'archétype est utilisée par défaut.
 *
 * @param bookId - Identifiant du livre-jeu
 * @param name - Nom choisi par le joueur pour son personnage
 * @param archetypeId - Identifiant de l'archétype sélectionné
 * @param stats - Bloc de statistiques réparti par le joueur (total = 20)
 * @param personality - Trait de personnalité du personnage (défaut : 'courageux')
 * @param gender - Genre du personnage pour l'accord des textes (défaut : 'masculin')
 * @param backstory - Histoire personnelle optionnelle, remplace celle de l'archétype
 * @returns Le personnage nouvellement créé et persisté
 * @throws Si l'archétype, les stats ou la personnalité sont invalides
 */
export function createNewCharacter(
  bookId: string,
  name: string,
  archetypeId: string,
  stats: StatBlock,
  personality: PersonalityTrait = 'courageux',
  gender: Gender = 'masculin',
  backstory?: string,
): Character {
  const book = loadGameBook(bookId);

  // Validate archetype
  const archetype = book.archetypes.get(archetypeId);
  if (!archetype) {
    throw new Error(`Unknown archetype: ${archetypeId}`);
  }

  // Validate stats
  const validation = validateStatBlock(stats);
  if (!validation.valid) {
    throw new Error(`Invalid stats: ${validation.errors.join(', ')}`);
  }

  // Validate personality
  if (!PERSONALITY_TRAIT_NAMES.includes(personality)) {
    throw new Error(`Unknown personality: ${personality}`);
  }

  // Create character
  return createCharacter({
    name,
    archetype: archetype.name,
    archetypeId,
    gender,
    personality,
    backstory: backstory ?? archetype.backstoryHook,
    stats,
    maxHp: book.meta.maxHp,
  });
}
