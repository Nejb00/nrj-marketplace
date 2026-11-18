import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const form = fs.readFileSync('src/js/features/admin/product-form.js', 'utf8');

test('classic product creation uses the dedicated media uploader interface', () => {
  assert.match(form, /getSelectedProductMediaFiles/);
  assert.match(form, /uploadSelectedProductMedia/);
  assert.match(form, /cleanupProductMediaUploads/);
  assert.match(form, /resetProductMediaUploader/);
});

test('local media uploads finish before product insertion; URL-only path skips upload', () => {
  const uploadAt = form.indexOf('await uploadSelectedProductMedia()');
  const insertAt = form.indexOf('await insertProduct(product)');
  assert.ok(uploadAt > -1, 'uploader call is present');
  assert.ok(insertAt > uploadAt, 'insert happens after successful upload');
  assert.match(form, /if\s*\(selectedMediaFiles\.length\)\s*\{[\s\S]*?await uploadSelectedProductMedia\(\)/);
});

test('uploaded image URLs fill image through image6 in selection order', () => {
  assert.match(form, /PRODUCT_IMAGE_FIELDS\s*=\s*\['image',\s*'image2',\s*'image3',\s*'image4',\s*'image5',\s*'image6'\]/);
  assert.match(form, /uploadedMedia\.urls\.forEach\(\(url, index\)\s*=>\s*\{/);
  assert.match(form, /product\[PRODUCT_IMAGE_FIELDS\[index\]\]\s*=\s*url/);
});

test('upload errors prevent insertion and insert failures clean up known Cloudinary assets', () => {
  assert.match(form, /let uploadedPublicIds = \[\]/);
  assert.match(form, /uploadedPublicIds = Array\.isArray\(uploadedMedia\?\.publicIds\)/);
  assert.match(form, /if\s*\(!productInserted && uploadedPublicIds\.length\)\s*\{[\s\S]*?await cleanupProductMediaUploads\(uploadedPublicIds\)/);
});

test('post-insert refresh or render errors never delete media belonging to a saved product', () => {
  assert.match(form, /await insertProduct\(product\);\s*productInserted = true;/);
  assert.match(form, /if\s*\(!productInserted && uploadedPublicIds\.length\)/);
});

test('successful insertion resets local selection and the six legacy URL fields', () => {
  assert.match(form, /productInserted = true;[\s\S]*?resetProductMediaUploader\(\)/);
  assert.match(form, /PRODUCT_IMAGE_FIELDS\.forEach\(\(field, index\)\s*=>\s*\{/);
  assert.match(form, /index === 0 \? 'adminImage' : 'adminImage' \+ \(index \+ 1\)/);
  assert.match(form, /if \(input\) input\.value = ''/);
});

test('failed cleanup preserves the original insert error and adds a visible orphan warning', () => {
  assert.match(form, /const originalError = err\?\.message/);
  assert.match(form, /nettoyage Cloudinary a échoué/i);
  assert.match(form, /showToast\('❌ Erreur:/);
});
