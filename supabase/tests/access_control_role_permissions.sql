begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

-- Fictional Task 3 identities.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '78000000-0000-0000-0000-000000000310',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-permission-admin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Permission Administrator"}'::jsonb,now(),now()
),
(
  '78000000-0000-0000-0000-000000000311',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-permission-target@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Permission Target"}'::jsonb,now(),now()
),
(
  '78000000-0000-0000-0000-000000000312',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-permission-nonadmin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Permission Non Admin"}'::jsonb,now(),now()
),
(
  '78000000-0000-0000-0000-000000000313',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-user-admin-holder@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 User Admin Holder"}'::jsonb,now(),now()
);

insert into public.roles (
  id, code, name, description, is_system, is_active, role_type, metadata
) values
(
  '78000000-0000-0000-0000-000000000320',
  'wasdok78_permission_admin_role',
  'DEMO WASDOK78 Permission Admin Role',
  'Held by Task 3 administrator',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000321',
  'wasdok78_permission_target_role',
  'DEMO WASDOK78 Permission Target Role',
  'Role whose functional permissions are configurable',false,true,'operational','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000322',
  'wasdok78_last_user_admin_role',
  'DEMO WASDOK78 Last User Admin Role',
  'Sole admin.manage_users path for invariant testing',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000323',
  'wasdok78_last_role_admin_guard',
  'DEMO WASDOK78 Last Role Admin Guard Role',
  'Sole admin.manage_roles path for helper invariant testing',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
);

