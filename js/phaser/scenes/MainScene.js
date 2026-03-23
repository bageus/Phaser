import { EntityRenderer } from '../entities/EntityRenderer.js';
import { TunnelRenderer } from '../tunnel/TunnelRenderer.js';

const MAIN_SCENE_KEY = 'MainScene';

class MainSceneController {
  constructor(scene) {
    this.scene = scene;
    this.snapshot = null;
    this.background = null;
    this.tunnelRenderer = null;
    this.entityRenderer = null;
    this.handleResize = this.handleResize.bind(this);
  }

  init(data) {
    this.snapshot = data?.snapshot || null;
  }

  preload() {
    EntityRenderer.preload(this.scene);
  }

  create() {
    const { width, height } = this.scene.scale;
    this.background = this.scene.add.rectangle(0, 0, width, height, 0x050816).setOrigin(0, 0);
    this.tunnelRenderer = new TunnelRenderer(this.scene);
    this.tunnelRenderer.create();
    this.entityRenderer = new EntityRenderer(this.scene);
    this.entityRenderer.create();
    this.tunnelRenderer.applySnapshot(this.snapshot);
    this.entityRenderer.applySnapshot(this.snapshot);
    this.scene.scale.on('resize', this.handleResize);
  }

  handleResize(gameSize) {
    this.background?.setSize(gameSize.width, gameSize.height);
    this.tunnelRenderer?.resize();
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    this.tunnelRenderer?.applySnapshot(this.snapshot);
    this.entityRenderer?.applySnapshot(this.snapshot);
  }

  destroy() {
    this.scene.scale.off('resize', this.handleResize);
    this.tunnelRenderer?.destroy();
    this.entityRenderer?.destroy();
    this.tunnelRenderer = null;
    this.entityRenderer = null;
  }
}

function createMainSceneClass(Phaser) {
  return class MainScene extends Phaser.Scene {
    constructor() {
      super({ key: MAIN_SCENE_KEY });
      this.controller = new MainSceneController(this);
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
