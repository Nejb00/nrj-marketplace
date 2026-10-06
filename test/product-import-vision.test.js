import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('admin.html', 'utf8');
const api = fs.readFileSync('src/js/api/product-import-api.js', 'utf8');
const main = fs.readFileSync('src/js/admin-main.js', 'utf8');
const feature = fs.readFileSync('src/js/features/admin/product-import.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/analyze-product-import/index.ts', 'utf8');

test('vision import UI is connected to the staging analysis contract', () => {
  assert.match(html, /productImportAnalysis/);
  assert.match(html, /Analyser avec l’IA/);
  assert.match(api, /functions\.invoke\('analyze-product-import'/);
  assert.match(feature, /buildAnalysisImage/);
  assert.match(feature, /processProductImport\(row\.id,\s*data/);
  assert.match(main, /initProductImportUI/);
});

test('vision edge function keeps Gemini secrets server-side and requires admin', () => {
  assert.match(edge, /GEMINI_API_KEY/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /function isAdmin/);
  assert.match(edge, /payload\.is_anonymous !== true/);
  assert.match(edge, /role === "admin"/);
});

test('vision output is schema-constrained and never creates category ids', () => {
  assert.match(edge, /responseMimeType: "application\/json"/);
  assert.match(edge, /responseSchema: RESPONSE_SCHEMA/);
  assert.match(edge, /visual_category_hint/);
  assert.doesNotMatch(edge, /category_id:\s*analysis\./);
});
