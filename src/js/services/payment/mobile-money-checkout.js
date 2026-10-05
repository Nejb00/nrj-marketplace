import { MOBILE_MONEY_PAYMENT_ENABLED } from '../../core/config.js';
import { state, saveCart, saveOrders } from '../../core/state.js';
import { showToast } from '../../utils/dom-helpers.js';
import { getSelectedItems } from '../cart-storage.js';
import { refreshCartDisplay } from '../cart-panel.js';
import { signalOrder } from '../reco.js';
import { createRemoteOrder } from './order-service.js';
import { OpenPayProvider } from './openpay-provider.js';
import { PaymentService } from './payment-service.js';

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 10;

const provider = new OpenPayProvider();
const paymentService = new PaymentService(provider);

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
    return selected.map(item => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        taille: item.taille || null,
        couleur: item.couleur || null
    }));
}

function recordPaidOrder({ remoteOrder, selected, customer }) {
    const productMap = new Map(
        state.products.map(product => [Number(product.id), product])
    );

    const items = selected
        .map(item => {
            const product = productMap.get(Number(item.productId));
            if (!product) return null;

            const variant = [item.couleur, item.taille].filter(Boolean).join(', ');

            return {
                productId: product.id,
                name: product.name,
                price: product.price,
                qty: Number(item.quantity),
                variant: variant || null
            };
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
    if (button?.disabled) return;

    try {
        const customer = getPaymentInput();

        localStorage.setItem('fluo_customer_name', customer.name);
        localStorage.setItem('fluo_customer_phone', customer.phone);

        setPaymentUi({
            busy: true,
            message: 'Création de la commande sécurisée…'
        });

        const remoteOrder = await createRemoteOrder({
            items: buildRemoteItems(selected),
            phone: customer.phone,
            paymentMethod: 'openpay_' + customer.operator.toLowerCase()
        });

        if (!remoteOrder?.order_id || !Number.isFinite(Number(remoteOrder.total)) ||
            Number(remoteOrder.total) <= 0) {
            throw new Error('order_creation_invalid');
        }

        setPaymentUi({
            busy: true,
            message: 'Demande de paiement ' + customer.operator + ' en cours…'
        });

        const payment = await paymentService.createPayment({
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
            }
        });

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
            await saveCart();
            refreshCartDisplay();

            document.getElementById('orderModalOverlay')?.classList.remove('open');
            showToast('✅ Paiement confirmé');
            return;
        }

        const finalStatus = await waitForPayment(payment.providerReference);

        if (finalStatus === 'paid') {
            recordPaidOrder({
                remoteOrder,
                selected,
                customer
            });

            await saveOrders();
            signalOrder && signalOrder();

            state.cart = state.cart.filter(item => item.selected === false);
            await saveCart();
            refreshCartDisplay();

            document.getElementById('orderModalOverlay')?.classList.remove('open');
            showToast('✅ Paiement confirmé');
            return;
        }

        if (finalStatus === 'failed' || finalStatus === 'cancelled') {
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

        if (code === 'phone_invalid') {
            showToast('⚠️ Numéro congolais invalide');
        } else if (code === 'operator_invalid') {
            showToast('⚠️ Choisissez MTN ou Airtel');
        } else {
            showToast('❌ Paiement indisponible pour le moment');
        }
    }
}
