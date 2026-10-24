-- NRJ Product Variants & Media V2 — admin atomic writes

CREATE OR REPLACE FUNCTION public.save_product_variant_graph(
  p_product_id bigint,
  p_variant jsonb,
  p_media_urls text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_variant_id uuid;
  v_variant_key text;
  v_label text;
  v_color text;
  v_size text;
  v_sku text;
  v_price numeric;
  v_moq text;
  v_active boolean;
  v_sort_order integer;
  v_attributes jsonb;
  v_media_count integer := 0;
BEGIN
  IF NOT public.is_chat_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF p_product_id IS NULL OR p_product_id <= 0 THEN
    RAISE EXCEPTION 'product_id_invalid';
  END IF;

  IF p_variant IS NULL OR jsonb_typeof(p_variant) <> 'object' THEN
    RAISE EXCEPTION 'variant_invalid';
  END IF;

  IF cardinality(coalesce(p_media_urls, ARRAY[]::text[])) > 100 THEN
    RAISE EXCEPTION 'media_limit_exceeded';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  v_variant_key := left(trim(coalesce(p_variant->>'variant_key', '')), 160);
  IF v_variant_key = '' THEN
    RAISE EXCEPTION 'variant_key_required';
  END IF;

  v_label := nullif(left(trim(coalesce(p_variant->>'label', '')), 300), '');
  v_color := nullif(left(trim(coalesce(p_variant->>'color', '')), 100), '');
  v_size := nullif(left(trim(coalesce(p_variant->>'size', '')), 100), '');
  v_sku := nullif(left(trim(coalesce(p_variant->>'sku', '')), 120), '');
  v_moq := nullif(left(trim(coalesce(p_variant->>'moq', '')), 50), '');

  IF coalesce(p_variant->>'price', '') ~ '^[0-9]+([.][0-9]+)?$' THEN
    v_price := (p_variant->>'price')::numeric;
    IF v_price <= 0 THEN
      v_price := NULL;
    END IF;
  ELSE
    v_price := NULL;
  END IF;

  IF coalesce(p_variant->>'sort_order', '') ~ '^-?[0-9]+$' THEN
    v_sort_order := greatest(0, least(100000, (p_variant->>'sort_order')::integer));
  ELSE
    v_sort_order := 0;
  END IF;

  v_active := lower(coalesce(p_variant->>'active', 'true')) <> 'false';

  v_attributes := CASE
    WHEN jsonb_typeof(p_variant->'attributes') = 'object' THEN p_variant->'attributes'
    ELSE '{}'::jsonb
  END;

  INSERT INTO public.product_variants (
    product_id, variant_key, label, color, size, sku, price, moq,
    active, sort_order, attributes, updated_at
  )
  VALUES (
    p_product_id, v_variant_key, v_label, v_color, v_size, v_sku, v_price, v_moq,
    v_active, v_sort_order, v_attributes, now()
  )
  ON CONFLICT (product_id, variant_key)
  DO UPDATE SET
    label = EXCLUDED.label,
    color = EXCLUDED.color,
    size = EXCLUDED.size,
    sku = EXCLUDED.sku,
    price = EXCLUDED.price,
    moq = EXCLUDED.moq,
    active = EXCLUDED.active,
    sort_order = EXCLUDED.sort_order,
    attributes = EXCLUDED.attributes,
    updated_at = now()
  RETURNING id INTO v_variant_id;

  DELETE FROM public.product_media
  WHERE product_id = p_product_id
    AND variant_id = v_variant_id;

  INSERT INTO public.product_media (
    product_id, variant_id, url, media_type, alt_text, sort_order, metadata
  )
  SELECT
    p_product_id,
    v_variant_id,
    media.url,
    'image',
    coalesce(v_label, 'Média variante'),
    media.sort_order,
    '{}'::jsonb
  FROM (
    SELECT DISTINCT ON (dedupe_key)
      clean_url AS url,
      (row_number() OVER (ORDER BY first_ordinal) - 1)::integer AS sort_order
    FROM (
      SELECT
        lower(trim(url_value)) AS dedupe_key,
        trim(url_value) AS clean_url,
        ordinality AS first_ordinal
      FROM unnest(coalesce(p_media_urls, ARRAY[]::text[])) WITH ORDINALITY AS u(url_value, ordinality)
      WHERE trim(url_value) <> ''
        AND char_length(trim(url_value)) <= 2000
        AND trim(url_value) ~* '^https?://'
      ORDER BY lower(trim(url_value)), ordinality
    ) dedup
    ORDER BY dedupe_key, first_ordinal
  ) media;

  GET DIAGNOSTICS v_media_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'variant_id', v_variant_id,
    'media_count', v_media_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_product_variant(
  p_variant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT public.is_chat_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF p_variant_id IS NULL THEN
    RAISE EXCEPTION 'variant_id_invalid';
  END IF;

  DELETE FROM public.product_variants
  WHERE id = p_variant_id;

  RETURN FOUND;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_product_variant_graph(bigint, jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_product_variant_graph(bigint, jsonb, text[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_product_variant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_product_variant(uuid) TO authenticated;
