import { supabaseClient } from './config.js';
import { state } from './state.js';
import { showToast } from './utils.js';

// ✅ ÉTAPE 1 & 2 : Caching local + Fetch optimisé
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let productCache = { data: null, timestamp: 0 };

export async function trackPopularity(productId, points) {
    const { error } = await supabaseClient.rpc('increment_popularity', { product_id: productId, amount: points });
    if (error) console.warn('Erreur tracking popularité:', error);
}

// ✅ ÉTAPE 1 : Optimisation requête - SELECT seulement colonnes essentielles + LIMIT
export async function fetchProducts(forceRefresh = false) {
    const now = Date.now();
    
    // Retourner le cache s'il est frais
    if (!forceRefresh && productCache.data && (now - productCache.timestamp) < CACHE_DURATION) {
        state.products = productCache.data;
        return;
    }
    
    try {
        // Récupérez SEULEMENT les colonnes essentielles pour la liste
        const { data, error } = await supabaseClient
            .from('products')
            .select('id, name, price, category, image, popularity_score, created_at, moq, tailles, couleurs')
            .order('created_at', { ascending: false })
            .limit(500); // Limite raisonnable
        
        if (error) throw error;
        state.products = data || [];
        
        // Mise à jour du cache
        productCache = { data: state.products, timestamp: now };
    } catch (err) {
        console.error('Erreur fetch products:', err);
        state.products = [];
        showToast('❌ Erreur de connexion.');
        const grid = document.getElementById('productsGrid');
        if (grid) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;"><div style="font-size:3rem;margin-bottom:1rem;">⚠️</div><h3 style="color:var(--text);margin-bottom:0.5rem;">Impossible de charger les produits</h3><button onclick="location.reload()" style="background:var(--primary);color:white;border:none;padding:0.8rem 2rem;border-radius:50px;font-weight:700;cursor:pointer;">🔄 Réessayer</button></div>';
        }
    }
}

// ✅ ÉTAPE 2 : Nouvelle fonction pour les détails complets (modal)
export async function fetchProductDetails(productId) {
    try {
        const { data, error } = await supabaseClient
            .from('products')
            .select('*') // Tous les champs ici, mais SEULEMENT quand on ouvre la modal
            .eq('id', productId)
            .single();
        
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Erreur fetch product details:', err);
        return null;
    }
}

export async function insertProduct(p) {
    const { data, error } = await supabaseClient.from('products').insert([p]).select();
    if (error) throw error;
    // Invalidate cache après ajout
    productCache = { data: null, timestamp: 0 };
    return data;
}

export async function deleteProductFromSupabase(id) {
    const { error } = await supabaseClient.from('products').delete().eq('id', id);
    if (error) throw error;
    // Invalidate cache après suppression
    productCache = { data: null, timestamp: 0 };
}

export async function updateProductInSupabase(id, updates) {
    const { error } = await supabaseClient.from('products').update(updates).eq('id', id);
    if (error) throw error;
    // Invalidate cache après mise à jour
    productCache = { data: null, timestamp: 0 };
}
