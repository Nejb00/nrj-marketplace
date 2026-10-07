/**
 * Contrat commun à tous les prestataires de paiement.
 *
 * Un provider ne doit jamais exposer de secret au navigateur.
 * Les implémentations réelles (OpenPay / MTN / Airtel) seront ajoutées
 * derrière ce contrat, idéalement côté serveur / Edge Function.
 */
export class PaymentProvider {
    constructor(name) {
        if (!name || typeof name !== 'string') {
            throw new TypeError('PaymentProvider.name is required');
        }
        this.name = name;
    }

    async createPayment() {
        throw new Error('PaymentProvider.createPayment() must be implemented');
    }

    async getPaymentStatus() {
        throw new Error('PaymentProvider.getPaymentStatus() must be implemented');
    }

    async reconcilePayment() {
        throw new Error('PaymentProvider.reconcilePayment() must be implemented');
    }

    async refundPayment() {
        throw new Error('PaymentProvider.refundPayment() must be implemented');
    }

    async verifyWebhook() {
        throw new Error('PaymentProvider.verifyWebhook() must be implemented');
    }
}

/** Statuts internes normalisés, indépendants du fournisseur. */
export const PAYMENT_STATUS = Object.freeze({
    PENDING: 'pending',
    PROCESSING: 'processing',
    PAID: 'paid',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    REFUND_PENDING: 'refund_pending',
    REFUNDED: 'refunded'
});

export const PAYMENT_FINAL_STATUSES = new Set([
    PAYMENT_STATUS.PAID,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.CANCELLED,
    PAYMENT_STATUS.REFUNDED
]);
