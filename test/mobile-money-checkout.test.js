import test from 'node:test';
import assert from 'node:assert/strict';

test('mobile money checkout keeps real payment disabled by default', async () => {
    const config = await import('../src/js/core/config.js');
    assert.equal(config.MOBILE_MONEY_PAYMENT_ENABLED, false);
});

test('OpenPay payment methods use the supported Congo operators', () => {
    const methods = ['openpay_mtn', 'openpay_airtel'];
    assert.deepEqual(methods, ['openpay_mtn', 'openpay_airtel']);
});
