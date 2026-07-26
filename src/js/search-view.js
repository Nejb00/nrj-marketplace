import { state } from './state.js';
import { escapeHtml, formatPrice, debounce, calculateSearchScore, generateBadgesHTML } from './utils.js';

// ─── Bascule vers la page de recherche ───────────────────────────────────────
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

// ─── Filtres ─────────────────────────────────────────────────────────────────
function initializeSearchFilters() {
    const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort();
    const sizes = [...new Set(state.products.flatMap(p => (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean)))].sort();
    const colors = [...new Set(state.products.flatMap(p => (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean)))].sort();

    document.getElementById('categoryFilters').innerHTML = categories.map(cat => {
        const count = state.products.filter(p => p.category === cat).length;
        return `<label class="filter-checkbox">
            <input type="checkbox" value="${escapeHtml(cat)}" data-filter="category">
            <span>${escapeHtml(cat)}</span>
            <span class="count">${count}</span>
        </label>`;
    }).join('');

    document.getElementById('sizeFilters').innerHTML = sizes.map(size => {
        const count = state.products.filter(p => (p.tailles || '').includes(size)).length;
        return `<label class="filter-checkbox">
            <input type="checkbox" value="${escapeHtml(size)}" data-filter="size">
            <span>${escapeHtml(size)}</span>
            <span class="count">${count}</span>
        </label>`;
    }).join('');

    document.getElementById('colorFilters').innerHTML = colors.map(color => {
        const count = state.products.filter(p => (p.couleurs || '').includes(color)).length;
        return `<label class="filter-checkbox">
            <input type="checkbox" value="${escapeHtml(color)}" data-filter="color">
            <span>${escapeHtml(color)}</span>
            <span class="count">${count}</span>
        </label>`;
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
            const filters = state.searchViewState.filters;

            if (filterType === 'category') {
                if (checkbox.checked) filters.categories.push(value);
                else filters.categories = filters.categories.filter(c => c !== value);
            } else if (filterType === 'size') {
                if (checkbox.checked) filters.sizes.push(value);
                else filters.sizes = filters.sizes.filter(s => s !== value);
            } else if (filterType === 'color') {
                if (checkbox.checked) filters.colors.push(value);
                else filters.colors = filters.colors.filter(c => c !== value);
            }

            performAdvancedSearch();
        });
    });

    document.getElementById('sortBy').addEventListener('change', (e) => {
        state.searchViewState.sortBy = e.target.value;
        performAdvancedSearch();
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

// ─── Recherche + tri ─────────────────────────────────────────────────────────
function performAdvancedSearch() {
    let results = [...state.products];
    const sv = state.searchViewState;

    if (sv.query.trim()) {
        const scored = results.map(p => ({ product: p, score: calculateSearchScore(sv.query, p) }))
                              .filter(item => item.score > 0);
        scored.sort((a, b) => b.score - a.score);
        results = scored.map(item => item.product);
    }

    if (sv.filters.priceMin !== null) results = results.filter(p => p.price >= sv.filters.priceMin);
    if (sv.filters.priceMax !== null) results = results.filter(p => p.price <= sv.filters.priceMax);
    if (sv.filters.categories.length > 0) results = results.filter(p => sv.filters.categories.includes(p.category));
    if (sv.filters.sizes.length > 0) {
        results = results.filter(p => {
            const productSizes = (p.tailles || '').split(',').map(s => s.trim());
            return sv.filters.sizes.some(size => productSizes.includes(size));
        });
    }
    if (sv.filters.colors.length > 0) {
        results = results.filter(p => {
            const productColors = (p.couleurs || '').split(',').map(s => s.trim());
            return sv.filters.colors.some(color => productColors.includes(color));
        });
    }

    results = sortResults(results, sv.sortBy);
    displaySearchResults(results);
}

function sortResults(results, sortBy) {
    const sorted = [...results];
    switch (sortBy) {
        case 'price-asc':  sorted.sort((a, b) => a.price - b.price); break;
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

// ─── Affichage des résultats ─────────────────────────────────────────────────
// Markup IDENTIQUE à une carte du catalogue (classes .product-card + data-action).
// Clic carte / panier / favori / crayon = gérés par la délégation globale de
// main.js. Aucun listener attaché ici (sinon double-handler).
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
        const img = p.image
            ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy" onload="this.classList.add('loaded')" onerror="this.style.display='none'">`
            : '';

        // Logique inline identique à catalogue.js (pas de fonction utils pour ça)
        const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
        const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
        let details = [];
        if (tailles.length) details.push(`${tailles.length} taille${tailles.length > 1 ? 's' : ''}`);
        if (couleurs.length) details.push(`${couleurs.length} couleur${couleurs.length > 1 ? 's' : ''}`);
        if (details.length) details.push('En stock');
        const detailsHTML = details.length
            ? `<div class="product-card-details">${details.map(d => `<span class="product-card-detail-item">${escapeHtml(d)}</span>`).join('')}</div>`
            : '';

        // Crayon admin (comme sur le catalogue). Retire cette ligne si tu ne veux
        // pas du crayon sur la page de recherche.
        const editBtnHTML = state.isAdminLoggedIn
            ? `<button class="product-edit-btn" data-action="edit-product" data-id="${p.id}" aria-label="Modifier le produit">✏️</button>`
            : '';

        // "visible" d'emblée : apparition immédiate, on évite le piège opacity:0
        // de .product-card (pas de scrollObserver côté recherche).
        return `
            <div class="product-card visible" data-product-id="${p.id}" role="listitem">
                ${img}
                ${generateBadgesHTML(p, false)}
                <div class="product-card-info">
                    <div class="product-card-text">
                        <div class="product-card-name">${escapeHtml(p.name)}</div>
                        <div class="product-card-price">${formatPrice(p.price)}</div>
                        ${detailsHTML}
                    </div>
                </div>
                <button class="product-card-add" data-action="add-to-cart" data-id="${p.id}" aria-label="Ajouter au panier">
                    <svg viewBox="0 0 24 24"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
                </button>
                <button class="fav-icon" data-action="toggle-favorite" data-id="${p.id}" aria-label="Ajouter aux favoris">
                    <svg viewBox="0 0 24 24" class="fav-icon-svg"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                </button>
                ${editBtnHTML}
            </div>
        `;
    }).join('');
}
