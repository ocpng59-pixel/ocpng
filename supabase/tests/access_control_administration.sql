begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(44);

-- 1-7: lifecycle schema contract.
select has_column('public', 'roles', 'is_active', 'roles has is_active');
select has_column('public', 'roles', 'role_type', 'roles has role_type');
select has_column('public', 'roles', 'deleted_at', 'roles has deleted_at');
select has_column('public', 'user_roles', 'is_active', 'user_roles has is_active');
select has_column('public', 'role_permissions', 'is_active', 'role_permissions has is_active');
select has_column('public', 'data_scopes', 'revoked_at', 'data_scopes has revoked_at');
select has_column('public', 'user_compartments', 'is_active', 'user_compartments has is_active');

-- 8: auth identity synchronizes to the application profile.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '78000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'wasdok78-admin@test.invalid',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Role/User Admin"}'::jsonb,
  now(),
  now()
);

select is(
  (select count(*)::int from public.profiles where id='78000000-0000-0000-0000-000000000001'),
  1,
  'auth user creation synchronizes a profile'
);

-- Deterministic lifecycle fixtures for assertions 9-23.
insert into public.roles (
  id, code, name, description, is_system, is_active, role_type, metadata
) values (
  '78000000-0000-0000-0000-000000000101',
  'wasdok78_lifecycle_role',
  'DEMO WASDOK78 Lifecycle Role',
  'Fictional lifecycle authorization fixture',
  false,
  true,
  'operational',
  '{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
);

insert into public.permissions (code, name, domain, metadata)
values (
  'wasdok78.lifecycle.test',
  'DEMO WASDOK78 Lifecycle Permission',
  'Administration',
  '{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
);

insert into public.user_roles (user_id, role_id, organisation_scope, is_active)
values (
  '78000000-0000-0000-0000-000000000001',
  '78000000-0000-0000-0000-000000000101',
  'DEMO-WASDOK78',
  true
);

insert into public.role_permissions (role_id, permission_id, is_active)
select
  '78000000-0000-0000-0000-000000000101',
  p.id,
  true
from public.permissions p
where p.code='wasdok78.lifecycle.test';

insert into public.data_scopes (user_id, scope_code, scope_type, active)
values (
  '78000000-0000-0000-0000-000000000001',
  'DEMO-WASDOK78',
  'organisation',
  true
);

insert into public.security_compartments (code, name, description)
values ('CONFIDENTIAL', 'Confidential', 'DEMO WASDOK78 restricted compartment')
on conflict (code) do update set name=excluded.name;

insert into public.user_compartments (user_id, compartment_id, is_active)
select
  '78000000-0000-0000-0000-000000000001',
  sc.id,
  true
from public.security_compartments sc
where sc.code='CONFIDENTIAL'
on conflict (user_id, compartment_id) do update set is_active=true, revoked_at=null, revoked_by=null;

select set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000001', true);

-- 9: all lifecycle links active.
select ok(
  public.has_permission('wasdok78.lifecycle.test'),
  'active profile role assignment and permission grant authorize permission'
);

-- 10: inactive profile fails permission authorization.
update public.profiles set is_active=false where id='78000000-0000-0000-0000-000000000001';
select ok(
  not public.has_permission('wasdok78.lifecycle.test'),
  'inactive profile fails permission authorization'
);
update public.profiles set is_active=true where id='78000000-0000-0000-0000-000000000001';

-- 11: inactive role fails permission authorization.
update public.roles set is_active=false where id='78000000-0000-0000-0000-000000000101';
select ok(
  not public.has_permission('wasdok78.lifecycle.test'),
  'inactive role fails permission authorization'
);
update public.roles set is_active=true where id='78000000-0000-0000-0000-000000000101';

