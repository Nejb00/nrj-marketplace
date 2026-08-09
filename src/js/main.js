import '../css/main.css';
import { state } from './state.js';
import { supabaseClient } from './config.js';
import { escapeHtml, removeEmojis, formatPrice, showToast } from './utils.js';
import { fetchProducts } from './api.js';
import { trackViewedItem } from './state.js';
import { refreshCatalogue, applyFilter, switchView, renderCategories } from './catalogue.js';
import { addToCart, changeQty, removeCartItem, refreshCartDisplay, toggleFavorite, updateNavFavBadge, openOrderModal, sendWhatsAppOrder, loadOrders } from './cart.js';
import { openProductModal, closeProductModal } from './product-modal.js';
import { openEditModal, updateProduct } from './product-edit.js';
import { initPlaceholderRotation, initVoiceSearch, showSearchDropdown, hideSearchDropdown } from './search.js';
import { switchToSearchView, switchFromSearchView } from './search-view.js';

let searchDebounceTimer = null;

// ✅ SYSTÈME DE THÈME - Initialisation et gestion
function initThemeToggle() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (!themeToggleBtn) return;

  // Récupérer le thème sauvegardé ou utiliser la préférence système
  const savedTheme = localStorage.getItem('nrj_theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');

  applyTheme(initialTheme);

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    localStorage.setItem('nrj_theme', newTheme);
    showToast(newTheme === 'dark' ? '🌙 Mode sombre activé' : '☀️ Mode clair activé');
  });
}

function applyTheme(theme) {
  const html = document.documentElement;
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  if (theme === 'light') {
    html.classList.add('light-theme');
    if (themeToggleBtn) themeToggleBtn.textContent = '☀️';
  } else {
    html.classList.remove('light-theme');
    if (themeToggleBtn) themeToggleBtn.textContent = '🌙';
  }
}

function initSmartHeader() {
  const wrapper = document.getElementById('headerWrapper');
  const spacer = document.getElementById('headerSpacer');
  if (!wrapper || !spacer) return;

  const headerHeight = wrapper.offsetHeight;
  spacer.style.height = headerHeight + 'px';

  let lastScrollY = window.scrollY;
  let ticking = false;

  function updateHeader() {
    const currentScrollY = window.scrollY;
    if (currentScrollY <= 0) wrapper.classList.remove('hidden');
    else if (currentScrollY > lastScrollY && currentScrollY > headerHeight) wrapper.classList.add('hidden');
    else if (currentScrollY < lastScrollY) wrapper.classList.remove('hidden');
    lastScrollY = currentScrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(updateHeader); ticking = true; }
  }, { passive: true });

  window.addEventListener('resize', () => { spacer.style.height = wrapper.offsetHeight + 'px'; });
}

window.addEventListener('scroll', () => {
  const btn = document.getElementById('scrollToTopBtn');
  if (btn) btn.classList.toggle('visible', window.scrollY > 300);
}, { passive: true });

document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', function() {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    state.currentQuickFilter = this.dataset.filter;
    refreshCatalogue();
  });
});

const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

searchInput.addEventListener('input', function(e) {
  const v = e.target.value.trim();
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => showSearchDropdown(v), 300);
  state.searchQuery = v;
  refreshCatalogue();
});

searchInput.addEventListener('focus', function() { showSearchDropdown(this.value.trim()); });

searchInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const v = this.value.trim();
    if (v) { hideSearchDropdown(); switchToSearchView(v); }
  } else if (e.key === 'Escape') {
    hideSearchDropdown();
    this.blur();
  }
});

searchClear.addEventListener('click', function() {
  searchInput.value = '';
  state.searchQuery = '';
  hideSearchDropdown();
  refreshCatalogue();
  searchInput.focus();
});

document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('searchDropdown');
  const searchBar = document.querySelector('.search-bar');
  if (!searchBar.contains(e.target) && !dropdown.contains(e.target)) hideSearchDropdown();
});

