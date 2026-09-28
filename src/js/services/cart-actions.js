// ═══ Panier — actions (ajout / suppression / quantités) ═══
// Éclaté de cart.js (refacto-archi) — logique strictement identique.
import { state, saveCart } from '../core/state.js';
import { showToast } from '../utils/dom-helpers.js';
import { trackPopularity } from '../api/api.js';
import { signalCart } from './reco.js';
import { syncAllOfflineData } from './sync.js';
import { closeCartMenu } from './cart-menu.js';
import { refreshCartDisplay } from './cart-panel.js';
import { getSelectedItems } from './cart-storage.js';

function syncSoon() {
    if (navigator.onLine) syncAllOfflineData().catch(() => {});
}

function flyToCart(sourceEl) {
    const target = document.getElementById('navCartBadge');
    if (!sourceEl || !target || target.style.display === 'none') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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
    if (exist) {
        exist.quantity = Number(exist.quantity) + amount;
        exist.selected = true;
    } else {
        state.cart.push({ productId: pid, quantity: amount, taille: t, couleur: c, moq, selected: true });
    }
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

/** Fixe une quantité exacte (respecte le MOQ). qty <= 0 → supprimer. */
export async function setCartQty(idx, qty) {
    const it = state.cart[idx];
    if (!it) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
        await removeCartItem(idx);
        return;
    }
    const moq = Number(it.moq) || 1;
    it.quantity = Math.max(moq, Math.floor(n));
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

export async function toggleSelectItem(idx) {
    const it = state.cart[idx];
    if (!it) return;
    it.selected = !it.selected;
    await saveCart();
    refreshCartDisplay();
}

export async function toggleSelectAll() {
    const allSelected = state.cart.length > 0 && state.cart.every(i => i.selected !== false);
    state.cart.forEach(i => { i.selected = !allSelected; });
    await saveCart();
    refreshCartDisplay();
}

export async function clearCart() {
    if (state.cart.length === 0) return showToast('🛒 Panier déjà vide');
    if (!confirm('Vider tout le panier ?')) return;
    state.cart = [];
    await saveCart();
    refreshCartDisplay();
    closeCartMenu();
    showToast('🧹 Panier vidé');
}

export async function removeSelectedItems() {
    const selected = getSelectedItems();
    if (selected.length === 0) return showToast('⚠️ Aucun article sélectionné');
    if (!confirm(`Supprimer ${selected.length} article${selected.length > 1 ? 's' : ''} sélectionné${selected.length > 1 ? 's' : ''} ?`)) return;
    state.cart = state.cart.filter(i => i.selected === false);
    await saveCart();
    refreshCartDisplay();
    closeCartMenu();
    showToast('🗑️ Sélection supprimée');
}
