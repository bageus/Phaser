function createTunnelSceneClass(Phaser) {
  return class PhaserTunnelScene extends Phaser.Scene {
    constructor() {
      super({ key: 'TunnelScene' });
      this.lastSnapshot = null;
    }

    preload() {
      this.load.image('ring_emissive', '/img/ring_emissive.webp');
      this.load.image('tunnel_tile', '/img/tunnel_tile.webp');
      this.load.image('metal_ring', '/img/metal_ring.webp');
      this.load.image('tunnel_gradient', '/img/tunnel_gradient.webp');

      this.load.image('core_void', '/img/generated/core_void.svg');
      this.load.image('core_glow', '/img/generated/core_glow.svg');
      this.load.image('light_streak_1', '/img/generated/light_streak_1.svg');
      this.load.image('light_streak_2', '/img/generated/light_streak_2.svg');
      this.load.image('dust_particle', '/img/generated/dust_particle.svg');
      this.load.image('lens_dirt', '/img/generated/lens_dirt.svg');
      this.load.image('rim_scratch', '/img/generated/rim_scratch.svg');
    }

    create() {
      const { width, height } = this.scale;
      const cx = width * 0.5;
      const cy = height * 0.5;
      const tubeRadius = Math.min(width, height) * 0.38;

      this.layerBg = this.add.layer();
      this.layerDepth = this.add.layer();
      this.layerGrid = this.add.layer();
      this.layerLightRings = this.add.layer();
      this.layerGlow = this.add.layer();
      this.layerCharacter = this.add.layer();
      this.layerFx = this.add.layer();
      this.layerDebug = this.add.layer();

      this.innerGradient = this.add.image(cx, cy, 'tunnel_gradient').setDisplaySize(width, height).setAlpha(0.84);
      this.layerBg.add(this.innerGradient);

      this.tileA = this.add.tileSprite(cx, cy, tubeRadius * 2.3, tubeRadius * 2.3, 'tunnel_tile').setAlpha(0.42).setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.tileB = this.add.tileSprite(cx, cy, tubeRadius * 2, tubeRadius * 2, 'tunnel_tile').setAlpha(0.28);
      this.layerDepth.add([this.tileA, this.tileB]);

      this.coreVoid = this.add.image(cx, cy, 'core_void').setDisplaySize(tubeRadius * 1.2, tubeRadius * 1.2).setAlpha(0.88);
      this.coreGlow = this.add.image(cx, cy, 'core_glow').setDisplaySize(tubeRadius * 1.1, tubeRadius * 1.1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.75);
      this.layerGlow.add([this.coreVoid, this.coreGlow]);

      this.outerRing = this.add.image(cx, cy, 'metal_ring').setDisplaySize(tubeRadius * 2.5, tubeRadius * 2.5);
      this.emissiveRing = this.add.image(cx, cy, 'ring_emissive').setDisplaySize(tubeRadius * 2.5, tubeRadius * 2.5).setBlendMode(Phaser.BlendModes.ADD);
      this.layerLightRings.add([this.outerRing, this.emissiveRing]);

      this.streaks = [
        this.add.image(cx, cy, 'light_streak_1').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.25),
        this.add.image(cx, cy, 'light_streak_2').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2)
      ];
      this.layerFx.add(this.streaks);

      this.lensDirt = this.add.image(cx, cy, 'lens_dirt').setDisplaySize(width, height).setAlpha(0.28).setBlendMode(Phaser.BlendModes.SCREEN);
      this.rimScratch = this.add.image(cx, cy, 'rim_scratch').setDisplaySize(tubeRadius * 2.5, tubeRadius * 2.5).setAlpha(0.2);
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
