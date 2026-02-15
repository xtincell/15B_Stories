import type { StatName } from './game.js';

export interface DiceRollRequest {
  type: 'active' | 'passive';
  stat: StatName;
  dc: number;
  advantage?: boolean;
  disadvantage?: boolean;
}

export interface DiceRollResult {
  roll: number;            // raw d20 roll
  modifier: number;        // stat modifier
  total: number;           // roll + modifier
  dc: number;
  success: boolean;
  criticalSuccess: boolean;  // natural 20
  criticalFailure: boolean;  // natural 1
}

export interface BeatTransitionCheck {
  canTransition: boolean;
  currentBeat: number;
  nextBeat: number;
  reason: string;
  minimumScenesMet: boolean;
  narrativeGoalMet: boolean;
  checkpointsComplete: boolean;
}
