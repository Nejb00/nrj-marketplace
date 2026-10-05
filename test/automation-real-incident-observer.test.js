import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure, summarizeFailures } from '../scripts/automation-real-incident-observer.mjs';

test('marks supported Self-Healing workflows', () => {
  assert.equal(classifyFailure({ name: 'CI', conclusion: 'failure' }).supported_by_self_healing, true);
  assert.equal(classifyFailure({ name: 'CodeQL', conclusion: 'failure' }).supported_by_self_healing, true);
});

test('marks operational sync failures outside current Self-Healing scope', () => {
  assert.equal(classifyFailure({ name: 'Synchro GitHub <-> Google Drive', conclusion: 'failure' }).supported_by_self_healing, false);
  assert.equal(classifyFailure({ name: 'Sync Repository Structure to Notion', conclusion: 'failure' }).supported_by_self_healing, false);
});

test('summarizes real failure coverage without mutations', () => {
  const result = summarizeFailures([
    { name: 'CI', conclusion: 'failure', id: 1 },
    { name: 'Synchro GitHub <-> Google Drive', conclusion: 'failure', id: 2 },
    { name: 'Success', conclusion: 'success', id: 3 },
  ]);
  assert.equal(result.sample_size, 2);
  assert.equal(result.supported_failures, 1);
  assert.equal(result.unsupported_failures, 1);
});