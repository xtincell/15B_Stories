# 15B Stories

**Moteur narratif RPG interactif propulse par IA — Structure en 15 beats**

Un moteur de jeu de role narratif ou une IA (Claude ou GPT) joue le role de Maitre du Jeu. Chaque histoire suit la structure en 15 beats de Blake Snyder (*Save the Cat!*), garantissant un arc narratif complet avec montee en tension, climax et resolution.

---

## Livres inclus

### Kinara *Classic*
> *La ou les esprits marchent parmi les vivants*

Un univers d'African Fantasy uchronique ou esprits et humains vivent en harmonie. Quatre piliers de stats — **Ubuntu** (lien), **Maat** (justice), **Sankofa** (memoire), **Biso** (audace) — guident les choix du joueur a travers un monde ou l'esclavage de l'Afrique noire n'a jamais eu lieu.

**Archetypes :** Guerrier, Griot, Guerisseur, Explorateur

### Nuit Eternelle
> *Entre fang et coeur, choisissez votre destinee dans les cours royales du futur africain*

Romance surnaturelle afrofuturiste en 2200. Une renaissance aristocratique africaine mele technologie et traditions ancestrales. Plongez dans une passion interdite entre les Maisons Fenrir (loups-garous) et Sangu (vampires).

**Archetypes :** Prince Fenrir, Vampire Sangu, Grigriot Ancestral, Espion des Ombres

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Serveur** | Fastify 5, TypeScript, ESM |
| **Base de donnees** | SQLite (better-sqlite3, WAL mode) |
| **LLM** | Claude (Anthropic) ou GPT (OpenAI) |
| **Client** | Vanilla JS, CSS, PWA installable |
| **Streaming** | SSE (narration), WebSocket (multiplayer) |
| **Export** | ZIP (archiver / adm-zip) |

---

## Installation

```bash
# Cloner le repo
git clone https://github.com/xtincell/15B_Stories.git
cd 15B_Stories

# Installer les dependances
npm install

# Configurer l'environnement
cp .env.example .env
# Editer .env avec votre cle API (Claude ou OpenAI)

# Lancer en developpement
npm run dev
```

Le serveur demarre sur `http://localhost:3017`.

### Variables d'environnement

| Variable | Description | Defaut |
|----------|-------------|--------|
| `LLM_PROVIDER` | `claude` ou `openai` | `claude` |
| `ANTHROPIC_API_KEY` | Cle API Anthropic | — |
| `CLAUDE_MODEL` | Modele Claude a utiliser | `claude-sonnet-4-5-20250929` |
| `OPENAI_API_KEY` | Cle API OpenAI | — |
| `OPENAI_MODEL` | Modele OpenAI a utiliser | `gpt-4o` |
| `SUMMARIZER_PROVIDER` | Provider pour le resume de beats | `claude` |
| `SUMMARIZER_MODEL` | Modele economique pour les resumes | `claude-haiku-4-5-20251001` |
| `PORT` | Port du serveur | `3017` |
| `HOST` | Hote du serveur | `0.0.0.0` |
| `GAME_BOOK` | Livre par defaut | `kinara` |

---

## Scripts npm

```bash
npm run dev        # Developpement avec hot reload (tsx watch)
npm run build      # Compilation TypeScript + build client
npm start          # Serveur de production
npm run typecheck  # Verification des types sans compilation
npm test           # Tests (vitest)
npm run test:watch # Tests en mode watch
```

---

## Architecture