-- 12: retired role fails permission authorization.
update public.roles set deleted_at=now() where id='78000000-0000-0000-0000-000000000101';
select ok(
  not public.has_permission('wasdok78.lifecycle.test'),
  'retired role fails permission authorization'
);
update public.roles set deleted_at=null where id='78000000-0000-0000-0000-000000000101';

-- 13: revoked user-role fails permission authorization.
update public.user_roles
set is_active=false, revoked_at=now()
where user_id='78000000-0000-0000-0000-000000000001'
  and role_id='78000000-0000-0000-0000-000000000101';
select ok(
  not public.has_permission('wasdok78.lifecycle.test'),
  'revoked user role fails permission authorization'
);
update public.user_roles
set is_active=true, revoked_at=null, revoked_by=null
where user_id='78000000-0000-0000-0000-000000000001'
  and role_id='78000000-0000-0000-0000-000000000101';

-- 14: revoked role-permission fails permission authorization.
update public.role_permissions rp
set is_active=false, revoked_at=now()
from public.permissions p
where rp.permission_id=p.id
  and rp.role_id='78000000-0000-0000-0000-000000000101'
  and p.code='wasdok78.lifecycle.test';
select ok(
  not public.has_permission('wasdok78.lifecycle.test'),
  'revoked role permission fails permission authorization'
);
update public.role_permissions rp
set is_active=true, revoked_at=null, revoked_by=null
from public.permissions p
where rp.permission_id=p.id
  and rp.role_id='78000000-0000-0000-0000-000000000101'
  and p.code='wasdok78.lifecycle.test';

-- 15: active matching scope authorizes.
select ok(
  public.has_scope('DEMO-WASDOK78'),
  'active matching scope authorizes'
);

-- 16: revoked scope fails.
update public.data_scopes
set active=false, revoked_at=now()
where user_id='78000000-0000-0000-0000-000000000001'
  and scope_code='DEMO-WASDOK78';
select ok(
  not public.has_scope('DEMO-WASDOK78'),
  'revoked scope fails authorization'
);

-- 17: wildcard active scope authorizes.
insert into public.data_scopes (user_id, scope_code, scope_type, active)
values (
  '78000000-0000-0000-0000-000000000001',
  '*',
  'organisation',
  true
);
select ok(
  public.has_scope('DEMO-WASDOK78'),
  'wildcard active scope authorizes'
);

-- 18: inactive profile fails scope authorization even with wildcard.
update public.profiles set is_active=false where id='78000000-0000-0000-0000-000000000001';
select ok(
  not public.has_scope('DEMO-WASDOK78'),
  'inactive profile fails scope authorization'
);
update public.profiles set is_active=true where id='78000000-0000-0000-0000-000000000001';

-- 19-20: baseline classifications remain accessible only for active profiles.
select ok(
  public.has_compartment('PUBLIC'),
  'PUBLIC compartment authorizes for active profile'
);
select ok(
  public.has_compartment('INTERNAL'),
  'INTERNAL compartment authorizes for active profile'
);

-- 21: active restricted compartment authorizes.
select ok(
  public.has_compartment('CONFIDENTIAL'),
  'active restricted user compartment authorizes'
);

-- 22: revoked restricted compartment fails.
update public.user_compartments uc
set is_active=false, revoked_at=now()
from public.security_compartments sc
where uc.compartment_id=sc.id
  and uc.user_id='78000000-0000-0000-0000-000000000001'
  and sc.code='CONFIDENTIAL';
select ok(
  not public.has_compartment('CONFIDENTIAL'),
  'revoked restricted user compartment fails authorization'
);

-- Restore compartment, then prove inactive profile also fails it.
update public.user_compartments uc
set is_active=true, revoked_at=null, revoked_by=null
from public.security_compartments sc
where uc.compartment_id=sc.id
  and uc.user_id='78000000-0000-0000-0000-000000000001'
  and sc.code='CONFIDENTIAL';

