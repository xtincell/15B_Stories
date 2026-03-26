/**
 * @module server/routes/room
 * @description Routes de gestion des salons multijoueur.
 * Permet la création de salons, la connexion par code, la consultation
 * de l'état d'un salon et le lancement de la partie par l'hôte.
 * Préfixe attendu : /api/rooms
 */

import type { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../memory/persistent/db.js';

/**
 * @description Génère un code de 6 caractères alphanumériques en majuscules,
 * facile à communiquer à l'oral. Exclut I, O, 0 et 1 pour éviter les confusions.
 * @returns {string} Code de rejointe (ex: "K7NP3X").
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * @description Plugin Fastify regroupant les routes de gestion des salons multijoueur.
 */
export const roomRoutes: FastifyPluginAsync = async (app) => {

  /**
   * POST /api/rooms
   * @description Crée un nouveau salon multijoueur. Le créateur devient l'hôte.
   * Un code de rejointe unique est généré pour permettre aux autres joueurs de se connecter.
   * @param {string} body.playerId - ID unique du joueur hôte.
   * @param {string} body.playerName - Nom affiché du joueur hôte.
   * @param {string} body.bookId - Livre de jeu sélectionné pour la partie.
   * @returns {{ roomId: string, joinCode: string, status: "lobby" }}
   * @returns {400} Si un champ requis est manquant.
   */
  app.post<{ Body: { playerId: string; playerName: string; bookId: string } }>('/', async (request, reply) => {
    const { playerId, playerName, bookId } = request.body;
    if (!playerId || !playerName || !bookId) {
      return reply.status(400).send({ error: 'playerId, playerName et bookId requis' });
    }

    const db = getDb();
    const roomId = uuid();
    let joinCode = generateJoinCode();

    // Boucle de collision : re-génère le code si un doublon existe (peu probable mais possible)
    let attempts = 0;
    while (attempts < 10) {
      const existing = db.prepare('SELECT id FROM rooms WHERE join_code = ?').get(joinCode);
      if (!existing) break;
      joinCode = generateJoinCode();
      attempts++;
    }

    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO rooms (id, host_player_id, join_code, book_id, status, max_players, turn_order_json, created_at)
      VALUES (?, ?, ?, ?, 'lobby', 4, '[]', ?)
    `).run(roomId, playerId, joinCode, bookId, now);

    // Add host as first player
    db.prepare(`
      INSERT INTO room_players (room_id, player_id, player_name, joined_at, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(roomId, playerId, playerName, now);

    return { roomId, joinCode, status: 'lobby' };
  });

  /**
   * GET /api/rooms/join/:code
   * @description Rejoint un salon existant via son code de rejointe.
   * Si playerId et playerName sont fournis en query params, le joueur est ajouté au salon (upsert).
   * @param {string} code - Code de rejointe à 6 caractères (insensible à la casse).
   * @param {string} [playerId] - Query param : ID unique du joueur qui rejoint.
   * @param {string} [playerName] - Query param : nom affiché du joueur.
   * @returns {{ roomId, joinCode, bookId, status, hostPlayerId, maxPlayers, sessionId, players[] }}
   * @returns {400} Si le salon est plein.
   * @returns {404} Si le code ne correspond à aucun salon.
   */
  app.get<{ Params: { code: string }; Querystring: { playerId?: string; playerName?: string } }>(
    '/join/:code',
    async (request, reply) => {
      const db = getDb();
      const room = db.prepare('SELECT * FROM rooms WHERE join_code = ?').get(request.params.code.toUpperCase()) as any;
      if (!room) {
        return reply.status(404).send({ error: 'Room introuvable' });
      }

      const { playerId, playerName } = request.query;

      // If playerId provided, try to add them
      if (playerId && playerName) {
        const playerCount = db.prepare('SELECT COUNT(*) as count FROM room_players WHERE room_id = ? AND is_active = 1').get(room.id) as any;
        if (playerCount.count >= room.max_players) {
          return reply.status(400).send({ error: 'Room pleine' });
        }

        // Upsert : réactive le joueur s'il était déjà dans le salon (reconnexion)
        db.prepare(`
          INSERT INTO room_players (room_id, player_id, player_name, joined_at, is_active)
          VALUES (?, ?, ?, ?, 1)
          ON CONFLICT(room_id, player_id) DO UPDATE SET is_active = 1, player_name = excluded.player_name
        `).run(room.id, playerId, playerName, new Date().toISOString());
      }

      // Return room state
      const players = db.prepare('SELECT player_id, player_name, character_id, is_active FROM room_players WHERE room_id = ?').all(room.id);

      return {
        roomId: room.id,
        joinCode: room.join_code,
        bookId: room.book_id,
        status: room.status,
        hostPlayerId: room.host_player_id,
        maxPlayers: room.max_players,
        sessionId: room.session_id,
        players,
      };
    },
  );

  /**
   * GET /api/rooms/:id/state
   * @description Récupère l'état complet d'un salon (joueurs connectés, statut, tour actuel).
   * @param {string} id - Identifiant UUID du salon.
   * @returns {{ roomId, joinCode, bookId, status, hostPlayerId, maxPlayers, sessionId, currentTurnPlayerId, players[] }}
   * @returns {404} Si le salon n'existe pas.
   */
  app.get<{ Params: { id: string } }>('/:id/state', async (request, reply) => {
    const db = getDb();
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(request.params.id) as any;
    if (!room) {
      return reply.status(404).send({ error: 'Room introuvable' });
    }

    const players = db.prepare('SELECT player_id, player_name, character_id, is_active FROM room_players WHERE room_id = ?').all(room.id);

    return {
      roomId: room.id,
      joinCode: room.join_code,
      bookId: room.book_id,
      status: room.status,
      hostPlayerId: room.host_player_id,
      maxPlayers: room.max_players,
      sessionId: room.session_id,
      currentTurnPlayerId: room.current_turn_player_id,
      players,
    };
  });

  /**
   * POST /api/rooms/:id/start
   * @description Lance la partie multijoueur. Réservé à l'hôte du salon.
   * Vérifie que tous les joueurs actifs ont créé un personnage avant de démarrer.
   * L'ordre des tours est déterminé par l'ordre d'inscription des joueurs.
   * @param {string} id - Identifiant UUID du salon.
   * @param {string} body.playerId - ID du joueur qui demande le lancement (doit être l'hôte).
   * @returns {{ status: "playing", currentTurnPlayerId: string }}
   * @returns {400} Si la partie est déjà lancée ou si des joueurs n'ont pas de personnage.
   * @returns {403} Si le demandeur n'est pas l'hôte.
   * @returns {404} Si le salon n'existe pas.
   */
  app.post<{ Params: { id: string }; Body: { playerId: string } }>('/:id/start', async (request, reply) => {
    const db = getDb();
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(request.params.id) as any;
    if (!room) {
      return reply.status(404).send({ error: 'Room introuvable' });
    }
    if (room.host_player_id !== request.body.playerId) {
      return reply.status(403).send({ error: 'Seul l\'hôte peut lancer la partie' });
    }
    if (room.status !== 'lobby') {
      return reply.status(400).send({ error: 'La partie est déjà lancée' });
    }

    // Check all players have characters
    const players = db.prepare('SELECT * FROM room_players WHERE room_id = ? AND is_active = 1').all(room.id) as any[];
    const withoutChar = players.filter(p => !p.character_id);
    if (withoutChar.length > 0) {
      return reply.status(400).send({
        error: 'Tous les joueurs doivent avoir créé un personnage',
        playersWithoutCharacter: withoutChar.map(p => p.player_name),
      });
    }

    // L'ordre des tours suit l'ordre d'inscription ; le premier joueur commence
    const turnOrder = players.map(p => p.player_id);
    db.prepare(`
      UPDATE rooms SET status = 'playing', current_turn_player_id = ?, turn_order_json = ?
      WHERE id = ?
    `).run(turnOrder[0], JSON.stringify(turnOrder), room.id);

    return { status: 'playing', currentTurnPlayerId: turnOrder[0] };
  });
};
