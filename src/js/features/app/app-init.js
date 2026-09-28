// ═══ App — initialisation (orchestrateur) ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
import { state, loadPersistedState } from '../../core/state.js';
import { supabaseClient } from '../../core/config.js';
import { escapeHtml } from '../../utils/escape-html.js';
import { showToast } from '../../utils/dom-helpers.js';
import { fetchProducts, fetchCategories } from '../../api/api.js';
import { refreshCatalogue } from '../catalogue/catalogue-init.js';
import { loadOrders } from '../../services/cart-storage.js';
import { refreshCartDisplay } from '../../services/cart-panel.js';
import { initCartMenu } from '../../services/cart-menu.js';
import { initQtySheet } from '../../services/cart-qty-picker.js';
import { updateNavFavBadge } from '../../services/favorites.js';
import { initPlaceholderRotation } from '../../services/search-rotation.js';
import { initVoiceSearch } from '../../services/search-voice.js';
import { initChat } from '../chat/chat-ui.js';
import { setupAutoSync } from '../../services/sync.js';
import { openProductModal } from '../product/modal-render.js';
import { switchToSearchView } from '../search/search-view.js';
import { initThemeToggle } from './theme.js';
import { initSmartHeader, initHeaderSearchCompact } from './smart-header.js';
import { initHeaderActionsBubble } from './header-actions.js';
import { initServiceWorkerUpdates, initOfflineIndicator, precacheCatalogueImages } from './offline.js';
import { initLogoLongPress } from './logo-press.js';
import { initSwipeCategories } from './swipe-nav.js';
import { buildFilterBar } from './filter-bar.js';

async function init() {
  try {
    await loadPersistedState();
    await fetchCategories();
    await fetchProducts();
    loadOrders();

    buildFilterBar();

    initPlaceholderRotation();
    initVoiceSearch();
    initSmartHeader();
    initHeaderSearchCompact();
    initHeaderActionsBubble();
    initLogoLongPress();
    initThemeToggle();
    initOfflineIndicator();
    initChat();
    initServiceWorkerUpdates();
    
    initSwipeCategories();
    
    refreshCatalogue();
    precacheCatalogueImages();
    refreshCartDisplay();
    updateNavFavBadge();
    setupAutoSync();

    const { data: { session } } = await supabaseClient.auth.getSession();
    // Admin = compte marqué role 'admin' (app_metadata). Les visiteurs du chat
    // (sessions anonymes) et d'éventuels comptes créés ne sont PAS admin.
    const user = session?.user;
    if (user && user.app_metadata?.role === 'admin') {
      state.isAdminLoggedIn = true;
      refreshCatalogue();
    }

    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    const idParam = urlParams.get('id');

    if (searchParam) {
      switchToSearchView(searchParam);
    } else if (idParam) {
      const p = state.products.find(pr => pr.id === parseInt(idParam));
      if (p) openProductModal(parseInt(idParam));
    }
  } catch (err) {
    console.error('Erreur initiale:', err);
    showToast('⚠️ Erreur de chargement. Veuillez réessayer.');
  }
}

// Boot du panier (historiquement dans cart.js à l'éval du module) :
// ce module est importé depuis l'entry après tous les modules services/,
// donc initCartMenu/initQtySheet peuvent être appelés sans TDZ.
initCartMenu();
initQtySheet();

init().catch(err => {
  console.error('Init échoué:', err);
  showToast("⚠️ Erreur critique. Relancez l'application.");
});
