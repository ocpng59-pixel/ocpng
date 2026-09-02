-- WASDOK-64: controlled complaint intake state, provenance and lifecycle audit.
-- State-only foundation. Complaint content persistence remains WASDOK-65.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

create table public.complaint_intakes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',
  channel text not null,
  source text not null,
  actor_id uuid references public.profiles(id),
  organisation_scope text not null,
  classification public.security_classification not null default 'CONFIDENTIAL',
  revision integer not null default 1,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint complaint_intakes_status_check
    check (status in ('draft', 'submitted')),
  constraint complaint_intakes_scope_check
    check (btrim(organisation_scope) <> ''),
  constraint complaint_intakes_classification_check
    check (classification = 'CONFIDENTIAL'::public.security_classification),
  constraint complaint_intakes_revision_check
    check (revision >= 1),
  constraint complaint_intakes_provenance_check
    check (
      (channel = 'public_web'
        and source = 'wasdok_public_form'
        and actor_id is null)
      or
      (channel = 'assisted_internal'
        and source = 'wasdok_assisted_form'
        and actor_id is not null)
    ),
  constraint complaint_intakes_state_timestamp_check
    check (
      (status = 'draft' and submitted_at is null)
      or
      (status = 'submitted' and submitted_at is not null)
    )
);

alter table public.complaint_intakes enable row level security;
alter table public.complaint_intakes force row level security;

revoke all on table public.complaint_intakes from public, anon, authenticated, service_role;
grant select on table public.complaint_intakes to authenticated;
grant select, insert, update on table public.complaint_intakes to service_role;

create or replace function private.complaint_intake_actor_allowed(
  p_actor_id uuid,
  p_scope text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.profiles pr
      where pr.id = p_actor_id
        and pr.is_active
    )
    and exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      join public.permissions p on p.id = rp.permission_id
      where ur.user_id = p_actor_id
        and p.code = 'complaints.create'
    )
    and exists (
      select 1
      from public.data_scopes ds
      where ds.user_id = p_actor_id
        and ds.active
        and (ds.scope_code = p_scope or ds.scope_code = '*')
    )
    and exists (
      select 1
      from public.user_compartments uc
      join public.security_compartments sc on sc.id = uc.compartment_id
      where uc.user_id = p_actor_id
        and sc.code = 'CONFIDENTIAL'::public.security_classification
    );
$$;

revoke all on function private.complaint_intake_actor_allowed(uuid, text) from public, anon, authenticated;
grant execute on function private.complaint_intake_actor_allowed(uuid, text) to service_role;

create or replace function private.guard_complaint_intake_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23514',
      message = 'complaint intake state cannot be deleted';
  end if;

  if old.id is distinct from new.id
    or old.channel is distinct from new.channel
    or old.source is distinct from new.source
    or old.actor_id is distinct from new.actor_id
    or old.organisation_scope is distinct from new.organisation_scope
    or old.classification is distinct from new.classification
    or old.created_at is distinct from new.created_at then
    raise exception using
      errcode = '23514',
      message = 'complaint intake provenance is immutable';
  end if;

  if old.status = 'submitted' then
    raise exception using
      errcode = '23514',
      message = 'submitted complaint intake state is immutable';
  end if;

  if old.status <> 'draft'
    or new.status <> 'submitted'
    or new.revision <> old.revision + 1
    or new.submitted_at is null
    or new.updated_at < old.updated_at then
    raise exception using
      errcode = '23514',
      message = 'invalid complaint intake state transition';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_complaint_intake_mutation() from public, anon, authenticated;
grant execute on function private.guard_complaint_intake_mutation() to service_role;

create or replace function private.audit_complaint_intake_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action text;
  v_before jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'complaint_intake.draft_created';
    v_before := null;
  else
    v_action := 'complaint_intake.submitted';
    v_before := jsonb_build_object(
      'status', old.status,
      'revision', old.revision
    );
  end if;

  insert into public.audit_events (
    actor_id,
    action,
    entity_type,
    entity_id,
    request_metadata,
    before_data,
    after_data,
    classification,
    organisation_scope,
    metadata
  ) values (
    new.actor_id,
    v_action,
    'complaint_intake',
    new.id,
    jsonb_build_object(
      'channel', new.channel,
      'source', new.source,
      'event_source', 'wasdok-db'
    ),
    v_before,
    jsonb_build_object(
      'status', new.status,
      'revision', new.revision
    ),
    'RESTRICTED'::public.security_classification,
    new.organisation_scope,
    jsonb_build_object(
      'source', 'wasdok-complaint-intake',
      'record_classification', new.classification::text
    )
  );

  return new;
