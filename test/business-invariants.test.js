import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateCart,
  validateOrders,
  validateProductImports,
  validatePayments,
  validateBusinessState,
} from '../scripts/business-invariants.mjs';

test('business invariants accept a healthy NRJ state snapshot', () => {
  const result = validateBusinessState({
    cart: [
      { productId: 42, quantity: 6, moq: 6, taille: 'M', couleur: 'Noir', selected: true },
      { productId: 43, quantity: 2, moq: 1, taille: '', couleur: '' },
    ],
    orders: [{
      date: '2026-10-05T10:00:00.000Z',
      items: [
        { productId: 42, name: 'Produit A', price: 1200, qty: 2, variant: 'M, Noir' },
        { productId: 43, name: 'Produit B', price: 800.5, qty: 1, variant: null },
      ],
      total: 3200.5,
      recipient: 'Client NRJ',
    }],
    imports: [{
      status: 'PUBLISHED',
      product_name: 'Produit A',
      calculated_price: 1200,
      overall_confidence: 0.96,
      published_product_id: 42,
    }],
  });

  assert.equal(result.schema_version, 1);
  assert.equal(result.status, 'healthy');
  assert.equal(result.violation_count, 0);
});

test('cart invariants detect broken MOQ and duplicate variant lines', () => {
  const violations = validateCart([
    { productId: 10, quantity: 2, moq: 6, taille: 'M', couleur: 'Noir' },
    { productId: 10, quantity: 6, moq: 6, taille: ' m ', couleur: 'noir' },
  ]);

  assert.deepEqual(
    violations.map(({ rule_id }) => rule_id),
    ['CART-004', 'CART-006']
  );
});

test('cart invariants reject malformed identifiers and quantities', () => {
  const violations = validateCart([
    { productId: 'abc', quantity: 0, moq: 0, selected: 'yes' },
  ]);

  assert.deepEqual(
    violations.map(({ rule_id }) => rule_id),
    ['CART-001', 'CART-002', 'CART-003', 'CART-005']
  );
});

test('order invariants detect total drift and duplicate lines', () => {
  const violations = validateOrders([{
    date: '2026-10-05T10:00:00.000Z',
    items: [
      { productId: 1, price: 1000, qty: 2, variant: 'Noir' },
      { productId: 1, price: 1000, qty: 1, variant: ' noir ' },
    ],
    total: 5000,
  }]);

  assert.deepEqual(
    violations.map(({ rule_id }) => rule_id),
    ['ORDER-008', 'ORDER-009']
  );

  assert.deepEqual(violations.at(-1).details, {
    declared_total: 5000,
    computed_total: 3000,
  });
});

test('order invariants reject negative prices and non-positive quantities', () => {
  const violations = validateOrders([{
    items: [{ productId: 1, price: -5, qty: 0, variant: null }],
    total: 0,
  }]);

  assert.deepEqual(
    violations.map(({ rule_id }) => rule_id),
    ['ORDER-006', 'ORDER-007']
  );
});

test('product import invariants detect lifecycle contradictions', () => {
  const violations = validateProductImports([
    {
      status: 'PUBLISHED',
      overall_confidence: 1.2,
      published_product_id: null,
    },
    {
      status: 'FAILED',
    },
    {
      status: 'READY',
      product_name: '',
      calculated_price: null,
    },
    {
      status: 'UNKNOWN',
    },
  ]);

  assert.deepEqual(
    violations.map(({ rule_id }) => rule_id),
    [
      'IMPORT-002',
      'IMPORT-003',
      'IMPORT-004',
      'IMPORT-005',
      'IMPORT-006',
      'IMPORT-001',
    ]
  );
});

test('business validation is deterministic and machine-readable', () => {
  const input = {
    cart: [{ productId: 7, quantity: 2, moq: 5 }],
    orders: [],
    imports: [],
  };

  const first = validateBusinessState(input);
  const second = validateBusinessState(input);

  assert.deepEqual(first, second);
  assert.equal(first.status, 'violations-detected');
  assert.equal(first.violation_count, 1);
  assert.deepEqual(first.rules_triggered, ['CART-004']);
});


test('payment invariants accept a healthy payment lifecycle state', () => {
  const violations = validatePayments([{
    order_id: 'order-42',
    provider: 'openpay',
    idempotency_key: 'order-42-attempt-1',
    amount: 12500,
    currency: 'XAF',
    status: 'paid',
    paid_at: '2026-10-05T10:00:00.000Z',
    refunded_at: null,
  }]);

  assert.deepEqual(violations, []);
});

test('payment invariants detect missing idempotency, invalid lifecycle and inconsistent timestamps', () => {
  const violations = validatePayments([{
    order_id: '',
    provider: '',
    idempotency_key: '',
    amount: 0,
    currency: 'xaf',
    status: 'refunded',
    paid_at: 'not-a-date',
    refunded_at: null,
  }]);

  assert.deepEqual(
    violations.map(({ rule_id }) => rule_id),
    [
      'PAYMENT-001',
      'PAYMENT-002',
      'PAYMENT-003',
      'PAYMENT-004',
      'PAYMENT-005',
      'PAYMENT-008',
      'PAYMENT-010',
      'PAYMENT-011',
    ]
  );
});

test('payment invariants block paid_at on a non-settled payment', () => {
  const violations = validatePayments([{
    order_id: 'order-7',
    provider: 'openpay',
    idempotency_key: 'attempt-7',
    amount: 1000,
    currency: 'XAF',
    status: 'failed',
    paid_at: '2026-10-05T10:00:00.000Z',
  }]);

  assert.deepEqual(violations.map(({ rule_id }) => rule_id), ['PAYMENT-009']);
});

test('business state includes payment coverage in machine-readable counts', () => {
  const result = validateBusinessState({
    payments: [{
      order_id: 'order-1',
      provider: 'openpay',
      idempotency_key: 'attempt-1',
      amount: 1000,
      currency: 'XAF',
      status: 'pending',
    }],
  });

  assert.equal(result.status, 'healthy');
  assert.equal(result.checked.payments, 1);
});
