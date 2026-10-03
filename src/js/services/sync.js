/**
 * Synchronisation optionnelle IndexedDB → Supabase.
 * Chaque navigateur a son propre hash : on ne mélange pas les paniers.
 * Les commandes restent locales (WhatsApp est le canal réel).
 */

import { supabaseClient } from '../core/config.js';
import db from './db.js';

let isSyncing = false;

async function getSyncUserId() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user?.id) return session.user.id;

    const { data, error } = await supabaseClient.auth.signInAnonymously();
    if (error) throw error;
    return data.user.id;
}

export async function syncCartToSupabase() {
    try {
        const cart = await db.getCart();
        // Synchroniser aussi un tableau vide : une suppression locale doit
        // pouvoir vider l'état distant au lieu de laisser un ancien panier.
        const { error } = await supabaseClient
            .from('carts')
            .upsert({
                user_id: await getSyncUserId(),
                items: cart.map((item) => ({
                    product_id: item.productId,
                    quantity: item.quantity,
                    taille: item.taille || '',
                    couleur: item.couleur || ''
                }))
            });
        if (error) console.warn('Sync panier:', error.message);
    } catch (err) {
        console.warn('Sync panier impossible:', err);
    }
}

export async function syncFavoritesToSupabase() {
    try {
        const favorites = await db.getFavorites();
        // Même principe pour les favoris : [] doit écraser l'ancien état distant.
        const { error } = await supabaseClient
            .from('favorites')
            .upsert({
                user_id: await getSyncUserId(),
                product_ids: favorites
            });
        if (error) console.warn('Sync favoris:', error.message);
    } catch (err) {
        console.warn('Sync favoris impossible:', err);
    }
}

export async function syncAllOfflineData() {
    if (isSyncing || !navigator.onLine) return;
    isSyncing = true;
    try {
        await syncCartToSupabase();
        await syncFavoritesToSupabase();
    } finally {
        isSyncing = false;
    }
}

export function setupAutoSync() {
    window.addEventListener('online', () => {
        syncAllOfflineData();
    });
    if (navigator.onLine) {
        setTimeout(() => syncAllOfflineData(), 2500);
    }
}

export function isOnline() {
    return navigator.onLine;
}

export { db };
