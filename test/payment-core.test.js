import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PaymentProvider,
    PAYMENT_STATUS
} from '../src/js/services/payment/payment-provider.js';
import { PaymentService } from '../src/js/services/payment/payment-service.js';
import { MockPaymentProvider } from '../src/js/services/payment/mock-payment-provider.js';

test('PaymentProvider rejects an empty provider name', () => {
    assert.throws(() => new PaymentProvider(''), /name is required/);
});

test('PaymentService creates a normalized XAF payment with deterministic idempotency', async () => {
    const provider = new MockPaymentProvider();
    const service = new PaymentService(provider);

    const payment = await service.createPayment({
        orderId: 'order-123',
        amount: 15000
    });

    assert.equal(payment.orderId, 'order-123');
    assert.equal(payment.amount, 15000);
    assert.equal(payment.currency, 'XAF');
    assert.equal(payment.provider, 'mock');
    assert.equal(payment.providerReference, 'MOCK-1');
    assert.equal(payment.status, PAYMENT_STATUS.PENDING);
    assert.equal(provider.payments.get('MOCK-1').request.idempotencyKey, 'order:order-123');
});

test('PaymentService rejects invalid amounts and currencies', async () => {
    const service = new PaymentService(new MockPaymentProvider());

    await assert.rejects(
        () => service.createPayment({ orderId: '1', amount: 0 }),
        /positive number/
    );

    await assert.rejects(
        () => service.createPayment({ orderId: '1', amount: 1000, currency: 'USD' }),
        /Unsupported payment currency/
    );
});

test('PaymentService reports terminal status correctly', async () => {
    const provider = new MockPaymentProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment({
        orderId: 'order-456',
        amount: 25000
    });

    provider.simulateStatus(created.providerReference, PAYMENT_STATUS.PAID);

    const status = await service.getPaymentStatus(created.providerReference);

    assert.equal(status.status, PAYMENT_STATUS.PAID);
    assert.equal(status.final, true);
});

test('PaymentService can expose a refund transition through the provider', async () => {
    const provider = new MockPaymentProvider();
    const service = new PaymentService(provider);

    const created = await service.createPayment({
        orderId: 'order-789',
        amount: 5000
    });

    provider.simulateStatus(created.providerReference, PAYMENT_STATUS.PAID);

    const refund = await service.refundPayment(created.providerReference);

    assert.equal(refund.status, PAYMENT_STATUS.REFUNDED);
});

test('PaymentService never accepts a missing order id', async () => {
    const service = new PaymentService(new MockPaymentProvider());

    await assert.rejects(
        () => service.createPayment({ amount: 1000 }),
        /orderId is required/
    );
});
