import type { FastifyPluginAsync } from 'fastify';
import { saveGame, listSaves, loadSave, deleteSave } from '../../memory/persistent/save-system.js';

export const saveRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/saves - Save current game
  app.post<{ Body: { sessionId: string; saveName: string } }>('/saves', async (request, reply) => {
    const { sessionId, saveName } = request.body;
    try {
      const meta = saveGame(sessionId, saveName);
      return meta;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /api/saves - List all saves
  app.get('/saves', async () => {
    return listSaves();
  });

  // GET /api/saves/:id - Load a save
  app.get<{ Params: { id: string } }>('/saves/:id', async (request, reply) => {
    const snapshot = loadSave(request.params.id);
    if (!snapshot) {
      return reply.status(404).send({ error: 'Save not found' });
    }
    return snapshot;
  });

  // DELETE /api/saves/:id - Delete a save
  app.delete<{ Params: { id: string } }>('/saves/:id', async (request, reply) => {
    const deleted = deleteSave(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Save not found' });
    }
    return { success: true };
  });
};
