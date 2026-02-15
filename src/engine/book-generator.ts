import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createAdaptersFromEnv } from '../llm/factory.js';
import { clearCache } from '../memory/documentary/loader.js';
import type { LLMAdapter } from '../types/llm.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOOKS_DIR = join(__dirname, '..', 'books');

// ── Types ──

export interface BookPitch {
  name: string;
  description: string;
  tone: string;
  language: string;
}

export type ProgressCallback = (step: string, percent: number, message: string) => void;

// ── Main generator ──

export async function generateBook(pitch: BookPitch, onProgress: ProgressCallback): Promise<string> {
  const bookId = slugify(pitch.name);
  const bookDir = join(BOOKS_DIR, bookId);

  if (existsSync(bookDir)) {
    throw new Error(`Le livre "${bookId}" existe deja. Choisissez un autre nom.`);
  }

  const { summarizer } = createAdaptersFromEnv();

  // Step 1: Meta
  onProgress('meta', 5, 'G\u00e9n\u00e9ration des m\u00e9tadonn\u00e9es...');
  const meta = await generateMeta(summarizer, pitch, bookId);
  ensureDir(bookDir);

  // Step 1b: Author voice + loading messages (enriches meta)
  onProgress('meta', 12, 'Cr\u00e9ation de la personnalit\u00e9 narrative...');
  const authorVoice = await generateAuthorVoice(summarizer, pitch, meta);
  meta.authorVoice = authorVoice;
  const loadingMessages = await generateLoadingMessages(summarizer, pitch, meta);
  meta.loadingMessages = loadingMessages;
  writeJson(bookDir, 'meta.json', meta);

  // Step 2: Archetypes
  onProgress('archetypes', 22, 'Cr\u00e9ation des arch\u00e9types...');
  const archetypes = await generateArchetypes(summarizer, pitch, meta);
  writeArchetypes(bookDir, archetypes);

  // Step 3: NPCs
  onProgress('npcs', 38, 'Cr\u00e9ation des personnages...');
  const npcs = await generateNPCs(summarizer, pitch, meta, archetypes);
  writeNPCs(bookDir, npcs);

  // Step 4: Beats 1-8
  onProgress('beats_1_8', 52, '\u00c9criture des beats 1\u20138...');
  const beatsFirst = await generateBeats(summarizer, pitch, meta, npcs, 1, 8);

  // Step 5: Beats 9-15
  onProgress('beats_9_15', 68, '\u00c9criture des beats 9\u201315...');
  const beatsSecond = await generateBeats(summarizer, pitch, meta, npcs, 9, 15, beatsFirst);
  const allBeats = [...beatsFirst, ...beatsSecond];
  writeBeats(bookDir, allBeats);

  // Step 6: Lore
  onProgress('lore', 82, 'R\u00e9daction du lore...');
  const lore = await generateLore(summarizer, pitch, meta);
  writeLore(bookDir, lore);

  // Step 7: Theme CSS (merged into lore step for UI)
  onProgress('lore', 92, 'Finalisation du th\u00e8me...');
  const themeCss = buildThemeCSS(pitch.tone, bookId);
  ensureDir(join(bookDir));
  writeFileSync(join(bookDir, 'theme.css'), themeCss, 'utf-8');

  // Clear loader cache so the new book is discovered
  clearCache();

  return bookId;
}

// ── Step 1: Meta ──

