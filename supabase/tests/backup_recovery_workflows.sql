begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(49);

-- Fictional Task 2 identities.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '55000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok55-requester@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK55 Backup Requester"}'::jsonb,now(),now()
),
(
  '55000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok55-authorizer@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK55 Recovery Authorizer"}'::jsonb,now(),now()
),
(
  '55000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok55-nonadmin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK55 Non Administrator"}'::jsonb,now(),now()
);

insert into public.roles(id,code,name,description,is_system,is_active,role_type,metadata)
values
('55000000-0000-0000-0000-000000000101','wasdok55_backup_operator','DEMO WASDOK55 Backup Operator','Task 2 requester',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-55"}'::jsonb),
('55000000-0000-0000-0000-000000000102','wasdok55_recovery_authorizer','DEMO WASDOK55 Recovery Authorizer','Task 2 independent authorizer',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-55"}'::jsonb),
('55000000-0000-0000-0000-000000000103','wasdok55_no_backup_access','DEMO WASDOK55 No Backup Access','Task 2 negative user',false,true,'operational','{"demo":true,"wasdok":"WASDOK-55"}'::jsonb);

insert into public.user_roles(user_id,role_id,is_active,assigned_at)
values
('55000000-0000-0000-0000-000000000001','55000000-0000-0000-0000-000000000101',true,now()),
('55000000-0000-0000-0000-000000000002','55000000-0000-0000-0000-000000000102',true,now()),
('55000000-0000-0000-0000-000000000003','55000000-0000-0000-0000-000000000103',true,now());

insert into public.role_permissions(role_id,permission_id,is_active,granted_at)
select v.role_id,p.id,true,now()
from (values
  ('55000000-0000-0000-0000-000000000101'::uuid,'backup.create'),
  ('55000000-0000-0000-0000-000000000101'::uuid,'backup.download'),
  ('55000000-0000-0000-0000-000000000101'::uuid,'backup.restore_test'),
  ('55000000-0000-0000-0000-000000000101'::uuid,'backup.restore_production'),
  ('55000000-0000-0000-0000-000000000101'::uuid,'backup.authorize_production_restore'),
  ('55000000-0000-0000-0000-000000000101'::uuid,'backup.schedule'),
  ('55000000-0000-0000-0000-000000000101'::uuid,'backup.manage_retention'),
  ('55000000-0000-0000-0000-000000000102'::uuid,'backup.authorize_production_restore')
) as v(role_id,permission_code)
join public.permissions p on p.code=v.permission_code;

insert into public.provider_recovery_points(
  id,provider,recovery_reference,recovery_kind,recovery_time,available,safe_metadata
) values (
  '55000000-0000-0000-0000-000000000201','supabase','DEMO-WASDOK55-RECOVERY-1','PITR',
  now()-interval '5 minutes',true,'{"demo":true}'::jsonb
);

-- 1-11: workflow objects/functions exist.
select has_table('public','backup_download_requests','backup download request table exists');
select ok(to_regprocedure('public.request_backup(text,text)') is not null,'request_backup RPC exists');
select ok(to_regprocedure('public.record_backup_worker_transition(uuid,text,text,jsonb)') is not null,'backup worker transition RPC exists');
select ok(to_regprocedure('public.record_backup_verification(uuid,text,jsonb)') is not null,'backup verification RPC exists');
select ok(to_regprocedure('public.request_backup_download(uuid,text)') is not null,'backup download request RPC exists');
select ok(to_regprocedure('public.request_restore_test(uuid,text)') is not null,'restore test request RPC exists');
select ok(to_regprocedure('public.request_production_restore(text,timestamptz,text)') is not null,'production restore request RPC exists');
select ok(to_regprocedure('public.authorize_production_restore(uuid,text)') is not null,'production restore authorization RPC exists');
select ok(to_regprocedure('public.record_restore_worker_transition(uuid,text,text,jsonb)') is not null,'restore worker transition RPC exists');
select ok(to_regprocedure('public.admin_upsert_backup_schedule(uuid,text,text,uuid,boolean,text)') is not null,'backup schedule administration RPC exists');
select ok(to_regprocedure('public.admin_upsert_retention_policy(uuid,text,integer,boolean,text)') is not null,'retention policy administration RPC exists');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000001',true);

-- 12-14: authorized backup request persists safe audited state.
select lives_ok(
  $$select public.request_backup('FULL_ARCHIVE','Create DEMO full archive for Task 2')$$,
  'authorized backup operator requests a full archive'
);
select ok(
  (select count(*) from public.backup_jobs
   where requested_by='55000000-0000-0000-0000-000000000001'
     and backup_type='FULL_ARCHIVE'
     and status='REQUESTED'
     and request_reason='Create DEMO full archive for Task 2')=1,
  'backup request persists requester reason type and REQUESTED state'
);
select ok(
  (select count(*) from public.audit_events
   where actor_id='55000000-0000-0000-0000-000000000001'
     and action='backup.requested'
     and entity_type='backup_job'
     and reason='Create DEMO full archive for Task 2')=1,
  'backup request appends immutable audit evidence'
);

-- 15-16: reason and permission enforcement.
select throws_ok(
  $$select public.request_backup('FULL_ARCHIVE','x')$$,
  '22023',null,'short backup reason is rejected'
);
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.request_backup('FULL_ARCHIVE','Unauthorized DEMO backup request')$$,
  '42501',null,'user without backup.create cannot request backup'
);

-- 17-27: trusted-worker lifecycle, verification and availability.
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.record_backup_worker_transition((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'REQUESTED','QUEUED','{}'::jsonb)$$,
  '42501',null,'ordinary authenticated user cannot execute worker transition'
);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select lives_ok(
  $$select public.record_backup_worker_transition((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'REQUESTED','QUEUED','{"worker":"DEMO"}'::jsonb)$$,
  'trusted worker advances REQUESTED to QUEUED'
);
select ok(
  (select status='QUEUED' from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1)
  and (select count(*) from public.audit_events where action='backup.status_changed' and after_data->>'status'='QUEUED')>=1,
  'QUEUED state and audit evidence persist'
);
select throws_ok(
  $$select public.record_backup_worker_transition((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'REQUESTED','RUNNING','{}'::jsonb)$$,
  '23514',null,'stale or illegal backup transition is rejected'
);
select lives_ok(
  $$select public.record_backup_worker_transition((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'QUEUED','RUNNING','{}'::jsonb)$$,
  'worker advances QUEUED to RUNNING'
);
select lives_ok(
  $$select public.record_backup_worker_transition((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'RUNNING','PACKAGING','{}'::jsonb)$$,
  'worker advances RUNNING to PACKAGING'
);
select lives_ok(
  $$select public.record_backup_worker_transition((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'PACKAGING','VERIFYING','{}'::jsonb)$$,
  'worker advances PACKAGING to VERIFYING'
);
select lives_ok(
  $$select public.record_backup_verification((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'PASSED','{"verification":"DEMO"}'::jsonb)$$,
  'worker records PASSED backup verification'
);
select ok(
  (select count(*) from public.backup_verifications bv
   join public.backup_jobs bj on bj.id=bv.backup_id
   where bj.requested_by='55000000-0000-0000-0000-000000000001' and bv.status='PASSED')=1,
  'backup verification row persists PASSED result'
);
select lives_ok(
  $$select public.record_backup_worker_transition((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'VERIFYING','AVAILABLE','{}'::jsonb)$$,
  'verified backup advances to AVAILABLE'
);
select ok(
  (select status='AVAILABLE' and verified_at is not null from public.backup_jobs
   where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),
  'AVAILABLE backup records verified timestamp'
);

-- 28-32: controlled download and restore rehearsal requests.
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.request_backup_download((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'Download DEMO verified archive')$$,
  'authorized user requests download of AVAILABLE backup'
);
select ok(
  (select count(*) from public.backup_download_requests dr
   join public.backup_jobs bj on bj.id=dr.backup_id
   where bj.requested_by='55000000-0000-0000-0000-000000000001'
     and dr.requested_by='55000000-0000-0000-0000-000000000001'
     and dr.status='REQUESTED')=1,
  'download request persists without signed URL or credential material'
);
select ok(
  (select count(*) from public.audit_events where action='backup.download_requested' and actor_id='55000000-0000-0000-0000-000000000001')=1,
  'download request is audited'
);
select lives_ok(
  $$select public.request_restore_test((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'Run DEMO restore rehearsal')$$,
  'authorized user requests restore rehearsal'
);
select ok(
  (select count(*) from public.restore_runs
   where requested_by='55000000-0000-0000-0000-000000000001'
     and restore_type='TEST' and status='REQUESTED')=1,
  'restore rehearsal request persists as TEST REQUESTED'
);

-- 33-41: production restore requires independent authorizer.
select lives_ok(
  $$select public.request_production_restore('DEMO-WASDOK55-RECOVERY-1',(select recovery_time from public.provider_recovery_points where id='55000000-0000-0000-0000-000000000201'),'Request DEMO production recovery')$$,
  'authorized user requests production restore from known recovery point'
);
select ok(
  (select count(*) from public.restore_runs
   where requested_by='55000000-0000-0000-0000-000000000001'
     and restore_type='PRODUCTION' and status='REQUESTED'
     and provider_recovery_point_id='55000000-0000-0000-0000-000000000201')=1,
  'production restore request persists linked provider recovery point'
);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select lives_ok(
  $$select public.record_restore_worker_transition((select id from public.restore_runs where restore_type='PRODUCTION' order by created_at desc limit 1),'REQUESTED','IMPACT_REVIEW','{"impact":"DEMO"}'::jsonb)$$,
  'worker advances production restore to IMPACT_REVIEW'
);
select lives_ok(
  $$select public.record_restore_worker_transition((select id from public.restore_runs where restore_type='PRODUCTION' order by created_at desc limit 1),'IMPACT_REVIEW','AWAITING_AUTHORIZATION','{}'::jsonb)$$,
  'worker advances production restore to AWAITING_AUTHORIZATION'
);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.authorize_production_restore((select id from public.restore_runs where restore_type='PRODUCTION' order by created_at desc limit 1),'Attempt self authorization')$$,
  '42501',null,'requester cannot authorize own production restore'
);
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.authorize_production_restore((select id from public.restore_runs where restore_type='PRODUCTION' order by created_at desc limit 1),'Unauthorized DEMO authorization')$$,
  '42501',null,'user without production authorization permission cannot authorize'
);
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000002',true);
select lives_ok(
  $$select public.authorize_production_restore((select id from public.restore_runs where restore_type='PRODUCTION' order by created_at desc limit 1),'Independent DEMO senior authorization')$$,
  'independent authorized user approves production restore'
);
select ok(
  (select status='AUTHORIZED' from public.restore_runs where restore_type='PRODUCTION' order by created_at desc limit 1)
  and (select count(*) from public.restore_authorizations where restore_run_id=(select id from public.restore_runs where restore_type='PRODUCTION' order by created_at desc limit 1) and requester_user_id='55000000-0000-0000-0000-000000000001' and authorizer_user_id='55000000-0000-0000-0000-000000000002')=1,
  'production restore records distinct requester and authorizer and becomes AUTHORIZED'
);
select ok(
  (select count(*) from public.audit_events where action='restore.production_authorized' and actor_id='55000000-0000-0000-0000-000000000002')=1,
  'production restore authorization is audited'
);
select throws_ok(
  $$select public.authorize_production_restore((select id from public.restore_runs where restore_type='PRODUCTION' order by created_at desc limit 1),'Second authorization after state change')$$,
  '23514',null,'already-authorized restore cannot be authorized again'
);

-- 42-45: schedule and retention administration.
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.admin_upsert_backup_schedule(null,'FULL_ARCHIVE','FREQ=WEEKLY',null,true,'Unauthorized schedule change')$$,
  '42501',null,'schedule administration requires backup.schedule'
);
select set_config('request.jwt.claim.sub','55000000-0000-0000-0000-000000000001',true);
select lives_ok(
  $$select public.admin_upsert_backup_schedule(null,'FULL_ARCHIVE','FREQ=WEEKLY',null,true,'Configure DEMO weekly archive')$$,
  'authorized backup operator creates schedule'
);
select ok(
  (select count(*) from public.backup_schedules where backup_type='FULL_ARCHIVE' and cadence='FREQ=WEEKLY' and enabled)=1,
  'backup schedule persists approved cadence'
);
select lives_ok(
  $$select public.admin_upsert_retention_policy(null,'DEMO 30 Day Retention',30,false,'Create DEMO retention policy')$$,
  'authorized backup operator creates retention policy'
);
select ok(
  (select count(*) from public.backup_retention_policies where name='DEMO 30 Day Retention' and retention_days=30 and not purge_enabled)=1,
  'retention policy persists approved duration'
);

-- 46-47: unsafe worker metadata is rejected and audit metadata stays safe.
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$select public.record_backup_worker_transition((select id from public.backup_jobs where requested_by='55000000-0000-0000-0000-000000000001' order by created_at desc limit 1),'AVAILABLE','ARCHIVED','{"token":"DEMO-SECRET"}'::jsonb)$$,
  '22023',null,'worker metadata with token-like key is rejected'
);
select ok(
  not exists(
    select 1 from public.audit_events
    where (action like 'backup.%' or action like 'restore.%')
      and lower(coalesce(request_metadata::text,'') || coalesce(metadata::text,'') || coalesce(before_data::text,'') || coalesce(after_data::text,''))
        ~ '(password|service_role|bearer|signed_url|encryption_key|database_url)'
  ),
  'backup and restore audit evidence contains no credential-like metadata'
);

select * from finish();
rollback;
