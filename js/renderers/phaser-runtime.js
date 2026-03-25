let phaserLoadPromise = null;

function ensurePhaserRuntime() {
  if (window.Phaser) {
    return Promise.resolve(window.Phaser);
  }

  if (phaserLoadPromise) {
    return phaserLoadPromise;
  }

  phaserLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js';
    script.async = true;
    script.onload = () => {
      if (window.Phaser) {
        resolve(window.Phaser);
      } else {
        reject(new Error('Phaser runtime script loaded but window.Phaser is unavailable'));
      }
    };
    script.onerror = () => reject(new Error('Unable to load Phaser runtime from CDN'));
    document.head.appendChild(script);
  });

  return phaserLoadPromise;
}

export { ensurePhaserRuntime };