async function generateMeta(llm: LLMAdapter, pitch: BookPitch, bookId: string): Promise<any> {
  const systemPrompt = `Tu es un concepteur de livres-jeu narratifs interactifs. Tu generes des fichiers JSON parfaitement structures.
IMPORTANT: Reponds UNIQUEMENT avec du JSON valide, sans texte avant ni apres. Pas de markdown, pas de commentaires.`;

  const userPrompt = `Genere le fichier meta.json pour un livre-jeu base sur ce pitch:

Nom: ${pitch.name}
Description: ${pitch.description}
Tonalite: ${pitch.tone}
Langue: ${pitch.language}

Le JSON doit suivre EXACTEMENT cette structure:
{
  "id": "${bookId}",
  "name": "${pitch.name}",
  "version": "1.0.0",
  "description": "<description concise 1-2 phrases>",
  "maxHp": 20,
  "author": "Projet A15 Generator",
  "language": "${pitch.language}",
  "subtitle": "<sous-titre court evocateur>",
  "tagline": "<phrase d'accroche immersive>",
  "iconSymbol": "<un seul symbole unicode evocateur>",
  "tags": ["tag1", "tag2", "tag3"],
  "statNames": {
    "ubuntu": "<nom thematique pour la stat communaute/empathie>",
    "maat": "<nom thematique pour la stat verite/justice>",
    "sankofa": "<nom thematique pour la stat tradition/memoire>",
    "biso": "<nom thematique pour la stat audace/innovation>"
  },
  "statDescriptions": {
    "ubuntu": { "subtitle": "<2-3 mots>", "axis": "<axe thematique>" },
    "maat": { "subtitle": "<2-3 mots>", "axis": "<axe thematique>" },
    "sankofa": { "subtitle": "<2-3 mots>", "axis": "<axe thematique>" },
    "biso": { "subtitle": "<2-3 mots>", "axis": "<axe thematique>" }
  },
  "personalityGenderMaps": {
    "<trait_id>": { "masculin": "<nom masc>", "feminin": "<nom fem>", "neutre": "<nom neutre>" }
  },
  "archetypeGenderMaps": {},
  "archetypeDescriptions": {},
  "loreManifest": { "files": ["world.md", "history.md"], "locationsDir": "lore/locations" },
  "theme": { "cssFile": "/books/${bookId}/theme.css" }
}

REGLES:
- Les 4 cles de stats sont TOUJOURS ubuntu, maat, sankofa, biso (cles internes fixes)
- Seuls les noms d'affichage changent via statNames
- personalityGenderMaps doit contenir exactement 6 traits de personnalite adaptes a l'univers
- Chaque trait a les formes masculin, feminin, neutre
- iconSymbol = un seul caractere unicode`;

  const raw = await llm.generate(systemPrompt, userPrompt, 2048);
  return extractJson(raw);
}

// ── Step 2: Archetypes ──

async function generateArchetypes(llm: LLMAdapter, pitch: BookPitch, meta: any): Promise<any[]> {
  const systemPrompt = `Tu es un concepteur de livres-jeu narratifs. Tu generes des fichiers JSON parfaitement structures.
IMPORTANT: Reponds UNIQUEMENT avec du JSON valide (un tableau), sans texte avant ni apres.`;

  const userPrompt = `Genere exactement 4 archetypes de personnage pour ce livre-jeu:

Univers: ${pitch.name} - ${pitch.description}
Tonalite: ${pitch.tone}
Stats du jeu: ${JSON.stringify(meta.statNames)}

Chaque archetype doit etre un objet JSON:
{
  "id": "<identifiant-kebab-case>",
  "name": "<nom affiche>",
  "description": "<description narrative riche, 3-4 phrases, en ${pitch.language}>",
  "suggestedStats": { "ubuntu": <1-10>, "maat": <1-10>, "sankofa": <1-10>, "biso": <1-10> },
  "startingItems": ["<item-id-kebab>", "<item-id-kebab>"],
  "backstoryHook": "<paragraphe d'accroche en 2e personne, en ${pitch.language}>",
  "genderMap": { "masculin": "<nom gendered masc>", "feminin": "<nom fem>", "neutre": "<nom neutre>" }
}

REGLES:
- Le total de suggestedStats doit etre 20
- Chaque stat entre 1 et 10
- Les 4 archetypes doivent etre equilibres et distincts
- Chacun doit exceller dans une stat differente
- startingItems: 2 objets uniques par archetype
- La description et le backstoryHook doivent etre en ${pitch.language}

Reponds avec un tableau JSON de 4 archetypes: [archetype1, archetype2, archetype3, archetype4]`;

  const raw = await llm.generate(systemPrompt, userPrompt, 3000);
  return extractJson(raw) as any[];
}

