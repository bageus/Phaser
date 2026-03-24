import { assertGameRenderer } from './renderer-contract.js';
import { createCanvasRendererAdapter } from './canvas-renderer-adapter.js';
import { getCanvasSize } from '../renderer.js';

const DEFAULT_RENDERER = 'canvas';

function readRequestedRenderer() {
  try {
    localStorage.setItem('rendererBackend', DEFAULT_RENDERER);
  } catch (_error) {
    // noop
  }

  return DEFAULT_RENDERER;
}

async function createGameRenderer(initialSnapshot) {
  const renderer = assertGameRenderer(createCanvasRendererAdapter());
  await renderer.init(initialSnapshot);
  return renderer;
}

function getCanvasMetrics() {
  return getCanvasSize();
}

export { createGameRenderer, getCanvasMetrics as getCanvasSize, readRequestedRenderer };
