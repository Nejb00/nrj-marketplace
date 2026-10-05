// ═══ Commande — paiement Mobile Money + fallback WhatsApp ═══
import { state, saveCart, saveOrders } from '../core/state.js';
import { escapeHtml } from '../utils/escape-html.js';
import { formatPrice } from '../utils/format.js';
import { showToast } from '../utils/dom-helpers.js';
import {
    WHATSAPP_NUMBER,
    BASE_URL,
    SUPABASE_ANON_KEY,
    SUPABASE_URL,
    supabaseClient
} from '../core/config.js';
import { signalOrder } from './reco.js';
import { getSelectedItems } from './cart-storage.js';
import { closeCartMenu } from './cart-menu.js';
import { refreshCartDisplay } from './cart-panel.js';
import { OpenPayProvider } from './payment/openpay-provider.js';
import { PaymentService } from './payment/payment-service.js';

let paymentPollTimer = null;
let paymentBusy = false;

function getSelectedOrderSnapshot() {
    const selected = getSelectedItems();

    if (selected.length === 0) return null;

    const items = [];
    let estimatedTotal = 0;

    for (const item of selected) {
        const product = state.products.find(pr => pr.id === item.productId);
        const quantity = Number(item.quantity);

        if (!product || !Number.isInteger(quantity) || quantity < 1) continue;

        estimatedTotal += Number(product.price) * quantity;
        items.push({
            product_id: Number(product.id),
            quantity,
            couleur: item.couleur || null,
            taille: item.taille || null
        });
    }

    if (items.length === 0 || !Number.isFinite(estimatedTotal) || estimatedTotal <= 0) {
        return null;
    }

    return { items, estimatedTotal };
}

async function getPaymentAccessToken() {
    let { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
        const { data, error } = await supabaseClient.auth.signInAnonymously();
        if (error) throw error;
        session = data.session;
    }

    if (!session?.access_token) {
        throw new Error('Session de paiement indisponible');
    }

    return session.access_token;
}

async function preparePaymentOrder(snapshot, { name, phone, address, operator }) {
    const accessToken = await getPaymentAccessToken();

    const response = await fetch(
        SUPABASE_URL + '/functions/v1/prepare-payment-order',
        {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + accessToken,
                apikey: SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: snapshot.items,
                customer_name: name,
                phone,
                delivery_address: address,
                operator
            })
        }
    );

    const text = await response.text();
    let data = null;

    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }

    if (!response.ok) {
        throw new Error(data?.error || 'Préparation de la commande impossible');
    }

    if (!data?.order_id || !Number.isFinite(Number(data.total))) {
        throw new Error('Commande serveur invalide');
    }

    return {
        orderId: data.order_id,
        total: Number(data.total),
        currency: String(data.currency || 'XAF').toUpperCase()
    };
}

function setPaymentBusy(busy, message = '') {
    paymentBusy = busy;

    const payButton = document.getElementById('payOrderBtn');
    const whatsappButton = document.getElementById('sendWhatsAppBtn');
    const cancelButton = document.getElementById('cancelOrderBtn');
    const status = document.getElementById('paymentStatus');

    if (payButton) {
        payButton.disabled = busy;
        payButton.textContent = busy ? '⏳ Traitement...' : '⚡ Payer avec Mobile Money';
    }

    if (whatsappButton) whatsappButton.disabled = busy;
    if (cancelButton) cancelButton.disabled = busy;

    if (status && message) {
        status.textContent = message;
        status.hidden = false;
    }
}

function stopPaymentPolling() {
    if (paymentPollTimer) {
        clearInterval(paymentPollTimer);
        paymentPollTimer = null;
    }
}

async function clearPaidCart() {
    state.cart = state.cart.filter(item => item.selected === false);
    await saveCart();
    refreshCartDisplay();
    signalOrder && signalOrder();
}

