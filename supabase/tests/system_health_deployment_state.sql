begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '85100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok85-deployment-viewer@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK85 Deployment Viewer"}'::jsonb,now(),now()
);

insert into public.roles(id,code,name,description,is_system,is_active,role_type,metadata)
values(
  '85100000-0000-0000-0000-000000000101','wasdok85_deployment_viewer',
  'DEMO WASDOK85 Deployment Viewer','Deployment health read test',false,true,'operational',
  '{"demo":true,"wasdok":"WASDOK-85"}'::jsonb
);

insert into public.user_roles(user_id,role_id,is_active,assigned_at)
values('85100000-0000-0000-0000-000000000001','85100000-0000-0000-0000-000000000101',true,now());

insert into public.role_permissions(role_id,permission_id,is_active,granted_at)
select '85100000-0000-0000-0000-000000000101'::uuid,p.id,true,now()
from public.permissions p where p.code='system.health.view';

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

select lives_ok(
  $$select public.record_deployment_health_state(
    'production','abcdef1234567890','release-85','20260903002300','20260903002300',
    'HEALTHY',now()-interval '1 minute'
  )$$,
  'service worker persists normalized healthy deployment state'
);

select ok(
  exists(
    select 1 from public.deployment_health_state
    where environment='production'
      and deployed_commit='abcdef1234567890'
      and release_id='release-85'
      and expected_schema_version='20260903002300'
      and applied_schema_version='20260903002300'
      and status='HEALTHY'
      and source='deployment'
      and provider='wasdok'
      and safe_metadata='{}'::jsonb
  ),
  'deployment state stores only approved operational identifiers'
);

select lives_ok(
  $$select public.record_deployment_health_state(
    'production','abcdef1234567890','release-86','20260903002300','20260903002200',
    'CRITICAL',now()
  )$$,
  'service worker updates schema drift state for an existing environment'
);

select ok(
  (select count(*)=1 from public.deployment_health_state where environment='production')
  and exists(
    select 1 from public.deployment_health_state
    where environment='production'
      and release_id='release-86'
      and expected_schema_version='20260903002300'
      and applied_schema_version='20260903002200'
      and status='CRITICAL'
  ),
  'deployment state upserts one current row per environment'
);

select throws_ok(
  $$select public.record_deployment_health_state(
    'production','SUPABASE_SERVICE_ROLE_KEY','release-87','20260903002300','20260903002300',
    'HEALTHY',now()
  )$$,
  '22023',null,'non-commit secret-like material is rejected from deployed_commit'
);

select throws_ok(
  $$select public.record_deployment_health_state(
    'production','abcdef1234567890','release-88','20260903002300',null,
    'HEALTHY',now()
  )$$,
  '22023',null,'missing applied schema cannot be represented as healthy deployment state'
);

select lives_ok(
  $$select public.record_deployment_health_state(
    'production','abcdef1234567890','release-89','20260903002300',null,
    'UNKNOWN',now()
  )$$,
  'unknown deployment state may omit applied schema version'
);

select lives_ok(
  $$select public.record_deployment_health_state(
    'stale-demo','abcdef1234567890','release-stale','20260903002300','20260903002300',
    'HEALTHY',now()-interval '10 minutes'
  )$$,
  'service worker can persist an old observation for deterministic stale-read testing'
);

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','85100000-0000-0000-0000-000000000001',true);

select ok(
  exists(
    select 1 from public.read_deployment_health_state()
    where environment='stale-demo' and status='UNKNOWN'
  ),
  'deployment state older than 300 seconds is normalized to UNKNOWN for human readers'
);

select * from finish();
rollback;
