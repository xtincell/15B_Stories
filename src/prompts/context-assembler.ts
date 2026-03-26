/**
 * @module context-assembler
 *
 * Module central d'assemblage du contexte envoyé au LLM.
 *
 * Ce module orchestre la collecte de toutes les couches de mémoire
 * (persistante, documentaire, fonctionnelle) et les fusionne en un
 * contexte structuré unique. Il s'occupe aussi de construire le prompt
 * système final à partir de templates Markdown mis en cache.
 *
 * Architecture mémoire :
 *  - Persistante : journal d'actions, résumés de beats, flags du monde
 *  - Documentaire : définition du beat, lore, profils PNJ
 *  - Fonctionnelle : stats, contraintes, rythme narratif
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Character, GameSession, BeatPacing, GameBookMeta } from '../types/game.js';
import type { AssembledContext, PersistentMemorySnapshot, DocumentaryMemoryContext, FunctionalMemoryContext } from '../types/memory.js';
import type { ConversationMessage } from '../types/llm.js';
import { getRecentActions, getBeatSummaries, getConversationHistory } from '../memory/persistent/action-journal.js';
import { getSession, getWorldFlags } from '../memory/persistent/world-state.js';
import { getRelationshipsForBeat } from '../memory/persistent/npc-state.js';
import { getBeatDefinition, getNpcsForBeat } from '../memory/documentary/beat-content.js';
import { getLoreForBeat } from '../memory/documentary/lore-index.js';
import { loadGameBook } from '../memory/documentary/loader.js';
import { STAT_DESCRIPTIONS, PERSONALITY_TRAITS } from '../types/game.js';
import type { PersonalityTrait } from '../types/game.js';
import { estimateTokens, trimToTokenBudget } from '../llm/token-budget.js';

/** Résolution du répertoire courant pour accéder aux templates en ESM */
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Chemin absolu vers le dossier contenant les templates Markdown */
const TEMPLATES_DIR = join(__dirname, 'templates');

// ── Mise en cache des templates : chargement unique au démarrage ──
const templateCache = new Map<string, string>();

/**
 * Charge un template Markdown depuis le disque avec mise en cache.
 * Après le premier appel, les lectures suivantes sont servies depuis la mémoire
 * afin d'éliminer toute E/S fichier pendant le traitement des requêtes.
 *
 * @param name - Nom du fichier template (ex : 'base-system.md')
 * @returns Le contenu textuel du template
 */
function loadTemplate(name: string): string {
  let cached = templateCache.get(name);
  if (!cached) {
    cached = readFileSync(join(TEMPLATES_DIR, name), 'utf-8');
    templateCache.set(name, cached);
  }
  return cached;
}

// Pré-chargement du cache au démarrage pour éviter les latences lors du premier tour
try {
  loadTemplate('base-system.md');
  loadTemplate('beat-instructions.md');
  loadTemplate('scene-format.md');
  loadTemplate('character-creation.md');
} catch {
  // Les templates peuvent ne pas exister encore lors du premier build
}

// ── Main assembly function ──

/**
 * Assemble le contexte complet pour un appel au LLM.
 *
 * Regroupe toutes les requêtes en base de données pour minimiser la latence,
 * puis structure les résultats en trois couches de mémoire distinctes.
 * Les templates sont servis depuis le cache — aucune E/S fichier.
 *
 * @param session - Session de jeu active contenant l'état courant
 * @param character - Personnage du joueur avec ses stats et inventaire
 * @param pacing - État du rythme narratif (tension, tone, checkpoints)
 * @returns Contexte assemblé prêt à être injecté dans le prompt système
 */
