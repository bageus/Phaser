import { CONFIG } from '../../config.js';

const INNER_RADIUS_RATIO = 0.15;
const LANE_ANGLE_STEP = 0.55;
const TRACK_LANE_CENTERS = Object.freeze([-1, 0, 1]);
const TRACK_BAND_HALF_WIDTH = 0.24;
const TRACK_EDGE_SOFTNESS = 0.12;
const TRACK_SLAT_PERIOD = 2.9;
const TRACK_SLAT_LENGTH = 0.82;
const TRACK_SLAT_SOFTNESS = 0.22;
const LAMP_BRIGHTNESS_MULTIPLIER = 100;
const TRACK_SLAT_ALPHA_MULTIPLIER = 0.16;
const SPAWNED_RING_ALPHA_MULTIPLIER = 0.14;
const MOUTH_RING_ALPHA_MULTIPLIER = 0.4;
const WAVE_BASE_ALPHA_CAP = 0.26;
const WAVE_INNER_BAND_ALPHA_FACTOR = 0.82;
const WAVE_OUTER_BAND_ALPHA_FACTOR = 0.46;
const TUNNEL_TILE_TEXTURE_KEY = 'tunnel_tile_texture';
const TILE_OVERDRAW_PX = 2;
const TUNNEL_TILE_FRAME_COUNT = 16;
const TILE_TOP_WIDTH_MULTIPLIER = 1.18;
const QUALITY_PRESETS = Object.freeze({
  low: {
    depthStep: 3,
    segmentStep: 2,
    segmentAlpha: 0.9,
  },
  medium: {
    depthStep: 2,
    segmentStep: 1,
    segmentAlpha: 0.92,
  },
  high: {
    depthStep: 1,
    segmentStep: 1,
    segmentAlpha: 0.95,
  },
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rgbToInt(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

function blendColor(colorA, colorB, ratio) {
  const t = clamp(ratio, 0, 1);
  const r = Math.round(lerp((colorA >> 16) & 0xff, (colorB >> 16) & 0xff, t));
  const g = Math.round(lerp((colorA >> 8) & 0xff, (colorB >> 8) & 0xff, t));
  const b = Math.round(lerp(colorA & 0xff, colorB & 0xff, t));
  return rgbToInt(r, g, b);
}

function drawQuadPath(graphics, x1, y1, x2, y2, x3, y3, x4, y4) {
  graphics.beginPath();
  graphics.moveTo(x1, y1);
  graphics.lineTo(x2, y2);
  graphics.lineTo(x3, y3);
  graphics.lineTo(x4, y4);
  graphics.closePath();
}

function fillQuad(graphics, quad) {
  drawQuadPath(
    graphics,
    quad.p1.x,
    quad.p1.y,
    quad.p2.x,
    quad.p2.y,
    quad.p3.x,
    quad.p3.y,
    quad.p4.x,
    quad.p4.y,
  );
  graphics.fillPath();
}

function getQuadBand(quad, startRatio, endRatio) {
  const clampedStart = clamp(startRatio, 0, 1);
  const clampedEnd = clamp(endRatio, clampedStart, 1);
  return {
    p1: lerpPoint(quad.p1, quad.p4, clampedStart),
    p2: lerpPoint(quad.p2, quad.p3, clampedStart),
    p3: lerpPoint(quad.p2, quad.p3, clampedEnd),
    p4: lerpPoint(quad.p1, quad.p4, clampedEnd),
  };
}

function drawSoftWaveOverlay(graphics, overlay, depthMix = 0.3, alphaScale = 1) {
  const overlayColor = blendColor(0x6ba6eb, 0xdff3ff, overlay.depthRatio * depthMix);
  const baseAlpha = amplifiedAlpha(clamp(
    (0.14 + overlay.depthRatio * 0.16) *
      overlay.spawnBlend *
      SPAWNED_RING_ALPHA_MULTIPLIER *
      alphaScale,
    0,
    WAVE_BASE_ALPHA_CAP,
  ));
  if (baseAlpha <= 0.003) {
    return;
  }

  const quad = {
    p1: { x: overlay.x1, y: overlay.y1 },
    p2: { x: overlay.x2, y: overlay.y2 },
    p3: { x: overlay.x3, y: overlay.y3 },
    p4: { x: overlay.x4, y: overlay.y4 },
  };

  graphics.fillStyle(overlayColor, baseAlpha * WAVE_INNER_BAND_ALPHA_FACTOR);
  fillQuad(graphics, getQuadBand(quad, 0.18, 0.86));

  graphics.fillStyle(overlayColor, baseAlpha * WAVE_OUTER_BAND_ALPHA_FACTOR);
  fillQuad(graphics, getQuadBand(quad, 0, 0.16));

  graphics.fillStyle(overlayColor, baseAlpha * WAVE_OUTER_BAND_ALPHA_FACTOR);
  fillQuad(graphics, getQuadBand(quad, 0.88, 1));
}

function lerpPoint(a, b, t) {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

function normalizeAngleDiff(diff) {
  return diff - Math.PI * 2 * Math.round(diff / (Math.PI * 2));
}

function amplifiedAlpha(alpha, cap = 1) {
  return clamp(alpha * LAMP_BRIGHTNESS_MULTIPLIER, 0, cap);
}

function getTrackCoverage(angle, tubeRotation, curveAngle) {
  // Пользовательский запрос: убрать «бегущую» светлую полосу в трубе.
  // Возвращаем 0, чтобы отключить динамическое высветление дорожек
  // и сделать затемнение по окружности равномерным.
  void angle;
  void tubeRotation;
  void curveAngle;
  return 0;
}

class TunnelRenderer {
  constructor(scene) {
    this.scene = scene;
    this.baseGraphics = null;
    this.lightGraphics = null;
    this.fogGraphics = null;
    this.fxGraphics = null;
    this.flashGraphics = null;
    this.snapshot = null;
    this.tileSprites = [];
    this.tileMaskEntries = [];
  }

  create() {
    this.baseGraphics = this.scene.add.graphics().setDepth(1);
    this.lightGraphics = this.scene.add.graphics().setDepth(2);
    this.fogGraphics = this.scene.add.graphics().setDepth(3);
    this.fxGraphics = this.scene.add.graphics().setDepth(4);
    this.flashGraphics = this.scene.add.graphics().setDepth(5);

    this.applySnapshot(this.snapshot);
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    if (!this.baseGraphics || !this.lightGraphics) {
      return;
    }

    this.drawTunnel();
    this.drawOverlay();
  }

  resize() {
    this.applySnapshot(this.snapshot);
  }

  destroy() {
    this.baseGraphics?.destroy();
    this.lightGraphics?.destroy();
    this.fogGraphics?.destroy();
    this.fxGraphics?.destroy();
    this.flashGraphics?.destroy();
    this.baseGraphics = null;
    this.lightGraphics = null;
    this.fogGraphics = null;
    this.fxGraphics = null;
    this.flashGraphics = null;
    for (const sprite of this.tileSprites) {
      sprite.destroy();
    }
    this.tileSprites = [];
    for (const maskEntry of this.tileMaskEntries) {
      maskEntry.mask.destroy();
      maskEntry.graphics.destroy();
    }
    this.tileMaskEntries = [];
  }

  drawMouthRing(centerX, centerY, tube) {
    const rimColor = 0xaedcff;
    const outerRadius = CONFIG.TUBE_RADIUS * 1.12;
    const innerRadius = CONFIG.TUBE_RADIUS;
    const centerShift = Math.hypot(tube.centerOffsetX || 0, tube.centerOffsetY || 0);
    const shiftBoost = clamp(centerShift / 120, 0, 0.22);

    this.lightGraphics.lineStyle(8, blendColor(0x1e2635, rimColor, 0.6), MOUTH_RING_ALPHA_MULTIPLIER);
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      outerRadius * 2,
      outerRadius * 2 * CONFIG.PLAYER_OFFSET,
    );

    this.lightGraphics.lineStyle(6, blendColor(rimColor, 0xffffff, 0.35), amplifiedAlpha((0.72 + shiftBoost) * MOUTH_RING_ALPHA_MULTIPLIER, 1));
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      innerRadius * 2,
      innerRadius * 2 * CONFIG.PLAYER_OFFSET,
    );

    this.lightGraphics.lineStyle(3, blendColor(rimColor, 0xffffff, 0.65), amplifiedAlpha((0.42 + shiftBoost) * MOUTH_RING_ALPHA_MULTIPLIER, 1));
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      innerRadius * 1.96,
      innerRadius * 1.96 * CONFIG.PLAYER_OFFSET,
    );
  }

  drawTunnel() {
    const snapshot = this.snapshot;
    const viewport = snapshot?.viewport;
    const tube = snapshot?.tube;

    this.baseGraphics.clear();
    this.lightGraphics.clear();
    this.fogGraphics?.clear();
    this.fxGraphics?.clear();
    this.flashGraphics?.clear();

    if (!viewport || !tube) {
      return;
    }

    const width = viewport.width || this.scene.scale.width;
    const height = viewport.height || this.scene.scale.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const qualityName = tube.quality || 'high';
    const quality = QUALITY_PRESETS[qualityName] || QUALITY_PRESETS.high;
    const segmentCount = CONFIG.TUBE_SEGMENTS;
    const maxDepth = CONFIG.TUBE_DEPTH_STEPS;
    const normalizedSpeed = clamp((tube.speed || CONFIG.SPEED_START || 1) / Math.max(0.0001, CONFIG.SPEED_START || 1), 0.2, 3);
    const scrollOffset = (tube.scroll || 0) * 0.035 * normalizedSpeed;
    const ringShift = Math.floor(scrollOffset);
    const ringPhase = scrollOffset - ringShift;
    const lampDepthSteps = Array.isArray(snapshot?.lamps)
      ? snapshot.lamps
        .map((lamp) => (Number.isFinite(lamp?.z) ? lamp.z / CONFIG.TUBE_Z_STEP : NaN))
        .filter((lampDepthStep) => Number.isFinite(lampDepthStep))
      : [];
    const lampPulseHalfWidth = Math.max(quality.depthStep * 1.5, 0.9);
    const depthEntries = [];

    for (let depth = 0; depth < maxDepth; depth += quality.depthStep) {
      let animatedDepth = depth - ringPhase;
      if (animatedDepth < 0) {
        animatedDepth += maxDepth;
      }

      let spawnBlend = 0;
      for (const lampDepthStep of lampDepthSteps) {
        const lampDistance = Math.abs(animatedDepth - lampDepthStep);
        const lampBlend = 1 - clamp(lampDistance / lampPulseHalfWidth, 0, 1);
        if (lampBlend > spawnBlend) {
          spawnBlend = lampBlend;
        }
      }

      depthEntries.push({ animatedDepth, spawnBlend });
    }

    depthEntries.sort((a, b) => b.animatedDepth - a.animatedDepth);

    const spawnedRingOverlays = [];
    const trackSlatOverlays = [];
    this.hideUnusedTileSprites(0);
    if (Array.isArray(snapshot?.tubeTiles) && snapshot.tubeTiles.length > 0) {
      this.drawDynamicTileGrid(centerX, centerY, tube, quality, snapshot.tubeTiles);
      this.drawMouthRing(centerX, centerY, tube);
      return;
    }

    for (const depthEntry of depthEntries) {
      const { animatedDepth, spawnBlend } = depthEntry;
      const z1 = animatedDepth * CONFIG.TUBE_Z_STEP;
      const z2 = (animatedDepth + quality.depthStep) * CONFIG.TUBE_Z_STEP;
      const scale1 = 1 - z1;
      const scale2 = 1 - z2;
      if (scale2 <= 0) continue;

      const innerRadius = CONFIG.TUBE_RADIUS * INNER_RADIUS_RATIO;
      const radius1 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale1);
      const radius2 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale2);
      const bend1 = 1 - scale1;
      const bend2 = 1 - scale2;
      const wrappedDepth = ((animatedDepth % maxDepth) + maxDepth) % maxDepth;
      const depthRatio = 1 - wrappedDepth / maxDepth;
      const wallColor = blendColor(0x080a14, 0x294266, depthRatio * 0.7);
      for (let i = 0; i < segmentCount; i += quality.segmentStep) {
        const boundaryA =
          (i / segmentCount) * Math.PI * 2 + tube.rotation + tube.curveAngle;
        const boundaryB =
          (((i + quality.segmentStep) % segmentCount) / segmentCount) *
            Math.PI *
            2 +
          tube.rotation +
          tube.curveAngle;
        const segmentMidAngle = (boundaryA + boundaryB) * 0.5;
        const trackCoverage = getTrackCoverage(segmentMidAngle, tube.rotation, tube.curveAngle);

        const x1 =
          centerX +
          Math.sin(boundaryA) * radius1 +
          (tube.centerOffsetX || 0) * bend1;
        const y1 =
          centerY +
          Math.cos(boundaryA) * radius1 * CONFIG.PLAYER_OFFSET +
          (tube.centerOffsetY || 0) * bend1;
        const x2 =
          centerX +
          Math.sin(boundaryB) * radius1 +
          (tube.centerOffsetX || 0) * bend1;
        const y2 =
          centerY +
          Math.cos(boundaryB) * radius1 * CONFIG.PLAYER_OFFSET +
          (tube.centerOffsetY || 0) * bend1;
        const x3 =
          centerX +
          Math.sin(boundaryB) * radius2 +
          (tube.centerOffsetX || 0) * bend2;
        const y3 =
          centerY +
          Math.cos(boundaryB) * radius2 * CONFIG.PLAYER_OFFSET +
          (tube.centerOffsetY || 0) * bend2;
        const x4 =
          centerX +
          Math.sin(boundaryA) * radius2 +
          (tube.centerOffsetX || 0) * bend2;
        const y4 =
          centerY +
          Math.cos(boundaryA) * radius2 * CONFIG.PLAYER_OFFSET +
          (tube.centerOffsetY || 0) * bend2;

        const tileFillAlpha = clamp(quality.segmentAlpha * spawnBlend, 0.2, 1);
        const trackWallColor = blendColor(wallColor, 0x7aa3cf, 0.32 * trackCoverage);
        this.baseGraphics.fillStyle(trackWallColor, tileFillAlpha);
        drawQuadPath(this.baseGraphics, x1, y1, x2, y2, x3, y3, x4, y4);
        this.baseGraphics.fillPath();

        if (trackCoverage > 0) {
          const treadPhase = ((animatedDepth + scrollOffset * 0.7) % TRACK_SLAT_PERIOD + TRACK_SLAT_PERIOD) % TRACK_SLAT_PERIOD;
          const slatVisibility = 1 - clamp((treadPhase - TRACK_SLAT_LENGTH) / TRACK_SLAT_SOFTNESS, 0, 1);
          if (slatVisibility > 0) {
            trackSlatOverlays.push({
              x1,
              y1,
              x2,
              y2,
              x3,
              y3,
              x4,
              y4,
              depthRatio,
              trackCoverage,
              slatVisibility,
              spawnBlend,
            });
          }
        }

        if (spawnBlend > 0.01) {
          spawnedRingOverlays.push({
            x1,
            y1,
            x2,
            y2,
            x3,
            y3,
            x4,
            y4,
            depthRatio,
            spawnBlend,
            tileFillAlpha,
          });
        }
      }
    }

    for (const slat of trackSlatOverlays) {
      const slatColor = blendColor(0x66a3ff, 0xffffff, slat.depthRatio * 0.5);
      const slatAlpha = amplifiedAlpha(clamp(
        (0.14 + slat.depthRatio * 0.2) *
          slat.trackCoverage *
          slat.slatVisibility *
          slat.spawnBlend *
          TRACK_SLAT_ALPHA_MULTIPLIER,
        0,
        0.38,
      ));
      this.lightGraphics.fillStyle(slatColor, slatAlpha);
      drawQuadPath(
        this.lightGraphics,
        slat.x1,
        slat.y1,
        slat.x2,
        slat.y2,
        slat.x3,
        slat.y3,
        slat.x4,
        slat.y4,
      );
      this.lightGraphics.fillPath();
    }

    for (const overlay of spawnedRingOverlays) {
      drawSoftWaveOverlay(this.lightGraphics, overlay, 0.24, 1);
    }

    this.drawMouthRing(centerX, centerY, tube);
  }

  drawDynamicTileGrid(centerX, centerY, tube, quality, tubeTiles) {
    const sortedTiles = tubeTiles
      .filter((tile) => Number.isFinite(tile.z) && Number.isFinite(tile.angle))
      .sort((a, b) => b.z - a.z);
    const lampDepthSteps = Array.isArray(this.snapshot?.lamps)
      ? this.snapshot.lamps
        .map((lamp) => (Number.isFinite(lamp?.z) ? lamp.z / CONFIG.TUBE_Z_STEP : NaN))
        .filter((lampDepthStep) => Number.isFinite(lampDepthStep))
      : [];
    const lampPulseHalfWidth = Math.max(quality.depthStep * 1.5, 0.9);
    const spawnedRingOverlays = [];
    let usedSprites = 0;

    for (const tile of sortedTiles) {
      const z1 = tile.z;
      const z2 = z1 + (tile.depth || 0.06);
      const scale1 = 1 - z1;
      const scale2 = 1 - z2;
      if (scale2 <= 0 || z1 < -0.2 || z1 > 2.1) continue;

      const innerRadius = CONFIG.TUBE_RADIUS * INNER_RADIUS_RATIO;
      const radius1 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale1);
      const radius2 = Math.max(innerRadius, CONFIG.TUBE_RADIUS * scale2);
      const bend1 = 1 - scale1;
      const bend2 = 1 - scale2;
      const baseAngleA = tile.angle + tube.rotation + tube.curveAngle;
      const baseAngleWidth = tile.angleWidth || ((Math.PI * 2) / Math.max(8, CONFIG.TUBE_SEGMENTS));
      const nearHalfAngleWidth = baseAngleWidth * 0.5;
      const farHalfAngleWidth = nearHalfAngleWidth * TILE_TOP_WIDTH_MULTIPLIER;
      const segmentCenterAngle = baseAngleA + nearHalfAngleWidth;
      const angleA = segmentCenterAngle - nearHalfAngleWidth;
      const angleB = segmentCenterAngle + nearHalfAngleWidth;
      const angleFarA = segmentCenterAngle - farHalfAngleWidth;
      const angleFarB = segmentCenterAngle + farHalfAngleWidth;
      const depthRatio = clamp(1 - z1 / 2, 0, 1);
      const tileDepthStep = z1 / CONFIG.TUBE_Z_STEP;
      let spawnBlend = 0;
      for (const lampDepthStep of lampDepthSteps) {
        const lampDistance = Math.abs(tileDepthStep - lampDepthStep);
        const lampBlend = 1 - clamp(lampDistance / lampPulseHalfWidth, 0, 1);
        if (lampBlend > spawnBlend) {
          spawnBlend = lampBlend;
        }
      }
      const segmentMidAngle = segmentCenterAngle;
      const trackCoverage = getTrackCoverage(segmentMidAngle, tube.rotation, tube.curveAngle);
      const wallColor = blendColor(0x02040b, 0x182a43, depthRatio * 0.5);
      const variantDepthBoost = tile.variant === 4 ? -0.02 : 0;
      const tileFillAlpha = clamp(quality.segmentAlpha + variantDepthBoost, 0.2, 1);
      const trackWallColor = blendColor(wallColor, 0x7aa3cf, 0.32 * trackCoverage);

      const x1 = centerX + Math.sin(angleA) * radius1 + (tube.centerOffsetX || 0) * bend1;
      const y1 = centerY + Math.cos(angleA) * radius1 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend1;
      const x2 = centerX + Math.sin(angleB) * radius1 + (tube.centerOffsetX || 0) * bend1;
      const y2 = centerY + Math.cos(angleB) * radius1 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend1;
      const x3 = centerX + Math.sin(angleFarB) * radius2 + (tube.centerOffsetX || 0) * bend2;
      const y3 = centerY + Math.cos(angleFarB) * radius2 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend2;
      const x4 = centerX + Math.sin(angleFarA) * radius2 + (tube.centerOffsetX || 0) * bend2;
      const y4 = centerY + Math.cos(angleFarA) * radius2 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend2;

      this.baseGraphics.fillStyle(trackWallColor, tileFillAlpha);
      drawQuadPath(this.baseGraphics, x1, y1, x2, y2, x3, y3, x4, y4);
      this.baseGraphics.fillPath();
      this.drawTileTextureVariant(
        {
          p1: { x: x1, y: y1 },
          p2: { x: x2, y: y2 },
          p3: { x: x3, y: y3 },
          p4: { x: x4, y: y4 },
        },
        tile.variant ?? 0,
        depthRatio,
        tile,
        usedSprites,
      );
      if (spawnBlend > 0.01) {
        spawnedRingOverlays.push({
          x1,
          y1,
          x2,
          y2,
          x3,
          y3,
          x4,
          y4,
          depthRatio,
          spawnBlend,
        });
      }
      usedSprites += 1;
    }

    for (const overlay of spawnedRingOverlays) {
      drawSoftWaveOverlay(this.lightGraphics, overlay, 0.3, 1.15);
    }
    this.hideUnusedTileSprites(usedSprites);
  }

  drawTileTextureVariant(quad, variant, depthRatio, tile, spriteIndex) {
    void depthRatio;
    const pTopMid = lerpPoint(quad.p1, quad.p2, 0.5);
    const pBottomMid = lerpPoint(quad.p4, quad.p3, 0.5);
    const pCenter = lerpPoint(pTopMid, pBottomMid, 0.5);
    const topWidth = Math.hypot(quad.p1.x - quad.p2.x, quad.p1.y - quad.p2.y);
    const bottomWidth = Math.hypot(quad.p4.x - quad.p3.x, quad.p4.y - quad.p3.y);
    const leftHeight = Math.hypot(quad.p1.x - quad.p4.x, quad.p1.y - quad.p4.y);
    const rightHeight = Math.hypot(quad.p2.x - quad.p3.x, quad.p2.y - quad.p3.y);
    const tileWidth = Math.max(topWidth, bottomWidth);
    const tileHeight = Math.max(leftHeight, rightHeight);
    const tileAngle = Math.atan2(quad.p2.y - quad.p1.y, quad.p2.x - quad.p1.x);
    void tile;
    const frameIndex = Number.isFinite(variant) ? Math.abs(Math.trunc(variant)) % TUNNEL_TILE_FRAME_COUNT : 0;
    const frameName = `tile_${String(frameIndex).padStart(2, '0')}`;
    const textureSprite = this.acquireTileSprite(spriteIndex);
    const tileMaskEntry = this.acquireTileMaskEntry(spriteIndex);

    const maskGraphics = tileMaskEntry.graphics;
    maskGraphics.clear();
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.beginPath();
    maskGraphics.moveTo(quad.p1.x, quad.p1.y);
    maskGraphics.lineTo(quad.p2.x, quad.p2.y);
    maskGraphics.lineTo(quad.p3.x, quad.p3.y);
    maskGraphics.lineTo(quad.p4.x, quad.p4.y);
    maskGraphics.closePath();
    maskGraphics.fillPath();

    textureSprite
      .setPosition(pCenter.x, pCenter.y)
      .setFrame(frameName)
      .setDisplaySize(Math.max(2, tileWidth + TILE_OVERDRAW_PX), Math.max(2, tileHeight + TILE_OVERDRAW_PX))
      .setRotation(tileAngle)
      .setFlipX(false)
      .setFlipY(false)
      .setAlpha(1)
      .setMask(tileMaskEntry.mask)
      .setVisible(true);
  }

  acquireTileSprite(index) {
    if (!this.tileSprites[index]) {
      const sprite = this.scene.add.image(0, 0, TUNNEL_TILE_TEXTURE_KEY);
      sprite.setDepth(1.5);
      sprite.setOrigin(0.5, 0.5);
      sprite.setVisible(false);
      this.tileSprites[index] = sprite;
    }
    return this.tileSprites[index];
  }

  acquireTileMaskEntry(index) {
    if (!this.tileMaskEntries[index]) {
      const graphics = this.scene.make.graphics({ x: 0, y: 0, add: true });
      graphics.setVisible(false);
      const mask = graphics.createGeometryMask();
      this.tileMaskEntries[index] = { graphics, mask };
    }
    return this.tileMaskEntries[index];
  }

  hideUnusedTileSprites(startIndex) {
    for (let i = startIndex; i < this.tileSprites.length; i += 1) {
      // Keep GeometryMask instances alive between frames.
      // Destroying them here leaves stale mask references that can cause
      // GeometryMask.applyStencil to hit a null geometry and crash in WebGL.
      this.tileSprites[i].clearMask(false);
      this.tileSprites[i].setVisible(false);
      if (this.tileMaskEntries[i]) {
        this.tileMaskEntries[i].graphics.clear();
      }
    }
  }

  drawOverlay() {
    // Временно отключены все оверлеи/FX, оставлена только геометрия трубы и окантовка.
  }
}

export { TunnelRenderer };
