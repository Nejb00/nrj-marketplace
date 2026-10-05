# Payment Webhook

Secure webhook boundary for future NRJ payment providers.

## Authentication

The function is designed for external providers, so Supabase JWT verification must be disabled for this endpoint and replaced by the HMAC contract implemented in `index.ts`.

Required Edge Function secret:

- `PAYMENT_WEBHOOK_SECRET`

The secret must only exist in Supabase Edge Function secrets. Never commit it to Git.

## Signature

Headers:

- `x-nrj-timestamp`: Unix timestamp in seconds
- `x-nrj-signature`: `sha256=<hex>`

The signed message is:

```text
<timestamp>.<raw request body>
```

Requests older than five minutes are rejected.

## Payload contract

Provider-specific data must be normalized before processing:

```json
{
  "provider": "mock",
  "event_id": "evt_123",
  "event_type": "payment.paid",
  "provider_reference": "PAY-123",
  "status": "paid",
  "amount": 15000,
  "currency": "XAF"
}
```

The function resolves the payment by `provider + provider_reference`, verifies amount/currency, records the event using the database uniqueness barrier, and lets the database trigger enforce legal payment-state transitions.

## Production rule

Do not deploy this endpoint against a real provider until the provider-specific signature format, webhook retries, settlement semantics and secret-rotation procedure have been verified against the provider documentation.