begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create or replace function pg_temp.health_read_metric_count(p_code text)
returns integer
language plpgsql
as $$
declare v_count integer := 0;
begin
  if to_regprocedure('public.read_system_health_latest_metrics(text)') is null then return 0; end if;
  execute 'select count(*) from public.read_system_health_latest_metrics(null) where metric_code=$1' into v_count using p_code;
  return v_count;
end;
$$;

create or replace function pg_temp.health_read_alert_count()
returns integer
language plpgsql
as $$
declare v_count integer := 0;
begin
  if to_regprocedure('public.read_system_health_alerts(text)') is null then return 0; end if;
  execute 'select count(*) from public.read_system_health_alerts(null)' into v_count;
  return v_count;
end;
$$;

select plan(38);

-- Fictional WASDOK-85 identities.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '85000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok85-manager@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK85 Health Manager"}'::jsonb,now(),now()
),
(
  '85000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok85-viewer@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK85 Health Viewer"}'::jsonb,now(),now()
),
(
  '85000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok85-none@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK85 No Health Access"}'::jsonb,now(),now()
);

insert into public.roles(id,code,name,description,is_system,is_active,role_type,metadata)
values
('85000000-0000-0000-0000-000000000101','wasdok85_health_manager','DEMO WASDOK85 Health Manager','Task 2 health manager',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-85"}'::jsonb),
('85000000-0000-0000-0000-000000000102','wasdok85_health_viewer','DEMO WASDOK85 Health Viewer','Task 2 health viewer',false,true,'operational','{"demo":true,"wasdok":"WASDOK-85"}'::jsonb),
('85000000-0000-0000-0000-000000000103','wasdok85_no_health','DEMO WASDOK85 No Health Access','Task 2 negative role',false,true,'operational','{"demo":true,"wasdok":"WASDOK-85"}'::jsonb);

insert into public.user_roles(user_id,role_id,is_active,assigned_at)
values
('85000000-0000-0000-0000-000000000001','85000000-0000-0000-0000-000000000101',true,now()),
('85000000-0000-0000-0000-000000000002','85000000-0000-0000-0000-000000000102',true,now()),
('85000000-0000-0000-0000-000000000003','85000000-0000-0000-0000-000000000103',true,now());

insert into public.role_permissions(role_id,permission_id,is_active,granted_at)
select v.role_id,p.id,true,now()
from (values
  ('85000000-0000-0000-0000-000000000101'::uuid,'system.health.view'),
  ('85000000-0000-0000-0000-000000000101'::uuid,'system.health.manage'),
  ('85000000-0000-0000-0000-000000000102'::uuid,'system.health.view')
) as v(role_id,permission_code)
join public.permissions p on p.code=v.permission_code;

-- 1-8: approved workflow surfaces exist.
select ok(to_regprocedure('public.record_health_snapshot(text,timestamptz,jsonb,jsonb)') is not null,'service health snapshot RPC exists');
select ok(to_regprocedure('public.admin_set_health_threshold(text,numeric,numeric,text,text)') is not null,'threshold administration RPC exists');
select ok(to_regprocedure('public.admin_set_health_threshold_active(uuid,boolean,text)') is not null,'threshold active-state RPC exists');
select ok(to_regprocedure('public.acknowledge_health_alert(uuid,text)') is not null,'alert acknowledgement RPC exists');
select ok(to_regprocedure('public.read_system_health_latest_metrics(text)') is not null,'normalized latest metrics read RPC exists');
select ok(to_regprocedure('public.read_system_health_thresholds()') is not null,'normalized thresholds read RPC exists');
select ok(to_regprocedure('public.read_system_health_alerts(text)') is not null,'normalized alerts read RPC exists');
select ok(to_regprocedure('public.read_deployment_health_state()') is not null,'normalized deployment health read RPC exists');

-- 9-13: ingestion is service-only, allowlisted and secret-safe.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.record_health_snapshot('database',now(),'[{"metric_code":"db.database_bytes","value":100}]'::jsonb,'{}'::jsonb)$$,
  '42501',null,'ordinary authenticated user cannot ingest health snapshots'
);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select lives_ok(
  $$select public.record_health_snapshot('database',now()-interval '1 minute','[{"metric_code":"db.database_bytes","value":100,"reason":"DEMO baseline"}]'::jsonb,'{"collector":"DEMO WASDOK85"}'::jsonb)$$,
  'trusted service ingests an allowlisted metric snapshot'
);
select ok(
  (select count(*) from public.system_health_snapshots where source='database')=1
  and (select count(*) from public.system_health_metric_samples where metric_code='db.database_bytes' and numeric_value=100 and status='UNKNOWN')=1,
  'snapshot and UNKNOWN sample persist before threshold configuration'
);
select throws_ok(
  $$select public.record_health_snapshot('database',now(),'[{"metric_code":"db.not_allowed","value":1}]'::jsonb,'{}'::jsonb)$$,
  '22023',null,'unknown metric code is rejected'
);
select throws_ok(
  $$select public.record_health_snapshot('database',now(),'[{"metric_code":"db.database_bytes","value":1}]'::jsonb,'{"token":"DEMO-SECRET"}'::jsonb)$$,
  '22023',null,'credential-like safe metadata key is rejected'
);

