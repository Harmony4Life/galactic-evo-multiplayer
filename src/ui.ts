import { COLORS, distance, GameState, isEvent, RemotePlayerState, smoothstep, targetPosition, Trackable } from './simulation';

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[char] ?? char;
  });
}

function displayName(target: Trackable) {
  if (isEvent(target) && target.name === 'My Love For You' && !target.discovered) return '???';
  return isEvent(target) && target.phase === 'aftermath' ? `${target.name} Aftermath` : target.name;
}

function displayKind(target: Trackable) {
  return isEvent(target) && target.name === 'My Love For You' && !target.discovered ? '???' : target.kind;
}

export class Hud {
  private topHud = document.querySelector<HTMLDivElement>('#topHud')!;
  private promptChip = document.querySelector<HTMLDivElement>('#promptChip')!;
  private messageChip = document.querySelector<HTMLDivElement>('#messageChip')!;
  private combatPanel = document.querySelector<HTMLDivElement>('#combatPanel')!;
  private scanPanel = document.querySelector<HTMLDivElement>('#scanPanel')!;
  private menuPanel = document.querySelector<HTMLDivElement>('#menuPanel')!;
  private miniMapWrap = document.querySelector<HTMLDivElement>('#miniMapWrap')!;
  private miniMap = document.querySelector<HTMLCanvasElement>('#miniMap')!;
  private miniMapClose = document.querySelector<HTMLButtonElement>('#miniMapClose')!;
  private fullMapWrap = document.querySelector<HTMLDivElement>('#fullMapWrap')!;
  private fullMap = document.querySelector<HTMLCanvasElement>('#fullMap')!;
  private cinematicOverlay = document.querySelector<HTMLDivElement>('#cinematicOverlay')!;
  private cinematicTitle = document.querySelector<HTMLDivElement>('.cinematic-title')!;
  private cinematicProgress = document.querySelector<HTMLSpanElement>('.cinematic-progress span')!;
  private cinematicName = document.querySelector<HTMLElement>('.cinematic-copy strong')!;
  private cinematicLine = document.querySelector<HTMLParagraphElement>('.cinematic-copy p')!;
  private draggingMap = false;
  private lastMapPoint = { x: 0, y: 0 };
  private mapHover: { name: string; kind: string; color: number; position: { x: number; y: number }; distance: number } | null = null;

  constructor(private state: GameState) {
    this.fullMap.addEventListener('pointerdown', (event) => this.onFullMapDown(event));
    this.miniMapClose.addEventListener('click', (event) => {
      event.stopPropagation();
      this.state.showMinimap = false;
      this.state.fullMapOpen = false;
      this.draggingMap = false;
      this.state.setMessage('Minimap closed. Press M to reopen.', 2.4);
    });
    window.addEventListener('pointermove', (event) => this.onPointerMove(event));
    window.addEventListener('pointerup', () => {
      this.draggingMap = false;
    });
    this.miniMapWrap.addEventListener('click', () => {
      if (!this.state.cutscene.active && !this.state.warp.active && !this.state.specialScene.active) {
        this.state.fullMapOpen = true;
      }
    });
  }

  isPointerBlocked() {
    return this.state.fullMapOpen || this.state.trackerOpen || this.state.eventMenuOpen || this.state.specialMenuOpen;
  }

  update() {
    this.renderTopHud();
    this.renderPrompt();
    this.renderMessage();
    this.renderCombatPanel();
    this.renderScanPanel();
    this.renderMenus();
    this.renderMinimap();
    this.renderFullMap();
    this.renderCinematicOverlay();
  }

