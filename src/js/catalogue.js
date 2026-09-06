import { state, getCategoryFilterIds, getCategoryName, isTopLevelCategory, trackViewedItem } from './state.js';
import { PRODUCTS_PER_PAGE } from './config.js';
import { escapeHtml, formatPrice, generateBadgesHTML, isFresh, thumbImg, thumb } from './utils.js';
import { forYou } from './reco.js';
import {
    fetchSubcategoriesWithLatestImage,
    fetchParentCategoriesRanked,
    fetchTopPopularSubcategories,
    fetchSubcategoriesByPopularity
} from './api.js';

let categoriesPageState = {
    parents: [],
    selectedParentId: 'featured',
    panelItems: [],
    loading: false,
    initialized: false,
    sortBy: 'relevance'
};

export function getFilteredProducts() {
    let filtered;
    if (state.currentFilter === 'favorites') {
        filtered = state.products.filter(p => state.favorites.includes(p.id));
    } else if (state.currentFilter === 'all') {
        filtered = state.products;
    } else {
        const ids = getCategoryFilterIds(state.currentFilter);
        if (ids && ids.length) {
            const idSet = new Set(ids);
            filtered = state.products.filter(p => p.category_id && idSet.has(p.category_id));
        } else {
            filtered = state.products;
        }
    }

    if (state.currentQuickFilter === 'new') filtered = filtered.filter(p => isFresh(p));
    else if (state.currentQuickFilter === 'bestseller') filtered = filtered.filter(p => (p.popularity_score || 0) > 0).sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0));
    else if (state.currentQuickFilter === 'foryou') filtered = forYou(filtered);

    if (state.searchQuery && !(/^\d+$/.test(state.searchQuery) && state.products.some(p => p.id === parseInt(state.searchQuery)))) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(p => {
            const nameMatch = p.name.toLowerCase().includes(q);
            const catName = (p.category_name || getCategoryName(p.category_id) || '').toLowerCase();
            return nameMatch || (catName && catName.includes(q));
        });
    }
    return filtered;
}

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
    for (let i = 0; i < PRODUCTS_PER_PAGE; i++) grid.appendChild(createSkeletonCard());
    setTimeout(() => {
        appendProducts(0, PRODUCTS_PER_PAGE);
        setupObserver();
    }, 100);
    updateSentinelVisibility();
}

function setupScrollObserver() {
    if (state.scrollObserver) { state.scrollObserver.disconnect(); state.scrollObserver = null; }
    state.scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); state.scrollObserver.unobserve(entry.target); } });
    }, { rootMargin: '50px' });
}

export function renderProductCardHTML(p) {
    const img = p.image ? thumbImg(p.image, p.name, 300, 400) : '';
    const hasVideo = !!(p.video_url && String(p.video_url).trim());
    const videoBadge = hasVideo
        ? '<span class="product-card-video-badge" aria-hidden="true" title="Vidéo disponible">▶️</span>'
        : '';
    const isFav = state.favorites.includes(p.id);
    const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
    const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
    let details = [];
    if (tailles.length) details.push(`${tailles.length} taille${tailles.length > 1 ? 's' : ''}`);
    if (couleurs.length) details.push(`${couleurs.length} couleur${couleurs.length > 1 ? 's' : ''}`);
    if (details.length) details.push('En stock');
    const detailsHTML = details.length ? `<div class="product-card-details">${details.map(d => `<span class="product-card-detail-item">${escapeHtml(d)}</span>`).join('')}</div>` : '';
    const moq = Number(p.moq) || 1;
    let html = `${img}${videoBadge}${generateBadgesHTML(p, false)}<div class="product-card-info"><div class="product-card-text"><div class="product-card-name">${escapeHtml(p.name)}</div><div class="product-card-bottom"><div class="product-card-price">${formatPrice(p.price)}</div><div class="product-card-moq">Min. ${moq} pcs</div></div>${detailsHTML}</div></div><button class="fav-icon" data-action="toggle-favorite" data-id="${p.id}" aria-label="Ajouter aux favoris"><svg viewBox="0 0 24 24" class="fav-icon-svg${isFav ? ' faved' : ''}"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>`;
    if (state.isAdminLoggedIn) html += `<button class="product-edit-btn" data-action="edit-product" data-id="${p.id}" aria-label="Modifier le produit">✏️</button>`;
    return html;
}

export function appendProducts(start, count) {
    if (!state.scrollObserver) setupScrollObserver();
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    if (start === 0) grid.querySelectorAll('.skeleton-card').forEach(s => s.remove());
    const fragment = document.createDocumentFragment();
    const slice = state.currentFilteredProducts.slice(start, start + count);
    slice.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = p.id;
        card.setAttribute('role', 'listitem');
        card.innerHTML = renderProductCardHTML(p);
        fragment.appendChild(card);
        if (state.scrollObserver) state.scrollObserver.observe(card);
    });
    grid.appendChild(fragment);
    state.displayedCount += slice.length;
    state.isLoadingMore = false;
    const msg = document.getElementById('loadingMessage');
    if (msg) msg.style.display = 'none';
    updateSentinelVisibility();
}

export function loadMoreProducts() {
    if (state.isLoadingMore) return;
    if (state.displayedCount >= state.currentFilteredProducts.length) return;
    state.isLoadingMore = true;
    const msg = document.getElementById('loadingMessage');
    if (msg) msg.style.display = 'block';
    setTimeout(() => appendProducts(state.displayedCount, PRODUCTS_PER_PAGE), 50);
}

function updateSentinelVisibility() {
    const hasMore = state.displayedCount < state.currentFilteredProducts.length;
    const s = document.getElementById('loadMoreSentinel');
    if (s) {
        s.style.display = hasMore ? 'block' : 'none';
        s.style.height = hasMore ? '40px' : '0';
        s.style.minHeight = hasMore ? '40px' : '0';
    }
    const wrap = document.getElementById('loadMoreWrap');
    const btn = document.getElementById('loadMoreBtn');
    if (wrap) wrap.style.display = hasMore ? 'flex' : 'none';
    if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => loadMoreProducts());
    }
}

export function setupObserver() {
    if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
    }
    const s = document.getElementById('loadMoreSentinel');
    if (!s) {
        updateSentinelVisibility();
        return;
    }
    state.observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting && !state.isLoadingMore && state.displayedCount < state.currentFilteredProducts.length) {
                loadMoreProducts();
            }
        });
    }, { root: null, rootMargin: '400px 0px', threshold: 0 });
    state.observer.observe(s);
    updateSentinelVisibility();
}

export function refreshCatalogue() {
    if (state.scrollObserver) { state.scrollObserver.disconnect(); state.scrollObserver = null; }
    renderInitialProducts();
    setupObserver();
}
