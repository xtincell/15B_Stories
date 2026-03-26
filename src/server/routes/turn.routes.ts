/**
 * @module server/routes/turn
 * @description Routes de traitement des tours de jeu (actions du joueur).
 * Deux variantes sont proposées : streaming SSE (pour l'affichage progressif
 * de la narration) et non-streaming (pour les appels programmatiques).
 * Chaque tour comprend : résolution de dé optionnelle, appel LLM, évaluation
 * des conséquences (changements d'état, transition de beat, fin de partie).
 * Préfixe attendu : /api/game
 */

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

/**
 * @description Plugin Fastify regroupant les routes de traitement des tours.
 */
export const turnRoutes: FastifyPluginAsync = async (app) => {

  /**
   * POST /api/game/:id/turn/stream
   * @description Traite un tour de jeu avec diffusion SSE de la narration.
   * Le client reçoit d'abord un événement "dice" (si applicable), puis des "chunk"
   * contenant les fragments de narration au fil de la génération, et enfin un "done"
   * avec l'état complet mis à jour, ou "error" en cas d'échec.
   * @param {string} id - Identifiant de la session de jeu.
   * @param {string} body.choiceId - ID du choix sélectionné par le joueur.
   * @param {string} [body.freeText] - Texte libre si le joueur écrit sa propre action.
   * @param {Choice[]} [body.previousChoices] - Choix proposés au tour précédent (pour retrouver le choix sélectionné).
   * @returns {SSE} Événements : dice(DiceResult), chunk(string), done(TurnResult), error({ error }).
   * @returns {400} Si le choix est invalide et aucun texte libre n'est fourni.
   * @returns {404} Si la session ou le personnage n'existe pas.
   */
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

    // Résolution du jet de dé actif si le choix l'exige (ex: "Forcer la porte" → Force DC 12)
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
    // Deux adaptateurs LLM : main pour la narration, summarizer pour les résumés de beats
    const { main, summarizer } = createAdaptersFromEnv();

    // En-têtes SSE pour le streaming de la narration
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

      // Évalue les conséquences du tour : mise à jour BDD, changements d'état, transition de beat
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

  /**
   * POST /api/game/:id/turn
   * @description Traite un tour de jeu en mode classique (réponse JSON complète, sans streaming).
   * Même logique que l'endpoint SSE mais renvoie directement le résultat complet.
   * @param {string} id - Identifiant de la session de jeu.
   * @param {string} body.choiceId - ID du choix sélectionné par le joueur.
   * @param {string} [body.freeText] - Texte libre si le joueur écrit sa propre action.
   * @param {Choice[]} [body.previousChoices] - Choix proposés au tour précédent.
   * @returns {{ output, diceResult, stateLog, beatTransitioned, newBeat, gameCompleted, session, character, pacing }}
   * @returns {400} Si le choix est invalide et aucun texte libre n'est fourni.
   * @returns {404} Si la session ou le personnage n'existe pas.
   * @returns {500} Si le traitement du tour échoue.
   */
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

      // Renvoie l'état mis à jour directement depuis evaluateTurn — évite les relectures BDD inutiles
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
