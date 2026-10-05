import test from 'node:test';
import assert from 'node:assert/strict';
import { durationMinutes, summarize } from '../scripts/automation-cost-benchmark.mjs';

test('calculates wall-clock duration safely', () => {
  assert.equal(durationMinutes('2026-10-05T08:00:00Z', '2026-10-05T08:07:30Z'), 7.5);
  assert.equal(durationMinutes('bad', '2026-10-05T08:07:30Z'), null);
  assert.equal(durationMinutes('2026-10-05T09:00:00Z', '2026-10-05T08:00:00Z'), null);
});

test('groups workflow activity and failure/cancellation rates', () => {
  const rows = summarize([
    { name: 'CI', status: 'completed', conclusion: 'success', run_started_at: '2026-10-05T08:00:00Z', updated_at: '2026-10-05T08:05:00Z' },
    { name: 'CI', status: 'completed', conclusion: 'failure', run_started_at: '2026-10-05T09:00:00Z', updated_at: '2026-10-05T09:10:00Z' },
    { name: 'CI', status: 'completed', conclusion: 'cancelled', run_started_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-05T10:02:00Z' },
  ]);
  assert.equal(rows[0].workflow, 'CI');
  assert.equal(rows[0].runs, 3);
  assert.equal(rows[0].successes, 1);
  assert.equal(rows[0].failures, 1);
  assert.equal(rows[0].cancellations, 1);
  assert.equal(rows[0].wall_minutes, 17);
  assert.equal(rows[0].failure_pct, 33.3);
  assert.equal(rows[0].cancellation_pct, 33.3);
});
