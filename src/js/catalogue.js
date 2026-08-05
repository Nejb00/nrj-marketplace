import { state } from './state.js';
import { PRODUCTS_PER_PAGE } from './config.js';
import { escapeHtml, formatPrice, generateBadgesHTML, isFresh, thumbImg } from './utils.js';

export function getFilteredProducts() {
    let filtered = state.currentFilter === 'favorites'
        ? state.products.filter(p => state.favorites.includes(p.id))
        : (state.currentFilter === 'all' ? state.products : state.products.filter(p => p.category === state.currentFilter));

    // ✅ PACK POLISH (4) : le filtre Nouveautés suit la même règle rare que le badge
    if (state.currentQuickFilter === 'new') filtered = filtered.filter(p => isFresh(p));
    else if (state.currentQuickFilter === 'bestseller') filtered = filtered.filter(p => (p.popularity_score || 0) > 0).sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0));

    if (state.searchQuery && !(/^\d+$/.test(state.searchQuery) && state.products.some(p => p.id === parseInt(state.searchQuery)))) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));
    }
    return filtered;
}

export function renderInitialProducts() {
    state.currentFilteredProducts = getFilteredProducts();
    state.displayedCount = 0;
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';
    if (state.currentFilteredProducts.length === 0) {
        grid.innerHTML = '<div style="color:#666;text-align:center;padding:3rem;grid-column:1/-1;">Aucun produit trouvé</div>';
        document.getElementById('loadMoreSentinel').style.display = 'none';
        document.getElementById('loadingMessage').style.display = 'none';
        return;
    }
    appendProducts(0, PRODUCTS_PER_PAGE);
    updateSentinelVisibility();
}

function setupScrollObserver() {
    if (state.scrollObserver) {
        state.scrollObserver.disconnect();
        state.scrollObserver = null;
    }
    state.scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); state.scrollObserver.unobserve(entry.target); } });
    }, { rootMargin: '50px' });
}

export function appendProducts(start, count) {
    if (!state.scrollObserver) setupScrollObserver();
    const grid = document.getElementById('productsGrid');
    const fragment = document.createDocumentFragment();
    const slice = state.currentFilteredProducts.slice(start, start + count);

    slice.forEach(p => {
        const img = p.image ? thumbImg(p.image, p.name, 300, 400) : '';
        const isFav = state.favorites.includes(p.id);
        const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
        const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
        let details = [];
        if (tailles.length) details.push(`${tailles.length} taille${tailles.length > 1 ? 's' : ''}`);
        if (couleurs.length) details.push(`${couleurs.length} couleur${couleurs.length > 1 ? 's' : ''}`);
        if (details.length) details.push('En stock');
        const detailsHTML = details.length ? `<div class="product-card-details">${details.map(d => `<span class="product-card-detail-item">${escapeHtml(d)}</span>`).join('')}</div>` : '';
        // ✅ PACK POLISH (1) : condition grossiste visible d'un coup d'œil
        const moq = Number(p.moq) || 1;
        const moqHTML = `<div class="product-card-moq">Min. ${moq} pcs</div>`;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = p.id;
        card.setAttribute('role', 'listitem');
        card.innerHTML = `${img}${generateBadgesHTML(p, false)}<div class="product-card-info"><div class="product-card-text"><div class="product-card-name">${escapeHtml(p.name)}</div><div class="product-card-price">${formatPrice(p.price)}</div>${moqHTML}${detailsHTML}</div></div><button class="product-card-add" data-action="add-to-cart" data-id="${p.id}" aria-label="Ajouter au panier"><svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg></button><button class="fav-icon" data-action="toggle-favorite" data-id="${p.id}" aria-label="Ajouter aux favoris"><svg viewBox="0 0 24 24" class="fav-icon-svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>`;
        if (state.isAdminLoggedIn) {
            card.innerHTML += `<button class="product-edit-btn" data-action="edit-product" data-id="${p.id}" aria-label="Modifier le produit">✏️</button>`;
        }
        fragment.appendChild(card);
        state.scrollObserver.observe(card);
    });

    grid.appendChild(fragment);
    state.displayedCount += slice.length;
    document.getElementById('loadingMessage').style.display = 'none';
    updateSentinelVisibility();
}

export function loadMoreProducts() {
    if (state.displayedCount >= state.currentFilteredProducts.length) return;
    document.getElementById('loadingMessage').style.display = 'block';
    setTimeout(() => appendProducts(state.displayedCount, PRODUCTS_PER_PAGE), 100);
}

function updateSentinelVisibility() {
    const s = document.getElementById('loadMoreSentinel');
    s.style.display = state.displayedCount >= state.currentFilteredProducts.length ? 'none' : 'block';
}

export function setupObserver() {
    if (state.observer) state.observer.disconnect();
    const s = document.getElementById('loadMoreSentinel');
    if (!s) return;
    state.observer = new IntersectionObserver((entries) => { entries.forEach(e => { if (e.isIntersecting && state.displayedCount < state.currentFilteredProducts.length) loadMoreProducts(); }); }, { rootMargin: '200px' });
    state.observer.observe(s);
}

export function refreshCatalogue() {
    if (state.scrollObserver) {
        state.scrollObserver.disconnect();
        state.scrollObserver = null;
    }
    renderInitialProducts();
    setupObserver();
}

export function applyFilter(category) {
    state.currentFilter = category;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.filter-btn[data-category="${category}"]`);
    if (btn) btn.classList.add('active');
    refreshCatalogue();
}

export function switchView(v) {
    const cv = document.getElementById('categoriesView'), hv = document.getElementById('catalogueView');
    if (v === 'categories') { renderCategories(); cv.style.display = 'block'; hv.style.display = 'none'; }
    else { cv.style.display = 'none'; hv.style.display = 'block'; }
}

export function renderCategories() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;
    const cats = [...new Set(state.products.map(p => p.category).filter(Boolean))];
    if (!cats.length) { grid.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">Aucune catégorie disponible.</p>'; return; }
    grid.innerHTML = cats.map(cat => {
        const lp = [...state.products].reverse().find(p => p.category === cat && p.image);
        return `<div class="category-card" data-category="${escapeHtml(cat)}">${lp ? thumbImg(lp.image, cat, 400, 300, 'category-card-bg') : ''}<div class="category-card-overlay"></div><div class="category-card-content"><div class="category-name">${escapeHtml(cat)}</div><div class="category-count">${state.products.filter(p => p.category === cat).length} article${state.products.filter(p => p.category === cat).length > 1 ? 's' : ''}</div></div></div>`;
    }).join('');
                                                                                                                                                                                                     }
