import {
  resizeCanvas,
  drawTube,
  drawTubeDepth,
  drawTubeCenter,
  drawTubeBezel,
  drawPlayer,
  drawCoins,
  drawObjects,
  drawSpeedLines,
  drawNeonLines,
  drawBonusText,
  drawRadarHints,
  drawSpinAlert,
  getCanvasSize
} from '../renderer.js';

function createCanvasRendererAdapter() {
  return {
    name: 'canvas',
    init() {
      resizeCanvas();
      return true;
    },
    resize() {
      resizeCanvas();
    },
    render(_snapshot) {
      drawTube();
      drawTubeDepth();
      drawObjects();
      drawCoins();
      drawPlayer();
      drawTubeCenter();
      drawSpeedLines();
      drawNeonLines();
      drawTubeBezel();
    },
    renderUi(_snapshot) {
      drawBonusText();
      drawRadarHints();
      drawSpinAlert();
    },
    destroy() {},
    getViewportMetrics: getCanvasSize
  };
}

export { createCanvasRendererAdapter };
