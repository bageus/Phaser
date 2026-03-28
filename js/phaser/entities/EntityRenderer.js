import { BONUS_TYPES, CONFIG } from '../../config.js';

const LANE_ANGLE_STEP = 0.55;
const BASE_URL = import.meta.env.BASE_URL || './';

const PLAYER_TEXTURES = {
  idle_back: 'character_back_idle',
  idle_left: 'character_left_idle',
  idle_right: 'character_right_idle',
  swipe_left: 'character_left_swipe',
  swipe_right: 'character_right_swipe',
  spin: 'character_spin',
};

const BONUS_TEXTURES = {
  [BONUS_TYPES.SHIELD]: 'bonus_shield',
  [BONUS_TYPES.SPEED_DOWN]: 'bonus_speed',
  [BONUS_TYPES.SPEED_UP]: 'bonus_speed',
  [BONUS_TYPES.MAGNET]: 'bonus_magnet',
  [BONUS_TYPES.INVERT]: 'bonus_chkey',
  [BONUS_TYPES.SCORE_300]: 'bonus_score_plus',
  [BONUS_TYPES.SCORE_500]: 'bonus_score_plus',
  [BONUS_TYPES.X2]: 'bonus_score_plus',
  [BONUS_TYPES.SCORE_MINUS_300]: 'bonus_score_minus',
  [BONUS_TYPES.SCORE_MINUS_500]: 'bonus_score_minus',
  [BONUS_TYPES.RECHARGE]: 'bonus_recharge',
};

const OBSTACLE_TEXTURES = {
  fence: 'obstacles_1',
  rock1: 'obstacles_1',
  rock2: 'obstacles_1',
  bull: 'obstacles_1',
  wall_brick: 'obstacles_2',
  wall_kactus: 'obstacles_2',
  tree: 'obstacles_2',
  pit: 'obstacles_3',
  spikes: 'obstacles_3',
  bottles: 'obstacles_3',
};

