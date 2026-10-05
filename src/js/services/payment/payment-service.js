import {
    PaymentProvider,
    PAYMENT_FINAL_STATUSES,
    PAYMENT_STATUS
} from './payment-provider.js';

const SUPPORTED_CURRENCY = 'XAF';

function assertPositiveAmount(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
        throw new TypeError('Payment amount must be a positive number');
    }
    return value;
}

function assertCurrency(currency) {
    const value = String(currency || SUPPORTED_CURRENCY).toUpperCase();
    if (value !== SUPPORTED_CURRENCY) {
        throw new TypeError(`Unsupported payment currency: ${value}`);
    }
    return value;
}

function normalizeStatus(status) {
    const value = String(status || PAYMENT_STATUS.PENDING).toLowerCase();
    if (!Object.values(PAYMENT_STATUS).includes(value)) {
        throw new TypeError(`Unknown payment status: ${value}`);
    }
    return value;
}

function makeIdempotencyKey(orderId) {
    return `order:${orderId}`;
}

/**
 * Orchestrateur de paiement indépendant du fournisseur.
 *
 * Cette couche ne persiste encore rien en base et ne parle à aucun opérateur
 * directement. Elle constitue le contrat métier qui sera branché au backend.
 */
export class PaymentService {
    constructor(provider) {
        if (!(provider instanceof PaymentProvider)) {
            throw new TypeError('PaymentService requires a PaymentProvider');
        }
        this.provider = provider;
    }

    async createPayment({
        orderId,
        amount,
        currency = SUPPORTED_CURRENCY,
        customer = {},
        metadata = {},
        idempotencyKey = null
    } = {}) {
        if (orderId === undefined || orderId === null || String(orderId).trim() === '') {
            throw new TypeError('orderId is required');
        }

        const normalizedAmount = assertPositiveAmount(amount);
        const normalizedCurrency = assertCurrency(currency);
        const key = idempotencyKey || makeIdempotencyKey(orderId);

        const result = await this.provider.createPayment({
            orderId: String(orderId),
            amount: normalizedAmount,
            currency: normalizedCurrency,
            customer,
            metadata,
            idempotencyKey: key
        });

        return {
            orderId: String(orderId),
            amount: normalizedAmount,
            currency: normalizedCurrency,
            provider: this.provider.name,
            providerReference: result?.providerReference || null,
            status: normalizeStatus(result?.status),
            checkoutUrl: result?.checkoutUrl || null,
            raw: result?.raw ?? result ?? null
        };
    }

    async getPaymentStatus(paymentReference, context = {}) {
        if (!paymentReference || typeof paymentReference !== 'string') {
            throw new TypeError('paymentReference is required');
        }

        const result = await this.provider.getPaymentStatus(paymentReference, context);
        const status = normalizeStatus(result?.status);

        return {
            provider: this.provider.name,
            providerReference: paymentReference,
            status,
            final: PAYMENT_FINAL_STATUSES.has(status),
            raw: result?.raw ?? result ?? null
        };
    }

    async refundPayment(paymentReference, amount = null, metadata = {}) {
        if (!paymentReference || typeof paymentReference !== 'string') {
            throw new TypeError('paymentReference is required');
        }

        const normalizedAmount = amount == null ? null : assertPositiveAmount(amount);
        const result = await this.provider.refundPayment(
            paymentReference,
            normalizedAmount,
            metadata
        );

        return {
            provider: this.provider.name,
            providerReference: paymentReference,
            status: normalizeStatus(result?.status || PAYMENT_STATUS.REFUND_PENDING),
            raw: result?.raw ?? result ?? null
        };
    }
}
