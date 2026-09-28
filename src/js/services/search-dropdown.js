// ═══ Recherche — dropdown (résultats + découverte/historique/tendances) ═══
// Éclaté de search.js (refacto-archi).
import { state, getCategoryName } from '../core/state.js';
import { escapeHtml } from '../utils/escape-html.js';
import { formatPrice } from '../utils/format.js';
import { fuzzySearch, highlightMatch } from '../utils/fuzzy-search.js';
import { getCategoryIcon } from '../utils/category-icon.js';
import { searchThumbImg } from '../utils/images.js';
import { openProductModal } from '../features/product/modal-render.js';
import { switchToSearchView } from '../features/search/search-view.js';
import { getSearchHistory, saveSearchToHistory, clearSearchHistory } from './search-history.js';

const TRENDING_COUNT = 10;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTrendingPool() {
  const pool = [];
  const seen = new Set();
  const push = (t) => {
    t = (t || '').trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    pool.push(t);
  };

  if (state.products.length) {
    [...state.products]
      .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0))
      .slice(0, 20)
      .forEach(p => push(p.name));
  }

  if (state.categories.length) {
    state.categories
      .filter(c => c.parent_id === null)
      .slice(0, 8)
      .forEach(c => push(c.name));
  }
  return pool;
}

function renderDiscovery(dropdown) {
  const history = getSearchHistory();
  const trending = shuffle(buildTrendingPool()).slice(0, TRENDING_COUNT);

  let html = '<div class="discovery">';

  if (history.length) {
    html += `<div class="discovery-section">
      <div class="dropdown-header"><span>🕐 Historique</span><button class="discovery-action" data-action="clear-history" aria-label="Effacer l'historique">🗑️</button></div>
      <div class="discovery-chips">${history.map((h, i) => `<button class="discovery-chip" style="animation-delay:${i * 30}ms" data-query="${escapeHtml(h)}">${escapeHtml(h)}</button>`).join('')}</div>
    </div>`;
  }

  html += `<div class="discovery-section">
    <div class="dropdown-header"><span>🔥 Tendances pour vous</span><button class="discovery-action" data-action="refresh-trending" aria-label="Actualiser les tendances">⟳</button></div>
    <div class="discovery-chips">${trending.map((t, i) => `<button class="discovery-chip" style="animation-delay:${i * 30}ms" data-query="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}</div>
  </div>`;

  html += '</div>';
  dropdown.innerHTML = html;
  dropdown.style.display = 'block';

  dropdown.querySelectorAll('.discovery-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.query;
      saveSearchToHistory(q);
      document.getElementById('searchInput').value = q;
      switchToSearchView(q);
      hideSearchDropdown();
    });
  });

  const clearBtn = dropdown.querySelector('[data-action="clear-history"]');
  if (clearBtn) clearBtn.addEventListener('click', () => { clearSearchHistory(); showSearchDropdown(''); });

  const refreshBtn = dropdown.querySelector('[data-action="refresh-trending"]');
  if (refreshBtn) refreshBtn.addEventListener('click', () => showSearchDropdown(''));
}

export function showSearchDropdown(query) {
  const dropdown = document.getElementById('searchDropdown');
  const clearBtn = document.getElementById('searchClear');
  const loader = document.getElementById('searchLoader');

  if (!query || query.trim().length === 0) {
    renderDiscovery(dropdown);
    if (clearBtn) clearBtn.style.display = 'none';
    if (loader) loader.style.display = 'none';
    return;
  }

  if (clearBtn) clearBtn.style.display = 'block';
  if (loader) loader.style.display = 'block';

  setTimeout(() => {
    const results = fuzzySearch(query, state.products);

    if (loader) loader.style.display = 'none';

    if (results.length === 0) {
      dropdown.innerHTML = `<div class="dropdown-no-results"><div class="dropdown-no-results-icon">🔍</div><div>Aucun produit trouve pour "${escapeHtml(query)}"</div></div>`;
      dropdown.style.display = 'block';
      return;
    }

    let html = `<div class="dropdown-header"><span>${results.length} resultat${results.length > 1 ? 's' : ''}</span></div>`;

    results.forEach(p => {
      const catName = p.category_name || getCategoryName(p.category_id) || 'Sans categorie';
      const img = p.image ? searchThumbImg(p.image, p.name) : `<span>${getCategoryIcon(catName)}</span>`;
      const categoryIcon = getCategoryIcon(catName);
      html += `<div class="dropdown-item" data-product-id="${p.id}"><div class="dropdown-item-img">${img}</div><div class="dropdown-item-info"><div class="dropdown-item-name">${highlightMatch(p.name, query)}</div><div class="dropdown-item-category">${categoryIcon} ${escapeHtml(catName)}</div></div><div class="dropdown-item-price">${formatPrice(p.price)}</div></div>`;
    });

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.dataset.productId);
        openProductModal(id);
        hideSearchDropdown();
        document.getElementById('searchInput').blur();
      });
    });
  }, 150);
}

export function hideSearchDropdown() {
  const dropdown = document.getElementById('searchDropdown');
  if (dropdown) dropdown.style.display = 'none';
}
