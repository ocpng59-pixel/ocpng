-- WASDOK-78 — configurable Access Control Administration
-- Forward-only migration: lifecycle state and controlled administration foundation.
--
-- Compatibility amendment approved 2026-09-02:
-- Keep the existing composite unique constraints on the live RBAC relationship
-- tables. Each relationship therefore has one authoritative current row. Grant
-- and revoke RPCs update that row in place, while immutable audit_events retain
-- the complete historical sequence of privileged access changes.

create schema if not exists private;

alter table public.roles add column if not exists is_active boolean not null default true;
alter table public.roles add column if not exists role_type text not null default 'operational';
alter table public.roles add column if not exists deactivated_at timestamptz;
alter table public.roles add column if not exists deactivated_by uuid references public.profiles(id);
alter table public.roles add column if not exists deleted_at timestamptz;
alter table public.roles add column if not exists deleted_by uuid references public.profiles(id);
alter table public.roles add column if not exists updated_by uuid references public.profiles(id);
alter table public.roles drop constraint if exists roles_role_type_check;
alter table public.roles add constraint roles_role_type_check
  check (role_type in ('operational','administrative','training'));

alter table public.user_roles add column if not exists is_active boolean not null default true;
alter table public.user_roles add column if not exists assigned_by uuid references public.profiles(id);
alter table public.user_roles add column if not exists assigned_at timestamptz not null default now();
alter table public.user_roles add column if not exists revoked_at timestamptz;
alter table public.user_roles add column if not exists revoked_by uuid references public.profiles(id);

alter table public.role_permissions add column if not exists is_active boolean not null default true;
alter table public.role_permissions add column if not exists granted_by uuid references public.profiles(id);
alter table public.role_permissions add column if not exists granted_at timestamptz not null default now();
alter table public.role_permissions add column if not exists revoked_at timestamptz;
alter table public.role_permissions add column if not exists revoked_by uuid references public.profiles(id);

alter table public.data_scopes add column if not exists granted_by uuid references public.profiles(id);
alter table public.data_scopes add column if not exists granted_at timestamptz not null default now();
alter table public.data_scopes add column if not exists revoked_at timestamptz;
alter table public.data_scopes add column if not exists revoked_by uuid references public.profiles(id);

alter table public.user_compartments add column if not exists is_active boolean not null default true;
alter table public.user_compartments add column if not exists revoked_at timestamptz;
alter table public.user_compartments add column if not exists revoked_by uuid references public.profiles(id);

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(id, display_name, email, is_active)
  values(
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), new.email, 'WASDOK User'),
    new.email,
    true
  )
  on conflict(id) do update
    set email = excluded.email,
        display_name = case
          when public.profiles.display_name = '' then excluded.display_name
          else public.profiles.display_name
        end,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists wasdok_auth_user_profile on auth.users;
create trigger wasdok_auth_user_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function public.has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
select exists(
  select 1
  from public.profiles pr
  join public.user_roles ur
    on ur.user_id=pr.id
   and ur.is_active
  join public.roles r
    on r.id=ur.role_id
   and r.is_active
   and r.deleted_at is null
  join public.role_permissions rp
    on rp.role_id=r.id
   and rp.is_active
  join public.permissions p
    on p.id=rp.permission_id
  where pr.id=auth.uid()
    and pr.is_active
    and p.code=permission_code
);
$$;

