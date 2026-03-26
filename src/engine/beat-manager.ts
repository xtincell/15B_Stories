/**
 * @module beat-manager
 * @description Gestionnaire du rythme narratif (pacing) et des transitions entre beats.
 *
 * Ce module orchestre la progression du joueur à travers les 15 beats de la structure
 * narrative de Blake Snyder. Il gère la courbe de tension, le ton émotionnel,
 * les points de contrôle narratifs et les conditions de transition d'un beat à l'autre.
 *
 * Le pacing est persisté en base de données pour permettre la reprise de session.
 */

import { v4 as uuid } from 'uuid';
import { getDb } from '../memory/persistent/db.js';
import { getBeatDefinition, createInitialPacing } from '../memory/documentary/beat-content.js';
import type { BeatPacing, BeatDefinition, NarrativeCheckpoint, EmotionalTone } from '../types/game.js';
import type { BeatTransitionCheck } from '../types/engine.js';

/**
 * Récupère ou crée l'état de rythme (pacing) pour un beat donné.
 *
 * Si un état existe déjà en base pour cette session et ce beat, il est retourné.
 * Sinon, un pacing initial est créé à partir de la définition du beat, persisté,
 * puis retourné.
 *
 * @param sessionId - Identifiant unique de la session de jeu
 * @param beatNumber - Numéro du beat (1 à 15)
 * @param bookId - Identifiant du livre-jeu
 * @returns L'état de rythme du beat, existant ou nouvellement créé
 * @throws Si le beat demandé n'existe pas dans la définition du livre
 */
export function getPacing(sessionId: string, beatNumber: number, bookId: string): BeatPacing {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM beat_pacing WHERE session_id = ? AND beat_number = ?'
  ).get(sessionId, beatNumber) as any;

  if (row) {
    return {
      tensionCurve: row.tension_curve,
      emotionalTone: row.emotional_tone,
      narrativeCheckpoints: JSON.parse(row.checkpoints_json),
      sceneEscalation: row.scene_escalation,
      maxTurnsBeforeForceProgress: row.max_turns_before_force,
      turnsInBeat: row.turns_in_beat,
    };
  }

  // Create initial pacing from beat definition
  const beat = getBeatDefinition(bookId, beatNumber);
  if (!beat) throw new Error(`Beat ${beatNumber} not found`);

  const pacing = createInitialPacing(beat);
  savePacing(sessionId, beatNumber, pacing);
  return pacing;
}

/**
 * Met à jour le rythme narratif après un tour de jeu.
 *
 * Incrémente le compteur de tours, recalcule l'escalade de scène,
 * marque les checkpoints atteints, ajuste la courbe de tension
 * et fait évoluer le ton émotionnel si le LLM suggère un changement valide.
 *
 * @param sessionId - Identifiant unique de la session de jeu
 * @param beatNumber - Numéro du beat courant (1 à 15)
 * @param bookId - Identifiant du livre-jeu
 * @param checkpointsMet - Liste optionnelle des IDs de checkpoints narratifs atteints ce tour
 * @param llmMoodTag - Tag d'humeur optionnel suggéré par le LLM pour faire évoluer le ton
 * @returns L'état de rythme mis à jour
 * @throws Si le beat demandé n'existe pas dans la définition du livre
 */
export function advancePacing(
  sessionId: string,
  beatNumber: number,
  bookId: string,
  checkpointsMet?: string[],
  llmMoodTag?: string,
): BeatPacing {
  const pacing = getPacing(sessionId, beatNumber, bookId);
  const beat = getBeatDefinition(bookId, beatNumber);
  if (!beat) throw new Error(`Beat ${beatNumber} not found`);

  // Increment turn count
  pacing.turnsInBeat += 1;

  // Update scene escalation (0.0 to 1.0)
  pacing.sceneEscalation = Math.min(1.0, pacing.turnsInBeat / beat.maxScenes);

  // Mark checkpoints as met
  if (checkpointsMet) {
    for (const cpId of checkpointsMet) {
      const cp = pacing.narrativeCheckpoints.find(c => c.id === cpId);
      if (cp) cp.met = true;
    }
  }

  // La courbe de tension s'adapte automatiquement à l'escalade :
  // au-delà de 80%, on bascule en climax pour forcer la résolution
  if (pacing.sceneEscalation >= 0.8) {
    pacing.tensionCurve = 'climax';
  } else if (pacing.sceneEscalation >= 0.5 && pacing.tensionCurve !== 'climax') {
    pacing.tensionCurve = 'rising';
  }

  // Évolution du ton émotionnel : on n'accepte un changement que si le tag
  // proposé par le LLM est une émotion reconnue ET qu'il correspond aux
  // humeurs suggérées du beat ou que la scène est suffisamment avancée (≥50%)
  const validTones: Set<string> = new Set(['wonder', 'dread', 'hope', 'grief', 'triumph', 'tension', 'serenity', 'rage']);
  if (llmMoodTag && validTones.has(llmMoodTag)) {
    const suggestedMoods = new Set(beat.suggestedMoodTags as string[]);
    if (suggestedMoods.has(llmMoodTag) || pacing.sceneEscalation >= 0.5) {
      pacing.emotionalTone = llmMoodTag as EmotionalTone;
    }
  }

  savePacing(sessionId, beatNumber, pacing);
  return pacing;
}

