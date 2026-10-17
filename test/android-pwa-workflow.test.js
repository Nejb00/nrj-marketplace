import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Android PWA workflow preserves Lighthouse diagnostics when thresholds fail', async () => {
  const workflow = await readFile('.github/workflows/android-pwa-package.yml', 'utf8');

  assert.match(workflow, /perf >= 0\\.8/);
  assert.match(workflow, /pwa == 1/);
  assert.match(
    workflow,
    /Upload Lighthouse diagnostics \\(even on failure\\)[\\s\\S]*?if: always\\(\\)[\\s\\S]*?actions\\/upload-artifact@v4/
  );
  assert.match(workflow, /nrj-pwa-lighthouse-diagnostics-/);
  assert.match(workflow, /\\/tmp\\/lighthouse\\.json/);
  assert.match(workflow, /\\/tmp\\/psi\\.log/);
  assert.match(workflow, /largest-contentful-paint/);
  assert.match(workflow, /total-blocking-time/);
  assert.match(workflow, /cumulative-layout-shift/);
  assert.match(workflow, /Upload Lighthouse diagnostics[\\s\\S]*?retention-days: 7/);
});
