# Prepare Payment Order

Creates a pending `public.orders` row for an OpenPay payment attempt.

## Security

- Requires a valid Supabase user JWT, including an authenticated anonymous session.
- The user id is taken from the verified JWT, never from the request body.
- Product names and prices are loaded server-side from `products`.
- The browser cannot choose the authoritative order total.
- Only MTN and AIRTEL are accepted as OpenPay operators.
- This function creates the order only; the provider transaction remains a separate step.

## Important boundary

The function does not accept a client-supplied total, unit price, product name or order user id.

## Input

```json
{
  "items": [
    { "product_id": 123, "quantity": 2, "couleur": "Noir", "taille": "L" }
  ],
  "customer_name": "Client",
  "phone": "242060000000",
  "delivery_address": "Brazzaville",
  "operator": "MTN"
}
```

## Output

Returns the authoritative `order_id`, server-calculated `total`, XAF currency and payment method.

Real payment is not triggered by this function.