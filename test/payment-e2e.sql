BEGIN;

DO $$
DECLARE
  v_user_id text := 'e2e-payment-23-' || gen_random_uuid()::text;
  v_order_id uuid;
  v_payment_id uuid;
  v_provider_reference text := 'E2E-OPENPAY-023-' || substr(gen_random_uuid()::text, 1, 8);
  v_idempotency_key text := 'e2e-payment-23:' || gen_random_uuid()::text;
  v_event_id text;
  v_apply record;
  v_order_status text;
  v_payment_status text;
  v_payment_reference text;
  v_event_count integer;
  v_delivery_count integer;
  v_history_count integer;
BEGIN
  INSERT INTO public.orders (
    user_id,
    items,
    total,
    status,
    payment_method,
    phone,
    checkout_idempotency_key,
    checkout_fingerprint
  )
  VALUES (
    v_user_id,
    '[{"productId":23023,"name":"Produit E2E NRJ","price":12500,"qty":1}]'::jsonb,
    12500,
    'pending',
    'openpay_mtn',
    '242061234567',
    'e2e-order-23:' || gen_random_uuid()::text,
    'e2e-fingerprint-23'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.payments (
    order_id,
    user_id,
    provider,
    payment_method,
    provider_reference,
    idempotency_key,
    amount,
    currency,
    status
  )
  VALUES (
    v_order_id,
    v_user_id,
    'openpay',
    'openpay_mtn',
    NULL,
    v_idempotency_key,
    12500,
    'XAF',
    'pending'
  )
  RETURNING id INTO v_payment_id;

  PERFORM public.set_payment_status_with_audit(
    v_payment_id,
    'processing',
    NULL,
    'payment_create',
    'e2e_payment_create',
    NULL,
    '{"test":"attack-23","phase":"processing"}'::jsonb
  );

  v_event_id := 'e2e:' || v_provider_reference || ':success';

  SELECT *
  INTO v_apply
  FROM public.apply_payment_provider_event(
    v_payment_id,
    'openpay',
    v_event_id,
    'payment',
    jsonb_build_object(
      'test', 'attack-23',
      'provider_reference', v_provider_reference,
      'amount', 12500,
      'currency', 'XAF',
      'status', 'success',
      'metadata', jsonb_build_object('order_id', v_order_id::text)
    ),
    v_provider_reference,
    'paid'
  );

  IF NOT v_apply.processed OR v_apply.duplicate OR v_apply.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Callback E2E non appliqué correctement: %', row_to_json(v_apply);
  END IF;

  SELECT status, payment_reference
  INTO v_order_status, v_payment_reference
  FROM public.orders
  WHERE id = v_order_id;

  SELECT status
  INTO v_payment_status
  FROM public.payments
  WHERE id = v_payment_id;

  SELECT count(*)
  INTO v_event_count
  FROM public.payment_events
  WHERE payment_id = v_payment_id;

  SELECT delivery_count
  INTO v_delivery_count
  FROM public.payment_events
  WHERE payment_id = v_payment_id
    AND provider_event_id = v_event_id;

  SELECT count(*)
  INTO v_history_count
  FROM public.payment_status_history
  WHERE payment_id = v_payment_id;

  IF v_order_status <> 'paid' THEN
    RAISE EXCEPTION 'Commande non payée après callback: %', v_order_status;
  END IF;

  IF v_payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Paiement non payé après callback: %', v_payment_status;
  END IF;

  IF v_payment_reference <> v_provider_reference THEN
    RAISE EXCEPTION 'Référence commande non synchronisée: % <> %', v_payment_reference, v_provider_reference;
  END IF;

  IF v_event_count <> 1 OR v_delivery_count <> 1 THEN
    RAISE EXCEPTION 'Événement provider inattendu: count=% delivery=%', v_event_count, v_delivery_count;
  END IF;

  IF v_history_count < 3 THEN
    RAISE EXCEPTION 'Historique financier incomplet: % entrée(s)', v_history_count;
  END IF;

  SELECT *
  INTO v_apply
  FROM public.apply_payment_provider_event(
    v_payment_id,
    'openpay',
    v_event_id,
    'payment',
    '{"test":"attack-23","duplicate":true}'::jsonb,
    v_provider_reference,
    'paid'
  );

  IF NOT v_apply.duplicate OR v_apply.processed OR v_apply.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'Déduplication E2E incorrecte: %', row_to_json(v_apply);
  END IF;

  SELECT delivery_count
  INTO v_delivery_count
  FROM public.payment_events
  WHERE payment_id = v_payment_id
    AND provider_event_id = v_event_id;

  IF v_delivery_count <> 2 THEN
    RAISE EXCEPTION 'delivery_count duplicate incorrect: %', v_delivery_count;
  END IF;

  RAISE NOTICE 'ATTACK #23 E2E OK — order=%, payment=%, ref=%, events=1, delivery_count=2, history=%',
    v_order_status, v_payment_status, v_provider_reference, v_history_count;
END $$;

ROLLBACK;