export function assembleContext(
  session: GameSession,
  character: Character,
  pacing: BeatPacing,
): AssembledContext {
  const bookId = session.bookId;
  const book = loadGameBook(bookId);
  const beat = getBeatDefinition(bookId, session.currentBeat);
  if (!beat) throw new Error(`Beat ${session.currentBeat} not found in book ${bookId}`);

  // ── 1. Persistent Memory (3 independent DB queries) ──
  const recentActions = getRecentActions(session.id, 5);
  const beatSummaries = getBeatSummaries(session.id);
  const worldFlags = getWorldFlags(session.id);

  const persistent: PersistentMemorySnapshot = {
    recentActions,
    beatSummaries,
    worldFlags,
  };

  // ── 2. Mémoire Documentaire ──
  const relevantLore = getLoreForBeat(bookId, session.currentBeat);
  // Construction d'une carte d'affinité PNJ pour enrichir les profils
  // avec les relations dynamiques du joueur
  const affinityMap = new Map<string, number>();
  const relationships = getRelationshipsForBeat(session.id, beat.keyNpcIds);
  for (const rel of relationships) {
    affinityMap.set(rel.npcId, rel.affinity);
  }
  const activeNpcProfiles = getNpcsForBeat(bookId, session.currentBeat, affinityMap);

  const documentary: DocumentaryMemoryContext = {
    worldOverview: '',
    currentBeatContent: {
      name: beat.name,
      number: beat.number,
      narrativeGoal: beat.narrativeGoal,
      gmInstructions: beat.gmInstructions,
      forbiddenElements: beat.forbiddenElements,
      transitionCondition: beat.transitionCondition,
    },
    // Chaque entrée de lore est tronquée pour respecter le budget de tokens
    relevantLore: relevantLore.map(l => trimToTokenBudget(l, 500)),
    activeNpcProfiles,
    relevantLocations: [],
  };

  // ── 3. Mémoire Fonctionnelle (règles, contraintes, rythme) ──
  const consequenceReminders = buildConsequenceReminders(worldFlags, session.currentBeat);

  const functional: FunctionalMemoryContext = {
    statDefinitions: {
      ubuntu: STAT_DESCRIPTIONS.ubuntu.domain,
      maat: STAT_DESCRIPTIONS.maat.domain,
      sankofa: STAT_DESCRIPTIONS.sankofa.domain,
      biso: STAT_DESCRIPTIONS.biso.domain,
    },
    currentDCBase: beat.dcBase,
    beatConstraints: beat.gmInstructions,
    consequenceReminders,
    pacingState: {
      tensionCurve: pacing.tensionCurve,
      emotionalTone: pacing.emotionalTone,
      sceneEscalation: pacing.sceneEscalation,
      // Ne garder que les checkpoints non encore atteints pour guider le LLM
      checkpointsRemaining: pacing.narrativeCheckpoints
        .filter(cp => !cp.met)
        .map(cp => cp.description),
      turnsInBeat: pacing.turnsInBeat,
      maxTurns: pacing.maxTurnsBeforeForceProgress,
    },
  };

  return { persistent, documentary, functional, bookMeta: book.meta };
}

/**
 * Construit le prompt système complet à partir du contexte assemblé.
 *
 * Fusionne les templates Markdown (en cache) avec les données dynamiques
 * du contexte pour produire le prompt final envoyé au LLM. Gère aussi
 * le mode « rapide » qui impose un beat par tour.
 *
 * @param context - Contexte assemblé par {@link assembleContext}
 * @param character - Personnage du joueur (stats, personnalité, genre)
 * @param gameMode - Mode de jeu : 'normal' ou 'rapide'
 * @returns Le prompt système complet sous forme de chaîne Markdown
 */
