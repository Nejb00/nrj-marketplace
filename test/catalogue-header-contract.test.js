import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('catalogue mode keeps the fixed search/category header visible', async () => {
  const [baseCss, clickDelegation, smartHeader] = await Promise.all([
    readFile('src/css/base/base.css', 'utf8'),
    readFile('src/js/features/app/click-delegation.js', 'utf8'),
    readFile('src/js/features/app/smart-header.js', 'utf8')
  ]);

  assert.match(clickDelegation, /syncCatalogueContentMode\('home'\)/);
  assert.doesNotMatch(baseCss, /body\.catalogue-content-only\s+#headerFixed\s*,\s*body\.catalogue-content-only\s+#headerSpacer/);
  assert.match(baseCss, /#headerSpacer\s*\{[^}]*height:\s*var\(--header-height,\s*132px\)/);
  assert.match(smartHeader, /spacer\.style\.height\s*=\s*total\s*\+\s*'px'/);
});


test('categories page uses a compact auto-hiding header without a persistent scroll listener', async () => {
  const [categoriesPage, filtersCss] = await Promise.all([
    readFile('src/js/features/catalogue/categories-page.js', 'utf8'),
    readFile('src/css/components/filters.css', 'utf8')
  ]);

  assert.match(categoriesPage, /CATEGORIES_SCROLL_THRESHOLD = 8/);
  assert.match(categoriesPage, /container\.addEventListener\('scroll', categoriesScrollHandler, \{ passive: true \}\)/);
  assert.match(categoriesPage, /categoriesScrollContainer\.removeEventListener\('scroll', categoriesScrollHandler\)/);
  assert.match(categoriesPage, /cv\.style\.setProperty\('--categories-header-h', offset \+ 'px'\)/);
  assert.match(filtersCss, /body\.categories-page-open #filterBar,\s*body\.categories-page-open #quickFilters,\s*body\.categories-page-open #subcategoryBubbles/);
  assert.match(filtersCss, /transform:\s*translateY\(-100%\)/);
  assert.match(filtersCss, /height:\s*44px/);
  assert.match(filtersCss, /\.categories-popular-toolbar\s*\{[^}]*position:\s*sticky/s);
});
