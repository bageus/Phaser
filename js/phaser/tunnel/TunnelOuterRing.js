const BASE_URL = import.meta.env.BASE_URL || './';
const TUNNEL_OUTER_RING_TEXTURE_KEY = 'metal_ring.webp';
const TUNNEL_OUTER_RING_TEXTURE_PATH = 'img/metal_ring.webp';
const ENERGY_PARTICLE_TEXTURES = Object.freeze([
  { key: 'energy_burst.webp', path: 'img/generated/VFX/energy_burst.webp' },
  { key: 'energy_effect.webp', path: 'img/generated/VFX/energy_effect.webp' },
  { key: 'energy_effect_blob.webp', path: 'img/generated/VFX/energy_effect_blob.webp' },
  { key: 'energy_effect_stars.webp', path: 'img/generated/VFX/energy_effect_stars.webp' },
]);
const EXCLUDED_TEXTURE_KEYS = new Set(['energy_effect.webp']);

const DEFAULT_ROTATION_SPEED = 0;
const TUNNEL_OUTER_RING_SOURCE_WIDTH = 2048;
const TUNNEL_OUTER_RING_SOURCE_HEIGHT = 1365;
const TUNNEL_OUTER_RING_INNER_RADIUS_X = 393;
const TUNNEL_OUTER_RING_INNER_RADIUS_Y = 393;
const TUNNEL_OUTER_RING_FIT_SCALE = 1.8;

const DEFAULT_VFX_CONFIG = Object.freeze({
  particlesEnabled: true,
  particlesBackCount: 40,
  particlesFrontCount: 54,
  particleSpeedMultiplier: 1,
  glowAlpha: 0.42,
  tieToGameSpeed: true,
  speedMin: 0.01,
  speedMax: 0.25,
});

