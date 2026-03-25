import { assertGameRenderer } from './renderer-contract.js';
import { createCanvasRendererAdapter } from './canvas-renderer-adapter.js';
import { createPhaserRendererAdapter } from './phaser-renderer-adapter.js';
import { getCanvasSize } from '../renderer.js';
import { DEFAULT_RENDER_BACKEND, RENDER_BACKENDS } from '../config.js';

const DEFAULT_RENDERER = DEFAULT_RENDER_BACKEND;

function readRequestedRenderer() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = (params.get('renderer') || '').trim().toLowerCase();
  const fromStorage = (localStorage.getItem('rendererBackend') || '').trim().toLowerCase();
  const requested = fromQuery || fromStorage || DEFAULT_RENDERER;
  const allowed = new Set(Object.values(RENDER_BACKENDS));
  const normalized = allowed.has(requested) ? requested : RENDER_BACKENDS.CANVAS;

  try {
    localStorage.setItem('rendererBackend', normalized);
  } catch (_error) {
    // noop
  }

  return normalized;
}

async function createGameRenderer(initialSnapshot) {
  const requested = readRequestedRenderer();
  let renderer = null;

  if (requested === RENDER_BACKENDS.PHASER) {
    try {
      renderer = assertGameRenderer(createPhaserRendererAdapter());
    } catch (error) {
      console.warn('⚠️ Phaser renderer unavailable, falling back to canvas', error);
      renderer = assertGameRenderer(createCanvasRendererAdapter());
    }
  } else {
    renderer = assertGameRenderer(createCanvasRendererAdapter());
  }

  try {
    await renderer.init(initialSnapshot);
    return renderer;
  } catch (error) {
    console.warn('⚠️ Renderer init failed, fallback to canvas', error);
    const fallbackRenderer = assertGameRenderer(createCanvasRendererAdapter());
    await fallbackRenderer.init(initialSnapshot);
    return fallbackRenderer;
  }
}

function getCanvasMetrics() {
  return getCanvasSize();
}

export { createGameRenderer, getCanvasMetrics as getCanvasSize, readRequestedRenderer };
