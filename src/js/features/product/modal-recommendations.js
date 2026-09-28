// ═══ Fiche produit — recommandations (fallback popularité) ═══
// Éclaté de product-modal.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { escapeHtml } from '../../utils/escape-html.js';
import { thumbImg } from '../../utils/images.js';
import { getRelatedProducts } from '../../api/api.js';

async function buildRecommendations(currentProduct) {
    const TARGET = 12;
    const relatedIds = await getRelatedProducts(currentProduct.id, TARGET);
    const related = relatedIds
        .map(id => state.products.find(p => p.id === id))
        .filter(p => p && p.id !== currentProduct.id);

    const needed = TARGET - related.length;
    if (needed > 0) {
        const sameCat = state.products.filter(
            pr => pr.category_id && pr.category_id === currentProduct.category_id && pr.id !== currentProduct.id
        );
        const others = state.products
            .filter(pr => pr.category_id !== currentProduct.category_id && pr.id !== currentProduct.id && !relatedIds.includes(pr.id))
            .sort((a, b) => (Number(b.popularity_score) || 0) - (Number(a.popularity_score) || 0));
        const fallback = [...sameCat, ...others];
        for (const f of fallback) {
            if (related.length >= TARGET) break;
            if (!relatedIds.includes(f.id)) related.push(f);
        }
    }

    let rec = related.slice(0, TARGET);
    if (rec.length % 2 !== 0) rec.pop();
    return rec;
}

export async function renderRecommendations(p) {
    // Squelettes d'attente
    document.getElementById('modalRecCarousel').innerHTML = Array(6).fill(
        '<div class="rec-card"><div class="rec-card-img" style="background:var(--surface-light);"></div></div>'
    ).join('');

    const rec = await buildRecommendations(p);

    document.getElementById('modalRecCarousel').innerHTML = rec.map(r => `
        <div class="rec-card" data-product-id="${r.id}">
            <div class="rec-card-img">${r.image ? thumbImg(r.image, r.name, 300, 400) : '📦'}</div>
            <div class="rec-card-overlay">
                <div class="rec-card-name">${escapeHtml(r.name)}</div>
                <div class="rec-card-bottom">
                    <div class="rec-card-price">${r.price}</div>
                    <div class="rec-card-moq">Min. ${Number(r.moq) || 1} pcs</div>
                </div>
            </div>
        </div>
    `).join('');
    return rec;
}
