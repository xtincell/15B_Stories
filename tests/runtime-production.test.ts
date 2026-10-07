import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary: string[] = [];
const isolatedRuntime = () => {
  const target = mkdtempSync(join(tmpdir(), '15b-runtime-'));
  temporary.push(target);
  writeFileSync(join(target, 'package.json'), JSON.stringify({ type: 'module' }));
  symlinkSync(join(root, 'node_modules'), join(target, 'node_modules'), 'dir');
  return target;
};
const run = (target: string, script: string) => execFileSync(process.execPath,
  ['--input-type=module', '-e', script], { cwd: target, timeout: 30_000, encoding: 'utf8' });

function inventory(directory: string, relative = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of readdirSync(join(directory, relative), { withFileTypes: true })) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) Object.assign(result, inventory(directory, path));
    else result[path] = createHash('sha256').update(readFileSync(join(directory, path))).digest('hex');
  }
  return result;
}

beforeAll(() => {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc'], { cwd: root, timeout: 30_000 });
}, 40_000);
afterAll(() => temporary.forEach((path) => rmSync(path, { recursive: true, force: true })));

describe('Runtime compilé, sans serveur ni données existants', () => {
  it('permet de réessayer une initialisation après une ressource manquante', () => {
    const target = isolatedRuntime();
    const moduleDirectory = join(target, 'dist/memory/persistent');
    mkdirSync(moduleDirectory, { recursive: true });
    mkdirSync(join(target, 'data'));
    cpSync(join(root, 'dist/memory/persistent/db.js'), join(moduleDirectory, 'db.js'));
    run(target, `
      import assert from 'node:assert/strict';
      import { cpSync } from 'node:fs';
      import { getDb, closeDb } from './dist/memory/persistent/db.js';
      assert.throws(() => getDb(), /ENOENT/);
      cpSync(${JSON.stringify(join(root, 'src/memory/persistent/schema.sql'))}, './dist/memory/persistent/schema.sql');
      assert.ok(getDb().prepare("SELECT name FROM sqlite_master WHERE name = 'sessions'").get());
      closeDb();
    `);
  });

  it('initialise une base sur installation vierge et conserve la base au redémarrage', () => {
    const target = isolatedRuntime();
    const dbModule = join(target, 'dist/memory/persistent/db.js');
    mkdirSync(dirname(dbModule), { recursive: true });
    cpSync(join(root, 'dist/memory/persistent/db.js'), dbModule);
    cpSync(join(root, 'src/memory/persistent/schema.sql'), join(dirname(dbModule), 'schema.sql'));
    expect(existsSync(join(target, 'data'))).toBe(false);
    run(target, `
      import assert from 'node:assert/strict';
      import { getDb, closeDb } from './dist/memory/persistent/db.js';
      const db = getDb();
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'sessions'").get());
      db.pragma('user_version = 73');
      closeDb();
      assert.equal(getDb().pragma('user_version', { simple: true }), 73);
      closeDb();
    `);
    expect(existsSync(join(target, 'data/kinchat.db'))).toBe(true);
  });

  it('livre les deux livres intacts, le client et les templates nécessaires au premier tour', () => {
    execFileSync('npm', ['run', 'build'], { cwd: root, timeout: 40_000 });
    for (const directory of ['books', 'client', 'prompts/templates']) {
      expect(inventory(join(root, 'dist', directory))).toEqual(inventory(join(root, 'src', directory)));
    }
    expect(readFileSync(join(root, 'dist/memory/persistent/schema.sql')))
      .toEqual(readFileSync(join(root, 'src/memory/persistent/schema.sql')));

    const target = isolatedRuntime();
    cpSync(join(root, 'dist'), join(target, 'dist'), { recursive: true });
    run(target, `
      import assert from 'node:assert/strict';
      import { writeFileSync } from 'node:fs';
      import { buildApp } from './dist/server/app.js';
      import { getDb, closeDb } from './dist/memory/persistent/db.js';
      import { createNewCharacter } from './dist/engine/character-creation.js';
      import { createSession } from './dist/memory/persistent/world-state.js';
      import { getPacing } from './dist/engine/beat-manager.js';
      import { buildOpeningRequest } from './dist/prompts/system-prompt.js';
      const app = buildApp();
      getDb();
      try {
        const response = await app.inject({ url: '/api/books/' });
        assert.equal(response.statusCode, 200);
        const books = response.json().books;
        assert.deepEqual(books.map(b => b.id).sort(), ['kinara', 'nuit-eternelle']);
        for (const book of books) {
          assert.equal(book.beatCount, 15);
          assert.equal(book.archetypeCount, 4);
          const archetypes = (await app.inject({ url: '/api/game/archetypes?bookId=' + book.id })).json();
          const character = createNewCharacter(book.id, 'Réception locale', archetypes[0].id,
            { ubuntu: 5, maat: 5, sankofa: 5, biso: 5 });
          const session = createSession(character.id, book.id);
          const request = buildOpeningRequest(session, character, getPacing(session.id, 1, book.id));
          assert.ok(request.systemPrompt.length > 100);
          assert.ok(request.conversationHistory[0].content.includes(book.name));
        }
        for (const url of ['/', '/scripts/app.js', '/styles/theme-kinara.css', '/books/nuit-eternelle/theme.css']) {
          assert.equal((await app.inject({ url })).statusCode, 200, url);
        }
        writeFileSync('receipt.json', JSON.stringify({ books: books.map(b => b.id), paidCalls: 0 }));
      } finally { await app.close(); closeDb(); }
    `);
    expect(JSON.parse(readFileSync(join(target, 'receipt.json'), 'utf8')))
      .toEqual({ books: ['kinara', 'nuit-eternelle'], paidCalls: 0 });
  }, 50_000);
});
