const BASE_URL = import.meta.env.BASE_URL || './';
const ENERGY_STREAK_TEXTURES = Object.freeze(
  Array.from({ length: 12 }, (_, index) => ({
    key: `energy_streak_2048_v${index}.webp`,
    path: `img/generated/VFX/energy_streak_2048_v${index}.webp`,
  })),
);

const DEFAULT_WARP_TUNNEL_CONFIG = Object.freeze({
  enabled: true,
  backLayerCount: 8,
  frontLayerCount: 6,
  spawnRadius: 0.98,
  centerRadius: 0.1,
  backSpeedMin: 0.32,
  backSpeedMax: 0.58,
  frontSpeedMin: 0.58,
  frontSpeedMax: 0.96,
  backScaleMin: 0.16,
  backScaleMax: 0.28,
  frontScaleMin: 0.24,
  frontScaleMax: 0.42,
  alphaBack: 0.22,
  alphaFront: 0.34,
  stretchFactor: 0.48,
  turbulenceAmount: 0.045,
  speedMultiplier: 1,
  tieToGameSpeed: true,
  speedMin: 0.01,
  speedMax: 0.25,
});

const BACK_LAYER_DEPTH = 11;
const FRONT_LAYER_DEPTH = 12;
const TWO_PI = Math.PI * 2;

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

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

class WarpTunnelVFX {
  static preload(scene) {
    ENERGY_STREAK_TEXTURES.forEach((texture) => {
      if (!scene.textures.exists(texture.key)) {
        scene.load.image(texture.key, assetUrl(texture.path));
      }
    });
  }

  constructor(scene, config = {}) {
    this.scene = scene;
    this.config = { ...DEFAULT_WARP_TUNNEL_CONFIG, ...config };
    this.centerX = scene.scale.width * 0.5;
    this.centerY = scene.scale.height * 0.5;
    this.radiusX = 220;
    this.radiusY = 170;
    this.enabled = Boolean(this.config.enabled);
    this.intensity = 1;
    this.speedMultiplier = Math.max(0.05, this.config.speedMultiplier || 1);
    this.speedRatio = 0;
    this.textureKeys = ENERGY_STREAK_TEXTURES
      .map((entry) => entry.key)
      .filter((key) => scene.textures.exists(key));
    this.backLayer = [];
    this.frontLayer = [];
  }

  create() {
    if (!this.textureKeys.length) {
      return;
    }

    this.backLayer = this.createLayer(this.config.backLayerCount, false);
    this.frontLayer = this.createLayer(this.config.frontLayerCount, true);
  }

  createLayer(count, isFront) {
    const amount = clamp(Math.round(count), 1, 24);
    return Array.from({ length: amount }, () => {
      const sprite = this.scene.add
        .sprite(this.centerX, this.centerY, this.textureKeys[0])
        .setDepth(isFront ? FRONT_LAYER_DEPTH : BACK_LAYER_DEPTH)
        .setBlendMode('ADD')
        .setVisible(this.enabled);

      const streak = {
        sprite,
        isFront,
        angle: 0,
        progress: 0,
        speed: 0,
        baseScale: 0,
        jitterPhase: 0,
        jitterSpeed: 0,
        turbulenceStrength: 0,
      };

      this.resetStreak(streak, Math.random());
      return streak;
    });
  }

  pickTextureKey() {
    if (!this.textureKeys.length) {
      return null;
    }
    return this.textureKeys[Math.floor(Math.random() * this.textureKeys.length)];
  }

  resetStreak(streak, progress = 0) {
    const textureKey = this.pickTextureKey();
    if (!textureKey) {
      streak.sprite.setVisible(false);
      return;
    }

    streak.angle = randomRange(0, TWO_PI);
    streak.progress = clamp(progress, 0, 1);
    streak.speed = streak.isFront
      ? randomRange(this.config.frontSpeedMin, this.config.frontSpeedMax)
      : randomRange(this.config.backSpeedMin, this.config.backSpeedMax);
    streak.baseScale = streak.isFront
      ? randomRange(this.config.frontScaleMin, this.config.frontScaleMax)
      : randomRange(this.config.backScaleMin, this.config.backScaleMax);
    streak.jitterPhase = randomRange(0, TWO_PI);
    streak.jitterSpeed = randomRange(2.4, 6.2);
    streak.turbulenceStrength = randomRange(0.6, 1.25);

    streak.sprite.setTexture(textureKey);
    streak.sprite.setVisible(this.enabled);
    this.applyStreakTransform(streak, 0);
  }

