import test from 'node:test';
import assert from 'node:assert/strict';
import { makeIncidentKey, recordIncident, classifyRecurrence } from '../scripts/incident-history.mjs';

test('incident history key stays stable for same evidence', () => {
  const a = makeIncidentKey({ workflow: 'CI', classification: 'failure', businessRules: ['PAYMENT-003'] });
  const b = makeIncidentKey({ workflow: 'CI', classification: 'failure', businessRules: ['PAYMENT-003'] });
  assert.equal(a, b);
});

test('incident history records recurrence without mutating input', () => {
  const first = recordIncident([], { workflow: 'CI', classification: 'failure', seenAt: '2026-10-05T10:00:00Z' });
  const second = recordIncident(first, { workflow: 'CI', classification: 'failure', seenAt: '2026-10-05T11:00:00Z' });
  assert.equal(second[0].count, 2);
  assert.equal(classifyRecurrence(second[0]), 'rare');
});
