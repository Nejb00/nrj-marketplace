// ═══ App — long-press logo → espace admin ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
export function initLogoLongPress() {
  const logo = document.querySelector('.logo-bubble');
  if (!logo) return;

  logo.style.webkitUserSelect = 'none';
  logo.style.userSelect = 'none';
  logo.style.webkitTouchCallout = 'none';

  let pressTimer = null;
  let moved = false;
  const LONG_PRESS_DURATION = 800;

  function startPress() {
    moved = false;
    pressTimer = setTimeout(() => {
      if (!moved) {
        logo.style.transform = 'scale(0.95)';
        logo.style.opacity = '0.8';
        setTimeout(() => {
          logo.style.transform = '';
          logo.style.opacity = '';
          window.location.href = 'admin.html';
        }, 150);
      }
    }, LONG_PRESS_DURATION);
  }

  function cancelPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    logo.style.transform = '';
    logo.style.opacity = '';
  }

  function markMoved() { moved = true; cancelPress(); }

  logo.addEventListener('pointerdown', (e) => { e.preventDefault(); startPress(); });
  logo.addEventListener('pointerup', cancelPress);
  logo.addEventListener('pointercancel', cancelPress);
  logo.addEventListener('pointermove', markMoved);
  logo.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
  logo.addEventListener('touchstart', (e) => { e.preventDefault(); startPress(); }, { passive: false });
  logo.addEventListener('touchend', cancelPress);
  logo.addEventListener('touchmove', markMoved);
  logo.addEventListener('touchcancel', cancelPress);
}
