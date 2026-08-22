import { state } from './state.js';
import { SEARCH_HISTORY_KEY, MAX_HISTORY_ITEMS, MAX_PLACEHOLDER_SUGGESTIONS } from './config.js';
import { escapeHtml, formatPrice, fuzzySearch, highlightMatch, getCategoryIcon, showToast, searchThumbImg } from './utils.js';
import { openProductModal } from './product-modal.js';
import { switchToSearchView } from './search-view.js';

const TRENDING_COUNT = 10;

// Suggestions intelligentes pour le placeholder
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

  getSearchHistory().slice(0, max).forEach(push);

  if (state.products.length) {
    [...state.products]
      .sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0))
      .forEach(p => { if (suggestions.length < max) push(p.name); });
  }

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

  if (suggestions.length > 0) {
    state.rotationList = suggestions;
    state.currentPlaceholderIndex = 0;
  }
}

let historyCaptureBound = false;

export function initPlaceholderRotation() {
  buildSmartRotationList();
  const input = document.getElementById('searchInput');
  if (!input) return;

  // Enregistre la recherche dans l'historique quand on valide avec Entree
  if (!historyCaptureBound) {
    historyCaptureBound = true;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = input.value.trim();
        if (v) saveSearchToHistory(v);
      }
    });
  }

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

window.clearSearchHistory = function() {
  clearSearchHistory();
  showSearchDropdown('');
};

// Panneau de decouverte (historique + tendances)
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

    const catScores = {};
    state.products.forEach(p => {
      if (!p.category) return;
      catScores[p.category] = (catScores[p.category] || 0) + (p.popularity_score || 0);
    });
    Object.entries(catScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .forEach(([c]) => push(c));
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
      showToast('❌ Aucune parole detectee');
    } else if (event.error === 'not-allowed') {
      showToast('❌ Acces au microphone refuse');
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
        console.warn('Impossible de demarrer la reconnaissance vocale:', e);
      }
    }
  });
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
      // Utilise searchThumbImg() pour passer par wsrv.nl et etre cachable par le SW
      const img = p.image ? searchThumbImg(p.image, p.name) : `<span>${getCategoryIcon(p.category)}</span>`;
      const categoryIcon = getCategoryIcon(p.category);
      html += `<div class="dropdown-item" data-product-id="${p.id}"><div class="dropdown-item-img">${img}</div><div class="dropdown-item-info"><div class="dropdown-item-name">${highlightMatch(p.name, query)}</div><div class="dropdown-item-category">${categoryIcon} ${escapeHtml(p.category || 'Sans categorie')}</div></div><div class="dropdown-item-price">${formatPrice(p.price)}</div></div>`;
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
