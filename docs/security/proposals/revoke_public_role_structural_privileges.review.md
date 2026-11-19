# NRJ Marketplace — public-role privilege remediation review

**Status:** proposal for security review only; not an active Supabase migration  
**Prepared:** 19 November 2026  
**Branch:** `security/review-public-role-privileges`  
**Base:** NRJ Marketplace `main` at `c35e887cb878e5e55c0d46a250b4d4b801ab482b`

## Scope and safety boundary

This proposal addresses excessive table privileges assigned to the Supabase database roles `anon` and `authenticated` in the exposed `public` schema. It does not change production.

- No SQL has been applied.
- No role, membership, password, policy, sequence, function, table, or data has been changed.
- No Supabase migration has been created or executed.
- No PR, merge, or deployment has been created.

SQL proposal: [`revoke_public_role_structural_privileges.sql`](./revoke_public_role_structural_privileges.sql)

The SQL is intentionally under `docs/security/proposals/`, not `supabase/migrations/`. A separately approved operation using the repository's Supabase migration workflow is required before it can become an active migration.

## Live audit evidence — 19 November 2026

The read-only audit targeted the connected Supabase project `nrj-marketplace` in `eu-west-3`, status `ACTIVE_HEALTHY`, PostgreSQL 17.11. It used SELECT-only metadata, ACL, policy and aggregate queries as the administrative `postgres` session.

All 16 application relations in schema `public` were owned by `postgres`. The audit found no column-specific ACL entries on public table columns; the excessive privileges are table-level ACLs and are visible through effective privilege checks.

### Effective anonymous privileges

The role `anon` currently has at least one non-SELECT privilege on 14 public relations:

- `products`: INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN.
- `chat_messages` and `chat_sessions`: INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN.
- `categories`, `carts`, `chat_settings`, `favorites`, `orders`, `payment_status_history`, `payments`, `product_embeddings`, `product_media`, `product_variants`, and `product_views`: TRUNCATE, REFERENCES, TRIGGER and MAINTAIN.

The two relations without any effective anon table privilege beyond the inventory are `payment_events` and `product_imports`.

The role has SELECT privileges on `products`, `categories`, `product_variants`, `product_media`, and also on `chat_messages` and `chat_sessions`. The latter two do not have an anon SELECT RLS policy, so that SQL privilege does not presently make their rows visible to unauthenticated visitors. The proposal removes those unnecessary grants.

A second live query of the effective privileges confirmed:
- anon has at least one non-SELECT privilege on **14 of the 16** application relations;
- anon's SELECT table grants currently cover six relations: the four public catalogue relations plus chat messages and sessions (the latter two are not visible to anon because their RLS policies target authenticated);
- authenticated has TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on **15 of the 16** application relations;
- no column-level ACL entries exist on public table columns at audit time.

All 16 public application relations are owned by postgres, so the proposed ownership preflight matches the current database. The proposal intentionally removes only table-level privileges; its postflight additionally detects any effective column-level write/reference privileges that would otherwise survive a table-level REVOKE.

### Effective authenticated structural privileges

The role `authenticated` currently has TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on 15 public relations. These privileges are not normal row CRUD and are not restricted by the row-level policies in the same way as INSERT, UPDATE and DELETE. In particular, TRUNCATE is not governed by row-level policy predicates.

The application has no need for browser users to create triggers, define foreign-key references or perform table maintenance. The proposed remediation therefore removes only those structural privileges from `authenticated`, while preserving its existing SELECT / INSERT / UPDATE / DELETE grants and all existing RLS policies.

### Current public RLS policies and code paths

The live policy inventory shows public SELECT policies on:

- `products`
- `categories`
- `product_variants`
- `product_media`

It also shows the `orders public insert pending` policy for `anon, authenticated`. However, the live ACL reports `anon` has no INSERT privilege on `orders`; the policy alone does not provide that ability. This proposal does not grant anonymous order creation and does not alter that policy.

Repository code review confirms the public access model:

- Storefront catalogue reads use `products` and `categories` before a visitor needs a Supabase Auth session.
- Product detail hydration reads `product_variants` and `product_media` publicly.
- Cart and favorites synchronization calls `signInAnonymously()` before its upserts; those requests use the `authenticated` database role.
- Chat session creation and message insertion call `signInAnonymously()` before using `chat_sessions` and `chat_messages`; those requests use `authenticated`.
- Product popularity and view tracking also establish an anonymous Auth session before calling their RPC or insert.
- Mobile Money checkout establishes an anonymous Auth session and calls the `create-order` Edge Function with its access token. The browser does not insert directly into `public.orders`.
- Admin product insert/update/delete code is governed by authenticated role access and the existing `is_chat_admin()` RLS predicates.

Thus, raw database role `anon` needs only SELECT on the four catalogue relations. Anonymous Auth users are distinct: once signed in anonymously, their SQL role is `authenticated`, and they continue to be subject to the existing row-level policies.

## PostgreSQL default ACL findings

The live default ACL for owner `postgres` in schema `public` currently grants `anon` and `authenticated` TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on future tables.