// ── Step 3: NPCs ──

async function generateNPCs(llm: LLMAdapter, pitch: BookPitch, meta: any, archetypes: any[]): Promise<any[]> {
  const systemPrompt = `Tu es un concepteur de livres-jeu narratifs. Tu generes des fichiers JSON parfaitement structures.
IMPORTANT: Reponds UNIQUEMENT avec du JSON valide (un tableau), sans texte avant ni apres.`;

  const archetypeNames = archetypes.map(a => a.name).join(', ');

  const userPrompt = `Genere exactement 7 PNJ (personnages non-joueurs) pour ce livre-jeu:

Univers: ${pitch.name} - ${pitch.description}
Tonalite: ${pitch.tone}
Archetypes disponibles: ${archetypeNames}

L'histoire suit une structure en 15 beats (actes narratifs). Les PNJ doivent couvrir ces roles:
- 1 mentor/guide (present tot, revele des verites)
- 1 ami/allie proche (ancrage emotionnel)
- 1 interest romantique OU figure B-Story (miroir thematique)
- 1 figure d'autorite (juge, chef, etc.)
- 1 etre surnaturel/mystique (esprit, creature, etc.)
- 1 inventeur/specialiste (aide pratique)
- 1 antagoniste principal (menace croissante)

Chaque PNJ:
{
  "id": "<identifiant-kebab-case>",
  "name": "<prenom>",
  "title": "<titre/role>",
  "personality": "<personnalite detaillee, 3-4 phrases, en ${pitch.language}>",
  "motivations": "<motivations profondes, 2-3 phrases, en ${pitch.language}>",
  "defaultAffinity": <nombre entre -5 et 5>,
  "beatRoles": {
    "<numero_beat>": "<role du PNJ dans ce beat, 1-2 phrases, en ${pitch.language}>"
  }
}

REGLES:
- L'antagoniste a une defaultAffinity negative (-3 a -5)
- Le mentor a une defaultAffinity positive (2 a 4)
- beatRoles: seulement les beats ou le PNJ est actif (pas tous les 15)
- Chaque PNJ doit apparaitre dans au moins 3 beats
- L'antagoniste monte en presence du beat 4 au beat 14

Reponds avec un tableau JSON de 7 PNJ: [npc1, npc2, ..., npc7]`;

  const raw = await llm.generate(systemPrompt, userPrompt, 4096);
  return extractJson(raw) as any[];
}

// ── Step 4 & 5: Beats ──

const BEAT_NAMES = [
  'Opening Image', 'Theme Stated', 'Set-Up', 'Catalyst', 'Debate',
  'Break into Two', 'B Story', 'Fun and Games', 'Midpoint',
  'Bad Guys Close In', 'All Is Lost', 'Dark Night of the Soul',
  'Break into Three', 'Finale', 'Final Image',
];

const BEAT_DCS = [8, 8, 8, 10, 10, 10, 12, 12, 12, 14, 14, 14, 16, 16, 16];

const TENSION_CURVES: Record<number, string> = {
  1: 'plateau', 2: 'plateau', 3: 'rising',
  4: 'rising', 5: 'plateau', 6: 'rising',
  7: 'plateau', 8: 'rising', 9: 'climax',
  10: 'rising', 11: 'climax', 12: 'falling',
  13: 'rising', 14: 'climax', 15: 'falling',
};

const EMOTIONAL_TONES: Record<number, string> = {
  1: 'serenity', 2: 'serenity', 3: 'wonder',
  4: 'dread', 5: 'tension', 6: 'hope',
  7: 'wonder', 8: 'wonder', 9: 'dread',
  10: 'dread', 11: 'grief', 12: 'grief',
  13: 'hope', 14: 'tension', 15: 'serenity',
};

