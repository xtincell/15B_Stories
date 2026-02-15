import type { Character, GameSession, BeatPacing } from '../types/game.js';
import type { LLMRequest, ConversationMessage, PlayerTurnInput } from '../types/llm.js';
import { assembleContext, buildSystemPrompt, buildConversationHistory } from './context-assembler.js';
import { loadGameBook } from '../memory/documentary/loader.js';

const MAX_RESPONSE_TOKENS = 4096;

/**
 * Build the complete LLM request for a game turn.
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

  // Build the user message for this turn
  let userMessage: string;

  if (playerInput.choiceId === 'free-text' && playerInput.freeText) {
    // Free text action: the player wrote their own action
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
 * Build the LLM request for the very first turn (opening scene).
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
