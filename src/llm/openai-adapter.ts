/**
 * @module openai-adapter
 * @description Adaptateur LLM pour l'API OpenAI (GPT-4o, etc.).
 * Implémente l'interface {@link LLMAdapter} en exploitant le mode « structured output »
 * d'OpenAI via {@link zodResponseFormat} pour garantir la conformité du JSON retourné.
 */
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { TurnOutputSchema } from './output-schema.js';
import type { LLMAdapter, LLMRequest, TurnOutput, StreamCallback } from '../types/llm.js';

/** Délai maximum d'attente pour un appel API (en millisecondes) */
const LLM_TIMEOUT_MS = 60_000;

/**
 * @description Adaptateur pour l'API OpenAI.
 * Utilise le mode « structured output » de l'API beta pour que les réponses
 * soient directement parsées selon le schéma Zod {@link TurnOutputSchema}.
 */
export class OpenAIAdapter implements LLMAdapter {
  private client: OpenAI;
  readonly modelId: string;
  readonly maxContextTokens: number;

  /**
   * @description Crée une nouvelle instance de l'adaptateur OpenAI.
   * @param apiKey - Clé d'API OpenAI pour l'authentification
   * @param modelId - Identifiant du modèle à utiliser (par défaut : gpt-4o)
   */
  constructor(apiKey: string, modelId: string = 'gpt-4o') {
    this.client = new OpenAI({
      apiKey,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: 2,
    });
    this.modelId = modelId;
    this.maxContextTokens = 128_000;
  }

  /**
   * @description Génère un tour de jeu complet sans streaming.
   * @param request - La requête LLM contenant le prompt système et l'historique
   * @returns Le résultat structuré du tour
   */
  async generateTurn(request: LLMRequest): Promise<TurnOutput> {
    return this.generateTurnStreaming(request, () => {});
  }

  /**
   * @description Génère un tour de jeu avec notification de progression via callback.
   * Utilise l'API beta d'OpenAI avec {@link zodResponseFormat} pour obtenir
   * un JSON structuré directement parsé par le SDK.
   * @param request - La requête LLM contenant le prompt système et l'historique
   * @param onChunk - Callback invoqué avec la narration complète une fois la réponse reçue
   * @returns Le résultat structuré du tour, validé par le schéma Zod
   */
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
    // Envoie la narration complète en un seul bloc car OpenAI ne supporte pas
    // le streaming avec structured output — le client reçoit tout d'un coup
    if ((parsed as TurnOutput).narration) {
      onChunk((parsed as TurnOutput).narration);
    }
    return parsed as TurnOutput;
  }

  /**
   * @description Résume un texte selon des instructions données.
   * Utilisé pour compresser l'historique de conversation lorsque
   * la fenêtre de contexte approche de sa limite.
   * @param text - Le texte à résumer
   * @param instructions - Les consignes de résumé
   * @returns Le texte résumé
   */
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

  /**
   * @description Effectue une génération de texte libre (non structurée).
   * @param systemPrompt - Le prompt système définissant le comportement du modèle
   * @param userPrompt - Le message utilisateur / la consigne de génération
   * @param maxTokens - Nombre maximum de tokens en sortie (par défaut 4096)
   * @returns Le texte généré brut
   */
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

/**
 * @description Met en concurrence une promesse avec un délai d'expiration.
 * @param promise - La promesse à surveiller
 * @param ms - Le délai maximum en millisecondes
 * @param message - Le message d'erreur en cas d'expiration
 * @returns Le résultat de la promesse si elle se résout avant le délai
 * @throws {Error} Si le délai est dépassé
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}
