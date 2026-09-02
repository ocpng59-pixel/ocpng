begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(50);

-- Deterministic DEMO identities. FK checks are disabled only while seeding
-- profiles because auth.uid() is driven by JWT claims in these database tests.
set local session_replication_role = replica;
insert into public.profiles (id, display_name, email, is_active, organisation_scope, metadata) values
('64000000-0000-4000-8000-000000000001','DEMO WASDOK64 Creator','wasdok64-creator@test.invalid',true,'UAT-COMPLAINTS','{"demo":true,"wasdok":"WASDOK-64"}'::jsonb),
('64000000-0000-4000-8000-000000000002','DEMO WASDOK64 No Permission','wasdok64-no-perm@test.invalid',true,'UAT-COMPLAINTS','{"demo":true,"wasdok":"WASDOK-64"}'::jsonb),
('64000000-0000-4000-8000-000000000003','DEMO WASDOK64 No Scope','wasdok64-no-scope@test.invalid',true,'OUTSIDE-UAT','{"demo":true,"wasdok":"WASDOK-64"}'::jsonb),
('64000000-0000-4000-8000-000000000004','DEMO WASDOK64 No Compartment','wasdok64-no-comp@test.invalid',true,'UAT-COMPLAINTS','{"demo":true,"wasdok":"WASDOK-64"}'::jsonb),
('64000000-0000-4000-8000-000000000005','DEMO WASDOK64 Inactive','wasdok64-inactive@test.invalid',false,'UAT-COMPLAINTS','{"demo":true,"wasdok":"WASDOK-64"}'::jsonb),
('64000000-0000-4000-8000-000000000006','DEMO WASDOK64 System Administrator','wasdok64-admin@test.invalid',true,'UAT-COMPLAINTS','{"demo":true,"wasdok":"WASDOK-64"}'::jsonb),
('64000000-0000-4000-8000-000000000007','DEMO WASDOK64 Other Creator','wasdok64-other@test.invalid',true,'UAT-COMPLAINTS','{"demo":true,"wasdok":"WASDOK-64"}'::jsonb);
set local session_replication_role = origin;

insert into public.roles (code,name,is_system,metadata) values
('test_wasdok64_creator','DEMO WASDOK64 Creator',false,'{"demo":true,"wasdok":"WASDOK-64"}'::jsonb)
on conflict (code) do update set metadata=excluded.metadata;

insert into public.permissions (code,name,domain) values
('complaints.create','Create complaints','Complaints')
on conflict (code) do nothing;

insert into public.security_compartments (code,name) values
('CONFIDENTIAL','Confidential')
on conflict (code) do nothing;

-- Permission is deliberately absent for actor 2. Actor 6 receives the seeded
-- System Administrator role as well as complaints.create, but no compartment.
insert into public.user_roles (user_id,role_id,organisation_scope)
select v.user_id,r.id,'UAT-COMPLAINTS'
from (values
('64000000-0000-4000-8000-000000000001'::uuid,'test_wasdok64_creator'),
('64000000-0000-4000-8000-000000000003'::uuid,'test_wasdok64_creator'),
('64000000-0000-4000-8000-000000000004'::uuid,'test_wasdok64_creator'),
('64000000-0000-4000-8000-000000000005'::uuid,'test_wasdok64_creator'),
('64000000-0000-4000-8000-000000000006'::uuid,'test_wasdok64_creator'),
('64000000-0000-4000-8000-000000000006'::uuid,'system_administrator'),
('64000000-0000-4000-8000-000000000007'::uuid,'test_wasdok64_creator')
) as v(user_id,role_code)
join public.roles r on r.code=v.role_code
on conflict (user_id,role_id) do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='test_wasdok64_creator' and p.code='complaints.create'
on conflict (role_id,permission_id) do nothing;

insert into public.data_scopes (user_id,scope_code,scope_type,active) values
('64000000-0000-4000-8000-000000000001','UAT-COMPLAINTS','organisation',true),
('64000000-0000-4000-8000-000000000002','UAT-COMPLAINTS','organisation',true),
('64000000-0000-4000-8000-000000000004','UAT-COMPLAINTS','organisation',true),
('64000000-0000-4000-8000-000000000005','UAT-COMPLAINTS','organisation',true),
('64000000-0000-4000-8000-000000000006','UAT-COMPLAINTS','organisation',true),
('64000000-0000-4000-8000-000000000007','UAT-COMPLAINTS','organisation',true)
on conflict (user_id,scope_code) do update set active=excluded.active;

