// ═══ Fiche produit — options bottom sheet (Phase 1) ════════════════════════
// Bottom sheet de sélection mobile-first : variante + quantité + ajout panier.
// La logique métier du panier reste centralisée dans services/cart-actions.js.

import { state } from '../../core/state.js';
import { addToCart, changeQty, updateCartItem } from '../../services/cart-actions.js';
import { showToast, showCartAddedToast } from '../../utils/dom-helpers.js';
import { escapeHtml } from '../../utils/escape-html.js';
import { thumbImg } from '../../utils/images.js';
import { WHATSAPP_NUMBER, POPULAR_THRESHOLD } from '../../core/config.js';
import { productDetailsCache, modalCtx } from './modal-state.js';
import { fetchProductDetails } from '../../api/api.js';
import { getVariantOptionValues } from '../../services/product-variants-media.js';
import { buildCarousel } from './modal-carousel.js';
import {
    getProductGalleryForSelection,
    getVariantThumbnail,
    getCompatibleVariantValues,
    getVariantCommercials,
    isValidVariantSelection,
    resolveProductVariant,
} from '../../services/product-variants-media.js';

const els = {
    panel: () => document.getElementById('optionsPanel'),
    backdrop: () => document.getElementById('optionsPanelBackdrop'),
    kicker: () => document.getElementById('optionsPanelKicker'),
    title: () => document.getElementById('optionsPanelTitle'),
    name: () => document.getElementById('optionsPanelProductName'),
    price: () => document.getElementById('optionsPanelPrice'),
    colors: () => document.getElementById('optionsColorOptions'),
    sizes: () => document.getElementById('optionsSizeOptions'),
    qty: () => document.getElementById('optionsQtyValue'),
    qtyMinus: () => document.getElementById('optionsQtyMinus'),
    qtyPlus: () => document.getElementById('optionsQtyPlus'),
    add: () => document.getElementById('optionsPanelAddBtn'),
    close: () => document.getElementById('optionsPanelCloseBtn'),
    idle: () => document.getElementById('addToCartStickyBtn'),
    added: () => document.getElementById('stickyActionAdded'),
    addedQty: () => document.getElementById('stickyAddedQty'),
    addedVariant: () => document.getElementById('stickyAddedVariant'),
    addedMain: () => document.getElementById('stickyAddedMain'),
    qtyHint: () => document.getElementById('optionsQtyHint'),
    sizeSocial: () => document.getElementById('optionsSizeSocial'),
    sizeGuide: () => document.getElementById('sizeGuideBtn'),
    stickyMinus: () => document.getElementById('stickyQtyMinus'),
    stickyPlus: () => document.getElementById('stickyQtyPlus'),
};

let lastTrigger = null;
let drag = null;
let initialized = false;

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

function getVariantPopularity(type, value) {
    const p = modalCtx.p;
    if (!p || !value) return 0;

    // Supporte plusieurs formes de données futures sans imposer de colonne DB
    // supplémentaire tant que le schéma actuel ne contient que le score produit.
    const source = p.variant_popularity || p.variantPopularity || p.variant_scores;
    if (!source) return 0;

    const singular = type === 'color' ? 'color' : 'size';
    const plural = type === 'color' ? 'colors' : 'sizes';

    if (Array.isArray(source)) {
        const row = source.find((item) => {
            if (!item || typeof item !== 'object') return false;
            const itemType = String(item.type || item.kind || '').toLowerCase();
            const itemValue = String(item.value ?? item.name ?? item.label ?? item.option ?? '').trim();
            return (!itemType || itemType === type || itemType === singular || itemType === plural)
                && itemValue === String(value).trim();
        });
        return Number(row?.popularity_score ?? row?.score ?? row?.popularity) || 0;
    }

    const bucket = source[type] || source[singular] || source[plural] || source;
    if (!bucket || typeof bucket !== 'object') return 0;

    const raw = bucket[value]
        ?? bucket[String(value).toLowerCase()]
        ?? bucket[String(value).trim()];
    if (raw && typeof raw === 'object') {
        return Number(raw.popularity_score ?? raw.score ?? raw.popularity) || 0;
    }
    return Number(raw) || 0;
}

function popularBadge(type, value) {
    if (getVariantPopularity(type, value) < POPULAR_THRESHOLD) return '';
    return type === 'size'
        ? '<span class="variant-popular-badge variant-popular-badge--size" aria-label="Variante populaire">🔥</span>'
        : '<span class="variant-popular-badge" aria-label="Variante populaire">🔥 Populaire</span>';
}