async function generateBeats(
  llm: LLMAdapter,
  pitch: BookPitch,
  meta: any,
  npcs: any[],
  from: number,
  to: number,
  previousBeats?: any[],
): Promise<any[]> {
  const systemPrompt = `Tu es un concepteur de livres-jeu narratifs suivant la structure des 15 beats de Blake Snyder.
IMPORTANT: Reponds UNIQUEMENT avec du JSON valide (un tableau), sans texte avant ni apres.`;

  const npcSummary = npcs.map(n => `${n.id}: ${n.name} (${n.title})`).join('\n');

  const previousContext = previousBeats
    ? `\nBeats precedents deja ecrits:\n${previousBeats.map(b => `Beat ${b.number} "${b.name}": ${b.narrativeGoal}`).join('\n')}\n`
    : '';

  const beatsToGenerate = [];
  for (let i = from; i <= to; i++) {
    beatsToGenerate.push(`Beat ${i}: "${BEAT_NAMES[i - 1]}" (DC: ${BEAT_DCS[i - 1]})`);
  }

  const userPrompt = `Genere les beats ${from} a ${to} pour ce livre-jeu:

Univers: ${pitch.name} - ${pitch.description}
Tonalite: ${pitch.tone}
PNJ disponibles:
${npcSummary}
${previousContext}
Beats a generer:
${beatsToGenerate.join('\n')}

Chaque beat doit etre un objet JSON:
{
  "number": <${from}-${to}>,
  "name": "<nom du beat en anglais>",
  "slug": "<slug-kebab-case>",
  "description": "<description narrative du beat, 3-5 phrases, en ${pitch.language}>",
  "minScenes": <1-3>,
  "maxScenes": <2-6>,
  "dcBase": <DC du beat>,
  "narrativeGoal": "<objectif narratif precis, 1-2 phrases, en ${pitch.language}>",
  "transitionCondition": "<condition pour passer au beat suivant, en ${pitch.language}>",
  "keyNpcIds": ["<id-pnj>", ...],
  "locationIds": ["<id-lieu-kebab>"],
  "loreKeys": ["<cle-lore>", ...],
  "gmInstructions": "<instructions detaillees pour le MJ/LLM, 3-5 phrases, en ${pitch.language}>",
  "forbiddenElements": ["<element-interdit-kebab>", ...],
  "suggestedMoodTags": ["<mood>", ...],
  "initialPacing": {
    "tensionCurve": "<rising|falling|plateau|climax>",
    "emotionalTone": "<wonder|dread|hope|grief|triumph|tension|serenity|rage>",
    "narrativeCheckpoints": [
      { "id": "<checkpoint-id>", "description": "<description, en ${pitch.language}>", "met": false }
    ],
    "maxTurnsBeforeForceProgress": <3-6>
  }
}

REGLES:
- Les beats suivent le modele Hero's Journey de Blake Snyder
- Le beat 1 est calme (monde ordinaire), le beat 4 est le catalyseur
- Les beats 10-12 sont les plus sombres, le 14 est le climax
- Le beat 15 est un miroir transforme du beat 1
- forbiddenElements: ce qui ne doit PAS arriver dans ce beat
- keyNpcIds: utiliser les IDs exacts des PNJ fournis
- 2-3 narrativeCheckpoints par beat
- suggestedMoodTags: 2-4 tags emotionnels

Reponds avec un tableau JSON de ${to - from + 1} beats.`;

  const raw = await llm.generate(systemPrompt, userPrompt, 8192);
  const beats = extractJson(raw) as any[];

  // Ensure correct numbering and fill missing pacing data
  return beats.map((beat, idx) => {
    const num = from + idx;
    return {
      ...beat,
      number: num,
      slug: beat.slug || slugify(beat.name || BEAT_NAMES[num - 1]),
      dcBase: beat.dcBase || BEAT_DCS[num - 1],
      initialPacing: {
        tensionCurve: beat.initialPacing?.tensionCurve || TENSION_CURVES[num] || 'rising',
        emotionalTone: beat.initialPacing?.emotionalTone || EMOTIONAL_TONES[num] || 'tension',
        narrativeCheckpoints: beat.initialPacing?.narrativeCheckpoints || [
          { id: `checkpoint-${num}-1`, description: `Objectif principal du beat ${num}`, met: false },
        ],
        maxTurnsBeforeForceProgress: beat.initialPacing?.maxTurnsBeforeForceProgress || 5,
      },
    };
  });
}

