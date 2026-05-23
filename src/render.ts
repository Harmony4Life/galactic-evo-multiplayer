import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  COLORS,
  distance,
  GameState,
  hasPersistentAftermath,
  isEvent,
  PlanetKind,
  planetKinds,
  RemotePlayerState,
  smoothstep,
  SpaceObject,
  subVec,
  Trackable,
  Vec3,
  WARP_ALIGN_DURATION,
  WARP_CHARGE_DURATION,
  WARP_DURATION,
  WARP_EXIT_DURATION,
  WorldEvent
} from './simulation';

const RENDER_SCALE = 0.005;
const COLOR_WHITE = new THREE.Color(COLORS.white);
const PLANET_SET = new Set<string>(planetKinds);

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function color(hex: number, scalar = 1) {
  return new THREE.Color(hex).multiplyScalar(scalar);
}

function cssHex(hex: number) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function mixHex(a: number, b: number, t: number) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

function makeCanvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void, seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  draw(ctx, seeded(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createGlowTexture(seed: number = 1, tint: number = COLORS.white) {
  return makeCanvasTexture(
    256,
    256,
    (ctx) => {
      const c = new THREE.Color(tint);
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
      gradient.addColorStop(0, `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, .86)`);
      gradient.addColorStop(0.14, `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, .52)`);
      gradient.addColorStop(0.42, `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, .13)`);
      gradient.addColorStop(1, `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
    },
    seed
  );
}

function createPlanetTexture(kind: SpaceObject['kind'], baseHex: number, seed: number) {
  return makeCanvasTexture(
    768,
    384,
    (ctx, rand) => {
      const base = new THREE.Color(baseHex);
      const dark = base.clone().multiplyScalar(0.32);
      const light = base.clone().lerp(COLOR_WHITE, 0.45);
      ctx.fillStyle = `#${dark.getHexString()}`;
      ctx.fillRect(0, 0, 768, 384);

      if (seed === 700102) {
        const ocean = ctx.createLinearGradient(0, 0, 768, 384);
        ocean.addColorStop(0, '#164fa8');
        ocean.addColorStop(0.5, '#1d7edb');
        ocean.addColorStop(1, '#082f76');
        ctx.fillStyle = ocean;
        ctx.fillRect(0, 0, 768, 384);

        const drawContinent = (cx: number, cy: number, sx: number, sy: number, hue: string) => {
          ctx.fillStyle = hue;
          ctx.beginPath();
          for (let i = 0; i < 34; i += 1) {
            const a = (i / 34) * Math.PI * 2;
            const wobble = 0.72 + Math.sin(i * 1.73 + seed * 0.01) * 0.16 + Math.sin(i * 3.41) * 0.12;
            const x = cx + Math.cos(a) * sx * wobble;
            const y = cy + Math.sin(a) * sy * wobble;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        };

        drawContinent(175, 150, 78, 70, '#3c9d55');
        drawContinent(240, 220, 52, 86, '#74a64c');
        drawContinent(390, 155, 112, 62, '#5aa34e');
        drawContinent(470, 235, 44, 54, '#b49d61');
        drawContinent(610, 150, 86, 78, '#4fa85a');
        drawContinent(690, 225, 46, 62, '#8bb85d');

        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = 'rgba(250, 255, 255, 0.82)';
        ctx.beginPath();
        ctx.ellipse(384, 22, 360, 24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(384, 362, 370, 26, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let cloud = 0; cloud < 95; cloud += 1) {
          const x = rand() * 768;
          const y = 34 + rand() * 316;
          ctx.strokeStyle = `rgba(245, 250, 255, ${0.07 + rand() * 0.13})`;
          ctx.lineWidth = 2 + rand() * 8;
          ctx.beginPath();
          ctx.moveTo(x - 54, y);
          for (let k = 0; k < 5; k += 1) {
            ctx.quadraticCurveTo(x - 36 + k * 23, y + Math.sin(k + seed) * 7, x - 18 + k * 26, y + Math.cos(k * 1.8) * 6);
          }
          ctx.stroke();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else if (kind === 'Gas Giant' || kind === 'Storm Planet' || kind === 'Ringed Giant' || kind === 'Mega Ringed Giant' || kind === 'Diamond Rain Planet' || kind === 'Iron Storm World') {
        for (let y = 0; y < 384; y += 1) {
          const band = 0.5 + 0.5 * Math.sin(y * 0.055 + seed * 0.02) + 0.22 * Math.sin(y * 0.16 + seed);
          const c = base.clone().lerp(light, Math.max(0, Math.min(1, band * 0.62 + rand() * 0.18)));
          ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, .88)`;
          ctx.fillRect(0, y, 768, 1);
        }
        for (let storm = 0; storm < 10; storm += 1) {
          const x = rand() * 768;
          const y = 64 + rand() * 260;
          const w = 40 + rand() * 150;
          const h = 10 + rand() * 32;
          const c = light.clone().lerp(base, rand() * 0.6);
          ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, .45)`;
          ctx.beginPath();
          ctx.ellipse(x, y, w, h, rand() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (let patch = 0; patch < 220; patch += 1) {
          const x = rand() * 768;
          const y = rand() * 384;
          const r = 8 + rand() * 60;
          const c = base.clone().lerp(rand() > 0.55 ? light : dark, 0.35 + rand() * 0.5);
          ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${0.12 + rand() * 0.22})`;
          ctx.beginPath();
          ctx.ellipse(x, y, r * (0.6 + rand()), r * (0.25 + rand() * 0.45), rand() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }

        if (kind === 'Ocean World' || kind === 'Emerald World') {
          ctx.globalCompositeOperation = 'screen';
          for (let cloud = 0; cloud < 72; cloud += 1) {
            ctx.strokeStyle = `rgba(245, 250, 255, ${0.05 + rand() * 0.08})`;
            ctx.lineWidth = 2 + rand() * 7;
            ctx.beginPath();
            const y = 40 + rand() * 300;
            ctx.moveTo(0, y);
            for (let x = 0; x < 768; x += 48) {
              ctx.lineTo(x, y + Math.sin(x * 0.016 + rand() * 8) * (8 + rand() * 18));
            }
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }

        if (kind === 'Crystal Planet' || kind === 'Ice World' || kind === 'Frozen Titan') {
          ctx.globalCompositeOperation = 'screen';
          for (let k = 0; k < 95; k += 1) {
            const x = rand() * 768;
            const y = rand() * 384;
            const s = 6 + rand() * 32;
            ctx.strokeStyle = `rgba(230, 250, 255, ${0.16 + rand() * 0.24})`;
            ctx.beginPath();
            ctx.moveTo(x, y - s);
            ctx.lineTo(x + s * 0.62, y);
            ctx.lineTo(x, y + s);
            ctx.lineTo(x - s * 0.62, y);
            ctx.closePath();
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      const vignette = ctx.createLinearGradient(0, 0, 768, 384);
      vignette.addColorStop(0, 'rgba(0,0,0,.26)');
      vignette.addColorStop(0.5, 'rgba(255,255,255,.06)');
      vignette.addColorStop(1, 'rgba(0,0,0,.32)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, 768, 384);
    },
    seed
  );
}

function createRingTexture(baseHex: number, seed: number) {
  return makeCanvasTexture(
    1024,
    96,
    (ctx, rand) => {
      ctx.clearRect(0, 0, 1024, 96);
      const base = new THREE.Color(baseHex);
      for (let x = 0; x < 1024; x += 1) {
        const lane = Math.sin(x * 0.041 + seed) * 0.5 + Math.sin(x * 0.013) * 0.5 + rand() * 0.9;
        const alpha = 0.05 + Math.max(0, lane) * 0.27;
        const c = base.clone().lerp(COLOR_WHITE, 0.28 + rand() * 0.38);
        ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
        ctx.fillRect(x, 0, 1, 96);
      }
      for (let lane = 0; lane < 16; lane += 1) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.02 + rand() * 0.08})`;
        const y = rand() * 96;
        ctx.fillRect(0, y, 1024, 1 + rand() * 4);
      }
    },
    seed
  );
}

function createLabelSprite(text: string, tint: number) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const fontSize = 26;
  ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.max(220, Math.ceil(metrics.width + 36));
  canvas.height = 58;
  ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
  ctx.fillStyle = 'rgba(0, 0, 0, .34)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const c = new THREE.Color(tint);
  ctx.strokeStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, .35)`;
  ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  ctx.shadowColor = `#${c.getHexString()}`;
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#eef7ff';
  ctx.fillText(text, 18, 37);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      depthTest: false
    })
  );
  sprite.scale.set(canvas.width / 58, canvas.height / 58, 1);
  return sprite;
}

function createConstellationLabel(text: string, tint: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const c = new THREE.Color(tint);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '800 42px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = `#${c.getHexString()}`;
  ctx.shadowBlur = 28;
  ctx.strokeStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, .34)`;
  ctx.lineWidth = 8;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = 'rgba(230, 244, 255, .72)';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    })
  );
  sprite.scale.set(56, 10.5, 1);
  return sprite;
}

function constellationPatchPoint(centerA: number, centerU: number, localX: number, localY: number, radius: number) {
  const a = centerA + localX * 0.18;
  const u = THREE.MathUtils.clamp(centerU + localY * 0.16, -0.86, 0.86);
  const s = Math.sqrt(Math.max(0.001, 1 - u * u));
  return new THREE.Vector3(Math.cos(a) * s * radius, u * radius * 0.72, Math.sin(a) * s * radius);
}

function makeConstellations() {
  const group = new THREE.Group();
  const designs = [
    {
      name: "Zahra's Lyre",
      tint: COLORS.pink,
      center: [0.28, 0.42],
      points: [[-1.4, -0.2, 1.2], [-0.72, 0.68, 0.75], [0, 0.12, 1.5], [0.76, 0.72, 0.8], [1.42, -0.18, 1.2], [0, -0.82, 1.05], [-0.42, -1.28, 0.7], [0.42, -1.28, 0.7]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [4, 5], [5, 6], [5, 7], [6, 7]]
    },
    {
      name: 'Twin Lantern',
      tint: COLORS.gold,
      center: [1.22, -0.18],
      points: [[-1.45, 0.5, 1.25], [-0.85, 1.0, 0.72], [-0.22, 0.55, 0.95], [-0.86, -0.08, 0.82], [-1.42, -0.46, 0.65], [0.34, 0.52, 0.9], [1.02, 1.02, 0.76], [1.58, 0.44, 1.22], [1.06, -0.12, 0.78], [0.34, -0.28, 0.64]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [0, 3], [5, 6], [6, 7], [7, 8], [8, 9], [5, 8], [2, 5]]
    },
    {
      name: 'Rose Compass',
      tint: COLORS.cyan,
      center: [2.15, 0.2],
      points: [[0, 1.34, 1.3], [0.48, 0.46, 0.75], [1.38, 0, 1.1], [0.46, -0.44, 0.72], [0, -1.36, 1.3], [-0.48, -0.44, 0.72], [-1.38, 0, 1.1], [-0.46, 0.46, 0.72], [0, 0, 1.55]],
      edges: [[8, 0], [8, 2], [8, 4], [8, 6], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 0]]
    },
    {
      name: 'Vesper Chain',
      tint: COLORS.softWhite,
      center: [3.18, -0.36],
      points: [[-1.6, -0.44, 0.7], [-1.08, 0.08, 0.8], [-0.48, 0.02, 1.05], [0.08, 0.54, 0.78], [0.72, 0.36, 1.28], [1.28, 0.86, 0.72], [1.66, 0.24, 0.92], [1.2, -0.34, 0.68], [0.42, -0.5, 0.74]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [6, 7], [7, 8], [8, 2]]
    },
    {
      name: 'Crownwake',
      tint: COLORS.purple,
      center: [4.0, 0.5],
      points: [[-1.38, -0.38, 0.86], [-0.88, 0.84, 1.08], [-0.34, -0.1, 0.72], [0, 1.24, 1.48], [0.36, -0.08, 0.72], [0.88, 0.82, 1.08], [1.38, -0.36, 0.86], [-0.82, -0.82, 0.62], [0.82, -0.82, 0.62]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [0, 7], [7, 8], [8, 6], [2, 4]]
    },
    {
      name: 'Ivory Sail',
      tint: COLORS.softWhite,
      center: [5.05, -0.02],
      points: [[-1.2, -0.82, 1.0], [-0.78, 0.72, 1.22], [-0.08, 1.22, 0.7], [0.26, 0.14, 1.05], [1.22, -0.5, 1.35], [-0.34, -0.34, 0.64], [0.5, -0.98, 0.74]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 6], [6, 0], [0, 5], [5, 3], [5, 6]]
    },
    {
      name: 'Nova Harp',
      tint: COLORS.blue,
      center: [5.82, 0.28],
      points: [[-1.44, 0.98, 0.84], [-0.72, 0.5, 0.94], [0, 0.18, 1.42], [0.72, 0.5, 0.94], [1.44, 0.98, 0.84], [-0.98, -0.24, 0.72], [-0.36, -0.76, 0.78], [0.36, -0.76, 0.78], [0.98, -0.24, 0.72]],
      edges: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 5], [2, 6], [2, 7], [3, 8], [5, 6], [6, 7], [7, 8]]
    }
  ] as const;

  for (let c = 0; c < designs.length; c += 1) {
    const design = designs[c];
    const designGroup = new THREE.Group();
    designGroup.userData.region = c;
    const centerA = design.center[0];
    const centerU = design.center[1];
    const radius = 1320 + c * 28;
    const points = design.points.map(([x, y]) => constellationPatchPoint(centerA, centerU, x, y, radius));
    const linePositions: number[] = [];
    for (const [a, b] of design.edges) {
      const pa = points[a];
      const pb = points[b];
      linePositions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color: design.tint,
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    designGroup.add(lines);

    const veil = makeParticleCloud(80, 42, design.tint, 7420 + c * 83, 0.42, 0.52);
    const constellationCenter = constellationPatchPoint(centerA, centerU, 0, 0, radius);
    veil.position.copy(constellationCenter).multiplyScalar(0.985);
    veil.scale.set(1.35, 0.42, 0.1);
    designGroup.add(veil);

    for (let i = 0; i < points.length; i += 1) {
      const weight = design.points[i][2];
      const star = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createGlowTexture(1700 + c * 37 + i, design.tint),
          color: i % 3 === 0 ? mixHex(design.tint, COLORS.white, 0.28) : design.tint,
          transparent: true,
          opacity: 0.64,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      star.position.copy(points[i]);
      const starSize = 4.8 + weight * 3.4;
      star.scale.set(starSize, starSize, 1);
      designGroup.add(star);

      if (weight > 1.1) {
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: createGlowTexture(1900 + c * 41 + i, mixHex(design.tint, COLORS.white, 0.25)),
            color: design.tint,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        );
        halo.position.copy(points[i]);
        halo.scale.set(starSize * 3.4, starSize * 3.4, 1);
        designGroup.add(halo);
      }
    }

    const label = createConstellationLabel(design.name, design.tint);
    label.position.copy(constellationPatchPoint(centerA, centerU, 0, -1.85, radius));
    designGroup.add(label);
    group.add(designGroup);
  }

  return group;
}

function heartShape() {
  const shape = new THREE.Shape();
  for (let deg = 0; deg <= 360; deg += 8) {
    const t = THREE.MathUtils.degToRad(deg);
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    if (deg === 0) shape.moveTo(x / 16, y / 16);
    else shape.lineTo(x / 16, y / 16);
  }
  return shape;
}

function heartBoundary(t: number, size: number, scale = 1) {
  const x = (16 * Math.sin(t) ** 3) / 18;
  const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2) / 18;
  return new THREE.Vector2(x * size * scale, y * size * scale);
}

function makePuffedHeartGeometry(size: number, radialSegments = 22, angularSegments = 128, depthScale = 0.5) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const frontCenter = 0;
  const backCenter = 1;
  positions.push(0, 0, size * depthScale, 0, 0, -size * depthScale);
  uvs.push(0.5, 0.5, 0.5, 0.5);

  const front: number[][] = [];
  const back: number[][] = [];

  for (let r = 1; r <= radialSegments; r += 1) {
    const shell = r / radialSegments;
    const z = size * depthScale * Math.pow(Math.max(0, 1 - shell ** 1.72), 0.56);
    const frontRing: number[] = [];
    const backRing: number[] = [];
    for (let i = 0; i < angularSegments; i += 1) {
      const t = (i / angularSegments) * Math.PI * 2;
      const point = heartBoundary(t, size, shell);
      frontRing.push(positions.length / 3);
      positions.push(point.x, point.y, z);
      uvs.push(0.5 + point.x / (size * 2.4), 0.5 + point.y / (size * 2.4));
      backRing.push(positions.length / 3);
      positions.push(point.x, point.y, -z);
      uvs.push(0.5 + point.x / (size * 2.4), 0.5 + point.y / (size * 2.4));
    }
    front.push(frontRing);
    back.push(backRing);
  }

  for (let i = 0; i < angularSegments; i += 1) {
    const next = (i + 1) % angularSegments;
    indices.push(frontCenter, front[0][i], front[0][next]);
    indices.push(backCenter, back[0][next], back[0][i]);
  }

  for (let r = 1; r < radialSegments; r += 1) {
    const innerFront = front[r - 1];
    const outerFront = front[r];
    const innerBack = back[r - 1];
    const outerBack = back[r];
    for (let i = 0; i < angularSegments; i += 1) {
      const next = (i + 1) % angularSegments;
      indices.push(innerFront[i], outerFront[i], innerFront[next]);
      indices.push(innerFront[next], outerFront[i], outerFront[next]);
      indices.push(innerBack[next], outerBack[i], innerBack[i]);
      indices.push(outerBack[next], outerBack[i], innerBack[next]);
    }
  }

  const outerFront = front[radialSegments - 1];
  const outerBack = back[radialSegments - 1];
  for (let i = 0; i < angularSegments; i += 1) {
    const next = (i + 1) % angularSegments;
    indices.push(outerFront[i], outerBack[i], outerFront[next]);
    indices.push(outerFront[next], outerBack[i], outerBack[next]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeHeartMesh(tint: number, size: number) {
  const geometry = makePuffedHeartGeometry(size);
  const material = new THREE.MeshPhysicalMaterial({
    color: mixHex(tint, COLORS.white, 0.18),
    emissive: tint,
    emissiveIntensity: 0.36,
    metalness: 0.02,
    roughness: 0.18,
    transmission: 0.08,
    thickness: 1.1,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    side: THREE.DoubleSide
  });
  return new THREE.Mesh(geometry, material);
}

function makeParticleCloud(count: number, radius: number, tint: number, seed = 1, flatten = 0.62, size = 0.22) {
  const rand = seeded(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(tint);
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const u = rand() * 2 - 1;
    const r = radius * Math.cbrt(rand());
    positions[i * 3] = Math.cos(a) * Math.sqrt(1 - u * u) * r;
    positions[i * 3 + 1] = u * r * flatten;
    positions[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - u * u) * r;
    const c = base.clone().lerp(COLOR_WHITE, rand() * 0.7);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    })
  );
}

function makeHeartParticleField(count: number, size: number, tint: number, seed: number, particleSize = 0.18) {
  const rand = seeded(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(tint);
  for (let i = 0; i < count; i += 1) {
    const t = rand() * Math.PI * 2;
    const shell = Math.sqrt(rand());
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    positions[i * 3] = (x / 16) * size * shell + (rand() - 0.5) * size * 0.12;
    positions[i * 3 + 1] = (y / 16) * size * shell + (rand() - 0.5) * size * 0.12;
    positions[i * 3 + 2] = (rand() - 0.5) * size * 0.8;
    const c = base.clone().lerp(COLOR_WHITE, 0.25 + rand() * 0.55);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: particleSize,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    })
  );
}

function makeCinemaTextSprite(text: string, tint: number, width = 1024, height = 280) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const c = new THREE.Color(tint);
  ctx.clearRect(0, 0, width, height);
  ctx.font = `900 ${Math.floor(height * 0.46)}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = `#${c.getHexString()}`;
  ctx.shadowBlur = 42;
  ctx.lineWidth = 12;
  ctx.strokeStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, .78)`;
  ctx.strokeText(text, width / 2, height / 2);
  ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  sprite.scale.set(width / 34, height / 34, 1);
  return sprite;
}

function makeRadialRays(count: number, inner: number, outer: number, tint: number, seed: number, flatten = 1, opacity = 0.62) {
  const rand = seeded(seed);
  const positions: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.12;
    const start = inner + rand() * inner * 0.45;
    const end = outer * (0.55 + rand() * 0.55);
    positions.push(Math.cos(a) * start, Math.sin(a) * start * flatten, (rand() - 0.5) * inner * 0.3);
    positions.push(Math.cos(a) * end, Math.sin(a) * end * flatten, (rand() - 0.5) * outer * 0.08);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: tint,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
}

function makeLoopField(count: number, radius: number, tint: number, seed: number, opacity = 0.52) {
  const group = new THREE.Group();
  const rand = seeded(seed);
  for (let i = 0; i < count; i += 1) {
    const curve = new THREE.EllipseCurve(0, 0, radius * (0.72 + rand() * 0.72), radius * (0.2 + rand() * 0.55), 0, Math.PI * 2);
    const points = curve.getPoints(128).map((p) => new THREE.Vector3(p.x, p.y, (rand() - 0.5) * radius * 0.25));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: mixHex(tint, rand() > 0.5 ? COLORS.cyan : COLORS.white, rand() * 0.35),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    line.rotation.x = rand() * Math.PI;
    line.rotation.y = rand() * Math.PI;
    line.rotation.z = rand() * Math.PI;
    group.add(line);
  }
  return group;
}

function makeGlowSprite(tint: number, size: number, opacity: number) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(73, tint),
      color: tint,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  sprite.scale.set(size, size, 1);
  return sprite;
}

function makeSpiralArms(arms: number, pointsPerArm: number, radius: number, tint: number, seed: number, opacity = 0.68) {
  const group = new THREE.Group();
  const rand = seeded(seed);
  for (let arm = 0; arm < arms; arm += 1) {
    const pts: THREE.Vector3[] = [];
    const base = (arm / arms) * Math.PI * 2;
    for (let i = 0; i < pointsPerArm; i += 1) {
      const u = i / (pointsPerArm - 1);
      const r = radius * (0.12 + u * 0.95);
      const a = base + u * 4.3 + Math.sin(u * 8 + seed) * 0.08;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.38, (rand() - 0.5) * radius * 0.08));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: mixHex(tint, COLORS.white, rand() * 0.4),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    group.add(line);
  }
  return group;
}

function makeSoftGalaxyDisc(size: number, tint: number, seed: number) {
  return makeVolumetricGalaxyDisc(size, tint, seed, 5, 3600, 0.72);
}

function makeVolumetricGalaxyDisc(size: number, tint: number, seed: number, arms = 5, count = 3600, flatten = 0.66) {
  const group = new THREE.Group();
  const rand = seeded(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [tint, mixHex(tint, COLORS.white, 0.36), COLORS.softWhite, COLORS.cyan, COLORS.gold];
  for (let i = 0; i < count; i += 1) {
    const arm = i % arms;
    const u = Math.pow(rand(), 0.55);
    const r = size * (0.06 + u * (2.2 + rand() * 0.44));
    const a = (arm / arms) * Math.PI * 2 + u * 5.2 + (rand() - 0.5) * (0.36 + u * 0.25);
    const width = size * (0.035 + u * 0.09);
    positions[i * 3] = Math.cos(a) * r + (rand() - 0.5) * width;
    positions[i * 3 + 1] = Math.sin(a) * r * flatten + (rand() - 0.5) * width * 0.62;
    positions[i * 3 + 2] = (rand() - 0.5) * size * (0.08 + u * 0.16);
    const c = new THREE.Color(palette[Math.floor(rand() * palette.length)]).multiplyScalar(0.5 + rand() * 0.95);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  group.add(makeGlowSprite(tint, size * 7.4, 0.18), makeGlowSprite(COLORS.softWhite, size * 2.6, 0.1));
  group.add(
    new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: Math.max(0.08, size * 0.012),
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
  );
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.18, 42, 18),
    new THREE.MeshBasicMaterial({ color: mixHex(tint, COLORS.white, 0.55), transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  group.add(core);
  return group;
}

function makeParticleTidalBridge(size: number, leftTint: number, rightTint: number, seed: number, count = 2200) {
  const rand = seeded(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const u = rand();
    const sideBias = Math.sin(u * Math.PI);
    const x = THREE.MathUtils.lerp(-size * 1.75, size * 1.75, u) + (rand() - 0.5) * size * 0.16;
    const y = Math.sin(u * Math.PI * 1.08) * size * 0.42 + (rand() - 0.5) * size * (0.2 + sideBias * 0.3);
    const z = (rand() - 0.5) * size * (0.12 + sideBias * 0.24);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const c = new THREE.Color(leftTint).lerp(new THREE.Color(rightTint), u).lerp(COLOR_WHITE, rand() * 0.2).multiplyScalar(0.6 + rand() * 0.8);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: Math.max(0.08, size * 0.012),
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
}

function makeMergedGalaxyRemnant(size: number, tint: number, seed: number) {
  const group = new THREE.Group();
  const rand = seeded(seed + 80);
  const warm = mixHex(tint, COLORS.gold, 0.42);
  const pearl = mixHex(COLORS.softWhite, warm, 0.28);
  const disc = makeVolumetricGalaxyDisc(size * 1.62, warm, seed + 1, 8, 9800, 0.36);
  disc.scale.set(1.72, 0.62, 0.5);
  const blueVeil = makeVolumetricGalaxyDisc(size * 1.18, mixHex(tint, COLORS.cyan, 0.34), seed + 2, 6, 5200, 0.28);
  blueVeil.rotation.z = 0.46;
  blueVeil.scale.set(1.28, 0.46, 0.42);
  const halo = makeVolumetricGalaxyDisc(size * 1.96, pearl, seed + 5, 10, 6200, 0.24);
  halo.rotation.z = -0.12;
  halo.scale.set(1.92, 0.34, 0.34);
  group.add(makeGlowSprite(warm, size * 14.5, 0.21), makeGlowSprite(COLORS.softWhite, size * 5.2, 0.11), disc, blueVeil, halo);
  for (let i = 0; i < 7; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(size * (0.52 + i * 0.24), Math.max(0.018, size * 0.004), 8, 160),
      new THREE.MeshBasicMaterial({
        color: i % 2 ? pearl : warm,
        transparent: true,
        opacity: 0.18 - i * 0.014,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    ring.scale.set(2.45 + i * 0.08, 0.38 + i * 0.02, 0.22);
    ring.rotation.z = i * 0.13 + rand() * 0.1;
    group.add(ring);
  }
  const northTail = makeParticleTidalBridge(size * 2.7, COLORS.cyan, COLORS.gold, seed + 3, 3900);
  northTail.rotation.z = 0.18;
  northTail.scale.y = 0.72;
  const southTail = makeParticleTidalBridge(size * 2.45, COLORS.gold, COLORS.cyan, seed + 4, 3200);
  southTail.rotation.z = Math.PI + 0.42;
  southTail.scale.y = 0.5;
  group.add(northTail, southTail);
  return group;
}

function makeSmoothTidalBridge(size: number, leftTint: number, rightTint: number, seed: number) {
  const group = new THREE.Group();
  const rand = seeded(seed);
  for (let stream = 0; stream < 32; stream += 1) {
    const pts: THREE.Vector3[] = [];
    const offset = (stream - 15.5) / 15.5;
    const arch = (rand() - 0.5) * size * 0.42;
    for (let i = 0; i < 86; i += 1) {
      const u = i / 85;
      const x = THREE.MathUtils.lerp(-size * 1.55, size * 1.55, u);
      const y = Math.sin(u * Math.PI) * (size * 0.3 + arch) + offset * size * 0.2 * Math.sin(u * Math.PI * 0.85);
      const z = (offset * size * 0.18) + Math.sin(u * Math.PI * 2 + stream) * size * 0.035;
      pts.push(new THREE.Vector3(x, y, z));
    }
    const tint = mixHex(leftTint, rightTint, stream / 31);
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: mixHex(tint, COLORS.white, 0.22 + rand() * 0.22),
          transparent: true,
          opacity: 0.22 + rand() * 0.22,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      )
    );
  }
  return group;
}

function makeElegantGalaxyPair(size: number, leftTint: number, rightTint: number, seed: number) {
  const group = new THREE.Group();
  const left = makeSoftGalaxyDisc(size * 1.08, leftTint, seed + 1);
  const right = makeSoftGalaxyDisc(size * 1.02, rightTint, seed + 2);
  left.position.set(-size * 1.55, size * 0.18, 0);
  right.position.set(size * 1.55, -size * 0.14, 0);
  left.rotation.z = -0.48;
  right.rotation.z = 0.56;
  group.add(makeGlowSprite(mixHex(leftTint, rightTint, 0.5), size * 7.2, 0.18));
  group.add(left, right, makeParticleTidalBridge(size * 1.42, leftTint, rightTint, seed + 3, 2600));
  group.add(makeParticleCloud(1900, size * 3.8, mixHex(leftTint, rightTint, 0.55), seed + 4, 0.22, size * 0.006));
  return group;
}

function makeDiamondShardField(count: number, radius: number, tint: number, seed: number, scale = 0.28) {
  const group = new THREE.Group();
  const rand = seeded(seed);
  const geometry = new THREE.OctahedronGeometry(1, 0);
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = radius * Math.sqrt(rand());
    const shard = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: mixHex(tint, COLORS.white, 0.55 + rand() * 0.3),
        emissive: tint,
        emissiveIntensity: 0.08,
        roughness: 0.06,
        metalness: 0,
        transmission: 0.35,
        thickness: 0.45,
        transparent: true,
        opacity: 0.78
      })
    );
    shard.position.set(Math.cos(a) * r, (rand() - 0.5) * radius * 1.4, Math.sin(a) * r * 0.48);
    shard.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    shard.scale.setScalar(scale * (0.55 + rand() * 1.8));
    group.add(shard);
  }
  return group;
}

function makeAtmosphereMaterial(tint: number, opacity = 0.42) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      color: { value: new THREE.Color(tint) },
      opacity: { value: opacity }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      uniform vec3 color;
      uniform float opacity;
      void main() {
        float rim = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
        gl_FragColor = vec4(color, rim * opacity);
      }
    `
  });
}

