import { state } from './state.js';
import { SEARCH_HISTORY_KEY, MAX_HISTORY_ITEMS, MAX_PLACEHOLDER_SUGGESTIONS } from './config.js';
import { escapeHtml, formatPrice, fuzzySearch, highlightMatch, getCategoryIcon, showToast } from './utils.js';
import { openProductModal } from './product-modal.js';
import { switchToSearchView } from './search-view.js';

// ─── Suggestions intelligentes pour le placeholder ───────────────────────────
// Réservoir de rotation : historique perso d'abord, puis best-sellers (noms),
// puis catégories chaudes. 100 % côté client, aucun appel Supabase.
export function buildSmartRotationList() {
  const max = MAX_PLACEHOLDER_SUGGESTIONS;
  const suggestions = [];
  const seen = new Set();

  const push = (term) => {
    const t = (term || '').trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    suggestions.push(t);
  };

  // 1) Historique perso d'abord (choix UX : fidéliser le visiteur récurrent)
  getSearchHistory().slice(0, max).forEach(push);

  // 2) Best-sellers : produits au plus gros popularity_score
  if (state.products.length) {
    [...state.products]
      .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0))
      .forEach(p => { if (suggestions.length < max) push(p.name); });
  }

  // 3) Catégories chaudes : somme des scores par catégorie
  if (state.products.length) {
    const catScores = {};
    state.products.forEach(p => {
      if (!p.category) return;
      catScores[p.category] = (catScores[p.category] || 0) + (p.popularity_score || 0);
    });
    Object.entries(catScores)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat]) => { if (suggestions.length < max) push(cat); });
  }

  // Garde-fou : on n'écrase jamais la liste par du vide
  if (suggestions.length > 0) {
    state.rotationList = suggestions;
    state.currentPlaceholderIndex = 0;
  }
}

export function initPlaceholderRotation() {
  buildSmartRotationList();
  const input = document.getElementById('searchInput');
  if (!input) return;
  setInterval(() => {
    if (document.activeElement !== input && input.value === '') {
      state.currentPlaceholderIndex = (state.currentPlaceholderIndex + 1) % state.rotationList.length;
      input.placeholder = state.rotationList[state.currentPlaceholderIndex];
    }
  }, 3500);
}

function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveSearchToHistory(query) {
  if (!query || query.trim().length < 2) return;
  let history = getSearchHistory();
  history = history.filter(h => h.toLowerCase() !== query.toLowerCase());
  history.unshift(query.trim());
  if (history.length > MAX_HISTORY_ITEMS) history = history.slice(0, MAX_HISTORY_ITEMS);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("Impossible de sauvegarder l'historique:", e);
  }
}

function clearSearchHistory() {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch (e) {}
}

// Exposé pour le bouton "Effacer" généré en HTML brut dans le dropdown
window.clearSearchHistory = function() {
  clearSearchHistory();
  showSearchDropdown('');
};

export function initVoiceSearch() {
  const voiceBtn = document.getElementById('searchVoice');
  const searchInput = document.getElementById('searchInput');

  if (!voiceBtn || !searchInput) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    voiceBtn.style.display = 'none';
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    state.isVoiceListening = true;
    voiceBtn.classList.add('listening');
    searchInput.placeholder = '🎤 Parlez maintenant...';
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    searchInput.value = transcript;
    searchInput.dispatchEvent(new Event('input'));
    showToast(`🎤 "${transcript}"`);
  };

  recognition.onerror = (event) => {
    console.warn('Erreur reconnaissance vocale:', event.error);
    if (event.error === 'no-speech') {
      showToast('❌ Aucune parole détectée');
    } else if (event.error === 'not-allowed') {
      showToast('❌ Accès au microphone refusé');
    } else {
      showToast('❌ Erreur de reconnaissance vocale');
    }
  };

  recognition.onend = () => {
    state.isVoiceListening = false;
    voiceBtn.classList.remove('listening');
    searchInput.placeholder = state.rotationList[state.currentPlaceholderIndex];
  };

  voiceBtn.addEventListener('click', () => {
    if (state.isVoiceListening) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (e) {
        console.warn('Impossible de démarrer la reconnaissance vocale:', e);
      }
    }
  });
}

export function showSearchDropdown(query) {
  const dropdown = document.getElementById('searchDropdown');
  const clearBtn = document.getElementById('searchClear');
  const loader = document.getElementById('searchLoader');

  if (!query || query.trim().length === 0) {
    const history = getSearchHistory();
    if (history.length > 0) {
      let html = `<div class="dropdown-header"><span>🕐 Recherches récentes</span><button onclick="window.clearSearchHistory()">Effacer</button></div>`;
      history.forEach(h => {
        html += `<div class="dropdown-history-item" data-query="${escapeHtml(h)}"><span class="dropdown-history-icon">🕐</span><span class="dropdown-history-text">${escapeHtml(h)}</span></div>`;
      });
      dropdown.innerHTML = html;
      dropdown.style.display = 'block';

      dropdown.querySelectorAll('.dropdown-history-item').forEach(item => {
        item.addEventListener('click', () => {
          const q = item.dataset.query;
          document.getElementById('searchInput').value = q;
          switchToSearchView(q);
          hideSearchDropdown();
        });
      });
    } else {
      hideSearchDropdown();
    }
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
      dropdown.innerHTML = `<div class="dropdown-no-results"><div class="dropdown-no-results-icon">🔍</div><div>Aucun produit trouvé pour "${escapeHtml(query)}"</div></div>`;
      dropdown.style.display = 'block';
      return;
    }

    let html = `<div class="dropdown-header"><span>${results.length} résultat${results.length > 1 ? 's' : ''}</span></div>`;

    results.forEach(p => {
      const img = p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy">` : `<span>${getCategoryIcon(p.category)}</span>`;
      const categoryIcon = getCategoryIcon(p.category);
      html += `<div class="dropdown-item" data-product-id="${p.id}"><div class="dropdown-item-img">${img}</div><div class="dropdown-item-info"><div class="dropdown-item-name">${highlightMatch(p.name, query)}</div><div class="dropdown-item-category">${categoryIcon} ${escapeHtml(p.category || 'Sans catégorie')}</div></div><div class="dropdown-item-price">${formatPrice(p.price)}</div></div>`;
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

export { saveSearchToHistory, getSearchHistory };
