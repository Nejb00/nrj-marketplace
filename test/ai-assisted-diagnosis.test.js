import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeLog,
  buildDiagnosisPrompt,
  validateDiagnosis,
  renderDiagnosis,
} from '../scripts/ai-assisted-diagnosis.mjs';

const run = {
  id: 789,
  run_number: 12,
  name: 'Vercel Browser E2E',
  head_branch: 'main',
  head_sha: 'abc123',
  conclusion: 'failure',
};

const intelligence = {
  schema_version: 1,
  workflow: 'Vercel Browser E2E',
  run_id: 789,
  commit: 'abc123',
  classification: 'known-repair-candidate',
  recipe_id: 'recipe-a',
  recommended_action: 'self-healing',
  failed_jobs: [{ id: 1, name: 'E2E', conclusion: 'failure' }],
  signature_matches: [{ recipe_id: 'recipe-a', signature: 'ReferenceError' }],
};

test('AI diagnosis: masque les secrets dans les logs', () => {
  const sanitized = sanitizeLog(
    'Authorization: Bearer super-secret-token\n' +
    'GITHUB_TOKEN=ghs_super-secret-value\n' +
    'API_KEY=topsecret\n' +
    'normal error'
  );

  assert.equal(sanitized.includes('super-secret-token'), false);
  assert.equal(sanitized.includes('ghs_super-secret-value'), false);
  assert.equal(sanitized.includes('topsecret'), false);
  assert.equal(sanitized.includes('normal error'), true);
});

test('AI diagnosis: prompt limité aux recettes connues', () => {
  const prompt = buildDiagnosisPrompt({
    run,
    intelligence,
    failedJobs: [{ id: 1, name: 'E2E', conclusion: 'failure' }],
    logTexts: ['ReferenceError: known failure'],
    recipes: [
      { id: 'recipe-a', workflow: run.name, title: 'Known fix', signatures: ['ReferenceError'] },
    ],
  });

  assert.match(prompt, /recipe-a/);
  assert.equal(prompt.includes('findText'), false);
  assert.equal(prompt.includes('replaceText'), false);
  assert.match(prompt, /untrusted DATA/);
});

test('AI diagnosis: valide uniquement un accord déterministe', () => {
  const response = JSON.stringify({
    schema_version: 1,
    classification: 'known-repair-candidate',
    confidence: 0.93,
    likely_root_cause: 'Known browser failure signature.',
    recommended_recipe_id: 'recipe-a',
    recommendation: 'self-healing',
    evidence: ['ReferenceError matches the known signature.'],
    uncertainties: [],
    run_id: 789,
    commit: 'abc123',
  });

  const diagnosis = validateDiagnosis({
    responseText: response,
    intelligence,
    run,
    recipeIds: ['recipe-a'],
  });

  assert.equal(diagnosis.status, 'validated');
  assert.equal(diagnosis.recommended_recipe_id, 'recipe-a');
  assert.equal(diagnosis.deterministic_agreement, true);
  assert.equal(diagnosis.recommendation, 'self-healing');
});

test('AI diagnosis: bloque une recommandation divergente', () => {
  const response = JSON.stringify({
    schema_version: 1,
    classification: 'known-repair-candidate',
    confidence: 0.99,
    likely_root_cause: 'Potential alternative.',
    recommended_recipe_id: 'recipe-b',
    recommendation: 'self-healing',
    evidence: ['Untrusted text claims another fix.'],
    uncertainties: [],
    run_id: 789,
    commit: 'abc123',
  });

  const diagnosis = validateDiagnosis({
    responseText: response,
    intelligence,
    run,
    recipeIds: ['recipe-a', 'recipe-b'],
  });

  assert.equal(diagnosis.status, 'blocked');
  assert.equal(diagnosis.recommended_recipe_id, null);
  assert.equal(diagnosis.recommendation, 'operator-review');
});