export function buildSystemPrompt(
  context: AssembledContext,
  character: Character,
  gameMode: string = 'normal',
): string {
  const sections: string[] = [];
  const isQuickMode = gameMode === 'rapide';
  const meta = context.bookMeta;
  const authorVoice = meta?.authorVoice;

  // Construction du bloc « voix d'auteur » à partir de la personnalité définie par livre
  const voiceBlock = authorVoice ? [
    authorVoice.influences ? `## Influences & Voix\n${authorVoice.influences}` : '',
    authorVoice.strengths ? `## Tes Forces Narratives\n${authorVoice.strengths}` : '',
    authorVoice.audience ? `## Ton Public\n${authorVoice.audience}` : '',
    authorVoice.tone ? `## Ton & Registre\n${authorVoice.tone}` : '',
    authorVoice.avoidances ? `## Ce Que Tu Ne Fais JAMAIS\n${authorVoice.avoidances}` : '',
  ].filter(Boolean).join('\n\n') : '';

  // Construction du bloc des descriptions de stats, avec fallback vers les valeurs par défaut
  const statBlock = meta?.statDescriptions
    ? (['ubuntu', 'maat', 'sankofa', 'biso'] as const).map(key => {
        const name = meta.statNames?.[key] || key;
        const desc = meta.statDescriptions?.[key];
        return desc
          ? `- **${name}** (${desc.subtitle}) : ${desc.axis}`
          : `- **${name}**`;
      }).join('\n')
    : `- **Ubuntu** (Le Lien) : Communaut\u00e9 / Empathie, diplomatie, soin, ralliement, sacrifice pour le groupe\n- **Ma\u00e2t** (La Balance) : V\u00e9rit\u00e9 / Justice, investigation, jugement, d\u00e9nonciation, r\u00e9sistance \u00e0 la corruption\n- **Sankofa** (La M\u00e9moire) : Tradition / Anc\u00eatres, rituels, communication avec les esprits, connaissance ancestrale\n- **Biso** (L'\u00c9tincelle) : Innovation / Audace, action directe, combat, improvisation, invention`;

  // Injection des variables spécifiques au livre dans le template de base
  let baseSystem = loadTemplate('base-system.md');
  baseSystem = baseSystem
    .replace('{{authorIdentity}}', authorVoice?.identity || `Tu es le Ma\u00eetre du Jeu de ${meta?.name || 'cette aventure'}`)
    .replace('{{authorStyle}}', authorVoice?.style || '')
    .replace('{{authorVoiceBlock}}', voiceBlock)
    .replace('{{statDescriptionsBlock}}', statBlock);

  sections.push(baseSystem);

  // Mode rapide : directive globale imposant un seul tour par beat
  if (isQuickMode) {
    sections.push(`# MODE HISTOIRE RAPIDE

**RÈGLE ABSOLUE** : Chaque beat doit être résolu en UN SEUL TOUR. Tu as 15 tours pour raconter les 15 beats.
- Condense l'essence du beat en une scène unique, dense et percutante
- Accomplis TOUS les checkpoints narratifs dans cette unique narration
- Mets TOUJOURS \`readyToTransition: true\` dans ta réponse
- Déclare TOUS les checkpoints comme accomplis dans \`checkpointsMet\`
- La narration peut être plus longue pour compenser — mais un seul tour par beat
- Garde l'émotion et l'impact malgré la compression : chaque beat est un moment-clé
- Les transitions entre beats doivent être fluides et naturelles`);
  }

  if (context.documentary.relevantLore.length > 0) {
    sections.push('# Lore Pertinent\n\n' + context.documentary.relevantLore.join('\n\n---\n\n'));
  }

  // Directive d'urgence : calibrée selon l'escalation pour pousser le LLM
  // à conclure le beat quand le nombre de tours restants diminue
  const turnsLeft = context.functional.pacingState.maxTurns - context.functional.pacingState.turnsInBeat;
  let pacingDirective: string;
  if (isQuickMode) {
    pacingDirective = `MODE RAPIDE : Ce beat DOIT être complété en ce tour. Mets readyToTransition à true et accomplis tous les checkpoints restants. Condense toute l'essence narrative du beat en une seule scène impactante.`;
  } else {
    const escalation = context.functional.pacingState.sceneEscalation;
    if (escalation >= 0.9 || turnsLeft <= 1) {
      pacingDirective = `URGENT : Il ne reste que ${turnsLeft} tour(s) avant la progression forcée. Tu DOIS conclure ce beat MAINTENANT. Mets readyToTransition à true et complète les checkpoints restants dans cette narration. Accélère dramatiquement vers la condition de transition.`;
    } else if (escalation >= 0.7 || turnsLeft <= 2) {
      pacingDirective = `ATTENTION : Le beat approche de sa fin (${turnsLeft} tours restants). Commence à orienter la narration vers la condition de transition. Si les checkpoints restants peuvent être accomplis naturellement, fais-le. Pense à mettre readyToTransition à true si les conditions sont remplies.`;
    } else if (escalation >= 0.5) {
      pacingDirective = `Le beat avance bien. Assure-toi de progresser vers les checkpoints narratifs non accomplis. Ne laisse pas l'histoire stagner.`;
    } else {
      pacingDirective = `Développe la scène en travaillant activement vers les checkpoints narratifs. Chaque tour doit faire avancer au moins un aspect de l'objectif narratif.`;
    }
  }

  const beatTemplate = loadTemplate('beat-instructions.md');
  const beatSection = beatTemplate
    .replace('{{beatNumber}}', String(context.documentary.currentBeatContent.number))
    .replace('{{beatName}}', context.documentary.currentBeatContent.name)
    .replace('{{narrativeGoal}}', context.documentary.currentBeatContent.narrativeGoal)
    .replace('{{transitionCondition}}', context.documentary.currentBeatContent.transitionCondition)
    .replace('{{gmInstructions}}', context.documentary.currentBeatContent.gmInstructions)
    .replace('{{forbiddenElements}}', context.documentary.currentBeatContent.forbiddenElements.map(e => `- ${e}`).join('\n'))
    .replace('{{tensionCurve}}', context.functional.pacingState.tensionCurve)
    .replace('{{emotionalTone}}', context.functional.pacingState.emotionalTone)
    .replace('{{sceneEscalation}}', context.functional.pacingState.sceneEscalation.toFixed(2))
    .replace('{{turnsInBeat}}', String(context.functional.pacingState.turnsInBeat))
    .replace('{{maxTurns}}', String(context.functional.pacingState.maxTurns))
    .replace('{{turnsRemaining}}', String(turnsLeft))
    .replace('{{checkpointsRemaining}}', context.functional.pacingState.checkpointsRemaining.map(cp => `- [ ] ${cp}`).join('\n') || '- ✅ Tous les checkpoints sont complétés')
    .replace('{{dcBase}}', String(context.functional.currentDCBase))
    .replace('{{pacingDirective}}', pacingDirective);
  sections.push(beatSection);

  sections.push(buildCharacterSection(character, meta));

  if (context.documentary.activeNpcProfiles.length > 0) {
    sections.push(buildNpcSection(context.documentary.activeNpcProfiles));
  }

  if (context.persistent.recentActions.length > 0) {
    sections.push(buildHistorySection(context));
  }

  if (context.functional.consequenceReminders.length > 0) {
    sections.push('# Conséquences Actives\n\n' + context.functional.consequenceReminders.map(c => `- ${c}`).join('\n'));
  }

  sections.push(loadTemplate('scene-format.md'));

  return sections.join('\n\n---\n\n');
}

