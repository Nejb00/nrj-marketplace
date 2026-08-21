/**
 * NRJ Marketplace - Synchronisation Hors Ligne
 * Synchronise les données IndexedDB avec Supabase quand la connexion revient
 */

import { supabaseClient } from './config.js';
import db from './db.js';

// État de la synchronisation
let isSyncing = false;

/**
 * Synchroniser le panier avec Supabase
 */
export async function syncCartToSupabase(userId = 'default') {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const cart = await db.getCart(userId);
    if (cart.length === 0) {
      isSyncing = false;
      return;
    }

    // Formater les données pour Supabase
    const cartData = cart.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
      price: item.price,
      name: item.name,
      image: item.image
    }));

    // Envoyer à Supabase
    const { data, error } = await supabaseClient
      .from('carts')
      .upsert({
        user_id: userId,
        items: cartData
      })
      .select();

    if (!error) {
      console.log('✅ Panier synchronisé avec Supabase:', data);
      // Optionnel: vider le panier local après synchronisation
      // await db.clearCart(userId);
    } else {
      console.error('❌ Erreur synchronisation panier:', error);
    }
  } catch (err) {
    console.error('❌ Erreur syncCartToSupabase:', err);
  } finally {
    isSyncing = false;
  }
}

/**
 * Synchroniser les commandes en attente avec Supabase
 */
export async function syncPendingOrders(userId = 'default') {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const pendingOrders = await db.getPendingOrders(userId);
    if (pendingOrders.length === 0) {
      isSyncing = false;
      return;
    }

    for (const order of pendingOrders) {
      try {
        // Envoyer la commande à Supabase
        const { data, error } = await supabaseClient
          .from('orders')
          .insert({
            user_id: order.userId,
            items: order.items,
            total: order.total,
            status: 'pending',
            payment_method: order.paymentMethod || 'whatsapp',
            delivery_address: order.deliveryAddress || '',
            phone: order.phone || '',
            created_at: order.date
          })
          .select();

        if (!error) {
          console.log('✅ Commande synchronisée:', data);
          // Marquer comme synchronisée
          await db.updatePendingOrder(order.id, { status: 'synced' });
          // Optionnel: supprimer de la liste des commandes en attente
          await db.removePendingOrder(order.id);
        } else {
          console.error('❌ Erreur synchronisation commande:', error);
        }
      } catch (err) {
        console.error('❌ Erreur synchronisation commande individuelle:', err);
      }
    }
  } catch (err) {
    console.error('❌ Erreur syncPendingOrders:', err);
  } finally {
    isSyncing = false;
  }
}

/**
 * Synchroniser les favoris avec Supabase
 */
export async function syncFavoritesToSupabase(userId = 'default') {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const favorites = await db.getFavorites(userId);
    if (favorites.length === 0) {
      isSyncing = false;
      return;
    }

    // Formater les données pour Supabase
    const favoriteProductIds = favorites.map(fav => fav.productId);

    // Envoyer à Supabase
    const { data, error } = await supabaseClient
      .from('favorites')
      .upsert({
        user_id: userId,
        product_ids: favoriteProductIds
      })
      .select();

    if (!error) {
      console.log('✅ Favoris synchronisés avec Supabase:', data);
    } else {
      console.error('❌ Erreur synchronisation favoris:', error);
    }
  } catch (err) {
    console.error('❌ Erreur syncFavoritesToSupabase:', err);
  } finally {
    isSyncing = false;
  }
}

/**
 * Synchroniser toutes les données hors ligne
 */
export async function syncAllOfflineData(userId = 'default') {
  if (isSyncing) return;
  
  console.log('🔄 Début de la synchronisation hors ligne...');
  
  try {
    // Synchroniser dans l'ordre: commandes > panier > favoris
    await syncPendingOrders(userId);
    await syncCartToSupabase(userId);
    await syncFavoritesToSupabase(userId);
    
    console.log('✅ Synchronisation complète terminée !');
    return true;
  } catch (err) {
    console.error('❌ Erreur synchronisation complète:', err);
    return false;
  }
}

/**
 * Écouter les changements de connexion pour synchroniser automatiquement
 */
export function setupAutoSync(userId = 'default') {
  // Synchroniser quand la connexion revient
  window.addEventListener('online', () => {
    console.log('🌐 Connexion rétablie, synchronisation en cours...');
    syncAllOfflineData(userId);
  });

  // Synchroniser périodiquement (toutes les 5 minutes)
  setInterval(() => {
    if (navigator.onLine) {
      syncAllOfflineData(userId);
    }
  }, 5 * 60 * 1000);

  // Synchroniser au chargement de la page
  if (navigator.onLine) {
    setTimeout(() => syncAllOfflineData(userId), 2000); // Attendre 2s pour laisser le temps à Supabase de s'initialiser
  }
}

/**
 * Vérifier si on est en ligne
 */
export function isOnline() {
  return navigator.onLine;
}

// Exporter les fonctions principales
export { db };