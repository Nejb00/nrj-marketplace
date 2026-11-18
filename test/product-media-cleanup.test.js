import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge = fs.readFileSync('supabase/functions/cleanup-product-media-uploads/index.ts', 'utf8');
const config = fs.readFileSync('supabase/config.toml', 'utf8');

test('cleanup endpoint is POST-only and requires a verified admin user JWT', () => {
  assert.match(edge, /req\.method !== "POST"/);
  assert.match(edge, /x-client-info/);
  assert.match(edge, /if \(!isAdmin\(req\)\)/);
  assert.match(edge, /payload\.role !== "authenticated"/);
  assert.match(edge, /payload\.is_anonymous === true/);
  assert.match(edge, /payload\.app_metadata/);
  assert.match(edge, /role === "admin"/);
});

test('cleanup accepts only one to six unique, strictly scoped product public IDs', () => {
  assert.match(edge, /!Array\.isArray\(publicIds\)/);
  assert.match(edge, /publicIds\.length < 1/);
  assert.match(edge, /publicIds\.length > 6/);
  assert.match(edge, /new Set\(publicIds\)\.size !== publicIds\.length/);
  assert.ok(edge.includes("nrj-marketplace" + String.fromCharCode(92) + "/products"));
  assert.match(edge, /test\(publicId\)/);
  assert.match(edge, /image\/destroy/);
  assert.doesNotMatch(edge, /body\?\.url|body\?\.secure_url/);
});

test('cleanup signs Cloudinary destroy requests on the server and keeps secrets private', () => {
  assert.match(edge, /CLOUDINARY_API_KEY/);
  assert.match(edge, /CLOUDINARY_API_SECRET/);
  assert.match(edge, /encodeSignatureParams\(signedParams\) \+ CLOUDINARY_API_SECRET/);
  assert.match(edge, /public_id:\s*publicId/);
  assert.match(edge, /timestamp/);
  assert.match(edge, /results/);
  assert.doesNotMatch(edge, /api_secret\s*:/i);
  assert.doesNotMatch(edge, /CLOUDINARY_API_SECRET\s*[,}]/);
});

test('cleanup reports a bounded per-ID outcome and never exposes raw provider errors', () => {
  assert.match(edge, /public_id:\s*publicId/);
  assert.match(edge, /ok:\s*(?:true|false)/);
  assert.match(edge, /result:\s*"(?:deleted|not_found|failed)"/);
  assert.doesNotMatch(edge, /JSON\.stringify\(error\)/);
});

test('Supabase gateway JWT verification is enabled for the cleanup endpoint', () => {
  assert.match(config, /\[functions\.cleanup-product-media-uploads\][\s\S]*?verify_jwt = true/);
});
