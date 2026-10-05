import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20261005134207_harden_payment_order_consistency.sql',
  'utf8',
);
const paymentOpenPay = fs.readFileSync(
  'supabase/functions/payment-openpay/index.ts',
  'utf8',
);
const stateMachineMigration = fs.readFileSync(
  'supabase/migrations/20261005161000_enforce_payment_order_state_machine.sql',
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
  assert.match(paymentOpenPay, /status=in\.\(pending,processing,paid,refund_pending,refunded\)/);
  assert.match(paymentOpenPay, /concurrent_live/);
});


test('ATTAQUE #20 defines a database-enforced payment -> order state machine', () => {
  assert.match(
    stateMachineMigration,
    /CREATE OR REPLACE FUNCTION public\.enforce_order_payment_state\(\)/,
  );
  assert.match(
    stateMachineMigration,
    /CREATE OR REPLACE FUNCTION public\.sync_order_payment_state\(\)/,
  );
  assert.match(
    stateMachineMigration,
    /CREATE TRIGGER trigger_enforce_order_payment_state[\s\S]+BEFORE UPDATE OF status ON public\.orders/,
  );
  assert.match(
    stateMachineMigration,
    /CREATE TRIGGER trigger_sync_order_payment_state[\s\S]+AFTER INSERT OR UPDATE OF status ON public\.payments/,
  );
  assert.match(stateMachineMigration, /NEW\.status = 'paid'/);
  assert.match(stateMachineMigration, /NEW\.status IN \('failed', 'cancelled'\)/);
  assert.match(stateMachineMigration, /NEW\.status = 'refunded'/);
});

test('ATTAQUE #20 never allows an order to become paid without a matching paid payment', () => {
  assert.match(
    stateMachineMigration,
    /Order % status % must be backed by a matching payment/,
  );
  assert.match(
    stateMachineMigration,
    /v_payment_status, v_provider_reference, v_amount, v_currency/,
  );
  assert.match(
    stateMachineMigration,
    /v_amount IS DISTINCT FROM NEW\.total/,
  );
  assert.match(
    stateMachineMigration,
    /upper\(coalesce\(v_currency, ''\)\) <> 'XAF'/,
  );
});

test('ATTAQUE #20 prevents payment terminal states from regressing the order', () => {
  assert.match(
    stateMachineMigration,
    /Order % can only be refunded after it was paid/,
  );
  assert.match(
    stateMachineMigration,
    /status IN \('pending', 'failed', 'cancelled'\)/,
  );
});
