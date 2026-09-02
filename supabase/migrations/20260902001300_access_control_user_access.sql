-- WASDOK-78 — configurable Access Control Administration
-- Task 4: audited user-role, scope, compartment and active-status administration.
--
-- Compatibility amendment:
-- user_roles, data_scopes and user_compartments retain one authoritative row per
-- existing composite uniqueness rule. Revocation marks that row inactive and
-- re-grant reactivates it; immutable audit_events retain the historical sequence.

-- Apply the approved administrative-reason constraint consistently to all
-- access-control RPCs that use this shared helper.
create or replace function private.require_change_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'Administrative reason must be 3 to 500 characters'
      using errcode='22023';
  end if;
  return v_reason;
end;
$$;

create or replace function private.reject_self_target(p_target_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_target_user_id=auth.uid() then
    raise exception 'Administrators cannot modify their own access'
      using errcode='42501';
  end if;
end;
$$;

create or replace function private.require_user_access_authority(p_requires_role_admin boolean)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid;
begin
  v_actor := private.require_access_permission('admin.manage_users');

  if p_requires_role_admin and not public.has_permission('admin.manage_roles') then
    raise exception 'Access denied for admin.manage_roles'
      using errcode='42501';
  end if;

  return v_actor;
end;
$$;

create or replace function private.user_has_effective_permission(
  p_user_id uuid,
  p_permission_code text
)
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
    where pr.id=p_user_id
      and pr.is_active
      and p.code=p_permission_code
  );
$$;

create or replace function private.user_role_path_grants_permission(
  p_user_id uuid,
  p_role_id uuid,
  p_permission_code text
)
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
     and ur.role_id=p_role_id
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
    where pr.id=p_user_id
      and pr.is_active
      and p.code=p_permission_code
  );
$$;

create or replace function private.assert_admin_paths_remain(
  p_check_role_admin boolean,
  p_check_user_admin boolean
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_check_role_admin
     and private.effective_admin_count('admin.manage_roles')=0 then
    raise exception 'Cannot remove the final active role administrator path'
      using errcode='23514';
  end if;

  if p_check_user_admin
     and private.effective_admin_count('admin.manage_users')=0 then
    raise exception 'Cannot remove the final active user administrator path'
      using errcode='23514';
  end if;
end;
$$;

create or replace function private.user_role_snapshot(p_assignment public.user_roles)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'id', p_assignment.id,
    'user_id', p_assignment.user_id,
    'role_id', p_assignment.role_id,
    'organisation_scope', p_assignment.organisation_scope,
    'is_active', p_assignment.is_active,
    'assigned_by', p_assignment.assigned_by,
    'assigned_at', p_assignment.assigned_at,
    'revoked_by', p_assignment.revoked_by,
    'revoked_at', p_assignment.revoked_at
  );
$$;

create or replace function private.data_scope_snapshot(p_scope public.data_scopes)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'id', p_scope.id,
    'user_id', p_scope.user_id,
    'scope_code', p_scope.scope_code,
    'scope_type', p_scope.scope_type,
    'active', p_scope.active,
    'granted_by', p_scope.granted_by,
    'granted_at', p_scope.granted_at,
    'revoked_by', p_scope.revoked_by,
    'revoked_at', p_scope.revoked_at
  );
$$;

create or replace function private.user_compartment_snapshot(
  p_assignment public.user_compartments,
  p_compartment_code text
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'id', p_assignment.id,
    'user_id', p_assignment.user_id,
    'compartment_id', p_assignment.compartment_id,
    'compartment_code', p_compartment_code,
    'is_active', p_assignment.is_active,
    'granted_by', p_assignment.granted_by,
    'granted_at', p_assignment.granted_at,
    'revoked_by', p_assignment.revoked_by,
    'revoked_at', p_assignment.revoked_at
  );
$$;

create or replace function private.profile_access_snapshot(p_profile public.profiles)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'id', p_profile.id,
    'is_active', p_profile.is_active,
    'classification', p_profile.classification,
    'organisation_scope', p_profile.organisation_scope
  );
$$;