function makeStarSurfaceMaterial(tint: number, seed: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      base: { value: new THREE.Color(tint) },
      hot: { value: new THREE.Color(mixHex(tint, COLORS.white, 0.72)) },
      seed: { value: seed * 0.017 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vView;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vPos = position;
        vView = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vPos;
      varying vec3 vView;
      uniform vec3 base;
      uniform vec3 hot;
      uniform float seed;
      float waves(vec3 p) {
        return sin(p.x * 4.7 + seed) * .34 +
               sin(p.y * 8.2 - seed * .7) * .22 +
               sin((p.x + p.z) * 11.0 + seed * 1.8) * .18;
      }
      void main() {
        float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 1.85);
        float cellular = .5 + waves(normalize(vPos)) * .5;
        vec3 col = mix(base * .72, hot, .40 + cellular * .38);
        col += base * rim * .55;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
}

function makeNebulaBackdrop() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(3100, 48, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        time: { value: 0 }
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform float time;
        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }
        float noise(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float n = mix(
            mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z
          );
          return n;
        }
        void main() {
          vec3 p = normalize(vPos);
          float equator = exp(-abs(p.y) * 3.6);
          float n1 = noise(p * 3.0 + time * .015);
          float n2 = noise(p * 7.0 - time * .01);
          float veil = smoothstep(.72, 1.34, n1 * .52 + n2 * .30 + equator * .38);
          vec3 deep = vec3(.001, .003, .012);
          vec3 blue = vec3(.018, .072, .16);
          vec3 rose = vec3(.15, .025, .105);
          vec3 amber = vec3(.10, .055, .015);
          vec3 col = deep;
          col += blue * veil * (.22 + equator * .55);
          col += rose * smoothstep(.74, 1.16, n2 + equator * .22) * .18;
          col += amber * smoothstep(.80, 1.18, n1 + p.x * .16) * .07;
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
  );
}