const FRAME_SIZE = 64;
const PLAYER_FRAME_SIZE = 128;
function assetUrl(path) {
  const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  return `${normalizedBase}${path}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getPlayerTextureKey(player, runtime) {
  if (player?.spinActive) {
    return PLAYER_TEXTURES.spin;
  }
  if (player?.isLaneTransition) {
    return player.targetLane < player.lanePrev
      ? PLAYER_TEXTURES.swipe_left
      : PLAYER_TEXTURES.swipe_right;
  }
  if (player?.lane <= -1) return PLAYER_TEXTURES.idle_left;
  if (player?.lane >= 1) return PLAYER_TEXTURES.idle_right;
  return PLAYER_TEXTURES.idle_back;
}

function projectLane(lane, z, viewport, tube, includeSpinRotation = false, player = null) {
  const safeZ = clamp(Number.isFinite(z) ? z : CONFIG.PLAYER_Z, 0, 2);
  const safeLane = clamp(Number.isFinite(lane) ? lane : 0, -1, 1);
  const scale = Math.max(0.05, 1 - safeZ);
  const bendInfluence = 1 - scale;
  const radius = CONFIG.TUBE_RADIUS * scale;
  let angle = safeLane * LANE_ANGLE_STEP;

  if (includeSpinRotation && player?.spinActive) {
    angle += (player.spinProgress || 0) * Math.PI * 2;
  }

  return {
    x:
      viewport.centerX +
      Math.sin(angle) * radius +
      (tube.centerOffsetX || 0) * bendInfluence,
    y:
      viewport.centerY +
      Math.cos(angle) * radius * CONFIG.PLAYER_OFFSET +
      (tube.centerOffsetY || 0) * bendInfluence,
    scale,
    angle,
  };
}

function projectPolar(angle, z, viewport, tube, radiusFactor = 0.65) {
  const safeZ = clamp(Number.isFinite(z) ? z : 1, 0, 2);
  const scale = Math.max(0.05, 1 - safeZ);
  const bendInfluence = 1 - scale;
  const radius = CONFIG.TUBE_RADIUS * scale * radiusFactor;
  const orbitAngle = (angle || 0) + (tube.rotation || 0);
  return {
    x:
      viewport.centerX +
      Math.sin(orbitAngle) * radius +
      (tube.centerOffsetX || 0) * bendInfluence,
    y:
      viewport.centerY +
      Math.cos(orbitAngle) * radius * CONFIG.PLAYER_OFFSET +
      (tube.centerOffsetY || 0) * bendInfluence,
    scale,
    angle: orbitAngle,
  };
}

function getBonusFrame(item) {
  const frame = item.animFrame || 0;
  switch (item.type) {
    case BONUS_TYPES.SHIELD:
      return frame % 4;
    case BONUS_TYPES.SPEED_DOWN:
      return Math.floor(frame / 4) % 2;
    case BONUS_TYPES.SPEED_UP:
      return 2 + (Math.floor(frame / 4) % 2);
    case BONUS_TYPES.MAGNET:
      return Math.floor(frame / 2) % 6;
    case BONUS_TYPES.INVERT:
      return Math.floor(frame / 4) % 2;
    case BONUS_TYPES.SCORE_300:
      return Math.floor(frame / 4) % 2;
    case BONUS_TYPES.SCORE_500:
      return 2 + (Math.floor(frame / 4) % 2);
    case BONUS_TYPES.X2:
      return 4 + (Math.floor(frame / 4) % 2);
    case BONUS_TYPES.SCORE_MINUS_300:
      return Math.floor(frame / 4) % 2;
    case BONUS_TYPES.SCORE_MINUS_500:
      return 2 + (Math.floor(frame / 4) % 2);
    case BONUS_TYPES.RECHARGE:
      return Math.floor(frame / 3) % 5;
    default:
      return 0;
  }
}

class EntityRenderer {
  static preload(scene) {
    Object.values(PLAYER_TEXTURES).forEach((key) => {
      scene.load.spritesheet(key, assetUrl(`assets/${key}.png`), {
        frameWidth: PLAYER_FRAME_SIZE,
        frameHeight: PLAYER_FRAME_SIZE,
      });
    });

    ['coins_gold', 'coins_silver', ...Object.values(BONUS_TEXTURES), ...Object.values(OBSTACLE_TEXTURES)].forEach((key) => {
      scene.load.spritesheet(key, assetUrl(`assets/${key}.png`), {
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
      });
    });
  }

  constructor(scene) {
    this.scene = scene;
    this.snapshot = null;
    this.root = null;
    this.objectLayer = null;
    this.playerLayer = null;
    this.targetLayer = null;
    this.coinSprites = [];
    this.bonusSprites = [];
    this.obstacleSprites = [];
    this.spinTargetGraphics = [];
    this.playerSprite = null;
    this.playerShadow = null;
  }

  create() {
    this.root = this.scene.add.container(0, 0).setDepth(12);
    this.objectLayer = this.scene.add.container(0, 0).setDepth(12);
    this.playerLayer = this.scene.add.container(0, 0).setDepth(13);
    this.targetLayer = this.scene.add.container(0, 0).setDepth(14);
    this.root.add([this.objectLayer, this.playerLayer, this.targetLayer]);

    this.playerShadow = this.scene.add.ellipse(0, 0, 82, 28, 0x000000, 0.26);
    this.playerSprite = this.scene.add.sprite(0, 0, PLAYER_TEXTURES.idle_back, 0);
    this.playerLayer.add([this.playerShadow, this.playerSprite]);
  }

  destroyPool(pool) {
    pool.forEach((entry) => entry.destroy());
    pool.length = 0;
  }

  destroy() {
    this.destroyPool(this.coinSprites);
    this.destroyPool(this.bonusSprites);
    this.destroyPool(this.obstacleSprites);
    this.destroyPool(this.spinTargetGraphics);
    this.playerSprite?.destroy();
    this.playerShadow?.destroy();
    this.root?.destroy();
    this.root = null;
  }

  ensurePoolSize(pool, count, factory) {
    while (pool.length < count) {
      pool.push(factory());
    }
    for (let index = 0; index < pool.length; index += 1) {
      pool[index].setVisible(index < count);
    }
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    if (!this.root || !snapshot?.viewport || !snapshot?.tube) return;
    this.renderObjects();
    this.renderPlayer();
    this.renderSpinTargets();
  }

  renderPlayer() {
    const viewport = this.snapshot?.viewport;
    const tube = this.snapshot?.tube;
    const player = this.snapshot?.player;
    if (!viewport || !tube || !player || !this.playerSprite || !this.playerShadow) return;

    const laneValue = player.isLaneTransition
      ? (player.lanePrev || 0) + ((player.targetLane || 0) - (player.lanePrev || 0)) * clamp(player.laneAnimFrame / Math.max(1, CONFIG.LANE_TRANSITION_FRAMES), 0, 1)
      : player.lane;
    const projection = projectLane(laneValue, CONFIG.PLAYER_Z, viewport, tube, true, player);
    const textureKey = getPlayerTextureKey(player);
    const frameCount = this.scene.textures.get(textureKey)?.frameTotal || 1;
    const frameIndex = textureKey === PLAYER_TEXTURES.spin
      ? Math.floor((player.spinProgress || 0) * Math.max(1, frameCount - 1)) % Math.max(1, frameCount)
      : Math.round(player.frameIndex || 0) % Math.max(1, frameCount);

    this.playerSprite.setTexture(textureKey, frameIndex);
    this.playerSprite.setPosition(projection.x, projection.y);
    this.playerSprite.setDisplaySize(154, 154);
    this.playerSprite.setAlpha(1);

    this.playerShadow
      .setPosition(projection.x, projection.y + 44)
      .setDisplaySize(100, 30)
      .setAlpha(0.22 + (player.shield ? 0.06 : 0));
  }

  renderObjects() {
    const snapshot = this.snapshot;
    const viewport = snapshot?.viewport;
    const tube = snapshot?.tube;
    if (!viewport || !tube) return;

    const objectEntries = [];
    (snapshot.obstacles || []).forEach((item) => {
      if (item.passed || item.z <= -0.2 || item.z >= 1.6) return;
      objectEntries.push({ kind: 'obstacle', z: item.z, item });
    });
    (snapshot.bonuses || []).forEach((item) => {
      if (item.active === false || item.z <= -0.2 || item.z >= 1.6) return;
      objectEntries.push({ kind: 'bonus', z: item.z, item });
    });
    (snapshot.coins || []).forEach((item) => {
      if (item.collected || item.z <= -0.2 || item.z >= 1.8) return;
      objectEntries.push({ kind: 'coin', z: item.z, item });
    });
    objectEntries.sort((a, b) => b.z - a.z);

    const obstacleCount = objectEntries.filter((entry) => entry.kind === 'obstacle').length;
    const bonusCount = objectEntries.filter((entry) => entry.kind === 'bonus').length;
    const coinCount = objectEntries.filter((entry) => entry.kind === 'coin').length;
    this.ensurePoolSize(this.obstacleSprites, obstacleCount, () => this.scene.add.sprite(0, 0, 'obstacles_1', 0));
    this.ensurePoolSize(this.bonusSprites, bonusCount, () => this.scene.add.sprite(0, 0, 'bonus_shield', 0));
    this.ensurePoolSize(this.coinSprites, coinCount, () => this.scene.add.sprite(0, 0, 'coins_silver', 0));

    let obstacleIndex = 0;
    let bonusIndex = 0;
    let coinIndex = 0;

    for (const entry of objectEntries) {
      const { item } = entry;
      const projection = typeof item.angle === 'number'
        ? projectPolar(item.angle, item.z, viewport, tube, item.radiusFactor || 0.65)
        : projectLane(item.lane, item.z, viewport, tube);
      if (!projection || projection.scale < 0.12) continue;

      if (entry.kind === 'obstacle') {
        const sprite = this.obstacleSprites[obstacleIndex++];
        const textureKey = OBSTACLE_TEXTURES[item.subtype] || 'obstacles_1';
        const frameMap = { fence: 0, rock1: 1, rock2: 2, bull: 3, wall_brick: 0, wall_kactus: 1, tree: 2, pit: 0, spikes: 1, bottles: 2 };
        const obstacleGrowthStartZ = 1.0;
        const obstacleNearZ = CONFIG.PLAYER_Z;
        const approachRange = Math.max(0.001, obstacleGrowthStartZ - obstacleNearZ);
        const isApproachingPlayer = item.z <= obstacleGrowthStartZ && item.z >= obstacleNearZ;
        const approachTLinear = clamp((obstacleGrowthStartZ - item.z) / approachRange, 0, 1);
        const growth = 1 + (isApproachingPlayer ? 1.5 * approachTLinear : 0);
        const size = Math.max(36, FRAME_SIZE * projection.scale) * growth;
        sprite.setTexture(textureKey, frameMap[item.subtype] || 0);
        sprite.setPosition(projection.x, projection.y);
        sprite.setDisplaySize(size, size);
        sprite.setAlpha(1);
        sprite.setVisible(true);
        this.objectLayer.add(sprite);
      } else if (entry.kind === 'bonus') {
        const sprite = this.bonusSprites[bonusIndex++];
        const textureKey = BONUS_TEXTURES[item.type] || 'bonus_shield';
        const baseSize = Math.max(18, FRAME_SIZE * projection.scale * 0.94);
        const size = textureKey === 'bonus_chkey' ? baseSize * 1.25 : baseSize;
        sprite.setTexture(textureKey, getBonusFrame(item));
        sprite.setPosition(projection.x, projection.y);
        sprite.setDisplaySize(size, size);
        sprite.setAlpha(0.95);
        sprite.setVisible(true);
        this.objectLayer.add(sprite);
      } else {
        const sprite = this.coinSprites[coinIndex++];
        const textureKey = item.type === 'gold' || item.type === 'gold_spin' ? 'coins_gold' : 'coins_silver';
        const size = Math.max(18, FRAME_SIZE * projection.scale * (textureKey === 'coins_gold' ? 1 : 0.95));
        sprite.setTexture(textureKey, (item.animFrame || 0) % 4);
        sprite.setPosition(projection.x, projection.y);
        sprite.setDisplaySize(size, size);
        sprite.setAlpha(item.spinOnly ? 0.78 : 1);
        sprite.setVisible(true);
        this.objectLayer.add(sprite);
      }
    }

    for (let index = obstacleIndex; index < this.obstacleSprites.length; index += 1) {
      this.obstacleSprites[index].setVisible(false);
    }
    for (let index = bonusIndex; index < this.bonusSprites.length; index += 1) {
      this.bonusSprites[index].setVisible(false);
    }
    for (let index = coinIndex; index < this.coinSprites.length; index += 1) {
      this.coinSprites[index].setVisible(false);
    }
  }

  renderSpinTargets() {
    const targets = (this.snapshot?.spinTargets || []).filter((item) => !item.collected && item.z > -0.2 && item.z < 1.6);
    const viewport = this.snapshot?.viewport;
    const tube = this.snapshot?.tube;
    if (!viewport || !tube) return;
    this.ensurePoolSize(this.spinTargetGraphics, targets.length, () => this.scene.add.graphics());

    targets.forEach((target, index) => {
      const graphics = this.spinTargetGraphics[index];
      const projection = projectPolar(target.angle || 0, target.z, viewport, tube, target.radiusFactor || 0.65);
      const size = Math.max(14, 28 * projection.scale);
      graphics.clear();
      graphics.lineStyle(Math.max(1, projection.scale * 2), 0xff6a38, 0.9);
      graphics.strokeCircle(projection.x, projection.y, size);
      graphics.strokeCircle(projection.x, projection.y, size * 0.45);
      graphics.beginPath();
      graphics.moveTo(projection.x - size * 1.15, projection.y);
      graphics.lineTo(projection.x + size * 1.15, projection.y);
      graphics.moveTo(projection.x, projection.y - size * 1.15);
      graphics.lineTo(projection.x, projection.y + size * 1.15);
      graphics.strokePath();
      graphics.setVisible(true);
      this.targetLayer.add(graphics);
    });

    for (let index = targets.length; index < this.spinTargetGraphics.length; index += 1) {
      this.spinTargetGraphics[index].clear();
      this.spinTargetGraphics[index].setVisible(false);
    }
  }

}

export { EntityRenderer };
