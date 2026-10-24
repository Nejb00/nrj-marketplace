import test from 'node:test';
import assert from 'node:assert/strict';

import { NEW_PRODUCT_DAYS } from '../src/js/core/config.js';
import { state } from '../src/js/core/state.js';
import { isFresh, isNewProduct } from '../src/js/utils/badges.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const createdDaysAgo = (days) => new Date(Date.now() - days * DAY_MS).toISOString();

test('catalogue and admin use the shared 30-day new-product window', () => {
  assert.equal(NEW_PRODUCT_DAYS, 30);

  const previousProducts = state.products;
  const products = [
    { id: 101, created_at: createdDaysAgo(2) },
    { id: 102, created_at: createdDaysAgo(29) },
    { id: 103, created_at: createdDaysAgo(31) },
  ];

  state.products = products;
  try {
    assert.equal(isNewProduct(products[0]), true);
    assert.equal(isNewProduct(products[1]), true);
    assert.equal(isNewProduct(products[2]), false);

    assert.equal(isFresh(products[0]), true);
    assert.equal(isFresh(products[1]), true);
    assert.equal(isFresh(products[2]), false);
  } finally {
    state.products = previousProducts;
  }
});

test('products without a valid creation timestamp are not considered new', () => {
  assert.equal(isNewProduct({ id: 201 }), false);
  assert.equal(isNewProduct({ id: 202, created_at: 'not-a-date' }), false);
});
