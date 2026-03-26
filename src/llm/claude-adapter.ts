/**
 * @module claude-adapter
 * @description Adaptateur LLM pour l'API Anthropic Claude.
 * Implémente l'interface {@link LLMAdapter} et fournit le streaming de réponses,
 * la génération de tours de jeu, la synthèse de texte et la génération libre.
 * Gère les timeouts et les tentatives de reconnexion via le SDK Anthropic.
 */
import Anthropic from '@anthropic-ai/sdk';
import { TurnOutputSchema } from './output-schema.js';
import type { LLMAdapter, LLMRequest, TurnOutput, StreamCallback } from '../types/llm.js';

/** Délai maximum d'attente pour un appel API (en millisecondes) */
const LLM_TIMEOUT_MS = 60_000; // 60s timeout
/** Nombre maximum de tentatives en cas d'échec réseau */
const MAX_RETRIES = 2;
/** Délai entre les tentatives de reconnexion (en millisecondes) */
const RETRY_DELAY_MS = 1000;

/**
 * @description Adaptateur pour l'API Anthropic Claude.
 * Encapsule le client Anthropic et expose les méthodes de génération
 * conformes à l'interface commune {@link LLMAdapter}.
 */
export class ClaudeAdapter implements LLMAdapter {
  private client: Anthropic;
  readonly modelId: string;
  readonly maxContextTokens: number;

  /**
   * @description Crée une nouvelle instance de l'adaptateur Claude.
   * @param apiKey - Clé d'API Anthropic pour l'authentification
   * @param modelId - Identifiant du modèle Claude à utiliser (par défaut : claude-sonnet-4-5)
   */
  constructor(apiKey: string, modelId: string = 'claude-sonnet-4-5-20250929') {
    this.client = new Anthropic({
      apiKey,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
    this.modelId = modelId;
    this.maxContextTokens = 200_000;
  }

  /**
   * @description Génère un tour de jeu complet sans streaming.
   * Délègue en interne à {@link generateTurnStreaming} avec un callback vide.
   * @param request - La requête LLM contenant le prompt système et l'historique
   * @returns Le résultat structuré du tour (narration, choix, changements d'état)
   */
  async generateTurn(request: LLMRequest): Promise<TurnOutput> {
    return this.generateTurnStreaming(request, () => {});
  }

  /**
   * @description Génère un tour de jeu en streaming, en appelant onChunk pour chaque fragment de texte reçu.
   * La réponse complète est ensuite parsée en JSON et validée via le schéma Zod.
   * @param request - La requête LLM contenant le prompt système et l'historique de conversation
   * @param onChunk - Callback invoqué à chaque fragment de texte reçu du stream
   * @returns Le résultat structuré du tour, validé par {@link TurnOutputSchema}
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

  /**
   * @description Gère le flux SSE de l'API Claude et accumule le texte complet.
   * @param request - La requête LLM à envoyer
   * @param onChunk - Callback pour chaque fragment de texte reçu
   * @returns Le texte brut complet de la réponse
   */
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

  /**
   * @description Résume un texte selon des instructions données.
   * Utilisé principalement pour compresser l'historique de conversation
   * lorsque la fenêtre de contexte approche de sa limite.
   * @param text - Le texte à résumer
   * @param instructions - Les consignes de résumé (ton, longueur, focus)
   * @returns Le texte résumé
   */
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

  /**
   * @description Effectue une génération de texte libre (non structurée).
   * Contrairement à {@link generateTurn}, ne parse pas la réponse en JSON.
   * Utile pour des tâches annexes comme la création de personnages ou de descriptions.
   * @param systemPrompt - Le prompt système définissant le comportement du modèle
   * @param userPrompt - Le message utilisateur / la consigne de génération
   * @param maxTokens - Nombre maximum de tokens en sortie (par défaut 4096)
   * @returns Le texte généré brut
   */
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
 * @description Met en concurrence une promesse avec un délai d'expiration.
 * Permet d'éviter qu'un appel API reste bloqué indéfiniment.
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

/**
 * @description Extrait du JSON depuis une réponse textuelle du LLM.
 * Le modèle peut renvoyer du JSON pur, dans un bloc markdown, ou mélangé avec du texte.
 * Cette fonction essaie trois stratégies d'extraction par ordre de fiabilité décroissante.
 * @param text - Le texte brut de la réponse LLM
 * @returns L'objet JSON parsé
 * @throws {Error} Si aucune des stratégies ne parvient à extraire du JSON valide
 */
function extractJson(text: string): unknown {
  // Stratégie 1 : parse direct — cas idéal où le LLM renvoie du JSON pur
  try {
    return JSON.parse(text);
  } catch {
    // Stratégie 2 : extraction depuis un bloc de code markdown (```json ... ```)
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch { /* fall through */ }
    }
    // Stratégie 3 : recherche du premier objet JSON dans le texte brut
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
    }
    throw new Error('Could not extract JSON from LLM response');
  }
}
