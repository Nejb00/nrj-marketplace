import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20261005140232_harden_payment_reconciliation.sql',
  'utf8',
);
const paymentOpenPay = fs.readFileSync(
  'supabase/functions/payment-openpay/index.ts',
  'utf8',
);
const mobileMoneyCheckout = fs.readFileSync(
  'src/js/services/payment/mobile-money-checkout.js',
  'utf8',
);
const openPayProvider = fs.readFileSync(
  'src/js/services/payment/openpay-provider.js',
  'utf8',
);
const paymentService = fs.readFileSync(
  'src/js/services/payment/payment-service.js',
  'utf8',
);

test('payment status transition accepts an immediate OpenPay success', () => {
  assert.match(
    migration,
    /OLD\.status = 'pending' AND NEW\.status IN \('processing', 'paid', 'failed', 'cancelled'\)/,
  );
});

test('payment-openpay retries local persistence after a confirmed provider success', () => {
  assert.match(paymentOpenPay, /persistConfirmedPayment/);
  assert.match(paymentOpenPay, /MAX_PERSIST_ATTEMPTS/);
  assert.match(paymentOpenPay, /provider_reference/);
  assert.match(paymentOpenPay, /status/);
});

test('missing OpenPay reference stays pending instead of becoming failed', () => {
  const start = paymentOpenPay.indexOf('const providerReference = String(remote.data.reference || "").trim();');
  const end = paymentOpenPay.indexOf('const status = mapOpenPayStatus(remote.data.status);', start);
  assert.ok(start >= 0 && end > start);

  const referenceBlock = paymentOpenPay.slice(start, end);
  assert.match(referenceBlock, /payment_reconciliation_required/);
  assert.match(referenceBlock, /reason: "provider_reference_missing"/);
  assert.doesNotMatch(referenceBlock, /status: "failed"/);
  assert.doesNotMatch(referenceBlock, /openpay_reference_missing/);
});

test('OpenPay callback can recover a reference using callback metadata without creating a new payment', () => {
  const callback = fs.readFileSync(
    'supabase/functions/openpay-callback/index.ts',
    'utf8',
  );

  assert.match(callback, /body\.metadata/);
  assert.match(callback, /provider_reference=is\.null/);
  assert.match(callback, /status=in\.\(pending,processing\)/);
  assert.match(callback, /\/transaction\/status\//);
  assert.match(callback, /remoteReference !== reference/);
  assert.doesNotMatch(callback, /\/transaction\/payment/);
});

test('payment-openpay exposes reconciliation without creating a second transaction', () => {
  assert.match(paymentOpenPay, /action\?: "create" \| "status" \| "reconcile"/);
  assert.match(paymentOpenPay, /payment_reconciliation_required/);

  const start = paymentOpenPay.indexOf('if (action === "reconcile")');
  const end = paymentOpenPay.indexOf('if (action === "status")', start);
  assert.ok(start >= 0 && end > start);
  const reconcileBlock = paymentOpenPay.slice(start, end);
  assert.doesNotMatch(reconcileBlock, /\/transaction\/payment/);
});

test('mobile money checkout can recover a confirmed provider reference', () => {
  assert.match(mobileMoneyCheckout, /reconcilePayment/);
  assert.match(mobileMoneyCheckout, /reconciliation_required/);
  assert.match(mobileMoneyCheckout, /providerReference/);
});

test('OpenPay provider preserves reconciliation details and exposes a reconcile operation', () => {
  assert.match(openPayProvider, /class PaymentFunctionError extends Error/);
  assert.match(openPayProvider, /this\.details = details/);
  assert.match(openPayProvider, /async reconcilePayment/);
  assert.match(openPayProvider, /callPaymentFunction\('reconcile'/);
});

test('PaymentService exposes the provider-neutral reconciliation boundary', () => {
  assert.match(paymentService, /async reconcilePayment/);
  assert.match(paymentService, /this\.provider\.reconcilePayment/);
  assert.match(paymentService, /providerReference/);
});
