begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);

select lives_ok(
  $$select public.record_health_snapshot(
    'database',
    now(),
    '[]'::jsonb,
    '{"collector":"WASDOK-85","provider_status":"UNKNOWN","reason":"PROVIDER_UNAVAILABLE"}'::jsonb
  )$$,
  'collector can persist an UNKNOWN source state without inventing a metric'
);

select ok(
  (select count(*) from public.system_health_snapshots where source='database' and status='UNKNOWN')=1
  and (select count(*) from public.system_health_metric_samples)=0,
  'UNKNOWN source-state snapshot persists without a metric sample'
);

select throws_ok(
  $$select public.record_health_snapshot('database',now(),'[]'::jsonb,'{}'::jsonb)$$,
  '22023',null,
  'empty metrics are rejected unless the snapshot explicitly records UNKNOWN provider state'
);

select throws_ok(
  $$select public.record_health_snapshot(
    'database',
    now(),
    '[]'::jsonb,
    '{"collector":"WASDOK-85","provider_status":"UNKNOWN","reason":"RAW_PROVIDER_SECRET"}'::jsonb
  )$$,
  '22023',null,
  'UNKNOWN source-state reason is restricted to the approved safe reason catalogue'
);

select * from finish();
rollback;