async function watchPayment(paymentService, providerReference) {
    stopPaymentPolling();

    const statusElement = document.getElementById('paymentStatus');
    let attempts = 0;

    const check = async () => {
        attempts += 1;

        try {
            const result = await paymentService.getPaymentStatus(providerReference);

            if (result.status === 'paid') {
                stopPaymentPolling();
                await clearPaidCart();
                document.getElementById('orderModalOverlay')?.classList.remove('open');
                setPaymentBusy(false);
                showToast('✅ Paiement confirmé — commande enregistrée');
                return;
            }

            if (result.status === 'failed' || result.status === 'cancelled') {
                stopPaymentPolling();
                setPaymentBusy(false, result.status === 'failed'
                    ? '❌ Le paiement a échoué. Vous pouvez réessayer.'
                    : '⚠️ Le paiement a été annulé.'
                );
                return;
            }

            if (statusElement) {
                statusElement.textContent =
                    '📲 Paiement en attente... Validation automatique en cours (' +
                    Math.min(attempts, 18) + '/18)';
                statusElement.hidden = false;
            }

            if (attempts >= 18) {
                stopPaymentPolling();
                setPaymentBusy(false, '⏱️ Validation toujours en attente. Le statut pourra être vérifié plus tard.');
            }
        } catch {
            if (statusElement) {
                statusElement.textContent =
                    '📡 Vérification du paiement en cours...';
                statusElement.hidden = false;
            }

            if (attempts >= 18) {
                stopPaymentPolling();
                setPaymentBusy(false, '📡 Vérification interrompue. Le paiement peut encore être traité par l’opérateur.');
            }
        }
    };

    await check();
    if (!paymentPollTimer) {
        paymentPollTimer = setInterval(check, 5000);
    }
}

export function shareCart() {
    const items = getSelectedItems().length > 0 ? getSelectedItems() : state.cart;
    if (items.length === 0) return showToast('🛒 Panier vide');

    let tot = 0;
    let msg = '🛒 *Mon panier NRJ Marketplace*\\n\\n';

    for (const item of items) {
        const product = state.products.find(pr => pr.id === item.productId);
        if (!product) continue;

        let description = product.name;
        if (item.couleur || item.taille) {
            description += ' (' + [item.couleur, item.taille].filter(Boolean).join(', ') + ')';
        }

        msg += '• ' + description + ' x' + Number(item.quantity) + ' — ' +
            formatPrice(product.price * Number(item.quantity)) + '\\n  🔗 ' +
            BASE_URL + '?id=' + product.id + '\\n';

        tot += product.price * Number(item.quantity);
    }

    msg += '\\n💰 *Total : ' + formatPrice(tot) + '*\\n\\n👉 ' + BASE_URL;

    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    closeCartMenu();
    showToast('📤 Lien de partage ouvert');
}

export function openOrderModal() {
    const overlay = document.getElementById('orderModalOverlay');
    const summary = document.getElementById('orderSummary');

    if (!overlay || !summary) return;

    const snapshot = getSelectedOrderSnapshot();

    if (!snapshot) {
        showToast('⚠️ Sélectionnez au moins un article');
        return;
    }

    stopPaymentPolling();
    paymentBusy = false;

    const lines = getSelectedItems().map(item => {
        const product = state.products.find(pr => pr.id === item.productId);
        if (!product) return '';

        let line = '• ' + escapeHtml(product.name) + ' x' + Number(item.quantity);

        if (item.couleur || item.taille) {
            line += ' (' + [item.couleur, item.taille].filter(Boolean).join(', ') + ')';
        }

        return line;
    }).filter(Boolean);

    summary.innerHTML =
        lines.join('<br>') +
        '<div class="payment-estimated-total"><span>Total estimé</span><strong>' +
        formatPrice(snapshot.estimatedTotal) +
        '</strong></div>';

    const nameInput = document.getElementById('customerName');
    const phoneInput = document.getElementById('customerPhone');
    const addressInput = document.getElementById('deliveryAddress');
    const status = document.getElementById('paymentStatus');

    if (nameInput && !nameInput.value) {
        nameInput.value = localStorage.getItem('fluo_customer_name') || '';
    }

    if (phoneInput && !phoneInput.value) {
        phoneInput.value = localStorage.getItem('fluo_customer_phone') || '';
    }

    if (addressInput && !addressInput.value) {
        addressInput.value = localStorage.getItem('fluo_delivery_address') || '';
    }

    document.querySelectorAll('input[name="paymentOperator"]').forEach(input => {
        input.checked = input.value === 'MTN';
    });

    if (status) {
        status.textContent = '';
        status.hidden = true;
    }

    const payButton = document.getElementById('payOrderBtn');
    if (payButton) {
        payButton.disabled = false;
        payButton.textContent = '⚡ Payer avec Mobile Money';
    }

    const whatsappButton = document.getElementById('sendWhatsAppBtn');
    if (whatsappButton) whatsappButton.disabled = false;

    const cancelButton = document.getElementById('cancelOrderBtn');
    if (cancelButton) cancelButton.disabled = false;

    overlay.classList.add('open');
}

