import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChangedFiles, selectTestScopes, summarizeTestImpact } from '../scripts/test-intelligence.mjs';

test('test intelligence classifies payment changes as critical', () => {
  const result = summarizeTestImpact(['src/js/services/payment.js']);
  assert.equal(result.max_risk, 'critical');
  assert.ok(result.required_scopes.includes('e2e'));
  assert.ok(result.required_scopes.includes('integration'));
});

test('test intelligence expands dependency changes to security coverage', () => {
  const scopes = selectTestScopes(['package.json']);
  assert.ok(scopes.includes('dependency'));
  assert.ok(scopes.includes('security'));
});

test('test intelligence is deterministic', () => {
  const files = ['README.md', 'test/a.test.js', '.github/workflows/ci.yml'];
  assert.deepEqual(classifyChangedFiles(files), classifyChangedFiles(files));
});
