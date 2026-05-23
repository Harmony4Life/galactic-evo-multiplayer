import { Client, Room } from '@colyseus/sdk';
import { COLORS, GameState, RemotePlayerState, WarpPayload, WorldEvent } from './simulation';

type PlayerPatch = {
  name?: string;
  color?: number;
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  pitch?: number;
  updatedAt?: number;
};

type RoomStatePatch = {
  roomCode?: string;
  players?: {
    size?: number;
    forEach: (callback: (value: PlayerPatch, key: string) => void) => void;
  };
};

type EventStartMessage = {
  eventId: string;
  eventName: string;
  kind: string;
  originId: string;
  startedAt: number;
};

type PeerMessage = {
  originId: string;
  targetId?: string;
  name: string;
  color: number;
  x?: number;
  y?: number;
  z?: number;
  destination?: WarpPayload;
  sentAt: number;
};

const ROOM_NAME = 'galactic_evo';
const SEND_RATE = 1 / 15;

function urlParams() {
  return new URLSearchParams(window.location.search);
}

function viteEnv() {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
}

function defaultServerUrl() {
  const envUrl = viteEnv().VITE_COLYSEUS_URL;
  if (envUrl) return envUrl;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//localhost:2567`;
}

function cleanRoomCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint8Array(5);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
}