// ── Step 6: Lore ──

async function generateLore(llm: LLMAdapter, pitch: BookPitch, meta: any): Promise<Record<string, string>> {
  const systemPrompt = `Tu es un auteur de fantasy/SF. Tu ecris du lore riche et immersif en markdown.
IMPORTANT: Reponds UNIQUEMENT avec du JSON valide, sans texte avant ni apres.`;

  const userPrompt = `Genere le lore (background narratif) pour ce livre-jeu:

Univers: ${pitch.name} - ${pitch.description}
Tonalite: ${pitch.tone}
Stats: ${JSON.stringify(meta.statNames)}

Genere un objet JSON avec 2 fichiers markdown:
{
  "world": "<contenu markdown de world.md: geographie, civilisations, regles du monde, 400-600 mots, en ${pitch.language}>",
  "history": "<contenu markdown de history.md: chronologie, evenements majeurs, contexte historique, 300-500 mots, en ${pitch.language}>"
}

Le lore doit etre coherent avec l'univers decrit et fournir assez de materiel pour que le MJ/LLM puisse generer des narrations immersives.
Utilise des titres markdown (## et ###) pour structurer.`;

  const raw = await llm.generate(systemPrompt, userPrompt, 4096);
  return extractJson(raw) as Record<string, string>;
}

// ── Author Voice ──

async function generateAuthorVoice(llm: LLMAdapter, pitch: BookPitch, meta: any): Promise<any> {
  const systemPrompt = `Tu es un directeur editorial expert en narration interactive. Tu crees des personnalites d'auteur riches et distinctes pour des livres-jeu.
IMPORTANT: Reponds UNIQUEMENT avec du JSON valide, sans texte avant ni apres.`;

  const userPrompt = `Cree la personnalite d'auteur pour ce livre-jeu:

Univers: ${pitch.name} - ${pitch.description}
Tonalite: ${pitch.tone}
Stats: ${JSON.stringify(meta.statNames)}

Genere un objet JSON avec cette structure:
{
  "identity": "<1 paragraphe: 'Tu es [prenom nom], [role]. Tu es [description de qui est cet auteur et ce qu'il/elle fait]. Tu guides le joueur a travers [description du monde].' Ecris a la 2e personne du singulier (tu).>",
  "style": "<2-3 paragraphes detailles: description precise du style d'ecriture. Comment sont les phrases, le rythme, les descriptions sensorielles, les dialogues. Ecris a la 2e personne (tu).>",
  "influences": "<2 paragraphes: auteurs/oeuvres qui influencent cette voix, et COMMENT elles l'influencent concretement. Pas juste des noms, mais ce qu'on emprunte a chacun.>",
  "strengths": "<liste formatee: 'Tu excelles dans :\\n- **[force]** : [explication concrete]\\n- ...' Minimum 4 forces.>",
  "audience": "<1-2 paragraphes: pour qui ecrit cet auteur, quelles attentes, quel niveau de maturite, quels codes de genre respecter.>",
  "tone": "<2 paragraphes: registre precis, alternances de rythme, rapport a la sensualite/violence/humour, temperature emotionnelle.>",
  "avoidances": "<liste formatee: 'Tu ne tombes JAMAIS dans :\\n- Le/La **[piege]** : [pourquoi et comment l'eviter]\\n- ...' Minimum 4 pieges.>"
}

REGLES:
- La voix doit etre UNIQUE et CARACTERISEE — pas generique
- Adapte la personnalite a la tonalite: ${pitch.tone}
- Si la tonalite est "romantique", l'auteur(e) doit exceller en romance mature et sensuelle
- Si "epique", en worldbuilding riche et aventure
- Si "sombre", en horreur psychologique et tension
- Si "mystique", en mystere et spiritualite
- Tout est en ${pitch.language}
- Ecris les textes a la 2e personne du singulier (tu)`;

  const raw = await llm.generate(systemPrompt, userPrompt, 4096);
  return extractJson(raw);
}

