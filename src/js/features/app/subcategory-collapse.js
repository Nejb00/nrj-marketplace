// ═══ Header Temu — étape B : bulles enfants qui se masquent au scroll ═══
// #subcategoryBubbles est hors du header fixe (dans le flux, sous les catégories
// parentes et au-dessus de la grille). Scroll vers le bas (seuil ~8 px) → la
// rangée se replie (translateY + opacity + hauteur → 0, transition ~200 ms via
// .is-collapsed dans filters.css). Scroll vers le haut, même de quelques pixels
// (dès 1 px) → elle se ré-affiche.
// - Listener passif + requestAnimationFrame (one-shot).
// - No-op total si la rangée est hidden (aucune sous-catégorie affichée).
// - prefers-reduced-motion : le CSS met la transition à 0 s ; ici on ajoute
//   .no-collapse-motion pour couper translateY/opacity (repliage instantané).

const DOWN_THRESHOLD = 8;  // px vers le bas avant de replier
const UP_THRESHOLD = 1;    // px vers le haut suffisent pour ré-afficher

export function initSubcategoryCollapse() {
  const row = document.getElementById('subcategoryBubbles');
  if (!row) return;

  let lastY = window.scrollY;
  let collapsed = false;
  let ticking = false;

  const reducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function applyState() {
    // Rangée cachée (pas de sous-catégories) : ne rien faire.
    if (row.hidden) return;
    if (collapsed) {
      row.classList.add('is-collapsed');
      if (reducedMotion()) row.classList.add('no-collapse-motion');
      else row.classList.remove('no-collapse-motion');
    } else {
      row.classList.remove('is-collapsed', 'no-collapse-motion');
    }
  }

  function onScrollFrame() {
    const y = window.scrollY;
    const delta = y - lastY;
    if (!row.hidden) {
      if (delta >= DOWN_THRESHOLD && !collapsed) {
        collapsed = true;          // bas (>8 px) → repliée
        applyState();
        lastY = y;
      } else if (delta <= -UP_THRESHOLD && collapsed) {
        collapsed = false;         // haut (≥1 px) → ré-affichée
        applyState();
        lastY = y;
      } else if (Math.abs(delta) >= DOWN_THRESHOLD) {
        lastY = y;                 // même sens : recalage de la référence
      }
    }
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScrollFrame);
  }, { passive: true });

  // Top de page : toujours dépliée.
  window.addEventListener('scroll', () => {
    if (window.scrollY <= 0 && collapsed && !row.hidden) {
      collapsed = false;
      lastY = window.scrollY;
      applyState();
    }
  }, { passive: true });

  // Si la rangée redevient visible (changement de catégorie parente),
  // on repart d'un état déplié tant qu'on est près du sommet.
  new MutationObserver(() => {
    if (!row.hidden && window.scrollY < DOWN_THRESHOLD * 4) {
      collapsed = false;
      lastY = window.scrollY;
      applyState();
    }
  }).observe(row, { attributes: true, attributeFilter: ['hidden'] });
}
