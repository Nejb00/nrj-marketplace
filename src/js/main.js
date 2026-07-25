import '../css/main.css';
import { state } from './state.js';
import { supabaseClient } from './config.js';
import { escapeHtml, removeEmojis } from './utils.js';
import { fetchProducts } from './api.js';
import { trackViewedItem } from './state.js';
import { refreshCatalogue, applyFilter, switchView, renderCategories } from './catalogue.js';
import { addToCart, changeQty, removeCartItem, refreshCartDisplay, toggleFavorite, updateNavFavBadge, openOrderModal, sendWhatsAppOrder } from './cart.js';
import { openProductModal, closeProductModal } from './product-modal.js';
import { openEditModal, updateProduct } from './product-edit.js';
import { initPlaceholderRotation, initVoiceSearch, showSearchDropdown, hideSearchDropdown } from './search.js';
import { switchToSearchView, switchFromSearchView } from './search-view.js';

let searchDebounceTimer = null;

function initSmartHeader() {
    const wrapper = document.getElementById('headerWrapper');
    const spacer = document.getElementById('headerSpacer');
    if (!wrapper || !spacer) return;

    const headerHeight = wrapper.offsetHeight;
    spacer.style.height = headerHeight + 'px';

    let lastScrollY = window.scrollY;
    let ticking = false;

    function updateHeader() {
        const currentScrollY = window.scrollY;
        if (currentScrollY <= 0) wrapper.classList.remove('hidden');
        else if (currentScrollY > lastScrollY && currentScrollY > headerHeight) wrapper.classList.add('hidden');
        else if (currentScrollY < lastScrollY) wrapper.classList.remove('hidden');
        lastScrollY = currentScrollY;
        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) { requestAnimationFrame(updateHeader); ticking = true; }
    }, { passive: true });

    window.addEventListener('resize', () => { spacer.style.height = wrapper.offsetHeight + 'px'; });
}

window.addEventListener('scroll', () => {
    const btn = document.getElementById('scrollToTopBtn');
    if (btn) btn.classList.toggle('visible', window.scrollY > 300);
}, { passive: true });

document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', function() {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        state.currentQuickFilter = this.dataset.filter;
        refreshCatalogue();
    });
});

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

searchInput.addEventListener('input', function(e) {
    const v = e.target.value.trim();
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => showSearchDropdown(v), 300);
    state.searchQuery = v;
    refreshCatalogue();
});

searchInput.addEventListener('focus', function() { showSearchDropdown(this.value.trim()); });

searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const v = this.value.trim();
        if (v) { hideSearchDropdown(); switchToSearchView(v); }
    } else if (e.key === 'Escape') {
        hideSearchDropdown();
        this.blur();
    }
});

searchClear.addEventListener('click', function() {
    searchInput.value = '';
    state.searchQuery = '';
    hideSearchDropdown();
    refreshCatalogue();
    searchInput.focus();
});

document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('searchDropdown');
    const searchBar = document.querySelector('.search-bar');
    if (!searchBar.contains(e.target) && !dropdown.contains(e.target)) hideSearchDropdown();
});

// Délégation d'événements globale pour tout le contenu généré dynamiquement
document.addEventListener('click', e => {
    const fb = e.target.closest('.filter-btn'); if (fb) { applyFilter(fb.dataset.category); return; }
    const addBtn = e.target.closest('[data-action="add-to-cart"]'); if (addBtn) { e.stopPropagation(); addToCart(parseInt(addBtn.dataset.id)); return; }
    const favBtn = e.target.closest('[data-action="toggle-favorite"]'); if (favBtn) { e.stopPropagation(); toggleFavorite(parseInt(favBtn.dataset.id)); return; }
    const editBtn = e.target.closest('[data-action="edit-product"]'); if (editBtn) { e.stopPropagation(); openEditModal(parseInt(editBtn.dataset.id)); return; }
    const removeBtn = e.target.closest('[data-action="cart-remove"]'); if (removeBtn) { e.stopPropagation(); removeCartItem(parseInt(removeBtn.dataset.index)); return; }
    const incBtn = e.target.closest('[data-action="cart-increase"]'); if (incBtn) { changeQty(parseInt(incBtn.dataset.index), 1); return; }
    const decBtn = e.target.closest('[data-action="cart-decrease"]'); if (decBtn) { changeQty(parseInt(decBtn.dataset.index), -1); return; }
    const recCard = e.target.closest('.rec-card'); if (recCard) { openProductModal(parseInt(recCard.dataset.productId)); return; }
    const catCard = e.target.closest('.category-card'); if (catCard) { trackViewedItem(catCard.dataset.category); applyFilter(catCard.dataset.category); switchView('home'); return; }
    const card = e.target.closest('.product-card');
    if (card && !e.target.closest('.product-card-add') && !e.target.closest('.fav-icon') && !e.target.closest('.product-edit-btn')) openProductModal(parseInt(card.dataset.productId));
});

