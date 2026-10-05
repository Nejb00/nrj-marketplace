import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const createOrder = fs.readFileSync(
  'supabase/functions/create-order/index.ts',
  'utf8',
);
const paymentOpenPay = fs.readFileSync(
  'supabase/functions/payment-openpay/index.ts',
  'utf8',
);
const orderService = fs.readFileSync(
  'src/js/services/payment/order-service.js',
  'utf8',
);
const mobileCheckout = fs.readFileSync(
  'src/js/services/payment/mobile-money-checkout.js',
  'utf8',
);
const migration = fs.readFileSync(
  'supabase/migrations/20261005171000_harden_checkout_idempotency.sql',
  'utf8',
);

test('ATTAQUE #22 adds durable checkout idempotency per user', () => {
  assert.match(migration, /orders_checkout_idempotency_uidx/);
  assert.match(
    migration,
    /ALTER TABLE public\.orders[\s\S]+ADD COLUMN IF NOT EXISTS checkout_idempotency_key text/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_idempotency_uidx[\s\S]+ON public\.orders\(user_id, checkout_idempotency_key\)/,
  );
  assert.match(
    createOrder,
    /idempotency_key\?: string \| null/,
  );
  assert.match(
    createOrder,
    /paymentMethod\.startsWith\('openpay_'\) && !idempotencyKey/,
  );
  assert.match(
    createOrder,
    /order_idempotency_conflict/,
  );
});

test('ATTAQUE #22 validates idempotent payload reuse instead of blindly reusing a key', () => {
  assert.match(createOrder, /stableSerialize/);
  assert.match(createOrder, /orderFingerprint/);
  assert.match(createOrder, /existingFingerprint !== orderFingerprint/);
  assert.match(createOrder, /findExistingIdempotentOrder/);
  assert.match(createOrder, /reused: true/);
});

test('ATTAQUE #22 handles the unique-key race without creating another order', () => {
  const insertIndex = createOrder.indexOf('const insert = await supabaseRest');
  const errorIndex = createOrder.indexOf('if (insert.error || !insert.data?.[0])', insertIndex);
  assert.ok(insertIndex >= 0 && errorIndex > insertIndex);
  const block = createOrder.slice(insertIndex, errorIndex + 1800);

  assert.match(block, /findExistingIdempotentOrder/);
  assert.match(block, /order_idempotency_conflict/);
  assert.match(block, /reused: true/);
});

test('ATTAQUE #22 blocks a second active OpenPay payment across orders for one user', () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_per_user_uidx/,
  );
  assert.match(
    migration,
    /status IN \('pending', 'processing', 'refund_pending'\)/,
  );
  assert.match(
    paymentOpenPay,
    /payment_active_elsewhere/,
  );
  assert.match(
    paymentOpenPay,
    /findLivePaymentForUser/,
  );
});

test('ATTAQUE #22 requires a fresh payment idempotency key after a terminal attempt', () => {
  assert.match(
    paymentOpenPay,
    /\["failed", "cancelled", "refund_pending", "refunded"\]\.includes\(existing\.status\)/,
  );
  assert.match(paymentOpenPay, /payment_attempt_terminal/);
  assert.match(
    mobileCheckout,
    /PAYMENT_IDEMPOTENCY_STORAGE_KEY/,
  );
  assert.match(
    mobileCheckout,
    /resetPaymentAttemptKey\(\)/,
  );
});

test('ATTAQUE #22 blocks concurrent UI submission before the first await', () => {
  const start = mobileCheckout.indexOf('export async function startMobileMoneyPayment()');
  const lock = mobileCheckout.indexOf('paymentStartInFlight = true', start);
  const firstAwait = mobileCheckout.indexOf('await ', start);
  assert.ok(start >= 0 && lock > start && firstAwait > lock);
  assert.match(mobileCheckout, /if \(button\?\.disabled \|\| paymentStartInFlight\) return/);
  assert.match(mobileCheckout, /finally \{[\s\S]*paymentStartInFlight = false/);
});

test('ATTAQUE #22 reuses order/payment keys across a lost response', () => {
  assert.match(orderService, /idempotency_key: idempotencyKey/);
  assert.match(mobileCheckout, /getOrderIdempotencyKey\(\)/);
  assert.match(mobileCheckout, /getPaymentIdempotencyKey\(\)/);
  assert.match(mobileCheckout, /sessionStorage/);
});

test('ATTAQUE #22 clears the payment attempt key after a terminal result', () => {
  assert.match(
    mobileCheckout,
    /if \(payment\.status === 'failed' \|\| payment\.status === 'cancelled'\)[\s\S]+resetPaymentAttemptKey\(\)/,
  );
  assert.match(
    mobileCheckout,
    /if \(finalStatus === 'failed' \|\| finalStatus === 'cancelled'\)[\s\S]+resetPaymentAttemptKey\(\)/,
  );
});
