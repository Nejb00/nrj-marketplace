import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('catalogue mode keeps the fixed search/category header visible and measured', async () => {
  const [baseCss, clickDelegation, smartHeader, indexHtml, filtersCss] = await Promise.all([
    readFile('src/css/base/base.css', 'utf8'),
    readFile('src/js/features/app/click-delegation.js', 'utf8'),
    readFile('src/js/features/app/smart-header.js', 'utf8'),
    readFile('index.html', 'utf8'),
    readFile('src/css/components/filters.css', 'utf8')
  ]);

  assert.match(clickDelegation, /syncCatalogueContentMode\('home'\)/);
  assert.doesNotMatch(baseCss, /body\.catalogue-content-only\s+#headerFixed\s*,\s*body\.catalogue-content-only\s+#headerSpacer/);
  assert.match(baseCss, /#headerSpacer\s*\{[^}]*height:\s*var\(--header-height/);
  assert.match(smartHeader, /fixed\.offsetHeight/);
  assert.match(smartHeader, /new ResizeObserver\(syncHeaderHeight\)\.observe\(fixed\)/);
  assert.match(smartHeader, /spacer\.style\.height\s*=\s*total\s*\+\s*'px'/);

  // The spacer follows the measured header; category mode must not retain the old fixed 160px offset.
  assert.match(indexHtml, /id="headerSpacer"/);
  assert.match(indexHtml, /id="filterBar"/);
  assert.doesNotMatch(filtersCss, /--categories-header-h:\s*160px|top:\s*var\(--categories-header-h,\s*160px\)/);
});

test('quick chips are removed while the category filter bar remains', async () => {
  const [indexHtml, filtersCss, mainJs, stateJs, clickDelegation, catalogueFilter, recommendations] = await Promise.all([
    readFile('index.html', 'utf8'),
    readFile('src/css/components/filters.css', 'utf8'),
    readFile('src/js/main.js', 'utf8'),
    readFile('src/js/core/state.js', 'utf8'),
    readFile('src/js/features/app/click-delegation.js', 'utf8'),
    readFile('src/js/features/catalogue/popularity-sort.js', 'utf8'),
    readFile('src/js/services/reco.js', 'utf8')
  ]);

  assert.match(indexHtml, /id="filterBar"/);
  assert.doesNotMatch(indexHtml, /id="quickFilters"|class="quick-filters"|filter-chip/);
  assert.doesNotMatch(filtersCss, /\.quick-filters|\.filter-chip/);
  assert.doesNotMatch(mainJs, /quick-filters/);
  assert.doesNotMatch(stateJs, /currentQuickFilter/);
  assert.doesNotMatch(clickDelegation, /currentQuickFilter|filter-chip/);
  assert.doesNotMatch(catalogueFilter, /currentQuickFilter/);
  assert.doesNotMatch(recommendations, /quick-filters|filter-chip/);
});

test('category page retains its independent sorting menu', async () => {
  const [indexHtml, categoriesPage, popularProducts] = await Promise.all([
    readFile('index.html', 'utf8'),
    readFile('src/js/features/catalogue/categories-page.js', 'utf8'),
    readFile('src/js/features/catalogue/categories-popular.js', 'utf8')
  ]);

  for (const value of ['relevance', 'bestsellers', 'newest', 'price-asc', 'price-desc', 'foryou']) {
    assert.ok(indexHtml.includes('<option value="' + value + '"'), 'missing category sort option: ' + value);
  }
  assert.match(categoriesPage, /sortSelect\.addEventListener\('change'/);
  for (const sortCase of ['bestsellers', 'newest', 'price-asc', 'price-desc', 'foryou']) {
    assert.ok(popularProducts.includes("case '" + sortCase + "':"), 'missing sorting implementation: ' + sortCase);
  }
});
