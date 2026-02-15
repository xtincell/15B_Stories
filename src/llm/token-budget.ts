import type { TokenBudget } from '../types/memory.js';

// Rough token estimation: ~4 chars per token for mixed content
const CHARS_PER_TOKEN = 4;
const RESPONSE_RESERVE = 4096;

/**
 * Estimate token count from text length.
 * This is a rough heuristic. For production, use tiktoken or the Anthropic tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Create a token budget for a given context window.
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
 * Trim text to fit within a token budget by cutting from the beginning.
 */
export function trimToTokenBudget(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Cut from the beginning, keeping the end (most recent content)
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const trimmed = text.slice(-maxChars);

  // Find the first newline to avoid cutting mid-sentence
  const firstNewline = trimmed.indexOf('\n');
  if (firstNewline > 0 && firstNewline < 200) {
    return '...\n' + trimmed.slice(firstNewline + 1);
  }
  return '...' + trimmed;
}
