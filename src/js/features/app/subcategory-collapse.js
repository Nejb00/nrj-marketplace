// ═══ Header Temu — PROMPT 3B : bulles enfants attachées au header ═══
// #subcategoryBubbles est DANS #headerFixed, en position:absolute; top:100%
// (hors de la hauteur du header). Scroll vers le bas (seuil ~8 px) → la rangée
// se replie via transform:translateY(-100%) + opacity:0 UNIQUEMENT (transition
// 200 ms via .is-collapsed dans filters.css) — aucun changement de hauteur ni
// de layout, donc pas de sauts de scroll ni de boucle repli/ré-affichage.
// Scroll vers le haut, même de quelques pixels (dès 1 px) → elle se ré-affiche.
// - Listener passif + requestAnimationFrame (one-shot).
// - No-op total si la rangée est hidden (aucune sous-catégorie affichée).
// - prefers-reduced-motion : le CSS met la transition à 0 s ; ici on ajoute
//   .no-collapse-motion pour couper translateY/opacity (repliage instantané).
// - resetSubcategoryCollapse() : remis à l'état déplié (appelé par
//   category-bubbles.js à chaque changement de catégorie).

const DOWN_THRESHOLD = 8;  // px vers le bas avant de replier
const UP_THRESHOLD = 1;    // px vers le haut suffisent pour ré-afficher

let collapseRow = null;
let collapseState = { collapsed: false, lastY: 0 };

export function resetSubcategoryCollapse() {
  collapseState.collapsed = false;
  collapseState.lastY = window.scrollY;
  if (!collapseRow || collapseRow.hidden) return;
  collapseRow.classList.remove('is-collapsed', 'no-collapse-motion');
}

export function initSubcategoryCollapse() {
  const row = document.getElementById('subcategoryBubbles');
  if (!row) return;
  collapseRow = row;

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
        collapseState.collapsed = true;
        collapseState.lastY = y;
        applyState();
        lastY = y;
      } else if (delta <= -UP_THRESHOLD && collapsed) {
        collapsed = false;         // haut (≥1 px) → ré-affichée
        collapseState.collapsed = false;
        collapseState.lastY = y;
        applyState();
        lastY = y;
      } else if (Math.abs(delta) >= DOWN_THRESHOLD) {
        lastY = y;                 // même sens : recalage de la référence
        collapseState.lastY = y;
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
      collapseState.collapsed = false;
      collapseState.lastY = lastY;
      applyState();
    }
  }, { passive: true });

  // Si la rangée redevient visible (changement de catégorie parente),
  // on repart d'un état déplié (resetSubcategoryCollapse est aussi appelé
  // directement par category-bubbles.js à chaque changement de filtre).
  new MutationObserver(() => {
    if (!row.hidden) {
      collapsed = false;
      lastY = window.scrollY;
      collapseState.collapsed = false;
      collapseState.lastY = lastY;
      applyState();
    }
  }).observe(row, { attributes: true, attributeFilter: ['hidden'] });
}