/**
 * Récupère l'historique de conversation pour l'appel au LLM.
 *
 * Limite le nombre de messages pour rester dans le budget de tokens
 * tout en fournissant assez de contexte conversationnel au modèle.
 *
 * @param sessionId - Identifiant unique de la session de jeu
 * @param limit - Nombre maximum de messages à récupérer (par défaut 6)
 * @returns Tableau de messages de conversation ordonnés chronologiquement
 */
export function buildConversationHistory(sessionId: string, limit: number = 6): ConversationMessage[] {
  return getConversationHistory(sessionId, limit);
}

// ── Fonctions utilitaires internes ──

/**
 * Construit la section Markdown décrivant l'état du personnage joueur.
 * Inclut stats, personnalité, genre grammatical, inventaire et backstory.
 *
 * @param character - Personnage du joueur
 * @param bookMeta - Métadonnées du livre (noms de stats personnalisés)
 * @returns Section Markdown formatée pour le prompt système
 */
function buildCharacterSection(character: Character, bookMeta?: GameBookMeta): string {
  const personalityInfo = PERSONALITY_TRAITS[character.personality as PersonalityTrait];

  // Génération dynamique des lignes de stats avec les noms personnalisés du livre
  const statKeys = ['ubuntu', 'maat', 'sankofa', 'biso'] as const;
  const statLines = statKeys.map(key => {
    const name = bookMeta?.statNames?.[key] || key.charAt(0).toUpperCase() + key.slice(1);
    const sub = bookMeta?.statDescriptions?.[key]?.subtitle || '';
    const label = sub ? `${name} (${sub})` : name;
    const mod = character.stats[key] - 5;
    return `- ${label} : ${character.stats[key]} (mod ${mod >= 0 ? '+' : ''}${mod})`;
  });

  const lines = [
    '# État du Personnage',
    '',
    `**Nom** : ${character.name}`,
    `**Archétype** : ${character.archetype}`,
    `**Genre** : ${character.gender || 'masculin'}`,
    `**Personnalité** : ${personalityInfo?.label ?? character.personality} — ${personalityInfo?.narrativeHint ?? ''}`,
    `**PV** : ${character.hp}/${character.maxHp}`,
    '',
    '## Statistiques',
    ...statLines,
  ];

  lines.push('', `## Trait de Personnalité : ${personalityInfo?.label ?? character.personality}`);
  lines.push(`IMPORTANT : La personnalité du joueur est **${personalityInfo?.label}**. Cela doit influencer :`,
    `- **Les dialogues** : le personnage s'exprime d'une manière cohérente avec ce trait`,
    `- **Les réactions des PNJ** : ils réagissent à cette personnalité (un Rebelle agace l'autorité, un Mystique intrigue les esprits)`,
    `- **Les choix proposés** : au moins un choix sur les 4 doit résonner particulièrement avec cette personnalité`,
    `- **La narration** : décris les gestes, pensées et attitudes du personnage en accord avec ce trait`,
  );

  // Instructions d'accord grammatical selon le genre choisi par le joueur
  const gender = character.gender || 'masculin';
  const genderPronouns: Record<string, { subject: string; article: string; example: string }> = {
    masculin: { subject: 'il', article: 'le', example: 'il est courageux, le guerrier avance' },
    feminin:  { subject: 'elle', article: 'la', example: 'elle est courageuse, la guerrière avance' },
    neutre:   { subject: 'iel', article: 'le/la', example: 'iel est courageux·se, le/la guerrier·ère avance' },
  };
  const gp = genderPronouns[gender] || genderPronouns.masculin;
  lines.push('', `## Genre du Personnage : ${gender}`);
  lines.push(
    `IMPORTANT : Tu DOIS utiliser les accords grammaticaux **${gender}** pour le personnage dans TOUTE la narration.`,
    `- Pronom sujet : **${gp.subject}**`,
    `- Article : **${gp.article}**`,
    `- Exemple : "${gp.example}"`,
    gender === 'neutre' ? `- Pour le neutre, privilégie les formulations inclusives ou le pronom "iel".` : '',
  );

  if (character.inventory.length > 0) {
    lines.push('', '## Inventaire');
    for (const item of character.inventory) {
      lines.push(`- ${item.name} : ${item.description}`);
    }
  }

  lines.push('', `**Backstory** : ${character.backstory}`);

  return lines.join('\n');
}

