import test from 'node:test';
import assert from 'node:assert/strict';

import {
    collectLegacyProductMedia,
    getCompatibleVariantValues,
    getProductGalleryForSelection,
    getProductGalleryMedia,
    getVariantCommercials,
    getVariantOptionValues,
    isValidVariantSelection,
    normalizeProductMedia,
    normalizeProductVariant,
} from '../src/js/services/product-variants-media.js';

test('collectLegacyProductMedia converts legacy image columns in order', () => {
    const media = collectLegacyProductMedia({
        id: 42,
        name: 'Chemise',
        image: 'one.jpg',
        image2: 'two.jpg',
        image3: '',
        image6: 'six.jpg',
    });

    assert.deepEqual(media.map((item) => item.url), ['one.jpg', 'two.jpg', 'six.jpg']);
    assert.deepEqual(media.map((item) => item.sort_order), [0, 1, 5]);
});

test('normalizeProductVariant keeps extensible attributes and optional pricing', () => {
    const variant = normalizeProductVariant({
        id: 'v1',
        product_id: 42,
        variant_key: 'color:white',
        color: 'White',
        size: null,
        price: null,
        moq: '5',
        attributes: { colorHex: '#fff', supplierCode: 'W-01' },
    });

    assert.equal(variant.variant_key, 'color:white');
    assert.equal(variant.color, 'White');
    assert.equal(variant.size, '');
    assert.equal(variant.price, null);
    assert.deepEqual(variant.attributes, { colorHex: '#fff', supplierCode: 'W-01' });
});

test('getProductGalleryMedia selects media grouped under the chosen variant', () => {
    const product = {
        id: 42,
        name: 'Passoire',
        image: 'legacy.jpg',
        media: [
            { id: 'm1', product_id: 42, variant_id: 'white', url: 'white-1.jpg', sort_order: 1 },
            { id: 'm2', product_id: 42, variant_id: 'white', url: 'white-2.jpg', sort_order: 2 },
            { id: 'm3', product_id: 42, variant_id: 'red', url: 'red-1.jpg', sort_order: 1 },
        ],
    };

    assert.deepEqual(
        getProductGalleryMedia(product, 'white').map((item) => item.url),
        ['white-1.jpg', 'white-2.jpg']
    );
    assert.deepEqual(
        getProductGalleryMedia(product, 'red').map((item) => item.url),
        ['red-1.jpg']
    );
});

test('getProductGalleryMedia falls back to legacy columns when V2 media is absent', () => {
    const media = getProductGalleryMedia({
        id: 9,
        name: 'Produit legacy',
        image: 'legacy-1.jpg',
        image2: 'legacy-2.jpg',
    });

    assert.deepEqual(media.map((item) => item.url), ['legacy-1.jpg', 'legacy-2.jpg']);
});

test('normalizeProductMedia rejects unusable rows', () => {
    assert.equal(normalizeProductMedia({ id: 'm', product_id: 1, url: ' ' }), null);
    assert.equal(normalizeProductMedia({ id: 'm', product_id: 1, url: 'x.mp4', media_type: 'video' }).media_type, 'video');
});


test('getProductGalleryForSelection aggregates all media for a color variant', () => {
    const product = {
        id: 7,
        couleurs: 'Blanc, Rouge',
        tailles: '',
        variants: [
            { id: 'white', product_id: 7, variant_key: 'color:white', color: 'Blanc', size: '', active: true, sort_order: 0 },
            { id: 'red', product_id: 7, variant_key: 'color:red', color: 'Rouge', size: '', active: true, sort_order: 1 },
        ],
        media: [
            { id: 'w1', product_id: 7, variant_id: 'white', url: 'white-1.jpg', sort_order: 0 },
            { id: 'w2', product_id: 7, variant_id: 'white', url: 'white-2.jpg', sort_order: 1 },
            { id: 'w3', product_id: 7, variant_id: 'white', url: 'white-1.jpg', sort_order: 2 },
            { id: 'r1', product_id: 7, variant_id: 'red', url: 'red-1.jpg', sort_order: 0 },
        ],
    };

    assert.deepEqual(
        getProductGalleryForSelection(product, 'Blanc').map((item) => item.url),
        ['white-1.jpg', 'white-2.jpg']
    );
    assert.deepEqual(
        getProductGalleryForSelection(product, 'Rouge').map((item) => item.url),
        ['red-1.jpg']
    );
});

