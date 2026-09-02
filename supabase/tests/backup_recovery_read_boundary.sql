begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

-- 1-10: anonymous callers never receive table-level SELECT on operational metadata.
with tables(name) as (
  values
    ('backup_retention_policies'),
    ('backup_schedules'),
    ('backup_jobs'),
    ('backup_artifacts'),
    ('backup_verifications'),
    ('provider_recovery_points'),
    ('restore_runs'),
    ('restore_authorizations'),
    ('restore_verifications'),
    ('backup_download_requests')
)
select ok(
  not has_table_privilege('anon', format('public.%I', name), 'SELECT'),
  format('anon has no SELECT on %s', name)
)
from tables
order by name;

-- 11-20: authenticated sessions may reach RLS, but never bypass it.
with tables(name) as (
  values
    ('backup_retention_policies'),
    ('backup_schedules'),
    ('backup_jobs'),
    ('backup_artifacts'),
    ('backup_verifications'),
    ('provider_recovery_points'),
    ('restore_runs'),
    ('restore_authorizations'),
    ('restore_verifications'),
    ('backup_download_requests')
)
select ok(
  has_table_privilege('authenticated', format('public.%I', name), 'SELECT'),
  format('authenticated has SELECT routed through RLS on %s', name)
)
from tables
order by name;

-- 21-30: each table must have an authenticated SELECT policy whose predicate
-- is the authoritative backup.view permission check.  This intentionally
-- checks the database policy, not a UI convention.
with tables(name) as (
  values
    ('backup_retention_policies'),
    ('backup_schedules'),
    ('backup_jobs'),
    ('backup_artifacts'),
    ('backup_verifications'),
    ('provider_recovery_points'),
    ('restore_runs'),
    ('restore_authorizations'),
    ('restore_verifications'),
    ('backup_download_requests')
)
select ok(
  exists(
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = tables.name
      and p.cmd = 'SELECT'
      and 'authenticated' = any(p.roles)
      and coalesce(p.qual, '') like '%has_permission%backup.view%'
  ),
  format('%s SELECT is protected by backup.view', name)
)
from tables
order by name;

select * from finish();
rollback;
