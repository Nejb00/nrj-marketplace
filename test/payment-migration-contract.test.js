import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const migrationPath = path.join(
    process.cwd(),
    'supabase/migrations/20261005100000_create_payment_persistence.sql'
);

const sql = fs.readFileSync(migrationPath, 'utf8');

test('payment migration creates protected persistence tables', () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.payments/i);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.payment_events/i);
    assert.match(sql, /ALTER TABLE public\.payments ENABLE ROW LEVEL SECURITY/i);
    assert.match(sql, /ALTER TABLE public\.payment_events ENABLE ROW LEVEL SECURITY/i);
});

test('payment migration enforces idempotency and provider reference uniqueness', () => {
    assert.match(sql, /payments_provider_idempotency_key_uidx/i);
    assert.match(sql, /payments_provider_reference_uidx/i);
    assert.match(sql, /payment_events_provider_event_uidx/i);
});

test('payment migration protects payment writes from public client roles', () => {
    assert.match(sql, /REVOKE INSERT, UPDATE, DELETE\s+ON public\.payments\s+FROM anon, authenticated/i);
    assert.match(sql, /REVOKE ALL\s+ON public\.payment_events\s+FROM anon, authenticated/i);
});

test('payment migration constrains status transitions', () => {
    assert.match(sql, /OLD\.status = 'pending'/i);
    assert.match(sql, /OLD\.status = 'processing'/i);
    assert.match(sql, /OLD\.status = 'paid' AND NEW\.status = 'refund_pending'/i);
    assert.match(sql, /Invalid payment status transition/i);
    assert.match(sql, /NEW\.status = 'paid' AND NEW\.paid_at IS NULL/i);
});
