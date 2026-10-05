const RULES = {
  'PAY-AUDIT-001': 'A paid payment is missing its provider reference.',
  'PAY-AUDIT-002': 'A paid order has no matching paid payment.',
  'PAY-AUDIT-003': 'A paid payment conflicts with its order amount or currency.',
  'PAY-AUDIT-004': 'A payment event references a missing payment.',
  'PAY-AUDIT-005': 'A provider event was processed more than once.',
  'PAY-AUDIT-006': 'An order exposes a payment reference with no matching provider reference.',
  'PAY-AUDIT-007': 'More than one live payment exists for the same order.',
};

export function evaluatePaymentAudit(snapshot = {}) {
  const findings = [];
  const orders = new Map((snapshot.orders || []).map(row => [String(row.id), row]));
  const payments = snapshot.payments || [];
  const paidOrders = [...orders.values()].filter(order => order.status === 'paid');

  for (const payment of payments) {
    if (payment.status === 'paid' && !String(payment.provider_reference || '').trim()) {
      findings.push({ rule_id: 'PAY-AUDIT-001', key: String(payment.id), description: RULES['PAY-AUDIT-001'] });
    }

    const order = orders.get(String(payment.order_id));
    if (payment.status === 'paid' && order) {
      if (Number(payment.amount) !== Number(order.total) || payment.currency !== 'XAF') {
        findings.push({ rule_id: 'PAY-AUDIT-003', key: String(payment.id), description: RULES['PAY-AUDIT-003'] });
      }
    }
  }

  for (const order of paidOrders) {
    const matching = payments.find(p => String(p.order_id) === String(order.id) && p.status === 'paid');
    if (!matching) {
      findings.push({ rule_id: 'PAY-AUDIT-002', key: String(order.id), description: RULES['PAY-AUDIT-002'] });
    }
    if (order.payment_reference &&
        !payments.some(p => String(p.provider_reference || '') === String(order.payment_reference))) {
      findings.push({ rule_id: 'PAY-AUDIT-006', key: String(order.id), description: RULES['PAY-AUDIT-006'] });
    }
  }

  for (const event of snapshot.payment_events || []) {
    if (event.payment_id &&
        !payments.some(p => String(p.id) === String(event.payment_id))) {
      findings.push({ rule_id: 'PAY-AUDIT-004', key: String(event.id), description: RULES['PAY-AUDIT-004'] });
    }
  }

  const eventKeys = new Set();
  for (const event of snapshot.payment_events || []) {
    const key = event.provider && event.provider_event_id
      ? String(event.provider) + '::' + String(event.provider_event_id)
      : null;
    if (!key) continue;
    if (eventKeys.has(key)) {
      findings.push({ rule_id: 'PAY-AUDIT-005', key, description: RULES['PAY-AUDIT-005'] });
    }
    eventKeys.add(key);
  }

  const liveCounts = new Map();
  for (const payment of payments) {
    if (!['pending', 'processing', 'paid', 'refund_pending', 'refunded'].includes(payment.status)) continue;
    const key = String(payment.order_id);
    liveCounts.set(key, (liveCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of liveCounts) {
    if (count > 1) {
      findings.push({ rule_id: 'PAY-AUDIT-007', key, count, description: RULES['PAY-AUDIT-007'] });
    }
  }

  return {
    schema_version: 1,
    status: findings.length ? 'payment-findings' : 'healthy',
    finding_count: findings.length,
    findings,
  };
}