insert into public.user_compartments (user_id,compartment_id)
select v.user_id,sc.id from (values
('64000000-0000-4000-8000-000000000001'::uuid),
('64000000-0000-4000-8000-000000000002'::uuid),
('64000000-0000-4000-8000-000000000003'::uuid),
('64000000-0000-4000-8000-000000000005'::uuid),
('64000000-0000-4000-8000-000000000007'::uuid)
) as v(user_id)
cross join public.security_compartments sc
where sc.code='CONFIDENTIAL'
on conflict (user_id,compartment_id) do nothing;

-- Schema, RLS and privilege contract.
select has_table('public','complaint_intakes','WASDOK-64 persists controlled intake state');
select ok((select relrowsecurity from pg_class where oid='public.complaint_intakes'::regclass),'Complaint intake state has RLS enabled');
select ok((select relforcerowsecurity from pg_class where oid='public.complaint_intakes'::regclass),'Complaint intake state forces RLS for non-bypass owners');
select has_function('public','create_complaint_intake_draft',array['text','text','uuid'],'Trusted draft creation RPC exists');
select has_function('public','submit_complaint_intake',array['uuid','integer'],'Trusted submission RPC exists');
select ok(not has_table_privilege('anon','public.complaint_intakes','SELECT'),'Anonymous role cannot read intake state');
select ok(has_table_privilege('authenticated','public.complaint_intakes','SELECT'),'Authenticated role receives only controlled read access');
select ok(not has_table_privilege('authenticated','public.complaint_intakes','INSERT'),'Authenticated browser cannot insert intake state directly');
select ok(not has_table_privilege('authenticated','public.complaint_intakes','UPDATE'),'Authenticated browser cannot update intake state directly');
select ok(not has_table_privilege('authenticated','public.complaint_intakes','DELETE'),'Authenticated browser cannot delete intake state directly');
select ok(has_table_privilege('service_role','public.complaint_intakes','SELECT'),'Service role can read intake state');
select ok(has_table_privilege('service_role','public.complaint_intakes','INSERT'),'Service role can create intake state');
select ok(has_table_privilege('service_role','public.complaint_intakes','UPDATE'),'Service role can transition intake state');
select ok(not has_table_privilege('service_role','public.complaint_intakes','DELETE'),'Service role cannot delete intake state');
select ok(not has_function_privilege('authenticated','public.create_complaint_intake_draft(text,text,uuid)','EXECUTE'),'Browser role cannot execute draft RPC');
select ok(not has_function_privilege('authenticated','public.submit_complaint_intake(uuid,integer)','EXECUTE'),'Browser role cannot execute submit RPC');
select ok(has_function_privilege('service_role','public.create_complaint_intake_draft(text,text,uuid)','EXECUTE'),'Trusted service role can execute draft RPC');
select ok(has_function_privilege('service_role','public.submit_complaint_intake(uuid,integer)','EXECUTE'),'Trusted service role can execute submit RPC');

-- Browser boundary: even a fully authorized staff JWT cannot call the trusted RPC
-- or mutate the table directly.
set local role authenticated;
select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$select public.create_complaint_intake_draft('assisted_internal','UAT-COMPLAINTS','64000000-0000-4000-8000-000000000001')$$,
  '42501',null,'Authenticated browser cannot call trusted draft creation'
);
select throws_ok(
  $$insert into public.complaint_intakes(status,channel,source,actor_id,organisation_scope) values ('draft','assisted_internal','wasdok_assisted_form','64000000-0000-4000-8000-000000000001','UAT-COMPLAINTS')$$,
  '42501',null,'Authenticated browser cannot bypass trusted creation with direct insert'
);
reset role;

