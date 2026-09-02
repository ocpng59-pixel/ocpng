begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

-- Initialize pg_temp so dynamic helpers can safely probe objects that do not
-- exist yet during the RED cycle without aborting the whole test file.
create temp table wasdok66_temp_init(id integer) on commit drop;

create or replace function pg_temp.bool_query(p_sql text)
returns boolean
language plpgsql
as $$
declare v boolean;
begin
  execute p_sql into v;
  return coalesce(v,false);
exception when others then
  return false;
end;
$$;

create or replace function pg_temp.int_query(p_sql text)
returns integer
language plpgsql
as $$
declare v integer;
begin
  execute p_sql into v;
  return v;
exception when others then
  return null;
end;
$$;

create or replace function pg_temp.text_query(p_sql text)
returns text
language plpgsql
as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return null;
end;
$$;

select plan(47);

set local session_replication_role = replica;
insert into public.profiles (id, display_name, email, is_active, organisation_scope, metadata) values
('66000000-0000-4000-8000-000000000001','DEMO WASDOK66 Creator','wasdok66-creator@test.invalid',true,'UAT-COMPLAINTS','{"demo":true,"wasdok":"WASDOK-66"}'::jsonb);
set local session_replication_role = origin;

insert into public.roles (code,name,is_system,metadata) values
('test_wasdok66_creator','DEMO WASDOK66 Creator',false,'{"demo":true,"wasdok":"WASDOK-66"}'::jsonb)
on conflict (code) do update set metadata=excluded.metadata;

insert into public.permissions (code,name,domain) values
('complaints.create','Create complaints','Complaints')
on conflict (code) do nothing;

insert into public.security_compartments (code,name) values
('CONFIDENTIAL','Confidential')
on conflict (code) do nothing;

insert into public.user_roles (user_id,role_id,organisation_scope)
select '66000000-0000-4000-8000-000000000001'::uuid,r.id,'UAT-COMPLAINTS'
from public.roles r where r.code='test_wasdok66_creator'
on conflict (user_id,role_id) do nothing;

insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.code='test_wasdok66_creator' and p.code='complaints.create'
on conflict (role_id,permission_id) do nothing;

insert into public.data_scopes (user_id,scope_code,scope_type,active) values
('66000000-0000-4000-8000-000000000001','UAT-COMPLAINTS','organisation',true)
on conflict (user_id,scope_code) do update set active=excluded.active;

insert into public.user_compartments (user_id,compartment_id)
select '66000000-0000-4000-8000-000000000001'::uuid,sc.id
from public.security_compartments sc where sc.code='CONFIDENTIAL'
on conflict (user_id,compartment_id) do nothing;

-- Schema, RLS and privilege boundary.
select has_table('public','complaint_intake_privacy_evidence','Privacy evidence table exists');
select has_column('public','complaint_intake_privacy_evidence','intake_id','Evidence links to intake');
select has_column('public','complaint_intake_privacy_evidence','notice_version','Notice version is recorded');
select has_column('public','complaint_intake_privacy_evidence','acknowledgement_required','Requirement state is recorded');
select has_column('public','complaint_intake_privacy_evidence','acknowledgement_method','Acknowledgement method is recorded');
select has_column('public','complaint_intake_privacy_evidence','not_required_reason','Approved non-required reason can be recorded');
select has_column('public','complaint_intake_privacy_evidence','acknowledged_at','Acknowledgement timestamp is recorded');
select has_column('public','complaint_intake_privacy_evidence','recorded_at','Evidence record timestamp is recorded');
select has_column('public','complaint_intake_privacy_evidence','recorded_by','Assisted evidence can be attributed to a verified actor');
select ok(pg_temp.bool_query($q$select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='complaint_intake_privacy_evidence'$q$),'Privacy evidence has RLS enabled');
select ok(pg_temp.bool_query($q$select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='complaint_intake_privacy_evidence'$q$),'Privacy evidence has RLS forced');
select ok(not pg_temp.bool_query($q$select has_table_privilege('anon','public.complaint_intake_privacy_evidence','SELECT')$q$),'Anonymous users cannot read privacy evidence');
select ok(not pg_temp.bool_query($q$select has_table_privilege('authenticated','public.complaint_intake_privacy_evidence','SELECT')$q$),'Authenticated browsers cannot read privacy evidence directly');
select ok(pg_temp.bool_query($q$select has_table_privilege('service_role','public.complaint_intake_privacy_evidence','SELECT')$q$),'Service role can read privacy evidence for trusted retry verification');
select ok(pg_temp.bool_query($q$select has_table_privilege('service_role','public.complaint_intake_privacy_evidence','INSERT')$q$),'Service role can insert privacy evidence');
select ok(not pg_temp.bool_query($q$select has_table_privilege('service_role','public.complaint_intake_privacy_evidence','UPDATE')$q$),'Service role cannot update privacy evidence');
select ok(not pg_temp.bool_query($q$select has_table_privilege('service_role','public.complaint_intake_privacy_evidence','DELETE')$q$),'Service role cannot delete privacy evidence');
select ok(pg_temp.bool_query($q$select exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='complaint_intake_privacy_evidence' and t.tgname='complaint_intake_privacy_evidence_guard' and not t.tgisinternal)$q$),'Privacy evidence mutation guard exists');
select ok(pg_temp.bool_query($q$select exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='complaint_intake_privacy_evidence' and t.tgname='complaint_intake_privacy_evidence_audit' and not t.tgisinternal)$q$),'Privacy evidence audit trigger exists');