```
src/
├── books/                    # Livres de jeu (contenu narratif)
│   ├── kinara/               #   African Fantasy classique
│   └── nuit-eternelle/       #   Romance surnaturelle afrofuturiste
├── client/                   # Client web (PWA)
│   ├── scripts/app.js        #   Application principale
│   ├── styles/               #   CSS (hub, chat, sidebar, dice...)
│   ├── manifest.json         #   PWA manifest
│   └── sw.js                 #   Service worker
├── engine/                   # Moteur de jeu
│   ├── beat-manager.ts       #   Gestion des 15 beats narratifs
│   ├── book-generator.ts     #   Generation de livres via LLM
│   ├── skill-check.ts        #   Systeme de jets de des
│   ├── consequences.ts       #   Consequences des actions
│   └── ...
├── llm/                      # Couche d'abstraction LLM
│   ├── claude-adapter.ts     #   Adaptateur Anthropic
│   ├── openai-adapter.ts     #   Adaptateur OpenAI
│   └── factory.ts            #   Factory pattern
├── memory/                   # Systeme de memoire
│   ├── documentary/          #   Contenu narratif (beats, lore)
│   ├── functional/           #   Regles et evaluation de tours
│   └── persistent/           #   Persistance SQLite
├── prompts/                  # Templates de prompts LLM
│   └── templates/            #   base-system.md, scene-format.md...
├── server/                   # Serveur Fastify
│   ├── app.ts                #   Configuration de l'app
│   └── routes/               #   Routes API
└── types/                    # Types TypeScript partages
```

---

## Features

### Moteur narratif a 15 beats
Chaque partie suit la structure *Save the Cat!* : Opening Image, Catalyst, Midpoint, All Is Lost, Finale... Le LLM genere la narration en respectant le beat actuel, assurant un arc dramatique complet.

### Systeme de des et skill checks
Jets de d20 + modificateur de stat contre un DC (Difficulty Class). Les choix proposes par le LLM indiquent la stat dominante et la difficulte. Succes critique, echec critique, et resultats intermediaires affectent la narration.

### Tooltips glossaire
Au survol (desktop) ou appui long (mobile), les termes du livre — PNJ, lieux, elements de lore — affichent une definition contextuelle extraite automatiquement des fichiers du livre.

### Export / Import de livres
Telechargez un livre en ZIP depuis le hub, ou importez un livre tiers. Validation structurelle automatique (meta.json, beats, archetypes, NPCs, lore).

### PWA Mobile
Installable sur mobile via "Ajouter a l'ecran d'accueil". Interface responsive avec sidebar en bottom sheet, choix pleine largeur, et optimisations tactiles.

### Generateur de livres
Creez un nouveau livre complet via un prompt : l'IA genere meta, archetypes, 15 beats, NPCs, lore et theme CSS.

### Fondations multijoueur
Systeme de rooms avec codes d'invitation, WebSocket bidirectionnel, et architecture prete pour le jeu en groupe (tours, broadcast de narration).

---

## Jouer sur mobile

1. Lancez le serveur sur votre machine
2. Depuis un telephone sur le meme reseau, ouvrez `http://<ip-serveur>:3017`
3. **Android** : menu ⋮ → *Ajouter a l'ecran d'accueil*
4. **iPhone** : bouton Partage → *Sur l'ecran d'accueil*

L'app s'installe comme une application native (plein ecran, icone dediee).

---

## Structure d'un livre

Chaque livre est un dossier autonome sous `src/books/{id}/` :

```
mon-livre/
├── meta.json              # Metadonnees (nom, stats, description, config)
├── theme.css              # Theme visuel personnalise
├── archetypes/
│   ├── index.json         # Liste des archetypes disponibles
│   └── {archetype}.json   # Definition de chaque archetype
├── beats/
│   ├── 01-opening-image.json
│   ├── 02-theme-stated.json
│   └── ... (15 fichiers)  # Un fichier par beat narratif
├── npcs/
│   ├── index.json         # Liste des PNJ
│   └── {npc}.json         # Profil de chaque PNJ
└── lore/
    ├── world.md           # Description du monde
    ├── history.md         # Histoire du monde
    └── ...                # Fichiers de lore additionnels
```

---

## Licence

Projet personnel. Tous droits reserves.

---

*Propulse par Claude (Anthropic) et GPT (OpenAI)*