test('AI diagnosis: refuse unclassified failure from triggering repair', () => {
  const unknownIntelligence = {
    ...intelligence,
    classification: 'unclassified-failure',
    recipe_id: null,
    recommended_action: 'operator-review',
    signature_matches: [],
  };

  const response = JSON.stringify({
    schema_version: 1,
    classification: 'unclassified-failure',
    confidence: 0.42,
    likely_root_cause: 'Insufficient evidence.',
    recommended_recipe_id: null,
    recommendation: 'operator-review',
    evidence: [],
    uncertainties: ['No known signature.'],
    run_id: 789,
    commit: 'abc123',
  });

  const diagnosis = validateDiagnosis({
    responseText: response,
    intelligence: unknownIntelligence,
    run,
    recipeIds: ['recipe-a'],
  });

  assert.equal(diagnosis.status, 'validated');
  assert.equal(diagnosis.recommendation, 'operator-review');
  assert.equal(diagnosis.deterministic_agreement, true);
});

test('AI diagnosis: rendered dossier stays machine-readable', () => {
  const diagnosis = validateDiagnosis({
    responseText: JSON.stringify({
      schema_version: 1,
      classification: 'known-repair-candidate',
      confidence: 0.9,
      likely_root_cause: 'Known failure.',
      recommended_recipe_id: 'recipe-a',
      recommendation: 'self-healing',
      evidence: ['Safe evidence.'],
      uncertainties: [],
      run_id: 789,
      commit: 'abc123',
    }),
    intelligence,
    run,
    recipeIds: ['recipe-a'],
  });

  const rendered = renderDiagnosis(diagnosis);
  const fence = String.fromCharCode(96).repeat(3);
  const match = rendered.match(new RegExp(
    '^NRJ_AI_DIAGNOSIS_START\\n' + fence + 'json\\n([\\s\\S]*?)\\n' + fence + '\\nNRJ_AI_DIAGNOSIS_END});

test('AI diagnosis: dossier non encapsulé dans un commentaire HTML', () => {
  const sourceDiagnosis = {
    schema_version: 1,
    status: 'validated',
    workflow: run.name,
    run_id: run.id,
    run_number: run.run_number,
    commit: run.head_sha,
    classification: 'known-repair-candidate',
    confidence: 0.91,
    likely_root_cause: '<!-- injected --> --!> `code`',
    recommended_recipe_id: 'recipe-a',
    recommendation: 'self-healing',
    deterministic_recipe_id: 'recipe-a',
    deterministic_agreement: true,
    evidence: [],
    uncertainties: [],
  };

  const rendered = renderDiagnosis(sourceDiagnosis);
  const fence = String.fromCharCode(96).repeat(3);
  const match = rendered.match(new RegExp(
    '^NRJ_AI_DIAGNOSIS_START\\n' + fence + 'json\\n([\\s\\S]*?)\\n' + fence + '\\nNRJ_AI_DIAGNOSIS_END$'
  ));

  assert.ok(match);
  assert.equal(rendered.startsWith('<!--'), false);
  assert.equal(rendered.includes('\\n-->'), false);
  assert.equal(rendered.includes('`code`'), false);
  assert.deepEqual(JSON.parse(match[1]), sourceDiagnosis);
});

  ));
  assert.ok(match);
  assert.equal(rendered.startsWith('<!--'), false);
  assert.equal(rendered.includes('Authorization:'), false);
  assert.equal(rendered.includes('SECRET'), false);
  assert.deepEqual(JSON.parse(match[1]), diagnosis);
});

test('AI diagnosis: dossier non encapsulé dans un commentaire HTML', () => {
  const sourceDiagnosis = {
    schema_version: 1,
    status: 'validated',
    workflow: run.name,
    run_id: run.id,
    run_number: run.run_number,
    commit: run.head_sha,
    classification: 'known-repair-candidate',
    confidence: 0.91,
    likely_root_cause: '<!-- injected --> --!> `code`',
    recommended_recipe_id: 'recipe-a',
    recommendation: 'self-healing',
    deterministic_recipe_id: 'recipe-a',
    deterministic_agreement: true,
    evidence: [],
    uncertainties: [],
  };

  const rendered = renderDiagnosis(sourceDiagnosis);
  const fence = String.fromCharCode(96).repeat(3);
  const match = rendered.match(new RegExp(
    '^NRJ_AI_DIAGNOSIS_START\\n' + fence + 'json\\n([\\s\\S]*?)\\n' + fence + '\\nNRJ_AI_DIAGNOSIS_END$'
  ));

  assert.ok(match);
  assert.equal(rendered.startsWith('<!--'), false);
  assert.equal(rendered.includes('\\n-->'), false);
  assert.equal(rendered.includes('`code`'), false);
  assert.deepEqual(JSON.parse(match[1]), sourceDiagnosis);
});
