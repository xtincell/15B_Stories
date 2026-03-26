/**
 * @module loader
 * @description Chargeur de livres de jeu depuis le système de fichiers.
 * Lit et assemble les différentes ressources d'un livre (beats, PNJ, archétypes,
 * lore, lieux) en une structure unifiée GameBook, avec mise en cache pour
 * éviter les lectures disque répétées.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { BeatDefinition, NPCProfile, Archetype, GameBookMeta } from '../../types/game.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = join(__dirname, '..', '..', 'books');

/** Cache en mémoire des livres déjà chargés, indexé par bookId */
let cache: Map<string, GameBook> = new Map();

/**
 * @description Structure complète d'un livre de jeu chargé en mémoire.
 * Regroupe toutes les données statiques nécessaires au déroulement d'une aventure.
 */
export interface GameBook {
  meta: GameBookMeta;
  beats: BeatDefinition[];
  npcs: Map<string, NPCProfile>;
  archetypes: Map<string, Archetype>;
  lore: Map<string, string>;        // clé -> contenu markdown
  locations: Map<string, string>;    // identifiant lieu -> contenu markdown
}

/**
 * @description Charge un livre de jeu depuis le disque et le met en cache.
 * Assemble toutes les ressources (méta, beats, PNJ, archétypes, lore, lieux)
 * en une structure GameBook unique. Les appels ultérieurs renvoient le cache.
 * @param {string} bookId - Identifiant unique du livre (correspond au nom du dossier)
 * @returns {GameBook} Le livre de jeu complet
 * @throws {Error} Si le dossier du livre n'existe pas
 */
export function loadGameBook(bookId: string): GameBook {
  const cached = cache.get(bookId);
  if (cached) return cached;

  const bookDir = join(BOOKS_DIR, bookId);
  if (!existsSync(bookDir)) {
    throw new Error(`Game book "${bookId}" not found at ${bookDir}`);
  }

  const meta = readJson<GameBookMeta>(join(bookDir, 'meta.json'));

  // Chargement des 15 beats (structure narrative fixe du jeu)
  const beats: BeatDefinition[] = [];
  for (let i = 1; i <= 15; i++) {
    const num = String(i).padStart(2, '0');
    const beatFiles = [
      join(bookDir, 'beats', `${num}-*.json`),
    ];
    // Recherche par scan du dossier car le suffixe du fichier varie selon le beat
    const beatFile = findBeatFile(bookDir, i);
    if (beatFile) {
      beats.push(readJson<BeatDefinition>(beatFile));
    }
  }

  // Chargement des PNJ via leur fichier d'index
  const npcs = new Map<string, NPCProfile>();
  const npcIndex = readJsonSafe<{ npcs: string[] }>(join(bookDir, 'npcs', 'index.json'));
  if (npcIndex) {
    for (const npcId of npcIndex.npcs) {
      const npc = readJsonSafe<NPCProfile>(join(bookDir, 'npcs', `${npcId}.json`));
      if (npc) npcs.set(npcId, npc);
    }
  }

  // Chargement des archétypes de personnages jouables
  const archetypes = new Map<string, Archetype>();
  const archIndex = readJsonSafe<{ archetypes: string[] }>(join(bookDir, 'archetypes', 'index.json'));
  if (archIndex) {
    for (const archId of archIndex.archetypes) {
      const arch = readJsonSafe<Archetype>(join(bookDir, 'archetypes', `${archId}.json`));
      if (arch) archetypes.set(archId, arch);
    }
  }

  // Chargement du lore : utilise le manifeste si disponible, sinon fichiers par défaut
  // pour assurer la rétrocompatibilité avec les anciens livres
  const lore = new Map<string, string>();
  const loreFiles = meta.loreManifest?.files ?? ['world.md', 'history.md', 'spirits.md'];
  for (const file of loreFiles) {
    const path = join(bookDir, 'lore', file);
    if (existsSync(path)) {
      const key = file.replace('.md', '');
      lore.set(key, readFileSync(path, 'utf-8'));
    }
  }

  // Chargement des descriptions de lieux depuis un dossier configurable
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
      // Le dossier de lieux peut ne pas encore exister pour les nouveaux livres
    }
  }

  const book: GameBook = { meta, beats, npcs, archetypes, lore, locations };
  cache.set(bookId, book);
  return book;
}

/**
 * @description Vide le cache des livres de jeu.
 * Utile pour forcer un rechargement après modification des fichiers sur disque.
 */
export function clearCache(): void {
  cache.clear();
}

// ── Utilitaires de lecture ──

/**
 * @description Lit et parse un fichier JSON. Lève une exception si le fichier est absent ou invalide.
 * @param {string} path - Chemin absolu du fichier JSON
 * @returns {T} Objet parsé typé
 */
function readJson<T>(path: string): T {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * @description Variante tolérante de readJson : retourne null si le fichier est absent ou corrompu.
 * @param {string} path - Chemin absolu du fichier JSON
 * @returns {T | null} Objet parsé ou null en cas d'erreur
 */
function readJsonSafe<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return readJson<T>(path);
  } catch {
    return null;
  }
}

/**
 * @description Trouve le fichier de beat correspondant à un numéro dans le répertoire beats/.
 * Les fichiers sont nommés avec un préfixe numérique zéro-padé (ex: "03-revelation.json").
 * @param {string} bookDir - Répertoire racine du livre de jeu
 * @param {number} beatNumber - Numéro du beat à trouver
 * @returns {string | null} Chemin absolu du fichier ou null si introuvable
 */
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
