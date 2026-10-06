import { supabaseClient } from '../core/config.js';
import { state } from '../core/state.js';
import { showToast } from '../utils/dom-helpers.js';
import db from '../services/db.js';

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

let popularityAuthPromise = null;

async function ensurePopularityAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user?.id) return session.user.id;

    if (!popularityAuthPromise) {
        popularityAuthPromise = supabaseClient.auth.signInAnonymously()
            .then(({ data, error }) => {
                if (error) throw error;
                return data.user.id;
            })
            .finally(() => {
                popularityAuthPromise = null;
            });
    }

    return popularityAuthPromise;
}

export async function trackPopularity(productId, points) {
    try {
        await ensurePopularityAuth();
        const { error } = await fetchWithTimeout(
            supabase.rpc('increment_popularity', { product_id: productId, amount: points })
        );
        if (error) console.warn('Erreur tracking popularité:', error);
    } catch (err) {
        console.warn('Timeout tracking popularité:', err.message);
    }
}

export async function trackView(productId) {
    try {
        // product_views n'autorise que les utilisateurs authentifiés.
        // Le suivi doit donc attendre la même session anonyme que la popularité,
        // sinon l'appel de la vue peut partir en rôle anon et être silencieusement refusé.
        await ensurePopularityAuth();
        await fetchWithTimeout(
            supabaseClient.from('product_views').insert({
                user_hash: USER_HASH,
                product_id: productId
            })
        );
    } catch (e) {
        // Silencieux
    }
}

export async function getRelatedProducts(productId, limit = 8) {
    try {
        // Le RPC s'appuie sur product_views, accessible uniquement aux
        // utilisateurs authentifiés. Sur une première ouverture, attendre
        // donc la session anonyme avant d'appeler le RPC.
        await ensurePopularityAuth();
        const { data, error } = await fetchWithTimeout(
            supabaseClient.rpc('get_related_products', { pid: productId, lim: limit })
        );
        if (error) throw error;
        return (data || []).map(r => r.product_id);
    } catch (e) {
        return [];
    }
}

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

export async function fetchParentCategoriesRanked() {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.rpc('get_parent_categories_ranked')
        );
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Erreur RPC get_parent_categories_ranked:', err);
        return state.categories.filter(c => c.parent_id === null);
    }
}

export async function fetchTopPopularSubcategories(limit = 20) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.rpc('get_top_popular_subcategories', { lim: limit })
        );
        if (error) {
            const retry = await fetchWithTimeout(
                supabaseClient.rpc('get_top_popular_subcategories', { p_limit: limit })
            );
            if (retry.error) throw retry.error;
            return retry.data || [];
        }
        return data || [];
    } catch (err) {
        console.error('Erreur RPC get_top_popular_subcategories:', err);
        try {
            const { data, error } = await fetchWithTimeout(
                supabaseClient.rpc('get_top_popular_subcategories', { limit })
            );
            if (!error) return data || [];
        } catch {}
        return [];
    }
}

export async function fetchSubcategoriesByPopularity(parentId) {
    if (!parentId) return [];
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.rpc('get_subcategories_by_popularity', {
                p_parent_id: parentId
            })
        );
        if (error) {
            const retry = await fetchWithTimeout(
                supabaseClient.rpc('get_subcategories_by_popularity', {
                    parent_id: parentId
                })
            );
            if (retry.error) throw retry.error;
            return retry.data || [];
        }
        return data || [];
    } catch (err) {
        console.error('Erreur RPC get_subcategories_by_popularity:', err);
        return [];
    }
}

function enrichProductsWithCategoryNames(products) {
    return (products || []).map(p => {
        const cat = p.category_id ? state.categoriesById.get(p.category_id) : null;
        return {
            ...p,
            category_name: cat ? cat.name : null
        };
    });
}

const PRODUCT_SELECT_FULL =
    'id, name, price, category_id, image, popularity_score, orders_count, created_at, moq, tailles, couleurs, video_url';
const PRODUCT_SELECT_WITH_ORDERS =
    'id, name, price, category_id, image, popularity_score, orders_count, created_at, moq, tailles, couleurs';
