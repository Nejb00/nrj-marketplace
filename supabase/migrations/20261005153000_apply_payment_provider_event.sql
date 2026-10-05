-- NRJ Marketplace — atomic payment provider event application
-- ATTAQUE #19
--
-- A provider callback is persisted and applied to the payment in one
-- PostgreSQL transaction. The existing unique index on
-- (provider, provider_event_id) makes provider retries idempotent.

CREATE OR REPLACE FUNCTION public.apply_payment_provider_event(
  p_payment_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_provider_reference text,
  p_status text
)
RETURNS TABLE (
  processed boolean,
  duplicate boolean,
  payment_status text
)
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_event_id uuid;
  v_existing_payment_id uuid;
  v_processed_at timestamptz;
  v_payment_status text;
BEGIN
  IF p_payment_id IS NULL
     OR nullif(trim(p_provider), '') IS NULL
     OR nullif(trim(p_provider_event_id), '') IS NULL
     OR nullif(trim(p_provider_reference), '') IS NULL
     OR nullif(trim(p_status), '') IS NULL THEN
    RAISE EXCEPTION 'Payment provider event payload incomplete';
  END IF;

  SELECT status
  INTO v_payment_status
  FROM public.payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  INSERT INTO public.payment_events (
    payment_id,
    provider,
    provider_event_id,
    event_type,
    payload
  )
  VALUES (
    p_payment_id,
    trim(p_provider),
    trim(p_provider_event_id),
    nullif(trim(p_event_type), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (provider, provider_event_id) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    SELECT
      id,
      payment_id,
      processed_at
    INTO
      v_event_id,
      v_existing_payment_id,
      v_processed_at
    FROM public.payment_events
    WHERE provider = trim(p_provider)
      AND provider_event_id = trim(p_provider_event_id)
    FOR UPDATE;

    IF v_existing_payment_id IS DISTINCT FROM p_payment_id THEN
      RAISE EXCEPTION 'Payment event is bound to a different payment';
    END IF;

    IF v_processed_at IS NOT NULL THEN
      SELECT status
      INTO v_payment_status
      FROM public.payments
      WHERE id = p_payment_id;

      RETURN QUERY SELECT false, true, v_payment_status;
      RETURN;
    END IF;

    UPDATE public.payment_events
    SET
      event_type = nullif(trim(p_event_type), ''),
      payload = coalesce(p_payload, '{}'::jsonb),
      processing_error = NULL
    WHERE id = v_event_id;
  END IF;

  UPDATE public.payments
  SET
    provider_reference = trim(p_provider_reference),
    status = lower(trim(p_status))
  WHERE id = p_payment_id;

  SELECT status
  INTO v_payment_status
  FROM public.payments
  WHERE id = p_payment_id;

  UPDATE public.payment_events
  SET
    processed_at = now(),
    processing_error = NULL
  WHERE id = v_event_id
    AND processed_at IS NULL;

  RETURN QUERY SELECT true, false, v_payment_status;
END;
$function$;

REVOKE EXECUTE
  ON FUNCTION public.apply_payment_provider_event(
    uuid,
    text,
    text,
    text,
    jsonb,
    text,
    text
  )
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.apply_payment_provider_event(
    uuid,
    text,
    text,
    text,
    jsonb,
    text,
    text
  )
  TO service_role;
