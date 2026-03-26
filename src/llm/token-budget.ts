/**
 * @module token-budget
 * @description Gestion du budget de tokens pour la fenêtre de contexte du LLM.
 * Fournit des utilitaires pour estimer le nombre de tokens d'un texte,
 * calculer le budget restant dans la fenêtre de contexte, et tronquer
 * du texte pour respecter une limite de tokens.
 *
 * Note : l'estimation est heuristique (~4 caractères par token).
 * Pour une précision maximale, utiliser tiktoken ou le tokenizer Anthropic.
 */
import type { TokenBudget } from '../types/memory.js';

/** Ratio approximatif caractères/token pour du contenu mixte (prose + JSON) */
const CHARS_PER_TOKEN = 4;
/** Tokens réservés pour la réponse du modèle — ne pas consommer par le contexte */
const RESPONSE_RESERVE = 4096;

/**
 * @description Estime le nombre de tokens d'un texte à partir de sa longueur en caractères.
 * Utilise une heuristique simple (~4 caractères par token) adaptée au contenu mixte.
 * @param text - Le texte dont on veut estimer le nombre de tokens
 * @returns Le nombre estimé de tokens (arrondi au supérieur)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * @description Calcule le budget de tokens pour une fenêtre de contexte donnée.
 * Décompose l'utilisation en : prompt système, historique, réserve réponse,
 * et détermine le budget restant disponible pour du contenu additionnel.
 * @param maxContextTokens - Taille maximale de la fenêtre de contexte du modèle
 * @param systemPrompt - Le prompt système actuel
 * @param conversationHistory - L'historique de conversation sérialisé
 * @returns Un objet {@link TokenBudget} détaillant la répartition des tokens
 */
export function createTokenBudget(maxContextTokens: number, systemPrompt: string, conversationHistory: string): TokenBudget {
  const systemTokens = estimateTokens(systemPrompt);
  const historyTokens = estimateTokens(conversationHistory);
  const used = systemTokens + historyTokens + RESPONSE_RESERVE;

  return {
    total: maxContextTokens,
    systemPrompt: systemTokens,
    history: historyTokens,
    response: RESPONSE_RESERVE,
    used,
    remaining: Math.max(0, maxContextTokens - used),
  };
}

/**
 * @description Tronque un texte pour qu'il tienne dans un budget de tokens donné.
 * Coupe depuis le début pour conserver le contenu le plus récent (fin du texte),
 * car dans un contexte narratif, les événements récents sont plus pertinents.
 * @param text - Le texte à tronquer si nécessaire
 * @param maxTokens - Le nombre maximum de tokens autorisés
 * @returns Le texte original si dans le budget, sinon le texte tronqué avec un marqueur '...'
 */
export function trimToTokenBudget(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Coupe depuis le début pour privilégier le contenu récent (plus pertinent pour la narration)
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const trimmed = text.slice(-maxChars);

  // Cherche le premier saut de ligne pour éviter de couper au milieu d'une phrase
  const firstNewline = trimmed.indexOf('\n');
  if (firstNewline > 0 && firstNewline < 200) {
    return '...\n' + trimmed.slice(firstNewline + 1);
  }
  return '...' + trimmed;
}
