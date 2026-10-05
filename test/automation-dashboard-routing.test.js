import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/automation-dashboard.yml', 'utf8');

test('dashboard uses low-noise trigger strategy', () => {
  assert.match(
    workflow,
    /pull_request:\n\s+branches: \[main\]\n\s+types: \[opened, closed, reopened\]/
  );
  assert.match(
    workflow,
    /workflow_run:\n\s+workflows:\n\s+- CI\n\s+types: \[completed\]/
  );
  assert.doesNotMatch(workflow, /^\s+push:\s*$/m);
  assert.doesNotMatch(workflow, /^\s+deployment_status:\s*$/m);
  assert.doesNotMatch(workflow, /types: \[[^\]]*synchronize[^\]]*\]/);
});

test('dashboard keeps periodic, manual and release refresh paths', () => {
  assert.match(workflow, /schedule:\n\s+- cron: "\*\/30 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /release:\n\s+types: \[published, edited, deleted\]/);
});
