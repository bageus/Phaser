const BASE_URL = import.meta.env.BASE_URL || './';
const TUNNEL_OUTER_RING_TEXTURE_KEY = 'metal_ring.webp';
const TUNNEL_OUTER_RING_TEXTURE_PATH = 'img/metal_ring.webp';
const ENERGY_PARTICLE_TEXTURES = Object.freeze([
  { key: 'energy_burst.webp', path: 'img/generated/VFX/energy_burst.webp' },
  { key: 'energy_effect.webp', path: 'img/generated/VFX/energy_effect.webp' },
  { key: 'energy_effect_blob.webp', path: 'img/generated/VFX/energy_effect_blob.webp' },
  { key: 'energy_effect_stars.webp', path: 'img/generated/VFX/energy_effect_stars.webp' },
]);
const DEFAULT_ROTATION_SPEED = 0;
const TUNNEL_OUTER_RING_SOURCE_WIDTH = 2048;
const TUNNEL_OUTER_RING_SOURCE_HEIGHT = 1365;
const TUNNEL_OUTER_RING_INNER_RADIUS_X = 393;
const TUNNEL_OUTER_RING_INNER_RADIUS_Y = 393;
const TUNNEL_OUTER_RING_FIT_SCALE = 0.9;

const DEFAULT_VFX_CONFIG = Object.freeze({
  particlesEnabled: true,
  particlesBackCount: 40,
  particlesFrontCount: 54,
  particleSpeedMultiplier: 1,
  glowAlpha: 0.18,
  tieToGameSpeed: true,
  speedMin: 0.01,
  speedMax: 0.25,
});

const PARTICLE_EDGE_FADE_START = 0.64;
const PARTICLE_EDGE_FADE_POWER = 1.8;
const PARTICLE_WALL_BAND_INNER = 0.74;
const PARTICLE_WALL_BAND_OUTER = 0.97;
const PARTICLE_PERIODIC_SWAY_MS = 1200;
const PARTICLE_DEPTH_BACK = 30;
const PARTICLE_DEPTH_FRONT = 31;

function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

class TunnelOuterRing {
  static preload(scene) {
    if (!scene.textures.exists(TUNNEL_OUTER_RING_TEXTURE_KEY)) {
      scene.load.image(TUNNEL_OUTER_RING_TEXTURE_KEY, assetUrl(TUNNEL_OUTER_RING_TEXTURE_PATH));
    }

    ENERGY_PARTICLE_TEXTURES.forEach((texture) => {
      if (!scene.textures.exists(texture.key)) {
        scene.load.image(texture.key, assetUrl(texture.path));
      }
    });
  }

