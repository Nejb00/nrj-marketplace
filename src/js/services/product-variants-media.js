import { supabaseClient } from '../core/config.js';

const LEGACY_MEDIA_FIELDS = ['image', 'image2', 'image3', 'image4', 'image5', 'image6'];
const REQUEST_TIMEOUT = 10000;

function fetchWithTimeout(promise, timeout = REQUEST_TIMEOUT) {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('product_variants_media_timeout')), timeout);
    });
    return Promise.race([promise, timeoutPromise]);
}

function cleanText(value) {
    return String(value ?? '').trim();
}

export function collectLegacyProductMedia(product) {
    return LEGACY_MEDIA_FIELDS
        .map((field, index) => ({
            id: null,
            product_id: product?.id ?? null,
            variant_id: null,
            url: cleanText(product?.[field]),
            media_type: 'image',
            alt_text: cleanText(product?.name) || 'Produit',
            sort_order: index
        }))
        .filter((media) => media.url);
}

export function normalizeProductVariant(row) {
    if (!row || row.id == null || row.product_id == null) return null;
    return {
        id: row.id,
        product_id: row.product_id,
        variant_key: cleanText(row.variant_key),
        label: cleanText(row.label),
        color: cleanText(row.color),
        size: cleanText(row.size),
        sku: cleanText(row.sku),
        price: row.price == null ? null : Number(row.price),
        moq: row.moq == null ? null : cleanText(row.moq),
        active: row.active !== false,
        sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        attributes: row.attributes && typeof row.attributes === 'object' ? row.attributes : {}
    };
}

export function normalizeProductMedia(row) {
    const url = cleanText(row?.url);
    if (!row || row.id == null || row.product_id == null || !url) return null;
    return {
        id: row.id,
        product_id: row.product_id,
        variant_id: row.variant_id ?? null,
        url,
        media_type: row.media_type === 'video' ? 'video' : 'image',
        alt_text: cleanText(row.alt_text),
        sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
        metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
    };
}

export function getProductGalleryMedia(product, variantId = null) {
    const media = Array.isArray(product?.media)
        ? product.media.map(normalizeProductMedia).filter(Boolean)
        : [];

    if (variantId != null) {
        const scoped = media
            .filter((item) => String(item.variant_id) === String(variantId))
            .sort((a, b) => a.sort_order - b.sort_order);
        if (scoped.length) return scoped;
    }

    const unbound = media
        .filter((item) => item.variant_id == null)
        .sort((a, b) => a.sort_order - b.sort_order);
    if (unbound.length) return unbound;

    const productWide = media.sort((a, b) => a.sort_order - b.sort_order);
    if (productWide.length) return productWide;

    return collectLegacyProductMedia(product);
}

export async function hydrateProductVariantsMedia(product) {
    if (!product?.id) return product;

    try {
        const [{ data: variants, error: variantsError }, { data: media, error: mediaError }] = await Promise.all([
            fetchWithTimeout(
                supabaseClient
                    .from('product_variants')
                    .select('id,product_id,variant_key,label,color,size,sku,price,moq,active,sort_order,attributes')
                    .eq('product_id', product.id)
                    .order('sort_order', { ascending: true })
            ),
            fetchWithTimeout(
                supabaseClient
                    .from('product_media')
                    .select('id,product_id,variant_id,url,media_type,alt_text,sort_order,metadata')
                    .eq('product_id', product.id)
                    .order('sort_order', { ascending: true })
            )
        ]);

        if (variantsError || mediaError) {
            return product;
        }

        return {
            ...product,
            variants: (variants || []).map(normalizeProductVariant).filter(Boolean),
            media: (media || []).map(normalizeProductMedia).filter(Boolean)
        };
    } catch {
        // Migration non encore déployée, indisponibilité réseau ou réponse lente :
        // le produit legacy reste pleinement utilisable.
        return product;
    }
}
