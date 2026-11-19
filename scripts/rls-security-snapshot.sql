select json_build_object(
  'tables',
  coalesce((
    select json_agg(json_build_object(
      'schema_name', n.nspname,
      'table_name', c.relname,
      'table_type', 'BASE TABLE',
      'rls_enabled', c.relrowsecurity,
      'policy_count', (
        select count(*)::integer from pg_policy p where p.polrelid = c.oid
      ),
      'privileged_only', c.relname in ('payment_events', 'product_embeddings')
    ) order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ), '[]'::json),
  'functions',
  coalesce((
    select json_agg(json_build_object(
      'function_name', p.proname,
      'security_definer', p.prosecdef,
      'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE')
    ) order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  ), '[]'::json),
  'grants',
  coalesce((
    select json_agg(json_build_object(
      'table_name', table_name,
      'role_name', grantee,
      'privilege_type', privilege_type
    ) order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
  ), '[]'::json),
  'effective_table_privileges',
  coalesce((
    select json_agg(json_build_object(
      'schema_name', n.nspname,
      'table_name', c.relname,
      'role_name', roles.role_name,
      'select', has_table_privilege(roles.role_name, c.oid, 'SELECT'),
      'insert', has_table_privilege(roles.role_name, c.oid, 'INSERT'),
      'update', has_table_privilege(roles.role_name, c.oid, 'UPDATE'),
      'delete', has_table_privilege(roles.role_name, c.oid, 'DELETE'),
      'truncate', has_table_privilege(roles.role_name, c.oid, 'TRUNCATE'),
      'references', has_table_privilege(roles.role_name, c.oid, 'REFERENCES'),
      'trigger', has_table_privilege(roles.role_name, c.oid, 'TRIGGER'),
      'maintain', has_table_privilege(roles.role_name, c.oid, 'MAINTAIN')
    ) order by roles.role_name, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as roles(role_name)
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
  ), '[]'::json)
) as snapshot;
