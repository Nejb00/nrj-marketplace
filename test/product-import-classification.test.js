import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/js/api/api.js', 'utf8');
const feature = fs.readFileSync('src/js/features/admin/product-import.js', 'utf8');
const html = fs.readFileSync('admin.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/classify-product-import/index.ts', 'utf8');

test('classification UI is chained after Vision extraction', () => {
  assert.match(api, /functions\.invoke\('classify-product-import'/);
  assert.match(feature, /processProductImport\(row\.id,\s*data/);
  assert.match(edge, /classify-product-import/);
  assert.match(html, /productImportClassification/);
  assert.match(html, /Catégorie catalogue/);
});

test('classification resolves against unique real catalog path keys', () => {
  assert.match(edge, /categories\?select=id,name,parent_id,slug/);
  assert.match(edge, /validKeys/);
  assert.match(edge, /byKey\.get\(classification\.category_key\)/);
  assert.match(edge, /category_id:\s*matchedCategory\?\.id/);
  assert.match(edge, /category_key/);
  assert.match(edge, /parent\.slug.*category\.slug/);
  assert.match(edge, /Jamais un UUID/);
});

test('classification gates automation with 90 percent and review with 70 percent', () => {
  assert.match(edge, /AUTO_THRESHOLD = 0\.90/);
  assert.match(edge, /REVIEW_THRESHOLD = 0\.70/);
  assert.match(edge, /auto_publish_eligible: overallConfidence >= AUTO_THRESHOLD/);
  assert.match(edge, /review_required: reviewRequired/);
  assert.match(edge, /status: nextStatus/);
});

test('classifier does not write directly to products', () => {
  assert.doesNotMatch(edge, /from\(["']products["']\)/);
  assert.doesNotMatch(edge, /products\?/);
});