-- Trusted-server input and actor authorization checks.
set local role service_role;
select throws_ok(
  $$select public.create_complaint_intake_draft('public_web','UAT-COMPLAINTS','64000000-0000-4000-8000-000000000001')$$,
  '22023',null,'Public web origin cannot invent an authenticated actor'
);
select throws_ok(
  $$select public.create_complaint_intake_draft('unapproved_channel','UAT-COMPLAINTS',null)$$,
  '22023',null,'Unknown complaint intake channel is rejected'
);
select throws_ok(
  $$select public.create_complaint_intake_draft('public_web','   ',null)$$,
  '22023',null,'Blank organisational scope is rejected'
);
select throws_ok(
  $$select public.create_complaint_intake_draft('assisted_internal','UAT-COMPLAINTS',null)$$,
  '22023',null,'Assisted intake requires a staff actor'
);
select throws_ok(
  $$select public.create_complaint_intake_draft('assisted_internal','UAT-COMPLAINTS','64000000-0000-4000-8000-000000000002')$$,
  '42501',null,'Assisted actor without complaints.create is rejected'
);
select throws_ok(
  $$select public.create_complaint_intake_draft('assisted_internal','UAT-COMPLAINTS','64000000-0000-4000-8000-000000000003')$$,
  '42501',null,'Assisted actor without matching active scope is rejected'
);
select throws_ok(
  $$select public.create_complaint_intake_draft('assisted_internal','UAT-COMPLAINTS','64000000-0000-4000-8000-000000000004')$$,
  '42501',null,'Assisted actor without CONFIDENTIAL compartment is rejected'
);
select throws_ok(
  $$select public.create_complaint_intake_draft('assisted_internal','UAT-COMPLAINTS','64000000-0000-4000-8000-000000000005')$$,
  '42501',null,'Inactive assisted actor is rejected'
);
select throws_ok(
  $$select public.create_complaint_intake_draft('assisted_internal','UAT-COMPLAINTS','64000000-0000-4000-8000-000000000006')$$,
  '42501',null,'System Administrator role does not bypass protected compartment checks'
);
select lives_ok(
  $$select public.create_complaint_intake_draft('public_web','UAT-PUBLIC',null)$$,
  'Valid public web draft is created through trusted RPC'
);
select lives_ok(
  $$select public.create_complaint_intake_draft('assisted_internal','UAT-COMPLAINTS','64000000-0000-4000-8000-000000000001')$$,
  'Valid assisted draft is created through trusted RPC'
);

select is((select count(*)::int from public.complaint_intakes where channel='public_web' and organisation_scope='UAT-PUBLIC' and status='draft' and revision=1 and actor_id is null and source='wasdok_public_form'),1,'Public draft persists fixed provenance and revision 1');
select is((select count(*)::int from public.complaint_intakes where channel='assisted_internal' and actor_id='64000000-0000-4000-8000-000000000001' and organisation_scope='UAT-COMPLAINTS' and status='draft' and revision=1 and source='wasdok_assisted_form'),1,'Assisted draft persists fixed provenance, actor and revision 1');
select is((select count(*)::int from public.complaint_intakes where classification='CONFIDENTIAL'),2,'All intake state records carry fixed CONFIDENTIAL classification');

-- Read policy: only the owning, currently-authorized assisted actor can see its state.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.complaint_intakes where channel='assisted_internal'),1,'Authorized assisted actor can read own intake state');
select is((select count(*)::int from public.complaint_intakes where channel='public_web'),0,'Public-origin intake state is hidden from ordinary authenticated sessions');
select set_config('request.jwt.claim.sub','64000000-0000-4000-8000-000000000007',true);
select is((select count(*)::int from public.complaint_intakes),0,'Another fully-authorized staff actor cannot read someone else''s intake state');

-- Authenticated users cannot forge reserved lifecycle evidence in audit_events.
select throws_ok(
  $$insert into public.audit_events(actor_id,action,entity_type,classification,metadata) values ('64000000-0000-4000-8000-000000000007','complaint_intake.submitted','complaint_intake','RESTRICTED','{"forged":true}'::jsonb)$$,
  '42501','new row violates row-level security policy for table "audit_events"','Authenticated actor cannot forge reserved complaint intake audit events'
);
reset role;

