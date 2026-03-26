const BASE_URL = import.meta.env.BASE_URL || './';
const TUNNEL_OUTER_RING_TEXTURE_KEY = 'metal_ring.webp';
const TUNNEL_OUTER_RING_TEXTURE_PATH = 'img/metal_ring.webp';
const ENERGY_RING_TEXTURE_PATHS = [
  'img/generated/energy_ring_frame1.webp',
  'img/generated/energy_ring_frame2.webp',
  'img/generated/energy_ring_frame3.webp',
];
const DEFAULT_ROTATION_SPEED = 0;
const ENERGY_RING_FRAME_DURATION_MS = 440;
const ENERGY_RING_BASE_ALPHA = 0.32;
const ENERGY_RING_PULSE_ALPHA = 0.06;
const ENERGY_RING_PULSE_SCALE = 0.016;
const ENERGY_RING_PULSE_SPEED = 0.0045;
const TUNNEL_OUTER_RING_SOURCE_WIDTH = 2048;
const TUNNEL_OUTER_RING_SOURCE_HEIGHT = 1365;
const TUNNEL_OUTER_RING_INNER_RADIUS_X = 393;
const TUNNEL_OUTER_RING_INNER_RADIUS_Y = 393;
const TUNNEL_OUTER_RING_FIT_SCALE = 0.9;
const ENERGY_RING_TEXTURE_KEYS = ENERGY_RING_TEXTURE_PATHS.map((path) => `generated_${path}`);

function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}

class TunnelOuterRing {
  static preload(scene) {
    if (scene.textures.exists(TUNNEL_OUTER_RING_TEXTURE_KEY)) {
      // no-op
    } else {
      scene.load.image(
        TUNNEL_OUTER_RING_TEXTURE_KEY,
        assetUrl(TUNNEL_OUTER_RING_TEXTURE_PATH),
      );
    }

    ENERGY_RING_TEXTURE_KEYS.forEach((key, index) => {
      if (scene.textures.exists(key)) {
        return;
      }
      scene.load.image(key, assetUrl(ENERGY_RING_TEXTURE_PATHS[index]));
    });
  }

  constructor(scene) {
    const centerX = scene.scale.width * 0.5;
    const centerY = scene.scale.height * 0.5;
    this.rotationSpeed = DEFAULT_ROTATION_SPEED;
    this.frameBlendElapsedMs = 0;
    this.currentEnergyFrame = -1;
    this.targetWidth = 0;
    this.targetHeight = 0;
    this.image = scene.add
      .image(centerX, centerY, TUNNEL_OUTER_RING_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(10);
    this.energyLayerA = scene.add
      .image(centerX, centerY, ENERGY_RING_TEXTURE_KEYS[0])
      .setOrigin(0.5, 0.5)
      .setDepth(11)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(ENERGY_RING_BASE_ALPHA);
    this.energyLayerB = scene.add
      .image(centerX, centerY, ENERGY_RING_TEXTURE_KEYS[1])
      .setOrigin(0.5, 0.5)
      .setDepth(12)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
  }

  applyEnergyRingFrame(frameIndex) {
    if (this.currentEnergyFrame === frameIndex) {
      return;
    }
    const nextIndex = (frameIndex + 1) % ENERGY_RING_TEXTURE_KEYS.length;
    this.energyLayerA.setTexture(ENERGY_RING_TEXTURE_KEYS[frameIndex]);
    this.energyLayerB.setTexture(ENERGY_RING_TEXTURE_KEYS[nextIndex]);
    this.currentEnergyFrame = frameIndex;
  }

  applyEnergyRingDisplaySize(pulseScale) {
    const width = this.targetWidth || this.image.displayWidth;
    const height = this.targetHeight || this.image.displayHeight;
    const scaledWidth = width * pulseScale;
    const scaledHeight = height * pulseScale;
    this.energyLayerA.setDisplaySize(scaledWidth, scaledHeight);
    this.energyLayerB.setDisplaySize(scaledWidth, scaledHeight);
  }

  update(delta = 16.67) {
    this.image.rotation += this.rotationSpeed;
    this.frameBlendElapsedMs += delta;

    const frameCount = ENERGY_RING_TEXTURE_KEYS.length;
    const frameProgress = this.frameBlendElapsedMs / ENERGY_RING_FRAME_DURATION_MS;
    const baseFrameIndex = Math.floor(frameProgress) % frameCount;
    this.applyEnergyRingFrame(baseFrameIndex);

    const blendPhase = frameProgress - Math.floor(frameProgress);
    const smoothBlend = blendPhase * blendPhase * (3 - 2 * blendPhase);
    const pulsePhase = this.frameBlendElapsedMs * ENERGY_RING_PULSE_SPEED;
    const pulseValue = Math.sin(pulsePhase);
    const pulseAlpha = ENERGY_RING_BASE_ALPHA + pulseValue * ENERGY_RING_PULSE_ALPHA;
    this.energyLayerA.setAlpha((1 - smoothBlend) * pulseAlpha);
    this.energyLayerB.setAlpha(smoothBlend * pulseAlpha);
    this.applyEnergyRingDisplaySize(1 + pulseValue * ENERGY_RING_PULSE_SCALE);
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

    this.targetWidth = targetWidth;
    this.targetHeight = targetHeight;
    this.image.setDisplaySize(targetWidth, targetHeight);
    this.applyEnergyRingDisplaySize(1);
    return this;
  }

  resize(width, height) {
    this.image.setPosition(width * 0.5, height * 0.5);
    this.energyLayerA.setPosition(width * 0.5, height * 0.5);
    this.energyLayerB.setPosition(width * 0.5, height * 0.5);
    return this;
  }

  destroy() {
    this.energyLayerA?.destroy();
    this.energyLayerB?.destroy();
    this.image?.destroy();
    this.energyLayerA = null;
    this.energyLayerB = null;
    this.image = null;
  }
}

export { TunnelOuterRing };
