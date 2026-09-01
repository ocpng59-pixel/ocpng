begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(32);

-- Test identities are deterministic UUIDs; public.profiles is populated with
-- FK checks temporarily disabled because auth.uid() only requires JWT claims.
set local session_replication_role = replica;
insert into public.profiles (id, display_name, email, organisation_scope, metadata) values
('10000000-0000-0000-0000-000000000001','RLS Leadership UAT','rls-leadership@test.invalid','leadership','{"uat":true,"automated_rls":true}'::jsonb),
('10000000-0000-0000-0000-000000000002','RLS Legal UAT','rls-legal@test.invalid','legal','{"uat":true,"automated_rls":true}'::jsonb),
('10000000-0000-0000-0000-000000000003','RLS Intelligence UAT','rls-intelligence@test.invalid','intelligence','{"uat":true,"automated_rls":true}'::jsonb),
('10000000-0000-0000-0000-000000000004','RLS Annual Statements UAT','rls-annual@test.invalid','leadership','{"uat":true,"automated_rls":true}'::jsonb),
('10000000-0000-0000-0000-000000000005','RLS Investigator UAT','rls-investigator@test.invalid','UAT-INVESTIGATIONS','{"uat":true,"automated_rls":true}'::jsonb),
('10000000-0000-0000-0000-000000000006','RLS System Administrator UAT','rls-admin@test.invalid','leadership','{"uat":true,"automated_rls":true}'::jsonb);
set local session_replication_role = origin;

insert into public.roles (code,name,is_system,metadata) values
('test_rls_leadership','Test RLS Leadership',false,'{"uat":true}'::jsonb),
('test_rls_legal','Test RLS Legal',false,'{"uat":true}'::jsonb),
('test_rls_intelligence','Test RLS Intelligence',false,'{"uat":true}'::jsonb),
('test_rls_annual','Test RLS Annual Statements',false,'{"uat":true}'::jsonb),
('test_rls_investigator','Test RLS Investigator',false,'{"uat":true}'::jsonb),
('test_rls_system_admin','Test RLS System Administrator',false,'{"uat":true}'::jsonb)
on conflict (code) do update set metadata = excluded.metadata;

insert into public.permissions (code,name,domain) values
('leadership.view_restricted','View Leadership matters','Leadership'),
('legal.view_privileged','View privileged legal matters','Legal'),
('intelligence.view_secret','View secret intelligence','Intelligence'),
('annual_statements.view_secret','View Annual Statements','Leadership'),
('investigations.view','View investigations','Investigations')
on conflict (code) do nothing;

insert into public.security_compartments (code,name) values
('CONFIDENTIAL','Confidential'),
('LEADERSHIP_RESTRICTED','Leadership Restricted'),
('ANNUAL_STATEMENT_SECRET','Annual Statement Secret'),
('INTELLIGENCE_SECRET','Intelligence Secret'),
('LEGAL_PRIVILEGE','Legal Privilege')
on conflict (code) do nothing;

insert into public.user_roles (user_id, role_id, organisation_scope)
select v.user_id, r.id, v.scope_code
from (values
('10000000-0000-0000-0000-000000000001'::uuid,'test_rls_leadership','leadership'),
('10000000-0000-0000-0000-000000000002'::uuid,'test_rls_legal','legal'),
('10000000-0000-0000-0000-000000000003'::uuid,'test_rls_intelligence','intelligence'),
('10000000-0000-0000-0000-000000000004'::uuid,'test_rls_annual','leadership'),
('10000000-0000-0000-0000-000000000005'::uuid,'test_rls_investigator','UAT-INVESTIGATIONS'),
('10000000-0000-0000-0000-000000000006'::uuid,'test_rls_system_admin','leadership')
) as v(user_id, role_code, scope_code)
join public.roles r on r.code = v.role_code;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from (values
('test_rls_leadership','leadership.view_restricted'),
('test_rls_legal','legal.view_privileged'),
('test_rls_intelligence','intelligence.view_secret'),
('test_rls_annual','annual_statements.view_secret'),
('test_rls_investigator','investigations.view'),
('test_rls_system_admin','annual_statements.view_secret')
) as v(role_code, permission_code)
join public.roles r on r.code = v.role_code
join public.permissions p on p.code = v.permission_code;