-- 23: inactive profile fails restricted compartment authorization.
update public.profiles set is_active=false where id='78000000-0000-0000-0000-000000000001';
select ok(
  not public.has_compartment('CONFIDENTIAL'),
  'inactive profile fails restricted compartment authorization'
);
update public.profiles set is_active=true where id='78000000-0000-0000-0000-000000000001';

-- 24: the lifecycle fixture remains valid before privileged role administration tests.
select pass('WASDOK-78 lifecycle authorization transaction completes');

-- Task 2 fixtures: fictional privileged and non-privileged users plus controlled roles.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '78000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-role-admin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Role Administrator"}'::jsonb,now(),now()
),
(
  '78000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-non-admin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Non Administrator"}'::jsonb,now(),now()
);

insert into public.roles (
  id, code, name, description, is_system, is_active, role_type, metadata
) values
(
  '78000000-0000-0000-0000-000000000201',
  'wasdok78_role_101',
  'DEMO WASDOK78 Role 101',
  'Role lifecycle target',
  false,true,'operational','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000202',
  'wasdok78_admin_role',
  'DEMO WASDOK78 Administrative Role',
  'Role held by the fictional test administrator',
  false,true,'administrative','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000203',
  'wasdok78_retire_assigned',
  'DEMO WASDOK78 Assigned Retirement Role',
  'Must not retire while actively assigned',
  false,true,'operational','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000204',
  'wasdok78_retire_free',
  'DEMO WASDOK78 Free Retirement Role',
  'Can be logically retired',
  false,true,'operational','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
);

insert into public.user_roles (user_id, role_id, organisation_scope, is_active)
values
('78000000-0000-0000-0000-000000000010','78000000-0000-0000-0000-000000000202','DEMO-WASDOK78',true),
('78000000-0000-0000-0000-000000000011','78000000-0000-0000-0000-000000000203','DEMO-WASDOK78',true);

insert into public.role_permissions (role_id, permission_id, is_active)
select '78000000-0000-0000-0000-000000000202', p.id, true
from public.permissions p
where p.code='admin.manage_roles';

-- 25-28: exact privileged role lifecycle RPC contract.
select has_function('public','admin_create_role',array['text','text','text','text','text'],'role creation RPC exists');
select has_function('public','admin_update_role',array['uuid','text','text','text','text','text'],'role update RPC exists');
select has_function('public','admin_set_role_active',array['uuid','boolean','text'],'role activation RPC exists');
select has_function('public','admin_retire_role',array['uuid','text'],'role retirement RPC exists');

select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000010',true);

-- 29: authorized role creation.
select lives_ok(
  $$select public.admin_create_role('wasdok78_demo_role','DEMO WASDOK78 Configurable Role','Created through audited role administration','training','Create controlled DEMO training role')$$,
  'authorized administrator creates a configurable role'
);

-- 30: created state and audit evidence.
select ok(
  (select count(*) from public.roles where code='wasdok78_demo_role' and name='DEMO WASDOK78 Configurable Role' and role_type='training' and is_active and deleted_at is null)=1
  and
  (select count(*) from public.audit_events where action='access.role_created' and entity_type='role' and entity_id=(select id from public.roles where code='wasdok78_demo_role'))=1,
  'role creation persists one active role and one immutable audit event'
);

-- 31-32: non-administrator cannot create a role and leaves no row.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000011',true);
select throws_ok(
  $$select public.admin_create_role('wasdok78_forbidden_role','Forbidden DEMO Role','Must not be created','operational','Unauthorized role creation attempt')$$,
  '42501',null,'non-administrator role creation is denied'
);
select is(
  (select count(*)::int from public.roles where code='wasdok78_forbidden_role'),
  0,
  'denied role creation leaves no role row'
);
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000010',true);

