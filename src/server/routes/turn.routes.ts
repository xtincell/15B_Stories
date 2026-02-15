import type { FastifyPluginAsync } from 'fastify';
import { getSession } from '../../memory/persistent/world-state.js';
import { getCharacter } from '../../memory/persistent/character-state.js';
import { getPacing } from '../../engine/beat-manager.js';
import { skillCheck, formatDiceResult } from '../../engine/skill-check.js';
import { buildTurnRequest } from '../../prompts/system-prompt.js';
import { evaluateTurn } from '../../memory/functional/turn-evaluator.js';
import { createAdaptersFromEnv } from '../../llm/factory.js';
import type { PlayerTurnInput, Choice } from '../../types/llm.js';
import type { StatName } from '../../types/game.js';

export const turnRoutes: FastifyPluginAsync = async (app) => {

  // ── SSE Streaming endpoint: POST /api/game/:id/turn/stream ──
  // Streams narration chunks via Server-Sent Events, then sends final JSON.
  app.post<{
    Params: { id: string };
    Body: {
      choiceId: string;
      freeText?: string;
      previousChoices?: Choice[];
    };
  }>('/:id/turn/stream', async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const character = getCharacter(session.characterId);
    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const { choiceId, freeText, previousChoices } = request.body;
    const chosenChoice = previousChoices?.find(c => c.id === choiceId);

    if (!chosenChoice && !freeText) {
      return reply.status(400).send({ error: 'Invalid choiceId — no matching choice found and no free text provided' });
    }

    // Handle active dice roll
    let diceResult = undefined;
    let diceResultText = undefined;

    if (chosenChoice?.requiresActiveRoll && chosenChoice.dc) {
      const stat = chosenChoice.dominantStat as StatName;
      diceResult = skillCheck(character.stats, stat, chosenChoice.dc);
      diceResultText = formatDiceResult(diceResult, stat);
    }

    const playerInput: PlayerTurnInput = {
      choiceId,
      freeText,
      diceRoll: diceResult?.roll,
    };

    const pacing = getPacing(session.id, session.currentBeat, session.bookId);
    const llmRequest = buildTurnRequest(session, character, pacing, playerInput, diceResultText);
    const { main, summarizer } = createAdaptersFromEnv();

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Send dice result immediately if available
    if (diceResult) {
      reply.raw.write(`event: dice\ndata: ${JSON.stringify(diceResult)}\n\n`);
    }

    try {
      // Stream LLM response, sending narration chunks to client
      const output = await main.generateTurnStreaming(llmRequest, (chunk) => {
        reply.raw.write(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`);
      });

      // Process the turn (DB transaction, state changes, beat transition)
      const result = await evaluateTurn(
        output, playerInput, chosenChoice, character, session, diceResult, summarizer,
      );

      // Send the complete result as final event
      const payload = {
        output: result.output,
        diceResult: result.diceResult,
        stateLog: result.stateLog,
        beatTransitioned: result.beatTransitioned,
        newBeat: result.newBeat,
        gameCompleted: result.gameCompleted,
        session: result.updatedSession,
        character: result.updatedCharacter,
        pacing: getPacing(
          session.id,
          result.updatedSession.currentBeat,
          session.bookId,
        ),
      };

      reply.raw.write(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
      reply.raw.end();
    } catch (err: any) {
      app.log.error(err);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      reply.raw.end();
    }
  });

  // ── Regular (non-streaming) endpoint: POST /api/game/:id/turn ──
  app.post<{
    Params: { id: string };
    Body: {
      choiceId: string;
      freeText?: string;
      previousChoices?: Choice[];
    };
  }>('/:id/turn', async (request, reply) => {
    const session = getSession(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    const character = getCharacter(session.characterId);
    if (!character) {
      return reply.status(404).send({ error: 'Character not found' });
    }

    const { choiceId, freeText, previousChoices } = request.body;
    const chosenChoice = previousChoices?.find(c => c.id === choiceId);

    if (!chosenChoice && !freeText) {
      return reply.status(400).send({ error: 'Invalid choiceId — no matching choice found and no free text provided' });
    }

    let diceResult = undefined;
    let diceResultText = undefined;

    if (chosenChoice?.requiresActiveRoll && chosenChoice.dc) {
      const stat = chosenChoice.dominantStat as StatName;
      diceResult = skillCheck(character.stats, stat, chosenChoice.dc);
      diceResultText = formatDiceResult(diceResult, stat);
    }

    const playerInput: PlayerTurnInput = {
      choiceId,
      freeText,
      diceRoll: diceResult?.roll,
    };

    const pacing = getPacing(session.id, session.currentBeat, session.bookId);
    const llmRequest = buildTurnRequest(session, character, pacing, playerInput, diceResultText);
    const { main, summarizer } = createAdaptersFromEnv();

    try {
      const output = await main.generateTurn(llmRequest);

      const result = await evaluateTurn(
        output, playerInput, chosenChoice, character, session, diceResult, summarizer,
      );

      // Return updated state directly from evaluateTurn — no redundant DB reads
      return {
        output: result.output,
        diceResult: result.diceResult,
        stateLog: result.stateLog,
        beatTransitioned: result.beatTransitioned,
        newBeat: result.newBeat,
        gameCompleted: result.gameCompleted,
        session: result.updatedSession,
        character: result.updatedCharacter,
        pacing: getPacing(
          session.id,
          result.updatedSession.currentBeat,
          session.bookId,
        ),
      };
    } catch (err: any) {
      app.log.error(err);
      return reply.status(500).send({ error: 'Failed to process turn', details: err.message });
    }
  });
};
