// ═══ App — barre de filtres catégories ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { escapeHtml } from '../../utils/escape-html.js';

export function buildFilterBar() {
  const topCats = state.categories
    .filter(c => c.parent_id === null)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  let html = `<button class="filter-btn active" data-category="all">Tout</button>`;
  topCats.forEach(c => {
    const label = (c.icon ? c.icon + ' ' : '') + c.name;
    html += `<button class="filter-btn" data-category="${escapeHtml(c.id)}">${escapeHtml(label)}</button>`;
  });
  const filterBar = document.getElementById('filterBar');
  if (filterBar) filterBar.innerHTML = html;
}
