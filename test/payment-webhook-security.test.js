import test from "node:test";
import assert from "node:assert/strict";

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

test("webhook signature comparison rejects different lengths", () => {
  assert.equal(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2])), false);
});

test("webhook signature comparison accepts identical bytes", () => {
  assert.equal(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
});

// Regression coverage: signature comparison must remain length-safe and deterministic.