function cleanName(value: string) {
  return value.replace(/[^\w .'-]/g, '').trim().slice(0, 18) || 'Pilot';
}

function colorForSession(sessionId: string) {
  let hash = 2166136261;
  for (let i = 0; i < sessionId.length; i += 1) {
    hash ^= sessionId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const palette = [COLORS.cyan, COLORS.pink, COLORS.gold, COLORS.green, COLORS.purple, COLORS.softWhite];
  return palette[Math.abs(hash) % palette.length];
}

function eventTitle(event: WorldEvent) {
  return event.name === 'My Love For You' ? 'My Love For You' : event.name;
}

export class MultiplayerClient {
  private client: Client | null = null;
  private room: Room<RoomStatePatch> | null = null;
  private sendTimer = 0;
  private root = document.querySelector<HTMLDivElement>('#multiplayerPanel');
  private nameInput = document.querySelector<HTMLInputElement>('#multiplayerName');
  private roomInput = document.querySelector<HTMLInputElement>('#multiplayerRoom');
  private serverInput = document.querySelector<HTMLInputElement>('#multiplayerServer');
  private joinButton = document.querySelector<HTMLButtonElement>('#multiplayerJoin');
  private leaveButton = document.querySelector<HTMLButtonElement>('#multiplayerLeave');
  private copyButton = document.querySelector<HTMLButtonElement>('#multiplayerCopy');
  private squadButton = document.querySelector<HTMLButtonElement>('#multiplayerSquad');
  private status = document.querySelector<HTMLParagraphElement>('#multiplayerStatus');

  constructor(private state: GameState) {
    const params = urlParams();
    const server = params.get('server') || defaultServerUrl();
    const roomCode = cleanRoomCode(params.get('room') || '');
    const name = cleanName(params.get('name') || localStorage.getItem('galactic-evo-name') || 'Pilot');

    if (this.nameInput) this.nameInput.value = name;
    if (this.roomInput) this.roomInput.value = roomCode;
    if (this.serverInput) this.serverInput.value = server;

    this.state.multiplayer.serverUrl = server;
    this.state.multiplayer.roomCode = roomCode;
    this.state.multiplayerHooks.onLocalEventStart = (event) => this.broadcastEventStart(event);
    this.state.multiplayerHooks.onWarpRequest = (pilot) => this.sendWarpRequest(pilot);
    this.state.multiplayerHooks.onAcceptWarpRequest = (targetId) => this.sendWarpAccept(targetId);
    this.state.multiplayerHooks.onSquadInvite = (pilot) => this.sendSquadInvite(pilot);
    this.state.multiplayerHooks.onSquadAccept = (targetId) => this.sendSquadAccept(targetId);
    this.state.multiplayerHooks.onSquadLeave = () => this.sendSquadLeave();
    this.state.multiplayerHooks.onGroupWarpStart = (payload) => this.sendGroupWarp(payload);

    this.joinButton?.addEventListener('click', () => void this.join());
    this.leaveButton?.addEventListener('click', () => void this.leave());
    this.copyButton?.addEventListener('click', () => void this.copyInvite());
    this.squadButton?.addEventListener('click', () => this.state.inviteOrLeaveSquad());
    this.root?.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.root?.addEventListener('click', (event) => event.stopPropagation());

    if (roomCode && params.get('autoJoin') === '1') {
      void this.join();
    }

    this.renderPanel();
  }

  update(dt: number) {
    if (!this.room) return;
    this.sendTimer += dt;
    if (this.sendTimer < SEND_RATE) return;
    this.sendTimer = 0;
    const { position, yaw, pitch } = this.state.player;
    try {
      this.room.send('player:update', {
        name: cleanName(this.nameInput?.value || 'Pilot'),
        color: this.state.player.shipColor,
        x: position.x,
        y: position.y,
        z: position.z,
        yaw,
        pitch
      });
    } catch {
      this.setStatus('Connection hiccup while sending pilot position.', false);
    }
  }

  private async join() {
    if (this.room) return;
    const roomCode = cleanRoomCode(this.roomInput?.value || '') || createRoomCode();
    const name = cleanName(this.nameInput?.value || 'Pilot');
    const serverUrl = (this.serverInput?.value || defaultServerUrl()).trim();
    localStorage.setItem('galactic-evo-name', name);
    if (this.roomInput) this.roomInput.value = roomCode;

    this.state.multiplayer.enabled = true;
    this.state.multiplayer.connecting = true;
    this.state.multiplayer.serverUrl = serverUrl;
    this.state.multiplayer.roomCode = roomCode;
    this.setStatus(`Connecting to room ${roomCode}...`, true);
    this.renderPanel();

    try {
      this.client = new Client(serverUrl);
      const { position, yaw, pitch } = this.state.player;
      this.room = await this.client.joinOrCreate<RoomStatePatch>(ROOM_NAME, {
        roomCode,
        name,
        color: this.state.player.shipColor,
        x: position.x,
        y: position.y,
        z: position.z,
        yaw,
        pitch
      });

      this.state.multiplayer.connected = true;
      this.state.multiplayer.connecting = false;
      this.state.multiplayer.sessionId = this.room.sessionId;
      this.state.multiplayer.roomId = this.room.roomId;
      this.state.multiplayer.message = `Room ${roomCode} connected`;
      this.state.setMessage(`Multiplayer room ${roomCode} connected. Share the invite with your friend.`, 4);

      this.room.onStateChange((roomState) => this.applyRoomState(roomState));
      this.room.onMessage('room:ready', (message: { roomCode?: string; maxClients?: number }) => {
        if (message.roomCode) {
          this.state.multiplayer.roomCode = message.roomCode;
          if (this.roomInput) this.roomInput.value = message.roomCode;
        }
      });
      this.room.onMessage('event:start', (message: EventStartMessage) => this.handleRemoteEvent(message));
      this.room.onMessage('warp:request', (message: PeerMessage) => this.handleWarpRequest(message));
      this.room.onMessage('warp:accept', (message: PeerMessage) => this.handleWarpAccept(message));
      this.room.onMessage('squad:invite', (message: PeerMessage) => this.handleSquadInvite(message));
      this.room.onMessage('squad:accept', (message: PeerMessage) => this.handleSquadAccept(message));
      this.room.onMessage('squad:leave', (message: PeerMessage) => this.handleSquadLeave(message));
      this.room.onMessage('group:warp', (message: PeerMessage) => this.handleGroupWarp(message));
      this.room.onLeave(() => {
        this.room = null;
        this.client = null;
        this.state.remotePlayers.clear();
        this.state.trackedRemotePlayerId = null;
        this.state.squadMemberId = null;
        this.state.incomingWarpRequest = null;
        this.state.pendingSquadInvite = null;
        this.state.multiplayer.connected = false;
        this.state.multiplayer.connecting = false;
        this.state.multiplayer.peerCount = 0;
        this.setStatus('Disconnected from multiplayer.', false);
        this.renderPanel();
      });
      this.room.onError((_code, message) => {
        this.setStatus(`Multiplayer error: ${message}`, false);
      });

      this.applyRoomState(this.room.state);
    } catch (error) {
      this.room = null;
      this.client = null;
      this.state.remotePlayers.clear();
      this.state.multiplayer.connected = false;
      this.state.multiplayer.connecting = false;
      this.setStatus(error instanceof Error ? error.message : 'Could not join multiplayer room.', false);
    } finally {
      this.state.multiplayer.connecting = false;
      this.renderPanel();
    }
  }

  private async leave() {
    if (this.room) {
      const room = this.room;
      this.room = null;
      await room.leave(true);
    }
    this.client = null;
    this.state.remotePlayers.clear();
    this.state.trackedRemotePlayerId = null;
    this.state.squadMemberId = null;
    this.state.incomingWarpRequest = null;
    this.state.pendingSquadInvite = null;
    this.state.multiplayer.connected = false;
    this.state.multiplayer.connecting = false;
    this.state.multiplayer.peerCount = 0;
    this.state.multiplayer.sessionId = '';
    this.state.multiplayer.roomId = '';
    this.setStatus('Solo flight', false);
    this.renderPanel();
  }

  private applyRoomState(roomState: RoomStatePatch) {
    const players = roomState.players;
    if (!players || !this.room) return;
    const seen = new Set<string>();
    players.forEach((player, id) => {
      if (id === this.room?.sessionId) return;
      seen.add(id);
      this.state.remotePlayers.set(id, {
        id,
        name: cleanName(player.name || 'Friend'),
        color: player.color || colorForSession(id),
        position: {
          x: Number(player.x) || 0,
          y: Number(player.y) || 0,
          z: Number(player.z) || 0
        },
        yaw: Number(player.yaw) || 0,
        pitch: Number(player.pitch) || 0,
        updatedAt: Number(player.updatedAt) || Date.now()
      });
      if (!this.state.trackedRemotePlayerId) this.state.trackedRemotePlayerId = id;
    });
    for (const id of this.state.remotePlayers.keys()) {
      if (!seen.has(id)) {
        this.state.remotePlayers.delete(id);
        if (this.state.trackedRemotePlayerId === id) this.state.trackedRemotePlayerId = null;
        if (this.state.squadMemberId === id) this.state.squadMemberId = null;
      }
    }
    this.state.multiplayer.peerCount = players.size ?? seen.size + 1;
    this.renderPanel();
  }

  private broadcastEventStart(event: WorldEvent) {
    if (!this.room || !this.state.multiplayer.connected) return;
    this.room.send('event:start', {
      eventId: event.id,
      eventName: event.name,
      kind: event.kind
    });
  }

  private handleRemoteEvent(message: EventStartMessage) {
    if (!message || message.originId === this.room?.sessionId) return;
    const event = this.state.events.find((item) => item.id === message.eventId || item.name === message.eventName);
    if (!event) return;
    if (event.name === 'My Love For You') event.discovered = true;
    this.state.startEvent(event, { fromNetwork: true });
    this.state.setMessage(`Your friend triggered ${eventTitle(event)}. Synchronizing cinematic.`, 5);
  }

  private localPeerPayload() {
    const { position } = this.state.player;
    return {
      name: cleanName(this.nameInput?.value || 'Pilot'),
      color: this.state.player.shipColor,
      x: position.x,
      y: position.y,
      z: position.z
    };
  }

  private sendWarpRequest(pilot: RemotePlayerState) {
    if (!this.room || !this.state.multiplayer.connected) return;
    this.room.send('warp:request', { targetId: pilot.id, ...this.localPeerPayload() });
  }

  private sendWarpAccept(targetId: string) {
    if (!this.room || !this.state.multiplayer.connected) return;
    this.room.send('warp:accept', { targetId, ...this.localPeerPayload() });
  }

  private sendSquadInvite(pilot: RemotePlayerState) {
    if (!this.room || !this.state.multiplayer.connected) return;
    this.room.send('squad:invite', { targetId: pilot.id, ...this.localPeerPayload() });
  }

  private sendSquadAccept(targetId: string) {
    if (!this.room || !this.state.multiplayer.connected) return;
    this.room.send('squad:accept', { targetId, ...this.localPeerPayload() });
  }

  private sendSquadLeave() {
    if (!this.room || !this.state.multiplayer.connected) return;
    this.room.send('squad:leave', this.localPeerPayload());
  }

  private sendGroupWarp(destination: WarpPayload) {
    if (!this.room || !this.state.multiplayer.connected || !this.state.squadMemberId) return;
    this.room.send('group:warp', { targetId: this.state.squadMemberId, destination, ...this.localPeerPayload() });
  }

  private handleWarpRequest(message: PeerMessage) {
    if (!this.room || message.originId === this.room.sessionId) return;
    this.state.incomingWarpRequest = {
      fromId: message.originId,
      name: cleanName(message.name),
      color: message.color || COLORS.cyan,
      position: {
        x: Number(message.x) || 0,
        y: Number(message.y) || 0,
        z: Number(message.z) || 0
      }
    };
    this.state.setMessage(`${this.state.incomingWarpRequest.name} requests warp to your location. Press R to approve.`, 6);
  }

  private handleWarpAccept(message: PeerMessage) {
    if (!this.room || message.originId === this.room.sessionId) return;
    if (message.targetId && message.targetId !== this.room.sessionId) return;
    this.state.beginWarpToPosition(
      { x: Number(message.x) || 0, y: Number(message.y) || 0, z: Number(message.z) || 0 },
      cleanName(message.name),
      message.color || COLORS.cyan,
      { fromNetwork: true }
    );
  }

  private handleSquadInvite(message: PeerMessage) {
    if (!this.room || message.originId === this.room.sessionId) return;
    this.state.pendingSquadInvite = {
      fromId: message.originId,
      name: cleanName(message.name),
      color: message.color || COLORS.cyan
    };
    this.state.setMessage(`${this.state.pendingSquadInvite.name} invited you to a squad. Press Squad in the 2P panel to accept.`, 6);
    this.renderPanel();
  }

  private handleSquadAccept(message: PeerMessage) {
    if (!this.room || message.originId === this.room.sessionId) return;
    if (message.targetId && message.targetId !== this.room.sessionId) return;
    this.state.squadMemberId = message.originId;
    this.state.pendingSquadInvite = null;
    this.state.setMessage(`Squad link formed with ${cleanName(message.name)}.`, 5);
    this.renderPanel();
  }

  private handleSquadLeave(message: PeerMessage) {
    if (!this.room || message.originId === this.room.sessionId) return;
    if (this.state.squadMemberId === message.originId) {
      this.state.squadMemberId = null;
      this.state.setMessage(`${cleanName(message.name)} left the squad.`, 4);
      this.renderPanel();
    }
  }

  private handleGroupWarp(message: PeerMessage) {
    if (!this.room || message.originId === this.room.sessionId || !message.destination) return;
    if (message.targetId && message.targetId !== this.room.sessionId) return;
    if (this.state.squadMemberId !== message.originId) return;
    this.state.beginWarpToPosition(
      { x: Number(message.destination.x) || 0, y: Number(message.destination.y) || 0, z: Number(message.destination.z) || 0 },
      message.destination.name || 'Squad destination',
      message.destination.color || COLORS.cyan,
      { fromNetwork: true, groupWarp: true, companionId: message.originId, exactEnd: true }
    );
    this.state.setMessage(`${cleanName(message.name)} initiated squad warp.`, 4);
  }

  private async copyInvite() {
    const roomCode = cleanRoomCode(this.roomInput?.value || this.state.multiplayer.roomCode) || createRoomCode();
    const serverUrl = (this.serverInput?.value || this.state.multiplayer.serverUrl || defaultServerUrl()).trim();
    if (this.roomInput) this.roomInput.value = roomCode;
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    url.searchParams.set('autoJoin', '1');
    url.searchParams.set('server', serverUrl);
    url.searchParams.delete('qaCapture');
    try {
      await navigator.clipboard.writeText(url.toString());
      this.setStatus(`Invite copied for room ${roomCode}.`, this.state.multiplayer.connected);
    } catch {
      this.setStatus(url.toString(), this.state.multiplayer.connected);
    }
    this.renderPanel();
  }

  private setStatus(message: string, connected: boolean) {
    this.state.multiplayer.message = message;
    this.state.multiplayer.connected = connected && !!this.room;
    if (this.status) this.status.textContent = message;
  }

  private renderPanel() {
    const connected = this.state.multiplayer.connected;
    const connecting = this.state.multiplayer.connecting;
    const count = this.state.multiplayer.peerCount || (connected ? 1 : 0);
    this.root?.classList.toggle('connected', connected);
    if (this.status) {
      this.status.textContent = connected
        ? `${this.state.multiplayer.message} | ${Math.min(count, 2)}/2 pilots`
        : this.state.multiplayer.message;
    }
    if (this.joinButton) {
      this.joinButton.disabled = connected || connecting;
      this.joinButton.textContent = connecting ? 'Connecting...' : 'Host / Join';
    }
    if (this.leaveButton) this.leaveButton.disabled = !connected;
    if (this.squadButton) {
      this.squadButton.disabled = !connected || this.state.remotePlayers.size === 0;
      this.squadButton.textContent = this.state.squadMemberId ? 'Leave Squad' : this.state.pendingSquadInvite ? 'Accept Squad' : 'Squad';
    }
  }
}