/**
 * Construit la section Markdown listant les PNJ présents dans la scène.
 *
 * @param npcs - Profils des PNJ actifs avec leurs affinités dynamiques
 * @returns Section Markdown formatée pour le prompt système
 */
function buildNpcSection(npcs: DocumentaryMemoryContext['activeNpcProfiles']): string {
  const lines = ['# PNJ Présents'];
  for (const npc of npcs) {
    lines.push('', `## ${npc.name} — ${npc.title}`);
    lines.push(`- **Personnalité** : ${npc.personality}`);
    lines.push(`- **Motivations** : ${npc.motivations}`);
    lines.push(`- **Affinité** : ${npc.currentAffinity}/10`);
    lines.push(`- **Rôle dans ce beat** : ${npc.beatRole}`);
  }
  return lines.join('\n');
}

/**
 * Construit la section d'historique récent pour le prompt.
 * Combine les résumés de beats passés et les dernières actions détaillées.
 *
 * @param context - Contexte assemblé contenant la mémoire persistante
 * @returns Section Markdown avec résumés et actions récentes
 */
function buildHistorySection(context: AssembledContext): string {
  const lines = ['# Historique Récent'];

  if (context.persistent.beatSummaries.length > 0) {
    lines.push('', '## Résumé des Beats Précédents');
    for (const summary of context.persistent.beatSummaries) {
      lines.push(`\n**Beat ${summary.beatNumber}** : ${summary.summaryText}`);
    }
  }

  lines.push('', '## Dernières Actions');
  for (const action of context.persistent.recentActions) {
    const diceInfo = action.diceResult
      ? ` → Jet ${action.diceResult.stat}: ${action.diceResult.roll}+${action.diceResult.modifier}=${action.diceResult.total} vs DC${action.diceResult.dc} (${action.diceResult.success ? 'succès' : 'échec'})`
      : '';
    lines.push(`- Tour ${action.turnNumber} (Beat ${action.beat}): "${action.choiceText}"${diceInfo}`);
  }

  return lines.join('\n');
}

/**
 * Transforme les flags du monde en rappels de conséquences lisibles par le LLM.
 * Permet au modèle de tenir compte des choix passés du joueur dans sa narration.
 *
 * @param worldFlags - Dictionnaire des flags du monde (booléens, chaînes, nombres)
 * @param currentBeat - Numéro du beat actuel (réservé pour filtrage futur)
 * @returns Liste de rappels textuels des conséquences actives
 */
function buildConsequenceReminders(
  worldFlags: Record<string, boolean | string | number>,
  currentBeat: number,
): string[] {
  const reminders: string[] = [];
  for (const [key, value] of Object.entries(worldFlags)) {
    // Seuls les flags booléens actifs et les flags textuels sont pertinents
    if (typeof value === 'boolean' && value) {
      reminders.push(`Flag actif : ${key.replace(/_/g, ' ')}`);
    } else if (typeof value === 'string') {
      reminders.push(`${key.replace(/_/g, ' ')} : ${value}`);
    }
  }
  return reminders;
}
