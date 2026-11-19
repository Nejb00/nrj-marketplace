-- NRJ Marketplace - public role privilege remediation
--
-- REVIEW PROPOSAL ONLY.
-- This file intentionally lives outside supabase/migrations.
-- It has NOT been executed against any database.
--
-- Purpose:
--   * Keep public catalogue SELECT for anon on products, categories,
--     product_variants and product_media.
--   * Remove all other current table privileges from anon.
--   * Preserve authenticated SELECT / INSERT / UPDATE / DELETE grants,
--     but remove TRUNCATE / REFERENCES / TRIGGER / MAINTAIN.
--   * Prevent postgres-owned future public tables from reintroducing
--     these privileges through postgres's schema-specific default ACL.
--
-- This does not alter RLS policies, product data, service_role grants,
-- sequence ACLs, functions, or supabase_admin's platform-managed defaults.
-- A separate operator review is required for the latter.

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DO $preflight$
DECLARE
  v_postgres_oid oid;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION
      'Run only through the approved postgres-owned migration path; current_user=%',
      current_user;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'Expected Supabase roles anon and authenticated are missing';
  END IF;

  -- Per-schema defaults are additive to global defaults. A schema-scoped
  -- REVOKE cannot cancel a global grant inherited by anon or authenticated.
  -- Fail closed if postgres has such global table defaults before proceeding.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclnamespace = 0
      AND d.defaclobjtype = 'r'
      AND (
        CASE
          WHEN acl.grantee = 0 THEN true
          ELSE pg_catalog.pg_has_role('anon'::regrole::oid, acl.grantee, 'USAGE')
        END
        OR (
          acl.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
          AND CASE
            WHEN acl.grantee = 0 THEN true
            ELSE pg_catalog.pg_has_role('authenticated'::regrole::oid, acl.grantee, 'USAGE')
          END
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Global postgres table defaults grant privileges to PUBLIC/anon or structural rights to authenticated; an IN SCHEMA REVOKE cannot cancel them, so operator review is required';
  END IF;

  SELECT oid INTO v_postgres_oid
  FROM pg_catalog.pg_roles
  WHERE rolname = 'postgres';

  -- Fail closed if a public relation is not owned by postgres. The current
  -- audit snapshot showed all 16 application relations owned by postgres.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND c.relowner <> v_postgres_oid
  ) THEN
    RAISE EXCEPTION
      'A public relation is not owned by postgres; review its grants separately before broad REVOKE';
  END IF;

  -- Public reads must remain possible for the four relations with explicit
  -- public SELECT policies used by the storefront.
  IF to_regclass('public.products') IS NULL
     OR to_regclass('public.categories') IS NULL
     OR to_regclass('public.product_variants') IS NULL
     OR to_regclass('public.product_media') IS NULL THEN
    RAISE EXCEPTION 'One or more public catalogue read relations are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.products'::regclass
      AND p.polcmd = 'r'
      AND 'anon'::regrole::oid = ANY(p.polroles)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.categories'::regclass
      AND p.polcmd = 'r'
      AND 'anon'::regrole::oid = ANY(p.polroles)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.product_variants'::regclass
      AND p.polcmd = 'r'
      AND 'anon'::regrole::oid = ANY(p.polroles)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p
    WHERE p.polrelid = 'public.product_media'::regclass
      AND p.polcmd = 'r'
      AND 'anon'::regrole::oid = ANY(p.polroles)
  ) THEN
    RAISE EXCEPTION
      'A required public catalogue SELECT policy is missing; review API behavior before revoking privileges';
  END IF;
END
$preflight$;

-- anon is a public visitor role. It needs SELECT only on the storefront
-- catalogue relations. Anonymous chat, cart, favorites and checkout flows
-- call signInAnonymously first, which issues the authenticated database role.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;

GRANT SELECT
  ON TABLE public.products, public.categories, public.product_variants, public.product_media
  TO anon;

-- Authenticated clients use row-scoped CRUD policies. These structural
-- privileges are not ordinary application CRUD and are not controlled by RLS.
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public
  FROM authenticated;

-- Existing application relations are owned by postgres. Prevent future tables
-- created by postgres in public from inheriting the same structural grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLES FROM authenticated;

DO $postflight$
DECLARE
  v_relation record;
BEGIN
  -- anon may SELECT the four explicit public catalogue relations and nothing
  -- else in public; it may hold no write or structural table privilege.
  FOR v_relation IN
    SELECT c.oid, c.relname, c.relkind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    IF has_table_privilege('anon', v_relation.oid, 'INSERT')
       OR has_table_privilege('anon', v_relation.oid, 'UPDATE')
       OR has_table_privilege('anon', v_relation.oid, 'DELETE')
       OR has_table_privilege('anon', v_relation.oid, 'TRUNCATE')
       OR has_table_privilege('anon', v_relation.oid, 'REFERENCES')
       OR has_table_privilege('anon', v_relation.oid, 'TRIGGER')
       OR has_table_privilege('anon', v_relation.oid, 'MAINTAIN')
       OR has_any_column_privilege('anon', v_relation.oid, 'INSERT')
       OR has_any_column_privilege('anon', v_relation.oid, 'UPDATE')
       OR has_any_column_privilege('anon', v_relation.oid, 'REFERENCES') THEN
      RAISE EXCEPTION
        'anon retains a non-read or column-level privilege on public.%', v_relation.relname;
    END IF;

    IF v_relation.relname IN ('products', 'categories', 'product_variants', 'product_media') THEN
      IF NOT has_table_privilege('anon', v_relation.oid, 'SELECT') THEN
        RAISE EXCEPTION 'anon lost required public SELECT on public.%', v_relation.relname;
      END IF;
    ELSIF has_table_privilege('anon', v_relation.oid, 'SELECT') THEN
      RAISE EXCEPTION 'anon retains unexpected SELECT on public.%', v_relation.relname;
    END IF;

    -- Preserve ordinary authenticated CRUD grants, but never structural or
    -- maintenance privileges that can bypass row-level application policies.
    IF has_table_privilege('authenticated', v_relation.oid, 'TRUNCATE')
       OR has_table_privilege('authenticated', v_relation.oid, 'REFERENCES')
       OR has_table_privilege('authenticated', v_relation.oid, 'TRIGGER')
       OR has_table_privilege('authenticated', v_relation.oid, 'MAINTAIN')
       OR has_any_column_privilege('authenticated', v_relation.oid, 'REFERENCES') THEN
      RAISE EXCEPTION
        'authenticated retains a structural or maintenance privilege on public.%', v_relation.relname;
    END IF;
  END LOOP;

  -- Verify effective future-table defaults at both global and public scope.
  -- This also catches PUBLIC grants and grants inherited through role membership.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl d
    CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) acl
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclobjtype = 'r'
      AND d.defaclnamespace IN (0, 'public'::regnamespace::oid)
      AND (
        CASE
          WHEN acl.grantee = 0 THEN true
          ELSE pg_catalog.pg_has_role('anon'::regrole::oid, acl.grantee, 'USAGE')
        END
        OR (
          acl.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')
          AND CASE
            WHEN acl.grantee = 0 THEN true
            ELSE pg_catalog.pg_has_role('authenticated'::regrole::oid, acl.grantee, 'USAGE')
          END
        )
      )
  ) THEN
    RAISE EXCEPTION
      'postgres global/public table defaults still grant privileges to PUBLIC/anon or structural rights to authenticated';
  END IF;
END
$postflight$;

COMMIT;
