import { supabaseClient } from './config.js';
import { state } from './state.js';
import { showToast } from './utils.js';

// ✅ Cache mémoire (5 min) + cache persistant (survit à la mort de l'app)
const PRODUCTS_CACHE_KEY = 'nrj_products_cache';
const CACHE_DURATION = 5 * 60 * 1000;
let productCache = { data: null, timestamp: 0 };

export async function trackPopularity(productId, points) {
    const { error } = await supabaseClient.rpc('increment_popularity', { product_id: productId, amount: points });
    if (error) console.warn('Erreur tracking popularité:', error);
}

export async function fetchProducts(forceRefresh = false) {
    const now = Date.now();

    // Retourner le cache mémoire s'il est frais
    if (!forceRefresh && productCache.data && (now - productCache.timestamp) < CACHE_DURATION) {
        state.products = productCache.data;
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('id, name, price, category, image, popularity_score, created_at, moq, tailles, couleurs')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;
        state.products = data || [];

        // Cache mémoire
        productCache = { data: state.products, timestamp: now };

        // ✅ Gravure localStorage : le PWA redémarre même sans réseau
        // Gestion du quota : si ça dépasse ~4.5 Mo, on tronque les produits les
        // moins récents pour rester sous la limite (localStorage ~5 Mo) sans crasher.
        try {
            let toStore = state.products;
            let payload = JSON.stringify({ data: toStore, timestamp: now });
            while (payload.length > 4_500_000 && toStore.length > 50) {
                toStore = toStore.slice(0, Math.floor(toStore.length * 0.8));
                payload = JSON.stringify({ data: toStore, timestamp: now });
            }
            localStorage.setItem(PRODUCTS_CACHE_KEY, payload);
        } catch (err) {
            console.warn('localStorage quota dépassé, cache produits ignoré:', err);
        }
    } catch (err) {
        console.error('Erreur fetch products:', err);

        // ✅ Réseau mort → catalogue mémorisé au lieu de l'écran vide
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || 'null'); } catch {}
        if (saved && Array.isArray(saved.data) && saved.data.length) {
            state.products = saved.data;
            productCache = { data: saved.data, timestamp: now };
            showToast('📴 Hors ligne — catalogue mémorisé');
            return;
        }

        state.products = [];
        showToast('❌ Erreur de connexion.');
        const grid = document.getElementById('productsGrid');
        if (grid) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;"><div style="font-size:3rem;margin-bottom:1rem;">⚠️</div><h3 style="color:var(--text);margin-bottom:0.5rem;">Impossible de charger les produits</h3><button onclick="location.reload()" style="background:var(--primary);color:white;border:none;padding:0.8rem 2rem;border-radius:50px;font-weight:700;cursor:pointer;">🔄 Réessayer</button></div>';
        }
    }
}

export async function fetchProductDetails(productId) {
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*')
            .eq('id', productId)
            .single();

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Erreur fetch product details:', err);
        return null;
    }
}

// ✅ CRUD admin — importé par admin.js et product-edit.js
export async function insertProduct(product) {
    const { data, error } = await supabaseClient
        .from('products')
        .insert([product])
        .select();
    if (error) throw error;
    return data;
}

export async function deleteProductFromSupabase(id) {
    const { error } = await supabaseClient
        .from('products')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

export async function updateProductInSupabase(id, updates) {
    const { error } = await supabaseClient
        .from('products')
        .update(updates)
        .eq('id', id);
    if (error) throw error;
}
