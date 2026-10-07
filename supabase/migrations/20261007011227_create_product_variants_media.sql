-- NRJ Marketplace — Product Variants & Media V2
-- Fondations rétrocompatibles : Product ≠ Variant ≠ Media.
-- Les colonnes image...image6 et tailles/couleurs restent la source legacy.
-- Cette migration n'altère pas les lignes existantes hormis leur indexation
-- dans une variante legacy et leurs médias existants.

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_key text NOT NULL,
  label text,
  color text,
  size text,
  sku text,
  price numeric,
  moq text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, variant_key),
  UNIQUE (product_id, id)
);

CREATE TABLE IF NOT EXISTS public.product_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid,
  url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  alt_text text,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_media_type_check
    CHECK (media_type IN ('image', 'video')),
  CONSTRAINT product_media_variant_fk
    FOREIGN KEY (product_id, variant_id)
    REFERENCES public.product_variants(product_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx
  ON public.product_variants(product_id, active, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS product_variants_sku_unique_idx
  ON public.product_variants(sku)
  WHERE sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_media_product_id_idx
  ON public.product_media(product_id, sort_order);

CREATE INDEX IF NOT EXISTS product_media_variant_id_idx
  ON public.product_media(variant_id, sort_order);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product variants lecture publique" ON public.product_variants;
CREATE POLICY "product variants lecture publique"
  ON public.product_variants
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "product variants admin insert" ON public.product_variants;
CREATE POLICY "product variants admin insert"
  ON public.product_variants
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_chat_admin()));

DROP POLICY IF EXISTS "product variants admin update" ON public.product_variants;
CREATE POLICY "product variants admin update"
  ON public.product_variants
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_chat_admin()))
  WITH CHECK ((SELECT public.is_chat_admin()));

DROP POLICY IF EXISTS "product variants admin delete" ON public.product_variants;
CREATE POLICY "product variants admin delete"
  ON public.product_variants
  FOR DELETE TO authenticated
  USING ((SELECT public.is_chat_admin()));

DROP POLICY IF EXISTS "product media lecture publique" ON public.product_media;
CREATE POLICY "product media lecture publique"
  ON public.product_media
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "product media admin insert" ON public.product_media;
CREATE POLICY "product media admin insert"
  ON public.product_media
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_chat_admin()));

DROP POLICY IF EXISTS "product media admin update" ON public.product_media;
CREATE POLICY "product media admin update"
  ON public.product_media
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_chat_admin()))
  WITH CHECK ((SELECT public.is_chat_admin()));

DROP POLICY IF EXISTS "product media admin delete" ON public.product_media;
CREATE POLICY "product media admin delete"
  ON public.product_media
  FOR DELETE TO authenticated
  USING ((SELECT public.is_chat_admin()));

GRANT SELECT ON public.product_variants, public.product_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants, public.product_media TO authenticated;

-- Backfill sûr : une variante 'legacy' par produit, sans inventer de combinaisons
-- couleur × taille que les données historiques ne permettent pas de déduire.
INSERT INTO public.product_variants (product_id, variant_key, label, active, sort_order)
SELECT p.id, 'legacy', 'Configuration actuelle', true, 0
FROM public.products p
ON CONFLICT (product_id, variant_key) DO NOTHING;

-- Les médias historiques restent attachés à la variante legacy.
INSERT INTO public.product_media (
  product_id, variant_id, url, media_type, sort_order, alt_text
)
SELECT
  p.id,
  v.id,
  trim(m.url),
  'image',
  m.sort_order,
  p.name
FROM public.products p
JOIN public.product_variants v
  ON v.product_id = p.id
 AND v.variant_key = 'legacy'
CROSS JOIN LATERAL (
  VALUES
    (0, p.image),
    (1, p.image2),
    (2, p.image3),
    (3, p.image4),
    (4, p.image5),
    (5, p.image6)
) AS m(sort_order, url)
WHERE trim(coalesce(m.url, '')) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.product_media existing
    WHERE existing.product_id = p.id
      AND existing.variant_id = v.id
      AND existing.url = trim(m.url)
      AND existing.sort_order = m.sort_order
  );
