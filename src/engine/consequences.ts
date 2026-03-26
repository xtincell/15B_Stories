/**
 * @module consequences
 * @description Moteur d'application des conséquences narratives sur l'état du jeu.
 *
 * Ce module reçoit les changements d'état produits par le LLM (modifications de stats,
 * points de vie, inventaire, drapeaux du monde, relations PNJ) et les applique de
 * manière sécurisée au personnage et à la session. Chaque changement est validé,
 * contraint aux plages légales et journalisé.
 */

import { setWorldFlag, getWorldFlags } from '../memory/persistent/world-state.js';
import type { StateChange } from '../types/llm.js';
import type { Character, StatBlock } from '../types/game.js';
import { clampStat, clampAffinity } from './stats.js';
import { updateCharacterStats, updateCharacterHp, updateCharacterInventory } from '../memory/persistent/character-state.js';
import { updateAffinity } from '../memory/persistent/npc-state.js';

/**
 * Applique une liste de changements d'état issus de la sortie du LLM.
 *
 * Chaque changement est validé individuellement : les valeurs sont contraintes
 * aux plages légales, les cibles invalides sont rejetées, et les erreurs sont
 * capturées sans interrompre le traitement des autres changements.
 *
 * Types de changements gérés :
 * - `stat_change` : modification d'une des 4 stats (ubuntu, maat, sankofa, biso)
 * - `hp_change` : modification des points de vie
 * - `inventory_add` / `inventory_remove` : ajout/retrait d'objets
 * - `flag_set` : pose d'un drapeau sur l'état du monde
 * - `relationship_change` : modification de l'affinité avec un PNJ
 * - `beat_progress` : signal de progression narrative (délégué au beat-manager)
 *
 * @param changes - Liste des changements d'état à appliquer
 * @param character - Personnage du joueur (modifié en place)
 * @param sessionId - Identifiant unique de la session de jeu
 * @param currentBeat - Numéro du beat courant, utilisé pour le suivi des relations
 * @returns Deux listes : les changements appliqués et ceux rejetés, avec descriptions
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
