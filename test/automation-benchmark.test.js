import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAutomation } from '../scripts/automation-benchmark.mjs';

test('returns a transparent empty benchmark when there are no incidents', () => {
  const result = benchmarkAutomation();
  assert.equal(result.sample_size, 0);
  assert.equal(result.coverage.diagnosis_pct, null);
  assert.equal(result.median_latency_minutes.detection, null);
  assert.equal(result.baseline.status, 'unavailable');
});

test('computes incident pipeline coverage and latencies', () => {
  const result = benchmarkAutomation({
    incidents: [
      {
        id: 1,
        source_completed_at: '2026-10-05T08:00:00Z',
        incident_created_at: '2026-10-05T08:05:00Z',
        diagnosis_at: '2026-10-05T08:07:00Z',
        repair_at: '2026-10-05T08:12:00Z',
        verification_at: '2026-10-05T08:20:00Z',
        resolved_at: '2026-10-05T08:25:00Z',
      },
      {
        id: 2,
        source_completed_at: '2026-10-05T09:00:00Z',
        incident_created_at: '2026-10-05T09:10:00Z',
      },
    ],
  });

  assert.equal(result.sample_size, 2);
  assert.equal(result.coverage.diagnosis_pct, 50);
  assert.equal(result.coverage.repair_prepared_pct, 50);
  assert.equal(result.coverage.verification_pct, 100);
  assert.equal(result.coverage.resolution_pct, 50);

  assert.equal(result.median_latency_minutes.detection, 7.5);
  assert.equal(result.median_latency_minutes.diagnosis, 2);
  assert.equal(result.median_latency_minutes.repair, 5);
  assert.equal(result.median_latency_minutes.verification, 8);
  assert.equal(result.median_latency_minutes.resolution, 20);
});

test('ignores invalid or reversed timestamps', () => {
  const result = benchmarkAutomation({
    incidents: [{
      source_completed_at: 'bad',
      incident_created_at: '2026-10-05T08:00:00Z',
      diagnosis_at: '2026-10-05T07:00:00Z',
    }],
  });

  assert.equal(result.median_latency_minutes.detection, null);
  assert.equal(result.median_latency_minutes.diagnosis, null);
});
