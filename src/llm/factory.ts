/**
 * @module factory
 * @description Fabrique (Factory) pour la création d'adaptateurs LLM.
 * Centralise la logique d'instanciation des adaptateurs Claude et OpenAI,
 * et fournit une méthode utilitaire pour les configurer depuis les variables d'environnement.
 */
import type { LLMAdapter } from '../types/llm.js';
import { ClaudeAdapter } from './claude-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';

/** Noms des fournisseurs LLM supportés */
export type ProviderName = 'claude' | 'openai';

/**
 * @description Configuration nécessaire pour instancier un adaptateur LLM.
 * @property provider - Le fournisseur LLM à utiliser ('claude' ou 'openai')
 * @property apiKey - La clé d'API pour l'authentification
 * @property model - Identifiant optionnel du modèle (un défaut est utilisé sinon)
 */
export interface LLMConfig {
  provider: ProviderName;
  apiKey: string;
  model?: string;
}

/**
 * @description Crée un adaptateur LLM à partir d'une configuration.
 * Utilise le pattern Factory pour instancier le bon adaptateur selon le fournisseur.
 * @param config - La configuration du fournisseur LLM
 * @returns Une instance de l'adaptateur correspondant au fournisseur
 * @throws {Error} Si le fournisseur n'est pas reconnu
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
 * @description Crée les adaptateurs LLM à partir des variables d'environnement.
 * Retourne deux adaptateurs distincts : un principal (pour la génération narrative)
 * et un résumeur (pour la compression d'historique, utilisant un modèle plus léger/rapide).
 *
 * Variables d'environnement utilisées :
 * - `LLM_PROVIDER` : fournisseur principal ('claude' par défaut)
 * - `SUMMARIZER_PROVIDER` : fournisseur du résumeur (hérite du principal par défaut)
 * - `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` : clés d'API
 * - `CLAUDE_MODEL` / `OPENAI_MODEL` : modèle principal
 * - `SUMMARIZER_MODEL` : modèle du résumeur (haiku/gpt-4o-mini par défaut)
 *
 * @returns Un objet contenant les adaptateurs `main` et `summarizer`
 */
export function createAdaptersFromEnv(): { main: LLMAdapter; summarizer: LLMAdapter } {
  const mainProvider = (process.env.LLM_PROVIDER ?? 'claude') as ProviderName;
  // Le résumeur peut utiliser un fournisseur différent pour optimiser coût/latence
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

  // Le résumeur utilise par défaut des modèles plus petits pour réduire les coûts
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
