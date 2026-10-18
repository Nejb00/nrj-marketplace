import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('NRJ design DNA is wired and preserves the spatial UI contract', async () => {
  const [main, tokens, glass, cards, nav, modal, account, cart, theme, chat] = await Promise.all([
    read('src/css/main.css'),
    read('src/css/base/design-tokens.css'),
    read('src/css/components/glass.css'),
    read('src/css/components/product-card.css'),
    read('src/css/layout/navigation.css'),
    read('src/css/components/product-modal.css'),
    read('src/css/components/account.css'),
    read('src/css/components/cart-admin.css'),
    read('src/css/themes/light-theme-patch.css'),
    read('src/css/components/chat.css')
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
  assert.match(nav, /@media \(max-width: 420px\)[\s\S]*?\.main-nav\s*\{[^}]*width:\s*auto;[^}]*transform:\s*none;[^}]*animation-name:\s*nav-rise-mobile;/);
  assert.match(nav, /@keyframes nav-rise-mobile\s*\{/);
  assert.match(modal, /prefers-reduced-transparency/);
  assert.match(account, /prefers-reduced-transparency/);
  assert.match(cart, /backdrop-filter:\s*blur\(var\(--lg-blur\)\)/);
  assert.match(cart, /#cartPanel\s*\{[^}]*z-index:\s*var\(--nrj-z-panel,\s*450\);/);
  assert.match(cart, /#cartOverlay\s*\{\s*z-index:\s*var\(--nrj-z-overlay,\s*400\);/);
  assert.match(cart, /\.cart-close-btn\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);

  assert.match(theme, /:root\.light-theme \.main-nav \.nav-item\s*\{[^}]*color:\s*var\(--text-secondary\)/s);
  assert.match(theme, /:root\.light-theme \.main-nav \.nav-item\.active\s*\{[^}]*color:\s*#9a3f00/s);
  assert.match(chat, /@supports not \(backdrop-filter: blur\(1px\)\) and not \(-webkit-backdrop-filter: blur\(1px\)\)[\s\S]*?\.chat-panel\s*\{[^}]*background:\s*var\(--surface\)/);
  assert.match(chat, /@media \(prefers-reduced-transparency: reduce\)[\s\S]*?\.chat-panel\s*\{[^}]*background:\s*var\(--surface\) !important;[^}]*backdrop-filter:\s*none !important;/s);
});
