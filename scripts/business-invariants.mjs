/**
 * NRJ Marketplace — deterministic business invariant engine.
 *
 * This layer is intentionally pure: it does not call GitHub, Supabase or the
 * filesystem. It converts structured application state into stable,
 * machine-readable business violations that CI, diagnostics and future
 * self-healing workflows can consume safely.
 */

export const BUSINESS_INVARIANTS_VERSION = 1;

const KNOWN_IMPORT_STATUSES = new Set([
  'RECEIVED',
  'ANALYZING',
  'CLASSIFIED',
  'PRICED',
  'MEDIA_READY',
  'READY',
  'PUBLISHED',
  'LOW_CONFIDENCE',
  'FAILED',
  'CANCELLED',
]);

const MONEY_EPSILON = 0.01;

function violation(ruleId, entity, message, details = {}, severity = 'error') {
  return {
    rule_id: ruleId,
    entity,
    severity,
    message,
    details,
  };
}

function positiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function finiteNonNegative(value) {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

function validConfidence(value) {
  if (value === null || value === undefined || value === '') return true;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1;
}

function normalizedVariant(value) {
  return String(value ?? '').trim().toLowerCase();
}

function cartLineKey(item) {
  return [
    Number(item?.productId),
    normalizedVariant(item?.taille),
    normalizedVariant(item?.couleur),
  ].join('|');
}

function orderLineKey(item) {
  return [
    Number(item?.productId),
    normalizedVariant(item?.variant),
  ].join('|');
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function validateCart(cart = []) {
  const violations = [];
  if (!Array.isArray(cart)) {
    return [violation(
      'CART-000',
      'cart',
      'Cart state must be an array.',
      { received_type: typeof cart }
    )];
  }

  const seen = new Map();

  cart.forEach((item, index) => {
    const entity = `cart[${index}]`;
    if (!item || typeof item !== 'object') {
      violations.push(violation('CART-000', entity, 'Cart line must be an object.'));
      return;
    }

    if (!positiveInteger(item.productId)) {
      violations.push(violation(
        'CART-001',
        entity,
        'Cart line must reference a positive integer productId.',
        { product_id: item.productId }
      ));
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      violations.push(violation(
        'CART-002',
        entity,
        'Cart quantity must be a positive integer.',
        { quantity: item.quantity }
      ));
    }

    const moq = item.moq === undefined || item.moq === null || item.moq === ''
      ? 1
      : Number(item.moq);

    if (!Number.isInteger(moq) || moq <= 0) {
      violations.push(violation(
        'CART-003',
        entity,
        'Cart MOQ must be a positive integer when present.',
        { moq: item.moq }
      ));
    } else if (Number.isInteger(quantity) && quantity > 0 && quantity < moq) {
      violations.push(violation(
        'CART-004',
        entity,
        'Cart quantity must respect the item MOQ.',
        { quantity, moq }
      ));
    }

    if (item.selected !== undefined && typeof item.selected !== 'boolean') {
      violations.push(violation(
        'CART-005',
        entity,
        'Cart selected flag must be boolean when present.',
        { selected: item.selected }
      ));
    }

    const key = cartLineKey(item);
    if (positiveInteger(item.productId)) {
      const previous = seen.get(key);
      if (previous !== undefined) {
        violations.push(violation(
          'CART-006',
          entity,
          'Cart must not contain duplicate product/variant lines.',
          { duplicate_of: `cart[${previous}]`, key }
        ));
      } else {
        seen.set(key, index);
      }
    }
  });

  return violations;
}

export function validateOrders(orders = []) {
  const violations = [];
  if (!Array.isArray(orders)) {
    return [violation(
      'ORDER-000',
      'orders',
      'Orders state must be an array.',
      { received_type: typeof orders }
    )];
  }

  orders.forEach((order, orderIndex) => {
    const entity = `orders[${orderIndex}]`;
    if (!order || typeof order !== 'object') {
      violations.push(violation('ORDER-000', entity, 'Order must be an object.'));
      return;
    }

    if (!Array.isArray(order.items) || order.items.length === 0) {
      violations.push(violation(
        'ORDER-001',
        entity,
        'Order must contain at least one item.'
      ));
    }

    const total = Number(order.total);
    if (!finiteNonNegative(order.total)) {
      violations.push(violation(
        'ORDER-002',
        entity,
        'Order total must be a finite non-negative number.',
        { total: order.total }
      ));
    }

    if (order.date !== undefined && Number.isNaN(Date.parse(String(order.date)))) {
      violations.push(violation(
        'ORDER-003',
        entity,
        'Order date must be parseable when present.',
        { date: order.date }
      ));
    }

    if (!Array.isArray(order.items)) return;

    const seen = new Map();
    let computedTotal = 0;

    order.items.forEach((item, itemIndex) => {
      const itemEntity = `${entity}.items[${itemIndex}]`;
      if (!item || typeof item !== 'object') {
        violations.push(violation('ORDER-004', itemEntity, 'Order item must be an object.'));
        return;
      }

      if (!positiveInteger(item.productId)) {
        violations.push(violation(
          'ORDER-005',
          itemEntity,
          'Order item must reference a positive integer productId.',
          { product_id: item.productId }
        ));
      }

      const qty = Number(item.qty);
      const price = Number(item.price);

      if (!Number.isInteger(qty) || qty <= 0) {
        violations.push(violation(
          'ORDER-006',
          itemEntity,
          'Order item qty must be a positive integer.',
          { qty: item.qty }
        ));
      }

      if (!finiteNonNegative(item.price)) {
        violations.push(violation(
          'ORDER-007',
          itemEntity,
          'Order item price must be a finite non-negative number.',
          { price: item.price }
        ));
      }

      if (positiveInteger(item.productId)) {
        const key = orderLineKey(item);
        const previous = seen.get(key);
        if (previous !== undefined) {
          violations.push(violation(
            'ORDER-008',
            itemEntity,
            'Order must not contain duplicate product/variant lines.',
            { duplicate_of: `${entity}.items[${previous}]`, key }
          ));
        } else {
          seen.set(key, itemIndex);
        }
      }

      if (Number.isInteger(qty) && qty > 0 && finiteNonNegative(price)) {
        computedTotal += price * qty;
      }
    });

    if (
      finiteNonNegative(order.total) &&
      Math.abs(roundMoney(computedTotal) - roundMoney(total)) > 0
    ) {
      violations.push(violation(
        'ORDER-009',
        entity,
        'Order total must equal the sum of stored line prices × quantities.',
        {
          declared_total: roundMoney(total),
          computed_total: roundMoney(computedTotal),
        }
      ));
    }
  });

  return violations;
}

export function validatePayments(payments = []) {
  const violations = [];
  const knownStatuses = new Set([
    'pending',
    'processing',
    'paid',
    'failed',
    'cancelled',
    'refund_pending',
    'refunded',
  ]);

  if (!Array.isArray(payments)) {
    return [violation(
      'PAYMENT-000',
      'payments',
      'Payment state must be an array.',
      { received_type: typeof payments }
    )];
  }

  payments.forEach((payment, index) => {
    const entity = `payments[${index}]`;
    if (!payment || typeof payment !== 'object') {
      violations.push(violation('PAYMENT-000', entity, 'Payment must be an object.'));
      return;
    }

    if (!String(payment.order_id ?? '').trim()) {
      violations.push(violation(
        'PAYMENT-001',
        entity,
        'Payment must reference an order.',
        { order_id: payment.order_id }
      ));
    }

    if (!String(payment.provider ?? '').trim()) {
      violations.push(violation(
        'PAYMENT-002',
        entity,
        'Payment must identify a provider.'
      ));
    }

    if (!String(payment.idempotency_key ?? '').trim()) {
      violations.push(violation(
        'PAYMENT-003',
        entity,
        'Payment must carry an idempotency key.'
      ));
    }

    if (!finiteNonNegative(payment.amount) || Number(payment.amount) <= 0) {
      violations.push(violation(
        'PAYMENT-004',
        entity,
        'Payment amount must be a finite positive number.',
        { amount: payment.amount }
      ));
    }

    const currency = String(payment.currency ?? '');
    if (!/^[A-Z]{3}$/.test(currency)) {
      violations.push(violation(
        'PAYMENT-005',
        entity,
        'Payment currency must be a three-letter uppercase code.',
        { currency: payment.currency }
      ));
    }

    if (!knownStatuses.has(payment.status)) {
      violations.push(violation(
        'PAYMENT-006',
        entity,
        'Payment status must belong to the known lifecycle.',
        { status: payment.status }
      ));
    }

    const settled = new Set(['paid', 'refund_pending', 'refunded']);
    if (settled.has(payment.status) && !String(payment.paid_at ?? '').trim()) {
      violations.push(violation(
        'PAYMENT-007',
        entity,
        'A settled payment must have paid_at.',
        { status: payment.status }
      ));
    }

    if (payment.status === 'refunded' && !String(payment.refunded_at ?? '').trim()) {
      violations.push(violation(
        'PAYMENT-008',
        entity,
        'A refunded payment must have refunded_at.'
      ));
    }

    if (
      ['failed', 'cancelled', 'pending', 'processing'].includes(payment.status) &&
      String(payment.paid_at ?? '').trim()
    ) {
      violations.push(violation(
        'PAYMENT-009',
        entity,
        'A non-settled payment must not expose paid_at.',
        { status: payment.status }
      ));
    }

    if (
      payment.paid_at !== undefined &&
      payment.paid_at !== null &&
      Number.isNaN(Date.parse(String(payment.paid_at)))
    ) {
      violations.push(violation(
        'PAYMENT-010',
        entity,
        'paid_at must be a parseable timestamp when present.',
        { paid_at: payment.paid_at }
      ));
    }

    if (
      payment.refunded_at !== undefined &&
      payment.refunded_at !== null &&
      Number.isNaN(Date.parse(String(payment.refunded_at)))
    ) {
      violations.push(violation(
        'PAYMENT-011',
        entity,
        'refunded_at must be a parseable timestamp when present.',
        { refunded_at: payment.refunded_at }
      ));
    }
  });

  // advanced payment chronology checks
  const paidAt = payment.paid_at ? Date.parse(String(payment.paid_at)) : null;
    const refundedAt = payment.refunded_at ? Date.parse(String(payment.refunded_at)) : null;

    if (paidAt !== null && !Number.isNaN(paidAt) && refundedAt !== null && !Number.isNaN(refundedAt) && refundedAt < paidAt) {
      violations.push(violation(
        'PAYMENT-012',
        entity,
        'refunded_at must not precede paid_at.',
        { paid_at: payment.paid_at, refunded_at: payment.refunded_at }
      ));
    }

    if (paidAt !== null && !Number.isNaN(paidAt) && payment.created_at) {
      const createdAt = Date.parse(String(payment.created_at));
      if (!Number.isNaN(createdAt) && paidAt < createdAt) {
        violations.push(violation(
          'PAYMENT-013',
          entity,
          'paid_at must not precede created_at.',
          { created_at: payment.created_at, paid_at: payment.paid_at }
        ));
      }
    }

    if (payment.status === 'refunded' && !payment.paid_at) {
      violations.push(violation(
        'PAYMENT-014',
        entity,
        'A refunded payment must have a settled payment timestamp.'
      ));
    }
  });

  return violations;
}

