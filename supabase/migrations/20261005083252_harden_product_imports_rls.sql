-- Tighten the staging table policies against Supabase anonymous sign-ins.
-- Anonymous users can carry the authenticated Postgres role, so an explicit
-- is_anonymous=false guard is required in addition to app_metadata.role=admin.

drop policy if exists "product imports admin select" on public.product_imports;
drop policy if exists "product imports admin insert" on public.product_imports;
drop policy if exists "product imports admin update" on public.product_imports;
drop policy if exists "product imports admin delete" on public.product_imports;

create policy "product imports admin select"
  on public.product_imports
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "product imports admin insert"
  on public.product_imports
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "product imports admin update"
  on public.product_imports
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    (select auth.uid()) is not null
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "product imports admin delete"
  on public.product_imports
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) = false
    and (select auth.jwt() -> 'app_metadata' -> 'role') = 'admin'
  );