// ── Loading Messages ──

async function generateLoadingMessages(llm: LLMAdapter, pitch: BookPitch, meta: any): Promise<any> {
  const systemPrompt = `Tu es un UX writer pour un jeu narratif interactif. Tu crees des messages d'ambiance immersifs.
IMPORTANT: Reponds UNIQUEMENT avec du JSON valide, sans texte avant ni apres.`;

  const userPrompt = `Cree les messages de chargement pour ce livre-jeu:

Univers: ${pitch.name} - ${pitch.description}
Tonalite: ${pitch.tone}
Stats: ${JSON.stringify(meta.statNames)}

Genere un objet JSON:
{
  "flavors": [
    "<message 1: ambiance pendant le chargement, 5-10 mots, termine par ...>",
    "<message 2>", "<message 3>", "<message 4>",
    "<message 5>", "<message 6>", "<message 7>", "<message 8>"
  ],
  "tips": [
    "<tip 1: conseil de gameplay lie aux stats ou a l'univers, 10-15 mots>",
    "<tip 2>", "<tip 3>", "<tip 4>",
    "<tip 5>", "<tip 6>", "<tip 7>", "<tip 8>"
  ],
  "overlayPhases": [
    { "title": "<titre court 3-5 mots, ambiance>", "sub": "<sous-titre 5-8 mots>", "progress": 15 },
    { "title": "<phase 2>", "sub": "<sub 2>", "progress": 35 },
    { "title": "<phase 3>", "sub": "<sub 3>", "progress": 55 },
    { "title": "<phase 4>", "sub": "<sub 4>", "progress": 75 },
    { "title": "Presque pret...", "sub": "<sub finale immersive>", "progress": 90 }
  ]
}

REGLES:
- 8 flavors, 8 tips, 5 overlayPhases
- Tout coherent avec l'univers et la tonalite
- Les flavors evoquent l'ambiance du monde (pas des termes techniques)
- Les tips melangent gameplay et lore
- Les tips utilisent les noms de stats du jeu: ${Object.values(meta.statNames).join(', ')}
- Tout en ${pitch.language}`;

  const raw = await llm.generate(systemPrompt, userPrompt, 2048);
  return extractJson(raw);
}

// ── Theme CSS generator (template-based, no LLM) ──

// Shared variables appended to every generated theme
const SHARED_THEME_VARS: Record<string, string> = {
  '--sidebar-width': '280px',
  '--beat-tracker-height': '48px',
  '--radius': '8px',
  '--radius-lg': '12px',
  '--font-body': "'Georgia', 'Times New Roman', serif",
  '--font-ui': "system-ui, -apple-system, sans-serif",
};