document.getElementById('modalCloseBtn').addEventListener('click', () => { if (state.modalOpen) closeProductModal(); });

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.search) switchToSearchView(state.searchViewState.query);
    else if (state.modalOpen) closeProductModal();
});

document.getElementById('modalSourcingBtn').addEventListener('click', () => window.open(`https://wa.me/242066271882?text=${encodeURIComponent("Bonjour NRJ Marketplace, je recherche un produit. Je vous envoie une photo juste après 📸")}`, '_blank'));
document.getElementById('modalDescSourcingBtn').addEventListener('click', () => window.open(`https://wa.me/242066271882?text=${encodeURIComponent("Bonjour NRJ Marketplace International, je recherche un produit spécifique...")}`, '_blank'));

document.getElementById('cartCloseBtn')?.addEventListener('click', () => {
    document.getElementById('cartPanel').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('open');
});
document.getElementById('cartOverlay').addEventListener('click', () => {
    document.getElementById('cartPanel').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('open');
});
document.getElementById('checkoutBtn').addEventListener('click', openOrderModal);
document.getElementById('sendWhatsAppBtn').addEventListener('click', sendWhatsAppOrder);
document.getElementById('cancelOrderBtn').addEventListener('click', () => document.getElementById('orderModalOverlay').classList.remove('open'));

document.getElementById('saveEditBtn').addEventListener('click', updateProduct);
document.getElementById('cancelEditBtn').addEventListener('click', () => document.getElementById('editProductModalOverlay').classList.remove('open'));

document.getElementById('backToHomeBtn').addEventListener('click', () => switchView('home'));

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const nav = this.dataset.nav;

    if (nav === 'home') {
        if (state.modalOpen) closeProductModal();
        if (document.getElementById('searchView').style.display === 'flex') switchFromSearchView();
        switchView('home');
        state.currentFilter = 'all';
        state.currentQuickFilter = 'all';
        state.searchQuery = '';
        const inp = document.getElementById('searchInput');
        if (inp) { inp.value = ''; inp.placeholder = state.rotationList[0]; }
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.filter-btn[data-category="all"]')?.classList.add('active');
        refreshCatalogue();
        hideSearchDropdown();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (nav === 'categories') {
        if (document.getElementById('searchView').style.display === 'flex') switchFromSearchView();
        switchView('categories');
        window.scrollTo(0, 0);
    }
    if (nav === 'cart') {
        document.getElementById('cartPanel').classList.add('open');
        document.getElementById('cartOverlay').classList.add('open');
        refreshCartDisplay();
    }
    if (nav === 'favorites') {
        if (document.getElementById('searchView').style.display === 'flex') switchFromSearchView();
        switchView('home');
        state.currentFilter = 'favorites';
        refreshCatalogue();
        window.scrollTo(0, 0);
    }
    if (nav === 'profile') {
        window.location.href = 'admin.html';
    }
}));

async function init() {
    await fetchProducts();
    const cats = [...new Set(state.products.map(p => removeEmojis(p.category)))];
    let html = `<button class="filter-btn active" data-category="all">Tout voir <span class="filter-count">(${state.products.length})</span></button>`;
    cats.forEach(c => html += `<button class="filter-btn" data-category="${escapeHtml(c)}">${escapeHtml(c)} <span class="filter-count">(${state.products.filter(p => p.category === c).length})</span></button>`);
    document.getElementById('filterBar').innerHTML = html;

    initPlaceholderRotation();
    initVoiceSearch();
    initSmartHeader();
    refreshCatalogue();
    refreshCartDisplay();
    updateNavFavBadge();

    // Session admin : uniquement pour afficher le bouton "modifier" sur les cartes,
    // toute la gestion (login, ajout produit) vit désormais dans admin.html
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        state.isAdminLoggedIn = true;
        refreshCatalogue();
    }

    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    const idParam = urlParams.get('id');

    if (searchParam) {
        switchToSearchView(searchParam);
    } else if (idParam) {
        const p = state.products.find(pr => pr.id === parseInt(idParam));
        if (p) openProductModal(parseInt(idParam));
    }
}

init();
