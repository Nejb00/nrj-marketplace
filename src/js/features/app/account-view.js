// ═══ Mon NRJ — espace client + paramètres (UI Liquid) ═══
import { state, saveCart, saveFavorites, saveOrders, trackViewedProduct } from '../../core/state.js';
import { showToast } from '../../utils/dom-helpers.js';
import { refreshCartDisplay } from '../../services/cart-panel.js';
import { updateNavCartBadge } from '../../services/cart-badge.js';
import { updateNavFavBadge } from '../../services/favorites.js';
import { showSearchDropdown } from '../../services/search-dropdown.js';
import { markNavActive } from './view-helpers.js';
import { refreshCatalogue } from '../catalogue/catalogue-init.js';
import { clearSubcategorySelection } from '../catalogue/category-bubbles.js';
import { thumbImg } from '../../utils/images.js';
import { applyTheme } from './theme.js';
import { forYou } from '../../services/reco.js';

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(n); }
  catch { return `${Math.round(n).toLocaleString('fr-FR')} FCFA`; }
};

const ICONS = {
  back: 'M15.5 19 8.5 12l7-7',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8.4-3.5c0-.5-.05-1-.16-1.48l2.01-1.57-2-3.46-2.43.97a8.1 8.1 0 0 0-2.55-1.48L14.9 2h-4l-.37 2.98a8.1 8.1 0 0 0-2.55 1.48l-2.43-.97-2 3.46 2.01 1.57A6.9 6.9 0 0 0 5.4 12c0 .5.05 1 .16 1.48l-2.01 1.57 2 3.46 2.43-.97a8.1 8.1 0 0 0 2.55-1.48l.37 2.98h4l.37-2.98a8.1 8.1 0 0 0 2.55-1.48l2.43.97 2-3.46-2.01-1.57c.11-.48.16-.98.16-1.48Z',
  box: 'M4 4.8 12 2l8 2.8v10.4L12 22l-8-6.8V4.8Zm8 6.7 7.4-2.6M12 11.5 4.6 8.9M12 11.5V20M7.6 3.6 15.4 6.4',
  message: 'M5 4h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H9l-4.6 3v-3.1A2 2 0 0 1 3 16V6a2 2 0 0 1 2-2Zm3 6h.01M12 10h.01M16 10h.01',
  heart: 'M20.8 8.7c0 5-8.8 10.2-8.8 10.2S3.2 13.7 3.2 8.7A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.6Z',
  card: 'M3 6h18v12H3zM3 10h18M7 15h4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2',
  pin: 'M12 21s6-6.2 6-11A6 6 0 0 0 6 10c0 4.8 6 11 6 11Zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  shield: 'M12 2 20 5v6c0 5.1-3.3 9-8 11-4.7-2-8-5.9-8-11V5l8-3Zm-3 9 2 2 4-4',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v10H5z',
  bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-18c2 2.2 3 5.2 3 9s-1 6.8-3 9c-2-2.2-3-5.2-3-9s1-6.8 3-9ZM3 12h18',
  language: 'M4 5h8M8 5c0 5-1.5 8-4 10M5 11c1.6 1.8 3.3 3 5 3M14 7h6M17 7l-4 10M15 13h5',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12h8M10 8.5h4M10 15.5h4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6M12 7h.01',
  phone: 'M7 3h3l1 4-2 1a11 11 0 0 0 7 7l1-2 4 1v3c0 1.1-.9 2-2 2C11.8 19 5 12.2 5 6c0-1.7.9-3 2-3Z',
  share: 'M18 8a3 3 0 1 0-2.83-4A3 3 0 0 0 15 5c0 .35.06.69.18 1L8.8 9.5A3 3 0 1 0 9 14c.33 0 .65-.05.95-.15l6.2 3.58A3 3 0 1 0 17 16c0-.36-.06-.7-.18-1l-6.18-3.58A3 3 0 0 0 9 9c-.33 0-.66.05-.95.16l6.36-3.67C14.95 5.81 16.38 7 18 7Z',
  download: 'M12 3v11m0 0-4-4m4 4 4-4M5 16v3h14v-3',
  trash: 'M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7V4h6v3',
  chevron: 'M9 5l7 7-7 7',
  star: 'M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.2l5.4-.8L12 3.5Z',
  sun: 'M12 3V1M12 23v-2M4.2 4.2 2.8 2.8M21.2 21.2l-1.4-1.4M3 12H1M23 12h-2M4.2 19.8l-1.4 1.4M21.2 2.8l-1.4 1.4M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z',
  moon: 'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z'
};

