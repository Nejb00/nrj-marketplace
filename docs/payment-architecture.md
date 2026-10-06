# NRJ Marketplace — Payment Architecture

## Objective

Prepare the marketplace for Mobile Money payments without coupling the checkout to a single payment provider.

## Current state

The current checkout (`src/js/services/checkout.js`) is still client-side:

1. Selected cart items are converted into an order object.
2. The order is persisted in IndexedDB/localStorage.
3. The customer is redirected to WhatsApp.

Supabase already contains `public.orders` with a `pending` status, payment method/reference fields, customer phone and delivery address fields.

## Target flow

```text
Checkout
  |
  v
PaymentService
  |
  +--> Provider adapter (OpenPay / MTN / Airtel)
  |
  v
Webhook / status verification
  |
  v
Supabase orders + payments
```

## Provider abstraction

The application should depend on the `PaymentProvider` contract, not on a vendor SDK or endpoint.

A provider adapter is responsible for:

- creating a payment;
- querying a provider reference;
- verifying provider webhooks;
- requesting refunds.

`PaymentService` is responsible for the normalized NRJ payment domain:

- XAF currency validation;
- order ID validation;
- deterministic idempotency key generation;
- normalized statuses;
- terminal-status detection.

## Security boundaries

Real provider credentials must never be placed in frontend code.

Real provider calls and webhook signature verification should run in a trusted backend boundary, such as a Supabase Edge Function or another server-side service.

The browser must never be trusted to mark an order as paid.

## Next implementation steps

1. Add dedicated `payments` and `payment_events` persistence.
2. Harden order/payment state transitions and idempotency at database level.
3. Implement webhook handling in a trusted server-side function.
4. Select the first production provider after validating fees, MTN/Airtel support, settlement, refunds and marketplace payouts.
5. Replace the WhatsApp-only checkout flow with a payment-aware checkout while preserving WhatsApp as a fallback/support channel.
