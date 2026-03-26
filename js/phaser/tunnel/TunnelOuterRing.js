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
  glowAlpha: 0.42,
  tieToGameSpeed: true,
  speedMin: 0.01,
  speedMax: 0.25,
});

const PARTICLE_DEPTH_BACK = 30;
const PARTICLE_DEPTH_FRONT = 31;
const DEBUG_SIDE_SPRITES_PER_SIDE = 4;
const DEBUG_SPRITE_SIZE = 120;

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

  createParticleLayers(centerX, centerY) {
    const particleTextureKeys = ENERGY_PARTICLE_TEXTURES
      .map((texture) => texture.key)
      .filter((textureKey) => this.scene.textures.exists(textureKey));

    if (!this.vfxConfig.particlesEnabled || particleTextureKeys.length === 0) {
      return;
    }

    const textureKey = particleTextureKeys[0];
    const verticalStep = (this.particleAreaRadiusY * 2) / (DEBUG_SIDE_SPRITES_PER_SIDE + 1);
    const xOffset = this.particleAreaRadiusX * 0.86;

    this.backParticles = Array.from({ length: DEBUG_SIDE_SPRITES_PER_SIDE }, (_, index) => (
      this.scene.add
        .sprite(
          centerX - xOffset,
          centerY - this.particleAreaRadiusY + verticalStep * (index + 1),
          textureKey,
        )
        .setDisplaySize(DEBUG_SPRITE_SIZE, DEBUG_SPRITE_SIZE)
        .setDepth(PARTICLE_DEPTH_BACK)
    ));

    this.frontParticles = Array.from({ length: DEBUG_SIDE_SPRITES_PER_SIDE }, (_, index) => (
      this.scene.add
        .sprite(
          centerX + xOffset,
          centerY - this.particleAreaRadiusY + verticalStep * (index + 1),
          textureKey,
        )
        .setDisplaySize(DEBUG_SPRITE_SIZE, DEBUG_SPRITE_SIZE)
        .setDepth(PARTICLE_DEPTH_FRONT)
    ));

    this.backEmitters = [];
    this.frontEmitters = [];
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
    // Intentionally no-op for debug mode: keep only static side sprites visible.
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
