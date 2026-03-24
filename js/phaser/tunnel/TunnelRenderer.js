import { CONFIG } from '../../config.js';

const INNER_RADIUS_RATIO = 0.15;
const LANE_ANGLE_STEP = 0.55;
const TRACK_LANE_CENTERS = Object.freeze([-1, 0, 1]);
const TRACK_BAND_HALF_WIDTH = 0.24;
const TRACK_EDGE_SOFTNESS = 0.12;
const TRACK_SLAT_PERIOD = 2.9;
const TRACK_SLAT_LENGTH = 0.82;
const TRACK_SLAT_SOFTNESS = 0.22;
const LAMP_BRIGHTNESS_MULTIPLIER = 10;
const NEON_PULSE_SPEED = 0.0008;
const NEON_PULSE_MIN = 0.25;
const NEON_PULSE_MAX = 0.85;
const NEON_PURPLE_BASE = 0x7a1cff;
const NEON_PURPLE_PEAK = 0xff4dff;
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

    this.lightGraphics.lineStyle(8, blendColor(0x1e2635, rimColor, 0.6), 1);
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      outerRadius * 2,
      outerRadius * 2 * CONFIG.PLAYER_OFFSET,
    );

    this.lightGraphics.lineStyle(6, blendColor(rimColor, 0xffffff, 0.35), amplifiedAlpha(0.72 + shiftBoost, 1));
    this.lightGraphics.strokeEllipse(
      centerX,
      centerY,
      innerRadius * 2,
      innerRadius * 2 * CONFIG.PLAYER_OFFSET,
    );

    this.lightGraphics.lineStyle(3, blendColor(rimColor, 0xffffff, 0.65), amplifiedAlpha(0.42 + shiftBoost, 1));
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
      // Ранее для "нового" кольца применялось плавное проявление через alpha.
      // На некоторых кадрах это создавало полностью тёмный пояс по периметру трубы.
      // Оставляем кольца равномерно непрозрачными, чтобы исключить артефакт.
      const spawnBlend = 1;

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
      const slatAlpha = amplifiedAlpha(clamp(
        (0.14 + slat.depthRatio * 0.2) *
          slat.trackCoverage *
          slat.slatVisibility *
          slat.spawnBlend,
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
      const overlayAlpha = amplifiedAlpha(clamp((0.18 + overlay.depthRatio * 0.2) * overlay.spawnBlend, 0, 0.34));
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
      const wallColor = blendColor(0x02040b, 0x182a43, depthRatio * 0.5);
      const variantDepthBoost = tile.variant === 4 ? -0.02 : 0;
      const tileFillAlpha = clamp(quality.segmentAlpha + variantDepthBoost, 0.2, 1);
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
      this.drawTileTextureVariant(
        {
          p1: { x: x1, y: y1 },
          p2: { x: x2, y: y2 },
          p3: { x: x3, y: y3 },
          p4: { x: x4, y: y4 },
        },
        tile.variant ?? 0,
        depthRatio,
      );
    }
  }

  drawTileTextureVariant(quad, variant, depthRatio) {
    const pTopMid = lerpPoint(quad.p1, quad.p2, 0.5);
    const pBottomMid = lerpPoint(quad.p4, quad.p3, 0.5);
    const pCenter = lerpPoint(pTopMid, pBottomMid, 0.5);
    const detailAlpha = amplifiedAlpha(clamp(0.08 + depthRatio * 0.18, 0.08, 0.24), 1);
    const tileWidth = Math.hypot(quad.p1.x - quad.p2.x, quad.p1.y - quad.p2.y);
    const tileHeight = Math.hypot(quad.p1.x - quad.p4.x, quad.p1.y - quad.p4.y);

    // Общий объём: мягкая подсветка сверху и затемнение снизу.
    const topGlowCenter = lerpPoint(pTopMid, pCenter, 0.32);
    const bottomShadeCenter = lerpPoint(pBottomMid, pCenter, 0.3);
    this.lightGraphics.fillStyle(blendColor(0x6f95bc, 0xd8ebff, depthRatio * 0.52), detailAlpha * 0.5);
    this.lightGraphics.fillEllipse(topGlowCenter.x, topGlowCenter.y, tileWidth * 0.58, tileHeight * 0.18);
    this.lightGraphics.fillStyle(blendColor(0x03060d, 0x112033, depthRatio * 0.45), detailAlpha * 0.52);
    this.lightGraphics.fillEllipse(bottomShadeCenter.x, bottomShadeCenter.y, tileWidth * 0.62, tileHeight * 0.24);

    switch (variant % 5) {
      case 0: {
        // Плитка с небольшим выступом и легкими бликами.
        const topBumpL = lerpPoint(quad.p1, quad.p2, 0.22);
        const topBumpR = lerpPoint(quad.p1, quad.p2, 0.45);
        const bottomBumpL = lerpPoint(quad.p4, quad.p3, 0.58);
        const bottomBumpR = lerpPoint(quad.p4, quad.p3, 0.82);
        const cornerBump = lerpPoint(quad.p2, quad.p3, 0.2);
        this.lightGraphics.fillStyle(blendColor(0x55769b, 0xcce3ff, depthRatio * 0.45), detailAlpha * 0.8);
        this.lightGraphics.fillCircle(topBumpL.x, topBumpL.y, 1.5);
        this.lightGraphics.fillCircle(topBumpR.x, topBumpR.y, 1.2);
        this.lightGraphics.fillCircle(bottomBumpL.x, bottomBumpL.y, 1.3);
        this.lightGraphics.fillCircle(bottomBumpR.x, bottomBumpR.y, 1.1);
        this.lightGraphics.fillCircle(cornerBump.x, cornerBump.y, 1.4);
        const glintA = lerpPoint(quad.p1, pCenter, 0.34);
        const glintB = lerpPoint(quad.p2, pCenter, 0.29);
        this.lightGraphics.fillStyle(blendColor(0xb7d5f3, 0xffffff, depthRatio * 0.35), detailAlpha * 0.42);
        this.lightGraphics.fillCircle(glintA.x, glintA.y, 0.95);
        this.lightGraphics.fillCircle(glintB.x, glintB.y, 0.7);
        break;
      }
      case 1: {
        // Плитка со сколом.
        const chipA = lerpPoint(quad.p2, quad.p3, 0.18);
        const chipB = lerpPoint(quad.p2, quad.p3, 0.33);
        const chipC = lerpPoint(quad.p2, quad.p1, 0.18);
        this.baseGraphics.fillStyle(0x020308, clamp(detailAlpha * 1.2, 0.09, 0.3));
        this.baseGraphics.beginPath();
        this.baseGraphics.moveTo(chipA.x, chipA.y);
        this.baseGraphics.lineTo(chipB.x, chipB.y);
        this.baseGraphics.lineTo(chipC.x, chipC.y);
        this.baseGraphics.closePath();
        this.baseGraphics.fillPath();
        break;
      }
      case 2: {
        // Плитка с шершавостью в центре.
        const gritColor = blendColor(0x1f2d3f, 0x6e8eaf, depthRatio * 0.45);
        this.lightGraphics.fillStyle(gritColor, detailAlpha * 0.5);
        this.lightGraphics.fillCircle(pCenter.x - 2, pCenter.y - 1, 0.9);
        this.lightGraphics.fillCircle(pCenter.x + 1, pCenter.y + 1.4, 0.8);
        this.lightGraphics.fillCircle(pCenter.x + 2.3, pCenter.y - 0.7, 0.7);
        this.lightGraphics.fillCircle(pCenter.x - 0.8, pCenter.y + 2, 0.65);
        break;
      }
      case 3: {
        // Плитка с более неровной трещиной и мелкими ответвлениями.
        const crackStart = lerpPoint(quad.p1, quad.p4, 0.25);
        const crackMidA = lerpPoint(pTopMid, pBottomMid, 0.38);
        const crackMidB = lerpPoint(pTopMid, pBottomMid, 0.62);
        const crackEnd = lerpPoint(quad.p2, quad.p3, 0.76);
        const branchA = lerpPoint(quad.p1, pCenter, 0.54);
        const branchB = lerpPoint(quad.p3, pCenter, 0.48);
        this.lightGraphics.lineStyle(1, blendColor(0x0b1624, 0x8fb2d3, depthRatio * 0.2), detailAlpha * 1.2);
        this.lightGraphics.beginPath();
        this.lightGraphics.moveTo(crackStart.x, crackStart.y);
        this.lightGraphics.lineTo(crackMidA.x - 1.6, crackMidA.y + 1.1);
        this.lightGraphics.lineTo(crackMidA.x + 1.1, crackMidA.y - 1.3);
        this.lightGraphics.lineTo(crackMidB.x - 0.9, crackMidB.y + 1.6);
        this.lightGraphics.lineTo(crackMidB.x + 1.2, crackMidB.y - 0.8);
        this.lightGraphics.lineTo(crackEnd.x, crackEnd.y);
        this.lightGraphics.moveTo(crackMidA.x - 0.2, crackMidA.y + 0.4);
        this.lightGraphics.lineTo(branchA.x - 0.6, branchA.y + 1.1);
        this.lightGraphics.moveTo(crackMidB.x + 0.3, crackMidB.y - 0.3);
        this.lightGraphics.lineTo(branchB.x + 0.7, branchB.y - 1.2);
        this.lightGraphics.strokePath();
        break;
      }
      case 4:
      default: {
        // Гладкая плитка: только мягкий центральный градиент без дефектов.
        this.lightGraphics.fillStyle(blendColor(0x101a28, 0x3f5d80, depthRatio * 0.5), detailAlpha * 0.3);
        this.lightGraphics.fillEllipse(pCenter.x, pCenter.y, tileWidth * 0.35, 3.2);
        const smoothGlint = lerpPoint(quad.p2, pCenter, 0.36);
        this.lightGraphics.fillStyle(blendColor(0x92b8db, 0xffffff, depthRatio * 0.25), detailAlpha * 0.32);
        this.lightGraphics.fillCircle(smoothGlint.x, smoothGlint.y, 0.8);
        break;
      }
    }

    // Легкая окантовка на каждой плитке для подчёркивания объема.
    this.lightGraphics.lineStyle(1, blendColor(0x172638, 0x8aaed4, depthRatio * 0.35), detailAlpha * 0.7);
    drawQuadPath(
      this.lightGraphics,
      quad.p1.x,
      quad.p1.y,
      quad.p2.x,
      quad.p2.y,
      quad.p3.x,
      quad.p3.y,
      quad.p4.x,
      quad.p4.y,
    );
    this.lightGraphics.strokePath();

    const pulseTime = this.scene?.time?.now ?? 0;
    const phaseSeed = (quad.p1.x + quad.p2.y + quad.p3.x + quad.p4.y) * 0.005;
    const pulseWave = Math.sin(pulseTime * NEON_PULSE_SPEED + phaseSeed) * 0.5 + 0.5;
    const neonAlpha = lerp(NEON_PULSE_MIN, NEON_PULSE_MAX, pulseWave);
    const neonColor = blendColor(NEON_PURPLE_BASE, NEON_PURPLE_PEAK, pulseWave);
    this.lightGraphics.lineStyle(2, neonColor, neonAlpha);
    drawQuadPath(
      this.lightGraphics,
      quad.p1.x,
      quad.p1.y,
      quad.p2.x,
      quad.p2.y,
      quad.p3.x,
      quad.p3.y,
      quad.p4.x,
      quad.p4.y,
    );
    this.lightGraphics.strokePath();
  }

  drawOverlay() {
    // Временно отключены все оверлеи/FX, оставлена только геометрия трубы и окантовка.
  }
}

export { TunnelRenderer };
