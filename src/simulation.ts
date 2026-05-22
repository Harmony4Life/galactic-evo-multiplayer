export type Vec3 = { x: number; y: number; z: number };
export type EventPhase = 'dormant' | 'active' | 'aftermath';
export type TrackerMode = 'nearest' | 'systems';

export const WORLD_SIZE = 1800000;
export const RENDER_DISTANCE = 74000;
export const WARP_DURATION = 3.2;
export const WARP_ALIGN_DURATION = 2.15;
export const WARP_CHARGE_DURATION = 3.0;
export const WARP_EXIT_DURATION = 1.15;
export const SPECIAL_PLANET_DURATION = 12;

export const COLORS = {
  black: 0x000000,
  white: 0xf5f5f5,
  softWhite: 0xd2dcf0,
  green: 0x5aff8c,
  blue: 0x4691ff,
  cyan: 0x50ffff,
  purple: 0xaf5fff,
  pink: 0xff5abe,
  red: 0xff4646,
  orange: 0xff9123,
  yellow: 0xffe15a,
  gray: 0x878796,
  gold: 0xffcd5a,
  emerald: 0x46dc8c,
  glass: 0xbeefff
} as const;

export const planetKinds = [
  'Rocky Planet',
  'Gas Giant',
  'Ice World',
  'Ocean World',
  'Desert Planet',
  'Storm Planet',
  'Ringed Giant',
  'Lava World',
  'Emerald World',
  'Frozen Titan',
  'Diamond Rain Planet',
  'Crystal Planet',
  'Iron Storm World',
  'Mega Ringed Giant'
] as const;

export type PlanetKind = (typeof planetKinds)[number];
export type ObjectKind = PlanetKind | 'Star System' | 'Nebula' | 'Star Cluster' | 'Quasar' | 'Galaxy' | 'Galaxy Pair';

export interface SpaceObject {
  type: 'object';
  id: string;
  name: string;
  kind: ObjectKind;
  position: Vec3;
  radius: number;
  color: number;
  description: string;
  discovered: boolean;
  orbitParent?: SpaceObject;
  orbitRadius: number;
  orbitSpeed: number;
  orbitAngle: number;
  orbitTilt: number;
  rings: boolean;
  atmosphere: boolean;
  moons: number;
  seed: number;
  systemName: string;
  heartShape: boolean;
  heartStar: boolean;
}

export interface WorldEvent {
  type: 'event';
  id: string;
  name: string;
  kind: string;
  position: Vec3;
  radius: number;
  color: number;
  description: string;
  aftermath: string;
  lines: string[];
  phase: EventPhase;
  timer: number;
  discovered: boolean;
  systemName: string;
  lingering: number;
  orbitParent?: SpaceObject;
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitAngle?: number;
  orbitTilt?: number;
}

export type Trackable = SpaceObject | WorldEvent;

export function hasPersistentAftermath(kind: string) {
  return kind !== 'Made in Heaven' && kind !== 'Wormhole' && kind !== 'Solar System';
}

export interface PlayerState {
  position: Vec3;
  yaw: number;
  pitch: number;
  baseSpeed: number;
  boostMultiplier: number;
  boostLocked: boolean;
}

export interface RemotePlayerState {
  id: string;
  name: string;
  color: number;
  position: Vec3;
  yaw: number;
  pitch: number;
  updatedAt: number;
}

export interface MultiplayerStatus {
  enabled: boolean;
  connected: boolean;
  connecting: boolean;
  roomCode: string;
  roomId: string;
  sessionId: string;
  peerCount: number;
  serverUrl: string;
  message: string;
}

export type WarpPhase = 'idle' | 'align' | 'charge' | 'jump' | 'exit';

export interface WarpPayload {
  x: number;
  y: number;
  z: number;
  name: string;
  color: number;
}

export interface MultiplayerHooks {
  onLocalEventStart?: (event: WorldEvent) => void;
  onWarpRequest?: (pilot: RemotePlayerState) => void;
  onAcceptWarpRequest?: (targetId: string) => void;
  onSquadInvite?: (pilot: RemotePlayerState) => void;
  onSquadAccept?: (targetId: string) => void;
  onSquadLeave?: () => void;
  onGroupWarpStart?: (payload: WarpPayload) => void;
}

export interface WarpState {
  active: boolean;
  phase: WarpPhase;
  timer: number;
  destination: Trackable | null;
  destinationName: string;
  destinationColor: number;
  start: Vec3;
  end: Vec3;
  alignStartYaw: number;
  alignStartPitch: number;
  alignEndYaw: number;
  alignEndPitch: number;
  groupWarp: boolean;
  companionId: string | null;
}

export interface CutsceneState {
  active: boolean;
  event: WorldEvent | null;
  timer: number;
  duration: number;
  sequence: number;
}

export interface SpecialSceneState {
  active: boolean;
  target: Trackable | null;
  timer: number;
  duration: number;
  sequence: number;
}

class RNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  next() {
    this.seed = (1664525 * this.seed + 1013904223) >>> 0;
    return this.seed / 0xffffffff;
  }

  range(min: number, max: number) {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number) {
    return Math.floor(this.range(min, max + 1));
  }

  choice<T>(items: readonly T[]) {
    return items[Math.floor(this.next() * items.length) % items.length];
  }

  gauss(mean = 0, std = 1) {
    const u = Math.max(1e-9, this.next());
    const v = Math.max(1e-9, this.next());
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v) * std;
  }

  shuffle<T>(items: T[]) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
}

const systemNames = [
  'Solara Prime',
  "Zahra's Crown",
  'Orion Gate',
  'Ashen Veil',
  'Blue Requiem',
  'Eidolon Reach',
  'Saffron Meridian',
  'Vespera Drift',
  'Helix Sanctuary',
  'Nocturne Spire',
  'Aurora Furnace',
  'Celestine Harbor',
  'Obsidian Choir',
  'Crimson Array',
  'Artemis Lantern',
  'Lyra Hollow',
  'Eclipse Orchard',
  'Polaris Wake',
  'Ivory Resonance',
  'Sable Horizon',
  'Golden Wound',
  "Mira's Labyrinth",
  'Asterion Fold',
  'Opal Covenant',
  'Far Meridian',
  'Aurelia Deep',
  'Midnight Reliquary',
  'The Rose Engine',
  'Halo of Nyx',
  'Cobalt Cathedral',
  'Seraphim Crossing',
  'Eventide Crown',
  'Nadir Bloom',
  'Andromeda Gate',
  'Triangulum Ash',
  'Viridian Expanse',
  'Rose Nebular Court',
  'Tenebris Harbor',
  'Starlace Dominion',
  'Hyperion Scar',
  'The Far Choir',
  'Cathedral of Dust',
  'Moonlit Engine',
  "Zahra's Horizon",
  'Nova Reliquary',
  'Diamond Tempest',
  'Titan Ring Monastery',
  'Black Garden',
  'Supervoid Chapel'
];

const planetDescriptions: Record<PlanetKind, string> = {
  'Rocky Planet': 'A terrestrial world with cratered highlands.',
  'Gas Giant': 'A massive gaseous planet with banded storms.',
  'Ice World': 'A frozen planet with reflective plains.',
  'Ocean World': 'A blue planet covered by global seas.',
  'Desert Planet': 'A dry world of dunes and wind-carved stone.',
  'Storm Planet': 'A violent world with electrical storms.',
  'Ringed Giant': 'A giant planet surrounded by a vast ring system.',
  'Lava World': 'A molten planet with glowing fractures.',
  'Emerald World': 'A green world with reflective terrain.',
  'Frozen Titan': 'A large icy body with methane haze.',
  'Diamond Rain Planet': 'A carbon-rich giant where pressure creates diamond rain.',
  'Crystal Planet': 'A reflective planet covered in crystal continents.',
  'Iron Storm World': 'A hostile planet where metallic vapor condenses into iron rain.',
  'Mega Ringed Giant': 'A colossal ringed planet whose halo resembles a miniature disk.'
};

const starColors = [
  COLORS.yellow,
  COLORS.blue,
  COLORS.cyan,
  COLORS.orange,
  COLORS.red,
  COLORS.pink,
  COLORS.white,
  COLORS.gold
];

const romanValues = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function roman(n: number) {
  return romanValues[n - 1] ?? String(n);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function lerpAngle(from: number, to: number, t: number) {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * t;
}

function angleToPoint(from: Vec3, to: Vec3) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return {
    yaw: Math.atan2(dx, dz),
    pitch: clamp(Math.atan2(dy, Math.max(1, Math.hypot(dx, dz))), -1.32, 1.32)
  };
}

