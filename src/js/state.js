/**
 * Source de vérité unique du site.
 * Panier / favoris / commandes : IndexedDB + fallback localStorage.
 */

import db from './db.js';

export const state = {
    products: [],
    /** Arbre complet des catégories (table categories) */
    categories: [],
    /** Map id -> catégorie pour lookup O(1) */
    categoriesById: new Map(),
    cart: [],
    favorites: [],
    orders: [],
    /** Filtre courant : 'all' | 'favorites' | category_id (uuid) */
    currentFilter: 'all',
    currentQuickFilter: 'all',
    searchQuery: '',
    currentProductId: null,
    modalOpen: false,
    displayedCount: 0,
    currentFilteredProducts: [],
    observer: null,
    scrollObserver: null,
    isAdminLoggedIn: false,
    rotationList: ['Rechercher un produit...', 'Tendances de Chine 🇨🇳', 'Arrivages de Turquie 🇹🇷', 'Sélection France 🇫🇷', 'Grossiste direct...'],
    currentPlaceholderIndex: 0,
    isVoiceListening: false,
    searchViewState: {
        query: '',
        filters: {
            priceMin: null,
            priceMax: null,
            categories: [],
            sizes: [],
            colors: []
        },
        sortBy: 'relevance',
        viewMode: 'grid'
    }
};

function readLocal(key, fallback) {
    try {
        const v = JSON.parse(localStorage.getItem(key) || 'null');
        return v == null ? fallback : v;
    } catch {
        return fallback;
    }
}

function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function normalizeFavorites(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((f) => {
        if (typeof f === 'number') return f;
        if (f && typeof f === 'object' && f.productId != null) return Number(f.productId);
        const n = Number(f);
        return Number.isFinite(n) ? n : null;
    }).filter((id) => id != null && !Number.isNaN(id));
}

function normalizeCart(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => {
        if (!item || item.productId == null) return null;
        return {
            productId: item.productId,
            quantity: Number(item.quantity) || 1,
            taille: item.taille || '',
            couleur: item.couleur || item.color || '',
            moq: Number(item.moq) || 1
        };
    }).filter(Boolean);
}

export async function loadPersistedState() {
    let cart = [];
    let favorites = [];
    let orders = [];

    try {
        cart = normalizeCart(await db.getCart());
        favorites = normalizeFavorites(await db.getFavorites());
        orders = (await db.getOrders()) || [];
    } catch (err) {
        console.warn('IndexedDB lecture impossible, fallback localStorage', err);
    }

    if (!cart.length) cart = normalizeCart(readLocal('nrj_cart_v32', []));
    if (!favorites.length) favorites = normalizeFavorites(readLocal('nrj_favorites', []));
    if (!Array.isArray(orders) || !orders.length) orders = readLocal('nrj_orders', []) || [];

    state.cart = cart;
    state.favorites = favorites;
    state.orders = Array.isArray(orders) ? orders : [];
}

export async function saveCart() {
    writeLocal('nrj_cart_v32', state.cart);
    try { await db.putCart(state.cart); } catch (err) { console.warn('IndexedDB panier', err); }
}

export async function saveFavorites() {
    writeLocal('nrj_favorites', state.favorites);
    try { await db.putFavorites(state.favorites); } catch (err) { console.warn('IndexedDB favoris', err); }
}

export async function saveOrders() {
    writeLocal('nrj_orders', state.orders);
    try { await db.putOrders(state.orders); } catch (err) { console.warn('IndexedDB commandes', err); }
}

export function trackViewedItem(name) {
    if (!name) return;
    const formattedName = name.length > 22 ? name.substring(0, 22) + '...' : name;
    state.rotationList = state.rotationList.filter((item) => item !== formattedName);
    state.rotationList.unshift(formattedName);
    if (state.rotationList.length > 8) state.rotationList.pop();
}

/** Libellé affichable d'une catégorie ("Parent > Sous" si sous-cat). */
export function getCategoryLabel(categoryId) {
    if (!categoryId) return null;
    const cat = state.categoriesById.get(categoryId);
    if (!cat) return null;
    if (cat.parent_id) {
        const parent = state.categoriesById.get(cat.parent_id);
        return parent ? `${parent.name} > ${cat.name}` : cat.name;
    }
    return cat.name;
}

/** Nom court (feuille) pour tags / recherche. */
export function getCategoryName(categoryId) {
    if (!categoryId) return null;
    const cat = state.categoriesById.get(categoryId);
    return cat ? cat.name : null;
}

/**
 * Ids de la catégorie sélectionnée + toutes ses sous-catégories.
 * Si on filtre sur un top-niveau, on inclut ses enfants.
 * Si on filtre sur une sous-cat, on ne prend que celle-ci.
 */
export function getCategoryFilterIds(categoryId) {
    if (!categoryId || categoryId === 'all') return null;
    const ids = [categoryId];
    state.categories.forEach(c => {
        if (c.parent_id === categoryId) ids.push(c.id);
    });
    return ids;
}
