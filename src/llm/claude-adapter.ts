import Anthropic from '@anthropic-ai/sdk';
import { TurnOutputSchema } from './output-schema.js';
import type { LLMAdapter, LLMRequest, TurnOutput, StreamCallback } from '../types/llm.js';

const LLM_TIMEOUT_MS = 60_000; // 60s timeout
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export class ClaudeAdapter implements LLMAdapter {
  private client: Anthropic;
  readonly modelId: string;
  readonly maxContextTokens: number;

  constructor(apiKey: string, modelId: string = 'claude-sonnet-4-5-20250929') {
    this.client = new Anthropic({
      apiKey,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
    this.modelId = modelId;
    this.maxContextTokens = 200_000;
  }

  async generateTurn(request: LLMRequest): Promise<TurnOutput> {
    return this.generateTurnStreaming(request, () => {});
  }

  /**
   * Stream the LLM response, calling onChunk for each text delta.
   * Returns the fully parsed TurnOutput once complete.
   */
  async generateTurnStreaming(request: LLMRequest, onChunk: StreamCallback): Promise<TurnOutput> {
    const fullText = await withTimeout(
      this._streamResponse(request, onChunk),
      LLM_TIMEOUT_MS,
      'Claude API streaming timed out',
    );

    const raw = extractJson(fullText);
    const parsed = TurnOutputSchema.parse(raw);
    return parsed;
  }

  private async _streamResponse(request: LLMRequest, onChunk: StreamCallback): Promise<string> {
    let fullText = '';

    const stream = this.client.messages.stream({
      model: this.modelId,
      max_tokens: request.maxTokens,
      system: request.systemPrompt,
      messages: request.conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullText += text;
        onChunk(text);
      }
    }

    return fullText;
  }

  async summarize(text: string, instructions: string): Promise<string> {
    const response = await withTimeout(
      this.client.messages.create({
        model: this.modelId,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `${instructions}\n\n---\n\n${text}`,
        }],
      }),
      30_000,
      'Summarization timed out',
    );

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in summarization response');
    }
    return textBlock.text.trim();
  }

  async generate(systemPrompt: string, userPrompt: string, maxTokens = 4096): Promise<string> {
    const response = await withTimeout(
      this.client.messages.create({
        model: this.modelId,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt,
        }],
      }),
      120_000,
      'Generation timed out',
    );

    const textBlock = response.content.find(block => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text content in generation response');
    }
    return textBlock.text.trim();
  }
}

/**
 * Race a promise against a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

/**
 * Extract JSON from a text response that might contain markdown code blocks.
 */
function extractJson(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch { /* fall through */ }
    }
    // Try finding JSON object in text
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
    }
    throw new Error('Could not extract JSON from LLM response');
  }
}