const TONE_PALETTES: Record<string, Record<string, string>> = {
  romantique: {
    '--color-bg': '#0d0a14',
    '--color-bg-secondary': '#1a1525',
    '--color-bg-card': '#231e30',
    '--color-surface': '#342d42',
    '--color-gold': '#c4a0ff',
    '--color-gold-dim': '#8a6db8',
    '--color-amber': '#9b7fc4',
    '--color-copper': '#7a5ea8',
    '--color-text': '#e8e0f0',
    '--color-text-dim': '#b0a4c4',
    '--color-text-muted': '#7d7394',
    '--color-ubuntu': '#e074b7',
    '--color-maat': '#a090e0',
    '--color-sankofa': '#7ac4c4',
    '--color-biso': '#d4a0ff',
    '--color-wonder': '#b090e0',
    '--color-dread': '#8b1030',
    '--color-hope': '#c4a0ff',
    '--color-grief': '#5a4880',
    '--color-triumph': '#e074b7',
    '--color-tension': '#d05070',
    '--color-serenity': '#7ac4c4',
    '--color-rage': '#c02040',
    '--color-risk-low': '#7ac4c4',
    '--color-risk-medium': '#c4a0ff',
    '--color-risk-high': '#d05070',
  },
  epique: {
    '--color-bg': '#0f0d08',
    '--color-bg-secondary': '#1a1710',
    '--color-bg-card': '#242015',
    '--color-surface': '#3a3520',
    '--color-gold': '#d4a853',
    '--color-gold-dim': '#8a7540',
    '--color-amber': '#c49040',
    '--color-copper': '#a07830',
    '--color-text': '#e8ddd0',
    '--color-text-dim': '#a89882',
    '--color-text-muted': '#7a6e60',
    '--color-ubuntu': '#60b890',
    '--color-maat': '#d4b060',
    '--color-sankofa': '#8080c0',
    '--color-biso': '#d07050',
    '--color-wonder': '#60b890',
    '--color-dread': '#8b0000',
    '--color-hope': '#d4b060',
    '--color-grief': '#6b5b95',
    '--color-triumph': '#d4a853',
    '--color-tension': '#d07050',
    '--color-serenity': '#87ceeb',
    '--color-rage': '#dc143c',
    '--color-risk-low': '#60b890',
    '--color-risk-medium': '#d4b060',
    '--color-risk-high': '#d07050',
  },
  sombre: {
    '--color-bg': '#0a0808',
    '--color-bg-secondary': '#161010',
    '--color-bg-card': '#201818',
    '--color-surface': '#382828',
    '--color-gold': '#c05050',
    '--color-gold-dim': '#8a3838',
    '--color-amber': '#a04040',
    '--color-copper': '#804030',
    '--color-text': '#e0d0d0',
    '--color-text-dim': '#a89090',
    '--color-text-muted': '#786060',
    '--color-ubuntu': '#70a0a0',
    '--color-maat': '#c08060',
    '--color-sankofa': '#9070a0',
    '--color-biso': '#d05050',
    '--color-wonder': '#70a0a0',
    '--color-dread': '#a01020',
    '--color-hope': '#c08060',
    '--color-grief': '#604060',
    '--color-triumph': '#c05050',
    '--color-tension': '#d05050',
    '--color-serenity': '#70a0a0',
    '--color-rage': '#d02030',
    '--color-risk-low': '#70a0a0',
    '--color-risk-medium': '#c08060',
    '--color-risk-high': '#d05050',
  },
  mystique: {
    '--color-bg': '#080d10',
    '--color-bg-secondary': '#101a1f',
    '--color-bg-card': '#152028',
    '--color-surface': '#253540',
    '--color-gold': '#50c0c0',
    '--color-gold-dim': '#387878',
    '--color-amber': '#40a0a0',
    '--color-copper': '#308080',
    '--color-text': '#d8e8e8',
    '--color-text-dim': '#90b0b0',
    '--color-text-muted': '#607878',
    '--color-ubuntu': '#60c090',
    '--color-maat': '#80a0d0',
    '--color-sankofa': '#a080c0',
    '--color-biso': '#50d0a0',
    '--color-wonder': '#80a0d0',
    '--color-dread': '#703050',
    '--color-hope': '#50c0c0',
    '--color-grief': '#405060',
    '--color-triumph': '#50d0a0',
    '--color-tension': '#a080c0',
    '--color-serenity': '#50c0c0',
    '--color-rage': '#c04060',
    '--color-risk-low': '#50d0a0',
    '--color-risk-medium': '#50c0c0',
    '--color-risk-high': '#a080c0',
  },
};

