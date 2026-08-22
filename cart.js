/**
 * NRJ Marketplace - Gestion du Panier
 * Utilise IndexedDB pour le stockage hors ligne avec synchronisation Supabase
 */

import { state, saveCartItem, removeCartItem, updateCartItem, clearCart, saveFavorite, removeFavorite, addPendingOrder } from './state.js';
import { escapeHtml, formatPrice, showToast, thumbImg } from './utils.js';
import { trackPopularity } from './api.js';
import { WHATSAPP_NUMBER, BASE_URL } from './config.js';
import { refreshCatalogue } from './catalogue.js';
import { signalFavorite, signalCart, signalOrder } from './reco.js';
import { syncAllOfflineData, setupAutoSync } from './sync.js';

// Initialiser la synchronisation automatique
setupAutoSync('default');

const ORDERS_KEY = 'nrj_orders';

// Charger les commandes depuis IndexedDB (via state.js)
export function loadOrders() {
  // Les commandes sont maintenant gérées via state.pendingOrders
  // Compatibilité avec l'ancien code
  try {
    state.orders = state.pendingOrders || [];
  } catch {
    state.orders = [];
  }
}

// Sauvegarder les commandes (maintenant via IndexedDB)
function saveOrders() {
  // Les commandes sont sauvegardées automatiquement via addPendingOrder
  // Compatibilité avec l'ancien code
  try {
    localStorage.setItem(ORDERS_KEY, JSON.stringify(state.orders));
  } catch {}
}

// Animation d'ajout au panier
function flyToCart(sourceEl) {
  const target = document.getElementById('navCartBadge');
  if (!sourceEl || !target || target.style.display === 'none') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // ... (conserver l'animation existante)
}

// Ajouter au panier (version async avec IndexedDB)
export async function addToCart(pid, t = '', c = '', sourceEl = null) {
  const p = state.products.find(pr => pr.id === pid);
  if (!p) return;

  try {
    // Ajouter à l'état global
    const cartItem = {
      id: Date.now().toString(),
      productId: p.id,
      name: p.name || p.title,
      price: p.price,
      quantity: 1,
      image: p.image || p.thumb || '',
      category: p.category || t,
      color: c
    };

    // Sauvegarder via IndexedDB
    await saveCartItem(cartItem);

    // Mettre à jour l'affichage
    if (sourceEl) flyToCart(sourceEl);

    // Signaler l'ajout
    signalCart();
    trackPopularity(pid);

    showToast('✅ Ajouté au panier !');
    renderCart();

    // Synchroniser avec Supabase si en ligne
    if (navigator.onLine) {
      await syncAllOfflineData('default');
    }
  } catch (err) {
    console.error('❌ Erreur ajout panier:', err);
    showToast("⚠️ Erreur lors de l'ajout au panier");
  }
}

// Supprimer du panier
export async function removeFromCart(pid, fromModal = false) {
  try {
    // Trouver l'item dans le panier
    const item = state.cart.find(item => item.productId === pid || item.id === pid);
    if (item) {
      await removeCartItem(item.id);
      signalCart();

      if (!fromModal) {
        showToast('❌ Retiré du panier');
      }
      renderCart();

      // Synchroniser si en ligne
      if (navigator.onLine) {
        await syncAllOfflineData('default');
      }
    }
  } catch (err) {
    console.error('❌ Erreur suppression panier:', err);
  }
}

// Mettre à jour la quantité
export async function updateCartQuantity(pid, quantity) {
  try {
    const item = state.cart.find(item => item.productId === pid || item.id === pid);
    if (item) {
      if (quantity <= 0) {
        await removeCartItem(item.id);
      } else {
        await updateCartItem(item.id, { quantity });
      }
      signalCart();
      renderCart();

      // Synchroniser si en ligne
      if (navigator.onLine) {
        await syncAllOfflineData('default');
      }
    }
  } catch (err) {
    console.error('❌ Erreur mise à jour quantité:', err);
  }
}

// Vider le panier
export async function emptyCart() {
  try {
    await clearCart();
    signalCart();
    showToast('🗑️ Panier vidé');
    renderCart();
  } catch (err) {
    console.error('❌ Erreur vidage panier:', err);
  }
}

