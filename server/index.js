import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Room, Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { schema } from '@colyseus/schema';

const Player = schema({
  name: 'string',
  color: 'number',
  x: 'number',
  y: 'number',
  z: 'number',
  yaw: 'number',
  pitch: 'number',
  updatedAt: 'number'
});

const GalacticState = schema({
  roomCode: 'string',
  players: { map: Player, default: new Map() }
});

const activeRoomCodes = new Set();

function cleanRoomCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

function cleanName(value) {
  return String(value || 'Pilot')
    .replace(/[^\w .'-]/g, '')
    .trim()
    .slice(0, 18) || 'Pilot';
}

function colorFromSession(id) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const palette = [0x50ffff, 0xff5abe, 0xffcd5a, 0x5aff8c, 0xaf5fff, 0xf5f5f5];
  return palette[Math.abs(hash) % palette.length];
}

class GalacticEvoRoom extends Room {
  maxClients = 2;

  onCreate(options) {
    const roomCode = cleanRoomCode(options.roomCode) || cleanRoomCode(this.roomId);
    if (activeRoomCodes.has(roomCode)) {
      throw new Error(`Room ${roomCode} already has two pilots.`);
    }
    activeRoomCodes.add(roomCode);
    this.setState(new GalacticState({ roomCode }));
    this.setMetadata({ roomCode, currentPlayers: 0 });

    this.onMessage('player:update', (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !data) return;
      player.name = cleanName(data.name || player.name);
      player.color = Number(data.color) || player.color;
      player.x = Number(data.x) || 0;
      player.y = Number(data.y) || 0;
      player.z = Number(data.z) || 0;
      player.yaw = Number(data.yaw) || 0;
      player.pitch = Number(data.pitch) || 0;
      player.updatedAt = Date.now();
    });

    this.onMessage('event:start', (client, data) => {
      if (!data || typeof data.eventId !== 'string') return;
      this.broadcast('event:start', {
        eventId: data.eventId,
        eventName: String(data.eventName || ''),
        kind: String(data.kind || ''),
        originId: client.sessionId,
        startedAt: Date.now()
      });
    });

    const peerRelay = (type, client, data) => {
      if (!data) return;
      this.broadcast(type, {
        originId: client.sessionId,
        targetId: String(data.targetId || ''),
        name: cleanName(data.name),
        color: Number(data.color) || colorFromSession(client.sessionId),
        x: Number(data.x) || 0,
        y: Number(data.y) || 0,
        z: Number(data.z) || 0,
        destination: data.destination && typeof data.destination === 'object'
          ? {
              x: Number(data.destination.x) || 0,
              y: Number(data.destination.y) || 0,
              z: Number(data.destination.z) || 0,
              name: String(data.destination.name || 'Squad destination').slice(0, 80),
              color: Number(data.destination.color) || 0x50ffff,
              duration: Math.max(5, Math.min(15, Number(data.destination.duration) || 5))
            }
          : undefined,
        sentAt: Date.now()
      });
    };

    this.onMessage('warp:request', (client, data) => peerRelay('warp:request', client, data));
    this.onMessage('warp:accept', (client, data) => peerRelay('warp:accept', client, data));
    this.onMessage('squad:invite', (client, data) => peerRelay('squad:invite', client, data));
    this.onMessage('squad:accept', (client, data) => peerRelay('squad:accept', client, data));
    this.onMessage('squad:leave', (client, data) => peerRelay('squad:leave', client, data));
    this.onMessage('group:warp', (client, data) => peerRelay('group:warp', client, data));
  }

  onJoin(client, options) {
    const player = new Player({
      name: cleanName(options.name),
      color: Number(options.color) || colorFromSession(client.sessionId),
      x: Number(options.x) || 0,
      y: Number(options.y) || 0,
      z: Number(options.z) || 0,
      yaw: Number(options.yaw) || 0,
      pitch: Number(options.pitch) || 0,
      updatedAt: Date.now()
    });

    this.state.players.set(client.sessionId, player);
    this.setMetadata({ currentPlayers: this.clients.length });
    if (this.clients.length >= this.maxClients) this.lock();

  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.setMetadata({ currentPlayers: this.clients.length });
    if (this.clients.length < this.maxClients) this.unlock();
  }

  onDispose() {
    activeRoomCodes.delete(this.state.roomCode);
  }
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.get('/', (_req, res) => {
  res.json({ ok: true, name: 'Galactic Evo Colyseus Server' });
});
app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: 'galactic_evo' });
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    pingInterval: 6000,
    pingMaxRetries: 4
  })
});

gameServer.define('galactic_evo', GalacticEvoRoom).filterBy(['roomCode']);

const port = Number(process.env.PORT || 2567);
const host = process.env.HOST || '0.0.0.0';
gameServer.listen(port, host);
console.log(`Galactic Evo multiplayer server listening on http://${host}:${port}`);
