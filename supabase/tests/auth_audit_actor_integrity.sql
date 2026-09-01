begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(2);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000061',
  true
);

select lives_ok(
  $$
    insert into public.audit_events (
      actor_id,
      action,
      entity_type,
      request_metadata,
      classification,
      metadata
    ) values (
      '10000000-0000-0000-0000-000000000061',
      'auth.sign_in_succeeded',
      'auth_session',
      '{"event_source":"automated-rls"}'::jsonb,
      'RESTRICTED',
      '{"automated_rls":true,"wasdok":"WASDOK-61"}'::jsonb
    )
  $$,
  'Auth audit actor integrity: authenticated actor can append its own audit event'
);

select throws_ok(
  $$
    insert into public.audit_events (
      actor_id,
      action,
      entity_type,
      request_metadata,
      classification,
      metadata
    ) values (
      '10000000-0000-0000-0000-000000000062',
      'auth.sign_out',
      'auth_session',
      '{"event_source":"automated-rls"}'::jsonb,
      'RESTRICTED',
      '{"automated_rls":true,"wasdok":"WASDOK-61","spoof_attempt":true}'::jsonb
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "audit_events"',
  'Auth audit actor integrity: authenticated actor cannot spoof another actor_id'
);

reset role;
select * from finish();
rollback;
