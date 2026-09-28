// ═══ Catalogue — produits populaires de la vue Catégories ═══
// Éclaté de catalogue.js (refacto-archi) — logique strictement identique.
import { state, getCategoryFilterIds } from '../../core/state.js';
import { forYou } from '../../services/reco.js';
import { renderProductCardHTML } from './render-product-card.js';
import { getCategoriesPageState } from './categories-page.js';

function getCategoriesPopularProducts() {
    let list;
    const parentKey = getCategoriesPageState().selectedParentId;
    if (!parentKey || parentKey === 'featured') list = [...state.products];
    else {
        const ids = getCategoryFilterIds(parentKey);
        if (ids && ids.length) {
            const idSet = new Set(ids);
            list = state.products.filter(p => p.category_id && idSet.has(p.category_id));
        } else list = [...state.products];
    }
    const sortBy = getCategoriesPageState().sortBy || 'relevance';
    switch (sortBy) {
        case 'bestsellers':
            list.sort((a, b) => (Number(b.orders_count) || 0) - (Number(a.orders_count) || 0) || (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0));
            break;
        case 'newest':
            list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            break;
        case 'price-asc':
            list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
            break;
        case 'price-desc':
            list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
            break;
        case 'foryou':
            list = forYou(list);
            break;
        default:
            list.sort((a, b) => (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0));
    }
    return list.slice(0, 60);
}

function revealCardImages(root) {
    if (!root) return;
    root.querySelectorAll('img').forEach((img, index) => {
        img.classList.add('loaded');
        img.style.opacity = '1';
        img.loading = index < 12 ? 'eager' : 'lazy';
        img.decoding = 'async';
        const markLoaded = () => {
            img.classList.add('loaded');
            img.style.opacity = '1';
        };
        if (img.complete && img.naturalWidth > 0) {
            markLoaded();
            return;
        }
        img.addEventListener('load', markLoaded, { once: true });
        img.addEventListener('error', () => { markLoaded(); }, { once: true });
        if (!img.complete) {
            const src = img.currentSrc || img.src;
            if (src) img.src = src;
        }
    });
}

export function renderCategoriesPopularProducts() {
    const grid = document.getElementById('categoriesPopularGrid');
    if (!grid) return;
    const products = getCategoriesPopularProducts();
    if (!products.length) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:2rem;">Aucun article</div>';
        return;
    }
    grid.innerHTML = products.map((p, i) =>
        `<div class="product-card visible" data-product-id="${p.id}" role="listitem">${renderProductCardHTML(p, i)}</div>`
    ).join('');
    requestAnimationFrame(() => revealCardImages(grid));
}