-- Trusted RPC must require privacy evidence; the WASDOK-65 12-argument entry
-- point must no longer be an executable bypass.
select has_function('public','persist_complaint_intake_submission',array['text','text','uuid','text','text','text','text','text','text','text','text','text','text','boolean','text','text'],'Privacy-aware trusted persistence RPC exists');
select ok(to_regprocedure('public.persist_complaint_intake_submission(text,text,uuid,text,text,text,text,text,text,text,text,text)') is null or not coalesce(has_function_privilege('service_role',to_regprocedure('public.persist_complaint_intake_submission(text,text,uuid,text,text,text,text,text,text,text,text,text)'),'EXECUTE'),false),'Old persistence RPC cannot bypass privacy evidence');
select ok(not coalesce(has_function_privilege('anon',to_regprocedure('public.persist_complaint_intake_submission(text,text,uuid,text,text,text,text,text,text,text,text,text,text,boolean,text,text)'),'EXECUTE'),false),'Anonymous role cannot execute privacy-aware persistence RPC');
select ok(not coalesce(has_function_privilege('authenticated',to_regprocedure('public.persist_complaint_intake_submission(text,text,uuid,text,text,text,text,text,text,text,text,text,text,boolean,text,text)'),'EXECUTE'),false),'Authenticated browser cannot execute privacy-aware persistence RPC');
select ok(coalesce(has_function_privilege('service_role',to_regprocedure('public.persist_complaint_intake_submission(text,text,uuid,text,text,text,text,text,text,text,text,text,text,boolean,text,text)'),'EXECUTE'),false),'Trusted service role can execute privacy-aware persistence RPC');

set local role service_role;

