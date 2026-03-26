/**
 * @module server/routes/game
 * @description Routes principales de gestion des sessions de jeu.
 * Couvre le cycle de vie complet : création de partie, consultation de l'état,
 * suivi des beats narratifs, export de l'historique, panneau de contexte évolutif,
 * et suppression de parties terminées.
 * Préfixe attendu : /api/game
 */

import type { FastifyPluginAsync } from 'fastify';
import { createSession, getSession, getWorldFlags, getCompletedSessions, deleteSession } from '../../memory/persistent/world-state.js';
import { getCharacter } from '../../memory/persistent/character-state.js';
import { initAllRelationships } from '../../engine/npc-manager.js';
import { getPacing } from '../../engine/beat-manager.js';
import { loadGameBook } from '../../memory/documentary/loader.js';
import { getAllBeats, getBeatDefinition } from '../../memory/documentary/beat-content.js';
import { buildOpeningRequest } from '../../prompts/system-prompt.js';
import { createAdaptersFromEnv } from '../../llm/factory.js';
import { TurnOutputSchema } from '../../llm/output-schema.js';
import { cacheConversationMessage, getRecentActions, getBeatSummaries } from '../../memory/persistent/action-journal.js';
import { getRelationshipsForBeat } from '../../memory/persistent/npc-state.js';

/**
 * @description Plugin Fastify regroupant les routes de gestion des parties.
 */
