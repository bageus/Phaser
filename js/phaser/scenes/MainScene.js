import { EntityRenderer } from '../entities/EntityRenderer.js';
import { TunnelRenderer } from '../tunnel/TunnelRenderer.js';
import { TunnelOuterRing } from '../tunnel/TunnelOuterRing.js';
import { CONFIG } from '../../config.js';

const MAIN_SCENE_KEY = 'MainScene';
const TUNNEL_TILE_TEXTURE_KEY = 'tunnel_tile_texture';
const TUNNEL_TILE_TEXTURE_PATH = 'img/sci_fi_tileset_16_256.webp';
const TUNNEL_TILE_TEXTURE_ATLAS_PATH = 'img/sci_fi_tileset_16_256_atlas.json';
const LIGHT_WAVE_SHADER_KEY = 'LightWaveShader';

const LIGHT_WAVE_VERTEX_SHADER = `
precision mediump float;

attribute vec2 inPosition;
attribute vec2 inTexCoord;

uniform mat4 uProjectionMatrix;

void main(void) {
  gl_Position = uProjectionMatrix * vec4(inPosition, 0.0, 1.0);
}
`;

const LIGHT_WAVE_FRAGMENT_SHADER = `
precision mediump float;

uniform float time;
uniform vec2 resolution;
uniform vec2 lampDepths;

void main(void) {
  vec2 uv = gl_FragCoord.xy / max(resolution.xy, vec2(1.0));
  vec2 centered = uv - vec2(0.5);
  centered.x *= resolution.x / max(resolution.y, 1.0);

  float radial = length(centered);
  float waveA = sin(uv.y * 34.0 - time * 2.3 + centered.x * 8.5);
  float waveB = sin(uv.y * 58.0 + time * 3.4 - centered.x * 12.0);
  float wave = 0.5 + 0.5 * (waveA * 0.65 + waveB * 0.35);

  float tubeCore = smoothstep(0.49, 0.02, radial);
  float tubeOuterFade = smoothstep(0.80, 0.58, radial);
  float tubeMask = tubeCore * tubeOuterFade;

  float radialNear = 0.48;
  float radialFar = 0.08;
  float lampDepth0 = clamp((lampDepths.x - 0.2) / 1.8, 0.0, 1.0);
  float lampDepth1 = clamp((lampDepths.y - 0.2) / 1.8, 0.0, 1.0);
  float lampBand0 = 1.0 - smoothstep(0.0, 0.08, abs(radial - mix(radialNear, radialFar, lampDepth0)));
  float lampBand1 = 1.0 - smoothstep(0.0, 0.08, abs(radial - mix(radialNear, radialFar, lampDepth1)));
  float lampPulse = max(lampBand0, lampBand1);
  float intensity = wave * tubeMask * (0.38 + lampPulse * 0.92);

  vec3 baseColor = vec3(0.08, 0.33, 0.82);
  vec3 highlightColor = vec3(0.64, 0.93, 1.0);
  vec3 color = mix(baseColor, highlightColor, clamp(wave * 0.8 + lampPulse * 0.6, 0.0, 1.0));
  float alpha = intensity * 0.24;

  gl_FragColor = vec4(color * intensity, alpha);
}
`;

class MainSceneController {
  constructor(scene, Phaser) {
    this.Phaser = Phaser;
    this.scene = scene;
    this.snapshot = null;
    this.background = null;
    this.tunnelRenderer = null;
    this.entityRenderer = null;
    this.tunnelOuterRing = null;
    this.lightWaveShader = null;
    this.waveStartTime = 0;
    this.handleResize = this.handleResize.bind(this);
    this.handleUpdate = this.handleUpdate.bind(this);
  }

  init(data) {
    this.snapshot = data?.snapshot || null;
  }

  preload() {
    EntityRenderer.preload(this.scene);
    TunnelOuterRing.preload(this.scene);
    if (!this.scene.textures.exists(TUNNEL_TILE_TEXTURE_KEY)) {
      this.scene.load.atlas(TUNNEL_TILE_TEXTURE_KEY, TUNNEL_TILE_TEXTURE_PATH, TUNNEL_TILE_TEXTURE_ATLAS_PATH);
    }
  }

