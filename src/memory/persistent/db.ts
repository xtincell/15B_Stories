import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(__dirname, '..', '..', '..', 'data', 'kinchat.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    runMigrations(db);
  }
  return db;
}

function initSchema(database: Database.Database): void {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
}

function runMigrations(database: Database.Database): void {
  // Characters table migrations
  const charCols = database.pragma('table_info(characters)') as any[];
  const charColNames = charCols.map((c: any) => c.name);

  if (!charColNames.includes('gender')) {
    database.exec("ALTER TABLE characters ADD COLUMN gender TEXT NOT NULL DEFAULT 'masculin'");
  }
  if (!charColNames.includes('archetype_id')) {
    database.exec("ALTER TABLE characters ADD COLUMN archetype_id TEXT NOT NULL DEFAULT ''");
  }

  // Sessions table migrations
  const sessCols = database.pragma('table_info(sessions)') as any[];
  const sessColNames = sessCols.map((c: any) => c.name);

  if (!sessColNames.includes('status')) {
    database.exec("ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress'");
  }
  if (!sessColNames.includes('completed_at')) {
    database.exec("ALTER TABLE sessions ADD COLUMN completed_at TEXT");
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