function selectPopularVariant(type, values) {
    if (!Array.isArray(values) || !values.length) return;

    const current = type === 'color' ? modalCtx.sC : modalCtx.sT;
    if (current) return;

    const ranked = values
        .map((value) => ({ value, score: getVariantPopularity(type, value) }))
        .filter((item) => item.score >= POPULAR_THRESHOLD)
        .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best) return;

    if (type === 'color') {
        const button = [...(els.colors()?.querySelectorAll('[data-option-color]') || [])]
            .find((el) => el.dataset.optionColor === best.value);
        if (button) setColor(best.value, button);
    } else {
        const button = [...(els.sizes()?.querySelectorAll('[data-option-size]') || [])]
            .find((el) => el.dataset.optionSize === best.value);
        if (button) setSize(best.value, button);
    }
}
function colorFallback(name) {
    const value = String(name || '').trim().toLowerCase();
    const aliases = [
        ['noir', '#161616'],
        ['blanc', '#f6f6f6'],
        ['rouge', '#ef4444'],
        ['orange', '#f97316'],
        ['jaune', '#facc15'],
        ['vert', '#22c55e'],
        ['bleu', '#3b82f6'],
        ['rose', '#ec4899'],
        ['violet', '#8b5cf6'],
        ['marron', '#92400e'],
        ['beige', '#d6c2a1'],
        ['gris', '#9ca3af'],
        ['argent', '#cbd5e1'],
        ['or', '#d4a72c'],
    ];
    return aliases.find(([key]) => value.includes(key))?.[1] || '#737373';
}

function getCartIndex() {
    const p = modalCtx.p;
    if (!p) return -1;
    return state.cart.findIndex((item) =>
        Number(item.productId) === Number(p.id) &&
        (item.taille || '') === (modalCtx.sT || '') &&
        (item.couleur || '') === (modalCtx.sC || '') &&
        String(item.variantId || '') === String(modalCtx.sVariantId || '')
    );
}

function getCartQty() {
    const idx = getCartIndex();
    return idx >= 0 ? Number(state.cart[idx].quantity) || 0 : 0;
}

function variantLabel() {
    const parts = [];
    if (modalCtx.sC) parts.push(modalCtx.sC);
    if (modalCtx.sT) parts.push(modalCtx.sT);
    return parts.length ? parts.join(' · ') : 'Options par défaut';
}

function setSheetQty(next) {
    const qty = Math.max(Number(modalCtx.moq) || 1, Math.floor(Number(next) || 1));
    modalCtx.currentQty = qty;
    const qtyEl = els.qty();
    if (qtyEl) qtyEl.textContent = String(qty);
}

function hasRealVariants() {
    return Array.isArray(modalCtx.variants) && modalCtx.variants.length > 0;
}

function refreshGalleryFromSelection() {
    const product = modalCtx.p;
    if (!product) return;

    const variant = resolveProductVariant(product, modalCtx.sC, modalCtx.sT);
    modalCtx.sVariantId = variant?.id || null;

    const commercial = getVariantCommercials(product, modalCtx.sC, modalCtx.sT);
    modalCtx.uPrice = commercial.price;
    modalCtx.moq = commercial.moq;

    const gallery = getProductGalleryForSelection(product, modalCtx.sC, modalCtx.sT);
    modalCtx.imgs = gallery.map((media) => media.url).filter(Boolean);

    if (modalCtx.sc && modalCtx.dc) {
        buildCarousel();
    }

    renderHeader();
    renderQuantity();
    // Le total de la ligne dépend désormais du prix/MOQ de la variante résolue.
    // Le sélecteur reste ouvert : on ne change que les valeurs commerciales.
    document.getElementById('modalPrice')?.replaceChildren(
        document.createTextNode(new Intl.NumberFormat('fr-FR').format(modalCtx.uPrice) + ' XAF')
    );
    const modalMoq = document.getElementById('modalMoq');
    if (modalMoq) modalMoq.textContent = 'Minimum d\'achat : ' + modalCtx.moq + ' pièce(s)';
    const modalTotal = document.getElementById('modalTotal');
    if (modalTotal) modalTotal.textContent = 'Total minimum : ' +
        new Intl.NumberFormat('fr-FR').format(modalCtx.uPrice * modalCtx.moq) + ' XAF';
}

