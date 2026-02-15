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

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  meta?: Record<string, unknown>;
}

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
 * Extract a ZIP into a temp directory, handling nested root folders.
 * If the ZIP contains a single root directory, we use its contents.
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

export const bookTransferRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/books/:id/download — Download a book as ZIP
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

    // Hijack the response so Fastify doesn't try to send its own
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

  // POST /api/books/upload — Upload and install a book from ZIP
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

    // Install: copy from temp to books dir
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

  // POST /api/books/validate — Validate a book ZIP without installing
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
