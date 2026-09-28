// ═══ Utils — badges produit (Nouveau ✨ / Populaire 🔥) ═══
// Éclaté de utils.js (refacto-archi). Le cache _freshCache suit
// state.products comme dans l'original.
import { NEW_PRODUCT_DAYS, POPULAR_THRESHOLD } from '../core/config.js';
import { state } from '../core/state.js';

export function isNewProduct(p) {
    if (!p.created_at) return false;
    return (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24) <= NEW_PRODUCT_DAYS;
}

const MAX_FRESH_BADGES = 30;
let _freshCache = null;
let _freshRef = null;
export function isFresh(p) {
    if (!p || !p.created_at) return false;
    if (_freshRef !== state.products) {
        _freshRef = state.products;
        const cutoff = Date.now() - NEW_PRODUCT_DAYS * 86400000;
        _freshCache = new Set(
            [...state.products]
                .filter(x => x.created_at && new Date(x.created_at).getTime() >= cutoff)
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, MAX_FRESH_BADGES)
                .map(x => x.id)
        );
    }
    return _freshCache.has(p.id);
}

export function isBestSeller(p) { return (Number(p.popularity_score) || 0) >= POPULAR_THRESHOLD; }

export function generateBadgesHTML(p, isModal = false) {
    const isNew = isFresh(p);
    const isBest = isBestSeller(p);
    if (!isModal) {
        if (isBest) return '<div class="badge-container"><span class="badge badge-best-seller">🔥 Populaire</span></div>';
        if (isNew) return '<div class="badge-container"><span class="badge badge-new">✨ Nouveau</span></div>';
        return '';
    }
    let html = '<div class="badge-container">';
    if (isNew) html += '<span class="badge badge-new">✨ Nouveau</span>';
    if (isBest) html += '<span class="badge badge-best-seller">🔥 Populaire</span>';
    html += '</div>';
    return (isNew || isBest) ? html : '';
}