// Délégation d'événements globale pour tout le contenu généré dynamiquement
document.addEventListener('click', e => {
  const fb = e.target.closest('.filter-btn'); if (fb) { applyFilter(fb.dataset.category); return; }
  const addBtn = e.target.closest('[data-action="add-to-cart"]'); if (addBtn) { e.stopPropagation(); addToCart(parseInt(addBtn.dataset.id), '', '', addBtn); return; }
  const favBtn = e.target.closest('[data-action="toggle-favorite"]'); if (favBtn) { e.stopPropagation(); toggleFavorite(parseInt(favBtn.dataset.id)); return; }
  const editBtn = e.target.closest('[data-action="edit-product"]'); if (editBtn) { e.stopPropagation(); openEditModal(parseInt(editBtn.dataset.id)); return; }
  const removeBtn = e.target.closest('[data-action="cart-remove"]'); if (removeBtn) { e.stopPropagation(); removeCartItem(parseInt(removeBtn.dataset.index)); return; }
  const incBtn = e.target.closest('[data-action="cart-increase"]'); if (incBtn) { changeQty(parseInt(incBtn.dataset.index), 1); return; }
  const decBtn = e.target.closest('[data-action="cart-decrease"]'); if (decBtn) { changeQty(parseInt(decBtn.dataset.index), -1); return; }
  const recCard = e.target.closest('.rec-card'); if (recCard) { openProductModal(parseInt(recCard.dataset.productId)); return; }
  const catCard = e.target.closest('.category-card'); if (catCard) { trackViewedItem(catCard.dataset.category); applyFilter(catCard.dataset.category); switchView('home'); return; }
  // Actions depuis la vue compte
  const acctAction = e.target.closest('[data-account-action]');
  if (acctAction) { handleAccountAction(acctAction.dataset.accountAction); return; }
  const card = e.target.closest('.product-card');
  if (card && !e.target.closest('.product-card-add') && !e.target.closest('.fav-icon') && !e.target.closest('.product-edit-btn')) openProductModal(parseInt(card.dataset.productId));
});

document.getElementById('modalCloseBtn').addEventListener('click', () => { if (state.modalOpen) closeProductModal(); });

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.search) switchToSearchView(state.searchViewState.query);
  else if (state.modalOpen) closeProductModal();
});

document.getElementById('modalSourcingBtn').addEventListener('click', () => window.open(`https://wa.me/242066271882?text=${encodeURIComponent("Bonjour NRJ Marketplace, je recherche un produit. Je peux vous envoyer une photo")}`));
document.getElementById('modalDescSourcingBtn').addEventListener('click', () => window.open(`https://wa.me/242066271882?text=${encodeURIComponent("Bonjour NRJ Marketplace International, je recherche un produit spécifique...")}`));

document.getElementById('cartCloseBtn')?.addEventListener('click', () => {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
});
document.getElementById('cartOverlay').addEventListener('click', () => {
  document.getElementById('cartPanel').classList.remove('open');
  document.getElementById('cartOverlay').classList.remove('open');
});
document.getElementById('checkoutBtn').addEventListener('click', openOrderModal);
document.getElementById('sendWhatsAppBtn').addEventListener('click', sendWhatsAppOrder);
document.getElementById('cancelOrderBtn').addEventListener('click', () => document.getElementById('orderModalOverlay').classList.remove('open'));

document.getElementById('saveEditBtn').addEventListener('click', updateProduct);
document.getElementById('cancelEditBtn').addEventListener('click', () => document.getElementById('editProductModalOverlay').classList.remove('open'));

document.getElementById('backToHomeBtn').addEventListener('click', () => switchView('home'));

// ─── Accès admin caché : appui long (500 ms) sur le logo ────────────────────
function initLogoLongPress() {
  const logo = document.querySelector('.logo-wrapper');
  if (!logo) return;
  let pressTimer = null;
  let moved = false;
  logo.addEventListener('pointerdown', () => {
    moved = false;
    pressTimer = setTimeout(() => { if (!moved) window.location.href = 'admin.html'; }, 500);
  });
  logo.addEventListener('pointerup', () => clearTimeout(pressTimer));
  logo.addEventListener('pointercancel', () => clearTimeout(pressTimer));
  logo.addEventListener('pointermove', () => { moved = true; clearTimeout(pressTimer); });
}

// ─── Vue compte « Mon NRJ » ──────────────────────────────────────────────────
export function showAccountView() {
  document.getElementById('catalogueWrapper').style.display = 'none';
  const av = document.getElementById('accountView');
  av.style.display = 'flex';
  renderAccount();
  window.scrollTo(0, 0);
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector('.nav-item[data-nav="profile"]')?.classList.add('active');
}

export function hideAccountView() {
  const av = document.getElementById('accountView');
  if (av) av.style.display = 'none';
  document.getElementById('catalogueWrapper').style.display = 'block';
}

