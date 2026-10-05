-- PR #1: Secure staging area for AI-assisted product imports.
-- The staging row is intentionally separate from public.products.
-- Publication will be handled by a later, explicit publisher step.

create table public.product_imports (
  id uuid primary key default gen_random_uuid(),
  source_image text,
  raw_text text,
  ai_analysis jsonb,
  product_name text,
  description text,
  supplier_price numeric(14,2),
  supplier_currency text,
  moq text,
  variants jsonb,
  category_id uuid references public.categories(id) on delete set null,
  category_confidence numeric(5,4) check (
    category_confidence is null or category_confidence between 0 and 1
  ),
  calculated_price numeric(14,2),
  cloudinary_urls jsonb,
  overall_confidence numeric(5,4) check (
    overall_confidence is null or overall_confidence between 0 and 1
  ),
  status text not null default 'RECEIVED'
    check (status in (
      'RECEIVED',
      'ANALYZING',
      'CLASSIFIED',
      'PRICED',
      'MEDIA_READY',
      'READY',
      'PUBLISHED',
      'LOW_CONFIDENCE',
      'FAILED',
      'CANCELLED'
    )),
  error_code text,
  error_message text,
  published_product_id bigint references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_imports_status_idx
  on public.product_imports (status);

create index product_imports_category_id_idx
  on public.product_imports (category_id);

create index product_imports_created_at_idx
  on public.product_imports (created_at desc);

alter table public.product_imports enable row level security;

revoke all on table public.product_imports from anon;
grant select, insert, update, delete on table public.product_imports to authenticated;

create policy "product imports admin select"
  on public.product_imports
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "product imports admin insert"
  on public.product_imports
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "product imports admin update"
  on public.product_imports
  for update
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  with check (
    (select auth.uid()) is not null
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create policy "product imports admin delete"
  on public.product_imports
  for delete
  to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

create or replace function public.update_product_imports_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke execute on function public.update_product_imports_updated_at() from public;
grant execute on function public.update_product_imports_updated_at() to authenticated;

create trigger trigger_update_product_imports_updated_at
before update on public.product_imports
for each row
execute function public.update_product_imports_updated_at();

comment on table public.product_imports is
  'Secure staging area for AI-assisted product imports before validation and publication to products.';
