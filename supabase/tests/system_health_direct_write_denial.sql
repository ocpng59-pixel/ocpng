begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(68);

-- 1-48: browser roles cannot directly read or mutate WASDOK-85 operational tables.
-- Authorized human reads must flow through normalized permission-enforcing RPCs.
with tables(name) as (
  values
    ('health_metric_catalog'),
    ('system_health_snapshots'),
    ('system_health_metric_samples'),
    ('system_health_thresholds'),
    ('system_health_alerts'),
    ('deployment_health_state')
), roles(name) as (values ('anon'),('authenticated')),
privileges(name) as (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'))
select ok(
  not has_table_privilege(roles.name,format('public.%I',tables.name),privileges.name),
  format('%s has no direct %s on %s',roles.name,privileges.name,tables.name)
)
from tables cross join roles cross join privileges
order by tables.name,roles.name,privileges.name;

-- 49-57: anonymous browser access cannot execute any WASDOK-85 public RPC.
with functions(signature) as (
  values
    ('public.record_health_snapshot(text,timestamp with time zone,jsonb,jsonb)'),
    ('public.admin_set_health_threshold(text,numeric,numeric,text,text)'),
    ('public.admin_set_health_threshold_active(uuid,boolean,text)'),
    ('public.acknowledge_health_alert(uuid,text)'),
    ('public.read_system_health_latest_metrics(text)'),
    ('public.read_system_health_thresholds()'),
    ('public.read_system_health_alerts(text)'),
    ('public.read_deployment_health_state()'),
    ('public.read_applied_schema_version()')
)
select ok(
  not has_function_privilege('anon',signature,'EXECUTE'),
  format('anon cannot execute %s',signature)
)
from functions;

-- 58-59: authenticated browser sessions cannot execute infrastructure-only RPCs.
with functions(signature) as (
  values
    ('public.record_health_snapshot(text,timestamp with time zone,jsonb,jsonb)'),
    ('public.read_applied_schema_version()')
)
select ok(
  not has_function_privilege('authenticated',signature,'EXECUTE'),
  format('authenticated cannot execute infrastructure-only %s',signature)
)
from functions;

-- 60-61: trusted service role retains infrastructure authority.
with functions(signature) as (
  values
    ('public.record_health_snapshot(text,timestamp with time zone,jsonb,jsonb)'),
    ('public.read_applied_schema_version()')
)
select ok(
  has_function_privilege('service_role',signature,'EXECUTE'),
  format('service_role can execute infrastructure-only %s',signature)
)
from functions;

-- 62-68: authenticated users may call only permission-enforcing human/admin RPCs.
with functions(signature) as (
  values
    ('public.admin_set_health_threshold(text,numeric,numeric,text,text)'),
    ('public.admin_set_health_threshold_active(uuid,boolean,text)'),
    ('public.acknowledge_health_alert(uuid,text)'),
    ('public.read_system_health_latest_metrics(text)'),
    ('public.read_system_health_thresholds()'),
    ('public.read_system_health_alerts(text)'),
    ('public.read_deployment_health_state()')
)
select ok(
  has_function_privilege('authenticated',signature,'EXECUTE'),
  format('authenticated may execute permission-enforcing %s',signature)
)
from functions;

select * from finish();
rollback;
