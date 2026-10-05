-- NRJ Marketplace — payment reconciliation hardening
-- 2026-10-05
--
-- Allows an immediate provider-confirmed success from the local pending state.
-- This is required because OpenPay may return a successful payment immediately.

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
    (OLD.status = 'pending' AND NEW.status IN ('processing', 'paid', 'failed', 'cancelled'))
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

REVOKE EXECUTE
  ON FUNCTION public.enforce_payment_status_transition()
  FROM PUBLIC, anon, authenticated;
