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
    
    // Synchroniser avec Supabase si en ligne
    if (navigator.onLine) {
      await syncAllOfflineData('default');
    }
  } catch (err) {
    console.error('❌ Erreur ajout panier:', err);
    showToast('⚠️ Erreur lors de l'ajout au panier');
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
    showToast('✅ Commande enregistrée ! (Serra synchronisée dès que possible)');
    
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

// Exporter les fonctions principales
export {
  loadOrders,
  saveOrders,
  flyToCart
};

// Initialisation
loadOrders();