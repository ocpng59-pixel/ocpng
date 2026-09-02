-- WASDOK-78 — Access Control Administration
-- Final direct-write boundary and Task 10 security hardening.
--
-- Hosted deployment order is authoritative and sequential:
-- 01100 -> 01200 -> 01300 -> 01400.
-- This migration closes the direct-DML boundary, serializes the global
-- last-administrator invariant, enforces role-code validation at PostgreSQL,
-- and adds immutable audit evidence for Supabase Auth user invitations.

revoke insert, update, delete on table public.profiles from anon, authenticated;
revoke insert, update, delete on table public.roles from anon, authenticated;
revoke insert, update, delete on table public.permissions from anon, authenticated;
revoke insert, update, delete on table public.user_roles from anon, authenticated;
revoke insert, update, delete on table public.role_permissions from anon, authenticated;
revoke insert, update, delete on table public.data_scopes from anon, authenticated;
revoke insert, update, delete on table public.security_compartments from anon, authenticated;
revoke insert, update, delete on table public.user_compartments from anon, authenticated;

-- Serialize all transactions that can remove an effective admin path. The two
-- permission catalogue rows are stable shared guard rows. Every destructive
-- admin-path wrapper obtains the same row locks in deterministic code order,
-- then the underlying RPC re-checks authorization and anti-lockout state after
-- any wait. This closes the two-session last-admin race under READ COMMITTED.
create or replace function private.lock_access_admin_invariant()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_locked integer;
begin
  perform p.id
  from public.permissions p
  where p.code in ('admin.manage_roles','admin.manage_users')
  order by p.code
  for update;

  get diagnostics v_locked = row_count;
  if v_locked <> 2 then
    raise exception 'Administrative permission catalogue is incomplete'
      using errcode='23514';
  end if;
end;
$$;

revoke all on function private.lock_access_admin_invariant() from public, anon, authenticated;

