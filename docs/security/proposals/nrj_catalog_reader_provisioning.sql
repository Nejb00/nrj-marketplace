-- NRJ-ACC SEC-004.9 — dedicated, column-scoped catalog reader
--
-- REVIEW PROPOSAL ONLY. This file intentionally lives outside
-- supabase/migrations so routine deployment commands cannot pick it up.
-- Do not execute until:
--   1) the live preflight in the companion review note has been completed;
--   2) the schema, RLS policies, effective grants and SECURITY DEFINER ACLs
--      are verified against the intended NRJ Marketplace database;
--   3) the repository owner explicitly approves promotion into migrations.
--
-- This script creates a LOGIN role without a password. Set the password later
-- through an authorized secure interactive channel; never add it here.
--
-- The script fails closed if PUBLIC already grants access that would violate
-- the reader's isolation. It deliberately does not revoke global PUBLIC
-- privileges or modify existing anon/authenticated policies or APIs.

BEGIN;

DO $preflight$
DECLARE
  v_role_oid oid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'nrj_catalog_reader'
  ) THEN
    RAISE EXCEPTION
      'nrj_catalog_reader already exists; inspect and reconcile it manually';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'products'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'public.products is missing, is not a table, or does not have RLS enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'categories'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION
      'public.categories is missing, is not a table, or does not have RLS enabled';
  END IF;

  -- Verify the type assumptions made by the fixed SEC-004.8 SQL.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'id' AND udt_name = 'int8'
  ) THEN
    RAISE EXCEPTION 'public.products.id must be bigint';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products'
      AND column_name = 'category_id' AND udt_name = 'uuid'
  ) THEN
    RAISE EXCEPTION 'public.products.category_id must be uuid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories'
      AND column_name = 'id' AND udt_name = 'uuid'
  ) THEN
    RAISE EXCEPTION 'public.categories.id must be uuid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories'
      AND column_name = 'parent_id' AND udt_name = 'uuid'
  ) THEN
    RAISE EXCEPTION 'public.categories.parent_id must be uuid';
  END IF;

  -- Validate driver/reader types, not only column names. The reader returns
  -- text-like fields as JSON strings and display_order as a JS integer.
  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('products','name', ARRAY['text','varchar','bpchar']::text[]),
        ('products','price', ARRAY['numeric','int2','int4','int8','float4','float8','text','varchar','bpchar']::text[]),
        ('products','image', ARRAY['text','varchar','bpchar']::text[]),
        ('products','created_at', ARRAY['timestamptz','timestamp','date']::text[]),
        ('products','moq', ARRAY['text','varchar','bpchar','numeric','int2','int4','int8']::text[]),
        ('products','tailles', ARRAY['text','varchar','bpchar']::text[]),
        ('products','couleurs', ARRAY['text','varchar','bpchar']::text[]),
        ('categories','name', ARRAY['text','varchar','bpchar']::text[]),
        ('categories','slug', ARRAY['text','varchar','bpchar']::text[]),
        ('categories','icon', ARRAY['text','varchar','bpchar']::text[]),
        ('categories','display_order', ARRAY['int2','int4']::text[])
    ) AS expected(table_name, column_name, allowed_udt_names)
    JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = expected.table_name
     AND c.column_name = expected.column_name
    WHERE NOT (c.udt_name = ANY(expected.allowed_udt_names))
  ) THEN
    RAISE EXCEPTION
      'One or more catalog columns have types incompatible with the SEC-004.8 output validators';
  END IF;

  -- Every field selected by SEC-004.8 must exist before any role is created.
  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        ('products','id'), ('products','name'), ('products','price'),
        ('products','category_id'), ('products','image'),
        ('products','created_at'), ('products','moq'),
        ('products','tailles'), ('products','couleurs'),
        ('categories','id'), ('categories','name'), ('categories','parent_id'),
        ('categories','slug'), ('categories','icon'), ('categories','display_order')
    ) AS required(table_name, column_name)
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = required.table_name
     AND c.column_name = required.column_name
    WHERE c.column_name IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more SEC-004.8 catalog projection columns are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy p
    JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('products','categories')
      AND p.polname = 'nrj_acc_catalog_reader_select'
  ) THEN
    RAISE EXCEPTION 'nrj_acc_catalog_reader_select policy name already exists';
  END IF;

  -- PostgreSQL grants EXECUTE on new functions to PUBLIC by default unless
  -- default ACLs have changed. A PUBLIC grant on any SECURITY DEFINER routine
  -- would be inherited by this login. Never fix this with a global revoke here.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'A public SECURITY DEFINER routine is executable by PUBLIC; review its exact ACL and intended callers before provisioning';
  END IF;

  -- PUBLIC CREATE on the public schema cannot be neutralized for one role by
  -- a role-specific REVOKE, so fail rather than imply otherwise.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace n
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))
    ) acl
    WHERE n.nspname = 'public'
      AND acl.grantee = 0
      AND acl.privilege_type = 'CREATE'
  ) THEN
    RAISE EXCEPTION
      'PUBLIC has CREATE on schema public; resolve schema ACLs in a separately reviewed change';
  END IF;
