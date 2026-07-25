import { state } from './state.js';
import { escapeHtml, formatPrice, debounce, calculateSearchScore, generateBadgesHTML, getCategoryIcon } from './utils.js';
import { openProductModal } from './product-modal.js';
import { addToCart } from './cart.js';

export function switchToSearchView(query) {
    document.getElementById('catalogueWrapper').style.display = 'none';
    document.getElementById('searchView').style.display = 'flex';
    document.getElementById('searchViewInput').value = query || '';
    document.getElementById('searchViewClear').style.display = query ? 'block' : 'none';
    state.searchViewState.query = query || '';

    if (query) {
        window.history.replaceState({ search: true }, '', `?search=${encodeURIComponent(query)}`);
    }

    initializeSearchFilters();
    performAdvancedSearch();
}

export function switchFromSearchView() {
    document.getElementById('searchView').style.display = 'none';
    document.getElementById('catalogueWrapper').style.display = 'block';
    window.history.replaceState({}, '', window.location.pathname);
}

function initializeSearchFilters() {
    const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
    const sizes = [...new Set(state.products.flatMap(p => (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean)))].sort();
    const colors = [...new Set(state.products.flatMap(p => (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean)))].sort();

    const categoryFiltersEl = document.getElementById('categoryFilters');
    categoryFiltersEl.innerHTML = categories.map(cat => {
        const count = state.products.filter(p => p.category === cat).length;
        return `
            <label class="filter-checkbox">
                <input type="checkbox" value="${escapeHtml(cat)}" data-filter="category">
                <span>${escapeHtml(cat)}</span>
                <span class="count">${count}</span>
            </label>
        `;
    }).join('');

    const sizeFiltersEl = document.getElementById('sizeFilters');
    sizeFiltersEl.innerHTML = sizes.map(size => {
        const count = state.products.filter(p => (p.tailles || '').includes(size)).length;
        return `
            <label class="filter-checkbox">
                <input type="checkbox" value="${escapeHtml(size)}" data-filter="size">
                <span>${escapeHtml(size)}</span>
                <span class="count">${count}</span>
            </label>
        `;
    }).join('');

    const colorFiltersEl = document.getElementById('colorFilters');
    colorFiltersEl.innerHTML = colors.map(color => {
        const count = state.products.filter(p => (p.couleurs || '').includes(color)).length;
        return `
            <label class="filter-checkbox">
                <input type="checkbox" value="${escapeHtml(color)}" data-filter="color">
                <span>${escapeHtml(color)}</span>
                <span class="count">${count}</span>
            </label>
        `;
    }).join('');

    attachFilterListeners();
}

function attachFilterListeners() {
    document.getElementById('priceMin').addEventListener('input', debounce(() => {
        state.searchViewState.filters.priceMin = parseFloat(document.getElementById('priceMin').value) || null;
        performAdvancedSearch();
    }, 500));

    document.getElementById('priceMax').addEventListener('input', debounce(() => {
        state.searchViewState.filters.priceMax = parseFloat(document.getElementById('priceMax').value) || null;
        performAdvancedSearch();
    }, 500));

    document.querySelectorAll('.price-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const min = btn.dataset.min;
            const max = btn.dataset.max;
            document.getElementById('priceMin').value = min;
            document.getElementById('priceMax').value = max;
            state.searchViewState.filters.priceMin = parseFloat(min) || null;
            state.searchViewState.filters.priceMax = parseFloat(max) || null;

            document.querySelectorAll('.price-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            performAdvancedSearch();
        });
    });

    document.querySelectorAll('[data-filter]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const filterType = checkbox.dataset.filter;
            const value = checkbox.value;

            if (filterType === 'category') {
                if (checkbox.checked) state.searchViewState.filters.categories.push(value);
                else state.searchViewState.filters.categories = state.searchViewState.filters.categories.filter(c => c !== value);
            } else if (filterType === 'size') {
                if (checkbox.checked) state.searchViewState.filters.sizes.push(value);
                else state.searchViewState.filters.sizes = state.searchViewState.filters.sizes.filter(s => s !== value);
            } else if (filterType === 'color') {
                if (checkbox.checked) state.searchViewState.filters.colors.push(value);
                else state.searchViewState.filters.colors = state.searchViewState.filters.colors.filter(c => c !== value);
            }

            performAdvancedSearch();
        });
    });

    document.getElementById('sortBy').addEventListener('change', (e) => {
        state.searchViewState.sortBy = e.target.value;
        performAdvancedSearch();
    });

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.searchViewState.viewMode = btn.dataset.view;

            const grid = document.getElementById('searchResultsGrid');
            if (state.searchViewState.viewMode === 'list') grid.classList.add('list-view');
            else grid.classList.remove('list-view');
        });
    });

    document.getElementById('backFromSearchBtn').addEventListener('click', switchFromSearchView);

    document.getElementById('searchViewInput').addEventListener('input', debounce((e) => {
        state.searchViewState.query = e.target.value;
        document.getElementById('searchViewClear').style.display = e.target.value ? 'block' : 'none';
        performAdvancedSearch();
    }, 300));

    document.getElementById('searchViewClear').addEventListener('click', () => {
        document.getElementById('searchViewInput').value = '';
        state.searchViewState.query = '';
        document.getElementById('searchViewClear').style.display = 'none';
        performAdvancedSearch();
    });

    document.getElementById('clearAllFilters').addEventListener('click', () => {
        state.searchViewState.filters = { priceMin: null, priceMax: null, categories: [], sizes: [], colors: [] };
        document.getElementById('priceMin').value = '';
        document.getElementById('priceMax').value = '';
        document.querySelectorAll('[data-filter]').forEach(cb => cb.checked = false);
        document.querySelectorAll('.price-preset').forEach(b => b.classList.remove('active'));
        performAdvancedSearch();
    });

    document.getElementById('resetSearchBtn').addEventListener('click', () => {
        document.getElementById('searchViewInput').value = '';
        state.searchViewState.query = '';
        document.getElementById('clearAllFilters').click();
    });

    document.getElementById('mobileFilterToggle').addEventListener('click', () => {
        document.getElementById('searchFiltersSidebar').classList.add('active');
        document.getElementById('filtersOverlay').classList.add('active');
    });

    document.getElementById('filtersOverlay').addEventListener('click', () => {
        document.getElementById('searchFiltersSidebar').classList.remove('active');
        document.getElementById('filtersOverlay').classList.remove('active');
    });
}