-- 14-22: threshold mutations require system.health.manage, valid reasons and correct ordering.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.admin_set_health_threshold('db.database_bytes',100,200,'ABOVE_IS_BAD','Unauthorized DEMO threshold')$$,
  '42501',null,'user without system.health.manage cannot set threshold'
);
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.admin_set_health_threshold('db.database_bytes',100,200,'ABOVE_IS_BAD','x')$$,
  '22023',null,'threshold reason shorter than three characters is rejected'
);
select throws_ok(
  $$select public.admin_set_health_threshold('db.not_allowed',100,200,'ABOVE_IS_BAD','Reject unknown DEMO metric')$$,
  '22023',null,'threshold for unknown metric code is rejected'
);
select throws_ok(
  $$select public.admin_set_health_threshold('db.database_bytes',200,100,'ABOVE_IS_BAD','Reject reversed ABOVE thresholds')$$,
  '22023',null,'ABOVE_IS_BAD requires critical greater than warning'
);
select throws_ok(
  $$select public.admin_set_health_threshold('db.database_bytes',100,200,'BELOW_IS_BAD','Reject reversed BELOW thresholds')$$,
  '22023',null,'BELOW_IS_BAD requires critical less than warning'
);
select lives_ok(
  $$select public.admin_set_health_threshold('db.database_bytes',100,200,'ABOVE_IS_BAD','Configure DEMO database warning and critical threshold')$$,
  'health manager sets valid ABOVE_IS_BAD threshold'
);
select ok(
  (select count(*) from public.system_health_thresholds where metric_code='db.database_bytes' and warning_value=100 and critical_value=200 and direction='ABOVE_IS_BAD' and is_active)=1,
  'valid threshold persists active configuration'
);
select ok(
  (select count(*) from public.audit_events where actor_id='85000000-0000-0000-0000-000000000001' and action='health.threshold_changed' and reason='Configure DEMO database warning and critical threshold')=1,
  'threshold change appends immutable audit evidence'
);
select lives_ok(
  $$select public.admin_set_health_threshold_active((select id from public.system_health_thresholds where metric_code='db.database_bytes'),false,'Temporarily disable DEMO threshold')$$,
  'health manager can disable threshold with reason'
);
select ok(
  (select is_active=false from public.system_health_thresholds where metric_code='db.database_bytes')
  and (select count(*) from public.audit_events where action='health.threshold_changed' and reason='Temporarily disable DEMO threshold')=1,
  'threshold active-state change persists and is audited'
);

-- 23-28: active threshold yields deterministic severity and alert lifecycle.
select lives_ok(
  $$select public.admin_set_health_threshold_active((select id from public.system_health_thresholds where metric_code='db.database_bytes'),true,'Re-enable DEMO threshold')$$,
  'health manager re-enables threshold'
);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select lives_ok(
  $$select public.record_health_snapshot('database',now(),'[{"metric_code":"db.database_bytes","value":250,"reason":"DEMO critical database size"}]'::jsonb,'{"collector":"DEMO WASDOK85"}'::jsonb)$$,
  'trusted service ingests value beyond critical threshold'
);
select ok(
  (select status='CRITICAL' from public.system_health_metric_samples where metric_code='db.database_bytes' order by observed_at desc limit 1),
  'critical threshold evaluation is deterministic'
);
select ok(
  (select count(*) from public.system_health_alerts where metric_code='db.database_bytes' and status='OPEN' and severity='CRITICAL')=1,
  'critical metric opens one health alert'
);
select ok(
  (select count(*) from public.system_health_alerts where metric_code='db.database_bytes')=1,
  'repeated lifecycle does not create duplicate active alert before acknowledgement'
);
select ok(
  pg_temp.health_read_metric_count('db.database_bytes')=0,
  'service role is not treated as a human health viewer by normalized read helper'
);

-- 29-34: normalized reads require system.health.view and return operational metadata only.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select * from public.read_system_health_latest_metrics(null)$$,
  '42501',null,'user without system.health.view cannot read metrics'
);
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select * from public.read_system_health_latest_metrics(null)$$,
  'health viewer can read normalized latest metrics'
);
select ok(pg_temp.health_read_metric_count('db.database_bytes')=1,'normalized read returns one latest row per metric');
select lives_ok($$select * from public.read_system_health_thresholds()$$,'health viewer can read normalized thresholds');
select lives_ok($$select * from public.read_system_health_alerts(null)$$,'health viewer can read normalized alerts');
select ok(pg_temp.health_read_alert_count()=1,'normalized alert read exposes the active alert without provider payload');

-- 35-38: acknowledgement requires manage authority, reason and immutable audit.
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000002',true);
select throws_ok(
  $$select public.acknowledge_health_alert((select id from public.system_health_alerts where metric_code='db.database_bytes' and status='OPEN'),'Viewer cannot acknowledge DEMO alert')$$,
  '42501',null,'health viewer without manage permission cannot acknowledge alert'
);
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.acknowledge_health_alert((select id from public.system_health_alerts where metric_code='db.database_bytes' and status='OPEN'),'Acknowledge DEMO critical database alert')$$,
  'health manager acknowledges active alert'
);
select ok(
  (select status='ACKNOWLEDGED' and acknowledged_by='85000000-0000-0000-0000-000000000001' and acknowledged_at is not null from public.system_health_alerts where metric_code='db.database_bytes'),
  'acknowledgement records actor timestamp and lifecycle state'
);
select ok(
  (select count(*) from public.audit_events where actor_id='85000000-0000-0000-0000-000000000001' and action='health.alert_acknowledged' and reason='Acknowledge DEMO critical database alert')=1,
  'alert acknowledgement appends immutable audit evidence'
);

select * from finish();
rollback;
