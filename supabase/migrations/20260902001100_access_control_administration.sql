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
  scope_code is null
  or exists(
    select 1
    from public.data_scopes ds
    where ds.user_id=auth.uid()
      and ds.active
      and (ds.scope_code=scope_code or ds.scope_code='*')
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
