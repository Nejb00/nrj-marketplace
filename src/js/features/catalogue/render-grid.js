// ═══ Catalogue — rendu de la grille (initial + ajout par lots) ═══
// Éclaté de catalogue.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { PRODUCTS_PER_PAGE, INITIAL_PRODUCTS, PRELOAD_IMAGE_COUNT } from '../../core/config.js';
import { injectLcpPreloads, preloadProductThumbs } from '../../services/lazy-loading.js';
import { getFilteredProducts } from './popularity-sort.js';
import { renderProductCardHTML, createSkeletonCard } from './render-product-card.js';
import { setupObserver, updateSentinelVisibility, setupScrollObserver } from './pagination.js';

export function renderInitialProducts() {
    state.currentFilteredProducts = getFilteredProducts();
    state.displayedCount = 0;
    state.isLoadingMore = false;
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (state.currentFilteredProducts.length === 0) {
        grid.innerHTML = '<div style="color:#666;text-align:center;padding:3rem;grid-column:1/-1;">Aucun produit trouvé</div>';
        const s = document.getElementById('loadMoreSentinel');
        const msg = document.getElementById('loadingMessage');
        if (s) s.style.display = 'none';
        if (msg) msg.style.display = 'none';
        const wrap = document.getElementById('loadMoreWrap');
        if (wrap) wrap.style.display = 'none';
        return;
    }
    for (let i = 0; i < INITIAL_PRODUCTS; i++) grid.appendChild(createSkeletonCard());
    injectLcpPreloads(state.currentFilteredProducts);
    preloadProductThumbs(state.currentFilteredProducts, { start: 0, count: PRELOAD_IMAGE_COUNT });
    setTimeout(() => {
        appendProducts(0, INITIAL_PRODUCTS);
        setupObserver();
    }, 100);
    updateSentinelVisibility();
}

export function appendProducts(start, count) {
    if (!state.scrollObserver) setupScrollObserver();
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    if (start === 0) grid.querySelectorAll('.skeleton-card').forEach(s => s.remove());
    const fragment = document.createDocumentFragment();
    const slice = state.currentFilteredProducts.slice(start, start + count);
    const toObserve = [];
    slice.forEach((p, i) => {
        const index = start + i;
        const card = document.createElement('div');
        // Observer les cartes hors viewport APRÈS insertion dans le DOM
        // (observer un nœud encore dans le fragment ne déclenche jamais l'IO).
        card.className = 'product-card visible';
        card.dataset.productId = p.id;
        card.setAttribute('role', 'listitem');
        card.innerHTML = renderProductCardHTML(p, index);
        fragment.appendChild(card);
        toObserve.push(card);
    });
    grid.appendChild(fragment);
    if (state.scrollObserver) {
        toObserve.forEach((card) => state.scrollObserver.observe(card));
    }
    state.displayedCount += slice.length;
    state.isLoadingMore = false;
    const msg = document.getElementById('loadingMessage');
    if (msg) msg.style.display = 'none';
    updateSentinelVisibility();
    preloadProductThumbs(state.currentFilteredProducts, {
        start: state.displayedCount,
        count: PRODUCTS_PER_PAGE
    });
}
