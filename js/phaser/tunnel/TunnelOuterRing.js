const BASE_URL = import.meta.env.BASE_URL || './';
const TUNNEL_OUTER_RING_TEXTURE_KEY = 'metal_ring.webp';
const TUNNEL_OUTER_RING_TEXTURE_PATH = 'img/metal_ring.webp';
const ENERGY_PARTICLE_ATLAS_KEY = 'energy_particles_atlas';
const ENERGY_PARTICLE_ATLAS_IMAGE_PATH = 'img/generated/energy_particles_no_bg.webp';
const ENERGY_PARTICLE_ATLAS_JSON_PATH = 'img/generated/energy_particles_spritesheet_4frames.json';
const ENERGY_PARTICLE_FRAME_NAMES = Object.freeze(['particle_0', 'particle_1', 'particle_2', 'particle_3']);
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

    if (!scene.textures.exists(ENERGY_PARTICLE_ATLAS_KEY)) {
      scene.load.atlas(
        ENERGY_PARTICLE_ATLAS_KEY,
        assetUrl(ENERGY_PARTICLE_ATLAS_IMAGE_PATH),
        assetUrl(ENERGY_PARTICLE_ATLAS_JSON_PATH),
      );
    }
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
    this.backEmitter = null;
    this.frontEmitter = null;

    this.createParticleLayers(centerX, centerY);
  }

  createParticleAlphaConfig(baseAlpha) {
    const centerX = this.particleCenterX;
    const centerY = this.particleCenterY;
    const radiusX = Math.max(1, this.particleAreaRadiusX);
    const radiusY = Math.max(1, this.particleAreaRadiusY);

    return {
      onEmit: (particle) => {
        const relativeX = Math.abs(particle.x - centerX) < Math.abs(particle.x)
          ? particle.x - centerX
          : particle.x;
        const relativeY = Math.abs(particle.y - centerY) < Math.abs(particle.y)
          ? particle.y - centerY
          : particle.y;
        const normalizedX = relativeX / radiusX;
        const normalizedY = relativeY / radiusY;
        const radialDistance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
        const edgeProgress = clamp((radialDistance - PARTICLE_EDGE_FADE_START) / (1 - PARTICLE_EDGE_FADE_START), 0, 1);
        const edgeFade = 1 - Math.pow(edgeProgress, PARTICLE_EDGE_FADE_POWER);
        return baseAlpha * clamp(edgeFade, 0.08, 1);
      },
      onUpdate: (particle, key, value, t) => value * (1 - t),
    };
  }

  createParticleLayers(centerX, centerY) {
    if (!this.vfxConfig.particlesEnabled || !this.scene.textures.exists(ENERGY_PARTICLE_ATLAS_KEY)) {
      return;
    }

    const backAlpha = this.createParticleAlphaConfig(this.vfxConfig.glowAlpha * 0.56);
    const frontAlpha = this.createParticleAlphaConfig(this.vfxConfig.glowAlpha);

    const sideSpawnX = () => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const minBand = this.particleAreaRadiusX * PARTICLE_WALL_BAND_INNER;
      const maxBand = this.particleAreaRadiusX * PARTICLE_WALL_BAND_OUTER;
      return side * (minBand + Math.random() * (maxBand - minBand));
    };

    this.backParticles = this.scene.add.particles(0, 0, ENERGY_PARTICLE_ATLAS_KEY, {
      frame: ENERGY_PARTICLE_FRAME_NAMES,
      x: { onEmit: sideSpawnX },
      y: { min: -this.particleAreaRadiusY * 0.9, max: this.particleAreaRadiusY * 0.9 },
      alpha: backAlpha,
      scale: { start: 0.14, end: 0.035 },
      speedX: {
        onEmit: (particle) => {
          const direction = particle.x >= 0 ? -1 : 1;
          return direction * (18 + Math.random() * 18);
        },
      },
      speedY: { min: -16, max: 16 },
      frequency: 1000 / Math.max(1, this.vfxConfig.particlesBackCount * 1.2),
      quantity: 1,
      lifespan: { min: 780, max: 1280 },
      blendMode: 'ADD',
    }).setDepth(8).setPosition(centerX, centerY);

    this.frontParticles = this.scene.add.particles(0, 0, ENERGY_PARTICLE_ATLAS_KEY, {
      frame: ENERGY_PARTICLE_FRAME_NAMES,
      x: { onEmit: sideSpawnX },
      y: { min: -this.particleAreaRadiusY * 0.86, max: this.particleAreaRadiusY * 0.86 },
      alpha: frontAlpha,
      scale: { start: 0.22, end: 0.09 },
      speedX: {
        onEmit: (particle) => {
          const direction = particle.x >= 0 ? -1 : 1;
          return direction * (26 + Math.random() * 26);
        },
      },
      speedY: { min: -20, max: 20 },
      frequency: 1000 / Math.max(1, this.vfxConfig.particlesFrontCount * 1.35),
      quantity: 1,
      lifespan: { min: 700, max: 1140 },
      blendMode: 'ADD',
    }).setDepth(11).setPosition(centerX, centerY);

    this.backEmitter = this.backParticles || null;
    this.frontEmitter = this.frontParticles || null;
  }

  update() {
    this.image.rotation += this.rotationSpeed;
    this.updateParticleIntensity();
  }

  updateParticleIntensity() {
    if (!this.vfxConfig.particlesEnabled) {
      this.backEmitter?.stop();
      this.frontEmitter?.stop();
      return;
    }

    const spawnBoost = this.vfxConfig.tieToGameSpeed ? 1 + this.speedRatio * 0.32 : 1;
    const speedBoost = this.vfxConfig.tieToGameSpeed ? 1 + this.speedRatio * 0.28 : 1;
    const speedMultiplier = this.vfxConfig.particleSpeedMultiplier * speedBoost;
    const pulse = 1 + 0.35 * (0.5 + 0.5 * Math.sin(this.scene.time.now / PARTICLE_PERIODIC_SWAY_MS));
    const safeBackRate = Math.max(1, this.vfxConfig.particlesBackCount * spawnBoost * 1.2 * pulse);
    const safeFrontRate = Math.max(1, this.vfxConfig.particlesFrontCount * spawnBoost * 1.35 * pulse);

    if (this.backEmitter) {
      this.backEmitter.start();
      this.backEmitter.setFrequency(1000 / safeBackRate);
      this.setEmitterVelocity(this.backEmitter, 18 * speedMultiplier, 36 * speedMultiplier, 16 * speedMultiplier);
    }

    if (this.frontEmitter) {
      this.frontEmitter.start();
      this.frontEmitter.setFrequency(1000 / safeFrontRate);
      this.setEmitterVelocity(this.frontEmitter, 26 * speedMultiplier, 52 * speedMultiplier, 20 * speedMultiplier);
    }
  }

  setEmitterVelocity(emitter, minXAbs, maxXAbs, maxYAbs) {
    if (!emitter) {
      return;
    }

    if (typeof emitter.setSpeedX === 'function') {
      emitter.setSpeedX({
        onEmit: (particle) => {
          const direction = particle.x >= 0 ? -1 : 1;
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
        const direction = particle.x >= 0 ? -1 : 1;
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
    this.backParticles?.destroy();
    this.frontParticles?.destroy();
    this.backParticles = null;
    this.frontParticles = null;
    this.backEmitter = null;
    this.frontEmitter = null;
    this.createParticleLayers(this.particleCenterX, this.particleCenterY);

    return this;
  }

  resize(width, height) {
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    this.particleCenterX = centerX;
    this.particleCenterY = centerY;
    this.image.setPosition(centerX, centerY);

    this.backParticles?.destroy();
    this.frontParticles?.destroy();
    this.backParticles = null;
    this.frontParticles = null;
    this.backEmitter = null;
    this.frontEmitter = null;
    this.createParticleLayers(centerX, centerY);

    return this;
  }

  destroy() {
    this.backParticles?.destroy();
    this.frontParticles?.destroy();
    this.image?.destroy();
    this.backParticles = null;
    this.frontParticles = null;
    this.image = null;
  }
}

export { TunnelOuterRing };