insert into public.data_scopes (user_id, scope_code, scope_type, active)
values
('10000000-0000-0000-0000-000000000001','leadership','organisation',true),
('10000000-0000-0000-0000-000000000002','legal','organisation',true),
('10000000-0000-0000-0000-000000000003','intelligence','organisation',true),
('10000000-0000-0000-0000-000000000004','leadership','organisation',true),
('10000000-0000-0000-0000-000000000005','UAT-INVESTIGATIONS','organisation',true),
('10000000-0000-0000-0000-000000000006','leadership','organisation',true);

insert into public.user_compartments (user_id, compartment_id)
select v.user_id, sc.id
from (values
('10000000-0000-0000-0000-000000000001'::uuid,'LEADERSHIP_RESTRICTED'),
('10000000-0000-0000-0000-000000000002'::uuid,'LEGAL_PRIVILEGE'),
('10000000-0000-0000-0000-000000000003'::uuid,'INTELLIGENCE_SECRET'),
('10000000-0000-0000-0000-000000000004'::uuid,'ANNUAL_STATEMENT_SECRET'),
('10000000-0000-0000-0000-000000000005'::uuid,'CONFIDENTIAL')
) as v(user_id, compartment_code)
join public.security_compartments sc on sc.code::text = v.compartment_code;

-- Representative protected fixtures.
insert into public.people (id,full_name,person_type,classification,organisation_scope,metadata) values
('20000000-0000-0000-0000-000000000001','RLS Leadership In Scope','uat-test','CONFIDENTIAL','leadership','{"automated_rls":"leadership"}'::jsonb),
('20000000-0000-0000-0000-000000000002','RLS Leadership Out Scope','uat-test','CONFIDENTIAL','OUTSIDE-LEADERSHIP-UAT','{"automated_rls":"leadership"}'::jsonb);

insert into public.leaders (id,person_id,leader_status,classification,organisation_scope,metadata) values
('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','uat-test','LEADERSHIP_RESTRICTED','leadership','{"automated_rls":"leadership_in"}'::jsonb),
('21000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','uat-test','LEADERSHIP_RESTRICTED','OUTSIDE-LEADERSHIP-UAT','{"automated_rls":"leadership_out"}'::jsonb);

insert into public.annual_statement_periods
(id,name,opens_on,due_on,status,classification,organisation_scope,metadata) values
('22000000-0000-0000-0000-000000000001','RLS Annual In Scope',current_date,current_date+30,'planned','ANNUAL_STATEMENT_SECRET','leadership','{"automated_rls":"annual_in"}'::jsonb),
('22000000-0000-0000-0000-000000000002','RLS Annual Out Scope',current_date,current_date+30,'planned','ANNUAL_STATEMENT_SECRET','OUTSIDE-ANNUAL-UAT','{"automated_rls":"annual_out"}'::jsonb);

insert into public.legal_matters
(id,matter_number,matter_type,title,status,classification,organisation_scope,metadata) values
('23000000-0000-0000-0000-000000000001','RLS-LEGAL-IN','uat-test','RLS Legal In Scope','open','LEGAL_PRIVILEGE','legal','{"automated_rls":"legal_in"}'::jsonb),
('23000000-0000-0000-0000-000000000002','RLS-LEGAL-OUT','uat-test','RLS Legal Out Scope','open','LEGAL_PRIVILEGE','OUTSIDE-LEGAL-UAT','{"automated_rls":"legal_out"}'::jsonb),
('23000000-0000-0000-0000-000000000003','RLS-LEGAL-INT-SCOPE','uat-test','RLS Legal In Intelligence Scope','open','LEGAL_PRIVILEGE','intelligence','{"automated_rls":"legal_int_scope"}'::jsonb);

