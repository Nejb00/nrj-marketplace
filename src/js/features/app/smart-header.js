// ═══ App — header Temu fixe en 2 couches ═══
// Couche 1 : recherche pleine largeur, toujours visible (plus de repli compact).
// Couche 2 : catégories parentes (#filterBar), collée sous la recherche.
// PROMPT 3B : #subcategoryBubbles est un enfant ABSOLU de #headerFixed
// (top:100%, hors flux) → il ne change PAS la hauteur du header. Le spacer =
// hauteur du header + hauteur de la rangée bulles quand elle n'est pas hidden ;
// il NE change PAS quand la rangée se replie (repli = transform/opacity seuls).
// Les handlers des bulles retirées (logo ☰ 👤 🛒 / loupe compacte) sont conservés
// mais null-safe : ils ne plantent plus si les éléments n'existent plus.

import { switchToSearchView } from '../search/search-view.js';

export function initSmartHeader() {
  const fixed = document.getElementById('headerFixed');
  const spacer = document.getElementById('headerSpacer');
  if (!fixed || !spacer) return;

  const bubblesRow = () => document.getElementById('subcategoryBubbles');

  // Synchronise le spacer (et la variable CSS --header-height) sur la hauteur réelle.
  function syncHeaderHeight() {
    const h = fixed.offsetHeight;
    document.documentElement.style.setProperty('--header-height', h + 'px');
    // Spacer = header + rangée bulles (seulement si elle est affichée ;
    // l'état replié — .is-collapsed — ne change RIEN au spacer).
    let total = h;
    const row = bubblesRow();
    if (row && !row.hidden) total += row.offsetHeight;
    spacer.style.height = total + 'px';
  }

  // Plus de --sp : le header ne se replie pas, il reste fixe en 2 couches.
  fixed.style.setProperty('--sp', 0);

  if ('ResizeObserver' in window) {
    new ResizeObserver(syncHeaderHeight).observe(fixed);
    // La hauteur des bulles peut varier (rendu async, wrappement) : on observe
    // aussi la rangée pour garder le spacer exact.
    const row = bubblesRow();
    if (row) new ResizeObserver(syncHeaderHeight).observe(row);
  }
  window.addEventListener('resize', syncHeaderHeight);
  // Rendu async des bulles (fetch sous-catégories) : re-sync à chaque mutation
  // (hidden toggled,innerHTML rempli).
  const row0 = bubblesRow();
  if (row0) {
    new MutationObserver(syncHeaderHeight).observe(row0, {
      attributes: true, attributeFilter: ['hidden'], childList: true,
    });
  }
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
