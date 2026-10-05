export function evaluateRecoveryPolicy({
  correlated = false,
  mergedRepair = false,
  regressionDetected = false,
  recentRollbackCount = 0,
  maxRollbacks = 1,
  ageMinutes = 0,
  maxAgeMinutes = 60,
}) {
  const failures = [];
  if (!correlated) failures.push('uncorrelated');
  if (!mergedRepair) failures.push('repair-not-merged');
  if (!regressionDetected) failures.push('regression-not-detected');
  if (recentRollbackCount >= maxRollbacks) failures.push('rollback-circuit-breaker');
  if (ageMinutes > maxAgeMinutes) failures.push('incident-too-old');
  return { schema_version: 1, status: failures.length ? 'blocked' : 'eligible', failures };
}

export function selectRecoveryAction(policy) {
  const evaluation = evaluateRecoveryPolicy(policy);
  return { ...evaluation, action: evaluation.status === 'eligible' ? 'prepare-draft-rollback' : 'operator-review' };
}
