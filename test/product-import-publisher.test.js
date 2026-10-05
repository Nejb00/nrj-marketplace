import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/js/api/api.js', 'utf8');
const feature = fs.readFileSync('src/js/features/admin/product-import.js', 'utf8');
const html = fs.readFileSync('admin.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/publish-product-import/index.ts', 'utf8');

test('publisher is connected to the admin staging workflow', () => {
  assert.match(api, /functions\.invoke\('publish-product-import'/);
  assert.match(feature, /publishProductImport/);
  assert.match(feature, /data-publish-import-id/);
  assert.match(html, /productImportPublish/);
});

test('publisher requires complete staging and uses the real category', () => {
  assert.match(edge, /category_id/);
  assert.match(edge, /calculated_price/);
  assert.match(edge, /cloudinary_urls/);
  assert.match(edge, /categories\?id=eq\./);
  assert.match(edge, /products\?select=id/);
});

test('publisher supports safe auto and human-approved paths', () => {
  assert.match(edge, /AUTO_THRESHOLD = 0\.90/);
  assert.match(edge, /MIN_REVIEW_THRESHOLD = 0\.70/);
  assert.match(edge, /auto_publish_eligible/);
  assert.match(edge, /human_approval_required/);
  assert.match(edge, /mode: autoEligible \? "AUTO" : "HUMAN_APPROVED"/);
});

test('publisher is idempotent and finalizes staging', () => {
  assert.match(edge, /published_product_id/);
  assert.match(edge, /alreadyPublished/);
  assert.match(edge, /status: "PUBLISHED"/);
  assert.doesNotMatch(edge, /products.*update/i);
});