const PARTICLE_DEPTH_BACK = 30;
const PARTICLE_DEPTH_FRONT = 31;
const PARTICLE_PERIODIC_SWAY_MS = 1200;
const PARTICLE_SPRITE_SCALE_BACK = { start: 0.045, end: 0.012 };
const PARTICLE_SPRITE_SCALE_FRONT = { start: 0.065, end: 0.018 };

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

    this.backParticles = [];
    this.frontParticles = [];
    this.backEmitters = [];
    this.frontEmitters = [];

    this.createParticleLayers(centerX, centerY);
  }

  createParticleAlphaConfig(baseAlpha) {
    return {
      start: clamp(baseAlpha, 0.08, 0.9),
      end: 0,
      ease: 'Quad.easeOut',
    };
  }

  createParticleLayers(centerX, centerY) {
    const particleTextureKeys = ENERGY_PARTICLE_TEXTURES
      .map((texture) => texture.key)
      .filter((textureKey) => this.scene.textures.exists(textureKey))
      .filter((textureKey) => !EXCLUDED_TEXTURE_KEYS.has(textureKey));

    if (!this.vfxConfig.particlesEnabled || particleTextureKeys.length === 0) {
      return;
    }

    const backAlpha = this.createParticleAlphaConfig(this.vfxConfig.glowAlpha * 0.52);
    const frontAlpha = this.createParticleAlphaConfig(this.vfxConfig.glowAlpha * 0.78);

    const worldY = (ratio) => ({
      min: centerY - this.particleAreaRadiusY * ratio,
      max: centerY + this.particleAreaRadiusY * ratio,
    });

    const spawnX = (particle) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const edge = this.particleAreaRadiusX * (0.22 + Math.random() * 0.38);
      const x = centerX + side * edge;
      if (particle) {
        particle.data = particle.data || {};
        particle.data.dir = side;
      }
      return x;
    };

    const createLayer = (textureKey, alpha, scale, speedMin, speedMax, frequency, lifespan, depth, yRatio) => (
      this.scene.add.particles(0, 0, textureKey, {
        x: { onEmit: spawnX },
        y: worldY(yRatio),
        alpha,
        scale,
        speedX: {
          onEmit: (particle) => {
            const dir = particle?.data?.dir || (particle.x >= centerX ? -1 : 1);
            return dir * (speedMin + Math.random() * (speedMax - speedMin));
          },
        },
        speedY: { min: -10, max: 10 },
        frequency,
        quantity: 1,
        lifespan,
        blendMode: 'ADD',
      }).setDepth(depth)
    );

    const textureCount = particleTextureKeys.length;
    const backRate = Math.max(1, this.vfxConfig.particlesBackCount);
    const frontRate = Math.max(1, this.vfxConfig.particlesFrontCount);
    const perTextureBackFrequency = 1000 / Math.max(1, backRate / textureCount);
    const perTextureFrontFrequency = 1000 / Math.max(1, frontRate / textureCount);

    this.backParticles = particleTextureKeys.map((textureKey) => createLayer(
      textureKey,
      backAlpha,
      PARTICLE_SPRITE_SCALE_BACK,
      10,
      26,
      perTextureBackFrequency,
      { min: 900, max: 1500 },
      PARTICLE_DEPTH_BACK,
      0.82,
    ));

    this.frontParticles = particleTextureKeys.map((textureKey) => createLayer(
      textureKey,
      frontAlpha,
      PARTICLE_SPRITE_SCALE_FRONT,
      16,
      36,
      perTextureFrontFrequency,
      { min: 760, max: 1300 },
      PARTICLE_DEPTH_FRONT,
      0.76,
    ));

    this.backEmitters = [...this.backParticles];
    this.frontEmitters = [...this.frontParticles];
    this.ensureParticlesOnTop();
  }

  ensureParticlesOnTop() {
    [...this.backParticles, ...this.frontParticles].forEach((layer) => {
      if (layer) {
        this.scene.children.bringToTop(layer);
      }
    });
  }

  update() {
    this.image.rotation += this.rotationSpeed;
    this.ensureParticlesOnTop();
    this.updateParticleIntensity();
  }

  updateParticleIntensity() {
    if (!this.vfxConfig.particlesEnabled) {
      this.backEmitters.forEach((emitter) => emitter?.stop?.());
      this.frontEmitters.forEach((emitter) => emitter?.stop?.());
      return;
    }

    const spawnBoost = this.vfxConfig.tieToGameSpeed ? 1 + this.speedRatio * 0.4 : 1;
    const speedBoost = this.vfxConfig.tieToGameSpeed ? 1 + this.speedRatio * 0.32 : 1;
    const speedMultiplier = this.vfxConfig.particleSpeedMultiplier * speedBoost;
    const pulse = 1 + 0.22 * (0.5 + 0.5 * Math.sin(this.scene.time.now / PARTICLE_PERIODIC_SWAY_MS));

    const safeBackRate = Math.max(1, this.vfxConfig.particlesBackCount * spawnBoost * pulse);
    const safeFrontRate = Math.max(1, this.vfxConfig.particlesFrontCount * spawnBoost * pulse);

    const backEmitterCount = Math.max(1, this.backEmitters.length);
    const frontEmitterCount = Math.max(1, this.frontEmitters.length);
    const backFrequency = 1000 / Math.max(1, safeBackRate / backEmitterCount);
    const frontFrequency = 1000 / Math.max(1, safeFrontRate / frontEmitterCount);

    this.backEmitters.forEach((emitter) => {
      if (!emitter) return;
      emitter.start?.();
      emitter.setFrequency?.(backFrequency);
      emitter.setSpeedX?.({
        onEmit: (particle) => {
          const dir = particle?.data?.dir || (particle.x >= this.particleCenterX ? -1 : 1);
          return dir * randomInRange(10, 26) * speedMultiplier;
        },
      });
      emitter.setSpeedY?.({ min: -12 * speedMultiplier, max: 12 * speedMultiplier });
    });

    this.frontEmitters.forEach((emitter) => {
      if (!emitter) return;
      emitter.start?.();
      emitter.setFrequency?.(frontFrequency);
      emitter.setSpeedX?.({
        onEmit: (particle) => {
          const dir = particle?.data?.dir || (particle.x >= this.particleCenterX ? -1 : 1);
          return dir * randomInRange(16, 36) * speedMultiplier;
        },
      });
      emitter.setSpeedY?.({ min: -14 * speedMultiplier, max: 14 * speedMultiplier });
    });
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
    this.backParticles.forEach((particles) => particles?.destroy());
    this.frontParticles.forEach((particles) => particles?.destroy());
    this.backParticles = [];
    this.frontParticles = [];
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

    this.backParticles.forEach((particles) => particles?.destroy());
    this.frontParticles.forEach((particles) => particles?.destroy());
    this.backParticles = [];
    this.frontParticles = [];
    this.backEmitters = [];
    this.frontEmitters = [];
    this.createParticleLayers(centerX, centerY);

    return this;
  }

  destroy() {
    this.backParticles.forEach((particles) => particles?.destroy());
    this.frontParticles.forEach((particles) => particles?.destroy());
    this.image?.destroy();
    this.backParticles = [];
    this.frontParticles = [];
    this.backEmitters = [];
    this.frontEmitters = [];
    this.image = null;
  }
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

export { TunnelOuterRing };