export class UniverseRenderer {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.03, 5200);
  private universeRoot = new THREE.Group();
  private remoteRoot = new THREE.Group();
  private entityGroups = new Map<string, THREE.Group>();
  private remoteGroups = new Map<string, THREE.Group>();
  private combatTrailGroups = new Map<string, THREE.Group>();
  private damageSprites = new Map<string, THREE.Sprite>();
  private warpEchoes: Array<{ root: THREE.Group; world: Vec3; age: number; ttl: number }> = [];
  private version = -1;
  private backdrop = makeNebulaBackdrop();
  private starLayers: THREE.Points[] = [];
  private constellations = makeConstellations();
  private localShip: THREE.Group;
  private localShipTint: number = COLORS.cyan;
  private clock = new THREE.Clock();
  private cinematic = new CinematicDirector();
  private warp = new WarpTunnel();
  private glowCache = new Map<number, THREE.Texture>();
  private planetTextureCache = new Map<string, THREE.Texture>();
  private ringTextureCache = new Map<string, THREE.Texture>();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
      preserveDrawingBuffer: window.location.search.includes('qaCapture')
    });
    this.renderer.setPixelRatio(window.location.search.includes('qaCapture') ? 1 : Math.min(window.devicePixelRatio, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.84;

    this.scene.background = new THREE.Color(0x00020a);
    this.scene.fog = new THREE.FogExp2(0x020414, 0.00125);
    this.scene.add(this.backdrop);
    this.starLayers = [this.makeBackgroundStars(12000, 0.62, 0.9, 890), this.makeBackgroundStars(1800, 0.9, 2.1, 1880, true)];
    this.starLayers.forEach((layer) => this.scene.add(layer));
    this.scene.add(this.constellations);
    this.localShip = this.makeCameraShip(COLORS.cyan);
    this.camera.add(this.localShip);
    this.scene.add(this.camera);
    this.scene.add(this.universeRoot, this.remoteRoot, this.cinematic.root, this.warp.root);

    this.scene.add(new THREE.HemisphereLight(0x9ab8ff, 0x160816, 0.78));
    const key = new THREE.DirectionalLight(0xdde9ff, 2.6);
    key.position.set(-0.7, 0.42, 0.6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xff7ccf, 0.5);
    fill.position.set(0.8, -0.25, -0.3);
    this.scene.add(fill);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.56, 0.52, 0.28);
    this.composer.addPass(this.bloom);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  render(state: GameState, dt: number) {
    if (state.version !== this.version) this.rebuild(state);

    const elapsed = this.clock.getElapsedTime();
    this.ensureLocalShipTint(state.player.shipColor);
    const backdropMaterial = this.backdrop.material as THREE.ShaderMaterial;
    backdropMaterial.uniforms.time.value = elapsed;

    if (state.cutscene.active || state.specialScene.active) {
      this.universeRoot.visible = false;
      this.remoteRoot.visible = false;
      this.starLayers.forEach((layer) => (layer.visible = true));
      this.constellations.visible = true;
      this.warp.root.visible = false;
      this.cinematic.root.visible = true;
      this.localShip.visible = false;
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(0, 0, 1);
      this.cinematic.update(state, dt);
      this.composer.render();
      return;
    }

    const inWarpTunnel = state.warp.active && state.warp.phase === 'jump';
    if (inWarpTunnel) {
      this.universeRoot.visible = false;
      this.remoteRoot.visible = false;
      this.starLayers.forEach((layer) => (layer.visible = false));
      this.constellations.visible = false;
      this.cinematic.root.visible = false;
      this.warp.root.visible = true;
      this.warp.root.quaternion.identity();
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(0, 0, 1);
      this.warp.update(state, dt);
      this.updateCameraShip(state, elapsed);
      this.composer.render();
      return;
    }

    this.cinematic.root.visible = false;
    this.warp.root.visible = state.warp.active && state.warp.phase === 'exit';
    this.universeRoot.visible = true;
    this.remoteRoot.visible = true;
    this.starLayers.forEach((layer) => (layer.visible = true));
    this.constellations.visible = true;

    const f = this.viewForward(state);
    const viewYaw = state.player.yaw + state.player.cameraYawOffset;
    const viewPitch = THREE.MathUtils.clamp(state.player.pitch + state.player.cameraPitchOffset, -1.32, 1.32);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(f.x, f.y, f.z);
    if (this.warp.root.visible) {
      this.warp.root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(f.x, f.y, f.z).normalize());
    }
    this.updateCameraShip(state, elapsed);
    this.backdrop.rotation.y = viewYaw * 0.08 + elapsed * 0.003;
    this.backdrop.rotation.x = -viewPitch * 0.05;
    this.constellations.rotation.y = viewYaw * 0.045 + elapsed * 0.001;
    this.constellations.rotation.x = -viewPitch * 0.025;
    this.updateConstellationRegions(state);

    this.starLayers.forEach((layer, i) => {
      layer.rotation.y = viewYaw * (0.06 + i * 0.03) + elapsed * (0.002 + i * 0.001);
      layer.rotation.x = -viewPitch * (0.04 + i * 0.02);
    });

    for (const target of state.allTrackable()) {
      const group = this.entityGroups.get(target.id);
      if (!group) continue;
      const rel = subVec(target.position, state.player.position);
      const d = distance(state.player.position, target.position);
      const planetViewDistance = !isEvent(target) && PLANET_SET.has(target.kind) ? Math.min(state.renderDistance, 34000) : state.renderDistance;
      const farBeacon =
        !isEvent(target) &&
        ['Star System', 'Galaxy', 'Galaxy Pair'].includes(target.kind) &&
        d >= planetViewDistance &&
        d < state.renderDistance * 4.6;
      group.visible = d < planetViewDistance || farBeacon || target === state.trackedTarget || target === state.selectedTarget;
      group.position.set(rel.x * RENDER_SCALE, rel.y * RENDER_SCALE, rel.z * RENDER_SCALE);

      const spinRate = (group.userData.spinRate as number | undefined) ?? 0.1;
      const naturalRoot = group.userData.naturalRoot as THREE.Object3D | undefined;
      if (naturalRoot) naturalRoot.rotation.y += dt * spinRate;
      if (isEvent(target) && !target.kind.includes('Black Hole') && target.kind !== 'Quasar' && target.kind !== 'Tidal Disruption') group.rotation.y += dt * 0.18;

      const distantBeacon = group.userData.distantBeacon as THREE.Object3D | undefined;
      if (distantBeacon) {
        distantBeacon.visible = farBeacon;
        const fade = THREE.MathUtils.clamp(1 - (d - planetViewDistance) / Math.max(1, state.renderDistance * 3.6), 0.12, 0.82);
        distantBeacon.scale.setScalar((target.kind === 'Star System' ? 7.5 : 13) * fade);
      }

      const label = group.userData.label as THREE.Object3D | undefined;
      if (label) {
        label.visible = !farBeacon && (d < 90000 || target === state.trackedTarget || target === state.selectedTarget);
      }

      const trackRing = group.userData.trackRing as THREE.Object3D | undefined;
      if (trackRing) {
        trackRing.visible = target === state.trackedTarget;
        trackRing.rotation.z -= dt * 1.4;
      }
      const pulseRoot = group.userData.pulseRoot as THREE.Object3D | undefined;
      if (pulseRoot) {
        const pulse = 1 + Math.sin(elapsed * 2.2 + target.id.length) * 0.05;
        pulseRoot.scale.setScalar(pulse * (isEvent(target) && target.phase === 'aftermath' ? 1.25 : 1));
      }
      this.animateProcedural(group, dt);
    }

    this.syncRemotePlayers(state, elapsed, dt);
    this.updateWarpEchoes(state, dt);
    this.syncCombatEffects(state);
    if (state.warp.active && state.warp.phase === 'exit') {
      this.warp.update(state, dt);
    }

    this.composer.render();
  }

  private resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
  }

  private updateConstellationRegions(state: GameState) {
    const count = Math.max(1, this.constellations.children.length);
    const angle = (Math.atan2(state.player.position.z, state.player.position.x) + Math.PI * 2) % (Math.PI * 2);
    const active = Math.floor((angle / (Math.PI * 2)) * count) % count;
    this.constellations.children.forEach((child, index) => {
      const diff = Math.min(Math.abs(index - active), count - Math.abs(index - active));
      child.visible = diff <= 1;
    });
  }

  private ensureLocalShipTint(tint: number) {
    if (this.localShipTint === tint) return;
    this.localShip.removeFromParent();
    this.localShip = this.makeCameraShip(tint);
    this.localShipTint = tint;
    this.camera.add(this.localShip);
  }

  private viewForward(state: GameState) {
    const yaw = state.player.yaw + state.player.cameraYawOffset;
    const pitch = THREE.MathUtils.clamp(state.player.pitch + state.player.cameraPitchOffset, -1.32, 1.32);
    const cp = Math.cos(pitch);
    return {
      x: Math.sin(yaw) * cp,
      y: Math.sin(pitch),
      z: Math.cos(yaw) * cp
    };
  }

  private updateCameraShip(state: GameState, elapsed: number) {
    this.localShip.visible = !state.cutscene.active && !state.specialScene.active;
    if (!this.localShip.visible) return;

    const phase = state.warp.phase;
    const align = phase === 'align' ? smoothstep(state.warp.timer / WARP_ALIGN_DURATION) : 0;
    const charge = phase === 'charge' ? smoothstep(state.warp.timer / WARP_CHARGE_DURATION) : 0;
    const jump = phase === 'jump' ? smoothstep(state.warp.timer / Math.max(WARP_DURATION, state.warp.duration)) : 0;
    const exit = phase === 'exit' ? smoothstep(state.warp.timer / WARP_EXIT_DURATION) : 0;
    const floating = !state.warp.active;
    const alignSpin = phase === 'align' ? (1 - align) * Math.PI * 4.4 : 0;
    const alignBank = phase === 'align' ? Math.sin(align * Math.PI) * 0.76 : 0;
    const topView = 1.08;

    this.localShip.position.set(
      Math.sin(elapsed * 1.35) * (floating ? 0.028 : 0.01),
      -1.02 - topView * 0.2 + Math.sin(elapsed * 1.9) * (floating ? 0.026 : 0.01) + exit * 0.18,
      -5.9 - topView * 0.38 - charge * 0.46 - jump * 1.12 + exit * 0.94
    );
    this.localShip.rotation.set(
      0.58 - charge * 0.08 + exit * 0.06 + alignBank * 0.08,
      Math.sin(elapsed * 1.2) * 0.018 * (floating ? 1 : 0.25) + alignBank * 0.26,
      Math.sin(elapsed * 2.1) * 0.035 * (floating ? 1 : 0.18) + alignSpin
    );

    const engine = this.localShip.userData.engine as THREE.Sprite | undefined;
    if (engine) {
      const pulse = 1 + Math.sin(elapsed * 10.5) * 0.12;
      const alignHeat = phase === 'align' ? 0.42 * align : 0;
      engine.scale.setScalar((1.18 + alignHeat + charge * 3.8 + jump * 1.6 - exit * 1.2) * pulse);
      (engine.material as THREE.SpriteMaterial).opacity = state.warp.active ? 0.52 + alignHeat * 0.18 + charge * 0.34 : 0.5;
    }
    const aura = this.localShip.userData.aura as THREE.Sprite | undefined;
    if (aura) {
      aura.scale.setScalar(2.2 + align * 0.8 + charge * 6.2 + jump * 2.8);
      (aura.material as THREE.SpriteMaterial).opacity = state.warp.active ? 0.12 + align * 0.07 + charge * 0.28 : 0.08;
    }
  }

  private animateProcedural(root: THREE.Object3D, dt: number) {
    root.traverse((child) => {
      const spinZ = child.userData.spinZ as number | undefined;
      if (spinZ) child.rotation.z += dt * spinZ;
      const spinY = child.userData.spinY as number | undefined;
      if (spinY) child.rotation.y += dt * spinY;
      const breathe = child.userData.breathe as number | undefined;
      if (breathe) {
        const s = 1 + Math.sin(performance.now() * 0.0018 + child.id * 0.37) * breathe;
        child.scale.x = s;
        child.scale.z = s;
      }
    });
  }

  private makeCameraShip(tint: number) {
    const group = new THREE.Group();
    group.userData.tint = tint;
    const hullMaterial = new THREE.MeshStandardMaterial({
      color: mixHex(COLORS.white, tint, 0.12),
      roughness: 0.14,
      metalness: 0.68,
      emissive: new THREE.Color(tint),
      emissiveIntensity: 0.12
    });
    const underMaterial = new THREE.MeshStandardMaterial({
      color: mixHex(0x24324e, tint, 0.22),
      roughness: 0.2,
      metalness: 0.62,
      emissive: new THREE.Color(tint),
      emissiveIntensity: 0.1
    });
    const top = 0.05;
    const bottom = -0.08;
    const verts = [
      0, top, -1.95,
      -1.62, top, 0.18,
      -0.52, top, 0.92,
      0.52, top, 0.92,
      1.62, top, 0.18,
      0, bottom, -1.72,
      -1.38, bottom, 0.14,
      -0.44, bottom, 0.78,
      0.44, bottom, 0.78,
      1.38, bottom, 0.14
    ];
    const indices = [
      0, 1, 2, 0, 2, 3, 0, 3, 4,
      5, 7, 6, 5, 8, 7, 5, 9, 8,
      0, 5, 6, 0, 6, 1,
      1, 6, 7, 1, 7, 2,
      2, 7, 8, 2, 8, 3,
      3, 8, 9, 3, 9, 4,
      4, 9, 5, 4, 5, 0
    ];
    const hullGeometry = new THREE.BufferGeometry();
    hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    hullGeometry.setIndex(indices);
    hullGeometry.computeVertexNormals();
    const hull = new THREE.Mesh(
      hullGeometry,
      hullMaterial
    );

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.48, 1.42, 36, 1, false),
      underMaterial
    );
    body.rotation.x = Math.PI / 2;
    body.scale.y = 0.54;
    body.position.set(0, 0.26, -0.04);

    const finGeometry = new THREE.BufferGeometry();
    finGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.18, 0.14, 0.44,
          0.18, 0.14, 0.44,
          0, 0.92, 0.58,
          -0.18, 0.14, 0.86,
          0.18, 0.14, 0.86,
          0, 0.92, 0.58
        ],
        3
      )
    );
    finGeometry.setIndex([0, 1, 2, 3, 5, 4, 0, 2, 3, 1, 4, 5]);
    finGeometry.computeVertexNormals();
    const tailFin = new THREE.Mesh(finGeometry, underMaterial);

    const bevel = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.055, 0.2),
      new THREE.MeshStandardMaterial({
        color: mixHex(tint, COLORS.white, 0.45),
        roughness: 0.16,
        metalness: 0.6,
        emissive: new THREE.Color(tint),
        emissiveIntensity: 0.18
      })
    );
    bevel.position.set(0, 0.12, 0.76);

    const noseGlow = this.spriteGlow(mixHex(tint, COLORS.white, 0.44), 0.9, 0.18);
    noseGlow.position.set(0, 0.08, -1.78);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 32, 16),
      new THREE.MeshStandardMaterial({
        color: COLORS.softWhite,
        roughness: 0.06,
        metalness: 0.1,
        emissive: new THREE.Color(tint),
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.9
      })
    );
    canopy.scale.set(1.22, 0.26, 0.62);
    canopy.position.set(0, 0.15, -0.52);

    const cockpitBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.42, 0.08, 36),
      new THREE.MeshStandardMaterial({
        color: mixHex(0x10182b, tint, 0.28),
        roughness: 0.16,
        metalness: 0.72,
        emissive: new THREE.Color(tint),
        emissiveIntensity: 0.14
      })
    );
    cockpitBase.scale.set(1.28, 1, 0.62);
    cockpitBase.rotation.x = Math.PI / 2;
    cockpitBase.position.set(0, 0.08, -0.52);

    const railGeometry = new THREE.BufferGeometry();
    railGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.98, 0.09, -0.02, -1.36, 0.08, 0.2,
          0.98, 0.09, -0.02, 1.36, 0.08, 0.2,
          -0.42, 0.1, 0.82, -0.74, 0.1, 1.02,
          0.42, 0.1, 0.82, 0.74, 0.1, 1.02
        ],
        3
      )
    );
    const rails = new THREE.LineSegments(
      railGeometry,
      new THREE.LineBasicMaterial({
        color: mixHex(tint, COLORS.white, 0.44),
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    const engine = this.spriteGlow(tint, 1.35, 0.52);
    engine.position.set(0, 0.12, 1.1);
    group.userData.engine = engine;
    const enginePodMaterial = new THREE.MeshStandardMaterial({
      color: mixHex(0x17223b, tint, 0.2),
      roughness: 0.18,
      metalness: 0.72,
      emissive: new THREE.Color(tint),
      emissiveIntensity: 0.12
    });
    const leftPod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.46, 24), enginePodMaterial);
    leftPod.rotation.x = Math.PI / 2;
    leftPod.position.set(-0.46, 0.08, 0.92);
    const rightPod = leftPod.clone();
    rightPod.position.x = 0.46;
    const turretMaterial = new THREE.MeshStandardMaterial({
      color: mixHex(0x090d18, tint, 0.26),
      roughness: 0.18,
      metalness: 0.82,
      emissive: new THREE.Color(tint),
      emissiveIntensity: 0.16
    });
    const turretBarrelMaterial = new THREE.MeshBasicMaterial({
      color: mixHex(tint, COLORS.white, 0.64),
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending
    });
    const leftTurret = new THREE.Group();
    const leftTurretBase = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 10), turretMaterial);
    leftTurretBase.scale.set(1.15, 0.55, 0.8);
    const leftBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.034, 0.48, 10), turretBarrelMaterial);
    leftBarrel.rotation.x = Math.PI / 2;
    leftBarrel.position.z = -0.2;
    leftTurret.add(leftTurretBase, leftBarrel);
    leftTurret.position.set(-0.55, -0.08, -0.22);
    const rightTurret = leftTurret.clone();
    rightTurret.position.x = 0.55;
    const engineLeft = this.spriteGlow(tint, 0.78, 0.42);
    engineLeft.position.set(-0.46, 0.08, 1.1);
    const engineRight = this.spriteGlow(tint, 0.78, 0.42);
    engineRight.position.set(0.46, 0.08, 1.1);
    const aura = this.spriteGlow(tint, 2.9, 0.08);
    aura.position.set(0, 0.08, 0.9);
    group.userData.aura = aura;
    group.add(aura, engine, engineLeft, engineRight, leftPod, rightPod, leftTurret, rightTurret, noseGlow, hull, body, tailFin, bevel, cockpitBase, canopy, rails);
    group.scale.setScalar(0.82);
    return group;
  }

  private makeWarpEcho(direction: Vec3, tint: number, seed: number) {
    const group = new THREE.Group();
    const rand = seeded(seed);
    const dir = new THREE.Vector3(direction.x, direction.y, direction.z);
    if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    if (side.lengthSq() < 0.001) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    const positions: number[] = [];
    for (let i = 0; i < 78; i += 1) {
      const spread = 0.35 + rand() * 4.6;
      const theta = rand() * Math.PI * 2;
      const offset = side.clone().multiplyScalar(Math.cos(theta) * spread).add(up.clone().multiplyScalar(Math.sin(theta) * spread * 0.55));
      const len = 3.5 + rand() * 18;
      const start = offset.clone().add(dir.clone().multiplyScalar(-len * (0.18 + rand() * 0.22)));
      const end = offset.clone().add(dir.clone().multiplyScalar(len));
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    group.add(
      new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: mixHex(tint, COLORS.white, 0.72),
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending
        })
      )
    );
    group.add(this.spriteGlow(mixHex(tint, COLORS.white, 0.55), 5.4, 0.18));
    return group;
  }

  private spawnWarpEcho(world: Vec3, direction: Vec3, tint: number, ttl = 1.55) {
    const seed = Math.floor(Math.abs(world.x * 0.11 + world.y * 0.17 + world.z * 0.23)) % 1000000;
    const root = this.makeWarpEcho(direction, tint, seed);
    root.userData.baseScale = root.scale.clone();
    this.remoteRoot.add(root);
    this.warpEchoes.push({ root, world: { ...world }, age: 0, ttl });
  }

  private updateWarpEchoes(state: GameState, dt: number) {
    for (let i = this.warpEchoes.length - 1; i >= 0; i -= 1) {
      const echo = this.warpEchoes[i];
      echo.age += dt;
      const t = echo.age / echo.ttl;
      if (t >= 1) {
        echo.root.removeFromParent();
        this.warpEchoes.splice(i, 1);
        continue;
      }
      const rel = subVec(echo.world, state.player.position);
      echo.root.position.set(rel.x * RENDER_SCALE, rel.y * RENDER_SCALE, rel.z * RENDER_SCALE);
      const alpha = 1 - smoothstep(t);
      echo.root.scale.setScalar(0.85 + t * 1.65);
      echo.root.traverse((child) => {
        const material = (child as THREE.LineSegments | THREE.Sprite).material as THREE.Material & { opacity?: number };
        if (material && typeof material.opacity === 'number') material.opacity = alpha * (child instanceof THREE.Sprite ? 0.18 : 0.72);
      });
    }
  }

  private makeCombatTrailGroup(origin: Vec3, end: Vec3, tint: number, hit: boolean) {
    const group = new THREE.Group();
    const delta = subVec(end, origin);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, delta.x * RENDER_SCALE, delta.y * RENDER_SCALE, delta.z * RENDER_SCALE], 3)
    );
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: mixHex(tint, COLORS.white, 0.42),
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    const core = new THREE.Line(
      geometry.clone(),
      new THREE.LineBasicMaterial({
        color: COLORS.white,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    group.add(line, core);
    const muzzle = this.spriteGlow(tint, 1.9, 0.28);
    const impact = this.spriteGlow(hit ? COLORS.gold : tint, hit ? 3.2 : 1.5, hit ? 0.38 : 0.18);
    impact.position.set(delta.x * RENDER_SCALE, delta.y * RENDER_SCALE, delta.z * RENDER_SCALE);
    group.add(muzzle, impact);
    return group;
  }

  private makeDamageSprite(text: string, tint: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const c = new THREE.Color(tint);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '900 42px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = `#${c.getHexString()}`;
    ctx.shadowBlur = 22;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,.72)';
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = `#${c.getHexString()}`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false
      })
    );
    sprite.scale.set(4.2, 1.9, 1);
    return sprite;
  }

  private syncCombatEffects(state: GameState) {
    const trailIds = new Set(state.combat.trails.map((trail) => trail.id));
    for (const [id, group] of this.combatTrailGroups) {
      if (!trailIds.has(id)) {
        group.removeFromParent();
        this.combatTrailGroups.delete(id);
      }
    }
    for (const trail of state.combat.trails) {
      let group = this.combatTrailGroups.get(trail.id);
      if (!group) {
        group = this.makeCombatTrailGroup(trail.origin, trail.end, trail.color, trail.hit);
        this.combatTrailGroups.set(trail.id, group);
        this.remoteRoot.add(group);
      }
      const rel = subVec(trail.origin, state.player.position);
      const fade = 1 - smoothstep(trail.age / Math.max(0.01, trail.ttl));
      group.position.set(rel.x * RENDER_SCALE, rel.y * RENDER_SCALE, rel.z * RENDER_SCALE);
      group.traverse((child) => {
        const material = (child as THREE.Line | THREE.Sprite).material as THREE.Material & { opacity?: number };
        if (material && typeof material.opacity === 'number') material.opacity = fade * (child instanceof THREE.Sprite ? 0.42 : 0.92);
      });
    }

    const damageIds = new Set(state.combat.damageNumbers.map((item) => item.id));
    for (const [id, sprite] of this.damageSprites) {
      if (!damageIds.has(id)) {
        sprite.removeFromParent();
        this.damageSprites.delete(id);
      }
    }
    for (const item of state.combat.damageNumbers) {
      let sprite = this.damageSprites.get(item.id);
      if (!sprite) {
        sprite = this.makeDamageSprite(item.text, item.color);
        this.damageSprites.set(item.id, sprite);
        this.remoteRoot.add(sprite);
      }
      const rel = subVec(item.position, state.player.position);
      const fade = 1 - smoothstep(item.age / Math.max(0.01, item.ttl));
      sprite.position.set(rel.x * RENDER_SCALE, rel.y * RENDER_SCALE + item.age * 0.18, rel.z * RENDER_SCALE);
      sprite.scale.setScalar(1 + item.age * 0.35);
      (sprite.material as THREE.SpriteMaterial).opacity = fade;
    }
  }

  private rebuild(state: GameState) {
    this.version = state.version;
    this.entityGroups.clear();
    this.universeRoot.clear();
    for (const obj of state.objects) {
      const group = this.buildObject(obj);
      this.entityGroups.set(obj.id, group);
      this.universeRoot.add(group);
    }
    for (const event of state.events) {
      const group = this.buildEvent(event);
      this.entityGroups.set(event.id, group);
      this.universeRoot.add(group);
    }
  }

  private syncRemotePlayers(state: GameState, elapsed: number, dt: number) {
    const activeIds = new Set(state.remotePlayers.keys());
    for (const [id, group] of this.remoteGroups) {
      if (!activeIds.has(id)) {
        group.removeFromParent();
        this.remoteGroups.delete(id);
      }
    }

    for (const pilot of state.remotePlayers.values()) {
      let group = this.remoteGroups.get(pilot.id);
      if (group && group.userData.tint !== (pilot.color || COLORS.cyan)) {
        group.removeFromParent();
        this.remoteGroups.delete(pilot.id);
        group = undefined;
      }
      if (!group) {
        group = this.makeRemoteShip(pilot);
        this.remoteGroups.set(pilot.id, group);
        this.remoteRoot.add(group);
      }

      const lastWorld = group.userData.lastWorld as Vec3 | undefined;
      const lastPhase = (group.userData.lastWarpPhase as string | undefined) ?? 'idle';
      const pilotPhase = pilot.warpPhase ?? 'idle';
      if (lastWorld) {
        const delta = subVec(pilot.position, lastWorld);
        const jumpDistance = distance(pilot.position, lastWorld);
        if (jumpDistance > 2600 && lastPhase === 'idle' && pilotPhase === 'idle') {
          this.spawnWarpEcho(lastWorld, delta, pilot.color || COLORS.cyan, 1.65);
          this.spawnWarpEcho(pilot.position, delta, pilot.color || COLORS.cyan, 1.95);
        }
      }
      group.userData.lastWorld = { ...pilot.position };

      const rel = subVec(pilot.position, state.player.position);
      const d = distance(state.player.position, pilot.position);
      group.visible = d < state.renderDistance;
      const pilotForward = {
        x: Math.sin(pilot.yaw) * Math.cos(pilot.pitch),
        y: Math.sin(pilot.pitch),
        z: Math.cos(pilot.yaw) * Math.cos(pilot.pitch)
      };
      if (pilotPhase === 'jump' && lastPhase !== 'jump') {
        this.spawnWarpEcho(pilot.position, pilotForward, pilot.color || COLORS.cyan, 2.35);
      }
      if (pilotPhase === 'exit' && lastPhase !== 'exit') {
        this.spawnWarpEcho(pilot.position, pilotForward, pilot.color || COLORS.cyan, 2.75);
      }
      const echoTimer = ((group.userData.echoTimer as number | undefined) ?? 0) - dt;
      if (pilotPhase === 'jump' || pilotPhase === 'exit') {
        if (echoTimer <= 0) {
          this.spawnWarpEcho(pilot.position, pilotForward, pilot.color || COLORS.cyan, pilotPhase === 'exit' ? 2.55 : 1.55);
          group.userData.echoTimer = pilotPhase === 'exit' ? 0.22 : 0.34;
        } else {
          group.userData.echoTimer = echoTimer;
        }
      } else {
        group.userData.echoTimer = 0;
      }
      group.userData.lastWarpPhase = pilotPhase;

      const targetPosition = new THREE.Vector3(rel.x * RENDER_SCALE, rel.y * RENDER_SCALE, rel.z * RENDER_SCALE);
      group.position.copy(targetPosition);
      group.rotation.set(pilot.pitch * 0.45, pilot.yaw + Math.PI, 0);
      group.scale.setScalar(0.52);
      const engine = group.userData.engine as THREE.Sprite | undefined;
      if (engine) {
        const pulse = 1 + Math.sin(elapsed * 9.5) * 0.16;
        engine.scale.setScalar(pulse);
      }
      const label = group.userData.label as THREE.Object3D | undefined;
      if (label) {
        label.visible = d < 26000;
        label.position.y = 2.25;
      }
    }
  }

  private makeRemoteShip(pilot: RemotePlayerState) {
    const tint = pilot.color || COLORS.cyan;
    const group = this.makeCameraShip(tint);
    group.userData.tint = tint;
    group.scale.setScalar(0.48);

    const label = createLabelSprite(pilot.name || 'Friend', tint);
    label.position.y = 2.25;
    label.scale.multiplyScalar(0.36);
    group.userData.label = label;

    const ring = this.trackMarker(1.55, tint);
    ring.rotation.x = Math.PI / 2;
    ring.scale.y = 0.44;
    group.add(ring, label);
    return group;
  }

  private glowTexture(tint: number) {
    if (!this.glowCache.has(tint)) this.glowCache.set(tint, createGlowTexture(1, tint));
    return this.glowCache.get(tint)!;
  }

  private planetTexture(obj: SpaceObject) {
    const key = `${obj.kind}-${obj.color}-${obj.seed}`;
    if (!this.planetTextureCache.has(key)) this.planetTextureCache.set(key, createPlanetTexture(obj.kind, obj.color, obj.seed));
    return this.planetTextureCache.get(key)!;
  }

  private ringTexture(tint: number, seed: number) {
    const key = `${tint}-${seed}`;
    if (!this.ringTextureCache.has(key)) this.ringTextureCache.set(key, createRingTexture(tint, seed));
    return this.ringTextureCache.get(key)!;
  }

  private makeBackgroundStars(count: number, opacity: number, pointSize: number, radius: number, colorful = false) {
    const rand = seeded(55000 + count + Math.round(pointSize * 100));
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = colorful
      ? [COLORS.white, COLORS.softWhite, COLORS.blue, COLORS.yellow, COLORS.cyan, COLORS.pink, COLORS.gold]
      : [COLORS.white, COLORS.softWhite, 0xb7c7ff, 0xffebbb];
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const u = rand() * 2 - 1;
      const r = radius + rand() * 1900;
      positions[i * 3] = Math.cos(a) * Math.sqrt(1 - u * u) * r;
      positions[i * 3 + 1] = u * r * 0.72;
      positions[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - u * u) * r;
      const c = color(palette[Math.floor(rand() * palette.length)], 0.42 + rand() * 0.9);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: pointSize,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false
      })
    );
  }

  private buildObject(obj: SpaceObject) {
    const group = new THREE.Group();
    const size = this.objectSize(obj);
    group.userData.spinRate = PLANET_SET.has(obj.kind) ? 0.24 + (obj.seed % 17) * 0.006 : 0.07;

    if (obj.heartShape) {
      group.userData.spinRate = 0.045 + (obj.seed % 7) * 0.004;
      const root = new THREE.Group();
      const planet = makeHeartMesh(obj.color, size * 1.28);
      planet.rotation.z = ((obj.seed % 11) - 5) * 0.018;
      const atmosphere = new THREE.Mesh(
        makePuffedHeartGeometry(size * 1.4, 18, 104, 0.48),
        new THREE.MeshBasicMaterial({
          color: mixHex(obj.color, COLORS.white, 0.32),
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      atmosphere.rotation.copy(planet.rotation);
      const halo = this.spriteGlow(obj.color, size * 5.6, 0.24);
      root.add(halo, this.spriteGlow(COLORS.gold, size * 3.4, 0.08), planet, atmosphere);
      if (obj.systemName === "Zahra's Resonance") {
        root.add(this.spriteGlow(COLORS.gold, size * 3.2, 0.07));
        for (let i = 0; i < 3; i += 1) {
          const ring = this.torus(size * (1.48 + i * 0.34), size * 0.011, i % 2 ? mixHex(obj.color, COLORS.white, 0.1) : COLORS.gold, 0.25 - i * 0.045);
          ring.rotation.x = Math.PI / 2 + i * 0.11;
          ring.rotation.y = i * 0.16;
          ring.scale.y = 0.78;
          root.add(ring);
        }
      }
      if (obj.rings) root.add(this.planetRings(obj, size * 0.82));
      group.userData.naturalRoot = root;
      group.add(root);
    } else if (obj.kind === 'Star System') {
      const star = this.makeStar(obj, size);
      group.userData.naturalRoot = obj.heartStar ? star : star.userData.naturalRoot ?? star;
      group.add(star);
    } else if (PLANET_SET.has(obj.kind)) {
      const planet = this.makePlanet(obj, size);
      group.userData.naturalRoot = planet.userData.naturalRoot ?? planet;
      group.add(planet);
    } else if (obj.kind === 'Galaxy' || obj.kind === 'Galaxy Pair') {
      group.add(this.makeGalaxy(obj, size));
    } else if (obj.kind === 'Nebula') {
      group.add(this.makeNebula(obj, size));
    } else if (obj.kind === 'Star Cluster') {
      group.add(makeParticleCloud(720, size * 5.5, obj.color, obj.seed, 0.84, 0.18));
    } else if (obj.kind === 'Quasar') {
      group.add(this.makeBlackHoleLike(size, obj.color, true));
    }

    const track = this.trackMarker(size * 3.2 + 2, COLORS.green);
    track.visible = false;
    group.userData.trackRing = track;
    group.add(track);

    if (obj.kind === 'Star System' || obj.kind === 'Galaxy' || obj.kind === 'Galaxy Pair' || obj.kind === 'Quasar') {
      const label = createLabelSprite(obj.name, obj.color);
      label.position.y = size * 2.2 + 2.2;
      group.userData.label = label;
      group.add(label);
    }
    if (obj.kind === 'Star System' || obj.kind === 'Galaxy' || obj.kind === 'Galaxy Pair') {
      const distant = this.spriteGlow(mixHex(obj.color, COLORS.white, obj.kind === 'Star System' ? 0.32 : 0.18), obj.kind === 'Star System' ? 9 : 15, obj.kind === 'Star System' ? 0.36 : 0.2);
      distant.visible = false;
      group.userData.distantBeacon = distant;
      group.add(distant);
    }
    return group;
  }

  private makeStar(obj: SpaceObject, size: number) {
    const root = new THREE.Group();
    const starSize = size * 0.68;
    const starColor = obj.heartStar ? 0xff72bd : obj.color;
    const coreMaterial = obj.heartStar
      ? new THREE.MeshBasicMaterial({ color: mixHex(starColor, COLORS.gold, 0.18) })
      : makeStarSurfaceMaterial(starColor, obj.seed);
    const core = new THREE.Mesh(new THREE.SphereGeometry(starSize * (obj.heartStar ? 0.86 : 1), 64, 32), coreMaterial);
    const innerCorona = this.spriteGlow(starColor, starSize * 5.4, 0.32);
    const outerCorona = this.spriteGlow(mixHex(starColor, COLORS.white, 0.34), starSize * 9.5, 0.06);
    const flare = this.starFlare(starColor, starSize * 6.5);
    root.add(outerCorona, innerCorona, core);
    if (!obj.heartStar) root.add(flare);
    if (obj.heartStar) {
      root.add(this.spriteGlow(COLORS.gold, starSize * 8.2, 0.1), this.spriteGlow(starColor, starSize * 12, 0.052));
      for (let i = 0; i < 7; i += 1) {
        const ring = this.torus(starSize * (1.7 + i * 0.46), starSize * 0.012, i % 2 ? mixHex(starColor, COLORS.white, 0.12) : COLORS.gold, 0.34 - i * 0.03);
        ring.rotation.x = Math.PI / 2 + i * 0.08;
        ring.rotation.y = i * 0.13;
        ring.rotation.z = i * 0.21;
        ring.scale.y = 0.72 + i * 0.025;
        root.add(ring);
      }
    }
    root.userData.naturalRoot = core;
    return root;
  }

  private makePlanet(obj: SpaceObject, size: number) {
    const root = new THREE.Group();
    const geometry = new THREE.SphereGeometry(size, 64, 36);
    const isCrystal = obj.kind === 'Crystal Planet' || obj.kind === 'Diamond Rain Planet' || obj.kind === 'Ice World';
    const material = new THREE.MeshStandardMaterial({
      map: this.planetTexture(obj),
      color: 0xffffff,
      roughness: isCrystal ? 0.24 : 0.62,
      metalness: obj.kind === 'Iron Storm World' ? 0.25 : 0.04,
      emissive: obj.kind === 'Lava World' ? new THREE.Color(0xff2200) : new THREE.Color(0x000000),
      emissiveIntensity: obj.kind === 'Lava World' ? 0.28 : 0
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.rotation.z = ((obj.seed % 23) - 11) * 0.015;
    root.add(sphere);
    root.userData.naturalRoot = sphere;

    if (obj.atmosphere) {
      const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(size * 1.055, 64, 32), makeAtmosphereMaterial(obj.color, 0.42));
      root.add(atmosphere);
    }
    if (obj.rings) {
      root.add(this.planetRings(obj, size));
    }
    if (obj.moons > 0 && size > 1.2) {
      root.add(this.moonSystem(obj, size));
    }
    return root;
  }

  private planetRings(obj: SpaceObject, size: number) {
    const group = new THREE.Group();
    const ringScale = obj.kind === 'Mega Ringed Giant' ? 4.8 : 3.25;
    const texture = this.ringTexture(obj.color, obj.seed);
    for (let i = 0; i < 4; i += 1) {
      const inner = size * (1.35 + i * 0.19);
      const outer = size * (ringScale + i * 0.25);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(inner, outer, 160),
        new THREE.MeshBasicMaterial({
          map: texture,
          color: mixHex(obj.color, COLORS.white, 0.22 + i * 0.08),
          transparent: true,
          opacity: 0.16 - i * 0.022,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      ring.rotation.x = Math.PI * (0.48 + ((obj.seed + i) % 9) * 0.012);
      ring.rotation.y = Math.PI * 0.08;
      ring.rotation.z = ((obj.seed % 31) / 31) * Math.PI;
      group.add(ring);
    }
    return group;
  }

  private moonSystem(obj: SpaceObject, size: number) {
    const group = new THREE.Group();
    const rand = seeded(obj.seed + 301);
    const count = Math.min(5, obj.moons);
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + rand();
      const r = size * (2.3 + i * 0.45 + rand() * 0.45);
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.08, size * (0.09 + rand() * 0.05)), 16, 10),
        new THREE.MeshStandardMaterial({ color: 0xb7bed0, roughness: 0.8, metalness: 0.02 })
      );
      moon.position.set(Math.cos(a) * r, Math.sin(a * 0.4) * size * 0.55, Math.sin(a) * r);
      group.add(moon);
    }
    return group;
  }

  private makeNebula(obj: SpaceObject, size: number) {
    const group = new THREE.Group();
    const rand = seeded(obj.seed);
    for (let i = 0; i < 16; i += 1) {
      const sprite = this.spriteGlow(mixHex(obj.color, COLORS.white, rand() * 0.25), size * (2.5 + rand() * 5.8), 0.08 + rand() * 0.1);
      sprite.position.set((rand() - 0.5) * size * 4.8, (rand() - 0.5) * size * 2.2, (rand() - 0.5) * size * 2.5);
      group.add(sprite);
    }
    group.add(makeParticleCloud(420, size * 4.4, obj.color, obj.seed + 44, 0.55, 0.16));
    return group;
  }

  private makeGalaxy(obj: SpaceObject, size: number) {
    const group = new THREE.Group();
    const rand = seeded(obj.seed);
    const count = obj.kind === 'Galaxy Pair' ? 7200 : 5200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const arms = obj.kind === 'Galaxy Pair' ? 8 : 5;
    for (let i = 0; i < count; i += 1) {
      const arm = i % arms;
      const u = Math.pow(rand(), 0.62);
      const r = size * (0.08 + u * (1.8 + rand() * 0.42));
      const swirl = r * 0.095 + u * 4.1;
      const a = (arm * Math.PI * 2) / arms + swirl + (rand() - 0.5) * (0.34 + u * 0.22);
      const pairOffset = obj.kind === 'Galaxy Pair' ? (i % 2 ? size * 1.35 : -size * 0.85) : 0;
      const tidal = obj.kind === 'Galaxy Pair' ? Math.sin(u * Math.PI) * size * 0.55 * (i % 2 ? 1 : -1) : 0;
      positions[i * 3] = Math.cos(a) * r + pairOffset + tidal;
      positions[i * 3 + 1] = (rand() - 0.5) * size * (0.1 + u * 0.08);
      positions[i * 3 + 2] = Math.sin(a) * r * (0.3 + u * 0.14);
      const palette = rand() > 0.58 ? obj.color : rand() > 0.38 ? COLORS.softWhite : rand() > 0.18 ? COLORS.cyan : COLORS.gold;
      const c = color(palette, 0.48 + rand() * 1.05);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: obj.kind === 'Galaxy Pair' ? 0.16 : 0.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.16, 48, 20),
      new THREE.MeshBasicMaterial({ color: mixHex(obj.color, COLORS.white, 0.48), transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending })
    );
    group.add(this.spriteGlow(obj.color, size * 4.1, 0.16), this.spriteGlow(COLORS.softWhite, size * 1.8, 0.12), core, points);
    return group;
  }

  private makeBackgroundShell(colorHex: number, radius: number, opacity: number) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 24),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide
      })
    );
  }

  private makeBlackHoleLike(size: number, tint: number, jet = false) {
    const group = new THREE.Group();
    const shadow = new THREE.Mesh(new THREE.SphereGeometry(size * 0.45, 48, 24), new THREE.MeshBasicMaterial({ color: COLORS.black }));
    const photon = this.torus(size * 0.72, size * 0.018, COLORS.white, 0.78);
    group.add(this.spriteGlow(tint, size * 5.0, 0.1));
    for (let i = 0; i < 9; i += 1) {
      const disk = this.flatDisk(size * (1.5 + i * 0.24), size * (0.54 + i * 0.12), i % 3 === 0 ? mixHex(COLORS.softWhite, COLORS.cyan, 0.18) : i % 3 === 1 ? tint : mixHex(tint, COLORS.pink, 0.24), 0.22 - i * 0.016);
      disk.rotation.x = Math.PI * (0.47 + i * 0.006);
      disk.rotation.y = Math.PI * 0.035;
      disk.rotation.z = i * 0.16;
      disk.scale.y = 0.34 + i * 0.018;
      disk.userData.spinZ = (i % 2 ? -1 : 1) * (0.24 + i * 0.06);
      disk.userData.breathe = 0.015 + i * 0.004;
      group.add(disk);
    }
    for (let i = 0; i < 7; i += 1) {
      const lens = this.torus(size * (0.86 + i * 0.28), size * (0.012 + i * 0.002), i % 2 ? COLORS.softWhite : mixHex(tint, COLORS.cyan, 0.35), 0.34 - i * 0.032);
      lens.rotation.x = Math.PI * (0.46 + i * 0.016);
      lens.rotation.y = i * 0.11;
      lens.scale.y = 0.48 + i * 0.035;
      lens.userData.spinZ = (i % 2 ? 1 : -1) * (0.34 + i * 0.07);
      lens.userData.breathe = 0.01 + i * 0.003;
      group.add(lens);
    }
    group.add(shadow, photon);
    if (jet) {
      group.add(this.beam(size * 7, size * 0.06, COLORS.cyan, 'y', 0.28));
    }
    group.add(makeParticleCloud(520, size * 3.6, tint, Math.round(size * 80), 0.34, 0.105));
    return group;
  }

  private eventSeed(event: WorldEvent, salt = 0) {
    let hash = 2166136261 + salt;
    for (let i = 0; i < event.id.length; i += 1) {
      hash ^= event.id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private addShockRings(group: THREE.Group, count: number, base: number, step: number, tint: number, opacity: number, tilt = 0.5) {
    for (let i = 0; i < count; i += 1) {
      const ring = this.torus(base + i * step, Math.max(0.012, base * 0.005), i % 3 === 0 ? COLORS.white : tint, Math.max(0.06, opacity - i * 0.035));
      ring.rotation.x = Math.PI * tilt + i * 0.055;
      ring.rotation.y = i * 0.18;
      ring.rotation.z = i * 0.29;
      group.add(ring);
    }
  }

  private makeEventBridge(size: number, leftTint: number, rightTint: number, seed: number) {
    const rand = seeded(seed);
    const positions: number[] = [];
    const colors: number[] = [];
    for (let i = 0; i < 170; i += 1) {
      const u = i / 169;
      const wobble = Math.sin(u * Math.PI * 7 + rand() * 2) * size * 0.18;
      const start = new THREE.Vector3(-size * 1.45, (rand() - 0.5) * size * 0.45, (rand() - 0.5) * size * 0.35);
      const end = new THREE.Vector3(size * 1.45, (rand() - 0.5) * size * 0.45, (rand() - 0.5) * size * 0.35);
      const mid = start.clone().lerp(end, u);
      const tail = mid.clone().add(new THREE.Vector3((rand() - 0.5) * size * 0.28, wobble, (rand() - 0.5) * size * 0.28));
      positions.push(mid.x, mid.y, mid.z, tail.x, tail.y, tail.z);
      const c = new THREE.Color(leftTint).lerp(new THREE.Color(rightTint), u).lerp(COLOR_WHITE, rand() * 0.35);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
  }

  private makeEventTail(size: number, tint: number, seed: number) {
    const rand = seeded(seed);
    const positions: number[] = [];
    for (let stream = 0; stream < 10; stream += 1) {
      for (let i = 0; i < 58; i += 1) {
        const u = i / 57;
        const x = size * (0.35 + u * 3.4);
        const y = Math.sin(u * Math.PI * 4 + stream) * size * 0.12 + (stream - 4.5) * size * 0.055;
        const z = (rand() - 0.5) * size * 0.28;
        positions.push(x, y, z, x + size * (0.09 + rand() * 0.13), y + (rand() - 0.5) * size * 0.12, z + (rand() - 0.5) * size * 0.12);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 0.58,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
  }

  private makeCryoPlumes(size: number, tint: number, seed: number) {
    const rand = seeded(seed);
    const positions: number[] = [];
    for (let plume = 0; plume < 22; plume += 1) {
      const baseX = (rand() - 0.5) * size * 1.25;
      const baseZ = (rand() - 0.5) * size * 0.55;
      const height = size * (0.85 + rand() * 1.7);
      positions.push(baseX, size * 0.25, baseZ, baseX + (rand() - 0.5) * size * 0.5, size * 0.25 + height, baseZ + (rand() - 0.5) * size * 0.5);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: mixHex(tint, COLORS.white, 0.62),
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
  }

  private makePlanetBeads(size: number, tint: number, seed: number) {
    const group = new THREE.Group();
    const rand = seeded(seed);
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      const r = size * (1.2 + i * 0.075);
      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(size * (0.055 + rand() * 0.04), 14, 8),
        new THREE.MeshBasicMaterial({ color: mixHex(tint, COLORS.white, rand() * 0.52), transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending })
      );
      bead.position.set(Math.cos(a) * r, Math.sin(a * 0.45) * size * 0.12, Math.sin(a) * r * 0.32);
      group.add(bead);
    }
    return group;
  }

  private makeAftermathPhenomenon(event: WorldEvent, size: number) {
    const kind = event.kind;
    const tint = event.color;
    const seed = this.eventSeed(event, 9000);
    const group = new THREE.Group();
    group.scale.setScalar(1.22);

    if (kind === 'Heart Supernova') {
      const heart = makeHeartMesh(tint, size * 2.05);
      heart.rotation.z = 0.02;
      const shell = new THREE.Mesh(
        makePuffedHeartGeometry(size * 2.35, 18, 112, 0.52),
        new THREE.MeshBasicMaterial({
          color: mixHex(tint, COLORS.white, 0.28),
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      const initials = makeCinemaTextSprite('Z + M', COLORS.gold, 600, 220);
      initials.position.set(0, size * 2.65, size * 0.92);
      initials.scale.set(size * 2.25, size * 0.84, 1);
      (initials.material as THREE.SpriteMaterial).depthTest = false;
      const initialStar = this.spriteGlow(COLORS.gold, size * 4.8, 0.3);
      initialStar.position.copy(initials.position);
      group.add(this.spriteGlow(tint, size * 11.5, 0.34), this.spriteGlow(COLORS.gold, size * 7.5, 0.14), heart, shell, initialStar, initials);
      group.add(makeParticleCloud(900, size * 4.9, tint, seed + 1, 0.58, 0.11));
      this.addShockRings(group, 10, size * 1.08, size * 0.4, COLORS.gold, 0.4, 0.52);
      return group;
    }

    if (kind === 'Galaxy Collision') {
      const plane = new THREE.Group();
      plane.rotation.x = Math.PI / 2;
      plane.add(makeMergedGalaxyRemnant(size * 1.45, tint, seed + 2));
      plane.add(makeParticleCloud(1800, size * 4.6, COLORS.cyan, seed + 104, 0.24, 0.07));
      group.add(this.spriteGlow(mixHex(tint, COLORS.gold, 0.45), size * 13.5, 0.24), this.spriteGlow(COLORS.cyan, size * 9.4, 0.08), plane);
      this.addShockRings(group, 10, size * 1.4, size * 0.46, mixHex(tint, COLORS.gold, 0.5), 0.18, 0.5);
      return group;
    }

    if (kind === 'Planet Collision') {
      const molten = this.eventPlanet(size * 0.64, COLORS.orange, seed + 5);
      const plane = new THREE.Group();
      plane.rotation.x = Math.PI / 2;
      plane.add(makeRadialRays(180, size * 0.35, size * 3.9, COLORS.orange, seed + 6, 0.72, 0.52));
      plane.add(makeDiamondShardField(180, size * 3.0, COLORS.gold, seed + 7, size * 0.03));
      plane.add(makeParticleCloud(1300, size * 2.8, COLORS.orange, seed + 107, 0.36, 0.1));
      group.add(this.spriteGlow(COLORS.red, size * 7.4, 0.28), this.spriteGlow(COLORS.gold, size * 5.2, 0.12), molten, plane);
      this.addShockRings(group, 14, size * 0.92, size * 0.32, COLORS.gold, 0.48, 0.5);
      return group;
    }

    if (kind === 'Supernova' || kind === 'Hypernova') {
      const isZahraNova = event.name.toLowerCase().includes('xosupa');
      const primary = isZahraNova ? COLORS.pink : tint;
      const accent = kind === 'Hypernova' || isZahraNova ? COLORS.gold : mixHex(tint, COLORS.white, 0.3);
      const hyper = kind === 'Hypernova';
      const veil = new THREE.Group();
      veil.rotation.x = Math.PI / 2;
      const nebula = makeVolumetricGalaxyDisc(size * (hyper ? 2.3 : 1.82), primary, seed + 8, hyper ? 11 : 8, hyper ? 11200 : 8200, hyper ? 0.22 : 0.3);
      nebula.scale.set(hyper ? 1.85 : 1.42, hyper ? 0.56 : 0.72, 0.48);
      const pearl = makeVolumetricGalaxyDisc(size * (hyper ? 1.46 : 1.18), accent, seed + 28, hyper ? 9 : 6, hyper ? 5600 : 4200, 0.22);
      pearl.rotation.z = 0.48;
      pearl.scale.set(1.2, 0.52, 0.38);
      veil.add(nebula, pearl);
      group.add(this.spriteGlow(primary, size * (hyper ? 16.5 : 12.5), 0.34), this.spriteGlow(accent, size * (hyper ? 10.5 : 7.8), 0.18), veil);
      group.add(makeParticleCloud(hyper ? 3600 : 2400, size * (hyper ? 6.8 : 5.2), primary, seed + 9, 0.6, 0.12));
      group.add(makeParticleCloud(hyper ? 2600 : 1700, size * (hyper ? 5.6 : 4.4), accent, seed + 19, 0.38, 0.08));
      group.add(makeDiamondShardField(hyper ? 360 : 180, size * (hyper ? 5.6 : 3.9), accent, seed + 30, size * 0.018));
      this.addShockRings(group, hyper ? 18 : 12, size * 0.82, size * (hyper ? 0.54 : 0.42), accent, 0.42, 0.5);
      if (hyper) {
        for (let i = 0; i < 8; i += 1) {
          const crown = this.torus(size * (1.24 + i * 0.26), Math.max(0.018, size * 0.005), i % 2 ? COLORS.gold : COLORS.white, 0.28 - i * 0.02);
          crown.rotation.x = Math.PI / 2 + i * 0.03;
          crown.rotation.y = 0.18 + i * 0.08;
          crown.scale.y = 0.28 + i * 0.018;
          group.add(crown);
        }
      }
      if (isZahraNova) {
        group.add(makeHeartParticleField(520, size * 1.95, COLORS.gold, seed + 10, size * 0.026));
        const rose = makePuffedHeartGeometry(size * 0.86, 12, 72, 0.36);
        for (let i = 0; i < 9; i += 1) {
          const heart = new THREE.Mesh(
            rose,
            new THREE.MeshBasicMaterial({
              color: i % 2 ? COLORS.pink : COLORS.gold,
              transparent: true,
              opacity: 0.16,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              side: THREE.DoubleSide
            })
          );
          const a = (i / 9) * Math.PI * 2;
          heart.position.set(Math.cos(a) * size * 2.1, Math.sin(a * 1.7) * size * 0.45, Math.sin(a) * size * 1.15);
          heart.rotation.set(Math.PI / 2, a, -a * 0.4);
          heart.scale.setScalar(0.42 + i * 0.035);
          group.add(heart);
        }
      }
      return group;
    }

    if (kind.includes('Black Hole') || kind === 'Quasar' || kind === 'Tidal Disruption') {
      group.add(this.makeBlackHoleLike(size * 1.18, tint, kind === 'Quasar'));
      group.add(this.spriteGlow(COLORS.cyan, size * 6.8, 0.08), this.spriteGlow(COLORS.purple, size * 5.4, 0.08));
      if (kind === 'Tidal Disruption') group.add(makeParticleTidalBridge(size * 2.0, COLORS.gold, tint, seed + 11, 1300));
      this.addShockRings(group, 8, size * 1.1, size * 0.36, mixHex(tint, COLORS.white, 0.24), 0.2, 0.46);
      return group;
    }

    if (kind === 'Kilonova') {
      const cocoon = new THREE.Group();
      cocoon.rotation.x = Math.PI / 2;
      const disc = makeVolumetricGalaxyDisc(size * 2.65, mixHex(COLORS.purple, COLORS.gold, 0.36), seed + 12, 12, 7200, 0.2);
      disc.scale.set(1.65, 0.72, 0.46);
      cocoon.add(disc);
      cocoon.add(makeParticleCloud(3400, size * 5.4, COLORS.gold, seed + 13, 0.4, 0.07));
      cocoon.add(makeParticleCloud(2600, size * 5.8, COLORS.purple, seed + 113, 0.34, 0.065));
      cocoon.add(makeDiamondShardField(190, size * 3.8, COLORS.gold, seed + 14, size * 0.028));
      group.add(this.spriteGlow(COLORS.purple, size * 11.2, 0.26), this.spriteGlow(COLORS.gold, size * 9.2, 0.2), this.spriteGlow(COLORS.white, size * 4.5, 0.08), cocoon);
      this.addShockRings(group, 9, size * 0.9, size * 0.4, COLORS.gold, 0.24, 0.52);
      return group;
    }

    if (kind === 'Neutron Star Merger') {
      const plane = new THREE.Group();
      plane.rotation.x = Math.PI / 2;
      plane.add(makeVolumetricGalaxyDisc(size * 2.1, mixHex(tint, COLORS.purple, 0.5), seed + 12, 6, 4200, 0.36));
      plane.add(makeParticleCloud(2100, size * 4.4, tint, seed + 13, 0.44, 0.08));
      plane.add(makeParticleCloud(1500, size * 3.2, COLORS.gold, seed + 113, 0.34, 0.065));
      group.add(this.spriteGlow(COLORS.purple, size * 9.8, 0.28), this.spriteGlow(COLORS.gold, size * 7.6, 0.16), plane);
      group.add(makeParticleCloud(1200, size * 5.8, mixHex(tint, COLORS.white, 0.32), seed + 213, 0.16, 0.055));
      return group;
    }

    if (kind === 'Magnetar' || kind === 'Pulsar') {
      const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.36, 42, 20), new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending }));
      group.add(this.spriteGlow(tint, size * 6.2, 0.22), core, makeLoopField(kind === 'Magnetar' ? 26 : 14, size * 2.4, tint, seed + 14, 0.44));
      group.add(this.beam(size * (kind === 'Pulsar' ? 6.6 : 3.8), size * 0.05, COLORS.cyan, 'x', 0.22));
      this.addShockRings(group, 10, size * 0.78, size * 0.32, tint, 0.3, 0.52);
      return group;
    }

    if (kind === 'Diamond Rain') {
      group.add(this.spriteGlow(COLORS.cyan, size * 6.2, 0.24), makeDiamondShardField(125, size * 2.9, COLORS.cyan, seed + 15, size * 0.036));
      group.add(makeParticleCloud(1100, size * 3.6, COLORS.cyan, seed + 16, 0.58, 0.13));
      this.addShockRings(group, 8, size * 0.78, size * 0.3, COLORS.cyan, 0.34, 0.54);
      return group;
    }

    if (kind === 'Planetary Nebula') {
      group.add(this.spriteGlow(COLORS.pink, size * 5.2, 0.22), this.spriteGlow(COLORS.cyan, size * 5.2, 0.2));
      group.add(makeLoopField(20, size * 2.8, tint, seed + 17, 0.36), makeParticleCloud(1500, size * 4.5, tint, seed + 18, 0.62, 0.13));
      return group;
    }

    if (kind === 'Tidal Lock Eclipse' || kind === 'Atmospheric Escape' || kind === 'Cryovolcanism') {
      const planet = this.eventPlanet(size * 0.72, tint, seed + 19);
      group.add(this.spriteGlow(tint, size * 5.0, 0.18), planet);
      if (kind === 'Atmospheric Escape') group.add(this.makeEventTail(size, COLORS.cyan, seed + 20));
      if (kind === 'Cryovolcanism') group.add(this.makeCryoPlumes(size, tint, seed + 21));
      this.addShockRings(group, 7, size * 0.78, size * 0.28, tint, 0.28, 0.5);
      return group;
    }

    group.add(this.spriteGlow(tint, size * 7.2, 0.22), makeSpiralArms(8, 170, size * 3.8, tint, seed + 22, 0.44));
    group.add(makeParticleCloud(1100, size * 3.9, tint, seed + 23, 0.55, 0.13));
    this.addShockRings(group, 9, size * 0.82, size * 0.34, tint, 0.34, 0.5);
    return group;
  }

  private makeEventPhenomenon(event: WorldEvent, size: number) {
    const kind = event.kind;
    const tint = event.color;
    const seed = this.eventSeed(event);
    const group = new THREE.Group();
    if (event.phase === 'aftermath' && hasPersistentAftermath(kind)) return this.makeAftermathPhenomenon(event, size);

    if (kind === 'Solar System') {
      const sun = new THREE.Mesh(new THREE.SphereGeometry(size * 0.42, 56, 28), makeStarSurfaceMaterial(COLORS.yellow, seed));
      group.add(this.spriteGlow(COLORS.yellow, size * 6.8, 0.28), this.spriteGlow(COLORS.gold, size * 10.2, 0.1), sun);
      for (let i = 0; i < 8; i += 1) {
        const ring = this.torus(size * (0.85 + i * 0.28), Math.max(0.008, size * 0.002), i === 2 ? COLORS.cyan : mixHex(COLORS.gold, COLORS.white, 0.1), i === 2 ? 0.36 : 0.16);
        ring.rotation.x = Math.PI / 2;
        ring.scale.y = 0.46;
        group.add(ring);
      }
      return group;
    }

    if (kind === 'Heart Supernova') {
      const heart = makeHeartMesh(tint, size * 1.95);
      heart.rotation.z = 0.02;
      heart.position.z = size * 0.16;
      const shell = new THREE.Mesh(
        makePuffedHeartGeometry(size * 2.18, 18, 112, 0.5),
        new THREE.MeshBasicMaterial({
          color: mixHex(tint, COLORS.white, 0.28),
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      shell.rotation.copy(heart.rotation);
      group.add(this.spriteGlow(tint, size * 10.5, 0.36), this.spriteGlow(COLORS.gold, size * 7.4, 0.13), heart, shell);
      group.add(makeParticleCloud(720, size * 4.7, tint, seed + 2, 0.58, 0.11));
      this.addShockRings(group, 8, size * 1.15, size * 0.36, COLORS.gold, 0.46, 0.5);
      if (event.phase === 'aftermath') {
        const initials = makeCinemaTextSprite('Z + M', COLORS.gold, 600, 220);
        initials.position.set(0, -size * 0.08, size * 0.6);
        initials.scale.set(size * 1.85, size * 0.68, 1);
        (initials.material as THREE.SpriteMaterial).depthTest = false;
        group.add(initials);
      }
      return group;
    }

    if (kind === 'Wormhole') {
      group.add(this.makeWormhole(size * 1.55, tint));
      group.add(makeParticleCloud(1400, size * 4.2, tint, seed + 4, 0.44, 0.12));
      group.add(makeParticleCloud(820, size * 5.3, COLORS.cyan, seed + 41, 0.18, 0.06));
      this.addShockRings(group, 12, size * 0.9, size * 0.42, mixHex(tint, COLORS.cyan, 0.42), 0.34, 0.54);
      return group;
    }

    if (kind === 'Dark Matter Caustic') {
      group.add(this.spriteGlow(COLORS.purple, size * 6.8, 0.15));
      group.add(makeLoopField(22, size * 2.45, COLORS.purple, seed + 5, 0.46));
      group.add(makeParticleCloud(720, size * 3.8, COLORS.cyan, seed + 6, 0.34, 0.11));
      this.addShockRings(group, 9, size * 0.85, size * 0.36, COLORS.cyan, 0.38, 0.5);
      return group;
    }

    if (kind.includes('Black Hole') || kind === 'Tidal Disruption' || kind === 'Quasar') {
      const blackHole = this.makeBlackHoleLike(size * 1.38, tint, kind === 'Quasar');
      group.add(blackHole);
      group.add(this.spriteGlow(COLORS.cyan, size * 7.4, 0.1), this.spriteGlow(COLORS.purple, size * 6.4, 0.08));
      if (kind === 'Tidal Disruption') group.add(makeParticleTidalBridge(size * 2.4, COLORS.gold, tint, seed + 7, 1900));
      this.addShockRings(group, 8, size * 1.18, size * 0.45, mixHex(tint, COLORS.white, 0.22), 0.22, 0.46);
      return group;
    }

    if (kind === 'Gamma Ray Burst' || kind === 'Fast Radio Burst') {
      group.add(this.makeBurstMarker(size * 1.25, tint));
      group.add(makeRadialRays(kind === 'Gamma Ray Burst' ? 54 : 92, size * 0.7, size * (kind === 'Gamma Ray Burst' ? 5.8 : 4.4), kind === 'Gamma Ray Burst' ? COLORS.cyan : tint, seed + 9, kind === 'Gamma Ray Burst' ? 0.2 : 0.42, 0.64));
      this.addShockRings(group, kind === 'Fast Radio Burst' ? 12 : 7, size * 0.7, size * 0.42, tint, 0.46, 0.5);
      group.add(makeParticleCloud(540, size * 2.9, tint, seed + 10, 0.3, 0.13));
      return group;
    }

    if (kind === 'Galaxy Collision') {
      group.add(makeElegantGalaxyPair(size * 1.65, COLORS.cyan, COLORS.gold, seed + 11));
      group.add(makeParticleTidalBridge(size * 2.45, COLORS.cyan, COLORS.gold, seed + 12, 2200));
      group.add(this.spriteGlow(mixHex(event.color, COLORS.gold, 0.42), size * 8.4, 0.12));
      this.addShockRings(group, 7, size * 0.88, size * 0.38, mixHex(event.color, COLORS.gold, 0.4), 0.22, 0.42);
      return group;
    }

    if (kind === 'Planet Collision') {
      const a = this.eventPlanet(size * 0.38, COLORS.blue, seed + 13);
      const b = this.eventPlanet(size * 0.42, COLORS.orange, seed + 14);
      a.position.x = -size * 0.92;
      b.position.x = size * 0.86;
      group.add(a, b, this.flatDisk(size * 2.35, size * 0.38, COLORS.gold, 0.2), makeRadialRays(118, size * 0.34, size * 3.8, COLORS.orange, seed + 15, 0.72, 0.58));
      group.add(makeParticleCloud(980, size * 2.5, COLORS.orange, seed + 16, 0.52, 0.14));
      return group;
    }

    if (kind === 'Supernova' || kind === 'Hypernova') {
      const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.36, 32, 16), new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending }));
      const isZahraNova = event.name.toLowerCase().includes('xosupa');
      const primary = isZahraNova ? COLORS.pink : tint;
      const accent = kind === 'Hypernova' || isZahraNova ? COLORS.gold : tint;
      group.add(this.spriteGlow(primary, size * (kind === 'Hypernova' ? 13.5 : 10.5), 0.44), this.spriteGlow(accent, size * 7.2, 0.14), core);
      group.add(makeRadialRays(kind === 'Hypernova' ? 180 : 138, size * 0.65, size * (kind === 'Hypernova' ? 6.9 : 5.5), accent, seed + 17, 0.74, 0.8));
      this.addShockRings(group, kind === 'Hypernova' ? 14 : 10, size * 0.9, size * 0.48, accent, 0.58, 0.5);
      if (kind === 'Hypernova') group.add(makeLoopField(12, size * 2.4, COLORS.gold, seed + 18, 0.54));
      if (isZahraNova) group.add(makeHeartParticleField(380, size * 1.55, COLORS.gold, seed + 20, size * 0.03));
      group.add(makeParticleCloud(kind === 'Hypernova' ? 1550 : 1220, size * 5.2, primary, seed + 19, 0.74, 0.16));
      return group;
    }

    if (kind === 'Magnetar' || kind === 'Pulsar') {
      const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.42, 42, 22), new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.94, blending: THREE.AdditiveBlending }));
      group.add(this.spriteGlow(tint, size * 6.8, 0.32), core, makeLoopField(kind === 'Magnetar' ? 20 : 10, size * 2.5, tint, seed + 20, 0.58));
      group.add(this.beam(size * (kind === 'Pulsar' ? 7.5 : 4.6), size * (kind === 'Pulsar' ? 0.08 : 0.045), COLORS.cyan, 'x', kind === 'Pulsar' ? 0.42 : 0.28));
      group.add(makeRadialRays(76, size * 0.55, size * 4.4, tint, seed + 21, 0.82, 0.56));
      return group;
    }

    if (kind === 'Solar System Birth') {
      const proto = new THREE.Mesh(new THREE.SphereGeometry(size * 0.34, 34, 16), new THREE.MeshBasicMaterial({ color: COLORS.white, blending: THREE.AdditiveBlending }));
      group.add(this.spriteGlow(COLORS.gold, size * 7.2, 0.3), proto, this.flatDisk(size * 3.8, size * 0.5, COLORS.gold, 0.24), this.flatDisk(size * 2.6, size * 0.35, COLORS.cyan, 0.12), this.makePlanetBeads(size, tint, seed + 22));
      this.addShockRings(group, 5, size * 0.9, size * 0.42, COLORS.gold, 0.36, 0.5);
      return group;
    }

    if (kind === 'Diamond Rain') {
      const planet = this.eventPlanet(size * 0.82, COLORS.blue, seed + 23);
      group.add(this.spriteGlow(COLORS.cyan, size * 5.4, 0.25), planet, makeDiamondShardField(95, size * 2.45, COLORS.cyan, seed + 24, size * 0.035));
      this.addShockRings(group, 6, size * 0.9, size * 0.28, COLORS.cyan, 0.42, 0.52);
      return group;
    }

    if (kind === 'Planetary Nebula') {
      const left = this.spriteGlow(COLORS.pink, size * 4.8, 0.24);
      const right = this.spriteGlow(COLORS.cyan, size * 4.8, 0.24);
      left.position.x = -size * 0.95;
      right.position.x = size * 0.95;
      group.add(left, right, makeLoopField(11, size * 2.4, tint, seed + 25, 0.44), makeParticleCloud(980, size * 4.1, tint, seed + 26, 0.62, 0.14));
      return group;
    }

    if (kind === 'Tidal Lock Eclipse' || kind === 'Atmospheric Escape' || kind === 'Cryovolcanism') {
      const planet = this.eventPlanet(size * 0.9, tint, seed + 27);
      group.add(planet, this.spriteGlow(tint, size * 4.4, 0.2));
      if (kind === 'Tidal Lock Eclipse') {
        const moon = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 24, 12), new THREE.MeshBasicMaterial({ color: COLORS.black }));
        moon.position.set(size * 0.8, size * 0.2, size * 0.25);
        group.add(moon, this.beam(size * 3.0, size * 0.04, COLORS.white, 'y', 0.2));
      } else if (kind === 'Atmospheric Escape') {
        group.add(this.makeEventTail(size, COLORS.cyan, seed + 28));
      } else {
        group.add(this.makeCryoPlumes(size, tint, seed + 29), makeDiamondShardField(34, size * 1.7, COLORS.cyan, seed + 30, size * 0.026));
      }
      return group;
    }

    if (kind === 'Kilonova') {
      const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.34, 36, 18), new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
      group.add(this.spriteGlow(COLORS.purple, size * 7.0, 0.26), this.spriteGlow(COLORS.gold, size * 6.2, 0.16), core);
      group.add(makeDiamondShardField(74, size * 2.4, COLORS.gold, seed + 31, size * 0.028));
      group.add(makeParticleCloud(1400, size * 4.2, mixHex(COLORS.purple, COLORS.gold, 0.32), seed + 32, 0.46, 0.12));
      group.add(this.beam(size * 4.8, size * 0.055, COLORS.purple, 'y', 0.22));
      return group;
    }

    if (kind === 'Neutron Star Merger') {
      const a = new THREE.Mesh(new THREE.SphereGeometry(size * 0.25, 32, 16), new THREE.MeshBasicMaterial({ color: COLORS.cyan, blending: THREE.AdditiveBlending }));
      const b = new THREE.Mesh(new THREE.SphereGeometry(size * 0.25, 32, 16), new THREE.MeshBasicMaterial({ color: COLORS.gold, blending: THREE.AdditiveBlending }));
      a.position.x = -size * 0.62;
      b.position.x = size * 0.62;
      group.add(this.spriteGlow(tint, size * 7.4, 0.28), a, b, makeRadialRays(108, size * 0.48, size * 4.7, tint, seed + 31, 0.55, 0.68), makeParticleCloud(1050, size * 4.0, tint, seed + 32, 0.5, 0.15));
      this.addShockRings(group, 10, size * 0.72, size * 0.42, tint, 0.44, 0.5);
      return group;
    }

    if (kind === 'Wolf-Rayet Wind') {
      group.add(this.spriteGlow(COLORS.cyan, size * 6.3, 0.28), makeRadialRays(128, size * 0.45, size * 5.0, COLORS.cyan, seed + 33, 1, 0.62), makeLoopField(9, size * 2.35, COLORS.cyan, seed + 34, 0.38));
      this.addShockRings(group, 9, size * 0.8, size * 0.45, COLORS.cyan, 0.42, 0.5);
      return group;
    }

    if (kind === 'Gravitational Wave') {
      const a = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 28, 14), new THREE.MeshBasicMaterial({ color: COLORS.black }));
      const b = a.clone();
      a.position.x = -size * 0.4;
      b.position.x = size * 0.4;
      group.add(a, b, this.spriteGlow(tint, size * 5.6, 0.15));
      this.addShockRings(group, 16, size * 0.55, size * 0.35, COLORS.softWhite, 0.38, 0.5);
      return group;
    }

    if (kind === 'Made in Heaven') {
      group.add(this.makeMadeInHeavenMarker(size, seed + 35));
      return group;
    }

    group.add(this.spriteGlow(tint, size * 6.4, 0.26), makeRadialRays(72, size * 0.6, size * 4.1, tint, seed + 37, 0.7, 0.58), makeParticleCloud(620, size * 3.6, tint, seed + 38, 0.6, 0.14));
    this.addShockRings(group, 6, size * 0.9, size * 0.4, tint, 0.4, 0.5);
    return group;
  }

  private buildEvent(event: WorldEvent) {
    const group = new THREE.Group();
    const markerSize = Math.max(1.6, Math.min(24, event.radius * 0.009));
    const size = event.kind === 'Galaxy Collision' ? Math.min(9.5, markerSize * 0.42) : event.kind === 'Planet Collision' ? Math.min(7.2, markerSize * 0.56) : markerSize;
    const baseName = event.name === 'My Love For You' && !event.discovered ? '???' : event.name;
    const name = event.phase === 'aftermath' && hasPersistentAftermath(event.kind) ? `${baseName} Aftermath` : baseName;
    const root = this.makeEventPhenomenon(event, size);
    group.userData.pulseRoot = root;

    group.add(root);
    const label = createLabelSprite(name, event.color);
    label.position.y = size * 2.1 + 2;
    group.userData.label = label;
    group.add(label);

    const track = this.trackMarker(size * 3.0 + 2, COLORS.green);
    track.visible = false;
    group.userData.trackRing = track;
    group.add(track);
    return group;
  }

  private eventPlanet(size: number, tint: number, seed: number) {
    const dummy: SpaceObject = {
      type: 'object',
      id: `event-planet-${seed}`,
      name: '',
      kind: 'Rocky Planet',
      position: { x: 0, y: 0, z: 0 },
      radius: 1,
      color: tint,
      description: '',
      discovered: true,
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitAngle: 0,
      orbitTilt: 0,
      rings: false,
      atmosphere: true,
      moons: 0,
      seed,
      systemName: '',
      heartShape: false,
      heartStar: false
    };
    return new THREE.Mesh(
      new THREE.SphereGeometry(size, 36, 18),
      new THREE.MeshStandardMaterial({ map: createPlanetTexture('Rocky Planet', tint, seed), roughness: 0.58 })
    );
  }

  private makeBurstMarker(size: number, tint: number) {
    const group = new THREE.Group();
    group.add(this.spriteGlow(tint, size * 4.2, 0.35));
    group.add(this.beam(size * 9, size * 0.07, tint, 'x', 0.28));
    group.add(this.beam(size * 9, size * 0.04, COLORS.white, 'x', 0.38));
    group.add(this.torus(size * 0.95, size * 0.012, tint, 0.8));
    return group;
  }

  private makeWormhole(size: number, tint: number) {
    const group = new THREE.Group();
    group.add(this.spriteGlow(tint, size * 8.2, 0.26), this.spriteGlow(COLORS.cyan, size * 5.8, 0.16));
    const throat = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.36, 48, 24),
      new THREE.MeshBasicMaterial({ color: COLORS.black, transparent: true, opacity: 0.96 })
    );
    throat.scale.set(1, 0.36, 1);
    group.add(throat);
    for (let i = 0; i < 26; i += 1) {
      const ring = this.torus(size * (0.62 + i * 0.105), size * (0.012 + (i % 3) * 0.003), i % 2 ? COLORS.cyan : tint, 0.7 - i * 0.019);
      ring.rotation.x = Math.PI / 2 + Math.sin(i * 0.7) * 0.12;
      ring.rotation.y = Math.cos(i * 0.45) * 0.18;
      ring.rotation.z = i * 0.33;
      ring.position.z = -i * 0.12;
      ring.userData.spinZ = (i % 2 ? -1 : 1) * (0.22 + i * 0.012);
      group.add(ring);
    }
    for (let ribbon = 0; ribbon < 6; ribbon += 1) {
      const points: number[] = [];
      const phase = (ribbon / 6) * Math.PI * 2;
      for (let i = 0; i < 120; i += 1) {
        const u = i / 119;
        const r = size * (0.48 + u * 2.8);
        const twist = phase + u * Math.PI * (3.2 + ribbon * 0.25);
        points.push(Math.cos(twist) * r, Math.sin(twist) * r * 0.36, -u * size * 1.9);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: ribbon % 2 ? COLORS.purple : COLORS.cyan,
          transparent: true,
          opacity: 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      line.userData.spinZ = ribbon % 2 ? -0.34 : 0.38;
      group.add(line);
    }
    group.add(makeParticleCloud(900, size * 3.2, mixHex(tint, COLORS.cyan, 0.28), Math.floor(size * 1000) + 72, 0.36, 0.1));
    return group;
  }

  private makeMadeInHeavenMarker(size: number, seed: number) {
    const group = new THREE.Group();
    const rand = seeded(seed);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.42, 48, 20),
      new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending })
    );
    group.add(this.spriteGlow(COLORS.white, size * 7.8, 0.28), this.spriteGlow(COLORS.gold, size * 5.5, 0.1), body);
    for (let side of [-1, 1] as const) {
      const positions: number[] = [];
      for (let i = 0; i < 22; i += 1) {
        const y = -size * 0.65 + i * size * 0.07;
        positions.push(side * size * 0.22, y, 0);
        positions.push(side * size * (0.72 + i * 0.075), y + size * (0.25 + i * 0.052), (rand() - 0.5) * size * 0.16);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      group.add(
        new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: side < 0 ? COLORS.softWhite : COLORS.cyan, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
        )
      );
    }
    for (let i = 0; i < 5; i += 1) {
      const halo = this.torus(size * (0.78 + i * 0.28), size * 0.012, i % 2 ? COLORS.gold : COLORS.softWhite, 0.42 - i * 0.055);
      halo.rotation.x = Math.PI * (0.5 + i * 0.03);
      halo.rotation.z = i * 0.34;
      halo.scale.y = 0.52;
      group.add(halo);
    }
    return group;
  }

  private spriteGlow(tint: number, size: number, opacity: number) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture(tint),
        color: tint,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    sprite.scale.set(size, size, 1);
    return sprite;
  }

  private starFlare(tint: number, size: number) {
    const geometry = new THREE.BufferGeometry();
    const s = size;
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -s, 0, 0,
          s, 0, 0,
          0, -s * 0.28, 0,
          0, s * 0.28, 0,
          -s * 0.45, -s * 0.15, 0,
          s * 0.45, s * 0.15, 0,
          -s * 0.45, s * 0.15, 0,
          s * 0.45, -s * 0.15, 0
        ],
        3
      )
    );
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: tint,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
  }

  private flatDisk(outer: number, inner: number, tint: number, opacity: number) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 160),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private torus(radius: number, tube: number, tint: number, opacity: number) {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, Math.max(0.01, tube), 10, 160),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    return mesh;
  }

  private beam(length: number, radius: number, tint: number, axis: 'x' | 'y', opacity = 0.34) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.7, length, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    if (axis === 'x') mesh.rotation.z = Math.PI / 2;
    return mesh;
  }

  private trackMarker(radius: number, tint: number) {
    const group = new THREE.Group();
    group.add(this.torus(radius, 0.025, tint, 0.9));
    const cross = new THREE.BufferGeometry();
    cross.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -radius * 1.12, 0, 0,
          -radius * 0.78, 0, 0,
          radius * 0.78, 0, 0,
          radius * 1.12, 0, 0,
          0, -radius * 1.12, 0,
          0, -radius * 0.78, 0,
          0, radius * 0.78, 0,
          0, radius * 1.12, 0
        ],
        3
      )
    );
    group.add(new THREE.LineSegments(cross, new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.7 })));
    return group;
  }

  private objectSize(obj: SpaceObject) {
    if (obj.kind === 'Galaxy' || obj.kind === 'Galaxy Pair') return Math.max(32, obj.radius * 0.026);
    if (obj.kind === 'Nebula' || obj.kind === 'Star Cluster') return Math.max(9, obj.radius * 0.012);
    if (obj.kind === 'Star System') return Math.max(3.4, obj.radius * 0.02);
    if (obj.kind === 'Mega Ringed Giant') return Math.max(2.6, obj.radius * 0.019);
    return Math.max(1.15, obj.radius * 0.018);
  }
}

