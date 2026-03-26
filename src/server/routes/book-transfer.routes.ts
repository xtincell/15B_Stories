/**
 * @module server/routes/book-transfer
 * @description Routes d'import/export de livres de jeu au format ZIP.
 * Permet le téléchargement d'un livre existant, l'upload et l'installation
 * d'un nouveau livre, ainsi que la validation de la structure d'un ZIP
 * sans l'installer.
 */

import type { FastifyPluginAsync } from 'fastify';
import { createWriteStream, existsSync, mkdirSync, cpSync, rmSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { tmpdir } from 'os';
import { v4 as uuid } from 'uuid';
import { loadGameBook, clearCache } from '../../memory/documentary/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = join(__dirname, '..', '..', 'books');

// ── Validation ──

/**
 * @description Résultat de la validation structurelle d'un livre de jeu.
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  meta?: Record<string, unknown>;
}

/**
 * @description Valide la structure d'un livre de jeu extrait dans un répertoire temporaire.
 * Vérifie la présence et la conformité de : meta.json, archetypes/, beats/ (15 fichiers),
 * npcs/, lore/ et theme.css. Les erreurs bloquent l'installation, les warnings non.
 * @param {string} extractedDir - Chemin absolu vers le répertoire extrait du ZIP.
 * @returns {ValidationResult} Résultat contenant les erreurs, warnings et métadonnées parsées.
 */
function validateBookStructure(extractedDir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let meta: Record<string, unknown> | undefined;

  // 1. meta.json
  const metaPath = join(extractedDir, 'meta.json');
  if (!existsSync(metaPath)) {
    errors.push('meta.json manquant');
  } else {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      const required = ['id', 'name', 'version', 'description', 'maxHp', 'statNames'];
      for (const field of required) {
        if (!(meta as any)[field]) {
          errors.push(`meta.json: champ requis "${field}" manquant`);
        }
      }
    } catch {
      errors.push('meta.json: JSON invalide');
    }
  }

  // 2. archetypes/
  const archDir = join(extractedDir, 'archetypes');
  const archIndex = join(archDir, 'index.json');
  if (!existsSync(archIndex)) {
    errors.push('archetypes/index.json manquant');
  } else {
    try {
      const idx = JSON.parse(readFileSync(archIndex, 'utf-8'));
      if (!idx.archetypes || idx.archetypes.length === 0) {
        errors.push('archetypes/index.json: aucun archétype listé');
      } else {
        for (const archId of idx.archetypes) {
          if (!existsSync(join(archDir, `${archId}.json`))) {
            errors.push(`archetypes/${archId}.json manquant`);
          }
        }
      }
    } catch {
      errors.push('archetypes/index.json: JSON invalide');
    }
  }

  // 3. beats/ — 15 files
  const beatsDir = join(extractedDir, 'beats');
  if (!existsSync(beatsDir)) {
    errors.push('Dossier beats/ manquant');
  } else {
    const beatFiles = readdirSync(beatsDir).filter(f => f.endsWith('.json'));
    for (let i = 1; i <= 15; i++) {
      const prefix = String(i).padStart(2, '0') + '-';
      if (!beatFiles.some(f => f.startsWith(prefix))) {
        errors.push(`beats/${prefix}*.json manquant (beat ${i})`);
      }
    }
  }

  // 4. npcs/
  const npcsDir = join(extractedDir, 'npcs');
  const npcIndex = join(npcsDir, 'index.json');
  if (!existsSync(npcIndex)) {
    errors.push('npcs/index.json manquant');
  } else {
    try {
      const idx = JSON.parse(readFileSync(npcIndex, 'utf-8'));
      if (!idx.npcs || idx.npcs.length === 0) {
        errors.push('npcs/index.json: aucun PNJ listé');
      } else {
        for (const npcId of idx.npcs) {
          if (!existsSync(join(npcsDir, `${npcId}.json`))) {
            warnings.push(`npcs/${npcId}.json manquant`);
          }
        }
      }
    } catch {
      errors.push('npcs/index.json: JSON invalide');
    }
  }

  // 5. lore/
  const loreDir = join(extractedDir, 'lore');
  if (!existsSync(join(loreDir, 'world.md'))) {
    warnings.push('lore/world.md manquant');
  }

  // 6. theme.css (optional but recommended)
  if (!existsSync(join(extractedDir, 'theme.css'))) {
    warnings.push('theme.css manquant — le thème par défaut sera utilisé');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    meta,
  };
}

/**
 * @description Extrait un ZIP dans un répertoire temporaire unique.
 * Gère le cas courant d'un ZIP contenant un unique dossier racine
 * (ex: livre.zip → livre/ → meta.json) en remontant d'un niveau.
 * @param {Buffer} zipBuffer - Contenu brut du fichier ZIP en mémoire.
 * @returns {string} Chemin absolu vers le répertoire contenant les fichiers du livre.
 */
