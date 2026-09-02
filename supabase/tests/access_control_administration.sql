begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

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

-- 24: the fixture remains transaction-contained and is rolled back below.
select pass('WASDOK-78 lifecycle authorization transaction completes');

select * from finish();
rollback;
