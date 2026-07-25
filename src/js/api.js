import { supabaseClient } from './config.js';
import { state } from './state.js';
import { showToast } from './utils.js';

export async function trackPopularity(productId, points) {
    const { error } = await supabaseClient.rpc('increment_popularity', { product_id: productId, amount: points });
    if (error) console.warn('Erreur tracking popularité:', error);
}

export async function fetchProducts() {
    try {
        const { data, error } = await supabaseClient.from('products').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        state.products = data || [];
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

export async function insertProduct(p) {
    const { data, error } = await supabaseClient.from('products').insert([p]).select();
    if (error) throw error;
    return data;
}

export async function deleteProductFromSupabase(id) {
    const { error } = await supabaseClient.from('products').delete().eq('id', id);
    if (error) throw error;
}

export async function updateProductInSupabase(id, updates) {
    const { error } = await supabaseClient.from('products').update(updates).eq('id', id);
    if (error) throw error;
}