insert into public.intelligence_reports
(id,report_number,title,status,classification,organisation_scope,metadata) values
('24000000-0000-0000-0000-000000000001','RLS-INT-IN','RLS Intelligence In Scope','draft','INTELLIGENCE_SECRET','intelligence','{"automated_rls":"intelligence_in"}'::jsonb),
('24000000-0000-0000-0000-000000000002','RLS-INT-OUT','RLS Intelligence Out Scope','draft','INTELLIGENCE_SECRET','OUTSIDE-INTELLIGENCE-UAT','{"automated_rls":"intelligence_out"}'::jsonb),
('24000000-0000-0000-0000-000000000003','RLS-INT-LEGAL-SCOPE','RLS Intelligence In Legal Scope','draft','INTELLIGENCE_SECRET','legal','{"automated_rls":"intelligence_legal_scope"}'::jsonb);

insert into public.cases (id,case_number,case_type,status,classification,organisation_scope,case_id,metadata) values
('25000000-0000-0000-0000-000000000001','RLS-CASE-A','uat-test','open','CONFIDENTIAL','UAT-INVESTIGATIONS','25000000-0000-0000-0000-000000000001','{"automated_rls":"investigator_assigned"}'::jsonb),
('25000000-0000-0000-0000-000000000002','RLS-CASE-B','uat-test','open','CONFIDENTIAL','UAT-INVESTIGATIONS','25000000-0000-0000-0000-000000000002','{"automated_rls":"investigator_unassigned"}'::jsonb),
('25000000-0000-0000-0000-000000000003','RLS-CASE-C','uat-test','open','CONFIDENTIAL','OUTSIDE-INVESTIGATIONS-UAT','25000000-0000-0000-0000-000000000003','{"automated_rls":"investigator_outside_scope"}'::jsonb);

insert into public.case_assignments (case_ref,user_id,assignment_role,organisation_scope,case_id) values
('25000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','investigator','UAT-INVESTIGATIONS','25000000-0000-0000-0000-000000000001'),
('25000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000005','investigator','OUTSIDE-INVESTIGATIONS-UAT','25000000-0000-0000-0000-000000000003');

insert into public.investigations (id,case_ref,classification,organisation_scope,case_id,metadata) values
('26000000-0000-0000-0000-000000000001','25000000-0000-0000-0000-000000000001','CONFIDENTIAL','UAT-INVESTIGATIONS','25000000-0000-0000-0000-000000000001','{"automated_rls":"investigator_assigned"}'::jsonb),
('26000000-0000-0000-0000-000000000002','25000000-0000-0000-0000-000000000002','CONFIDENTIAL','UAT-INVESTIGATIONS','25000000-0000-0000-0000-000000000002','{"automated_rls":"investigator_unassigned"}'::jsonb),
('26000000-0000-0000-0000-000000000003','25000000-0000-0000-0000-000000000003','CONFIDENTIAL','OUTSIDE-INVESTIGATIONS-UAT','25000000-0000-0000-0000-000000000003','{"automated_rls":"investigator_outside_scope"}'::jsonb);

-- RLS policies target the authenticated Postgres role.
set local role authenticated;

-- has_scope exact-match regression
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select ok(public.has_scope('leadership'), 'has_scope exact-match regression: assigned scope is allowed');
select ok(not public.has_scope('OUTSIDE-LEADERSHIP-UAT'), 'has_scope exact-match regression: outside scope is denied');
select ok(not public.has_scope('SCOPE-THAT-DOES-NOT-EXIST-XYZ'), 'has_scope exact-match regression: nonexistent scope is denied');

-- Leadership RLS isolation
select ok(public.has_permission('leadership.view_restricted'), 'Leadership RLS isolation: permission is present');
select ok(public.has_compartment('LEADERSHIP_RESTRICTED'), 'Leadership RLS isolation: compartment is present');
select is((select count(*)::int from public.leaders where id='21000000-0000-0000-0000-000000000001'),1,'Leadership RLS isolation: in-scope record is visible');
select is((select count(*)::int from public.leaders where id='21000000-0000-0000-0000-000000000002'),0,'Leadership RLS isolation: outside-scope record is hidden');
select is((select count(*)::int from public.annual_statement_periods where id='22000000-0000-0000-0000-000000000001'),0,'Leadership RLS isolation: Annual Statement secret remains hidden');

