# NRJ-ACC SEC-004.9 — provisioning proposal review

**Status:** draft for review only; not an active Supabase migration  
**Prepared:** 2026-11-19  
**Branch:** `docs/sec-004/nrj-catalog-reader-provisioning`  
**Base:** NRJ Marketplace `main` at `c35e887cb878e5e55c0d46a250b4d4b801ab482b`

## Purpose

Prepare a dedicated PostgreSQL login for the NRJ-ACC SEC-004.8 catalog reader. This proposal is intentionally stored under `docs/security/proposals/`, not `supabase/migrations/`. It cannot be picked up by the normal Supabase migration directory workflow accidentally.

SQL draft: [`nrj_catalog_reader_provisioning.sql`](./nrj_catalog_reader_provisioning.sql)

This branch does not alter `main`, open a pull request, merge code, run Supabase CLI, connect to the hosted database, create a PostgreSQL role, set a password, create a secret, or enable a connector binding.

## Intended access boundary

| Resource | Allowed privileges |
|---|---|
| `public.products` | SELECT only on `id,name,price,category_id,image,created_at,moq,tailles,couleurs` |
| `public.categories` | SELECT only on `id,name,parent_id,slug,icon,display_order` |
| Other public tables/views/foreign tables | None |
| Public sequences | None |
| Public SECURITY DEFINER functions | No EXECUTE |
| Schema `public` | USAGE only; no CREATE |
| Database | CONNECT to the current target database only |

The login will be `nrj_catalog_reader`, with no superuser, createdb, createrole, replication, RLS bypass or role memberships. A maximum of three database connections is configured to match the reader pool's hard maximum.

## Why not reuse Supabase API roles?

The reviewed migration `20261002192115_harden_rls_and_fk_indexes.sql` grants `anon` and `authenticated` SELECT policies on the catalogue. The live ACL audit shows that `anon` also has broad table-level privileges on `products` (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN) and non-SELECT table privileges on `categories` (TRUNCATE, REFERENCES, TRIGGER and MAINTAIN). The current RLS policies restrict `anon` row writes on the catalogue, but RLS does not protect TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. These grants deserve a separate Marketplace security review; they are not changed by this proposal. `service_role` bypasses RLS and is explicitly excluded.

The proposal creates a dedicated role and separate SELECT policies for only two tables. It does not change existing `anon`/`authenticated` policies or their application API.

## Review findings and blockers

## Live audit snapshot — 19 November 2026

A read-only audit was completed against the connected Supabase project named `nrj-marketplace` in `eu-west-3`. The project reported `ACTIVE_HEALTHY`, PostgreSQL 17.11. The audit statements were SELECT-only and returned metadata, ACLs, policies and aggregate data-quality counts. The Supabase SQL session ran as `postgres` with `default_transaction_read_only=off`; no write statement was issued. This was an administrative audit query, not a connection using the future `nrj_catalog_reader` login.

### Catalog schema and data

- `public.products` and `public.categories` both exist, are owned by `postgres`, and have RLS enabled (`FORCE ROW LEVEL SECURITY` is false).
- All 15 SEC-004.8 projection columns exist with compatible types: products `id bigint`, `category_id uuid`, `price numeric`, `created_at timestamptz`; categories `id uuid`, `parent_id uuid`, `display_order integer`; remaining projection fields are text.
- Live counts: **359 products** and **190 categories**.
- Current validator-oriented aggregate checks: zero null/blank product names, zero null/blank category names, zero invalid price text values, zero non-positive product IDs, and zero null product category IDs.
- `products.name` is nullable at the schema level even though all current rows have valid values. The SQL proposal now fails closed if any existing row violates the reader's name/price/ID output contract.

### Roles, grants, policies and functions