class CinematicDirector {
  root = new THREE.Group();
  private activeKey = '';
  private core?: THREE.Object3D;
  private particles?: THREE.Points;
  private rings: THREE.Object3D[] = [];
  private staged: THREE.Object3D[] = [];
  private pulseTargets: THREE.Object3D[] = [];
  private dancers: THREE.Object3D[] = [];

  update(state: GameState, dt: number) {
    const event = state.cutscene.active ? state.cutscene.event : null;
    const special = state.specialScene.active ? state.specialScene.target : null;
    const key = event ? `event-${event.id}-${state.cutscene.sequence}` : special ? `special-${special.id}-${state.specialScene.sequence}` : '';
    if (key !== this.activeKey) {
      this.activeKey = key;
      this.build(event, special);
    }

    const timer = event ? state.cutscene.timer : state.specialScene.timer;
    const duration = event ? state.cutscene.duration : state.specialScene.duration;
    const rawT = THREE.MathUtils.clamp(timer / Math.max(0.1, duration), 0, 1);
    const t = smoothstep(rawT);
    const spinRate = event?.kind === 'Heart Supernova' ? 0 : event?.kind === 'Made in Heaven' ? 1.1 + t * 8.4 : 0.11;
    this.root.rotation.z += dt * spinRate;
    this.root.position.z = 70;

    if (this.core) this.core.scale.setScalar(1 + Math.sin(timer * 5) * 0.035 + t * 0.18);
    if (this.particles) {
      this.particles.rotation.y += dt * (0.2 + t * 0.75);
      this.particles.rotation.z -= dt * 0.12;
      this.particles.scale.setScalar(1 + t * 1.45);
    }
    for (let i = 0; i < this.rings.length; i += 1) {
      const ring = this.rings[i];
      ring.rotation.z += dt * (0.38 + i * 0.08);
      ring.rotation.x += dt * 0.045;
      ring.scale.setScalar(1 + t * (0.45 + i * 0.07));
    }
    this.updateStaged(rawT);
    this.updatePulses(timer, rawT);
    this.updateDancers(timer, rawT);
  }