  private renderTopHud() {
    const pos = this.state.player.position;
    const tracked = this.state.trackedTarget;
    const trackedText = tracked
      ? `<b style="color:${hex(tracked.color)}">${escapeHtml(displayName(tracked))}</b><span>${Math.round(distance(pos, targetPosition(tracked))).toLocaleString()}u</span>`
      : '<b>No target</b><span>press T, Y, U, or M</span>';
    const multiplayer = this.state.multiplayer;
    const trackedFriend = this.state.trackedRemotePlayerId ? this.state.remotePlayers.get(this.state.trackedRemotePlayerId) : null;
    const friendText = trackedFriend
      ? `${escapeHtml(trackedFriend.name)} ${Math.round(distance(pos, trackedFriend.position)).toLocaleString()}u`
      : multiplayer.connected
        ? 'awaiting friend'
        : 'solo';
    const squadText = this.state.squadMemberId
      ? ` | squad ${escapeHtml(this.state.remotePlayers.get(this.state.squadMemberId)?.name ?? 'linked')}`
      : this.state.pendingSquadInvite
        ? ` | squad invite from ${escapeHtml(this.state.pendingSquadInvite.name)}`
        : this.state.incomingWarpRequest
          ? ` | RTW from ${escapeHtml(this.state.incomingWarpRequest.name)}`
          : '';
    const multiplayerText = multiplayer.connected
      ? `<b style="color:${hex(COLORS.green)}">Room ${escapeHtml(multiplayer.roomCode || 'OPEN')}</b><span>${Math.min(multiplayer.peerCount || 1, 2)}/2 pilots | ${friendText}${squadText}</span>`
      : '<b>Solo flight</b><span>use 2P co-op panel</span>';

    this.topHud.innerHTML = `
      <div><b>Galactic Evo 3D</b><span>${this.state.objects.filter((o) => o.kind === 'Star System').length} systems</span></div>
      <div><b>Position</b><span>${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)}</span></div>
      <div>${trackedText}</div>
      <div>${multiplayerText}</div>
    `;
  }

  private renderPrompt() {
    const locked = document.pointerLockElement !== null;
    const lines = locked
      ? 'WASD move | QE vertical | Shift/Alt/Ctrl boost | B boost lock | mouse/arrow look | Space scan | J turrets | I lock | H warp | X cancel'
      : 'Drag flight view to look around your ship | click for mouse look | J turrets | I lock | T tracker | Y events | U special | M map';
    this.promptChip.textContent = lines;
  }

  private renderMessage() {
    this.messageChip.classList.toggle('hidden', this.state.messageTimer <= 0);
    this.messageChip.textContent = this.state.message;
  }

  private renderCombatPanel() {
    const combat = this.state.combat;
    const target =
      (combat.targetLockId ? this.state.remotePlayers.get(combat.targetLockId) : null) ??
      (this.state.trackedRemotePlayerId ? this.state.remotePlayers.get(this.state.trackedRemotePlayerId) : null) ??
      Array.from(this.state.remotePlayers.values())[0] ??
      null;
    const shouldShow =
      combat.enabled ||
      combat.heat > 1 ||
      combat.overheated ||
      !!combat.lastDamage ||
      !!combat.lastIncoming ||
      !!target;
    this.combatPanel.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) return;

    const heat = Math.max(0, Math.min(100, combat.heat));
    const hp = Math.max(0, Math.min(100, combat.hp));
    const shield = Math.max(0, Math.min(50, combat.shield));
    const targetHp = target ? Math.max(0, Math.min(100, target.hp ?? 100)) : 0;
    const targetShield = target ? Math.max(0, Math.min(50, target.shield ?? 50)) : 0;
    const lockText = combat.targetLockId
      ? `LOCKED: ${escapeHtml(target?.name ?? 'Pilot')}`
      : combat.lockCooldown > 0
        ? `LOCK COOLDOWN ${combat.lockCooldown.toFixed(1)}s`
        : combat.enabled
          ? 'NO LOCK'
          : 'COMBAT OFFLINE';
    const heatText = combat.overheated ? `OVERHEATED ${Math.max(0, combat.overheatTimer).toFixed(1)}s` : combat.firing ? 'FIRING' : 'READY';
    const lastDamage = combat.lastDamage
      ? `<div class="combat-callout good">Hit ${escapeHtml(combat.lastDamage.name)} for ${combat.lastDamage.damage}. S ${Math.round(combat.lastDamage.remainingShield)} / H ${Math.round(combat.lastDamage.remainingHp)}.</div>`
      : '';
    const lastIncoming = combat.lastIncoming
      ? `<div class="combat-callout bad">${escapeHtml(combat.lastIncoming.name)} hit you for ${combat.lastIncoming.damage}. S ${Math.round(combat.lastIncoming.shield)} / H ${Math.round(combat.lastIncoming.hp)}.</div>`
      : '';

