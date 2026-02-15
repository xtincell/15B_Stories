import type { FastifyPluginAsync } from 'fastify';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../memory/persistent/db.js';

/**
 * Generate a 6-character alphanumeric join code (uppercase, easy to share verbally).
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const roomRoutes: FastifyPluginAsync = async (app) => {

  // POST /api/rooms — Create a new room (host)
  app.post<{ Body: { playerId: string; playerName: string; bookId: string } }>('/', async (request, reply) => {
    const { playerId, playerName, bookId } = request.body;
    if (!playerId || !playerName || !bookId) {
      return reply.status(400).send({ error: 'playerId, playerName et bookId requis' });
    }

    const db = getDb();
    const roomId = uuid();
    let joinCode = generateJoinCode();

    // Ensure unique join code
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

  // GET /api/rooms/join/:code — Join a room by code
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

        // Upsert player
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

  // GET /api/rooms/:id/state — Get room state
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

  // POST /api/rooms/:id/start — Start the game (host only)
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

    // Update room status
    const turnOrder = players.map(p => p.player_id);
    db.prepare(`
      UPDATE rooms SET status = 'playing', current_turn_player_id = ?, turn_order_json = ?
      WHERE id = ?
    `).run(turnOrder[0], JSON.stringify(turnOrder), room.id);

    return { status: 'playing', currentTurnPlayerId: turnOrder[0] };
  });
};
