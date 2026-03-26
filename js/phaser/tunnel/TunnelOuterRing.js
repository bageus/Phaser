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
const DEBUG_SPRITE_SIZE = 16;
const DEBUG_SPRITE_SIZE = 72;
const DEBUG_PULSE_PERIOD_MS = 1200;
const DEBUG_ALPHA_FRONT_MULTIPLIER = 1.08;
const DEBUG_ALPHA_BACK_MULTIPLIER = 0.82;
const DEBUG_MIN_LIFESPAN_MS = 900;
const DEBUG_MAX_LIFESPAN_MS = 1800;
const LEFT_ONLY_TEXTURE_KEY = 'energy_effect.webp';
const LEFT_ONLY_TEXTURE_KEY = 'energy_effect.webp';

function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
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
    this.debugSprites = [];
    this.debugSpriteMeta = [];
    this.activeParticleTextureKeys = [];
    this.activeParticleTextureKeys = [];

    this.createParticleLayers(centerX, centerY);
  }

  createParticleLayers(centerX, centerY) {
    const particleTextureKeys = ENERGY_PARTICLE_TEXTURES
      .map((texture) => texture.key)
      .filter((textureKey) => this.scene.textures.exists(textureKey));

    if (!this.vfxConfig.particlesEnabled || particleTextureKeys.length === 0) {
      return;
    }
    this.activeParticleTextureKeys = [...particleTextureKeys];

    const backCount = clamp(Math.round(this.vfxConfig.particlesBackCount * 0.4), 10, 30);
    const frontCount = clamp(Math.round(this.vfxConfig.particlesFrontCount * 0.4), 12, 36);
    const totalCount = backCount + frontCount;
    const seedTexture = particleTextureKeys[0];

    this.debugSprites = Array.from({ length: totalCount }, () => (
      this.scene.add
        .sprite(centerX, centerY, seedTexture)
        .setDisplaySize(DEBUG_SPRITE_SIZE, DEBUG_SPRITE_SIZE)
        .setBlendMode('NORMAL')
    ));

    const randomPointInTube = () => {
      const angle = randomRange(0, Math.PI * 2);
      const radius = Math.sqrt(Math.random());
      return {
        x: centerX + Math.cos(angle) * this.particleAreaRadiusX * 0.56 * radius,
        y: centerY + Math.sin(angle) * this.particleAreaRadiusY * 0.52 * radius,
      };
    };

    const createMeta = (isFront) => {
      const spawn = randomPointInTube();
      const angle = randomRange(0, Math.PI * 2);
      const textureKey = particleTextureKeys[Math.floor(Math.random() * particleTextureKeys.length)];
      return {
        isFront,
        textureKey,
        phase: randomRange(0, Math.PI * 2),
        ageMs: randomRange(0, DEBUG_MAX_LIFESPAN_MS),
        lifeMs: randomRange(DEBUG_MIN_LIFESPAN_MS, DEBUG_MAX_LIFESPAN_MS),
        baseScale: randomRange(0.66, 1),
        velocityX: Math.cos(angle) * randomRange(8, 26),
        velocityY: Math.sin(angle) * randomRange(8, 24),
        x: spawn.x,
        y: spawn.y,
      };
    };

    this.debugSpriteMeta = this.debugSprites.map((sprite, index) => {
      const isFront = index >= backCount;
      const meta = createMeta(isFront);
      sprite
        .setTexture(meta.textureKey)
        .setDepth(isFront ? PARTICLE_DEPTH_FRONT : PARTICLE_DEPTH_BACK)
        .setPosition(meta.x, meta.y);
      this.applyTextureOrientation(sprite, meta);
      return meta;
    });

    this.backParticles = this.debugSprites.filter((_, index) => index < backCount);
    this.frontParticles = this.debugSprites.filter((_, index) => index >= backCount);

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
    if (!this.debugSprites?.length) {
      return;
    }

    const alphaBase = clamp(this.vfxConfig.glowAlpha, 0.2, 0.72);
    const pulse = 0.5 + 0.5 * Math.sin(this.scene.time.now / DEBUG_PULSE_PERIOD_MS);
    const speedBoost = this.vfxConfig.tieToGameSpeed ? this.speedRatio : 0;
    const speedMultiplier = Number.isFinite(this.vfxConfig.particleSpeedMultiplier)
      ? Math.max(0.4, this.vfxConfig.particleSpeedMultiplier)
      : 1;
    const targetScale = 0.9 + 0.08 * pulse + 0.08 * speedBoost;
    const densityFactor = clamp(
      (this.vfxConfig.particlesBackCount + this.vfxConfig.particlesFrontCount) / (40 + 54),
      0.6,
      1.6,
    );
    const deltaMs = Math.max(8, this.scene.game.loop.delta || 16.67);
    const step = deltaMs / 1000;
    const now = this.scene.time.now;

    this.debugSprites.forEach((sprite, index) => {
      const meta = this.debugSpriteMeta[index];
      if (!meta) {
        return;
      }
      meta.ageMs += deltaMs * (0.9 + speedBoost * 0.7) * densityFactor;
      if (meta.ageMs >= meta.lifeMs) {
        const angle = randomRange(0, Math.PI * 2);
        meta.ageMs = 0;
        meta.lifeMs = randomRange(DEBUG_MIN_LIFESPAN_MS, DEBUG_MAX_LIFESPAN_MS);
        meta.baseScale = randomRange(0.66, 1);
        meta.phase = randomRange(0, Math.PI * 2);
        meta.textureKey = this.activeParticleTextureKeys[
          Math.floor(Math.random() * this.activeParticleTextureKeys.length)
        ] || meta.textureKey;
        meta.x = this.particleCenterX + Math.cos(angle) * this.particleAreaRadiusX * randomRange(0.12, 0.58);
        meta.y = this.particleCenterY + Math.sin(angle) * this.particleAreaRadiusY * randomRange(0.12, 0.56);
        meta.velocityX = Math.cos(angle) * randomRange(8, 26);
        meta.velocityY = Math.sin(angle) * randomRange(8, 24);
        sprite.setTexture(meta.textureKey);
      }

      meta.x += meta.velocityX * speedMultiplier * step;
      meta.y += meta.velocityY * speedMultiplier * step;

        meta.baseScale = randomRange(0.66, 1);
        meta.phase = randomRange(0, Math.PI * 2);
        meta.textureKey = this.activeParticleTextureKeys[
          Math.floor(Math.random() * this.activeParticleTextureKeys.length)
        ] || meta.textureKey;
        meta.x = this.particleCenterX + Math.cos(angle) * this.particleAreaRadiusX * randomRange(0.12, 0.58);
        meta.y = this.particleCenterY + Math.sin(angle) * this.particleAreaRadiusY * randomRange(0.12, 0.56);
        meta.velocityX = Math.cos(angle) * randomRange(8, 26);
        meta.velocityY = Math.sin(angle) * randomRange(8, 24);

        sprite.setTexture(meta.textureKey);
      }

      meta.x += meta.velocityX * speedMultiplier * step;
      meta.y += meta.velocityY * speedMultiplier * step;

      const dx = (meta.x - this.particleCenterX) / Math.max(1, this.particleAreaRadiusX * 0.62);
      const dy = (meta.y - this.particleCenterY) / Math.max(1, this.particleAreaRadiusY * 0.62);
      const outside = (dx * dx + dy * dy) > 1;
      if (outside) {
        meta.ageMs = meta.lifeMs + 1;
      }

      const lifeRatio = 1 - Math.abs((meta.ageMs / meta.lifeMs) * 2 - 1);
      const layerAlpha = alphaBase
        * (meta.isFront ? DEBUG_ALPHA_FRONT_MULTIPLIER : DEBUG_ALPHA_BACK_MULTIPLIER)
        * (0.84 + pulse * 0.24)
        * (0.55 + lifeRatio * 0.55);
      sprite.setAlpha(clamp(layerAlpha, 0.2, 0.74));
      sprite.setScale(targetScale * meta.baseScale);
      sprite.x = meta.x;
      sprite.y = meta.y;
      sprite.rotation = (0.03 + speedBoost * 0.08) * Math.sin((now / (960 / speedMultiplier)) + meta.phase);
      this.applyTextureOrientation(sprite, meta);
    });
  }

  applyTextureOrientation(sprite, meta) {
    if (!sprite || !meta) {
      return;
    }

    const isRightSide = meta.x >= this.particleCenterX;
    const shouldMirrorOnRight = meta.textureKey === LEFT_ONLY_TEXTURE_KEY && isRightSide;
    sprite.setFlipX(Boolean(shouldMirrorOnRight));

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
    this.debugSprites = [];
    this.debugSpriteMeta = [];
    this.activeParticleTextureKeys = [];
    this.activeParticleTextureKeys = [];

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
    this.debugSprites = [];
    this.debugSpriteMeta = [];
    this.activeParticleTextureKeys = [];
    this.activeParticleTextureKeys = [];

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
    this.debugSprites = [];
    this.debugSpriteMeta = [];
    this.activeParticleTextureKeys = [];
    this.activeParticleTextureKeys = [];
    this.image = null;
  }
}

export { TunnelOuterRing };
