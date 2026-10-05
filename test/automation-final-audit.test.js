import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAutomationSurface } from '../scripts/automation-final-audit.mjs';

test('final automation audit sees the required Self-Healing surface', () => {
  const report = auditAutomationSurface();
  assert.equal(report.status, 'complete');
  assert.equal(report.missing_files.length, 0);
  assert.equal(report.missing_workflows.length, 0);
});
