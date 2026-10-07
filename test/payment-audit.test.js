import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePaymentAudit } from '../scripts/payment-audit.mjs';

test('payment audit detects a paid order without a paid payment', () => {
  const result = evaluatePaymentAudit({
    orders: [{ id: 'o1', status: 'paid', total: 1000, payment_reference: 'ref-1' }],
    payments: [],
  });
  assert.ok(result.findings.some(f => f.rule_id === 'PAY-AUDIT-002'));
  assert.ok(result.findings.some(f => f.rule_id === 'PAY-AUDIT-006'));
});

test('payment audit accepts an aligned paid transaction', () => {
  const result = evaluatePaymentAudit({
    orders: [{ id: 'o1', status: 'paid', total: 1000 }],
    payments: [{
      id: 'p1', order_id: 'o1', status: 'paid',
      amount: 1000, currency: 'XAF', provider_reference: 'ref-1',
    }],
  });
  assert.equal(result.status, 'healthy');
});

test('payment audit detects missing provider reference and duplicate provider events', () => {
  const result = evaluatePaymentAudit({
    orders: [{ id: 'o1', status: 'paid', total: 1000 }],
    payments: [{ id: 'p1', order_id: 'o1', status: 'paid', amount: 1000, currency: 'XAF' }],
    payment_events: [
      { id: 'e1', payment_id: 'p1', provider: 'openpay', provider_event_id: 'evt-1' },
      { id: 'e2', payment_id: 'p1', provider: 'openpay', provider_event_id: 'evt-1' },
    ],
  });
  assert.ok(result.findings.some(f => f.rule_id === 'PAY-AUDIT-001'));
  assert.ok(result.findings.some(f => f.rule_id === 'PAY-AUDIT-005'));
});
