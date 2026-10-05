import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRepairVerification,
  renderRepairVerification,
} from '../scripts/self-healing-verification.mjs';

const allGreen = [
  'Build',
  'PR Quality Gate',
  'Dependency Review',
  'CodeQL',
  'CodeQL (javascript-typescript)',
  'CodeQL (actions)',
].map((name) => ({ name, status: 'completed', conclusion: 'success' }));

test('repair verification: valide quand tous les checks requis sont verts', () => {
  const result = evaluateRepairVerification({ checkRuns: allGreen });

  assert.equal(result.status, 'verified');
  assert.equal(result.failed_checks.length, 0);
  assert.equal(result.pending_checks.length, 0);
  assert.equal(result.passed_checks.length, 6);
});

test('repair verification: attend un check encore en cours', () => {
  const checks = allGreen.map((check) =>
    check.name === 'Build'
      ? { ...check, status: 'in_progress', conclusion: null }
      : check
  );
  const result = evaluateRepairVerification({ checkRuns: checks });

  assert.equal(result.status, 'pending');
  assert.deepEqual(result.pending_checks, ['Build']);
});

test('repair verification: rejette un check en échec', () => {
  const checks = allGreen.map((check) =>
    check.name === 'CodeQL' ? { ...check, conclusion: 'failure' } : check
  );
  const result = evaluateRepairVerification({ checkRuns: checks });

  assert.equal(result.status, 'rejected');
  assert.deepEqual(result.failed_checks, [
    { name: 'CodeQL', conclusion: 'failure' },
  ]);
});

test('repair verification: exige E2E navigateur quand requis', () => {
  const result = evaluateRepairVerification({
    checkRuns: allGreen,
    browserRequired: true,
  });

  assert.equal(result.status, 'pending');
  assert.deepEqual(result.pending_checks, ['Vercel Browser E2E']);
});

test('repair verification: dossier machine-readable sans patch', () => {
  const result = evaluateRepairVerification({ checkRuns: allGreen });
  const rendered = renderRepairVerification(result);

  assert.match(rendered, /^<!-- nrj-self-healing-repair-verification\n/);
  assert.equal(rendered.includes('findText'), false);
  assert.equal(rendered.includes('replaceText'), false);
});
