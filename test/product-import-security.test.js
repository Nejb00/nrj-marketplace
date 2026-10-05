import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const feature = fs.readFileSync('src/js/features/admin/product-import.js', 'utf8');

const edgePaths = [
  'supabase/functions/analyze-product-import/index.ts',
  'supabase/functions/classify-product-import/index.ts',
  'supabase/functions/price-product-import/index.ts',
  'supabase/functions/process-product-import/index.ts',
  'supabase/functions/publish-product-import/index.ts',
  'supabase/functions/recover-product-imports/index.ts'
];

const edges = Object.fromEntries(
  edgePaths.map((path) => [path, fs.readFileSync(path, 'utf8')])
);

test('product import preview never interprets a dynamic value as HTML', () => {
  assert.doesNotMatch(feature, /preview\.innerHTML\s*=/);
  assert.match(feature, /document\.createElement\(['"]img['"]\)/);
  assert.match(feature, /img\.src\s*=\s*previewUrl/);
});

test('product import Edge Functions do not return raw exception details', () => {
  for (const [path, source] of Object.entries(edges)) {
    assert.doesNotMatch(
      source,
      /return json\(\{[^}]*error:\s*String\(error\?\.message\s*\|\|\s*error\)/s,
      path
    );
    assert.doesNotMatch(
      source,
      /detail:\s*message\b/,
      path
    );
    assert.doesNotMatch(
      source,
      /detail:\s*String\(error\?\.message\s*\|\|\s*error\)/,
      path
    );
  }
});
