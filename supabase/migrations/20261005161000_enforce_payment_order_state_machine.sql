-- NRJ Marketplace — payment -> order state machine
-- ATTAQUE #20
--
-- The payment row is the financial source of truth. Order payment milestones
-- are derived from the payment state and cannot be asserted by the client.

CREATE OR REPLACE FUNCTION public.enforce_order_payment_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_payment_status text;
  v_provider_reference text;
  v_amount numeric;
  v_currency text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- A retry from a failed/cancelled order is allowed only after a new live
  -- payment row exists. The payment trigger below will normally drive this
  -- transition automatically.
  IF NEW.status = 'pending' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.payments p
      WHERE p.order_id = NEW.id
        AND p.status IN ('pending', 'processing')
    ) THEN
      RAISE EXCEPTION
        'Order % cannot enter pending without a live payment',
        NEW.id;
    END IF;

    RETURN NEW;
  END IF;

  SELECT p.status, p.provider_reference, p.amount, p.currency
  INTO v_payment_status, v_provider_reference, v_amount, v_currency
  FROM public.payments p
  WHERE p.order_id = NEW.id
    AND p.status = NEW.status
  ORDER BY p.updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Order % status % must be backed by a matching payment',
      NEW.id, NEW.status;
  END IF;

  IF NEW.status = 'paid' THEN
    IF v_provider_reference IS NULL
       OR v_amount IS DISTINCT FROM NEW.total
       OR upper(coalesce(v_currency, '')) <> 'XAF' THEN
      RAISE EXCEPTION
        'Order % cannot be paid from a mismatched payment',
        NEW.id;
    END IF;

    NEW.payment_reference = v_provider_reference;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('failed', 'cancelled') THEN
    NEW.payment_reference = v_provider_reference;
    RETURN NEW;
  END IF;

  IF NEW.status = 'refunded' THEN
    IF OLD.status <> 'paid' THEN
      RAISE EXCEPTION
        'Order % can only be refunded after it was paid',
        NEW.id;
    END IF;

    NEW.payment_reference = v_provider_reference;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_enforce_order_payment_state
  ON public.orders;

CREATE TRIGGER trigger_enforce_order_payment_state
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_payment_state();

REVOKE EXECUTE
  ON FUNCTION public.enforce_order_payment_state()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_order_payment_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.status IN ('pending', 'processing') THEN
    UPDATE public.orders
    SET
      status = 'pending',
      payment_reference = COALESCE(NEW.provider_reference, payment_reference)
    WHERE id = NEW.order_id
      AND status IN ('pending', 'failed', 'cancelled');
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
    IF NEW.provider_reference IS NULL THEN
      RAISE EXCEPTION
        'Paid payment % must have a provider reference',
        NEW.id;
    END IF;

    UPDATE public.orders
    SET
      status = 'paid',
      payment_reference = NEW.provider_reference
    WHERE id = NEW.order_id;
    RETURN NEW;
  END IF;

  IF NEW.status IN ('failed', 'cancelled') THEN
    UPDATE public.orders
    SET
      status = NEW.status,
      payment_reference = COALESCE(NEW.provider_reference, payment_reference)
    WHERE id = NEW.order_id
      AND status IN ('pending', 'failed', 'cancelled');
    RETURN NEW;
  END IF;

  IF NEW.status = 'refund_pending' THEN
    UPDATE public.orders
    SET
      payment_reference = COALESCE(NEW.provider_reference, payment_reference)
    WHERE id = NEW.order_id
      AND status = 'paid';
    RETURN NEW;
  END IF;

  IF NEW.status = 'refunded' THEN
    UPDATE public.orders
    SET
      status = 'refunded',
      payment_reference = NEW.provider_reference
    WHERE id = NEW.order_id
      AND status = 'paid';
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_sync_order_payment_state
  ON public.payments;

CREATE TRIGGER trigger_sync_order_payment_state
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_payment_state();

REVOKE EXECUTE
  ON FUNCTION public.sync_order_payment_state()
  FROM PUBLIC, anon, authenticated;
