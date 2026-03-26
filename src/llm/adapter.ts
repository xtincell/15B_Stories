/**
 * @module adapter
 * @description Point d'entrée public du sous-système LLM.
 * Réexporte les types fondamentaux (interface adaptateur, requête, message)
 * afin que le reste de l'application n'ait pas à importer directement depuis `types/llm`.
 */
export type { LLMAdapter, LLMRequest, ConversationMessage } from '../types/llm.js';
