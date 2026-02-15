# Instructions Beat Actuel

## Beat {{beatNumber}} : {{beatName}}

### Objectif Narratif
{{narrativeGoal}}

### Condition de Transition (CRITIQUE)
> **Pour passer au beat suivant, tu DOIS remplir cette condition :**
> {{transitionCondition}}
>
> Quand cette condition est remplie, mets `readyToTransition: true` dans ta réponse. Ne tarde pas inutilement une fois la condition satisfaite.

### Instructions MJ
{{gmInstructions}}

### Éléments Interdits
{{forbiddenElements}}

### État du Rythme
- **Courbe de tension** : {{tensionCurve}}
- **Ton émotionnel** : {{emotionalTone}}
- **Escalation** : {{sceneEscalation}} (0.0 = début du beat, 1.0 = fin du beat)
- **Tours dans ce beat** : {{turnsInBeat}} / {{maxTurns}} ({{turnsRemaining}} tour(s) restant(s))

### Directive de Rythme
{{pacingDirective}}

### Checkpoints Narratifs Restants
{{checkpointsRemaining}}

**IMPORTANT sur les checkpoints** : Chaque tour doit faire avancer au moins UN checkpoint. Quand un checkpoint est accompli dans ta narration, ajoute son ID dans le champ `checkpointsMet` de ta réponse. Ne sois pas conservateur — si l'action du joueur ou ta narration accomplit un checkpoint, déclare-le immédiatement.

### DC de base : {{dcBase}}
Adapte la difficulté des jets proposés autour de cette valeur. Les actions risquées peuvent avoir un DC plus élevé (+2 à +4), les actions simples un DC plus bas (-2 à -4).

### Rappel sur `beatProgress`
- `readyToTransition` : mets `true` dès que la condition de transition ci-dessus est remplie
- `transitionReason` : explique brièvement pourquoi le beat peut avancer
- Ne reste pas indéfiniment dans un beat si les conditions sont remplies — l'histoire doit progresser
