// Automation debug benchmark — pure metric calculations.
// Input: JSON with { incidents: [...] }.
// An incident may contain timestamps for:
// source_completed_at, incident_created_at, diagnosis_at, repair_at,
// verification_at, resolved_at.
// Missing stages remain null and are excluded from latency medians.

function toMs(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
}

function durationMinutes(start, end) {
  const a = toMs(start);
  const b = toMs(end);
  if (a === null || b === null || b < a) return null;
  return (b - a) / 60000;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function pct(value, total) {
  return total > 0 ? (value / total) * 100 : null;
}

export function benchmarkAutomation({ incidents = [] } = {}) {
  const rows = incidents.map((incident) => ({
    ...incident,
    detection_minutes: durationMinutes(
      incident.source_completed_at,
      incident.incident_created_at
    ),
    diagnosis_minutes: durationMinutes(
      incident.incident_created_at,
      incident.diagnosis_at
    ),
    repair_minutes: durationMinutes(
      incident.diagnosis_at || incident.incident_created_at,
      incident.repair_at
    ),
    verification_minutes: durationMinutes(
      incident.repair_at,
      incident.verification_at
    ),
    resolution_minutes: durationMinutes(
      incident.incident_created_at,
      incident.resolved_at
    ),
  }));

  const total = rows.length;
  const diagnosisCount = rows.filter((r) => r.diagnosis_at).length;
  const repairCount = rows.filter((r) => r.repair_at).length;
  const verificationCount = rows.filter((r) => r.verification_at).length;
  const resolvedCount = rows.filter((r) => r.resolved_at).length;

  return {
    schema_version: 1,
    sample_size: total,
    coverage: {
      diagnosis_pct: pct(diagnosisCount, total),
      repair_prepared_pct: pct(repairCount, total),
      verification_pct: pct(verificationCount, repairCount),
      resolution_pct: pct(resolvedCount, total),
    },
    median_latency_minutes: {
      detection: median(rows.map((r) => r.detection_minutes)),
      diagnosis: median(rows.map((r) => r.diagnosis_minutes)),
      repair: median(rows.map((r) => r.repair_minutes)),
      verification: median(rows.map((r) => r.verification_minutes)),
      resolution: median(rows.map((r) => r.resolution_minutes)),
    },
    rows,
    baseline: {
      status: "unavailable",
      reason: "No instrumented pre-automation incident dataset is stored in GitHub history.",
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { input += chunk; });
  process.stdin.on('end', () => {
    const data = JSON.parse(input || '{}');
    process.stdout.write(JSON.stringify(benchmarkAutomation(data), null, 2));
  });
}
