import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarizeAutomationHealth, normalizeWorkflowConclusion } from '../scripts/observability-model.mjs';

test('observability ignores developer branch failures for global main health', () => {
  const result = summarizeAutomationHealth({
    workflowRuns: [
      { head_branch: 'feature/foo', status: 'completed', conclusion: 'failure' },
      { head_branch: 'main', status: 'completed', conclusion: 'success' },
    ],
  });
  assert.equal(result.status, 'healthy');
  assert.equal(result.failed_runs, 0);
});

test('observability reports main branch failures', () => {
  const result = summarizeAutomationHealth({
    workflowRuns: [{ head_branch: 'main', status: 'completed', conclusion: 'failure' }],
  });
  assert.equal(result.status, 'degraded');
});

test('workflow conclusion normalization is stable', () => {
  assert.equal(normalizeWorkflowConclusion({ status: 'in_progress' }), 'pending');
  assert.equal(normalizeWorkflowConclusion({ status: 'completed', conclusion: 'success' }), 'success');
  assert.equal(normalizeWorkflowConclusion({ status: 'completed', conclusion: 'failure' }), 'failure');
});


test('global observability excludes its own in-progress run from the snapshot', () => {
  const workflowPath = new URL('../.github/workflows/global-observability.yml', import.meta.url);
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  assert.match(
    workflow,
    /item\.state === 'active'\s*&&\s*item\.path !== selfWorkflowPath/,
  );
  assert.match(workflow, /const selfWorkflowPath = '\.github\/workflows\/global-observability\.yml';/);
});
