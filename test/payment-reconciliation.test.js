import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20261005143000_harden_payment_reconciliation.sql',
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

test('payment-openpay exposes reconciliation instead of recreating an ambiguous charge', () => {
  assert.match(paymentOpenPay, /action\?: "create" \| "status" \| "reconcile"/);
  assert.match(paymentOpenPay, /payment_reconciliation_required/);
  assert.match(paymentOpenPay, /action === "reconcile"/);
  assert.doesNotMatch(
    paymentOpenPay,
    /reconciliation_required[\s\S]{0,600}openPay<OpenPayPaymentResponse>\([\s\S]{0,600}\/transaction\/payment/,
  );
});

test('mobile money checkout can recover a confirmed provider reference', () => {
  assert.match(mobileMoneyCheckout, /reconcilePayment/);
  assert.match(mobileMoneyCheckout, /reconciliation_required/);
  assert.match(mobileMoneyCheckout, /providerReference/);
});
