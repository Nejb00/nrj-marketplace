import {
    PaymentProvider,
    PAYMENT_STATUS
} from './payment-provider.js';
import {
    SUPABASE_ANON_KEY,
    SUPABASE_URL,
    supabaseClient
} from '../../core/config.js';

export const OPENPAY_FUNCTION_ENDPOINT =
    SUPABASE_URL + '/functions/v1/payment-openpay';

const SUPPORTED_OPERATORS = new Set(['MTN', 'AIRTEL']);

function normalizeOperator(value) {
    const operator = String(value || '').trim().toUpperCase();
    if (!SUPPORTED_OPERATORS.has(operator)) {
        throw new TypeError('OpenPay operator must be MTN or AIRTEL');
    }
    return operator;
}

function normalizeResponseStatus(status) {
    switch (String(status || '').toLowerCase()) {
        case 'success':
            return PAYMENT_STATUS.PAID;
        case 'failed':
            return PAYMENT_STATUS.FAILED;
        case 'cancelled':
            return PAYMENT_STATUS.CANCELLED;
        case 'processing':
            return PAYMENT_STATUS.PROCESSING;
        case 'pending':
        default:
            return PAYMENT_STATUS.PENDING;
    }
}

async function getAccessToken() {
    let { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        const { data, error } = await supabaseClient.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
    }
    if (!session?.access_token) {
        throw new Error('Supabase payment session unavailable');
    }
    return session.access_token;
}

async function callPaymentFunction(action, payload = {}) {
    const accessToken = await getAccessToken();
    const response = await fetch(OPENPAY_FUNCTION_ENDPOINT, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + accessToken,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, ...payload })
    });

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = { error: text || 'Invalid payment response' };
    }

    if (!response.ok) {
        const message = data?.error || ('Payment service error (' + response.status + ')');
        throw new Error(message);
    }

    return data;
}

export class OpenPayProvider extends PaymentProvider {
    constructor() {
        super('openpay');
    }

    async createPayment({
        orderId,
        amount,
        currency = 'XAF',
        customer = {},
        metadata = {},
        idempotencyKey = null
    } = {}) {
        const operator = normalizeOperator(
            metadata.operator || metadata.mobileProvider || metadata.paymentProvider
        );
        const phone = String(customer?.phone || metadata.paymentPhoneNumber || '').trim();

        if (!/^242\\d{9}$/.test(phone)) {
            throw new TypeError('OpenPay requires a Congo phone number in 242XXXXXXXXX format');
        }

        const result = await callPaymentFunction('create', {
            order_id: String(orderId),
            amount,
            currency,
            payment_phone_number: phone,
            operator,
            idempotency_key: idempotencyKey || null
        });

        return {
            providerReference: result?.provider_reference || null,
            status: normalizeResponseStatus(result?.status),
            checkoutUrl: result?.checkout_url || null,
            raw: result
        };
    }

    async getPaymentStatus(paymentReference) {
        const result = await callPaymentFunction('status', {
            provider_reference: paymentReference
        });

        return {
            status: normalizeResponseStatus(result?.status),
            raw: result
        };
    }

    async refundPayment() {
        throw new Error('OpenPay refund is not implemented: no public refund endpoint is documented');
    }

    async verifyWebhook() {
        throw new Error(
            'OpenPay callback signatures are not documented publicly; callbacks must revalidate status server-side'
        );
    }
}

export { normalizeOperator, normalizeResponseStatus };
