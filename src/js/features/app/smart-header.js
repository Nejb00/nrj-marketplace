// ═══ App — header intelligent (compact au scroll) ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
import { switchToSearchView } from '../search/search-view.js';

export function initSmartHeader() {
  const fixed = document.getElementById('headerFixed');
  const spacer = document.getElementById('headerSpacer');
  const searchCompact = document.getElementById('searchCompact');
  if (!fixed || !spacer) return;

  const THRESHOLD = 90;
  let ticking = false;

  function updateHeader() {
    const rawProgress = Math.min(1, Math.max(0, window.scrollY / THRESHOLD));
    const progress = 1 - Math.pow(1 - rawProgress, 3);
    
    fixed.style.setProperty('--sp', progress);
    if (searchCompact) searchCompact.classList.toggle('active', rawProgress > 0.92);
    spacer.style.height = fixed.offsetHeight + 'px';
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(updateHeader); ticking = true; }
  }, { passive: true });

  window.addEventListener('scroll', () => {
    const btn = document.getElementById('scrollToTopBtn');
    if (btn) btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });

  window.addEventListener('resize', () => { spacer.style.height = fixed.offsetHeight + 'px'; });
  updateHeader();
}

export function initHeaderSearchCompact() {
  const searchCompact = document.getElementById('searchCompact');
  if (!searchCompact) return;
  searchCompact.addEventListener('click', () => {
    if (!searchCompact.classList.contains('active')) return;
    switchToSearchView('');
  });
}