/**
 * Vérifie si la transition vers le beat suivant est autorisée.
 *
 * La transition nécessite normalement trois conditions :
 * 1. Le nombre minimum de scènes a été joué
 * 2. Tous les checkpoints narratifs sont atteints
 * 3. Le LLM estime que l'objectif narratif est rempli
 *
 * En mode rapide ('rapide'), la condition de scènes minimum est ignorée
 * pour permettre une progression d'un beat par tour.
 * Une progression forcée intervient si le joueur reste bloqué trop longtemps.
 *
 * @param sessionId - Identifiant unique de la session de jeu
 * @param beatNumber - Numéro du beat courant (1 à 15)
 * @param bookId - Identifiant du livre-jeu
 * @param llmReadyToTransition - Indique si le LLM considère la transition narrativement justifiée
 * @param isQuickMode - Si vrai, ignore la contrainte de scènes minimum
 * @returns Objet décrivant si la transition est possible et pourquoi
 */
export function checkBeatTransition(
  sessionId: string,
  beatNumber: number,
  bookId: string,
  llmReadyToTransition: boolean,
  isQuickMode: boolean = false,
): BeatTransitionCheck {
  const beat = getBeatDefinition(bookId, beatNumber);
  if (!beat) {
    return {
      canTransition: false,
      currentBeat: beatNumber,
      nextBeat: beatNumber + 1,
      reason: `Beat ${beatNumber} not found`,
      minimumScenesMet: false,
      narrativeGoalMet: false,
      checkpointsComplete: false,
    };
  }

  const pacing = getPacing(sessionId, beatNumber, bookId);

  // In quick mode, bypass minScenes requirement — 1 turn = 1 beat
  const minimumScenesMet = isQuickMode || pacing.turnsInBeat >= beat.minScenes;
  const checkpointsComplete = pacing.narrativeCheckpoints.every(cp => cp.met);
  const narrativeGoalMet = llmReadyToTransition;

  // Force progress if stuck too long
  const forceProgress = pacing.turnsInBeat >= pacing.maxTurnsBeforeForceProgress;

  const canTransition = (minimumScenesMet && checkpointsComplete && narrativeGoalMet) || forceProgress;

  let reason = '';
  if (canTransition && forceProgress) {
    reason = 'Progression forcée : nombre maximum de tours atteint';
  } else if (canTransition) {
    reason = 'Tous les critères sont remplis';
  } else {
    const missing: string[] = [];
    if (!minimumScenesMet) missing.push(`scènes minimum non atteintes (${pacing.turnsInBeat}/${beat.minScenes})`);
    if (!checkpointsComplete) {
      const remaining = pacing.narrativeCheckpoints.filter(cp => !cp.met).map(cp => cp.description);
      missing.push(`checkpoints restants : ${remaining.join(', ')}`);
    }
    if (!narrativeGoalMet) missing.push('objectif narratif non atteint selon le MJ');
    reason = missing.join(' ; ');
  }

  return {
    canTransition,
    currentBeat: beatNumber,
    nextBeat: Math.min(beatNumber + 1, 15),
    reason,
    minimumScenesMet,
    narrativeGoalMet,
    checkpointsComplete,
  };
}

/**
 * Effectue la transition vers le beat suivant.
 *
 * Initialise le pacing du prochain beat (plafonné à 15, le dernier beat).
 *
 * @param sessionId - Identifiant unique de la session de jeu
 * @param currentBeat - Numéro du beat courant
 * @param bookId - Identifiant du livre-jeu
 * @returns L'état de rythme du nouveau beat
 */
export function transitionToNextBeat(sessionId: string, currentBeat: number, bookId: string): BeatPacing {
  const nextBeat = Math.min(currentBeat + 1, 15);
  return getPacing(sessionId, nextBeat, bookId);
}

// ── Persistance ──

/**
 * Persiste l'état de rythme d'un beat en base de données.
 *
 * Utilise un UPSERT pour créer ou mettre à jour l'enregistrement.
 *
 * @param sessionId - Identifiant unique de la session de jeu
 * @param beatNumber - Numéro du beat
 * @param pacing - État de rythme à sauvegarder
 */
function savePacing(sessionId: string, beatNumber: number, pacing: BeatPacing): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO beat_pacing (id, session_id, beat_number, tension_curve, emotional_tone, checkpoints_json, scene_escalation, max_turns_before_force, turns_in_beat)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, beat_number) DO UPDATE SET
      tension_curve = excluded.tension_curve,
      emotional_tone = excluded.emotional_tone,
      checkpoints_json = excluded.checkpoints_json,
      scene_escalation = excluded.scene_escalation,
      max_turns_before_force = excluded.max_turns_before_force,
      turns_in_beat = excluded.turns_in_beat
  `).run(
    uuid(),
    sessionId,
    beatNumber,
    pacing.tensionCurve,
    pacing.emotionalTone,
    JSON.stringify(pacing.narrativeCheckpoints),
    pacing.sceneEscalation,
    pacing.maxTurnsBeforeForceProgress,
    pacing.turnsInBeat,
  );
}
