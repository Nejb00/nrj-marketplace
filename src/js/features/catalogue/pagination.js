// ═══ Catalogue — pagination (sentinel + observers + chargement de page) ═══
// Éclaté de catalogue.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { PRODUCTS_PER_PAGE } from '../../core/config.js';
import { appendProducts } from './render-grid.js';

export function setupScrollObserver() {
    if (state.scrollObserver) { state.scrollObserver.disconnect(); state.scrollObserver = null; }
    state.scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); state.scrollObserver.unobserve(entry.target); } });
    }, { rootMargin: '50px' });
}

export function loadMoreProducts() {
    if (state.isLoadingMore) return;
    if (state.displayedCount >= state.currentFilteredProducts.length) return;
    state.isLoadingMore = true;
    const msg = document.getElementById('loadingMessage');
    if (msg) msg.style.display = 'block';
    setTimeout(() => appendProducts(state.displayedCount, PRODUCTS_PER_PAGE), 50);
}

export function updateSentinelVisibility() {
    const hasMore = state.displayedCount < state.currentFilteredProducts.length;
    const s = document.getElementById('loadMoreSentinel');
    if (s) {
        s.style.display = hasMore ? 'block' : 'none';
        s.style.height = hasMore ? '40px' : '0';
        s.style.minHeight = hasMore ? '40px' : '0';
    }
    const wrap = document.getElementById('loadMoreWrap');
    const btn = document.getElementById('loadMoreBtn');
    if (wrap) wrap.style.display = hasMore ? 'flex' : 'none';
    if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => loadMoreProducts());
    }
}

export function setupObserver() {
    if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
    }
    const s = document.getElementById('loadMoreSentinel');
    if (!s) {
        updateSentinelVisibility();
        return;
    }
    state.observer = new IntersectionObserver((entries) => {
        entries.forEach(e => {
            if (e.isIntersecting && !state.isLoadingMore && state.displayedCount < state.currentFilteredProducts.length) {
                loadMoreProducts();
            }
        });
    }, { root: null, rootMargin: '400px 0px', threshold: 0 });
    state.observer.observe(s);
    updateSentinelVisibility();
}