  create() {
    const { width, height } = this.scene.scale;
    this.background = this.scene.add.rectangle(0, 0, width, height, 0x050816).setOrigin(0, 0);

    const lightWaveBaseShader = new this.Phaser.Display.BaseShader(
      LIGHT_WAVE_SHADER_KEY,
      LIGHT_WAVE_FRAGMENT_SHADER,
      LIGHT_WAVE_VERTEX_SHADER
    );

    this.lightWaveShader = this.scene.add
      .shader(lightWaveBaseShader, 0, 0, width, height)
      .setOrigin(0, 0)
      .setDepth(6)
      .setBlendMode('ADD');
    this.lightWaveShader.setUniform('resolution.value.x', width);
    this.lightWaveShader.setUniform('resolution.value.y', height);
    this.lightWaveShader.setUniform('lampDepths.value.x', 2);
    this.lightWaveShader.setUniform('lampDepths.value.y', 2);

    this.waveStartTime = this.scene.time.now;

    this.tunnelRenderer = new TunnelRenderer(this.scene);
    this.tunnelRenderer.create();
    this.tunnelOuterRing = new TunnelOuterRing(this.scene).fitToTube(CONFIG.TUBE_RADIUS, CONFIG.PLAYER_OFFSET);
    this.entityRenderer = new EntityRenderer(this.scene);
    this.entityRenderer.create();
    this.tunnelRenderer.applySnapshot(this.snapshot);
    this.entityRenderer.applySnapshot(this.snapshot);
    this.scene.scale.on('resize', this.handleResize);
    this.scene.events.on('update', this.handleUpdate);
  }

  handleResize(gameSize) {
    this.background?.setSize(gameSize.width, gameSize.height);
    this.lightWaveShader?.setSize(gameSize.width, gameSize.height);
    this.lightWaveShader?.setUniform('resolution.value.x', gameSize.width);
    this.lightWaveShader?.setUniform('resolution.value.y', gameSize.height);
    this.tunnelOuterRing?.resize(gameSize.width, gameSize.height);
    this.tunnelRenderer?.resize();
  }

  handleUpdate() {
    if (this.lightWaveShader) {
      const elapsedSeconds = (this.scene.time.now - this.waveStartTime) / 1000;
      this.lightWaveShader.setUniform('time.value', elapsedSeconds);
      const lamps = Array.isArray(this.snapshot?.lamps) ? this.snapshot.lamps : [];
      const lampDepthA = Number.isFinite(lamps[0]?.z) ? lamps[0].z : 2;
      const lampDepthB = Number.isFinite(lamps[1]?.z) ? lamps[1].z : lampDepthA;
      this.lightWaveShader.setUniform('lampDepths.value.x', lampDepthA);
      this.lightWaveShader.setUniform('lampDepths.value.y', lampDepthB);
    }
    this.tunnelOuterRing?.update();
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    this.tunnelRenderer?.applySnapshot(this.snapshot);
    this.entityRenderer?.applySnapshot(this.snapshot);
  }

  destroy() {
    this.scene.scale.off('resize', this.handleResize);
    this.scene.events.off('update', this.handleUpdate);
    this.lightWaveShader?.destroy();
    this.tunnelOuterRing?.destroy();
    this.tunnelRenderer?.destroy();
    this.entityRenderer?.destroy();
    this.lightWaveShader = null;
    this.tunnelOuterRing = null;
    this.tunnelRenderer = null;
    this.entityRenderer = null;
  }
}

function createMainSceneClass(Phaser) {
  return class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: MAIN_SCENE_KEY });
      this.controller = new MainSceneController(this, Phaser);
    }

    init(data) {
      this.controller.init(data);
    }

    preload() {
      this.controller.preload();
    }

    create() {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.controller.destroy();
      });
      this.controller.create();
    }

    applySnapshot(snapshot) {
      this.controller.applySnapshot(snapshot);
    }
  };
}

export { MAIN_SCENE_KEY, createMainSceneClass };
