import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20261005140000_harden_payment_order_consistency.sql',
  'utf8',
);
const paymentOpenPay = fs.readFileSync(
  'supabase/functions/payment-openpay/index.ts',
  'utf8',
);

test('payment persistence synchronizes provider reference to its order', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sync_order_payment_reference\(\)/);
  assert.match(
    migration,
    /CREATE TRIGGER trigger_sync_order_payment_reference[\s\S]+AFTER INSERT OR UPDATE OF provider_reference ON public\.payments/,
  );
  assert.match(
    migration,
    /UPDATE public\.orders[\s\S]+SET payment_reference = NEW\.provider_reference/,
  );
});

test('payment persistence prevents more than one live payment per order', () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS payments_one_live_per_order_uidx[\s\S]+ON public\.payments\(order_id\)[\s\S]+WHERE status IN \('pending', 'processing', 'paid', 'refund_pending', 'refunded'\)/,
  );
});

test('payment-openpay reuses a live order payment when an idempotent insert loses a race', () => {
  assert.match(paymentOpenPay, /findLivePaymentForOrder/);
  assert.match(paymentOpenPay, /payment_one_live_per_order/);
  assert.match(paymentOpenPay, /concurrent_live/);
});