  constructor(scene, config = {}) {
    const centerX = scene.scale.width * 0.5;
    const centerY = scene.scale.height * 0.5;

    this.scene = scene;
    this.rotationSpeed = DEFAULT_ROTATION_SPEED;
    this.vfxConfig = { ...DEFAULT_VFX_CONFIG, ...config };
    this.speedRatio = 0;
    this.particleAreaRadiusX = TUNNEL_OUTER_RING_INNER_RADIUS_X * 0.67;
    this.particleAreaRadiusY = TUNNEL_OUTER_RING_INNER_RADIUS_Y * 0.52;
    this.particleCenterX = centerX;
    this.particleCenterY = centerY;

    this.image = scene.add
      .image(centerX, centerY, TUNNEL_OUTER_RING_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(10);

    this.backParticles = null;
    this.frontParticles = null;
    this.backEmitters = [];
    this.frontEmitters = [];

    this.createParticleLayers(centerX, centerY);
  }

  createParticleAlphaConfig(baseAlpha) {
    const safeAlpha = clamp(baseAlpha, 0.22, 0.95);
    return {
      start: safeAlpha,
      end: 0,
      ease: 'Quad.easeOut',
    };
  }

  createParticleLayers(centerX, centerY) {
    const particleTextureKeys = ENERGY_PARTICLE_TEXTURES
      .map((texture) => texture.key)
      .filter((textureKey) => this.scene.textures.exists(textureKey));

    if (!this.vfxConfig.particlesEnabled || particleTextureKeys.length === 0) {
      return;
    }

    const backAlpha = this.createParticleAlphaConfig(this.vfxConfig.glowAlpha * 0.56);
    const frontAlpha = this.createParticleAlphaConfig(this.vfxConfig.glowAlpha);

    const sideSpawnX = () => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const minBand = this.particleAreaRadiusX * PARTICLE_WALL_BAND_INNER;
      const maxBand = this.particleAreaRadiusX * PARTICLE_WALL_BAND_OUTER;
      return centerX + side * (minBand + Math.random() * (maxBand - minBand));
    };

    const toWorldYRange = (range) => ({
      min: centerY + range.min,
      max: centerY + range.max,
    });

    const createParticlesLayer = (textureKey, alphaConfig, scaleConfig, speedMin, speedMax, maxY, frequency, lifespan, depth, yRange) => (
      this.scene.add.particles(0, 0, textureKey, {
        x: { onEmit: sideSpawnX },
        y: toWorldYRange(yRange),
        alpha: alphaConfig,
        scale: scaleConfig,
        speedX: {
          onEmit: (particle) => {
            const direction = particle.x >= centerX ? -1 : 1;
            return direction * (speedMin + Math.random() * (speedMax - speedMin));
          },
        },
        speedY: { min: -maxY, max: maxY },
        frequency,
        quantity: 1,
        lifespan,
        blendMode: 'ADD',
      }).setDepth(depth)
    );

    const textureCount = particleTextureKeys.length;
    const baseBackRate = Math.max(1, this.vfxConfig.particlesBackCount * 1.2);
    const baseFrontRate = Math.max(1, this.vfxConfig.particlesFrontCount * 1.35);
    const perTextureBackFrequency = 1000 / Math.max(1, baseBackRate / textureCount);
    const perTextureFrontFrequency = 1000 / Math.max(1, baseFrontRate / textureCount);

    this.backParticles = particleTextureKeys.map((textureKey) => createParticlesLayer(
      textureKey,
      backAlpha,
      { start: 0.14, end: 0.035 },
      18,
      36,
      16,
      perTextureBackFrequency,
      { min: 780, max: 1280 },
      PARTICLE_DEPTH_BACK,
      { min: -this.particleAreaRadiusY * 0.9, max: this.particleAreaRadiusY * 0.9 },
    ));

    this.frontParticles = particleTextureKeys.map((textureKey) => createParticlesLayer(
      textureKey,
      frontAlpha,
      { start: 0.22, end: 0.09 },
      26,
      52,
      20,
      perTextureFrontFrequency,
      { min: 700, max: 1140 },
      PARTICLE_DEPTH_FRONT,
      { min: -this.particleAreaRadiusY * 0.86, max: this.particleAreaRadiusY * 0.86 },
    ));

    this.backEmitters = [...this.backParticles];
    this.frontEmitters = [...this.frontParticles];
    this.ensureParticlesOnTop();
  }

  ensureParticlesOnTop() {
    const allParticleLayers = [
      ...(this.backParticles || []),
      ...(this.frontParticles || []),
    ];

    allParticleLayers.forEach((layer) => {
      if (!layer) {
        return;
      }
      this.scene.children.bringToTop(layer);
    });
  }

  update() {
    this.image.rotation += this.rotationSpeed;
    this.ensureParticlesOnTop();
    this.updateParticleIntensity();
  }

  updateParticleIntensity() {
    if (!this.vfxConfig.particlesEnabled) {
      this.backEmitters.forEach((emitter) => emitter?.stop());
      this.frontEmitters.forEach((emitter) => emitter?.stop());
      return;
    }

    const spawnBoost = this.vfxConfig.tieToGameSpeed ? 1 + this.speedRatio * 0.32 : 1;
    const speedBoost = this.vfxConfig.tieToGameSpeed ? 1 + this.speedRatio * 0.28 : 1;
    const speedMultiplier = this.vfxConfig.particleSpeedMultiplier * speedBoost;
    const pulse = 1 + 0.35 * (0.5 + 0.5 * Math.sin(this.scene.time.now / PARTICLE_PERIODIC_SWAY_MS));
    const safeBackRate = Math.max(1, this.vfxConfig.particlesBackCount * spawnBoost * 1.2 * pulse);
    const safeFrontRate = Math.max(1, this.vfxConfig.particlesFrontCount * spawnBoost * 1.35 * pulse);

    const backEmitterCount = Math.max(1, this.backEmitters.length);
    const frontEmitterCount = Math.max(1, this.frontEmitters.length);
    const perEmitterBackFrequency = 1000 / Math.max(1, safeBackRate / backEmitterCount);
    const perEmitterFrontFrequency = 1000 / Math.max(1, safeFrontRate / frontEmitterCount);

    this.backEmitters.forEach((emitter) => {
      if (emitter && emitter.emitting === false && typeof emitter.start === 'function') {
        emitter.start();
      }
      emitter.setFrequency(perEmitterBackFrequency);
      this.setEmitterVelocity(emitter, 18 * speedMultiplier, 36 * speedMultiplier, 16 * speedMultiplier);
    });

    this.frontEmitters.forEach((emitter) => {
      if (emitter && emitter.emitting === false && typeof emitter.start === 'function') {
        emitter.start();
      }
      emitter.setFrequency(perEmitterFrontFrequency);
      this.setEmitterVelocity(emitter, 26 * speedMultiplier, 52 * speedMultiplier, 20 * speedMultiplier);
    });
  }

