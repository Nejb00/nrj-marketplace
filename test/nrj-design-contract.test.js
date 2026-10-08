import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('NRJ design DNA is wired and preserves the spatial UI contract', async () => {
  const [main, tokens, glass, cards, nav, modal, account, cart] = await Promise.all([
    read('src/css/main.css'),
    read('src/css/base/design-tokens.css'),
    read('src/css/components/glass.css'),
    read('src/css/components/product-card.css'),
    read('src/css/layout/navigation.css'),
    read('src/css/components/product-modal.css'),
    read('src/css/components/account.css'),
    read('src/css/components/cart-admin.css')
  ]);

  assert.match(main, /design-tokens\.css/);
  assert.match(main, /components\/glass\.css/);
  assert.match(tokens, /--nrj-control-min:\s*44px/);
  assert.match(tokens, /--nrj-radius-md:\s*18px/);
  assert.match(tokens, /--nrj-motion-base/);
  assert.match(tokens, /prefers-reduced-transparency/);

  assert.match(glass, /\.lg\s*\{/);
  assert.match(glass, /prefers-reduced-transparency/);
  assert.match(glass, /@supports not/);

  assert.match(cards, /background:\s*var\(--nrj-surface\)/);
  assert.match(cards, /:focus-visible/);
  assert.match(nav, /backdrop-filter:\s*blur\(var\(--lg-blur\)\)/);
  assert.match(modal, /prefers-reduced-transparency/);
  assert.match(account, /prefers-reduced-transparency/);
  assert.match(cart, /backdrop-filter:\s*blur\(var\(--lg-blur\)\)/);
});
