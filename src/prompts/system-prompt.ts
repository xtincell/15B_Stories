/**
 * @module system-prompt
 *
 * Point d'entrée pour la construction des requêtes LLM complètes.
 *
 * Ce module expose les fonctions de haut niveau qui combinent
 * l'assemblage du contexte, la construction du prompt système et
 * la mise en forme du message utilisateur pour produire des objets
 * {@link LLMRequest} prêts à être envoyés à l'adaptateur LLM.
 *
 * Deux cas d'usage principaux :
 *  - Tour de jeu standard (le joueur a fait un choix)
 *  - Scène d'ouverture (premier tour, pas de choix précédent)
 */

import type { Character, GameSession, BeatPacing } from '../types/game.js';
import type { LLMRequest, ConversationMessage, PlayerTurnInput } from '../types/llm.js';
import { assembleContext, buildSystemPrompt, buildConversationHistory } from './context-assembler.js';
import { loadGameBook } from '../memory/documentary/loader.js';

/** Limite de tokens pour la réponse du LLM — assez pour une narration riche avec choix */
const MAX_RESPONSE_TOKENS = 4096;

/**
 * Construit la requête LLM complète pour un tour de jeu standard.
 *
 * Assemble le contexte, le prompt système, l'historique de conversation,
 * puis formate le message utilisateur selon le type d'action choisie
 * (choix prédéfini, texte libre, ou choix avec texte complémentaire).
 *
 * @param session - Session de jeu active
 * @param character - Personnage du joueur
 * @param pacing - État du rythme narratif pour ce beat
 * @param playerInput - Action choisie par le joueur (ID de choix et/ou texte libre)
 * @param diceResultText - Résultat du jet de dé formaté (optionnel, si un jet actif a eu lieu)
 * @returns Requête LLM prête à être envoyée à l'adaptateur
 */
export function buildTurnRequest(
  session: GameSession,
  character: Character,
  pacing: BeatPacing,
  playerInput: PlayerTurnInput,
  diceResultText?: string,
): LLMRequest {
  const context = assembleContext(session, character, pacing);
  const systemPrompt = buildSystemPrompt(context, character, session.gameMode);
  const conversationHistory = buildConversationHistory(session.id);

  // Construction du message utilisateur selon le type d'action
  let userMessage: string;

  if (playerInput.choiceId === 'free-text' && playerInput.freeText) {
    // Action libre : le joueur a écrit sa propre action au lieu de choisir parmi les options
    userMessage = `Le joueur décrit sa propre action : "${playerInput.freeText}"

IMPORTANT : Le joueur a choisi une action libre au lieu d'un des choix proposés. Tu dois :
1. Interpréter cette action dans le contexte de la scène actuelle
2. Déterminer quelle valeur cardinale (Ubuntu, Maât, Sankofa, Biso) est la plus sollicitée
3. Décider si un jet de dé passif est pertinent (si l'action est risquée ou incertaine)
4. Intégrer cette action dans la narration de façon cohérente
5. Continuer l'histoire en conséquence, en proposant de nouveaux choix

Si l'action est absurde ou impossible dans le contexte, le MJ peut la réinterpréter avec humour ou la nuancer narrativement, mais ne jamais la refuser complètement.`;
  } else {
    userMessage = `Le joueur a choisi : "${playerInput.choiceId}"`;
    if (playerInput.freeText) {
      userMessage += `\n\nLe joueur ajoute : "${playerInput.freeText}"`;
    }
  }

  if (diceResultText) {
    userMessage += `\n\nRésultat du jet de dé : ${diceResultText}`;
  }

  const history: ConversationMessage[] = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  return {
    systemPrompt,
    conversationHistory: history,
    maxTokens: MAX_RESPONSE_TOKENS,
  };
}

/**
 * Construit la requête LLM pour le tout premier tour (scène d'ouverture).
 *
 * Pas d'historique de conversation ni de choix précédent.
 * Le message invite le LLM à présenter l'« Opening Image » du récit,
 * en adaptant les instructions selon le mode de jeu (normal ou rapide).
 *
 * @param session - Session de jeu nouvellement créée
 * @param character - Personnage fraîchement créé par le joueur
 * @param pacing - État initial du rythme narratif
 * @returns Requête LLM pour la scène d'ouverture
 */
export function buildOpeningRequest(
  session: GameSession,
  character: Character,
  pacing: BeatPacing,
): LLMRequest {
  const context = assembleContext(session, character, pacing);
  const systemPrompt = buildSystemPrompt(context, character, session.gameMode);
  const isQuickMode = session.gameMode === 'rapide';
  const bookName = loadGameBook(session.bookId).meta.name;

  let userMessage: string;
  if (isQuickMode) {
    userMessage = `Commence l'aventure en MODE RAPIDE. C'est le Beat 1 sur 15. Présente l'Opening Image : montre le monde de ${bookName} à travers les yeux de ${character.name} (${character.archetype}, genre : ${character.gender || 'masculin'}, personnalité : ${character.personality}). Condense l'essence de ce beat en une scène unique. Accomplis TOUS les checkpoints et mets readyToTransition à true. Propose les choix pour le prochain beat.`;
  } else {
    userMessage = `Commence l'aventure. C'est le tout premier tour. Présente l'Opening Image : montre le monde de ${bookName} à travers les yeux de ${character.name} (${character.archetype}, genre : ${character.gender || 'masculin'}, personnalité : ${character.personality}). Propose les premiers choix.`;
  }

  return {
    systemPrompt,
    conversationHistory: [{ role: 'user', content: userMessage }],
    maxTokens: MAX_RESPONSE_TOKENS,
  };
}
