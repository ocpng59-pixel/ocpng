begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

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

select * from finish();
rollback;
