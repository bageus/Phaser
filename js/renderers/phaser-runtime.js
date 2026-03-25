let phaserLoadPromise = null;

const PHASER_RUNTIME_URLS = [
  'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js',
  'https://unpkg.com/phaser@3.90.0/dist/phaser.min.js'
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Unable to load Phaser runtime: ${src}`));
    document.head.appendChild(script);
  });
}

function ensurePhaserRuntime() {
  if (window.Phaser) {
    return Promise.resolve(window.Phaser);
  }

  if (phaserLoadPromise) {
    return phaserLoadPromise;
  }

  phaserLoadPromise = (async () => {
    let lastError = null;

    for (const src of PHASER_RUNTIME_URLS) {
      try {
        await loadScript(src);
        if (window.Phaser) {
          return window.Phaser;
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Phaser runtime script loaded but window.Phaser is unavailable');
  });

  return phaserLoadPromise;
}

export { ensurePhaserRuntime };
