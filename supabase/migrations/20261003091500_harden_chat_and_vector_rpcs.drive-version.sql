-- NRJ Marketplace — durcissement du chat + RPC vectoriels
-- 2026-10-03

-- Les clients ne doivent pouvoir modifier sur leur session que leur nom
-- et leur horodatage de saisie. Le reste est géré par l'admin ou les
-- mécanismes internes (triggers / fonctions SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.guard_chat_session_client_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Les mises à jour internes exécutées sous SECURITY DEFINER (notamment
  -- handle_new_chat_message) doivent pouvoir continuer à mettre à jour
  -- les champs techniques de la session.
  IF current_user = 'postgres' OR public.is_chat_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.product_name IS DISTINCT FROM OLD.product_name
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.last_message_at IS DISTINCT FROM OLD.last_message_at
     OR NEW.last_message_preview IS DISTINCT FROM OLD.last_message_preview
     OR NEW.unread_admin IS DISTINCT FROM OLD.unread_admin
     OR NEW.unread_client IS DISTINCT FROM OLD.unread_client
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
     OR NEW.admin_typing_at IS DISTINCT FROM OLD.admin_typing_at
  THEN
    RAISE EXCEPTION 'client may only update customer_name and customer_typing_at';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_chat_session_client_update ON public.chat_sessions;

CREATE TRIGGER guard_chat_session_client_update
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_chat_session_client_update();

-- Ces RPC SECURITY DEFINER ne sont pas utilisés par le frontend actuel.
-- Ils sont donc retirés de l'API client. Ils pourront rester consommables
-- via une future couche serveur/service_role si nécessaire.
REVOKE EXECUTE ON FUNCTION public.match_products(vector, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_products(vector, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.match_products(vector, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.match_similar_products(bigint, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.match_similar_products(bigint, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.match_similar_products(bigint, integer) FROM authenticated;
