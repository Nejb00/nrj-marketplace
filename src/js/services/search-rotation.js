// ═══ Recherche — rotation intelligente du placeholder ═══
// Éclaté de search.js (refacto-archi).
import { state } from '../core/state.js';
import { MAX_PLACEHOLDER_SUGGESTIONS } from '../core/config.js';
import { saveSearchToHistory, getSearchHistory } from './search-history.js';

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

  // Suggestions à partir des noms de catégories (table categories)
  if (state.categories.length) {
    const topCats = state.categories.filter(c => c.parent_id === null);
    topCats.forEach(c => { if (suggestions.length < max) push(c.name); });
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
