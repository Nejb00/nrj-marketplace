-- NRJ Marketplace — payment persistence foundation
-- 2026-10-05
--
-- No provider integration is included here.
-- This migration stores payment state and webhook events safely so that
-- OpenPay / MTN / Airtel adapters can be added later behind PaymentService.

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL
    REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  payment_method text,
  provider_reference text,
  idempotency_key text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'XAF'
    CHECK (char_length(currency) = 3 AND currency = upper(currency)),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'processing',
      'paid',
      'failed',
      'cancelled',
      'refund_pending',
      'refunded'
    )),
  failure_reason text,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_idempotency_key_uidx
  ON public.payments(provider, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_uidx
  ON public.payments(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_order_id_idx
  ON public.payments(order_id);

CREATE INDEX IF NOT EXISTS payments_status_idx
  ON public.payments(status);

CREATE INDEX IF NOT EXISTS payments_provider_status_idx
  ON public.payments(provider, status);

CREATE OR REPLACE FUNCTION public.update_payments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_update_payments_updated_at
  ON public.payments;

CREATE TRIGGER trigger_update_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_payments_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_payment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('processing', 'failed', 'cancelled'))
    OR
    (OLD.status = 'processing' AND NEW.status IN ('paid', 'failed', 'cancelled'))
    OR
    (OLD.status = 'paid' AND NEW.status = 'refund_pending')
    OR
    (OLD.status = 'refund_pending' AND NEW.status IN ('refunded', 'failed'))
  ) THEN
    RAISE EXCEPTION 'Invalid payment status transition: % -> %',
      OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at = now();
  END IF;

  IF NEW.status = 'refunded' AND NEW.refunded_at IS NULL THEN
    NEW.refunded_at = now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_enforce_payment_status_transition
  ON public.payments;

CREATE TRIGGER trigger_enforce_payment_status_transition
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_payment_status_transition();

CREATE TABLE IF NOT EXISTS public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid
    REFERENCES public.payments(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_event_id text,
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_event_uidx
  ON public.payment_events(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payment_events_payment_id_idx
  ON public.payment_events(payment_id);

CREATE INDEX IF NOT EXISTS payment_events_received_at_idx
  ON public.payment_events(received_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments owner read" ON public.payments;

CREATE POLICY "payments owner read"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = payments.order_id
        AND (
          o.user_id = (SELECT auth.uid())::text
          OR (SELECT public.is_chat_admin())
        )
    )
  );

-- Payment writes happen only from a trusted backend boundary.
-- No anon/authenticated INSERT/UPDATE/DELETE policies are intentionally exposed.
REVOKE INSERT, UPDATE, DELETE
  ON public.payments
  FROM anon, authenticated;

REVOKE ALL
  ON public.payment_events
  FROM anon, authenticated;

-- Keep privileged status changes behind the existing table security boundary.
REVOKE EXECUTE
  ON FUNCTION public.enforce_payment_status_transition()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE
  ON FUNCTION public.update_payments_updated_at()
  FROM PUBLIC, anon, authenticated;
