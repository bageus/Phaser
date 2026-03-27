const BASE_URL = import.meta.env.BASE_URL || './';

const STREAK_TEXTURE_COUNT = 12;
const STREAK_TEXTURE_KEYS = Array.from(
  { length: STREAK_TEXTURE_COUNT },
  (_, i) => `energy_streak_2048_v${i}.webp`,
);
const STREAK_TEXTURE_PATH_PREFIX = 'img/generated/VFX/';

const WARP_STREAK_CONFIG = {
  enabled: true,
  backLayerCount: 8,
  frontLayerCount: 6,
  spawnRadiusFactor: 0.92,
  centerRadiusFactor: 0.08,
  backSpeedMin: 40,
  backSpeedMax: 80,
  frontSpeedMin: 70,
  frontSpeedMax: 140,
  backScaleMin: 0.04,
  backScaleMax: 0.08,
  frontScaleMin: 0.07,
  frontScaleMax: 0.14,
  backAlphaMax: 0.25,
  frontAlphaMax: 0.5,
  stretchFactor: 1.6,
  turbulenceAmount: 0.3,
  speedMultiplier: 1,
  leftAngleMin: 2.356,
  leftAngleMax: 3.927,
  rightAngleMin: -0.785,
  rightAngleMax: 0.785,
};

const BACK_DEPTH = 8;
const FRONT_DEPTH = 11;

function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickLeftOrRight() {
  return Math.random() < 0.5 ? 'left' : 'right';
}

function pickRandomAngle(side, cfg) {
  if (side === 'left') {
    return randomInRange(cfg.leftAngleMin, cfg.leftAngleMax);
  }
  return randomInRange(cfg.rightAngleMin, cfg.rightAngleMax);
}

function pickRandomTexture() {
  return STREAK_TEXTURE_KEYS[Math.floor(Math.random() * STREAK_TEXTURE_COUNT)];
}

function makeStreak(sprite, alphaMax) {
  return { sprite, alive: false, vx: 0, vy: 0, turbVx: 0, turbVy: 0, baseScale: 1, alphaMax, totalDist: 1, traveled: 0 };
}

/**
 * Resets a streak sprite to a fresh position along the tube wall and begins its
 * inward journey toward the tube center.
 *
 * @param {object} streak - Internal streak descriptor
 * @param {number} cx - Tube center X in screen space
 * @param {number} cy - Tube center Y in screen space
 * @param {number} spawnRx - Ellipse radius X at spawn position
 * @param {number} spawnRy - Ellipse radius Y at spawn position
 * @param {object} layerCfg - Layer-specific config values
 * @param {object} cfg - Full WARP_STREAK_CONFIG
 */
function respawnStreak(streak, cx, cy, spawnRx, spawnRy, layerCfg, cfg) {
  const side = pickLeftOrRight();
  const angle = pickRandomAngle(side, cfg);

  const spawnX = cx + Math.cos(angle) * spawnRx;
  const spawnY = cy + Math.sin(angle) * spawnRy;

  const dx = cx - spawnX;
  const dy = cy - spawnY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  streak.sprite.setPosition(spawnX, spawnY);
  streak.sprite.setTexture(pickRandomTexture());
  streak.sprite.setFlipY(side === 'right');

  const baseScale = randomInRange(layerCfg.scaleMin, layerCfg.scaleMax);
  streak.sprite.setScale(baseScale, baseScale);
  streak.sprite.setAlpha(layerCfg.alphaMax);
  streak.sprite.setRotation(Math.atan2(dy, dx));
  streak.sprite.setVisible(true);

  streak.vx = (dx / dist) * randomInRange(layerCfg.speedMin, layerCfg.speedMax);
  streak.vy = (dy / dist) * randomInRange(layerCfg.speedMin, layerCfg.speedMax);

  // Perpendicular turbulence direction (normal to movement)
  const perpX = -dy / dist;
  const perpY = dx / dist;
  const turbStrength = randomInRange(-cfg.turbulenceAmount, cfg.turbulenceAmount);
  streak.turbVx = perpX * turbStrength;
  streak.turbVy = perpY * turbStrength;

  streak.baseScale = baseScale;
  streak.alphaMax = layerCfg.alphaMax;
  streak.totalDist = dist;
  streak.traveled = 0;
  streak.alive = true;
}

class WarpTunnelVFX {
  static preload(scene) {
    STREAK_TEXTURE_KEYS.forEach((key) => {
      if (!scene.textures.exists(key)) {
        scene.load.image(key, assetUrl(`${STREAK_TEXTURE_PATH_PREFIX}${key}`));
      }
    });
  }