const icon = (name) => `<svg class="nrj-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name] || ICONS.info}"/></svg>`;

function productTile(p, kind, index) {
  const image = p?.image
    ? thumbImg(p.image, p.name || '', 300, 300, '', { loading: index < 2 ? 'eager' : 'lazy' })
    : '';
  const meta = kind === 'recent'
    ? 'Vu récemment'
    : ((Number(p?.moq) || 1) > 1 ? `Dès ${Number(p.moq)} pcs` : 'Sélection NRJ');
  return `<button type="button" class="nrj-account-product" data-account-product="${escapeHtml(String(p.id))}" aria-label="Voir ${escapeHtml(p.name || 'produit')}">
    <span class="nrj-account-product-media">${image}<span class="nrj-account-product-fallback" aria-hidden="true">${icon('box')}</span></span>
    <span class="nrj-account-product-copy">
      <strong>${escapeHtml(p.name || 'Produit NRJ')}</strong>
      <span>${money(p.price)}</span>
      <small>${meta}</small>
    </span>
  </button>`;
}

function renderProductRail(title, items, kind, emptyText) {
  if (!items.length) return `<section class="account-product-section"><div class="account-section-heading"><h2>${title}</h2></div><div class="account-empty-rail">${emptyText}</div></section>`;
  return `<section class="account-product-section" aria-labelledby="account-${kind}-title">
    <div class="account-section-heading"><h2 id="account-${kind}-title">${title}</h2><span>${items.length}</span></div>
    <div class="account-product-rail" role="list">${items.map((p,i)=>productTile(p,kind,i)).join('')}</div>
  </section>`;
}

export function showAccountView() {
  const av = document.getElementById('accountView');
  const wrap = document.getElementById('catalogueWrapper');
  if (!av || !wrap) return;
  wrap.style.display = 'none';
  av.style.display = 'flex';
  renderAccount();
  av.scrollTop = 0;
  markNavActive('profile');
  av.focus?.({preventScroll:true});
}

export function hideAccountView() {
  const av = document.getElementById('accountView');
  if (!av) return;
  av.style.display = 'none';
  av.classList.remove('account-settings-open');
  const wrap = document.getElementById('catalogueWrapper');
  if (wrap) wrap.style.display = 'block';
}

function initAccountInteractions() {
  const root = document.getElementById('accountContent');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';

  root.addEventListener('click', async (event) => {
    const product = event.target.closest('[data-account-product]');
    if (product) {
      const pid = Number(product.dataset.accountProduct);
      if (!Number.isFinite(pid)) return;
      hideAccountView();
      try {
        const module = await import('../product/modal-render.js');
        await module.openProductModal(pid);
      } catch (error) {
        console.error('Ouverture produit depuis Mon NRJ', error);
        showToast('Impossible d’ouvrir ce produit.');
      }
    }
  });
}

