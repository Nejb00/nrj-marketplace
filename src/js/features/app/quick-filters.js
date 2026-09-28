// ═══ App — chips de filtres rapides (Nouveau / Best / Pour toi) ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
// Side-effect au chargement (bindings), comme dans main.js historique.
import { state } from '../../core/state.js';
import { refreshCatalogue } from '../catalogue/catalogue-init.js';

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', function() {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    state.currentQuickFilter = this.dataset.filter;
    refreshCatalogue();
  });
});
