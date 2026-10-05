// ═══ Panier — confirmation post-ajout ═══════════════════════════════════════
// Surface UX indépendante du panneau panier et de la fiche produit.
// Succès : confirmation informative ; erreurs : feedback géré par l'appelant.
import { state } from '../core/state.js';
import { formatPrice } from '../utils/format.js';
import { thumbImg } from '../utils/images.js';
import { escapeHtml } from '../utils/escape-html.js';
import { forYou, hasProfile } from './reco.js';
import { renderProductCardHTML } from '../features/catalogue/render-product-card.js';

let initialized = false;
let lastFocusedElement = null;
let previousBodyOverflow = '';

function getRecommendationProducts(product, limit = 4) {
    const inCart = new Set(state.cart.map(item => item.productId));
    const eligible = state.products.filter(p =>
        p &&
        p.id != null &&
        p.id !== product?.id &&
        !inCart.has(p.id)
    );
    if (!eligible.length) return [];

    const sameCategory = product?.category_id
        ? eligible.filter(p => p.category_id === product.category_id)
        : [];
    const others = eligible.filter(p => !sameCategory.includes(p));

    const rank = list => hasProfile()
        ? forYou(list)
        : [...list].sort((a, b) =>
            (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0)
        );

    return [...rank(sameCategory), ...rank(others)]
        .filter((p, i, list) => list.findIndex(x => x.id === p.id) === i)
        .slice(0, limit);
}

function formatVariant(item) {
    const parts = [];
    if (item.couleur) parts.push(escapeHtml(item.couleur));
    if (item.taille) parts.push(escapeHtml(item.taille));
    return parts.join(' • ');
}

function renderAddedLines(data) {
    const lines = (data.itemsAdded || []).map(item => {
        const variant = formatVariant(item);
        return '<div class="cart-add-confirmation-line">' +
            '<span>' + (variant || 'Article') + '</span>' +
            '<strong>× ' + Number(item.quantity) + '</strong>' +
        '</div>';
    }).join('');

    return lines || '<div class="cart-add-confirmation-line"><span>Article ajouté</span></div>';
}

function renderSummary(data) {
    const product = data.product || {};
    const image = product.image
        ? thumbImg(product.image, product.name, 96, 96)
        : '<span class="cart-add-confirmation-image-fallback" aria-hidden="true">📦</span>';

    return '<div class="cart-add-confirmation-product">' +
        '<div class="cart-add-confirmation-image">' + image + '</div>' +
        '<div class="cart-add-confirmation-product-info">' +
            '<h3>' + escapeHtml(product.name || 'Produit ajouté') + '</h3>' +
            '<div class="cart-add-confirmation-meta">' + renderAddedLines(data) + '</div>' +
        '</div>' +
    '</div>' +
    '<div class="cart-add-confirmation-total">' +
        '<span>' + Number(data.totalQuantity || 0) + ' pièce' + (Number(data.totalQuantity || 0) > 1 ? 's' : '') + ' ajoutée' + (Number(data.totalQuantity || 0) > 1 ? 's' : '') + '</span>' +
        '<strong>' + formatPrice(Number(data.totalAmount) || 0) + '</strong>' +
    '</div>';
}

function renderRecommendations(products) {
    if (!products.length) return '';

    const cards = products.map((p, i) =>
        '<div class="rec-card cart-add-reco-card" data-product-id="' + p.id + '" role="listitem">' +
            renderProductCardHTML(p, i) +
        '</div>'
    ).join('');

    return '<section class="cart-add-confirmation-recommendations" aria-labelledby="cartAddRecommendationsTitle">' +
        '<div class="cart-add-confirmation-recommendations-heading">' +
            '<h3 id="cartAddRecommendationsTitle">Vous pourriez aussi aimer</h3>' +
        '</div>' +
        '<div class="cart-add-confirmation-recommendations-grid" role="list">' + cards + '</div>' +
    '</section>';
}

function closeAndRestoreFocus() {
    const el = document.getElementById('cartAddConfirmation');
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = previousBodyOverflow;
    document.removeEventListener('keydown', handleKeydown);
    const focusTarget = lastFocusedElement;
    lastFocusedElement = null;
    if (focusTarget && typeof focusTarget.focus === 'function') {
        requestAnimationFrame(() => focusTarget.focus());
    }
}

function handleKeydown(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        closeCartAddConfirmation();
    }
}

function initEvents() {
    if (initialized) return;
    const el = document.getElementById('cartAddConfirmation');
    if (!el) return;
    initialized = true;

    el.addEventListener('click', event => {
        if (event.target === el || event.target.closest('[data-cart-add-close]')) {
            closeCartAddConfirmation();
            return;
        }

        if (event.target.closest('[data-action="toggle-favorite"]') ||
            event.target.closest('[data-action="edit-product"]')) {
            return;
        }

        const cartButton = event.target.closest('[data-cart-add-action="cart"]');
        if (cartButton) {
            event.preventDefault();
            lastFocusedElement = null;
            closeAndRestoreFocus();
            document.querySelectorAll('.nav-item').forEach(button => button.classList.remove('active'));
            document.querySelector('.nav-item[data-nav="cart"]')?.classList.add('active');
            import('../features/product/modal-render.js')
                .then(({ closeProductModal }) => {
                    closeProductModal();
                    document.getElementById('cartPanel')?.classList.add('open');
                    document.getElementById('cartOverlay')?.classList.add('open');
                    document.getElementById('cartCloseBtn')?.focus();
                })
                .catch(() => {
                    document.getElementById('cartPanel')?.classList.add('open');
                    document.getElementById('cartOverlay')?.classList.add('open');
                });
            return;
        }

        const recCard = event.target.closest('.cart-add-reco-card');
        if (recCard) {
            event.preventDefault();
            event.stopPropagation();
            const productId = Number(recCard.dataset.productId);
            lastFocusedElement = null;
            closeAndRestoreFocus();
            if (Number.isInteger(productId)) {
                import('../features/product/modal-render.js')
                    .then(({ openProductModal }) => openProductModal(productId))
                    .catch(() => {});
            }
            return;
        }

        const keepShoppingButton = event.target.closest('[data-cart-add-action="continue"]');
        if (keepShoppingButton) {
            event.preventDefault();
            closeCartAddConfirmation();
            return;
        }
    });
}

export function closeCartAddConfirmation() {
    const el = document.getElementById('cartAddConfirmation');
    if (!el?.classList.contains('is-open')) return;
    closeAndRestoreFocus();
}

export function openCartAddConfirmation(data) {
    const el = document.getElementById('cartAddConfirmation');
    if (!el || !data?.product) return;

    initEvents();
    lastFocusedElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    previousBodyOverflow = document.body.style.overflow;

    const recommendations = getRecommendationProducts(data.product, 4);

    el.querySelector('[data-cart-add-slot="summary"]').innerHTML = renderSummary(data);
    el.querySelector('[data-cart-add-slot="recommendations"]').innerHTML = renderRecommendations(recommendations);

    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeydown);

    const closeButton = el.querySelector('[data-cart-add-close]');
    requestAnimationFrame(() => closeButton?.focus());
}
