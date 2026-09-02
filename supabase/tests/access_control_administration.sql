begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

select has_column('public', 'roles', 'is_active', 'roles has is_active');
select has_column('public', 'roles', 'role_type', 'roles has role_type');
select has_column('public', 'roles', 'deleted_at', 'roles has deleted_at');
select has_column('public', 'user_roles', 'is_active', 'user_roles has is_active');
select has_column('public', 'role_permissions', 'is_active', 'role_permissions has is_active');
select has_column('public', 'data_scopes', 'revoked_at', 'data_scopes has revoked_at');
select has_column('public', 'user_compartments', 'is_active', 'user_compartments has is_active');

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

select * from finish();
rollback;
