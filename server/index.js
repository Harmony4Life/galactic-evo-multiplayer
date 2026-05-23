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
  hp: 'number',
  shield: 'number',
  warpPhase: 'string',
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

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, min, max, fallback = min) {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function applyCombatDamage(player, damage) {
  const amount = clampNumber(damage, 0, 20, 0);
  const currentShield = clampNumber(player.shield, 0, 50, 50);
  const currentHull = clampNumber(player.hp, 0, 100, 100);
  const shieldDamage = Math.min(currentShield, amount);
  const hullDamage = Math.max(0, amount - shieldDamage);
  player.shield = Math.max(0, currentShield - shieldDamage);
  player.hp = Math.max(0, currentHull - hullDamage);
  player.updatedAt = Date.now();
}

class GalacticEvoRoom extends Room {
  maxClients = 2;

  onCreate(options) {
    if (typeof this.setPatchRate === 'function') this.setPatchRate(1000 / 30);
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
      player.color = finiteNumber(data.color, player.color);
      player.x = finiteNumber(data.x, player.x);
      player.y = finiteNumber(data.y, player.y);
      player.z = finiteNumber(data.z, player.z);
      player.yaw = finiteNumber(data.yaw, player.yaw);
      player.pitch = finiteNumber(data.pitch, player.pitch);
      player.hp = clampNumber(data.hp, 0, 100, player.hp);
      player.shield = clampNumber(data.shield, 0, 50, player.shield);
      player.warpPhase = String(data.warpPhase || 'idle').slice(0, 12);
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
        color: finiteNumber(data.color, colorFromSession(client.sessionId)),
        x: finiteNumber(data.x),
        y: finiteNumber(data.y),
        z: finiteNumber(data.z),
        hp: clampNumber(data.hp, 0, 100, 100),
        shield: clampNumber(data.shield, 0, 50, 50),
        destination: data.destination && typeof data.destination === 'object'
          ? {
              x: finiteNumber(data.destination.x),
              y: finiteNumber(data.destination.y),
              z: finiteNumber(data.destination.z),
              name: String(data.destination.name || 'Squad destination').slice(0, 80),
              color: finiteNumber(data.destination.color, 0x50ffff),
              duration: clampNumber(data.destination.duration, 5, 15, 5)
            }
          : undefined,
        shot: data.shot && typeof data.shot === 'object'
          ? {
              id: String(data.shot.id || '').slice(0, 80),
              side: Number(data.shot.side) < 0 ? -1 : 1,
              origin: {
                x: finiteNumber(data.shot.origin?.x),
                y: finiteNumber(data.shot.origin?.y),
                z: finiteNumber(data.shot.origin?.z)
              },
              end: {
                x: finiteNumber(data.shot.end?.x),
                y: finiteNumber(data.shot.end?.y),
                z: finiteNumber(data.shot.end?.z)
              },
              yaw: finiteNumber(data.shot.yaw),
              pitch: finiteNumber(data.shot.pitch),
              targetId: String(data.shot.targetId || ''),
              hit: Boolean(data.shot.hit),
              damage: clampNumber(data.shot.damage, 0, 20),
              targetHp: clampNumber(data.shot.targetHp, 0, 100),
              targetShield: clampNumber(data.shot.targetShield, 0, 50),
              targetHull: clampNumber(data.shot.targetHull, 0, 100)
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
    this.onMessage('combat:shot', (client, data) => {
      const shot = data && typeof data.shot === 'object' ? data.shot : null;
      const targetId = String(shot?.targetId || data?.targetId || '');
      if (shot?.hit && targetId) {
        const target = this.state.players.get(targetId);
        if (target) {
          applyCombatDamage(target, shot.damage);
          data = {
            ...data,
            targetId,
            shot: {
              ...shot,
              targetId,
              targetHp: target.hp,
              targetShield: target.shield,
              targetHull: target.hp
            }
          };
        }
      }
      peerRelay('combat:shot', client, data);
    });
  }

  onJoin(client, options) {
    const player = new Player({
      name: cleanName(options.name),
      color: finiteNumber(options.color, colorFromSession(client.sessionId)),
      x: finiteNumber(options.x),
      y: finiteNumber(options.y),
      z: finiteNumber(options.z),
      yaw: finiteNumber(options.yaw),
      pitch: finiteNumber(options.pitch),
      hp: clampNumber(options.hp, 0, 100, 100),
      shield: clampNumber(options.shield, 0, 50, 50),
      warpPhase: 'idle',
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
