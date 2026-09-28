// ═══ Panier — panneau : rendu du body/footer + bindings ═══
// NB (refacto-archi) : l'auto-init historique de cart.js (initCartMenu +
// initQtySheet au chargement) a déménagé dans main.js (entry point, évalué
// après tous les modules → évite le TDZ du cycle cart-menu ↔ cart-actions).
import { state } from '../core/state.js';
import { escapeHtml } from '../utils/escape-html.js';
import { formatPrice } from '../utils/format.js';
import { thumbImg } from '../utils/images.js';
import { getSelectedItems, getSelectedTotal } from './cart-storage.js';
import { toggleSelectAll, toggleSelectItem } from './cart-actions.js';
import { openQtyPicker, initQtySheet } from './cart-qty-picker.js';
import { initCartMenu } from './cart-menu.js';
import { updateNavCartBadge } from './cart-badge.js';
import { openOrderModal } from './checkout.js';

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
