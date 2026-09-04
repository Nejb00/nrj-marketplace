import { state, saveCart, saveFavorites, saveOrders } from './state.js';
import { escapeHtml, formatPrice, showToast, thumbImg } from './utils.js';
import { trackPopularity } from './api.js';
import { WHATSAPP_NUMBER, BASE_URL } from './config.js';
import { refreshCatalogue } from './catalogue.js';
import { signalFavorite, signalCart, signalOrder } from './reco.js';
import { syncAllOfflineData } from './sync.js';

function syncSoon() {
    if (navigator.onLine) syncAllOfflineData().catch(() => {});
}

export function loadOrders() {
    if (!Array.isArray(state.orders)) state.orders = [];
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

let qtyPickerIndex = null;

export function openQtyPicker(idx) {
    const it = state.cart[idx];
    if (!it) return;
    qtyPickerIndex = idx;
    const moq = Number(it.moq) || 1;
    const current = Number(it.quantity);

    const overlay = document.getElementById('qtySheetOverlay');
    const list = document.getElementById('qtySheetList');
    const input = document.getElementById('qtySheetInput');
    if (!overlay || !list || !input) return;

    input.min = String(moq);
    input.value = String(current);
    input.placeholder = `Min. ${moq}`;

    // Liste : supprimer + MOQ → max(current+15, MOQ+24)
    const maxOpt = Math.max(current + 15, moq + 24);
    let html = `<button type="button" class="qty-option qty-option-remove" data-qty="0">0 (Supprimer)</button>`;
    for (let q = moq; q <= maxOpt; q++) {
        const active = q === current ? ' is-active' : '';
        html += `<button type="button" class="qty-option${active}" data-qty="${q}">${q}${active ? ' <span class="qty-check">✓</span>' : ''}</button>`;
    }
    list.innerHTML = html;

    list.querySelectorAll('[data-qty]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const q = parseInt(btn.dataset.qty, 10);
            closeQtyPicker();
            await setCartQty(idx, q);
        });
    });

    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('open'));
    setTimeout(() => input.focus(), 200);
}

export function closeQtyPicker() {
    const overlay = document.getElementById('qtySheetOverlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    setTimeout(() => { overlay.hidden = true; }, 220);
    qtyPickerIndex = null;
}

let qtySheetInited = false;
function initQtySheet() {
    if (qtySheetInited) return;
    const overlay = document.getElementById('qtySheetOverlay');
    const closeBtn = document.getElementById('qtySheetClose');
    const applyBtn = document.getElementById('qtySheetApply');
    const input = document.getElementById('qtySheetInput');
    if (!overlay) return;
    qtySheetInited = true;

    closeBtn?.addEventListener('click', closeQtyPicker);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeQtyPicker();
    });
    applyBtn?.addEventListener('click', async () => {
        if (qtyPickerIndex == null) return;
        const val = parseInt(input?.value, 10);
        closeQtyPicker();
        await setCartQty(qtyPickerIndex, val);
    });
    input?.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || qtyPickerIndex == null) return;
        const val = parseInt(input.value, 10);
        closeQtyPicker();
        await setCartQty(qtyPickerIndex, val);
    });
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

function getSelectedItems() {
    return state.cart.filter(i => i.selected !== false);
}