end;
$$;

revoke all on function private.audit_complaint_intake_state() from public, anon, authenticated;
grant execute on function private.audit_complaint_intake_state() to service_role;

create trigger complaint_intakes_guard_mutation
before update or delete on public.complaint_intakes
for each row execute function private.guard_complaint_intake_mutation();

create trigger complaint_intakes_audit_state
after insert or update on public.complaint_intakes
for each row execute function private.audit_complaint_intake_state();

create policy complaint_intakes_select_own_assisted
on public.complaint_intakes
for select
to authenticated
using (
  channel = 'assisted_internal'
  and actor_id = auth.uid()
  and exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.is_active
  )
  and public.has_permission('complaints.create')
  and public.has_scope(organisation_scope)
  and public.has_compartment('CONFIDENTIAL')
);

create or replace function public.create_complaint_intake_draft(
  p_channel text,
  p_scope text,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_id uuid;
begin
  if p_scope is null or btrim(p_scope) = '' then
    raise exception using
      errcode = '22023',
      message = 'complaint intake scope is required';
  end if;

  case p_channel
    when 'public_web' then
      if p_actor_id is not null then
        raise exception using
          errcode = '22023',
          message = 'public complaint intake cannot specify an actor';
      end if;
      v_source := 'wasdok_public_form';

    when 'assisted_internal' then
      if p_actor_id is null then
        raise exception using
          errcode = '22023',
          message = 'assisted complaint intake requires an actor';
      end if;

      if not private.complaint_intake_actor_allowed(p_actor_id, p_scope) then
        raise exception using
          errcode = '42501',
          message = 'assisted complaint intake actor is not authorized';
      end if;
      v_source := 'wasdok_assisted_form';

    else
      raise exception using
        errcode = '22023',
        message = 'complaint intake channel is not approved';
  end case;

  insert into public.complaint_intakes (
    status,
    channel,
    source,
    actor_id,
    organisation_scope,
    classification,
    revision
  ) values (
    'draft',
    p_channel,
    v_source,
    p_actor_id,
    btrim(p_scope),
    'CONFIDENTIAL'::public.security_classification,
    1
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_complaint_intake_draft(text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_complaint_intake_draft(text, text, uuid) to service_role;

create or replace function public.submit_complaint_intake(
  p_intake_id uuid,
  p_expected_revision integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intake public.complaint_intakes%rowtype;
  v_now timestamptz;
begin
  if p_intake_id is null
    or p_expected_revision is null
    or p_expected_revision < 1 then
    raise exception using
      errcode = '22023',
      message = 'valid intake id and revision are required';
  end if;

  select *
  into v_intake
  from public.complaint_intakes ci
  where ci.id = p_intake_id
  for update;

  if not found
    or v_intake.status <> 'draft'
    or v_intake.revision <> p_expected_revision then
    raise exception using
      errcode = '22023',
      message = 'complaint intake is not in the expected draft revision';
  end if;

  if v_intake.channel = 'assisted_internal'
    and not private.complaint_intake_actor_allowed(
      v_intake.actor_id,
      v_intake.organisation_scope
    ) then
    raise exception using
      errcode = '42501',
      message = 'assisted complaint intake actor is no longer authorized';
  end if;

  v_now := clock_timestamp();

  update public.complaint_intakes
  set
    status = 'submitted',
    revision = v_intake.revision + 1,
    submitted_at = v_now,
    updated_at = v_now
  where id = v_intake.id;

  return v_intake.id;
end;
$$;

revoke all on function public.submit_complaint_intake(uuid, integer) from public, anon, authenticated;
grant execute on function public.submit_complaint_intake(uuid, integer) to service_role;

-- Explicitly allow the trusted service path to append lifecycle audit rows.
grant insert on table public.audit_events to service_role;

-- Keep authenticated auth lifecycle events working while reserving complaint
-- intake lifecycle actions for the trusted database path.
drop policy if exists audit_events_insert on public.audit_events;

create policy audit_events_insert
on public.audit_events
for insert
to authenticated
with check (
  auth.uid() is not null
  and actor_id = auth.uid()
  and action not like 'complaint_intake.%'
);