// Passer une commande (avec stockage hors ligne)
export async function placeOrder(orderData) {
  try {
    // Ajouter à la liste des commandes en attente
    const orderWithTimestamp = {
      ...orderData,
      id: Date.now().toString(),
      date: new Date().toISOString(),
      status: 'pending'
    };

    await addPendingOrder(orderWithTimestamp);

    // Vider le panier
    await clearCart();

    signalOrder();
    showToast('✅ Commande enregistrée ! (Sera synchronisée dès que possible)');
    renderCart();

    // Synchroniser immédiatement si en ligne
    if (navigator.onLine) {
      await syncAllOfflineData('default');
    }

    return orderWithTimestamp;
  } catch (err) {
    console.error('❌ Erreur commande:', err);
    showToast('⚠️ Erreur lors de la commande');
    throw err;
  }
}

// Gérer les favoris (version async avec IndexedDB)
export async function toggleFavorite(pid) {
  try {
    const isFavorite = state.favorites.some(fav => fav.productId === pid || fav === pid);

    if (isFavorite) {
      // Supprimer des favoris
      const fav = state.favorites.find(f => f.productId === pid || f === pid);
      if (fav) {
        await removeFavorite(fav.productId || fav);
        showToast('❤️ Retiré des favoris');
      }
    } else {
      // Ajouter aux favoris
      await saveFavorite(pid);
      showToast('❤️ Ajouté aux favoris');
    }

    signalFavorite();
    renderFavoritesBadge();

    // Synchroniser si en ligne
    if (navigator.onLine) {
      await syncAllOfflineData('default');
    }
  } catch (err) {
    console.error('❌ Erreur favori:', err);
  }
}

// Récupérer le panier (compatibilité avec l'ancien code)
export function getCart() {
  return state.cart || [];
}

// Récupérer les favoris (compatibilité)
export function getFavorites() {
  return state.favorites || [];
}

// ✅ NOUVEAU : rendu du panier — liste, total, badge nav, activation du bouton commander
export function renderCart() {
  const list = document.getElementById('cartItems');
  const totalEl = document.getElementById('cartTotal');
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (!list || !totalEl) return;

  const cart = state.cart || [];

  if (!cart.length) {
    list.innerHTML = '<div class="cart-empty">Ton panier est vide 🛒</div>';
  } else {
    list.innerHTML = cart.map(item => `
      <div class="cart-item" data-id="${item.productId}">
        <div class="cart-item-img">${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">` : '📦'}</div>
        <div class="cart-item-info">
          <h4>${escapeHtml(item.name)}</h4>
          ${item.color || item.category ? `<div class="cart-item-variants">${escapeHtml([item.category, item.color].filter(Boolean).join(' · '))}</div>` : ''}
          <div class="cart-item-price">${formatPrice(item.price * item.quantity)}</div>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="dec" data-id="${item.productId}" aria-label="Diminuer">−</button>
            <span>${item.quantity}</span>
            <button class="qty-btn" data-action="inc" data-id="${item.productId}" aria-label="Augmenter">+</button>
          </div>
        </div>
        <button class="remove-item-btn" data-action="remove" data-id="${item.productId}" aria-label="Retirer">✕</button>
      </div>
    `).join('');
  }

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  totalEl.textContent = formatPrice(total);
  if (checkoutBtn) checkoutBtn.disabled = cart.length === 0;

  const badge = document.getElementById('navCartBadge');
  if (badge) {
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

// ✅ NOUVEAU : badge favoris dans la nav
export function renderFavoritesBadge() {
  const badge = document.getElementById('navFavBadge');
  if (!badge) return;
  const count = (state.favorites || []).length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

// ✅ NOUVEAU : délégation des clics dans le panier (quantité +/-, suppression)
document.getElementById('cartItems')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const pid = parseInt(btn.dataset.id);
  const action = btn.dataset.action;

  if (action === 'remove') {
    removeFromCart(pid);
  } else if (action === 'inc' || action === 'dec') {
    const item = state.cart.find(i => i.productId === pid);
    if (item) {
      const newQty = action === 'inc' ? item.quantity + 1 : item.quantity - 1;
      updateCartQuantity(pid, newQty);
    }
  }
});

// Exporter les fonctions principales
// ⚠️ loadOrders est déjà exporté juste au-dessus (export function loadOrders) :
// le réexporter ici causait une erreur "Duplicate export" qui empêchait tout
// le module de charger, et donc cassait la nav + le panier + le checkout.
export {
  saveOrders,
  flyToCart
};

// Initialisation
loadOrders();
