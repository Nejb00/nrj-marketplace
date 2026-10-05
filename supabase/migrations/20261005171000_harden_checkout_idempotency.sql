-- NRJ Marketplace — checkout idempotency / anti-double-submit
-- ATTAQUE #22
--
-- One checkout intent per authenticated user + idempotency key.
-- A retry of the same request therefore returns the original order instead
-- of creating a second order before payment.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_fingerprint text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_checkout_idempotency_key_length_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_checkout_idempotency_key_length_check
  CHECK (
    checkout_idempotency_key IS NULL
    OR char_length(checkout_idempotency_key) BETWEEN 16 AND 200
  );

CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_idempotency_uidx
  ON public.orders(user_id, checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;
