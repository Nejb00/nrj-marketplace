import { supabaseClient } from './config.js';
import { state } from './state.js';
import { showToast } from './utils.js';
import db from './db.js';

const PRODUCTS_CACHE_KEY = 'nrj_products_cache';
const CACHE_DURATION = 5 * 60 * 1000;
let productCache = { data: null, timestamp: 0 };

const REQUEST_TIMEOUT = 10000;

async function fetchWithTimeout(promise, timeout = REQUEST_TIMEOUT) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout: La requête a pris trop de temps')), timeout);
  });
  return Promise.race([promise, timeoutPromise]);
}

const USER_HASH = (() => {
  try {
    let h = localStorage.getItem('nrj_user_hash');
    if (!h) {
      h = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('nrj_user_hash', h);
    }
    return h;
  } catch { return 'anon'; }
})();

export async function trackPopularity(productId, points) {
    try {
        const { error } = await fetchWithTimeout(
            supabaseClient.rpc('increment_popularity', { product_id: productId, amount: points })
        );
        if (error) console.warn('Erreur tracking popularité:', error);
    } catch (err) {
        console.warn('Timeout tracking popularité:', err.message);
    }
}

export async function trackView(productId) {
    try {
        await fetchWithTimeout(
            supabaseClient.from('product_views').insert({
                user_hash: USER_HASH,
                product_id: productId
            })
        );
    } catch (e) {
        // Silencieux : la vue anonyme ne doit pas casser l'app
    }
}

export async function getRelatedProducts(productId, limit = 8) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.rpc('get_related_products', { pid: productId, lim: limit })
        );
        if (error) throw error;
        return (data || []).map(r => r.product_id);
    } catch (e) {
        return [];
    }
}

/**
 * Récupère l'arbre complet des catégories (top-niveau + sous-catégories).
 * Chaque ligne a : id, name, parent_id, slug, icon, display_order.
 * parent_id === null => catégorie top-niveau.
 */
export async function fetchCategories() {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient
                .from('categories')
                .select('id, name, parent_id, slug, icon, display_order')
                .order('display_order', { ascending: true })
        );
        if (error) throw error;
        const list = data || [];
        state.categories = list;
        state.categoriesById = new Map(list.map(c => [c.id, c]));
        return list;
    } catch (err) {
        console.error('Erreur fetch categories:', err);
        state.categories = [];
        state.categoriesById = new Map();
        return [];
    }
}

/**
 * Sous-catégories d'un parent + image du produit le plus récent (RPC).
 * Un seul appel réseau par parent_id (cache dans state.subcategoryBubblesCache).
 */
export async function fetchSubcategoriesWithLatestImage(parentId, forceRefresh = false) {
    if (!parentId) return [];

    if (!forceRefresh && state.subcategoryBubblesCache[parentId]) {
        return state.subcategoryBubblesCache[parentId];
    }

    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.rpc('get_subcategories_with_latest_image', {
                p_parent_id: parentId
            })
        );
        if (error) throw error;
        const rows = data || [];
        state.subcategoryBubblesCache[parentId] = rows;
        return rows;
    } catch (err) {
        console.error('Erreur RPC get_subcategories_with_latest_image:', err);
        return state.subcategoryBubblesCache[parentId] || [];
    }
}

/** Enrichit chaque produit avec category_name (jointure client via category_id). */
function enrichProductsWithCategoryNames(products) {
    return (products || []).map(p => {
        const cat = p.category_id ? state.categoriesById.get(p.category_id) : null;
        return {
            ...p,
            category_name: cat ? cat.name : null
        };
    });
}

export async function fetchProducts(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && productCache.data && (now - productCache.timestamp) < CACHE_DURATION) {
        state.products = productCache.data;
        return;
    }
    
    try {
        const cached = await db.getProductsCache();
        if (cached && (now - cached.timestamp) < CACHE_DURATION) {
            state.products = enrichProductsWithCategoryNames(cached.products);
            productCache = { data: state.products, timestamp: now };
            return;
        }

        const { data, error } = await fetchWithTimeout(
            supabaseClient
                .from('products')
                .select('id, name, price, category_id, image, popularity_score, created_at, moq, tailles, couleurs')
                .order('created_at', { ascending: false })
                .limit(500)
        );
        
        if (error) throw error;
        state.products = enrichProductsWithCategoryNames(data || []);
        productCache = { data: state.products, timestamp: now };
        
        try {
            await db.putProductsCache(state.products);
        } catch (err) {
            console.warn('IndexedDB produits cache:', err);
            try {
                let toStore = state.products;
                let payload = JSON.stringify({ data: toStore, timestamp: now });
                while (payload.length > 4_500_000 && toStore.length > 50) {
                    toStore = toStore.slice(0, Math.floor(toStore.length * 0.8));
                    payload = JSON.stringify({ data: toStore, timestamp: now });
                }
                localStorage.setItem(PRODUCTS_CACHE_KEY, payload);
            } catch (err2) { 
                console.warn('localStorage quota dépassé, cache produits ignoré:', err2); 
            }
        }
    } catch (err) {
        console.error('Erreur fetch products:', err);
        
        try {
            const cached = await db.getProductsCache();
            if (cached && cached.products.length) {
                state.products = enrichProductsWithCategoryNames(cached.products);
                productCache = { data: state.products, timestamp: now };
                showToast('📴 Hors ligne — catalogue mémorisé (IndexedDB)');
                return;
            }
        } catch {}

        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || 'null'); } catch {}
        if (saved && Array.isArray(saved.data) && saved.data.length) {
            state.products = enrichProductsWithCategoryNames(saved.data);
            productCache = { data: state.products, timestamp: now };
            showToast('📴 Hors ligne — catalogue mémorisé');
            return;
        }
        
        if (err.message === 'Timeout: La requête a pris trop de temps') {
            showToast('⏱️ Requête trop longue. Vérifiez votre connexion.');
        } else {
            showToast('❌ Erreur de connexion.');
        }
        
        const grid = document.getElementById('productsGrid');
        if (grid) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;"><div style="font-size:3rem;margin-bottom:1rem;">⚠️</div><h3 style="color:var(--text);margin-bottom:0.5rem;">Impossible de charger les produits</h3><button onclick="location.reload()" style="background:var(--primary);color:white;border:none;padding:0.8rem 2rem;border-radius:50px;font-weight:700;cursor:pointer;">🔄 Réessayer</button></div>';
        }
    }
}

export async function fetchProductDetails(productId) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient
                .from('products')
                .select('*')
                .eq('id', productId)
                .single()
        );
        if (error) throw error;
        if (data) {
            const cat = data.category_id ? state.categoriesById.get(data.category_id) : null;
            data.category_name = cat ? cat.name : null;
        }
        return data;
    } catch (err) {
        console.error('Erreur fetch product details:', err);
        return null;
    }
}

export async function insertProduct(product) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient
                .from('products')
                .insert([product])
                .select()
        );
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Erreur insert product:', err);
        throw err;
    }
}

export async function deleteProductFromSupabase(id) {
    try {
        const { error } = await fetchWithTimeout(
            supabaseClient
                .from('products')
                .delete()
                .eq('id', id)
        );
        if (error) throw error;
    } catch (err) {
        console.error('Erreur delete product:', err);
        throw err;
    }
}

export async function updateProductInSupabase(id, updates) {
    try {
        const { error } = await fetchWithTimeout(
            supabaseClient
                .from('products')
                .update(updates)
                .eq('id', id)
        );
        if (error) throw error;
    } catch (err) {
        console.error('Erreur update product:', err);
        throw err;
    }
}
