import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePullRequest } from '../scripts/git-pr-intelligence.mjs';

test('PR intelligence detects a branch behind main', () => {
  const result = analyzePullRequest({ aheadBy: 5, behindBy: 2, head: 'feature/x' });
  assert.ok(result.findings.includes('behind-main'));
  assert.equal(result.ready, false);
});

test('PR intelligence recognizes a clean ready PR', () => {
  const result = analyzePullRequest({ aheadBy: 2, behindBy: 0, changedFiles: 3, head: 'feature/x' });
  assert.equal(result.status, 'clean');
  assert.equal(result.ready, true);
});

test('PR intelligence flags failed required checks', () => {
  const result = analyzePullRequest({ requiredFailures: 1, head: 'feature/x' });
  assert.ok(result.findings.includes('required-check-failure'));
});