function renderProfile() {
  const root = document.getElementById('accountContent');
  if (!root) return;

  const name = localStorage.getItem('fluo_customer_name') || '';
  const initials = name
    ? name.split(/\s+/).map(s => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
    : 'NR';
  const firstName = name ? name.split(/\s+/)[0] : 'vous';
  const isAdmin = state.isAdminLoggedIn === true;
  const isLight = document.documentElement.classList.contains('light-theme');
  const favCount = state.favorites.length;
  const cartCount = state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const orderCount = (state.orders || []).length;
  const viewed = Array.isArray(state.viewedProductIds) ? state.viewedProductIds : [];
  const recentProducts = viewed.map(id => state.products.find(p => Number(p.id) === Number(id))).filter(Boolean).slice(0, 8);
  const recentIds = new Set(recentProducts.map(p => Number(p.id)));
  const recommendations = forYou(state.products.filter(p => !recentIds.has(Number(p.id)) && !state.favorites.includes(p.id))).slice(0, 8);

  const orders = (state.orders || []).slice(0, 8);
  const orderPreview = orders.map((o) => {
    const date = new Date(o.date);
    const dateLabel = Number.isNaN(date.getTime()) ? 'Commande' : date.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
    return `<article class="account-order-row">
      <div class="account-order-icon">${icon('box')}</div>
      <div class="account-order-copy">
        <strong>Commande NRJ</strong>
        <span>${escapeHtml(dateLabel)} · ${escapeHtml(money(o.total))}</span>
      </div>
      <span class="account-order-status">Envoyée</span>
    </article>`;
  }).join('');

  root.innerHTML = `
    <div class="account-page account-profile-page">
      <header class="account-hero lg lg-spec">
        <button type="button" class="account-icon-button" data-account-action="close" aria-label="Retour">${icon('back')}</button>
        <div class="account-person">
          <div class="account-avatar" aria-hidden="true"><span class="account-avatar-mark">⚡</span><span>${escapeHtml(initials)}</span></div>
          <div class="account-person-copy">
            <span class="account-kicker">MON NRJ</span>
            <h1>${name ? `Bonjour, ${escapeHtml(firstName)}` : 'Bienvenue sur NRJ'}</h1>
            <p>Ton espace personnel, au même endroit.</p>
          </div>
        </div>
        <button type="button" class="account-icon-button account-settings-button" data-account-action="open-settings" aria-label="Ouvrir les paramètres">${icon('settings')}</button>
      </header>

      <section class="account-value-grid" aria-label="Résumé du compte">
        <button type="button" class="account-value-card" data-account-action="go-cart">
          <span class="account-value-label">Panier</span>
          <strong>${cartCount}</strong>
          <span class="account-value-note">articles</span>
        </button>
        <button type="button" class="account-value-card" data-account-action="go-favs">
          <span class="account-value-label">Favoris</span>
          <strong>${favCount}</strong>
          <span class="account-value-note">enregistrés</span>
        </button>
        <button type="button" class="account-value-card" data-account-action="scroll-orders">
          <span class="account-value-label">Commandes</span>
          <strong>${orderCount}</strong>
          <span class="account-value-note">historique</span>
        </button>
      </section>

      <section class="account-actions-section" aria-labelledby="account-actions-title">
        <div class="account-section-heading"><h2 id="account-actions-title">Ton activité</h2></div>
        <div class="account-action-list">
          <button type="button" class="account-action-row" data-account-action="scroll-orders"><span class="account-row-icon">${icon('box')}</span><span class="account-row-copy"><strong>Mes commandes</strong><small>${orderCount ? `${orderCount} commande${orderCount > 1 ? 's':''}` : 'Aucune commande pour l’instant'}</small></span><span class="account-row-trail">${icon('chevron')}</span></button>
          <button type="button" class="account-action-row" data-account-action="open-chat"><span class="account-row-icon">${icon('message')}</span><span class="account-row-copy"><strong>Messages</strong><small>Parler à l’équipe NRJ</small></span><span class="account-row-trail">${icon('chevron')}</span></button>
          <button type="button" class="account-action-row" data-account-action="go-favs"><span class="account-row-icon">${icon('heart')}</span><span class="account-row-copy"><strong>Mes favoris</strong><small>${favCount} produit${favCount > 1 ? 's' : ''}</small></span><span class="account-row-trail">${icon('chevron')}</span></button>
          <button type="button" class="account-action-row" data-account-action="payment-info"><span class="account-row-icon">${icon('card')}</span><span class="account-row-copy"><strong>Moyens de paiement</strong><small>Mobile Money · bientôt</small></span><span class="account-row-trail">${icon('chevron')}</span></button>
        </div>
      </section>

      <section class="account-shortcuts" aria-label="Raccourcis">
        <button type="button" data-account-action="go-history"><span>${icon('clock')}<strong>Historique</strong></span></button>
        <button type="button" data-account-action="address-info"><span>${icon('pin')}<strong>Adresses</strong></span><em>Bientôt</em></button>
        <button type="button" data-account-action="open-settings"><span>${icon('settings')}<strong>Préférences</strong></span></button>
      </section>

      <section class="account-orders-section" id="accountOrdersSection" aria-labelledby="account-orders-title">
        <div class="account-section-heading"><h2 id="account-orders-title">Dernières commandes</h2><span>${orderCount}</span></div>
        <div class="account-order-list">
          ${orderPreview || '<div class="account-empty-state"><span>' + icon('box') + '</span><strong>Aucune commande pour le moment</strong><small>Ton historique apparaîtra ici après ta première commande.</small></div>'}
        </div>
      </section>

      ${renderProductRail('Récemment consultés', recentProducts, 'recent', 'Les produits que tu consultes apparaîtront ici.')}
      ${renderProductRail('Pour toi', recommendations, 'foryou', 'Continue à explorer le catalogue pour personnaliser ta sélection.')}

      <footer class="account-footer">
        ${isAdmin ? '<span class="account-admin-tag">Admin</span>' : ''}
        <span>© 2026 NRJ Marketplace</span>
      </footer>
    </div>

    <div class="account-page account-settings-page" hidden>
      ${renderSettings(isLight)}
    </div>
  `;

  initAccountInteractions();
}

function renderSettings(isLight) {
  const notifications = localStorage.getItem('nrj_notifications_enabled') !== 'false';
  return `
    <header class="settings-hero">
      <button type="button" class="account-icon-button" data-account-action="close-settings" aria-label="Retour">${icon('back')}</button>
      <div><span class="account-kicker">NRJ</span><h1>Paramètres</h1></div>
      <span class="settings-hero-spacer" aria-hidden="true"></span>
    </header>

    <section class="settings-grid" aria-labelledby="security-title">
      <div class="settings-section-title" id="security-title">Sécurité & confidentialité</div>
      <button type="button" class="settings-feature-card" data-account-action="security-info"><span class="settings-feature-icon">${icon('shield')}</span><span><strong>Sécurité du compte</strong><small>Bientôt disponible</small></span>${icon('chevron')}</button>
      <button type="button" class="settings-feature-card" data-account-action="privacy-info"><span class="settings-feature-icon">${icon('lock')}</span><span><strong>Confidentialité</strong><small>Bientôt disponible</small></span>${icon('chevron')}</button>
      <button type="button" class="settings-feature-card" data-account-action="permissions-info"><span class="settings-feature-icon">${icon('shield')}</span><span><strong>Autorisations</strong><small>Bientôt disponible</small></span>${icon('chevron')}</button>
      <button type="button" class="settings-feature-card" data-account-action="security-center-info"><span class="settings-feature-icon">${icon('shield')}</span><span><strong>Centre de sécurité</strong><small>Protection NRJ</small></span>${icon('chevron')}</button>
    </section>

    <section class="settings-list-section">
      <div class="settings-section-title">Préférences</div>
      <div class="settings-list">
        <button type="button" class="settings-row" data-account-action="region-info"><span class="settings-row-icon">${icon('globe')}</span><span class="settings-row-copy"><strong>Pays et région</strong><small>Congo Brazzaville</small></span>${icon('chevron')}</button>
        <button type="button" class="settings-row" data-account-action="language-info"><span class="settings-row-icon">${icon('language')}</span><span class="settings-row-copy"><strong>Langue</strong><small>Français</small></span>${icon('chevron')}</button>
        <button type="button" class="settings-row" data-account-action="currency-info"><span class="settings-row-icon">${icon('coin')}</span><span class="settings-row-copy"><strong>Devise</strong><small>XAF · FCFA</small></span>${icon('chevron')}</button>
        <button type="button" class="settings-row" data-account-action="toggle-notifications"><span class="settings-row-icon">${icon('bell')}</span><span class="settings-row-copy"><strong>Notifications</strong><small>${notifications ? 'Activées' : 'Désactivées'}</small></span><span class="settings-switch ${notifications ? 'is-on':''}" aria-hidden="true"><span></span></span></button>
        <button type="button" class="settings-row" data-account-action="toggle-theme"><span class="settings-row-icon">${icon(isLight ? 'sun' : 'moon')}</span><span class="settings-row-copy"><strong>Apparence</strong><small>${isLight ? 'Mode clair' : 'Mode sombre'}</small></span><span class="settings-row-trailing">${icon('chevron')}</span></button>
      </div>
    </section>

    <section class="settings-list-section">
      <div class="settings-section-title">À propos</div>
      <div class="settings-list">
        <button type="button" class="settings-row" data-account-action="about-info"><span class="settings-row-icon">${icon('info')}</span><span class="settings-row-copy"><strong>À propos de NRJ</strong><small>Marketplace congolais</small></span>${icon('chevron')}</button>
        <button type="button" class="settings-row" data-account-action="contact"><span class="settings-row-icon">${icon('phone')}</span><span class="settings-row-copy"><strong>Contactez-nous</strong><small>Assistance NRJ</small></span>${icon('chevron')}</button>
        <button type="button" class="settings-row" data-account-action="share-app"><span class="settings-row-icon">${icon('share')}</span><span class="settings-row-copy"><strong>Partager NRJ</strong><small>Inviter un proche</small></span>${icon('chevron')}</button>
        <button type="button" class="settings-row" data-account-action="install-app"><span class="settings-row-icon">${icon('download')}</span><span class="settings-row-copy"><strong>Installer l’application</strong><small>Accès rapide depuis l’écran d’accueil</small></span>${icon('chevron')}</button>
      </div>
    </section>

    <section class="settings-list-section settings-danger-section">
      <div class="settings-section-title">Données</div>
      <div class="settings-list">
        <button type="button" class="settings-row danger" data-account-action="clear-all"><span class="settings-row-icon">${icon('trash')}</span><span class="settings-row-copy"><strong>Effacer mes données locales</strong><small>Panier, favoris, historique et commandes</small></span>${icon('chevron')}</button>
      </div>
    </section>

    <footer class="settings-footer">NRJ Marketplace · © 2026</footer>
  `;
}

function enterSettings() {
  const root = document.getElementById('accountContent');
  if (!root) return;
  root.querySelector('.account-profile-page')?.setAttribute('hidden','');
  const settings = root.querySelector('.account-settings-page');
  settings?.removeAttribute('hidden');
  document.getElementById('accountView').scrollTop = 0;
  document.getElementById('accountView')?.classList.add('account-settings-open');
}

function leaveSettings() {
  const root = document.getElementById('accountContent');
  if (!root) return;
  root.querySelector('.account-settings-page')?.setAttribute('hidden','');
  root.querySelector('.account-profile-page')?.removeAttribute('hidden');
  document.getElementById('accountView')?.classList.remove('account-settings-open');
  document.getElementById('accountView').scrollTop = 0;
}

export function renderAccount() {
  renderProfile();
}

window.renderAccount = renderAccount;

export function handleAccountAction(action) {
  switch (action) {
    case 'close':
      hideAccountView();
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      document.querySelector('.nav-item[data-nav="home"]')?.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;

    case 'open-settings':
      enterSettings();
      break;

    case 'close-settings':
      leaveSettings();
      break;

    case 'go-cart':
      hideAccountView();
      document.getElementById('cartPanel')?.classList.add('open');
      document.getElementById('cartOverlay')?.classList.add('open');
      refreshCartDisplay();
      break;

    case 'go-favs':
      hideAccountView();
      state.currentFilter = 'favorites';
      clearSubcategorySelection();
      refreshCatalogue();
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      document.querySelector('.nav-item[data-nav="favorites"]')?.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      break;

    case 'go-history':
      hideAccountView();
      const search = document.getElementById('searchInput');
      if (search) {
        search.focus();
        showSearchDropdown('');
      }
      break;

    case 'scroll-orders': {
      const view = document.getElementById('accountView');
      const section = document.getElementById('accountOrdersSection');
      if (view && section) view.scrollTo({ top: Math.max(section.offsetTop - 18, 0), behavior: 'smooth' });
      break;
    }

    case 'open-chat':
      document.getElementById('chatFab')?.click();
      break;

    case 'payment-info':
      showToast('⚡ Les paiements Mobile Money sont en cours de finalisation.');
      break;

    case 'address-info':
      showToast('📍 La gestion des adresses arrivera prochainement.');
      break;

    case 'region-info':
      showToast('🌍 Région active : Congo Brazzaville.');
      break;

    case 'language-info':
      showToast('🔤 Langue active : français.');
      break;

    case 'currency-info':
      showToast('💰 Devise active : XAF (FCFA).');
      break;

    case 'security-info':
    case 'privacy-info':
    case 'permissions-info':
    case 'security-center-info':
      showToast('🛡️ Cette rubrique sera activée dans une prochaine phase.');
      break;

    case 'about-info':
      showToast('⚡ NRJ Marketplace — import direct Chine, France et Turquie → Congo Brazzaville.');
      break;

    case 'toggle-notifications': {
      const enabled = localStorage.getItem('nrj_notifications_enabled') !== 'false';
      localStorage.setItem('nrj_notifications_enabled', String(!enabled));
      const settingsPage = document.querySelector('.account-settings-page');
      if (settingsPage) settingsPage.innerHTML = renderSettings(document.documentElement.classList.contains('light-theme'));
      break;
    }

    case 'toggle-theme': {
      const current = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      applyTheme(next);
      localStorage.setItem('nrj_theme', next);
      const settingsPage = document.querySelector('.account-settings-page');
      if (settingsPage) settingsPage.innerHTML = renderSettings(next === 'light');
      showToast(next === 'light' ? '☀️ Mode clair' : '🌙 Mode sombre');
      break;
    }

    case 'share-app': {
      const shareData = { title: 'NRJ Marketplace', text: 'Découvre NRJ Marketplace : import direct vers le Congo Brazzaville.', url: location.origin };
      if (navigator.share) navigator.share(shareData).catch(() => {});
      else navigator.clipboard?.writeText(location.origin).then(() => showToast('🔗 Lien NRJ copié.'));
      break;
    }

    case 'install-app':
      if (window.deferredInstallPrompt) window.deferredInstallPrompt.prompt();
      else showToast('📲 Ouvre le menu du navigateur pour installer NRJ sur ton écran d’accueil.');
      break;

    case 'contact':
      window.open(`https://wa.me/242066271882?text=${encodeURIComponent("Bonjour NRJ Marketplace, j'ai besoin d'assistance.")}`, '_blank', 'noopener,noreferrer');
      break;

    case 'clear-all':
      if (!confirm('Effacer votre panier, favoris, historique, commandes et produits consultés ? Cette action est définitive.')) return;
      try {
        ['nrj_favorites','nrj_cart','nrj_cart_v32','nrj_search_history','nrj_orders','nrj_affinity','nrj_viewed_products'].forEach((key) => localStorage.removeItem(key));
      } catch {}
      state.favorites = [];
      state.cart = [];
      state.orders = [];
      state.viewedProductIds = [];
      saveCart();
      saveFavorites();
      saveOrders();
      updateNavFavBadge();
      updateNavCartBadge();
      refreshCartDisplay();
      renderAccount();
      showToast('🧹 Données locales effacées.');
      break;
  }
}

