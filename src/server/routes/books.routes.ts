import type { FastifyPluginAsync } from 'fastify';
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadGameBook } from '../../memory/documentary/loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = join(__dirname, '..', '..', 'books');

export const booksRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/books - List all available game books
  app.get('/', async (_request, reply) => {
    if (!existsSync(BOOKS_DIR)) {
      return reply.status(500).send({ error: 'Books directory not found' });
    }

    const bookDirs = readdirSync(BOOKS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    const books = [];
    for (const bookId of bookDirs) {
      try {
        const book = loadGameBook(bookId);
        books.push({
          id: book.meta.id,
          name: book.meta.name,
          version: book.meta.version,
          description: book.meta.description,
          author: book.meta.author ?? null,
          subtitle: book.meta.subtitle ?? null,
          tagline: book.meta.tagline ?? null,
          iconSymbol: book.meta.iconSymbol ?? null,
          tags: book.meta.tags ?? [],
          language: book.meta.language ?? 'fr',
          archetypeCount: book.archetypes.size,
          beatCount: book.beats.length,
        });
      } catch (err: any) {
        app.log.warn(`Skipping book "${bookId}": ${err.message}`);
      }
    }

    return { books };
  });

  // GET /api/books/:id/meta - Get full metadata for a specific book
  app.get<{ Params: { id: string } }>('/:id/meta', async (request, reply) => {
    try {
      const book = loadGameBook(request.params.id);
      return book.meta;
    } catch {
      return reply.status(404).send({ error: `Book "${request.params.id}" not found` });
    }
  });

  // GET /api/books/:id/glossary - Get term glossary for tooltips
  app.get<{ Params: { id: string } }>('/:id/glossary', async (request, reply) => {
    try {
      const book = loadGameBook(request.params.id);
      const glossary: { term: string; type: string; definition: string }[] = [];

      // NPCs → name, title, personality summary
      for (const [, npc] of book.npcs) {
        const parts: string[] = [];
        if (npc.title) parts.push(npc.title);
        if (npc.personality) parts.push(npc.personality);
        if (npc.motivations) parts.push(npc.motivations);
        glossary.push({
          term: npc.name,
          type: 'npc',
          definition: parts.join('. ').slice(0, 200),
        });
      }

      // Locations → first sentence of markdown content
      for (const [locId, content] of book.locations) {
        // Extract location name: use first heading or capitalize the ID
        const headingMatch = content.match(/^#\s+(.+)/m);
        const name = headingMatch ? headingMatch[1].trim() : locId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        // Extract first meaningful sentence
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        const firstSentence = lines[0]?.trim().slice(0, 200) || '';

        glossary.push({
          term: name,
          type: 'location',
          definition: firstSentence,
        });
      }

      // Lore terms → extract headings and bold terms from lore files
      for (const [, content] of book.lore) {
        // Extract ## headings as lore terms
        const headings = content.matchAll(/^##\s+(.+)/gm);
        for (const match of headings) {
          const heading = match[1].trim();
          // Skip very short or generic headings
          if (heading.length < 3) continue;

          // Get the paragraph following this heading
          const idx = content.indexOf(match[0]);
          const rest = content.slice(idx + match[0].length).trim();
          const firstLine = rest.split('\n').find(l => l.trim() && !l.startsWith('#'));
          const definition = firstLine?.trim().slice(0, 200) || '';

          // Avoid duplicates
          if (!glossary.some(g => g.term.toLowerCase() === heading.toLowerCase())) {
            glossary.push({ term: heading, type: 'lore', definition });
          }
        }
      }

      return { glossary };
    } catch {
      return reply.status(404).send({ error: `Book "${request.params.id}" not found` });
    }
  });
};
