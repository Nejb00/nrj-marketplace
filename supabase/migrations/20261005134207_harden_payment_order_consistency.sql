-- NRJ Marketplace — payment/order consistency hardening
-- Adds database-enforced single live payment ownership per order and keeps
-- orders.payment_reference synchronized with provider references.

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_live_per_order_uidx
  ON public.payments(order_id)
  WHERE status IN ('pending', 'processing', 'paid', 'refund_pending', 'refunded');

CREATE OR REPLACE FUNCTION public.sync_order_payment_reference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.provider_reference IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.orders
  SET payment_reference = NEW.provider_reference
  WHERE id = NEW.order_id
    AND payment_reference IS DISTINCT FROM NEW.provider_reference;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_sync_order_payment_reference
  ON public.payments;

CREATE TRIGGER trigger_sync_order_payment_reference
AFTER INSERT OR UPDATE OF provider_reference ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_payment_reference();

REVOKE EXECUTE
  ON FUNCTION public.sync_order_payment_reference()
  FROM PUBLIC, anon, authenticated;