test('getProductGalleryForSelection resolves an exact color+size variant first', () => {
    const product = {
        id: 8,
        variants: [
            { id: 'wm', product_id: 8, variant_key: 'color:white|size:m', color: 'Blanc', size: 'M', active: true, sort_order: 0 },
            { id: 'ws', product_id: 8, variant_key: 'color:white|size:s', color: 'Blanc', size: 'S', active: true, sort_order: 1 },
        ],
        media: [
            { id: 'm', product_id: 8, variant_id: 'wm', url: 'white-m.jpg', sort_order: 0 },
            { id: 's', product_id: 8, variant_id: 'ws', url: 'white-s.jpg', sort_order: 0 },
        ],
    };

    assert.deepEqual(
        getProductGalleryForSelection(product, 'Blanc', 'M').map((item) => item.url),
        ['white-m.jpg']
    );
});

test('getVariantOptionValues derives unique options from real V2 variants', () => {
    const values = getVariantOptionValues({
        tailles: 'legacy',
        couleurs: 'legacy',
        variants: [
            { id: '1', product_id: 1, variant_key: 'color:white|size:m', color: 'Blanc', size: 'M', active: true },
            { id: '2', product_id: 1, variant_key: 'color:white|size:l', color: 'Blanc', size: 'L', active: true },
            { id: '3', product_id: 1, variant_key: 'color:red|size:m', color: 'Rouge', size: 'M', active: true },
            { id: '4', product_id: 1, variant_key: 'legacy', active: true },
        ],
    });

    assert.deepEqual(values.colors, ['Blanc', 'Rouge']);
    assert.deepEqual(values.sizes, ['M', 'L']);
});


test('getVariantCommercials uses variant price and MOQ only when the selection is complete', () => {
    const product = {
        id: 99,
        price: 4_500,
        moq: 5,
        variants: [
            { id: 'wm', product_id: 99, variant_key: 'white-m', color: 'Blanc', size: 'M', price: 5_000, moq: '8', active: true },
            { id: 'wl', product_id: 99, variant_key: 'white-l', color: 'Blanc', size: 'L', price: 5_500, moq: '10', active: true },
        ],
    };

    const incomplete = getVariantCommercials(product, 'Blanc', '');
    assert.equal(incomplete.ready, false);
    assert.equal(incomplete.price, 4_500);
    assert.equal(incomplete.moq, 5);

    const complete = getVariantCommercials(product, 'Blanc', 'L');
    assert.equal(complete.ready, true);
    assert.equal(complete.variant.id, 'wl');
    assert.equal(complete.price, 5_500);
    assert.equal(complete.moq, 10);
});

test('getCompatibleVariantValues and isValidVariantSelection enforce the V2 matrix', () => {
    const product = {
        id: 100,
        variants: [
            { id: 'wm', product_id: 100, variant_key: 'white-m', color: 'Blanc', size: 'M', active: true },
            { id: 'wl', product_id: 100, variant_key: 'white-l', color: 'Blanc', size: 'L', active: true },
            { id: 'rs', product_id: 100, variant_key: 'red-s', color: 'Rouge', size: 'S', active: true },
        ],
    };

    assert.deepEqual(
        [...getCompatibleVariantValues(product, 'size', { color: 'Blanc' })],
        ['M', 'L']
    );
    assert.equal(isValidVariantSelection(product, 'Blanc', 'M'), true);
    assert.equal(isValidVariantSelection(product, 'Blanc', 'S'), false);
});