-- 33-34: role codes remain globally reserved, including after logical retirement.
select throws_ok(
  $$select public.admin_create_role('wasdok78_demo_role','Duplicate DEMO Role','Duplicate code must fail','training','Attempt duplicate role code')$$,
  '23505',null,'duplicate role code is rejected'
);
select ok(
  (select count(*) from public.roles where code='wasdok78_demo_role')=1
  and (select name from public.roles where code='wasdok78_demo_role')='DEMO WASDOK78 Configurable Role',
  'duplicate rejection leaves the original role unchanged'
);

-- 35-36: administrator can update an unheld role, with audit evidence.
select lives_ok(
  $$select public.admin_update_role('78000000-0000-0000-0000-000000000201','wasdok78_role_101_updated','DEMO WASDOK78 Role 101 Updated','Updated through audited administration','training','Update configurable role details')$$,
  'administrator updates an unheld role'
);
select ok(
  (select count(*) from public.roles where id='78000000-0000-0000-0000-000000000201' and code='wasdok78_role_101_updated' and name='DEMO WASDOK78 Role 101 Updated' and role_type='training')=1
  and (select count(*) from public.audit_events where action='access.role_updated' and entity_id='78000000-0000-0000-0000-000000000201')=1,
  'role update persists approved fields and one audit event'
);

-- 37: held-role self-protection blocks role mutation.
select throws_ok(
  $$select public.admin_update_role('78000000-0000-0000-0000-000000000202','wasdok78_admin_role_changed','Changed held role','Must be denied','administrative','Attempt to change own held role')$$,
  '42501',null,'administrator cannot update a role they currently hold'
);

-- 38-41: activate/deactivate lifecycle and audit evidence.
select lives_ok(
  $$select public.admin_set_role_active('78000000-0000-0000-0000-000000000201',false,'Temporarily deactivate configurable DEMO role')$$,
  'administrator deactivates an unheld role'
);
select ok(
  (select not is_active and deactivated_at is not null from public.roles where id='78000000-0000-0000-0000-000000000201')
  and (select count(*) from public.audit_events where action='access.role_deactivated' and entity_id='78000000-0000-0000-0000-000000000201')=1,
  'deactivation takes effect and is audited'
);
select lives_ok(
  $$select public.admin_set_role_active('78000000-0000-0000-0000-000000000201',true,'Reactivate configurable DEMO role')$$,
  'administrator reactivates an unheld role'
);
select ok(
  (select is_active and deactivated_at is null from public.roles where id='78000000-0000-0000-0000-000000000201')
  and (select count(*) from public.audit_events where action='access.role_activated' and entity_id='78000000-0000-0000-0000-000000000201')=1,
  'reactivation takes effect and is audited'
);

-- 42: held-role self-protection also blocks activation changes.
select throws_ok(
  $$select public.admin_set_role_active('78000000-0000-0000-0000-000000000202',false,'Attempt to deactivate own held role')$$,
  '42501',null,'administrator cannot deactivate a role they currently hold'
);

-- 43: retirement rejects any role with an active user assignment.
select throws_ok(
  $$select public.admin_retire_role('78000000-0000-0000-0000-000000000203','Attempt retirement while role is actively assigned')$$,
  '23514',null,'role with an active assignment cannot be retired'
);

-- 44: unassigned retirement is logical, retained and audited; no DELETE occurs.
select lives_ok(
  $test$do $body$
  begin
    perform public.admin_retire_role('78000000-0000-0000-0000-000000000204','Retire unused configurable DEMO role');
    if not exists(
      select 1 from public.roles
      where id='78000000-0000-0000-0000-000000000204'
        and not is_active
        and deleted_at is not null
        and deleted_by='78000000-0000-0000-0000-000000000010'
    ) then
      raise exception 'retired role was not retained with logical deletion state';
    end if;
    if (select count(*) from public.audit_events where action='access.role_retired' and entity_id='78000000-0000-0000-0000-000000000204') <> 1 then
      raise exception 'retirement audit event missing';
    end if;
  end
  $body$;$test$,
  'unassigned role is logically retired, retained and audited'
);

select * from finish();
rollback;
