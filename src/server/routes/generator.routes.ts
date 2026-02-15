import type { FastifyPluginAsync } from 'fastify';
import { generateBook, type BookPitch } from '../../engine/book-generator.js';

export const generatorRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /api/books/generate — Generate a new book from a pitch (SSE streaming)
   */
  app.post<{ Body: BookPitch }>('/generate', async (request, reply) => {
    const pitch = request.body;

    if (!pitch.name || !pitch.description) {
      return reply.status(400).send({ error: 'name and description are required' });
    }

    // Default values
    pitch.tone = pitch.tone || 'epique';
    pitch.language = pitch.language || 'fr';

    // Set SSE headers (same pattern as turn.routes.ts)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

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
