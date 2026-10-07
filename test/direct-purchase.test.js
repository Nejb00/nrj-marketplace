import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { state } from '../src/js/core/state.js';
import {
    beginDirectPurchase,
    cancelDirectPurchase,
    finishDirectPurchase,
    isDirectPurchaseActive
} from '../src/js/services/direct-purchase.js';

test('Buy Now isolates a temporary selected line and restores the original cart on cancel', () => {
    const original = state.cart;
    state.cart = [
        { productId: 1, quantity: 2, taille: 'M', couleur: 'Noir', selected: true },
        { productId: 2, quantity: 1, taille: '', couleur: '', selected: false }
    ];

    beginDirectPurchase({
        productId: 3,
        quantity: 4,
        taille: 'L',
        couleur: 'Blanc',
        variantId: '33333333-3333-4333-8333-333333333333',
        unitPrice: 5500,
        moq: 2
    });

    assert.equal(isDirectPurchaseActive(), true);
    assert.deepEqual(state.cart.map((item) => item.selected), [false, false, true]);
    assert.equal(state.cart[2].variantId, '33333333-3333-4333-8333-333333333333');
    assert.equal(state.cart[2].unitPrice, 5500);

    assert.equal(cancelDirectPurchase(), true);
    assert.equal(isDirectPurchaseActive(), false);
    assert.deepEqual(state.cart, [
        { productId: 1, quantity: 2, taille: 'M', couleur: 'Noir', selected: true },
        { productId: 2, quantity: 1, taille: '', couleur: '', selected: false }
    ]);

    state.cart = original;
});

test('finishDirectPurchase clears the reversible context without restoring anything', () => {
    const original = state.cart;
    state.cart = [{ productId: 10, quantity: 1, taille: '', couleur: '', selected: true }];

    beginDirectPurchase({ productId: 11, quantity: 1 });
    finishDirectPurchase();

    assert.equal(isDirectPurchaseActive(), false);
    assert.equal(state.cart.length, 2);

    state.cart = original;
});

test('Buy Now UI contract is wired to the options sheet and cancellation flow', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.match(html, /id="directOrderStickyBtn"/);
    assert.match(html, /id="optionsPanelBuyBtn"/);

    const sheet = fs.readFileSync('src/js/features/product/modal-options-sheet.js', 'utf8');
    assert.match(sheet, /beginDirectPurchase/);
    assert.match(sheet, /nrj:close-product-modal/);

    const app = fs.readFileSync('src/js/features/app/click-delegation.js', 'utf8');
    assert.match(app, /cancelDirectPurchase/);
    assert.match(app, /nrj:close-product-modal/);
});