END
$preflight$;

CREATE ROLE nrj_catalog_reader
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  NOINHERIT
  CONNECTION LIMIT 3;

ALTER ROLE nrj_catalog_reader
  SET default_transaction_read_only = on;
ALTER ROLE nrj_catalog_reader
  SET statement_timeout = '5s';
ALTER ROLE nrj_catalog_reader
  SET lock_timeout = '2s';
ALTER ROLE nrj_catalog_reader
  SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE nrj_catalog_reader
  SET search_path = pg_catalog, public;

-- A database login needs CONNECT. Grant it only on the current target database.
DO $grant_connect$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO nrj_catalog_reader',
    current_database()
  );
END
$grant_connect$;

REVOKE ALL PRIVILEGES ON SCHEMA public FROM nrj_catalog_reader;
GRANT USAGE ON SCHEMA public TO nrj_catalog_reader;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
  FROM nrj_catalog_reader;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
  FROM nrj_catalog_reader;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  FROM nrj_catalog_reader;

-- SELECT-only policies are distinct from the existing anon/authenticated rules.
-- The role receives no policy or SQL permission on other business tables.
CREATE POLICY nrj_acc_catalog_reader_select
  ON public.products
  AS PERMISSIVE
  FOR SELECT
  TO nrj_catalog_reader
  USING (true);

CREATE POLICY nrj_acc_catalog_reader_select
  ON public.categories
  AS PERMISSIVE
  FOR SELECT
  TO nrj_catalog_reader
  USING (true);

GRANT SELECT (
  id, name, price, category_id, image, created_at, moq, tailles, couleurs
) ON TABLE public.products TO nrj_catalog_reader;

GRANT SELECT (
  id, name, parent_id, slug, icon, display_order
) ON TABLE public.categories TO nrj_catalog_reader;

-- Postflight mirrors the trust boundary enforced by the SEC-004.8 reader.
DO $postflight$
DECLARE
  v_role_oid oid;
