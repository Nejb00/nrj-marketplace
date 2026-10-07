const finiteNumber = (value) => Number.isFinite(Number(value));
const nonEmpty = (value) => typeof value === 'string' ? value.trim().length > 0 : value != null;

function mapById(rows = []) {
  return new Map(rows.filter(Boolean).map(row => [String(row.id), row]));
}

export function evaluateCrossSystemConsistency(snapshot = {}) {
  const orders = mapById(snapshot.orders);
  const payments = snapshot.payments || [];
  const products = mapById(snapshot.products);
  const imports = snapshot.product_imports || [];
  const categories = mapById(snapshot.categories);
  const paymentEvents = snapshot.payment_events || [];
  const violations = [];

  for (const payment of payments) {
    const order = orders.get(String(payment.order_id));
    if (!order) continue;
    if (payment.status === 'paid' && order.status !== 'paid') {
      violations.push({
        rule_id: 'CROSS-001',
        entity: 'payment/order',
        key: String(payment.order_id),
        detail: 'Paid payment conflicts with non-paid order status.',
      });
    }
    if (payment.status === 'paid' && finiteNumber(payment.amount) && finiteNumber(order.total)
      && Number(payment.amount) !== Number(order.total)) {
      violations.push({
        rule_id: 'CROSS-002',
        entity: 'payment/order',
        key: String(payment.order_id),
        detail: 'Paid payment amount differs from order total.',
      });
    }
    if (payment.status === 'paid' && nonEmpty(payment.currency) && payment.currency !== 'XAF') {
      violations.push({
        rule_id: 'CROSS-003',
        entity: 'payment/order',
        key: String(payment.order_id),
        detail: 'Paid payment uses an unexpected application currency.',
      });
    }
  }

  for (const event of paymentEvents) {
    if (event.processed_at && !event.payment_id) {
      violations.push({
        rule_id: 'CROSS-004',
        entity: 'payment_event',
        key: String(event.id ?? event.provider_event_id ?? 'unknown'),
        detail: 'Processed payment event has no payment reference.',
      });
    }
    if (event.payment_id && !payments.some(payment => String(payment.id) === String(event.payment_id))) {
      violations.push({
        rule_id: 'CROSS-005',
        entity: 'payment_event',
        key: String(event.id ?? event.provider_event_id ?? 'unknown'),
        detail: 'Payment event references a payment outside the supplied snapshot.',
      });
    }
  }

  for (const item of imports) {
    if (item.status === 'PUBLISHED' && item.published_product_id != null &&
        !products.has(String(item.published_product_id))) {
      violations.push({
        rule_id: 'CROSS-006',
        entity: 'product_import/product',
        key: String(item.id ?? item.published_product_id),
        detail: 'Published import points to a missing product.',
      });
    }
    if (item.category_id != null && !categories.has(String(item.category_id))) {
      violations.push({
        rule_id: 'CROSS-007',
        entity: 'product_import/category',
        key: String(item.id ?? item.category_id),
        detail: 'Import category is not present in the category snapshot.',
      });
    }
  }

  for (const product of snapshot.products || []) {
    if (product.category_id != null && !categories.has(String(product.category_id))) {
      violations.push({
        rule_id: 'CROSS-008',
        entity: 'product/category',
        key: String(product.id),
        detail: 'Product category is not present in the category snapshot.',
      });
    }
  }

  return {
    schema_version: 1,
    status: violations.length ? 'inconsistent' : 'consistent',
    violation_count: violations.length,
    violations,
  };
}

export function evaluateImpossibleValues(snapshot = {}) {
  const violations = [];

  for (const product of snapshot.products || []) {
    if (product.price != null && (!finiteNumber(product.price) || Number(product.price) < 0)) {
      violations.push({ rule_id: 'IMPOSSIBLE-001', entity: 'product', key: String(product.id), detail: 'Product price is invalid.' });
    }
    if (product.orders_count != null && (!Number.isInteger(Number(product.orders_count)) || Number(product.orders_count) < 0)) {
      violations.push({ rule_id: 'IMPOSSIBLE-002', entity: 'product', key: String(product.id), detail: 'Product orders_count is invalid.' });
    }
  }

  for (const order of snapshot.orders || []) {
    if (!finiteNumber(order.total) || Number(order.total) < 0) {
      violations.push({ rule_id: 'IMPOSSIBLE-003', entity: 'order', key: String(order.id), detail: 'Order total is invalid.' });
    }
    if (order.created_at && order.updated_at &&
        new Date(order.updated_at).getTime() < new Date(order.created_at).getTime()) {
      violations.push({ rule_id: 'IMPOSSIBLE-004', entity: 'order', key: String(order.id), detail: 'Order updated_at precedes created_at.' });
    }
  }

  for (const payment of snapshot.payments || []) {
    if (!finiteNumber(payment.amount) || Number(payment.amount) <= 0) {
      violations.push({ rule_id: 'IMPOSSIBLE-005', entity: 'payment', key: String(payment.id), detail: 'Payment amount is invalid.' });
    }
    if (payment.paid_at && payment.created_at &&
        new Date(payment.paid_at).getTime() < new Date(payment.created_at).getTime()) {
      violations.push({ rule_id: 'IMPOSSIBLE-006', entity: 'payment', key: String(payment.id), detail: 'Payment paid_at precedes created_at.' });
    }
  }

  for (const category of snapshot.categories || []) {
    if (category.parent_id != null && String(category.parent_id) === String(category.id)) {
      violations.push({ rule_id: 'IMPOSSIBLE-007', entity: 'category', key: String(category.id), detail: 'Category cannot be its own parent.' });
    }
  }

  for (const session of snapshot.chat_sessions || []) {
    for (const field of ['unread_admin', 'unread_client']) {
      if (session[field] != null && (!Number.isInteger(Number(session[field])) || Number(session[field]) < 0)) {
        violations.push({ rule_id: 'IMPOSSIBLE-008', entity: 'chat_session', key: String(session.id), detail: field + ' cannot be negative or fractional.' });
      }
    }
  }

  return {
    schema_version: 1,
    status: violations.length ? 'impossible-values-detected' : 'healthy',
    violation_count: violations.length,
    violations,
  };
}
