// ═══ Catalogue — filtrage & tri (favoris, nouveautés, best-sellers, pour toi) ═══
// Éclaté de catalogue.js (refacto-archi) — logique strictement identique.
import { state, getCategoryFilterIds, getCategoryName } from '../../core/state.js';
import { isFresh } from '../../utils/badges.js';
import { forYou } from '../../services/reco.js';

export function getFilteredProducts() {
    let filtered;
    if (state.currentFilter === 'favorites') {
        filtered = state.products.filter(p => state.favorites.includes(p.id));
    } else if (state.currentFilter === 'all') {
        filtered = state.products;
    } else {
        const ids = getCategoryFilterIds(state.currentFilter);
        if (ids && ids.length) {
            const idSet = new Set(ids);
            filtered = state.products.filter(p => p.category_id && idSet.has(p.category_id));
        } else {
            filtered = state.products;
        }
    }

    if (state.currentQuickFilter === 'new') filtered = filtered.filter(p => isFresh(p));
    else if (state.currentQuickFilter === 'bestseller') filtered = filtered.filter(p => (p.popularity_score || 0) > 0).sort((a, b) => (b.popularity_score || 0) - (a.popularity_score || 0));
    else if (state.currentQuickFilter === 'foryou') filtered = forYou(filtered);

    if (state.searchQuery && !(/^\d+$/.test(state.searchQuery) && state.products.some(p => p.id === parseInt(state.searchQuery)))) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(p => {
            const nameMatch = p.name.toLowerCase().includes(q);
            const catName = (p.category_name || getCategoryName(p.category_id) || '').toLowerCase();
            return nameMatch || (catName && catName.includes(q));
        });
    }
    return filtered;
}
