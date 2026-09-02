begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(83);

-- 1-60: browser roles cannot directly mutate any WASDOK-55 operational table.
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
), roles(name) as (values ('anon'),('authenticated')),
privileges(name) as (values ('INSERT'),('UPDATE'),('DELETE'))
select ok(
  not has_table_privilege(roles.name,format('public.%I',tables.name),privileges.name),
  format('%s has no direct %s on %s',roles.name,privileges.name,tables.name)
)
from tables cross join roles cross join privileges
order by tables.name,roles.name,privileges.name;

-- 61-70: anonymous browser access cannot execute any WASDOK-55 public RPC.
with functions(signature) as (
  values
    ('public.request_backup(text,text)'),
    ('public.record_backup_worker_transition(uuid,text,text,jsonb)'),
    ('public.record_backup_verification(uuid,text,jsonb)'),
    ('public.request_backup_download(uuid,text)'),
    ('public.request_restore_test(uuid,text)'),
    ('public.request_production_restore(text,timestamp with time zone,text)'),
    ('public.authorize_production_restore(uuid,text)'),
    ('public.record_restore_worker_transition(uuid,text,text,jsonb)'),
    ('public.admin_upsert_backup_schedule(uuid,text,text,uuid,boolean,text)'),
    ('public.admin_upsert_retention_policy(uuid,text,integer,boolean,text)')
)
select ok(
  not has_function_privilege('anon',signature,'EXECUTE'),
  format('anon cannot execute %s',signature)
)
from functions;

-- 71-73: authenticated browser sessions cannot execute worker-only RPCs.
with functions(signature) as (
  values
    ('public.record_backup_worker_transition(uuid,text,text,jsonb)'),
    ('public.record_backup_verification(uuid,text,jsonb)'),
    ('public.record_restore_worker_transition(uuid,text,text,jsonb)')
)
select ok(
  not has_function_privilege('authenticated',signature,'EXECUTE'),
  format('authenticated cannot execute worker-only %s',signature)
)
from functions;

-- 74-76: trusted service role retains worker RPC execution.
with functions(signature) as (
  values
    ('public.record_backup_worker_transition(uuid,text,text,jsonb)'),
    ('public.record_backup_verification(uuid,text,jsonb)'),
    ('public.record_restore_worker_transition(uuid,text,text,jsonb)')
)
select ok(
  has_function_privilege('service_role',signature,'EXECUTE'),
  format('service_role can execute worker-only %s',signature)
)
from functions;

-- 77-83: authenticated users may call only the permission-enforcing user/admin RPC surface.
with functions(signature) as (
  values
    ('public.request_backup(text,text)'),
    ('public.request_backup_download(uuid,text)'),
    ('public.request_restore_test(uuid,text)'),
    ('public.request_production_restore(text,timestamp with time zone,text)'),
    ('public.authorize_production_restore(uuid,text)'),
    ('public.admin_upsert_backup_schedule(uuid,text,text,uuid,boolean,text)'),
    ('public.admin_upsert_retention_policy(uuid,text,integer,boolean,text)')
)
select ok(
  has_function_privilege('authenticated',signature,'EXECUTE'),
  format('authenticated may execute permission-enforcing %s',signature)
)
from functions;

select * from finish();
rollback;
