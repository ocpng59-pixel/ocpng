begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(46);

-- Fictional WASDOK-78 Task 4 identities.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '78000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-user-access-admin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 User Access Administrator"}'::jsonb,now(),now()
),
(
  '78000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-user-access-target@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Target User"}'::jsonb,now(),now()
),
(
  '78000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-user-access-nonadmin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Non Administrator"}'::jsonb,now(),now()
),
(
  '78000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-user-only-admin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 User Only Administrator"}'::jsonb,now(),now()
);

-- Controlled roles for Task 4.
insert into public.roles (
  id, code, name, description, is_system, is_active, role_type, metadata
) values
(
  '78000000-0000-0000-0000-000000000101',
  'wasdok78_task4_functional',
  'DEMO WASDOK78 Task 4 Functional Role',
  'Functional access target role',false,true,'operational','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000102',
  'wasdok78_task4_full_admin',
  'DEMO WASDOK78 Task 4 Full Administrator',
  'Held by Task 4 administrator',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000103',
  'wasdok78_task4_user_admin',
  'DEMO WASDOK78 Task 4 User Administrator',
  'User-management-only administrator',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000104',
  'wasdok78_task4_last_role_admin',
  'DEMO WASDOK78 Task 4 Last Role Administrator',
  'Used to prove anti-lockout on suspension',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
);

insert into public.user_roles(user_id,role_id,organisation_scope,is_active)
values
('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000102','DEMO-WASDOK78',true),
('78000000-0000-0000-0000-000000000004','78000000-0000-0000-0000-000000000103','DEMO-WASDOK78',true);

insert into public.role_permissions(role_id,permission_id,is_active)
select v.role_id, p.id, true
from (values
  ('78000000-0000-0000-0000-000000000101'::uuid,'reports.view'),
  ('78000000-0000-0000-0000-000000000102'::uuid,'admin.manage_users'),
  ('78000000-0000-0000-0000-000000000102'::uuid,'admin.manage_roles'),
  ('78000000-0000-0000-0000-000000000103'::uuid,'admin.manage_users'),
  ('78000000-0000-0000-0000-000000000104'::uuid,'admin.manage_roles')
) as v(role_id, permission_code)
join public.permissions p on p.code=v.permission_code;

-- 1-7: exact Task 4 RPC contract.
select has_function('public','admin_assign_user_role',array['uuid','uuid','text'],'user role assignment RPC exists');
select has_function('public','admin_revoke_user_role',array['uuid','uuid','text'],'user role revocation RPC exists');
select has_function('public','admin_grant_data_scope',array['uuid','text','text','text'],'data scope grant RPC exists');
select has_function('public','admin_revoke_data_scope',array['uuid','text','text'],'data scope revoke RPC exists');
select has_function('public','admin_grant_user_compartment',array['uuid','text','text'],'user compartment grant RPC exists');
select has_function('public','admin_revoke_user_compartment',array['uuid','text','text'],'user compartment revoke RPC exists');
select has_function('public','admin_set_user_active',array['uuid','boolean','text'],'user active-status RPC exists');

select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);

-- 8: authorized dual-permission administrator assigns a role.
select lives_ok(
  $$select public.admin_assign_user_role('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000101','Assign DEMO reporting role')$$,
  'authorized administrator assigns a user role'
);

-- 9: one active authoritative assignment plus one immutable audit event.
select ok(
  (select count(*) from public.user_roles
   where user_id='78000000-0000-0000-0000-000000000002'
     and role_id='78000000-0000-0000-0000-000000000101'
     and is_active
     and assigned_by='78000000-0000-0000-0000-000000000001'
     and revoked_at is null)=1
  and
  (select count(*) from public.audit_events ae
   where ae.action='access.user_role_assigned'
     and ae.entity_type='user_role'
     and ae.entity_id=(select id from public.user_roles
                       where user_id='78000000-0000-0000-0000-000000000002'
                         and role_id='78000000-0000-0000-0000-000000000101'))=1,
  'role assignment persists one active row and one audit event'
);

-- 10: permission takes effect immediately for target user.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000002',true);
select ok(public.has_permission('reports.view'),'assigned role changes has_permission immediately');
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);

-- 11: duplicate active assignment is rejected.
select throws_ok(
  $$select public.admin_assign_user_role('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000101','Duplicate DEMO role assignment')$$,
  '23505',null,'duplicate active user role assignment is rejected'
);