- `nrj_catalog_reader` does **not** exist.
- The RLS policies on `products` and `categories` match the repository migrations: public SELECT for `anon, authenticated`, and authenticated admin-only row-write policies.
- The live `orders public insert pending` RLS policy exists for `anon, authenticated`, but the effective table ACL currently reports `anon` has **no INSERT privilege** on `orders`. Therefore that policy alone does not make anonymous INSERT executable in the live database. This corrects the earlier repository-only assumption.
- Both catalogue tables are owned by `postgres`; `anon` has broad table-level privileges on `products` (including INSERT/UPDATE/DELETE and TRUNCATE) but the current RLS policies provide no `anon` row-write policy. On `categories`, `anon` has SELECT plus TRUNCATE/REFERENCES/TRIGGER/MAINTAIN privileges. RLS does not protect TRUNCATE, REFERENCES, TRIGGER or MAINTAIN. These are separate existing Marketplace ACL findings and are not changed in this connector proposal.
- There are **14** `SECURITY DEFINER` functions in `public`. The live ACL inventory found **no PUBLIC EXECUTE** grant on any of them. In particular, `mark_admin_read(uuid)` and `mark_customer_read()` are executable by `authenticated`, not PUBLIC; this resolves the specific uncertainty raised by source-only review. Other privileged routines are restricted to `postgres`, `authenticated`, or `service_role` as shown by their explicit ACLs.
- Default function ACLs for owner `postgres` in `public` grant EXECUTE only to `postgres`. The observed `supabase_admin` default for `public` grants EXECUTE to `postgres`, `anon`, `authenticated` and `service_role`, not PUBLIC and not the future reader. The reader has no memberships and will receive no inherited access through those roles.
- The `public` schema grants PUBLIC USAGE but not PUBLIC CREATE. The live inventory found no relation or sequence ACL grants to PUBLIC.
- The only non-template database in this project is `postgres`; PUBLIC CONNECT is enabled there. The proposal also grants CONNECT explicitly to make the new role's required access clear.

### Implication for SEC-004.9

The current live schema and the specific SECURITY DEFINER ACL blocker are compatible with the dedicated reader proposal. The SQL file now also checks existing product/category data shape before role creation. This does **not** authorize execution: the SQL remains in `docs/security/proposals/`, has not been run, and the role/password/secret/binding remain absent. The separate, broader `anon` privilege findings should be handled on their own track after impact review; this proposal intentionally does not revoke or rewrite them.

### 1. Live schema must match reader validators

The preflight checks that both tables exist with RLS enabled; required columns are present; the product ID and category relation identifiers use the expected bigint/UUID types; and text/numeric/time/order columns match the reader's output contracts.

This is necessary because the reader's SQL casts some database values to text and its output validators require valid decimal string IDs/prices, UUIDs, strings and a numeric integer `display_order`.

If a type or column does not match, the transaction raises an exception and makes no changes. Adjust the reader or the proposal in a separate review instead of forcing a cast that masks schema drift.

### 2. Existing SECURITY DEFINER function ACLs require live verification

The repository migrations show explicit execution restrictions on multiple privileged routines, including:

- `increment_popularity(bigint, integer)` and `increment_popularity(integer, integer)`;
- vector matching functions;
- the chat trigger guard;
- product variant graph write functions;
- payment audit functions.

However, `20261002192211_harden_function_search_paths.sql` revokes `anon` on `mark_admin_read(uuid)` and `mark_customer_read()`, then grants `authenticated`, without showing a corresponding `PUBLIC` revoke in that migration. Frontend code uses these RPCs. The repository source alone does not establish the live function security mode or effective ACL.

The SQL proposal therefore fails before role creation if any SECURITY DEFINER function in `public` remains executable by PUBLIC. It does not perform a broad global revoke. If the preflight stops, an authorized operator must inspect exact function definitions and ACLs and decide separately whether any specific ACL change is safe for the existing application. Do not weaken the NRJ-ACC reader's identity gate simply to pass provisioning.

### 3. PUBLIC ACLs cannot be neutralized with role-specific REVOKE

