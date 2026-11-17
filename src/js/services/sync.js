/**
 * Synchronisation optionnelle IndexedDB → Supabase.
 * Chaque navigateur a son propre hash : on ne mélange pas les paniers.
 * Les commandes restent locales (WhatsApp est le canal réel).
 */

import { supabaseClient } from '../core/config.js';
import db from './db.js';

const SYNC_PENDING_KEY = 'nrj_sync_pending_v1';
const SYNC_PENDING_EVENT = 'nrj:local-state-changed';

let isSyncing = false;
let autoSyncSetup = false;
let pendingSyncInMemory = false;
let pendingRevision = 0;

function hasPendingSync() {
    if (pendingSyncInMemory) return true;
    try { return localStorage.getItem(SYNC_PENDING_KEY) === '1'; } catch { return false; }
}

function markPendingSync() {
    pendingSyncInMemory = true;
    pendingRevision += 1;
    try { localStorage.setItem(SYNC_PENDING_KEY, '1'); } catch {}
}

function clearPendingSync() {
    pendingSyncInMemory = false;
    try { localStorage.removeItem(SYNC_PENDING_KEY); } catch {}
}

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
        if (error) {
            console.warn('Sync panier:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.warn('Sync panier impossible:', err);
        return false;
    }
}

export async function syncFavoritesToSupabase() {
    try {
        const favorites = await db.getFavorites();
        const { error } = await supabaseClient
            .from('favorites')
            .upsert({
                user_id: await getSyncUserId(),
                product_ids: favorites
            });
        if (error) {
            console.warn('Sync favoris:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.warn('Sync favoris impossible:', err);
        return false;
    }
}

export async function syncAllOfflineData() {
    if (isSyncing || !navigator.onLine || !hasPendingSync()) return;

    isSyncing = true;
    const revisionAtStart = pendingRevision;
    try {
        const cartSynced = await syncCartToSupabase();
        const favoritesSynced = await syncFavoritesToSupabase();

        // Ne pas effacer une modification arrivée pendant les requêtes en cours.
        if (cartSynced && favoritesSynced && pendingRevision === revisionAtStart) {
            clearPendingSync();
        }
    } finally {
        isSyncing = false;
        if (navigator.onLine && hasPendingSync() && pendingRevision !== revisionAtStart) {
            Promise.resolve().then(() => syncAllOfflineData());
        }
    }
}

export function setupAutoSync() {
    if (autoSyncSetup) return;
    autoSyncSetup = true;

    window.addEventListener(SYNC_PENDING_EVENT, () => {
        markPendingSync();
        void syncAllOfflineData();
    });
    window.addEventListener('online', () => {
        if (hasPendingSync()) void syncAllOfflineData();
    });

    // À l'ouverture, ne synchroniser que si une vraie modification locale
    // reste en attente depuis une session précédente (ex. modification hors ligne).
    if (hasPendingSync()) void syncAllOfflineData();
}

export function isOnline() {
    return navigator.onLine;
}

export { db };
