function durationMinutes(start, end) {
  const a = Date.parse(start || '');
  const b = Date.parse(end || '');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 60000;
}

function summarize(runs) {
  const by = new Map();
  for (const run of runs) {
    const name = run.name || 'Unknown';
    if (!by.has(name)) by.set(name, {
      workflow: name,
      runs: 0,
      failures: 0,
      cancellations: 0,
      successes: 0,
      running: 0,
      wall_minutes: 0,
      timed_runs: 0,
    });
    const row = by.get(name);
    row.runs += 1;
    if (run.conclusion === 'failure') row.failures += 1;
    if (run.conclusion === 'cancelled') row.cancellations += 1;
    if (run.conclusion === 'success') row.successes += 1;
    if (run.status === 'in_progress' || run.status === 'queued') row.running += 1;
    const minutes = durationMinutes(run.run_started_at || run.created_at, run.updated_at);
    if (minutes !== null) {
      row.wall_minutes += minutes;
      row.timed_runs += 1;
    }
  }
  return [...by.values()]
    .map((row) => ({
      ...row,
      wall_minutes: Math.round(row.wall_minutes * 10) / 10,
      avg_minutes: row.timed_runs
        ? Math.round((row.wall_minutes / row.timed_runs) * 10) / 10
        : null,
      cancellation_pct: row.runs
        ? Math.round((row.cancellations / row.runs) * 1000) / 10
        : 0,
      failure_pct: row.runs
        ? Math.round((row.failures / row.runs) * 1000) / 10
        : 0,
    }))
    .sort((a, b) => b.wall_minutes - a.wall_minutes);
}

export { durationMinutes, summarize };
