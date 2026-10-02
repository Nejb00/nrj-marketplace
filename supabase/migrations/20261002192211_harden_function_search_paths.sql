-- NRJ Marketplace — hardening des fonctions restantes
-- 2026-10-02

ALTER FUNCTION public.get_related_products(integer, integer)
  SET search_path = public;

ALTER FUNCTION public.update_carts_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_orders_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_favorites_updated_at()
  SET search_path = public;

ALTER FUNCTION public.get_subcategories_with_latest_image(uuid)
  SET search_path = public;

ALTER FUNCTION public.get_top_popular_subcategories(integer)
  SET search_path = public;

ALTER FUNCTION public.get_parent_categories_ranked()
  SET search_path = public;

ALTER FUNCTION public.get_subcategories_by_popularity(uuid)
  SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.mark_admin_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_customer_read() FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_admin_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_customer_read() TO authenticated;
