import type { LLMAdapter } from '../types/llm.js';
import { ClaudeAdapter } from './claude-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';

export type ProviderName = 'claude' | 'openai';

export interface LLMConfig {
  provider: ProviderName;
  apiKey: string;
  model?: string;
}

/**
 * Create an LLM adapter from config.
 */
export function createLLMAdapter(config: LLMConfig): LLMAdapter {
  switch (config.provider) {
    case 'claude':
      return new ClaudeAdapter(config.apiKey, config.model);
    case 'openai':
      return new OpenAIAdapter(config.apiKey, config.model);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * Create adapters from environment variables.
 */
export function createAdaptersFromEnv(): { main: LLMAdapter; summarizer: LLMAdapter } {
  const mainProvider = (process.env.LLM_PROVIDER ?? 'claude') as ProviderName;
  const summarizerProvider = (process.env.SUMMARIZER_PROVIDER ?? mainProvider) as ProviderName;

  const main = createLLMAdapter({
    provider: mainProvider,
    apiKey: mainProvider === 'claude'
      ? (process.env.ANTHROPIC_API_KEY ?? '')
      : (process.env.OPENAI_API_KEY ?? ''),
    model: mainProvider === 'claude'
      ? process.env.CLAUDE_MODEL
      : process.env.OPENAI_MODEL,
  });

  const summarizer = createLLMAdapter({
    provider: summarizerProvider,
    apiKey: summarizerProvider === 'claude'
      ? (process.env.ANTHROPIC_API_KEY ?? '')
      : (process.env.OPENAI_API_KEY ?? ''),
    model: summarizerProvider === 'claude'
      ? (process.env.SUMMARIZER_MODEL ?? 'claude-haiku-4-5-20251001')
      : (process.env.SUMMARIZER_MODEL ?? 'gpt-4o-mini'),
  });

  return { main, summarizer };
}
