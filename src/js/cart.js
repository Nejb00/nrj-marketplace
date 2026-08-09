import { state, saveCart, saveFavorites } from './state.js';
import { escapeHtml, formatPrice, showToast, thumbImg } from './utils.js';
import { trackPopularity } from './api.js';
import { WHATSAPP_NUMBER, BASE_URL } from './config.js';
import { refreshCatalogue } from './catalogue.js';

const ORDERS_KEY = 'nrj_orders';
export function loadOrders() {
  try { state.orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); }
  catch { state.orders = []; }
}
function saveOrders() {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(state.orders)); } catch {}
}

function flyToCart(sourceEl) {
    const target = document.getElementById('navCartBadge');
    if (!sourceEl || !target || target.style.display === 'none') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const srcRect = sourceEl.getBoundingClientRect();
    const tgtRect = target.getBoundingClientRect();

    const ghost = document.createElement('div');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.cssText = `
        position: fixed;
        top: ${srcRect.top + srcRect.height / 2 - 22}px;
        left: ${srcRect.left + srcRect.width / 2 - 22}px;
        width: 44px; height: 44px;
        background: var(--primary);
        border-radius: 50%;
        z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        pointer-events: none;
        opacity: 1;
        box-shadow: 0 4px 16px rgba(255, 140, 66, 0.5);
        transition: transform 0.85s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.85s ease;
    `;
    ghost.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="white" d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>`;
    document.body.appendChild(ghost);

    const dx = (tgtRect.left + tgtRect.width / 2 - 22) - parseFloat(ghost.style.left);
    const dy = (tgtRect.top + tgtRect.height / 2 - 22) - parseFloat(ghost.style.top);

    requestAnimationFrame(() => {
        ghost.style.transform = `translate(${dx}px, ${dy}px) scale(0.25)`;
        ghost.style.opacity = '0.2';
    });

    setTimeout(() => {
        ghost.remove();
        target.classList.remove('badge-pulse');
        void target.getBoundingClientRect();
        target.classList.add('badge-pulse');
    }, 850);
}

export async function addToCart(pid, t = '', c = '', sourceEl = null) {
    const p = state.products.find(pr => pr.id === pid);
    if (!p) return;
    if (sourceEl) flyToCart(sourceEl);

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
        const img = p.image ? thumbImg(p.image, p.name, 100, 100) : '📦';
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

    const snapshotItems = state.cart.map(i => {
        const p = state.products.find(pr => pr.id === i.productId);
        if (!p) return null;
        const variant = [i.couleur, i.taille].filter(Boolean).join(', ');
        return { productId: p.id, name: p.name, price: p.price, qty: Number(i.quantity), variant: variant || null };
    }).filter(Boolean);

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

    state.orders = state.orders || [];
    state.orders.unshift({ id: Date.now(), date: new Date().toISOString(), recipient: name, total: tot, items: snapshotItems });
    if (state.orders.length > 50) state.orders = state.orders.slice(0, 50);
    saveOrders();

    state.cart = [];
    saveCart();
    refreshCartDisplay();
    document.getElementById('orderModalOverlay').classList.remove('open');
    showToast('📤 Commande envoyée');

    const accountView = document.getElementById('accountView');
    if (accountView && accountView.style.display === 'flex') renderAccount();
}

export function toggleFavorite(pid) {
    const idx = state.favorites.indexOf(pid);
    const added = idx === -1;
    if (idx > -1) state.favorites.splice(idx, 1); else state.favorites.push(pid);
    saveFavorites();
    updateNavFavBadge();
    document.querySelectorAll(`.fav-icon[data-id="${pid}"]`).forEach(icon => {
        const svg = icon.querySelector('.fav-icon-svg');
        if (svg) svg.classList.toggle('faved', state.favorites.includes(pid));
    });
    if (document.getElementById('modalFavBtn') && state.currentProductId === pid) {
        const svg = document.getElementById('modalFavBtn').querySelector('.fav-icon-svg');
        if (svg) svg.classList.toggle('faved', state.favorites.includes(pid));
    }
    if (state.currentFilter === 'favorites') refreshCatalogue();
    if (added) pulseFavoriteIcons(pid);
}

function pulseFavoriteIcons(pid) {
    const svgs = [];
    document.querySelectorAll(`.fav-icon[data-id="${pid}"] .fav-icon-svg`).forEach(s => svgs.push(s));
    const mb = document.getElementById('modalFavBtn');
    if (mb && state.currentProductId === pid) {
        const s = mb.querySelector('.fav-icon-svg');
        if (s) svgs.push(s);
    }
    svgs.forEach(svg => {
        svg.classList.remove('fav-pop');
        void svg.getBoundingClientRect();
        svg.classList.add('fav-pop');
        svg.addEventListener('animationend', () => svg.classList.remove('fav-pop'), { once: true });
    });
}

export { saveOrders };
