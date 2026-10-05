import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(
  new URL('../.github/workflows/project-report.yml', import.meta.url),
  'utf8'
);

test('Project Report runs on PRs and manual dispatch', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
});

test('Project Report does not run on push to main', () => {
  assert.doesNotMatch(workflow, /\n\s*push:\s*\n\s*branches:\s*\[main\]/);
});

test('Project Report remains a read-only reporting workflow', () => {
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /upload-artifact@v7\.0\.1/);
});
