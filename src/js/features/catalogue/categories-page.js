// ═══ Catalogue — vue Catégories (page plein écran : sidebar + panel) ═══
// Éclaté de catalogue.js (refacto-archi) — logique strictement identique.
import { state, getCategoryName, trackViewedItem } from '../../core/state.js';
import { escapeHtml } from '../../utils/escape-html.js';
import { thumb } from '../../utils/images.js';
import { fetchParentCategoriesRanked, fetchTopPopularSubcategories, fetchSubcategoriesByPopularity } from '../../api/api.js';
import { applyFilter } from './category-bubbles.js';
import { renderCategoriesPopularProducts } from './categories-popular.js';

let categoriesPageState = {
    parents: [],
    selectedParentId: 'featured',
    panelItems: [],
    loading: false,
    initialized: false,
    sortBy: 'relevance'
};

export function getCategoriesPageState() { return categoriesPageState; }

let categoriesScrollContainer = null;
let categoriesScrollHandler = null;
let previousCategoriesScrollTop = 0;
let accumulatedCategoriesScroll = 0;
let lastCategoriesScrollDirection = 0;
const CATEGORIES_SCROLL_THRESHOLD = 8;

function setCategoriesHeaderHidden(hidden) {
    const fixed = document.getElementById('headerFixed');
    const cv = document.getElementById('categoriesView');
    if (!fixed || !cv) return;

    const wasHidden = fixed.classList.contains('categories-header-hidden');
    if (wasHidden === hidden) return;

    fixed.classList.toggle('categories-header-hidden', hidden);

    // The compact header is the only header layer on this page. When hidden,
    // move the view itself to the top so no empty strip remains.
    const headerH = Math.ceil(fixed.offsetHeight || 44);
    const offset = hidden ? 0 : headerH;
    const spacer = document.getElementById('headerSpacer');
    if (spacer) spacer.style.height = headerH + 'px';
    cv.style.setProperty('--categories-header-h', offset + 'px');
    cv.style.height = `calc(100dvh - ${offset}px)`;
    cv.style.maxHeight = `calc(100dvh - ${offset}px)`;

    if (categoriesScrollContainer) {
        previousCategoriesScrollTop = categoriesScrollContainer.scrollTop;
        accumulatedCategoriesScroll = 0;
        lastCategoriesScrollDirection = 0;
    }
}

function bindCategoriesScrollAutoHide() {
    const container = document.querySelector('#categoriesView .categories-main-scroll');
    if (!container) return;
    if (categoriesScrollContainer === container && categoriesScrollHandler) return;

    unbindCategoriesScrollAutoHide();
    categoriesScrollContainer = container;
    previousCategoriesScrollTop = container.scrollTop;
    accumulatedCategoriesScroll = 0;
    lastCategoriesScrollDirection = 0;

    categoriesScrollHandler = () => {
        const currentTop = container.scrollTop;
        const delta = currentTop - previousCategoriesScrollTop;
        previousCategoriesScrollTop = currentTop;

        // Returning to the very top always restores the header immediately.
        if (currentTop <= 0) {
            accumulatedCategoriesScroll = 0;
            lastCategoriesScrollDirection = 0;
            setCategoriesHeaderHidden(false);
            return;
        }
        if (!delta) return;

        const direction = Math.sign(delta);
        if (direction === lastCategoriesScrollDirection) {
            accumulatedCategoriesScroll += Math.abs(delta);
        } else {
            lastCategoriesScrollDirection = direction;
            accumulatedCategoriesScroll = Math.abs(delta);
        }

        if (accumulatedCategoriesScroll >= CATEGORIES_SCROLL_THRESHOLD) {
            setCategoriesHeaderHidden(direction > 0);
            accumulatedCategoriesScroll = 0;
            lastCategoriesScrollDirection = 0;
        }
    };

    // Listen to the element that actually scrolls, not to window.
    container.addEventListener('scroll', categoriesScrollHandler, { passive: true });
}