  constructor(scene, config = {}) {
    this.scene = scene;
    this.cfg = { ...WARP_STREAK_CONFIG, ...config };
    this.cx = scene.scale.width * 0.5;
    this.cy = scene.scale.height * 0.5;
    this.tubeRadiusX = 278;
    this.tubeRadiusY = 278 * 0.78;
    this.speedRatio = 0;
    this.speedMultiplier = this.cfg.speedMultiplier;
    this.backStreaks = [];
    this.frontStreaks = [];
    this._enabled = this.cfg.enabled;
  }

  create() {
    if (!this._enabled) return;
    this._buildPool();
  }

  _buildPool() {
    const spawnRx = this.tubeRadiusX * this.cfg.spawnRadiusFactor;
    const spawnRy = this.tubeRadiusY * this.cfg.spawnRadiusFactor;

    const backLayerCfg = {
      scaleMin: this.cfg.backScaleMin,
      scaleMax: this.cfg.backScaleMax,
      speedMin: this.cfg.backSpeedMin,
      speedMax: this.cfg.backSpeedMax,
      alphaMax: this.cfg.backAlphaMax,
    };

    const frontLayerCfg = {
      scaleMin: this.cfg.frontScaleMin,
      scaleMax: this.cfg.frontScaleMax,
      speedMin: this.cfg.frontSpeedMin,
      speedMax: this.cfg.frontSpeedMax,
      alphaMax: this.cfg.frontAlphaMax,
    };

    for (let i = 0; i < this.cfg.backLayerCount; i++) {
      const sprite = this.scene.add
        .image(this.cx, this.cy, STREAK_TEXTURE_KEYS[i % STREAK_TEXTURE_COUNT])
        .setOrigin(0.5, 0.5)
        .setDepth(BACK_DEPTH)
        .setBlendMode(1); // Phaser.BlendModes.ADD = 1

      const streak = makeStreak(sprite, backLayerCfg.alphaMax);
      respawnStreak(streak, this.cx, this.cy, spawnRx, spawnRy, backLayerCfg, this.cfg);
      // Stagger initial positions so not all start at wall simultaneously
      streak.traveled = Math.random() * streak.totalDist * 0.9;
      this._advanceStreak(streak);
      this.backStreaks.push(streak);
    }

    for (let i = 0; i < this.cfg.frontLayerCount; i++) {
      const sprite = this.scene.add
        .image(this.cx, this.cy, STREAK_TEXTURE_KEYS[i % STREAK_TEXTURE_COUNT])
        .setOrigin(0.5, 0.5)
        .setDepth(FRONT_DEPTH)
        .setBlendMode(1);

      const streak = makeStreak(sprite, frontLayerCfg.alphaMax);
      respawnStreak(streak, this.cx, this.cy, spawnRx, spawnRy, frontLayerCfg, this.cfg);
      streak.traveled = Math.random() * streak.totalDist * 0.9;
      this._advanceStreak(streak);
      this.frontStreaks.push(streak);
    }
  }

  /**
   * Advance a streak visually to its current traveled position (used for staggering initial positions).
   */
  _advanceStreak(streak) {
    const progress = Math.min(1, streak.traveled / streak.totalDist);

    const currentX = streak.sprite.x + streak.vx * 0.001;
    const currentY = streak.sprite.y + streak.vy * 0.001;
    streak.sprite.setPosition(currentX, currentY);

    const alpha = streak.alphaMax * (1 - progress * progress);
    streak.sprite.setAlpha(Math.max(0, alpha));

    const stretchX = streak.baseScale * (1 + progress * (this.cfg.stretchFactor - 1));
    streak.sprite.setScale(stretchX, streak.baseScale);
  }

  update(time, delta) {
    if (!this._enabled) return;

    const dt = delta / 1000; // seconds
    const speedBoost = 1 + this.speedRatio * 0.8;
    const effectiveMult = this.speedMultiplier * speedBoost;

    const spawnRx = this.tubeRadiusX * this.cfg.spawnRadiusFactor;
    const spawnRy = this.tubeRadiusY * this.cfg.spawnRadiusFactor;
    const centerRx = this.tubeRadiusX * this.cfg.centerRadiusFactor;
    const centerRy = this.tubeRadiusY * this.cfg.centerRadiusFactor;

    const backLayerCfg = {
      scaleMin: this.cfg.backScaleMin,
      scaleMax: this.cfg.backScaleMax,
      speedMin: this.cfg.backSpeedMin * effectiveMult,
      speedMax: this.cfg.backSpeedMax * effectiveMult,
      alphaMax: this.cfg.backAlphaMax,
    };

    const frontAlphaBoost = 1 + this.speedRatio * 0.3;
    const frontLayerCfg = {
      scaleMin: this.cfg.frontScaleMin,
      scaleMax: this.cfg.frontScaleMax * (1 + this.speedRatio * 0.15),
      speedMin: this.cfg.frontSpeedMin * effectiveMult,
      speedMax: this.cfg.frontSpeedMax * effectiveMult,
      alphaMax: Math.min(0.85, this.cfg.frontAlphaMax * frontAlphaBoost),
    };

    this._updateLayer(this.backStreaks, dt, spawnRx, spawnRy, centerRx, centerRy, backLayerCfg);
    this._updateLayer(this.frontStreaks, dt, spawnRx, spawnRy, centerRx, centerRy, frontLayerCfg);
  }

