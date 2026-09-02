begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(40);

set local session_replication_role = replica;
insert into public.profiles (id, display_name, email, is_active, organisation_scope, metadata) values
('65000000-0000-4000-8000-000000000001','DEMO WASDOK65 Creator','wasdok65-creator@test.invalid',true,'UAT-COMPLAINTS','{"demo":true,"wasdok":"WASDOK-65"}'::jsonb),
('65000000-0000-4000-8000-000000000002','DEMO WASDOK65 Unauthorized','wasdok65-unauthorized@test.invalid',true,'UAT-COMPLAINTS','{"demo":true,"wasdok":"WASDOK-65"}'::jsonb);
set local session_replication_role = origin;

insert into public.roles (code,name,is_system,metadata) values
('test_wasdok65_creator','DEMO WASDOK65 Creator',false,'{"demo":true,"wasdok":"WASDOK-65"}'::jsonb)
on conflict (code) do update set metadata=excluded.metadata;

insert into public.permissions (code,name,domain) values
('complaints.create','Create complaints','Complaints')
on conflict (code) do nothing;

insert into public.security_compartments (code,name) values
('CONFIDENTIAL','Confidential')
on conflict (code) do nothing;

insert into public.user_roles (user_id,role_id,organisation_scope)
select '65000000-0000-4000-8000-000000000001'::uuid,r.id,'UAT-COMPLAINTS'
from public.roles r where r.code='test_wasdok65_creator'
on conflict (user_id,role_id) do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='test_wasdok65_creator' and p.code='complaints.create'
on conflict (role_id,permission_id) do nothing;

insert into public.data_scopes (user_id,scope_code,scope_type,active) values
('65000000-0000-4000-8000-000000000001','UAT-COMPLAINTS','organisation',true)
on conflict (user_id,scope_code) do update set active=excluded.active;

insert into public.user_compartments (user_id,compartment_id)
select '65000000-0000-4000-8000-000000000001'::uuid,sc.id
from public.security_compartments sc where sc.code='CONFIDENTIAL'
on conflict (user_id,compartment_id) do nothing;

-- Schema and trusted-RPC boundary.
select has_column('public','complaint_intakes','receipt_reference','Receipt reference is persisted');
select has_column('public','complaint_intakes','idempotency_key_hash','Idempotency hash is persisted');
select has_column('public','complaint_intakes','complainant_name','Complainant name is persisted');
select has_column('public','complaint_intakes','email','Email is persisted');
select has_column('public','complaint_intakes','phone','Phone is persisted');
select has_column('public','complaint_intakes','postal_address','Postal address is persisted');
select has_column('public','complaint_intakes','government_body','Government body is persisted');
select has_column('public','complaint_intakes','respondent','Respondent is persisted');
select has_column('public','complaint_intakes','subject','Subject is persisted');
select has_column('public','complaint_intakes','allegation','Allegation is persisted');
select has_function('public','persist_complaint_intake_submission',array['text','text','uuid','text','text','text','text','text','text','text','text','text'],'Trusted persistence RPC exists');
select ok(not coalesce(has_function_privilege('anon',to_regprocedure('public.persist_complaint_intake_submission(text,text,uuid,text,text,text,text,text,text,text,text,text)'),'EXECUTE'),false),'Anonymous role cannot execute persistence RPC');
select ok(not coalesce(has_function_privilege('authenticated',to_regprocedure('public.persist_complaint_intake_submission(text,text,uuid,text,text,text,text,text,text,text,text,text)'),'EXECUTE'),false),'Authenticated browser cannot execute persistence RPC');
select ok(coalesce(has_function_privilege('service_role',to_regprocedure('public.persist_complaint_intake_submission(text,text,uuid,text,text,text,text,text,text,text,text,text)'),'EXECUTE'),false),'Trusted service role can execute persistence RPC');

set local role service_role;

