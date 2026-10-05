import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/js/api/api.js', 'utf8');
const feature = fs.readFileSync('src/js/features/admin/product-import.js', 'utf8');
const html = fs.readFileSync('admin.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/price-product-import/index.ts', 'utf8');

test('pricing UI is connected to the protected pricing function', () => {
  assert.match(api, /functions\.invoke\('price-product-import'/);
  assert.match(feature, /priceProductImport/);
  assert.match(feature, /productImportPriceBtn/);
  assert.match(html, /productImportPricing/);
});

test('pricing formula separates supplier cost, logistics, duties, fees and margin', () => {
  assert.match(edge, /supplierCostXaf/);
  assert.match(edge, /logistics/);
  assert.match(edge, /dutyXaf/);
  assert.match(edge, /marketplaceFeeXaf/);
  assert.match(edge, /target_margin_rate/);
  assert.match(edge, /rawPriceXaf/);
  assert.match(edge, /roundedPriceXaf/);
});

test('pricing validates inputs and never writes directly to products', () => {
  assert.match(edge, /category_confidence/);
  assert.match(edge, /category_required/);
  assert.match(edge, /fx_rate_required/);
  assert.doesNotMatch(edge, /from\(["']products["']\)/);
  assert.doesNotMatch(edge, /products\?/);
});

test('pricing preserves the import state machine', () => {
  assert.match(edge, /row\.status === "CLASSIFIED" \? "PRICED" : row\.status/);
  assert.match(edge, /FORMULA_VERSION = "v1"/);
});