  private build(event: WorldEvent | null, special: Trackable | null) {
    this.root.clear();
    this.root.rotation.set(0, 0, 0);
    this.rings = [];
    this.staged = [];
    this.pulseTargets = [];
    this.dancers = [];
    this.core = undefined;
    this.particles = undefined;

    const tint = event?.color ?? special?.color ?? COLORS.cyan;
    const kind = event?.kind ?? special?.kind ?? 'Special';

    const glowSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowTexture(41, tint),
        color: tint,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    glowSprite.scale.set(42, 42, 1);
    this.root.add(glowSprite);

    if (event) {
      this.buildEventCinematic(event);
      return;
    }

    if (special) {
      this.buildSpecialCinematic(special);
      return;
    }
  }

  private seedForKey(key: string, salt = 0) {
    let hash = 2166136261 + salt;
    for (let i = 0; i < key.length; i += 1) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private cinematicGlow(tint: number, size: number, opacity: number) {
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowTexture(91, tint),
        color: tint,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    glow.scale.set(size, size, 1);
    return glow;
  }

  private addCinematicRays(count: number, inner: number, outer: number, tint: number, seed: number, flatten = 0.7, opacity = 0.66) {
    const rays = makeRadialRays(count, inner, outer, tint, seed, flatten, opacity);
    this.root.add(rays);
  }

  private stage<T extends THREE.Object3D>(obj: T, start: number, end: number, scaleFrom = 0.9, scaleTo = 1.2) {
    obj.userData.stage = { start, end, scaleFrom, scaleTo, baseScale: obj.scale.clone() };
    this.staged.push(obj);
    return obj;
  }

  private setAlpha(obj: THREE.Object3D, alpha: number) {
    obj.traverse((child) => {
      const material = (child as THREE.Mesh | THREE.Points | THREE.Sprite).material;
      const materials = Array.isArray(material) ? material : material ? [material] : [];
      for (const mat of materials) {
        const fadeMat = mat as THREE.Material & { opacity?: number; userData: { baseOpacity?: number } };
        if (typeof fadeMat.opacity !== 'number') continue;
        if (fadeMat.userData.baseOpacity === undefined) fadeMat.userData.baseOpacity = fadeMat.opacity;
        fadeMat.transparent = true;
        fadeMat.opacity = fadeMat.userData.baseOpacity * alpha;
      }
    });
  }

  private updateStaged(t: number) {
    for (const obj of this.staged) {
      const stage = obj.userData.stage as { start: number; end: number; scaleFrom: number; scaleTo: number; baseScale: THREE.Vector3 };
      const fade = Math.min(0.16, Math.max(0.055, (stage.end - stage.start) * 0.32));
      const fadeIn = smoothstep((t - stage.start) / fade);
      const fadeOut = stage.end > 1 ? 1 : 1 - smoothstep((t - (stage.end - fade)) / fade);
      const alpha = THREE.MathUtils.clamp(Math.min(fadeIn, fadeOut), 0, 1);
      obj.visible = alpha > 0.015;
      this.setAlpha(obj, alpha);
      const local = THREE.MathUtils.clamp((t - stage.start) / Math.max(0.001, stage.end - stage.start), 0, 1);
      const scale = THREE.MathUtils.lerp(stage.scaleFrom, stage.scaleTo, smoothstep(local));
      obj.scale.copy(stage.baseScale).multiplyScalar(scale);
    }
  }

  private pulse<T extends THREE.Object3D>(obj: T, start: number, end: number, amplitude = 0.08, speed = 8) {
    obj.userData.pulse = { start, end, amplitude, speed, baseScale: obj.scale.clone() };
    this.pulseTargets.push(obj);
    return obj;
  }

  private dancer<T extends THREE.Object3D>(obj: T, start: number, end: number, radiusFrom: number, radiusTo: number, speed: number, side: -1 | 1, flatten = 0.42) {
    obj.userData.dance = { start, end, radiusFrom, radiusTo, speed, side, flatten };
    this.dancers.push(obj);
    return obj;
  }

  private updatePulses(timer: number, t: number) {
    for (const obj of this.pulseTargets) {
      const pulse = obj.userData.pulse as { start: number; end: number; amplitude: number; speed: number; baseScale: THREE.Vector3 };
      const fade = 0.08;
      const active = smoothstep((t - pulse.start) / fade) * (1 - smoothstep((t - pulse.end) / fade));
      const beat = 1 + Math.sin(timer * pulse.speed) * pulse.amplitude * active;
      obj.scale.copy(pulse.baseScale).multiplyScalar(beat);
    }
  }

  private updateDancers(timer: number, t: number) {
    for (const obj of this.dancers) {
      const dance = obj.userData.dance as { start: number; end: number; radiusFrom: number; radiusTo: number; speed: number; side: -1 | 1; flatten: number };
      const local = THREE.MathUtils.clamp((t - dance.start) / Math.max(0.001, dance.end - dance.start), 0, 1);
      const eased = smoothstep(local);
      const radius = THREE.MathUtils.lerp(dance.radiusFrom, dance.radiusTo, eased);
      const angle = timer * dance.speed + (dance.side < 0 ? 0 : Math.PI);
      obj.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * dance.flatten, Math.sin(angle * 1.7) * radius * 0.08);
      obj.rotation.z = angle * 0.6;
    }
  }

