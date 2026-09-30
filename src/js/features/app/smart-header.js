// ═══ App — header Temu fixe en 2 couches ═══
// Couche 1 : recherche pleine largeur, toujours visible (plus de repli compact).
// Couche 2 : catégories parentes (#filterBar), collée sous la recherche.
// Le #headerSpacer suit la hauteur RÉELLE du header : variable CSS + ResizeObserver.
// Les handlers des bulles retirées (logo ☰ 👤 🛒 / loupe compacte) sont conservés
// mais null-safe : ils ne plantent plus si les éléments n'existent plus.

import { switchToSearchView } from '../search/search-view.js';

export function initSmartHeader() {
  const fixed = document.getElementById('headerFixed');
  const spacer = document.getElementById('headerSpacer');
  if (!fixed || !spacer) return;

  // Synchronise le spacer (et la variable CSS --header-height) sur la hauteur réelle.
  function syncHeaderHeight() {
    const h = fixed.offsetHeight;
    document.documentElement.style.setProperty('--header-height', h + 'px');
    spacer.style.height = h + 'px';
  }

  // Plus de --sp : le header ne se replie pas, il reste fixe en 2 couches.
  fixed.style.setProperty('--sp', 0);

  if ('ResizeObserver' in window) {
    new ResizeObserver(syncHeaderHeight).observe(fixed);
  }
  window.addEventListener('resize', syncHeaderHeight);
  // Scroll : seule la rangée enfant (#subcategoryBubbles) se masque — voir
  // subcategory-collapse.js. Ici on garde uniquement le bouton « retour en haut ».
  window.addEventListener('scroll', () => {
    const btn = document.getElementById('scrollToTopBtn');
    if (btn) btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });

  syncHeaderHeight();
}

// Legacy : la loupe compacte n'existe plus dans le header Temu.
// Handler conservé mais null-safe (no-op si l'élément est absent).
export function initHeaderSearchCompact() {
  const searchCompact = document.getElementById('searchCompact');
  if (!searchCompact) return;
  searchCompact.addEventListener('click', () => {
    switchToSearchView('');
  });
}
