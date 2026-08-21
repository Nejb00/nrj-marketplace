/**
 * Synchronisation optionnelle IndexedDB → Supabase.
 * Chaque navigateur a son propre hash : on ne mélange pas les paniers.
 * Les commandes restent locales (WhatsApp est le canal réel).
 */

import { supabaseClient } from './config.js';
import db from './db.js';

let isSyncing = false;

function getSyncUserId() {
    try {
        let h = localStorage.getItem('nrj_user_hash');
        if (!h) {
            h = Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem('nrj_user_hash', h);
        }
        return h;
    } catch {
        return 'anon';
    }
}

export async function syncCartToSupabase() {
    try {
        const cart = await db.getCart();
        if (!cart.length) return;
        const { error } = await supabaseClient
            .from('carts')
            .upsert({
                user_id: getSyncUserId(),
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
        if (!favorites.length) return;
        const { error } = await supabaseClient
            .from('favorites')
            .upsert({
                user_id: getSyncUserId(),
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
