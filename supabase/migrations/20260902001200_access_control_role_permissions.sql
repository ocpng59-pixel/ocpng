-- WASDOK-78 — configurable Access Control Administration
-- Task 3: audited role-permission matrix administration.
--
-- Access-history compatibility amendment:
-- role_permissions keeps one authoritative row per (role_id, permission_id).
-- Revocation marks that row inactive; re-grant reactivates the same row.
-- Immutable audit_events preserve the full sequence of grants and revocations.

create or replace function private.effective_admin_count(p_permission_code text)
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
  join public.role_permissions rp
    on rp.role_id=r.id
   and rp.is_active
  join public.permissions p
    on p.id=rp.permission_id
  where pr.is_active
    and p.code=p_permission_code;
$$;

create or replace function private.role_permission_snapshot(
  p_assignment public.role_permissions,
  p_permission_code text
)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'id', p_assignment.id,
    'role_id', p_assignment.role_id,
    'permission_id', p_assignment.permission_id,
    'permission_code', p_permission_code,
    'is_active', p_assignment.is_active,
    'granted_by', p_assignment.granted_by,
    'granted_at', p_assignment.granted_at,
    'revoked_by', p_assignment.revoked_by,
    'revoked_at', p_assignment.revoked_at
  );
$$;

create or replace function private.assert_role_permission_revocation_safe(
  p_role_id uuid,
  p_permission_code text
)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_permission_code not in ('admin.manage_roles','admin.manage_users') then
    return;
  end if;

  if not exists(
    select 1
    from public.role_permissions rp
    join public.permissions p
      on p.id=rp.permission_id
    join public.roles r
      on r.id=rp.role_id
    where rp.role_id=p_role_id
      and rp.is_active
      and p.code=p_permission_code
      and r.is_active
      and r.deleted_at is null
  ) then
    return;
  end if;

  if private.active_users_with_permission_excluding_role(
    p_permission_code,
    p_role_id
  )=0 then
    if p_permission_code='admin.manage_roles' then
      raise exception 'Cannot remove the final active role administrator path'
        using errcode='23514';
    end if;

    raise exception 'Cannot remove the final active user administrator path'
      using errcode='23514';
  end if;
end;
$$;

create or replace function public.admin_grant_role_permission(
  p_role_id uuid,
  p_permission_code text,
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
  v_permission_id uuid;
  v_role public.roles;
  v_before public.role_permissions;
  v_after public.role_permissions;
  v_has_existing boolean := false;
begin
  v_actor := private.require_access_permission('admin.manage_roles');
  v_reason := private.require_change_reason(p_reason);

  select * into v_role
  from public.roles
  where id=p_role_id
  for update;

  if not found then
    raise exception 'Role not found'
      using errcode='P0002';
  end if;

  if v_role.deleted_at is not null then
    raise exception 'Retired roles cannot receive permissions'
      using errcode='23514';
  end if;

  if private.actor_holds_role(p_role_id) then
    raise exception 'Administrators cannot change permissions on a role they currently hold'
      using errcode='42501';
  end if;

  select p.id into v_permission_id
  from public.permissions p
  where p.code=btrim(coalesce(p_permission_code,''));

  if v_permission_id is null then
    raise exception 'Unknown permission code'
      using errcode='22023';
  end if;

  select * into v_before
  from public.role_permissions rp
  where rp.role_id=p_role_id
    and rp.permission_id=v_permission_id
  for update;

  v_has_existing := found;

  if v_has_existing and v_before.is_active then
    raise exception 'Role permission is already active'
      using errcode='23505';
  end if;

  if v_has_existing then
    update public.role_permissions
    set is_active=true,
        granted_by=v_actor,
        granted_at=now(),
        revoked_by=null,
        revoked_at=null,
        updated_at=now()
    where id=v_before.id
    returning * into v_after;
  else
    insert into public.role_permissions(
      role_id,
      permission_id,
      is_active,
      granted_by,
      granted_at,
      metadata
    ) values (
      p_role_id,
      v_permission_id,
      true,
      v_actor,
      now(),
      jsonb_build_object('managed_by','access_control_administration')
    )
    returning * into v_after;
  end if;

  perform private.record_access_change(
    'access.role_permission_granted',
    'role_permission',
    v_after.id,
    case
      when v_has_existing then private.role_permission_snapshot(v_before,p_permission_code)
      else null
    end,
    private.role_permission_snapshot(v_after,p_permission_code),
    v_reason
  );

  return v_after.id;
end;
$$;

create or replace function public.admin_revoke_role_permission(
  p_role_id uuid,
  p_permission_code text,
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
  v_permission_id uuid;
  v_role public.roles;
  v_before public.role_permissions;
  v_after public.role_permissions;
begin
  v_actor := private.require_access_permission('admin.manage_roles');
  v_reason := private.require_change_reason(p_reason);

  select * into v_role
  from public.roles
  where id=p_role_id
  for update;

  if not found then
    raise exception 'Role not found'
      using errcode='P0002';
  end if;

  if v_role.deleted_at is not null then
    raise exception 'Retired roles cannot have permissions changed'
      using errcode='23514';
  end if;

  if private.actor_holds_role(p_role_id) then
    raise exception 'Administrators cannot change permissions on a role they currently hold'
      using errcode='42501';
  end if;

  select p.id into v_permission_id
  from public.permissions p
  where p.code=btrim(coalesce(p_permission_code,''));

  if v_permission_id is null then
    raise exception 'Unknown permission code'
      using errcode='22023';
  end if;

  select * into v_before
  from public.role_permissions rp
  where rp.role_id=p_role_id
    and rp.permission_id=v_permission_id
    and rp.is_active
  for update;

  if not found then
    raise exception 'Active role permission assignment not found'
      using errcode='P0002';
  end if;

  perform private.assert_role_permission_revocation_safe(
    p_role_id,
    p_permission_code
  );

  update public.role_permissions
  set is_active=false,
      revoked_by=v_actor,
      revoked_at=now(),
      updated_at=now()
  where id=v_before.id
  returning * into v_after;

  perform private.record_access_change(
    'access.role_permission_revoked',
    'role_permission',
    v_after.id,
    private.role_permission_snapshot(v_before,p_permission_code),
    private.role_permission_snapshot(v_after,p_permission_code),
    v_reason
  );
end;
$$;

revoke all on function public.admin_grant_role_permission(uuid,text,text) from public, anon;
revoke all on function public.admin_revoke_role_permission(uuid,text,text) from public, anon;
grant execute on function public.admin_grant_role_permission(uuid,text,text) to authenticated;
grant execute on function public.admin_revoke_role_permission(uuid,text,text) to authenticated;
