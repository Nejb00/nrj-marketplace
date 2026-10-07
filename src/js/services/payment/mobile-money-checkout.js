import {
    MOBILE_MONEY_PAYMENT_ENABLED,
    supabaseClient
} from '../../core/config.js';
import { state, saveCart, saveOrders } from '../../core/state.js';
import { showToast } from '../../utils/dom-helpers.js';
import { getSelectedItems } from '../cart-storage.js';
import { refreshCartDisplay } from '../cart-panel.js';
import { signalOrder } from '../reco.js';
import { createRemoteOrder } from './order-service.js';
import { OpenPayProvider } from './openpay-provider.js';
import { PaymentService } from './payment-service.js';
import { finishDirectPurchase } from '../direct-purchase.js';

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 10;
const ORDER_IDEMPOTENCY_STORAGE_KEY = 'nrj_checkout_order_idempotency_key';
const PAYMENT_IDEMPOTENCY_STORAGE_KEY = 'nrj_payment_idempotency_key';

const provider = new OpenPayProvider();
const paymentService = new PaymentService(provider);
let pendingPaymentReference = null;
let pendingPaymentOrder = null;
let pendingPaymentCustomer = null;
let pendingPaymentItems = null;
let pendingPaymentStatus = null;
let paymentStartInFlight = false;
let activeStorageUserId = null;

async function ensureStorageUserScope() {
    let { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        const { data, error } = await supabaseClient.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
    }

    const userId = session?.user?.id;
    if (!userId) {
        throw new Error('payment_session_unavailable');
    }

    activeStorageUserId = userId;
}

function scopedStorageKey(baseKey) {
    if (!activeStorageUserId) {
        throw new Error('payment_session_unavailable');
    }

    return baseKey + ':' + activeStorageUserId;
}

function createIdempotencyKey(prefix) {
    const random = globalThis.crypto?.randomUUID?.();
    if (random) {
        return prefix + ':' + random;
    }

    return prefix + ':' + Date.now() + ':' + Math.random().toString(36).slice(2);
}

function getDurableStorage() {
    try {
        return localStorage;
    } catch {
        try {
            return sessionStorage;
        } catch {
            return null;
        }
    }
}

function getDurableKey(storageKey, prefix) {
    const storage = getDurableStorage();

    if (!storage) {
        return createIdempotencyKey(prefix);
    }

    try {
        const existing = storage.getItem(storageKey);
        if (existing) return existing;

        const created = createIdempotencyKey(prefix);
        storage.setItem(storageKey, created);
        return created;
    } catch {
        return createIdempotencyKey(prefix);
    }
}

function clearDurableKey(storageKey) {
    const storage = getDurableStorage();
    if (!storage) return;

    try {
        storage.removeItem(storageKey);
    } catch {
        // Durable storage may be unavailable; in-memory state still protects
        // the active attempt.
    }
}

function getOrderIdempotencyKey() {
    return getDurableKey(scopedStorageKey(ORDER_IDEMPOTENCY_STORAGE_KEY), 'order');
}

function getPaymentIdempotencyKey() {
    return getDurableKey(scopedStorageKey(PAYMENT_IDEMPOTENCY_STORAGE_KEY), 'payment');
}

function resetPaymentAttemptKey() {
    if (!activeStorageUserId) return;
    clearDurableKey(scopedStorageKey(PAYMENT_IDEMPOTENCY_STORAGE_KEY));
}

function resetCheckoutKeys() {
    if (!activeStorageUserId) return;
    clearDurableKey(scopedStorageKey(PAYMENT_IDEMPOTENCY_STORAGE_KEY));
    clearDurableKey(scopedStorageKey(ORDER_IDEMPOTENCY_STORAGE_KEY));
}

function resetTerminalCheckoutState() {
    pendingPaymentReference = null;
    pendingPaymentOrder = null;
    pendingPaymentCustomer = null;
    pendingPaymentItems = null;
    pendingPaymentStatus = null;
    resetCheckoutKeys();
}

function setPaymentUi({ busy = false, message = '' } = {}) {
    const button = document.getElementById('startMobileMoneyBtn');
    const status = document.getElementById('mobileMoneyStatus');

    if (button) {
        button.disabled = busy || !MOBILE_MONEY_PAYMENT_ENABLED;
        button.textContent = busy ? '⏳ Vérification...' : '⚡ Payer par Mobile Money';
    }

    if (status) {
        status.textContent = message;
        status.hidden = !message;
    }
}

