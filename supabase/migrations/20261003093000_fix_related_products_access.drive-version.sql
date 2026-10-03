-- NRJ Marketplace — accès cohérent aux recommandations basées sur les vues
-- 2026-10-03

-- Les vues servent au calcul interne des recommandations.
-- Elles ne doivent pas être lisibles directement par le rôle anon.
DROP POLICY IF EXISTS "views_select_all" ON public.product_views;
DROP POLICY IF EXISTS "views_insert_all" ON public.product_views;

CREATE POLICY "views select authenticated"
  ON public.product_views FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "views insert authenticated"
  ON public.product_views FOR INSERT TO authenticated
  WITH CHECK (true);

GRANT SELECT, INSERT ON public.product_views TO authenticated;

-- Le RPC est consommé après authentification anonyme côté client.
-- Retire son exposition au rôle anon.
REVOKE EXECUTE ON FUNCTION public.get_related_products(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_related_products(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_related_products(integer, integer) TO authenticated;
