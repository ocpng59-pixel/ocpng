begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

-- This helper executes as the current SQL role. It returns false when PostgreSQL
-- rejects the direct write and true when the statement itself completes. For
-- UPDATE/DELETE, a completed statement still only passes when protected state is
-- unchanged, covering both explicit permission errors and RLS zero-row denial.
create or replace function pg_temp.try_direct_write(p_sql text)
returns boolean
language plpgsql
as $$
begin
  execute p_sql;
  return true;
exception when others then
  return false;
end;
$$;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
(
  '78000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-direct-write-admin@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Direct Write Administrator"}'::jsonb,now(),now()
),
(
  '78000000-0000-0000-0000-000000000502',
  '00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','wasdok78-direct-write-target@test.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"display_name":"DEMO WASDOK78 Direct Write Target"}'::jsonb,now(),now()
);

insert into public.roles(
  id,code,name,description,is_system,is_active,role_type,metadata
) values
(
  '78000000-0000-0000-0000-000000000511',
  'wasdok78_direct_admin','DEMO WASDOK78 Direct Write Admin','Direct-write test administrator',false,true,'administrative','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
),
(
  '78000000-0000-0000-0000-000000000512',
  'wasdok78_direct_target','DEMO WASDOK78 Direct Write Target Role','Direct-write protected target',false,true,'operational','{"demo":true,"wasdok":"WASDOK-78"}'::jsonb
);

insert into public.user_roles(user_id,role_id,organisation_scope,is_active)
values
('78000000-0000-0000-0000-000000000501','78000000-0000-0000-0000-000000000511','DEMO-WASDOK78',true),
('78000000-0000-0000-0000-000000000502','78000000-0000-0000-0000-000000000512','DEMO-WASDOK78',true);

insert into public.role_permissions(role_id,permission_id,is_active)
select v.role_id,p.id,true
from (values
  ('78000000-0000-0000-0000-000000000511'::uuid,'admin.manage_users'),
  ('78000000-0000-0000-0000-000000000511'::uuid,'admin.manage_roles'),
  ('78000000-0000-0000-0000-000000000512'::uuid,'reports.view')
) as v(role_id,permission_code)
join public.permissions p on p.code=v.permission_code;

insert into public.data_scopes(user_id,scope_code,scope_type,active)
values('78000000-0000-0000-0000-000000000502','DEMO-DIRECT-SCOPE','organisation',true);

insert into public.user_compartments(user_id,compartment_id,is_active)
select '78000000-0000-0000-0000-000000000502',sc.id,true
from public.security_compartments sc
where sc.code='RESTRICTED';

set local role authenticated;
select set_config('request.jwt.claim.sub','78000000-0000-0000-0000-000000000501',true);

-- 1-3: roles cannot be mutated directly.
select ok(
  not pg_temp.try_direct_write($sql$
    insert into public.roles(code,name,is_system,is_active,role_type)
    values('wasdok78_direct_forbidden','Forbidden Direct Role',false,true,'operational')
  $sql$),
  'authenticated direct role insert is denied'
);
select ok(
  not pg_temp.try_direct_write($sql$
    update public.roles
    set name='HACKED DIRECT ROLE'
    where id='78000000-0000-0000-0000-000000000512'
  $sql$)
  or coalesce((select name<>'HACKED DIRECT ROLE' from public.roles where id='78000000-0000-0000-0000-000000000512'),false),
  'authenticated direct role update cannot change protected state'
);
select ok(
  not pg_temp.try_direct_write($sql$
    delete from public.roles
    where id='78000000-0000-0000-0000-000000000512'
  $sql$)
  or exists(select 1 from public.roles where id='78000000-0000-0000-0000-000000000512'),
  'authenticated direct role delete cannot remove protected state'
);

-- 4-6: role_permissions cannot be mutated directly.
select ok(
  not pg_temp.try_direct_write($sql$
    insert into public.role_permissions(role_id,permission_id,is_active)
    select '78000000-0000-0000-0000-000000000512',p.id,true
    from public.permissions p where p.code='tasks.view'
  $sql$),
  'authenticated direct role-permission insert is denied'
);
select ok(
  not pg_temp.try_direct_write($sql$
    update public.role_permissions rp
    set is_active=false
    from public.permissions p
    where rp.permission_id=p.id
      and rp.role_id='78000000-0000-0000-0000-000000000512'
      and p.code='reports.view'
  $sql$)
  or exists(
    select 1 from public.role_permissions rp
    join public.permissions p on p.id=rp.permission_id
    where rp.role_id='78000000-0000-0000-0000-000000000512'
      and p.code='reports.view' and rp.is_active
  ),
  'authenticated direct role-permission update cannot change protected state'
);
select ok(
  not pg_temp.try_direct_write($sql$
    delete from public.role_permissions rp
    using public.permissions p
    where rp.permission_id=p.id
      and rp.role_id='78000000-0000-0000-0000-000000000512'
      and p.code='reports.view'
  $sql$)
  or exists(
    select 1 from public.role_permissions rp
    join public.permissions p on p.id=rp.permission_id
    where rp.role_id='78000000-0000-0000-0000-000000000512'
      and p.code='reports.view'
  ),
  'authenticated direct role-permission delete cannot remove protected state'
);

