-- NRJ Marketplace — financial payment audit & observability
-- ATTAQUE #21
--
-- Append-only status history for payments. Provider callbacks remain in
-- payment_events; this table records the resulting payment state transitions
-- and links them to the provider event when one exists.

CREATE TABLE IF NOT EXISTS public.payment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  provider_reference text,
  source text NOT NULL DEFAULT 'database',
  reason text,
  provider_event_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_status_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS payment_status_history_payment_id_idx
  ON public.payment_status_history(payment_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS payment_status_history_order_id_idx
  ON public.payment_status_history(order_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS payment_status_history_provider_event_idx
  ON public.payment_status_history(provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.audit_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_source text;
  v_reason text;
  v_provider_event_id text;
  v_metadata jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.provider_reference IS NOT DISTINCT FROM OLD.provider_reference THEN
    RETURN NEW;
  END IF;

  v_source := coalesce(
    nullif(current_setting('app.payment_audit_source', true), ''),
    'database'
  );

  v_reason := nullif(
    current_setting('app.payment_audit_reason', true),
    ''
  );

  v_provider_event_id := nullif(
    current_setting('app.payment_provider_event_id', true),
    ''
  );

  BEGIN
    v_metadata := coalesce(
      nullif(current_setting('app.payment_audit_metadata', true), ''),
      '{}'
    )::jsonb;
  EXCEPTION WHEN others THEN
    v_metadata := '{}'::jsonb;
  END;

  INSERT INTO public.payment_status_history (
    payment_id,
    order_id,
    provider,
    from_status,
    to_status,
    provider_reference,
    source,
    reason,
    provider_event_id,
    metadata
  )
  VALUES (
    NEW.id,
    NEW.order_id,
    NEW.provider,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
    NEW.status,
    NEW.provider_reference,
    v_source,
    v_reason,
    v_provider_event_id,
    v_metadata
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_audit_payment_status_change
  ON public.payments;

CREATE TRIGGER trigger_audit_payment_status_change
AFTER INSERT OR UPDATE OF status, provider_reference ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.audit_payment_status_change();

REVOKE EXECUTE
  ON FUNCTION public.audit_payment_status_change()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_payment_status_with_audit(
  p_payment_id uuid,
  p_status text,
  p_provider_reference text DEFAULT NULL,
  p_source text DEFAULT 'payment_api',
  p_reason text DEFAULT NULL,
  p_provider_event_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  payment_id uuid,
  payment_status text,
  provider_reference text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF p_payment_id IS NULL
     OR nullif(trim(p_status), '') IS NULL THEN
    RAISE EXCEPTION 'Payment status update payload incomplete';
  END IF;

  PERFORM set_config(
    'app.payment_audit_source',
    coalesce(nullif(trim(p_source), ''), 'payment_api'),
    true
  );
  PERFORM set_config(
    'app.payment_audit_reason',
    coalesce(p_reason, ''),
    true
  );
  PERFORM set_config(
    'app.payment_provider_event_id',
    coalesce(p_provider_event_id, ''),
    true
  );
  PERFORM set_config(
    'app.payment_audit_metadata',
    coalesce(p_metadata, '{}'::jsonb)::text,
    true
  );

  RETURN QUERY
  UPDATE public.payments p
  SET
    provider_reference = coalesce(
      nullif(trim(p_provider_reference), ''),
      p.provider_reference
    ),
    status = lower(trim(p_status)),
    failure_reason = coalesce(p_reason, p.failure_reason)
  WHERE p.id = p_payment_id
  RETURNING
    p.id,
    p.status,
    p.provider_reference;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;
END;
$function$;

REVOKE EXECUTE
  ON FUNCTION public.set_payment_status_with_audit(
    uuid,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.set_payment_status_with_audit(
    uuid,
    text,
    text,
    text,
    text,
    text,
    jsonb
  )
  TO service_role;
