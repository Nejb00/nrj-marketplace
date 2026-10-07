import test from 'node:test';
import assert from 'node:assert/strict';

import {
    collectLegacyProductMedia,
    getProductGalleryMedia,
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
