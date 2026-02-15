import type { FastifyPluginAsync } from 'fastify';
import { createNewCharacter, getArchetypes } from '../../engine/character-creation.js';
import type { StatBlock, PersonalityTrait, Gender } from '../../types/game.js';

export const characterRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/game/archetypes - List available archetypes
  app.get('/archetypes', async (request) => {
    const bookId = (request.query as any).bookId ?? 'kinara';
    return getArchetypes(bookId);
  });

  // POST /api/game/character - Create a character
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
