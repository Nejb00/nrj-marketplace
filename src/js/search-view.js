import { state, getCategoryFilterIds, getCategoryName } from './state.js';
import { escapeHtml, formatPrice, debounce, calculateSearchScore, generateBadgesHTML, thumbImg } from './utils.js';

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
  // Filtres catégories : top-niveau issus de la table categories
  const topCats = state.categories
    .filter(c => c.parent_id === null)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const sizes = [...new Set(state.products.flatMap(p => (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean)))].sort();
  const colors = [...new Set(state.products.flatMap(p => (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean)))].sort();

  document.getElementById('categoryFilters').innerHTML = topCats.map(cat => {
    const ids = getCategoryFilterIds(cat.id);
    const idSet = new Set(ids || [cat.id]);
    const count = state.products.filter(p => p.category_id && idSet.has(p.category_id)).length;
    const label = (cat.icon ? cat.icon + ' ' : '') + cat.name;
    return `<label class="filter-checkbox">
      <input type="checkbox" value="${escapeHtml(cat.id)}" data-filter="category">
      <span>${escapeHtml(label)}</span>
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
      const f = state.searchViewState.filters;
      if (filterType === 'category') {
        if (checkbox.checked) f.categories.push(value);
        else f.categories = f.categories.filter(c => c !== value);
      } else if (filterType === 'size') {
        if (checkbox.checked) f.sizes.push(value);
        else f.sizes = f.sizes.filter(s => s !== value);
      } else if (filterType === 'color') {
        if (checkbox.checked) f.colors.push(value);
        else f.colors = f.colors.filter(c => c !== value);
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

  // Filtres catégorie : valeurs = category_id top-niveau ; inclure sous-catégories
  if (sv.filters.categories.length > 0) {
    const allowed = new Set();
    sv.filters.categories.forEach(catId => {
      const ids = getCategoryFilterIds(catId);
      (ids || [catId]).forEach(id => allowed.add(id));
    });
    results = results.filter(p => p.category_id && allowed.has(p.category_id));
  }

  if (sv.filters.sizes.length > 0) {
    results = results.filter(p => {
      const ps = (p.tailles || '').split(',').map(s => s.trim());
      return sv.filters.sizes.some(size => ps.includes(size));
    });
  }
  if (sv.filters.colors.length > 0) {
    results = results.filter(p => {
      const pc = (p.couleurs || '').split(',').map(s => s.trim());
      return sv.filters.colors.some(color => pc.includes(color));
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
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        return db - da;
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

  grid.innerHTML = results.map((p, idx) => {
    const img = p.image ? thumbImg(p.image, p.name, 300, 400) : '';
    const isFav = state.favorites.includes(p.id);
    const editBtn = state.isAdminLoggedIn
      ? `<button class="product-edit-btn" data-action="edit-product" data-id="${p.id}" aria-label="Modifier le produit">✏️</button>`
      : '';
    const delay = Math.min(idx, 8) * 60;

    return `
      <div class="product-card visible" data-product-id="${p.id}" role="listitem"
           style="animation: card-enter .45s ease both; animation-delay: ${delay}ms">
        ${img}
        ${generateBadgesHTML(p, false)}
        <div class="product-card-info">
          <div class="product-card-text">
            <div class="product-card-name">${escapeHtml(p.name)}</div>
            <div class="product-card-bottom">
              <div class="product-card-price">${formatPrice(p.price)}</div>
              <div class="product-card-moq">Min. ${Number(p.moq) || 1} pcs</div>
            </div>
          </div>
        </div>
        <button class="fav-icon" data-action="toggle-favorite" data-id="${p.id}" aria-label="Ajouter aux favoris">
          <svg viewBox="0 0 24 24" class="fav-icon-svg${isFav ? ' faved' : ''}"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </button>
        ${editBtn}
      </div>`;
  }).join('');
}