-- Keep the WASDOK-27 positional-argument protection: the input parameter is
-- named scope_code for signature compatibility, but comparisons use $1 so the
-- stored column can never shadow the requested scope value.
create or replace function public.has_scope(scope_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
select exists(
  select 1
  from public.profiles pr
  where pr.id=auth.uid()
    and pr.is_active
)
and (
  $1 is null
  or exists(
    select 1
    from public.data_scopes ds
    where ds.user_id=auth.uid()
      and ds.active
      and (ds.scope_code=$1 or ds.scope_code='*')
  )
);
$$;

create or replace function public.has_compartment(classification_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
select exists(
  select 1
  from public.profiles pr
  where pr.id=auth.uid()
    and pr.is_active
)
and (
  classification_code in ('PUBLIC','INTERNAL')
  or exists(
    select 1
    from public.user_compartments uc
    join public.security_compartments sc
      on sc.id=uc.compartment_id
    where uc.user_id=auth.uid()
      and uc.is_active
      and sc.code::text=classification_code
  )
);
$$;

-- Privileged administration helpers.
create or replace function private.require_access_permission(p_permission_code text)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.has_permission(p_permission_code) then
    raise exception 'Access denied for %', p_permission_code
      using errcode='42501';
  end if;
  return v_actor;
end;
$$;

create or replace function private.require_change_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_reason = '' then
    raise exception 'A change reason is required'
      using errcode='22023';
  end if;
  return v_reason;
end;
$$;

create or replace function private.role_snapshot(p_role public.roles)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'id', p_role.id,
    'code', p_role.code,
    'name', p_role.name,
    'description', p_role.description,
    'role_type', p_role.role_type,
    'is_active', p_role.is_active,
    'deleted_at', p_role.deleted_at,
    'deactivated_at', p_role.deactivated_at
  );
$$;

create or replace function private.record_access_change(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.audit_events(
    actor_id,
    action,
    entity_type,
    entity_id,
    request_metadata,
    before_data,
    after_data,
    reason,
    classification,
    metadata
  ) values (
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    jsonb_build_object('source','access_control_administration','wasdok','WASDOK-78'),
    p_before,
    p_after,
    p_reason,
    'RESTRICTED',
    jsonb_build_object('wasdok','WASDOK-78')
  );
end;
$$;

create or replace function private.actor_holds_role(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.user_roles ur
    where ur.user_id=auth.uid()
      and ur.role_id=p_role_id
      and ur.is_active
  );
$$;

create or replace function private.active_users_with_permission_excluding_role(
  p_permission_code text,
  p_excluded_role_id uuid
)
returns integer
language sql
stable
security definer
set search_path=''
as $$
  select count(distinct pr.id)::integer
  from public.profiles pr
  join public.user_roles ur
    on ur.user_id=pr.id
   and ur.is_active
  join public.roles r
    on r.id=ur.role_id
   and r.is_active
   and r.deleted_at is null
   and r.id<>p_excluded_role_id
  join public.role_permissions rp
    on rp.role_id=r.id
   and rp.is_active
  join public.permissions p
    on p.id=rp.permission_id
  where pr.is_active
    and p.code=p_permission_code;
$$;

create or replace function private.assert_role_deactivation_safe(p_role_id uuid)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if exists(
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id=rp.permission_id
    where rp.role_id=p_role_id
      and rp.is_active
      and p.code='admin.manage_roles'
  ) and private.active_users_with_permission_excluding_role('admin.manage_roles', p_role_id)=0 then
    raise exception 'Cannot remove the last active role administrator'
      using errcode='23514';
  end if;

  if exists(
    select 1
    from public.role_permissions rp
    join public.permissions p on p.id=rp.permission_id
    where rp.role_id=p_role_id
      and rp.is_active
      and p.code='admin.manage_users'
  ) and private.active_users_with_permission_excluding_role('admin.manage_users', p_role_id)=0 then
    raise exception 'Cannot remove the last active user administrator'
      using errcode='23514';
  end if;
end;
$$;

-- Task 2: audited configurable role lifecycle RPCs.
create or replace function public.admin_create_role(
  p_code text,
  p_name text,
  p_description text,
  p_role_type text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_role public.roles;
begin
  v_actor := private.require_access_permission('admin.manage_roles');
  v_reason := private.require_change_reason(p_reason);

  if btrim(coalesce(p_code,''))='' or btrim(coalesce(p_name,''))='' then
    raise exception 'Role code and name are required'
      using errcode='22023';
  end if;

  insert into public.roles(
    code,
    name,
    description,
    is_system,
    is_active,
    role_type,
    updated_by,
    metadata
  ) values (
    btrim(p_code),
    btrim(p_name),
    nullif(btrim(coalesce(p_description,'')),''),
    false,
    true,
    btrim(p_role_type),
    v_actor,
    jsonb_build_object('managed_by','access_control_administration')
  )
  returning * into v_role;

  perform private.record_access_change(
    'access.role_created',
    'role',
    v_role.id,
    null,
    private.role_snapshot(v_role),
    v_reason
  );

  return v_role.id;
end;
$$;

create or replace function public.admin_update_role(
  p_role_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_role_type text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_before public.roles;
  v_after public.roles;
begin
  v_actor := private.require_access_permission('admin.manage_roles');
  v_reason := private.require_change_reason(p_reason);

  select * into v_before
  from public.roles
  where id=p_role_id
  for update;

  if not found then
    raise exception 'Role not found'
      using errcode='P0002';
  end if;

  if v_before.deleted_at is not null then
    raise exception 'Retired roles cannot be modified'
      using errcode='23514';
  end if;

  if private.actor_holds_role(p_role_id) then
    raise exception 'Administrators cannot modify a role they currently hold'
      using errcode='42501';
  end if;

  if btrim(coalesce(p_code,''))='' or btrim(coalesce(p_name,''))='' then
    raise exception 'Role code and name are required'
      using errcode='22023';
  end if;

  update public.roles
  set code=btrim(p_code),
      name=btrim(p_name),
      description=nullif(btrim(coalesce(p_description,'')),''),
      role_type=btrim(p_role_type),
      updated_by=v_actor,
      updated_at=now()
  where id=p_role_id
  returning * into v_after;

  perform private.record_access_change(
    'access.role_updated',
    'role',
    p_role_id,
    private.role_snapshot(v_before),
    private.role_snapshot(v_after),
    v_reason
  );

  return p_role_id;
end;
$$;

create or replace function public.admin_set_role_active(
  p_role_id uuid,
  p_is_active boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_before public.roles;
  v_after public.roles;
  v_action text;
begin
  v_actor := private.require_access_permission('admin.manage_roles');
  v_reason := private.require_change_reason(p_reason);

  select * into v_before
  from public.roles
  where id=p_role_id
  for update;

  if not found then
    raise exception 'Role not found'
      using errcode='P0002';
  end if;

  if v_before.deleted_at is not null then
    raise exception 'Retired roles cannot be activated or deactivated'
      using errcode='23514';
  end if;

  if private.actor_holds_role(p_role_id) then
    raise exception 'Administrators cannot change activation of a role they currently hold'
      using errcode='42501';
  end if;

  if not p_is_active then
    perform private.assert_role_deactivation_safe(p_role_id);
  end if;

  update public.roles
  set is_active=p_is_active,
      deactivated_at=case when p_is_active then null else now() end,
      deactivated_by=case when p_is_active then null else v_actor end,
      updated_by=v_actor,
      updated_at=now()
  where id=p_role_id
  returning * into v_after;

  v_action := case when p_is_active then 'access.role_activated' else 'access.role_deactivated' end;

  perform private.record_access_change(
    v_action,
    'role',
    p_role_id,
    private.role_snapshot(v_before),
    private.role_snapshot(v_after),
    v_reason
  );

  return p_role_id;
end;
$$;

create or replace function public.admin_retire_role(
  p_role_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_before public.roles;
  v_after public.roles;
begin
  v_actor := private.require_access_permission('admin.manage_roles');
  v_reason := private.require_change_reason(p_reason);

  select * into v_before
  from public.roles
  where id=p_role_id
  for update;

  if not found then
    raise exception 'Role not found'
      using errcode='P0002';
  end if;

  if v_before.deleted_at is not null then
    raise exception 'Role is already retired'
      using errcode='23514';
  end if;

  if private.actor_holds_role(p_role_id) then
    raise exception 'Administrators cannot retire a role they currently hold'
      using errcode='42501';
  end if;

  if exists(
    select 1
    from public.user_roles ur
    where ur.role_id=p_role_id
      and ur.is_active
  ) then
    raise exception 'Role cannot be retired while active user assignments remain'
      using errcode='23514';
  end if;

  update public.roles
  set is_active=false,
      deactivated_at=coalesce(deactivated_at,now()),
      deactivated_by=coalesce(deactivated_by,v_actor),
      deleted_at=now(),
      deleted_by=v_actor,
      updated_by=v_actor,
      updated_at=now()
  where id=p_role_id
  returning * into v_after;

  perform private.record_access_change(
    'access.role_retired',
    'role',
    p_role_id,
    private.role_snapshot(v_before),
    private.role_snapshot(v_after),
    v_reason
  );

  return p_role_id;
end;
$$;

revoke all on function public.admin_create_role(text,text,text,text,text) from public, anon;
revoke all on function public.admin_update_role(uuid,text,text,text,text,text) from public, anon;
revoke all on function public.admin_set_role_active(uuid,boolean,text) from public, anon;
revoke all on function public.admin_retire_role(uuid,text) from public, anon;
grant execute on function public.admin_create_role(text,text,text,text,text) to authenticated;
grant execute on function public.admin_update_role(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_role_active(uuid,boolean,text) to authenticated;
grant execute on function public.admin_retire_role(uuid,text) to authenticated;
