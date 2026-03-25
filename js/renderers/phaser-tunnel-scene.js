const BASE_URL = import.meta.env.BASE_URL || '/';

function resolveAssetPath(relativePath) {
  return new URL(relativePath, window.location.origin + BASE_URL).toString();
}

function createTunnelSceneClass(Phaser) {
  return class PhaserTunnelScene extends Phaser.Scene {
    constructor() {
      super({ key: 'TunnelScene' });
      this.lastSnapshot = null;
    }

    preload() {
      this.load.image('ring_emissive', resolveAssetPath('img/ring_emissive.webp'));
      this.load.image('tunnel_tile', resolveAssetPath('img/tunnel_tile.webp'));
      this.load.image('metal_ring', resolveAssetPath('img/metal_ring.webp'));
      this.load.image('tunnel_gradient', resolveAssetPath('img/tunnel_gradient.webp'));

      this.load.image('core_void', resolveAssetPath('img/generated/core_void.svg'));
      this.load.image('core_glow', resolveAssetPath('img/generated/core_glow.svg'));
      this.load.image('light_streak_1', resolveAssetPath('img/generated/light_streak_1.svg'));
      this.load.image('light_streak_2', resolveAssetPath('img/generated/light_streak_2.svg'));
      this.load.image('dust_particle', resolveAssetPath('img/generated/dust_particle.svg'));
      this.load.image('lens_dirt', resolveAssetPath('img/generated/lens_dirt.svg'));
      this.load.image('rim_scratch', resolveAssetPath('img/generated/rim_scratch.svg'));
    }

    createFallbackTextures() {
      const tileSize = 128;
      if (!this.textures.exists('tunnel_tile_fallback')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x291d42, 1);
        g.fillRect(0, 0, tileSize, tileSize);
        g.lineStyle(2, 0x6f56b1, 0.4);
        for (let i = 0; i <= tileSize; i += 16) {
          g.lineBetween(i, 0, i, tileSize);
          g.lineBetween(0, i, tileSize, i);
        }
        g.generateTexture('tunnel_tile_fallback', tileSize, tileSize);
        g.destroy();
      }

      if (!this.textures.exists('tunnel_gradient_fallback')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x120d21, 1);
        g.fillRect(0, 0, tileSize, tileSize);
        g.fillStyle(0x2d2055, 0.55);
        g.fillCircle(tileSize / 2, tileSize / 2, tileSize * 0.44);
        g.fillStyle(0x0a0616, 0.95);
        g.fillCircle(tileSize / 2, tileSize / 2, tileSize * 0.18);
        g.generateTexture('tunnel_gradient_fallback', tileSize, tileSize);
        g.destroy();
      }

      if (!this.textures.exists('ring_emissive_fallback')) {
        const ringSize = 320;
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.lineStyle(14, 0x8b5cf6, 0.7);
        g.strokeCircle(ringSize / 2, ringSize / 2, ringSize * 0.42);
        g.lineStyle(6, 0x60a5fa, 0.6);
        g.strokeCircle(ringSize / 2, ringSize / 2, ringSize * 0.37);
        g.generateTexture('ring_emissive_fallback', ringSize, ringSize);
        g.destroy();
      }

      if (!this.textures.exists('metal_ring_fallback')) {
        const ringSize = 320;
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.lineStyle(20, 0x4d4d65, 0.9);
        g.strokeCircle(ringSize / 2, ringSize / 2, ringSize * 0.42);
        g.lineStyle(6, 0xa8a8c2, 0.5);
        g.strokeCircle(ringSize / 2, ringSize / 2, ringSize * 0.38);
        g.generateTexture('metal_ring_fallback', ringSize, ringSize);
        g.destroy();
      }

      if (!this.textures.exists('soft_disc_fallback')) {
        const size = 192;
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x100a1d, 0.95);
        g.fillCircle(size / 2, size / 2, size * 0.42);
        g.fillStyle(0x7c5cff, 0.35);
        g.fillCircle(size / 2, size / 2, size * 0.28);
        g.generateTexture('soft_disc_fallback', size, size);
        g.destroy();
      }
    }

    pickTexture(primary, fallback) {
      const texture = this.textures.get(primary);
      const isMissing = !texture || texture.key === '__MISSING';
      if (!isMissing) return primary;
      return fallback;
    }

    create() {
      this.createFallbackTextures();

      const { width, height } = this.scale;
      const cx = width * 0.5;
      const cy = height * 0.5;
      const tubeRadius = Math.min(width, height) * 0.38;

      const tunnelTileKey = this.pickTexture('tunnel_tile', 'tunnel_tile_fallback');
      const tunnelGradientKey = this.pickTexture('tunnel_gradient', 'tunnel_gradient_fallback');
      const metalRingKey = this.pickTexture('metal_ring', 'metal_ring_fallback');
      const emissiveRingKey = this.pickTexture('ring_emissive', 'ring_emissive_fallback');
      const coreVoidKey = this.pickTexture('core_void', 'soft_disc_fallback');
      const coreGlowKey = this.pickTexture('core_glow', 'soft_disc_fallback');
      const streak1Key = this.pickTexture('light_streak_1', 'ring_emissive_fallback');
      const streak2Key = this.pickTexture('light_streak_2', 'ring_emissive_fallback');
      const lensDirtKey = this.pickTexture('lens_dirt', 'tunnel_gradient_fallback');
      const rimScratchKey = this.pickTexture('rim_scratch', 'metal_ring_fallback');

      this.layerBg = this.add.layer();
      this.layerDepth = this.add.layer();
      this.layerGrid = this.add.layer();
      this.layerLightRings = this.add.layer();
      this.layerGlow = this.add.layer();
      this.layerCharacter = this.add.layer();
      this.layerFx = this.add.layer();
      this.layerDebug = this.add.layer();

      this.innerGradient = this.add.image(cx, cy, tunnelGradientKey).setDisplaySize(width, height).setAlpha(0.84);
      this.layerBg.add(this.innerGradient);

      this.tileA = this.add.tileSprite(cx, cy, tubeRadius * 2.3, tubeRadius * 2.3, tunnelTileKey).setAlpha(0.42).setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.tileB = this.add.tileSprite(cx, cy, tubeRadius * 2, tubeRadius * 2, tunnelTileKey).setAlpha(0.28);
      this.layerDepth.add([this.tileA, this.tileB]);

      this.coreVoid = this.add.image(cx, cy, coreVoidKey).setDisplaySize(tubeRadius * 1.2, tubeRadius * 1.2).setAlpha(0.88);
      this.coreGlow = this.add.image(cx, cy, coreGlowKey).setDisplaySize(tubeRadius * 1.1, tubeRadius * 1.1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.75);
      this.layerGlow.add([this.coreVoid, this.coreGlow]);

      this.outerRing = this.add.image(cx, cy, metalRingKey).setDisplaySize(tubeRadius * 2.5, tubeRadius * 2.5);
      this.emissiveRing = this.add.image(cx, cy, emissiveRingKey).setDisplaySize(tubeRadius * 2.5, tubeRadius * 2.5).setBlendMode(Phaser.BlendModes.ADD);
      this.layerLightRings.add([this.outerRing, this.emissiveRing]);

      this.streaks = [
        this.add.image(cx, cy, streak1Key).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25),
        this.add.image(cx, cy, streak2Key).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2)
      ];
      this.layerFx.add(this.streaks);

      this.lensDirt = this.add.image(cx, cy, lensDirtKey).setDisplaySize(width, height).setAlpha(0.28).setBlendMode(Phaser.BlendModes.SCREEN);
      this.rimScratch = this.add.image(cx, cy, rimScratchKey).setDisplaySize(tubeRadius * 2.5, tubeRadius * 2.5).setAlpha(0.2);
      this.layerFx.add([this.lensDirt, this.rimScratch]);
    }

    applySnapshot(snapshot) {
      this.lastSnapshot = snapshot;
    }

    update(time) {
      if (!this.lastSnapshot) return;

      const { tube, viewport } = this.lastSnapshot;
      const speedPulse = 0.8 + Math.sin(time * 0.004) * 0.2;
      const scroll = tube.scroll || 0;

      const cx = viewport.centerX + (tube.centerOffsetX || 0);
      const cy = viewport.centerY + (tube.centerOffsetY || 0);

      this.innerGradient.setPosition(cx, cy);
      this.tileA.setPosition(cx, cy);
      this.tileB.setPosition(cx, cy);
      this.coreVoid.setPosition(cx, cy);
      this.coreGlow.setPosition(cx, cy);
      this.outerRing.setPosition(cx, cy);
      this.emissiveRing.setPosition(cx, cy);

      this.tileA.tilePositionY = scroll * 900;
      this.tileA.tilePositionX = tube.rotation * 180;
      this.tileB.tilePositionY = scroll * -650;

      this.outerRing.rotation = tube.rotation;
      this.emissiveRing.rotation = tube.rotation * 1.2;
      this.emissiveRing.alpha = 0.6 + speedPulse * 0.3;

      this.coreGlow.rotation += 0.002;
      this.coreGlow.alpha = 0.45 + speedPulse * 0.28;
      this.coreVoid.scale = 1 + Math.sin(time * 0.002 + scroll * 10) * 0.03;

      this.streaks[0].rotation = tube.rotation * -0.3;
      this.streaks[1].rotation = tube.rotation * 0.45;
      this.streaks[0].setScale(1 + (tube.speed || 0) * 0.15);
      this.streaks[1].setScale(1 + (tube.speed || 0) * 0.1);
    }
  };
}

export { createTunnelSceneClass };