select lives_ok(
  $$select * from public.persist_complaint_intake_submission(
    'public_web','OCPNG',null,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'DEMO Public Complainant','demo-public@test.invalid','+675 7000 0001','PO Box 65, DEMO',
    'DEMO Government Body','DEMO Respondent','DEMO Public Subject','DEMO Secret Allegation WASDOK65'
  )$$,
  'Valid public submission persists through trusted RPC'
);
select is((select to_jsonb(ci)->>'status' from public.complaint_intakes ci where organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),'submitted','Public submission is immediately submitted');
select is((select (to_jsonb(ci)->>'revision')::int from public.complaint_intakes ci where organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),2,'Atomic persistence advances revision to 2');
select ok(coalesce((select (to_jsonb(ci)->>'receipt_reference') ~ '^OC-RCP-[0-9]{4}-[A-F0-9]{16}$' from public.complaint_intakes ci where organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),false),'Receipt reference is controlled and non-sequential');
select ok(coalesce((select to_jsonb(ci) @> '{"channel":"public_web","source":"wasdok_public_form","actor_id":null,"organisation_scope":"OCPNG","classification":"CONFIDENTIAL"}'::jsonb from public.complaint_intakes ci where organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),false),'Public provenance remains fixed');
select ok(coalesce((select to_jsonb(ci) @> '{"complainant_name":"DEMO Public Complainant","email":"demo-public@test.invalid","phone":"+675 7000 0001","postal_address":"PO Box 65, DEMO","government_body":"DEMO Government Body","respondent":"DEMO Respondent","subject":"DEMO Public Subject","allegation":"DEMO Secret Allegation WASDOK65"}'::jsonb from public.complaint_intakes ci where organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),false),'Validated complaint payload is persisted intact');
select is((select to_jsonb(ci)->>'idempotency_key_hash' from public.complaint_intakes ci where organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Only the normalized idempotency hash is stored');
select is((select count(*)::int from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ae.action='complaint_intake.draft_created' and ci.organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),1,'Persistence creates one draft audit event');
select is((select count(*)::int from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ae.action='complaint_intake.submitted' and ci.organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),1,'Persistence creates one submission audit event');
select ok(coalesce((select ae.request_metadata @> '{"channel":"public_web","source":"wasdok_public_form"}'::jsonb and ae.after_data ? 'submitted_at' from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ae.action='complaint_intake.submitted' and ci.organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),false),'Submission audit records channel/source and submission time');
select ok(not exists(select 1 from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ci.organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and (ae.request_metadata::text || coalesce(ae.before_data::text,'') || coalesce(ae.after_data::text,'') || ae.metadata::text) ~ 'DEMO Public Complainant|demo-public@test.invalid|7000 0001|Secret Allegation'),'Audit payload excludes complainant/contact/allegation content');
select ok(not exists(select 1 from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ci.organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' and (ae.request_metadata::text || coalesce(ae.before_data::text,'') || coalesce(ae.after_data::text,'') || ae.metadata::text) like '%aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%'),'Audit payload excludes idempotency hash');

select lives_ok(
  $$select * from public.persist_complaint_intake_submission(
    'public_web','OCPNG',null,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'DEMO Public Complainant','demo-public@test.invalid','+675 7000 0001','PO Box 65, DEMO',
    'DEMO Government Body','DEMO Respondent','DEMO Public Subject','DEMO Secret Allegation WASDOK65'
  )$$,
  'Exact retry with same idempotency hash succeeds'
);
select is((select count(*)::int from public.complaint_intakes ci where ci.organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),1,'Exact retry creates no duplicate intake');
select is((select count(*)::int from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ae.action='complaint_intake.submitted' and ci.organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),1,'Exact retry creates no duplicate submit audit');
select throws_ok(
  $$select * from public.persist_complaint_intake_submission(
    'public_web','OCPNG',null,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'DEMO Public Complainant','demo-public@test.invalid','+675 7000 0001','PO Box 65, DEMO',
    'DEMO Government Body','DEMO Respondent','DEMO Public Subject','CHANGED ALLEGATION'
  )$$,
  '22023',null,'Same idempotency hash with changed payload is rejected'
);
select is((select count(*)::int from public.complaint_intakes ci where ci.organisation_scope='OCPNG' and to_jsonb(ci)->>'idempotency_key_hash'='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),1,'Changed retry leaves the authoritative intake unchanged');
select throws_ok(
  $$update public.complaint_intakes set complainant_name='MUTATED' where organisation_scope='OCPNG' and idempotency_key_hash='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'$$,
  '23514',null,'Submitted complaint content cannot be altered directly'
);
select throws_ok(
  $$update public.complaint_intakes set receipt_reference='OC-RCP-2026-FFFFFFFFFFFFFFFF' where organisation_scope='OCPNG' and idempotency_key_hash='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'$$,
  '23514',null,'Receipt reference cannot be altered directly'
);
select ok(not has_table_privilege('service_role','public.complaint_intakes','DELETE'),'Service role still cannot delete authoritative intake records');
select throws_ok(
  $$select * from public.persist_complaint_intake_submission(
    'public_web','OCPNG',null,'not-a-sha256-hash',
    'DEMO Public Complainant','demo-public@test.invalid','','',
    'DEMO Government Body','','DEMO Public Subject','DEMO Allegation'
  )$$,
  '22023',null,'Malformed idempotency hash is rejected'
);

select lives_ok(
  $$select * from public.persist_complaint_intake_submission(
    'assisted_internal','UAT-COMPLAINTS','65000000-0000-4000-8000-000000000001',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'DEMO Assisted Complainant','demo-assisted@test.invalid','','',
    'DEMO Government Body','DEMO Officer','DEMO Assisted Subject','DEMO Assisted Allegation'
  )$$,
  'Authorized assisted submission persists through trusted RPC'
);
select ok(coalesce((select to_jsonb(ci) @> '{"channel":"assisted_internal","source":"wasdok_assisted_form","actor_id":"65000000-0000-4000-8000-000000000001","organisation_scope":"UAT-COMPLAINTS","status":"submitted"}'::jsonb from public.complaint_intakes ci where to_jsonb(ci)->>'idempotency_key_hash'='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),false),'Assisted submission retains authorized actor and scope provenance');
select ok(coalesce((select (to_jsonb(ci)->>'receipt_reference') ~ '^OC-RCP-[0-9]{4}-[A-F0-9]{16}$' from public.complaint_intakes ci where to_jsonb(ci)->>'idempotency_key_hash'='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),false),'Assisted submission receives a controlled receipt');
select is((select count(*)::int from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ae.action='complaint_intake.submitted' and ae.actor_id='65000000-0000-4000-8000-000000000001' and to_jsonb(ci)->>'idempotency_key_hash'='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'),1,'Assisted submission audit is attributed to the authorized actor');
select is((select count(*)::int from public.complaints where complaint_number like 'OC-RCP-%'),0,'Receipt persistence does not prematurely create a formal complaint/case record');

select * from finish();
rollback;
