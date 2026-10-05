export const REPAIR_VERIFICATION_VERSION = 1;

export const REQUIRED_REPAIR_CHECKS = [
  'Build',
  'PR Quality Gate',
  'Dependency Review',
  'CodeQL',
  'CodeQL (javascript-typescript)',
  'CodeQL (actions)',
];

export function evaluateRepairVerification({
  checkRuns = [],
  browserRequired = false,
}) {
  const required = [...REQUIRED_REPAIR_CHECKS];
  if (browserRequired) required.push('Vercel Browser E2E');

  const byName = new Map();
  for (const check of checkRuns) {
    if (check?.name) byName.set(check.name, check);
  }

  const details = required.map((name) => {
    const check = byName.get(name);
    if (!check || check.status !== 'completed') {
      return { name, state: 'pending', conclusion: check?.conclusion || null };
    }
    return {
      name,
      state: check.conclusion === 'success' ? 'success' : 'failure',
      conclusion: check.conclusion || null,
    };
  });

  const failed = details.filter(({ state }) => state === 'failure');
  const pending = details.filter(({ state }) => state === 'pending');

  return {
    schema_version: REPAIR_VERIFICATION_VERSION,
    status: failed.length ? 'rejected' : pending.length ? 'pending' : 'verified',
    required_checks: required,
    failed_checks: failed.map(({ name, conclusion }) => ({ name, conclusion })),
    pending_checks: pending.map(({ name }) => name),
    passed_checks: details
      .filter(({ state }) => state === 'success')
      .map(({ name }) => name),
    browser_required: browserRequired,
  };
}

export function renderRepairVerification(result) {
  return [
    '<!-- nrj-self-healing-repair-verification',
    JSON.stringify(result),
    '-->',
  ].join('\n');
}