create or replace function public.admin_assign_user_role(
  p_user_id uuid,
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
  v_role public.roles;
  v_before public.user_roles;
  v_after public.user_roles;
  v_has_existing boolean := false;
begin
  v_actor := private.require_user_access_authority(true);
  v_reason := private.require_change_reason(p_reason);
  perform private.reject_self_target(p_user_id);

  perform 1 from public.profiles where id=p_user_id for update;
  if not found then
    raise exception 'User profile not found'
      using errcode='P0002';
  end if;

  select * into v_role
  from public.roles
  where id=p_role_id
  for update;

  if not found then
    raise exception 'Role not found'
      using errcode='P0002';
  end if;

  if not v_role.is_active or v_role.deleted_at is not null then
    raise exception 'Inactive or retired roles cannot be assigned'
      using errcode='23514';
  end if;

  select * into v_before
  from public.user_roles ur
  where ur.user_id=p_user_id
    and ur.role_id=p_role_id
  for update;

  v_has_existing := found;

  if v_has_existing and v_before.is_active then
    raise exception 'User role assignment is already active'
      using errcode='23505';
  end if;

  if v_has_existing then
    update public.user_roles
    set is_active=true,
        assigned_by=v_actor,
        assigned_at=now(),
        revoked_by=null,
        revoked_at=null,
        updated_at=now()
    where id=v_before.id
    returning * into v_after;
  else
    insert into public.user_roles(
      user_id,
      role_id,
      organisation_scope,
      is_active,
      assigned_by,
      assigned_at,
      metadata
    ) values (
      p_user_id,
      p_role_id,
      v_role.organisation_scope,
      true,
      v_actor,
      now(),
      jsonb_build_object('managed_by','access_control_administration')
    )
    returning * into v_after;
  end if;

  perform private.record_access_change(
    'access.user_role_assigned',
    'user_role',
    v_after.id,
    case when v_has_existing then private.user_role_snapshot(v_before) else null end,
    private.user_role_snapshot(v_after),
    v_reason
  );

  return v_after.id;
end;
$$;

create or replace function public.admin_revoke_user_role(
  p_user_id uuid,
  p_role_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_before public.user_roles;
  v_after public.user_roles;
  v_removes_role_admin boolean;
  v_removes_user_admin boolean;
begin
  v_actor := private.require_user_access_authority(true);
  v_reason := private.require_change_reason(p_reason);
  perform private.reject_self_target(p_user_id);

  perform 1 from public.profiles where id=p_user_id for update;
  if not found then
    raise exception 'User profile not found'
      using errcode='P0002';
  end if;

  select * into v_before
  from public.user_roles ur
  where ur.user_id=p_user_id
    and ur.role_id=p_role_id
    and ur.is_active
  for update;

  if not found then
    raise exception 'Active user role assignment not found'
      using errcode='P0002';
  end if;

  v_removes_role_admin := private.user_role_path_grants_permission(
    p_user_id,p_role_id,'admin.manage_roles'
  );
  v_removes_user_admin := private.user_role_path_grants_permission(
    p_user_id,p_role_id,'admin.manage_users'
  );

  update public.user_roles
  set is_active=false,
      revoked_by=v_actor,
      revoked_at=now(),
      updated_at=now()
  where id=v_before.id
  returning * into v_after;

  perform private.assert_admin_paths_remain(
    v_removes_role_admin,
    v_removes_user_admin
  );

  perform private.record_access_change(
    'access.user_role_revoked',
    'user_role',
    v_after.id,
    private.user_role_snapshot(v_before),
    private.user_role_snapshot(v_after),
    v_reason
  );
end;
$$;

create or replace function public.admin_grant_data_scope(
  p_user_id uuid,
  p_scope_code text,
  p_scope_type text,
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
  v_scope_code text := btrim(coalesce(p_scope_code,''));
  v_scope_type text := btrim(coalesce(p_scope_type,''));
  v_before public.data_scopes;
  v_after public.data_scopes;
  v_has_existing boolean := false;
begin
  v_actor := private.require_user_access_authority(false);
  v_reason := private.require_change_reason(p_reason);
  perform private.reject_self_target(p_user_id);

  if v_scope_code='' or length(v_scope_code)>100
     or v_scope_type='' or length(v_scope_type)>100 then
    raise exception 'Invalid data scope'
      using errcode='22023';
  end if;

  perform 1 from public.profiles where id=p_user_id for update;
  if not found then
    raise exception 'User profile not found'
      using errcode='P0002';
  end if;

  select * into v_before
  from public.data_scopes ds
  where ds.user_id=p_user_id
    and ds.scope_code=v_scope_code
  for update;

  v_has_existing := found;

  if v_has_existing and v_before.active then
    raise exception 'Data scope assignment is already active'
      using errcode='23505';
  end if;

  if v_has_existing then
    update public.data_scopes
    set active=true,
        scope_type=v_scope_type,
        granted_by=v_actor,
        granted_at=now(),
        revoked_by=null,
        revoked_at=null,
        updated_at=now()
    where id=v_before.id
    returning * into v_after;
  else
    insert into public.data_scopes(
      user_id,
      scope_code,
      scope_type,
      active,
      granted_by,
      granted_at,
      metadata
    ) values (
      p_user_id,
      v_scope_code,
      v_scope_type,
      true,
      v_actor,
      now(),
      jsonb_build_object('managed_by','access_control_administration')
    )
    returning * into v_after;
  end if;

  perform private.record_access_change(
    'access.scope_granted',
    'data_scope',
    v_after.id,
    case when v_has_existing then private.data_scope_snapshot(v_before) else null end,
    private.data_scope_snapshot(v_after),
    v_reason
  );

  return v_after.id;
end;
$$;

create or replace function public.admin_revoke_data_scope(
  p_user_id uuid,
  p_scope_code text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_scope_code text := btrim(coalesce(p_scope_code,''));
  v_before public.data_scopes;
  v_after public.data_scopes;
begin
  v_actor := private.require_user_access_authority(false);
  v_reason := private.require_change_reason(p_reason);
  perform private.reject_self_target(p_user_id);

  perform 1 from public.profiles where id=p_user_id for update;
  if not found then
    raise exception 'User profile not found'
      using errcode='P0002';
  end if;

  select * into v_before
  from public.data_scopes ds
  where ds.user_id=p_user_id
    and ds.scope_code=v_scope_code
    and ds.active
  for update;

  if not found then
    raise exception 'Active data scope assignment not found'
      using errcode='P0002';
  end if;

  update public.data_scopes
  set active=false,
      revoked_by=v_actor,
      revoked_at=now(),
      updated_at=now()
  where id=v_before.id
  returning * into v_after;

  perform private.record_access_change(
    'access.scope_revoked',
    'data_scope',
    v_after.id,
    private.data_scope_snapshot(v_before),
    private.data_scope_snapshot(v_after),
    v_reason
  );
end;
$$;

create or replace function public.admin_grant_user_compartment(
  p_user_id uuid,
  p_compartment_code text,
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
  v_code text := btrim(coalesce(p_compartment_code,''));
  v_compartment_id uuid;
  v_before public.user_compartments;
  v_after public.user_compartments;
  v_has_existing boolean := false;
begin
  v_actor := private.require_user_access_authority(true);
  v_reason := private.require_change_reason(p_reason);
  perform private.reject_self_target(p_user_id);

  perform 1 from public.profiles where id=p_user_id for update;
  if not found then
    raise exception 'User profile not found'
      using errcode='P0002';
  end if;

  select sc.id into v_compartment_id
  from public.security_compartments sc
  where sc.code::text=v_code;

  if v_compartment_id is null then
    raise exception 'Unknown compartment code'
      using errcode='22023';
  end if;

  select * into v_before
  from public.user_compartments uc
  where uc.user_id=p_user_id
    and uc.compartment_id=v_compartment_id
  for update;

  v_has_existing := found;

  if v_has_existing and v_before.is_active then
    raise exception 'User compartment assignment is already active'
      using errcode='23505';
  end if;

  if v_has_existing then
    update public.user_compartments
    set is_active=true,
        granted_by=v_actor,
        granted_at=now(),
        revoked_by=null,
        revoked_at=null,
        updated_at=now()
    where id=v_before.id
    returning * into v_after;
  else
    insert into public.user_compartments(
      user_id,
      compartment_id,
      is_active,
      granted_by,
      granted_at,
      metadata
    ) values (
      p_user_id,
      v_compartment_id,
      true,
      v_actor,
      now(),
      jsonb_build_object('managed_by','access_control_administration')
    )
    returning * into v_after;
  end if;

  perform private.record_access_change(
    'access.compartment_granted',
    'user_compartment',
    v_after.id,
    case when v_has_existing then private.user_compartment_snapshot(v_before,v_code) else null end,
    private.user_compartment_snapshot(v_after,v_code),
    v_reason
  );

  return v_after.id;
end;
$$;

create or replace function public.admin_revoke_user_compartment(
  p_user_id uuid,
  p_compartment_code text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_code text := btrim(coalesce(p_compartment_code,''));
  v_compartment_id uuid;
  v_before public.user_compartments;
  v_after public.user_compartments;
begin
  v_actor := private.require_user_access_authority(true);
  v_reason := private.require_change_reason(p_reason);
  perform private.reject_self_target(p_user_id);

  perform 1 from public.profiles where id=p_user_id for update;
  if not found then
    raise exception 'User profile not found'
      using errcode='P0002';
  end if;

  select sc.id into v_compartment_id
  from public.security_compartments sc
  where sc.code::text=v_code;

  if v_compartment_id is null then
    raise exception 'Unknown compartment code'
      using errcode='22023';
  end if;

  select * into v_before
  from public.user_compartments uc
  where uc.user_id=p_user_id
    and uc.compartment_id=v_compartment_id
    and uc.is_active
  for update;

  if not found then
    raise exception 'Active user compartment assignment not found'
      using errcode='P0002';
  end if;

  update public.user_compartments
  set is_active=false,
      revoked_by=v_actor,
      revoked_at=now(),
      updated_at=now()
  where id=v_before.id
  returning * into v_after;

  perform private.record_access_change(
    'access.compartment_revoked',
    'user_compartment',
    v_after.id,
    private.user_compartment_snapshot(v_before,v_code),
    private.user_compartment_snapshot(v_after,v_code),
    v_reason
  );
end;
$$;

create or replace function public.admin_set_user_active(
  p_user_id uuid,
  p_is_active boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_before public.profiles;
  v_after public.profiles;
  v_was_role_admin boolean;
  v_was_user_admin boolean;
  v_action text;
begin
  v_actor := private.require_user_access_authority(false);
  v_reason := private.require_change_reason(p_reason);
  perform private.reject_self_target(p_user_id);

  select * into v_before
  from public.profiles
  where id=p_user_id
  for update;

  if not found then
    raise exception 'User profile not found'
      using errcode='P0002';
  end if;

  if v_before.is_active=p_is_active then
    raise exception 'User active status is already in the requested state'
      using errcode='23514';
  end if;

  v_was_role_admin := private.user_has_effective_permission(
    p_user_id,'admin.manage_roles'
  );
  v_was_user_admin := private.user_has_effective_permission(
    p_user_id,'admin.manage_users'
  );

  update public.profiles
  set is_active=p_is_active,
      updated_at=now()
  where id=p_user_id
  returning * into v_after;

  if not p_is_active then
    perform private.assert_admin_paths_remain(
      v_was_role_admin,
      v_was_user_admin
    );
  end if;

  v_action := case when p_is_active
    then 'access.user_activated'
    else 'access.user_suspended'
  end;

  perform private.record_access_change(
    v_action,
    'profile',
    p_user_id,
    private.profile_access_snapshot(v_before),
    private.profile_access_snapshot(v_after),
    v_reason
  );
end;
$$;

revoke all on function public.admin_assign_user_role(uuid,uuid,text) from public, anon;
revoke all on function public.admin_revoke_user_role(uuid,uuid,text) from public, anon;
revoke all on function public.admin_grant_data_scope(uuid,text,text,text) from public, anon;
revoke all on function public.admin_revoke_data_scope(uuid,text,text) from public, anon;
revoke all on function public.admin_grant_user_compartment(uuid,text,text) from public, anon;
revoke all on function public.admin_revoke_user_compartment(uuid,text,text) from public, anon;
revoke all on function public.admin_set_user_active(uuid,boolean,text) from public, anon;

grant execute on function public.admin_assign_user_role(uuid,uuid,text) to authenticated;
grant execute on function public.admin_revoke_user_role(uuid,uuid,text) to authenticated;
grant execute on function public.admin_grant_data_scope(uuid,text,text,text) to authenticated;
grant execute on function public.admin_revoke_data_scope(uuid,text,text) to authenticated;
grant execute on function public.admin_grant_user_compartment(uuid,text,text) to authenticated;
grant execute on function public.admin_revoke_user_compartment(uuid,text,text) to authenticated;
grant execute on function public.admin_set_user_active(uuid,boolean,text) to authenticated;