-- Role codes are application identifiers and therefore must be validated at
-- the authoritative database boundary, not only by the Next.js form parser.
create or replace function private.require_valid_role_code(p_code text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_code text := btrim(coalesce(p_code,''));
begin
  if v_code !~ '^[a-z0-9_]{3,64}$' then
    raise exception 'Role code must match ^[a-z0-9_]{3,64}$'
      using errcode='22023';
  end if;
  return v_code;
end;
$$;

revoke all on function private.require_valid_role_code(text) from public, anon, authenticated;

-- Preserve the already-tested Task 2 implementations behind narrow wrappers
-- so Task 10 can strengthen validation without duplicating lifecycle logic.
alter function public.admin_create_role(text,text,text,text,text)
  rename to admin_create_role_unvalidated;
alter function public.admin_update_role(uuid,text,text,text,text,text)
  rename to admin_update_role_unvalidated;

revoke all on function public.admin_create_role_unvalidated(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_update_role_unvalidated(uuid,text,text,text,text,text) from public, anon, authenticated;

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
  v_code text;
  v_name text := btrim(coalesce(p_name,''));
  v_description text := btrim(coalesce(p_description,''));
begin
  v_code := private.require_valid_role_code(p_code);
  if length(v_name) < 1 or length(v_name) > 160 then
    raise exception 'Role name must be 1 to 160 characters'
      using errcode='22023';
  end if;
  if length(v_description) > 1000 then
    raise exception 'Role description must not exceed 1000 characters'
      using errcode='22023';
  end if;

  return public.admin_create_role_unvalidated(
    v_code,
    v_name,
    v_description,
    p_role_type,
    p_reason
  );
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
  v_code text;
  v_name text := btrim(coalesce(p_name,''));
  v_description text := btrim(coalesce(p_description,''));
begin
  v_code := private.require_valid_role_code(p_code);
  if length(v_name) < 1 or length(v_name) > 160 then
    raise exception 'Role name must be 1 to 160 characters'
      using errcode='22023';
  end if;
  if length(v_description) > 1000 then
    raise exception 'Role description must not exceed 1000 characters'
      using errcode='22023';
  end if;

  return public.admin_update_role_unvalidated(
    p_role_id,
    v_code,
    v_name,
    v_description,
    p_role_type,
    p_reason
  );
end;
$$;

-- Rename the four operations that can remove the final effective
-- administrator path. Public wrappers acquire one shared transaction lock;
-- the renamed implementations remain the source of authorization, mutation,
-- audit and post-mutation anti-lockout checks.
alter function public.admin_set_role_active(uuid,boolean,text)
  rename to admin_set_role_active_unserialized;
alter function public.admin_revoke_role_permission(uuid,text,text)
  rename to admin_revoke_role_permission_unserialized;
alter function public.admin_revoke_user_role(uuid,uuid,text)
  rename to admin_revoke_user_role_unserialized;
alter function public.admin_set_user_active(uuid,boolean,text)
  rename to admin_set_user_active_unserialized;

revoke all on function public.admin_set_role_active_unserialized(uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.admin_revoke_role_permission_unserialized(uuid,text,text) from public, anon, authenticated;
revoke all on function public.admin_revoke_user_role_unserialized(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.admin_set_user_active_unserialized(uuid,boolean,text) from public, anon, authenticated;

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
begin
  perform private.require_access_permission('admin.manage_roles');
  if not p_is_active then
    perform private.lock_access_admin_invariant();
  end if;
  return public.admin_set_role_active_unserialized(p_role_id,p_is_active,p_reason);
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
begin
  perform private.require_access_permission('admin.manage_roles');
  perform private.lock_access_admin_invariant();
  perform public.admin_revoke_role_permission_unserialized(
    p_role_id,p_permission_code,p_reason
  );
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
begin
  perform private.require_user_access_authority(true);
  perform private.lock_access_admin_invariant();
  perform public.admin_revoke_user_role_unserialized(p_user_id,p_role_id,p_reason);
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
begin
  perform private.require_user_access_authority(false);
  if not p_is_active then
    perform private.lock_access_admin_invariant();
  end if;
  perform public.admin_set_user_active_unserialized(p_user_id,p_is_active,p_reason);
end;
$$;

-- Supabase Auth invitation is the one Access Control operation that requires
-- the server-only service client. Once Auth creates the user/profile, the
-- authenticated administrator records one immutable, PII-minimal audit event.
create or replace function public.admin_record_user_invitation(
  p_user_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reason text;
begin
  perform private.require_access_permission('admin.manage_users');
  v_reason := private.require_change_reason(p_reason);

  perform 1
  from public.profiles pr
  where pr.id=p_user_id;
  if not found then
    raise exception 'Invited user profile not found'
      using errcode='P0002';
  end if;

  perform private.record_access_change(
    'access.user_invited',
    'profile',
    p_user_id,
    null,
    jsonb_build_object(
      'user_id',p_user_id,
      'invitation_status','sent'
    ),
    v_reason
  );
end;
$$;

-- RPC execution remains explicit and authenticated-only. The renamed internal
-- implementations are intentionally not executable by browser-facing roles.
revoke all on function public.admin_create_role(text,text,text,text,text) from public, anon;
revoke all on function public.admin_update_role(uuid,text,text,text,text,text) from public, anon;
revoke all on function public.admin_set_role_active(uuid,boolean,text) from public, anon;
revoke all on function public.admin_retire_role(uuid,text) from public, anon;
revoke all on function public.admin_grant_role_permission(uuid,text,text) from public, anon;
revoke all on function public.admin_revoke_role_permission(uuid,text,text) from public, anon;
revoke all on function public.admin_assign_user_role(uuid,uuid,text) from public, anon;
revoke all on function public.admin_revoke_user_role(uuid,uuid,text) from public, anon;
revoke all on function public.admin_grant_data_scope(uuid,text,text,text) from public, anon;
revoke all on function public.admin_revoke_data_scope(uuid,text,text) from public, anon;
revoke all on function public.admin_grant_user_compartment(uuid,text,text) from public, anon;
revoke all on function public.admin_revoke_user_compartment(uuid,text,text) from public, anon;
revoke all on function public.admin_set_user_active(uuid,boolean,text) from public, anon;
revoke all on function public.admin_record_user_invitation(uuid,text) from public, anon;

grant execute on function public.admin_create_role(text,text,text,text,text) to authenticated;
grant execute on function public.admin_update_role(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_role_active(uuid,boolean,text) to authenticated;
grant execute on function public.admin_retire_role(uuid,text) to authenticated;
grant execute on function public.admin_grant_role_permission(uuid,text,text) to authenticated;
grant execute on function public.admin_revoke_role_permission(uuid,text,text) to authenticated;
grant execute on function public.admin_assign_user_role(uuid,uuid,text) to authenticated;
grant execute on function public.admin_revoke_user_role(uuid,uuid,text) to authenticated;
grant execute on function public.admin_grant_data_scope(uuid,text,text,text) to authenticated;
grant execute on function public.admin_revoke_data_scope(uuid,text,text) to authenticated;
grant execute on function public.admin_grant_user_compartment(uuid,text,text) to authenticated;
grant execute on function public.admin_revoke_user_compartment(uuid,text,text) to authenticated;
grant execute on function public.admin_set_user_active(uuid,boolean,text) to authenticated;
grant execute on function public.admin_record_user_invitation(uuid,text) to authenticated;
