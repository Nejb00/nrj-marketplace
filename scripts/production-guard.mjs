export function evaluateProductionGate({
  deploymentState,
  smokePassed = false,
  browserE2EPassed = false,
  openIncidents = 0,
  targetEnvironment = 'Production',
}) {
  const failures = [];
  if (deploymentState !== 'success') failures.push('deployment-not-successful');
  if (!smokePassed) failures.push('smoke-not-passed');
  if (!browserE2EPassed) failures.push('browser-e2e-not-passed');
  if (openIncidents > 0) failures.push('open-incidents');
  if (!['Production', 'production'].includes(targetEnvironment)) failures.push('wrong-environment');

  return {
    schema_version: 1,
    status: failures.length ? 'blocked' : 'ready',
    failures,
  };
}
