// ═══ Catalogue — bulles de sous-catégories + filtres ═══
// Éclaté de catalogue.js (refacto-archi) — logique strictement identique.
import { state, isTopLevelCategory } from '../../core/state.js';
import { escapeHtml } from '../../utils/escape-html.js';
import { thumb } from '../../utils/images.js';
import { fetchSubcategoriesWithLatestImage } from '../../api/api.js';
import { refreshCatalogue } from './catalogue-init.js';

export function hideSubcategoryBubbles() {
    state.subcategoryBubbles = [];
    state.activeTopCategoryId = null;
    state.activeSubcategoryId = null;
    const row = document.getElementById('subcategoryBubbles');
    if (row) { row.innerHTML = ''; row.hidden = true; }
}

export function renderSubcategoryBubbles() {
    const row = document.getElementById('subcategoryBubbles');
    if (!row) return;
    const items = state.subcategoryBubbles || [];
    if (!items.length) { row.innerHTML = ''; row.hidden = true; return; }
    row.hidden = false;
    if (!row.dataset.allBound) {
        row.dataset.allBound = '1';
        row.addEventListener('click', (e) => { if (e.target.closest('[data-subcategory-all="1"]')) selectSubcategoryAll(); });
    }
    const allActive = state.activeSubcategoryId === null ? ' active' : '';
    const allBubble = `<button type="button" class="subcat-bubble subcat-bubble--all${allActive}" data-subcategory-all="1" aria-label="Tout" title="Tout"><span class="subcat-bubble-img"><span class="subcat-bubble-fallback">✨</span></span><span class="subcat-bubble-label">Tout</span></button>`;
    row.innerHTML = allBubble + items.map(sub => {
        const active = state.activeSubcategoryId === sub.id ? ' active' : '';
        const label = escapeHtml(sub.name || '');
        const fallbackIcon = sub.icon ? escapeHtml(sub.icon) : '📦';
        const imgSrc = sub.image || sub.latest_image || sub.product_image || sub.img || '';
        let media;
        if (imgSrc) {
            const proxied = escapeHtml(thumb(imgSrc, 120, 120, 'cover'));
            const direct = escapeHtml(imgSrc);
            const onerr = "this.onerror=function(){var s=document.createElement('span');s.className='subcat-bubble-fallback';s.textContent='" + fallbackIcon + "';this.replaceWith(s);};this.src=this.dataset.full;this.removeAttribute('data-full');";
            media = `<img src="${proxied}" data-full="${direct}" alt="${label}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="${onerr}">`;
        } else media = `<span class="subcat-bubble-fallback">${fallbackIcon}</span>`;
        return `<button type="button" class="subcat-bubble${active}" data-subcategory-id="${escapeHtml(sub.id)}" aria-label="${label}" title="${label}"><span class="subcat-bubble-img">${media}</span><span class="subcat-bubble-label">${label}</span></button>`;
    }).join('');
}

export function selectSubcategoryAll() {
    const topId = state.activeTopCategoryId;
    if (!topId) return;
    state.currentFilter = topId;
    state.activeSubcategoryId = null;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.filter-btn[data-category="${topId}"]`);
    if (btn) btn.classList.add('active');
    renderSubcategoryBubbles();
    refreshCatalogue();
}

async function loadBubblesForTop(topId) {
    state.activeTopCategoryId = topId;
    state.activeSubcategoryId = null;
    const rows = await fetchSubcategoriesWithLatestImage(topId);
    if (state.activeTopCategoryId !== topId) return;
    state.subcategoryBubbles = rows;
    renderSubcategoryBubbles();
}

export async function applyFilter(categoryId) {
    state.currentFilter = categoryId;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (categoryId === 'all' || categoryId === 'favorites') {
        const btn = document.querySelector(`.filter-btn[data-category="${categoryId}"]`);
        if (btn) btn.classList.add('active');
        hideSubcategoryBubbles();
        refreshCatalogue();
        return;
    }
    const cat = state.categoriesById.get(categoryId);
    if (isTopLevelCategory(categoryId)) {
        const btn = document.querySelector(`.filter-btn[data-category="${categoryId}"]`);
        if (btn) btn.classList.add('active');
        refreshCatalogue();
        await loadBubblesForTop(categoryId);
        return;
    }
    if (cat && cat.parent_id) {
        const parentBtn = document.querySelector(`.filter-btn[data-category="${cat.parent_id}"]`);
        if (parentBtn) parentBtn.classList.add('active');
        state.activeSubcategoryId = categoryId;
        if (state.activeTopCategoryId !== cat.parent_id || !state.subcategoryBubbles.length) {
            state.activeTopCategoryId = cat.parent_id;
            const rows = await fetchSubcategoriesWithLatestImage(cat.parent_id);
            if (state.activeTopCategoryId === cat.parent_id) state.subcategoryBubbles = rows;
        }
        renderSubcategoryBubbles();
        refreshCatalogue();
        return;
    }
    const btn = document.querySelector(`.filter-btn[data-category="${categoryId}"]`);
    if (btn) btn.classList.add('active');
    hideSubcategoryBubbles();
    refreshCatalogue();
}

export function clearSubcategorySelection() { hideSubcategoryBubbles(); }
