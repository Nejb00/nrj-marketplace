import { state, saveCart, saveFavorites, saveOrders } from './state.js';
import { escapeHtml, formatPrice, showToast, thumbImg } from './utils.js';
import { trackPopularity } from './api.js';
import { WHATSAPP_NUMBER, BASE_URL } from './config.js';
import { refreshCatalogue } from './catalogue.js';
import { signalCart } from './reco.js';
import { syncSoon } from './sync.js';

function flyToCart(sourceEl) {
    if (!sourceEl) return;
    const target = document.getElementById('cartBtnHeader') || document.getElementById('navCartBadge');
    if (!target) return;

    const rect = sourceEl.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.className = 'fly-to-cart-ghost';
    ghost.style.cssText = `position:fixed;left:${rect.left + rect.width/2}px;top:${rect.top + rect.height/2}px;width:28px;height:28px;border-radius:50%;background:var(--primary);z-index:9999;pointer-events:none;transform:translate(-50%,-50%);transition:transform 0.7s cubic-bezier(0.2,0.8,0.2,1),opacity 0.7s;`;
    document.body.appendChild(ghost);

    requestAnimationFrame(() => {
        const dx = tRect.left + tRect.width/2 - (rect.left + rect.width/2);
        const dy = tRect.top + tRect.height/2 - (rect.top + rect.height/2);
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

export async function addToCart(pid, t = '', c = '', sourceEl = null, qty = null) {
    const p = state.products.find(pr => pr.id === pid);
    if (!p) return;
    if (sourceEl) flyToCart(sourceEl);
    signalCart(p);

    const moq = Number(p.moq) || 1;
    const amount = Math.max(moq, Number(qty) || moq);
    const exist = state.cart.find(i => i.productId === pid && i.taille === t && i.couleur === c);
    if (exist) exist.quantity = Number(exist.quantity) + amount;
    else state.cart.push({ productId: pid, quantity: amount, taille: t, couleur: c, moq });
    trackPopularity(pid, 5);
    await saveCart();
    refreshCartDisplay();
    syncSoon();
    showToast(amount > 1 ? `🛒 ${amount} ajoutés au panier` : '🛒 Ajouté au panier');
}

export async function changeQty(idx, d) {
    const it = state.cart[idx];
    if (!it) return;
    const moq = Number(it.moq) || 1;
    it.quantity = Math.max(moq, Number(it.quantity) + d);
    await saveCart();
    refreshCartDisplay();
    syncSoon();
}

export async function removeCartItem(idx) {
    state.cart.splice(idx, 1);
    await saveCart();
    refreshCartDisplay();
    syncSoon();
}

export function updateNavCartBadge() {
    const cnt = state.cart.reduce((s, i) => s + Number(i.quantity), 0);
    const b = document.getElementById('navCartBadge');
    if (b) { b.textContent = cnt > 99 ? '99+' : cnt; b.style.display = cnt > 0 ? 'flex' : 'none'; }
    const hb = document.getElementById('headerCartBadge');
    if (hb) { hb.textContent = cnt > 99 ? '99+' : cnt; hb.style.display = cnt > 0 ? 'flex' : 'none'; }
}

export function updateNavFavBadge() {
    const cnt = state.favorites.length;
    const b = document.getElementById('navFavBadge');
    if (b) { b.textContent = cnt > 99 ? '99+' : cnt; b.style.display = cnt > 0 ? 'flex' : 'none'; }
}

export function refreshCartDisplay() {
    const container = document.getElementById('cartItems');
    if (!container) return;
    if (state.cart.length === 0) {
        container.innerHTML = '<div class="cart-empty">Votre panier est vide</div>';
        document.getElementById('checkoutBtn').disabled = true;
        document.getElementById('cartTotal').textContent = formatPrice(0);
        updateNavCartBadge();
        return;
    }
    let tot = 0;
    container.innerHTML = state.cart.map((it, idx) => {
        const p = state.products.find(pr => pr.id === it.productId);
        if (!p) return '';
        const img = p.image ? thumbImg(p.image, p.name, 80, 80) : '📦';
        const vars = [];
        if (it.couleur) vars.push(`Couleur: ${it.couleur}`);
        if (it.taille) vars.push(`Taille: ${it.taille}`);
        const dis = Number(it.quantity) <= (Number(it.moq) || 1);
        tot += p.price * Number(it.quantity);
        return `<div class="cart-item"><div class="cart-item-img">${img}</div><div class="cart-item-info"><h4>${escapeHtml(p.name)}</h4>${vars.length ? `<div class="cart-item-variants">${escapeHtml(vars.join(', '))}</div>` : ''}<span class="cart-item-price">${formatPrice(p.price)}</span><div class="cart-item-qty"><button class="qty-btn" data-action="cart-decrease" data-index="${idx}" ${dis ? 'disabled' : ''}>−</button><span>${Number(it.quantity)}</span><button class="qty-btn" data-action="cart-increase" data-index="${idx}">+</button></div></div><button class="remove-item-btn" data-action="cart-remove" data-index="${idx}">🗑️</button></div>`;
    }).join('');
    document.getElementById('cartTotal').textContent = formatPrice(tot);
    document.getElementById('checkoutBtn').disabled = false;
    updateNavCartBadge();
}

export function openOrderModal() {
    const overlay = document.getElementById('orderModalOverlay');
    const summary = document.getElementById('orderSummary');
    if (!overlay || !summary) return;
    let tot = 0;
    const lines = state.cart.map(i => {
        const p = state.products.find(pr => pr.id === i.productId);
        if (!p) return '';
        tot += p.price * Number(i.quantity);
        return `• ${escapeHtml(p.name)} [ID: ${p.id}] x${Number(i.quantity)}`;
    }).filter(Boolean);
    summary.innerHTML = lines.join('<br>') + `<br><br><strong>Total : ${formatPrice(tot)}</strong>`;
    overlay.classList.add('open');
}

export async function sendWhatsAppOrder() {
    const name = document.getElementById('customerName')?.value.trim();
    if (!name) return showToast('⚠️ Indiquez votre nom');
    localStorage.setItem('fluo_customer_name', name);

    let tot = 0;
    let msg = `🛒 *Nouvelle commande FLUO*\n\n👤 Client : ${name}\n\n`;
    const orderItems = [];
    for (const i of state.cart) {
        const p = state.products.find(pr => pr.id === i.productId);
        if (!p) continue;
        let d = p.name;
        if (i.couleur || i.taille) d += ` (${[i.couleur, i.taille].filter(Boolean).join(', ')})`;
        msg += `- ${d} x${Number(i.quantity)} = ${formatPrice(p.price * Number(i.quantity))}\n  🔗 ${BASE_URL}?id=${p.id}\n`;
        tot += p.price * Number(i.quantity);
        const variant = [i.couleur, i.taille].filter(Boolean).join(', ');
        orderItems.push({ productId: p.id, name: p.name, price: p.price, qty: Number(i.quantity), variant: variant || null });
    }
    msg += `\n💰 *Total : ${formatPrice(tot)}*`;

    state.orders = state.orders || [];
    state.orders.unshift({
        date: new Date().toISOString(),
        items: orderItems,
        total: tot,
        recipient: name
    });
    await saveOrders();

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    document.getElementById('orderModalOverlay')?.classList.remove('open');
    state.cart = [];
    await saveCart();
    refreshCartDisplay();
    showToast('✅ Commande envoyée sur WhatsApp');
}

export async function loadOrders() {
    // already loaded via state
}

export async function toggleFavorite(pid, btn) {
    const idx = state.favorites.indexOf(pid);
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
        showToast('💔 Retiré des favoris');
    } else {
        state.favorites.push(pid);
        showToast('❤️ Ajouté aux favoris');
    }
    await saveFavorites();
    updateNavFavBadge();
    if (btn) {
        btn.classList.toggle('active', state.favorites.includes(pid));
        const svg = btn.querySelector('svg');
        if (svg) {
            svg.classList.add('fav-pop');
            svg.addEventListener('animationend', () => svg.classList.remove('fav-pop'), { once: true });
        }
    }
}

export { saveOrders };
