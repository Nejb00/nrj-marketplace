export const INCIDENT_INTELLIGENCE_VERSION = 2;

const BUSINESS_RULES = {
  'CART-001': 'Cart line references an invalid product identifier.',
  'CART-002': 'Cart quantity is not a positive integer.',
  'CART-003': 'Cart MOQ is invalid.',
  'CART-004': 'Cart quantity violates the product MOQ.',
  'CART-005': 'Cart selected flag is invalid.',
  'CART-006': 'Cart contains a duplicate product/variant line.',
  'ORDER-001': 'Order has no items.',
  'ORDER-002': 'Order total is invalid.',
  'ORDER-003': 'Order date is invalid.',
  'ORDER-005': 'Order item references an invalid product identifier.',
  'ORDER-006': 'Order item quantity is invalid.',
  'ORDER-007': 'Order item price is invalid.',
  'ORDER-008': 'Order contains a duplicate product/variant line.',
  'ORDER-009': 'Order total does not match the stored line arithmetic.',
  'IMPORT-001': 'Product import has an unknown lifecycle status.',
  'IMPORT-002': 'Product import confidence is outside the [0,1] range.',
  'IMPORT-003': 'Published import has no published product reference.',
  'IMPORT-004': 'Failed import has no error evidence.',
  'IMPORT-005': 'Ready import has no product name.',
  'IMPORT-006': 'Ready import has no valid calculated price.',
  'PAYMENT-001': 'Payment has no order reference.',
  'PAYMENT-002': 'Payment has no provider.',
  'PAYMENT-003': 'Payment has no idempotency key.',
  'PAYMENT-004': 'Payment amount is not positive and finite.',
  'PAYMENT-005': 'Payment currency is not a three-letter uppercase code.',
  'PAYMENT-006': 'Payment status is outside the known lifecycle.',
  'PAYMENT-007': 'Settled payment has no paid_at timestamp.',
  'PAYMENT-008': 'Refunded payment has no refunded_at timestamp.',
  'PAYMENT-009': 'Non-settled payment exposes paid_at.',
  'PAYMENT-010': 'Payment paid_at timestamp is invalid.',
  'PAYMENT-011': 'Payment refunded_at timestamp is invalid.',
};

const BUSINESS_RULE_PATTERN = /\b(?:CART|ORDER|IMPORT|PAYMENT)-\d{3}\b/g;

export function extractBusinessInvariantMatches(logTexts = []) {
  const found = new Set();

  for (const log of logTexts) {
    if (typeof log !== 'string') continue;
    for (const match of log.matchAll(BUSINESS_RULE_PATTERN)) {
      found.add(match[0]);
    }
  }

  return [...found]
    .sort()
    .map((rule_id) => ({
      rule_id,
      description: BUSINESS_RULES[rule_id] || 'Unknown business invariant.',
    }));
}

export function analyzeIncident({ run, failedJobs = [], logTexts = [], recipes = [] }) {
  const signatureMatches = [];
  let recipe = null;

  for (const candidate of recipes) {
    if (!candidate || candidate.enabled === false) continue;
    if (candidate.workflow !== run.name) continue;

    const matches = (candidate.signatures || []).filter(
      (signature) =>
        typeof signature === 'string' &&
        logTexts.some((log) => typeof log === 'string' && log.includes(signature))
    );

    if (matches.length === 0) continue;

    signatureMatches.push(
      ...matches.map((signature) => ({ recipe_id: candidate.id, signature }))
    );

    if (!recipe) recipe = candidate;
  }

  const businessInvariantMatches = extractBusinessInvariantMatches(logTexts);

  return {
    schema_version: INCIDENT_INTELLIGENCE_VERSION,
    workflow: run.name,
    run_id: run.id,
    run_number: run.run_number,
    branch: run.head_branch || null,
    commit: run.head_sha,
    conclusion: run.conclusion || run.status || null,
    failed_jobs: failedJobs.slice(0, 3).map((job) => ({
      id: job.id,
      name: job.name,
      conclusion: job.conclusion,
    })),
    signature_matches: signatureMatches,
    business_invariant_matches: businessInvariantMatches,
    classification: recipe ? 'known-repair-candidate' : 'unclassified-failure',
    recipe_id: recipe?.id || null,
    recommended_action: recipe ? 'self-healing' : 'operator-review',
  };
}

export function renderIncidentIntelligence(intel) {
  return [
    '<!-- nrj-incident-intelligence',
    JSON.stringify(intel),
    '-->',
  ].join('\n');
}
