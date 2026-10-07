import { supabaseClient } from '../../core/config.js';
import { normalizeProductMedia, normalizeProductVariant } from '../../services/product-variants-media.js';

const VARIANT_SELECT = 'id,product_id,variant_key,label,color,size,sku,price,moq,active,sort_order,attributes';
const MEDIA_SELECT = 'id,product_id,variant_id,url,media_type,alt_text,sort_order,metadata';

function cleanText(value, maxLength = 500) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function normalizeMediaUrls(value) {
    const raw = Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/);
    const seen = new Set();

    return raw
        .map((item) => cleanText(item, 2000))
        .filter((url) => /^https?:\/\//i.test(url))
        .filter((url) => {
            const key = url.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, 100);
}

export function buildVariantKey({ key, color, size, sku } = {}) {
    const explicit = cleanText(key, 160);
    if (explicit) return explicit;

    const parts = [];
    const normalizedColor = cleanText(color, 100);
    const normalizedSize = cleanText(size, 100);
    const normalizedSku = cleanText(sku, 120);

    if (normalizedColor) parts.push('color:' + normalizedColor.toLowerCase().replace(/\s+/g, '-'));
    if (normalizedSize) parts.push('size:' + normalizedSize.toLowerCase().replace(/\s+/g, '-'));
    if (!parts.length && normalizedSku) parts.push('sku:' + normalizedSku.toLowerCase());
    return parts.join('|') || 'variant-' + Date.now().toString(36);
}

export function normalizeVariantEditorInput(input = {}) {
    const price = Number(input.price);
    const moq = input.moq == null || input.moq === '' ? null : String(input.moq).trim();
    const parsedSort = Number(input.sort_order);

    return {
        variant_key: buildVariantKey(input),
        label: cleanText(input.label, 300) || buildVariantKey(input),
        color: cleanText(input.color, 100),
        size: cleanText(input.size, 100),
        sku: cleanText(input.sku, 120),
        price: Number.isFinite(price) && price > 0 ? price : null,
        moq: moq || null,
        active: input.active !== false,
        sort_order: Number.isFinite(parsedSort) ? Math.max(0, Math.floor(parsedSort)) : 0,
        attributes: input.attributes && typeof input.attributes === 'object' ? input.attributes : {},
        mediaUrls: normalizeMediaUrls(input.mediaUrls)
    };
}

export async function loadProductVariantGraph(productId) {
    const id = Number(productId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('product_id_invalid');

    const [{ data: variants, error: variantsError }, { data: media, error: mediaError }] = await Promise.all([
        supabaseClient
            .from('product_variants')
            .select(VARIANT_SELECT)
            .eq('product_id', id)
            .neq('variant_key', 'legacy')
            .order('sort_order', { ascending: true }),
        supabaseClient
            .from('product_media')
            .select(MEDIA_SELECT)
            .eq('product_id', id)
            .order('sort_order', { ascending: true })
    ]);

    if (variantsError || mediaError) {
        throw new Error(variantsError?.message || mediaError?.message || 'variant_graph_load_failed');
    }

    const normalizedVariants = (variants || []).map(normalizeProductVariant).filter(Boolean);
    const normalizedMedia = (media || []).map(normalizeProductMedia).filter(Boolean);

    return {
        variants: normalizedVariants.map((variant) => ({
            ...variant,
            media: normalizedMedia
                .filter((item) => String(item.variant_id) === String(variant.id))
                .sort((a, b) => a.sort_order - b.sort_order)
        }))
    };
}

export async function saveProductVariantGraph(productId, input = {}) {
    const id = Number(productId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('product_id_invalid');

    const variant = normalizeVariantEditorInput(input);
    if (!variant.variant_key) throw new Error('variant_key_required');

    const { data, error } = await supabaseClient.rpc('save_product_variant_graph', {
        p_product_id: id,
        p_variant: {
            variant_key: variant.variant_key,
            label: variant.label,
            color: variant.color || null,
            size: variant.size || null,
            sku: variant.sku || null,
            price: variant.price,
            moq: variant.moq,
            active: variant.active,
            sort_order: variant.sort_order,
            attributes: variant.attributes
        },
        p_media_urls: variant.mediaUrls
    });

    if (error) throw error;
    return data;
}

export async function deleteProductVariant(variantId) {
    const id = cleanText(variantId, 100);
    if (!id) throw new Error('variant_id_invalid');

    const { data, error } = await supabaseClient.rpc('delete_product_variant', {
        p_variant_id: id
    });

    if (error) throw error;
    return Boolean(data);
}
