import { v4 as uuid } from 'uuid';
import { getDb } from '../memory/persistent/db.js';
import { getBeatDefinition, createInitialPacing } from '../memory/documentary/beat-content.js';
import type { BeatPacing, BeatDefinition, NarrativeCheckpoint, EmotionalTone } from '../types/game.js';
import type { BeatTransitionCheck } from '../types/engine.js';

/**
 * Get or create pacing state for a beat.
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
 * Update pacing after a turn.
 * Now also accepts the LLM's moodTag to evolve emotional tone dynamically.
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

  // Auto-adjust tension curve based on escalation
  if (pacing.sceneEscalation >= 0.8) {
    pacing.tensionCurve = 'climax';
  } else if (pacing.sceneEscalation >= 0.5 && pacing.tensionCurve !== 'climax') {
    pacing.tensionCurve = 'rising';
  }

  // Evolve emotional tone if the LLM's moodTag is a valid EmotionalTone
  // and the beat's suggested mood tags include it (or we're past mid-escalation)
  const validTones: Set<string> = new Set(['wonder', 'dread', 'hope', 'grief', 'triumph', 'tension', 'serenity', 'rage']);
  if (llmMoodTag && validTones.has(llmMoodTag)) {
    const suggestedMoods = new Set(beat.suggestedMoodTags as string[]);
    // Accept mood change if: it's in the beat's suggested moods, or we're past half escalation
    if (suggestedMoods.has(llmMoodTag) || pacing.sceneEscalation >= 0.5) {
      pacing.emotionalTone = llmMoodTag as EmotionalTone;
    }
  }

  savePacing(sessionId, beatNumber, pacing);
  return pacing;
}

/**
 * Check if a beat transition is valid.
 * In quick mode ('rapide'), the isQuickMode flag bypasses minScenes requirement
 * to ensure 1 beat per turn progression.
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
 * Transition to the next beat.
 */
export function transitionToNextBeat(sessionId: string, currentBeat: number, bookId: string): BeatPacing {
  const nextBeat = Math.min(currentBeat + 1, 15);
  return getPacing(sessionId, nextBeat, bookId);
}

// ── Persistence ──

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
