// ═══ App — espace compte client (vue plein écran) ═══
// Éclaté de main.js (refacto-archi) — logique strictement identique.
import { state, saveCart, saveFavorites, saveOrders } from '../../core/state.js';
import { escapeHtml } from '../../utils/escape-html.js';
import { formatPrice } from '../../utils/format.js';
import { showToast } from '../../utils/dom-helpers.js';
import { refreshCatalogue } from '../catalogue/catalogue-init.js';
import { clearSubcategorySelection } from '../catalogue/category-bubbles.js';
import { refreshCartDisplay } from '../../services/cart-panel.js';
import { updateNavCartBadge } from '../../services/cart-badge.js';
import { updateNavFavBadge } from '../../services/favorites.js';
import { showSearchDropdown } from '../../services/search-dropdown.js';
import { markNavActive } from './view-helpers.js';
import { applyTheme } from './theme.js';

export function showAccountView() {
  const av = document.getElementById('accountView');
  const wrap = document.getElementById('catalogueWrapper');
  if (!av || !wrap) return;
  wrap.style.display = 'none';
  av.style.display = 'flex';
  renderAccount();
  window.scrollTo(0, 0);
  markNavActive('profile');
}

export function hideAccountView() {
  const av = document.getElementById('accountView');
  if (av) av.style.display = 'none';
  const wrap = document.getElementById('catalogueWrapper');
  if (wrap) wrap.style.display = 'block';
}

function renderAccount() {
  const root = document.getElementById('accountContent');
  if (!root) return;

  const name = localStorage.getItem('fluo_customer_name') || '';
  const initials = name ? name.split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() : '?';
  const greeting = name ? `Bonjour, ${escapeHtml(name.split(/\s+/)[0])}` : 'Bienvenue';
  const isAdmin = state.isAdminLoggedIn === true;
  const isLightTheme = document.documentElement.classList.contains('light-theme');

  const favCount = state.favorites.length;
  const cartCount = state.cart.reduce((s, i) => s + Number(i.quantity), 0);
  const orders = state.orders || [];
  const orderCount = orders.length;

  let ordersHtml = '';
  if (orders.length === 0) {
    ordersHtml = `<div class="account-empty">Aucune commande envoyée pour l'instant.</div>`;
  } else {
    ordersHtml = orders.slice(0, 10).map(o => {
      const date = new Date(o.date);
      const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const itemsPreview = (o.items || []).slice(0, 3).map(it => `${escapeHtml(it.name)} x${it.qty}`).join(' · ');
      const more = (o.items || []).length > 3 ? ` · +${o.items.length - 3}` : '';
      return `<div class="account-order">
        <div class="account-order-head">
          <span class="account-order-date">📦 ${dateStr} · ${timeStr}</span>
          <span class="account-order-total">${formatPrice(o.total)}</span>
        </div>
        <div class="account-order-items">${itemsPreview}${more}</div>
        <div class="account-order-meta">Destinataire WhatsApp : ${escapeHtml(o.recipient || '')}</div>
      </div>`;
    }).join('');
  }

  root.innerHTML = `
    <div class="account-header">
      <button class="account-back" data-account-action="close" aria-label="Retour">←</button>
      <div class="account-identity">
        <div class="account-avatar">${escapeHtml(initials)}</div>
        <div class="account-greet">
          <div class="account-greet-hello">${greeting}</div>
          <div class="account-greet-sub">Voici votre espace NRJ</div>
        </div>
      </div>
      ${isAdmin ? '<span class="account-admin-badge">Admin</span>' : ''}
    </div>

    <div class="account-stats">
      <div class="account-stat">
        <div class="account-stat-label">Favoris</div>
        <div class="account-stat-value">❤️ ${favCount}</div>
      </div>
      <div class="account-stat">
        <div class="account-stat-label">Au panier</div>
        <div class="account-stat-value">🛒 ${cartCount}</div>
      </div>
      <div class="account-stat">
        <div class="account-stat-label">Commandes</div>
        <div class="account-stat-value">📦 ${orderCount}</div>
      </div>
    </div>

    <div class="account-section">
      <div class="account-section-title">Mes achats</div>
      <div class="account-menu">
        <button class="account-menu-item" data-account-action="go-cart">
          <span>🛒 Mon panier</span>
          <span class="account-menu-meta">${cartCount}</span>
        </button>
        <button class="account-menu-item" data-account-action="go-favs">
          <span>❤️ Mes favoris</span>
          <span class="account-menu-meta">${favCount}</span>
        </button>
        <button class="account-menu-item" data-account-action="go-history">
          <span>🕐 Recherches récentes</span>
          <span class="account-menu-meta">→</span>
        </button>
      </div>
    </div>

    <div class="account-section">
      <div class="account-section-title">Mes commandes envoyées</div>
      ${ordersHtml}
    </div>

    <div class="account-section">
      <div class="account-section-title">Avantages</div>
      <div class="account-menu">
        <button class="account-menu-item" data-account-action="install-app">
          <span>⚡ Installer l'application</span>
          <span class="account-menu-meta">→</span>
        </button>
        <button class="account-menu-item" data-account-action="go-new">
          <span>✨ Nouveautés</span>
          <span class="account-menu-meta">→</span>
        </button>
        <button class="account-menu-item" data-account-action="contact">
          <span>💬 Assistance WhatsApp</span>
          <span class="account-menu-meta">→</span>
        </button>
      </div>
    </div>

    <div class="account-section">
      <div class="account-section-title">Préférences</div>
      <div class="account-menu">
        <button class="account-menu-item" data-account-action="toggle-theme">
          <span>🎨 Thème</span>
          <span class="account-menu-meta" id="accountThemeMeta">${isLightTheme ? '☀️ Clair' : '🌙 Sombre'}</span>
        </button>
      </div>
    </div>

    <div class="account-section">
      <div class="account-section-title">Données</div>
      <div class="account-menu">
        <button class="account-menu-item danger" data-account-action="clear-all">
          <span>🧹 Effacer toutes mes données</span>
          <span class="account-menu-meta">→</span>
        </button>
      </div>
    </div>

    ${isAdmin ? `<div class="account-section">
      <div class="account-section-title">Vendeur</div>
      <div class="account-menu">
        <button class="account-menu-item" data-account-action="go-admin">
          <span>🛠️ Espace vendeur</span>
          <span class="account-menu-meta">→</span>
        </button>
      </div>
    </div>` : ''}
  `;
}

