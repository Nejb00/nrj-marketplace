import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    buildVariantKey,
    normalizeVariantEditorInput
} from '../src/js/features/admin/product-variants-admin.js';

test('buildVariantKey prefers explicit key', () => {
    assert.equal(
        buildVariantKey({
            key: 'color:white|size:m',
            color: 'Rouge',
            size: 'L'
        }),
        'color:white|size:m'
    );
});

test('buildVariantKey derives a stable color-size key', () => {
    assert.equal(
        buildVariantKey({
            color: 'Blanc cassé',
            size: 'XL'
        }),
        'color:blanc-cassé|size:xl'
    );
});

test('normalizeVariantEditorInput removes duplicate media URLs and ignores invalid URLs', () => {
    const value = normalizeVariantEditorInput({
        label: 'Blanc',
        color: 'Blanc',
        mediaUrls: [
            'https://example.com/a.jpg',
            'https://example.com/A.jpg',
            'ftp://example.com/b.jpg',
            'https://example.com/c.jpg'
        ]
    });

    assert.deepEqual(value.mediaUrls, [
        'https://example.com/a.jpg',
        'https://example.com/c.jpg'
    ]);
    assert.equal(value.variant_key, 'color:blanc');
});

test('normalizeVariantEditorInput keeps valid variant price and MOQ', () => {
    const value = normalizeVariantEditorInput({
        color: 'Rouge',
        size: 'M',
        price: '5500',
        moq: '8',
        sort_order: '3',
        active: true
    });

    assert.equal(value.price, 5500);
    assert.equal(value.moq, '8');
    assert.equal(value.sort_order, 3);
    assert.equal(value.active, true);
    assert.equal(value.variant_key, 'color:rouge|size:m');
});

test('admin.html exposes the V2 editor contract', () => {
    const html = fs.readFileSync('admin.html', 'utf8');
    for (const id of [
        'adminVariantsSection',
        'adminVariantsProduct',
        'adminVariantKey',
        'adminVariantLabel',
        'adminVariantColor',
        'adminVariantSize',
        'adminVariantSku',
        'adminVariantPrice',
        'adminVariantMoq',
        'adminVariantMedia',
        'adminVariantSaveBtn',
        'adminVariantsList'
    ]) {
        assert.match(html, new RegExp('id="' + id + '"'));
    }
});

test('admin-main loads the V2 editor and variants shortcut', () => {
    const main = fs.readFileSync('src/js/admin-main.js', 'utf8');
    assert.match(main, /product-variants-admin-ui\.js/);
    assert.match(main, /admin-edit-variants/);
});