A role-specific `REVOKE` cannot cancel privileges the role inherits from PUBLIC. The proposal fails closed if PUBLIC has CREATE on schema `public`, and its postflight checks the actual role's effective access to all other public relations, sequences and SECURITY DEFINER functions.

If these checks fail, do not add broad schema-wide or function-wide PUBLIC revocations to this proposal. Reconcile those ACLs in a separate, application-aware change.

### 4. Database CONNECT is explicit

The SQL uses a dynamic, identifier-quoted GRANT to grant CONNECT only on `current_database()`. It does not grant access to any other database.

### 5. No password in migration source

The SQL creates a LOGIN role without embedding a password. A password must be set later through an authorized secure interactive mechanism. The full connection URL must be stored only in the broker host's secret manager under `NRJ_MARKETPLACE_CATALOG_DATABASE_URL`, with TLS `sslmode=verify-full` for remote hosts.

Do not put credentials in GitHub, SQL, shell arguments, logs or chat.

## SQL controls

The SQL proposal is wrapped in one transaction and contains:

1. **Preflight:** reject an existing role, missing tables/columns, incompatible types, disabled RLS, invalid existing catalogue rows, policy-name collisions, PUBLIC EXECUTE on SECURITY DEFINER functions, or PUBLIC CREATE on `public`.
2. **Role creation:** least-privilege attributes, `NOINHERIT`, no memberships, connection limit 3, read-only defaults and short timeouts.
3. **Minimal grants:** CONNECT to the current database, USAGE on `public`, column-level SELECT on the two allowlists, and explicit SELECT-only policies.
4. **Postflight:** re-check role attributes, memberships, schema rights, RLS policies, exact column rights, no write or PostgreSQL 17 MAINTAIN rights, no unrelated public relation/sequence access, and no executable SECURITY DEFINER routine.
5. **Fail closed:** any failed predicate raises an exception before COMMIT, rolling back role, policy and grant changes from the transaction.

Note: PostgreSQL role creation and policy/ACL behavior still require validation against the actual Supabase PostgreSQL version using the intended migration execution path. This draft has not been run against a database and must not be described as runtime-tested.

## Review checklist before promotion

- [ ] Confirm the branch is based on the intended current Marketplace `main`.
- [x] Review the actual live catalog schema, column types and RLS settings (19 November 2026).
- [x] Run the live read-only role/function ACL inventory (19 November 2026).
- [x] Resolve the effective PUBLIC ACL of every SECURITY DEFINER function (none executable by PUBLIC at audit time).
- [x] Confirm no unrelated public relation or sequence is granted to PUBLIC at audit time.
- [ ] Review the SQL with a PostgreSQL/Supabase operator.
- [ ] Decide whether any application ACL change is separately required.
- [ ] Approve a follow-up commit that promotes the SQL into `supabase/migrations/`.
- [ ] Only after that migration has been approved/applied, set the password securely and configure the broker secret.
- [ ] Run the reader's bounded live identity and catalog read smoke test.
- [ ] Enable the exact workspace/project connector binding only after the smoke test passes.

## Rollback outline

If the SQL transaction fails, PostgreSQL rolls back the role, policies and grants created by that transaction. If a later approved password or connection is configured and a live check fails, disable the login first with:

```sql
ALTER ROLE nrj_catalog_reader NOLOGIN;
```

Then disable the broker secret/binding and investigate. Do not drop the role until ownership, dependencies and active sessions have been inspected. Do not alter unrelated Marketplace policies as a connector rollback.

## Current status

- Draft SQL: added on this documentation branch, outside migrations.
- Review note: added on this documentation branch.
- SQL execution: not performed.
- Hosted DB role/password: not created.
- Broker secret: not created.
- Administrative Supabase SQL audit: SELECT-only queries completed; no broker connection using `nrj_catalog_reader` has been attempted.
- Pull request/merge/deployment: not created.