window.renderAccount = renderAccount;

export function handleAccountAction(action) {
  switch (action) {
    case 'close': {
      hideAccountView();
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelector('.nav-item[data-nav="home"]')?.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;
    }
    case 'go-cart': {
      hideAccountView();
      document.getElementById('cartPanel').classList.add('open');
      document.getElementById('cartOverlay').classList.add('open');
      refreshCartDisplay();
      break;
    }
    case 'go-favs': {
      hideAccountView();
      state.currentFilter = 'favorites';
      clearSubcategorySelection();
      refreshCatalogue();
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelector('.nav-item[data-nav="favorites"]')?.classList.add('active');
      window.scrollTo(0, 0);
      break;
    }
    case 'go-history': {
      hideAccountView();
      document.getElementById('searchInput').focus();
      showSearchDropdown('');
      break;
    }
    case 'toggle-theme': {
      const currentTheme = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
      localStorage.setItem('nrj_theme', newTheme);
      const themeMeta = document.getElementById('accountThemeMeta');
      if (themeMeta) themeMeta.textContent = newTheme === 'light' ? '☀️ Clair' : '🌙 Sombre';
      break;
    }
    case 'go-new': {
      hideAccountView();
      document.querySelector('.filter-chip[data-filter="new"]')?.click();
      window.scrollTo(0, 0);
      break;
    }
    case 'contact': {
      window.open(`https://wa.me/242066271882?text=${encodeURIComponent("Bonjour NRJ Marketplace, j'ai besoin d'assistance 🙏")}`, '_blank');
      break;
    }
    case 'install-app': {
      if (window.deferredInstallPrompt) {
        window.deferredInstallPrompt.prompt();
      } else {
        alert("Pour installer l'app NRJ :\n\n• Chrome Android : menu ⋮ → « Installer l'application »\n• iOS Safari : bouton Partager → « Sur l'écran d'accueil »");
      }
      break;
    }
    case 'clear-all': {
      if (!confirm('Effacer vos favoris, votre panier, votre historique de recherches et de commandes ? Cette action est définitive.')) return;
      try {
        localStorage.removeItem('nrj_favorites');
        localStorage.removeItem('nrj_cart');
        localStorage.removeItem('nrj_cart_v32');
        localStorage.removeItem('nrj_search_history');
        localStorage.removeItem('nrj_orders');
        localStorage.removeItem('fluo_customer_name');
        localStorage.removeItem('nrj_affinity');
      } catch {}
      state.favorites = [];
      state.cart = [];
      state.orders = [];
      saveCart();
      saveFavorites();
      saveOrders();
      updateNavFavBadge();
      updateNavCartBadge();
      refreshCartDisplay();
      renderAccount();
      showToast('🧹 Données effacées');
      break;
    }
    case 'go-admin': {
      window.location.href = 'admin.html';
      break;
    }
  }
}
