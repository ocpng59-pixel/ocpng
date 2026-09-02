begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(1);

select diag(
  coalesce(
    (
      select string_agg(
        format(
          '%s.%s policy=%s cmd=%s permissive=%s roles=%s qual=%s with_check=%s',
          schemaname,
          tablename,
          policyname,
          cmd,
          permissive,
          roles::text,
          coalesce(qual,'<null>'),
          coalesce(with_check,'<null>')
        ),
        E'\n'
        order by tablename, policyname
      )
      from pg_policies
      where schemaname='public'
        and tablename in ('roles','role_permissions','user_roles','data_scopes','user_compartments')
    ),
    'no matching policies'
  )
);

select diag(
  (
    select string_agg(
      format(
        '%s rls=%s force_rls=%s insert=%s update=%s delete=%s',
        c.relname,
        c.relrowsecurity,
        c.relforcerowsecurity,
        has_table_privilege('authenticated', c.oid, 'INSERT'),
        has_table_privilege('authenticated', c.oid, 'UPDATE'),
        has_table_privilege('authenticated', c.oid, 'DELETE')
      ),
      E'\n'
      order by c.relname
    )
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in ('roles','role_permissions','user_roles','data_scopes','user_compartments')
  )
);

select pass('access-control policy diagnostics emitted');
select * from finish();
rollback;