  setEmitterVelocity(emitter, minXAbs, maxXAbs, maxYAbs) {
    if (!emitter) {
      return;
    }

    if (typeof emitter.setSpeedX === 'function') {
      emitter.setSpeedX({
        onEmit: (particle) => {
          const direction = particle.x >= this.particleCenterX ? -1 : 1;
          return direction * (minXAbs + Math.random() * (maxXAbs - minXAbs));
        },
      });
    }

    if (typeof emitter.setSpeedY === 'function') {
      emitter.setSpeedY({ min: -maxYAbs, max: maxYAbs });
      return;
    }

    if (typeof emitter.speedX === 'object' && emitter.speedX !== null) {
      emitter.speedX.onEmit = (particle) => {
        const direction = particle.x >= this.particleCenterX ? -1 : 1;
        return direction * (minXAbs + Math.random() * (maxXAbs - minXAbs));
      };
    }

    if (typeof emitter.speedY === 'object' && emitter.speedY !== null) {
      emitter.speedY.min = -maxYAbs;
      emitter.speedY.max = maxYAbs;
    }
  }

  applySnapshot(snapshot) {
    const tubeSpeed = snapshot?.tube?.speed;
    if (!Number.isFinite(tubeSpeed)) {
      this.speedRatio = 0;
      return;
    }

    const speedMin = Number.isFinite(this.vfxConfig.speedMin) ? this.vfxConfig.speedMin : 0.01;
    const speedMax = Number.isFinite(this.vfxConfig.speedMax) ? this.vfxConfig.speedMax : 0.25;
    const denominator = Math.max(0.0001, speedMax - speedMin);
    this.speedRatio = clamp((tubeSpeed - speedMin) / denominator, 0, 1);
  }

  setRotationSpeed(speed) {
    if (Number.isFinite(speed)) {
      this.rotationSpeed = speed;
    }
    return this;
  }

  setScale(scale) {
    this.image.setScale(scale);
    return this;
  }

  fitToTube(tubeRadius, tubeVerticalScale = 1) {
    if (!Number.isFinite(tubeRadius) || tubeRadius <= 0) {
      return this;
    }

    const tubeRadiusX = tubeRadius;
    const tubeRadiusY = tubeRadius * tubeVerticalScale;
    const targetWidth =
      tubeRadiusX *
      (TUNNEL_OUTER_RING_SOURCE_WIDTH / TUNNEL_OUTER_RING_INNER_RADIUS_X) *
      TUNNEL_OUTER_RING_FIT_SCALE;
    const targetHeight =
      tubeRadiusY *
      (TUNNEL_OUTER_RING_SOURCE_HEIGHT / TUNNEL_OUTER_RING_INNER_RADIUS_Y) *
      TUNNEL_OUTER_RING_FIT_SCALE;

    this.image.setDisplaySize(targetWidth, targetHeight);

    this.particleAreaRadiusX = tubeRadiusX * 0.95;
    this.particleAreaRadiusY = tubeRadiusY * 0.74;
    this.backParticles?.forEach((particles) => particles.destroy());
    this.frontParticles?.forEach((particles) => particles.destroy());
    this.backParticles = null;
    this.frontParticles = null;
    this.backEmitters = [];
    this.frontEmitters = [];
    this.createParticleLayers(this.particleCenterX, this.particleCenterY);

    return this;
  }

  resize(width, height) {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    this.particleCenterX = centerX;
    this.particleCenterY = centerY;
    this.image.setPosition(centerX, centerY);

    this.backParticles?.forEach((particles) => particles.destroy());
    this.frontParticles?.forEach((particles) => particles.destroy());
    this.backParticles = null;
    this.frontParticles = null;
    this.backEmitters = [];
    this.frontEmitters = [];
    this.createParticleLayers(centerX, centerY);

    return this;
  }

  destroy() {
    this.backParticles?.forEach((particles) => particles.destroy());
    this.frontParticles?.forEach((particles) => particles.destroy());
    this.image?.destroy();
    this.backParticles = null;
    this.frontParticles = null;
    this.backEmitters = [];
    this.frontEmitters = [];
    this.image = null;
  }
}

export { TunnelOuterRing };
