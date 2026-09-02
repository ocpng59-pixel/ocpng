begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '78000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-task10-admin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Task 10 Administrator"}'::jsonb,now(),now()
),
(
  '78000000-0000-0000-0000-000000000062',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-task10-target@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Task 10 Invitation Target"}'::jsonb,now(),now()
);

insert into public.roles (
  id, code, name, description, is_system, is_active, role_type, metadata
) values
(
  '78000000-0000-0000-0000-000000000161',
  'wasdok78_task10_admin',
  'DEMO WASDOK78 Task 10 Administrator',
  'Task 10 security regression administrator role',false,true,'administrative',
  '{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000162',
  'wasdok78_task10_target_role',
  'DEMO WASDOK78 Task 10 Target Role',
  'Task 10 role validation target',false,true,'operational',
  '{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
);

insert into public.user_roles(user_id, role_id, organisation_scope, is_active)
values(
  '78000000-0000-0000-0000-000000000061',
  '78000000-0000-0000-0000-000000000161',
  'DEMO-WASDOK78',
  true
);

insert into public.role_permissions(role_id, permission_id, is_active)
select '78000000-0000-0000-0000-000000000161'::uuid, p.id, true
from public.permissions p
where p.code in ('admin.manage_roles','admin.manage_users');

select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000061',true);

select has_function(
  'private','lock_access_admin_invariant',array[]::text[],
  'Task 10 defines a shared transaction lock for the administrator invariant'
);

select has_function(
  'private','require_valid_role_code',array['text'],
  'Task 10 defines database-side role-code validation'
);

select has_function(
  'public','admin_record_user_invitation',array['uuid','text'],
  'Task 10 defines the audited user invitation RPC'
);

select ok(
  position('PERFORM private.lock_access_admin_invariant()' in pg_get_functiondef('public.admin_set_role_active(uuid,boolean,text)'::regprocedure)) > 0,
  'role deactivation serializes the last-admin invariant'
);

select ok(
  position('PERFORM private.lock_access_admin_invariant()' in pg_get_functiondef('public.admin_revoke_role_permission(uuid,text,text)'::regprocedure)) > 0,
  'role-permission revocation serializes the last-admin invariant'
);

select ok(
  position('PERFORM private.lock_access_admin_invariant()' in pg_get_functiondef('public.admin_revoke_user_role(uuid,uuid,text)'::regprocedure)) > 0,
  'user-role revocation serializes the last-admin invariant'
);

select ok(
  position('PERFORM private.lock_access_admin_invariant()' in pg_get_functiondef('public.admin_set_user_active(uuid,boolean,text)'::regprocedure)) > 0,
  'user suspension serializes the last-admin invariant'
);

select throws_ok(
  $$select public.admin_create_role('INVALID ROLE!','Invalid role','Must be rejected by PostgreSQL','operational','Task 10 invalid role-code test')$$,
  '22023',null,
  'direct RPC role creation rejects malformed role codes'
);

select throws_ok(
  $$select public.admin_update_role('78000000-0000-0000-0000-000000000162','INVALID ROLE!','Invalid role','Must remain unchanged','operational','Task 10 invalid role-code update')$$,
  '22023',null,
  'direct RPC role update rejects malformed role codes'
);

select lives_ok(
  $$select public.admin_record_user_invitation('78000000-0000-0000-0000-000000000062','Invite controlled DEMO Task 10 user')$$,
  'authorized invitation audit recording succeeds'
);

select ok(
  exists(
    select 1
    from public.audit_events
    where actor_id='78000000-0000-0000-0000-000000000061'
      and action='access.user_invited'
      and entity_type='profile'
      and entity_id='78000000-0000-0000-0000-000000000062'
      and reason='Invite controlled DEMO Task 10 user'
      and coalesce(after_data->>'user_id','')='78000000-0000-0000-0000-000000000062'
      and request_metadata->>'source'='access_control_administration'
  ),
  'user invitation produces immutable safe audit evidence'
);

select * from finish();
rollback;