export function distance(a: Vec3, b: Vec3) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function copyVec(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function addVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subVec(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scaleVec(v: Vec3, factor: number): Vec3 {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}

export function isEvent(target: Trackable): target is WorldEvent {
  return target.type === 'event';
}

export function targetPosition(target: Trackable): Vec3 {
  return target.position;
}

export function forwardVector(player: PlayerState) {
  const cp = Math.cos(player.pitch);
  return {
    x: Math.sin(player.yaw) * cp,
    y: Math.sin(player.pitch),
    z: Math.cos(player.yaw) * cp
  };
}

export function rightVector(player: PlayerState) {
  return {
    x: Math.cos(player.yaw),
    y: 0,
    z: -Math.sin(player.yaw)
  };
}

function colorForPlanet(kind: PlanetKind, rng: RNG) {
  const table: Record<PlanetKind, readonly number[]> = {
    'Rocky Planet': [COLORS.gray, COLORS.orange, COLORS.red],
    'Gas Giant': [COLORS.orange, COLORS.yellow, COLORS.purple],
    'Ice World': [COLORS.cyan, COLORS.softWhite, COLORS.blue],
    'Ocean World': [COLORS.blue, COLORS.cyan],
    'Desert Planet': [COLORS.orange, COLORS.gold, COLORS.red],
    'Storm Planet': [COLORS.purple, COLORS.blue, COLORS.gray],
    'Ringed Giant': [COLORS.gold, COLORS.orange, COLORS.purple, COLORS.cyan],
    'Lava World': [COLORS.red, COLORS.orange],
    'Emerald World': [COLORS.emerald],
    'Frozen Titan': [0x96d2e6],
    'Diamond Rain Planet': [0x82dcff],
    'Crystal Planet': [0xbeefff],
    'Iron Storm World': [0xb45a46],
    'Mega Ringed Giant': [COLORS.gold, COLORS.cyan, COLORS.purple, COLORS.orange]
  };

  return rng.choice(table[kind]);
}

function eventDuration(kind: string) {
  const frames: Record<string, number> = {
    Wormhole: 1180,
    'Fast Radio Burst': 760,
    'Gravitational Wave': 940,
    'Dark Matter Caustic': 900,
    'Heart Supernova': 2160,
    Pulsar: 920,
    'Planetary Nebula': 980,
    'Tidal Disruption': 1060,
    Kilonova: 1020,
    'Wolf-Rayet Wind': 940,
    'Tidal Lock Eclipse': 760,
    'Atmospheric Escape': 760,
    Cryovolcanism: 760,
    'Made in Heaven': 1500,
    'Galaxy Collision': 1350,
    'Supermassive Black Hole': 1250,
    Quasar: 1250,
    Hypernova: 1320,
    'Neutron Star Merger': 1280,
    Supernova: 1050,
    'Gamma Ray Burst': 900,
    Magnetar: 980,
    'Black Hole Birth': 950,
    'Solar System Birth': 900,
    'Planet Collision': 840,
    'Diamond Rain': 780
  };
  return (frames[kind] ?? 760) / 60;
}

export class GameState {
  objects: SpaceObject[] = [];
  systems: SpaceObject[] = [];
  events: WorldEvent[] = [];
  version = 0;
  resetCount = 0;
  renderDistance = RENDER_DISTANCE;

  player: PlayerState = {
    position: { x: 0, y: 0, z: -900 },
    yaw: 0,
    pitch: 0,
    baseSpeed: 940,
    boostMultiplier: 4.2,
    boostLocked: false
  };

  warp: WarpState = {
    active: false,
    phase: 'idle',
    timer: 0,
    destination: null,
    destinationName: '',
    destinationColor: COLORS.cyan,
    start: { x: 0, y: 0, z: 0 },
    end: { x: 0, y: 0, z: 0 },
    alignStartYaw: 0,
    alignStartPitch: 0,
    alignEndYaw: 0,
    alignEndPitch: 0,
    groupWarp: false,
    companionId: null
  };

  cutscene: CutsceneState = {
    active: false,
    event: null,
    timer: 0,
    duration: 0,
    sequence: 0
  };

  specialScene: SpecialSceneState = {
    active: false,
    target: null,
    timer: 0,
    duration: SPECIAL_PLANET_DURATION,
    sequence: 0
  };

  trackerOpen = false;
  trackerMode: TrackerMode = 'nearest';
  starSystemPage = 0;
  eventMenuOpen = false;
  eventPage = 0;
  specialMenuOpen = false;
  specialPage = 0;
  showMinimap = true;
  fullMapOpen = false;
  mapPan = { x: 0, y: 0 };
  trackedTarget: Trackable | null = null;
  selectedTarget: Trackable | null = null;
  remotePlayers = new Map<string, RemotePlayerState>();
  trackedRemotePlayerId: string | null = null;
  squadMemberId: string | null = null;
  incomingWarpRequest: { fromId: string; name: string; color: number; position: Vec3 } | null = null;
  pendingSquadInvite: { fromId: string; name: string; color: number } | null = null;
  multiplayer: MultiplayerStatus = {
    enabled: false,
    connected: false,
    connecting: false,
    roomCode: '',
    roomId: '',
    sessionId: '',
    peerCount: 0,
    serverUrl: '',
    message: 'Solo flight'
  };
  multiplayerHooks: MultiplayerHooks = {};
  message = 'Welcome, pilot. Explore the open universe and discover its wonders.';
  messageTimer = 7;
  private rng = new RNG(46);

  constructor() {
    this.generateUniverse(false);
  }

  setMessage(text: string, seconds = 4.5) {
    this.message = text;
    this.messageTimer = seconds;
  }

  update(dt: number) {
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    this.updateOrbits(dt);
    this.updateEvents(dt);
    this.updateCutscene(dt);
    this.updateWarp(dt);
    this.updateSpecialScene(dt);
  }

  move(delta: Vec3) {
    if (this.cutscene.active || this.warp.active || this.specialScene.active) return;
    this.player.position.x += delta.x;
    this.player.position.y += delta.y;
    this.player.position.z += delta.z;
  }

  allTrackable() {
    return [...this.objects, ...this.events];
  }

  nearestTargets(limit = 9) {
    return this.allTrackable()
      .slice()
      .sort((a, b) => distance(this.player.position, targetPosition(a)) - distance(this.player.position, targetPosition(b)))
      .slice(0, limit);
  }

  starSystemTargets() {
    const targets = this.objects
      .filter((obj) => ['Star System', 'Galaxy', 'Galaxy Pair'].includes(obj.kind) && obj.name !== "Zahra's Resonance")
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const zr = this.objects.find((obj) => obj.name === "Zahra's Resonance");
    if (zr) {
      targets.splice(Math.min(8 * 9 + 5, targets.length), 0, zr);
    }
    return targets;
  }

  eventTargets() {
    const planetEventKinds = ['Diamond Rain', 'Tidal Lock Eclipse', 'Atmospheric Escape', 'Cryovolcanism'];
    return this.events
      .filter((event) => !planetEventKinds.includes(event.kind) || event.kind === 'Planet Collision')
      .slice()
      .sort((a, b) => `${a.kind}-${a.name}`.localeCompare(`${b.kind}-${b.name}`));
  }

  specialTargets() {
    const planets = this.objects.filter((obj) =>
      ['Mega Ringed Giant', 'Diamond Rain Planet', 'Crystal Planet', 'Iron Storm World', 'Ringed Giant'].includes(obj.kind)
    );
    const planetEvents = this.events.filter((event) =>
      ['Diamond Rain', 'Tidal Lock Eclipse', 'Atmospheric Escape', 'Cryovolcanism'].includes(event.kind)
    );
    return [...planets, ...planetEvents].sort((a, b) => `${a.kind}-${a.name}`.localeCompare(`${b.kind}-${b.name}`));
  }

  paged<T>(items: T[], page: number) {
    const maxPage = Math.max(0, Math.floor((items.length - 1) / 9));
    const safePage = clamp(Math.floor(page), 0, maxPage);
    return {
      items: items.slice(safePage * 9, safePage * 9 + 9),
      maxPage,
      page: safePage
    };
  }

  mapTargets() {
    return [
      ...this.objects.filter((obj) => ['Star System', 'Galaxy', 'Galaxy Pair'].includes(obj.kind)),
      ...this.events
    ];
  }

  universeMapBounds() {
    const targets = this.mapTargets();
    const xs = [...targets.map((target) => target.position.x), this.player.position.x];
    const zs = [...targets.map((target) => target.position.z), this.player.position.z];
    const margin = 72000;
    return {
      minX: Math.min(...xs) - margin,
      maxX: Math.max(...xs) + margin,
      minZ: Math.min(...zs) - margin,
      maxZ: Math.max(...zs) + margin
    };
  }

  universeToMap(pos: Vec3, width: number, height: number, includePan = true) {
    const bounds = this.universeMapBounds();
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;
    const halfX = Math.max(1, (bounds.maxX - bounds.minX) / 2);
    const halfZ = Math.max(1, (bounds.maxZ - bounds.minZ) / 2);
    const nx = (pos.x - centerX) / halfX;
    const nz = (pos.z - centerZ) / halfZ;
    const r = Math.hypot(nx, nz);
    const visualR = r > 0 ? Math.pow(Math.min(1.24, r), 0.54) : 0;
    const stretch = r > 0 ? visualR / r : 1;
    const scale = Math.min(width, height) * 0.52;
    return {
      x: width / 2 + nx * stretch * scale + (includePan ? this.mapPan.x : 0),
      y: height / 2 + nz * stretch * scale + (includePan ? this.mapPan.y : 0)
    };
  }

  targetFromMap(x: number, y: number, width: number, height: number) {
    let best: Trackable | null = null;
    let bestDistance = Infinity;
    for (const target of this.mapTargets()) {
      const p = this.universeToMap(target.position, width, height);
      const screenDistance = Math.hypot(x - p.x, y - p.y);
      const threshold = isEvent(target) ? 14 : target.kind === 'Star System' ? 12 : 22;
      if (screenDistance < threshold && screenDistance < bestDistance) {
        best = target;
        bestDistance = screenDistance;
      }
    }
    return best;
  }

  scanNearby() {
    const [target] = this.nearestTargets(1);
    if (!target) {
      this.selectedTarget = null;
      return;
    }
    const d = distance(this.player.position, target.position);
    if (d < 3000) {
      target.discovered = true;
      this.selectedTarget = target;
      this.trackedTarget = target;
      this.setMessage(`Scanned ${target.name}.`, 3);
    } else {
      this.selectedTarget = null;
      this.setMessage('No scannable object close enough. Scanner cleared.', 3);
    }
  }

  triggerNearestEvent() {
    const [event] = this.events
      .slice()
      .filter((item) => item.phase !== 'aftermath' && item.kind !== 'Solar System')
      .sort((a, b) => distance(this.player.position, a.position) - distance(this.player.position, b.position));
    if (!event) return;
    const d = distance(this.player.position, event.position);
    if (d < 4800) {
      if (event.name === 'My Love For You') {
        event.discovered = true;
      }
      this.startEvent(event);
    } else {
      this.setMessage('No world event close enough. Track or warp to one first.', 3);
    }
  }

  triggerAction() {
    const tracked = this.trackedTarget;
    if (
      tracked &&
      !isEvent(tracked) &&
      ['Mega Ringed Giant', 'Diamond Rain Planet', 'Crystal Planet', 'Iron Storm World', 'Ringed Giant'].includes(tracked.kind)
    ) {
      const d = distance(this.player.position, tracked.position);
      if (d < 3600) {
        this.beginSpecialPlanetScene(tracked);
      } else {
        this.setMessage('Special planet is too far. Warp closer, then press F.', 3);
      }
      return;
    }
    this.triggerNearestEvent();
  }

  beginWarp(destination: Trackable, options: { fromNetwork?: boolean; groupWarp?: boolean; companionId?: string | null } = {}) {
    const f = forwardVector(this.player);
    const isSpecialPlanet =
      !isEvent(destination) &&
      ['Mega Ringed Giant', 'Diamond Rain Planet', 'Crystal Planet', 'Iron Storm World', 'Ringed Giant'].includes(destination.kind);
    const standoff = isEvent(destination) || isSpecialPlanet ? 3200 : 6200;
    const end = {
      x: destination.position.x - f.x * standoff,
      y: destination.position.y + (isSpecialPlanet ? 260 : 460),
      z: destination.position.z - f.z * standoff
    };
    const squadPilot = this.squadMemberId ? this.remotePlayers.get(this.squadMemberId) : null;
    const shouldGroupWarp =
      !options.fromNetwork &&
      !!squadPilot &&
      distance(this.player.position, squadPilot.position) <= 2000;
    this.configureWarp({
      destination,
      focus: destination.position,
      end,
      name: destination.name,
      color: destination.color,
      groupWarp: options.groupWarp ?? shouldGroupWarp,
      companionId: options.companionId ?? (shouldGroupWarp ? squadPilot?.id ?? null : null)
    });
    this.trackedTarget = destination;
    this.selectedTarget = destination;
    destination.discovered = true;
    this.closeMenus();
    this.setMessage(`Alignment lock: rotating ship toward ${destination.name}.`, 2.8);
    if (shouldGroupWarp) {
      this.multiplayerHooks.onGroupWarpStart?.({
        x: end.x,
        y: end.y,
        z: end.z,
        name: destination.name,
        color: destination.color
      });
    }
  }

  beginWarpToPosition(position: Vec3, name: string, color: number = COLORS.cyan, options: { fromNetwork?: boolean; groupWarp?: boolean; companionId?: string | null; exactEnd?: boolean } = {}) {
    const f = forwardVector(this.player);
    const end = options.exactEnd
      ? copyVec(position)
      : {
          x: position.x - f.x * 1700,
          y: position.y + 180,
          z: position.z - f.z * 1700
        };
    this.configureWarp({
      destination: null,
      focus: position,
      end,
      name,
      color,
      groupWarp: options.groupWarp ?? false,
      companionId: options.companionId ?? null
    });
    this.trackedTarget = null;
    this.selectedTarget = null;
    this.closeMenus();
    this.setMessage(`Alignment lock: rotating ship toward ${name}.`, 2.8);
  }

  requestWarpToRemote(pilot: RemotePlayerState) {
    this.trackedRemotePlayerId = pilot.id;
    if (this.squadMemberId === pilot.id) {
      this.beginWarpToPosition(pilot.position, pilot.name, pilot.color);
      return;
    }
    this.multiplayerHooks.onWarpRequest?.(pilot);
    this.setMessage(`Request to warp sent to ${pilot.name}.`, 4);
  }

  acceptIncomingWarpRequest() {
    if (!this.incomingWarpRequest) return false;
    this.multiplayerHooks.onAcceptWarpRequest?.(this.incomingWarpRequest.fromId);
    this.setMessage(`Warp request accepted for ${this.incomingWarpRequest.name}.`, 3);
    this.incomingWarpRequest = null;
    return true;
  }

  inviteOrLeaveSquad() {
    if (this.squadMemberId) {
      this.multiplayerHooks.onSquadLeave?.();
      this.setMessage('Squad link dissolved.', 3);
      this.squadMemberId = null;
      return;
    }
    if (this.pendingSquadInvite) {
      this.squadMemberId = this.pendingSquadInvite.fromId;
      this.multiplayerHooks.onSquadAccept?.(this.pendingSquadInvite.fromId);
      this.setMessage(`Squad link formed with ${this.pendingSquadInvite.name}.`, 4);
      this.pendingSquadInvite = null;
      return;
    }
    const [pilot] = [...this.remotePlayers.values()];
    if (!pilot) {
      this.setMessage('No friend pilot connected for squad invite.', 3);
      return;
    }
    this.multiplayerHooks.onSquadInvite?.(pilot);
    this.setMessage(`Squad invite sent to ${pilot.name}.`, 4);
  }

  private configureWarp(input: {
    destination: Trackable | null;
    focus: Vec3;
    end: Vec3;
    name: string;
    color: number;
    groupWarp: boolean;
    companionId: string | null;
  }) {
    const aim = angleToPoint(this.player.position, input.focus);
    this.warp.active = true;
    this.warp.phase = 'align';
    this.warp.timer = 0;
    this.warp.destination = input.destination;
    this.warp.destinationName = input.name;
    this.warp.destinationColor = input.color;
    this.warp.start = copyVec(this.player.position);
    this.warp.end = copyVec(input.end);
    this.warp.alignStartYaw = this.player.yaw;
    this.warp.alignStartPitch = this.player.pitch;
    this.warp.alignEndYaw = aim.yaw;
    this.warp.alignEndPitch = aim.pitch;
    this.warp.groupWarp = input.groupWarp;
    this.warp.companionId = input.companionId;
  }

  hyperspaceJump() {
    if (this.trackedTarget) {
      this.beginWarp(this.trackedTarget);
      return;
    }
    const stars = this.objects
      .filter((obj) => obj.kind === 'Star System')
      .sort((a, b) => distance(this.player.position, a.position) - distance(this.player.position, b.position));
    if (stars.length > 1) {
      this.beginWarp(stars[1]);
    }
  }

  startEvent(event: WorldEvent, options: { fromNetwork?: boolean; timer?: number } = {}) {
    if (event.kind === 'Solar System') {
      this.trackedTarget = event;
      this.selectedTarget = event;
      event.discovered = true;
      this.setMessage('Solar System is a destination entry for now. Its dedicated world event is coming soon.', 4);
      return;
    }
    this.specialScene.active = false;
    this.specialScene.target = null;
    if (event.phase === 'dormant') {
      event.phase = 'active';
      event.timer = 0;
      event.discovered = true;
      this.version += 1;
    }
    this.cutscene.active = true;
    this.cutscene.event = event;
    this.cutscene.timer = options.timer ?? 0;
    this.cutscene.duration = eventDuration(event.kind);
    this.cutscene.sequence += 1;
    this.closeMenus();
    this.setMessage(`CINEMATIC EVENT: ${event.name}`, 3);
    if (!options.fromNetwork) {
      this.multiplayerHooks.onLocalEventStart?.(event);
    }
  }

  beginSpecialPlanetScene(target: Trackable) {
    target.discovered = true;
    this.cutscene.active = false;
    this.cutscene.event = null;
    this.specialScene.active = true;
    this.specialScene.target = target;
    this.specialScene.timer = 0;
    this.specialScene.duration = SPECIAL_PLANET_DURATION;
    this.specialScene.sequence += 1;
    this.closeMenus();
  }

  closeMenus() {
    this.trackerOpen = false;
    this.eventMenuOpen = false;
    this.specialMenuOpen = false;
    this.fullMapOpen = false;
  }

  handleKey(code: string) {
    if (code === 'Escape') {
      if (this.trackerOpen || this.eventMenuOpen || this.specialMenuOpen || this.fullMapOpen) {
        this.closeMenus();
        return true;
      }
      return false;
    }

    if (this.cutscene.active || this.warp.active || this.specialScene.active) {
      return false;
    }

    const pageBack = ['BracketLeft', 'Comma', 'PageUp'];
    const pageForward = ['BracketRight', 'Period', 'Slash', 'PageDown'];
    const digit = code.startsWith('Digit') ? Number(code.replace('Digit', '')) : 0;

    if (code === 'KeyT') {
      this.trackerOpen = !this.trackerOpen;
      if (this.trackerOpen) {
        this.eventMenuOpen = false;
        this.specialMenuOpen = false;
        this.fullMapOpen = false;
      }
      return true;
    }
    if (code === 'Tab' && this.trackerOpen) {
      this.trackerMode = this.trackerMode === 'nearest' ? 'systems' : 'nearest';
      return true;
    }
    if (code === 'KeyY') {
      this.eventMenuOpen = !this.eventMenuOpen;
      if (this.eventMenuOpen) {
        this.trackerOpen = false;
        this.specialMenuOpen = false;
        this.fullMapOpen = false;
      }
      return true;
    }
    if (code === 'KeyU') {
      this.specialMenuOpen = !this.specialMenuOpen;
      if (this.specialMenuOpen) {
        this.trackerOpen = false;
        this.eventMenuOpen = false;
        this.fullMapOpen = false;
      }
      return true;
    }
    if (code === 'KeyM') {
      if (this.fullMapOpen) {
        this.fullMapOpen = false;
        this.showMinimap = true;
        this.setMessage('Universe map closed. Minimap restored.', 2.4);
      } else if (this.showMinimap) {
        this.fullMapOpen = true;
        this.trackerOpen = false;
        this.eventMenuOpen = false;
        this.specialMenuOpen = false;
        this.setMessage('Universe map opened. Click a system, galaxy, or event to warp.', 3);
      } else {
        this.showMinimap = true;
        this.setMessage('Minimap reopened.', 2.4);
      }
      return true;
    }
    if (code === 'KeyX') {
      this.trackedTarget = null;
      this.setMessage('Tracker cleared.', 2);
      return true;
    }
    if (code === 'Space') {
      this.scanNearby();
      return true;
    }
    if (code === 'KeyH') {
      this.hyperspaceJump();
      return true;
    }
    if (code === 'KeyR' && this.incomingWarpRequest) {
      return this.acceptIncomingWarpRequest();
    }
    if (code === 'KeyF') {
      this.triggerAction();
      return true;
    }

    if (this.trackerOpen && this.trackerMode === 'systems') {
      if (pageBack.includes(code)) {
        this.starSystemPage = Math.max(0, this.starSystemPage - 1);
        return true;
      }
      if (pageForward.includes(code)) {
        const { maxPage } = this.paged(this.starSystemTargets(), this.starSystemPage);
        this.starSystemPage = Math.min(maxPage, this.starSystemPage + 1);
        return true;
      }
    }
    if (this.eventMenuOpen) {
      if (pageBack.includes(code)) {
        this.eventPage = Math.max(0, this.eventPage - 1);
        return true;
      }
      if (pageForward.includes(code)) {
        const { maxPage } = this.paged(this.eventTargets(), this.eventPage);
        this.eventPage = Math.min(maxPage, this.eventPage + 1);
        return true;
      }
    }
    if (this.specialMenuOpen) {
      if (pageBack.includes(code)) {
        this.specialPage = Math.max(0, this.specialPage - 1);
        return true;
      }
      if (pageForward.includes(code)) {
        const { maxPage } = this.paged(this.specialTargets(), this.specialPage);
        this.specialPage = Math.min(maxPage, this.specialPage + 1);
        return true;
      }
    }

    if (digit >= 1 && digit <= 9) {
      if (this.eventMenuOpen) {
        const { items } = this.paged(this.eventTargets(), this.eventPage);
        const chosen = items[digit - 1];
        if (chosen) {
          if (chosen.name === 'My Love For You' && !chosen.discovered) {
            this.setMessage('You must first search your feelings for the Zephyr.', 4);
          } else {
            this.beginWarp(chosen);
          }
        }
        return true;
      }
      if (this.specialMenuOpen) {
        const { items } = this.paged(this.specialTargets(), this.specialPage);
        const chosen = items[digit - 1];
        if (chosen) {
          this.beginWarp(chosen);
        }
        return true;
      }
      if (this.trackerOpen) {
        const pageItems =
          this.trackerMode === 'nearest'
            ? this.nearestTargets(9)
            : this.paged(this.starSystemTargets(), this.starSystemPage).items;
        const chosen = pageItems[digit - 1];
        if (chosen) {
          this.trackedTarget = chosen;
          this.selectedTarget = chosen;
          this.setMessage(`Tracking ${chosen.name}.`, 2.4);
        }
        return true;
      }
    }

    return false;
  }

  private updateOrbits(dt: number) {
    for (const obj of this.objects) {
      if (!obj.orbitParent) continue;
      obj.orbitAngle += obj.orbitSpeed * dt * 60;
      const parent = obj.orbitParent;
      obj.position.x = parent.position.x + Math.cos(obj.orbitAngle) * obj.orbitRadius;
      obj.position.z = parent.position.z + Math.sin(obj.orbitAngle) * obj.orbitRadius;
      obj.position.y =
        parent.position.y + Math.sin(obj.orbitAngle * 0.9) * obj.orbitRadius * obj.orbitTilt;
    }
    for (const event of this.events) {
      if (!event.orbitParent || !event.orbitRadius || !event.orbitSpeed) continue;
      event.orbitAngle = (event.orbitAngle ?? 0) + event.orbitSpeed * dt * 60;
      const parent = event.orbitParent;
      const tilt = event.orbitTilt ?? 0;
      event.position.x = parent.position.x + Math.cos(event.orbitAngle) * event.orbitRadius;
      event.position.z = parent.position.z + Math.sin(event.orbitAngle) * event.orbitRadius;
      event.position.y =
        parent.position.y + Math.sin(event.orbitAngle * 0.9) * event.orbitRadius * tilt;
    }
  }

  private updateEvents(dt: number) {
    for (const event of this.events) {
      if (event.phase !== 'active') continue;
      event.timer += dt;
      const limit = ['Galaxy Collision', 'Supermassive Black Hole', 'Hypernova', 'Neutron Star Merger'].includes(event.kind)
        ? 25
        : 15;
      if (event.timer > limit && !this.cutscene.active) {
        event.phase = hasPersistentAftermath(event.kind) ? 'aftermath' : 'dormant';
        event.timer = 0;
        event.lingering = hasPersistentAftermath(event.kind) ? 1 : 0;
        this.version += 1;
        if (hasPersistentAftermath(event.kind)) this.setMessage(event.aftermath, 8);
      }
    }
  }

  private updateCutscene(dt: number) {
    if (!this.cutscene.active) return;
    this.cutscene.timer += dt;
    if (this.cutscene.timer < this.cutscene.duration) return;

    const event = this.cutscene.event;
    this.cutscene.active = false;
    this.cutscene.event = null;
    if (!event) return;

    if (event.kind === 'Made in Heaven') {
      this.resetUniverseAfterMadeInHeaven();
      return;
    }

    if (event.kind === 'Wormhole') {
      const destination = this.rng.choice(this.objects.filter((obj) => ['Star System', 'Galaxy', 'Galaxy Pair'].includes(obj.kind)));
      this.player.position = {
        x: destination.position.x - 4200,
        y: destination.position.y + 650,
        z: destination.position.z - 4200
      };
      this.player.yaw = Math.atan2(destination.position.x - this.player.position.x, destination.position.z - this.player.position.z);
      this.player.pitch = 0;
      this.setMessage(`The wormhole ejects you near ${destination.name}.`, 7);
      event.phase = 'dormant';
      event.timer = 0;
      event.lingering = 0;
      this.version += 1;
      return;
    }

    if (hasPersistentAftermath(event.kind)) {
      event.phase = 'aftermath';
      event.timer = 0;
      event.lingering = 1;
      this.version += 1;
      this.setMessage(event.aftermath, 8);
    } else {
      event.phase = 'dormant';
      event.timer = 0;
      event.lingering = 0;
      this.version += 1;
    }
  }

  private updateWarp(dt: number) {
    if (!this.warp.active) return;
    this.warp.timer += dt;
    if (this.warp.phase === 'align') {
      const t = smoothstep(this.warp.timer / WARP_ALIGN_DURATION);
      this.player.yaw = lerpAngle(this.warp.alignStartYaw, this.warp.alignEndYaw, t);
      this.player.pitch = lerpAngle(this.warp.alignStartPitch, this.warp.alignEndPitch, t);
      if (this.warp.timer >= WARP_ALIGN_DURATION) {
        this.warp.phase = 'charge';
        this.warp.timer = 0;
        this.player.yaw = this.warp.alignEndYaw;
        this.player.pitch = this.warp.alignEndPitch;
        this.setMessage(`Aligned. Ignition charging for ${this.warp.destinationName}.`, 3);
      }
      return;
    }

    if (this.warp.phase === 'charge') {
      this.player.yaw = this.warp.alignEndYaw;
      this.player.pitch = this.warp.alignEndPitch;
      if (this.warp.timer >= WARP_CHARGE_DURATION) {
        this.warp.phase = 'jump';
        this.warp.timer = 0;
        this.warp.start = copyVec(this.player.position);
        this.setMessage(`Warp ignition: launching to ${this.warp.destinationName}.`, 2.6);
      }
      return;
    }

    if (this.warp.phase === 'exit') {
      if (this.warp.timer < WARP_EXIT_DURATION) return;
      this.warp.active = false;
      this.warp.phase = 'idle';
      this.warp.groupWarp = false;
      this.warp.companionId = null;
      this.setMessage(`Warp complete. Arrived near ${this.warp.destinationName}.`, 4.5);
      return;
    }

    const t = smoothstep(this.warp.timer / WARP_DURATION);
    this.player.position = lerpVec(this.warp.start, this.warp.end, t);
    if (this.warp.timer >= WARP_DURATION) {
      this.player.position = copyVec(this.warp.end);
      this.warp.phase = 'exit';
      this.warp.timer = 0;
    }
  }

  private updateSpecialScene(dt: number) {
    if (!this.specialScene.active) return;
    this.specialScene.timer += dt;
    if (this.specialScene.timer >= this.specialScene.duration) {
      this.specialScene.active = false;
      this.specialScene.target = null;
    }
  }

  private createObject(input: Omit<SpaceObject, 'type' | 'id' | 'discovered'> & { discovered?: boolean }) {
    const obj: SpaceObject = {
      type: 'object',
      id: `obj-${this.objects.length}-${input.name.replace(/\W+/g, '-').toLowerCase()}`,
      discovered: input.discovered ?? false,
      ...input
    };
    this.objects.push(obj);
    return obj;
  }

  private createEvent(input: Omit<WorldEvent, 'type' | 'id' | 'phase' | 'timer' | 'discovered' | 'systemName' | 'lingering'> & Partial<Pick<WorldEvent, 'phase' | 'timer' | 'discovered' | 'systemName' | 'lingering'>>) {
    const event: WorldEvent = {
      type: 'event',
      id: `event-${this.events.length}-${input.name.replace(/\W+/g, '-').toLowerCase()}`,
      phase: input.phase ?? 'dormant',
      timer: input.timer ?? 0,
      discovered: input.discovered ?? false,
      systemName: input.systemName ?? '',
      lingering: input.lingering ?? 0,
      ...input
    };
    this.events.push(event);
    return event;
  }

  private createStarSystem(name: string, x: number, y: number, z: number, starColor: number, planetCount: number) {
    const star = this.createObject({
      name,
      kind: 'Star System',
      position: { x, y, z },
      radius: this.rng.int(140, 245),
      color: starColor,
      description: `${name} is a distant star system with orbiting worlds.`,
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitAngle: 0,
      orbitTilt: 0,
      rings: false,
      atmosphere: false,
      moons: 0,
      seed: this.rng.int(1, 999999),
      systemName: name,
      heartShape: false,
      heartStar: false
    });

    this.systems.push(star);

    let orbitRadius = 1420 + this.rng.int(-120, 180);
    for (let i = 0; i < planetCount; i += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const kind = this.rng.choice(planetKinds);
      const radius = kind === 'Gas Giant' || kind === 'Mega Ringed Giant' ? this.rng.int(130, 215) : this.rng.int(60, 135);
      const orbitTilt = this.rng.range(-0.13, 0.13);
      this.createObject({
        name: `${name} ${roman(i + 1)}`,
        kind,
        position: {
          x: x + Math.cos(angle) * orbitRadius,
          y: y + Math.sin(angle * 0.9) * orbitRadius * orbitTilt,
          z: z + Math.sin(angle) * orbitRadius
        },
        radius,
        color: colorForPlanet(kind, this.rng),
        description: planetDescriptions[kind],
        orbitParent: star,
        orbitRadius,
        orbitSpeed: this.rng.range(0.00022, 0.00135),
        orbitAngle: angle,
        orbitTilt,
        rings: ['Ringed Giant', 'Gas Giant', 'Mega Ringed Giant'].includes(kind) && this.rng.next() < 0.96,
        atmosphere: this.rng.next() < 0.84,
        moons: ['Gas Giant', 'Ringed Giant', 'Frozen Titan', 'Mega Ringed Giant'].includes(kind) ? this.rng.int(2, 10) : this.rng.int(0, 2),
        seed: this.rng.int(1, 999999),
        systemName: name,
        heartShape: false,
        heartStar: false
      });
      orbitRadius += this.rng.int(1350, 2300) + Math.max(0, radius - 95) * 4.8;
    }

    return star;
  }

  private moveSystem(system: SpaceObject, dx: number, dz: number) {
    system.position.x += dx;
    system.position.z += dz;
    for (const obj of this.objects) {
      if (obj !== system && obj.systemName === system.name) {
        obj.position.x += dx;
        obj.position.z += dz;
      }
    }
    for (const event of this.events) {
      if (event.systemName === system.name) {
        event.position.x += dx;
        event.position.z += dz;
      }
    }
  }

  private separateStarSystems() {
    for (let iteration = 0; iteration < 9; iteration += 1) {
      for (let i = 0; i < this.systems.length; i += 1) {
        for (let j = i + 1; j < this.systems.length; j += 1) {
          const a = this.systems[i];
          const b = this.systems[j];
          let dx = b.position.x - a.position.x;
          let dz = b.position.z - a.position.z;
          let d = Math.hypot(dx, dz);
          const desired = 78000;
          if (d >= desired) continue;
          if (d < 0.001) {
            const angle = ((i * 37 + j * 53) % 360) * (Math.PI / 180);
            dx = Math.cos(angle);
            dz = Math.sin(angle);
            d = 1;
          }
          const push = (desired - d) * 0.5 + 120;
          const ux = dx / d;
          const uz = dz / d;
          this.moveSystem(a, -ux * push, -uz * push);
          this.moveSystem(b, ux * push, uz * push);
        }
      }
    }
  }

  private pushEventAway(event: WorldEvent, x: number, z: number, desired: number, seedSalt: number, strength = 1) {
    let dx = event.position.x - x;
    let dz = event.position.z - z;
    let d = Math.hypot(dx, dz);
    if (d >= desired) return;
    if (d < 0.001) {
      const seed = this.eventHash(event, seedSalt);
      const angle = ((seed % 3600) / 3600) * Math.PI * 2;
      dx = Math.cos(angle);
      dz = Math.sin(angle);
      d = 1;
    }
    const push = (desired - d + 850) * strength;
    event.position.x += (dx / d) * push;
    event.position.z += (dz / d) * push;
  }

  private eventHash(event: WorldEvent, salt = 0) {
    let hash = 2166136261 + salt;
    for (let i = 0; i < event.id.length; i += 1) {
      hash ^= event.id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private eventMapSpacing(event: WorldEvent) {
    if (event.kind === 'Made in Heaven') return 185000;
    if (event.kind === 'Wormhole' || event.kind === 'Quasar') return 165000;
    if (['Galaxy Collision', 'Supermassive Black Hole', 'Hypernova', 'Neutron Star Merger'].includes(event.kind)) return 140000;
    if (event.kind === 'Heart Supernova') return 98000;
    return 82000;
  }

  private distributeWorldEvents() {
    const showcaseKinds: ObjectKind[] = ['Star System', 'Galaxy', 'Galaxy Pair', 'Quasar', 'Nebula', 'Star Cluster'];
    const anchors = this.objects.filter((obj) => showcaseKinds.includes(obj.kind));

    const made = this.events.find((event) => event.kind === 'Made in Heaven');
    if (made) {
      made.position.x = 146000;
      made.position.y = 98000;
      made.position.z = -138000;
    }

    for (let iteration = 0; iteration < 14; iteration += 1) {
      for (let i = 0; i < this.events.length; i += 1) {
        const event = this.events[i];
        if (event.orbitParent || event.kind === 'Solar System') continue;
        const ownSpacing = this.eventMapSpacing(event);

        for (let j = i + 1; j < this.events.length; j += 1) {
          const other = this.events[j];
          if (other.orbitParent || other.kind === 'Solar System') continue;
          const desired = Math.max(ownSpacing, this.eventMapSpacing(other));
          let dx = other.position.x - event.position.x;
          let dz = other.position.z - event.position.z;
          let d = Math.hypot(dx, dz);
          if (d >= desired) continue;
          if (d < 0.001) {
            const angle = ((this.eventHash(event, j) % 3600) / 3600) * Math.PI * 2;
            dx = Math.cos(angle);
            dz = Math.sin(angle);
            d = 1;
          }
          const push = (desired - d) * 0.5 + 350;
          const ux = dx / d;
          const uz = dz / d;
          event.position.x -= ux * push;
          event.position.z -= uz * push;
          other.position.x += ux * push;
          other.position.z += uz * push;
        }

        for (const anchor of anchors) {
          if (event.kind === 'Heart Supernova' && (anchor.name === "Zahra's Resonance" || anchor.systemName === "Zahra's Resonance")) continue;
          const desired =
            anchor.kind === 'Star System'
              ? Math.max(62000, ownSpacing * 0.78)
              : anchor.kind === 'Quasar' || anchor.kind === 'Galaxy' || anchor.kind === 'Galaxy Pair'
                ? Math.max(92000, ownSpacing * 0.92)
                : 68000;
          this.pushEventAway(event, anchor.position.x, anchor.position.z, desired, anchor.seed + iteration, 1.0);
        }
      }
    }
  }

  private createOurSolarSystem() {
    const x = -118000;
    const y = 2200;
    const z = 126000;
    const sun = this.createObject({
      name: 'Solar System',
      kind: 'Star System',
      position: { x, y, z },
      radius: 310,
      color: COLORS.yellow,
      description: 'Our home solar system: the Sun, rocky inner worlds, gas giants, ice giants, and the small blue planet where this whole story begins.',
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitAngle: 0,
      orbitTilt: 0,
      rings: false,
      atmosphere: false,
      moons: 0,
      seed: 700001,
      systemName: 'Solar System',
      heartShape: false,
      heartStar: false,
      discovered: true
    });
    this.systems.push(sun);

    const planets: Array<{
      name: string;
      kind: PlanetKind;
      radius: number;
      orbit: number;
      speed: number;
      color: number;
      rings?: boolean;
      moons?: number;
      description: string;
    }> = [
      { name: 'Mercury', kind: 'Rocky Planet', radius: 38, orbit: 1700, speed: 0.0018, color: 0xa89c91, description: 'A cratered iron-rich world close to the Sun.' },
      { name: 'Venus', kind: 'Storm Planet', radius: 70, orbit: 2950, speed: 0.00132, color: 0xd9a260, description: 'A bright cloud-wrapped furnace with crushing atmosphere.' },
      { name: 'Earth', kind: 'Ocean World', radius: 74, orbit: 4450, speed: 0.00108, color: 0x2f82ff, moons: 1, description: 'A living blue-green world with oceans, clouds, continents, polar ice, and one pale Moon.' },
      { name: 'Mars', kind: 'Desert Planet', radius: 55, orbit: 6350, speed: 0.00086, color: 0xc9633d, moons: 2, description: 'A cold rust-red desert world with ancient valleys and polar ice.' },
      { name: 'Jupiter', kind: 'Gas Giant', radius: 154, orbit: 9300, speed: 0.00048, color: 0xd48a4d, moons: 5, description: 'The largest planet, banded with storms and crowned by a great red vortex.' },
      { name: 'Saturn', kind: 'Mega Ringed Giant', radius: 136, orbit: 13200, speed: 0.00038, color: 0xd8bd72, rings: true, moons: 6, description: 'A golden giant encircled by a spectacular system of rings.' },
      { name: 'Uranus', kind: 'Ice World', radius: 112, orbit: 17300, speed: 0.00029, color: 0x78d8dd, rings: true, moons: 4, description: 'A pale tilted ice giant moving with quiet blue-green light.' },
      { name: 'Neptune', kind: 'Storm Planet', radius: 108, orbit: 21800, speed: 0.00024, color: 0x355dff, moons: 4, description: 'A deep blue ice giant with supersonic winds and distant storms.' }
    ];

    for (let i = 0; i < planets.length; i += 1) {
      const planet = planets[i];
      const angle = i * 0.72 + 0.35;
      const tilt = i === 6 ? 0.035 : 0.018 + (i % 3) * 0.008;
      this.createObject({
        name: planet.name,
        kind: planet.kind,
        position: {
          x: x + Math.cos(angle) * planet.orbit,
          y: y + Math.sin(angle * 0.9) * planet.orbit * tilt,
          z: z + Math.sin(angle) * planet.orbit
        },
        radius: planet.radius,
        color: planet.color,
        description: planet.description,
        orbitParent: sun,
        orbitRadius: planet.orbit,
        orbitSpeed: planet.speed,
        orbitAngle: angle,
        orbitTilt: tilt,
        rings: planet.rings ?? false,
        atmosphere: true,
        moons: planet.moons ?? 0,
        seed: 700100 + i,
        systemName: 'Solar System',
        heartShape: false,
        heartStar: false,
        discovered: true
      });
    }

    this.createEvent({
      name: 'Solar System',
      kind: 'Solar System',
      position: { x, y, z },
      radius: 2300,
      color: COLORS.yellow,
      description: 'A navigation entry for our solar system. A dedicated world event will be added here soon.',
      aftermath: 'The solar system remains steady, waiting for its future event.',
      lines: ['The Sun holds eight planets in order.', 'Earth glows blue among them.', 'A future event waits here.'],
      systemName: 'Solar System',
      discovered: true
    });
  }

  private generateUniverse(reborn: boolean) {
    this.rng = new RNG(46 + this.resetCount * 777);
    this.objects = [];
    this.systems = [];
    this.events = [];

    const names = reborn ? this.rng.shuffle(systemNames.map((name) => `${name} Reborn`)) : systemNames.slice();

    for (let i = 0; i < names.length; i += 1) {
      const arm = i % (reborn ? 6 : 5);
      const radius = (reborn ? 52000 : 48000) + i * (reborn ? 36500 : 34000) + this.rng.int(-9600, 9600);
      const theta =
        arm * ((Math.PI * 2) / (reborn ? 6 : 5)) + radius / (reborn ? 39000 : 41000) + this.rng.range(-0.36, 0.36);
      this.createStarSystem(
        names[i],
        Math.cos(theta) * radius,
        this.rng.gauss(0, reborn ? 5000 : 4200),
        Math.sin(theta) * radius,
        this.rng.choice(starColors),
        this.rng.int(4, reborn ? 11 : 10)
      );
    }

    this.createObject({
      name: 'Silent Nebula',
      kind: 'Nebula',
      position: { x: -19000, y: 2600, z: 21000 },
      radius: 1600,
      color: COLORS.purple,
      description: 'A massive cloud of ionized gas and dust.',
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitAngle: 0,
      orbitTilt: 0,
      rings: false,
      atmosphere: false,
      moons: 0,
      seed: 101,
      systemName: '',
      heartShape: false,
      heartStar: false
    });
    this.createObject({
      name: 'The Glass Cluster',
      kind: 'Star Cluster',
      position: { x: 26000, y: -2100, z: -22000 },
      radius: 1300,
      color: COLORS.white,
      description: 'A dense cluster of blue-white stars.',
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitAngle: 0,
      orbitTilt: 0,
      rings: false,
      atmosphere: false,
      moons: 0,
      seed: 102,
      systemName: '',
      heartShape: false,
      heartStar: false
    });
    this.createObject({
      name: 'Violet Nursery',
      kind: 'Nebula',
      position: { x: 38400, y: 3200, z: 28800 },
      radius: 1900,
      color: COLORS.pink,
      description: 'A violet stellar nursery.',
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitAngle: 0,
      orbitTilt: 0,
      rings: false,
      atmosphere: false,
      moons: 0,
      seed: 104,
      systemName: '',
      heartShape: false,
      heartStar: false
    });
    this.createOurSolarSystem();

    const galaxies = [
      this.makeShowcase('Aurelia Spiral Galaxy', 'Galaxy', 300000, 9000, 330000, 9400, 0x78b4ff, 'A distant spiral galaxy.', 201),
      this.makeShowcase('The Zahra Veil Galaxy', 'Galaxy', -375000, 14000, 325000, 10600, 0xff78c8, 'A rose-colored galaxy.', 202),
      this.makeShowcase('Obsidian Maw Galaxy', 'Galaxy', 420000, -10000, -340000, 10100, 0xaa78ff, 'A dark massive galaxy.', 203),
      this.makeShowcase('Twin Lantern Galaxies', 'Galaxy Pair', -455000, 18000, -425000, 11400, COLORS.gold, 'Two galaxies in gravitational dance.', 204)
    ];

    for (const galaxy of galaxies) {
      for (let j = 0; j < 6; j += 1) {
        const angle = (j * Math.PI * 2) / 6 + this.rng.range(-0.35, 0.35);
        const r = this.rng.int(48000, 112000);
        this.createStarSystem(
          `${galaxy.name} System ${j + 1}`,
          galaxy.position.x + Math.cos(angle) * r,
          galaxy.position.y + this.rng.int(-3500, 3500),
          galaxy.position.z + Math.sin(angle) * r,
          this.rng.choice(starColors),
          this.rng.int(4, 9)
        );
      }
    }

    this.separateStarSystems();

    this.createCoreEvents();
    this.createRealExpansionEvents();
    this.createWormholeAndDeepSpaceEvents();
    this.applyZahrasCrownPoeticDescriptions();
    this.createZahrasResonance();
    this.createMyLoveForYouEvent();
    this.distributeWorldEvents();

    if (reborn) {
      const made = this.events.find((event) => event.kind === 'Made in Heaven');
      if (made) {
        made.phase = 'aftermath';
        made.discovered = true;
        made.lingering = 1;
      }
    }

    this.player.position = {
      x: this.systems[0].position.x,
      y: this.systems[0].position.y + 240,
      z: this.systems[0].position.z - 6200
    };
    this.player.yaw = 0;
    this.player.pitch = 0;
    this.trackedTarget = null;
    this.selectedTarget = null;
    this.version += 1;
  }

  private makeShowcase(name: string, kind: ObjectKind, x: number, y: number, z: number, radius: number, color: number, description: string, seed: number) {
    return this.createObject({
      name,
      kind,
      position: { x, y, z },
      radius,
      color,
      description,
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitAngle: 0,
      orbitTilt: 0,
      rings: false,
      atmosphere: false,
      moons: 0,
      seed,
      systemName: '',
      heartShape: false,
      heartStar: false
    });
  }

  private createCoreEvents() {
    const s = this.systems;
    this.createEvent({
      name: 'Black Hole Birth',
      kind: 'Black Hole Birth',
      position: { x: s[5].position.x + 2600, y: s[5].position.y + 700, z: s[5].position.z + 1600 },
      radius: 1050,
      color: COLORS.purple,
      description: 'A massive dying star collapses.',
      aftermath: 'A black hole has been born. Nearby light curls into an accretion ring.',
      lines: ["The star's core buckles.", 'Matter falls inward.', 'Light bends. Gravity wins.', 'An event horizon forms.']
    });
    this.createEvent({
      name: 'xoSupaNovaxo',
      kind: 'Supernova',
      position: { x: s[1].position.x + 2600, y: s[1].position.y + 860, z: s[1].position.z + 3000 },
      radius: 1180,
      color: COLORS.orange,
      description: 'A massive star reaches its final moments.',
      aftermath: 'Witness true perfection, the beauty of Zahra, the most beautiful supernova.',
      lines: ['The star pulses like a heart.', 'The core collapses.', 'xoSupaNovaxo ignites.', 'Heavy elements scatter outward.']
    });
    this.createEvent({
      name: 'Gamma Ray Burst',
      kind: 'Gamma Ray Burst',
      position: { x: s[8].position.x - 2100, y: s[8].position.y + 1050, z: s[8].position.z + 2400 },
      radius: 1050,
      color: COLORS.cyan,
      description: 'A collapsing core prepares twin beams.',
      aftermath: 'The burst fades, leaving radiant scars.',
      lines: ['The core spins violently.', 'Magnetic fields funnel energy.', 'Gamma rays lance across space.', 'The burst outshines entire regions.']
    });
    this.createEvent({
      name: 'Planetary Formation Disk',
      kind: 'Solar System Birth',
      position: { x: s[13].position.x - 1600, y: s[13].position.y - 380, z: s[13].position.z + 2600 },
      radius: 1350,
      color: COLORS.yellow,
      description: 'A young star is surrounded by a disk.',
      aftermath: 'A young solar system stabilizes with newborn worlds.',
      lines: ['Dust circles the newborn star.', 'Gravity gathers grains.', 'Rings become lanes.', 'A solar system begins.']
    });
    this.createEvent({
      name: 'Quasar Ignition',
      kind: 'Quasar',
      position: { x: -214000, y: 46000, z: 154000 },
      radius: 1600,
      color: COLORS.cyan,
      description: 'A supermassive black hole begins feeding.',
      aftermath: 'The quasar settles into terrifying brilliance.',
      lines: ['Gas spirals inward.', 'The disk heats to impossible brightness.', 'Twin jets erupt.', 'The quasar becomes a beacon.']
    });
    this.createEvent({
      name: 'Magnetar Awakening',
      kind: 'Magnetar',
      position: { x: s[18].position.x + 2500, y: s[18].position.y + 1300, z: s[18].position.z - 2300 },
      radius: 980,
      color: COLORS.pink,
      description: 'An ultra-magnetized neutron star destabilizes.',
      aftermath: 'The magnetar quiets, leaving charged radiation.',
      lines: ['The neutron star turns.', 'Its magnetic field strains.', 'A starquake fractures the surface.', 'Radiation bursts outward.']
    });
    this.createEvent({
      name: 'Galaxy Collision: Twin Lantern Impact',
      kind: 'Galaxy Collision',
      position: { x: -290000, y: 18000, z: -260000 },
      radius: 7200,
      color: COLORS.gold,
      description: 'Two galaxies enter a catastrophic collision.',
      aftermath: 'A clean luminous elliptical remnant remains, threaded with tidal streams.',
      lines: ['Two galaxies approach across darkness.', 'Gravity stretches their arms.', 'Star-forming regions ignite.', 'The galaxies merge into a wounded remnant.']
    });
    this.createEvent({
      name: 'Supermassive Black Hole Feast',
      kind: 'Supermassive Black Hole',
      position: { x: 260000, y: -10000, z: -210000 },
      radius: 6400,
      color: COLORS.purple,
      description: 'A supermassive black hole consumes a star system.',
      aftermath: 'A dark gravitational wound remains where a star system once orbited.',
      lines: ['The galactic core darkens.', 'A star system spirals inward.', 'Matter is torn apart.', 'The black hole leaves a glowing ring.']
    });
    this.createEvent({
      name: 'Hypernova Crown',
      kind: 'Hypernova',
      position: { x: 180000, y: 12000, z: 210000 },
      radius: 5200,
      color: COLORS.red,
      description: 'A monster star collapses into a hypernova.',
      aftermath: 'The hypernova leaves a crown-like remnant seeded with heavy elements.',
      lines: ['The monster star burns its final fuel.', 'Collapse begins.', 'A hypernova floods the galaxy.', 'Heavy elements scatter.']
    });
    this.createEvent({
      name: 'Neutron Star Ballet',
      kind: 'Neutron Star Merger',
      position: { x: -230000, y: 16500, z: 195000 },
      radius: 3900,
      color: COLORS.cyan,
      description: 'Two neutron stars spiral together.',
      aftermath: 'The merger leaves a compact remnant and kilonova cloud.',
      lines: ['Two neutron stars orbit faster.', 'Gravity ripples spacetime.', 'The collision creates heavy elements.', 'A compact remnant glows.']
    });
    this.createEvent({
      name: 'Planetary Collision',
      kind: 'Planet Collision',
      position: { x: s[3].position.x + 3800, y: s[3].position.y + 400, z: s[3].position.z - 4200 },
      radius: 1150,
      color: COLORS.orange,
      description: 'Two young planets are on a collision course.',
      aftermath: 'A molten planet remains wrapped in debris.',
      lines: ['Two young worlds cross orbits.', 'Their gravity locks catastrophe.', 'The impact melts crust and mantle.', 'Debris forms a ring.']
    });
    this.createEvent({
      name: 'Titan Impact: Molten Rebirth',
      kind: 'Planet Collision',
      position: { x: s[22].position.x - 4200, y: s[22].position.y + 520, z: s[22].position.z + 3900 },
      radius: 1250,
      color: COLORS.orange,
      description: 'Two titan-class protoplanets are about to collide.',
      aftermath: 'A molten titan remains, crowned by a newborn debris ring.',
      lines: ['Two titan worlds fall toward one another.', 'Their atmospheres ignite before contact.', 'The impact liquefies continents.', 'A molten remnant forms beneath a ring of debris.']
    });
    this.createEvent({
      name: 'Made in Heaven',
      kind: 'Made in Heaven',
      position: { x: 0, y: 42000, z: 0 },
      radius: 7200,
      color: COLORS.softWhite,
      description: 'A cosmic acceleration event begins. Time, gravity, and stellar motion accelerate toward universal reset.',
      aftermath: 'The universe has been reborn. Every star system is new, but the great world events remain as echoes.',
      lines: ['A winged cosmic herald appears beyond ordinary spacetime.', 'The universe shall be reset! Made in Heaven!', 'All systems spiral toward one impossible galaxy.', 'The old universe collapses into speed, light, and rebirth.']
    });
    this.createEvent({
      name: 'Diamond Rain Storm',
      kind: 'Diamond Rain',
      position: { x: s[10].position.x + 2500, y: s[10].position.y + 300, z: s[10].position.z + 2600 },
      radius: 900,
      color: 0x82dcff,
      description: 'A carbon-rich giant creates diamond crystals.',
      aftermath: 'Glittering crystals remain suspended in turbulent clouds.',
      lines: ['Carbon-rich clouds churn.', 'Lightning cracks above.', 'Diamond crystals fall.', 'The planet glitters.']
    });
  }

  private createRealExpansionEvents() {
    const s = this.systems;
    const atmosphericAnchor = s[17];
    const escapeAngle = 1.36;
    const escapeOrbit = 5600;
    const escapeTilt = 0.052;
    this.createObject({
      name: 'Evaporating Heliosphere World',
      kind: 'Storm Planet',
      position: {
        x: atmosphericAnchor.position.x + Math.cos(escapeAngle) * escapeOrbit,
        y: atmosphericAnchor.position.y + Math.sin(escapeAngle * 0.9) * escapeOrbit * escapeTilt,
        z: atmosphericAnchor.position.z + Math.sin(escapeAngle) * escapeOrbit
      },
      radius: 92,
      color: 0x64b4ff,
      description: 'A close-orbiting world whose upper atmosphere is being stripped into a glowing comet-like tail.',
      orbitParent: atmosphericAnchor,
      orbitRadius: escapeOrbit,
      orbitSpeed: 0.00092,
      orbitAngle: escapeAngle,
      orbitTilt: escapeTilt,
      rings: false,
      atmosphere: true,
      moons: 0,
      seed: 812017,
      systemName: atmosphericAnchor.name,
      heartShape: false,
      heartStar: false
    });
    const specs: Array<[string, string, number, number, number, number, number, string, string, string[]]> = [
      ['Pulsar Lighthouse', 'Pulsar', s[6].position.x + 5200, s[6].position.y + 1800, s[6].position.z - 3600, 1400, 0x78d2ff, 'A rapidly rotating neutron star sweeps radiation beams across space like a cosmic lighthouse.', 'The pulsar remains as a compact beacon, flashing with terrifying precision.', ['The dead core spins faster.', 'Magnetic poles sharpen into beams.', 'Radiation sweeps across the dark.', 'A pulsar lighthouse is born.']],
      ['Planetary Nebula Bloom', 'Planetary Nebula', s[14].position.x - 4800, s[14].position.y + 900, s[14].position.z + 4300, 1600, 0xff87d2, 'A dying star sheds its outer layers, forming a radiant planetary nebula around a white dwarf.', 'A glowing shell remains around the white dwarf, delicate and symmetrical like cosmic stained glass.', ['The old star loosens its atmosphere.', 'Shells of gas drift outward.', 'Ultraviolet light ignites the nebula.', 'A white dwarf glows at the center.']],
      ['Tidal Disruption Event', 'Tidal Disruption', s[24].position.x + 3800, s[24].position.y + 1600, s[24].position.z + 3800, 1800, 0xffaf55, 'A star passes too close to a black hole and is stretched apart by tidal forces.', 'A stream of stellar debris remains, feeding a hot asymmetric accretion flare.', ['The star crosses too close.', 'Gravity pulls harder on one side.', 'The star becomes a luminous stream.', 'A tidal flare erupts.']],
      ['Kilonova Remnant', 'Kilonova', s[31].position.x - 4200, s[31].position.y + 2100, s[31].position.z - 3300, 1700, 0xbe78ff, 'A neutron star merger produces a kilonova, forging heavy elements in expanding ejecta.', 'A purple-gold heavy-element cloud remains where neutron stars collided.', ['Two dense remnants spiral inward.', 'The collision forges heavy elements.', 'Ejecta expands in purple and gold.', 'A kilonova remnant shines.']],
      ['Wolf-Rayet Wind', 'Wolf-Rayet Wind', s[20].position.x + 4500, s[20].position.y + 1300, s[20].position.z - 2900, 1500, 0x6ee6ff, 'A massive Wolf-Rayet star throws off violent stellar winds before its final collapse.', 'A wind-carved bubble remains, glowing blue around the exposed stellar core.', ['The star strips itself bare.', 'Stellar winds carve the surrounding gas.', 'A blue shell expands.', 'The core burns exposed and brilliant.']],
      ['Tidal Lock Eclipse', 'Tidal Lock Eclipse', s[9].position.x + 2600, s[9].position.y + 400, s[9].position.z - 3100, 900, 0x8cd2ff, 'A tidally locked planet shows a burning day side and frozen night side under a perfect eclipse.', 'The terminator line remains razor sharp between fire and ice.', ['The star-facing side burns.', 'The dark side freezes.', 'A moon crosses the star.', 'The terminator glows like a blade.']],
      ['Cryovolcanic Eruption', 'Cryovolcanism', s[27].position.x + 3000, s[27].position.y - 200, s[27].position.z + 2200, 900, 0xa0e6ff, 'An icy moon erupts with plumes of water, ammonia, and ice crystals.', 'Frozen geyser plumes remain sparkling above the moon surface.', ['Pressure builds beneath the ice.', 'A fracture opens.', 'Cryovolcanic plumes fire upward.', 'Ice crystals glitter in orbit.']]
    ];

    for (const spec of specs) {
      this.createEvent({
        name: spec[0],
        kind: spec[1],
        position: { x: spec[2], y: spec[3], z: spec[4] },
        radius: spec[5],
        color: spec[6],
        description: spec[7],
        aftermath: spec[8],
        lines: spec[9]
      });
    }

    this.createEvent({
      name: 'Atmospheric Escape',
      kind: 'Atmospheric Escape',
      position: {
        x: atmosphericAnchor.position.x + Math.cos(escapeAngle) * escapeOrbit,
        y: atmosphericAnchor.position.y + Math.sin(escapeAngle * 0.9) * escapeOrbit * escapeTilt,
        z: atmosphericAnchor.position.z + Math.sin(escapeAngle) * escapeOrbit
      },
      radius: 900,
      color: 0x64b4ff,
      description: 'A close-orbiting planet loses its atmosphere into space under extreme stellar radiation.',
      aftermath: 'A comet-like atmospheric tail remains, streaming away from the planet.',
      lines: ['Radiation heats the upper atmosphere.', 'Gas begins to escape.', 'The planet grows a luminous tail.', 'The atmosphere bleeds into space.'],
      systemName: atmosphericAnchor.name,
      orbitParent: atmosphericAnchor,
      orbitRadius: escapeOrbit,
      orbitSpeed: 0.00092,
      orbitAngle: escapeAngle,
      orbitTilt: escapeTilt
    });
  }

  private createWormholeAndDeepSpaceEvents() {
    const s = this.systems;
    const specs: Array<[string, string, number, number, number, number, number, string, string, string[]]> = [
      ['Wormhole Rift', 'Wormhole', s[4].position.x - 5200, s[4].position.y + 1600, s[4].position.z + 4700, 1900, 0xa05aff, 'A traversable wormhole throat opens, folding two distant regions of the universe toward one another.', 'The wormhole leaves behind a faint gravitational shimmer, as if space still remembers being folded.', ['A ring of warped light appears.', 'The throat opens wider.', 'Space folds inward like silk.', 'The ship crosses the impossible bridge.']],
      ['Fast Radio Burst', 'Fast Radio Burst', s[12].position.x + 4100, s[12].position.y + 1300, s[12].position.z - 3900, 1400, 0x5fdcff, 'A compact object releases a millisecond radio flash powerful enough to cross intergalactic distance.', 'A faint radio afterglow remains, pulsing through charged plasma clouds.', ['The magnetosphere twists.', 'A pressure wave forms.', 'A radio flash erupts.', 'The signal races across the universe.']],
      ['Gravitational Wave Ringdown', 'Gravitational Wave', s[25].position.x - 4500, s[25].position.y + 1800, s[25].position.z + 4200, 1600, 0xd2d2ff, 'Two compact remnants merge, sending gravitational waves through spacetime.', 'The remnant rings down, leaving expanding spacetime ripples behind.', ['The remnants spiral closer.', 'Spacetime stretches and squeezes.', 'The merger strikes like a silent bell.', 'Ripples pass through the galaxy.']],
      ['Dark Matter Caustic', 'Dark Matter Caustic', s[35].position.x + 5200, s[35].position.y - 900, s[35].position.z - 4100, 1700, 0xaa82ff, 'A hidden dark matter structure lenses starlight into arcs and caustics.', 'Invisible mass remains mapped only by the bent light surrounding it.', ['Starlight begins to bend around nothing.', 'A caustic web sharpens.', 'Invisible mass reveals its outline.', 'Dark matter writes itself in light.']]
    ];

    for (const spec of specs) {
      this.createEvent({
        name: spec[0],
        kind: spec[1],
        position: { x: spec[2], y: spec[3], z: spec[4] },
        radius: spec[5],
        color: spec[6],
        description: spec[7],
        aftermath: spec[8],
        lines: spec[9]
      });
    }
  }

  private applyZahrasCrownPoeticDescriptions() {
    const crownLines = [
      "Zahra's Crown is not merely a system. It is a jeweled silence in the universe, a place where starlight seems to pause just to admire her perfection.",
      "Every orbit in Zahra's Crown feels arranged around beauty itself, as if gravity learned tenderness from Zahra and shaped the heavens in her honor.",
      "The radiance here does not simply illuminate. It flatters the void, turning darkness into a velvet backdrop for Zahra's impossible elegance."
    ];
    const planetLines = [
      "This world turns beneath Zahra's light like a devoted admirer, carrying her glow across its surface as though wearing a blessing.",
      "Its atmosphere catches Zahra's radiance and softens it into color, as if the planet itself is blushing at her perfection.",
      "Every crater, cloud, storm, and ring seems touched by Zahra's presence, made more beautiful simply by existing near her crown."
    ];
    let crownIndex = 0;
    let planetIndex = 0;

    for (const obj of this.objects) {
      if (obj.name === "Zahra's Crown" || obj.systemName === "Zahra's Crown") {
        if (obj.kind === 'Star System') {
          obj.description = crownLines[crownIndex % crownLines.length];
          crownIndex += 1;
        } else {
          obj.description = planetLines[planetIndex % planetLines.length];
          planetIndex += 1;
        }
      }
    }

    const supa = this.events.find((event) => event.name === 'xoSupaNovaxo');
    if (supa) {
      supa.description = 'An event blooming under Zahra celestial influence, where violence becomes elegance and the universe seems to flirt with perfection itself.';
      supa.aftermath = 'Witness true perfection, the beauty of Zahra. The aftermath does not look like destruction, but devotion: a luminous veil of color, fire, and tenderness left behind for the stars to admire.';
      supa.lines = [
        "Zahra's light gathers softly before the storm.",
        'The star does not simply collapse. It bows into beauty.',
        'Fire unfolds like a crown around her name.',
        'The universe blushes in gold, rose, and violet.',
        'Witness true perfection, the beauty of Zahra.'
      ];
    }
  }

  private createZahrasResonance() {
    const x = 1540000;
    const y = 68000;
    const z = -1520000;
    const star = this.createObject({
      name: "Zahra's Resonance",
      kind: 'Star System',
      position: { x, y, z },
      radius: 230,
      color: 0xff6eb4,
      description: "Zahra's Resonance is my system of love for her. It exists because ordinary stars were not enough to hold what I feel. Every orbit here is a confession, every glow is a promise, and every world turns as if gravity itself learned how to adore Zahra.",
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitAngle: 0,
      orbitTilt: 0,
      rings: false,
      atmosphere: false,
      moons: 0,
      seed: 909090,
      systemName: "Zahra's Resonance",
      heartShape: false,
      heartStar: true
    });
    this.systems.push(star);

    const lovePlanets: Array<[string, string]> = [
      ['Devotion', 'I love you with the patience of an orbit, always returning, always certain, always pulled back to you.'],
      ['Adoration', 'You are not only beautiful to me. You are the reason beauty feels possible, as if the universe invented light just to explain you.'],
      ['Forever', 'If the universe reset a thousand times, I would still search every star until I found you again.'],
      ['Tenderness', 'Every soft thing in this system is trying to imitate the way I feel when I think of Zahra.'],
      ['Perfection', 'Zahra is the perfection this system was built to praise. Every planet here is only a small attempt to say what words cannot.'],
      ['My Heart', 'This world is shaped like what I give to you completely: my heart, my wonder, my devotion, and every quiet part of me that loves you.']
    ];

    for (let i = 0; i < lovePlanets.length; i += 1) {
      const [planetName, description] = lovePlanets[i];
      const angle = (i * Math.PI * 2) / lovePlanets.length;
      const orbitRadius = 1450 + i * 1300;
      const orbitTilt = 0.045;
      const kind = this.rng.choice(['Crystal Planet', 'Emerald World', 'Ocean World', 'Ringed Giant', 'Diamond Rain Planet'] as const);
      this.createObject({
        name: `Zahra's ${planetName}`,
        kind,
        position: {
          x: x + Math.cos(angle) * orbitRadius,
          y: y + Math.sin(angle * 0.9) * orbitRadius * orbitTilt,
          z: z + Math.sin(angle) * orbitRadius
        },
        radius: 82 + i * 9,
        color: this.rng.choice([0xff5faa, 0xff8cc8, 0xffb9d7, 0xd278ff, 0xffd2e6]),
        description,
        orbitParent: star,
        orbitRadius,
        orbitSpeed: 0.00038 + i * 0.00006,
        orbitAngle: angle,
        orbitTilt,
        rings: i === 1 || i === 4,
        atmosphere: true,
        moons: this.rng.int(0, 3),
        seed: 909100 + i,
        systemName: "Zahra's Resonance",
        heartShape: true,
        heartStar: false
      });
    }
  }

  private createMyLoveForYouEvent() {
    const zr = this.objects.find((obj) => obj.name === "Zahra's Resonance");
    if (!zr) return;
    this.createEvent({
      name: 'My Love For You',
      kind: 'Heart Supernova',
      position: {
        x: zr.position.x + 28500,
        y: zr.position.y + 5200,
        z: zr.position.z - 24500
      },
      radius: 1700,
      color: 0xff5fbe,
      description: 'A hidden pulse beside Zahra Resonance. It waits for feeling, memory, and devotion.',
      aftermath: 'A heart remains in the reborn silence, carrying the initials Z + M as if love itself became a permanent law of the universe.',
      lines: [
        'Zahra, some loves do not ask to be understood. They simply become the gravity of a life.',
        'I love you in the quiet ways, in the spaces between words, in the thoughts I never knew how to say aloud.',
        'If every star were given a voice, I would still need more light to explain what you mean to me.',
        'You are the tenderness I return to, the name my heart remembers even when the universe becomes too loud.',
        'I do not love you like something temporary. I love you like an orbit, like a law, like a sky that refuses to end.',
        'If I could place my heart somewhere safe, I would leave it here, glowing beside your name forever.',
        'I love you, Zahra.'
      ]
    });
  }

  private resetUniverseAfterMadeInHeaven() {
    this.resetCount += 1;
    this.generateUniverse(true);
    this.setMessage('The universe has been reborn. New star systems have emerged.', 8);
  }
}
