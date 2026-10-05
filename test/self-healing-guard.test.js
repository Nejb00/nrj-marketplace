import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRepairGuard, canAutoRepair } from '../scripts/self-healing-guard.mjs';

const valid = {
  run: { head_branch: 'main', conclusion: 'failure', updated_at: '2026-10-05T18:00:00Z' },
  recipe: { path: 'src/js/app.js', find: 'old', replace: 'new' },
  attemptCount: 0,
  now: Date.parse('2026-10-05T18:30:00Z'),
};

test('self-healing guard allows a fresh deterministic repair', () => assert.equal(canAutoRepair(valid), true));
test('self-healing guard blocks repeated attempts', () => {
  const result = evaluateRepairGuard({ ...valid, attemptCount: 1 });
  assert.deepEqual(result.failures, ['repair-already-attempted']);
});
test('self-healing guard blocks sensitive targets', () => {
  const result = evaluateRepairGuard({ ...valid, recipe: { ...valid.recipe, path: '.github/workflows/self-healing.yml' } });
  assert.ok(result.failures.includes('sensitive-target'));
});
