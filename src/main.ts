import './styles.css';
import { GameState } from './simulation';
import { InputController } from './input';
import { UniverseRenderer } from './render';
import { Hud } from './ui';
import { MultiplayerClient } from './multiplayer';

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');

if (!canvas) {
  throw new Error('Missing #gameCanvas');
}

const state = new GameState();
const renderer = new UniverseRenderer(canvas);
const hud = new Hud(state);
const input = new InputController(canvas, state, hud);
const multiplayer = new MultiplayerClient(state);
const qaCaptureEnabled = new URLSearchParams(window.location.search).has('qaCapture');

if (qaCaptureEnabled) {
  const image = document.createElement('img');
  image.id = 'qa-canvas-capture';
  image.alt = '';
  image.hidden = true;
  document.body.appendChild(image);
  window.setInterval(() => {
    image.src = canvas.toDataURL('image/png');
  }, 1400);

  (window as typeof window & {
    galacticEvoQA?: {
      startEvent: (query: string) => boolean;
      startEventAt: (query: string, ratio: number) => boolean;
      showTarget: (query: string) => boolean;
      startSpecial: (query: string) => boolean;
    };
  }).galacticEvoQA = {
    startEvent(query: string) {
      const lower = query.toLowerCase();
      const event = state.events.find((item) => item.name.toLowerCase().includes(lower) || item.kind.toLowerCase().includes(lower));
      if (!event) return false;
      state.startEvent(event);
      return true;
    },
    startEventAt(query: string, ratio: number) {
      const lower = query.toLowerCase();
      const event = state.events.find((item) => item.name.toLowerCase().includes(lower) || item.kind.toLowerCase().includes(lower));
      if (!event) return false;
      state.startEvent(event);
      state.cutscene.timer = state.cutscene.duration * Math.max(0, Math.min(0.98, ratio));
      return true;
    },
    showTarget(query: string) {
      const lower = query.toLowerCase();
      const target = [...state.objects, ...state.events].find((item) => item.name.toLowerCase().includes(lower) || item.kind.toLowerCase().includes(lower));
      if (!target) return false;
      state.cutscene.active = false;
      state.cutscene.event = null;
      state.specialScene.active = false;
      state.specialScene.target = null;
      state.warp.active = false;
      state.player.position = {
        x: target.position.x,
        y: target.position.y + 260,
        z: target.position.z - 2600
      };
      state.player.yaw = 0;
      state.player.pitch = 0;
      state.trackedTarget = target;
      state.selectedTarget = target;
      return true;
    },
    startSpecial(query: string) {
      const lower = query.toLowerCase();
      const target = state.specialTargets().find((item) => item.name.toLowerCase().includes(lower) || item.kind.toLowerCase().includes(lower));
      if (!target) return false;
      state.beginSpecialPlanetScene(target);
      return true;
    }
  };

  const qa = (window as typeof window & { galacticEvoQA: NonNullable<(typeof window & { galacticEvoQA?: unknown })['galacticEvoQA']> }).galacticEvoQA as {
    startEvent: (query: string) => boolean;
    startEventAt: (query: string, ratio: number) => boolean;
    showTarget: (query: string) => boolean;
    startSpecial: (query: string) => boolean;
  };
  const panel = document.createElement('div');
  panel.id = 'qa-trigger-panel';
  panel.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;gap:4px;opacity:.02;pointer-events:auto;';
  const commands: Array<[string, string, () => boolean]> = [
    ['qa-show-zahra', 'zahra', () => qa.showTarget("Zahra's Resonance")],
    ['qa-event-love', 'love', () => qa.startEvent('My Love For You')],
    ['qa-event-love-burst', 'love burst', () => qa.startEventAt('My Love For You', 0.58)],
    ['qa-event-love-end', 'love end', () => qa.startEventAt('My Love For You', 0.86)],
    ['qa-event-xosupernova', 'xosupernova', () => qa.startEvent('xoSupaNovaxo')],
    ['qa-event-hypernova', 'hypernova', () => qa.startEvent('Hypernova Crown')],
    ['qa-event-neutron', 'neutron', () => qa.startEvent('Neutron Star Ballet')],
    ['qa-event-magnetar', 'magnetar', () => qa.startEvent('Magnetar Awakening')],
    ['qa-event-planet-collision', 'planet collision', () => qa.startEvent('Planetary Collision')],
    ['qa-event-gamma', 'gamma', () => qa.startEvent('Gamma Ray Burst')],
    ['qa-event-blackhole', 'blackhole', () => qa.startEvent('Supermassive Black Hole')],
    ['qa-show-galaxy-collision', 'galaxy marker', () => qa.showTarget('Galaxy Collision')],
    ['qa-event-galaxy', 'galaxy', () => qa.startEvent('Galaxy Collision')],
    ['qa-event-galaxy-impact', 'galaxy impact', () => qa.startEventAt('Galaxy Collision', 0.52)],
    ['qa-event-made', 'made', () => qa.startEvent('Made in Heaven')],
    ['qa-event-made-vortex', 'made vortex', () => qa.startEventAt('Made in Heaven', 0.48)],
    ['qa-event-made-reset', 'made reset', () => qa.startEventAt('Made in Heaven', 0.82)],
    ['qa-special-heart', 'heart planet', () => qa.startSpecial("Zahra's My Heart")],
    ['qa-special-diamond', 'diamond interior', () => qa.startSpecial('Diamond Rain Planet')],
    ['qa-special-iron', 'iron interior', () => qa.startSpecial('Iron Storm World')]
  ];
  for (const [id, label, run] of commands) {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      run();
    });
    panel.appendChild(button);
  }
  document.body.appendChild(panel);
}

let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  input.update(dt);
  state.update(dt);
  multiplayer.update(dt);
  renderer.render(state, dt);
  hud.update();

  requestAnimationFrame(frame);
}

hud.update();
requestAnimationFrame(frame);
