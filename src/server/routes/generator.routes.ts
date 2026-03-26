/**
 * @module server/routes/generator
 * @description Route de génération procédurale de livres de jeu via LLM.
 * Utilise le Server-Sent Events (SSE) pour diffuser la progression en temps réel
 * au client pendant que le moteur génère les fichiers du livre.
 * Préfixe attendu : /api/books
 */

import type { FastifyPluginAsync } from 'fastify';
import { generateBook, type BookPitch } from '../../engine/book-generator.js';

/**
 * @description Plugin Fastify exposant la route de génération de livres.
 */
export const generatorRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /api/books/generate
   * @description Génère un nouveau livre de jeu complet à partir d'un pitch créatif.
   * La progression est diffusée en SSE avec des événements "progress", puis "done" ou "error".
   * @param {string} body.name - Nom du livre à générer.
   * @param {string} body.description - Description/pitch du livre.
   * @param {string} [body.tone=epique] - Ton narratif (épique, sombre, humoristique, etc.).
   * @param {string} [body.language=fr] - Langue de génération.
   * @returns {SSE} Flux d'événements : progress({ step, percent, message }), done({ bookId }), error({ error }).
   * @returns {400} Si name ou description sont manquants.
   */
  app.post<{ Body: BookPitch }>('/generate', async (request, reply) => {
    const pitch = request.body;

    if (!pitch.name || !pitch.description) {
      return reply.status(400).send({ error: 'name and description are required' });
    }

    // Valeurs par défaut pour les champs optionnels du pitch
    pitch.tone = pitch.tone || 'epique';
    pitch.language = pitch.language || 'fr';

    // En-têtes SSE : désactive le buffering pour que chaque événement arrive immédiatement
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    /** Callback de progression envoyé au générateur pour diffuser chaque étape au client */
    const onProgress = (step: string, percent: number, message: string) => {
      reply.raw.write(`event: progress\ndata: ${JSON.stringify({ step, percent, message })}\n\n`);
    };

    try {
      const bookId = await generateBook(pitch, onProgress);
      reply.raw.write(`event: done\ndata: ${JSON.stringify({ bookId })}\n\n`);
      reply.raw.end();
    } catch (err: any) {
      app.log.error(err);
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      reply.raw.end();
    }
  });
};
