import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function readIfExists(path) {
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
}

const html = readIfExists('admin.html');
const uploader = readIfExists('src/js/features/admin/product-media-upload.js');
const adminMain = readIfExists('src/js/admin-main.js');

test('admin page exposes an accessible multi-image picker, preview list and live status', () => {
  assert.match(html, /id="productMediaFiles"/);
  assert.match(html, /id="productMediaPreview"/);
  assert.match(html, /id="productMediaStatus"[^>]*aria-live="polite"/);
  assert.match(html, /id="adminImage"/);
  assert.match(html, /id="adminImage6"/);
});

test('file input accepts only JPEG, PNG and WEBP and allows multiple selection', () => {
  assert.match(html, /type="file"[^>]*id="productMediaFiles"[^>]*accept="image\/jpeg,image\/png,image\/webp"[^>]*multiple/);
});

test('uploader exports the documented admin media interface', () => {
  assert.match(uploader, /export function initProductMediaUploader/);
  assert.match(uploader, /export function getSelectedProductMediaFiles/);
  assert.match(uploader, /export async function uploadSelectedProductMedia/);
  assert.match(uploader, /export async function cleanupProductMediaUploads/);
  assert.match(uploader, /export function resetProductMediaUploader/);
});

test('uploader validates the six-file, MIME and 9.5 MB constraints before requesting signatures', () => {
  assert.match(uploader, /MAX_PRODUCT_MEDIA_FILES\s*=\s*6/);
  assert.match(uploader, /MAX_PRODUCT_MEDIA_FILE_BYTES\s*=\s*9_500_000/);
  assert.match(uploader, /image\/jpeg/);
  assert.match(uploader, /image\/png/);
  assert.match(uploader, /image\/webp/);
  assert.match(uploader, /validateProductMediaFiles/);
  assert.match(uploader, /validateProductMediaFiles\(files\)/);
});

test('previews are created safely and object URLs are revoked on removal or reset', () => {
  assert.match(uploader, /URL\.createObjectURL/);
  assert.match(uploader, /URL\.revokeObjectURL/);
  assert.match(uploader, /removeSelectedFile/);
});

test('uploads use server signatures and send file bytes directly to Cloudinary', () => {
  assert.match(uploader, /functions\.invoke\('sign-product-media-uploads'/);
  assert.match(uploader, /https:\/\/api\.cloudinary\.com\/v1_1\//);
  assert.match(uploader, /form\.append\('file', file\)/);
  assert.match(uploader, /form\.append\('upload_preset'/);
  assert.match(uploader, /form\.append\('signature'/);
  assert.match(uploader, /secure_url/);
  assert.match(uploader, /public_id/);
});

test('a partial batch failure triggers bounded cleanup for the signed public IDs', () => {
  assert.match(uploader, /functions\.invoke\('cleanup-product-media-uploads'/);
  assert.match(uploader, /cleanupProductMediaUploads/);
  assert.match(uploader, /public_ids/);
});

test('uploader initializes only after an admin session is confirmed', () => {
  assert.match(adminMain, /if\s*\(isAdmin\)\s*\{[\s\S]*?initProductMediaUploader\(\)/);
  assert.match(adminMain, /onAuthStateChange/);
  assert.match(adminMain, /session\?\.user\?\.app_metadata\?\.role\s*===\s*'admin'/);
});
