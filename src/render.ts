import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  COLORS,
  distance,
  forwardVector,
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

      if (kind === 'Gas Giant' || kind === 'Storm Planet' || kind === 'Ringed Giant' || kind === 'Mega Ringed Giant' || kind === 'Diamond Rain Planet' || kind === 'Iron Storm World') {
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
    group.add(lines);

    const veil = makeParticleCloud(80, 42, design.tint, 7420 + c * 83, 0.42, 0.52);
    const constellationCenter = constellationPatchPoint(centerA, centerU, 0, 0, radius);
    veil.position.copy(constellationCenter).multiplyScalar(0.985);
    veil.scale.set(1.35, 0.42, 0.1);
    group.add(veil);

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
      group.add(star);

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
        group.add(halo);
      }
    }

    const label = createConstellationLabel(design.name, design.tint);
    label.position.copy(constellationPatchPoint(centerA, centerU, 0, -1.85, radius));
    group.add(label);
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
  const group = new THREE.Group();
  group.add(makeGlowSprite(tint, size * 5.2, 0.18), makeParticleCloud(1400, size * 1.35, tint, seed, 0.16, Math.max(0.055, size * 0.01)));
  const arms = makeSpiralArms(5, 210, size * 1.9, tint, seed + 1, 0.62);
  arms.scale.y = 0.72;
  group.add(arms);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.13, 32, 16),
    new THREE.MeshBasicMaterial({ color: mixHex(tint, COLORS.white, 0.55), transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  group.add(core);
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
  const left = makeSoftGalaxyDisc(size * 0.86, leftTint, seed + 1);
  const right = makeSoftGalaxyDisc(size * 0.84, rightTint, seed + 2);
  left.position.set(-size * 1.35, size * 0.15, 0);
  right.position.set(size * 1.35, -size * 0.12, 0);
  left.rotation.z = -0.34;
  right.rotation.z = 0.42;
  group.add(makeGlowSprite(mixHex(leftTint, rightTint, 0.5), size * 5.4, 0.14));
  group.add(left, right, makeSmoothTidalBridge(size, leftTint, rightTint, seed + 3));
  group.add(makeParticleCloud(900, size * 2.9, mixHex(leftTint, rightTint, 0.55), seed + 4, 0.22, size * 0.01));
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
  private version = -1;
  private backdrop = makeNebulaBackdrop();
  private starLayers: THREE.Points[] = [];
  private constellations = makeConstellations();
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
    const backdropMaterial = this.backdrop.material as THREE.ShaderMaterial;
    backdropMaterial.uniforms.time.value = elapsed;

    if (state.cutscene.active || state.specialScene.active) {
      this.universeRoot.visible = false;
      this.remoteRoot.visible = false;
      this.starLayers.forEach((layer) => (layer.visible = true));
      this.constellations.visible = true;
      this.warp.root.visible = false;
      this.cinematic.root.visible = true;
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(0, 0, 1);
      this.cinematic.update(state, dt);
      this.composer.render();
      return;
    }

    if (state.warp.active) {
      this.universeRoot.visible = false;
      this.remoteRoot.visible = false;
      this.starLayers.forEach((layer) => (layer.visible = false));
      this.constellations.visible = false;
      this.cinematic.root.visible = false;
      this.warp.root.visible = true;
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(0, 0, 1);
      this.warp.update(state, dt);
      this.composer.render();
      return;
    }

    this.cinematic.root.visible = false;
    this.warp.root.visible = false;
    this.universeRoot.visible = true;
    this.remoteRoot.visible = true;
    this.starLayers.forEach((layer) => (layer.visible = true));
    this.constellations.visible = true;

    const f = forwardVector(state.player);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(f.x, f.y, f.z);
    this.backdrop.rotation.y = state.player.yaw * 0.08 + elapsed * 0.003;
    this.backdrop.rotation.x = -state.player.pitch * 0.05;
    this.constellations.rotation.y = state.player.yaw * 0.045 + elapsed * 0.001;
    this.constellations.rotation.x = -state.player.pitch * 0.025;

    this.starLayers.forEach((layer, i) => {
      layer.rotation.y = state.player.yaw * (0.06 + i * 0.03) + elapsed * (0.002 + i * 0.001);
      layer.rotation.x = -state.player.pitch * (0.04 + i * 0.02);
    });

    for (const target of state.allTrackable()) {
      const group = this.entityGroups.get(target.id);
      if (!group) continue;
      const rel = subVec(target.position, state.player.position);
      const d = distance(state.player.position, target.position);
      const planetViewDistance = !isEvent(target) && PLANET_SET.has(target.kind) ? Math.min(state.renderDistance, 34000) : state.renderDistance;
      group.visible = d < planetViewDistance || target === state.trackedTarget || target === state.selectedTarget;
      group.position.set(rel.x * RENDER_SCALE, rel.y * RENDER_SCALE, rel.z * RENDER_SCALE);

      const spinRate = (group.userData.spinRate as number | undefined) ?? 0.1;
      const naturalRoot = group.userData.naturalRoot as THREE.Object3D | undefined;
      if (naturalRoot) naturalRoot.rotation.y += dt * spinRate;
      if (isEvent(target)) group.rotation.y += dt * 0.18;

      const label = group.userData.label as THREE.Object3D | undefined;
      if (label) {
        label.visible = d < 90000 || target === state.trackedTarget || target === state.selectedTarget;
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
    }

    this.syncRemotePlayers(state, elapsed, dt);

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
      if (!group) {
        group = this.makeRemoteShip(pilot);
        this.remoteGroups.set(pilot.id, group);
        this.remoteRoot.add(group);
      }

      const rel = subVec(pilot.position, state.player.position);
      const d = distance(state.player.position, pilot.position);
      group.visible = d < state.renderDistance;
      group.position.set(rel.x * RENDER_SCALE, rel.y * RENDER_SCALE, rel.z * RENDER_SCALE);
      group.rotation.x = -pilot.pitch * 0.5;
      group.rotation.y = pilot.yaw;
      group.rotation.z = Math.sin(elapsed * 2.7 + pilot.id.length) * 0.035;
      const engine = group.userData.engine as THREE.Sprite | undefined;
      if (engine) {
        const pulse = 1 + Math.sin(elapsed * 9.5) * 0.16;
        engine.scale.setScalar(pulse);
      }
      const label = group.userData.label as THREE.Object3D | undefined;
      if (label) {
        label.visible = d < 26000;
        label.position.y = 1.9 + Math.sin(elapsed * 2.3) * 0.08;
      }
      group.position.y += Math.sin(elapsed * 3 + pilot.id.length) * dt * 0.6;
    }
  }

  private makeRemoteShip(pilot: RemotePlayerState) {
    const group = new THREE.Group();
    const tint = pilot.color || COLORS.cyan;
    const hull = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.85, 5, 1),
      new THREE.MeshStandardMaterial({
        color: mixHex(tint, COLORS.white, 0.3),
        roughness: 0.24,
        metalness: 0.42,
        emissive: new THREE.Color(tint),
        emissiveIntensity: 0.2
      })
    );
    hull.rotation.x = Math.PI / 2;
    hull.position.z = 0.16;

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 18, 10),
      new THREE.MeshStandardMaterial({
        color: COLORS.softWhite,
        roughness: 0.08,
        metalness: 0.1,
        emissive: new THREE.Color(tint),
        emissiveIntensity: 0.18
      })
    );
    canopy.scale.set(0.72, 0.42, 1);
    canopy.position.set(0, 0.16, 0.2);

    const wingGeometry = new THREE.BufferGeometry();
    wingGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -0.16, -0.04, -0.42,
          -1.15, -0.08, -0.96,
          -0.25, -0.02, 0.18,
          0.16, -0.04, -0.42,
          1.15, -0.08, -0.96,
          0.25, -0.02, 0.18
        ],
        3
      )
    );
    wingGeometry.computeVertexNormals();
    const wings = new THREE.Mesh(
      wingGeometry,
      new THREE.MeshStandardMaterial({
        color: mixHex(tint, COLORS.black, 0.2),
        roughness: 0.32,
        metalness: 0.35,
        emissive: new THREE.Color(tint),
        emissiveIntensity: 0.12,
        side: THREE.DoubleSide
      })
    );

    const engine = this.spriteGlow(tint, 1.55, 0.55);
    engine.position.z = -1.06;
    group.userData.engine = engine;

    const label = createLabelSprite(pilot.name || 'Friend', tint);
    label.position.y = 1.9;
    label.scale.multiplyScalar(0.42);
    group.userData.label = label;

    const ring = this.trackMarker(1.8, tint);
    ring.rotation.x = Math.PI / 2;
    ring.scale.y = 0.62;
    group.add(engine, hull, wings, canopy, ring, label);
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
    const count = obj.kind === 'Galaxy Pair' ? 2400 : 1700;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const arms = obj.kind === 'Galaxy Pair' ? 6 : 4;
    for (let i = 0; i < count; i += 1) {
      const arm = i % arms;
      const u = rand();
      const r = size * Math.sqrt(u) * (0.18 + rand() * 1.05);
      const a = (arm * Math.PI * 2) / arms + r * 0.14 + rand() * 0.75;
      positions[i * 3] = Math.cos(a) * r + (obj.kind === 'Galaxy Pair' && i % 2 ? size * 0.95 : 0);
      positions[i * 3 + 1] = (rand() - 0.5) * size * 0.12;
      positions[i * 3 + 2] = Math.sin(a) * r * 0.36;
      const c = color(rand() > 0.45 ? obj.color : COLORS.softWhite, 0.58 + rand() * 0.8);
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
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    group.add(this.spriteGlow(obj.color, size * 2.2, 0.08), points);
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
    const photon = this.torus(size * 0.72, size * 0.018, COLORS.white, 0.72);
    const disk1 = this.flatDisk(size * 1.95, size * 0.55, COLORS.gold, 0.34);
    const disk2 = this.flatDisk(size * 2.6, size * 0.9, tint, 0.22);
    disk1.rotation.x = Math.PI * 0.5;
    disk2.rotation.x = Math.PI * 0.5;
    group.add(disk2, disk1, shadow, photon);
    if (jet) {
      group.add(this.beam(size * 7, size * 0.06, COLORS.cyan, 'y', 0.28));
    }
    group.add(makeParticleCloud(280, size * 3.0, tint, Math.round(size * 80), 0.34, 0.12));
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
      initials.position.set(0, -size * 0.08, size * 0.62);
      initials.scale.set(size * 1.9, size * 0.72, 1);
      (initials.material as THREE.SpriteMaterial).depthTest = false;
      group.add(this.spriteGlow(tint, size * 11.5, 0.34), this.spriteGlow(COLORS.gold, size * 7.5, 0.14), heart, shell, initials);
      group.add(makeParticleCloud(900, size * 4.9, tint, seed + 1, 0.58, 0.11));
      this.addShockRings(group, 10, size * 1.08, size * 0.4, COLORS.gold, 0.4, 0.52);
      return group;
    }

    if (kind === 'Galaxy Collision') {
      group.add(this.spriteGlow(mixHex(tint, COLORS.gold, 0.45), size * 10.5, 0.2));
      group.add(makeSpiralArms(16, 280, size * 4.9, mixHex(tint, COLORS.white, 0.25), seed + 2, 0.52));
      group.add(makeSmoothTidalBridge(size * 2.4, COLORS.cyan, COLORS.gold, seed + 3));
      group.add(makeParticleCloud(1700, size * 4.6, COLORS.gold, seed + 4, 0.36, 0.13));
      this.addShockRings(group, 12, size * 0.82, size * 0.36, mixHex(tint, COLORS.gold, 0.5), 0.28, 0.38);
      return group;
    }

    if (kind === 'Planet Collision') {
      const molten = this.eventPlanet(size * 0.64, COLORS.orange, seed + 5);
      group.add(this.spriteGlow(COLORS.red, size * 6.4, 0.24), molten);
      group.add(makeRadialRays(90, size * 0.28, size * 2.8, COLORS.orange, seed + 6, 0.7, 0.42));
      group.add(makeDiamondShardField(70, size * 2.2, COLORS.gold, seed + 7, size * 0.026));
      this.addShockRings(group, 10, size * 0.92, size * 0.26, COLORS.gold, 0.42, 0.48);
      return group;
    }

    if (kind === 'Supernova' || kind === 'Hypernova') {
      const isZahraNova = event.name.toLowerCase().includes('xosupa');
      const primary = isZahraNova ? COLORS.pink : tint;
      const accent = kind === 'Hypernova' || isZahraNova ? COLORS.gold : mixHex(tint, COLORS.white, 0.3);
      group.add(this.spriteGlow(primary, size * (kind === 'Hypernova' ? 14.5 : 11.5), 0.3), this.spriteGlow(accent, size * 8.5, 0.12));
      group.add(makeSpiralArms(kind === 'Hypernova' ? 13 : 9, 220, size * (kind === 'Hypernova' ? 5.4 : 4.3), accent, seed + 8, 0.42));
      group.add(makeParticleCloud(kind === 'Hypernova' ? 2000 : 1500, size * 5.4, primary, seed + 9, 0.68, 0.14));
      this.addShockRings(group, kind === 'Hypernova' ? 16 : 12, size * 0.82, size * 0.42, accent, 0.46, 0.5);
      if (isZahraNova) group.add(makeHeartParticleField(420, size * 1.75, COLORS.gold, seed + 10, size * 0.026));
      return group;
    }

    if (kind.includes('Black Hole') || kind === 'Quasar' || kind === 'Tidal Disruption') {
      group.add(this.makeBlackHoleLike(size * 1.18, tint, kind === 'Quasar' || kind === 'Supermassive Black Hole'));
      group.add(this.spriteGlow(COLORS.gold, size * 7.8, 0.13), this.spriteGlow(COLORS.purple, size * 5.4, 0.08));
      group.add(makeSpiralArms(kind === 'Tidal Disruption' ? 7 : 5, 180, size * 4.2, COLORS.gold, seed + 11, kind === 'Tidal Disruption' ? 0.82 : 0.5));
      this.addShockRings(group, 12, size * 0.92, size * 0.34, mixHex(tint, COLORS.white, 0.24), 0.3, 0.36);
      return group;
    }

    if (kind === 'Neutron Star Merger' || kind === 'Kilonova') {
      group.add(this.spriteGlow(COLORS.purple, size * 8.4, 0.26), this.spriteGlow(COLORS.gold, size * 6.4, 0.14));
      group.add(makeSpiralArms(11, 220, size * 4.2, COLORS.gold, seed + 12, 0.48));
      group.add(makeParticleCloud(1700, size * 4.4, tint, seed + 13, 0.52, 0.14));
      this.addShockRings(group, 13, size * 0.72, size * 0.36, tint, 0.36, 0.48);
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
      group.add(this.makeWormhole(size * 1.28, tint), makeSpiralArms(6, 110, size * 4.3, tint, seed, 0.66), makeRadialRays(76, size * 0.6, size * 4.8, COLORS.cyan, seed + 3, 0.54, 0.42));
      group.add(makeParticleCloud(760, size * 3.5, tint, seed + 4, 0.38, 0.14));
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
      const blackHole = this.makeBlackHoleLike(size * 1.38, tint, kind === 'Quasar' || kind === 'Supermassive Black Hole');
      group.add(blackHole);
      group.add(this.spriteGlow(COLORS.gold, size * 9.2, 0.15), this.spriteGlow(COLORS.purple, size * 6.4, 0.08));
      group.add(makeSpiralArms(kind === 'Tidal Disruption' ? 6 : 5, 190, size * 5.1, COLORS.gold, seed + 7, kind === 'Tidal Disruption' ? 0.88 : 0.62));
      group.add(makeRadialRays(118, size * 0.9, size * 5.8, COLORS.gold, seed + 8, 0.26, kind === 'Tidal Disruption' ? 0.68 : 0.52));
      this.addShockRings(group, 11, size * 1.05, size * 0.42, mixHex(tint, COLORS.white, 0.22), 0.36, 0.36);
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
      group.add(makeSmoothTidalBridge(size * 2.3, COLORS.cyan, COLORS.gold, seed + 12));
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

    if (kind === 'Neutron Star Merger' || kind === 'Kilonova') {
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
      const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.52, 48, 24), new THREE.MeshBasicMaterial({ color: COLORS.white, blending: THREE.AdditiveBlending }));
      group.add(this.spriteGlow(COLORS.white, size * 9.5, 0.36), core, makeSpiralArms(9, 110, size * 5.0, COLORS.softWhite, seed + 35, 0.6));
      group.add(makeRadialRays(144, size * 0.55, size * 5.8, COLORS.white, seed + 36, 1, 0.62));
      this.addShockRings(group, 12, size * 0.9, size * 0.44, COLORS.gold, 0.44, 0.5);
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
    group.add(this.spriteGlow(tint, size * 6, 0.24));
    for (let i = 0; i < 14; i += 1) {
      const ring = this.torus(size * (0.75 + i * 0.18), size * 0.012, i % 2 ? COLORS.cyan : tint, 0.62 - i * 0.024);
      ring.rotation.x = Math.PI / 2 + i * 0.04;
      ring.rotation.z = i * 0.25;
      ring.position.z = -i * 0.18;
      group.add(ring);
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
    if (obj.kind === 'Galaxy' || obj.kind === 'Galaxy Pair') return Math.max(17, obj.radius * 0.016);
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
  }

  private build(event: WorldEvent | null, special: Trackable | null) {
    this.root.clear();
    this.root.rotation.set(0, 0, 0);
    this.rings = [];
    this.staged = [];
    this.pulseTargets = [];
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

  private updatePulses(timer: number, t: number) {
    for (const obj of this.pulseTargets) {
      const pulse = obj.userData.pulse as { start: number; end: number; amplitude: number; speed: number; baseScale: THREE.Vector3 };
      const fade = 0.08;
      const active = smoothstep((t - pulse.start) / fade) * (1 - smoothstep((t - pulse.end) / fade));
      const beat = 1 + Math.sin(timer * pulse.speed) * pulse.amplitude * active;
      obj.scale.copy(pulse.baseScale).multiplyScalar(beat);
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
    lens.add(this.cinematicGlow(tint, isSupermassive ? 112 : 88, 0.16), this.cinematicGlow(COLORS.gold, 60, 0.11));
    lens.add(makeParticleCloud(isSupermassive ? 2600 : 1900, isSupermassive ? 50 : 38, mixHex(tint, COLORS.white, 0.16), seed + 301, 0.36, 0.13));
    lens.add(makeSpiralArms(isTidal ? 5 : 4, 240, isSupermassive ? 54 : 44, COLORS.gold, seed + 302, isTidal ? 0.7 : 0.48));
    this.addStage(lens, 0, 0.62, 0.76, 1.16);

    const disk = new THREE.Group();
    for (let i = 0; i < 18; i += 1) {
      const ring = this.cinematicRing(6.6 + i * 1.4, 0.045, i % 2 ? COLORS.gold : mixHex(tint, COLORS.white, 0.26), 0.62 - i * 0.025);
      ring.scale.y = 0.22 + i * 0.008;
      ring.rotation.z = i * 0.07;
      disk.add(ring);
    }
    const photon = this.cinematicRing(5.8, 0.09, COLORS.white, 0.88);
    photon.scale.y = 0.56;
    disk.add(photon);
    disk.add(new THREE.Mesh(new THREE.SphereGeometry(isSupermassive ? 6.2 : 5.3, 80, 40), new THREE.MeshBasicMaterial({ color: COLORS.black })));
    disk.add(this.cinematicGlow(COLORS.purple, isSupermassive ? 44 : 36, 0.16));
    this.addStage(disk, 0.08, 1.15, 0.58, 1.08);

    const infall = new THREE.Group();
    infall.add(makeRadialRays(isTidal ? 210 : 150, 5, isSupermassive ? 64 : 52, COLORS.gold, seed + 303, 0.28, isTidal ? 0.78 : 0.5));
    infall.add(makeParticleCloud(isSupermassive ? 3300 : 2300, isSupermassive ? 54 : 42, tint, seed + 304, 0.32, 0.14));
    this.addStage(infall, 0.3, 0.88, 0.42, 1.62);

    if (isQuasar || isSupermassive) {
      const jets = new THREE.Group();
      jets.add(this.cinematicBeam(128, isSupermassive ? 1.15 : 0.88, COLORS.cyan, 0.4));
      jets.add(this.cinematicBeam(130, isSupermassive ? 0.32 : 0.24, COLORS.white, 0.58));
      jets.add(makeParticleCloud(1300, 30, COLORS.cyan, seed + 305, 0.22, 0.15));
      this.addStage(jets, 0.38, 1.16, 0.2, 1.16);
    }

    const scar = new THREE.Group();
    scar.add(this.cinematicGlow(tint, 78, 0.12), this.ringSet(mixHex(tint, COLORS.white, 0.2), 14, 11, 2.2, 0.28, 0.5));
    this.addStage(scar, 0.68, 1.22, 0.8, 1.04);
  }

  private buildGalaxyCollisionCinematic(event: WorldEvent, tint: number, seed: number) {
    const approach = new THREE.Group();
    approach.add(makeElegantGalaxyPair(20, COLORS.cyan, COLORS.gold, seed + 401));
    approach.add(this.cinematicGlow(mixHex(tint, COLORS.gold, 0.45), 96, 0.14), this.cinematicGlow(COLORS.cyan, 78, 0.1));
    this.addStage(approach, 0, 0.52, 0.78, 1.12);

    const tidal = new THREE.Group();
    tidal.add(this.cinematicGlow(tint, 98, 0.22), this.cinematicGlow(COLORS.gold, 80, 0.14), this.cinematicGlow(COLORS.cyan, 66, 0.12));
    tidal.add(makeSmoothTidalBridge(31, COLORS.cyan, COLORS.gold, seed + 411));
    tidal.add(makeSpiralArms(12, 280, 54, tint, seed + 405, 0.54));
    tidal.add(makeParticleCloud(4800, 55, mixHex(tint, COLORS.gold, 0.24), seed + 406, 0.34, 0.135));
    tidal.add(this.ringSet(COLORS.gold, 11, 12, 2.35, 0.24, 0.42));
    this.addStage(tidal, 0.24, 0.78, 0.6, 1.18);

    const impact = new THREE.Group();
    impact.add(this.cinematicGlow(COLORS.white, 86, 0.24), this.cinematicGlow(tint, 146, 0.32), this.cinematicGlow(COLORS.gold, 122, 0.18));
    impact.add(this.luminousCore(5.2, COLORS.white, 0.92));
    impact.add(makeRadialRays(460, 4, 88, COLORS.gold, seed + 407, 0.62, 0.82));
    impact.add(makeParticleCloud(6200, 66, mixHex(tint, COLORS.gold, 0.4), seed + 408, 0.42, 0.15));
    impact.add(this.ringSet(COLORS.white, 9, 8, 3.4, 0.34, 0.36));
    this.addStage(impact, 0.46, 0.9, 0.14, 1.55);

    const remnant = new THREE.Group();
    remnant.add(this.cinematicGlow(mixHex(tint, COLORS.gold, 0.36), 112, 0.23), this.cinematicGlow(COLORS.cyan, 76, 0.12));
    remnant.add(makeSpiralArms(14, 340, 52, mixHex(tint, COLORS.white, 0.22), seed + 409, 0.62));
    remnant.add(makeParticleCloud(5200, 60, COLORS.gold, seed + 410, 0.38, 0.13));
    remnant.add(this.ringSet(mixHex(tint, COLORS.gold, 0.55), 16, 9.5, 2.15, 0.38, 0.38));
    this.addStage(remnant, 0.68, 1.22, 0.78, 1.06);
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
    const a = this.luminousCore(2.9, COLORS.cyan, 0.94);
    const b = this.luminousCore(2.9, COLORS.softWhite, 0.92);
    a.position.x = -12;
    b.position.x = 12;
    inspiral.add(this.cinematicGlow(COLORS.cyan, 74, 0.18), a, b);
    inspiral.add(makeLoopField(18, 22, COLORS.cyan, seed + 431, 0.44));
    inspiral.add(this.ringSet(COLORS.softWhite, 14, 7, 1.6, 0.32, 0.48));
    this.addStage(inspiral, 0, 0.54, 1.18, 0.42);

    const merger = new THREE.Group();
    merger.add(this.cinematicGlow(COLORS.white, 92, 0.32), this.cinematicGlow(tint, 124, 0.26), this.luminousCore(5.1, COLORS.white, 0.92));
    merger.add(makeRadialRays(300, 4, 72, COLORS.cyan, seed + 432, 0.52, 0.76));
    merger.add(makeRadialRays(210, 4, 68, COLORS.gold, seed + 433, 0.46, 0.58));
    merger.add(makeParticleCloud(4400, 50, tint, seed + 434, 0.56, 0.15));
    this.addStage(merger, 0.38, 0.82, 0.25, 1.42);

    const remnant = new THREE.Group();
    remnant.add(this.cinematicGlow(COLORS.purple, 110, 0.22), this.cinematicGlow(COLORS.gold, 78, 0.16));
    remnant.add(makeSpiralArms(10, 240, 44, COLORS.gold, seed + 435, 0.55));
    remnant.add(makeParticleCloud(3800, 52, COLORS.purple, seed + 436, 0.54, 0.12));
    remnant.add(this.ringSet(tint, 14, 10, 1.8, 0.34, 0.48));
    this.addStage(remnant, 0.66, 1.2, 0.72, 1.06);
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
      this.root.add(this.cinematicGlow(tint, 74, 0.22), makeSpiralArms(7, 160, 30, tint, seed + 7, 0.7));
      for (let i = 0; i < 26; i += 1) {
        const ring = this.cinematicRing(4 + i * 0.72, 0.055, i % 2 ? COLORS.purple : COLORS.cyan, 0.74 - i * 0.018);
        ring.position.z = i * 1.55;
        ring.rotation.x = Math.PI / 2 + i * 0.04;
        ring.rotation.z = i * 0.21;
        this.rings.push(ring);
        this.root.add(ring);
      }
      this.addCinematicRays(180, 6, 42, COLORS.cyan, seed + 8, 0.54, 0.46);
      this.particles = makeParticleCloud(2400, 42, COLORS.purple, seed + 9, 0.45, 0.18);
      this.root.add(this.particles);
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
  private streaks: THREE.LineSegments;
  private geometry: THREE.BufferGeometry;
  private rings: THREE.Mesh[] = [];

  constructor() {
    const positions = new Float32Array(760 * 6);
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
    for (let i = 0; i < 18; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3 + i * 0.58, 0.03, 8, 96),
        new THREE.MeshBasicMaterial({ color: i % 2 ? COLORS.blue : COLORS.purple, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending })
      );
      ring.position.z = 10 + i * 7;
      this.rings.push(ring);
      this.root.add(ring);
    }
    this.root.visible = false;
  }

  update(state: GameState, dt: number) {
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const t = state.warp.timer;
    for (let i = 0; i < 760; i += 1) {
      const a = i * 12.9898;
      const angle = (Math.sin(a) * 43758.5453) % (Math.PI * 2);
      const speed = 24 + (i % 41);
      const z1 = ((i * 5.1 + t * speed * 44) % 190) + 8;
      const z2 = z1 + 10 + (i % 11);
      const r = 1.5 + (i % 61) * 0.16 + smoothstep(state.warp.timer / 3.2) * 8.5;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r * 0.62;
      position.setXYZ(i * 2, x, y, z1);
      position.setXYZ(i * 2 + 1, x * 1.48, y * 1.48, z2);
    }
    position.needsUpdate = true;
    this.root.rotation.z += dt * 0.38;
    this.rings.forEach((ring, i) => {
      ring.rotation.z -= dt * (0.6 + i * 0.02);
      ring.scale.setScalar(1 + Math.sin(t * 4 + i) * 0.08);
    });
  }
}
