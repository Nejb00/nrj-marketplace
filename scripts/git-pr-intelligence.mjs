export function analyzePullRequest({
  base = 'main',
  head = '',
  aheadBy = 0,
  behindBy = 0,
  changedFiles = 0,
  draft = false,
  mergeable = true,
  requiredFailures = 0,
  requiredPending = 0,
}) {
  const findings = [];
  if (base !== 'main') findings.push('non-main-base');
  if (behindBy > 0) findings.push('behind-main');
  if (changedFiles > 50) findings.push('large-pr');
  if (!mergeable) findings.push('not-mergeable');
  if (requiredFailures > 0) findings.push('required-check-failure');
  if (requiredPending > 0) findings.push('required-check-pending');

  const ready = !draft && mergeable && behindBy === 0 &&
    requiredFailures === 0 && requiredPending === 0 && base === 'main';

  return {
    schema_version: 1,
    status: findings.length ? 'review-findings' : 'clean',
    ready,
    base,
    head,
    ahead_by: aheadBy,
    behind_by: behindBy,
    changed_files: changedFiles,
    findings,
  };
}