  private addStage<T extends THREE.Object3D>(obj: T, start: number, end: number, scaleFrom = 0.9, scaleTo = 1.2) {
    this.root.add(this.stage(obj, start, end, scaleFrom, scaleTo));
    return obj;
  }

  private luminousCore(radius: number, tint: number, opacity = 0.92) {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius, 72, 36),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
  }

  private ringSet(tint: number, count: number, base: number, step: number, opacity: number, flatten = 0.55) {
    const group = new THREE.Group();
    for (let i = 0; i < count; i += 1) {
      const ring = this.cinematicRing(base + i * step, 0.035 + i * 0.002, i % 3 === 1 ? mixHex(tint, COLORS.white, 0.38) : tint, Math.max(0.045, opacity - i * 0.032));
      ring.scale.y = flatten + i * 0.012;
      ring.rotation.z = i * 0.21;
      group.add(ring);
    }
    return group;
  }

  private heartBurst(count: number, seed: number, inner: number, outer: number) {
    const group = new THREE.Group();
    const rand = seeded(seed);
    const palette = [COLORS.pink, COLORS.purple, 0xff5ec8, 0xdb64ff, COLORS.gold, COLORS.softWhite];
    for (let i = 0; i < count; i += 1) {
      const a = rand() * Math.PI * 2;
      const radius = inner + Math.pow(rand(), 0.72) * (outer - inner);
      const flatten = 0.62 + rand() * 0.32;
      const tint = palette[Math.floor(rand() * palette.length)];
      const heart = makeHeartMesh(tint, 0.74 + rand() * 1.45);
      heart.position.set(Math.cos(a) * radius, Math.sin(a) * radius * flatten, (rand() - 0.5) * 15);
      heart.rotation.set((rand() - 0.5) * 0.55, (rand() - 0.5) * 0.55, a + Math.PI / 2 + (rand() - 0.5) * 0.8);
      group.add(heart);

      const trailStart = new THREE.Vector3(Math.cos(a) * inner * 0.55, Math.sin(a) * inner * flatten * 0.55, -0.5);
      const trailEnd = new THREE.Vector3(Math.cos(a) * radius * 0.86, Math.sin(a) * radius * flatten * 0.86, heart.position.z - 0.5);
      group.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([trailStart, trailEnd]),
          new THREE.LineBasicMaterial({
            color: tint,
            transparent: true,
            opacity: 0.34 + rand() * 0.28,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        )
      );
    }
    return group;
  }

  private infallVortex(seed: number, radius: number, tint: number, count = 240) {
    const rand = seeded(seed);
    const group = new THREE.Group();
    const palette = [tint, COLORS.white, COLORS.cyan, COLORS.gold, COLORS.pink, COLORS.purple];
    for (let stream = 0; stream < count; stream += 1) {
      const pts: THREE.Vector3[] = [];
      const base = rand() * Math.PI * 2;
      const turns = 1.3 + rand() * 2.9;
      const height = (rand() - 0.5) * radius * 0.4;
      for (let i = 0; i < 28; i += 1) {
        const u = i / 27;
        const r = radius * (1 - u) ** 1.1 + 3 * u;
        const a = base + turns * u * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.58 + height * (1 - u), (rand() - 0.5) * radius * 0.14 * (1 - u)));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: palette[Math.floor(rand() * palette.length)],
          transparent: true,
          opacity: 0.22 + rand() * 0.42,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      group.add(line);
    }
    return group;
  }

  private streakField(count: number, seed: number, radius: number, length: number, tint: number, opacity = 0.62, slant = 0.35) {
    const rand = seeded(seed);
    const positions: number[] = [];
    const colors: number[] = [];
    const palette = [tint, mixHex(tint, COLORS.white, 0.42), COLORS.white, COLORS.gold, COLORS.purple];
    for (let i = 0; i < count; i += 1) {
      const x = (rand() - 0.5) * radius * 2;
      const y = (rand() - 0.5) * radius * 1.15;
      const z = (rand() - 0.5) * radius * 0.5;
      const fall = length * (0.55 + rand());
      positions.push(x, y, z, x + fall * slant * (0.45 + rand()), y - fall, z + (rand() - 0.5) * length * 0.12);
      const c = new THREE.Color(palette[Math.floor(rand() * palette.length)]);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
  }

  private crackedCinematicPlanet(size: number, base: number, accent: number, seed: number) {
    const group = new THREE.Group();
    const planet = this.cinematicPlanet(size, base, seed);
    group.add(planet);
    const rand = seeded(seed + 44);
    for (let i = 0; i < 34; i += 1) {
      const a = rand() * Math.PI * 2;
      const r0 = size * (0.24 + rand() * 0.18);
      const r1 = size * (0.62 + rand() * 0.35);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0 * 0.82, size * 0.72),
          new THREE.Vector3(Math.cos(a + (rand() - 0.5) * 0.42) * r1, Math.sin(a) * r1 * 0.82, size * 0.78)
        ]),
        new THREE.LineBasicMaterial({
          color: i % 4 === 0 ? COLORS.white : accent,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      group.add(line);
    }
    return group;
  }

  private buildLoveCinematic(event: WorldEvent, tint: number, seed: number) {
    const intro = new THREE.Group();
    const introHeart = this.pulse(makeHeartMesh(tint, 14.5), 0, 0.5, 0.075, 10);
    introHeart.rotation.z = 0.02;
    intro.add(this.cinematicGlow(tint, 76, 0.34), this.cinematicGlow(COLORS.purple, 52, 0.16), this.cinematicGlow(COLORS.gold, 40, 0.12), introHeart, this.ringSet(COLORS.gold, 8, 8.5, 1.55, 0.28, 0.78));
    intro.add(makeParticleCloud(1000, 25, mixHex(tint, COLORS.white, 0.18), seed + 102, 0.42, 0.105));
    this.addStage(intro, 0, 0.5, 0.82, 1.02);

    const pulse = new THREE.Group();
    pulse.add(this.cinematicGlow(tint, 96, 0.36), this.cinematicGlow(COLORS.purple, 72, 0.18));
    const pulseHeart = this.pulse(makeHeartMesh(mixHex(tint, COLORS.gold, 0.16), 18.5), 0.18, 0.68, 0.12, 13);
    pulseHeart.position.z = 0.6;
    pulse.add(this.luminousCore(4.8, COLORS.white, 0.5), pulseHeart);
    pulse.add(makeRadialRays(180, 7, 42, COLORS.pink, seed + 104, 0.72, 0.45));
    pulse.add(this.ringSet(tint, 12, 8, 1.9, 0.46, 0.68));
    this.addStage(pulse, 0.18, 0.63, 0.64, 1.24);

    const bloom = new THREE.Group();
    bloom.add(this.cinematicGlow(tint, 142, 0.3), this.cinematicGlow(COLORS.purple, 110, 0.18), this.cinematicGlow(COLORS.gold, 84, 0.12));
    bloom.add(makeRadialRays(420, 4, 78, COLORS.pink, seed + 105, 0.82, 0.78));
    bloom.add(this.heartBurst(78, seed + 106, 12, 66));
    bloom.add(makeParticleCloud(2800, 54, COLORS.purple, seed + 107, 0.64, 0.12));
    this.addStage(bloom, 0.48, 0.88, 0.16, 1.42);

    const finale = new THREE.Group();
    finale.add(this.cinematicGlow(tint, 128, 0.32), this.cinematicGlow(COLORS.gold, 96, 0.2), this.cinematicGlow(COLORS.purple, 86, 0.12));
    const finaleHeart = this.pulse(makeHeartMesh(tint, 30), 0.72, 1, 0.035, 7);
    finaleHeart.position.z = -2.2;
    finale.add(finaleHeart, this.ringSet(COLORS.gold, 14, 13, 2.1, 0.46, 0.72));
    finale.add(makeRadialRays(230, 7, 64, tint, seed + 109, 0.76, 0.38));
    finale.add(this.heartBurst(34, seed + 111, 26, 56));
    finale.add(makeParticleCloud(1600, 56, mixHex(tint, COLORS.white, 0.18), seed + 110, 0.58, 0.095));
    const initials = makeCinemaTextSprite('Z + M', COLORS.gold, 1024, 320);
    initials.position.set(0, -0.25, 2.5);
    initials.scale.set(50, 15.5, 1);
    (initials.material as THREE.SpriteMaterial).depthTest = false;
    finale.add(initials);
    this.addStage(finale, 0.72, 1.25, 0.82, 1.03);
  }

  private buildNovaCinematic(event: WorldEvent, tint: number, seed: number, hypernova: boolean) {
    const isZahraNova = event.name.toLowerCase().includes('xosupa');
    const primary = isZahraNova ? COLORS.pink : tint;
    const secondary = hypernova ? COLORS.gold : isZahraNova ? COLORS.gold : mixHex(tint, COLORS.white, 0.28);
    const violet = isZahraNova ? COLORS.purple : tint;

    const ignition = new THREE.Group();
    ignition.add(this.cinematicGlow(primary, hypernova ? 84 : 70, 0.28), this.cinematicGlow(secondary, hypernova ? 52 : 42, 0.16));
    ignition.add(this.luminousCore(hypernova ? 5.5 : 4.6, COLORS.white, 0.9));
    ignition.add(this.ringSet(secondary, hypernova ? 10 : 7, 7.2, 1.55, 0.36, 0.68));
    ignition.add(makeParticleCloud(hypernova ? 1900 : 1500, hypernova ? 30 : 24, primary, seed + 201, 0.58, 0.13));
    this.addStage(ignition, 0, 0.42, 0.72, 1.08);

    const detonation = new THREE.Group();
    detonation.add(this.cinematicGlow(primary, hypernova ? 132 : 108, 0.32), this.cinematicGlow(COLORS.white, hypernova ? 60 : 48, 0.22));
    detonation.add(makeRadialRays(hypernova ? 420 : 330, 5, hypernova ? 78 : 62, isZahraNova ? primary : secondary, seed + 202, 0.76, 0.86));
    detonation.add(makeParticleCloud(hypernova ? 5200 : 4300, hypernova ? 56 : 48, primary, seed + 203, 0.72, 0.17));
    detonation.add(this.ringSet(primary, hypernova ? 13 : 9, 9, 2.2, 0.5, 0.58));
    if (hypernova) detonation.add(makeLoopField(18, 27, COLORS.gold, seed + 204, 0.5));
    if (isZahraNova) {
      detonation.add(makeRadialRays(180, 4, 56, COLORS.gold, seed + 205, 0.82, 0.44));
      detonation.add(makeHeartParticleField(1500, 30, COLORS.gold, seed + 206, 0.1));
      detonation.add(makeParticleCloud(1800, 48, COLORS.purple, seed + 207, 0.68, 0.12));
    }
    this.addStage(detonation, 0.25, 0.82, 0.28, hypernova ? 1.55 : 1.38);

    const remnant = new THREE.Group();
    remnant.add(this.cinematicGlow(violet, hypernova ? 110 : 92, 0.22), this.cinematicGlow(secondary, hypernova ? 88 : 70, 0.13));
    remnant.add(makeSpiralArms(hypernova ? 11 : 8, 210, hypernova ? 45 : 37, secondary, seed + 206, 0.58));
    remnant.add(makeParticleCloud(hypernova ? 4200 : 3300, hypernova ? 58 : 46, violet, seed + 207, 0.66, 0.14));
    remnant.add(this.ringSet(secondary, hypernova ? 16 : 11, 10, 1.85, 0.38, 0.52));
    this.addStage(remnant, 0.64, 1.22, 0.78, 1.08);
  }

  private buildBlackHoleCinematic(event: WorldEvent, tint: number, seed: number) {
    const kind = event.kind;
    const isQuasar = kind === 'Quasar';
    const isTidal = kind === 'Tidal Disruption';
    const isSupermassive = kind === 'Supermassive Black Hole';

    const lens = new THREE.Group();
    lens.add(this.cinematicGlow(tint, isSupermassive ? 132 : 88, 0.18), this.cinematicGlow(COLORS.cyan, isSupermassive ? 82 : 60, 0.09));
    lens.add(makeParticleCloud(isSupermassive ? 4200 : 1900, isSupermassive ? 64 : 38, mixHex(tint, COLORS.white, 0.16), seed + 301, 0.32, 0.12));
    if (isSupermassive) {
      const lensLoops = makeLoopField(34, 42, mixHex(tint, COLORS.cyan, 0.36), seed + 331, 0.2);
      lensLoops.scale.set(1.36, 0.74, 0.72);
      lens.add(lensLoops);
    }
    if (isTidal) {
      lens.add(makeParticleTidalBridge(30, COLORS.gold, tint, seed + 302, 1900));
    } else {
      lens.add(makeVolumetricGalaxyDisc(isSupermassive ? 30 : 24, mixHex(tint, COLORS.cyan, 0.38), seed + 302, 5, isSupermassive ? 3200 : 2200, 0.24));
    }
    this.addStage(lens, 0, 0.62, 0.76, 1.16);

    const disk = new THREE.Group();
    for (let i = 0; i < (isSupermassive ? 30 : 18); i += 1) {
      const ringTint = i % 4 === 0 ? COLORS.white : i % 3 === 0 ? COLORS.cyan : i % 2 ? COLORS.gold : mixHex(tint, COLORS.white, 0.26);
      const ring = this.cinematicRing(6.6 + i * (isSupermassive ? 1.02 : 1.4), 0.035 + i * 0.0012, ringTint, Math.max(0.08, 0.68 - i * 0.019));
      ring.scale.y = 0.2 + i * 0.007;
      ring.rotation.z = i * 0.11;
      ring.userData.spinZ = i % 2 ? -0.38 - i * 0.006 : 0.5 + i * 0.008;
      disk.add(ring);
    }
    const photon = this.cinematicRing(5.8, 0.09, COLORS.white, 0.88);
    photon.scale.y = 0.56;
    disk.add(photon);
    disk.add(new THREE.Mesh(new THREE.SphereGeometry(isSupermassive ? 6.2 : 5.3, 80, 40), new THREE.MeshBasicMaterial({ color: COLORS.black })));
    disk.add(this.cinematicGlow(COLORS.purple, isSupermassive ? 58 : 36, 0.17));
    if (isSupermassive) {
      disk.add(makeParticleCloud(3400, 42, mixHex(tint, COLORS.white, 0.28), seed + 332, 0.26, 0.12));
      disk.add(makeDiamondShardField(160, 34, COLORS.softWhite, seed + 334, 0.08));
    }
    this.addStage(disk, 0.08, 1.15, 0.58, 1.08);

    const infall = new THREE.Group();
    if (isTidal) {
      infall.add(makeRadialRays(210, 5, 64, COLORS.gold, seed + 303, 0.28, 0.78));
    } else {
      infall.add(this.ringSet(mixHex(tint, COLORS.white, 0.26), isSupermassive ? 28 : 14, 8.5, isSupermassive ? 1.72 : 2.15, 0.28, 0.42));
      infall.add(makeVolumetricGalaxyDisc(isSupermassive ? 34 : 26, mixHex(tint, COLORS.white, 0.18), seed + 333, 6, isSupermassive ? 4200 : 2600, 0.18));
      if (isSupermassive) {
        const warpedDisk = makeVolumetricGalaxyDisc(48, mixHex(tint, COLORS.cyan, 0.24), seed + 335, 9, 7600, 0.14);
        warpedDisk.scale.set(1.28, 0.42, 0.36);
        infall.add(warpedDisk);
      }
    }
    infall.add(makeParticleCloud(isSupermassive ? 5200 : 2300, isSupermassive ? 66 : 42, tint, seed + 304, 0.3, 0.13));
    this.addStage(infall, 0.3, 0.88, 0.42, 1.62);

    if (isQuasar || isSupermassive) {
      const jets = new THREE.Group();
      jets.add(this.cinematicBeam(isSupermassive ? 162 : 128, isSupermassive ? 0.92 : 0.88, COLORS.cyan, isSupermassive ? 0.26 : 0.4));
      jets.add(this.cinematicBeam(isSupermassive ? 166 : 130, isSupermassive ? 0.16 : 0.24, COLORS.white, 0.58));
      const counterJet = this.cinematicBeam(isSupermassive ? 142 : 122, isSupermassive ? 0.32 : 0.2, mixHex(tint, COLORS.cyan, 0.44), 0.25);
      counterJet.rotation.z = Math.PI / 2;
      jets.add(counterJet);
      jets.add(makeParticleCloud(isSupermassive ? 3600 : 1300, isSupermassive ? 54 : 30, COLORS.cyan, seed + 305, 0.2, 0.13));
      jets.add(this.ringSet(COLORS.white, isSupermassive ? 24 : 10, isSupermassive ? 10 : 7.5, isSupermassive ? 2.05 : 2.8, 0.2, 0.52));
      this.addStage(jets, 0.36, 1.16, 0.18, isSupermassive ? 1.36 : 1.16);
    }

    const scar = new THREE.Group();
    scar.add(this.cinematicGlow(tint, isSupermassive ? 112 : 78, 0.14), this.ringSet(mixHex(tint, COLORS.white, 0.2), isSupermassive ? 22 : 14, 11, isSupermassive ? 1.65 : 2.2, 0.24, 0.5));
    if (isSupermassive) {
      scar.add(makeVolumetricGalaxyDisc(46, mixHex(tint, COLORS.cyan, 0.2), seed + 336, 8, 6400, 0.16));
      scar.add(makeLoopField(26, 36, COLORS.softWhite, seed + 337, 0.14));
    }
    this.addStage(scar, 0.68, 1.22, 0.8, 1.04);
  }

  private buildGalaxyCollisionCinematic(event: WorldEvent, tint: number, seed: number) {
    const approach = new THREE.Group();
    const left = makeSoftGalaxyDisc(24, COLORS.cyan, seed + 401);
    const right = makeSoftGalaxyDisc(23, COLORS.gold, seed + 402);
    left.position.set(-48, 7, 0);
    right.position.set(48, -6, 0);
    left.rotation.z = -0.62;
    right.rotation.z = 0.66;
    approach.add(left, right, this.cinematicGlow(mixHex(tint, COLORS.gold, 0.45), 118, 0.16), this.cinematicGlow(COLORS.cyan, 90, 0.12));
    approach.add(makeParticleCloud(2600, 68, mixHex(COLORS.cyan, COLORS.gold, 0.5), seed + 403, 0.2, 0.08));
    this.addStage(approach, 0, 0.5, 0.82, 1.02);

    const tidal = new THREE.Group();
    const leftTorn = makeSoftGalaxyDisc(25, COLORS.cyan, seed + 404);
    const rightTorn = makeSoftGalaxyDisc(24, COLORS.gold, seed + 405);
    leftTorn.position.set(-24, 5, 0);
    rightTorn.position.set(24, -4, 0);
    leftTorn.rotation.z = -0.15;
    rightTorn.rotation.z = 0.2;
    tidal.add(leftTorn, rightTorn, this.cinematicGlow(tint, 132, 0.24), this.cinematicGlow(COLORS.gold, 92, 0.16), this.cinematicGlow(COLORS.cyan, 80, 0.14));
    tidal.add(makeParticleTidalBridge(44, COLORS.cyan, COLORS.gold, seed + 411, 5200));
    tidal.add(makeVolumetricGalaxyDisc(46, mixHex(tint, COLORS.white, 0.18), seed + 406, 8, 6800, 0.2));
    tidal.add(makeParticleCloud(7600, 74, mixHex(tint, COLORS.gold, 0.24), seed + 407, 0.36, 0.12));
    tidal.add(this.ringSet(COLORS.gold, 14, 12, 2.55, 0.26, 0.44));
    this.addStage(tidal, 0.24, 0.78, 0.56, 1.2);

    const impact = new THREE.Group();
    impact.add(this.cinematicGlow(COLORS.white, 112, 0.28), this.cinematicGlow(tint, 178, 0.36), this.cinematicGlow(COLORS.gold, 148, 0.22));
    impact.add(this.luminousCore(6.8, COLORS.white, 0.94));
    impact.add(makeRadialRays(680, 4, 104, COLORS.gold, seed + 408, 0.62, 0.88));
    impact.add(makeRadialRays(360, 5, 96, COLORS.cyan, seed + 409, 0.54, 0.62));
    impact.add(makeParticleCloud(9200, 82, mixHex(tint, COLORS.gold, 0.4), seed + 410, 0.44, 0.13));
    impact.add(this.ringSet(COLORS.white, 12, 8, 3.9, 0.36, 0.38));
    this.addStage(impact, 0.46, 0.9, 0.12, 1.66);

    const remnant = new THREE.Group();
    remnant.add(this.cinematicGlow(mixHex(tint, COLORS.gold, 0.36), 138, 0.26), this.cinematicGlow(COLORS.cyan, 92, 0.14));
    remnant.add(makeMergedGalaxyRemnant(42, tint, seed + 412));
    remnant.add(makeParticleTidalBridge(54, COLORS.cyan, COLORS.gold, seed + 413, 4600));
    remnant.add(makeParticleCloud(7800, 78, mixHex(COLORS.gold, COLORS.white, 0.36), seed + 414, 0.38, 0.12));
    remnant.add(this.ringSet(mixHex(tint, COLORS.gold, 0.55), 20, 9.5, 2.25, 0.4, 0.42));
    this.addStage(remnant, 0.68, 1.24, 0.76, 1.1);
  }

  private buildPlanetCollisionCinematic(event: WorldEvent, seed: number) {
    const approach = new THREE.Group();
    const blue = this.cinematicPlanet(5.2, COLORS.blue, seed + 421);
    const orange = this.cinematicPlanet(5.9, COLORS.orange, seed + 422);
    blue.position.x = -18;
    orange.position.x = 18;
    approach.add(this.cinematicGlow(COLORS.orange, 82, 0.12), blue, orange);
    approach.add(this.streakField(160, seed + 423, 42, 7, COLORS.gold, 0.24, 0.08));
    this.addStage(approach, 0, 0.42, 1.0, 0.52);

    const impact = new THREE.Group();
    impact.add(this.cinematicGlow(COLORS.white, 70, 0.26), this.cinematicGlow(COLORS.orange, 124, 0.34), this.luminousCore(5.4, COLORS.white, 0.86));
    impact.add(makeRadialRays(360, 4, 76, COLORS.orange, seed + 424, 0.78, 0.82));
    impact.add(makeParticleCloud(5000, 54, COLORS.orange, seed + 425, 0.64, 0.16));
    impact.add(makeDiamondShardField(180, 38, COLORS.gold, seed + 426, 0.17));
    impact.add(this.ringSet(COLORS.gold, 11, 9, 2.25, 0.42, 0.5));
    this.addStage(impact, 0.28, 0.82, 0.22, 1.46);

    const aftermath = new THREE.Group();
    const molten = this.crackedCinematicPlanet(8.8, COLORS.orange, COLORS.yellow, seed + 427);
    aftermath.add(this.cinematicGlow(COLORS.red, 82, 0.26), this.cinematicGlow(COLORS.gold, 70, 0.14), molten);
    aftermath.add(makeParticleCloud(2600, 38, COLORS.gold, seed + 428, 0.42, 0.12));
    aftermath.add(this.ringSet(COLORS.gold, 15, 8.5, 1.35, 0.36, 0.42));
    this.addStage(aftermath, 0.62, 1.2, 0.78, 1.04);
  }

  private buildNeutronCinematic(event: WorldEvent, tint: number, seed: number) {
    const inspiral = new THREE.Group();
    const starA = this.dancer(this.pulse(this.luminousCore(3.3, COLORS.cyan, 0.96), 0, 0.62, 0.08, 13), 0, 0.58, 25, 4.2, 7.8, -1, 0.46);
    const starB = this.dancer(this.pulse(this.luminousCore(3.05, COLORS.softWhite, 0.94), 0, 0.58, 0.07, 12), 0, 0.58, 25, 4.2, 7.8, 1, 0.46);
    inspiral.add(this.cinematicGlow(COLORS.cyan, 86, 0.2), this.cinematicGlow(COLORS.gold, 54, 0.08), starA, starB);
    inspiral.add(makeVolumetricGalaxyDisc(24, mixHex(COLORS.cyan, COLORS.white, 0.26), seed + 437, 5, 3000, 0.13));
    inspiral.add(makeParticleCloud(3600, 40, tint, seed + 438, 0.26, 0.075));
    inspiral.add(makeParticleCloud(1100, 30, COLORS.softWhite, seed + 531, 0.18, 0.06));
    this.addStage(inspiral, 0, 0.64, 1.08, 0.62);

    const merger = new THREE.Group();
    merger.add(this.cinematicGlow(COLORS.white, 118, 0.36), this.cinematicGlow(tint, 148, 0.3), this.cinematicGlow(COLORS.gold, 92, 0.16), this.luminousCore(6.4, COLORS.white, 0.95));
    merger.add(makeRadialRays(470, 4, 88, COLORS.cyan, seed + 432, 0.52, 0.86));
    merger.add(makeRadialRays(340, 4, 82, COLORS.gold, seed + 433, 0.46, 0.68));
    merger.add(makeParticleCloud(6200, 62, tint, seed + 434, 0.58, 0.14));
    merger.add(this.ringSet(COLORS.white, 16, 8, 2.6, 0.34, 0.5));
    this.addStage(merger, 0.38, 0.84, 0.18, 1.58);

    const remnant = new THREE.Group();
    remnant.add(this.cinematicGlow(COLORS.purple, 132, 0.25), this.cinematicGlow(COLORS.gold, 94, 0.18));
    remnant.add(makeVolumetricGalaxyDisc(48, mixHex(COLORS.purple, COLORS.white, 0.18), seed + 435, 7, 6200, 0.28));
    remnant.add(makeParticleCloud(5400, 62, COLORS.purple, seed + 436, 0.56, 0.12));
    remnant.add(makeParticleCloud(2200, 48, COLORS.gold, seed + 439, 0.42, 0.09));
    remnant.add(makeParticleCloud(2200, 76, mixHex(tint, COLORS.white, 0.36), seed + 532, 0.18, 0.055));
    this.addStage(remnant, 0.64, 1.22, 0.68, 1.08);
  }

  private buildKilonovaCinematic(event: WorldEvent, tint: number, seed: number) {
    const preflash = new THREE.Group();
    const primary = this.dancer(this.luminousCore(3.2, COLORS.white, 0.92), 0, 0.52, 14, 2.5, 5.4, -1, 0.28);
    const secondary = this.dancer(this.luminousCore(2.9, COLORS.gold, 0.88), 0, 0.52, 14, 2.5, 5.4, 1, 0.28);
    preflash.add(this.cinematicGlow(COLORS.purple, 92, 0.2), this.cinematicGlow(COLORS.gold, 78, 0.16), primary, secondary);
    preflash.add(makeParticleCloud(3600, 42, mixHex(COLORS.purple, COLORS.gold, 0.28), seed + 601, 0.24, 0.065));
    preflash.add(makeParticleCloud(1600, 26, COLORS.softWhite, seed + 609, 0.14, 0.045));
    preflash.add(makeDiamondShardField(130, 28, COLORS.gold, seed + 602, 0.12));
    preflash.add(this.ringSet(COLORS.gold, 9, 5.6, 1.7, 0.24, 0.42));
    this.addStage(preflash, 0, 0.42, 0.94, 1.04);

    const flash = new THREE.Group();
    flash.add(this.cinematicGlow(COLORS.white, 140, 0.44), this.cinematicGlow(COLORS.purple, 178, 0.34), this.cinematicGlow(COLORS.gold, 154, 0.32));
    flash.add(this.luminousCore(7.2, COLORS.white, 0.98));
    const polarA = this.cinematicBeam(148, 0.56, COLORS.purple, 0.32);
    polarA.rotation.z = Math.PI / 2;
    const polarB = this.cinematicBeam(142, 0.32, COLORS.gold, 0.3);
    polarB.rotation.z = Math.PI / 2;
    polarB.rotation.y = 0.18;
    const polarHot = this.cinematicBeam(156, 0.12, COLORS.white, 0.5);
    polarHot.rotation.z = Math.PI / 2;
    flash.add(polarA, polarB, polarHot);
    flash.add(makeRadialRays(430, 4, 96, COLORS.gold, seed + 603, 0.42, 0.72));
    flash.add(makeRadialRays(320, 4, 88, COLORS.purple, seed + 613, 0.38, 0.6));
    flash.add(makeParticleCloud(7200, 72, mixHex(COLORS.purple, COLORS.gold, 0.38), seed + 604, 0.54, 0.12));
    flash.add(makeDiamondShardField(260, 62, COLORS.gold, seed + 614, 0.17));
    flash.add(this.ringSet(COLORS.white, 15, 8, 2.45, 0.32, 0.48));
    this.addStage(flash, 0.22, 0.78, 0.12, 1.7);

    const cocoon = new THREE.Group();
    cocoon.add(this.cinematicGlow(COLORS.purple, 158, 0.28), this.cinematicGlow(COLORS.gold, 148, 0.24), this.cinematicGlow(COLORS.white, 78, 0.12));
    const ejecta = makeVolumetricGalaxyDisc(62, mixHex(COLORS.purple, COLORS.gold, 0.34), seed + 605, 12, 12000, 0.2);
    ejecta.scale.set(1.72, 0.78, 0.58);
    cocoon.add(ejecta);
    cocoon.add(makeParticleCloud(7600, 78, COLORS.purple, seed + 606, 0.54, 0.1));
    cocoon.add(makeParticleCloud(5600, 68, COLORS.gold, seed + 607, 0.44, 0.08));
    cocoon.add(makeParticleCloud(2200, 96, COLORS.softWhite, seed + 617, 0.16, 0.045));
    cocoon.add(makeDiamondShardField(340, 70, COLORS.gold, seed + 608, 0.14));
    cocoon.add(this.ringSet(COLORS.gold, 18, 9.5, 2.2, 0.24, 0.44));
    this.addStage(cocoon, 0.55, 1.24, 0.56, 1.18);

    const remnant = new THREE.Group();
    remnant.add(this.cinematicGlow(COLORS.purple, 134, 0.22), this.cinematicGlow(COLORS.gold, 116, 0.2));
    const shell = makeVolumetricGalaxyDisc(48, mixHex(COLORS.gold, COLORS.white, 0.22), seed + 621, 9, 8200, 0.18);
    shell.scale.set(1.9, 0.52, 0.42);
    remnant.add(shell, makeDiamondShardField(220, 54, COLORS.gold, seed + 622, 0.11));
    remnant.add(makeParticleCloud(3600, 62, mixHex(COLORS.purple, COLORS.white, 0.24), seed + 623, 0.42, 0.08));
    this.addStage(remnant, 0.78, 1.32, 0.62, 0.98);
  }

  private buildWormholeCinematic(event: WorldEvent, tint: number, seed: number) {
    const aperture = new THREE.Group();
    aperture.add(this.cinematicGlow(tint, 122, 0.24), this.cinematicGlow(COLORS.cyan, 96, 0.18), this.cinematicGlow(COLORS.purple, 136, 0.13));
    const throat = new THREE.Mesh(
      new THREE.SphereGeometry(8.8, 72, 36),
      new THREE.MeshBasicMaterial({ color: COLORS.black, transparent: true, opacity: 0.98 })
    );
    throat.scale.set(1, 0.38, 1);
    aperture.add(throat);
    for (let i = 0; i < 34; i += 1) {
      const ring = this.cinematicRing(5.4 + i * 0.78, 0.045 + i * 0.0015, i % 2 ? COLORS.cyan : tint, 0.78 - i * 0.018);
      ring.rotation.x = Math.PI / 2 + Math.sin(i * 0.42) * 0.18;
      ring.rotation.y = Math.cos(i * 0.3) * 0.16;
      ring.rotation.z = i * 0.28;
      ring.position.z = -i * 0.18;
      this.rings.push(ring);
      aperture.add(ring);
    }
    aperture.add(makeParticleCloud(3200, 52, mixHex(tint, COLORS.cyan, 0.36), seed + 701, 0.38, 0.09));
    aperture.add(makeParticleCloud(1400, 72, COLORS.softWhite, seed + 702, 0.18, 0.045));
    this.addStage(aperture, 0, 0.58, 0.66, 1.2);

    const lens = new THREE.Group();
    lens.add(this.cinematicGlow(COLORS.cyan, 132, 0.16), this.ringSet(COLORS.cyan, 18, 8, 2.2, 0.28, 0.44), this.ringSet(COLORS.purple, 14, 10, 2.5, 0.22, 0.58));
    for (let ribbon = 0; ribbon < 12; ribbon += 1) {
      const points: THREE.Vector3[] = [];
      const phase = (ribbon / 12) * Math.PI * 2;
      for (let k = 0; k < 150; k += 1) {
        const u = k / 149;
        const radius = 7 + u * 56;
        const twist = phase + u * Math.PI * (3.2 + ribbon * 0.12);
        points.push(new THREE.Vector3(Math.cos(twist) * radius, Math.sin(twist) * radius * 0.46, -u * 48 + Math.sin(u * Math.PI * 3 + phase) * 4));
      }
      lens.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color: ribbon % 3 === 0 ? COLORS.softWhite : ribbon % 2 ? COLORS.purple : COLORS.cyan,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
        )
      );
    }
    lens.add(makeRadialRays(260, 8, 86, COLORS.cyan, seed + 703, 0.5, 0.5));
    this.addStage(lens, 0.18, 0.9, 0.32, 1.46);

    const transit = new THREE.Group();
    transit.add(this.cinematicGlow(COLORS.white, 128, 0.28), this.cinematicGlow(COLORS.cyan, 160, 0.26));
    const tunnel = this.cinematicBeam(138, 2.2, COLORS.cyan, 0.18);
    tunnel.rotation.x = Math.PI / 2;
    const hotThread = this.cinematicBeam(152, 0.18, COLORS.white, 0.36);
    hotThread.rotation.x = Math.PI / 2;
    transit.add(tunnel, hotThread);
    for (let i = 0; i < 22; i += 1) {
      const ring = this.cinematicRing(7 + i * 1.35, 0.035, i % 2 ? COLORS.purple : COLORS.cyan, 0.48 - i * 0.014);
      ring.position.z = -36 + i * 3.4;
      ring.rotation.x = Math.PI / 2 + i * 0.055;
      ring.rotation.z = i * 0.31;
      transit.add(ring);
    }
    transit.add(makeParticleCloud(5400, 80, mixHex(COLORS.cyan, COLORS.white, 0.36), seed + 704, 0.42, 0.08));
    this.addStage(transit, 0.42, 1.08, 0.18, 1.62);

    const exit = new THREE.Group();
    exit.add(this.cinematicGlow(COLORS.white, 180, 0.4), this.cinematicGlow(tint, 120, 0.22));
    exit.add(makeRadialRays(420, 5, 106, COLORS.white, seed + 705, 0.72, 0.72));
    exit.add(makeParticleCloud(2800, 70, COLORS.softWhite, seed + 706, 0.45, 0.1));
    this.addStage(exit, 0.78, 1.3, 0.08, 1.18);
  }

  private buildMagnetarCinematic(event: WorldEvent, tint: number, seed: number) {
    const calm = new THREE.Group();
    calm.add(this.cinematicGlow(tint, 86, 0.22), this.luminousCore(4.5, COLORS.white, 0.9));
    calm.add(makeLoopField(30, 24, tint, seed + 441, 0.5));
    calm.add(this.ringSet(tint, 10, 8, 1.4, 0.34, 0.58));
    this.addStage(calm, 0, 0.58, 0.86, 1.18);

    const quake = new THREE.Group();
    quake.add(this.cinematicGlow(COLORS.pink, 108, 0.3), this.cinematicGlow(COLORS.cyan, 82, 0.16), this.luminousCore(5.4, COLORS.white, 0.94));
    quake.add(makeLoopField(44, 30, COLORS.pink, seed + 442, 0.66));
    quake.add(makeRadialRays(260, 4, 70, tint, seed + 443, 0.92, 0.76));
    quake.add(this.streakField(120, seed + 444, 58, 12, COLORS.cyan, 0.32, -0.12));
    this.addStage(quake, 0.32, 0.9, 0.36, 1.48);

    const after = new THREE.Group();
    after.add(this.cinematicGlow(tint, 96, 0.18));
    after.add(this.ringSet(COLORS.cyan, 20, 9, 1.55, 0.32, 0.52));
    after.add(makeParticleCloud(2500, 44, tint, seed + 445, 0.46, 0.12));
    this.addStage(after, 0.68, 1.22, 0.76, 1.06);
  }

  private buildMadeInHeavenCinematic(event: WorldEvent, seed: number) {
    const universe = new THREE.Group();
    universe.add(this.cinematicGlow(COLORS.white, 120, 0.22), this.cinematicGlow(COLORS.purple, 98, 0.18));
    universe.add(makeParticleCloud(6200, 76, COLORS.softWhite, seed + 501, 0.58, 0.13));
    universe.add(makeSpiralArms(14, 260, 74, COLORS.softWhite, seed + 502, 0.48));
    universe.add(makeSpiralArms(9, 220, 62, COLORS.gold, seed + 503, 0.32));
    this.addStage(universe, 0, 0.64, 1.28, 0.08);

    const suction = new THREE.Group();
    suction.add(this.cinematicGlow(COLORS.cyan, 130, 0.18), this.cinematicGlow(COLORS.white, 74, 0.22));
    suction.add(this.infallVortex(seed + 504, 82, COLORS.softWhite, 320));
    suction.add(this.ringSet(COLORS.white, 20, 10, 3.1, 0.34, 0.46));
    suction.add(makeRadialRays(360, 8, 92, COLORS.white, seed + 505, 1, 0.48));
    this.addStage(suction, 0.14, 0.86, 1.12, 0.42);

    const singularity = new THREE.Group();
    singularity.add(this.cinematicGlow(COLORS.white, 90, 0.36), this.cinematicGlow(COLORS.cyan, 66, 0.18), this.luminousCore(6.4, COLORS.white, 0.96));
    singularity.add(makeParticleCloud(2200, 30, COLORS.white, seed + 506, 0.45, 0.12));
    this.addStage(singularity, 0.42, 0.9, 0.35, 1.45);

    const reset = new THREE.Group();
    reset.add(this.cinematicGlow(COLORS.white, 170, 0.42), this.cinematicGlow(COLORS.gold, 110, 0.22), this.cinematicGlow(COLORS.pink, 96, 0.16));
    reset.add(makeRadialRays(520, 4, 104, COLORS.white, seed + 507, 1, 0.72));
    reset.add(makeSpiralArms(12, 300, 68, COLORS.cyan, seed + 508, 0.5));
    reset.add(makeParticleCloud(4600, 70, mixHex(COLORS.white, COLORS.cyan, 0.35), seed + 509, 0.52, 0.12));
    this.addStage(reset, 0.72, 1.22, 0.08, 1.36);

    this.addWing(-1);
    this.addWing(1);
  }

  private buildEventCinematic(event: WorldEvent) {
    const kind = event.kind;
    const tint = event.color;
    const seed = this.seedForKey(event.id);

    if (kind === 'Heart Supernova') {
      this.buildLoveCinematic(event, tint, seed);
      return;
    }

    if (kind === 'Made in Heaven') {
      this.buildMadeInHeavenCinematic(event, seed);
      return;
    }

    if (kind === 'Wormhole') {
      this.buildWormholeCinematic(event, tint, seed);
      return;
    }

    if (kind === 'Gamma Ray Burst' || kind === 'Fast Radio Burst') {
      this.root.add(this.cinematicGlow(tint, kind === 'Gamma Ray Burst' ? 66 : 58, 0.22));
      this.core = new THREE.Mesh(new THREE.SphereGeometry(4.2, 56, 28), new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending }));
      this.root.add(this.core);
      const beam = this.cinematicBeam(kind === 'Gamma Ray Burst' ? 116 : 86, kind === 'Gamma Ray Burst' ? 1.6 : 0.9, tint, kind === 'Gamma Ray Burst' ? 0.42 : 0.28);
      beam.rotation.z = Math.PI / 2;
      this.root.add(beam);
      const hot = this.cinematicBeam(kind === 'Gamma Ray Burst' ? 118 : 88, 0.38, COLORS.white, 0.5);
      hot.rotation.z = Math.PI / 2;
      this.root.add(hot);
      this.addCinematicRays(kind === 'Gamma Ray Burst' ? 150 : 210, 4, kind === 'Gamma Ray Burst' ? 50 : 38, tint, seed + 10, kind === 'Gamma Ray Burst' ? 0.2 : 0.42, 0.58);
      this.particles = makeParticleCloud(1800, kind === 'Gamma Ray Burst' ? 36 : 30, tint, seed + 11, 0.36, 0.18);
      this.root.add(this.particles);
      this.addRings(tint, kind === 'Fast Radio Burst' ? 14 : 8, 6, 0.44);
      return;
    }

    if (kind.includes('Black Hole') || kind === 'Quasar' || kind === 'Tidal Disruption' || kind === 'Dark Matter Caustic') {
      if (kind === 'Dark Matter Caustic') {
        this.root.add(this.cinematicGlow(COLORS.purple, 70, 0.13), makeLoopField(34, 19, COLORS.purple, seed + 12, 0.5));
        this.addRings(COLORS.cyan, 18, 7, 0.34);
        this.particles = makeParticleCloud(2200, 35, COLORS.cyan, seed + 13, 0.34, 0.14);
        this.root.add(this.particles);
        return;
      }
      this.buildBlackHoleCinematic(event, tint, seed);
      return;
    }

    if (kind === 'Planet Collision') {
      this.buildPlanetCollisionCinematic(event, seed);
      return;
    }

    if (kind === 'Galaxy Collision' || kind === 'Neutron Star Merger' || kind === 'Kilonova') {
      if (kind === 'Galaxy Collision') {
        this.buildGalaxyCollisionCinematic(event, tint, seed);
        return;
      }
      if (kind === 'Kilonova') {
        this.buildKilonovaCinematic(event, tint, seed);
        return;
      }
      this.buildNeutronCinematic(event, tint, seed);
      return;
    }

    if (kind === 'Supernova' || kind === 'Hypernova') {
      this.buildNovaCinematic(event, tint, seed, kind === 'Hypernova');
      return;
    }

    if (kind === 'Magnetar' || kind === 'Pulsar') {
      if (kind === 'Magnetar') {
        this.buildMagnetarCinematic(event, tint, seed);
        return;
      }
      this.root.add(this.cinematicGlow(tint, 70, 0.22), makeLoopField(18, 19, tint, seed + 32, 0.62));
      this.core = new THREE.Mesh(new THREE.SphereGeometry(4.2, 54, 26), new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.94, blending: THREE.AdditiveBlending }));
      this.root.add(this.core);
      const beam = this.cinematicBeam(kind === 'Pulsar' ? 112 : 58, kind === 'Pulsar' ? 0.85 : 0.38, COLORS.cyan, kind === 'Pulsar' ? 0.5 : 0.3);
      beam.rotation.z = Math.PI / 2;
      this.root.add(beam);
      this.addCinematicRays(160, 4, 40, tint, seed + 33, 0.82, 0.64);
      this.particles = makeParticleCloud(1900, 33, tint, seed + 34, 0.55, 0.16);
      this.root.add(this.particles);
      this.addRings(tint, 10, 7, 0.42);
      return;
    }

    if (kind === 'Solar System Birth') {
      this.root.add(this.cinematicGlow(COLORS.gold, 78, 0.25), makeSpiralArms(7, 155, 27, COLORS.gold, seed + 35, 0.5));
      this.core = new THREE.Mesh(new THREE.SphereGeometry(4, 48, 24), new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending }));
      this.root.add(this.core);
      this.root.add(makeDiamondShardField(74, 22, COLORS.gold, seed + 36, 0.11));
      this.particles = makeParticleCloud(2400, 35, COLORS.gold, seed + 37, 0.25, 0.14);
      this.root.add(this.particles);
      this.addRings(COLORS.gold, 14, 6, 0.42);
      return;
    }

    if (kind === 'Diamond Rain') {
      const planet = this.cinematicPlanet(8.5, COLORS.blue, seed + 38);
      this.core = planet;
      this.root.add(this.cinematicGlow(COLORS.cyan, 72, 0.24), planet, makeDiamondShardField(210, 29, COLORS.cyan, seed + 39, 0.18));
      this.particles = makeParticleCloud(1500, 34, COLORS.cyan, seed + 40, 0.58, 0.14);
      this.root.add(this.particles);
      this.addRings(COLORS.cyan, 10, 8, 0.36);
      return;
    }

    if (kind === 'Planetary Nebula') {
      const left = this.cinematicGlow(COLORS.pink, 42, 0.28);
      const right = this.cinematicGlow(COLORS.cyan, 42, 0.28);
      left.position.x = -9;
      right.position.x = 9;
      this.root.add(left, right, makeLoopField(20, 20, tint, seed + 41, 0.44));
      this.core = new THREE.Mesh(new THREE.SphereGeometry(2.4, 40, 20), new THREE.MeshBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.96, blending: THREE.AdditiveBlending }));
      this.root.add(this.core);
      this.particles = makeParticleCloud(3200, 38, tint, seed + 42, 0.66, 0.16);
      this.root.add(this.particles);
      this.addRings(tint, 11, 7, 0.34);
      return;
    }

    if (kind === 'Tidal Lock Eclipse' || kind === 'Atmospheric Escape' || kind === 'Cryovolcanism') {
      const planet = this.cinematicPlanet(8.2, tint, seed + 43);
      this.core = planet;
      this.root.add(this.cinematicGlow(tint, 64, 0.2), planet);
      if (kind === 'Tidal Lock Eclipse') {
        const eclipse = new THREE.Mesh(new THREE.SphereGeometry(2.7, 32, 16), new THREE.MeshBasicMaterial({ color: COLORS.black }));
        eclipse.position.set(7, 3, 2);
        this.root.add(eclipse, this.cinematicBeam(34, 0.12, COLORS.white, 0.18));
      } else if (kind === 'Atmospheric Escape') {
        const tail = makeRadialRays(130, 8, 46, COLORS.cyan, seed + 44, 0.22, 0.5);
        tail.position.x = 6;
        this.root.add(tail);
      } else {
        this.root.add(makeDiamondShardField(120, 19, COLORS.cyan, seed + 45, 0.12));
        this.addCinematicRays(90, 5, 28, COLORS.cyan, seed + 46, 0.9, 0.5);
      }
      this.particles = makeParticleCloud(1600, 30, tint, seed + 47, 0.5, 0.14);
      this.root.add(this.particles);
      this.addRings(tint, 8, 8, 0.32);
      return;
    }

    if (kind === 'Wolf-Rayet Wind' || kind === 'Gravitational Wave') {
      this.core = new THREE.Mesh(new THREE.SphereGeometry(4.4, 48, 24), new THREE.MeshBasicMaterial({ color: kind === 'Wolf-Rayet Wind' ? COLORS.white : COLORS.black, transparent: kind === 'Wolf-Rayet Wind', opacity: 0.96, blending: THREE.AdditiveBlending }));
      this.root.add(this.cinematicGlow(tint, 72, 0.18), this.core);
      this.addCinematicRays(kind === 'Wolf-Rayet Wind' ? 230 : 110, 5, kind === 'Wolf-Rayet Wind' ? 48 : 36, tint, seed + 48, kind === 'Wolf-Rayet Wind' ? 1 : 0.45, 0.58);
      this.particles = makeParticleCloud(2200, 38, tint, seed + 49, 0.5, 0.15);
      this.root.add(this.particles);
      this.addRings(kind === 'Wolf-Rayet Wind' ? COLORS.cyan : COLORS.softWhite, kind === 'Wolf-Rayet Wind' ? 13 : 18, 7, 0.36);
      return;
    }

    this.root.add(this.cinematicGlow(tint, 66, 0.24));
    this.core = new THREE.Mesh(new THREE.SphereGeometry(5, 48, 24), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.94, blending: THREE.AdditiveBlending }));
    this.root.add(this.core);
    this.addCinematicRays(150, 5, 38, tint, seed + 50, 0.7, 0.62);
    this.particles = makeParticleCloud(2200, 34, tint, seed + 51, 0.6, 0.16);
    this.root.add(this.particles);
    this.addRings(tint, 8, 7, 0.4);
  }

  private buildSpecialCinematic(special: Trackable) {
    const tint = special.color;
    const seed = this.seedForKey(special.id);
    this.root.add(this.cinematicGlow(tint, 70, 0.22));
    if (!isEvent(special) && special.heartShape) {
      this.core = makeHeartMesh(tint, 8.8);
      this.root.add(this.core, this.cinematicGlow(COLORS.gold, 46, 0.12), this.ringSet(COLORS.gold, 10, 9, 1.55, 0.34, 0.66));
      this.particles = makeParticleCloud(1800, 32, mixHex(tint, COLORS.white, 0.12), seed + 4, 0.45, 0.14);
      this.root.add(this.particles);
      this.addRings(tint, 8, 9, 0.28);
      return;
    }

    if (special.kind === 'Diamond Rain Planet' || special.kind === 'Diamond Rain') {
      const interior = new THREE.Group();
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(78, 64, 32),
        new THREE.MeshBasicMaterial({ color: 0x071a44, transparent: true, opacity: 0.42, side: THREE.BackSide, blending: THREE.AdditiveBlending })
      );
      interior.add(sky, this.cinematicGlow(COLORS.cyan, 118, 0.26), this.cinematicGlow(COLORS.blue, 86, 0.18));
      interior.add(this.streakField(360, seed + 5, 74, 12, COLORS.cyan, 0.68, 0.24));
      interior.add(makeDiamondShardField(260, 45, COLORS.cyan, seed + 6, 0.18));
      interior.add(this.ringSet(COLORS.cyan, 14, 12, 2.2, 0.22, 0.26));
      this.particles = makeParticleCloud(2200, 58, COLORS.cyan, seed + 7, 0.44, 0.11);
      interior.add(this.particles);
      this.root.add(interior);
      return;
    }

    if (special.kind === 'Iron Storm World') {
      const interior = new THREE.Group();
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(78, 64, 32),
        new THREE.MeshBasicMaterial({ color: 0x2a0704, transparent: true, opacity: 0.48, side: THREE.BackSide, blending: THREE.AdditiveBlending })
      );
      interior.add(sky, this.cinematicGlow(COLORS.orange, 112, 0.28), this.cinematicGlow(COLORS.red, 86, 0.18));
      interior.add(this.streakField(430, seed + 8, 76, 16, COLORS.orange, 0.76, 0.44));
      interior.add(makeRadialRays(160, 8, 62, COLORS.gold, seed + 9, 0.18, 0.38));
      interior.add(makeParticleCloud(2300, 60, COLORS.red, seed + 10, 0.38, 0.12));
      interior.add(this.ringSet(COLORS.orange, 12, 14, 2.4, 0.2, 0.22));
      this.root.add(interior);
      return;
    }

    const planetA = this.cinematicPlanet(7.2, tint, seed + 5);
    this.core = planetA;
    this.root.add(planetA);
    if (!isEvent(special) && special.rings) this.addRings(tint, special.kind === 'Mega Ringed Giant' ? 18 : 11, 8, 0.4);
    if (special.kind === 'Diamond Rain Planet' || special.kind === 'Diamond Rain') this.root.add(makeDiamondShardField(180, 27, COLORS.cyan, seed + 6, 0.16));
    if (special.kind === 'Iron Storm World') this.addCinematicRays(150, 6, 40, COLORS.orange, seed + 7, 0.85, 0.6);
    if (special.kind === 'Crystal Planet') this.root.add(makeDiamondShardField(140, 23, tint, seed + 8, 0.14));
    this.particles = makeParticleCloud(1800, 32, tint, seed + 9, 0.48, 0.15);
    this.root.add(this.particles);
    this.addRings(tint, 8, 8, 0.32);
  }

  private cinematicPlanet(size: number, tint: number, seed: number) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 48, 24),
      new THREE.MeshStandardMaterial({ map: createPlanetTexture('Rocky Planet', tint, seed), roughness: 0.55 })
    );
    return mesh;
  }

  private addRings(tint: number, count: number, base: number, opacity: number) {
    for (let i = 0; i < count; i += 1) {
      const ring = this.cinematicRing(base + i * 2.0, 0.035, tint, Math.max(0.08, opacity - i * 0.028));
      ring.rotation.x = Math.PI / 2 + i * 0.08;
      ring.rotation.y = i * 0.12;
      this.rings.push(ring);
      this.root.add(ring);
    }
  }

  private cinematicRing(radius: number, tube: number, tint: number, opacity: number) {
    return new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 10, 160),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
  }

  private cinematicBeam(length: number, radius: number, tint: number, opacity: number) {
    return new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 2.2, length, 36, 1, true),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
  }

  private addWing(side: -1 | 1) {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (let i = 0; i < 34; i += 1) {
      positions.push(side * 3, -9 + i * 0.55, 0);
      positions.push(side * (10 + i * 0.5), -8 + i * 0.76, -4 - i * 0.12);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.root.add(
      new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color: COLORS.softWhite, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending })
      )
    );
  }
}

