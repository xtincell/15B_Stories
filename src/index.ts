/**
 * @module index
 * @description Point d'entrée principal du serveur KinChat / 15B Stories.
 * Charge les variables d'environnement, initialise la base de données SQLite,
 * construit l'application Fastify et gère l'arrêt gracieux du processus.
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });
import { buildApp } from './server/app.js';
import { getDb, closeDb } from './memory/persistent/db.js';

const PORT = parseInt(process.env.PORT ?? '3017', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

/**
 * @description Fonction principale asynchrone qui orchestre le démarrage du serveur.
 * Séquence : initialisation BDD → construction de l'app → écoute HTTP → gestion des signaux.
 * @returns {Promise<void>}
 */
async function main() {
  // Initialise la connexion SQLite (crée le fichier si nécessaire)
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

  // Arrêt gracieux : ferme les connexions HTTP puis la BDD avant de quitter
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
