/**
 * NRJ Marketplace - État Global
 * Source de vérité unique du site. Utilise IndexedDB pour le stockage hors ligne.
 */

import db from './db.js';

// État global
const state = {
    products: [],
    cart: [],
    favorites: [],
    orders: []
};

// Charger les données depuis IndexedDB (avec fallback localStorage)
async function loadState() {
  try {
    // Charger le panier
    state.cart = await db.getCart('default');
    if (state.cart.length === 0) {
      // Fallback vers localStorage
      const localCart = JSON.parse(localStorage.getItem('nrj_cart_v32') || '[]');
      if (localCart.length > 0) {
        state.cart = localCart;
        // Migrer vers IndexedDB
        for (const item of localCart) {
          await db.addToCart(item);
        }
        localStorage.removeItem('nrj_cart_v32');
      }
    }

    // Charger les favoris
    state.favorites = await db.getFavorites('default');
    if (state.favorites.length === 0) {
      // Fallback vers localStorage
      const localFavorites = JSON.parse(localStorage.getItem('nrj_favorites') || '[]');
      if (localFavorites.length > 0) {
        state.favorites = localFavorites;
        // Migrer vers IndexedDB
        for (const fav of localFavorites) {
          await db.addToFavorites({ productId: fav, userId: 'default' });
        }
        localStorage.removeItem('nrj_favorites');
      }
    }

    // Charger les commandes en attente
    state.pendingOrders = await db.getPendingOrders('default');
    if (state.pendingOrders.length === 0) {
      // Fallback vers localStorage
      const localOrders = JSON.parse(localStorage.getItem('nrj_orders') || '[]');
      if (localOrders.length > 0) {
        state.pendingOrders = localOrders;
        // Migrer vers IndexedDB
        for (const order of localOrders) {
          await db.addPendingOrder(order);
        }
        localStorage.removeItem('nrj_orders');
      }
    }

    console.log('✅ État chargé depuis IndexedDB');
  } catch (err) {
    console.error('❌ Erreur chargement état:', err);
    // Fallback complet vers localStorage
    state.cart = JSON.parse(localStorage.getItem('nrj_cart_v32') || '[]');
    state.favorites = JSON.parse(localStorage.getItem('nrj_favorites') || '[]');
    state.pendingOrders = JSON.parse(localStorage.getItem('nrj_orders') || '[]');
  }
}

// Sauvegarder un élément dans le panier
async function saveCartItem(item) {
  try {
    await db.addToCart(item);
    state.cart = await db.getCart('default');
  } catch (err) {
    console.error('❌ Erreur sauvegarde panier:', err);
    // Fallback localStorage
    const cart = JSON.parse(localStorage.getItem('nrj_cart_v32') || '[]');
    cart.push(item);
    localStorage.setItem('nrj_cart_v32', JSON.stringify(cart));
    state.cart = cart;
  }
}

// Supprimer un élément du panier
async function removeCartItem(id) {
  try {
    await db.removeFromCart(id);
    state.cart = await db.getCart('default');
  } catch (err) {
    console.error('❌ Erreur suppression panier:', err);
    // Fallback localStorage
    let cart = JSON.parse(localStorage.getItem('nrj_cart_v32') || '[]');
    cart = cart.filter(item => item.id !== id);
    localStorage.setItem('nrj_cart_v32', JSON.stringify(cart));
    state.cart = cart;
  }
}

// Mettre à jour la quantité d'un élément
async function updateCartItem(id, quantity) {
  try {
    await db.updateCartItem(id, { quantity });
    state.cart = await db.getCart('default');
  } catch (err) {
    console.error('❌ Erreur mise à jour panier:', err);
    // Fallback localStorage
    let cart = JSON.parse(localStorage.getItem('nrj_cart_v32') || '[]');
    const index = cart.findIndex(item => item.id === id);
    if (index !== -1) {
      cart[index].quantity = quantity;
      localStorage.setItem('nrj_cart_v32', JSON.stringify(cart));
      state.cart = cart;
    }
  }
}

// Vider le panier
async function clearCart() {
  try {
    await db.clearCart('default');
    state.cart = [];
  } catch (err) {
    console.error('❌ Erreur vidage panier:', err);
    localStorage.removeItem('nrj_cart_v32');
    state.cart = [];
  }
}

// Sauvegarder un favoris
async function saveFavorite(productId) {
  try {
    await db.addToFavorites({ productId, userId: 'default' });
    state.favorites = await db.getFavorites('default');
  } catch (err) {
    console.error('❌ Erreur sauvegarde favori:', err);
    // Fallback localStorage
    const favorites = JSON.parse(localStorage.getItem('nrj_favorites') || '[]');
    if (!favorites.includes(productId)) {
      favorites.push(productId);
      localStorage.setItem('nrj_favorites', JSON.stringify(favorites));
      state.favorites = favorites;
    }
  }
}

// Supprimer un favoris
async function removeFavorite(productId) {
  try {
    await db.removeFromFavorites(productId);
    state.favorites = await db.getFavorites('default');
  } catch (err) {
    console.error('❌ Erreur suppression favori:', err);
    // Fallback localStorage
    let favorites = JSON.parse(localStorage.getItem('nrj_favorites') || '[]');
    favorites = favorites.filter(id => id !== productId);
    localStorage.setItem('nrj_favorites', JSON.stringify(favorites));
    state.favorites = favorites;
  }
}

// Ajouter une commande en attente
async function addPendingOrder(order) {
  try {
    await db.addPendingOrder(order);
    state.pendingOrders = await db.getPendingOrders('default');
  } catch (err) {
    console.error('❌ Erreur ajout commande:', err);
    // Fallback localStorage
    const orders = JSON.parse(localStorage.getItem('nrj_orders') || '[]');
    orders.push(order);
    localStorage.setItem('nrj_orders', JSON.stringify(orders));
    state.pendingOrders = orders;
  }
}

// Exporter l'état et les fonctions
loadState(); // Charger l'état au démarrage
export { state, saveCartItem, removeCartItem, updateCartItem, clearCart, saveFavorite, removeFavorite, addPendingOrder };