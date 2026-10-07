import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePaymentAttackMatrix,
  evaluatePaymentE2EStages,
  evaluateOpenPayActivationGate,
} from '../scripts/payment-attack-matrix.mjs';

test('#18 detects a provider reference stranded in callback payload', () => {
  const result = evaluatePaymentAttackMatrix({
    payments: [{ id: 'p1', order_id: 'o1', status: 'pending', provider: 'openpay', provider_reference: null, idempotency_key: 'k1' }],
    payment_events: [{
      id: 'e1',
      payment_id: 'p1',
      event_type: 'payment.success',
      payload: { reference: 'ref-1' },
    }],
  });
  assert.ok(result.findings.some(f => f.rule_id === 'PAY-018'));
});

test('#19 detects incomplete webhook reconciliation', () => {
  const result = evaluatePaymentAttackMatrix({
    orders: [{ id: 'o1', status: 'pending' }],
    payments: [{ id: 'p1', order_id: 'o1', status: 'pending' }],
    payment_events: [{
      id: 'e1',
      payment_id: 'p1',
      event_type: 'payment.paid',
      processed_at: '2026-10-05T10:00:00Z',
    }],
  });
  assert.ok(result.findings.some(f => f.rule_id === 'PAY-019'));
});

test('#22 detects repeated idempotency and live-payment submissions', () => {
  const result = evaluatePaymentAttackMatrix({
    payments: [
      { id: 'p1', order_id: 'o1', provider: 'openpay', idempotency_key: 'same', status: 'pending' },
      { id: 'p2', order_id: 'o1', provider: 'openpay', idempotency_key: 'same', status: 'processing' },
    ],
  });
  assert.ok(result.findings.some(f => f.rule_id === 'PAY-022'));
  assert.ok(result.findings.some(f => f.rule_id === 'PAY-023'));
});

test('payment E2E gate requires every lifecycle stage', () => {
  const blocked = evaluatePaymentE2EStages({ order_created: true });
  assert.equal(blocked.status, 'blocked');
  const complete = evaluatePaymentE2EStages({
    order_created: true,
    payment_created: true,
    provider_callback: true,
    payment_reconciled: true,
    order_reconciled: true,
    final_status_verified: true,
  });
  assert.equal(complete.status, 'complete');
});

test('OpenPay activation gate remains blocked until all prerequisites are healthy', () => {
  const blocked = evaluateOpenPayActivationGate({
    featureEnabled: true,
    paymentAuditHealthy: true,
    e2eComplete: true,
    migrationDrift: true,
    integrityHealthy: true,
    securityHealthy: true,
  });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.failures.includes('migration-drift'));
});
