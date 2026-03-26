/**
 * @module output-schema
 * @description Réexporte les schémas Zod et types de sortie du LLM depuis `types/llm`.
 * Ce module sert de façade pour que les adaptateurs LLM n'importent pas directement
 * depuis le dossier `types/`, préservant ainsi une source de vérité unique
 * tout en maintenant une séparation claire des couches.
 */

// Réexportation des schémas Zod — source de vérité unique dans types/llm.ts
export { TurnOutputSchema, ChoiceSchema, StateChangeSchema, DiceResultSchema, CharacterCreationOutputSchema } from '../types/llm.js';
export type { TurnOutput, Choice, StateChange, DiceResult, CharacterCreationOutput } from '../types/llm.js';
