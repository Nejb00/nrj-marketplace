import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker = fs.readFileSync('supabase/functions/recover-product-imports/index.ts', 'utf8');
const workflow = fs.readFileSync('.github/workflows/product-import-auto-recovery.yml', 'utf8');
const orchestrator = fs.readFileSync('supabase/functions/process-product-import/index.ts', 'utf8');

test('background worker is server-authenticated', () => {
  assert.match(worker, /function isInternalWorker/);
  assert.match(worker, /worker_auth_required/);
  assert.match(worker, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow, /secrets\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(workflow, /no background recovery was executed/);
});

test('worker only targets safe resumable states', () => {
  assert.match(worker, /FAILED,CLASSIFIED,MEDIA_READY,READY/);
  assert.match(worker, /startsWith\("classification"\)/);
  assert.match(worker, /startsWith\("pricing"\)/);
  assert.match(worker, /MEDIA_READY.*READY/);
  assert.match(worker, /BATCH_SIZE = 8/);
});

test('worker never supplies client-side images or arbitrary pricing', () => {
  assert.match(worker, /imageDataUrl: null/);
  assert.match(worker, /pricing: null/);
  assert.match(worker, /approve: false/);
});

test('orchestrator keeps bounded recovery and confidence gates', () => {
  assert.match(orchestrator, /MAX_RECOVERY_RETRIES = 3/);
  assert.match(orchestrator, /MAX_STAGE_RETRIES = 2/);
  assert.match(orchestrator, /auto_publish_eligible/);
  assert.match(orchestrator, /human_approval/);
});
