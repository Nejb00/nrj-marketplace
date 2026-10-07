import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProductionGate } from '../scripts/production-guard.mjs';

test('production gate requires all positive signals', () => {
  const result = evaluateProductionGate({
    deploymentState: 'success',
    smokePassed: true,
    browserE2EPassed: true,
    openIncidents: 0,
  });
  assert.equal(result.status, 'ready');
});

test('production gate blocks with a missing browser E2E', () => {
  const result = evaluateProductionGate({
    deploymentState: 'success',
    smokePassed: true,
    browserE2EPassed: false,
  });
  assert.ok(result.failures.includes('browser-e2e-not-passed'));
});
