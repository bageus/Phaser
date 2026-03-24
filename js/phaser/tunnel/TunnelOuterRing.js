const BASE_URL = import.meta.env.BASE_URL || './';
const TUNNEL_OUTER_RING_TEXTURE_KEY = 'metal_ring.webp';
const TUNNEL_OUTER_RING_TEXTURE_PATH = 'img/metal_ring.webp';
const DEFAULT_ROTATION_SPEED = 0;
const TUNNEL_OUTER_RING_SOURCE_WIDTH = 2048;
const TUNNEL_OUTER_RING_SOURCE_HEIGHT = 1365;
const TUNNEL_OUTER_RING_INNER_RADIUS_X = 393;
const TUNNEL_OUTER_RING_INNER_RADIUS_Y = 393;
const TUNNEL_OUTER_RING_FIT_SCALE = 0.96;

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
  }

  constructor(scene) {
    const centerX = scene.scale.width * 0.5;
    const centerY = scene.scale.height * 0.5;
    this.rotationSpeed = DEFAULT_ROTATION_SPEED;
    this.image = scene.add
      .image(centerX, centerY, TUNNEL_OUTER_RING_TEXTURE_KEY)
      .setOrigin(0.5, 0.5)
      .setDepth(10);
  }

  update() {
    this.image.rotation += this.rotationSpeed;
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
    return this;
  }

  resize(width, height) {
    this.image.setPosition(width * 0.5, height * 0.5);
    return this;
  }

  destroy() {
    this.image?.destroy();
    this.image = null;
  }
}

export { TunnelOuterRing };