-- 12: administrator cannot change their own role assignments.
select throws_ok(
  $$select public.admin_assign_user_role('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000101','Attempt self role assignment')$$,
  '42501',null,'administrator cannot assign a role to self'
);

-- 13: admin.manage_users without admin.manage_roles is insufficient for role assignment.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000004',true);
select throws_ok(
  $$select public.admin_assign_user_role('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000101','Attempt role assignment without role authority')$$,
  '42501',null,'role assignment requires both user and role administration authority'
);

-- 14: non-administrator cannot assign roles.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000003',true);
select throws_ok(
  $$select public.admin_assign_user_role('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000101','Unauthorized role assignment')$$,
  '42501',null,'non-administrator cannot assign user roles'
);

-- 15: administrative reason must meet the approved minimum length.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.admin_revoke_user_role('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000101','x')$$,
  '22023',null,'short administrative reason is rejected'
);

-- 16: authorized role revocation succeeds.
select lives_ok(
  $$select public.admin_revoke_user_role('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000101','Revoke DEMO reporting role')$$,
  'authorized administrator revokes a user role'
);

-- 17: compatibility amendment retains one inactive row and audits revocation.
select ok(
  (select count(*) from public.user_roles
   where user_id='78000000-0000-0000-0000-000000000002'
     and role_id='78000000-0000-0000-0000-000000000101')=1
  and
  (select count(*) from public.user_roles
   where user_id='78000000-0000-0000-0000-000000000002'
     and role_id='78000000-0000-0000-0000-000000000101'
     and not is_active and revoked_at is not null
     and revoked_by='78000000-0000-0000-0000-000000000001')=1
  and
  (select count(*) from public.audit_events ae
   where ae.action='access.user_role_revoked'
     and ae.entity_id=(select id from public.user_roles
                       where user_id='78000000-0000-0000-0000-000000000002'
                         and role_id='78000000-0000-0000-0000-000000000101'))=1,
  'role revocation retains one inactive row and one audit event'
);

-- 18: permission is removed immediately.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000002',true);
select ok(not public.has_permission('reports.view'),'revoked user role changes has_permission immediately');

-- 19: self-role revocation is prohibited.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.admin_revoke_user_role('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000102','Attempt self role revocation')$$,
  '42501',null,'administrator cannot revoke a role from self'
);

-- 20-21: re-assignment reactivates the same authoritative row and appends audit history.
select lives_ok(
  $$select public.admin_assign_user_role('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000101','Reassign DEMO reporting role')$$,
  'reassignment reactivates a previously revoked user role row'
);
select ok(
  (select count(*) from public.user_roles
   where user_id='78000000-0000-0000-0000-000000000002'
     and role_id='78000000-0000-0000-0000-000000000101')=1
  and
  (select count(*) from public.user_roles
   where user_id='78000000-0000-0000-0000-000000000002'
     and role_id='78000000-0000-0000-0000-000000000101'
     and is_active and revoked_at is null and revoked_by is null)=1
  and
  (select count(*) from public.audit_events ae
   where ae.action='access.user_role_assigned'
     and ae.entity_id=(select id from public.user_roles
                       where user_id='78000000-0000-0000-0000-000000000002'
                         and role_id='78000000-0000-0000-0000-000000000101'))=2,
  'reassignment keeps one user-role row and appends a second assignment audit event'
);

-- 22: admin.manage_users is sufficient to grant a data scope.
select lives_ok(
  $$select public.admin_grant_data_scope('78000000-0000-0000-0000-000000000002','DEMO-TASK4-SCOPE','organisation','Grant DEMO organisation scope')$$,
  'authorized administrator grants a data scope'
);

-- 23: scope state and audit evidence are persisted.
select ok(
  (select count(*) from public.data_scopes
   where user_id='78000000-0000-0000-0000-000000000002'
     and scope_code='DEMO-TASK4-SCOPE' and active
     and granted_by='78000000-0000-0000-0000-000000000001'
     and revoked_at is null)=1
  and
  (select count(*) from public.audit_events ae
   where ae.action='access.scope_granted'
     and ae.entity_type='data_scope'
     and ae.entity_id=(select id from public.data_scopes
                       where user_id='78000000-0000-0000-0000-000000000002'
                         and scope_code='DEMO-TASK4-SCOPE'))=1,
  'scope grant persists one active row and one audit event'
);