function buildThemeCSS(tone: string, bookId: string): string {
  const palette = TONE_PALETTES[tone] || TONE_PALETTES['epique'];
  const allVars = { ...palette, ...SHARED_THEME_VARS };
  const lines = Object.entries(allVars).map(([k, v]) => `  ${k}: ${v};`);
  return `/* Theme auto-generated for book: ${bookId} (tone: ${tone}) */\n:root {\n${lines.join('\n')}\n}\n`;
}

// ── File writing utilities ──

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function writeJson(dir: string, filename: string, data: any): void {
  writeFileSync(join(dir, filename), JSON.stringify(data, null, 2), 'utf-8');
}

function writeArchetypes(bookDir: string, archetypes: any[]): void {
  const dir = join(bookDir, 'archetypes');
  ensureDir(dir);

  const ids: string[] = [];
  for (const arch of archetypes) {
    ids.push(arch.id);
    // Extract genderMap into meta-level data (stored separately)
    const { genderMap, ...archData } = arch;
    writeJson(dir, `${arch.id}.json`, archData);
  }
  writeJson(dir, 'index.json', { archetypes: ids });

  // Update meta.json with archetype gender maps and descriptions
  const metaPath = join(bookDir, 'meta.json');
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));

  const genderMaps: Record<string, any> = {};
  const descriptions: Record<string, string> = {};
  for (const arch of archetypes) {
    if (arch.genderMap) genderMaps[arch.id] = arch.genderMap;
    if (arch.description) descriptions[arch.id] = arch.description.slice(0, 80);
  }
  meta.archetypeGenderMaps = genderMaps;
  meta.archetypeDescriptions = descriptions;

  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

function writeNPCs(bookDir: string, npcs: any[]): void {
  const dir = join(bookDir, 'npcs');
  ensureDir(dir);

  const ids: string[] = [];
  for (const npc of npcs) {
    ids.push(npc.id);
    writeJson(dir, `${npc.id}.json`, npc);
  }
  writeJson(dir, 'index.json', { npcs: ids });
}

function writeBeats(bookDir: string, beats: any[]): void {
  const dir = join(bookDir, 'beats');
  ensureDir(dir);

  for (const beat of beats) {
    const num = String(beat.number).padStart(2, '0');
    writeJson(dir, `${num}-${beat.slug}.json`, beat);
  }
}

function writeLore(bookDir: string, lore: Record<string, string>): void {
  const dir = join(bookDir, 'lore');
  ensureDir(dir);

  for (const [key, content] of Object.entries(lore)) {
    writeFileSync(join(dir, `${key}.md`), content, 'utf-8');
  }

  // Create empty locations directory
  ensureDir(join(dir, 'locations'));
}

// ── Utilities ──

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Try direct parse first
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1].trim()); } catch { /* fall through */ }
    }
    // Try finding JSON array or object in text
    const arrMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ }
    }
    const objMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
    }
    // Last resort: try to fix truncated JSON (missing closing brackets)
    let fixable = arrMatch?.[0] || objMatch?.[0] || trimmed;
    // Count brackets
    const openBrackets = (fixable.match(/\[/g) || []).length;
    const closeBrackets = (fixable.match(/\]/g) || []).length;
    const openBraces = (fixable.match(/\{/g) || []).length;
    const closeBraces = (fixable.match(/\}/g) || []).length;
    // Try to fix by appending missing closers
    let fixed = fixable;
    // Remove trailing comma before closing
    fixed = fixed.replace(/,\s*$/, '');
    for (let i = 0; i < openBraces - closeBraces; i++) fixed += '}';
    for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += ']';
    try { return JSON.parse(fixed); } catch { /* fall through */ }

    console.error('extractJson failed. Raw text (first 500 chars):', trimmed.slice(0, 500));
    throw new Error('Could not extract JSON from LLM response');
  }
}
