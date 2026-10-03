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
import { getRelatedProducts } from '../api/api.js';
import { forYou } from './reco.js';

// Les RPC sont volontairement chargées uniquement à l'ouverture du panier.
// Les refreshs déclenchés par quantité/suppression réutilisent ce pool et
// l'actualisent côté client pour éviter une requête à chaque interaction.
let cartRecPool = [];
let cartRecLoaded = false;
let cartRecRequestId = 0;

function cartProductIds() {
    return new Set(state.cart.map(it => it.productId));
}

function uniqueProductsById(products, excludedIds, limit = 10) {
    const seen = new Set();
    const out = [];
    for (const p of products) {
        if (!p || excludedIds.has(p.id) || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
        if (out.length >= limit) break;
    }
    return out;
}

async function loadCartRecommendations() {
    const requestId = ++cartRecRequestId;
    const excludedIds = cartProductIds();

    if (state.cart.length === 0) {
        cartRecPool = forYou(state.products.filter(p => !excludedIds.has(p.id))).slice(0, 10);
        cartRecLoaded = true;
        return;
    }

    // Les 3 dernières lignes du panier servent de signal d'ajout récent.
    const recentIds = [...new Set(
        state.cart.slice(-3).reverse().map(it => it.productId)
    )];

    const relatedIdLists = await Promise.all(
        recentIds.map(pid => getRelatedProducts(pid, 6))
    );

    if (requestId !== cartRecRequestId) return;

    const relatedIds = [];
    const relatedSeen = new Set();
    for (const ids of relatedIdLists) {
        for (const id of ids || []) {
            if (!relatedSeen.has(id)) {
                relatedSeen.add(id);
                relatedIds.push(id);
            }
        }
    }

    const relatedProducts = relatedIds
        .map(id => state.products.find(p => p.id === id))
        .filter(Boolean);

    // Première complétion : personnalisation locale "Pour toi".
    const neededForYou = Math.max(0, 10 - relatedProducts.length);
    const forYouProducts = forYou(
        state.products.filter(p => !excludedIds.has(p.id) && !relatedSeen.has(p.id))
    ).slice(0, neededForYou);

    // Deuxième complétion : produits des mêmes catégories que le panier.
    const categoryIds = new Set(
        state.cart
            .map(it => state.products.find(p => p.id === it.productId)?.category_id)
            .filter(Boolean)
    );
    const sameCategoryProducts = forYou(
        state.products.filter(
            p => categoryIds.has(p.category_id) &&
                 !excludedIds.has(p.id) &&
                 !relatedSeen.has(p.id) &&
                 !forYouProducts.some(f => f.id === p.id)
        )
    );

    cartRecPool = uniqueProductsById(
        [...relatedProducts, ...forYouProducts, ...sameCategoryProducts],
        excludedIds,
        10
    );
    cartRecLoaded = true;
}

function renderCartRecommendations() {
    const host = document.getElementById('cartRecommendations');
    if (!host) return;

    if (!cartRecLoaded) {
        host.innerHTML = '';
        host.hidden = true;
        return;
    }

    const excludedIds = cartProductIds();
    const rec = uniqueProductsById(cartRecPool, excludedIds, 10);

    host.hidden = rec.length === 0;
    if (!rec.length) {
        host.innerHTML = '';
        return;
    }

    host.innerHTML = `
        <div class="cart-recommendations-head">
            <h3>Pour toi</h3>
            <span>Inspiré de ton panier</span>
        </div>
        <div class="cart-recommendations-grid">
            ${rec.map(p => {
                const hasVariants = Boolean(
                    String(p.tailles || '').trim() || String(p.couleurs || '').trim()
                );
                const moq = Number(p.moq) || 1;
                return `
                    <article class="cart-rec-card" data-product-id="${p.id}">
                        <div class="cart-rec-card-img">
                            ${p.image ? thumbImg(p.image, p.name, 160, 160) : '📦'}
                        </div>
                        <div class="cart-rec-card-info">
                            <div class="cart-rec-card-name">${escapeHtml(p.name)}</div>
                            <div class="cart-rec-card-bottom">
                                <span class="cart-rec-card-price">${formatPrice(p.price)}</span>
                                <span class="cart-rec-card-moq">Min. ${moq}</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            class="cart-rec-add"
                            data-action="cart-rec-add"
                            data-id="${p.id}"
                            aria-label="${hasVariants ? 'Choisir les variantes' : 'Ajouter au panier'}"
                            title="${hasVariants ? 'Choisir les variantes' : `Ajouter ${moq} au panier`}">
                            +
                        </button>
                    </article>
                `;
            }).join('')}
        </div>
    `;
}

export function refreshCartDisplay(loadRecommendations = false) {
    const body = document.getElementById('cartPanelBody');
    const footer = document.getElementById('cartPanelFooter');
    if (!body) return;

    initCartMenu();
    initQtySheet();

    if (loadRecommendations) {
        cartRecLoaded = false;
        renderCartRecommendations();
        loadCartRecommendations().then(() => {
            renderCartRecommendations();
        }).catch(() => {
            cartRecLoaded = true;
            cartRecPool = forYou(state.products.filter(p => !cartProductIds().has(p.id))).slice(0, 10);
            renderCartRecommendations();
        });
    }

    if (state.cart.length === 0) {
        body.innerHTML = `
            <div class="cart-empty">
                <div class="cart-empty-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6.1M9 19.2a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Zm9.4 0a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z"/>
                    </svg>
                </div>
                <h3>Votre panier est vide</h3>
                <p>Ajoute quelques produits pour les retrouver ici.</p>
                <button type="button" class="cart-empty-catalog-btn" data-action="cart-empty-catalog">Voir le catalogue</button>
            </div>
            <div id="cartRecommendations" class="cart-recommendations" hidden></div>
        `;
        if (footer) footer.innerHTML = '';
        updateNavCartBadge();
        renderCartRecommendations();
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

    body.innerHTML = selectBar + `<div class="cart-items">${itemsHtml}</div><div id="cartRecommendations" class="cart-recommendations" hidden></div>`;

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
    renderCartRecommendations();
}
