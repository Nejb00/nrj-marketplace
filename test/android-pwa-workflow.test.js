import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Android PWA workflow preserves Lighthouse diagnostics when thresholds fail', async () => {
  const workflow = await readFile('.github/workflows/android-pwa-package.yml', 'utf8');

  assert.ok(workflow.includes('perf >= 0.8'), 'strict performance threshold must remain');
  assert.ok(workflow.includes('pwa == 1'), 'strict PWA threshold must remain');

  const artifactIndex = workflow.indexOf('Upload Lighthouse diagnostics (even on failure)');
  const nextStepIndex = workflow.indexOf('- name: Generate Android project', artifactIndex);
  assert.ok(artifactIndex >= 0, 'diagnostic artifact step must exist');
  assert.ok(nextStepIndex > artifactIndex, 'diagnostic artifact step must follow validation');
  const artifactStep = workflow.slice(artifactIndex, nextStepIndex);
  assert.ok(artifactStep.includes('if: always()'), 'artifact upload must run after a failed validation step');
  assert.ok(artifactStep.includes('actions/upload-artifact@v4'));
  assert.ok(artifactStep.includes('/tmp/lighthouse.json'));
  assert.ok(artifactStep.includes('/tmp/psi.log'));
  assert.ok(artifactStep.includes('retention-days: 7'));

  for (const metric of [
    'first-contentful-paint',
    'largest-contentful-paint',
    'speed-index',
    'total-blocking-time',
    'cumulative-layout-shift',
  ]) {
    assert.ok(workflow.includes(metric), `expected diagnostic metric ${metric}`);
  }
});