function renderAccount() {
  const root = document.getElementById('accountContent');
  if (!root) return;

  const name = localStorage.getItem('nrj_customer_name') || '';
  const initials = name ? name.split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() : '?';
  const greeting = name ? `Bonjour, ${escapeHtml(name.split(/\s+/)[0])}` : 'Bienvenue';
  const isAdmin = state.isAdminLoggedIn === true;

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
      const itemsPreview = o.items.slice(0, 3).map(it => `${escapeHtml(it.name)} x${it.qty}`).join(' · ');
      const more = o.items.length > 3 ? ` · +${o.items.length - 3}` : '';
      return `<div class="account-order">
        <div class="account-order-head">
          <span class="account-order-date">📦 ${dateStr} · ${timeStr}</span>
          <span class="account-order-total">${formatPrice(o.total)}</span>
        </div>
        <div class="account-order-items">${itemsPreview}${more}</div>
        <div class="account-order-meta">Destinataire WhatsApp : ${escapeHtml(o.recipient)}</div>
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

// ✅ Raccord : permet à cart.js de rafraîchir le compte après une commande
window.renderAccount = renderAccount;

function handleAccountAction(action) {
  switch (action) {
    case 'close': {
      hideAccountView();
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelector('.nav-item[data-nav="home"]').classList.add('active');
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
      refreshCatalogue();
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelector('.nav-item[data-nav="favorites"]').classList.add('active');
      window.scrollTo(0, 0);
      break;
    }
    case 'go-history': {
      hideAccountView();
      document.getElementById('searchInput').focus();
      showSearchDropdown('');
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
        localStorage.removeItem('nrj_search_history');
        localStorage.removeItem('nrj_orders');
        localStorage.removeItem('nrj_customer_name');
      } catch {}
      state.favorites = [];
      state.cart = [];
      state.orders = [];
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

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', function(e) {
  e.preventDefault();
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  this.classList.add('active');
  const nav = this.dataset.nav;

  if (nav === 'home') {
    if (state.modalOpen) closeProductModal();
    if (document.getElementById('searchView').style.display === 'flex') switchFromSearchView();
    if (document.getElementById('accountView').style.display === 'flex') hideAccountView();
    switchView('home');
    state.currentFilter = 'all';
    state.currentQuickFilter = 'all';
    state.searchQuery = '';
    const inp = document.getElementById('searchInput');
    if (inp) { inp.value = ''; inp.placeholder = state.rotationList[0]; }
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    document.querySelector('.filter-chip[data-filter="all"]')?.classList.add('active');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.filter-btn[data-category="all"]')?.classList.add('active');
    refreshCatalogue();
    hideSearchDropdown();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (nav === 'categories') {
    if (document.getElementById('searchView').style.display === 'flex') switchFromSearchView();
    if (document.getElementById('accountView').style.display === 'flex') hideAccountView();
    switchView('categories');
    window.scrollTo(0, 0);
  }
  if (nav === 'cart') {
    document.getElementById('cartPanel').classList.add('open');
    document.getElementById('cartOverlay').classList.add('open');
    refreshCartDisplay();
  }
  if (nav === 'favorites') {
    if (document.getElementById('searchView').style.display === 'flex') switchFromSearchView();
    if (document.getElementById('accountView').style.display === 'flex') hideAccountView();
    switchView('home');
    state.currentFilter = 'favorites';
    refreshCatalogue();
    window.scrollTo(0, 0);
  }
  if (nav === 'profile') {
    showAccountView();
  }
}));

async function init() {
  await fetchProducts();
  loadOrders();

  // Les catégories en pastilles cliquables
  const cats = [...new Set(state.products.map(p => removeEmojis(p.category)))];
  let html = `<button class="filter-btn active" data-category="all">Tout voir (${state.products.length})</button>`;
  cats.forEach(c => {
    const count = state.products.filter(p => p.category === c).length;
    html += `<button class="filter-btn" data-category="${escapeHtml(c)}">${escapeHtml(c)} (${count})</button>`;
  });
  document.getElementById('filterBar').innerHTML = html;

  initPlaceholderRotation();
  initVoiceSearch();
  initSmartHeader();
  initLogoLongPress();
  initThemeToggle();
  refreshCatalogue();
  refreshCartDisplay();
  updateNavFavBadge();

  // Session admin : bouton "modifier" sur les cartes + badge Admin dans le compte
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
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
}

init();
