// ═══ App — helpers de vue (nav active, fermetures panneau) ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
import { switchFromSearchView } from '../search/search-view.js';
import { hideAccountView } from './account-view.js';

export function isFlexOpen(id) {
  const n = document.getElementById(id);
  return !!(n && n.style.display === 'flex');
}

export function closeSearchAndAccount() {
  if (isFlexOpen('searchView')) switchFromSearchView();
  if (isFlexOpen('accountView')) hideAccountView();
}

export function closeCartPanel() {
  document.getElementById('cartPanel')?.classList.remove('open');
  document.getElementById('cartOverlay')?.classList.remove('open');
}

export function markNavActive(navTarget) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-nav="${navTarget}"]`)?.classList.add('active');
}
