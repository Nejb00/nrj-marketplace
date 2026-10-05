// ═══ Commande — partage panier + création de commande serveur ═══
import { state, saveCart, saveOrders } from '../core/state.js';
import { escapeHtml } from '../utils/escape-html.js';
import { formatPrice } from '../utils/format.js';
import { showToast } from '../utils/dom-helpers.js';
import { WHATSAPP_NUMBER, BASE_URL } from '../core/config.js';
import { signalOrder } from './reco.js';
import { getSelectedItems } from './cart-storage.js';
import { closeCartMenu } from './cart-menu.js';
import { refreshCartDisplay } from './cart-panel.js';
import { createRemoteOrder } from './payment/order-service.js';

function readCustomerPhone() {
    return document.getElementById('customerPhone')?.value.trim()
        || localStorage.getItem('fluo_customer_phone')
        || '';
}

function buildRemoteItems(selected) {
    return selected.map(item => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        taille: item.taille || null,
        couleur: item.couleur || null
    }));
}

export function shareCart() {
    const items = getSelectedItems().length > 0 ? getSelectedItems() : state.cart;
    if (items.length === 0) return showToast('🛒 Panier vide');

    let tot = 0;
    let msg = '🛒 *Mon panier NRJ Marketplace*\n\n';
    for (const i of items) {
        const p = state.products.find(pr => pr.id === i.productId);
        if (!p) continue;
        let d = p.name;
        if (i.couleur || i.taille) d += ' (' + [i.couleur, i.taille].filter(Boolean).join(', ') + ')';
        msg += '• ' + d + ' x' + Number(i.quantity) + ' — ' + formatPrice(p.price * Number(i.quantity)) + '\n  🔗 ' + BASE_URL + '?id=' + p.id + '\n';
        tot += p.price * Number(i.quantity);
    }
    msg += '\n💰 *Total : ' + formatPrice(tot) + '*\n\n👉 ' + BASE_URL;

    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    closeCartMenu();
    showToast('📤 Lien de partage ouvert');
}

export function openOrderModal() {
    const overlay = document.getElementById('orderModalOverlay');
    const summary = document.getElementById('orderSummary');
    if (!overlay || !summary) return;

    const selected = getSelectedItems();
    if (selected.length === 0) {
        showToast('⚠️ Sélectionnez au moins un article');
        return;
    }

    let tot = 0;
    const lines = selected.map(i => {
        const p = state.products.find(pr => pr.id === i.productId);
        if (!p) return '';
        tot += p.price * Number(i.quantity);
        let line = '• ' + escapeHtml(p.name) + ' [ID: ' + p.id + '] x' + Number(i.quantity);
        if (i.couleur || i.taille) {
            line += ' (' + [i.couleur, i.taille].filter(Boolean).join(', ') + ')';
        }
        return line;
    }).filter(Boolean);

    summary.innerHTML = lines.join('<br>') + '<br><br><strong>Total : ' + formatPrice(tot) + '</strong>';

    const nameInput = document.getElementById('customerName');
    if (nameInput && !nameInput.value) {
        nameInput.value = localStorage.getItem('fluo_customer_name') || '';
    }

    const phoneInput = document.getElementById('customerPhone');
    if (phoneInput && !phoneInput.value) {
        phoneInput.value = localStorage.getItem('fluo_customer_phone') || '';
    }

    overlay.classList.add('open');
}

export async function sendWhatsAppOrder() {
    const name = document.getElementById('customerName')?.value.trim();
    const phone = readCustomerPhone();

    if (!name) return showToast('⚠️ Indiquez votre nom');
    if (!/^242\d{9}$/.test(phone)) {
        return showToast('⚠️ Indiquez un numéro congolais valide (242XXXXXXXXX)');
    }

    localStorage.setItem('fluo_customer_name', name);
    localStorage.setItem('fluo_customer_phone', phone);

    const selected = getSelectedItems();
    if (selected.length === 0) return showToast('⚠️ Sélectionnez au moins un article');

    let tot = 0;
    let msg = '🛒 *Nouvelle commande NRJ Marketplace*\n\n👤 Client : ' + name + '\n📱 Téléphone : ' + phone + '\n\n';
    const orderItems = [];

    for (const i of selected) {
        const p = state.products.find(pr => pr.id === i.productId);
        if (!p) continue;

        let d = p.name;
        if (i.couleur || i.taille) d += ' (' + [i.couleur, i.taille].filter(Boolean).join(', ') + ')';

        msg += '- ' + d + ' x' + Number(i.quantity) + ' = ' + formatPrice(p.price * Number(i.quantity)) + '\n  🔗 ' + BASE_URL + '?id=' + p.id + '\n';
        tot += p.price * Number(i.quantity);

        const variant = [i.couleur, i.taille].filter(Boolean).join(', ');
        orderItems.push({
            productId: p.id,
            name: p.name,
            price: p.price,
            qty: Number(i.quantity),
            variant: variant || null
        });
    }

    msg += '\n💰 *Total : ' + formatPrice(tot) + '*';

    let remoteOrderId = null;

    try {
        const remote = await createRemoteOrder({
            items: buildRemoteItems(selected),
            phone,
            paymentMethod: 'whatsapp'
        });
        remoteOrderId = remote?.order_id || null;

        if (remoteOrderId) {
            msg += '\n🧾 *Commande NRJ : ' + remoteOrderId + '*';
        }
    } catch (error) {
        console.warn('Création commande serveur indisponible, fallback WhatsApp', error);
    }

    state.orders = state.orders || [];
    state.orders.unshift({
        date: new Date().toISOString(),
        items: orderItems,
        total: tot,
        recipient: name,
        phone,
        remoteOrderId,
        paymentMethod: 'whatsapp',
        syncStatus: remoteOrderId ? 'synced' : 'local'
    });

    await saveOrders();
    signalOrder && signalOrder();

    window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(msg), '_blank');
    document.getElementById('orderModalOverlay')?.classList.remove('open');

    state.cart = state.cart.filter(i => i.selected === false);
    await saveCart();
    refreshCartDisplay();

    showToast(remoteOrderId
        ? '✅ Commande enregistrée et envoyée sur WhatsApp'
        : '✅ Commande envoyée sur WhatsApp');
}
