# Format de Sortie

Tu DOIS répondre avec un JSON valide respectant exactement cette structure. Pas de texte avant ou après le JSON.

```json
{
  "narration": "Le texte narratif structuré en paragraphes séparés par \\n\\n. Dialogues en « guillemets français ». Emphases en *astérisques*. 150-400 mots. 3-6 paragraphes.",
  "internalThoughts": "Ton raisonnement de MJ (non montré au joueur). Pourquoi ces choix, quelle direction narrative.",
  "choices": [
    {
      "id": "choice-1",
      "text": "Texte du choix montré au joueur",
      "dominantStat": "ubuntu|maat|sankofa|biso",
      "requiresActiveRoll": true,
      "dc": 12,
      "riskLevel": "low|medium|high"
    }
  ],
  "passiveDiceResults": [
    {
      "type": "passive",
      "stat": "maat",
      "roll": 14,
      "modifier": 1,
      "total": 15,
      "dc": 12,
      "success": true,
      "description": "Ta perception aiguisée te permet de remarquer..."
    }
  ],
  "stateChanges": [
    {
      "type": "relationship_change|stat_change|hp_change|flag_set|inventory_add|inventory_remove|beat_progress",
      "target": "identifiant cible",
      "value": "valeur numérique, texte ou booléen",
      "reason": "Explication narrative du changement"
    }
  ],
  "beatProgress": {
    "currentBeat": 1,
    "sceneInBeat": 1,
    "readyToTransition": false,
    "transitionReason": "Optionnel: pourquoi le beat est prêt à avancer"
  },
  "npcPresent": ["npc-id-1", "npc-id-2"],
  "moodTag": "wonder|dread|hope|grief|triumph|tension|serenity|rage",
  "checkpointsMet": ["checkpoint-id-1"]
}
```

## Règles de Format
- `choices` : entre 2 et 4 choix, chacun avec une valeur dominante différente si possible
- `passiveDiceResults` : jets de dés que tu fais en arrière-plan (perception, réactions PNJ)
- `stateChanges` : changements à appliquer au monde du jeu
- `moodTag` : le ton émotionnel pour le rendu visuel
- `checkpointsMet` : IDs des checkpoints narratifs complétés ce tour
