import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeOperator,
    normalizeResponseStatus
} from '../src/js/services/payment/openpay-provider.js';
import { PAYMENT_STATUS } from '../src/js/services/payment/payment-provider.js';

test('OpenPay accepts only MTN and AIRTEL operators', () => {
    assert.equal(normalizeOperator('mtn'), 'MTN');
    assert.equal(normalizeOperator('AIRTEL'), 'AIRTEL');
    assert.throws(() => normalizeOperator('MOOV'), /MTN or AIRTEL/);
});

test('OpenPay statuses map to NRJ statuses', () => {
    assert.equal(normalizeResponseStatus('success'), PAYMENT_STATUS.PAID);
    assert.equal(normalizeResponseStatus('pending'), PAYMENT_STATUS.PENDING);
    assert.equal(normalizeResponseStatus('failed'), PAYMENT_STATUS.FAILED);
    assert.equal(normalizeResponseStatus('cancelled'), PAYMENT_STATUS.CANCELLED);
});

test('unknown OpenPay status fails closed to pending', () => {
    assert.equal(normalizeResponseStatus('mystery'), PAYMENT_STATUS.PENDING);
});


test('OpenPay accepts the Congo 242XXXXXXXXX phone format', async () => {
    const { isValidCongoPhone } = await import(
        '../src/js/services/payment/openpay-provider.js'
    );

    assert.equal(isValidCongoPhone('242060000001'), true);
    assert.equal(isValidCongoPhone('24206000001'), false);
    assert.equal(isValidCongoPhone('+242060000001'), false);
});