export function validateProductImports(imports = []) {
  const violations = [];
  if (!Array.isArray(imports)) {
    return [violation(
      'IMPORT-000',
      'product_imports',
      'Product imports state must be an array.',
      { received_type: typeof imports }
    )];
  }

  imports.forEach((item, index) => {
    const entity = `product_imports[${index}]`;
    if (!item || typeof item !== 'object') {
      violations.push(violation('IMPORT-000', entity, 'Product import must be an object.'));
      return;
    }

    if (!KNOWN_IMPORT_STATUSES.has(item.status)) {
      violations.push(violation(
        'IMPORT-001',
        entity,
        'Product import status must belong to the known lifecycle.',
        { status: item.status }
      ));
    }

    for (const field of ['category_confidence', 'overall_confidence']) {
      if (!validConfidence(item[field])) {
        violations.push(violation(
          'IMPORT-002',
          entity,
          `${field} must be between 0 and 1 when present.`,
          { field, value: item[field] }
        ));
      }
    }

    if (item.status === 'PUBLISHED' && !positiveInteger(item.published_product_id)) {
      violations.push(violation(
        'IMPORT-003',
        entity,
        'A PUBLISHED import must reference the published product.',
        { published_product_id: item.published_product_id }
      ));
    }

    if (item.status === 'FAILED' && !String(item.error_code ?? item.error_message ?? '').trim()) {
      violations.push(violation(
        'IMPORT-004',
        entity,
        'A FAILED import must expose an error code or message.'
      ));
    }

    if (item.status === 'READY') {
      if (!String(item.product_name ?? '').trim()) {
        violations.push(violation(
          'IMPORT-005',
          entity,
          'A READY import must have a product name.'
        ));
      }
      if (!finiteNonNegative(item.calculated_price)) {
        violations.push(violation(
          'IMPORT-006',
          entity,
          'A READY import must have a finite non-negative calculated price.',
          { calculated_price: item.calculated_price }
        ));
      }
    }
  });

  return violations;
}

export function validateBusinessState({
  cart = [],
  orders = [],
  imports = [],
  payments = [],
} = {}) {
  const violations = [
    ...validateCart(cart),
    ...validateOrders(orders),
    ...validateProductImports(imports),
    ...validatePayments(payments),
  ];

  const byRule = {};
  for (const item of violations) {
    byRule[item.rule_id] = (byRule[item.rule_id] || 0) + 1;
  }

  return {
    schema_version: BUSINESS_INVARIANTS_VERSION,
    status: violations.length === 0 ? 'healthy' : 'violations-detected',
    checked: {
      cart_lines: Array.isArray(cart) ? cart.length : 0,
      orders: Array.isArray(orders) ? orders.length : 0,
      product_imports: Array.isArray(imports) ? imports.length : 0,
      payments: Array.isArray(payments) ? payments.length : 0,
    },
    violation_count: violations.length,
    rules_triggered: Object.keys(byRule).sort(),
    violations,
  };
}
