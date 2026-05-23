import { clamp, forwardVector, GameState, rightVector, scaleVec, addVec } from './simulation';
import type { Hud } from './ui';

function normalizeCode(event: KeyboardEvent) {
  if (event.code && event.code !== 'Unidentified') return event.code;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const lookup: Record<string, string> = {
    w: 'KeyW',
    a: 'KeyA',
    b: 'KeyB',
    s: 'KeyS',
    d: 'KeyD',
    q: 'KeyQ',
    e: 'KeyE',
    f: 'KeyF',
    h: 'KeyH',
    i: 'KeyI',
    j: 'KeyJ',
    m: 'KeyM',
    t: 'KeyT',
    u: 'KeyU',
    x: 'KeyX',
    y: 'KeyY',
    ' ': 'Space',
    Tab: 'Tab',
    Escape: 'Escape',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    Shift: 'ShiftLeft',
    Alt: 'AltLeft',
    Control: 'ControlLeft',
    ',': 'Comma',
    '.': 'Period',
    '/': 'Slash',
    '[': 'BracketLeft',
    ']': 'BracketRight'
  };
  if (/^[1-9]$/.test(key)) return `Digit${key}`;
  return lookup[key] ?? event.code;
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export class InputController {
  private keys = new Set<string>();
  private mouseSensitivity = 0.0022;
  private cameraDragActive = false;
  private cameraDragMoved = false;
  private dragPointerId = -1;
  private dragLastX = 0;
  private dragLastY = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private state: GameState,
    private hud: Hud
  ) {
    window.addEventListener('keydown', (event) => {
      if (isTextEntryTarget(event.target)) return;
      const code = normalizeCode(event);
      if (code === 'KeyB') {
        this.state.player.boostLocked = !this.state.player.boostLocked;
        this.state.setMessage(this.state.player.boostLocked ? 'Boost lock engaged.' : 'Boost lock disengaged.', 1.8);
        event.preventDefault();
        return;
      }
      const handled = this.state.handleKey(code);
      if (handled || ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(code)) {
        event.preventDefault();
      }
      this.keys.add(code);
    });

    window.addEventListener('keyup', (event) => {
      if (isTextEntryTarget(event.target)) return;
      this.keys.delete(normalizeCode(event));
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
    });

    this.canvas.addEventListener('pointerdown', (event) => {
      if (document.pointerLockElement === this.canvas) return;
      if (event.button !== 0) return;
      if (this.state.warp.active) return;
      if (this.hud.isPointerBlocked() || this.state.fullMapOpen || this.state.trackerOpen || this.state.eventMenuOpen || this.state.specialMenuOpen) return;
      this.cameraDragActive = true;
      this.cameraDragMoved = false;
      this.dragPointerId = event.pointerId;
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.cameraDragActive || this.state.warp.active || document.pointerLockElement === this.canvas || event.pointerId !== this.dragPointerId) return;
      const dx = event.clientX - this.dragLastX;
      const dy = event.clientY - this.dragLastY;
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 1) this.cameraDragMoved = true;
      this.state.player.cameraYawOffset += dx * 0.006;
      this.state.player.cameraPitchOffset = clamp(this.state.player.cameraPitchOffset - dy * 0.0045, -0.92, 0.92);
      event.preventDefault();
    });

    const endCameraDrag = (event: PointerEvent) => {
      if (event.pointerId !== this.dragPointerId) return;
      this.cameraDragActive = false;
      this.dragPointerId = -1;
      try {
        this.canvas.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture can already be released by browser gesture cancellation.
      }
    };
    this.canvas.addEventListener('pointerup', endCameraDrag);
    this.canvas.addEventListener('pointercancel', endCameraDrag);

    this.canvas.addEventListener('click', (event) => {
      this.canvas.focus();
      if (this.cameraDragMoved) {
        this.cameraDragMoved = false;
        event.preventDefault();
        return;
      }
      if (!this.state.fullMapOpen && !this.state.trackerOpen && !this.state.eventMenuOpen && !this.state.specialMenuOpen) {
        this.state.player.yaw += this.state.player.cameraYawOffset;
        this.state.player.pitch = clamp(this.state.player.pitch + this.state.player.cameraPitchOffset, -1.32, 1.32);
        this.state.player.cameraYawOffset = 0;
        this.state.player.cameraPitchOffset = 0;
        void this.canvas.requestPointerLock().catch(() => undefined);
      }
    });

    window.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement !== this.canvas) return;
      if (this.state.cutscene.active || this.state.warp.active || this.state.specialScene.active) return;
      if (this.hud.isPointerBlocked()) return;

      this.state.player.yaw += event.movementX * this.mouseSensitivity;
      this.state.player.pitch = clamp(this.state.player.pitch - event.movementY * this.mouseSensitivity, -1.32, 1.32);
    });
  }

  update(dt: number) {
    this.state.setCombatFiring(
      this.keys.has('KeyJ') &&
        !this.state.cutscene.active &&
        !this.state.warp.active &&
        !this.state.specialScene.active &&
        !this.state.fullMapOpen &&
        !this.hud.isPointerBlocked()
    );
    if (this.state.cutscene.active || this.state.warp.active || this.state.specialScene.active) return;
    if (this.state.fullMapOpen) return;

    const turn = 1.75 * dt;
    if (this.keys.has('ArrowLeft')) this.state.player.yaw -= turn;
    if (this.keys.has('ArrowRight')) this.state.player.yaw += turn;
    if (this.keys.has('ArrowUp')) this.state.player.pitch += turn;
    if (this.keys.has('ArrowDown')) this.state.player.pitch -= turn;
    this.state.player.pitch = clamp(this.state.player.pitch, -1.32, 1.32);

    const boost =
      this.state.player.boostLocked ||
      this.keys.has('ShiftLeft') ||
      this.keys.has('ShiftRight') ||
      this.keys.has('AltLeft') ||
      this.keys.has('AltRight') ||
      this.keys.has('ControlLeft') ||
      this.keys.has('ControlRight')
        ? this.state.player.boostMultiplier
        : 1;
    const speed = this.state.player.baseSpeed * boost * dt;
    const forward = forwardVector(this.state.player);
    const right = rightVector(this.state.player);
    let delta = { x: 0, y: 0, z: 0 };

    if (this.keys.has('KeyW')) delta = addVec(delta, scaleVec(forward, speed));
    if (this.keys.has('KeyS')) delta = addVec(delta, scaleVec(forward, -speed));
    if (this.keys.has('KeyD')) delta = addVec(delta, scaleVec(right, speed));
    if (this.keys.has('KeyA')) delta = addVec(delta, scaleVec(right, -speed));
    if (this.keys.has('KeyE')) delta.y += speed;
    if (this.keys.has('KeyQ')) delta.y -= speed;

    this.state.move(delta);
  }
}
