import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIncident, renderIncidentIntelligence } from '../scripts/incident-intelligence.mjs';

const run = {
  id: 123,
  run_number: 45,
  name: 'Vercel Browser E2E',
  head_branch: 'main',
  head_sha: 'abc123',
  conclusion: 'failure',
};

const recipeCatalog = [{
  id: 'e2e-missing-refresh-cart-display-import',
  enabled: true,
  workflow: 'Vercel Browser E2E',
  signatures: ['refreshCartDisplay is not defined'],
}];

test('incident intelligence: classe une signature connue', () => {
  const intel = analyzeIncident({
    run,
    failedJobs: [{ id: 10, name: 'E2E', conclusion: 'failure' }],
    logTexts: ['ReferenceError: refreshCartDisplay is not defined'],
    recipes: recipeCatalog,
  });

  assert.equal(intel.schema_version, 3);
  assert.equal(intel.classification, 'known-repair-candidate');
  assert.equal(intel.recipe_id, 'e2e-missing-refresh-cart-display-import');
  assert.equal(intel.recommended_action, 'self-healing');
  assert.deepEqual(intel.signature_matches, [{
    recipe_id: 'e2e-missing-refresh-cart-display-import',
    signature: 'refreshCartDisplay is not defined',
  }]);
});

test('incident intelligence: refuse unclassified failure', () => {
  const intel = analyzeIncident({
    run,
    failedJobs: [{ id: 11, name: 'Build', conclusion: 'failure' }],
    logTexts: ['Error: unknown build failure'],
    recipes: recipeCatalog,
  });

  assert.equal(intel.classification, 'unclassified-failure');
  assert.equal(intel.recipe_id, null);
  assert.equal(intel.recommended_action, 'operator-review');
  assert.deepEqual(intel.signature_matches, []);
});

test('incident intelligence: aucun log brut dans le dossier', () => {
  const intel = analyzeIncident({
    run,
    failedJobs: [{ id: 12, name: 'Build', conclusion: 'failure' }],
    logTexts: ['SECRET_VALUE=should-not-appear'],
    recipes: recipeCatalog,
  });

  const rendered = renderIncidentIntelligence(intel);
  assert.equal(rendered.includes('SECRET_VALUE'), false);
  assert.equal(rendered.includes('should-not-appear'), false);
  assert.match(rendered, /^<!-- nrj-incident-intelligence\n/);
  assert.match(rendered, /\n-->$/);
});


test('incident intelligence: expose les violations métier paiement sans autoriser l auto-fix', () => {
  const intel = analyzeIncident({
    run: {
      ...run,
      name: 'CI',
    },
    failedJobs: [{ id: 13, name: 'Build', conclusion: 'failure' }],
    logTexts: [
      'Business contract violation: PAYMENT-003 idempotency key missing',
      'Business contract violation: PAYMENT-007 settled payment missing paid_at',
    ],
    recipes: [],
  });

  assert.deepEqual(intel.business_invariant_matches, [
    {
      rule_id: 'PAYMENT-003',
      description: 'Payment has no idempotency key.',
    },
    {
      rule_id: 'PAYMENT-007',
      description: 'Settled payment has no paid_at timestamp.',
    },
  ]);
  assert.equal(intel.classification, 'unclassified-failure');
  assert.equal(intel.recipe_id, null);
  assert.equal(intel.recommended_action, 'operator-review');
});


test('incident intelligence: expose les signaux de doublons et d orphelins sans autoriser l auto-fix', () => {
  const intel = analyzeIncident({
    run: { ...run, name: 'Data Integrity' },
    failedJobs: [{ id: 14, name: 'Duplicate + orphan audit', conclusion: 'failure' }],
    logTexts: [
      'DUP-001 detected in payment_order_live_duplicates',
      'ORPHAN-001 detected in product_views.product_id -> products.id',
    ],
    recipes: [],
  });

  assert.deepEqual(intel.integrity_matches, [
    {
      rule_id: 'DUP-001',
      description: 'A configured duplicate check found multiple rows for the same integrity key.',
    },
    {
      rule_id: 'ORPHAN-001',
      description: 'A child/reference row points to a missing parent row.',
    },
  ]);
  assert.equal(intel.classification, 'unclassified-failure');
  assert.equal(intel.recipe_id, null);
  assert.equal(intel.recommended_action, 'operator-review');
});
