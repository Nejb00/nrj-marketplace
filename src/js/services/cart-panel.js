// ═══ Panier — panneau : rendu du body/footer + bindings ═══
import { state, saveCart } from '../core/state.js';
import { escapeHtml } from '../utils/escape-html.js';
import { formatPrice } from '../utils/format.js';
import { thumbImg } from '../utils/images.js';
import { getSelectedItems, getSelectedTotal } from './cart-storage.js';
import { toggleSelectAll, toggleSelectItem, removeCartItem, setCartQty, addToCart } from './cart-actions.js';
import { openQtyPicker, initQtySheet } from './cart-qty-picker.js';
import { initCartMenu } from './cart-menu.js';
import { updateNavCartBadge } from './cart-badge.js';
import { openOrderModal } from './checkout.js';
import { forYou, hasProfile } from './reco.js';
import { renderProductCardHTML } from '../features/catalogue/render-product-card.js';

let cartPanelEventsInited = false;
let cartUiInited = false;
let lastCartTrigger = null;
let cartDrag = null;
let cartViewMode = 'all';

function findCartProduct(item) {
    return state.products.find((product) => Number(product.id) === Number(item?.productId)) || null;
}

function getCartEntries() {
    return state.cart.map((item, index) => ({
        item,
        index,
        product: findCartProduct(item)
    }));
}

function getUnavailableEntries() {
    return getCartEntries().filter((entry) => !entry.product);
}

function getSelectedQuantity(items = state.cart.filter((item) => item.selected !== false)) {
    return items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
}

function getCartQuantity() {
    return getSelectedQuantity(state.cart);
}

async function removeUnavailableCartItems() {
    const unavailable = getUnavailableEntries();
    if (!unavailable.length) return;
    if (!state.products.length) {
        console.warn('Suppression des indisponibles ignorée : catalogue non chargé');
        return;
    }
    if (!confirm(`Supprimer ${unavailable.length} article${unavailable.length > 1 ? 's' : ''} indisponible${unavailable.length > 1 ? 's' : ''} ?`)) return;

    const unavailableIds = new Set(unavailable.map(({ index }) => index));
    state.cart = state.cart.filter((item, index) => !unavailableIds.has(index));
    await saveCart();
    refreshCartDisplay();
}

const CART_FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

function isCartOpen() {
    return document.getElementById('cartPanel')?.classList.contains('open') === true;
}

function getCartFocusables() {
    const panel = document.getElementById('cartPanel');
    return panel ? [...panel.querySelectorAll(CART_FOCUSABLE_SELECTOR)] : [];
}

export function closeCartPanel({ restoreFocus = true } = {}) {
    const panel = document.getElementById('cartPanel');
    const overlay = document.getElementById('cartOverlay');
    if (!panel) return;

    panel.classList.remove('open', 'is-dragging');
    panel.style.transform = '';
    panel.setAttribute('aria-hidden', 'true');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cart-panel-open');

    const trigger = lastCartTrigger;
    lastCartTrigger = null;
    if (restoreFocus && trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
        requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
    }
}

function setupCartSheetHandle() {
    const panel = document.getElementById('cartPanel');
    const header = panel?.querySelector('.cart-panel-header');
    if (!panel || !header || header.querySelector('.cart-sheet-handle')) return;

    const handle = document.createElement('div');
    handle.className = 'cart-sheet-handle';
    handle.setAttribute('aria-hidden', 'true');
    header.prepend(handle);

    const finishDrag = (event) => {
        if (!cartDrag || (event.pointerId != null && event.pointerId !== cartDrag.pointerId)) return;
        const shouldClose = cartDrag.dy > 96;
        cartDrag = null;
        panel.classList.remove('is-dragging');
        panel.style.transform = '';
        if (shouldClose) closeCartPanel();
    };

    handle.addEventListener('pointerdown', (event) => {
        if (!window.matchMedia('(max-width: 767px)').matches) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        cartDrag = { pointerId: event.pointerId, startY: event.clientY, dy: 0 };
        panel.classList.add('is-dragging');
        panel.style.transition = 'none';
        handle.setPointerCapture?.(event.pointerId);
    });

    handle.addEventListener('pointermove', (event) => {
        if (!cartDrag || event.pointerId !== cartDrag.pointerId) return;
        cartDrag.dy = Math.max(0, event.clientY - cartDrag.startY);
        panel.style.transform = `translateY(${cartDrag.dy}px)`;
    });

    handle.addEventListener('pointerup', finishDrag);
    handle.addEventListener('pointercancel', finishDrag);
}

