import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { TurnOutputSchema } from './output-schema.js';
import type { LLMAdapter, LLMRequest, TurnOutput, StreamCallback } from '../types/llm.js';

const LLM_TIMEOUT_MS = 60_000;

export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI;
  readonly modelId: string;
  readonly maxContextTokens: number;

  constructor(apiKey: string, modelId: string = 'gpt-4o') {
    this.client = new OpenAI({
      apiKey,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: 2,
    });
    this.modelId = modelId;
    this.maxContextTokens = 128_000;
  }

  async generateTurn(request: LLMRequest): Promise<TurnOutput> {
    return this.generateTurnStreaming(request, () => {});
  }

  async generateTurnStreaming(request: LLMRequest, onChunk: StreamCallback): Promise<TurnOutput> {
    const response = await withTimeout(
      this.client.beta.chat.completions.parse({
        model: this.modelId,
        max_tokens: request.maxTokens,
        messages: [
          { role: 'system', content: request.systemPrompt },
          ...request.conversationHistory.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          })),
        ],
        response_format: zodResponseFormat(TurnOutputSchema, 'turn_output'),
      }),
      LLM_TIMEOUT_MS,
      'OpenAI API timed out',
    );

    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error('No parsed content in OpenAI response');
    }
    // Send narration as chunk for client display
    if ((parsed as TurnOutput).narration) {
      onChunk((parsed as TurnOutput).narration);
    }
    return parsed as TurnOutput;
  }

  async summarize(text: string, instructions: string): Promise<string> {
    const response = await withTimeout(
      this.client.chat.completions.create({
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

    return response.choices[0]?.message?.content?.trim() ?? '';
  }

  async generate(systemPrompt: string, userPrompt: string, maxTokens = 4096): Promise<string> {
    const response = await withTimeout(
      this.client.chat.completions.create({
        model: this.modelId,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      120_000,
      'Generation timed out',
    );

    return response.choices[0]?.message?.content?.trim() ?? '';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}
