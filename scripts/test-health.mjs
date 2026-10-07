export function summarizeTestHistory(runs = []) {
  const total = runs.length;
  const failures = runs.filter(run => run.conclusion === 'failure').length;
  const cancellations = runs.filter(run => run.conclusion === 'cancelled').length;
  const successes = runs.filter(run => run.conclusion === 'success').length;
  const failureRate = total ? failures / total : 0;
  const cancellationRate = total ? cancellations / total : 0;

  return {
    schema_version: 1,
    total,
    successes,
    failures,
    cancellations,
    failure_rate: failureRate,
    cancellation_rate: cancellationRate,
    health: failureRate >= 0.5 ? 'unstable' : failureRate > 0 || cancellationRate > 0.2 ? 'watch' : 'healthy',
  };
}

export function classifyFlakiness(recentOutcomes = []) {
  const sequence = recentOutcomes.map(String);
  const alternating = sequence.length >= 4 &&
    sequence.slice(-4).every((value, index, arr) => index === 0 || value !== arr[index - 1]);
  const mixed = new Set(sequence).size > 1;

  return {
    schema_version: 1,
    status: alternating ? 'possible-flake' : mixed ? 'mixed-outcomes' : 'stable',
    observations: sequence.length,
  };
}