function unbindCategoriesScrollAutoHide() {
    if (categoriesScrollContainer && categoriesScrollHandler) {
        categoriesScrollContainer.removeEventListener('scroll', categoriesScrollHandler);
    }
    categoriesScrollContainer = null;
    categoriesScrollHandler = null;
    previousCategoriesScrollTop = 0;
    accumulatedCategoriesScroll = 0;
    lastCategoriesScrollDirection = 0;
}

export function syncCategoriesHeaderOffset() {
    const fixed = document.getElementById('headerFixed');
    const spacer = document.getElementById('headerSpacer');
    const cv = document.getElementById('categoriesView');
    if (!cv) return;
    if (fixed) {
        fixed.style.setProperty('--sp', '0');
        document.getElementById('searchCompact')?.classList.remove('active');
    }
    const apply = () => {
        // La hauteur est mesurée après réduction du header aux seuls contrôles
        // de recherche. Le transform ne modifie pas offsetHeight.
        const headerH = Math.ceil(fixed ? fixed.offsetHeight : 0);
        const hidden = !!(fixed && fixed.classList.contains('categories-header-hidden'));
        const offset = hidden ? 0 : headerH;
        if (spacer) spacer.style.height = headerH + 'px';
        cv.style.setProperty('--categories-header-h', offset + 'px');
        cv.style.height = `calc(100dvh - ${offset}px)`;
        cv.style.maxHeight = `calc(100dvh - ${offset}px)`;
    };
    apply();
    requestAnimationFrame(apply);
}

export function enterCategoriesPageMode() {
    document.documentElement.classList.add('categories-page-open');
    document.body.classList.add('categories-page-open');
    document.getElementById('headerFixed')?.classList.remove('categories-header-hidden');
    window.scrollTo(0, 0);
    syncCategoriesHeaderOffset();
    bindCategoriesScrollAutoHide();
}

export function exitCategoriesPageMode() {
    unbindCategoriesScrollAutoHide();
    document.documentElement.classList.remove('categories-page-open');
    document.body.classList.remove('categories-page-open');
    document.getElementById('headerFixed')?.classList.remove('categories-header-hidden');
    const spacer = document.getElementById('headerSpacer');
    if (spacer) spacer.style.height = '';
    const cv = document.getElementById('categoriesView');
    if (cv) {
        cv.classList.remove('is-open');
        cv.style.height = '';
        cv.style.maxHeight = '';
        cv.style.removeProperty('--categories-header-h');
    }
}

export function switchView(v) {
    const cv = document.getElementById('categoriesView');
    const hv = document.getElementById('catalogueView');
    if (v === 'categories') {
        enterCategoriesPageMode();
        if (cv) { cv.style.display = 'flex'; cv.classList.add('is-open'); }
        if (hv) hv.style.display = 'none';
        renderCategories();
        requestAnimationFrame(() => syncCategoriesHeaderOffset());
    } else {
        exitCategoriesPageMode();
        if (cv) { cv.style.display = 'none'; cv.classList.remove('is-open'); }
        if (hv) hv.style.display = 'block';
    }
}

export function buildCategoryPageBubble(sub) {
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
    return `<button type="button" class="subcat-bubble" data-subcategory-id="${escapeHtml(String(sub.id))}" aria-label="${label}" title="${label}"><span class="subcat-bubble-img">${media}</span><span class="subcat-bubble-label">${label}</span></button>`;
}