The proposal includes narrowly scoped changes to `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public` so that:

- `anon` receives no automatic privileges on future public tables; public SELECT must be granted explicitly per table.
- `authenticated` does not automatically receive TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on future public tables.

It preserves any default privileges for `service_role`.

A separate platform-managed default ACL exists for owner `supabase_admin` in schema `public`. The audit found that `postgres` cannot `SET ROLE supabase_admin` in this project. This proposal does not attempt to alter that platform-managed ACL. A Supabase operator must review it separately if user/application tables are ever created under `supabase_admin`; the intended application migration path should continue to create application tables as `postgres`.

## Proposed changes

The SQL proposal runs in one transaction and fails closed unless:

1. The SQL session is running as `postgres`.
2. `anon` and `authenticated` exist.
3. Every current public relation is owned by `postgres`.
4. The four required public catalogue SELECT policies still exist.
5. All postflight checks pass before COMMIT.

It then:

1. Revokes all existing table privileges from `anon`.
2. Restores SELECT only on `products`, `categories`, `product_variants` and `product_media`.
3. Revokes TRUNCATE, REFERENCES, TRIGGER and MAINTAIN from `authenticated`, preserving its normal DML and SELECT grants.
4. Updates postgres-owned public default privileges so new public tables do not reintroduce anonymous table access or authenticated structural privileges.
5. Verifies that anon has no write, structural, or column-level write privilege on any public relation; that its SELECT access is limited to the four approved catalogue relations; that authenticated has no structural/maintenance privileges; and that the relevant postgres default ACLs have been corrected.

The script does not alter service_role, PUBLIC relation grants, public schema USAGE/CREATE, policies, functions, sequences or row data.

## Security audit tooling changes on this branch

The current deterministic RLS audit previously read `information_schema.role_table_grants` and flagged only anon INSERT, UPDATE and DELETE. That missed PostgreSQL 17 `MAINTAIN` and the structural rights held by authenticated users.

This branch proposes extending the snapshot with effective table privilege checks against PostgreSQL's privilege functions for both `anon` and `authenticated`, then adding:
- `SEC-RLS-004`: any non-SELECT table privilege held by `anon`.
- `SEC-RLS-005`: TRUNCATE, REFERENCES, TRIGGER or MAINTAIN held by `authenticated`.

Regression tests cover allowed anonymous SELECT, allowed authenticated CRUD, and rejection of excessive anonymous/authenticated table privileges.

## Review checklist before promotion

- [ ] Review code call-site analysis for public catalogue reads and anonymous-authenticated writes.
- [ ] Confirm the approved public SELECT surface is exactly the four catalogue relations.
- [ ] Review the proposed revocations with a PostgreSQL/Supabase operator.
- [ ] Confirm the deployment path applies user migrations as `postgres`.
- [ ] Decide separately how to handle the platform-managed `supabase_admin` default ACL.
- [ ] Create the actual migration using the repository's supported Supabase CLI migration workflow.
- [ ] Test the migration against a non-production database before applying it to the hosted project.
- [ ] Run the enhanced RLS security snapshot and confirm no SEC-RLS-004 or SEC-RLS-005 findings remain.
- [ ] Perform storefront catalogue reads, product variant/media hydration, anonymous-auth cart/favorites sync, chat send/read, admin product CRUD, and checkout Edge Function smoke tests.
- [ ] Only after those checks pass, request approval for production application.

## Rollback outline

Because the SQL is transactional, a failed preflight or postflight rolls back all changes in the transaction. If a later approved migration causes a verified application regression, restore only the exact required privilege(s) for the affected role and object through a separately reviewed rollback. Do not restore broad ALL privileges by default.

**Verification update — 19 November 2026**

- The branch's updated snapshot SQL was executed as a SELECT-only query against the hosted project. It returned 16 public application tables, 35 public functions and 32 effective privilege records (two application roles × 16 relations).
- The live snapshot independently confirms 14 relations with anon non-SELECT access and 15 relations with authenticated structural privileges.
- `node --test test/rls-security-audit.test.js` was run locally against the feature-branch versions of the audit and test files: **5 tests passed, 0 failed**.
- GitHub's commit status reports Vercel success for the review branch; the Vercel deployment is a Preview (`READY`, not Production).
- No GitHub Actions run was triggered for the feature branch: the repository's Security Audit and NRJ Governance Audit workflows are configured for pull requests targeting `main`, pushes to `main`, schedules, or manual dispatch. No pull request was opened to trigger them.

## Current status

- Live audit: completed with SELECT-only queries.
- SQL proposal: added on this feature branch, not executed.
- Security audit snapshot: extended to expose effective PostgreSQL 17 table privileges.
- Audit rules: extended for anon and authenticated structural grants.
- Regression tests: **5/5 passed locally**. GitHub Actions CI has not run for this branch; only the Vercel Preview status is green.
- Supabase hosted database: unchanged.
- NRJ Marketplace main: unchanged.
- No PR, merge, role, secret, or deployment.