insert into public.permissions(code,name,domain,metadata) values
('wasdok78.permission.test','DEMO WASDOK78 Configurable Permission','Administration','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb)
on conflict(code) do nothing;

insert into public.user_roles(user_id,role_id,organisation_scope,is_active) values
('78000000-0000-0000-0000-000000000310','78000000-0000-0000-0000-000000000320','DEMO-WASDOK78',true),
('78000000-0000-0000-0000-000000000311','78000000-0000-0000-0000-000000000321','DEMO-WASDOK78',true),
('78000000-0000-0000-0000-000000000313','78000000-0000-0000-0000-000000000322','DEMO-WASDOK78',true);

insert into public.role_permissions(role_id,permission_id,is_active)
select '78000000-0000-0000-0000-000000000320',p.id,true
from public.permissions p where p.code='admin.manage_roles';

insert into public.role_permissions(role_id,permission_id,is_active)
select '78000000-0000-0000-0000-000000000322',p.id,true
from public.permissions p where p.code='admin.manage_users';

-- 1-2: exact public Task 3 RPC contract.
select has_function('public','admin_grant_role_permission',array['uuid','text','text'],'role permission grant RPC exists');
select has_function('public','admin_revoke_role_permission',array['uuid','text','text'],'role permission revoke RPC exists');

select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000310',true);

-- 3: approved permission grant succeeds.
select lives_ok(
  $$select public.admin_grant_role_permission('78000000-0000-0000-0000-000000000321','wasdok78.permission.test','Grant DEMO functional permission')$$,
  'authorized administrator grants an approved permission'
);

-- 4: grant persists active authoritative row and one audit event.
select ok(
  (select count(*) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id='78000000-0000-0000-0000-000000000321' and p.code='wasdok78.permission.test'
     and rp.is_active and rp.granted_by='78000000-0000-0000-0000-000000000310' and rp.revoked_at is null)=1
  and
  (select count(*) from public.audit_events ae where ae.action='access.role_permission_granted'
   and ae.entity_type='role_permission'
   and ae.entity_id=(select rp.id from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
                     where rp.role_id='78000000-0000-0000-0000-000000000321' and p.code='wasdok78.permission.test'))=1,
  'grant persists one active authoritative row and one audit event'
);

-- 5: granted permission is effective immediately for a user holding the target role.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000311',true);
select ok(public.has_permission('wasdok78.permission.test'),'grant changes has_permission immediately');
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000310',true);

-- 6: unknown permission codes are not inventable through the administration RPC.
select throws_ok(
  $$select public.admin_grant_role_permission('78000000-0000-0000-0000-000000000321','wasdok78.permission.unknown','Attempt unknown permission grant')$$,
  '22023',null,'unknown permission code is rejected'
);

-- 7: duplicate active grant is rejected rather than silently duplicating state.
select throws_ok(
  $$select public.admin_grant_role_permission('78000000-0000-0000-0000-000000000321','wasdok78.permission.test','Attempt duplicate active permission grant')$$,
  '23505',null,'duplicate active role permission grant is rejected'
);

-- 8: an administrator cannot alter permissions on a role they currently hold.
select throws_ok(
  $$select public.admin_grant_role_permission('78000000-0000-0000-0000-000000000320','admin.manage_users','Attempt grant on held role')$$,
  '42501',null,'administrator cannot grant permissions on a held role'
);

-- 9: approved revoke succeeds.
select lives_ok(
  $$select public.admin_revoke_role_permission('78000000-0000-0000-0000-000000000321','wasdok78.permission.test','Revoke DEMO functional permission')$$,
  'authorized administrator revokes an approved permission'
);

-- 10: compatibility amendment keeps one authoritative row, inactive, and audits the revoke.
select ok(
  (select count(*) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id='78000000-0000-0000-0000-000000000321' and p.code='wasdok78.permission.test')=1
  and
  (select count(*) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id='78000000-0000-0000-0000-000000000321' and p.code='wasdok78.permission.test'
     and not rp.is_active and rp.revoked_at is not null and rp.revoked_by='78000000-0000-0000-0000-000000000310')=1
  and
  (select count(*) from public.audit_events ae where ae.action='access.role_permission_revoked'
   and ae.entity_id=(select rp.id from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
                     where rp.role_id='78000000-0000-0000-0000-000000000321' and p.code='wasdok78.permission.test'))=1,
  'revoke preserves one inactive authoritative row and one immutable audit event'
);

-- 11: revoked permission stops authorizing immediately.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000311',true);
select ok(not public.has_permission('wasdok78.permission.test'),'revoke changes has_permission immediately');
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000310',true);

-- 12: re-grant reactivates the same row; history remains in audit_events.
select lives_ok(
  $$select public.admin_grant_role_permission('78000000-0000-0000-0000-000000000321','wasdok78.permission.test','Re-grant DEMO functional permission')$$,
  're-grant reactivates a previously revoked authoritative row'
);
select ok(
  (select count(*) from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id='78000000-0000-0000-0000-000000000321' and p.code='wasdok78.permission.test')=1
  and
  (select bool_and(rp.is_active and rp.revoked_at is null and rp.revoked_by is null)
   from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
   where rp.role_id='78000000-0000-0000-0000-000000000321' and p.code='wasdok78.permission.test')
  and
  (select count(*) from public.audit_events ae where ae.action='access.role_permission_granted'
   and ae.entity_id=(select rp.id from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
                     where rp.role_id='78000000-0000-0000-0000-000000000321' and p.code='wasdok78.permission.test'))=2,
  're-grant keeps one row and appends a second grant audit event'
);

-- 13: held-role protection also blocks revocation.
select throws_ok(
  $$select public.admin_revoke_role_permission('78000000-0000-0000-0000-000000000320','admin.manage_roles','Attempt revoke on held role')$$,
  '42501',null,'administrator cannot revoke permissions on a held role'
);

-- 14: the only admin.manage_users path cannot be removed.
select throws_ok(
  $$select public.admin_revoke_role_permission('78000000-0000-0000-0000-000000000322','admin.manage_users','Attempt removal of final user administrator')$$,
  '23514',null,'removing the final admin.manage_users path is rejected'
);
select ok(
  exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id
         where rp.role_id='78000000-0000-0000-0000-000000000322' and p.code='admin.manage_users' and rp.is_active),
  'failed final-user-admin revoke rolls back the candidate mutation'
);

-- 15: the last-role-admin invariant is independently enforced by the database guard.
-- Temporarily remove the Task 3 caller path and make role 323 the only effective role-admin path.
update public.role_permissions rp set is_active=false, revoked_at=now()
from public.permissions p
where rp.permission_id=p.id and rp.role_id='78000000-0000-0000-0000-000000000320' and p.code='admin.manage_roles';
insert into public.user_roles(user_id,role_id,organisation_scope,is_active)
values('78000000-0000-0000-0000-000000000311','78000000-0000-0000-0000-000000000323','DEMO-WASDOK78',true);
insert into public.role_permissions(role_id,permission_id,is_active)
select '78000000-0000-0000-0000-000000000323',p.id,true from public.permissions p where p.code='admin.manage_roles';
select throws_ok(
  $$select private.assert_role_permission_revocation_safe('78000000-0000-0000-0000-000000000323','admin.manage_roles')$$,
  '23514',null,'database guard rejects removal of the final admin.manage_roles path'
);

-- 16: non-administrator cannot mutate the permission matrix.
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000312',true);
select throws_ok(
  $$select public.admin_grant_role_permission('78000000-0000-0000-0000-000000000321','reports.view','Unauthorized permission grant')$$,
  '42501',null,'non-administrator cannot grant role permissions'
);

select * from finish();
rollback;
