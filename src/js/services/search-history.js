// ═══ Recherche — historique localStorage ═══
// Éclaté de search.js (refacto-archi).
import { SEARCH_HISTORY_KEY, MAX_HISTORY_ITEMS } from '../core/config.js';
import { showSearchDropdown } from './search-dropdown.js';

export function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

export function saveSearchToHistory(query) {
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

export function clearSearchHistory() {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch (e) {}
}

window.clearSearchHistory = function() {
  clearSearchHistory();
  showSearchDropdown('');
};
