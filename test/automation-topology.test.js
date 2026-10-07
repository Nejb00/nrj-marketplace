import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractBusinessInvariantMatches } from '../scripts/incident-intelligence.mjs';

const topology = fs.readFileSync(
  new URL('../docs/automation-workflow-topology.md', import.meta.url),
  'utf8'
);

test('documents all critical self-healing boundaries', () => {
  for (const marker of [
    'Incident Guard',
    'AI-Assisted Diagnosis',
    'Self-Healing',
    'Repair Verification',
    'Safe Rollback',
  ]) {
    assert.ok(topology.includes(marker), 'missing ' + marker);
  }
});

test('documents the intentional PR fan-out', () => {
  for (const workflow of [
    'CI',
    'CodeQL',
    'Dependency Review',
    'PR Quality',
    'PR Labels',
    'Project Report',
  ]) {
    assert.ok(topology.includes(workflow), 'missing ' + workflow);
  }
});

test('does not propose removing core security gates', () => {
  assert.equal(/remove (CI|CodeQL|Dependency Review)/i.test(topology), false);
  assert.equal(/disable (CI|CodeQL|Dependency Review)/i.test(topology), false);
});


test('incident intelligence extracts stable business invariant signals', () => {
  const result = extractBusinessInvariantMatches([
    'Assertion failed: CART-004 quantity below MOQ',
    'ORDER-009 total drift detected',
    'CART-004 repeated safely',
  ]);

  assert.deepEqual(result, [
    { rule_id: 'CART-004', description: 'Cart quantity violates the product MOQ.' },
    { rule_id: 'ORDER-009', description: 'Order total does not match the stored line arithmetic.' },
  ]);
});
