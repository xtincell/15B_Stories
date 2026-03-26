/**
 * @module server/routes/save
 * @description Routes CRUD pour le système de sauvegarde manuelle.
 * Permet aux joueurs de créer des snapshots de leur partie, les lister,
 * les charger pour reprendre une session, ou les supprimer.
 * Préfixe attendu : /api
 */

import type { FastifyPluginAsync } from 'fastify';
import { saveGame, listSaves, loadSave, deleteSave } from '../../memory/persistent/save-system.js';

/**
 * @description Plugin Fastify regroupant les routes de gestion des sauvegardes.
 */
export const saveRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /api/saves
   * @description Crée une sauvegarde (snapshot) de la partie en cours.
   * @param {string} body.sessionId - ID de la session à sauvegarder.
   * @param {string} body.saveName - Nom donné par le joueur à cette sauvegarde.
   * @returns {SaveMeta} Métadonnées de la sauvegarde créée (id, date, nom).
   * @returns {400} Si la session est invalide ou la sauvegarde échoue.
   */
  app.post<{ Body: { sessionId: string; saveName: string } }>('/saves', async (request, reply) => {
    const { sessionId, saveName } = request.body;
    try {
      const meta = saveGame(sessionId, saveName);
      return meta;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * GET /api/saves
   * @description Liste toutes les sauvegardes existantes avec leurs métadonnées.
   * @returns {SaveMeta[]} Tableau de sauvegardes triées par date.
   */
  app.get('/saves', async () => {
    return listSaves();
  });

  /**
   * GET /api/saves/:id
   * @description Charge le snapshot complet d'une sauvegarde pour restaurer une partie.
   * @param {string} id - Identifiant unique de la sauvegarde.
   * @returns {SaveSnapshot} État complet de la partie au moment de la sauvegarde.
   * @returns {404} Si la sauvegarde n'existe pas.
   */
  app.get<{ Params: { id: string } }>('/saves/:id', async (request, reply) => {
    const snapshot = loadSave(request.params.id);
    if (!snapshot) {
      return reply.status(404).send({ error: 'Save not found' });
    }
    return snapshot;
  });

  /**
   * DELETE /api/saves/:id
   * @description Supprime définitivement une sauvegarde.
   * @param {string} id - Identifiant unique de la sauvegarde.
   * @returns {{ success: boolean }}
   * @returns {404} Si la sauvegarde n'existe pas.
   */
  app.delete<{ Params: { id: string } }>('/saves/:id', async (request, reply) => {
    const deleted = deleteSave(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Save not found' });
    }
    return { success: true };
  });
};
