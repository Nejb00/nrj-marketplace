// ═══ App — actions du header (catégories, profil, panier, badges) ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { switchView } from '../catalogue/categories-page.js';
import { closeProductModal } from '../product/modal-render.js';
import { refreshCartDisplay } from '../../services/cart-panel.js';
import { showAccountView } from './account-view.js';
import { isFlexOpen, closeSearchAndAccount, closeCartPanel, markNavActive } from './view-helpers.js';
import { switchFromSearchView } from '../search/search-view.js';

export function openHeaderCategories() {
  closeSearchAndAccount();
  closeCartPanel();
  if (state.modalOpen) closeProductModal();
  switchView('categories');
  markNavActive('categories');
  window.scrollTo(0, 0);
}

export function openHeaderProfile() {
  if (isFlexOpen('searchView')) switchFromSearchView();
  closeCartPanel();
  if (state.modalOpen) closeProductModal();
  showAccountView();
}

export function openHeaderCart() {
  document.getElementById('cartPanel')?.classList.add('open');
  document.getElementById('cartOverlay')?.classList.add('open');
  refreshCartDisplay();
}

export function initHeaderActionsBubble() {
  document.getElementById('catalogBtnHeader')?.addEventListener('click', openHeaderCategories);
  document.getElementById('profileBtnHeader')?.addEventListener('click', openHeaderProfile);
  document.getElementById('cartBtnHeader')?.addEventListener('click', openHeaderCart);

  const navBadge = document.getElementById('navCartBadge');
  const headerBadge = document.getElementById('headerCartBadge');
  if (navBadge && headerBadge) {
    const syncBadge = () => {
      headerBadge.textContent = navBadge.textContent;
      headerBadge.style.display = navBadge.style.display;
    };
    syncBadge();
    new MutationObserver(syncBadge).observe(navBadge, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['style'] });
  }
}
