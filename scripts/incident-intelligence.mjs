export const INCIDENT_INTELLIGENCE_VERSION = 1;

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
