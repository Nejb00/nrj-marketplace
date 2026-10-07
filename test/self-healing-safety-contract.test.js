import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const incidentGuard = read('.github/workflows/incident-guard.yml');
const aiDiagnosis = read('.github/workflows/ai-assisted-diagnosis.yml');
const aiDiagnosisModule = read('scripts/ai-assisted-diagnosis.mjs');
const selfHealing = read('.github/workflows/self-healing.yml');
const verification = read('.github/workflows/self-healing-verification.yml');

test('incident pipeline monitors all repair-eligible production checks', () => {
  for (const workflow of ['CI', 'CodeQL', 'Dependency Review', 'Deployment Safety Net', 'Vercel Browser E2E']) {
    assert.ok(incidentGuard.includes('- ' + workflow), 'Missing Incident Guard workflow: ' + workflow);
  }
});

test('AI diagnosis cannot authorize arbitrary issues or stale failures', () => {
  assert.ok(aiDiagnosis.includes("const sourceAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR', 'BOT'])"));
  assert.ok(aiDiagnosis.includes("issue.title?.startsWith('🚨 Incident — ')"));
  assert.ok(aiDiagnosis.includes('run.head_branch === \'main\''));
  assert.ok(aiDiagnosis.includes('Date.now() - new Date(run.updated_at).getTime() <= 24 * 60 * 60 * 1000'));
  assert.ok(aiDiagnosis.includes("workflow_id: 'self-healing.yml'"));
});

test('self-healing requires validated AI diagnosis bound to exact run and commit', () => {
  assert.ok(selfHealing.includes("aiDiagnosis?.status === 'validated'"));
  assert.ok(selfHealing.includes("aiDiagnosis?.recommendation === 'self-healing'"));
  assert.ok(selfHealing.includes('Number(aiDiagnosis?.run_id) === runId'));
  assert.ok(selfHealing.includes('aiDiagnosis.commit === run.head_sha'));
});

test('self-healing applies deterministic one-occurrence recipes and Draft PRs', () => {
  assert.ok(selfHealing.includes('const occurrences = current.split(findText).length - 1'));
  assert.ok(selfHealing.includes('occurrences !== 1'));
  assert.ok(selfHealing.includes('await github.rest.git.createRef'));
  assert.ok(selfHealing.includes('draft: true'));
  assert.ok(selfHealing.includes('Aucun changement direct n’a été appliqué à `main`'));
});

test('repair verification is restricted to operator self-healing branches and required checks', () => {
  assert.ok(verification.includes("startsWith(github.event.pull_request.head.ref, 'operator/self-heal-')"));
  for (const check of ['Build', 'Dependency Review', 'CodeQL', 'CodeQL (javascript-typescript)', 'CodeQL (actions)']) {
    assert.ok(verification.includes("'" + check + "'"), 'Missing verification check: ' + check);
  }
});


test('business and integrity signals stay diagnostic-only', () => {
  assert.ok(aiDiagnosisModule.includes('business_invariant_matches'));
  assert.ok(aiDiagnosisModule.includes('integrity_matches'));
  assert.ok(selfHealing.includes("aiDiagnosis?.recommendation === 'self-healing'"));
});