function extractZipToTemp(zipBuffer: Buffer): string {
  const zip = new AdmZip(zipBuffer);
  const tempDir = join(tmpdir(), `a15-book-${uuid()}`);
  mkdirSync(tempDir, { recursive: true });
  zip.extractAllTo(tempDir, true);

  // Check if all entries are inside a single root folder
  const entries = readdirSync(tempDir);
  if (entries.length === 1) {
    const singleDir = join(tempDir, entries[0]);
    try {
      const stat = readFileSync(join(singleDir, 'meta.json'), 'utf-8');
      // It's a nested folder containing the book — use it directly
      return singleDir;
    } catch {
      // Not a valid book folder inside, use tempDir as-is
    }
  }

  return tempDir;
}

// ── Routes ──

/**
 * @description Plugin Fastify regroupant les routes d'import/export de livres.
 * Préfixe attendu : /api/books
 */
export const bookTransferRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/books/:id/download
   * @description Télécharge un livre de jeu complet sous forme d'archive ZIP.
   * @param {string} id - Identifiant unique du livre (ex: "kinara").
   * @returns {Stream} Flux ZIP en pièce jointe (Content-Disposition: attachment).
   * @returns {404} Si le livre n'existe pas.
   */
  app.get<{ Params: { id: string } }>('/:id/download', async (request, reply) => {
    const bookId = request.params.id;

    // Verify book exists
    try {
      loadGameBook(bookId);
    } catch {
      return reply.status(404).send({ error: `Livre "${bookId}" introuvable` });
    }

    const bookDir = join(BOOKS_DIR, bookId);
    if (!existsSync(bookDir)) {
      return reply.status(404).send({ error: `Dossier du livre "${bookId}" introuvable` });
    }

    // Hijack empêche Fastify de sérialiser la réponse — nécessaire pour le streaming binaire
    reply.hijack();

    // Stream ZIP response
    reply.raw.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${bookId}.zip"`,
    });

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      app.log.error(err);
      reply.raw.end();
    });

    archive.pipe(reply.raw);
    archive.directory(bookDir, bookId);
    await archive.finalize();
  });

  /**
   * POST /api/books/upload
   * @description Upload et installation d'un livre depuis un fichier ZIP (multipart).
   * Le ZIP est validé structurellement avant installation. En cas de conflit d'ID, renvoie 409.
   * @param {File} file - Fichier ZIP envoyé en multipart/form-data.
   * @returns {{ success: boolean, bookId: string, warnings: string[] }} 200 si installé.
   * @returns {400} Si aucun fichier ou ZIP invalide.
   * @returns {409} Si un livre avec le même ID existe déjà.
   * @returns {422} Si la structure du livre est invalide (détails dans errors[]).
   */
  app.post('/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'Aucun fichier reçu' });
    }

    // Read file into buffer
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const zipBuffer = Buffer.concat(chunks);

    // Extract to temp
    let extractedDir: string;
    try {
      extractedDir = extractZipToTemp(zipBuffer);
    } catch (err: any) {
      return reply.status(400).send({ error: `ZIP invalide: ${err.message}` });
    }

    // Validate
    const validation = validateBookStructure(extractedDir);

    if (!validation.valid) {
      // Cleanup temp
      try { rmSync(extractedDir, { recursive: true, force: true }); } catch {}
      return reply.status(422).send({
        error: 'Structure du livre invalide',
        errors: validation.errors,
        warnings: validation.warnings,
        canTransform: true,
        meta: validation.meta,
      });
    }

    // Check for ID conflict
    const bookId = (validation.meta as any)?.id;
    if (!bookId) {
      try { rmSync(extractedDir, { recursive: true, force: true }); } catch {}
      return reply.status(422).send({ error: 'meta.json: champ "id" manquant' });
    }

    const targetDir = join(BOOKS_DIR, bookId);
    if (existsSync(targetDir)) {
      try { rmSync(extractedDir, { recursive: true, force: true }); } catch {}
      return reply.status(409).send({ error: `Un livre avec l'ID "${bookId}" existe déjà` });
    }

    // Copie le livre validé dans le répertoire définitif et vide le cache du loader
    try {
      cpSync(extractedDir, targetDir, { recursive: true });
      clearCache();
    } catch (err: any) {
      try { rmSync(targetDir, { recursive: true, force: true }); } catch {}
      return reply.status(500).send({ error: `Erreur d'installation: ${err.message}` });
    } finally {
      try { rmSync(extractedDir, { recursive: true, force: true }); } catch {}
    }

    return {
      success: true,
      bookId,
      warnings: validation.warnings,
    };
  });

  /**
   * POST /api/books/validate
   * @description Valide la structure d'un livre ZIP sans l'installer.
   * Utile pour le client afin de pré-vérifier un fichier avant l'upload définitif.
   * @param {File} file - Fichier ZIP envoyé en multipart/form-data.
   * @returns {ValidationResult} Résultat de validation (valid, errors, warnings, meta).
   * @returns {400} Si aucun fichier ou ZIP invalide.
   */
  app.post('/validate', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'Aucun fichier reçu' });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const zipBuffer = Buffer.concat(chunks);

    let extractedDir: string;
    try {
      extractedDir = extractZipToTemp(zipBuffer);
    } catch (err: any) {
      return reply.status(400).send({ error: `ZIP invalide: ${err.message}` });
    }

    const validation = validateBookStructure(extractedDir);

    // Cleanup temp
    try { rmSync(extractedDir, { recursive: true, force: true }); } catch {}

    return validation;
  });
};