-- Legal RLS isolation
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select ok(public.has_permission('legal.view_privileged'), 'Legal RLS isolation: permission is present');
select ok(public.has_compartment('LEGAL_PRIVILEGE'), 'Legal RLS isolation: compartment is present');
select is((select count(*)::int from public.legal_matters where id='23000000-0000-0000-0000-000000000001'),1,'Legal RLS isolation: in-scope record is visible');
select is((select count(*)::int from public.legal_matters where id='23000000-0000-0000-0000-000000000002'),0,'Legal RLS isolation: outside-scope record is hidden');
select is((select count(*)::int from public.intelligence_reports where id='24000000-0000-0000-0000-000000000003'),0,'Legal RLS isolation: Intelligence secret in legal scope remains hidden');

-- Intelligence RLS isolation
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select ok(public.has_permission('intelligence.view_secret'), 'Intelligence RLS isolation: permission is present');
select ok(public.has_compartment('INTELLIGENCE_SECRET'), 'Intelligence RLS isolation: compartment is present');
select is((select count(*)::int from public.intelligence_reports where id='24000000-0000-0000-0000-000000000001'),1,'Intelligence RLS isolation: in-scope record is visible');
select is((select count(*)::int from public.intelligence_reports where id='24000000-0000-0000-0000-000000000002'),0,'Intelligence RLS isolation: outside-scope record is hidden');
select is((select count(*)::int from public.legal_matters where id='23000000-0000-0000-0000-000000000003'),0,'Intelligence RLS isolation: Legal privilege in intelligence scope remains hidden');

-- Annual Statements RLS isolation
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select ok(public.has_permission('annual_statements.view_secret'), 'Annual Statements RLS isolation: permission is present');
select ok(public.has_compartment('ANNUAL_STATEMENT_SECRET'), 'Annual Statements RLS isolation: compartment is present');
select is((select count(*)::int from public.annual_statement_periods where id='22000000-0000-0000-0000-000000000001'),1,'Annual Statements RLS isolation: in-scope record is visible');
select is((select count(*)::int from public.annual_statement_periods where id='22000000-0000-0000-0000-000000000002'),0,'Annual Statements RLS isolation: outside-scope record is hidden');
select is((select count(*)::int from public.leaders where id='21000000-0000-0000-0000-000000000001'),0,'Annual Statements RLS isolation: Leadership restricted record in shared scope remains hidden');

-- Investigator assignment and scope isolation
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
select ok(public.has_permission('investigations.view'), 'Investigator assignment and scope isolation: permission is present');
select ok(public.has_compartment('CONFIDENTIAL'), 'Investigator assignment and scope isolation: CONFIDENTIAL compartment is present');
select is((select count(*)::int from public.investigations where id='26000000-0000-0000-0000-000000000001'),1,'Investigator assignment and scope isolation: assigned in-scope investigation is visible');
select is((select count(*)::int from public.investigations where id='26000000-0000-0000-0000-000000000002'),0,'Investigator assignment and scope isolation: unassigned in-scope investigation is hidden');
select is((select count(*)::int from public.investigations where id='26000000-0000-0000-0000-000000000003'),0,'Investigator assignment and scope isolation: assigned outside-scope investigation is hidden');

-- System Administrator protected-compartment no-bypass
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select ok(public.has_permission('annual_statements.view_secret'), 'System Administrator protected-compartment no-bypass: functional permission is present');
select ok(public.has_scope('leadership'), 'System Administrator protected-compartment no-bypass: organisational scope is present');
select ok(not public.has_compartment('ANNUAL_STATEMENT_SECRET'), 'System Administrator protected-compartment no-bypass: secret compartment is absent');
select is((select count(*)::int from public.annual_statement_periods where id='22000000-0000-0000-0000-000000000001'),0,'System Administrator protected-compartment no-bypass: protected record remains hidden');

select * from finish();
rollback;
