// TypeScript ne copie pas les ressources lues sur disque par le serveur.
// Le dossier dist doit fonctionner sans dépendre de src ni d'une base locale.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const directory of ['client', 'books', 'prompts/templates']) {
  const destination = join(root, 'dist', directory);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(root, 'src', directory), destination, { recursive: true });
}
cpSync(join(root, 'src/memory/persistent/schema.sql'), join(root, 'dist/memory/persistent/schema.sql'));
console.log('Runtime prêt : client, livres, templates et schéma copiés dans dist.');
