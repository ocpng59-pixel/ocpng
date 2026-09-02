-- WASDOK-78 — configurable Access Control Administration
-- Forward-only migration: lifecycle history and controlled administration foundation.

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

alter table public.user_roles drop constraint if exists user_roles_user_id_role_id_key;
alter table public.role_permissions drop constraint if exists role_permissions_role_id_permission_id_key;
alter table public.data_scopes drop constraint if exists data_scopes_user_id_scope_code_key;
alter table public.user_compartments drop constraint if exists user_compartments_user_id_compartment_id_key;

create unique index if not exists user_roles_one_active
  on public.user_roles(user_id, role_id)
  where is_active;

create unique index if not exists role_permissions_one_active
  on public.role_permissions(role_id, permission_id)
  where is_active;

create unique index if not exists data_scopes_one_active
  on public.data_scopes(user_id, scope_code)
  where active;

create unique index if not exists user_compartments_one_active
  on public.user_compartments(user_id, compartment_id)
  where is_active;

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
