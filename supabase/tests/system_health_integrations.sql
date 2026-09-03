begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

select ok(
  to_regprocedure('public.read_applied_schema_version()') is not null,
  'service-only applied schema version reader exists'
);

select ok(
  coalesce(
    not has_function_privilege('anon',to_regprocedure('public.read_applied_schema_version()'),'EXECUTE'),
    false
  ),
  'anon cannot read applied schema version'
);

select ok(
  coalesce(
    not has_function_privilege('authenticated',to_regprocedure('public.read_applied_schema_version()'),'EXECUTE'),
    false
  ),
  'authenticated browser sessions cannot read applied schema version'
);

select ok(
  coalesce(
    has_function_privilege('service_role',to_regprocedure('public.read_applied_schema_version()'),'EXECUTE'),
    false
  ),
  'service_role can read applied schema version'
);

select ok(
  coalesce(
    (
      select pg_get_functiondef(to_regprocedure('public.read_applied_schema_version()'))
    ) like '%supabase_migrations.schema_migrations%'
    and (
      select pg_get_functiondef(to_regprocedure('public.read_applied_schema_version()'))
    ) like '%max(version)%',
    false
  ),
  'schema version reader derives the latest applied Supabase migration version'
);

select * from finish();
rollback;
