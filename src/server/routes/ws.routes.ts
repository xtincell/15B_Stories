/**
 * @module server/routes/ws
 * @description Routes WebSocket pour la communication en temps réel dans les salons multijoueur.
 * Gère les connexions/déconnexions des joueurs, le chat en direct et le broadcasting
 * d'événements à tous les membres d'un salon.
 * Préfixe attendu : /api/ws
 */

import type { FastifyPluginAsync } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { getDb } from '../../memory/persistent/db.js';

// ── Registre des connexions par salon ──
// Associe chaque roomId à l'ensemble des clients WebSocket connectés

/** @description Représente un client WebSocket connecté à un salon. */
interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  playerName: string;
}

/** Registre en mémoire des connexions actives, indexé par ID de salon. */
const roomConnections = new Map<string, Set<ConnectedClient>>();

/**
 * @description Diffuse un message JSON à tous les clients connectés d'un salon.
 * Permet d'exclure un joueur spécifique (utile pour ne pas renvoyer un message à son émetteur).
 * @param {string} roomId - Identifiant du salon cible.
 * @param {object} message - Objet à sérialiser et envoyer.
 * @param {string} [excludePlayerId] - ID du joueur à exclure de la diffusion.
 */
export function broadcastToRoom(roomId: string, message: object, excludePlayerId?: string): void {
  const clients = roomConnections.get(roomId);
  if (!clients) return;

  const data = JSON.stringify(message);
  for (const client of clients) {
    if (excludePlayerId && client.playerId === excludePlayerId) continue;
    if (client.ws.readyState === 1) { // WebSocket.OPEN
      client.ws.send(data);
    }
  }
}

/**
 * @description Retourne la liste des joueurs actuellement connectés via WebSocket dans un salon.
 * @param {string} roomId - Identifiant du salon.
 * @returns {{ playerId: string, playerName: string }[]} Liste des joueurs connectés.
 */
function getConnectedPlayers(roomId: string): { playerId: string; playerName: string }[] {
  const clients = roomConnections.get(roomId);
  if (!clients) return [];
  return Array.from(clients).map(c => ({ playerId: c.playerId, playerName: c.playerName }));
}

/**
 * @description Plugin Fastify regroupant les routes WebSocket multijoueur.
 */
export const wsRoutes: FastifyPluginAsync = async (app) => {

  /**
   * WS /api/ws/:roomId?playerId=xxx&playerName=yyy
   * @description Établit une connexion WebSocket pour un joueur dans un salon.
   * À la connexion : vérifie l'existence du salon, enregistre le client, notifie les autres joueurs
   * et envoie l'état initial au nouveau venu.
   * Messages entrants supportés :
   * - { type: "chat", message: string } → diffusé à tous les joueurs du salon.
   * - { type: "ping" } → répond { type: "pong" } (keep-alive).
   * À la déconnexion : retire le client et notifie les autres joueurs.
   * @param {string} roomId - Identifiant UUID du salon.
   * @param {string} [playerId=anonymous] - Query param : ID unique du joueur.
   * @param {string} [playerName=Joueur] - Query param : nom affiché du joueur.
   */
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

      // Nettoyage à la déconnexion : retire le client et supprime le salon si vide
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
