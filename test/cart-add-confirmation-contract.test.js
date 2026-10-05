import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const cartActions = fs.readFileSync("src/js/services/cart-actions.js", "utf8");
const modalActions = fs.readFileSync("src/js/features/product/modal-actions.js", "utf8");
const confirmation = fs.readFileSync("src/js/services/cart-add-confirmation.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const cartCss = fs.readFileSync("src/css/components/cart-admin.css", "utf8");

test("cart add uses one batched mutation for variant selections", () => {
  assert.match(cartActions, /export async function addItemsToCart\(items, sourceEl = null\)/);
  assert.match(modalActions, /await addItemsToCart\(items, e\.currentTarget\)/);
  assert.doesNotMatch(modalActions, /selected\.forEach\(\[\[color, qty\]/);
});

test("post-add confirmation is a dedicated accessible surface", () => {
  assert.match(index, /id="cartAddConfirmation"/);
  assert.match(index, /role="dialog"/);
  assert.match(index, /aria-modal="true"/);
  assert.match(confirmation, /export function openCartAddConfirmation\(data\)/);
  assert.match(confirmation, /export function closeCartAddConfirmation\(\)/);
  assert.match(confirmation, /data-cart-add-action="cart"/);
  assert.match(confirmation, /data-cart-add-action="continue"/);
});

test("confirmation reuses NRJ recommendation/card infrastructure", () => {
  assert.match(confirmation, /import \{ forYou, hasProfile \} from ['"]\.\/reco\.js['"]/);
  assert.match(confirmation, /renderProductCardHTML\(p, i\)/);
  assert.match(confirmation, /!inCart\.has\(p\.id\)/);
  assert.match(cartCss, /\.cart-add-confirmation-recommendations-grid/);
  assert.match(cartCss, /@media \(min-width: 768px\)/);
});
