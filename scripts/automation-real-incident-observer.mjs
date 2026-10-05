const SUPPORTED = new Set([
  'CI',
  'CodeQL',
  'Dependency Review',
  'Deployment Safety Net',
  'Vercel Browser E2E',
]);

function classifyFailure(run) {
  const workflow = run?.name || 'Unknown';
  return {
    workflow,
    supported_by_self_healing: SUPPORTED.has(workflow),
    conclusion: run?.conclusion || run?.status || 'unknown',
    branch: run?.head_branch || null,
    run_id: run?.id ?? null,
    created_at: run?.created_at || null,
  };
}

function summarizeFailures(runs = []) {
  const rows = runs.filter((r) => r?.conclusion === 'failure').map(classifyFailure);
  return {
    schema_version: 1,
    sample_size: rows.length,
    supported_failures: rows.filter((r) => r.supported_by_self_healing).length,
    unsupported_failures: rows.filter((r) => !r.supported_by_self_healing).length,
    rows,
  };
}

export { SUPPORTED, classifyFailure, summarizeFailures };