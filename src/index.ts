import dotenv from 'dotenv';
dotenv.config({ override: true });
import { buildApp } from './server/app.js';
import { getDb, closeDb } from './memory/persistent/db.js';

const PORT = parseInt(process.env.PORT ?? '3017', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main() {
  // Initialize database
  getDb();
  console.log('Database initialized');

  // Build and start server
  const app = buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`KinChat server running at http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    closeDb();
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    await app.close();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