-- Public path: acknowledgement is mandatory and server/database timestamps it.
select throws_ok(
  $$select * from public.persist_complaint_intake_submission(
    'public_web','OCPNG',null,
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'DEMO WASDOK66 Public','wasdok66-public@test.invalid','','',
    'DEMO Government Body','','DEMO Privacy Subject','DEMO Privacy Allegation',
    'OCPNG-COMPLAINT-PRIVACY-v1',false,'public_checkbox',null
  )$$,
  '22023',null,'Public submission cannot claim acknowledgement is not required'
);
select lives_ok(
  $$select * from public.persist_complaint_intake_submission(
    'public_web','OCPNG',null,
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'DEMO WASDOK66 Public','wasdok66-public@test.invalid','','',
    'DEMO Government Body','','DEMO Privacy Subject','DEMO Privacy Allegation',
    'OCPNG-COMPLAINT-PRIVACY-v1',true,'public_checkbox',null
  )$$,
  'Public submission persists with required privacy acknowledgement'
);
select is(pg_temp.int_query($q$select count(*)::int from public.complaint_intake_privacy_evidence pe join public.complaint_intakes ci on ci.id=pe.intake_id where ci.idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'$q$),1,'Public submission creates exactly one privacy evidence record');
select is(pg_temp.text_query($q$select pe.acknowledgement_method from public.complaint_intake_privacy_evidence pe join public.complaint_intakes ci on ci.id=pe.intake_id where ci.idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'$q$),'public_checkbox','Public evidence records checkbox method');
select ok(pg_temp.bool_query($q$select pe.notice_version='OCPNG-COMPLAINT-PRIVACY-v1' and pe.acknowledgement_required=true and pe.not_required_reason is null from public.complaint_intake_privacy_evidence pe join public.complaint_intakes ci on ci.id=pe.intake_id where ci.idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'$q$),'Public evidence stores only approved requirement metadata');
select ok(pg_temp.bool_query($q$select pe.acknowledged_at is not null and pe.recorded_at is not null and pe.acknowledged_at >= ci.created_at from public.complaint_intake_privacy_evidence pe join public.complaint_intakes ci on ci.id=pe.intake_id where ci.idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'$q$),'Acknowledgement and recording timestamps are generated in the authoritative transaction');
select ok(pg_temp.bool_query($q$select pe.recorded_by is null from public.complaint_intake_privacy_evidence pe join public.complaint_intakes ci on ci.id=pe.intake_id where ci.idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'$q$),'Public privacy evidence does not invent an actor');
select is(pg_temp.int_query($q$select count(*)::int from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ci.idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' and ae.action='complaint_intake.privacy_recorded'$q$),1,'Public submission creates exactly one privacy audit event');
select ok(not pg_temp.bool_query($q$select exists(select 1 from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ci.idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' and ae.action='complaint_intake.privacy_recorded' and (ae.request_metadata::text||coalesce(ae.before_data::text,'')||coalesce(ae.after_data::text,'')||ae.metadata::text) ~ 'DEMO WASDOK66 Public|wasdok66-public@test.invalid|DEMO Privacy Allegation')$q$),'Privacy audit event excludes complaint/contact content');

select lives_ok(
  $$select * from public.persist_complaint_intake_submission(
    'public_web','OCPNG',null,
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'DEMO WASDOK66 Public','wasdok66-public@test.invalid','','',
    'DEMO Government Body','','DEMO Privacy Subject','DEMO Privacy Allegation',
    'OCPNG-COMPLAINT-PRIVACY-v1',true,'public_checkbox',null
  )$$,
  'Exact public retry with identical privacy evidence succeeds'
);
select is(pg_temp.int_query($q$select count(*)::int from public.complaint_intake_privacy_evidence pe join public.complaint_intakes ci on ci.id=pe.intake_id where ci.idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'$q$),1,'Exact retry creates no duplicate privacy evidence');
select is(pg_temp.int_query($q$select count(*)::int from public.audit_events ae join public.complaint_intakes ci on ci.id=ae.entity_id where ci.idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' and ae.action='complaint_intake.privacy_recorded'$q$),1,'Exact retry creates no duplicate privacy audit event');
select throws_ok(
  $$select * from public.persist_complaint_intake_submission(
    'public_web','OCPNG',null,
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'DEMO WASDOK66 Public','wasdok66-public@test.invalid','','',
    'DEMO Government Body','','DEMO Privacy Subject','DEMO Privacy Allegation',
    'OCPNG-COMPLAINT-PRIVACY-v1',false,'not_required','formal_correspondence_already_received'
  )$$,
  '22023',null,'Retry cannot change the privacy evidence attached to an idempotency key'
);

-- Assisted acknowledgement path: actor is server-derived and becomes evidence attribution.
select lives_ok(
  $$select * from public.persist_complaint_intake_submission(
    'assisted_internal','UAT-COMPLAINTS','66000000-0000-4000-8000-000000000001',
    'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    'DEMO WASDOK66 Assisted','wasdok66-assisted@test.invalid','','',
    'DEMO Government Body','DEMO Officer','DEMO Assisted Privacy','DEMO Assisted Allegation',
    'OCPNG-COMPLAINT-PRIVACY-v1',true,'assisted_acknowledgement',null
  )$$,
  'Authorized assisted submission can record acknowledgement evidence'
);
select ok(pg_temp.bool_query($q$select pe.recorded_by='66000000-0000-4000-8000-000000000001'::uuid and pe.acknowledgement_method='assisted_acknowledgement' and pe.acknowledged_at is not null from public.complaint_intake_privacy_evidence pe join public.complaint_intakes ci on ci.id=pe.intake_id where ci.idempotency_key_hash='dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'$q$),'Assisted acknowledgement is attributed to the verified actor');

-- Assisted not-required path is narrowly constrained to an approved reason code.
select lives_ok(
  $$select * from public.persist_complaint_intake_submission(
    'assisted_internal','UAT-COMPLAINTS','66000000-0000-4000-8000-000000000001',
    'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    'DEMO WASDOK66 Correspondence','wasdok66-correspondence@test.invalid','','',
    'DEMO Government Body','','DEMO Correspondence Privacy','DEMO Correspondence Allegation',
    'OCPNG-COMPLAINT-PRIVACY-v1',false,'not_required','formal_correspondence_already_received'
  )$$,
  'Approved assisted non-required path persists'
);
select ok(pg_temp.bool_query($q$select pe.acknowledgement_required=false and pe.acknowledgement_method='not_required' and pe.not_required_reason='formal_correspondence_already_received' and pe.acknowledged_at is null and pe.recorded_by='66000000-0000-4000-8000-000000000001'::uuid from public.complaint_intake_privacy_evidence pe join public.complaint_intakes ci on ci.id=pe.intake_id where ci.idempotency_key_hash='eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'$q$),'Non-required evidence stores reason, no false acknowledgement timestamp, and verified actor');
select throws_ok(
  $$select * from public.persist_complaint_intake_submission(
    'assisted_internal','UAT-COMPLAINTS','66000000-0000-4000-8000-000000000001',
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    'DEMO Invalid Reason','wasdok66-invalid@test.invalid','','',
    'DEMO Government Body','','DEMO Invalid Reason','DEMO Invalid Reason Allegation',
    'OCPNG-COMPLAINT-PRIVACY-v1',false,'not_required','browser_invented_reason'
  )$$,
  '22023',null,'Unapproved not-required reason is rejected'
);

-- Evidence is append-only even for the trusted role.
select throws_ok(
  $$update public.complaint_intake_privacy_evidence set notice_version='FORGED' where intake_id=(select id from public.complaint_intakes where idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')$$,
  '23514',null,'Privacy evidence cannot be modified after recording'
);
select throws_ok(
  $$delete from public.complaint_intake_privacy_evidence where intake_id=(select id from public.complaint_intakes where idempotency_key_hash='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc')$$,
  '23514',null,'Privacy evidence cannot be deleted after recording'
);
select is((select count(*)::int from public.complaints where complaint_number like 'OC-RCP-%'),0,'Privacy capture does not prematurely create formal complaint/case records');

select * from finish();
rollback;