export async function startOpenPayOrder() {
    if (paymentBusy) return;

    const snapshot = getSelectedOrderSnapshot();
    if (!snapshot) return showToast('⚠️ Sélectionnez au moins un article');

    const name = document.getElementById('customerName')?.value.trim();
    const phone = document.getElementById('customerPhone')?.value.trim();
    const address = document.getElementById('deliveryAddress')?.value.trim();
    const operator = document.querySelector('input[name="paymentOperator"]:checked')?.value;

    if (!name) return showToast('⚠️ Indiquez votre nom');
    if (!/^242\\d{9}$/.test(phone || '')) {
        return showToast('⚠️ Utilisez un numéro congolais au format 242XXXXXXXXX');
    }
    if (!address) return showToast('⚠️ Indiquez votre adresse de livraison');
    if (operator !== 'MTN' && operator !== 'AIRTEL') {
        return showToast('⚠️ Choisissez MTN ou AIRTEL');
    }

    localStorage.setItem('fluo_customer_name', name);
    localStorage.setItem('fluo_customer_phone', phone);
    localStorage.setItem('fluo_delivery_address', address);

    setPaymentBusy(true, '🔐 Vérification du panier et préparation de la commande...');

    try {
        const order = await preparePaymentOrder(snapshot, {
            name,
            phone,
            address,
            operator
        });

        const summary = document.getElementById('orderSummary');
        if (summary) {
            summary.querySelector('.payment-estimated-total')?.remove();
            summary.insertAdjacentHTML(
                'beforeend',
                '<div class="payment-authoritative-total"><span>Total confirmé</span><strong>' +
                    formatPrice(order.total) +
                '</strong></div>'
            );
        }

        setPaymentBusy(true, '📲 Connexion à Mobile Money...');

        const paymentService = new PaymentService(new OpenPayProvider());
        const payment = await paymentService.createPayment({
            orderId: order.orderId,
            amount: order.total,
            currency: order.currency,
            customer: { phone },
            metadata: { operator },
            idempotencyKey: 'order:' + order.orderId
        });

        if (!payment.providerReference) {
            throw new Error('Référence de paiement absente');
        }

        if (payment.status === 'paid') {
            await clearPaidCart();
            document.getElementById('orderModalOverlay')?.classList.remove('open');
            setPaymentBusy(false);
            showToast('✅ Paiement confirmé — commande enregistrée');
            return;
        }

        await watchPayment(paymentService, payment.providerReference);
    } catch (error) {
        stopPaymentPolling();
        setPaymentBusy(false);

        const status = document.getElementById('paymentStatus');
        if (status) {
            status.textContent = '❌ ' + (error?.message || 'Impossible de lancer le paiement.');
            status.hidden = false;
        }

        showToast('❌ Paiement non lancé');
    }
}

export async function sendWhatsAppOrder() {
    const name = document.getElementById('customerName')?.value.trim();
    if (!name) return showToast('⚠️ Indiquez votre nom');

    localStorage.setItem('fluo_customer_name', name);

    const selected = getSelectedItems();
    if (selected.length === 0) return showToast('⚠️ Sélectionnez au moins un article');

    let tot = 0;
    let msg = '🛒 *Nouvelle commande NRJ Marketplace*\\n\\n👤 Client : ' + name + '\\n\\n';
    const orderItems = [];

    for (const item of selected) {
        const product = state.products.find(pr => pr.id === item.productId);
        if (!product) continue;

        let description = product.name;
        if (item.couleur || item.taille) {
            description += ' (' + [item.couleur, item.taille].filter(Boolean).join(', ') + ')';
        }

        msg += '- ' + description + ' x' + Number(item.quantity) + ' = ' +
            formatPrice(product.price * Number(item.quantity)) + '\\n  🔗 ' +
            BASE_URL + '?id=' + product.id + '\\n';

        tot += product.price * Number(item.quantity);

        const variant = [item.couleur, item.taille].filter(Boolean).join(', ');
        orderItems.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            qty: Number(item.quantity),
            variant: variant || null
        });
    }

    msg += '\\n💰 *Total : ' + formatPrice(tot) + '*';

    state.orders = state.orders || [];
    state.orders.unshift({
        date: new Date().toISOString(),
        items: orderItems,
        total: tot,
        recipient: name,
        channel: 'whatsapp'
    });

    await saveOrders();
    signalOrder && signalOrder();

    window.open(
        'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg),
        '_blank'
    );

    document.getElementById('orderModalOverlay')?.classList.remove('open');

    state.cart = state.cart.filter(item => item.selected === false);
    await saveCart();
    refreshCartDisplay();
    showToast('✅ Commande envoyée sur WhatsApp');
}

export function cancelPaymentCheckout() {
    if (paymentBusy) return;
    stopPaymentPolling();
    document.getElementById('orderModalOverlay')?.classList.remove('open');
}

export { paymentBusy };
