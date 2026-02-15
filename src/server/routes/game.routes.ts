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

export const gameRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/game/completed - List all completed game sessions
  // MUST be registered before /:id routes so Fastify doesn't match "completed" as an :id param
  app.get('/completed', async () => {
    return getCompletedSessions();
  });

  // DELETE /api/game/:id - Delete a completed game and all related data
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

  // POST /api/game/new - Create a new game session
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

    // Create session
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

      // Cache the opening exchange
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

  // GET /api/game/:id - Get current game state
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

  // GET /api/game/:id/beats - Get all beat names for tracker
  app.get<{ Params: { id: string } }>('/:id/beats', async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }
    return getAllBeats(session.bookId);
  });

  // GET /api/game/:id/export - Export full game history for PDF generation
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

  // GET /api/game/:id/context - Evolving context panel data
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

    // Build consequence reminders from flags
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
