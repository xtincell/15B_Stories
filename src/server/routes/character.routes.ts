/**
 * @module server/routes/character
 * @description Routes de création de personnage et de consultation des archétypes.
 * Utilisées lors de l'écran de création avant le lancement d'une nouvelle partie.
 * Préfixe attendu : /api/game
 */

import type { FastifyPluginAsync } from 'fastify';
import { createNewCharacter, getArchetypes } from '../../engine/character-creation.js';
import type { StatBlock, PersonalityTrait, Gender } from '../../types/game.js';

/**
 * @description Plugin Fastify regroupant les routes liées aux personnages joueurs.
 */
export const characterRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/game/archetypes
   * @description Renvoie la liste des archétypes disponibles pour un livre donné.
   * @param {string} [bookId=kinara] - Query param identifiant le livre de jeu.
   * @returns {Archetype[]} Tableau d'archétypes avec leurs stats de base et descriptions.
   */
  app.get('/archetypes', async (request) => {
    const bookId = (request.query as any).bookId ?? 'kinara';
    return getArchetypes(bookId);
  });

  /**
   * POST /api/game/character
   * @description Crée un nouveau personnage joueur à partir d'un archétype et de stats personnalisées.
   * @param {string} body.name - Nom du personnage.
   * @param {string} body.archetypeId - ID de l'archétype choisi.
   * @param {StatBlock} body.stats - Bloc de statistiques réparties par le joueur.
   * @param {PersonalityTrait} [body.personality=courageux] - Trait de personnalité dominant.
   * @param {Gender} [body.gender=masculin] - Genre du personnage (influence la narration).
   * @param {string} [body.backstory] - Histoire personnelle optionnelle.
   * @param {string} [body.bookId=kinara] - Livre de jeu associé.
   * @returns {Character} Le personnage créé avec son ID unique.
   * @returns {400} Si les paramètres sont invalides (stats hors limites, archétype inconnu, etc.).
   */
  app.post<{
    Body: {
      name: string;
      archetypeId: string;
      stats: StatBlock;
      personality?: PersonalityTrait;
      gender?: Gender;
      backstory?: string;
      bookId?: string;
    };
  }>('/character', async (request, reply) => {
    const { name, archetypeId, stats, personality = 'courageux', gender = 'masculin', backstory, bookId = 'kinara' } = request.body;

    try {
      const character = createNewCharacter(bookId, name, archetypeId, stats, personality, gender, backstory);
      return character;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