  applyStreakTransform(streak, deltaMs) {
    const spawnRadius = clamp(this.config.spawnRadius, 0.1, 1.5);
    const centerRadius = clamp(this.config.centerRadius, 0.02, 0.95);
    const radialMix = lerp(spawnRadius, centerRadius, streak.progress);
    const baseX = this.centerX + Math.cos(streak.angle) * this.radiusX * radialMix;
    const baseY = this.centerY + Math.sin(streak.angle) * this.radiusY * radialMix;

    const turbulence = this.config.turbulenceAmount * streak.turbulenceStrength;
    const turbulencePhase = streak.jitterPhase + this.scene.time.now * 0.001 * streak.jitterSpeed;
    const turbulenceRadius = (1 - streak.progress) * turbulence;
    const offsetX = Math.cos(turbulencePhase) * this.radiusX * turbulenceRadius;
    const offsetY = Math.sin(turbulencePhase * 1.13) * this.radiusY * turbulenceRadius;

    const x = baseX + offsetX;
    const y = baseY + offsetY;
    const toCenterX = this.centerX - x;
    const toCenterY = this.centerY - y;
    const flowAngle = Math.atan2(toCenterY, toCenterX);
    const jitterRotation = Math.sin(turbulencePhase * 0.8 + deltaMs * 0.001) * 0.07;

    const fadeIn = smoothstep(0, 0.12, streak.progress);
    const fadeOut = 1 - smoothstep(0.62, 1, streak.progress);
    const alphaBase = streak.isFront ? this.config.alphaFront : this.config.alphaBack;
    const alpha = clamp(alphaBase * this.intensity * fadeIn * fadeOut, 0, 1);

    const stretch = 1 + this.config.stretchFactor * streak.progress;
    const baseScale = streak.baseScale * (0.96 + this.intensity * 0.08);

    streak.sprite
      .setPosition(x, y)
      .setRotation(flowAngle + jitterRotation)
      .setScale(baseScale * stretch, baseScale)
      .setAlpha(alpha)
      .setFlipX(x >= this.centerX)
      .setVisible(this.enabled && alpha > 0.005);
  }

  update(deltaMs) {
    if (!this.backLayer.length && !this.frontLayer.length) {
      return;
    }

    const dt = Math.max(8, deltaMs || this.scene.game.loop.delta || 16.67) / 1000;
    const dynamicSpeed = this.config.tieToGameSpeed ? lerp(0.9, 1.45, this.speedRatio) : 1;
    const speedFactor = this.speedMultiplier * dynamicSpeed;

    [...this.backLayer, ...this.frontLayer].forEach((streak) => {
      if (!this.enabled) {
        streak.sprite.setVisible(false);
        return;
      }

      streak.progress += streak.speed * speedFactor * dt;
      if (streak.progress >= 1) {
        this.resetStreak(streak, randomRange(0, 0.12));
      }
      this.applyStreakTransform(streak, deltaMs);
    });
  }

  setGeometry(centerX, centerY, radiusX, radiusY) {
    if (Number.isFinite(centerX)) this.centerX = centerX;
    if (Number.isFinite(centerY)) this.centerY = centerY;
    if (Number.isFinite(radiusX) && radiusX > 0) this.radiusX = radiusX;
    if (Number.isFinite(radiusY) && radiusY > 0) this.radiusY = radiusY;
    return this;
  }

  setSpeedRatio(value) {
    this.speedRatio = clamp(Number.isFinite(value) ? value : 0, 0, 1);
    return this;
  }

  setSpeedMultiplier(value) {
    if (Number.isFinite(value)) {
      this.speedMultiplier = Math.max(0.05, value);
    }
    return this;
  }

  setIntensity(value) {
    if (Number.isFinite(value)) {
      this.intensity = clamp(value, 0, 2);
    }
    return this;
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
    [...this.backLayer, ...this.frontLayer].forEach((streak) => {
      streak.sprite.setVisible(this.enabled);
    });
    return this;
  }

  destroy() {
    [...this.backLayer, ...this.frontLayer].forEach((streak) => {
      streak.sprite.destroy();
    });
    this.backLayer = [];
    this.frontLayer = [];
  }
}

export { DEFAULT_WARP_TUNNEL_CONFIG, WarpTunnelVFX };
