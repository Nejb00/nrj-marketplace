import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('catalogue first paint limits eager images and defers cart recommendations', async () => {
  const [config, lazyLoading, renderer, cartPanel] = await Promise.all([
    readFile('src/js/core/config.js', 'utf8'),
    readFile('src/js/services/lazy-loading.js', 'utf8'),
    readFile('src/js/features/catalogue/render-product-card.js', 'utf8'),
    readFile('src/js/services/cart-panel.js', 'utf8')
  ]);

  assert.match(config, /INITIAL_PRODUCTS = 20/);
  assert.match(config, /EAGER_IMAGE_COUNT = 2/);
  assert.match(config, /PRELOAD_IMAGE_COUNT = 4/);
  assert.match(config, /PRELOAD_CONCURRENCY = 2/);
  assert.match(lazyLoading, /return \{ loading: 'eager', fetchpriority: 'high' \}/);
  assert.match(renderer, /loadOpts = imageLoadOpts\(index\)/);
  assert.match(renderer, /thumbImg\(p\.image, p\.name, 300, 400, '', loadOpts\)/);
  assert.match(cartPanel, /renderProductCardHTML\(p, i, \{ loading: 'lazy' \}\)/);
});