-- Provenance is immutable while draft; only the trusted submit RPC may perform
-- the one-way draft -> submitted transition.
set local role service_role;
select throws_ok(
  $$update public.complaint_intakes set channel='public_web',source='wasdok_public_form' where channel='assisted_internal' and actor_id='64000000-0000-4000-8000-000000000001'$$,
  '23514',null,'Draft channel/source provenance cannot be changed'
);
select lives_ok(
  $$select public.submit_complaint_intake((select id from public.complaint_intakes where channel='assisted_internal' and actor_id='64000000-0000-4000-8000-000000000001'),1)$$,
  'Draft submits exactly once at the expected revision'
);
select is((select status from public.complaint_intakes where channel='assisted_internal' and actor_id='64000000-0000-4000-8000-000000000001'),'submitted','Submission sets status to submitted');
select is((select revision from public.complaint_intakes where channel='assisted_internal' and actor_id='64000000-0000-4000-8000-000000000001'),2,'Submission increments revision exactly once');
select ok((select submitted_at is not null and updated_at >= created_at from public.complaint_intakes where channel='assisted_internal' and actor_id='64000000-0000-4000-8000-000000000001'),'Submission records submitted and updated timestamps');
select throws_ok(
  $$select public.submit_complaint_intake((select id from public.complaint_intakes where channel='assisted_internal' and actor_id='64000000-0000-4000-8000-000000000001'),1)$$,
  '22023',null,'Repeated or stale submission is rejected without silently mutating state'
);
select throws_ok(
  $$update public.complaint_intakes set status='draft',submitted_at=null,revision=3 where channel='assisted_internal' and actor_id='64000000-0000-4000-8000-000000000001'$$,
  '23514',null,'Submitted intake cannot revert to draft even through trusted table update'
);
select throws_ok(
  $$delete from public.complaint_intakes where channel='public_web' and organisation_scope='UAT-PUBLIC'$$,
  '42501',null,'Service role cannot delete intake state'
);

-- Lifecycle audit evidence contains state/provenance only and is exactly once.
select is((select count(*)::int from public.audit_events where action='complaint_intake.draft_created' and entity_type='complaint_intake' and organisation_scope='UAT-PUBLIC' and actor_id is null),1,'Public draft creates one anonymous-origin lifecycle audit event');
select is((select count(*)::int from public.audit_events where action='complaint_intake.draft_created' and entity_type='complaint_intake' and organisation_scope='UAT-COMPLAINTS' and actor_id='64000000-0000-4000-8000-000000000001'),1,'Assisted draft audit is attributed to the authorized staff actor');
select is((select count(*)::int from public.audit_events where action='complaint_intake.submitted' and entity_type='complaint_intake' and organisation_scope='UAT-COMPLAINTS' and actor_id='64000000-0000-4000-8000-000000000001' and before_data @> '{"status":"draft","revision":1}'::jsonb and after_data @> '{"status":"submitted","revision":2}'::jsonb),1,'Submission audit records the exact before/after state and revision');
select ok(not exists(select 1 from public.audit_events where action like 'complaint_intake.%' and (coalesce(before_data,'{}'::jsonb) ?| array['complainant','allegation','subject','email','phone'] or coalesce(after_data,'{}'::jsonb) ?| array['complainant','allegation','subject','email','phone'] or coalesce(request_metadata,'{}'::jsonb) ?| array['complainant','allegation','subject','email','phone'])),'Lifecycle audit payload stores no complaint narrative/contact fields');
select is((select count(*)::int from public.audit_events where action='complaint_intake.submitted' and entity_type='complaint_intake' and organisation_scope='UAT-COMPLAINTS'),1,'Rejected repeated submit creates no duplicate submission audit event');

-- Atomicity: if the audit append cannot occur, intake creation must roll back.
reset role;
revoke insert on table public.audit_events from public, anon, authenticated, service_role;
set local role service_role;
select throws_ok(
  $$select public.create_complaint_intake_draft('public_web','UAT-AUDIT-ROLLBACK',null)$$,
  '42501',null,'Audit append failure aborts the intake state transaction'
);
reset role;
grant insert on table public.audit_events to service_role;
select is((select count(*)::int from public.complaint_intakes where organisation_scope='UAT-AUDIT-ROLLBACK'),0,'Failed audit append leaves no intake state row behind');

select * from finish();
rollback;
