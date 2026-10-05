const SENSITIVE_PATH = /(^|\/)(?:\.env|credentials|supabase\/migrations|\.github\/workflows\/self-healing|\.github\/self-healing-recipes)(?:\/|\.|$)/i;

export function evaluateRepairGuard({ run = {}, recipe = {}, attemptCount = 0, now = Date.now() }) {
  const failures = [];
  const updatedAt = new Date(run.updated_at).getTime();

  if (run.head_branch !== 'main') failures.push('source-not-main');
  if (run.conclusion !== 'failure') failures.push('source-not-failed');
  if (Number.isFinite(updatedAt) && now - updatedAt > 24 * 60 * 60 * 1000) failures.push('source-stale');
  if (attemptCount > 0) failures.push('repair-already-attempted');
  if (SENSITIVE_PATH.test(String(recipe.path ?? ''))) failures.push('sensitive-target');
  if (typeof recipe.find !== 'string' || typeof recipe.replace !== 'string') failures.push('recipe-incomplete');
  if (recipe.find === recipe.replace) failures.push('no-op-repair');
  if (recipe.find?.length > 20000 || recipe.replace?.length > 20000) failures.push('repair-too-large');

  return { schema_version: 1, status: failures.length ? 'blocked' : 'eligible', failures };
}

export function canAutoRepair(context) {
  return evaluateRepairGuard(context).status === 'eligible';
}
