import { supabaseClient } from '../core/config.js';

const REQUEST_TIMEOUT = 10000;

async function fetchWithTimeout(promise, timeout = REQUEST_TIMEOUT) {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout: La requête a pris trop de temps')), timeout);
    });
    return Promise.race([promise, timeoutPromise]);
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
