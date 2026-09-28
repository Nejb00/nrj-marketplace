// ═══ Catalogue — orchestrateur : refresh complet de la grille ═══
// Éclaté de catalogue.js (refacto-archi) — logique strictement identique.
import { state } from '../../core/state.js';
import { renderInitialProducts } from './render-grid.js';
import { setupObserver } from './pagination.js';

export function refreshCatalogue() {
    if (state.scrollObserver) { state.scrollObserver.disconnect(); state.scrollObserver = null; }
    renderInitialProducts();
    setupObserver();
}
