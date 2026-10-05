import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRepair, renderSimulation } from '../scripts/self-healing-simulation.mjs';

const run = {
  id: 456,
  name: 'Vercel Browser E2E',
  head_sha: 'deadbeef',
};

const recipe = {
  id: 'e2e-missing-refresh-cart-display-import',
};

test('dry-run: simule une réparation éligible sans écriture', () => {
  const findText = 'old import\n';
  const replaceText = 'old import\nnew import\n';

  const result = simulateRepair({
    recipe,
    run,
    path: 'src/example.js',
    current: findText + 'body\n',
    findText,
    replaceText,
  });

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.would_write, false);
  assert.equal(result.eligible, true);
  assert.equal(result.occurrences, 1);
  assert.equal(result.replacement_count, 1);
  assert.equal(result.would_create_branch, true);
  assert.equal(result.would_create_draft_pr, true);
  assert.equal(result.safety_result, 'passed');
});

test('dry-run: bloque une cible ambiguë', () => {
  const findText = 'old import\n';

  const result = simulateRepair({
    recipe,
    run,
    path: 'src/example.js',
    current: findText + findText,
    findText,
    replaceText: 'new import\n',
  });

  assert.equal(result.would_write, false);
  assert.equal(result.eligible, false);
  assert.equal(result.occurrences, 2);
  assert.equal(result.replacement_count, 0);
  assert.equal(result.would_create_branch, false);
  assert.equal(result.would_create_draft_pr, false);
  assert.equal(result.safety_result, 'blocked');
});

test('dry-run: le dossier ne contient pas de contenu de fichier', () => {
  const secretSource = 'SECRET_VALUE=should-not-appear';
  const result = simulateRepair({
    recipe,
    run,
    path: '.env',
    current: secretSource,
    findText: secretSource,
    replaceText: 'redacted',
  });

  const rendered = renderSimulation(result);

  assert.equal(result.would_write, false);
  assert.equal(rendered.includes(secretSource), false);
  assert.match(rendered, /^<!-- nrj-self-healing-dry-run\n/);
  assert.match(rendered, /\n-->$/);
});