function getSelectedTotal() {
    return getSelectedItems().reduce((sum, it) => {
        const p = state.products.find(pr => pr.id === it.productId);
        return p ? sum + p.price * Number(it.quantity) : sum;
    }, 0);
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

export function shareCart() {
    const items = getSelectedItems().length > 0 ? getSelectedItems() : state.cart;
    if (items.length === 0) return showToast('🛒 Panier vide');

    let tot = 0;
    let msg = `🛒 *Mon panier FLUO*\n\n`;
    for (const i of items) {
        const p = state.products.find(pr => pr.id === i.productId);
        if (!p) continue;
        let d = p.name;
        if (i.couleur || i.taille) d += ` (${[i.couleur, i.taille].filter(Boolean).join(', ')})`;
        msg += `• ${d} x${Number(i.quantity)} — ${formatPrice(p.price * Number(i.quantity))}\n  🔗 ${BASE_URL}?id=${p.id}\n`;
        tot += p.price * Number(i.quantity);
    }
    msg += `\n💰 *Total : ${formatPrice(tot)}*\n\n👉 ${BASE_URL}`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    closeCartMenu();
    showToast('📤 Lien de partage ouvert');
}

function closeCartMenu() {
    const menu = document.getElementById('cartMenu');
    const btn = document.getElementById('cartMenuBtn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function openCartMenu() {
    const menu = document.getElementById('cartMenu');
    const btn = document.getElementById('cartMenuBtn');
    if (!menu || !btn) return;
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');

    const removeBtn = document.getElementById('cartMenuRemoveSelected');
    if (removeBtn) {
        const hasSelected = getSelectedItems().length > 0;
        removeBtn.disabled = !hasSelected;
        removeBtn.classList.toggle('disabled', !hasSelected);
    }
}

let cartMenuInited = false;
export function initCartMenu() {
    if (cartMenuInited) return;
    const btn = document.getElementById('cartMenuBtn');
    const menu = document.getElementById('cartMenu');
    if (!btn || !menu) return;
    cartMenuInited = true;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu.hidden) openCartMenu();
        else closeCartMenu();
    });

    menu.addEventListener('click', (e) => {
        const item = e.target.closest('[data-cart-action]');
        if (!item || item.disabled) return;
        const action = item.dataset.cartAction;
        if (action === 'clear') clearCart();
        else if (action === 'remove-selected') removeSelectedItems();
        else if (action === 'share') shareCart();
    });

    document.addEventListener('click', (e) => {
        if (!menu.hidden && !e.target.closest('.cart-menu-wrap')) {
            closeCartMenu();
        }
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initCartMenu();
            initQtySheet();
        });
    } else {
        initCartMenu();
        initQtySheet();
    }
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
    const body = document.getElementById('cartPanelBody');
    const footer = document.getElementById('cartPanelFooter');
    if (!body) return;

    initCartMenu();
    initQtySheet();

    if (state.cart.length === 0) {
        body.innerHTML = '<div class="cart-empty">Votre panier est vide</div>';
        if (footer) footer.innerHTML = '';
        updateNavCartBadge();
        return;
    }

    const selectedItems = getSelectedItems();
    const selectedCount = selectedItems.length;
    const allSelected = selectedCount === state.cart.length;
    const tot = getSelectedTotal();

    const selectBar = `
        <div class="cart-select-bar">
            <label class="cart-select-all">
                <input type="checkbox" id="cartSelectAll" ${allSelected ? 'checked' : ''}>
                <span>Tout</span>
            </label>
            <span class="cart-selected-count">Articles sélectionnés (${selectedCount})</span>
        </div>
    `;

    const itemsHtml = state.cart.map((it, idx) => {
        const p = state.products.find(pr => pr.id === it.productId);
        if (!p) return '';
        const img = p.image ? thumbImg(p.image, p.name, 80, 80) : '📦';
        const vars = [];
        if (it.couleur) vars.push(`Couleur: ${it.couleur}`);
        if (it.taille) vars.push(`Taille: ${it.taille}`);
        const dis = Number(it.quantity) <= (Number(it.moq) || 1);
        const isSelected = it.selected !== false;
        const qty = Number(it.quantity);

        return `<div class="cart-item ${isSelected ? 'is-selected' : 'is-deselected'}">
            <label class="cart-item-check">
                <input type="checkbox" data-action="cart-select" data-index="${idx}" ${isSelected ? 'checked' : ''}>
            </label>
            <div class="cart-item-img">${img}</div>
            <div class="cart-item-info">
                <h4>${escapeHtml(p.name)}</h4>
                ${vars.length ? `<div class="cart-item-variants">${escapeHtml(vars.join(', '))}</div>` : ''}
                <span class="cart-item-price">${formatPrice(p.price)}</span>
                <div class="cart-item-qty">
                    <button class="qty-btn" data-action="cart-decrease" data-index="${idx}" ${dis ? 'disabled' : ''} aria-label="Diminuer">−</button>
                    <button type="button" class="qty-value-btn" data-action="cart-qty-pick" data-index="${idx}" aria-label="Choisir la quantité">${qty} <span class="qty-chevron">▼</span></button>
                    <button class="qty-btn" data-action="cart-increase" data-index="${idx}" aria-label="Augmenter">+</button>
                </div>
            </div>
            <button class="remove-item-btn" data-action="cart-remove" data-index="${idx}">🗑️</button>
        </div>`;
    }).join('');

    body.innerHTML = selectBar + `<div class="cart-items">${itemsHtml}</div>`;

    document.getElementById('cartSelectAll')?.addEventListener('change', () => toggleSelectAll());
    body.querySelectorAll('[data-action="cart-select"]').forEach(el => {
        el.addEventListener('change', (e) => {
            const idx = parseInt(e.currentTarget.dataset.index, 10);
            toggleSelectItem(idx);
        });
    });
    body.querySelectorAll('[data-action="cart-qty-pick"]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(e.currentTarget.dataset.index, 10);
            openQtyPicker(idx);
        });
    });

    if (footer) {
        const disabled = selectedCount === 0;
        footer.innerHTML = `
            <div class="cart-total">
                <span>Total${selectedCount < state.cart.length ? ' (sélection)' : ''}</span>
                <span id="cartTotal">${formatPrice(tot)}</span>
            </div>
            <button class="checkout-btn" id="checkoutBtn" ${disabled ? 'disabled' : ''}>
                Commander via WhatsApp${selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
        `;
        if (!disabled) {
            document.getElementById('checkoutBtn')?.addEventListener('click', openOrderModal);
        }
    }

    updateNavCartBadge();
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
        let line = `• ${escapeHtml(p.name)} [ID: ${p.id}] x${Number(i.quantity)}`;
        if (i.couleur || i.taille) {
            line += ` (${[i.couleur, i.taille].filter(Boolean).join(', ')})`;
        }
        return line;
    }).filter(Boolean);

    summary.innerHTML = lines.join('<br>') + `<br><br><strong>Total : ${formatPrice(tot)}</strong>`;

    const nameInput = document.getElementById('customerName');
    if (nameInput && !nameInput.value) {
        nameInput.value = localStorage.getItem('fluo_customer_name') || '';
    }

    overlay.classList.add('open');
}

export async function sendWhatsAppOrder() {
    const name = document.getElementById('customerName')?.value.trim();
    if (!name) return showToast('⚠️ Indiquez votre nom');
    localStorage.setItem('fluo_customer_name', name);

    const selected = getSelectedItems();
    if (selected.length === 0) return showToast('⚠️ Sélectionnez au moins un article');

    let tot = 0;
    let msg = `🛒 *Nouvelle commande FLUO*\n\n👤 Client : ${name}\n\n`;
    const orderItems = [];
    for (const i of selected) {
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
    signalOrder && signalOrder();

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    document.getElementById('orderModalOverlay')?.classList.remove('open');

    state.cart = state.cart.filter(i => i.selected === false);
    await saveCart();
    refreshCartDisplay();
    showToast('✅ Commande envoyée sur WhatsApp');
}

export async function toggleFavorite(pid, btn) {
    const idx = state.favorites.indexOf(pid);
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
        showToast('💔 Retiré des favoris');
    } else {
        state.favorites.push(pid);
        showToast('❤️ Ajouté aux favoris');
        signalFavorite && signalFavorite(state.products.find(p => p.id === pid));
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
