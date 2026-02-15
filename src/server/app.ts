import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebSocket from '@fastify/websocket';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gameRoutes } from './routes/game.routes.js';
import { turnRoutes } from './routes/turn.routes.js';
import { characterRoutes } from './routes/character.routes.js';
import { saveRoutes } from './routes/save.routes.js';
import { booksRoutes } from './routes/books.routes.js';
import { generatorRoutes } from './routes/generator.routes.js';
import { bookTransferRoutes } from './routes/book-transfer.routes.js';
import { roomRoutes } from './routes/room.routes.js';
import { wsRoutes } from './routes/ws.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function buildApp() {
  const app = Fastify({ logger: true });

  // CORS
  app.register(fastifyCors, { origin: true });

  // Multipart (for file uploads)
  app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

  // WebSocket (for multiplayer)
  app.register(fastifyWebSocket);

  // Serve client static files
  app.register(fastifyStatic, {
    root: join(__dirname, '..', 'client'),
    prefix: '/',
  });

  // Serve book assets (cover images, etc.)
  app.register(fastifyStatic, {
    root: join(__dirname, '..', 'books'),
    prefix: '/books/',
    decorateReply: false, // avoid conflict with first fastifyStatic
  });

  // API routes
  app.register(booksRoutes, { prefix: '/api/books' });
  app.register(generatorRoutes, { prefix: '/api/books' });
  app.register(bookTransferRoutes, { prefix: '/api/books' });
  app.register(gameRoutes, { prefix: '/api/game' });
  app.register(turnRoutes, { prefix: '/api/game' });
  app.register(characterRoutes, { prefix: '/api/game' });
  app.register(saveRoutes, { prefix: '/api' });
  app.register(roomRoutes, { prefix: '/api/rooms' });
  app.register(wsRoutes, { prefix: '/api/ws' });

  // Health check
  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
