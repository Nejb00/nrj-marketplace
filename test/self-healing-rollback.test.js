import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMergedRepairCandidate,
  selectRollbackCandidate,
  buildRollbackBranchName,
  buildRollbackTitle,
  renderRollbackMarker,
} from '../scripts/self-healing-rollback.mjs';

const incidentRun = {
  id: 900,
  head_branch: 'main',
  conclusion: 'failure',
  updated_at: '2026-10-05T05:00:00Z',
};

function repair(overrides = {}) {
  return {
    number: 101,
    title: 'fix(automation): self-healing repair',
    body: '## Self-Healing V2\n- Incident : #77',
    merged: true,
    merged_at: '2026-10-05T04:45:00Z',
    merge_commit_sha: 'a'.repeat(40),
    base: { ref: 'main' },
    head: { ref: 'operator/self-heal-900-123' },
    html_url: 'https://github.com/example/repo/pull/101',
    ...overrides,
  };
}

test('rollback: reconnaît une réparation opérateur récemment fusionnée', () => {
  assert.equal(
    isMergedRepairCandidate({
      pullRequest: repair(),
      issueNumber: 77,
      incidentRun,
      now: '2026-10-05T05:05:00Z',
    }),
    true,
  );
});

test('rollback: choisit la réparation fusionnée la plus récente', () => {
  const candidate = selectRollbackCandidate({
    pullRequests: [
      repair({
        number: 100,
        merged_at: '2026-10-05T04:30:00Z',
        merge_commit_sha: 'b'.repeat(40),
      }),
      repair({
        number: 101,
        merged_at: '2026-10-05T04:45:00Z',
      }),
    ],
    issueNumber: 77,
    incidentRun,
    now: '2026-10-05T05:05:00Z',
  });

  assert.equal(candidate.pull_request_number, 101);
  assert.equal(candidate.merge_commit_sha, 'a'.repeat(40));
});

test('rollback: rejette les réparations sans référence à l’incident', () => {
  assert.equal(
    isMergedRepairCandidate({
      pullRequest: repair({ body: 'Self-Healing V2 sans incident lié' }),
      issueNumber: 77,
      incidentRun,
      now: '2026-10-05T05:05:00Z',
    }),
    false,
  );
});

test('rollback: rejette une réparation trop ancienne ou non fusionnée', () => {
  assert.equal(
    isMergedRepairCandidate({
      pullRequest: repair({ merged_at: '2026-10-03T01:00:00Z' }),
      issueNumber: 77,
      incidentRun,
      now: '2026-10-05T05:05:00Z',
      maxAgeHours: 24,
    }),
    false,
  );

  assert.equal(
    isMergedRepairCandidate({
      pullRequest: repair({ merged: false, merged_at: null }),
      issueNumber: 77,
      incidentRun,
      now: '2026-10-05T05:05:00Z',
    }),
    false,
  );
});

test('rollback: branche déterministe et titre explicite', () => {
  const sha = 'ABCDEF1234567890ABCDEF1234567890ABCDEF12';
  assert.equal(
    buildRollbackBranchName({ runId: 900, mergeCommitSha: sha }),
    'operator/self-heal-rollback-900-abcdef123456',
  );
  assert.equal(buildRollbackTitle({ repairPrNumber: 101 }), 'revert(automation): rollback self-healing repair #101');
  assert.equal(renderRollbackMarker(), '<!-- nrj-self-healing-rollback -->');
});
