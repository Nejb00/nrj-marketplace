// ═══ App — barre de recherche (input, clear, clic extérieur) ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
// Side-effects au chargement, ordre historique préservé.
import { state } from '../../core/state.js';
import { refreshCatalogue } from '../catalogue/catalogue-init.js';
import { showSearchDropdown, hideSearchDropdown } from '../../services/search-dropdown.js';
import { switchToSearchView } from '../search/search-view.js';

let searchDebounceTimer = null;

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

if (searchInput) {
  searchInput.addEventListener('input', function(e) {
    const v = e.target.value.trim();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => showSearchDropdown(v), 300);
    state.searchQuery = v;
    refreshCatalogue();
  });

  searchInput.addEventListener('focus', function() { showSearchDropdown(this.value.trim()); });

  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = this.value.trim();
      if (v) { hideSearchDropdown(); switchToSearchView(v); }
    } else if (e.key === 'Escape') {
      hideSearchDropdown();
      this.blur();
    }
  });
}

if (searchClear) {
  searchClear.addEventListener('click', function() {
    searchInput.value = '';
    state.searchQuery = '';
    hideSearchDropdown();
    refreshCatalogue();
    searchInput.focus();
  });
}

document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('searchDropdown');
  const searchBar = document.querySelector('.search-bar');
  if (searchBar && dropdown && !searchBar.contains(e.target) && !dropdown.contains(e.target)) hideSearchDropdown();
});
