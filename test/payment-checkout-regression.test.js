import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const createOrder = fs.readFileSync(
    'supabase/functions/create-order/index.ts',
    'utf8'
);

const openPayProvider = fs.readFileSync(
    'src/js/services/payment/openpay-provider.js',
    'utf8'
);

test('checkout phone validation uses the intended Congo format', () => {
    assert.ok(
        createOrder.includes(String.raw`const PHONE_PATTERN = /^242\d{9}$/;`)
    );
    assert.ok(
        openPayProvider.includes(String.raw`return /^242\d{9}$/.test(String(value || '').trim());`)
    );
});

test('checkout bearer parsing accepts the standard Authorization header', () => {
    assert.ok(
        createOrder.includes(String.raw`const match = value.match(/^Bearer\s+(.+)$/i);`)
    );
});


test('OpenPay provider uses the centralized phone validator', () => {
    assert.ok(
        openPayProvider.includes('if (!isValidCongoPhone(phone)) {')
    );
});
