import { state, saveCart, saveFavorites } from './state.js';
import { escapeHtml, formatPrice, showToast } from './utils.js';
import { trackPopularity } from './api.js';
import { WHATSAPP_NUMBER, BASE_URL } from './config.js';
import { refreshCatalogue } from './catalogue.js';

export async function addToCart(pid, t = '', c = '') {
    const p = state.products.find(pr => pr.id === pid);
    if (!p) return;
    const moq = Number(p.moq) || 1;
    const exist = state.cart.find(i => i.productId === pid && i.taille === t && i.couleur === c);
    if (exist) exist.quantity = Number(exist.quantity) + moq;
    else state.cart.push({ productId: pid, quantity: moq, taille: t, couleur: c, moq });
    trackPopularity(pid, 5);
    saveCart();
    refreshCartDisplay();
    showToast('🛒 Ajouté au panier');
}

export function changeQty(idx, d) {
    const it = state.cart[idx];
    if (!it) return;
    const moq = Number(it.moq) || 1;
    it.quantity = Math.max(moq, Number(it.quantity) + d);
    saveCart();
    refreshCartDisplay();
}

export function removeCartItem(idx) {
    state.cart.splice(idx, 1);
    saveCart();
    refreshCartDisplay();
}

export function updateNavCartBadge() {
    const cnt = state.cart.reduce((s, i) => s + Number(i.quantity), 0);
    const b = document.getElementById('navCartBadge');
    if (b) { b.textContent = cnt > 99 ? '99+' : cnt; b.style.display = cnt > 0 ? 'flex' : 'none'; }
}

export function updateNavFavBadge() {
    const cnt = state.favorites.length;
    const b = document.getElementById('navFavBadge');
    if (b) { b.textContent = cnt > 99 ? '99+' : cnt; b.style.display = cnt > 0 ? 'flex' : 'none'; }
}

export function refreshCartDisplay() {
    const tot = state.cart.reduce((s, i) => { const p = state.products.find(pr => pr.id === i.productId); return s + (p ? p.price * Number(i.quantity) : 0); }, 0);
    document.getElementById('cartTotal').textContent = formatPrice(tot);
    document.getElementById('checkoutBtn').disabled = state.cart.length === 0;
    const ctr = document.getElementById('cartItems');
    if (!state.cart.length) { ctr.innerHTML = '<div class="cart-empty">Panier vide</div>'; updateNavCartBadge(); return; }
    ctr.innerHTML = state.cart.map((it, idx) => {
        const p = state.products.find(pr => pr.id === it.productId);
        if (!p) return '';
        const img = p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">` : '📦';
        let vars = [];
        if (it.couleur) vars.push(`Couleur: ${it.couleur}`);
        if (it.taille) vars.push(`Taille: ${it.taille}`);
        const dis = Number(it.quantity) <= (Number(it.moq) || 1);
        return `<div class="cart-item"><div class="cart-item-img">${img}</div><div class="cart-item-info"><h4>${escapeHtml(p.name)}</h4>${vars.length ? `<div class="cart-item-variants">${escapeHtml(vars.join(', '))}</div>` : ''}<span class="cart-item-price">${formatPrice(p.price)}</span><div class="cart-item-qty"><button class="qty-btn" data-action="cart-decrease" data-index="${idx}" ${dis ? 'disabled' : ''}>−</button><span>${Number(it.quantity)}</span><button class="qty-btn" data-action="cart-increase" data-index="${idx}">+</button></div></div><button class="remove-item-btn" data-action="cart-remove" data-index="${idx}">🗑️</button></div>`;
    }).join('');
    updateNavCartBadge();
}

export function openOrderModal() {
    if (!state.cart.length) return;
    let tot = 0;
    const items = state.cart.map(i => {
        const p = state.products.find(pr => pr.id === i.productId);
        if (!p) return '';
        tot += p.price * Number(i.quantity);
        return `• ${escapeHtml(p.name)} [ID: ${p.id}] x${Number(i.quantity)}`;
    }).filter(Boolean).join('<br>');
    document.getElementById('orderSummary').innerHTML = `${items}<br><br><strong>Total : ${formatPrice(tot)}</strong>`;
    document.getElementById('customerName').value = localStorage.getItem('nrj_customer_name') || '';
    document.getElementById('orderModalOverlay').classList.add('open');
    document.getElementById('cartPanel').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('open');
}

export function sendWhatsAppOrder() {
    const name = document.getElementById('customerName').value.trim();
    if (!name) return alert('Entre ton nom');
    localStorage.setItem('nrj_customer_name', name);
    let msg = `Bonjour NRJ Marketplace International, je suis ${name}. Ma commande :\n`, tot = 0;
    state.cart.forEach(i => {
        const p = state.products.find(pr => pr.id === i.productId);
        if (p) {
            let d = `${p.name} [ID: ${p.id}]`;
            if (i.couleur || i.taille) d += ` (${[i.couleur, i.taille].filter(Boolean).join(', ')})`;
            msg += `- ${d} x${Number(i.quantity)} = ${formatPrice(p.price * Number(i.quantity))}\n  🔗 ${BASE_URL}?id=${p.id}\n`;
            tot += p.price * Number(i.quantity);
        }
    });
    msg += `\nTotal : ${formatPrice(tot)}\nMerci !`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    state.cart = [];
    saveCart();
    refreshCartDisplay();
    document.getElementById('orderModalOverlay').classList.remove('open');
    showToast('📤 Commande envoyée');
}

export function toggleFavorite(pid) {
    const idx = state.favorites.indexOf(pid);
    if (idx > -1) state.favorites.splice(idx, 1); else state.favorites.push(pid);
    saveFavorites();
    updateNavFavBadge();
    document.querySelectorAll(`.fav-icon[data-id="${pid}"]`).forEach(icon => {
        const svg = icon.querySelector('.fav-icon-svg');
        if (svg) svg.style.fill = state.favorites.includes(pid) ? 'var(--favorites)' : 'currentColor';
    });
    if (document.getElementById('modalFavBtn') && state.currentProductId === pid) {
        const svg = document.getElementById('modalFavBtn').querySelector('.fav-icon-svg');
        if (svg) svg.style.fill = state.favorites.includes(pid) ? 'var(--favorites)' : 'currentColor';
    }
    if (state.currentFilter === 'favorites') refreshCatalogue();
}