export const gameRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/game/completed
   * @description Liste toutes les sessions de jeu terminées (statut "completed").
   * Enregistrée avant les routes /:id pour éviter que Fastify ne capture "completed" comme paramètre.
   * @returns {CompletedSession[]} Tableau de sessions terminées avec résumé.
   */
  app.get('/completed', async () => {
    return getCompletedSessions();
  });

  /**
   * DELETE /api/game/:id
   * @description Supprime une partie terminée et toutes ses données associées.
   * Refuse la suppression des parties en cours pour éviter la perte de données.
   * @param {string} id - Identifiant de la session.
   * @returns {{ success: boolean }}
   * @returns {400} Si la partie n'est pas terminée.
   * @returns {404} Si la session n'existe pas.
   */
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    if (session.status !== 'completed') {
      return reply.status(400).send({ error: 'Only completed games can be deleted' });
    }
    deleteSession(session.id);
    return { success: true };
  });

  /**
   * POST /api/game/new
   * @description Crée une nouvelle session de jeu. Initialise les relations PNJ,
   * le pacing du beat 1, puis génère la narration d'ouverture via le LLM.
   * @param {string} body.characterId - ID du personnage créé au préalable.
   * @param {string} [body.bookId=kinara] - Livre de jeu à utiliser.
   * @param {string} [body.gameMode=normal] - Mode de jeu ("normal" ou "rapide").
   * @returns {{ sessionId, character, output, beat }} État initial de la partie avec la narration d'ouverture.
   * @returns {404} Si le personnage ou le livre n'existe pas.
   * @returns {500} Si la génération LLM échoue.
   */
  app.post<{ Body: { characterId: string; bookId?: string; gameMode?: string } }>('/new', async (request, reply) => {
    const { characterId, bookId = 'kinara', gameMode = 'normal' } = request.body;

    const character = getCharacter(characterId);
    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    // Verify game book exists
    try {
      loadGameBook(bookId);
    } catch {
      return reply.status(404).send({ error: `Game book "${bookId}" not found` });
    }

    // Restreint le mode aux valeurs autorisées pour éviter les injections
    const validMode = gameMode === 'rapide' ? 'rapide' as const : 'normal' as const;
    const session = createSession(characterId, bookId, validMode);

    // Initialize NPC relationships
    initAllRelationships(session.id, bookId);

    // Initialize pacing for beat 1
    const pacing = getPacing(session.id, 1, bookId);

    // Generate opening narration
    const { main } = createAdaptersFromEnv();
    const llmRequest = buildOpeningRequest(session, character, pacing);

    try {
      const output = await main.generateTurn(llmRequest);

      // Sauvegarde l'échange initial dans le journal pour le contexte conversationnel futur
      cacheConversationMessage(session.id, 0, 'user', 'Début de l\'aventure');
      cacheConversationMessage(session.id, 0, 'assistant', output.narration.slice(0, 500));

      return {
        sessionId: session.id,
        character,
        output,
        beat: { number: 1, name: 'Opening Image' },
      };
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ error: 'Failed to generate opening', details: err.message });
    }
  });

  /**
   * GET /api/game/:id
   * @description Récupère l'état complet d'une partie en cours : session, personnage, beats et pacing.
   * Utilisé par le client pour restaurer l'interface après un rechargement.
   * @param {string} id - Identifiant de la session.
   * @returns {{ session, character, beats, pacing }}
   * @returns {404} Si la session n'existe pas.
   */
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const character = getCharacter(session.characterId);
    const beats = getAllBeats(session.bookId);
    const pacing = getPacing(session.id, session.currentBeat, session.bookId);

    return {
      session,
      character,
      beats,
      pacing,
    };
  });

  /**
   * GET /api/game/:id/beats
   * @description Renvoie la liste des 15 beats narratifs (Save the Cat) pour le tracker de progression.
   * @param {string} id - Identifiant de la session.
   * @returns {Beat[]} Tableau des beats avec numéro et nom.
   * @returns {404} Si la session n'existe pas.
   */
  app.get<{ Params: { id: string } }>('/:id/beats', async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return getAllBeats(session.bookId);
  });

  /**
   * GET /api/game/:id/export
   * @description Exporte l'historique complet d'une partie pour la génération PDF côté client.
   * Inclut le personnage, la session, toutes les actions, les résumés de beats et les flags du monde.
   * @param {string} id - Identifiant de la session.
   * @returns {{ character, session, actions, beatSummaries, beats, worldFlags }}
   * @returns {404} Si la session n'existe pas.
   */
  app.get<{ Params: { id: string } }>('/:id/export', async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const character = getCharacter(session.characterId);
    const actions = getRecentActions(session.id, 1000); // all actions
    const summaries = getBeatSummaries(session.id);
    const beats = getAllBeats(session.bookId);
    const worldFlags = getWorldFlags(session.id);

    return {
      character,
      session,
      actions,
      beatSummaries: summaries,
      beats,
      worldFlags,
    };
  });

  /**
   * GET /api/game/:id/context
   * @description Fournit les données du panneau de contexte évolutif affiché dans la sidebar.
   * Agrège : flags du monde, résumés de beats, relations PNJ, rappels de conséquences,
   * actions récentes, stats du personnage et progression actuelle.
   * @param {string} id - Identifiant de la session.
   * @returns {{ worldFlags, beatSummaries, relationships, pacing, consequenceReminders, recentActions, stats, currentBeat, turnCount }}
   * @returns {404} Si la session n'existe pas.
   */
  app.get<{ Params: { id: string } }>('/:id/context', async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const character = getCharacter(session.characterId);
    const worldFlags = getWorldFlags(session.id);
    const summaries = getBeatSummaries(session.id);
    const recentActions = getRecentActions(session.id, 5);
    const pacing = getPacing(session.id, session.currentBeat, session.bookId);

    // Get all NPC relationships from session
    const relationships = session.relationships ?? [];

    // Transforme les flags du monde en rappels lisibles pour le joueur
    // Les flags booléens deviennent des phrases simples, les strings gardent leur valeur
    const consequenceReminders: string[] = [];
    for (const [key, value] of Object.entries(worldFlags)) {
      if (typeof value === 'boolean' && value) {
        consequenceReminders.push(key.replace(/_/g, ' '));
      } else if (typeof value === 'string') {
        consequenceReminders.push(`${key.replace(/_/g, ' ')} : ${value}`);
      }
    }

    return {
      worldFlags,
      beatSummaries: summaries,
      relationships,
      pacing,
      consequenceReminders,
      recentActions: recentActions.map(a => ({
        turn: a.turnNumber,
        beat: a.beat,
        choice: a.choiceText,
        stat: a.dominantStat,
        diceSuccess: a.diceResult?.success ?? null,
      })),
      stats: character?.stats ?? {},
      currentBeat: session.currentBeat,
      turnCount: session.turnCount,
    };
  });
};