  _updateLayer(streaks, dt, spawnRx, spawnRy, centerRx, centerRy, layerCfg) {
    for (let i = 0; i < streaks.length; i++) {
      const streak = streaks[i];
      if (!streak.alive) continue;

      // Move
      streak.sprite.x += (streak.vx + streak.turbVx) * dt;
      streak.sprite.y += (streak.vy + streak.turbVy) * dt;

      // Accumulate traveled distance
      const stepDist = Math.sqrt(
        (streak.vx * dt) * (streak.vx * dt) + (streak.vy * dt) * (streak.vy * dt),
      );
      streak.traveled += stepDist;

      const progress = Math.min(1, streak.traveled / streak.totalDist);

      // Alpha fade: full alpha early, drops fast near center
      const alpha = streak.alphaMax * (1 - progress * progress);
      streak.sprite.setAlpha(Math.max(0, alpha));

      // Stretch along direction as it travels
      const stretchX = streak.baseScale * (1 + progress * (this.cfg.stretchFactor - 1));
      streak.sprite.setScale(stretchX, streak.baseScale);

      // Check if reached near-center despawn zone
      const dx = streak.sprite.x - this.cx;
      const dy = streak.sprite.y - this.cy;
      const normX = centerRx > 0 ? dx / centerRx : 0;
      const normY = centerRy > 0 ? dy / centerRy : 0;
      const atCenter = normX * normX + normY * normY <= 1;

      if (atCenter || progress >= 1) {
        respawnStreak(streak, this.cx, this.cy, spawnRx, spawnRy, layerCfg, this.cfg);
      }
    }
  }

  applySnapshot(snapshot) {
    const tubeSpeed = snapshot?.tube?.speed;
    const speedMin = this.cfg.speedMin ?? 0.01;
    const speedMax = this.cfg.speedMax ?? 0.25;

    if (!Number.isFinite(tubeSpeed)) {
      this.speedRatio = 0;
    } else {
      const denominator = Math.max(0.0001, speedMax - speedMin);
      this.speedRatio = Math.min(1, Math.max(0, (tubeSpeed - speedMin) / denominator));
    }

    const centerOffsetX = snapshot?.tube?.centerOffsetX ?? 0;
    const centerOffsetY = snapshot?.tube?.centerOffsetY ?? 0;
    const vpCx = snapshot?.viewport?.centerX ?? this.scene.scale.width * 0.5;
    const vpCy = snapshot?.viewport?.centerY ?? this.scene.scale.height * 0.5;
    this.cx = vpCx + centerOffsetX;
    this.cy = vpCy + centerOffsetY;

    const cfgRadius = snapshot?.runtime?.config?.tubeRadius ?? 278;
    const cfgOffset = snapshot?.runtime?.config?.playerOffset ?? 0.78;
    this.tubeRadiusX = cfgRadius;
    this.tubeRadiusY = cfgRadius * cfgOffset;
  }

  resize(width, height) {
    this.cx = width * 0.5;
    this.cy = height * 0.5;
  }

  setSpeedMultiplier(value) {
    if (Number.isFinite(value) && value >= 0) {
      this.speedMultiplier = value;
    }
    return this;
  }

  setIntensity(value) {
    const v = Math.min(1, Math.max(0, value));
    this.cfg.backAlphaMax = WARP_STREAK_CONFIG.backAlphaMax * v;
    this.cfg.frontAlphaMax = WARP_STREAK_CONFIG.frontAlphaMax * v;
    return this;
  }

  setEnabled(flag) {
    this._enabled = Boolean(flag);
    const visible = this._enabled;
    this.backStreaks.forEach((s) => s.sprite?.setVisible(visible));
    this.frontStreaks.forEach((s) => s.sprite?.setVisible(visible));
    return this;
  }

  destroy() {
    this.backStreaks.forEach((s) => s.sprite?.destroy());
    this.frontStreaks.forEach((s) => s.sprite?.destroy());
    this.backStreaks = [];
    this.frontStreaks = [];
  }
}

export { WarpTunnelVFX };
