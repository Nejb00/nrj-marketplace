import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeIncident } from '../scripts/incident-intelligence.mjs';
import { validateDiagnosis } from '../scripts/ai-assisted-diagnosis.mjs';
import { runSelfHealingE2E } from '../scripts/self-healing-e2e.mjs';
import { evaluateRepairVerification } from '../scripts/self-healing-verification.mjs';
import {
  isMergedRepairCandidate,
  selectRollbackCandidate,
  buildRollbackBranchName,
} from '../scripts/self-healing-rollback.mjs';

test('global resilience: controlled known incident reaches a fixture-only repair plan', () => {
  const result = runSelfHealingE2E();
  assert.equal(result.scenario, 'controlled-known-incident');
  assert.deepEqual(result.stages, [
    'incident',
    'incident-intelligence',
    'ai-diagnosis',
    'deterministic-validation',
    'recipe-selection',
    'dry-run',
    'repair-plan',
  ]);
  assert.equal(result.dry_run.would_write, false);
  assert.equal(result.dry_run.safety_result, 'passed');
  assert.equal(result.repository_effect, 'fixture-only; no GitHub writes');
});

test('global resilience: unknown incident cannot become a self-healing authorization', () => {
  const run = {
    id: 910001,
    name: 'CI',
    run_number: 9100,
    head_branch: 'main',
    head_sha: 'unknown-sha',
    conclusion: 'failure',
  };
  const intelligence = analyzeIncident({
    run,
    failedJobs: [{ id: 1, name: 'Build', conclusion: 'failure' }],
    logTexts: ['Unexpected failure with no known signature'],
    recipes: [{
      id: 'known-only',
      workflow: 'CI',
      enabled: true,
      signatures: ['Known error'],
    }],
  });

  assert.equal(intelligence.classification, 'unclassified-failure');

  const diagnosis = validateDiagnosis({
    intelligence,
    run,
    recipeIds: ['known-only'],
    responseText: JSON.stringify({
      schema_version: 1,
      classification: 'unclassified-failure',
      confidence: 0.99,
      likely_root_cause: 'Unknown',
      recommended_recipe_id: 'known-only',
      recommendation: 'self-healing',
      evidence: [],
      uncertainties: ['Unknown'],
    }),
  });

  assert.equal(diagnosis.status, 'blocked');
  assert.equal(diagnosis.recommendation, 'operator-review');
});

test('global resilience: repair verification rejects a failed mandatory security check', () => {
  const result = evaluateRepairVerification({
    browserRequired: false,
    checkRuns: [
      { name: 'Build', status: 'completed', conclusion: 'success' },
      { name: 'PR Quality Gate', status: 'completed', conclusion: 'success' },
      { name: 'Dependency Review', status: 'completed', conclusion: 'success' },
      { name: 'CodeQL', status: 'completed', conclusion: 'success' },
      { name: 'CodeQL (javascript-typescript)', status: 'completed', conclusion: 'failure' },
      { name: 'CodeQL (actions)', status: 'completed', conclusion: 'success' },
    ],
  });
  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.failed_checks, [
    { name: 'CodeQL (javascript-typescript)', conclusion: 'failure' },
  ]);
});

test('global resilience: rollback candidate requires a correlated merged repair', () => {
  const incidentRun = {
    id: 920001,
    head_branch: 'main',
    conclusion: 'failure',
    updated_at: '2026-10-05T10:00:00Z',
  };
  const candidate = {
    number: 900,
    base: { ref: 'main' },
    head: { ref: 'operator/self-heal-920000' },
    merged: true,
    merged_at: '2026-10-05T09:40:00Z',
    merge_commit_sha: 'abcdef1234567890',
    body: 'Incident: #77',
  };

  assert.equal(
    isMergedRepairCandidate({
      pullRequest: candidate,
      issueNumber: 77,
      incidentRun,
      now: Date.parse('2026-10-05T10:05:00Z'),
    }),
    true
  );

  const selected = selectRollbackCandidate({
    pullRequests: [candidate],
    issueNumber: 77,
    incidentRun,
    now: Date.parse('2026-10-05T10:05:00Z'),
  });
  assert.equal(selected.pull_request_number, 900);
  assert.equal(
    buildRollbackBranchName({
      runId: incidentRun.id,
      mergeCommitSha: candidate.merge_commit_sha,
    }),
    'operator/self-heal-rollback-920001-abcdef123456'
  );
});

test('global resilience: unrelated repair cannot become a rollback target', () => {
  const incidentRun = {
    head_branch: 'main',
    conclusion: 'failure',
    updated_at: '2026-10-05T10:00:00Z',
  };
  const unrelated = {
    number: 901,
    base: { ref: 'main' },
    head: { ref: 'feature/unrelated' },
    merged: true,
    merged_at: '2026-10-05T09:40:00Z',
    merge_commit_sha: 'abcdef1234567890',
    body: 'Incident: #77',
  };

  assert.equal(
    isMergedRepairCandidate({
      pullRequest: unrelated,
      issueNumber: 77,
      incidentRun,
      now: Date.parse('2026-10-05T10:05:00Z'),
    }),
    false
  );
});


test('global resilience: business invariant evidence never authorizes repair by itself', () => {
  const run = {
    id: 930001,
    name: 'CI',
    run_number: 9300,
    head_branch: 'main',
    head_sha: 'business-signal-sha',
    conclusion: 'failure',
  };

  const intelligence = analyzeIncident({
    run,
    failedJobs: [{ id: 1, name: 'Contrats métier déterministes', conclusion: 'failure' }],
    logTexts: ['Business contract violation: PAYMENT-003'],
    recipes: [],
  });

  assert.deepEqual(intelligence.business_invariant_matches, [{
    rule_id: 'PAYMENT-003',
    description: 'Payment has no idempotency key.',
  }]);
  assert.equal(intelligence.classification, 'unclassified-failure');
  assert.equal(intelligence.recommended_action, 'operator-review');

  const diagnosis = validateDiagnosis({
    responseText: JSON.stringify({
      schema_version: 1,
      classification: 'unclassified-failure',
      confidence: 0.99,
      likely_root_cause: 'Payment idempotency contract violation.',
      recommended_recipe_id: null,
      recommendation: 'self-healing',
      evidence: ['PAYMENT-003'],
      uncertainties: [],
      run_id: run.id,
      commit: run.head_sha,
    }),
    intelligence,
    run,
    recipeIds: [],
  });

  assert.equal(diagnosis.status, 'blocked');
  assert.equal(diagnosis.recommendation, 'operator-review');
});
