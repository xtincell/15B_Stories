import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { getDb } from '../../memory/persistent/db.js';

// ── Room connections registry ──
// Maps roomId → Set of connected WebSocket clients with their playerId
interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  playerName: string;
}

const roomConnections = new Map<string, Set<ConnectedClient>>();

/**
 * Broadcast a message to all connected clients in a room.
 */
export function broadcastToRoom(roomId: string, message: object, excludePlayerId?: string): void {
  const clients = roomConnections.get(roomId);
  if (!clients) return;

  const data = JSON.stringify(message);
  for (const client of clients) {
    if (excludePlayerId && client.playerId === excludePlayerId) continue;
    if (client.ws.readyState === 1) { // OPEN
      client.ws.send(data);
    }
  }
}

/**
 * Get the list of connected players in a room.
 */
function getConnectedPlayers(roomId: string): { playerId: string; playerName: string }[] {
  const clients = roomConnections.get(roomId);
  if (!clients) return [];
  return Array.from(clients).map(c => ({ playerId: c.playerId, playerName: c.playerName }));
}

export const wsRoutes: FastifyPluginAsync = async (app) => {

  // WS /api/ws/:roomId?playerId=xxx&playerName=yyy
  app.get<{ Params: { roomId: string }; Querystring: { playerId?: string; playerName?: string } }>(
    '/:roomId',
    { websocket: true },
    (socket, request) => {
      const { roomId } = request.params;
      const playerId = request.query.playerId || 'anonymous';
      const playerName = request.query.playerName || 'Joueur';

      // Verify room exists
      const db = getDb();
      const room = db.prepare('SELECT id, status FROM rooms WHERE id = ?').get(roomId) as any;
      if (!room) {
        socket.send(JSON.stringify({ type: 'error', message: 'Room introuvable' }));
        socket.close();
        return;
      }

      // Register connection
      if (!roomConnections.has(roomId)) {
        roomConnections.set(roomId, new Set());
      }
      const client: ConnectedClient = { ws: socket, playerId, playerName };
      roomConnections.get(roomId)!.add(client);

      // Notify room of new player
      broadcastToRoom(roomId, {
        type: 'player_joined',
        playerId,
        playerName,
        players: getConnectedPlayers(roomId),
      });

      // Send initial state to the joining player
      socket.send(JSON.stringify({
        type: 'room_state',
        roomId,
        status: room.status,
        players: getConnectedPlayers(roomId),
      }));

      // Handle incoming messages
      socket.on('message', (rawData: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const msg = JSON.parse(rawData.toString());

          switch (msg.type) {
            case 'chat':
              // Broadcast chat message to all players
              broadcastToRoom(roomId, {
                type: 'chat',
                playerId,
                playerName,
                message: msg.message,
                timestamp: new Date().toISOString(),
              });
              break;

            case 'ping':
              socket.send(JSON.stringify({ type: 'pong' }));
              break;

            default:
              // Unknown message type — log and ignore
              app.log.warn(`WS unknown message type: ${msg.type}`);
          }
        } catch {
          // Invalid JSON — ignore
        }
      });

      // Handle disconnect
      socket.on('close', () => {
        const clients = roomConnections.get(roomId);
        if (clients) {
          clients.delete(client);
          if (clients.size === 0) {
            roomConnections.delete(roomId);
          } else {
            broadcastToRoom(roomId, {
              type: 'player_left',
              playerId,
              playerName,
              players: getConnectedPlayers(roomId),
            });
          }
        }
      });
    },
  );
};
