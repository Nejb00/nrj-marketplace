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
const auditMigration = fs.readFileSync(
  'supabase/migrations/20261005165000_payment_audit_observability.sql',
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


test('ATTAQUE #20 protects the refund milestone as well', () => {
  assert.match(
    stateMachineMigration,
    /NEW\.status = 'refunded'[\s\S]+OLD\.status <> 'paid'/,
  );
  assert.match(
    stateMachineMigration,
    /UPDATE public\.orders[\s\S]+status = 'refunded'/,
  );
});


test('ATTAQUE #21 provides an append-only payment status audit trail', () => {
  assert.match(
    auditMigration,
    /CREATE TABLE IF NOT EXISTS public\.payment_status_history/,
  );
  assert.match(
    auditMigration,
    /payment_id uuid NOT NULL REFERENCES public\.payments/,
  );
  assert.match(
    auditMigration,
    /from_status text/,
  );
  assert.match(
    auditMigration,
    /to_status text NOT NULL/,
  );
  assert.match(
    auditMigration,
    /provider_event_id text/,
  );
  assert.match(
    auditMigration,
    /changed_at timestamptz NOT NULL DEFAULT now\(\)/,
  );
  assert.match(
    auditMigration,
    /CREATE TRIGGER trigger_audit_payment_status_change[\s\S]+AFTER INSERT OR UPDATE OF status, provider_reference ON public\.payments/,
  );
  assert.match(
    auditMigration,
    /REVOKE EXECUTE[\s\S]+FROM PUBLIC, anon, authenticated/,
  );
  assert.match(
    auditMigration,
    /ALTER TABLE public\.payment_status_history ENABLE ROW LEVEL SECURITY/,
  );
  assert.match(
    auditMigration,
    /CREATE TRIGGER trigger_prevent_payment_audit_mutation[\s\S]+BEFORE UPDATE OR DELETE ON public\.payment_status_history/,
  );
  assert.match(
    auditMigration,
    /payment_status_history is append-only/,
  );
});

test('ATTAQUE #21 supports explicit audit context for provider callbacks', () => {
  assert.match(
    auditMigration,
    /set_config\(\s*'app\.payment_audit_source'/,
  );
  assert.match(
    auditMigration,
    /set_config\(\s*'app\.payment_provider_event_id'/,
  );
  assert.match(
    auditMigration,
    /CREATE OR REPLACE FUNCTION public\.set_payment_status_with_audit/,
  );
  assert.match(
    auditMigration,
    /GRANT EXECUTE[\s\S]+TO service_role/,
  );
});
