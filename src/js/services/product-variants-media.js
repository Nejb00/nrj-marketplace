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
        price: (() => {
            const value = row.price == null ? null : Number(row.price);
            return Number.isFinite(value) && value > 0 ? value : null;
        })(),
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

export function getActiveProductVariants(product) {
    const variants = Array.isArray(product?.variants)
        ? product.variants.map(normalizeProductVariant).filter((variant) => variant && variant.active)
        : [];
    const realVariants = variants.filter((variant) => variant.variant_key !== 'legacy');
    return realVariants.length ? realVariants : [];
}

function unique(values) {
    return [...new Set(values.map(cleanText).filter(Boolean))];
}

export function getVariantOptionValues(product) {
    const variants = getActiveProductVariants(product);
    if (!variants.length) {
        return {
            colors: cleanText(product?.couleurs).split(',').map(cleanText).filter(Boolean),
            sizes: cleanText(product?.tailles).split(',').map(cleanText).filter(Boolean)
        };
    }

    return {
        colors: unique(variants.map((variant) => variant.color)),
        sizes: unique(variants.map((variant) => variant.size))
    };
}

function variantMatches(variant, color, size) {
    const wantedColor = cleanText(color);
    const wantedSize = cleanText(size);
    if (wantedColor && variant.color !== wantedColor) return false;
    if (wantedSize && variant.size !== wantedSize) return false;
    return true;
}

export function isValidVariantSelection(product, color = '', size = '') {
    const variants = getActiveProductVariants(product);
    if (!variants.length) return true;

    return variants.some((variant) =>
        (!cleanText(color) || variant.color === cleanText(color)) &&
        (!cleanText(size) || variant.size === cleanText(size))
    );
}

export function getCompatibleVariantValues(product, type, selection = {}) {
    const variants = getActiveProductVariants(product);
    if (!variants.length) return null;

    const color = cleanText(selection.color);
    const size = cleanText(selection.size);

    const compatible = variants.filter((variant) => {
        if (type === 'color') {
            return !size || variant.size === size;
        }
        if (type === 'size') {
            return !color || variant.color === color;
        }
        return true;
    });

    const values = type === 'color'
        ? compatible.map((variant) => variant.color)
        : compatible.map((variant) => variant.size);

    return new Set(unique(values));
}

export function resolveProductVariant(product, color = '', size = '') {
    const variants = getActiveProductVariants(product);
    if (!variants.length) return null;

    const wantedColor = cleanText(color);
    const wantedSize = cleanText(size);

    if (wantedColor && wantedSize) {
        const exact = variants.find((variant) => variantMatches(variant, wantedColor, wantedSize));
        if (exact) return exact;
    }

    if (wantedColor) {
        const colorOnly = variants.find((variant) =>
            variant.color === wantedColor && !variant.size
        );
        if (colorOnly) return colorOnly;

        const firstColor = variants.find((variant) => variant.color === wantedColor);
        if (firstColor) return firstColor;
    }

    if (wantedSize) {
        const sizeOnly = variants.find((variant) =>
            variant.size === wantedSize && !variant.color
        );
        if (sizeOnly) return sizeOnly;

        const firstSize = variants.find((variant) => variant.size === wantedSize);
        if (firstSize) return firstSize;
    }

    return variants[0] || null;
}

export function getVariantMedia(product, variant) {
    if (!variant) return [];

    const media = Array.isArray(product?.media)
        ? product.media.map(normalizeProductMedia).filter(Boolean)
        : [];

    return media
        .filter((item) => String(item.variant_id) === String(variant.id))
        .sort((a, b) => a.sort_order - b.sort_order);
}

export function getProductGalleryForSelection(product, color = '', size = '') {
    const variants = getActiveProductVariants(product);
    if (!variants.length) return getProductGalleryMedia(product);

    const selected = resolveProductVariant(product, color, size);
    if (!selected) return getProductGalleryMedia(product);

    // Pour un produit à variantes couleur+taille, une sélection de couleur
    // doit pouvoir afficher toute la galerie de cette couleur même si chaque
    // taille possède sa propre ligne de variante.
    const wantedColor = cleanText(color);
    if (wantedColor && !cleanText(size)) {
        const sameColor = variants
            .filter((variant) => variant.color === wantedColor)
            .sort((a, b) => a.sort_order - b.sort_order);

        const byColor = sameColor
            .flatMap((variant) => getVariantMedia(product, variant))
            .sort((a, b) => a.sort_order - b.sort_order);

        if (byColor.length) {
            const seen = new Set();
            return byColor.filter((item) => {
                if (seen.has(item.url)) return false;
                seen.add(item.url);
                return true;
            });
        }
    }

    const selectedMedia = getVariantMedia(product, selected);
    if (selectedMedia.length) return selectedMedia;

    return getProductGalleryMedia(product, selected.id);
}

export function getVariantThumbnail(product, color = '', size = '') {
    const gallery = getProductGalleryForSelection(product, color, size);
    return gallery.find((item) => item.media_type === 'image') || gallery[0] || null;
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
