// ═══ Favoris — logique séparée du panier (refacto-archi) ═══
import { state, saveFavorites } from '../core/state.js';
import { showToast } from '../utils/dom-helpers.js';
import { signalFavorite } from './reco.js';

export async function toggleFavorite(pid, btn) {
    const idx = state.favorites.indexOf(pid);
    if (idx >= 0) {
        state.favorites.splice(idx, 1);
        showToast('💔 Retiré des favoris');
    } else {
        state.favorites.push(pid);
        showToast('❤️ Ajouté aux favoris');
        signalFavorite && signalFavorite(state.products.find(p => p.id === pid));
    }
    await saveFavorites();
    updateNavFavBadge();
    if (btn) {
        btn.classList.toggle('active', state.favorites.includes(pid));
        const svg = btn.querySelector('svg');
        if (svg) {
            svg.classList.add('fav-pop');
            svg.addEventListener('animationend', () => svg.classList.remove('fav-pop'), { once: true });
        }
    }
}

export function updateNavFavBadge() {
    const cnt = state.favorites.length;
    const b = document.getElementById('navFavBadge');
    if (b) { b.textContent = cnt > 99 ? '99+' : cnt; b.style.display = cnt > 0 ? 'flex' : 'none'; }
}
