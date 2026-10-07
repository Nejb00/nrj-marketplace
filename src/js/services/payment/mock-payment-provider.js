import {
    PaymentProvider,
    PAYMENT_STATUS
} from './payment-provider.js';

/**
 * Provider de test local. Aucun appel réseau, aucun argent réel.
 *
 * Comportement :
 * - createPayment() => pending
 * - simulateStatus() permet aux tests de simuler les transitions fournisseur
 */
export class MockPaymentProvider extends PaymentProvider {
    constructor() {
        super('mock');
        this.payments = new Map();
        this.counter = 0;
    }

    async createPayment(request) {
        const providerReference = `MOCK-${++this.counter}`;
        const payment = {
            providerReference,
            status: PAYMENT_STATUS.PENDING,
            request
        };
        this.payments.set(providerReference, payment);

        return {
            providerReference,
            status: payment.status,
            checkoutUrl: `https://example.invalid/mock-pay/${providerReference}`,
            raw: payment
        };
    }

    async getPaymentStatus(providerReference) {
        const payment = this.payments.get(providerReference);
        if (!payment) {
            return {
                status: PAYMENT_STATUS.FAILED,
                raw: { reason: 'not_found' }
            };
        }

        return {
            providerReference,
            status: payment.status,
            raw: payment
        };
    }

    async refundPayment(providerReference) {
        const payment = this.payments.get(providerReference);
        if (!payment || payment.status !== PAYMENT_STATUS.PAID) {
            return {
                status: PAYMENT_STATUS.FAILED,
                raw: { reason: 'payment_not_refundable' }
            };
        }

        payment.status = PAYMENT_STATUS.REFUNDED;
        return {
            providerReference,
            status: PAYMENT_STATUS.REFUNDED,
            raw: payment
        };
    }

    async verifyWebhook() {
        return { valid: false, reason: 'mock_provider_does_not_verify_signatures' };
    }

    simulateStatus(providerReference, status) {
        const payment = this.payments.get(providerReference);
        if (!payment) throw new Error('Mock payment not found');
        payment.status = status;
        return payment;
    }
}
