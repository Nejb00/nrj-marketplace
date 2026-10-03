// ═══ Panier — panneau : rendu du body/footer + bindings ═══
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
import { forYou, hasProfile } from './reco.js';
import { renderProductCardHTML } from '../features/catalogue/render-product-card.js';

let cartPanelEventsInited = false;

function getRecommendations() {
    const inCart = new Set(state.cart.map(item => item.productId));
    const eligible = state.products.filter(p => p && p.id != null && !inCart.has(p.id));
    if (!eligible.length) return [];

    const ranked = hasProfile()
        ? forYou(eligible)
        : [...eligible].sort((a, b) =>
            (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0)
        );

    return ranked.slice(0, 6);
}

function renderRecommendations(products) {
    if (!products.length) return '';

    const cards = products.map((p, i) =>
        '<div class="rec-card cart-reco-card" data-product-id="' + p.id + '" role="listitem">' +
            renderProductCardHTML(p, i) +
        '</div>'
    ).join('');

    return '<section class="cart-recommendations" aria-labelledby="cartRecommendationsTitle">' +
        '<div class="cart-recommendations-heading">' +
            '<h3 id="cartRecommendationsTitle">Tu pourrais aimer</h3>' +
        '</div>' +
        '<div class="cart-recommendations-grid" role="list">' +
            cards +
        '</div>' +
    '</section>';
}

function backToCatalogue() {
    document.getElementById('cartPanel')?.classList.remove('open');
    document.getElementById('cartOverlay')?.classList.remove('open');
    document.querySelector('.nav-item[data-nav="home"]')?.click();
}

function initCartPanelEvents(body, footer) {
    if (cartPanelEventsInited || !body || !footer) return;
    cartPanelEventsInited = true;

    body.addEventListener('click', (e) => {
        const qtyButton = e.target.closest('[data-action="cart-qty-pick"]');
        if (qtyButton) {
            e.stopPropagation();
            openQtyPicker(parseInt(qtyButton.dataset.index, 10));
            return;
        }

        const discoverButton = e.target.closest('[data-action="cart-discover"]');
        if (discoverButton) {
            e.preventDefault();
            backToCatalogue();
        }
    });

    body.addEventListener('change', (e) => {
        const target = e.target;

        if (target.id === 'cartSelectAll') {
            toggleSelectAll();
            return;
        }

        const selectItem = target.closest('[data-action="cart-select"]');
        if (selectItem) {
            toggleSelectItem(parseInt(selectItem.dataset.index, 10));
        }
    });

    footer.addEventListener('click', (e) => {
        const checkoutButton = e.target.closest('[data-action="cart-checkout"]');
        if (!checkoutButton || checkoutButton.disabled) return;
        openOrderModal();
    });
}

function renderCartItems() {
    return state.cart.map((it, idx) => {
        const p = state.products.find(pr => pr.id === it.productId);
        if (!p) return '';

        const img = p.image ? thumbImg(p.image, p.name, 80, 80) : '📦';
        const vars = [];
        if (it.couleur) vars.push('Couleur: ' + it.couleur);
        if (it.taille) vars.push('Taille: ' + it.taille);
        const dis = Number(it.quantity) <= (Number(it.moq) || 1);
        const isSelected = it.selected !== false;
        const qty = Number(it.quantity);

        return '<div class="cart-item ' + (isSelected ? 'is-selected' : 'is-deselected') + '">' +
            '<label class="cart-item-check">' +
                '<input type="checkbox" data-action="cart-select" data-index="' + idx + '" ' + (isSelected ? 'checked' : '') + '>' +
            '</label>' +
            '<div class="cart-item-img">' + img + '</div>' +
            '<div class="cart-item-info">' +
                '<h4>' + escapeHtml(p.name) + '</h4>' +
                (vars.length ? '<div class="cart-item-variants">' + escapeHtml(vars.join(', ')) + '</div>' : '') +
                '<span class="cart-item-price">' + formatPrice(p.price) + '</span>' +
                '<div class="cart-item-qty">' +
                    '<button class="qty-btn" data-action="cart-decrease" data-index="' + idx + '" ' + (dis ? 'disabled' : '') + ' aria-label="Diminuer">−</button>' +
                    '<button type="button" class="qty-value-btn" data-action="cart-qty-pick" data-index="' + idx + '" aria-label="Choisir la quantité">' + qty + ' <span class="qty-chevron">▼</span></button>' +
                    '<button class="qty-btn" data-action="cart-increase" data-index="' + idx + '" aria-label="Augmenter">+</button>' +
                '</div>' +
            '</div>' +
            '<button class="remove-item-btn" data-action="cart-remove" data-index="' + idx + '" aria-label="Retirer">🗑️</button>' +
        '</div>';
    }).join('');
}

export function refreshCartDisplay() {
    const body = document.getElementById('cartPanelBody');
    const footer = document.getElementById('cartPanelFooter');
    if (!body) return;

    initCartPanelEvents(body, footer);
    initCartMenu();
    initQtySheet();

    const recommendations = renderRecommendations(getRecommendations());

    if (state.cart.length === 0) {
        body.innerHTML =
            '<section class="cart-empty-state" aria-labelledby="cartEmptyTitle">' +
                '<div class="cart-empty-icon-wrap" aria-hidden="true">' +
                    '<svg class="cart-empty-icon" viewBox="0 0 48 48" fill="none">' +
                        '<path d="M6 9h5l4.1 21.2a3 3 0 0 0 2.9 2.4h19.1a3 3 0 0 0 2.9-2.2L43 16H13" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
                        '<path d="M20 38.5h.02M35 38.5h.02" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>' +
                        '<path d="M18 24h19M17 28h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".45"/>' +
                    '</svg>' +
                '</div>' +
                '<h3 id="cartEmptyTitle">Ton panier est vide</h3>' +
                '<p>Ajoute quelques trouvailles pour les retrouver ici.</p>' +
                '<button type="button" class="cart-discover-btn" data-action="cart-discover">Découvrir le catalogue</button>' +
            '</section>' +
            recommendations;

        if (footer) {
            footer.classList.remove('cart-panel-footer--filled');
            footer.innerHTML = '';
        }
        updateNavCartBadge();
        return;
    }

    const selectedItems = getSelectedItems();
    const selectedCount = selectedItems.length;
    const allSelected = selectedCount === state.cart.length;
    const tot = getSelectedTotal();

    const selectBar =
        '<div class="cart-select-bar">' +
            '<label class="cart-select-all">' +
                '<input type="checkbox" id="cartSelectAll" ' + (allSelected ? 'checked' : '') + '>' +
                '<span>Tout</span>' +
            '</label>' +
            '<span class="cart-selected-count">Articles sélectionnés (' + selectedCount + ')</span>' +
        '</div>';

    body.innerHTML = selectBar +
        '<div class="cart-items">' + renderCartItems() + '</div>' +
        recommendations;

    if (footer) {
        const disabled = selectedCount === 0;
        footer.classList.add('cart-panel-footer--filled');
        footer.innerHTML =
            '<div class="cart-footer-bar">' +
                '<div class="cart-total">' +
                    '<span>Total' + (selectedCount < state.cart.length ? ' (sélection)' : '') + '</span>' +
                    '<strong id="cartTotal">' + formatPrice(tot) + '</strong>' +
                '</div>' +
                '<button class="checkout-btn" id="checkoutBtn" data-action="cart-checkout"' + (disabled ? ' disabled' : '') + '>Commander</button>' +
            '</div>';
    }

    updateNavCartBadge();
}
