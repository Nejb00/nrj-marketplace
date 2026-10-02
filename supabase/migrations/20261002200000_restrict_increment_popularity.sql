-- Prevent unauthenticated callers from directly inflating product popularity.
-- Anonymous Supabase users use the authenticated Postgres role.
REVOKE EXECUTE ON FUNCTION public.increment_popularity(bigint, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_popularity(integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_popularity(bigint, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_popularity(integer, integer) TO authenticated;
