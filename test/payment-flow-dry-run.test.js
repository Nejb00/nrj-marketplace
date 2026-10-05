import test from 'node:test';
import assert from 'node:assert/strict';

import { PaymentService } from '../src/js/services/payment/payment-service.js';
import { MockPaymentProvider } from '../src/js/services/payment/mock-payment-provider.js';
import { PAYMENT_STATUS } from '../src/js/services/payment/payment-provider.js';

test('dry-run: checkout payment lifecycle pending -> processing -> paid', async () => {
    const provider = new MockPaymentProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment({
        orderId: 'dry-run-order-001',
        amount: 12500,
        currency: 'xaf',
        customer: {
            name: 'Dry Run',
            phone: '242061234567'
        },
        metadata: {
            operator: 'MTN'
        }
    });

    assert.equal(created.status, PAYMENT_STATUS.PENDING);
    assert.equal(created.providerReference, 'MOCK-1');

    provider.simulateStatus(created.providerReference, PAYMENT_STATUS.PROCESSING);

    const processing = await service.getPaymentStatus(created.providerReference);
    assert.equal(processing.status, PAYMENT_STATUS.PROCESSING);
    assert.equal(processing.final, false);

    provider.simulateStatus(created.providerReference, PAYMENT_STATUS.PAID);

    const paid = await service.getPaymentStatus(created.providerReference);
    assert.equal(paid.status, PAYMENT_STATUS.PAID);
    assert.equal(paid.final, true);
});

test('dry-run: failed payment never becomes terminal paid', async () => {
    const provider = new MockPaymentProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment({
        orderId: 'dry-run-order-002',
        amount: 8000
    });

    provider.simulateStatus(created.providerReference, PAYMENT_STATUS.FAILED);

    const failed = await service.getPaymentStatus(created.providerReference);
    assert.equal(failed.status, PAYMENT_STATUS.FAILED);
    assert.equal(failed.final, true);
    assert.notEqual(failed.status, PAYMENT_STATUS.PAID);
});

test('dry-run: paid payment can complete the provider refund path', async () => {
    const provider = new MockPaymentProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment({
        orderId: 'dry-run-order-003',
        amount: 9900
    });

    provider.simulateStatus(created.providerReference, PAYMENT_STATUS.PAID);

    const refunded = await service.refundPayment(created.providerReference);

    assert.equal(refunded.status, PAYMENT_STATUS.REFUNDED);
    assert.equal(refunded.providerReference, created.providerReference);
});
