import test from 'node:test';
import assert from 'node:assert/strict';
import { runSelfHealingE2E } from '../scripts/self-healing-e2e.mjs';

test('full self-healing E2E: traverse toutes les étapes sur incident contrôlé', () => {
  const result = runSelfHealingE2E();

  assert.deepEqual(result.stages, [
    'incident',
    'incident-intelligence',
    'ai-diagnosis',
    'deterministic-validation',
    'recipe-selection',
    'dry-run',
    'repair-plan',
  ]);
  assert.equal(result.scenario, 'controlled-known-incident');
  assert.equal(result.diagnosis.status, 'validated');
  assert.equal(result.diagnosis.deterministic_agreement, true);
  assert.equal(result.diagnosis.recipe_id, 'e2e-missing-refresh-cart-display-import');
  assert.equal(result.dry_run.eligible, true);
  assert.equal(result.dry_run.would_write, false);
  assert.equal(result.dry_run.would_create_branch, true);
  assert.equal(result.dry_run.would_create_draft_pr, true);
  assert.equal(result.dry_run.safety_result, 'passed');
  assert.equal(result.repository_effect, 'fixture-only; no GitHub writes');
});
