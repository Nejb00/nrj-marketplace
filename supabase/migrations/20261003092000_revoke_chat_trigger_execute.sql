-- NRJ Marketplace — ne pas exposer la fonction interne du trigger chat
-- 2026-10-03

REVOKE EXECUTE ON FUNCTION public.guard_chat_session_client_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_chat_session_client_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_chat_session_client_update() FROM authenticated;
