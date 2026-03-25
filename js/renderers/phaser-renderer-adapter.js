import { ensurePhaserRuntime } from './phaser-runtime.js';
import { createTunnelSceneClass } from './phaser-tunnel-scene.js';

function createPhaserRendererAdapter() {
  let game = null;
  let tunnelScene = null;

  function getHostElement() {
    return document.getElementById('gameViewport');
  }

  function ensureHostPrepared() {
    const host = getHostElement();
    if (!host) {
      throw new Error('Missing #gameViewport for Phaser renderer');
    }

    host.replaceChildren();
    host.classList.add('renderer-phaser');
    return host;
  }

  return {
    name: 'phaser',
    async init(initialSnapshot) {
      const Phaser = await ensurePhaserRuntime();
      const TunnelSceneClass = createTunnelSceneClass(Phaser);
      const host = ensureHostPrepared();
      const viewport = initialSnapshot?.viewport || { width: host.clientWidth || 360, height: host.clientHeight || 640 };

      game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent: host,
        width: Math.max(1, Math.round(viewport.width)),
        height: Math.max(1, Math.round(viewport.height)),
        transparent: true,
        backgroundColor: '#000000',
        scale: {
          mode: Phaser.Scale.NONE
        },
        scene: [TunnelSceneClass]
      });

      tunnelScene = game.scene.keys.TunnelScene;
      if (tunnelScene?.applySnapshot) {
        tunnelScene.applySnapshot(initialSnapshot);
      }

      return true;
    },
    resize(snapshot) {
      if (!game || !snapshot?.viewport) return;
      const { width, height } = snapshot.viewport;
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      game.scale.resize(w, h);
    },
    render(snapshot) {
      tunnelScene?.applySnapshot?.(snapshot);
    },
    renderUi() {},
    destroy() {
      const host = getHostElement();
      if (host) {
        host.classList.remove('renderer-phaser');
      }
      if (game) {
        game.destroy(true);
        game = null;
      }
      tunnelScene = null;
    },
    getViewportMetrics() {
      if (!game) return { width: 0, height: 0 };
      return {
        width: game.scale.width,
        height: game.scale.height
      };
    }
  };
}

export { createPhaserRendererAdapter };