    this.combatPanel.innerHTML = `
      <div class="combat-title">
        <b>Combat</b>
        <span>${lockText}</span>
      </div>
      <div class="combat-row">
        <span>Shield</span>
        <em>${Math.round(shield)} / 50</em>
      </div>
      <div class="combat-bar shield"><i style="width:${shield * 2}%"></i></div>
      <div class="combat-row">
        <span>Hull</span>
        <em>${Math.round(hp)} / 100</em>
      </div>
      <div class="combat-bar hull"><i style="width:${hp}%"></i></div>
      <div class="combat-row">
        <span>Turrets</span>
        <em>${heatText}</em>
      </div>
      <div class="combat-bar heat"><i style="width:${heat}%"></i></div>
      ${
        target
          ? `<div class="combat-target">
              <span style="color:${hex(target.color)}">${escapeHtml(target.name)}</span>
              <b>S ${Math.round(targetShield)} | H ${Math.round(targetHp)}</b>
              <div class="combat-bar shield target-shield"><i style="width:${targetShield * 2}%"></i></div>
              <div class="combat-bar target"><i style="width:${targetHp}%"></i></div>
            </div>`
          : '<div class="combat-empty">Join multiplayer to arm turrets.</div>'
      }
      ${lastDamage}
      ${lastIncoming}
    `;
  }

  private renderScanPanel() {
    const selected = this.state.selectedTarget;
    const hidden = !selected || this.state.cutscene.active || this.state.warp.active || this.state.specialScene.active;
    this.scanPanel.classList.toggle('hidden', hidden);
    if (!selected) return;

    const description = isEvent(selected)
      ? selected.phase === 'aftermath'
        ? selected.aftermath
        : selected.description
      : selected.description;
    this.scanPanel.innerHTML = `
      <h2 style="color:${hex(selected.color)}">${escapeHtml(displayName(selected))}</h2>
      <span>${escapeHtml(displayKind(selected))}</span>
      <p>${escapeHtml(description)}</p>
    `;
  }

  private renderMenus() {
    if (this.state.cutscene.active || this.state.warp.active || this.state.specialScene.active) {
      this.menuPanel.classList.add('hidden');
      return;
    }

    if (this.state.trackerOpen) {
      this.menuPanel.classList.remove('hidden');
      const title = this.state.trackerMode === 'nearest' ? 'Nearest Tracker' : 'Star System / Galaxy Tracker';
      const source =
        this.state.trackerMode === 'nearest'
          ? { items: this.state.nearestTargets(9), page: 0, maxPage: 0 }
          : this.state.paged(this.state.starSystemTargets(), this.state.starSystemPage);
      this.state.starSystemPage = source.page;
      this.menuPanel.innerHTML = this.menuMarkup(title, 'TAB mode | 1-9 track | , . [ ] page | H warp | X clear', source.items, source.page, source.maxPage);
      return;
    }

    if (this.state.eventMenuOpen) {
      this.menuPanel.classList.remove('hidden');
      const source = this.state.paged(this.state.eventTargets(), this.state.eventPage);
      this.state.eventPage = source.page;
      this.menuPanel.innerHTML = this.menuMarkup('World Event Fast Travel', 'Y close | 1-9 warp to event | , . [ ] page', source.items, source.page, source.maxPage);
      return;
    }

    if (this.state.specialMenuOpen) {
      this.menuPanel.classList.remove('hidden');
      const source = this.state.paged(this.state.specialTargets(), this.state.specialPage);
      this.state.specialPage = source.page;
      this.menuPanel.innerHTML = this.menuMarkup('Special Planet Fast Travel', 'U close | 1-9 warp/track | F near planet to observe', source.items, source.page, source.maxPage);
      return;
    }

    this.menuPanel.classList.add('hidden');
  }

  private menuMarkup(title: string, hint: string, items: Trackable[], page: number, maxPage: number) {
    const rows = items
      .map((item, i) => {
        const d = Math.round(distance(this.state.player.position, targetPosition(item))).toLocaleString();
        const status = isEvent(item) ? item.phase.toUpperCase() : item.discovered ? 'SCANNED' : 'UNKNOWN';
        return `<li style="--accent:${hex(item.color)}"><b>${i + 1}</b><span>${escapeHtml(displayName(item))}</span><em>${escapeHtml(displayKind(item))} | ${status} | ${d}u</em></li>`;
      })
      .join('');
    return `
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(hint)}</p>
      <small>Page ${page + 1}/${maxPage + 1}</small>
      <ol>${rows}</ol>
    `;
  }

  private renderMinimap() {
    this.miniMapWrap.classList.toggle(
      'hidden',
      !this.state.showMinimap || this.state.fullMapOpen || this.state.cutscene.active || this.state.warp.active || this.state.specialScene.active
    );
    if (this.miniMapWrap.classList.contains('hidden')) return;
    const ctx = this.miniMap.getContext('2d');
    if (!ctx) return;
    const width = this.miniMap.width;
    const height = this.miniMap.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(5, 7, 22, 0.82)';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#50ffff';
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.fillStyle = '#50ffff';
    ctx.font = '12px Inter, Arial';
    ctx.fillText('Mini Map', 14, 22);
    const targets = this.state.mapTargets();
    for (const target of targets) {
      const p = this.state.universeToMap(target.position, width - 28, height - 42, false);
      const x = p.x + 14;
      const y = p.y + 32;
      if (x < 8 || x > width - 8 || y < 30 || y > height - 8) continue;
      ctx.fillStyle = hex(isEvent(target) && target.name === 'My Love For You' && !target.discovered ? COLORS.pink : target.color);
      ctx.beginPath();
      ctx.arc(x, y, isEvent(target) ? 2.7 : target.kind === 'Star System' ? 1.8 : 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const pilot of this.state.remotePlayers.values()) {
      const p = this.state.universeToMap(pilot.position, width - 28, height - 42, false);
      const x = p.x + 14;
      const y = p.y + 32;
      if (x < 8 || x > width - 8 || y < 30 || y > height - 8) continue;
      ctx.strokeStyle = hex(pilot.color);
      ctx.fillStyle = '#050716';
      ctx.beginPath();
      ctx.arc(x, y, this.state.trackedRemotePlayerId === pilot.id ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hex(pilot.color);
      ctx.fillRect(x - 1, y - 7, 2, 14);
      ctx.fillRect(x - 7, y - 1, 14, 2);
    }
    const p = this.state.universeToMap(this.state.player.position, width - 28, height - 42, false);
    ctx.fillStyle = '#5aff8c';
    ctx.beginPath();
    ctx.arc(p.x + 14, p.y + 32, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderFullMap() {
    this.fullMapWrap.classList.toggle('hidden', !this.state.fullMapOpen);
    if (!this.state.fullMapOpen) return;
    const ctx = this.fullMap.getContext('2d');
    if (!ctx) return;
    const width = this.fullMap.width;
    const height = this.fullMap.height;
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createRadialGradient(width * 0.54, height * 0.48, 0, width * 0.54, height * 0.48, Math.max(width, height) * 0.72);
    bg.addColorStop(0, '#07112a');
    bg.addColorStop(0.42, '#050716');
    bg.addColorStop(1, '#01030c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let arm = 0; arm < 5; arm += 1) {
      ctx.beginPath();
      for (let i = 0; i < 180; i += 1) {
        const u = i / 179;
        const a = arm * ((Math.PI * 2) / 5) + u * 3.8;
        const r = 55 + u * Math.min(width, height) * 0.58;
        const x = width / 2 + Math.cos(a) * r * 1.05;
        const y = height / 2 + Math.sin(a) * r * 0.62;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = arm % 2 ? 'rgba(255, 205, 90, 0.22)' : 'rgba(80, 255, 255, 0.20)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 220; i += 1) {
      const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * width;
      const y = 98 + (Math.sin(i * 47.3 + 2.1) * 0.5 + 0.5) * (height - 125);
      ctx.fillStyle = i % 5 === 0 ? 'rgba(255, 205, 90, 0.36)' : 'rgba(210, 220, 240, 0.24)';
      ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
    ctx.restore();
    ctx.strokeStyle = '#50ffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    ctx.strokeStyle = 'rgba(80, 255, 255, 0.11)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i += 1) {
      const x = (width * i) / 10;
      const y = (height * i) / 10;
      ctx.beginPath();
      ctx.moveTo(x, 88);
      ctx.lineTo(x, height - 24);
      ctx.moveTo(24, y);
      ctx.lineTo(width - 24, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#50ffff';
    ctx.font = '700 36px Inter, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('UNIVERSE MAP', width / 2, 52);
    ctx.font = '15px Inter, Arial';
    ctx.fillStyle = '#f5f5f5';
    ctx.fillText('Click targets to warp. Click a friend for RTW/direct squad warp. Drag empty space to pan.', width / 2, 82);
    ctx.textAlign = 'left';

    for (const target of this.state.mapTargets()) {
      const p = this.state.universeToMap(target.position, width, height);
      if (p.x < 18 || p.x > width - 18 || p.y < 100 || p.y > height - 18) continue;
      const hiddenLove = isEvent(target) && target.name === 'My Love For You' && !target.discovered;
      const accent = hiddenLove ? COLORS.pink : target.color;
      ctx.strokeStyle = hex(accent);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.shadowColor = hex(accent);
      ctx.shadowBlur = isEvent(target) ? 12 : target.kind === 'Star System' ? 7 : 18;
      const radius = isEvent(target) ? 5.5 : target.kind === 'Star System' ? 3.5 : 9;
      ctx.beginPath();
      if (isEvent(target)) {
        ctx.moveTo(p.x, p.y - radius);
        ctx.lineTo(p.x + radius, p.y);
        ctx.lineTo(p.x, p.y + radius);
        ctx.lineTo(p.x - radius, p.y);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (!isEvent(target) && (target.kind === 'Galaxy' || target.kind === 'Galaxy Pair')) {
        for (let arm = 0; arm < 3; arm += 1) {
          ctx.beginPath();
          for (let i = 0; i < 26; i += 1) {
            const u = i / 25;
            const a = arm * ((Math.PI * 2) / 3) + u * 2.8;
            const rr = radius + u * 18;
            const x = p.x + Math.cos(a) * rr;
            const y = p.y + Math.sin(a) * rr * 0.48;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = hex(accent);
          ctx.globalAlpha = 0.72;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      if (isEvent(target) || target.kind === 'Galaxy' || target.kind === 'Galaxy Pair') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + (isEvent(target) ? 8 : 12), 0, Math.PI * 2);
        ctx.stroke();
      }
      if (target === this.state.trackedTarget) {
        ctx.strokeStyle = '#5aff8c';
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 13, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (!isEvent(target) && (target.kind === 'Galaxy' || target.name === 'Solar System')) {
        ctx.font = '11px Inter, Arial';
        ctx.fillStyle = hex(accent);
        ctx.fillText(target.name, p.x + 13, p.y - 8);
      }
    }

    for (const pilot of this.state.remotePlayers.values()) {
      const p = this.state.universeToMap(pilot.position, width, height);
      if (p.x < 18 || p.x > width - 18 || p.y < 100 || p.y > height - 18) continue;
      ctx.strokeStyle = hex(pilot.color);
      ctx.fillStyle = '#050716';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.state.trackedRemotePlayerId === pilot.id ? 10 : 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hex(pilot.color);
      ctx.fillRect(p.x - 2, p.y - 13, 4, 26);
      ctx.fillRect(p.x - 13, p.y - 2, 26, 4);
      ctx.font = '12px Inter, Arial';
      ctx.fillText(pilot.name, p.x + 14, p.y - 8);
    }

    const ship = this.state.universeToMap(this.state.player.position, width, height);
    ctx.fillStyle = '#5aff8c';
    ctx.beginPath();
    ctx.arc(ship.x, ship.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('YOU', ship.x + 12, ship.y - 8);

    if (this.mapHover) {
      const boxWidth = 320;
      const boxHeight = 74;
      const x = Math.min(width - boxWidth - 18, this.mapHover.position.x + 18);
      const y = Math.min(height - boxHeight - 18, Math.max(108, this.mapHover.position.y + 18));
      ctx.fillStyle = 'rgba(5, 7, 22, 0.94)';
      ctx.strokeStyle = hex(this.mapHover.color);
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, boxWidth, boxHeight);
      ctx.strokeRect(x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1);
      ctx.fillStyle = hex(this.mapHover.color);
      ctx.font = '700 15px Inter, Arial';
      ctx.fillText(this.mapHover.name, x + 12, y + 24);
      ctx.fillStyle = '#d2dcf0';
      ctx.font = '12px Inter, Arial';
      ctx.fillText(`${this.mapHover.kind} | ${Math.round(this.mapHover.distance).toLocaleString()}u`, x + 12, y + 48);
      ctx.fillText('Click to warp/request. Drag empty space to pan. Press M or Esc to exit.', x + 12, y + 64);
    }
  }

  private renderCinematicOverlay() {
    const event = this.state.cutscene.active ? this.state.cutscene.event : null;
    const special = this.state.specialScene.active ? this.state.specialScene.target : null;
    const active = this.state.cutscene.active || this.state.specialScene.active;
    this.cinematicOverlay.classList.toggle('hidden', !active);
    if (!active) return;

    const timer = event ? this.state.cutscene.timer : this.state.specialScene.timer;
    const duration = event ? this.state.cutscene.duration : this.state.specialScene.duration;
    const t = timer / Math.max(0.1, duration);
    const title = event ? this.titleForEvent(event.kind) : 'SPECIAL PLANET EVENT';
    const target = event ?? special;
    const line = event ? this.cutsceneLine(event, t) : this.specialLine(special);
    const color = target?.color ?? COLORS.cyan;

    this.cinematicTitle.textContent = title;
    this.cinematicTitle.style.color = hex(color);
    this.cinematicProgress.style.width = `${Math.round(clamp01(t) * 100)}%`;
    this.cinematicProgress.style.background = hex(color);
    this.cinematicName.textContent = target ? displayName(target) : '';
    this.cinematicName.style.color = hex(color);
    this.cinematicLine.textContent = line;
  }

  private cutsceneLine(event: { lines: string[]; aftermath: string; phase: string }, t: number) {
    if (event.phase === 'aftermath') return event.aftermath;
    const index = Math.min(event.lines.length - 1, Math.floor(clamp01(t) * event.lines.length));
    return event.lines[index] ?? '';
  }

  private specialLine(target: Trackable | null) {
    if (!target) return '';
    if (target.kind === 'Diamond Rain Planet') return 'From inside the planet, diamonds fall through blue pressure-clouds like crystallized starlight.';
    if (target.kind === 'Iron Storm World') return 'From inside the furnace-atmosphere, molten iron rain slashes downward while magnetic lightning fractures the sky.';
    if (target.kind === 'Mega Ringed Giant' || target.kind === 'Ringed Giant') return 'The ring becomes a cathedral of ice, rock, dust, and light: a colossal halo sweeping past the ship.';
    if (target.kind === 'Crystal Planet') return 'Crystal continents refract starlight into spectral halos across the surface.';
    return target.description;
  }

  private titleForEvent(kind: string) {
    const titles: Record<string, string> = {
      Supernova: 'xoSupaNovaxo',
      'Gamma Ray Burst': 'GAMMA RAY BURST',
      Hypernova: 'HYPERNOVA CROWN',
      'Neutron Star Merger': 'NEUTRON STAR BALLET',
      Magnetar: 'MAGNETAR AWAKENING',
      'Black Hole Birth': 'BLACK HOLE BIRTH',
      'Solar System Birth': 'PLANETARY FORMATION DISK',
      'Planet Collision': 'PLANETARY COLLISION',
      'Diamond Rain': 'DIAMOND RAIN STORM',
      Wormhole: 'WORMHOLE RIFT',
      'Fast Radio Burst': 'FAST RADIO BURST',
      'Gravitational Wave': 'GRAVITATIONAL WAVE RINGDOWN',
      'Dark Matter Caustic': 'DARK MATTER CAUSTIC',
      Pulsar: 'PULSAR LIGHTHOUSE',
      'Planetary Nebula': 'PLANETARY NEBULA BLOOM',
      'Tidal Disruption': 'TIDAL DISRUPTION EVENT',
      Kilonova: 'KILONOVA REMNANT',
      'Wolf-Rayet Wind': 'WOLF-RAYET WIND',
      'Tidal Lock Eclipse': 'TIDAL LOCK ECLIPSE',
      'Atmospheric Escape': 'ATMOSPHERIC ESCAPE',
      Cryovolcanism: 'CRYOVOLCANIC ERUPTION',
      'Heart Supernova': 'MY LOVE FOR YOU',
      'Made in Heaven': 'MADE IN HEAVEN',
      'Galaxy Collision': 'GALAXY COLLISION',
      Quasar: 'QUASAR IGNITION',
      'Supermassive Black Hole': 'SUPERMASSIVE BLACK HOLE FEAST'
    };
    return titles[kind] ?? 'COSMIC EVENT';
  }

  private onFullMapDown(event: PointerEvent) {
    if (!this.state.fullMapOpen) return;
    const rect = this.fullMap.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.fullMap.width;
    const y = ((event.clientY - rect.top) / rect.height) * this.fullMap.height;
    const target = this.state.targetFromMap(x, y, this.fullMap.width, this.fullMap.height);
    const pilot = this.remotePlayerFromMap(x, y, this.fullMap.width, this.fullMap.height);
    if (pilot) {
      this.state.requestWarpToRemote(pilot);
      this.state.fullMapOpen = false;
      return;
    }
    if (target) {
      if (isEvent(target) && target.name === 'My Love For You' && !target.discovered) {
        this.state.setMessage('You must first search your feelings for the Zephyr.', 4);
      } else {
        this.state.beginWarp(target);
      }
      return;
    }
    this.draggingMap = true;
    this.lastMapPoint = { x: event.clientX, y: event.clientY };
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.state.fullMapOpen) return;
    const rect = this.fullMap.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * this.fullMap.width;
    const y = ((event.clientY - rect.top) / rect.height) * this.fullMap.height;
    this.mapHover = this.hoverFromMap(x, y, this.fullMap.width, this.fullMap.height);
    if (!this.draggingMap) return;
    this.state.mapPan.x += event.clientX - this.lastMapPoint.x;
    this.state.mapPan.y += event.clientY - this.lastMapPoint.y;
    this.lastMapPoint = { x: event.clientX, y: event.clientY };
  }

  private remotePlayerFromMap(x: number, y: number, width: number, height: number) {
    let best: RemotePlayerState | null = null;
    let bestDistance = Infinity;
    for (const pilot of this.state.remotePlayers.values()) {
      const p = this.state.universeToMap(pilot.position, width, height);
      const screenDistance = Math.hypot(x - p.x, y - p.y);
      if (screenDistance < 18 && screenDistance < bestDistance) {
        best = pilot;
        bestDistance = screenDistance;
      }
    }
    return best;
  }

  private hoverFromMap(x: number, y: number, width: number, height: number) {
    const pilot = this.remotePlayerFromMap(x, y, width, height);
    if (pilot) {
      const p = this.state.universeToMap(pilot.position, width, height);
      return {
        name: pilot.name,
        kind: 'Friend pilot',
        color: pilot.color,
        position: p,
        distance: distance(this.state.player.position, pilot.position)
      };
    }
    const target = this.state.targetFromMap(x, y, width, height);
    if (!target) return null;
    const p = this.state.universeToMap(target.position, width, height);
    return {
      name: displayName(target),
      kind: displayKind(target),
      color: target.color,
      position: p,
      distance: distance(this.state.player.position, target.position)
    };
  }
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