-- 24: scope takes effect immediately.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000002',true);
select ok(public.has_scope('DEMO-TASK4-SCOPE'),'granted scope changes has_scope immediately');

-- 25: self-scope grant is prohibited.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.admin_grant_data_scope('78000000-0000-0000-0000-000000000001','DEMO-SELF-SCOPE','organisation','Attempt self scope grant')$$,
  '42501',null,'administrator cannot grant a scope to self'
);

-- 26: authorized scope revocation succeeds.
select lives_ok(
  $$select public.admin_revoke_data_scope('78000000-0000-0000-0000-000000000002','DEMO-TASK4-SCOPE','Revoke DEMO organisation scope')$$,
  'authorized administrator revokes a data scope'
);

-- 27: scope remains as inactive history and is audited.
select ok(
  (select count(*) from public.data_scopes
   where user_id='78000000-0000-0000-0000-000000000002'
     and scope_code='DEMO-TASK4-SCOPE')=1
  and
  (select count(*) from public.data_scopes
   where user_id='78000000-0000-0000-0000-000000000002'
     and scope_code='DEMO-TASK4-SCOPE' and not active
     and revoked_at is not null
     and revoked_by='78000000-0000-0000-0000-000000000001')=1
  and
  (select count(*) from public.audit_events ae
   where ae.action='access.scope_revoked'
     and ae.entity_id=(select id from public.data_scopes
                       where user_id='78000000-0000-0000-0000-000000000002'
                         and scope_code='DEMO-TASK4-SCOPE'))=1,
  'scope revocation retains one inactive row and one audit event'
);

-- 28: revoked scope stops authorizing immediately.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000002',true);
select ok(not public.has_scope('DEMO-TASK4-SCOPE'),'revoked scope changes has_scope immediately');

-- 29: self-scope revocation is prohibited even before assignment lookup.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.admin_revoke_data_scope('78000000-0000-0000-0000-000000000001','DEMO-SELF-SCOPE','Attempt self scope revocation')$$,
  '42501',null,'administrator cannot revoke a scope from self'
);

-- 30: authorized dual-permission administrator grants a compartment.
select lives_ok(
  $$select public.admin_grant_user_compartment('78000000-0000-0000-0000-000000000002','RESTRICTED','Grant DEMO restricted compartment')$$,
  'authorized administrator grants a user compartment'
);

-- 31: compartment state and audit evidence are persisted.
select ok(
  (select count(*) from public.user_compartments uc
   join public.security_compartments sc on sc.id=uc.compartment_id
   where uc.user_id='78000000-0000-0000-0000-000000000002'
     and sc.code='RESTRICTED' and uc.is_active
     and uc.granted_by='78000000-0000-0000-0000-000000000001'
     and uc.revoked_at is null)=1
  and
  (select count(*) from public.audit_events ae
   where ae.action='access.compartment_granted'
     and ae.entity_type='user_compartment'
     and ae.entity_id=(select uc.id from public.user_compartments uc
                       join public.security_compartments sc on sc.id=uc.compartment_id
                       where uc.user_id='78000000-0000-0000-0000-000000000002'
                         and sc.code='RESTRICTED'))=1,
  'compartment grant persists one active row and one audit event'
);

-- 32: compartment takes effect immediately.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000002',true);
select ok(public.has_compartment('RESTRICTED'),'granted compartment changes has_compartment immediately');

-- 33: self-compartment grant is prohibited.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.admin_grant_user_compartment('78000000-0000-0000-0000-000000000001','RESTRICTED','Attempt self compartment grant')$$,
  '42501',null,'administrator cannot grant a compartment to self'
);

-- 34: unknown compartment codes are rejected.
select throws_ok(
  $$select public.admin_grant_user_compartment('78000000-0000-0000-0000-000000000002','NOT_A_REAL_COMPARTMENT','Attempt unknown compartment')$$,
  '22023',null,'unknown compartment code is rejected'
);

-- 35: authorized compartment revocation succeeds.
select lives_ok(
  $$select public.admin_revoke_user_compartment('78000000-0000-0000-0000-000000000002','RESTRICTED','Revoke DEMO restricted compartment')$$,
  'authorized administrator revokes a user compartment'
);

