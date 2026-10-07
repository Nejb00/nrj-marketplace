import test from 'node:test';
import assert from 'node:assert/strict';
import { correlateSignals } from '../scripts/cross-system-correlation.mjs';

test('correlation links only proven system relationships', () => {
  const result = correlateSignals({
    github: { commit: 'abc' },
    supabase: { migrationDrift: false, integrityIssueCount: 0 },
    vercel: { deploymentCommit: 'abc', status: 'success' },
  });

  assert.deepEqual(result.links, ['git-vercel']);
  assert.equal(result.risk_score, 0);
});
