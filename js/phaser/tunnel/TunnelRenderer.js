import { CONFIG } from '../../config.js';

const INNER_RADIUS_RATIO = 0.15;
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
        this.baseGraphics.fillStyle(wallColor, tileFillAlpha);
        drawQuadPath(this.baseGraphics, x1, y1, x2, y2, x3, y3, x4, y4);
        this.baseGraphics.fillPath();

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

  drawOverlay() {
    // Временно отключены все оверлеи/FX, оставлена только геометрия трубы и окантовка.
  }
}

export { TunnelRenderer };
