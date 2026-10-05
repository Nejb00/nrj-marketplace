import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/js/api/api.js', 'utf8');
const feature = fs.readFileSync('src/js/features/admin/product-import.js', 'utf8');
const html = fs.readFileSync('admin.html', 'utf8');
const edge = fs.readFileSync('supabase/functions/upload-product-import-media/index.ts', 'utf8');

test('media pipeline is connected to the Cloudinary Edge Function', () => {
  assert.match(api, /functions\.invoke\('upload-product-import-media'/);
  assert.match(feature, /uploadProductImportMedia/);
  assert.match(html, /productImportMedia/);
});

test('media function is admin-only and keeps Cloudinary credentials server-side', () => {
  assert.match(edge, /CLOUDINARY_CLOUD_NAME/);
  assert.match(edge, /CLOUDINARY_API_KEY/);
  assert.match(edge, /CLOUDINARY_API_SECRET/);
  assert.match(edge, /role === "admin"/);
  assert.match(edge, /verify_jwt/i);
});

test('media upload is signed, bounded and idempotent', () => {
  assert.match(edge, /SHA-1/);
  assert.match(edge, /MAX_IMAGE_BYTES = 9_500_000/);
  assert.match(edge, /overwrite: "true"/);
  assert.match(edge, /status === "MEDIA_READY"/);
});

test('media writes only to staging and transitions PRICED to MEDIA_READY', () => {
  assert.match(edge, /status !== "PRICED"/);
  assert.match(edge, /status: "MEDIA_READY"/);
  assert.match(edge, /cloudinary_urls: media/);
  assert.doesNotMatch(edge, /products\?/);
  assert.doesNotMatch(edge, /from\(["']products["']\)/);
});
