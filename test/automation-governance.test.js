import test from 'node:test';
import assert from 'node:assert/strict';
import { runAutomationGovernance } from '../scripts/automation-governance.mjs';

test('governance coordinator aggregates healthy inputs', () => {
  const report = runAutomationGovernance({
    changedFiles: ['README.md'],
    integrity: { duplicates: [], orphans: [] },
    database: { orders: [], payments: [] },
    securityFiles: [{ path: 'src/app.js', content: 'const x = 1;' }],
    repair: {
      run: { head_branch: 'main', conclusion: 'failure' },
      recipe: { path: 'src/app.js', find: 'a', replace: 'b' },
    },
    payment: { orders: [], payments: [] },
  });

  assert.equal(report.status, 'healthy');
  assert.equal(report.blocking_signal_count, 0);
});

test('governance coordinator raises attention for integrity findings', () => {
  const report = runAutomationGovernance({
    integrity: {
      duplicates: [],
      orphans: [{ check_name: 'logical-reference', orphan_count: 2 }],
    },
    payment: { orders: [], payments: [] },
  });

  assert.equal(report.status, 'attention-required');
  assert.equal(report.layers.integrity.orphan_count, 2);
});
