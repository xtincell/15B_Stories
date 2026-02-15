import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { BeatDefinition, NPCProfile, Archetype, GameBookMeta } from '../../types/game.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = join(__dirname, '..', '..', 'books');

let cache: Map<string, GameBook> = new Map();

export interface GameBook {
  meta: GameBookMeta;
  beats: BeatDefinition[];
  npcs: Map<string, NPCProfile>;
  archetypes: Map<string, Archetype>;
  lore: Map<string, string>;        // key -> markdown content
  locations: Map<string, string>;    // locationId -> markdown content
}

/**
 * Load a game book from disk. Caches after first load.
 */
export function loadGameBook(bookId: string): GameBook {
  const cached = cache.get(bookId);
  if (cached) return cached;

  const bookDir = join(BOOKS_DIR, bookId);
  if (!existsSync(bookDir)) {
    throw new Error(`Game book "${bookId}" not found at ${bookDir}`);
  }

  const meta = readJson<GameBookMeta>(join(bookDir, 'meta.json'));

  // Load beats
  const beats: BeatDefinition[] = [];
  for (let i = 1; i <= 15; i++) {
    const num = String(i).padStart(2, '0');
    const beatFiles = [
      join(bookDir, 'beats', `${num}-*.json`),
    ];
    // Try to find the beat file by scanning
    const beatFile = findBeatFile(bookDir, i);
    if (beatFile) {
      beats.push(readJson<BeatDefinition>(beatFile));
    }
  }

  // Load NPCs
  const npcs = new Map<string, NPCProfile>();
  const npcIndex = readJsonSafe<{ npcs: string[] }>(join(bookDir, 'npcs', 'index.json'));
  if (npcIndex) {
    for (const npcId of npcIndex.npcs) {
      const npc = readJsonSafe<NPCProfile>(join(bookDir, 'npcs', `${npcId}.json`));
      if (npc) npcs.set(npcId, npc);
    }
  }

  // Load archetypes
  const archetypes = new Map<string, Archetype>();
  const archIndex = readJsonSafe<{ archetypes: string[] }>(join(bookDir, 'archetypes', 'index.json'));
  if (archIndex) {
    for (const archId of archIndex.archetypes) {
      const arch = readJsonSafe<Archetype>(join(bookDir, 'archetypes', `${archId}.json`));
      if (arch) archetypes.set(archId, arch);
    }
  }

  // Load lore files (dynamic via loreManifest, backward compatible)
  const lore = new Map<string, string>();
  const loreFiles = meta.loreManifest?.files ?? ['world.md', 'history.md', 'spirits.md'];
  for (const file of loreFiles) {
    const path = join(bookDir, 'lore', file);
    if (existsSync(path)) {
      const key = file.replace('.md', '');
      lore.set(key, readFileSync(path, 'utf-8'));
    }
  }

  // Load location files (dynamic directory via loreManifest)
  const locations = new Map<string, string>();
  const locDirName = meta.loreManifest?.locationsDir ?? 'lore/locations';
  const locDir = join(bookDir, locDirName);
  if (existsSync(locDir)) {
    try {
      const files = readdirSync(locDir) as string[];
      for (const file of files) {
        if (file.endsWith('.md')) {
          const key = file.replace('.md', '');
          locations.set(key, readFileSync(join(locDir, file), 'utf-8'));
        }
      }
    } catch {
      // locations dir may not exist yet
    }
  }

  const book: GameBook = { meta, beats, npcs, archetypes, lore, locations };
  cache.set(bookId, book);
  return book;
}

export function clearCache(): void {
  cache.clear();
}

// ── Helpers ──

function readJson<T>(path: string): T {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as T;
}

function readJsonSafe<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return readJson<T>(path);
  } catch {
    return null;
  }
}

function findBeatFile(bookDir: string, beatNumber: number): string | null {
  const beatsDir = join(bookDir, 'beats');
  if (!existsSync(beatsDir)) return null;

  const prefix = String(beatNumber).padStart(2, '0') + '-';
  try {
    const files = readdirSync(beatsDir) as string[];
    const match = files.find((f: string) => f.startsWith(prefix) && f.endsWith('.json'));
    return match ? join(beatsDir, match) : null;
  } catch {
    return null;
  }
}
