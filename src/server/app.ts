/**
 * @module server/app
 * @description Configuration et construction de l'application Fastify.
 * Enregistre tous les plugins (CORS, multipart, WebSocket, fichiers statiques)
 * et monte les routes API sous leurs préfixes respectifs.
 */

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

/**
 * @description Construit et configure l'instance Fastify avec tous les plugins et routes.
 * @returns {import('fastify').FastifyInstance} L'application Fastify prête à écouter.
 */
export function buildApp() {
  const app = Fastify({ logger: true });

  // Autorise toutes les origines pour le développement local et les déploiements flexibles
  app.register(fastifyCors, { origin: true });

  // Support multipart pour l'upload de livres (ZIP jusqu'à 50 Mo)
  app.register(fastifyMultipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  // WebSocket pour le mode multijoueur en temps réel
  app.register(fastifyWebSocket);

  // Sert les fichiers du client (SPA) depuis le dossier compilé
  app.register(fastifyStatic, {
    root: join(__dirname, '..', 'client'),
    prefix: '/',
  });

  // Sert les assets des livres (images de couverture, CSS de thème, etc.)
  app.register(fastifyStatic, {
    root: join(__dirname, '..', 'books'),
    prefix: '/books/',
    decorateReply: false, // évite le conflit avec la première instance de fastifyStatic
  });

  // ── Montage des routes API ──
  // Chaque groupe de routes est isolé dans son propre plugin Fastify
  app.register(booksRoutes, { prefix: '/api/books' });
  app.register(generatorRoutes, { prefix: '/api/books' });
  app.register(bookTransferRoutes, { prefix: '/api/books' });
  app.register(gameRoutes, { prefix: '/api/game' });
  app.register(turnRoutes, { prefix: '/api/game' });
  app.register(characterRoutes, { prefix: '/api/game' });
  app.register(saveRoutes, { prefix: '/api' });
  app.register(roomRoutes, { prefix: '/api/rooms' });
  app.register(wsRoutes, { prefix: '/api/ws' });

  /** GET /api/health — Vérification de santé du serveur */
  app.get('/api/health', async () => ({ status: 'ok' }));

  return app;
}
