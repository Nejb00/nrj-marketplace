import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const checkout = fs.readFileSync(
  new URL('../src/js/services/checkout.js', import.meta.url),
  "utf8"
);
const html = fs.readFileSync(
  new URL('../index.html', import.meta.url),
  'utf8'
);

test('checkout exposes Mobile Money and WhatsApp fallback actions', () => {
  assert.match(html, /id="payOrderBtn"/);
  assert.match(html, /id="sendWhatsAppBtn"/);
  assert.match(checkout, /prepare-payment-order/);
  assert.match(checkout, /new OpenPayProvider\(\)/);
});

test('checkout treats server total as authoritative', () => {
  assert.match(checkout, /order\.total/);
  assert.match(checkout, /Total confirmé/);
});

test('checkout polls payment status and stops on terminal states', () => {
  assert.match(checkout, /getPaymentStatus\(providerReference\)/);
  assert.match(checkout, /if \(shouldContinue\)/);
  assert.match(checkout, /clearInterval\(paymentPollTimer\)/);
});

test('frontend does not contain OpenPay credentials', () => {
  assert.doesNotMatch(checkout, /OPENPAY_API_KEY/);
  assert.doesNotMatch(checkout, /XO-API-KEY/);
});