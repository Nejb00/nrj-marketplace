with
duplicate_findings as (
  select
    'cart_user_duplicates' as check_name,
    count(*)::integer as row_count
  from (
    select trim(user_id) as integrity_key
    from public.carts
    where user_id is not null and trim(user_id) <> ''
    group by trim(user_id)
    having count(*) > 1
  ) x

  union all

  select
    'favorite_user_duplicates',
    count(*)::integer
  from (
    select trim(user_id) as integrity_key
    from public.favorites
    where user_id is not null and trim(user_id) <> ''
    group by trim(user_id)
    having count(*) > 1
  ) x

  union all

  select
    'payment_order_live_duplicates',
    count(*)::integer
  from (
    select order_id
    from public.payments
    where status in ('pending', 'processing', 'paid', 'refund_pending', 'refunded')
    group by order_id
    having count(*) > 1
  ) x

  union all

  select
    'payment_provider_idempotency_duplicates',
    count(*)::integer
  from (
    select provider, idempotency_key
    from public.payments
    where provider is not null
      and idempotency_key is not null
      and trim(idempotency_key) <> ''
    group by provider, idempotency_key
    having count(*) > 1
  ) x

  union all

  select
    'payment_provider_reference_duplicates',
    count(*)::integer
  from (
    select provider, provider_reference
    from public.payments
    where provider is not null
      and provider_reference is not null
      and trim(provider_reference) <> ''
    group by provider, provider_reference
    having count(*) > 1
  ) x

  union all

  select
    'payment_event_provider_id_duplicates',
    count(*)::integer
  from (
    select provider, provider_event_id
    from public.payment_events
    where provider is not null
      and provider_event_id is not null
      and trim(provider_event_id) <> ''
    group by provider, provider_event_id
    having count(*) > 1
  ) x

  union all

  select
    'product_embedding_duplicates',
    count(*)::integer
  from (
    select product_id
    from public.product_embeddings
    group by product_id
    having count(*) > 1
  ) x
),
orphan_findings as (
  select
    'products.category_id -> categories.id' as check_name,
    count(*)::integer as orphan_count
  from public.products p
  left join public.categories c on c.id = p.category_id
  where p.category_id is not null and c.id is null

  union all

  select
    'product_imports.category_id -> categories.id',
    count(*)::integer
  from public.product_imports i
  left join public.categories c on c.id = i.category_id
  where i.category_id is not null and c.id is null

  union all

  select
    'product_imports.published_product_id -> products.id',
    count(*)::integer
  from public.product_imports i
  left join public.products p on p.id = i.published_product_id
  where i.published_product_id is not null and p.id is null

  union all

  select
    'product_embeddings.product_id -> products.id',
    count(*)::integer
  from public.product_embeddings e
  left join public.products p on p.id = e.product_id
  where e.product_id is not null and p.id is null

  union all

  select
    'product_views.product_id -> products.id',
    count(*)::integer
  from public.product_views v
  left join public.products p on p.id = v.product_id
  where v.product_id is not null and p.id is null

  union all

  select
    'chat_sessions.product_id -> products.id',
    count(*)::integer
  from public.chat_sessions s
  left join public.products p on p.id = s.product_id
  where s.product_id is not null and p.id is null

  union all

  select
    'payments.order_id -> orders.id',
    count(*)::integer
  from public.payments pay
  left join public.orders o on o.id = pay.order_id
  where pay.order_id is not null and o.id is null

  union all

  select
    'payment_events.payment_id -> payments.id',
    count(*)::integer
  from public.payment_events e
  left join public.payments p on p.id = e.payment_id
  where e.payment_id is not null and p.id is null
)
select json_build_object(
  'schema_version', 1,
  'duplicates',
    coalesce(
      (
        select json_agg(
          json_build_object(
            'check_name', check_name,
            'row_count', row_count
          )
          order by check_name
        )
        from duplicate_findings
        where row_count > 0
      ),
      '[]'::json
    ),
  'orphans',
    coalesce(
      (
        select json_agg(
          json_build_object(
            'check_name', check_name,
            'orphan_count', orphan_count
          )
          order by check_name
        )
        from orphan_findings
        where orphan_count > 0
      ),
      '[]'::json
    )
) as snapshot;