function setColor(color, button) {
    if (hasRealVariants() && modalCtx.sT && !isValidVariantSelection(modalCtx.p, color, modalCtx.sT)) {
        modalCtx.sT = '';
    }

    modalCtx.sC = color;
    els.colors()?.querySelectorAll('[data-option-color]').forEach((el) => {
        const active = el === button;
        el.classList.toggle('selected', active);
        el.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (hasRealVariants()) {
        refreshGalleryFromSelection();
        renderSizes();
    }
}

function setSize(size, button) {
    if (hasRealVariants() && modalCtx.sC && !isValidVariantSelection(modalCtx.p, modalCtx.sC, size)) {
        return;
    }

    modalCtx.sT = size;
    els.sizes()?.querySelectorAll('[data-option-size]').forEach((el) => {
        const active = el === button;
        el.classList.toggle('selected', active);
        el.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (hasRealVariants()) refreshGalleryFromSelection();
}

function renderColors() {
    const container = els.colors();
    if (!container) return;

    const colors = Array.isArray(modalCtx.couleurs) ? modalCtx.couleurs : [];
    if (!colors.length) {
        container.innerHTML = '<p class="options-empty" role="status">Couleur non spécifiée — ajout possible sans couleur.</p>';
        return;
    }

    const compatibleColors = hasRealVariants()
        ? getCompatibleVariantValues(modalCtx.p, 'color', { size: modalCtx.sT })
        : null;

    container.innerHTML = colors.map((color, index) => {
        const variantThumb = hasRealVariants()
            ? getVariantThumbnail(modalCtx.p, color, modalCtx.sT)
            : null;
        const dedicatedImg = variantThumb?.url || modalCtx.p?.[`image${index + 2}`] || '';
        const unavailable = !!compatibleColors && !compatibleColors.has(color);
        const imgHtml = dedicatedImg
            ? thumbImg(dedicatedImg, color, 64, 64)
            : '<span class="option-color-fallback" aria-hidden="true"></span>';

        return `
            <button type="button"
                    class="option-color-card${unavailable ? ' is-unavailable' : ''}"
                    data-option-color="${escapeHtml(color)}"
                    aria-pressed="false"
                    aria-disabled="${unavailable ? 'true' : 'false'}"
                    ${unavailable ? 'disabled' : ''}
                    aria-label="${unavailable ? 'Couleur indisponible avec la taille choisie : ' : 'Choisir la couleur '}${escapeHtml(color)}">
                <span class="option-color-thumb" ${!dedicatedImg ? `style="--option-color: ${colorFallback(color)}"` : ''}>
                    ${imgHtml}
                </span>
                <span class="option-color-name">${escapeHtml(color)}</span>
                ${popularBadge('color', color)}
            </button>
        `;
    }).join('');

    container.querySelectorAll('[data-option-color]').forEach((button) => {
        button.addEventListener('click', () => setColor(button.dataset.optionColor || '', button));
    });

    if (modalCtx.sC) {
        const selected = [...container.querySelectorAll('[data-option-color]')]
            .find((button) => button.dataset.optionColor === modalCtx.sC);
        if (selected) setColor(modalCtx.sC, selected);
    } else if (modalCtx.sheetMode !== 'edit') {
        selectPopularVariant('color', colors);
    }
}

function renderSizes() {
    const container = els.sizes();
    if (!container) return;

    const sizes = Array.isArray(modalCtx.tailles) ? modalCtx.tailles : [];
    const social = els.sizeSocial();

    if (!sizes.length) {
        container.innerHTML = '<p class="options-empty" role="status">Taille non spécifiée — ajout possible sans taille.</p>';
        if (social) social.hidden = true;
        return;
    }

    if (social) {
        const popularSize = sizes.includes('40') ? '40' : sizes[Math.floor(sizes.length / 2)] || sizes[0];
        social.textContent = `ℹ️ 85% des clients commandent du ${popularSize}`;
        social.hidden = false;
    }

    const compatibleSizes = hasRealVariants()
        ? getCompatibleVariantValues(modalCtx.p, 'size', { color: modalCtx.sC })
        : null;

    container.innerHTML = sizes.map((size) => {
        const unavailable = !!compatibleSizes && !compatibleSizes.has(size);
        return `
        <button type="button"
                class="option-size-btn${unavailable ? ' is-unavailable' : ''}"
                data-option-size="${escapeHtml(size)}"
                aria-pressed="false"
                aria-disabled="${unavailable ? 'true' : 'false'}"
                ${unavailable ? 'disabled' : ''}
                aria-label="${unavailable ? 'Taille indisponible avec la couleur choisie : ' : 'Choisir la taille '}${escapeHtml(size)}">${escapeHtml(size)}${popularBadge('size', size)}</button>
    `;
    }).join('');

    container.querySelectorAll('[data-option-size]').forEach((button) => {
        button.addEventListener('click', () => setSize(button.dataset.optionSize || '', button));
    });

    if (modalCtx.sT) {
        const selected = [...container.querySelectorAll('[data-option-size]')]
            .find((button) => button.dataset.optionSize === modalCtx.sT);
        if (selected) setSize(modalCtx.sT, selected);
    } else if (modalCtx.sheetMode !== 'edit') {
        selectPopularVariant('size', sizes);
    }
}

function renderHeader() {
    const p = modalCtx.p;
    if (!p) return;

    const editing = modalCtx.sheetMode === 'edit';
    if (els.kicker()) els.kicker().textContent = editing ? 'MODIFIER L’ARTICLE' : 'CHOISIR UNE OPTION';
    if (els.title()) els.title().textContent = editing ? 'Modifie ton produit' : 'Personnalise ton produit';
    if (els.name()) els.name().textContent = p.name || 'Produit';
    if (els.price()) {
        const price = Number(modalCtx.uPrice) || 0;
        els.price().textContent = new Intl.NumberFormat('fr-FR').format(price) + ' XAF';
    }
}

function renderQuantity() {
    setSheetQty(modalCtx.currentQty || 1);
    const moq = Number(modalCtx.moq) || 1;
    if (els.qtyHint()) {
        els.qtyHint().textContent = moq > 1
            ? `Minimum d'achat : ${moq} pièce(s)`
            : 'Minimum d’achat : 1 pièce';
    }
    const add = els.add();
    if (add) {
        if (modalCtx.sheetMode === 'edit') {
            add.textContent = 'Mettre à jour';
        } else {
            add.textContent = moq > 1
                ? `Ajouter au panier · min. ${moq}`
                : 'Ajouter au panier';
        }
    }

    const minus = els.qtyMinus();
    if (minus) minus.setAttribute('aria-label', 'Diminuer la quantité');
    const plus = els.qtyPlus();
    if (plus) plus.setAttribute('aria-label', 'Augmenter la quantité');
}

function renderPanel() {
    renderHeader();
    renderColors();
    renderSizes();
    renderQuantity();

    const guide = els.sizeGuide();
    if (guide) guide.hidden = !modalCtx.tailles.length;
}

function setStickyAddedState(addedQty = getCartQty()) {
    const qty = Number(addedQty) || 0;
    const idle = els.idle();
    const added = els.added();

    if (qty > 0) {
        if (idle) idle.hidden = true;
        if (added) added.hidden = false;
        if (els.addedQty()) els.addedQty().textContent = String(qty);
        if (els.addedVariant()) els.addedVariant().textContent = variantLabel();
        if (els.addedMain()) {
            els.addedMain().setAttribute('aria-label', `Modifier ${variantLabel()}, ${qty} ajouté${qty > 1 ? 's' : ''}`);
        }
        return;
    }

    if (idle) idle.hidden = false;
    if (added) added.hidden = true;
}

function syncSheetFromSticky() {
    if (modalCtx.stickyAddedVariant) {
        modalCtx.sT = modalCtx.stickyAddedVariant.taille || '';
        modalCtx.sC = modalCtx.stickyAddedVariant.couleur || '';
    }
    modalCtx.currentQty = Number(modalCtx.stickyAddedQty) > 0
        ? Number(modalCtx.stickyAddedQty)
        : 1;
}

function isOpen() {
    return els.panel()?.classList.contains('open') === true;
}

function getFocusables() {
    const panel = els.panel();
    return panel ? [...panel.querySelectorAll(FOCUSABLE_SELECTOR)] : [];
}

function closeOptionsPanel() {
    const panel = els.panel();
    if (!panel || !isOpen()) return;

    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    els.backdrop()?.classList.remove('open');
    document.body.classList.remove('options-panel-open');

    document.getElementById('productModal')?.removeAttribute('inert');
    document.getElementById('stickyBottomBar')?.removeAttribute('inert');
    document.getElementById('cartPanel')?.removeAttribute('inert');

    modalCtx.sheetMode = 'add';
    modalCtx.editCartIndex = null;

    const trigger = lastTrigger;
    lastTrigger = null;
    if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) {
        requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
    }
}

function openOptionsPanel(trigger = document.getElementById('addToCartStickyBtn') || document.getElementById('stickyActionAdded')) {
    const panel = els.panel();
    if (!panel) return;

    setupStaticListeners();
    modalCtx.sheetMode = 'add';
    modalCtx.editCartIndex = null;
    lastTrigger = trigger;
    syncSheetFromSticky();
    renderPanel();

    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    els.backdrop()?.classList.add('open');
    document.body.classList.add('options-panel-open');

    document.getElementById('productModal')?.setAttribute('inert', '');
    document.getElementById('stickyBottomBar')?.setAttribute('inert', '');

    requestAnimationFrame(() => {
        const first = getFocusables()[0];
        if (first) first.focus({ preventScroll: true });
    });
}

async function validateAndAdd() {
    const p = modalCtx.p;
    if (!p) return;

    try {
        if (modalCtx.couleurs.length && !modalCtx.sC) {
            showToast('⚠️ Choisis une couleur');
            return;
        }
        if (modalCtx.tailles.length && !modalCtx.sT) {
            showToast('⚠️ Choisis une taille');
            return;
        }

        const requestedQty = Math.max(Number(modalCtx.moq) || 1, Number(modalCtx.currentQty) || 1);

        if (modalCtx.sheetMode === 'edit' && modalCtx.editCartIndex != null) {
            await updateCartItem(modalCtx.editCartIndex, {
                taille: modalCtx.sT || '',
                couleur: modalCtx.sC || '',
                quantity: requestedQty,
                variantId: modalCtx.sVariantId,
                unitPrice: modalCtx.uPrice,
                moq: modalCtx.moq
            });
            showToast('✅ Article mis à jour');
            closeOptionsPanel();
            return;
        }

        await addToCart(p.id, modalCtx.sT || '', modalCtx.sC || '', els.add(), requestedQty, {
            silent: true,
            variantId: modalCtx.sVariantId,
            unitPrice: modalCtx.uPrice,
            moq: modalCtx.moq
        });
        showCartAddedToast();

        const actualQty = getCartQty();
        modalCtx.stickyAddedQty = actualQty;
        modalCtx.stickyAddedVariant = {
            taille: modalCtx.sT || '',
            couleur: modalCtx.sC || ''
        };

        setStickyAddedState(actualQty);
        closeOptionsPanel();
    } catch (error) {
        console.error('Modification panier depuis le sélecteur d’options', error);
        showToast('⚠️ Impossible de mettre à jour le panier');
    }
}


async function openCartItemEditor(idx, trigger = null) {
    const it = state.cart[idx];
    if (!it) return;

    let p = state.products.find((product) => Number(product.id) === Number(it.productId));
    if (!p) return;

    if (!Array.isArray(p.variants)) {
        const cached = productDetailsCache.get(p.id);
        if (cached) {
            p = cached;
        } else {
            const hydrated = await fetchProductDetails(p.id);
            if (hydrated) {
                p = hydrated;
                productDetailsCache.set(p.id, hydrated);
            }
        }
    }

    const panel = els.panel();
    if (!panel) return;

    setupStaticListeners();

    modalCtx.p = p;
    const optionValues = getVariantOptionValues(p);
    modalCtx.tailles = optionValues.sizes;
    modalCtx.couleurs = optionValues.colors;
    modalCtx.sT = String(it.taille || '');
    modalCtx.sC = String(it.couleur || '');
    modalCtx.variants = Array.isArray(p.variants) ? p.variants.filter((variant) => variant?.active !== false) : [];
    modalCtx.sVariantId = it.variantId || null;
    modalCtx.moq = Math.max(Number(it.moq) || 1, Number(p.moq) || 1);
    const commercial = getVariantCommercials(p, modalCtx.sC, modalCtx.sT);
    modalCtx.uPrice = commercial.price;
    modalCtx.moq = Math.max(modalCtx.moq, commercial.moq);
    modalCtx.currentQty = Math.max(modalCtx.moq, Number(it.quantity) || modalCtx.moq);
    modalCtx.sheetMode = 'edit';
    modalCtx.editCartIndex = idx;
    lastTrigger = trigger || document.activeElement;

    renderPanel();

    // Le panier reste visible derrière le sheet, mais ne doit plus recevoir le focus.
    document.getElementById('cartPanel')?.setAttribute('inert', '');

    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    els.backdrop()?.classList.add('open');
    document.body.classList.add('options-panel-open');

    requestAnimationFrame(() => {
        const first = getFocusables()[0];
        if (first) first.focus({ preventScroll: true });
    });
}

async function changeStickyQty(delta) {
    const idx = getCartIndex();
    if (idx < 0) {
        setStickyAddedState(0);
        return;
    }

    try {
        await changeQty(idx, delta);
        const actualQty = getCartQty();
        modalCtx.stickyAddedQty = actualQty;
        setStickyAddedState(actualQty);
    } catch (error) {
        console.error('Modification quantité panier depuis la fiche produit', error);
        showToast('⚠️ Impossible de modifier la quantité');
    }
}

function setupDrag() {
    const panel = els.panel();
    const handle = document.getElementById('optionsPanelHandle');
    if (!panel || !handle || handle.dataset.dragReady === 'true') return;

    handle.dataset.dragReady = 'true';
    handle.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        drag = { id: event.pointerId, startY: event.clientY, dy: 0 };
        panel.style.transition = 'none';
        handle.setPointerCapture?.(event.pointerId);
    });

    handle.addEventListener('pointermove', (event) => {
        if (!drag || event.pointerId !== drag.id) return;
        drag.dy = Math.max(0, event.clientY - drag.startY);
        panel.style.transform = `translateY(${drag.dy}px)`;
    });

    const finish = (event) => {
        if (!drag || (event.pointerId != null && event.pointerId !== drag.id)) return;
        const shouldClose = drag.dy > 96;
        drag = null;
        panel.style.transition = '';
        panel.style.transform = '';
        if (shouldClose) closeOptionsPanel();
    };

    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
}

function setupFocusTrap() {
    document.addEventListener('keydown', (event) => {
        if (!isOpen()) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeOptionsPanel();
            return;
        }

        if (event.key !== 'Tab') return;

        const focusables = getFocusables();
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

function setupStaticListeners() {
    if (initialized) return;
    initialized = true;

    els.backdrop()?.addEventListener('click', closeOptionsPanel);
    els.close()?.addEventListener('click', closeOptionsPanel);
    els.add()?.addEventListener('click', validateAndAdd);
    els.qtyMinus()?.addEventListener('click', () => setSheetQty((modalCtx.currentQty || 1) - 1));
    els.qtyPlus()?.addEventListener('click', () => setSheetQty((modalCtx.currentQty || 1) + 1));

    els.sizeGuide()?.addEventListener('click', () => {
        const p = modalCtx.p;
        if (!p) return;
        const message = `Bonjour NRJ Marketplace, pouvez-vous m'aider avec le guide des tailles pour "${p.name}" ?`;
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    });

    els.idle()?.addEventListener('click', () => openOptionsPanel(els.idle()));

    els.stickyMinus()?.addEventListener('click', (event) => {
        event.stopPropagation();
        changeStickyQty(-1);
    });
    els.stickyPlus()?.addEventListener('click', (event) => {
        event.stopPropagation();
        changeStickyQty(1);
    });
    els.addedMain()?.addEventListener('click', () => openOptionsPanel(els.addedMain()));

    setupDrag();
    setupFocusTrap();
}

export function initOptionsPanel() {
    setupStaticListeners();
    renderPanel();
    setStickyAddedState(0);
}

export function resetOptionsPanel() {
    modalCtx.sT = '';
    modalCtx.sC = '';
    modalCtx.sVariantId = null;
    modalCtx.variants = [];
    modalCtx.currentQty = 1;
    modalCtx.sheetMode = 'add';
    modalCtx.editCartIndex = null;
    modalCtx.stickyAddedQty = 0;
    modalCtx.stickyAddedVariant = null;
    setStickyAddedState(0);
}

export { openOptionsPanel, openCartItemEditor, closeOptionsPanel, setStickyAddedState };


// Le panier peut être ouvert avant toute fiche produit : l'écouteur doit être
// actif dès le chargement du module pour que l'édition soit disponible immédiatement.
document.addEventListener('nrj:cart-edit', (event) => {
    const idx = Number(event.detail?.index);
    const trigger = event.detail?.trigger || null;
    if (!Number.isInteger(idx) || idx < 0) return;
    openCartItemEditor(idx, trigger);
});
