import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('src/js/api/api.js', 'utf8');
const feature = fs.readFileSync('src/js/features/admin/product-import.js', 'utf8');
const edge = fs.readFileSync('supabase/functions/process-product-import/index.ts', 'utf8');

test('orchestrator is exposed through the admin API', () => {
  assert.match(api, /functions\.invoke\('process-product-import'/);
  assert.match(feature, /processProductImport/);
});

test('orchestrator follows the staging state machine', () => {
  assert.match(edge, /status === "RECEIVED"/);
  assert.match(edge, /analyze-product-import/);
  assert.match(edge, /classify-product-import/);
  assert.match(edge, /price-product-import/);
  assert.match(edge, /upload-product-import-media/);
  assert.match(edge, /publish-product-import/);
});

test('orchestrator retries only transient downstream failures', () => {
  assert.match(edge, /MAX_STAGE_RETRIES = 2/);
  assert.match(edge, /response.status < 500/);
  assert.match(edge, /setTimeout/);
});

test('orchestrator never bypasses confidence gates', () => {
  assert.match(edge, /LOW_CONFIDENCE/);
  assert.match(edge, /human_approval/);
  assert.match(edge, /Number\(row\.overall_confidence\) >= 0\.90/);
});

test('orchestrator returns resumable media and pricing payloads', () => {
  assert.match(edge, /media: row\.cloudinary_urls/);
  assert.match(edge, /pricing: row\.ai_analysis\?\.pricing/);
  assert.match(feature, /preparedImageDataUrl/);
  assert.match(feature, /processProductImport\(currentImportId, imageDataUrl/);
});

test('orchestrator records bounded self-healing telemetry', () => {
  assert.match(edge, /async function updatePipeline/);
  assert.match(edge, /current_stage/);
  assert.match(edge, /last_attempts/);
  assert.match(edge, /last_error/);
  assert.match(edge, /last_pricing/);
  assert.match(edge, /Telemetry is best-effort/);
  assert.match(feature, /data-retry-import-id/);
  assert.match(feature, /handleRetryImport/);
});

test('orchestrator can recover pricing failures without new pricing input', () => {
  assert.match(edge, /const savedPricing = row\.ai_analysis\?\.pipeline\?\.last_pricing/);
  assert.match(edge, /const retryPricing = pricing \|\| savedPricing/);
});

test('self-healing retries are bounded and stage-aware', () => {
  assert.match(edge, /MAX_RECOVERY_RETRIES = 3/);
  assert.match(edge, /recoveryAllowed\(row\)/);
  assert.match(edge, /next_action: "manual_review"/);
  assert.match(edge, /error\.attempts = attempt/);
  assert.match(edge, /last_attempts: Number\(error\?\.attempts/);
});

test('orchestrator keeps secrets server-side', () => {
  assert.match(edge, /SERVICE_KEY/);
  assert.match(edge, /CLOUDINARY/);
  assert.doesNotMatch(edge, /CLOUDINARY_API_SECRET\s*=\s*["'][^"']/);
});
