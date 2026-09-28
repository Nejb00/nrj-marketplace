// ═══ Catalogue — rendu d'une carte produit (HTML) + squelette de chargement ═══
// Éclaté de catalogue.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { escapeHtml } from '../../utils/escape-html.js';
import { formatPrice } from '../../utils/format.js';
import { generateBadgesHTML } from '../../utils/badges.js';
import { thumbImg } from '../../utils/images.js';
import { imageLoadOpts } from '../../services/lazy-loading.js';

export function renderProductCardHTML(p, index = 0) {
    const img = p.image ? thumbImg(p.image, p.name, 300, 400, '', imageLoadOpts(index)) : '';
    const hasVideo = !!(p.video_url && String(p.video_url).trim());
    const videoBadge = hasVideo
        ? '<span class="product-card-video-badge" aria-hidden="true" title="Vidéo disponible">▶️</span>'
        : '';
    const isFav = state.favorites.includes(p.id);
    const tailles = (p.tailles || '').split(',').map(s => s.trim()).filter(Boolean);
    const couleurs = (p.couleurs || '').split(',').map(s => s.trim()).filter(Boolean);
    let details = [];
    if (tailles.length) details.push(`${tailles.length} taille${tailles.length > 1 ? 's' : ''}`);
    if (couleurs.length) details.push(`${couleurs.length} couleur${couleurs.length > 1 ? 's' : ''}`);
    if (details.length) details.push('En stock');
    const detailsHTML = details.length ? `<div class="product-card-details">${details.map(d => `<span class="product-card-detail-item">${escapeHtml(d)}</span>`).join('')}</div>` : '';
    const moq = Number(p.moq) || 1;
    let html = `${img}${videoBadge}${generateBadgesHTML(p, false)}<div class="product-card-info"><div class="product-card-text"><div class="product-card-name">${escapeHtml(p.name)}</div><div class="product-card-bottom"><div class="product-card-price">${formatPrice(p.price)}</div><div class="product-card-moq">Min. ${moq} pcs</div></div>${detailsHTML}</div></div><button class="fav-icon" data-action="toggle-favorite" data-id="${p.id}" aria-label="Ajouter aux favoris"><svg viewBox="0 0 24 24" class="fav-icon-svg${isFav ? ' faved' : ''}"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>`;
    if (state.isAdminLoggedIn) html += `<button class="product-edit-btn" data-action="edit-product" data-id="${p.id}" aria-label="Modifier le produit">✏️</button>`;
    return html;
}

export function createSkeletonCard() {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-card';
    skeleton.innerHTML = `<div class="skeleton-image"></div><div class="skeleton-text"><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line skeleton-line--price"></div></div>`;
    return skeleton;
}
