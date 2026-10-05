import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const paymentFunction = fs.readFileSync(
    'supabase/functions/payment-openpay/index.ts',
    'utf8'
);
const config = fs.readFileSync('supabase/config.toml', 'utf8');

test('payment-openpay remains JWT-protected and feature-gated', () => {
    assert.match(
        config,
        /\[functions\.payment-openpay\][\s\S]*?verify_jwt\s*=\s*true/i
    );

    assert.match(
        paymentFunction,
        /const token = getBearerToken\(req\);[\s\S]*?if \(!token\)[\s\S]*?authentication_required/i
    );

    assert.match(
        paymentFunction,
        /if \(!OPENPAY_PAYMENT_ENABLED\)[\s\S]*?openpay_payment_disabled/i
    );
});

test('payment-openpay checks authentication before the disabled guard', () => {
    const authPos = paymentFunction.indexOf('if (!token)');
    const guardPos = paymentFunction.indexOf('if (!OPENPAY_PAYMENT_ENABLED)');

    assert.ok(authPos >= 0, 'authentication guard missing');
    assert.ok(guardPos >= 0, 'OpenPay feature guard missing');
    assert.ok(authPos < guardPos, 'feature guard must not bypass authentication');
});

test('payment-openpay does not embed a provider secret', () => {
    assert.doesNotMatch(
        paymentFunction,
        /XO-API-KEY['"]?\s*[:=]\s*['"][^'$\n]+['"]/i
    );
    assert.match(paymentFunction, /Deno\.env\.get\(["']OPENPAY_API_KEY["']\)/);
});
