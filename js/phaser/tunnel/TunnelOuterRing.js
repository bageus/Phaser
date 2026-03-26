const BASE_URL = import.meta.env.BASE_URL || './';
const TUNNEL_OUTER_RING_TEXTURE_KEY = 'metal_ring.webp';
const TUNNEL_OUTER_RING_TEXTURE_PATH = 'img/metal_ring.webp';
const TUNNEL_ENERGY_RING_FRAME_KEYS = Object.freeze([
  'energy_ring_frame1.webp',
  'energy_ring_frame2.webp',
  'energy_ring_frame3.webp',
]);
const TUNNEL_ENERGY_RING_FRAME_PATHS = Object.freeze([
  'img/generated/energy_ring_frame1.webp',
  'img/generated/energy_ring_frame2.webp',
  'img/generated/energy_ring_frame3.webp',
]);
const DEFAULT_ROTATION_SPEED = 0;
const TUNNEL_OUTER_RING_SOURCE_WIDTH = 2048;
const TUNNEL_OUTER_RING_SOURCE_HEIGHT = 1365;
const TUNNEL_OUTER_RING_INNER_RADIUS_X = 393;
const TUNNEL_OUTER_RING_INNER_RADIUS_Y = 393;
const TUNNEL_OUTER_RING_FIT_SCALE = 0.9;
const TUNNEL_ENERGY_RING_DEPTH = 11;
const TUNNEL_ENERGY_RING_FRAME_HOLD_MS = 850;
const TUNNEL_ENERGY_RING_TRANSITION_MS = 700;
const TUNNEL_ENERGY_RING_BASE_ALPHA = 0.23;
const TUNNEL_ENERGY_RING_ALPHA_PULSE_AMPLITUDE = 0.06;
const TUNNEL_ENERGY_RING_ALPHA_PULSE_SPEED = 0.0035;
const TUNNEL_ENERGY_RING_SCALE_PULSE_AMPLITUDE = 0.02;
const TUNNEL_ENERGY_RING_SCALE_PULSE_SPEED = 0.0025;

function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}

class TunnelOuterRing {
  static preload(scene) {
    if (scene.textures.exists(TUNNEL_OUTER_RING_TEXTURE_KEY)) {
      return;
    }
    scene.load.image(
      TUNNEL_OUTER_RING_TEXTURE_KEY,
      assetUrl(TUNNEL_OUTER_RING_TEXTURE_PATH),
    );
    TUNNEL_ENERGY_RING_FRAME_KEYS.forEach((frameKey, index) => {
      if (scene.textures.exists(frameKey)) {
        return;
      }
      scene.load.image(frameKey, assetUrl(TUNNEL_ENERGY_RING_FRAME_PATHS[index]));
    });
  }

  constructor(scene) {
    this.scene = scene;
    const centerX = scene.scale.width * 0.5;
    const centerY = scene.scale.height * 0.5;
    this.rotationSpeed = DEFAULT_ROTATION_SPEED;
    this.image = scene.add
      .image(centerX, centerY, TUNNEL_OUTER_RING_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(10);
    this.energyRingLayers = [
      scene.add
        .image(centerX, centerY, TUNNEL_ENERGY_RING_FRAME_KEYS[0])
        .setOrigin(0.5, 0.5)
        .setBlendMode('ADD')
        .setDepth(TUNNEL_ENERGY_RING_DEPTH)
        .setAlpha(TUNNEL_ENERGY_RING_BASE_ALPHA),
      scene.add
        .image(centerX, centerY, TUNNEL_ENERGY_RING_FRAME_KEYS[1])
        .setOrigin(0.5, 0.5)
        .setBlendMode('ADD')
        .setDepth(TUNNEL_ENERGY_RING_DEPTH)
        .setAlpha(0),
    ];
    this.activeLayerIndex = 0;
    this.currentFrameIndex = 0;
    this.transitionStartTime = null;
    this.nextTransitionTime = scene.time.now + TUNNEL_ENERGY_RING_FRAME_HOLD_MS;
  }

  update(time = this.scene?.time?.now ?? 0) {
    this.image.rotation += this.rotationSpeed;

    const pulseAlpha =
      TUNNEL_ENERGY_RING_BASE_ALPHA +
      Math.sin(time * TUNNEL_ENERGY_RING_ALPHA_PULSE_SPEED) *
        TUNNEL_ENERGY_RING_ALPHA_PULSE_AMPLITUDE;
    const pulseScale =
      1 +
      Math.sin(time * TUNNEL_ENERGY_RING_SCALE_PULSE_SPEED) *
        TUNNEL_ENERGY_RING_SCALE_PULSE_AMPLITUDE;

    if (this.transitionStartTime === null && time >= this.nextTransitionTime) {
      this.transitionStartTime = time;
      const nextLayerIndex = 1 - this.activeLayerIndex;
      const nextFrameIndex = (this.currentFrameIndex + 1) % TUNNEL_ENERGY_RING_FRAME_KEYS.length;
      this.energyRingLayers[nextLayerIndex].setTexture(TUNNEL_ENERGY_RING_FRAME_KEYS[nextFrameIndex]);
    }

    if (this.transitionStartTime !== null) {
      const transitionProgress = Math.min(
        1,
        (time - this.transitionStartTime) / TUNNEL_ENERGY_RING_TRANSITION_MS,
      );
      const inactiveLayerIndex = 1 - this.activeLayerIndex;
      this.energyRingLayers[this.activeLayerIndex].setAlpha(pulseAlpha * (1 - transitionProgress));
      this.energyRingLayers[inactiveLayerIndex].setAlpha(pulseAlpha * transitionProgress);

      if (transitionProgress >= 1) {
        this.activeLayerIndex = inactiveLayerIndex;
        this.currentFrameIndex = (this.currentFrameIndex + 1) % TUNNEL_ENERGY_RING_FRAME_KEYS.length;
        this.transitionStartTime = null;
        this.nextTransitionTime = time + TUNNEL_ENERGY_RING_FRAME_HOLD_MS;
      }
    } else {
      this.energyRingLayers[this.activeLayerIndex].setAlpha(pulseAlpha);
      this.energyRingLayers[1 - this.activeLayerIndex].setAlpha(0);
    }

    this.energyRingLayers[0].setScale(pulseScale);
    this.energyRingLayers[1].setScale(pulseScale);
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
    this.energyRingLayers[0].setDisplaySize(targetWidth, targetHeight);
    this.energyRingLayers[1].setDisplaySize(targetWidth, targetHeight);
    return this;
  }

  resize(width, height) {
    this.image.setPosition(width * 0.5, height * 0.5);
    this.energyRingLayers[0].setPosition(width * 0.5, height * 0.5);
    this.energyRingLayers[1].setPosition(width * 0.5, height * 0.5);
    return this;
  }

  destroy() {
    this.image?.destroy();
    this.energyRingLayers?.forEach((layer) => layer?.destroy());
    this.image = null;
    this.energyRingLayers = null;
  }
}

export { TunnelOuterRing };
