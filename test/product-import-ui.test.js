import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('admin.html', 'utf8');
const api = fs.readFileSync('src/js/api/api.js', 'utf8');
const main = fs.readFileSync('src/js/admin-main.js', 'utf8');
const feature = fs.readFileSync('src/js/features/admin/product-import.js', 'utf8');

test('product import UI exposes the staging workflow', () => {
  assert.match(html, /productImportSection/);
  assert.match(html, /productImportFile/);
  assert.match(html, /productImportPrepareBtn/);
  assert.match(html, /productImportsList/);
  assert.match(api, /export async function fetchProductImports/);
  assert.match(api, /export async function insertProductImport/);
  assert.match(api, /from\('product_imports'\)/);
  assert.match(main, /initProductImportUI/);
  assert.match(feature, /status: 'RECEIVED'/);
});

test('local file selection is preview-only until the media pipeline', () => {
  assert.match(feature, /URL\.createObjectURL/);
  assert.match(feature, /sera envoyée durablement/);
  assert.doesNotMatch(feature, /source_image:\s*previewUrl/);
});
