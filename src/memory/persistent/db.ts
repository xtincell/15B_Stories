/**
 * @module db
 * @description Initialisation et gestion de la connexion SQLite.
 * Fournit un singleton de base de données avec initialisation paresseuse,
 * application automatique du schéma et exécution des migrations.
 * Utilise WAL (Write-Ahead Logging) pour de meilleures performances en lecture concurrente.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Singleton de connexion SQLite — initialisé paresseusement au premier appel */
let db: Database.Database | null = null;

/**
 * @description Retourne l'instance singleton de la base de données SQLite.
 * Au premier appel, crée la connexion, active WAL et les clés étrangères,
 * applique le schéma et exécute les migrations pendantes.
 * @returns {Database.Database} Instance de base de données prête à l'emploi
 */
export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(__dirname, '..', '..', '..', 'data', 'kinchat.db');
    db = new Database(dbPath);
    // WAL améliore les performances de lecture concurrente
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    runMigrations(db);
  }
  return db;
}

/**
 * @description Applique le schéma SQL initial depuis le fichier schema.sql.
 * Utilise CREATE TABLE IF NOT EXISTS, donc idempotent.
 * @param {Database.Database} database - Instance de base de données
 */
function initSchema(database: Database.Database): void {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
}

/**
 * @description Exécute les migrations de schéma incrémentales.
 * Vérifie la présence des colonnes avant de les ajouter pour garantir l'idempotence.
 * Chaque migration est un ALTER TABLE conditionnel basé sur PRAGMA table_info.
 * @param {Database.Database} database - Instance de base de données
 */
function runMigrations(database: Database.Database): void {
  // Migrations de la table characters
  const charCols = database.pragma('table_info(characters)') as any[];
  const charColNames = charCols.map((c: any) => c.name);

  if (!charColNames.includes('gender')) {
    database.exec("ALTER TABLE characters ADD COLUMN gender TEXT NOT NULL DEFAULT 'masculin'");
  }
  if (!charColNames.includes('archetype_id')) {
    database.exec("ALTER TABLE characters ADD COLUMN archetype_id TEXT NOT NULL DEFAULT ''");
  }

  // Migrations de la table sessions
  const sessCols = database.pragma('table_info(sessions)') as any[];
  const sessColNames = sessCols.map((c: any) => c.name);

  if (!sessColNames.includes('status')) {
    database.exec("ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress'");
  }
  if (!sessColNames.includes('completed_at')) {
    database.exec("ALTER TABLE sessions ADD COLUMN completed_at TEXT");
  }
}

/**
 * @description Ferme proprement la connexion à la base de données et réinitialise le singleton.
 * À appeler lors de l'arrêt gracieux du serveur.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
