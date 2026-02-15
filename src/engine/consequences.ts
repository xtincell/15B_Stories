import { setWorldFlag, getWorldFlags } from '../memory/persistent/world-state.js';
import type { StateChange } from '../types/llm.js';
import type { Character, StatBlock } from '../types/game.js';
import { clampStat, clampAffinity } from './stats.js';
import { updateCharacterStats, updateCharacterHp, updateCharacterInventory } from '../memory/persistent/character-state.js';
import { updateAffinity } from '../memory/persistent/npc-state.js';

/**
 * Apply a list of state changes from the LLM output.
 * Validates and clamps values to legal ranges.
 * Returns a log of what was actually applied.
 */
export function applyStateChanges(
  changes: StateChange[],
  character: Character,
  sessionId: string,
  currentBeat: number,
): { applied: string[]; rejected: string[] } {
  const applied: string[] = [];
  const rejected: string[] = [];

  for (const change of changes) {
    try {
      switch (change.type) {
        case 'stat_change': {
          const stat = change.target as keyof StatBlock;
          if (!['ubuntu', 'maat', 'sankofa', 'biso'].includes(stat)) {
            rejected.push(`Invalid stat: ${change.target}`);
            break;
          }
          const delta = Number(change.value);
          if (isNaN(delta)) {
            rejected.push(`Invalid stat delta: ${change.value}`);
            break;
          }
          const newValue = clampStat(character.stats[stat] + delta);
          character.stats[stat] = newValue;
          updateCharacterStats(character.id, { [stat]: newValue });
          applied.push(`${stat}: ${delta >= 0 ? '+' : ''}${delta} → ${newValue}`);
          break;
        }

        case 'hp_change': {
          const delta = Number(change.value);
          if (isNaN(delta)) {
            rejected.push(`Invalid HP delta: ${change.value}`);
            break;
          }
          const newHp = Math.max(0, Math.min(character.maxHp, character.hp + delta));
          character.hp = newHp;
          updateCharacterHp(character.id, newHp);
          applied.push(`HP: ${delta >= 0 ? '+' : ''}${delta} → ${newHp}/${character.maxHp}`);
          break;
        }

        case 'inventory_add': {
          const item = {
            id: change.target,
            name: String(change.value),
            description: change.reason,
            usable: true,
          };
          character.inventory.push(item);
          updateCharacterInventory(character.id, character.inventory);
          applied.push(`Inventaire +: ${item.name}`);
          break;
        }

        case 'inventory_remove': {
          const idx = character.inventory.findIndex(i => i.id === change.target);
          if (idx >= 0) {
            const removed = character.inventory.splice(idx, 1)[0];
            updateCharacterInventory(character.id, character.inventory);
            applied.push(`Inventaire -: ${removed.name}`);
          } else {
            rejected.push(`Item not found: ${change.target}`);
          }
          break;
        }

        case 'flag_set': {
          setWorldFlag(sessionId, change.target, change.value);
          applied.push(`Flag: ${change.target} = ${change.value}`);
          break;
        }

        case 'relationship_change': {
          const delta = Number(change.value);
          if (isNaN(delta)) {
            rejected.push(`Invalid affinity delta: ${change.value}`);
            break;
          }
          const result = updateAffinity(sessionId, change.target, delta, currentBeat, change.reason);
          if (result) {
            applied.push(`Relation ${change.target}: ${delta >= 0 ? '+' : ''}${delta} → ${result.affinity}`);
          } else {
            rejected.push(`NPC not found: ${change.target}`);
          }
          break;
        }

        case 'beat_progress': {
          // Beat progress is handled by the beat-manager, not here
          applied.push(`Beat progress signal: ${change.reason}`);
          break;
        }

        default:
          rejected.push(`Unknown change type: ${(change as any).type}`);
      }
    } catch (err) {
      rejected.push(`Error applying ${change.type} on ${change.target}: ${err}`);
    }
  }

  return { applied, rejected };
}
