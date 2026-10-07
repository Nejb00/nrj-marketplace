import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCrossSystemConsistency, evaluateImpossibleValues } from '../scripts/cross-system-integrity.mjs';

test('cross-system consistency detects paid payment/order conflict', () => {
  const result = evaluateCrossSystemConsistency({
    orders: [{ id: 'o1', status: 'pending', total: 1200 }],
    payments: [{ id: 'p1', order_id: 'o1', status: 'paid', amount: 1200, currency: 'XAF' }],
  });
  assert.equal(result.status, 'inconsistent');
  assert.deepEqual(result.violations.map(v => v.rule_id), ['CROSS-001']);
});

test('cross-system consistency accepts aligned payment/order state', () => {
  const result = evaluateCrossSystemConsistency({
    orders: [{ id: 'o1', status: 'paid', total: 1200 }],
    payments: [{ id: 'p1', order_id: 'o1', status: 'paid', amount: 1200, currency: 'XAF' }],
  });
  assert.equal(result.status, 'consistent');
});

test('cross-system consistency detects processed event without payment', () => {
  const result = evaluateCrossSystemConsistency({
    payments: [],
    payment_events: [{ id: 'e1', processed_at: '2026-10-05T10:00:00Z', payment_id: null }],
  });
  assert.deepEqual(result.violations.map(v => v.rule_id), ['CROSS-004']);
});

test('impossible value detector rejects temporal and numeric contradictions', () => {
  const result = evaluateImpossibleValues({
    orders: [{ id: 'o1', total: -1, created_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-05T09:00:00Z' }],
    payments: [{ id: 'p1', amount: 0, created_at: '2026-10-05T10:00:00Z', paid_at: '2026-10-05T09:00:00Z' }],
    categories: [{ id: 'c1', parent_id: 'c1' }],
  });
  assert.deepEqual(result.violations.map(v => v.rule_id), [
    'IMPOSSIBLE-003',
    'IMPOSSIBLE-004',
    'IMPOSSIBLE-005',
    'IMPOSSIBLE-006',
    'IMPOSSIBLE-007',
  ]);
});
