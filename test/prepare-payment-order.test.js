import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../supabase/functions/prepare-payment-order/index.ts', import.meta.url),
  'utf8'
);

test('payment order preparation requires an authenticated JWT and derives user id from sub', () => {
  assert.match(source, /payload\.sub/);
  assert.match(source, /payload\.role === ["']authenticated["']/);
  assert.doesNotMatch(source, /body\.user_id/);
});

test('payment order totals are authoritative and loaded from products', () => {
  assert.match(source, /products\?select=id,name,price,category,category_id/);
  assert.match(source, /Number\(product\.price\)/);
  assert.doesNotMatch(source, /body\.amount/);
  assert.doesNotMatch(source, /body\.total/);
});

test('the function writes only pending orders with null payment reference', () => {
  assert.match(source, /status: "pending"/);
  assert.match(source, /payment_reference: null/);
});

test('OpenPay operator and Congo phone validation remain bounded', () => {
  assert.match(source, /body\.operator !== "MTN" && body\.operator !== "AIRTEL"/);
  assert.match(source, /\^242\\d\{9\}\$/);
});