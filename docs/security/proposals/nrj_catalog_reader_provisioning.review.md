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

The reviewed migration `20261002192115_harden_rls_and_fk_indexes.sql` grants `anon` and `authenticated` policies on the catalogue, but also gives `anon` a constrained pending-order INSERT policy. An API role is therefore not a read-only database identity. `service_role` bypasses RLS and is explicitly excluded.

The proposal creates a dedicated role and separate SELECT policies for only two tables. It does not change existing `anon`/`authenticated` policies or their application API.

## Review findings and blockers

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

1. **Preflight:** reject an existing role, missing tables/columns, incompatible types, disabled RLS, policy-name collisions, PUBLIC EXECUTE on SECURITY DEFINER functions, or PUBLIC CREATE on `public`.
2. **Role creation:** least-privilege attributes, `NOINHERIT`, no memberships, connection limit 3, read-only defaults and short timeouts.
3. **Minimal grants:** CONNECT to the current database, USAGE on `public`, column-level SELECT on the two allowlists, and explicit SELECT-only policies.
4. **Postflight:** re-check role attributes, memberships, schema rights, RLS policies, exact column rights, no write rights, no unrelated public relation/sequence access, and no executable SECURITY DEFINER routine.
5. **Fail closed:** any failed predicate raises an exception before COMMIT, rolling back role, policy and grant changes from the transaction.

Note: PostgreSQL role creation and policy/ACL behavior still require validation against the actual Supabase PostgreSQL version using the intended migration execution path. This draft has not been run against a database and must not be described as runtime-tested.

## Review checklist before promotion

- [ ] Confirm the branch is based on the intended current Marketplace `main`.
- [ ] Review the actual live catalog schema, column types and RLS settings.
- [ ] Run the live read-only role/function ACL inventory.
- [ ] Resolve the effective PUBLIC ACL of every SECURITY DEFINER function.
- [ ] Confirm no unrelated public relation or sequence is effectively exposed.
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
- Live database connection: not attempted.
- Pull request/merge/deployment: not created.
