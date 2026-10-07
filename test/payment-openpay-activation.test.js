import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const paymentFunction = fs.readFileSync(
    'supabase/functions/payment-openpay/index.ts',
    'utf8'
);
const config = fs.readFileSync('src/js/core/config.js', 'utf8');

test('ATTAQUE #24 uses a fail-closed server activation contract', () => {
    assert.match(paymentFunction, /OPENPAY_PAYMENT_ENABLED/);
    assert.match(paymentFunction, /OPENPAY_ACTIVATION_MODE/);
    assert.match(paymentFunction, /OPENPAY_MAX_TRANSACTION_XAF/);
    assert.match(paymentFunction, /OPENPAY_CANARY_USER_IDS/);
    assert.match(paymentFunction, /mode === "canary"/);
    assert.match(paymentFunction, /user_not_in_canary_allowlist/);
    assert.match(paymentFunction, /openpay_transaction_limit_exceeded/);
});

test('ATTAQUE #24 requires master switch + explicit mode + positive cap', () => {
    assert.match(paymentFunction, /OPENPAY_PAYMENT_ENABLED.*master_switch_disabled/s);
    assert.match(paymentFunction, /mode === "disabled".*activation_mode_disabled/s);
    assert.match(paymentFunction, /OPENPAY_MAX_TRANSACTION_XAF[\s\S]*?max_transaction_not_configured/);
});

test('ATTAQUE #24 readiness fails closed when the provider key is missing', () => {
    assert.match(
        paymentFunction,
        /if \(!OPENPAY_API_KEY\) \{[\s\S]*?provider_key_missing/
    );
});

test('ATTAQUE #24 supports a canary allowlist before live activation', () => {
    assert.match(
        paymentFunction,
        /OPENPAY_CANARY_USER_IDS = new Set/
    );
    assert.match(
        paymentFunction,
        /mode === "canary" && \(!userId \|\| !OPENPAY_CANARY_USER_IDS\.has\(userId\)\)/
    );
    assert.match(
        paymentFunction,
        /activation_mode: decision\.mode/
    );
});

test('frontend payment UI flag is not the payment authorization boundary', () => {
    assert.match(config, /VITE_MOBILE_MONEY_PAYMENT_ENABLED/);
    assert.match(config, /VITE_PAYMENT_E2E_MODE/);
    assert.match(
        config,
        /Ce flag ne constitue jamais une autorisation de paiement/
    );
});