function getPaymentInput() {
    const name = document.getElementById('customerName')?.value.trim() || '';
    const phone = document.getElementById('customerPhone')?.value.trim() || '';

    if (name.length < 2) {
        throw new TypeError('customer_name_invalid');
    }

    if (!/^242\d{9}$/.test(phone)) {
        throw new TypeError('phone_invalid');
    }

    const operator = document.getElementById('paymentOperator')?.value;

    if (operator !== 'MTN' && operator !== 'AIRTEL') {
        throw new TypeError('operator_invalid');
    }

    return { name, phone, operator };
}

function buildRemoteItems(selected) {
    return selected.map(item => {
        const payload = {
            productId: item.productId,
            quantity: Number(item.quantity),
            taille: item.taille || null,
            couleur: item.couleur || null
        };
        if (item.variantId != null && String(item.variantId).trim()) {
            payload.variantId = String(item.variantId).trim();
        }
        return payload;
    });
}

function recordPaidOrder({ remoteOrder, selected, customer }) {
    const alreadyRecorded = (state.orders || []).some(
        order => order.remoteOrderId === remoteOrder.order_id
    );

    if (alreadyRecorded) return;

    const productMap = new Map(
        state.products.map(product => [Number(product.id), product])
    );

    const items = selected
        .map(item => {
            const product = productMap.get(Number(item.productId));
            if (!product) return null;

            const variant = [item.couleur, item.taille].filter(Boolean).join(', ');

            const unitPrice = Number(item.unitPrice) || Number(product.price) || 0;
            const result = {
                productId: product.id,
                name: product.name,
                price: unitPrice,
                qty: Number(item.quantity),
                variant: variant || null
            };
            if (item.variantId != null && String(item.variantId).trim()) {
                result.variantId = String(item.variantId).trim();
            }
            return result;
        })
        .filter(Boolean);

    state.orders = state.orders || [];
    state.orders.unshift({
        date: new Date().toISOString(),
        items,
        total: remoteOrder.total,
        recipient: customer.name,
        phone: customer.phone,
        remoteOrderId: remoteOrder.order_id,
        paymentMethod: 'openpay_' + customer.operator.toLowerCase(),
        syncStatus: 'paid'
    });
}

async function waitForPayment(paymentReference) {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
        const result = await paymentService.getPaymentStatus(paymentReference);

        if (result.status === 'paid' ||
            result.status === 'failed' ||
            result.status === 'cancelled') {
            return result.status;
        }

        setPaymentUi({
            busy: true,
            message: 'Paiement en cours… vérification ' + (attempt + 1) + '/' + MAX_POLLS
        });

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    return 'pending';
}

export function initMobileMoneyPaymentUi() {
    const button = document.getElementById('startMobileMoneyBtn');
    if (!button) return;

    button.disabled = !MOBILE_MONEY_PAYMENT_ENABLED;

    const selector = document.getElementById('paymentOperator');
    if (selector) {
        selector.disabled = !MOBILE_MONEY_PAYMENT_ENABLED;
    }

    const status = document.getElementById('mobileMoneyStatus');
    if (status && !MOBILE_MONEY_PAYMENT_ENABLED) {
        status.hidden = false;
        status.textContent = 'Paiement Mobile Money en attente de validation de la couche paiement.';
    }
}

