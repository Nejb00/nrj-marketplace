import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRecoveryPolicy, selectRecoveryAction } from '../scripts/recovery-guard.mjs';

test('recovery policy allows one correlated regression rollback', () => {
  const result = selectRecoveryAction({
    correlated: true, mergedRepair: true, regressionDetected: true,
    recentRollbackCount: 0, ageMinutes: 10,
  });
  assert.equal(result.status, 'eligible');
  assert.equal(result.action, 'prepare-draft-rollback');
});

test('recovery policy trips after rollback budget is exhausted', () => {
  const result = evaluateRecoveryPolicy({
    correlated: true, mergedRepair: true, regressionDetected: true,
    recentRollbackCount: 1, ageMinutes: 10,
  });
  assert.equal(result.status, 'blocked');
  assert.ok(result.failures.includes('rollback-circuit-breaker'));
});