BEGIN
  SELECT oid INTO v_role_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'nrj_catalog_reader';

  IF v_role_oid IS NULL THEN
    RAISE EXCEPTION 'nrj_catalog_reader role was not created';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members
    WHERE member = v_role_oid OR roleid = v_role_oid
  ) THEN
    RAISE EXCEPTION 'nrj_catalog_reader must have no role memberships';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.oid = v_role_oid
      AND r.rolcanlogin
      AND NOT r.rolsuper
      AND NOT r.rolcreatedb
      AND NOT r.rolcreaterole
      AND NOT r.rolreplication
      AND NOT r.rolbypassrls
      AND NOT r.rolinherit
      AND r.rolconnlimit = 3
  ) THEN
    RAISE EXCEPTION 'nrj_catalog_reader role attributes do not match the required contract';
  END IF;

  IF NOT has_database_privilege(v_role_oid, current_database(), 'CONNECT') THEN
    RAISE EXCEPTION 'nrj_catalog_reader is missing CONNECT on the target database';
  END IF;

  IF NOT has_schema_privilege(v_role_oid, 'public', 'USAGE')
     OR has_schema_privilege(v_role_oid, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'nrj_catalog_reader schema privileges are not least-privilege';
  END IF;

  IF NOT (
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'products'
  ) OR NOT (
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'categories'
  ) THEN
    RAISE EXCEPTION 'RLS must remain enabled on both catalog relations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.products'::regclass
      AND p.polname = 'nrj_acc_catalog_reader_select'
      AND p.polcmd = 'r'
      AND p.polroles @> ARRAY[v_role_oid]::oid[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.categories'::regclass
      AND p.polname = 'nrj_acc_catalog_reader_select'
      AND p.polcmd = 'r'
      AND p.polroles @> ARRAY[v_role_oid]::oid[]
  ) THEN
    RAISE EXCEPTION 'Missing explicit SELECT-only RLS policy for nrj_catalog_reader';
  END IF;

  -- No table-level SELECT; only the exact SEC-004.8 column allowlists.
  IF has_table_privilege(v_role_oid, 'public.products', 'SELECT')
     OR has_table_privilege(v_role_oid, 'public.categories', 'SELECT') THEN
    RAISE EXCEPTION 'Table-level SELECT must not be granted to nrj_catalog_reader';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.products'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname <> ALL (
        ARRAY['id','name','price','category_id','image','created_at','moq','tailles','couleurs']::name[]
      )
      AND has_column_privilege(v_role_oid, a.attrelid, a.attnum, 'SELECT')
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = 'public.categories'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attname <> ALL (
        ARRAY['id','name','parent_id','slug','icon','display_order']::name[]
      )
      AND has_column_privilege(v_role_oid, a.attrelid, a.attnum, 'SELECT')
  ) THEN
    RAISE EXCEPTION 'Unexpected column-level SELECT privilege on a catalog table';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(
      ARRAY['id','name','price','category_id','image','created_at','moq','tailles','couleurs']::name[]
    ) allowed(column_name)
    WHERE NOT has_column_privilege(v_role_oid, 'public.products', allowed.column_name, 'SELECT')
  ) OR EXISTS (
    SELECT 1
    FROM unnest(
      ARRAY['id','name','parent_id','slug','icon','display_order']::name[]
    ) allowed(column_name)
    WHERE NOT has_column_privilege(v_role_oid, 'public.categories', allowed.column_name, 'SELECT')
  ) THEN
    RAISE EXCEPTION 'One or more allowlisted catalog columns are not readable';
  END IF;

  IF has_table_privilege(v_role_oid, 'public.products', 'INSERT')
     OR has_table_privilege(v_role_oid, 'public.products', 'UPDATE')
     OR has_table_privilege(v_role_oid, 'public.products', 'DELETE')
     OR has_table_privilege(v_role_oid, 'public.products', 'TRUNCATE')
     OR has_table_privilege(v_role_oid, 'public.products', 'REFERENCES')
     OR has_table_privilege(v_role_oid, 'public.products', 'TRIGGER')
     OR has_any_column_privilege(v_role_oid, 'public.products', 'INSERT')
     OR has_any_column_privilege(v_role_oid, 'public.products', 'UPDATE')
     OR has_any_column_privilege(v_role_oid, 'public.products', 'REFERENCES')
     OR has_table_privilege(v_role_oid, 'public.categories', 'INSERT')
     OR has_table_privilege(v_role_oid, 'public.categories', 'UPDATE')
     OR has_table_privilege(v_role_oid, 'public.categories', 'DELETE')
     OR has_table_privilege(v_role_oid, 'public.categories', 'TRUNCATE')
     OR has_table_privilege(v_role_oid, 'public.categories', 'REFERENCES')
     OR has_table_privilege(v_role_oid, 'public.categories', 'TRIGGER')
     OR has_any_column_privilege(v_role_oid, 'public.categories', 'INSERT')
     OR has_any_column_privilege(v_role_oid, 'public.categories', 'UPDATE')
     OR has_any_column_privilege(v_role_oid, 'public.categories', 'REFERENCES') THEN
    RAISE EXCEPTION 'nrj_catalog_reader unexpectedly has write or object-management privileges';
  END IF;

  -- No relation or sequence grants may leak in from PUBLIC or another ACL.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p','v','m','f')
      AND c.relname NOT IN ('products','categories')
      AND (
        has_table_privilege(v_role_oid, c.oid, 'SELECT')
        OR has_table_privilege(v_role_oid, c.oid, 'INSERT')
        OR has_table_privilege(v_role_oid, c.oid, 'UPDATE')
        OR has_table_privilege(v_role_oid, c.oid, 'DELETE')
        OR has_table_privilege(v_role_oid, c.oid, 'TRUNCATE')
        OR has_table_privilege(v_role_oid, c.oid, 'REFERENCES')
        OR has_table_privilege(v_role_oid, c.oid, 'TRIGGER')
        OR has_any_column_privilege(v_role_oid, c.oid, 'SELECT')
        OR has_any_column_privilege(v_role_oid, c.oid, 'INSERT')
        OR has_any_column_privilege(v_role_oid, c.oid, 'UPDATE')
        OR has_any_column_privilege(v_role_oid, c.oid, 'REFERENCES')
      )
  ) THEN
    RAISE EXCEPTION 'nrj_catalog_reader has privileges on an unrelated public relation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND (
        has_sequence_privilege(v_role_oid, c.oid, 'USAGE')
        OR has_sequence_privilege(v_role_oid, c.oid, 'SELECT')
        OR has_sequence_privilege(v_role_oid, c.oid, 'UPDATE')
      )
  ) THEN
    RAISE EXCEPTION 'nrj_catalog_reader must not have access to public sequences';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege(v_role_oid, p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'nrj_catalog_reader must not execute any public SECURITY DEFINER function';
  END IF;
END
$postflight$;

COMMIT;

-- Password intentionally omitted. Set it only through an approved secure
-- interactive process, then store the connection URL in the broker secret
-- manager as NRJ_MARKETPLACE_CATALOG_DATABASE_URL with sslmode=verify-full.
