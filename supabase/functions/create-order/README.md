# Create Order

Server-side boundary used by the payment checkout.

The function authenticates the Supabase session, reconstructs the order from product IDs, reads authoritative product prices from `public.products`, and persists the order with the authenticated user's ID.

The browser-provided total is intentionally ignored.

Supported payment methods:
- whatsapp
- openpay_mtn
- openpay_airtel

The function is not a payment gateway and does not contact OpenPay.