function performAdvancedSearch() {
    let results = [...state.products];

    if (state.searchViewState.query.trim()) {
        const scored = results.map(p => ({ product: p, score: calculateSearchScore(state.searchViewState.query, p) })).filter(item => item.score > 0);
        scored.sort((a, b) => b.score - a.score);
        results = scored.map(item => item.product);
    }

    if (state.searchViewState.filters.priceMin !== null) results = results.filter(p => p.price >= state.searchViewState.filters.priceMin);
    if (state.searchViewState.filters.priceMax !== null) results = results.filter(p => p.price <= state.searchViewState.filters.priceMax);

    if (state.searchViewState.filters.categories.length > 0) results = results.filter(p => state.searchViewState.filters.categories.includes(p.category));

    if (state.searchViewState.filters.sizes.length > 0) {
        results = results.filter(p => {
            const productSizes = (p.tailles || '').split(',').map(s => s.trim());
            return state.searchViewState.filters.sizes.some(size => productSizes.includes(size));
        });
    }

    if (state.searchViewState.filters.colors.length > 0) {
        results = results.filter(p => {
            const productColors = (p.couleurs || '').split(',').map(s => s.trim());
            return state.searchViewState.filters.colors.some(color => productColors.includes(color));
        });
    }

    results = sortResults(results, state.searchViewState.sortBy);
    displaySearchResults(results);
}

function sortResults(results, sortBy) {
    const sorted = [...results];
    switch (sortBy) {
        case 'price-asc': sorted.sort((a, b) => a.price - b.price); break;
        case 'price-desc': sorted.sort((a, b) => b.price - a.price); break;
        case 'newest':
            sorted.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
            });
            break;
        case 'popular': sorted.sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0)); break;
        case 'relevance':
        default: break;
    }
    return sorted;
}

function displaySearchResults(results) {
    const grid = document.getElementById('searchResultsGrid');
    const noResults = document.getElementById('searchNoResults');
    const countEl = document.getElementById('searchResultsCount');

    countEl.textContent = `${results.length} résultat${results.length !== 1 ? 's' : ''}`;

    if (results.length === 0) {
        grid.style.display = 'none';
        noResults.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    noResults.style.display = 'none';

    grid.innerHTML = results.map(p => {
        const img = p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">` : `<span>${getCategoryIcon(p.category)}</span>`;
        const badges = generateBadgesHTML(p, false);
        const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
        const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);

        return `
            <div class="search-result-card" data-product-id="${p.id}">
                <div class="card-image">
                    ${img}
                    ${badges ? `<div class="card-badges">${badges}</div>` : ''}
                </div>
                <div class="card-content">
                    <div class="card-info">
                        <div class="card-name">${escapeHtml(p.name)}</div>
                        <div class="card-category">${getCategoryIcon(p.category)} ${escapeHtml(p.category || 'Sans catégorie')}</div>
                        <div class="card-price">${formatPrice(p.price)}</div>
                        <div class="card-details">
                            ${tailles.length > 0 ? `<span class="card-detail-item">${tailles.length} taille${tailles.length > 1 ? 's' : ''}</span>` : ''}
                            ${couleurs.length > 0 ? `<span class="card-detail-item">${couleurs.length} couleur${couleurs.length > 1 ? 's' : ''}</span>` : ''}
                        </div>
                        <div class="card-actions">
                            <button class="card-btn" data-action="view-product" data-id="${p.id}">Voir</button>
                            <button class="card-btn secondary" data-action="add-to-cart-search" data-id="${p.id}">+ Panier</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('[data-action="view-product"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); openProductModal(parseInt(btn.dataset.id)); });
    });

    grid.querySelectorAll('[data-action="add-to-cart-search"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); addToCart(parseInt(btn.dataset.id)); });
    });

    grid.querySelectorAll('.search-result-card').forEach(card => {
        card.addEventListener('click', () => openProductModal(parseInt(card.dataset.productId)));
    });
}