const PRODUCT_SELECT_BASE =
    'id, name, price, category_id, image, popularity_score, created_at, moq, tailles, couleurs';

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

        let data = null;
        let error = null;

        ({
            data,
            error
        } = await fetchWithTimeout(
            supabaseClient
                .from('products')
                .select(PRODUCT_SELECT_FULL)
                .order('created_at', { ascending: false })
                .limit(500)
        ));

        // Fallback si video_url absent
        if (error) {
            ({
                data,
                error
            } = await fetchWithTimeout(
                supabaseClient
                    .from('products')
                    .select(PRODUCT_SELECT_WITH_ORDERS)
                    .order('created_at', { ascending: false })
                    .limit(500)
            ));
        }

        // Fallback si orders_count n'existe pas encore en base
        if (error) {
            ({
                data,
                error
            } = await fetchWithTimeout(
                supabaseClient
                    .from('products')
                    .select(PRODUCT_SELECT_BASE)
                    .order('created_at', { ascending: false })
                    .limit(500)
            ));
        }
        
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
            grid.replaceChildren();

            const wrapper = document.createElement('div');
            wrapper.style.gridColumn = '1 / -1';
            wrapper.style.textAlign = 'center';
            wrapper.style.padding = '3rem';

            const icon = document.createElement('div');
            icon.style.fontSize = '3rem';
            icon.style.marginBottom = '1rem';
            icon.textContent = '⚠️';

            const title = document.createElement('h3');
            title.style.color = 'var(--text)';
            title.style.marginBottom = '0.5rem';
            title.textContent = 'Impossible de charger les produits';

            const retry = document.createElement('button');
            retry.type = 'button';
            retry.style.background = 'var(--primary)';
            retry.style.color = 'white';
            retry.style.border = 'none';
            retry.style.padding = '0.8rem 2rem';
            retry.style.borderRadius = '50px';
            retry.style.fontWeight = '700';
            retry.style.cursor = 'pointer';
            retry.textContent = '🔄 Réessayer';
            retry.addEventListener('click', () => location.reload());

            wrapper.append(icon, title, retry);
            grid.appendChild(wrapper);
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

export async function fetchProductImports(limit = 10) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient
                .from('product_imports')
                .select('id, source_image, raw_text, product_name, description, supplier_price, supplier_currency, moq, variants, category_id, category_confidence, calculated_price, cloudinary_urls, overall_confidence, ai_analysis, status, error_code, created_at, updated_at')
                .order('created_at', { ascending: false })
                .limit(limit)
        );
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Erreur fetch product imports:', err);
        return [];
    }
}

export async function insertProductImport(productImport) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient
                .from('product_imports')
                .insert([productImport])
                .select('id, source_image, raw_text, product_name, status, created_at, updated_at')
                .single()
        );
        if (error) throw error;
        return data;
    } catch (err) {
        console.error('Erreur insert product import:', err);
        throw err;
    }
}

export async function analyzeProductImport(importId, imageDataUrl = null, rawText = '') {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.functions.invoke('analyze-product-import', {
                body: { importId, imageDataUrl, rawText }
            }),
            30000
        );
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Analyse IA impossible');
        return data;
    } catch (err) {
        console.error('Erreur analyze product import:', err);
        throw err;
    }
}

export async function classifyProductImport(importId) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.functions.invoke('classify-product-import', {
                body: { importId }
            }),
            30000
        );
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error || 'Classification impossible');
        return data;
    } catch (err) {
        console.error('Erreur classify product import:', err);
        throw err;
    }
}

export async function priceProductImport(importId, pricing) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.functions.invoke('price-product-import', {
                body: { importId, pricing }
            }),
            30000
        );
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.detail || data?.error || 'Calcul du prix impossible');
        return data;
    } catch (err) {
        console.error('Erreur price product import:', err);
        throw err;
    }
}

export async function uploadProductImportMedia(importId, imageDataUrl) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.functions.invoke('upload-product-import-media', {
                body: { importId, imageDataUrl }
            }),
            30000
        );
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.detail || data?.error || 'Upload Cloudinary impossible');
        return data;
    } catch (err) {
        console.error('Erreur upload product import media:', err);
        throw err;
    }
}

export async function processProductImport(importId, imageDataUrl = null, pricing = null, approve = false) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.functions.invoke('process-product-import', {
                body: {
                    importId,
                    imageDataUrl,
                    pricing,
                    approve,
                    publish: true
                }
            }),
            120000
        );
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.detail || data?.error || 'Pipeline import impossible');
        return data;
    } catch (err) {
        console.error('Erreur process product import:', err);
        throw err;
    }
}

export async function publishProductImport(importId, approve = false) {
    try {
        const { data, error } = await fetchWithTimeout(
            supabaseClient.functions.invoke('publish-product-import', {
                body: { importId, approve }
            }),
            30000
        );
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.detail || data?.error || 'Publication impossible');
        return data;
    } catch (err) {
        console.error('Erreur publish product import:', err);
        throw err;
    }
}

export async function deleteProductImport(id) {
    try {
        const { error } = await fetchWithTimeout(
            supabaseClient
                .from('product_imports')
                .delete()
                .eq('id', id)
        );
        if (error) throw error;
    } catch (err) {
        console.error('Erreur delete product import:', err);
        throw err;
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
