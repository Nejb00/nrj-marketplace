// ═══ App — helpers de vue (nav active, fermetures panneau) ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
import { switchFromSearchView } from '../search/search-view.js';
import { hideAccountView } from './account-view.js';
import { openCartPanel as openCartPanelService, closeCartPanel as closeCartPanelService } from '../../services/cart-panel.js';

export function isFlexOpen(id) {
  const n = document.getElementById(id);
  return !!(n && n.style.display === 'flex');
}

export function closeSearchAndAccount() {
  if (isFlexOpen('searchView')) switchFromSearchView();
  if (isFlexOpen('accountView')) hideAccountView();
}

export function openCartPanel(trigger) {
  openCartPanelService(trigger);
}

export function closeCartPanel() {
  closeCartPanelService({ restoreFocus: false });
}

export function markNavActive(navTarget) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-nav="${navTarget}"]`)?.classList.add('active');
}
