-- WASDOK-85 — canonical application schema-version hotfix.
-- Supabase's hosted migration API records deployment-time ledger timestamps,
-- which must not be used as the application's canonical release schema version.

create table if not exists private.application_schema_state (
  singleton boolean primary key default true check (singleton),
  canonical_version text not null check (canonical_version ~ '^[0-9]{14}$'),
  updated_at timestamptz not null default now()
);

revoke all on table private.application_schema_state from public, anon, authenticated, service_role;

insert into private.application_schema_state(singleton,canonical_version,updated_at)
values(true,'20260903002400',now())
on conflict (singleton) do update set
  canonical_version=excluded.canonical_version,
  updated_at=now();

create or replace function public.read_applied_schema_version()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select canonical_version
  from private.application_schema_state
  where singleton=true;
$$;

revoke all on function public.read_applied_schema_version() from public, anon, authenticated;
grant execute on function public.read_applied_schema_version() to service_role;
