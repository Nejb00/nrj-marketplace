export function correlateSignals({ github = {}, supabase = {}, vercel = {} }) {
  const commit = github.commit || vercel.commit || null;
  const deploymentCommit = vercel.deploymentCommit || null;
  const links = [];

  if (commit && deploymentCommit && commit === deploymentCommit) links.push('git-vercel');
  if (supabase.migrationDrift) links.push('git-supabase-drift');
  if (Number(supabase.integrityIssueCount || 0) > 0) links.push('supabase-integrity');
  if (['failure', 'error', 'canceled'].includes(vercel.status)) links.push('vercel-production-failure');

  const risk_score =
    (supabase.migrationDrift ? 3 : 0) +
    (Number(supabase.integrityIssueCount || 0) > 0 ? 4 : 0) +
    (['failure', 'error', 'canceled'].includes(vercel.status) ? 3 : 0);

  return {
    schema_version: 1,
    status: links.length ? 'correlated-findings' : 'no-cross-system-findings',
    links,
    risk_score,
    commit,
  };
}
