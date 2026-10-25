import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Mon NRJ profile and settings remain mutually exclusive views', async () => {
  const [css, view] = await Promise.all([
    read('../src/css/components/account.css'),
    read('../src/js/features/app/account-view.js')
  ]);

  assert.match(css, /\.account-page\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/s);
  assert.match(view, /querySelector\('\.account-profile-page'\)\?\.setAttribute\('hidden',''\)/);
  assert.match(view, /const settings = root\.querySelector\('\.account-settings-page'\);\s*settings\?\.removeAttribute\('hidden'\)/);
  assert.match(view, /querySelector\('\.account-settings-page'\)\?\.setAttribute\('hidden',''\)/);
  assert.match(view, /querySelector\('\.account-profile-page'\)\?\.removeAttribute\('hidden'\)/);
});

test('sticky direct-order action has deliberate styling and keeps its Buy Now wiring', async () => {
  const [css, html, actions] = await Promise.all([
    read('../src/css/components/product-modal.css'),
    read('../index.html'),
    read('../src/js/features/product/modal-actions.js')
  ]);

  assert.match(html, /class="btn-direct-sticky" id="directOrderStickyBtn"/);
  assert.match(css, /\.btn-direct-sticky\s*\{[^}]*min-height:\s*48px;[^}]*border-radius:\s*15px;[^}]*background:/s);
  assert.match(css, /\.btn-direct-sticky:focus-visible\s*\{/);
  const reducedMotionBlock = css.split('@media (prefers-reduced-motion: reduce) {')[1]?.split('}')[0] || '';
  assert.ok(reducedMotionBlock.includes('.btn-direct-sticky'));
  assert.match(actions, /openOptionsPanel\(directBtn,\s*'buy'\)/);
});


test('home load-more button has visible styling, space above fixed navigation, and working pagination wiring', async () => {
  const [css, html, pagination] = await Promise.all([
    read('../src/css/components/product-card.css'),
    read('../index.html'),
    read('../src/js/features/catalogue/pagination.js')
  ]);

  assert.match(html, /class="load-more-wrap" id="loadMoreWrap"/);
  assert.match(html, /class="load-more-btn" id="loadMoreBtn">Charger plus<\/button>/);
  assert.match(css, /\.load-more-wrap\s*\{[^}]*justify-content:\s*center;[^}]*padding:\s*1rem 0\.8rem calc\(var\(--nav-height,\s*64px\)\s*\+\s*1rem\);/s);
  assert.match(css, /\.load-more-btn\s*\{[^}]*min-height:\s*48px;[^}]*background:\s*var\(--nrj-accent,\s*#ff8c42\);[^}]*color:\s*#fff;/s);
  assert.match(css, /\.load-more-btn:focus-visible\s*\{/);
  assert.match(pagination, /const hasMore = state\.displayedCount < state\.currentFilteredProducts\.length/);
  assert.match(pagination, /wrap\.style\.display = hasMore \? 'flex' : 'none'/);
  assert.match(pagination, /btn\.addEventListener\('click', \(\) => loadMoreProducts\(\)\)/);
});