export function renderCategoriesSidebar() {
    const sidebar = document.getElementById('categoriesSidebar');
    if (!sidebar) return;
    const featuredActive = categoriesPageState.selectedParentId === 'featured' ? ' active' : '';
    let html = `<button type="button" class="categories-sidebar-item${featuredActive}" data-parent-id="featured">✨ En vedette</button>`;
    categoriesPageState.parents.forEach(cat => {
        const id = String(cat.id);
        const active = categoriesPageState.selectedParentId === id ? ' active' : '';
        const icon = cat.icon ? `${escapeHtml(cat.icon)} ` : '';
        html += `<button type="button" class="categories-sidebar-item${active}" data-parent-id="${escapeHtml(id)}">${icon}${escapeHtml(cat.name || '')}</button>`;
    });
    sidebar.innerHTML = html;
}

export function renderCategoriesPanel() {
    const panel = document.getElementById('categoriesPanel');
    if (!panel) return;
    if (categoriesPageState.loading) { panel.innerHTML = '<div class="categories-panel-status">Chargement…</div>'; return; }
    const items = categoriesPageState.panelItems || [];
    if (!items.length) { panel.innerHTML = '<div class="categories-panel-status">Aucune sous-catégorie</div>'; return; }
    panel.innerHTML = `<div class="categories-bubbles-grid">${items.map(buildCategoryPageBubble).join('')}</div>`;
}

export async function loadCategoriesPanel(parentKey) {
    categoriesPageState.selectedParentId = parentKey;
    categoriesPageState.loading = true;
    renderCategoriesSidebar();
    renderCategoriesPanel();
    renderCategoriesPopularProducts();
    let items = parentKey === 'featured' ? await fetchTopPopularSubcategories(30) : await fetchSubcategoriesByPopularity(parentKey);
    if (categoriesPageState.selectedParentId !== parentKey) return;
    categoriesPageState.panelItems = items || [];
    categoriesPageState.loading = false;
    renderCategoriesPanel();
    renderCategoriesPopularProducts();
}

export function bindCategoriesPageEvents() {
    const root = document.getElementById('categoriesView');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    root.addEventListener('click', (e) => {
        const sideItem = e.target.closest('.categories-sidebar-item');
        if (sideItem) {
            const parentId = sideItem.dataset.parentId;
            if (parentId && parentId !== categoriesPageState.selectedParentId) loadCategoriesPanel(parentId);
            return;
        }
        const bubble = e.target.closest('#categoriesPanel .subcat-bubble');
        if (bubble) {
            e.preventDefault();
            e.stopPropagation();
            const subId = bubble.dataset.subcategoryId;
            if (!subId) return;
            trackViewedItem(getCategoryName(subId) || bubble.getAttribute('title') || subId);
            applyFilter(subId);
            switchView('home');
            window.scrollTo(0, 0);
        }
    });
    const sortSelect = document.getElementById('categoriesSortSelect');
    if (sortSelect && !sortSelect.dataset.bound) {
        sortSelect.dataset.bound = '1';
        sortSelect.value = categoriesPageState.sortBy || 'relevance';
        sortSelect.addEventListener('change', () => {
            categoriesPageState.sortBy = sortSelect.value || 'relevance';
            renderCategoriesPopularProducts();
        });
    }
    window.addEventListener('resize', () => {
        if (document.body.classList.contains('categories-page-open')) syncCategoriesHeaderOffset();
    });
}

export async function renderCategories() {
    bindCategoriesPageEvents();
    syncCategoriesHeaderOffset();
    const sidebar = document.getElementById('categoriesSidebar');
    const panel = document.getElementById('categoriesPanel');
    const sortSelect = document.getElementById('categoriesSortSelect');
    if (sortSelect) sortSelect.value = categoriesPageState.sortBy || 'relevance';
    categoriesPageState.selectedParentId = 'featured';
    if (sidebar && panel) {
        if (!categoriesPageState.initialized || !categoriesPageState.parents.length) {
            categoriesPageState.loading = true;
            renderCategoriesPanel();
            categoriesPageState.parents = (await fetchParentCategoriesRanked()) || [];
            categoriesPageState.initialized = true;
        }
        await loadCategoriesPanel('featured');
        return;
    }
    renderCategoriesPopularProducts();
}
