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


-- A single account may have at most one active OpenPay transaction at a time.
-- Failed/cancelled payments are excluded so a normal retry remains possible.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS user_id text;

UPDATE public.payments p
SET user_id = o.user_id
FROM public.orders o
WHERE p.user_id IS NULL
  AND p.order_id = o.id;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_openpay_user_id_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_openpay_user_id_check
  CHECK (provider <> 'openpay' OR user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS payments_user_id_lookup_idx
  ON public.payments(user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_active_per_user_uidx
  ON public.payments(user_id)
  WHERE provider = 'openpay'
    AND user_id IS NOT NULL
    AND status IN ('pending', 'processing', 'refund_pending');
