import { CONFIG } from '../../config.js';

const BASE_URL = import.meta.env.BASE_URL || './';
const ENERGY_STREAK_TEXTURES = Object.freeze(Array.from({ length: 12 }, (_, index) => ({
  key: `energy_streak_2048_v${index}.webp`,
  path: `img/generated/VFX/energy_streak_2048_v${index}.webp`,
})));

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  activeStreaks: 1,
  respawnDelayMs: 60,
  lifeMinMs: 460,
  lifeMaxMs: 780,
  alphaMin: 0.1,
  alphaMax: 0.38,
  startDepth: 0.12,
  endDepth: 1.05,
  widthMin: 0.16,
  widthMax: 0.32,
  heightMin: 0.78,
  heightMax: 1.45,
  hueVariance: 0.14,
  angleJitter: 0.18,
  driftMin: 0.04,
  driftMax: 0.13,
  tintLeft: 0xb9d9ff,
  tintRight: 0xd4eeff,
  depth: 11,
});

const SIDE_LEFT = 'left';
const SIDE_RIGHT = 'right';
const SIDE_SEQUENCE = Object.freeze([SIDE_LEFT, SIDE_RIGHT]);

function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  const inv = 1 - clamp(t, 0, 1);
  return 1 - inv * inv * inv;
}

function alphaEnvelope(t) {
  const clamped = clamp(t, 0, 1);
  const fadeIn = clamp(clamped / 0.18, 0, 1);
  const fadeOut = 1 - clamp((clamped - 0.58) / 0.42, 0, 1);
  return Math.sin(Math.PI * clamped) * 0.6 + fadeIn * fadeOut * 0.4;
}

function sideBaseAngle(side) {
  if (side === SIDE_LEFT) {
    return Math.PI; // 180°
  }
  return 0; // 0°
}

function pickRange(scene, min, max) {
  return scene?.math?.floatBetween?.(min, max) ?? (min + Math.random() * (max - min));
}

function chooseTextureKey(scene) {
  const index = scene?.math?.between
    ? scene.math.between(0, ENERGY_STREAK_TEXTURES.length - 1)
    : Math.floor(Math.random() * ENERGY_STREAK_TEXTURES.length);
  return ENERGY_STREAK_TEXTURES[index].key;
}

function tintShift(baseTint, factor) {
  const r = (baseTint >> 16) & 0xff;
  const g = (baseTint >> 8) & 0xff;
  const b = baseTint & 0xff;
  const scale = 1 + factor;
  const nextR = clamp(Math.round(r * scale), 90, 255);
  const nextG = clamp(Math.round(g * (1 + factor * 0.8)), 110, 255);
  const nextB = clamp(Math.round(b * (1 + factor * 1.1)), 130, 255);
  return (nextR << 16) | (nextG << 8) | nextB;
}

class WarpTunnelVFX {
  static preload(scene) {
    ENERGY_STREAK_TEXTURES.forEach((texture) => {
      if (!scene.textures.exists(texture.key)) {
        scene.load.image(texture.key, assetUrl(texture.path));
      }
    });
  }

  constructor(scene, settings = {}) {
    this.scene = scene;
    this.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    this.streaks = [];
    this.snapshot = null;
    this.timeSinceSpawn = 0;
    this.sideIndex = 0;
  }

  create() {
    if (!this.settings.enabled) {
      return;
    }

    const count = Math.max(0, Math.floor(this.settings.activeStreaks));
    for (let index = 0; index < count; index += 1) {
      const sprite = this.scene.add.image(0, 0, chooseTextureKey(this.scene))
        .setOrigin(0.5, 0.5)
        .setDepth(this.settings.depth)
        .setBlendMode('ADD')
        .setVisible(false);
      this.streaks.push({ sprite, alive: false, lifeMs: 0, ageMs: 0, side: SIDE_LEFT, drift: 0, angle: 0, startDepth: 0, endDepth: 0 });
    }
  }

  resize() {
    // VFX uses viewport from snapshot each frame, no persistent geometry recalculation required.
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
  }

  update(_time, deltaMs) {
    if (!this.settings.enabled || this.streaks.length === 0) {
      return;
    }

    const snapshot = this.snapshot;
    const viewport = snapshot?.viewport;
    const tube = snapshot?.tube;
    if (!viewport || !tube) {
      this.streaks.forEach((entry) => entry.sprite?.setVisible(false));
      return;
    }

    const dt = Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 16.67);
    this.timeSinceSpawn += dt;
    this.spawnIfNeeded();

