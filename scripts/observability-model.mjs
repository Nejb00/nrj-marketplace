export function summarizeAutomationHealth({
  workflowRuns = [],
  mainBranch = 'main',
  incidentsOpen = 0,
}) {
  const relevant = workflowRuns.filter(run =>
    run?.head_branch === mainBranch || run?.headBranch === mainBranch
  );
  const failures = relevant.filter(run =>
    ['failure', 'timed_out', 'action_required'].includes(run?.conclusion)
  );
  const pending = relevant.filter(run =>
    ['queued', 'in_progress', 'pending'].includes(run?.status)
  );

  let status = failures.length ? 'degraded' : 'healthy';
  if (!failures.length && pending.length) status = 'pending';
  if (incidentsOpen > 0 && status === 'healthy') status = 'incident';

  return {
    schema_version: 1,
    status,
    main_branch: mainBranch,
    relevant_runs: relevant.length,
    failed_runs: failures.length,
    pending_runs: pending.length,
    incidents_open: incidentsOpen,
  };
}

export function normalizeWorkflowConclusion(run = {}) {
  if (run.status && run.status !== 'completed') return 'pending';
  if (run.conclusion === 'success') return 'success';
  if (['failure', 'timed_out', 'action_required'].includes(run.conclusion)) return 'failure';
  if (run.conclusion === 'cancelled') return 'cancelled';
  return 'unknown';
}