-- 36: compartment remains as inactive history and is audited.
select ok(
  (select count(*) from public.user_compartments uc
   join public.security_compartments sc on sc.id=uc.compartment_id
   where uc.user_id='78000000-0000-0000-0000-000000000002'
     and sc.code='RESTRICTED')=1
  and
  (select count(*) from public.user_compartments uc
   join public.security_compartments sc on sc.id=uc.compartment_id
   where uc.user_id='78000000-0000-0000-0000-000000000002'
     and sc.code='RESTRICTED' and not uc.is_active
     and uc.revoked_at is not null
     and uc.revoked_by='78000000-0000-0000-0000-000000000001')=1
  and
  (select count(*) from public.audit_events ae
   where ae.action='access.compartment_revoked'
     and ae.entity_id=(select uc.id from public.user_compartments uc
                       join public.security_compartments sc on sc.id=uc.compartment_id
                       where uc.user_id='78000000-0000-0000-0000-000000000002'
                         and sc.code='RESTRICTED'))=1,
  'compartment revocation retains one inactive row and one audit event'
);

-- 37: revoked compartment stops authorizing immediately.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000002',true);
select ok(not public.has_compartment('RESTRICTED'),'revoked compartment changes has_compartment immediately');

-- 38: self-compartment revocation is prohibited.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.admin_revoke_user_compartment('78000000-0000-0000-0000-000000000001','RESTRICTED','Attempt self compartment revocation')$$,
  '42501',null,'administrator cannot revoke a compartment from self'
);

-- 39: authorized user suspension succeeds.
select lives_ok(
  $$select public.admin_set_user_active('78000000-0000-0000-0000-000000000002',false,'Suspend DEMO target user')$$,
  'authorized administrator suspends a target user'
);

-- 40: profile is inactive and suspension is audited.
select ok(
  (select not is_active from public.profiles where id='78000000-0000-0000-0000-000000000002')
  and
  (select count(*) from public.audit_events
   where action='access.user_suspended'
     and entity_type='profile'
     and entity_id='78000000-0000-0000-0000-000000000002')=1,
  'suspension persists inactive profile state and one audit event'
);

-- 41: suspension immediately fails authorization primitives.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000002',true);
select ok(
  not public.has_permission('reports.view')
  and not public.has_scope(null)
  and not public.has_compartment('INTERNAL'),
  'suspended profile immediately loses permission scope and compartment authorization'
);

-- 42: self active-status change is prohibited.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000001',true);
select throws_ok(
  $$select public.admin_set_user_active('78000000-0000-0000-0000-000000000001',false,'Attempt self suspension')$$,
  '42501',null,'administrator cannot change own active status'
);

-- 43: authorized reactivation succeeds.
select lives_ok(
  $$select public.admin_set_user_active('78000000-0000-0000-0000-000000000002',true,'Reactivate DEMO target user')$$,
  'authorized administrator reactivates a target user'
);

-- 44: active state, audit and effective permission return.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000002',true);
select ok(
  (select is_active from public.profiles where id='78000000-0000-0000-0000-000000000002')
  and public.has_permission('reports.view')
  and
  (select count(*) from public.audit_events
   where action='access.user_activated'
     and entity_id='78000000-0000-0000-0000-000000000002')=1,
  'reactivation restores active state and effective authorization with audit evidence'
);

-- Configure a state where target 002 is the only effective role administrator,
-- while actor 004 has only admin.manage_users and is therefore allowed to manage status.
insert into public.user_roles(user_id,role_id,organisation_scope,is_active)
values('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000104','DEMO-WASDOK78',true);
update public.user_roles
set is_active=false, revoked_at=now()
where user_id='78000000-0000-0000-0000-000000000001'
  and role_id='78000000-0000-0000-0000-000000000102';

-- 45: suspending the final effective role administrator is blocked atomically.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000004',true);
select throws_ok(
  $$select public.admin_set_user_active('78000000-0000-0000-0000-000000000002',false,'Attempt suspension of final role administrator')$$,
  '23514',null,'last role administrator safeguard blocks suspension'
);

-- 46: rejected suspension rolls back the candidate profile mutation.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000002',true);
select ok(
  (select is_active from public.profiles where id='78000000-0000-0000-0000-000000000002')
  and public.has_permission('admin.manage_roles'),
  'failed last-admin suspension leaves target active and authorized'
);

select * from finish();
rollback;
