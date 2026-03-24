import { CONFIG } from '../../config.js';

const INNER_RADIUS_RATIO = 0.15;
const LANE_ANGLE_STEP = 0.55;
const TRACK_LANE_CENTERS = Object.freeze([-1, 0, 1]);
const TRACK_BAND_HALF_WIDTH = 0.24;
const TRACK_EDGE_SOFTNESS = 0.12;
const TRACK_SLAT_PERIOD = 2.9;
const TRACK_SLAT_LENGTH = 0.82;
const TRACK_SLAT_SOFTNESS = 0.22;
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

function normalizeAngleDiff(diff) {
  return diff - Math.PI * 2 * Math.round(diff / (Math.PI * 2));
}

function getTrackCoverage(angle, tubeRotation, curveAngle) {
  const segmentAngle = angle - tubeRotation - curveAngle;
  let strongestCoverage = 0;

  for (const lane of TRACK_LANE_CENTERS) {
    const laneAngle = lane * LANE_ANGLE_STEP;
    const diff = Math.abs(normalizeAngleDiff(segmentAngle - laneAngle));
    if (diff > TRACK_BAND_HALF_WIDTH + TRACK_EDGE_SOFTNESS) {
      continue;
    }

    const localCoverage = 1 - clamp((diff - TRACK_BAND_HALF_WIDTH) / TRACK_EDGE_SOFTNESS, 0, 1);
    strongestCoverage = Math.max(strongestCoverage, localCoverage);
  }

  return strongestCoverage;
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
  }

  drawMouthRing(centerX, centerY, tube) {
    const rimColor = 0xaedcff;
    const outerRadius = CONFIG.TUBE_RADIUS * 1.12;
    const innerRadius = CONFIG.TUBE_RADIUS;
    const centerShift = Math.hypot(tube.centerOffsetX || 0, tube.centerOffsetY || 0);
    const shiftBoost = clamp(centerShift / 120, 0, 0.22);

    this.lightGraphics.lineStyle(4, blendColor(0x1e2635, rimColor, 0.45), 0.95);
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      outerRadius * 2,
      outerRadius * 2 * CONFIG.PLAYER_OFFSET,
    );

    this.lightGraphics.lineStyle(3, rimColor, 0.72 + shiftBoost);
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      innerRadius * 2,
      innerRadius * 2 * CONFIG.PLAYER_OFFSET,
    );

    this.lightGraphics.lineStyle(1, blendColor(rimColor, 0xffffff, 0.4), 0.42 + shiftBoost);
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
    const depthEntries = [];

    for (let depth = 0; depth < maxDepth; depth += quality.depthStep) {
      let animatedDepth = depth - ringPhase;
      let isSpawnedRing = false;
      if (animatedDepth < 0) {
        animatedDepth += maxDepth;
        isSpawnedRing = true;
      }

      depthEntries.push({ animatedDepth, isSpawnedRing });
    }

    depthEntries.sort((a, b) => b.animatedDepth - a.animatedDepth);

    const spawnedRingOverlays = [];
    const trackSlatOverlays = [];
    if (Array.isArray(snapshot?.tubeTiles) && snapshot.tubeTiles.length > 0) {
      this.drawDynamicTileGrid(centerX, centerY, tube, quality, snapshot.tubeTiles);
      this.drawMouthRing(centerX, centerY, tube);
      return;
    }

    for (const depthEntry of depthEntries) {
      const { animatedDepth, isSpawnedRing } = depthEntry;
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
      const spawnBlend = isSpawnedRing ? clamp(ringPhase / 0.35, 0, 1) : 1;

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

        if (isSpawnedRing) {
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
      const slatAlpha = clamp(
        (0.14 + slat.depthRatio * 0.2) *
          slat.trackCoverage *
          slat.slatVisibility *
          slat.spawnBlend,
        0,
        0.38,
      );
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
      const overlayAlpha = clamp((0.18 + overlay.depthRatio * 0.2) * overlay.spawnBlend, 0, 0.34);
      const overlayColor = blendColor(0x78b8ff, 0xffffff, overlay.depthRatio * 0.3);
      this.lightGraphics.fillStyle(overlayColor, overlayAlpha);
      drawQuadPath(
        this.lightGraphics,
        overlay.x1,
        overlay.y1,
        overlay.x2,
        overlay.y2,
        overlay.x3,
        overlay.y3,
        overlay.x4,
        overlay.y4,
      );
      this.lightGraphics.fillPath();

    }

    this.drawMouthRing(centerX, centerY, tube);
  }

  drawDynamicTileGrid(centerX, centerY, tube, quality, tubeTiles) {
    const sortedTiles = tubeTiles
      .filter((tile) => Number.isFinite(tile.z) && Number.isFinite(tile.angle))
      .sort((a, b) => b.z - a.z);

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
      const angleA = tile.angle + tube.rotation + tube.curveAngle;
      const angleB = angleA + (tile.angleWidth || ((Math.PI * 2) / Math.max(8, CONFIG.TUBE_SEGMENTS)));
      const depthRatio = clamp(1 - z1 / 2, 0, 1);
      const segmentMidAngle = (angleA + angleB) * 0.5;
      const trackCoverage = getTrackCoverage(segmentMidAngle, tube.rotation, tube.curveAngle);
      const wallColor = blendColor(0x080a14, 0x294266, depthRatio * 0.7);
      const variantGlow = tile.variant === 1 ? 0.03 : tile.variant === 2 ? 0.06 : 0;
      const tileFillAlpha = clamp(quality.segmentAlpha + variantGlow, 0.18, 1);
      const trackWallColor = blendColor(wallColor, 0x7aa3cf, 0.32 * trackCoverage);

      const x1 = centerX + Math.sin(angleA) * radius1 + (tube.centerOffsetX || 0) * bend1;
      const y1 = centerY + Math.cos(angleA) * radius1 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend1;
      const x2 = centerX + Math.sin(angleB) * radius1 + (tube.centerOffsetX || 0) * bend1;
      const y2 = centerY + Math.cos(angleB) * radius1 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend1;
      const x3 = centerX + Math.sin(angleB) * radius2 + (tube.centerOffsetX || 0) * bend2;
      const y3 = centerY + Math.cos(angleB) * radius2 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend2;
      const x4 = centerX + Math.sin(angleA) * radius2 + (tube.centerOffsetX || 0) * bend2;
      const y4 = centerY + Math.cos(angleA) * radius2 * CONFIG.PLAYER_OFFSET + (tube.centerOffsetY || 0) * bend2;

      this.baseGraphics.fillStyle(trackWallColor, tileFillAlpha);
      drawQuadPath(this.baseGraphics, x1, y1, x2, y2, x3, y3, x4, y4);
      this.baseGraphics.fillPath();
    }
  }

  drawOverlay() {
    // Временно отключены все оверлеи/FX, оставлена только геометрия трубы и окантовка.
  }
}

export { TunnelRenderer };
