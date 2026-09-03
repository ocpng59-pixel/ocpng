begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

select is(
  public.read_applied_schema_version(),
  '20260903002400',
  'service-side schema version resolves from canonical application marker'
);

select ok(
  exists(
    select 1
    from private.application_schema_state
    where singleton=true and canonical_version='20260903002400'
  ),
  'canonical application schema marker is stored privately'
);

select ok(
  not has_function_privilege('anon','public.read_applied_schema_version()','EXECUTE'),
  'anonymous role cannot execute canonical schema version RPC'
);

select ok(
  not has_function_privilege('authenticated','public.read_applied_schema_version()','EXECUTE'),
  'authenticated role cannot execute canonical schema version RPC'
);

select ok(
  has_function_privilege('service_role','public.read_applied_schema_version()','EXECUTE'),
  'service role can execute canonical schema version RPC'
);

select * from finish();
rollback;