export async function startMobileMoneyPayment() {
    if (!MOBILE_MONEY_PAYMENT_ENABLED) {
        showToast('⚠️ Paiement Mobile Money pas encore activé');
        return;
    }

    const selected = getSelectedItems();
    if (selected.length === 0) {
        showToast('⚠️ Sélectionnez au moins un article');
        return;
    }

    const button = document.getElementById('startMobileMoneyBtn');
    if (button?.disabled || paymentStartInFlight) return;

    paymentStartInFlight = true;

    try {
        const customer = getPaymentInput();

        await ensureStorageUserScope();

        const currentItems = buildRemoteItems(selected);

        if (pendingPaymentOrder) {
            const pendingItems = pendingPaymentItems || [];
            const contextChanged =
                JSON.stringify(currentItems) !== JSON.stringify(pendingItems) ||
                !pendingPaymentCustomer ||
                pendingPaymentCustomer.name !== customer.name ||
                pendingPaymentCustomer.phone !== customer.phone ||
                pendingPaymentCustomer.operator !== customer.operator;

            if (contextChanged) {
                if (pendingPaymentStatus !== 'terminal') {
                    setPaymentUi({
                        busy: false,
                        message: 'Un paiement est déjà en cours pour ce panier. Terminez-le avant de modifier la commande.'
                    });
                    showToast('⏳ Un paiement est déjà en cours');
                    return;
                }

                pendingPaymentOrder = null;
                pendingPaymentCustomer = null;
                pendingPaymentItems = null;
                pendingPaymentStatus = null;
                pendingPaymentReference = null;
                resetCheckoutKeys();
            }
        }

        let remoteOrder = pendingPaymentOrder;

        if (!pendingPaymentReference && !pendingPaymentOrder) {
            setPaymentUi({
                busy: true,
                message: 'Création de la commande sécurisée…'
            });

            const orderIdempotencyKey = getOrderIdempotencyKey();

            try {
                remoteOrder = await createRemoteOrder({
                    items: buildRemoteItems(selected),
                    phone: customer.phone,
                    paymentMethod: 'openpay_' + customer.operator.toLowerCase(),
                    idempotencyKey: orderIdempotencyKey
                });
            } catch (error) {
                const code = error?.code || (error instanceof Error ? error.message : String(error));

                // A reused browser key with changed cart/price/operator is a
                // safe conflict, not a reason to duplicate the old order.
                // Rotate only the ORDER key, then create a fresh checkout intent.
                if (code !== 'order_idempotency_conflict') {
                    throw error;
                }

                clearSessionKey(ORDER_IDEMPOTENCY_STORAGE_KEY);

                remoteOrder = await createRemoteOrder({
                    items: buildRemoteItems(selected),
                    phone: customer.phone,
                    paymentMethod: 'openpay_' + customer.operator.toLowerCase(),
                    idempotencyKey: getOrderIdempotencyKey()
                });
            }
        }

        if (!remoteOrder?.order_id || !Number.isFinite(Number(remoteOrder.total)) ||
            Number(remoteOrder.total) <= 0) {
            throw new Error('order_creation_invalid');
        }

        pendingPaymentItems = currentItems;
        pendingPaymentCustomer = customer;

        setPaymentUi({
            busy: true,
            message: 'Demande de paiement ' + customer.operator + ' en cours…'
        });

        let payment;

        if (pendingPaymentReference) {
            payment = {
                providerReference: pendingPaymentReference,
                status: 'pending'
            };
        } else {
            try {
                payment = await paymentService.createPayment({
                    orderId: remoteOrder.order_id,
                    amount: Number(remoteOrder.total),
                    currency: 'XAF',
                    customer: {
                        name: customer.name,
                        phone: customer.phone
                    },
                    metadata: {
                        operator: customer.operator,
                        customerName: customer.name
                    },
                    idempotencyKey: getPaymentIdempotencyKey()
                });
            } catch (error) {
                const code = error?.code || (error instanceof Error ? error.message : String(error));
                const details = error?.details || {};

                if (
                    code === 'payment_reconciliation_required' &&
                    details.payment_id &&
                    !details.provider_reference
                ) {
                    // The provider may already have created the transaction while
                    // the response carrying its reference was lost. Keep the
                    // same server order/payment so the next attempt cannot create
                    // another provider transaction.
                    pendingPaymentReference = null;
                    pendingPaymentOrder = remoteOrder;
                    pendingPaymentCustomer = customer;
                    pendingPaymentItems = currentItems;
                    pendingPaymentStatus = 'active';

                    setPaymentUi({
                        busy: false,
                        message: 'Paiement en cours de récupération sécurisée. Réessayez la vérification dans quelques instants.'
                    });
                    showToast('⏳ Paiement en cours de récupération');
                    return;
                }

                if (
                    code !== 'payment_reconciliation_required' ||
                    !details.payment_id ||
                    !details.provider_reference
                ) {
                    throw error;
                }

                setPaymentUi({
                    busy: true,
                    message: 'Récupération sécurisée du paiement…'
                });

                payment = await paymentService.reconcilePayment({
                    orderId: remoteOrder.order_id,
                    paymentId: details.payment_id,
                    providerReference: details.provider_reference
                });
            }
        }

        if (!payment.providerReference) {
            throw new Error('provider_reference_missing');
        }

        if (payment.status === 'paid') {
            recordPaidOrder({
                remoteOrder,
                selected,
                customer
            });

            await saveOrders();
            signalOrder && signalOrder();

            state.cart = state.cart.filter(item => item.selected === false);
            finishDirectPurchase();
            await saveCart();
            refreshCartDisplay();

            pendingPaymentReference = null;
            pendingPaymentOrder = null;
            pendingPaymentCustomer = null;
            pendingPaymentItems = null;
            pendingPaymentStatus = null;
            resetCheckoutKeys();
            document.getElementById('orderModalOverlay')?.classList.remove('open');
            showToast('✅ Paiement confirmé');
            return;
        }

        if (payment.status === 'failed' || payment.status === 'cancelled') {
            pendingPaymentReference = null;
            pendingPaymentOrder = remoteOrder;
            pendingPaymentCustomer = customer;
            pendingPaymentItems = currentItems;
            pendingPaymentStatus = 'terminal';
            resetPaymentAttemptKey();

            setPaymentUi({
                busy: false,
                message: payment.status === 'failed'
                    ? 'Paiement refusé. Vous pouvez réessayer.'
                    : 'Paiement annulé.'
            });
            showToast(payment.status === 'failed'
                ? '❌ Paiement refusé'
                : '⚠️ Paiement annulé');
            return;
        }

        pendingPaymentReference = payment.providerReference;
        pendingPaymentOrder = remoteOrder;
        pendingPaymentCustomer = customer;
        pendingPaymentItems = currentItems;
        pendingPaymentStatus = 'active';

        const finalStatus = await waitForPayment(payment.providerReference);

        if (finalStatus === 'paid') {
            recordPaidOrder({
                remoteOrder,
                selected,
                customer: pendingPaymentCustomer || customer
            });

            await saveOrders();
            signalOrder && signalOrder();

            state.cart = state.cart.filter(item => item.selected === false);
            finishDirectPurchase();
            await saveCart();
            refreshCartDisplay();

            pendingPaymentReference = null;
            pendingPaymentOrder = null;
            pendingPaymentCustomer = null;
            resetCheckoutKeys();
            document.getElementById('orderModalOverlay')?.classList.remove('open');
            showToast('✅ Paiement confirmé');
            return;
        }

        if (finalStatus === 'failed' || finalStatus === 'cancelled') {
            pendingPaymentReference = null;
            pendingPaymentStatus = 'terminal';
            resetPaymentAttemptKey();

            setPaymentUi({
                busy: false,
                message: finalStatus === 'failed'
                    ? 'Paiement refusé. Vous pouvez réessayer.'
                    : 'Paiement annulé.'
            });
            showToast(finalStatus === 'failed'
                ? '❌ Paiement refusé'
                : '⚠️ Paiement annulé');
            return;
        }

        setPaymentUi({
            busy: false,
            message: 'Paiement toujours en attente. Vérifiez votre Mobile Money puis réessayez la vérification.'
        });
        showToast('⏳ Paiement encore en attente');
    } catch (error) {
        console.warn('Mobile Money checkout', error);
        setPaymentUi({
            busy: false,
            message: 'Impossible de démarrer le paiement. Aucun article n’a été retiré du panier.'
        });

        const code = error instanceof Error ? error.message : String(error);

        if (!pendingPaymentReference && !pendingPaymentOrder) {
            pendingPaymentCustomer = null;
            pendingPaymentItems = null;
            pendingPaymentStatus = null;
        }

        if (code === 'phone_invalid') {
            showToast('⚠️ Numéro congolais invalide');
        } else if (code === 'operator_invalid') {
            showToast('⚠️ Choisissez MTN ou Airtel');
        } else if (code === 'payment_active_elsewhere') {
            showToast('⏳ Un autre paiement est déjà en cours pour ce compte');
        } else if (code === 'payment_attempt_terminal') {
            resetPaymentAttemptKey();
            showToast('⚠️ Cette tentative est terminée. Vous pouvez réessayer.');
        } else {
            showToast('❌ Paiement indisponible pour le moment');
        }
    } finally {
        paymentStartInFlight = false;
    }
}