    const centerX = Number.isFinite(viewport.centerX) ? viewport.centerX : (viewport.width || this.scene.scale.width) * 0.5;
    const centerY = Number.isFinite(viewport.centerY) ? viewport.centerY : (viewport.height || this.scene.scale.height) * 0.5;

    this.streaks.forEach((entry) => {
      if (!entry.alive) {
        entry.sprite.setVisible(false);
        return;
      }

      entry.ageMs += dt;
      const lifeT = clamp(entry.ageMs / Math.max(1, entry.lifeMs), 0, 1);
      if (lifeT >= 1) {
        entry.alive = false;
        entry.sprite.setVisible(false);
        return;
      }

      const easedT = easeOutCubic(lifeT);
      const depth = lerp(entry.startDepth, entry.endDepth, easedT);
      const perspective = Math.max(0.05, 1 - depth);
      const bendInfluence = 1 - perspective;

      const animatedAngle = entry.angle + Math.sin((entry.ageMs / 1000) * 4.2) * entry.drift;
      const radius = CONFIG.TUBE_RADIUS * perspective;
      const posX = centerX + Math.sin(animatedAngle) * radius + (tube.centerOffsetX || 0) * bendInfluence;
      const posY = centerY + Math.cos(animatedAngle) * radius * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bendInfluence;

      const alongWallStretch = lerp(entry.baseScaleY * 0.8, entry.baseScaleY * 1.22, easedT);
      const acrossWallScale = lerp(entry.baseScaleX, entry.baseScaleX * 0.64, easedT);
      const alpha = clamp(lerp(this.settings.alphaMin, this.settings.alphaMax, 1 - lifeT) * alphaEnvelope(lifeT), 0, 1);

      entry.sprite
        .setVisible(true)
        .setPosition(posX, posY)
        .setRotation(animatedAngle + Math.PI * 0.5)
        .setScale(acrossWallScale * (0.65 + perspective), alongWallStretch * (0.7 + perspective * 1.3))
        .setAlpha(alpha);
    });
  }

  spawnIfNeeded() {
    if (this.timeSinceSpawn < this.settings.respawnDelayMs) {
      return;
    }

    const deadEntry = this.streaks.find((entry) => !entry.alive);
    if (!deadEntry) {
      return;
    }

    this.timeSinceSpawn = 0;
    const side = SIDE_SEQUENCE[this.sideIndex % SIDE_SEQUENCE.length];
    this.sideIndex += 1;

    const baseAngle = sideBaseAngle(side);
    deadEntry.side = side;
    deadEntry.alive = true;
    deadEntry.ageMs = 0;
    deadEntry.lifeMs = pickRange(this.scene, this.settings.lifeMinMs, this.settings.lifeMaxMs);
    deadEntry.startDepth = pickRange(this.scene, this.settings.startDepth, this.settings.startDepth + 0.08);
    deadEntry.endDepth = pickRange(this.scene, this.settings.endDepth - 0.08, this.settings.endDepth);
    deadEntry.drift = pickRange(this.scene, this.settings.driftMin, this.settings.driftMax);
    deadEntry.angle = baseAngle + pickRange(this.scene, -this.settings.angleJitter, this.settings.angleJitter);
    deadEntry.baseScaleX = pickRange(this.scene, this.settings.widthMin, this.settings.widthMax);
    deadEntry.baseScaleY = pickRange(this.scene, this.settings.heightMin, this.settings.heightMax);

    const tintBase = side === SIDE_LEFT ? this.settings.tintLeft : this.settings.tintRight;
    const tintNoise = pickRange(this.scene, -this.settings.hueVariance, this.settings.hueVariance);
    const tintColor = tintShift(tintBase, tintNoise);

    deadEntry.sprite
      .setTexture(chooseTextureKey(this.scene))
      .setFlipY(side === SIDE_RIGHT)
      .setTint(tintColor)
      .setVisible(true)
      .setAlpha(0);
  }

  destroy() {
    this.streaks.forEach((entry) => entry.sprite?.destroy());
    this.streaks.length = 0;
    this.snapshot = null;
  }
}

export { WarpTunnelVFX };
