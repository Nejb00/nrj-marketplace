import { state, getCategoryFilterIds, getCategoryName, isTopLevelCategory } from './state.js';
import { PRODUCTS_PER_PAGE } from './config.js';
import { escapeHtml, formatPrice, generateBadgesHTML, isFresh, thumbImg, thumb } from './utils.js';
import { forYou } from './reco.js';
import { fetchSubcategoriesWithLatestImage } from './api.js';

export function getFilteredProducts() {
    let filtered;
    if (state.currentFilter === 'favorites') {
        filtered = state.products.filter(p => state.favorites.includes(p.id));
    } else if (state.currentFilter === 'all') {
        filtered = state.products;
    } else {
        // Filtre par category_id : catégorie sélectionnée + ses sous-catégories
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
  
  const grid = document.getElementById('productsGrid');
    grid.innerHTML = '';
    
    if (state.currentFilteredProducts.length === 0) {
        grid.innerHTML = '<div style="color:#666;text-align:center;padding:3rem;grid-column:1/-1;">Aucun produit trouvé</div>';
        document.getElementById('loadMoreSentinel').style.display = 'none';
        document.getElementById('loadingMessage').style.display = 'none';
        return;
    }
    
    for (let i = 0; i < PRODUCTS_PER_PAGE; i++) {
        grid.appendChild(createSkeletonCard());
    }
    
    setTimeout(() => appendProducts(0, PRODUCTS_PER_PAGE), 100);
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
    
    if (start === 0) {
        const skeletons = grid.querySelectorAll('.skeleton-card');
        skeletons.forEach(s => s.remove());
    }
    
    const fragment = document.createDocumentFragment();
    const slice = state.currentFilteredProducts.slice(start, start + count);

    slice.forEach(p => {
        const img = p.image ? thumbImg(p.image, p.name, 300, 400) : '';
        const isFav = state.favorites.includes(p.id);
        const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
        const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
        let details = [];
        if (tailles.length) details.push(`${tailles.length} taille${tailles.length > 1 ? 's' : ''}`);
        if (couleurs.length) details.
push(`${couleurs.length} couleur${couleurs.length > 1 ? 's' : ''}`);
        if (details.length) details.push('En stock');
        const detailsHTML = details.length ? `<div class="product-card-details">${details.map(d => `<span class="product-card-detail-item">${escapeHtml(d)}</span>`).join('')}</div>` : '';
        const moq = Number(p.moq) || 1;
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = p.id;
        card.setAttribute('role', 'listitem');
        card.innerHTML = `${img}${generateBadgesHTML(p, false)}<div class="product-card-info"><div class="product-card-text"><div class="product-card-name">${escapeHtml(p.name)}</div><div class="product-card-bottom"><div class="product-card-price">${formatPrice(p.price)}</div><div class="product-card-moq">Min. ${moq} pcs</div></div>${detailsHTML}</div></div><button class="fav-icon" data-action="toggle-favorite" data-id="${p.id}" aria-label="Ajouter aux favoris"><svg viewBox="0 0 24 24" class="fav-icon-svg${isFav ? ' faved' : ''}"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>`;
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

function hideSubcategoryBubbles() {
    state.subcategoryBubbles = [];
    state.activeTopCategoryId = null;
    state.activeSubcategoryId = null;
    const row = document.getElementById('subcategoryBubbles');
    if (row) {
        row.innerHTML = '';
        row.hidden = true;
    }
}

export function renderSubcategoryBubbles() {
    const row = document.getElementById('subcategoryBubbles');
    if (!row) return;

    const items = state.subcategoryBubbles || [];
    if (!items.length) {
        row.innerHTML = '';
        row.hidden = true;
        return;
    }

    row.hidden = false;
    if (!row.dataset.allBound) {
        row.dataset.allBound = '1';
        row.addEventListener('click', (e) => {
            if (e.target.closest('[data-subcategory-all="1"]')) selectSubcategoryAll();
        });
    }
    const allActive = state.activeSubcategoryId === null ? ' active' : '';
    const allBubble = `<button type="button" class="subcat-bubble subcat-bubble--all${allActive}" data-subcategory-all="1" aria-label="Tout" title="Tout"><span class="subcat-bubble-img"><span class="subcat-bubble-fallback">✨</span></span><span class="subcat-bubble-label">Tout</span></button>`;
    row.innerHTML = allBubble + items.map(sub => {
        const active = state.activeSubcategoryId === sub.id ? ' active' : '';
        const label = escapeHtml(sub.name || '');
        const fallbackIcon = sub.icon ? escapeHtml(sub.icon) : '📦';
        const imgSrc = sub.image || sub.latest_image || sub.product_image || sub.img || '';
        let media;
        if (imgSrc) {
            const proxied = escapeHtml(thumb(imgSrc, 120, 120, 'cover'));
            const direct  = escapeHtml(imgSrc);
            const onerr =
                "this.onerror=function(){var s=document.createElement('span');" +
                "s.className='subcat-bubble-fallback';s.textContent='" + fallbackIcon + "';" +
                "this.replaceWith(s);};" +
                "this.src=this.dataset.full;this.removeAttribute('data-full');";
            media = `<img src="${proxied}" data-full="${direct}" alt="${label}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="${onerr}">`;
        } else {
            media = `<span class="subcat-bubble-fallback">${fallbackIcon}</span>`;
        }
        return `<button type="button" class="subcat-bubble${active}" data-subcategory-id="${escapeHtml(sub.id)}" aria-label="${label}" title="${label}">
            <span class="subcat-bubble-img">${media}</span>
            <span class="subcat-bubble-label">${label}</span>
        </button>`;
    }).join('');
}

export function selectSubcategoryAll() {
    const topId = state.activeTopCategoryId;
    if (!topId) return;
    state.currentFilter = topId;
    state.activeSubcategoryId = null;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.filter-btn[data-category="${topId}"]`);
    if (btn) btn.classList.add('active');
    renderSubcategoryBubbles();
    refreshCatalogue();
}

async function loadBubblesForTop(topId) {
    state.activeTopCategoryId = topId;
    state.activeSubcategoryId = null;
    const rows = await fetchSubcategoriesWithLatestImage(topId);
    // Ignore si l'utilisateur a déjà changé de top pendant l'attente
    if (state.activeTopCategoryId !== topId) return;
    state.subcategoryBubbles = rows;
    renderSubcategoryBubbles();
}

/**
 * Applique un filtre catégorie.
 * - top-niveau → filtre parent+enfants + charge les bulles (1 RPC cache)
 * - sous-catégorie (bulle) → filtre exact sur category_id, garde les bulles du top
 * - all / favorites → masque les bulles
 */
export async function applyFilter(categoryId) {
    state.currentFilter = categoryId;

    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));

    if (categoryId === 'all' || categoryId === 'favorites') {
        const btn = document.querySelector(`.filter-btn[data-category="${categoryId}"]`);
        if (btn) btn.classList.add('active');
        hideSubcategoryBubbles();
        refreshCatalogue();
        return;
    }

    const cat = state.categoriesById.get(categoryId);

    if (isTopLevelCategory(categoryId)) {
        const btn = document.querySelector(`.filter-btn[data-category="${categoryId}"]`);
        if (btn) btn.classList.add('active');
        refreshCatalogue();
        await loadBubblesForTop(categoryId);
        return;
    }

    // Sous-catégorie : highlight le top parent dans la barre, bulle active
    if (cat && cat.parent_id) {
        const parentBtn = document.querySelector(`.filter-btn[data-category="${cat.parent_id}"]`);
        if (parentBtn) parentBtn.classList.add('active');

        state.activeSubcategoryId = categoryId;

        // Si les bulles du parent ne sont pas encore chargées, les charger une fois
        if (state.activeTopCategoryId !== cat.parent_id || !state.subcategoryBubbles.length) {
            state.activeTopCategoryId = cat.parent_id;
            const rows = await fetchSubcategoriesWithLatestImage(cat.parent_id);
            if (state.activeTopCategoryId === cat.parent_id) {
                state.subcategoryBubbles = rows;
            }
        }
        renderSubcategoryBubbles();
        refreshCatalogue();
        return;
    }

    // Fallback générique
    const btn = document.querySelector(`.filter-btn[data-category="${categoryId}"]`);
    if (btn) btn.classList.add('active');
    hideSubcategoryBubbles();
    refreshCatalogue();
}

export function clearSubcategorySelection() {
    hideSubcategoryBubbles();
}

export function switchView(v) {
    const cv = document.getElementById('categoriesView'), hv = document.getElementById('catalogueView');
    if (v === 'categories') { renderCategories(); cv.style.display = 'block'; hv.style.display = 'none'; }
    else { cv.style.display = 'none'; hv.style.display = 'block'; }
}

export function renderCategories() {
    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;

    const topCats = state.categories
        .filter(c => c.parent_id === null)
        .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

    if (!topCats.length) {
        grid.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">Aucune catégorie disponible.</p>';
        return;
    }

    grid.innerHTML = topCats.map(cat => {
        const filterIds = getCategoryFilterIds(cat.id);
        const idSet = new Set(filterIds || [cat.id]);
        const productsInCat = state.products.filter(p => p.category_id && idSet.has(p.category_id));
        const count = productsInCat.length;
        const lp = [...productsInCat]
            .filter(p => p.image)
            .sort((a, b) => (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0))[0];
        const icon = cat.icon ? `${escapeHtml(cat.icon)} ` : '';
        return `<div class="category-card" data-category="${escapeHtml(cat.id)}">${lp ? thumbImg(lp.image, cat.name, 400, 300, 'category-card-bg') : ''}<div class="category-card-overlay"></div><div class="category-card-content"><div class="category-name">${icon}${escapeHtml(cat.name)}</div><div class="category-count">${count} article${count > 1 ? 's' : ''}</div></div></div>`;
    }).join('');
}

function createSkeletonCard() {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-card';
    skeleton.innerHTML = `<div class="skeleton-image"></div><div class="skeleton-text"><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line skeleton-line--price"></div></div>`;
    return skeleton;
}