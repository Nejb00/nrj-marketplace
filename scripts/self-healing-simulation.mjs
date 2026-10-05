export const SELF_HEALING_SIMULATION_VERSION = 1;

export function simulateRepair({ recipe, run, path, current, findText, replaceText }) {
  const occurrences = findText === '' ? 0 : current.split(findText).length - 1;
  const eligible =
    Boolean(recipe) &&
    Boolean(run) &&
    typeof path === 'string' &&
    typeof current === 'string' &&
    typeof findText === 'string' &&
    typeof replaceText === 'string' &&
    occurrences === 1;

  return {
    schema_version: SELF_HEALING_SIMULATION_VERSION,
    mode: 'dry-run',
    would_write: false,
    eligible,
    recipe_id: recipe?.id || null,
    workflow: run?.name || null,
    run_id: run?.id || null,
    commit: run?.head_sha || null,
    path: path || null,
    occurrences,
    replacement_count: eligible ? 1 : 0,
    would_create_branch: eligible,
    would_create_draft_pr: eligible,
    safety_result: eligible ? 'passed' : 'blocked',
  };
}

export function renderSimulation(intel) {
  return [
    '<!-- nrj-self-healing-dry-run',
    JSON.stringify(intel),
    '-->',
  ].join('\n');
}