function setupCartAccessibility() {
    document.addEventListener('keydown', (event) => {
        if (!isCartOpen()) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeCartPanel();
            return;
        }

        if (event.key !== 'Tab') return;

        const focusables = getCartFocusables();
        if (!focusables.length) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

function initCartPanelUi() {
    if (cartUiInited) return;

    const panel = document.getElementById('cartPanel');
    const overlay = document.getElementById('cartOverlay');
    if (!panel) return;

    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-hidden', panel.classList.contains('open') ? 'false' : 'true');
    panel.setAttribute('tabindex', '-1');
    overlay?.setAttribute('aria-hidden', 'true');

    setupCartSheetHandle();
    setupCartAccessibility();
    cartUiInited = true;
}

export function openCartPanel(trigger = document.querySelector('.nav-item[data-nav="cart"]')) {
    const panel = document.getElementById('cartPanel');
    const overlay = document.getElementById('cartOverlay');
    if (!panel) return;

    initCartPanelUi();
    lastCartTrigger = trigger || document.activeElement;
    panel.classList.add('open');
    panel.classList.remove('is-dragging');
    panel.style.transform = '';
    panel.setAttribute('aria-hidden', 'false');
    overlay?.classList.add('open');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.add('cart-panel-open');

    refreshCartDisplay();

    requestAnimationFrame(() => {
        const close = document.getElementById('cartCloseBtn');
        const first = getCartFocusables()[0];
        (close || first || panel)?.focus?.({ preventScroll: true });
    });
}

function getRecommendations() {
    const inCart = new Set(state.cart.map(item => Number(item.productId)));
    const eligible = state.products.filter((p) => p && p.id != null && !inCart.has(Number(p.id)));
    if (!eligible.length) return [];

    const lastItem = state.cart[state.cart.length - 1];
    const lastProduct = lastItem
        ? state.products.find((p) => Number(p.id) === Number(lastItem.productId))
        : null;
    const categoryId = lastProduct?.category_id || null;

    const sameCategory = categoryId
        ? eligible.filter((p) => p.category_id && p.category_id === categoryId)
        : [];

    const rank = (list) => hasProfile()
        ? forYou(list)
        : [...list].sort((a, b) =>
            (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0)
        );

    const rankedSameCategory = rank(sameCategory);
    const remaining = eligible.filter((p) => !rankedSameCategory.includes(p));
    const rankedFallback = rank(remaining);

    return [...rankedSameCategory, ...rankedFallback].slice(0, 4);
}

function renderRecommendations(products) {
    if (!products.length) return '';

    const cards = products.map((p, i) =>
        '<div class="rec-card cart-reco-card" data-product-id="' + p.id + '" role="listitem">' +
            renderProductCardHTML(p, i) +
            '<button type="button" class="cart-reco-add" data-action="cart-reco-add" data-id="' + p.id + '" aria-label="Ajouter ' + escapeHtml(p.name) + '">+ Ajouter</button>' +
        '</div>'
    ).join('');

    return '<section class="cart-recommendations" aria-labelledby="cartRecommendationsTitle">' +
        '<div class="cart-recommendations-heading">' +
            '<h3 id="cartRecommendationsTitle">💡 Souvent achetés ensemble</h3>' +
        '</div>' +
        '<div class="cart-recommendations-grid" role="list">' +
            cards +
        '</div>' +
    '</section>';
}

function backToCatalogue() {
    closeCartPanel({ restoreFocus: false });
    document.querySelector('.nav-item[data-nav="home"]')?.click();
    document.querySelector('.filter-chip[data-filter="bestseller"]')?.click();
}

function initCartPanelEvents(body, footer) {
    if (cartPanelEventsInited || !body || !footer) return;
    cartPanelEventsInited = true;

    body.addEventListener('click', (e) => {
        const tabButton = e.target.closest('[data-action="cart-view-mode"]');
        if (tabButton) {
            const nextMode = tabButton.dataset.mode === 'selected' ? 'selected' : 'all';
            cartViewMode = nextMode;
            refreshCartDisplay();
            return;
        }

        const unavailableRemoveAll = e.target.closest('[data-action="cart-remove-unavailable"]');
        if (unavailableRemoveAll) {
            e.preventDefault();
            e.stopPropagation();
            removeUnavailableCartItems().catch((error) => console.error('Suppression indisponibles', error));
            return;
        }

        const manageButton = e.target.closest('[data-action="cart-manage"]');
        if (manageButton) {
            cartViewMode = 'all';
            document.getElementById('cartSelectAll')?.focus({ preventScroll: true });
            return;
        }

        const moqFill = e.target.closest('[data-action="cart-moq-fill"]');
        if (moqFill) {
            e.preventDefault();
            e.stopPropagation();
            const idx = parseInt(moqFill.dataset.index, 10);
            const item = state.cart[idx];
            const product = item ? state.products.find((p) => Number(p.id) === Number(item.productId)) : null;
            const moq = Math.max(Number(item?.moq) || 1, Number(product?.moq) || 1);
            if (item && moq > Number(item.quantity)) {
                setCartQty(idx, moq).catch((error) => {
                    console.error('Correction MOQ panier', error);
                });
            }
            return;
        }

        const editButton = e.target.closest('[data-action="cart-edit"]');
        if (editButton) {
            e.preventDefault();
            e.stopPropagation();
            const idx = parseInt(editButton.dataset.index, 10);
            if (!Number.isInteger(idx) || idx < 0) return;
            document.dispatchEvent(new CustomEvent('nrj:cart-edit', {
                detail: { index: idx, trigger: editButton }
            }));
            return;
        }

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
            return;
        }

        const recoAdd = e.target.closest('[data-action="cart-reco-add"]');
        if (recoAdd) {
            e.preventDefault();

            const pid = Number(recoAdd.dataset.id);
            const p = state.products.find((product) => Number(product.id) === pid);
            if (!p) return;

            const hasVariants =
                String(p.tailles || '').split(',').map((value) => value.trim()).filter(Boolean).length > 0 ||
                String(p.couleurs || '').split(',').map((value) => value.trim()).filter(Boolean).length > 0;

            if (hasVariants) {
                // Laisser remonter le clic vers la carte recommandée : le
                // gestionnaire global ouvre alors la fiche et son sélecteur d'options.
                return;
            }

            e.stopPropagation();

            const moq = Number(p.moq) || 1;
            addToCart(pid, '', '', recoAdd, moq).catch((error) => {
                console.error('Ajout rapide recommandation panier', error);
            });
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

    document.addEventListener('nrj:cart-manage', () => {
        cartViewMode = 'all';
        refreshCartDisplay();
        requestAnimationFrame(() => document.getElementById('cartSelectAll')?.focus({ preventScroll: true }));
    });
}

export async function removeCartItemAnimated(idx, element) {
    const target = state.cart[idx];
    if (!target || element?.dataset.removing === 'true') return;

    element?.setAttribute('aria-busy', 'true');
    element?.classList.add('is-removing');

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reducedMotion) {
        await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const currentIdx = state.cart.indexOf(target);
    if (currentIdx >= 0) {
        await removeCartItem(currentIdx);
    }
}

function renderCartItems(entries) {
    return entries.map(({ item: it, index: idx, product: p }) => {

        const img = p.image ? thumbImg(p.image, p.name, 80, 80) : '📦';
        const vars = [];
        if (it.couleur) vars.push('Couleur: ' + it.couleur);
        if (it.taille) vars.push('Taille: ' + it.taille);
        const moq = Math.max(Number(it.moq) || 1, Number(p.moq) || 1);
        const dis = Number(it.quantity) <= moq;
        const isSelected = it.selected !== false;
        const qty = Number(it.quantity);
        const lineTotal = (Number(p.price) || 0) * qty;
        const moqWarning = qty < moq
            ? '<div class="cart-moq-warning" role="status">' +
                '<span>⚠️ Minimum : ' + moq + ' pièces requises</span>' +
                '<button type="button" data-action="cart-moq-fill" data-index="' + idx + '">+ Ajouter</button>' +
              '</div>'
            : '';

        return '<div class="cart-item ' + (isSelected ? 'is-selected' : 'is-deselected') + '">' +
            '<label class="cart-item-check">' +
                '<input type="checkbox" data-action="cart-select" data-index="' + idx + '" ' + (isSelected ? 'checked' : '') + '>' +
            '</label>' +
            '<button type="button" class="cart-item-edit-trigger" data-action="cart-edit" data-index="' + idx + '" aria-label="Modifier ' + escapeHtml(p.name) + '">' +
                '<span class="cart-item-img">' + img + '</span>' +
                '<span class="cart-item-info">' +
                    '<span class="cart-item-info-name">' + escapeHtml(p.name) + '</span>' +
                    (vars.length ? '<span class="cart-item-variants">' + escapeHtml(vars.join(', ')) + '</span>' : '') +
                    '<span class="cart-item-price">Prix unitaire · ' + formatPrice(p.price) + '</span>' +
                    '<strong class="cart-item-line-total">' + formatPrice(lineTotal) + '</strong>' +
                '</span>' +
            '</button>' +
            '<div class="cart-item-qty">' +
                '<button class="qty-btn" data-action="cart-decrease" data-index="' + idx + '" ' + (dis ? 'disabled' : '') + ' aria-label="Diminuer">−</button>' +
                '<button type="button" class="qty-value-btn" data-action="cart-qty-pick" data-index="' + idx + '" aria-label="Choisir la quantité">' + qty + ' <span class="qty-chevron">▼</span></button>' +
                '<button class="qty-btn" data-action="cart-increase" data-index="' + idx + '" aria-label="Augmenter">+</button>' +
            '</div>' +
            '<button class="remove-item-btn" data-action="cart-remove" data-index="' + idx + '" aria-label="Retirer">🗑️</button>' +
            moqWarning +
        '</div>';
    }).join('');
}

function renderUnavailableItems(entries) {
    if (!entries.length) return '';

    const cards = entries.map(({ item: it, index: idx }) => {
        const label = it.productName || it.name || (`Produit #${it.productId}`);
        const vars = [];
        if (it.couleur) vars.push('Couleur: ' + it.couleur);
        if (it.taille) vars.push('Taille: ' + it.taille);

        return '<div class="cart-item cart-item--unavailable">' +
            '<label class="cart-item-check">' +
                '<input type="checkbox" disabled aria-label="Article indisponible">' +
            '</label>' +
            '<div class="cart-item-img cart-item-img--unavailable" aria-hidden="true">⚠️</div>' +
            '<div class="cart-item-info">' +
                '<h4>' + escapeHtml(label) + '</h4>' +
                '<span class="cart-item-unavailable-label">Article indisponible</span>' +
                (vars.length ? '<div class="cart-item-variants">' + escapeHtml(vars.join(', ')) + '</div>' : '') +
                '<span class="cart-item-unavailable-note">Ce produit n’est plus disponible dans le catalogue. Disponibilité et prix non garantis.</span>' +
            '</div>' +
            '<button class="remove-item-btn" data-action="cart-remove" data-index="' + idx + '" aria-label="Supprimer l’article indisponible">🗑️</button>' +
        '</div>';
    }).join('');

    return '<section class="cart-unavailable" aria-labelledby="cartUnavailableTitle">' +
        '<div class="cart-unavailable-heading">' +
            '<div><h3 id="cartUnavailableTitle">Articles indisponibles</h3><p>Ils ne pourront pas être commandés.</p></div>' +
            '<button type="button" class="cart-unavailable-clear" data-action="cart-remove-unavailable">Tout supprimer</button>' +
        '</div>' +
        '<div class="cart-items">' + cards + '</div>' +
    '</section>';
}

function renderCartTabs(allQuantity, selectedQuantity) {
    return '<div class="cart-tabs" role="tablist" aria-label="Filtre du panier">' +
        '<button type="button" class="cart-tab ' + (cartViewMode === 'all' ? 'is-active' : '') + '" data-action="cart-view-mode" data-mode="all" role="tab" aria-selected="' + (cartViewMode === 'all' ? 'true' : 'false') + '">Tout (' + allQuantity + ')</button>' +
        '<button type="button" class="cart-tab ' + (cartViewMode === 'selected' ? 'is-active' : '') + '" data-action="cart-view-mode" data-mode="selected" role="tab" aria-selected="' + (cartViewMode === 'selected' ? 'true' : 'false') + '">Sélectionné (' + selectedQuantity + ')</button>' +
    '</div>';
}

export function refreshCartDisplay() {
    initCartPanelUi();
    const body = document.getElementById('cartPanelBody');
    const footer = document.getElementById('cartPanelFooter');
    if (!body) return;

    initCartPanelEvents(body, footer);
    initCartMenu();
    initQtySheet();

    const recommendations = renderRecommendations(getRecommendations());

    const allQuantity = getCartQuantity();
    const selectedQuantity = getSelectedQuantity();
    const unavailableEntries = getUnavailableEntries();
    const availableEntries = getCartEntries().filter((entry) => !!entry.product);
    const visibleAvailableEntries = cartViewMode === 'selected'
        ? availableEntries.filter(({ item }) => item.selected !== false)
        : availableEntries;
    const visibleUnavailableEntries = cartViewMode === 'selected'
        ? unavailableEntries.filter(({ item }) => item.selected !== false)
        : unavailableEntries;

    const tabs = renderCartTabs(allQuantity, selectedQuantity);
    const title = document.getElementById('cartPanelTitle');
    if (title) title.textContent = allQuantity > 0 ? `Panier (${allQuantity})` : 'Mon panier';

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
                '<h3 id="cartEmptyTitle">Votre panier est vide</h3>' +
                '<p>Ajoute quelques trouvailles pour les retrouver ici.</p>' +
                '<button type="button" class="cart-discover-btn" data-action="cart-discover">🔥 Voir les populaires</button>' +
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
    const allSelected = availableEntries.length > 0 && availableEntries.every(({ item }) => item.selected !== false);
    const hasInvalidMoq = selectedItems.some((item) => {
        const product = findCartProduct(item);
        if (!product) return false;
        const moq = Math.max(Number(item.moq) || 1, Number(product.moq) || 1);
        return Number(item.quantity) < moq;
    });
    const hasUnavailableSelected = selectedItems.some((item) => !findCartProduct(item));
    const tot = getSelectedTotal();

    const selectBar =
        '<div class="cart-select-bar">' +
            '<label class="cart-select-all">' +
                '<input type="checkbox" id="cartSelectAll" ' + (allSelected ? 'checked' : '') + '>' +
                '<span>Tout</span>' +
            '</label>' +
            '<span class="cart-selected-count">Articles sélectionnés (' + selectedCount + ')</span>' +
        '</div>';

    const selectedEmpty =
        cartViewMode === 'selected' && visibleAvailableEntries.length === 0 && visibleUnavailableEntries.length === 0
            ? '<section class="cart-filter-empty" aria-live="polite"><strong>Aucun article sélectionné</strong><span>Retourne dans “Tout” pour voir ton panier.</span><button type="button" data-action="cart-view-mode" data-mode="all">Voir tout</button></section>'
            : '';

    body.innerHTML = tabs +
        (cartViewMode === 'all'
            ? selectBar
            : '') +
        selectedEmpty +
        (visibleAvailableEntries.length ? '<div class="cart-items">' + renderCartItems(visibleAvailableEntries) + '</div>' : '') +
        renderUnavailableItems(visibleUnavailableEntries) +
        recommendations;

    if (footer) {
        const disabled = selectedCount === 0 || hasInvalidMoq || hasUnavailableSelected;
        footer.classList.add('cart-panel-footer--filled');
        footer.innerHTML =
            '<div class="cart-footer-bar">' +
                '<div class="cart-totals">' +
                    '<div class="cart-subtotal">' +
                        '<span>Sous-total</span>' +
                        '<strong>' + formatPrice(tot) + '</strong>' +
                    '</div>' +
                    '<div class="cart-total">' +
                        '<span>Total' + (selectedCount < state.cart.length ? ' (sélection)' : '') + '</span>' +
                        '<strong id="cartTotal">' + formatPrice(tot) + '</strong>' +
                    '</div>' +
                    '<p class="cart-footer-reassurance">Prix en XAF · MOQ vérifié avant commande</p>' +
                '</div>' +
                '<button class="checkout-btn" id="checkoutBtn" data-action="cart-checkout"' + (disabled ? ' disabled' : '') + ' title="' + (hasUnavailableSelected ? 'Supprimez les articles indisponibles avant de commander' : hasInvalidMoq ? 'Augmentez les articles sous le minimum avant de commander' : 'Finaliser la commande') + '">💬 Commander (' + selectedQuantity + ')</button>' +
            '</div>';
    }

    updateNavCartBadge();
}
