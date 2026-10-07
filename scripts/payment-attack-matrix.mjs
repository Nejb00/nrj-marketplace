const LIVE_PAYMENT_STATUSES = new Set([
  'pending', 'processing', 'paid', 'refund_pending', 'refunded',
]);

export function evaluatePaymentAttackMatrix(snapshot = {}) {
  const orders = new Map((snapshot.orders || []).map(row => [String(row.id), row]));
  const payments = snapshot.payments || [];
  const events = snapshot.payment_events || [];
  const findings = [];

  // #18 — lost reference: callback/event contains a provider reference,
  // but the persisted payment does not yet expose it.
  for (const event of events) {
    const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
    const reference = payload.provider_reference || payload.reference || payload.transaction_id;
    const payment = payments.find(p => String(p.id) === String(event.payment_id));
    if (reference && payment && !String(payment.provider_reference || '').trim()) {
      findings.push({
        attack: 18,
        rule_id: 'PAY-018',
        key: String(payment.id),
        detail: 'Provider reference present in event payload but missing on payment.',
      });
    }
  }

  // #19 — webhook/callback reconciliation: processed paid callback must
  // leave the linked payment and order in a paid state.
  for (const event of events) {
    const type = String(event.event_type || '').toLowerCase();
    if (!event.processed_at || !type.includes('paid')) continue;

    const payment = payments.find(p => String(p.id) === String(event.payment_id));
    const order = payment ? orders.get(String(payment.order_id)) : null;
    if (!payment || payment.status !== 'paid' || !order || order.status !== 'paid') {
      findings.push({
        attack: 19,
        rule_id: 'PAY-019',
        key: String(event.id),
        detail: 'Processed paid callback is not fully reconciled across payment and order.',
      });
    }
  }

  // #20 — payment → order state machine consistency.
  for (const payment of payments) {
    const order = orders.get(String(payment.order_id));
    if (!order) continue;
    if (payment.status === 'paid' && order.status !== 'paid') {
      findings.push({
        attack: 20,
        rule_id: 'PAY-020',
        key: String(payment.id),
        detail: 'Paid payment conflicts with order lifecycle state.',
      });
    }
  }

  // #21 — financial observability: failed processing needs an error record.
  for (const event of events) {
    const type = String(event.event_type || '').toLowerCase();
    if (event.processed_at && type.includes('fail') && !String(event.processing_error || '').trim()) {
      findings.push({
        attack: 21,
        rule_id: 'PAY-021',
        key: String(event.id),
        detail: 'Processed failed payment event has no processing error evidence.',
      });
    }
  }

  // #22 — anti-double-submit / idempotency.
  const idempotency = new Set();
  const livePerOrder = new Map();
  for (const payment of payments) {
    if (payment.provider && payment.idempotency_key) {
      const key = String(payment.provider) + '::' + String(payment.idempotency_key);
      if (idempotency.has(key)) {
        findings.push({ attack: 22, rule_id: 'PAY-022', key, detail: 'Duplicate provider/idempotency key.' });
      }
      idempotency.add(key);
    }

    if (LIVE_PAYMENT_STATUSES.has(payment.status)) {
      const orderKey = String(payment.order_id);
      livePerOrder.set(orderKey, (livePerOrder.get(orderKey) || 0) + 1);
    }
  }

  for (const [orderId, count] of livePerOrder) {
    if (count > 1) {
      findings.push({
        attack: 22,
        rule_id: 'PAY-023',
        key: orderId,
        detail: 'More than one live payment exists for the order.',
      });
    }
  }

  return {
    schema_version: 1,
    status: findings.length ? 'attack-findings' : 'healthy',
    finding_count: findings.length,
    findings,
  };
}

export function evaluatePaymentE2EStages(stages = {}) {
  const required = [
    'order_created',
    'payment_created',
    'provider_callback',
    'payment_reconciled',
    'order_reconciled',
    'final_status_verified',
  ];
  const missing = required.filter(name => stages[name] !== true);
  return {
    schema_version: 1,
    status: missing.length ? 'blocked' : 'complete',
    missing,
    completed: required.filter(name => stages[name] === true),
  };
}

export function evaluateOpenPayActivationGate({
  featureEnabled = false,
  paymentAuditHealthy = false,
  e2eComplete = false,
  migrationDrift = false,
  integrityHealthy = false,
  securityHealthy = false,
}) {
  const failures = [];
  if (!featureEnabled) failures.push('feature-disabled');
  if (!paymentAuditHealthy) failures.push('payment-audit-not-healthy');
  if (!e2eComplete) failures.push('payment-e2e-incomplete');
  if (migrationDrift) failures.push('migration-drift');
  if (!integrityHealthy) failures.push('integrity-not-healthy');
  if (!securityHealthy) failures.push('security-not-healthy');

  return {
    schema_version: 1,
    status: failures.length ? 'blocked' : 'eligible',
    failures,
  };
}