-- 7-9: user_roles cannot be mutated directly.
select ok(
  not pg_temp.try_direct_write($sql$
    insert into public.user_roles(user_id,role_id,is_active)
    values('78000000-0000-0000-0000-000000000502','78000000-0000-0000-0000-000000000511',true)
  $sql$),
  'authenticated direct user-role insert is denied'
);
select ok(
  not pg_temp.try_direct_write($sql$
    update public.user_roles
    set is_active=false
    where user_id='78000000-0000-0000-0000-000000000502'
      and role_id='78000000-0000-0000-0000-000000000512'
  $sql$)
  or exists(
    select 1 from public.user_roles
    where user_id='78000000-0000-0000-0000-000000000502'
      and role_id='78000000-0000-0000-0000-000000000512'
      and is_active
  ),
  'authenticated direct user-role update cannot change protected state'
);
select ok(
  not pg_temp.try_direct_write($sql$
    delete from public.user_roles
    where user_id='78000000-0000-0000-0000-000000000502'
      and role_id='78000000-0000-0000-0000-000000000512'
  $sql$)
  or exists(
    select 1 from public.user_roles
    where user_id='78000000-0000-0000-0000-000000000502'
      and role_id='78000000-0000-0000-0000-000000000512'
  ),
  'authenticated direct user-role delete cannot remove protected state'
);

-- 10-12: data_scopes cannot be mutated directly.
select ok(
  not pg_temp.try_direct_write($sql$
    insert into public.data_scopes(user_id,scope_code,scope_type,active)
    values('78000000-0000-0000-0000-000000000502','DEMO-DIRECT-FORBIDDEN','organisation',true)
  $sql$),
  'authenticated direct data-scope insert is denied'
);
select ok(
  not pg_temp.try_direct_write($sql$
    update public.data_scopes
    set active=false
    where user_id='78000000-0000-0000-0000-000000000502'
      and scope_code='DEMO-DIRECT-SCOPE'
  $sql$)
  or exists(
    select 1 from public.data_scopes
    where user_id='78000000-0000-0000-0000-000000000502'
      and scope_code='DEMO-DIRECT-SCOPE' and active
  ),
  'authenticated direct data-scope update cannot change protected state'
);
select ok(
  not pg_temp.try_direct_write($sql$
    delete from public.data_scopes
    where user_id='78000000-0000-0000-0000-000000000502'
      and scope_code='DEMO-DIRECT-SCOPE'
  $sql$)
  or exists(
    select 1 from public.data_scopes
    where user_id='78000000-0000-0000-0000-000000000502'
      and scope_code='DEMO-DIRECT-SCOPE'
  ),
  'authenticated direct data-scope delete cannot remove protected state'
);

-- 13-15: user_compartments cannot be mutated directly.
select ok(
  not pg_temp.try_direct_write($sql$
    insert into public.user_compartments(user_id,compartment_id,is_active)
    select '78000000-0000-0000-0000-000000000502',sc.id,true
    from public.security_compartments sc where sc.code='CONFIDENTIAL'
  $sql$),
  'authenticated direct user-compartment insert is denied'
);
select ok(
  not pg_temp.try_direct_write($sql$
    update public.user_compartments uc
    set is_active=false
    from public.security_compartments sc
    where uc.compartment_id=sc.id
      and uc.user_id='78000000-0000-0000-0000-000000000502'
      and sc.code='RESTRICTED'
  $sql$)
  or exists(
    select 1 from public.user_compartments uc
    join public.security_compartments sc on sc.id=uc.compartment_id
    where uc.user_id='78000000-0000-0000-0000-000000000502'
      and sc.code='RESTRICTED' and uc.is_active
  ),
  'authenticated direct user-compartment update cannot change protected state'
);
select ok(
  not pg_temp.try_direct_write($sql$
    delete from public.user_compartments uc
    using public.security_compartments sc
    where uc.compartment_id=sc.id
      and uc.user_id='78000000-0000-0000-0000-000000000502'
      and sc.code='RESTRICTED'
  $sql$)
  or exists(
    select 1 from public.user_compartments uc
    join public.security_compartments sc on sc.id=uc.compartment_id
    where uc.user_id='78000000-0000-0000-0000-000000000502'
      and sc.code='RESTRICTED'
  ),
  'authenticated direct user-compartment delete cannot remove protected state'
);

reset role;
select * from finish();
rollback;
