import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTestHistory, classifyFlakiness } from '../scripts/test-health.mjs';

test('test health summarizes failures and cancellations', () => {
  const result = summarizeTestHistory([
    { conclusion: 'success' },
    { conclusion: 'failure' },
    { conclusion: 'success' },
    { conclusion: 'cancelled' },
  ]);
  assert.equal(result.total, 4);
  assert.equal(result.failures, 1);
  assert.equal(result.cancellations, 1);
  assert.equal(result.health, 'watch');
});

test('flakiness classifier identifies alternating outcomes', () => {
  const result = classifyFlakiness(['success', 'failure', 'success', 'failure']);
  assert.equal(result.status, 'possible-flake');
});

test('flakiness classifier recognizes stable outcomes', () => {
  const result = classifyFlakiness(['success', 'success', 'success']);
  assert.equal(result.status, 'stable');
});