class WarpTunnel {
  root = new THREE.Group();
  private streakCount = 2200;
  private shearCount = 720;
  private streaks: THREE.LineSegments;
  private geometry: THREE.BufferGeometry;
  private shearLines: THREE.LineSegments;
  private shearGeometry: THREE.BufferGeometry;
  private rings: THREE.Mesh[] = [];
  private ribbons: THREE.Line[] = [];
  private chargeCore: THREE.Sprite;
  private tunnelGlow: THREE.Sprite;
  private companion: THREE.Group;
  private companionTint = 0;

  constructor() {
    const positions = new Float32Array(this.streakCount * 6);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.streaks = new THREE.LineSegments(
      this.geometry,
      new THREE.LineBasicMaterial({
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      })
    );
    this.root.add(this.streaks);
    const shearPositions = new Float32Array(this.shearCount * 6);
    this.shearGeometry = new THREE.BufferGeometry();
    this.shearGeometry.setAttribute('position', new THREE.BufferAttribute(shearPositions, 3));
    this.shearLines = new THREE.LineSegments(
      this.shearGeometry,
      new THREE.LineBasicMaterial({
        color: COLORS.softWhite,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.root.add(this.shearLines);
    this.chargeCore = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowTexture(991, COLORS.cyan),
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.chargeCore.position.z = 16;
    this.root.add(this.chargeCore);
    this.tunnelGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowTexture(993, COLORS.blue),
        color: COLORS.cyan,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    this.tunnelGlow.position.z = 54;
    this.tunnelGlow.scale.set(38, 38, 1);
    this.root.add(this.tunnelGlow);
    for (let i = 0; i < 58; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.2 + i * 0.42, 0.018 + (i % 5) * 0.003, 8, 144),
        new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? COLORS.cyan : i % 2 ? COLORS.blue : COLORS.purple, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.position.z = 7 + i * 4.15;
      ring.rotation.x = i * 0.018;
      this.rings.push(ring);
      this.root.add(ring);
    }
    for (let ribbonIndex = 0; ribbonIndex < 32; ribbonIndex += 1) {
      const points: number[] = [];
      const phase = (ribbonIndex / 32) * Math.PI * 2;
      for (let k = 0; k < 260; k += 1) {
        const u = k / 259;
        const z = 5 + u * 326;
        const radius = 2.0 + Math.sin(u * Math.PI) * (5.8 + ribbonIndex * 0.16);
        const twist = phase + u * Math.PI * (8.8 + ribbonIndex * 0.18);
        points.push(Math.cos(twist) * radius, Math.sin(twist) * radius * 0.58, z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: ribbonIndex % 3 === 0 ? COLORS.softWhite : ribbonIndex % 2 ? COLORS.purple : COLORS.cyan,
          transparent: true,
          opacity: 0.24,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      this.ribbons.push(line);
      this.root.add(line);
    }
    this.companion = this.makeCompanionShip(COLORS.pink);
    this.root.add(this.companion);
    this.root.visible = false;
  }

  private makeCompanionShip(tint: number) {
    const group = new THREE.Group();
    group.userData.tint = tint;

    const hullMaterial = new THREE.MeshStandardMaterial({
      color: mixHex(COLORS.white, tint, 0.18),
      roughness: 0.16,
      metalness: 0.72,
      emissive: new THREE.Color(tint),
      emissiveIntensity: 0.18
    });
    const shadowMaterial = new THREE.MeshStandardMaterial({
      color: mixHex(0x18233c, tint, 0.24),
      roughness: 0.2,
      metalness: 0.64,
      emissive: new THREE.Color(tint),
      emissiveIntensity: 0.12
    });

    const top = 0.06;
    const bottom = -0.08;
    const verts = [
      0, top, 1.45,
      -1.08, top, -0.16,
      -0.34, top, -0.72,
      0.34, top, -0.72,
      1.08, top, -0.16,
      0, bottom, 1.24,
      -0.92, bottom, -0.12,
      -0.28, bottom, -0.58,
      0.28, bottom, -0.58,
      0.92, bottom, -0.12
    ];
    const indices = [
      0, 1, 2, 0, 2, 3, 0, 3, 4,
      5, 7, 6, 5, 8, 7, 5, 9, 8,
      0, 5, 6, 0, 6, 1,
      1, 6, 7, 1, 7, 2,
      2, 7, 8, 2, 8, 3,
      3, 8, 9, 3, 9, 4,
      4, 9, 5, 4, 5, 0
    ];
    const hullGeometry = new THREE.BufferGeometry();
    hullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    hullGeometry.setIndex(indices);
    hullGeometry.computeVertexNormals();

    const hull = new THREE.Mesh(hullGeometry, hullMaterial);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 1.18), shadowMaterial);
    spine.position.set(0, 0.2, -0.1);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 28, 14),
      new THREE.MeshStandardMaterial({
        color: mixHex(COLORS.white, tint, 0.25),
        roughness: 0.04,
        metalness: 0.08,
        emissive: new THREE.Color(tint),
        emissiveIntensity: 0.32,
        transparent: true,
        opacity: 0.92
      })
    );
    canopy.scale.set(1.3, 0.26, 0.72);
    canopy.position.set(0, 0.38, 0.16);

    const engineTexture = createGlowTexture(1640 + (tint % 97), tint);
    const engineMaterial = new THREE.SpriteMaterial({
      map: engineTexture,
      color: tint,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const engineCenter = new THREE.Sprite(engineMaterial.clone());
    engineCenter.position.set(0, 0.05, -0.98);
    engineCenter.scale.set(1.3, 1.3, 1);
    const engineLeft = new THREE.Sprite(engineMaterial.clone());
    engineLeft.position.set(-0.42, 0.02, -0.78);
    engineLeft.scale.set(0.8, 0.8, 1);
    const engineRight = new THREE.Sprite(engineMaterial.clone());
    engineRight.position.set(0.42, 0.02, -0.78);
    engineRight.scale.set(0.8, 0.8, 1);

    const slipRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.42, 0.018, 8, 128),
      new THREE.MeshBasicMaterial({
        color: mixHex(tint, COLORS.white, 0.46),
        transparent: true,
        opacity: 0.66,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    slipRing.rotation.x = Math.PI / 2.06;
    slipRing.scale.y = 0.34;

    const trail = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: engineTexture,
        color: mixHex(tint, COLORS.white, 0.24),
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    trail.position.set(0, -0.02, -1.42);
    trail.scale.set(3.0, 1.4, 1);

    group.userData.engineCenter = engineCenter;
    group.userData.engineLeft = engineLeft;
    group.userData.engineRight = engineRight;
    group.userData.slipRing = slipRing;
    group.add(trail, slipRing, engineCenter, engineLeft, engineRight, hull, spine, canopy);
    group.scale.setScalar(0.86);
    this.companionTint = tint;
    return group;
  }

  private ensureCompanionTint(tint: number) {
    if (this.companionTint === tint) return;
    const previousVisible = this.companion.visible;
    this.companion.removeFromParent();
    this.companion = this.makeCompanionShip(tint);
    this.companion.visible = previousVisible;
    this.root.add(this.companion);
  }

  update(state: GameState, dt: number) {
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const shearPosition = this.shearGeometry.getAttribute('position') as THREE.BufferAttribute;
    const aligning = state.warp.phase === 'align';
    const charging = state.warp.phase === 'charge';
    const jumping = state.warp.phase === 'jump';
    const exiting = state.warp.phase === 'exit';
    const warpDuration = Math.max(WARP_DURATION, state.warp.duration);
    const distanceEnergy = THREE.MathUtils.clamp((warpDuration - WARP_DURATION) / 10, 0, 1);
    const chargeProgress = aligning
      ? smoothstep(state.warp.timer / WARP_ALIGN_DURATION) * 0.34
      : charging
        ? smoothstep(state.warp.timer / WARP_CHARGE_DURATION)
        : jumping
          ? 1
          : exiting
            ? 1 - smoothstep(state.warp.timer / WARP_EXIT_DURATION) * 0.55
            : 1;
    const jumpProgress = jumping ? smoothstep(state.warp.timer / warpDuration) : exiting ? 1 : 0;
    const exitProgress = exiting ? smoothstep(state.warp.timer / WARP_EXIT_DURATION) : 0;
    const t = state.warp.timer;
    const tunnelFade = exiting ? 1 - exitProgress : 1;
    const destinationColor = state.warp.destinationColor || COLORS.cyan;
    (this.chargeCore.material as THREE.SpriteMaterial).color.setHex(mixHex(destinationColor, COLORS.cyan, 0.45));
    (this.tunnelGlow.material as THREE.SpriteMaterial).color.setHex(mixHex(destinationColor, COLORS.blue, 0.42));
    (this.streaks.material as THREE.LineBasicMaterial).opacity = (jumping ? 0.9 + distanceEnergy * 0.08 : 0.55) * tunnelFade;
    (this.shearLines.material as THREE.LineBasicMaterial).color.setHex(mixHex(destinationColor, COLORS.white, 0.56));
    (this.shearLines.material as THREE.LineBasicMaterial).opacity = (jumping ? 0.34 + distanceEnergy * 0.18 : charging ? 0.1 + chargeProgress * 0.16 : 0.12) * tunnelFade;
    for (let i = 0; i < this.streakCount; i += 1) {
      const a = i * 12.9898;
      const angle = (Math.sin(a) * 43758.5453) % (Math.PI * 2);
      const phaseSpeed = aligning ? 10 : charging ? 8 + chargeProgress * 18 : jumping ? 92 + distanceEnergy * 44 : 28 * (1 - exitProgress);
      const z1 = ((i * 4.2 + t * (phaseSpeed + (i % 53)) * (jumping ? 1.58 + distanceEnergy * 0.32 : 0.76)) % 330) + 5;
      const z2 = z1 + (aligning ? 3 : charging ? 7 + chargeProgress * 12 : jumping ? 40 + distanceEnergy * 28 : 12) + (i % 23);
      const baseR = aligning
        ? 8.6 - chargeProgress * 9.6
        : charging
          ? 9.4 * (1 - chargeProgress) + 0.8
          : exiting
            ? 12.2 * (1 - exitProgress) + 1.5
            : 0.8 + jumpProgress * (13.8 + distanceEnergy * 3.2);
      const r = Math.max(0.7, baseR) + (i % 91) * (jumping ? 0.2 + distanceEnergy * 0.05 : 0.08);
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.62;
      position.setXYZ(i * 2, x, y, z1);
      const tailScale = jumping ? 1.82 + distanceEnergy * 0.36 : charging ? 0.35 + chargeProgress : exiting ? 1.25 - exitProgress * 0.42 : 0.72 + chargeProgress;
      position.setXYZ(i * 2 + 1, x * tailScale, y * tailScale, z2);
    }
    position.needsUpdate = true;

    for (let i = 0; i < this.shearCount; i += 1) {
      const golden = i * 2.399963229728653;
      const swirl = golden + t * (jumping ? 0.42 + distanceEnergy * 0.14 : 0.1);
      const lane = ((i * 7.9 + t * (jumping ? 128 + distanceEnergy * 62 : charging ? 34 + chargeProgress * 34 : 24)) % 390) + 3;
      const radius = jumping
        ? 9 + (i % 67) * 0.34 + jumpProgress * (4.5 + distanceEnergy * 2.5)
        : 5.2 + (i % 41) * 0.18 + chargeProgress * 5.4;
      const sideSkew = Math.sin(t * 1.8 + i * 0.31) * (jumping ? 2.2 + distanceEnergy * 1.2 : 0.7);
      const x1 = Math.cos(swirl) * radius + sideSkew;
      const y1 = Math.sin(swirl) * radius * 0.56;
      const z1 = lane;
      const pull = jumping ? 20 + distanceEnergy * 24 : 5 + chargeProgress * 8;
      const x2 = x1 * (1.18 + jumpProgress * 0.72);
      const y2 = y1 * (1.18 + jumpProgress * 0.5);
      const z2 = z1 + pull + (i % 29);
      shearPosition.setXYZ(i * 2, x1, y1, z1);
      shearPosition.setXYZ(i * 2 + 1, x2, y2, z2);
    }
    shearPosition.needsUpdate = true;

    this.root.rotation.z += dt * (aligning ? 0.42 : charging ? 0.55 + chargeProgress * 1.9 : jumping ? 2.35 + jumpProgress * 1.2 + distanceEnergy * 0.48 : 0.7);
    this.chargeCore.visible = true;
    this.chargeCore.position.z = exiting ? 26 - exitProgress * 20 : charging || aligning ? 12 : 20;
    this.chargeCore.scale.setScalar(charging || aligning ? 4 + chargeProgress * 22 : exiting ? 18 * (1 - exitProgress) + 5 : 15 + distanceEnergy * 5 + Math.sin(t * 14) * 2);
    (this.chargeCore.material as THREE.SpriteMaterial).opacity = exiting ? 0.48 * (1 - exitProgress) : charging || aligning ? 0.22 + chargeProgress * 0.58 : 0.38;
    this.tunnelGlow.scale.setScalar(exiting ? 42 * (1 - exitProgress) : charging || aligning ? 18 + chargeProgress * 34 : 48 + distanceEnergy * 8 + Math.sin(t * 5) * 3);
    (this.tunnelGlow.material as THREE.SpriteMaterial).opacity = (jumping ? 0.24 + distanceEnergy * 0.08 : charging || aligning ? 0.1 + chargeProgress * 0.18 : 0.12) * tunnelFade;
    this.rings.forEach((ring, i) => {
      ring.rotation.z -= dt * (aligning ? 0.48 + i * 0.02 : charging ? 0.95 + i * 0.035 : jumping ? 1.85 + i * 0.036 + distanceEnergy * 0.45 : 0.7);
      ring.rotation.x += dt * (jumping ? 0.03 + distanceEnergy * 0.02 : 0.01);
      ring.position.z = charging || aligning ? 10 + i * (1.55 + chargeProgress * 1.25) : exiting ? 14 + i * 3.7 - exitProgress * 18 : 6 + i * 4.15;
      ring.scale.setScalar((charging || aligning ? 0.28 + chargeProgress * 1.2 : exiting ? 1.42 - exitProgress * 0.72 : 1.02 + jumpProgress * (0.54 + distanceEnergy * 0.24)) + Math.sin(t * 5 + i) * 0.075);
      const ringMat = ring.material as THREE.MeshBasicMaterial;
      ringMat.color.setHex(i % 3 === 0 ? mixHex(destinationColor, COLORS.white, 0.28) : i % 2 ? COLORS.purple : COLORS.cyan);
      ringMat.opacity = exiting ? Math.max(0.035, 0.25 * (1 - exitProgress)) : charging || aligning ? 0.14 + chargeProgress * 0.2 : 0.23 + distanceEnergy * 0.05;
    });
    this.ribbons.forEach((ribbon, i) => {
      ribbon.rotation.z += dt * (0.42 + i * 0.055 + jumpProgress * 0.75);
      ribbon.position.z = exiting ? -exitProgress * 26 : Math.sin(t * 1.6 + i) * 0.8;
      const mat = ribbon.material as THREE.LineBasicMaterial;
      mat.color.setHex(i % 3 === 0 ? mixHex(destinationColor, COLORS.white, 0.24) : i % 2 ? COLORS.purple : COLORS.cyan);
      mat.opacity = (0.12 + jumpProgress * 0.26) * tunnelFade;
    });
    const partner =
      (state.warp.companionId ? state.remotePlayers.get(state.warp.companionId) : null) ??
      [...state.remotePlayers.values()][0] ??
      null;
    const companionTint = partner?.color || COLORS.pink;
    this.ensureCompanionTint(companionTint);
    this.companion.visible = state.warp.groupWarp;
    if (state.warp.groupWarp) {
      const lane = exiting ? 12 + exitProgress * 4 : charging || aligning ? 11 + chargeProgress * 6 : 24 + jumpProgress * (28 + distanceEnergy * 10);
      this.companion.position.set(-2.65 + Math.sin(t * 4) * 0.18, -0.45 + Math.cos(t * 3.3) * 0.12, lane);
      this.companion.rotation.set(0.12 + Math.sin(t * 2.8) * 0.035, Math.sin(t * 3) * 0.16, -0.18 + Math.sin(t * 5) * 0.07);
      this.companion.scale.setScalar(0.86 + jumpProgress * 0.14);
      const engineCenter = this.companion.userData.engineCenter as THREE.Sprite | undefined;
      const engineLeft = this.companion.userData.engineLeft as THREE.Sprite | undefined;
      const engineRight = this.companion.userData.engineRight as THREE.Sprite | undefined;
      const slipRing = this.companion.userData.slipRing as THREE.Mesh | undefined;
      const enginePulse = 1 + Math.sin(t * 15) * 0.16;
      engineCenter?.scale.setScalar((1.18 + jumpProgress * 1.1 + distanceEnergy * 0.45) * enginePulse);
      engineLeft?.scale.setScalar((0.72 + jumpProgress * 0.58) * enginePulse);
      engineRight?.scale.setScalar((0.72 + jumpProgress * 0.58) * enginePulse);
      if (slipRing) {
        slipRing.rotation.z += dt * (2.2 + jumpProgress * 2.4);
        (slipRing.material as THREE.MeshBasicMaterial).opacity = 0.52 + jumpProgress * 0.22;
      }
    }
  }
}
