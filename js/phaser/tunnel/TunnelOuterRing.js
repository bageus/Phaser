const BASE_URL = import.meta.env.BASE_URL || './';
const TUNNEL_OUTER_RING_TEXTURE_KEY = 'metal2_layer_1.png';
const TUNNEL_OUTER_RING_TEXTURE_PATH = 'img/metal2_layer_1.png';
const DEFAULT_ROTATION_SPEED = 0.002;

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
