-- NRJ Marketplace — sécurité RLS + premiers index de performance
-- 2026-10-02

CREATE OR REPLACE FUNCTION public.is_chat_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT
    (SELECT auth.role()) = 'authenticated'
    AND COALESCE((SELECT (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    AND (SELECT auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$function$;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.products;
DROP POLICY IF EXISTS "products lecture publique" ON public.products;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.products;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.products;
DROP POLICY IF EXISTS "products ecriture vendeur" ON public.products;
DROP POLICY IF EXISTS "nrj_admin_update_products" ON public.products;

CREATE POLICY "products lecture publique"
  ON public.products FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "products admin insert"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_chat_admin()));

CREATE POLICY "products admin update"
  ON public.products FOR UPDATE TO authenticated
  USING ((SELECT public.is_chat_admin()))
  WITH CHECK ((SELECT public.is_chat_admin()));

CREATE POLICY "products admin delete"
  ON public.products FOR DELETE TO authenticated
  USING ((SELECT public.is_chat_admin()));

DROP POLICY IF EXISTS "Allow public read access" ON public.categories;
DROP POLICY IF EXISTS "categories lecture publique" ON public.categories;
DROP POLICY IF EXISTS "categories ecriture vendeur" ON public.categories;

CREATE POLICY "categories lecture publique"
  ON public.categories FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "categories admin insert"
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_chat_admin()));

CREATE POLICY "categories admin update"
  ON public.categories FOR UPDATE TO authenticated
  USING ((SELECT public.is_chat_admin()))
  WITH CHECK ((SELECT public.is_chat_admin()));

CREATE POLICY "categories admin delete"
  ON public.categories FOR DELETE TO authenticated
  USING ((SELECT public.is_chat_admin()));

DROP POLICY IF EXISTS "Public access for carts" ON public.carts;
CREATE POLICY "carts own row"
  ON public.carts FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())::text)
  WITH CHECK (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Public access for favorites" ON public.favorites;
CREATE POLICY "favorites own row"
  ON public.favorites FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid())::text)
  WITH CHECK (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Public insert clean orders" ON public.orders;
DROP POLICY IF EXISTS "Public read orders" ON public.orders;
DROP POLICY IF EXISTS "Admin manage orders" ON public.orders;

CREATE POLICY "orders public insert pending"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND payment_reference IS NULL
    AND validated_by IS NULL
    AND validated_at IS NULL
  );

CREATE POLICY "orders own read"
  ON public.orders FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())::text
    OR (SELECT public.is_chat_admin())
  );

CREATE POLICY "orders admin update"
  ON public.orders FOR UPDATE TO authenticated
  USING ((SELECT public.is_chat_admin()))
  WITH CHECK ((SELECT public.is_chat_admin()));

CREATE POLICY "orders admin delete"
  ON public.orders FOR DELETE TO authenticated
  USING ((SELECT public.is_chat_admin()));

DROP POLICY IF EXISTS "chat admin sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat client sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "client_insert_own_session" ON public.chat_sessions;
DROP POLICY IF EXISTS "admin_select_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "client_select_own_session" ON public.chat_sessions;
DROP POLICY IF EXISTS "admin_update_sessions" ON public.chat_sessions;

CREATE POLICY "chat sessions select"
  ON public.chat_sessions FOR SELECT TO authenticated
  USING (
    (SELECT public.is_chat_admin())
    OR customer_user_id = (SELECT auth.uid())
  );

CREATE POLICY "chat sessions insert"
  ON public.chat_sessions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_chat_admin())
    OR customer_user_id = (SELECT auth.uid())
  );

CREATE POLICY "chat sessions update"
  ON public.chat_sessions FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_chat_admin())
    OR customer_user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT public.is_chat_admin())
    OR customer_user_id = (SELECT auth.uid())
  );

CREATE POLICY "chat sessions delete"
  ON public.chat_sessions FOR DELETE TO authenticated
  USING (
    (SELECT public.is_chat_admin())
    OR customer_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "admin_insert_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "chat ecrire admin" ON public.chat_messages;
DROP POLICY IF EXISTS "chat ecrire client" ON public.chat_messages;
DROP POLICY IF EXISTS "client_insert_own_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "admin_select_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "chat lire propre ou admin" ON public.chat_messages;
DROP POLICY IF EXISTS "client_select_own_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "chat maj admin" ON public.chat_messages;
DROP POLICY IF EXISTS "chat suppr admin" ON public.chat_messages;

CREATE POLICY "chat messages select"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    (SELECT public.is_chat_admin())
    OR EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id
        AND s.customer_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "chat messages insert"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    (
      (SELECT public.is_chat_admin())
      AND sender = 'admin'
    )
    OR (
      sender = 'client'
      AND EXISTS (
        SELECT 1 FROM public.chat_sessions s
        WHERE s.id = chat_messages.session_id
          AND s.customer_user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "chat messages update admin"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING ((SELECT public.is_chat_admin()))
  WITH CHECK ((SELECT public.is_chat_admin()));

CREATE POLICY "chat messages delete admin"
  ON public.chat_messages FOR DELETE TO authenticated
  USING ((SELECT public.is_chat_admin()));

DROP POLICY IF EXISTS "admin_all_settings" ON public.chat_settings;
CREATE POLICY "chat settings admin"
  ON public.chat_settings FOR ALL TO authenticated
  USING ((SELECT public.is_chat_admin()))
  WITH CHECK ((SELECT public.is_chat_admin()));

CREATE OR REPLACE FUNCTION public.increment_popularity(product_id bigint, amount integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF amount IS NULL OR amount < 1 OR amount > 10 THEN
    RAISE EXCEPTION 'invalid popularity amount';
  END IF;

  UPDATE public.products
  SET popularity_score = COALESCE(popularity_score, 0) + amount
  WHERE id = $1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_popularity(product_id integer, amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF amount IS NULL OR amount < 1 OR amount > 10 THEN
    RAISE EXCEPTION 'invalid popularity amount';
  END IF;

  UPDATE public.products
  SET popularity_score = COALESCE(popularity_score, 0) + amount
  WHERE id = $1;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_categories_parent_id
  ON public.categories(parent_id);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_product_id
  ON public.chat_sessions(product_id);

CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON public.products(category_id);
