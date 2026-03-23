import { TunnelRenderer } from '../tunnel/TunnelRenderer.js';

const MAIN_SCENE_KEY = 'MainScene';

class MainSceneController {
  constructor(scene) {
    this.scene = scene;
    this.snapshot = null;
    this.background = null;
    this.tunnelRenderer = null;
    this.handleResize = this.handleResize.bind(this);
  }

  init(data) {
    this.snapshot = data?.snapshot || null;
  }

  create() {
    const { width, height } = this.scene.scale;
    this.background = this.scene.add.rectangle(0, 0, width, height, 0x050816).setOrigin(0, 0);
    this.tunnelRenderer = new TunnelRenderer(this.scene);
    this.tunnelRenderer.create();
    this.tunnelRenderer.applySnapshot(this.snapshot);
    this.scene.scale.on('resize', this.handleResize);
  }

  handleResize(gameSize) {
    this.background?.setSize(gameSize.width, gameSize.height);
    this.tunnelRenderer?.resize();
  }

  applySnapshot(snapshot) {
    this.snapshot = snapshot || null;
    this.tunnelRenderer?.applySnapshot(this.snapshot);
  }

  destroy() {
    this.scene.scale.off('resize', this.handleResize);
    this.tunnelRenderer?.destroy();
    this.tunnelRenderer = null;
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
