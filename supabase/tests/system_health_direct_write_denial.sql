begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(65);

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

-- 49-56: anonymous browser access cannot execute any WASDOK-85 public RPC.
with functions(signature) as (
  values
    ('public.record_health_snapshot(text,timestamp with time zone,jsonb,jsonb)'),
    ('public.admin_set_health_threshold(text,numeric,numeric,text,text)'),
    ('public.admin_set_health_threshold_active(uuid,boolean,text)'),
    ('public.acknowledge_health_alert(uuid,text)'),
    ('public.read_system_health_latest_metrics(text)'),
    ('public.read_system_health_thresholds()'),
    ('public.read_system_health_alerts(text)'),
    ('public.read_deployment_health_state()')
)
select ok(
  not has_function_privilege('anon',signature,'EXECUTE'),
  format('anon cannot execute %s',signature)
)
from functions;

-- 57: authenticated browser sessions cannot execute service-only ingestion.
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_health_snapshot(text,timestamp with time zone,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated cannot execute service-only health ingestion'
);

-- 58: trusted service role retains ingestion authority.
select ok(
  has_function_privilege(
    'service_role',
    'public.record_health_snapshot(text,timestamp with time zone,jsonb,jsonb)',
    'EXECUTE'
  ),
  'service_role can execute health ingestion'
);

-- 59-65: authenticated users may call only permission-enforcing human/admin RPCs.
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
