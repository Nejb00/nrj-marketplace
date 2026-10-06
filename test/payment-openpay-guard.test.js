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
        /getActivationDecision\(userId: string \| null\)/i
    );

    assert.match(
        paymentFunction,
        /reason: "master_switch_disabled"/i
    );
});

test('payment-openpay checks authentication before activation decisions', () => {
    const handler = paymentFunction.slice(paymentFunction.indexOf('Deno.serve'));
    const authPos = handler.indexOf('if (!token)');
    const activationPos = handler.indexOf('getActivationDecision(null)');

    assert.ok(authPos >= 0, 'authentication guard missing');
    assert.ok(activationPos >= 0, 'activation decision missing');
    assert.ok(authPos < activationPos, 'activation must not bypass authentication');
});

test('payment-openpay exposes readiness without provider I/O', () => {
    const handler = paymentFunction.slice(paymentFunction.indexOf('Deno.serve'));
    const readinessPos = handler.indexOf('action === "readiness"');
    const openPayPos = handler.indexOf('openPay<OpenPayPaymentResponse>');

    assert.ok(readinessPos >= 0, 'readiness action missing');
    assert.ok(openPayPos >= 0, 'provider call missing');
    assert.ok(readinessPos < openPayPos, 'readiness must be evaluated before provider I/O');
});

test('payment-openpay does not embed a provider secret', () => {
    assert.doesNotMatch(
        paymentFunction,
        /XO-API-KEY['"]?\s*[:=]\s*['"][^'$\n]+['"]/i
    );
    assert.match(paymentFunction, /Deno\.env\.get\(["']OPENPAY_API_KEY["']\)/);
});
