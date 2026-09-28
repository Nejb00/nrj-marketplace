// ═══ App — délégation de clics globale + nav + boutons statiques ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
// Side-effects au chargement, ordre historique préservé (lignes 639→746
// de l'ancien main.js).
import { state, getCategoryName, trackViewedItem } from '../../core/state.js';
import { applyFilter, clearSubcategorySelection } from '../catalogue/category-bubbles.js';
import { switchView } from '../catalogue/categories-page.js';
import { refreshCatalogue } from '../catalogue/catalogue-init.js';
import { addToCart, changeQty, removeCartItem } from '../../services/cart-actions.js';
import { toggleFavorite } from '../../services/favorites.js';
import { openOrderModal, sendWhatsAppOrder } from '../../services/checkout.js';
import { openProductModal, closeProductModal } from '../product/modal-render.js';
import { openEditModal } from '../product/product-edit-form.js';
import { updateProduct } from '../product/product-edit-save.js';
import { hideSearchDropdown } from '../../services/search-dropdown.js';
import { showAccountView, hideAccountView, handleAccountAction } from './account-view.js';
import { isFlexOpen } from './view-helpers.js';
import { switchToSearchView, switchFromSearchView } from '../search/search-view.js';

document.addEventListener('click', e => {
  const fb = e.target.closest('.filter-btn'); if (fb) { applyFilter(fb.dataset.category); return; }
  const subBubble = e.target.closest('.subcat-bubble');
  if (subBubble) {
    const subId = subBubble.dataset.subcategoryId;
    if (subId) applyFilter(subId);
    return;
  }
  const addBtn = e.target.closest('[data-action="add-to-cart"]'); if (addBtn) { e.stopPropagation(); addToCart(parseInt(addBtn.dataset.id), '', '', addBtn); return; }
  const favBtn = e.target.closest('[data-action="toggle-favorite"]'); if (favBtn) { e.stopPropagation(); toggleFavorite(parseInt(favBtn.dataset.id)); return; }
  const editBtn = e.target.closest('[data-action="edit-product"]'); if (editBtn) { e.stopPropagation(); openEditModal(parseInt(editBtn.dataset.id)); return; }
  const removeBtn = e.target.closest('[data-action="cart-remove"]'); if (removeBtn) { e.stopPropagation(); removeCartItem(parseInt(removeBtn.dataset.index)); return; }
  const incBtn = e.target.closest('[data-action="cart-increase"]'); if (incBtn) { changeQty(parseInt(incBtn.dataset.index), 1); return; }
  const decBtn = e.target.closest('[data-action="cart-decrease"]'); if (decBtn) { changeQty(parseInt(decBtn.dataset.index), -1); return; }
  const recCard = e.target.closest('.rec-card'); if (recCard) { openProductModal(parseInt(recCard.dataset.productId)); return; }
  const catCard = e.target.closest('.category-card'); if (catCard) {
    const catId = catCard.dataset.category;
    const label = getCategoryName(catId) || catId;
    trackViewedItem(label);
    applyFilter(catId);
    switchView('home');
    return;
  }
  const acctAction = e.target.closest('[data-account-action]');
  if (acctAction) { handleAccountAction(acctAction.dataset.accountAction); return; }
  const card = e.target.closest('.product-card');
  if (card && !e.target.closest('.product-card-add') && !e.target.closest('.fav-icon') && !e.target.closest('.product-edit-btn')) openProductModal(parseInt(card.dataset.productId));
});

document.getElementById('modalCloseBtn')?.addEventListener('click', () => { if (state.modalOpen) closeProductModal(); });

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.search) switchToSearchView(state.searchViewState.query);
  else if (state.modalOpen) closeProductModal();
});

document.getElementById('modalSourcingBtn')?.addEventListener('click', () => window.open(`https://wa.me/242066271882?text=${encodeURIComponent('Bonjour NRJ Marketplace, je recherche un produit. Je peux vous envoyer une photo')}`));
document.getElementById('modalDescSourcingBtn')?.addEventListener('click', () => window.open(`https://wa.me/242066271882?text=${encodeURIComponent('Bonjour NRJ Marketplace, je recherche un produit spécifique...')}`));

document.getElementById('cartCloseBtn')?.addEventListener('click', () => {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
});
document.getElementById('cartOverlay')?.addEventListener('click', () => {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
});
document.getElementById('checkoutBtn')?.addEventListener('click', openOrderModal);
document.getElementById('sendWhatsAppBtn')?.addEventListener('click', sendWhatsAppOrder);
document.getElementById('cancelOrderBtn')?.addEventListener('click', () => document.getElementById('orderModalOverlay').classList.remove('open'));

document.getElementById('saveEditBtn')?.addEventListener('click', updateProduct);
document.getElementById('cancelEditBtn')?.addEventListener('click', () => document.getElementById('editProductModalOverlay').classList.remove('open'));

document.getElementById('backToHomeBtn')?.addEventListener('click', () => switchView('home'));

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', function(e) {
  e.preventDefault();
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  this.classList.add('active');
  const nav = this.dataset.nav;

  if (nav === 'home') {
    if (state.modalOpen) closeProductModal();
    if (isFlexOpen('searchView')) switchFromSearchView();
    if (isFlexOpen('accountView')) hideAccountView();
    switchView('home');
    state.currentFilter = 'all';
    state.currentQuickFilter = 'all';
    state.searchQuery = '';
    clearSubcategorySelection();
    const inp = document.getElementById('searchInput');
    if (inp) { 
      inp.value = ''; 
      inp.placeholder = (state.rotationList && state.rotationList[0]) ? state.rotationList[0] : 'Rechercher...'; 
    }
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-category="all"]')?.classList.add('active');
    refreshCatalogue();
    hideSearchDropdown();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (nav === 'categories') {
    if (isFlexOpen('searchView')) switchFromSearchView();
    if (isFlexOpen('accountView')) hideAccountView();
    switchView('categories');
    window.scrollTo(0, 0);
  }
  if (nav === 'cart') {
    document.getElementById('cartPanel')?.classList.add('open');
    document.getElementById('cartOverlay')?.classList.add('open');
    refreshCartDisplay();
  }
  if (nav === 'favorites') {
    if (isFlexOpen('searchView')) switchFromSearchView();
    if (isFlexOpen('accountView')) hideAccountView();
    switchView('home');
    state.currentFilter = 'favorites';
    clearSubcategorySelection();
    refreshCatalogue();
    window.scrollTo(0, 0);
  }
  if (nav === 'profile') {
    showAccountView();
  }
}));
