-- WASDOK-66: privacy notice and consent/acknowledgement evidence for complaint intake.
-- Evidence is minimal, immutable and recorded atomically with trusted submission.

create table public.complaint_intake_privacy_evidence (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid not null unique references public.complaint_intakes(id),
  notice_version text not null,
  acknowledgement_required boolean not null,
  acknowledgement_method text not null,
  not_required_reason text,
  acknowledged_at timestamptz,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles(id),
  constraint complaint_intake_privacy_notice_version_check
    check (notice_version = 'OCPNG-COMPLAINT-PRIVACY-v1'),
  constraint complaint_intake_privacy_method_check
    check (acknowledgement_method in ('public_checkbox','assisted_acknowledgement','not_required')),
  constraint complaint_intake_privacy_evidence_consistency_check
    check (
      (
        acknowledgement_required = true
        and acknowledgement_method in ('public_checkbox','assisted_acknowledgement')
        and not_required_reason is null
        and acknowledged_at is not null
      )
      or
      (
        acknowledgement_required = false
        and acknowledgement_method = 'not_required'
        and not_required_reason = 'formal_correspondence_already_received'
        and acknowledged_at is null
      )
    ),
  constraint complaint_intake_privacy_actor_consistency_check
    check (
      (acknowledgement_method = 'public_checkbox' and recorded_by is null)
      or
      (acknowledgement_method in ('assisted_acknowledgement','not_required') and recorded_by is not null)
    )
);

alter table public.complaint_intake_privacy_evidence enable row level security;
alter table public.complaint_intake_privacy_evidence force row level security;

revoke all on table public.complaint_intake_privacy_evidence from public, anon, authenticated, service_role;
grant select, insert on table public.complaint_intake_privacy_evidence to service_role;

create or replace function private.guard_complaint_intake_privacy_evidence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception using
      errcode = '23514',
      message = 'complaint intake privacy evidence is immutable';
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23514',
      message = 'complaint intake privacy evidence cannot be deleted';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_complaint_intake_privacy_evidence() from public, anon, authenticated;
grant execute on function private.guard_complaint_intake_privacy_evidence() to service_role;

create trigger complaint_intake_privacy_evidence_guard
before update or delete on public.complaint_intake_privacy_evidence
for each row execute function private.guard_complaint_intake_privacy_evidence();

create or replace function private.audit_complaint_intake_privacy_evidence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intake public.complaint_intakes%rowtype;
begin
  select ci.*
  into strict v_intake
  from public.complaint_intakes ci
  where ci.id = new.intake_id;

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
    new.recorded_by,
    'complaint_intake.privacy_recorded',
    'complaint_intake',
    new.intake_id,
    jsonb_build_object(
      'channel', v_intake.channel,
      'source', v_intake.source,
      'event_source', 'wasdok-db'
    ),
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'notice_version', new.notice_version,
      'acknowledgement_required', new.acknowledgement_required,
      'acknowledgement_method', new.acknowledgement_method,
      'not_required_reason', new.not_required_reason,
      'acknowledged_at', new.acknowledged_at,
      'recorded_at', new.recorded_at
    )),
    'RESTRICTED'::public.security_classification,
    v_intake.organisation_scope,
    jsonb_build_object(
      'source', 'wasdok-complaint-privacy',
      'record_classification', v_intake.classification::text
    )
  );

  return new;
end;
$$;

revoke all on function private.audit_complaint_intake_privacy_evidence() from public, anon, authenticated;
grant execute on function private.audit_complaint_intake_privacy_evidence() to service_role;

create trigger complaint_intake_privacy_evidence_audit
after insert on public.complaint_intake_privacy_evidence
for each row execute function private.audit_complaint_intake_privacy_evidence();

-- Remove the WASDOK-65 entry point so privacy evidence cannot be bypassed by
-- callers using the previous 12-argument RPC signature.
drop function if exists public.persist_complaint_intake_submission(
  text, text, uuid, text, text, text, text, text, text, text, text, text
);

create function public.persist_complaint_intake_submission(
  p_channel text,
  p_scope text,
  p_actor_id uuid,
  p_idempotency_key_hash text,
  p_complainant_name text,
  p_email text,
  p_phone text,
  p_postal_address text,
  p_government_body text,
  p_respondent text,
  p_subject text,
  p_allegation text,
  p_privacy_notice_version text,
  p_privacy_acknowledgement_required boolean,
  p_privacy_acknowledgement_method text,
  p_privacy_not_required_reason text
)
returns table (
  intake_id uuid,
  receipt_reference text,
  submitted_at timestamptz,
  duplicate boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_scope text;
  v_hash text;
  v_complainant_name text;
  v_email text;
  v_phone text;
  v_postal_address text;
  v_government_body text;
  v_respondent text;
  v_subject text;
  v_allegation text;
  v_privacy_notice_version text;
  v_privacy_method text;
  v_privacy_reason text;
  v_privacy_required boolean;
  v_privacy_recorded_by uuid;
  v_digits text;
  v_receipt text;
  v_intake public.complaint_intakes%rowtype;
  v_privacy public.complaint_intake_privacy_evidence%rowtype;
  v_inserted_id uuid;
begin
  v_scope := nullif(btrim(coalesce(p_scope, '')), '');
  v_hash := lower(nullif(btrim(coalesce(p_idempotency_key_hash, '')), ''));
  v_complainant_name := nullif(btrim(coalesce(p_complainant_name, '')), '');
  v_email := nullif(btrim(coalesce(p_email, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  v_postal_address := nullif(btrim(coalesce(p_postal_address, '')), '');
  v_government_body := nullif(btrim(coalesce(p_government_body, '')), '');
  v_respondent := nullif(btrim(coalesce(p_respondent, '')), '');
  v_subject := nullif(btrim(coalesce(p_subject, '')), '');
  v_allegation := nullif(btrim(coalesce(p_allegation, '')), '');
  v_privacy_notice_version := nullif(btrim(coalesce(p_privacy_notice_version, '')), '');
  v_privacy_method := nullif(btrim(coalesce(p_privacy_acknowledgement_method, '')), '');
  v_privacy_reason := nullif(btrim(coalesce(p_privacy_not_required_reason, '')), '');
  v_privacy_required := p_privacy_acknowledgement_required;

  if v_scope is null then
    raise exception using errcode = '22023', message = 'complaint intake scope is required';
  end if;

  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'valid idempotency hash is required';
  end if;

  if v_complainant_name is null or length(v_complainant_name) > 200
    or v_government_body is null or length(v_government_body) > 200
    or v_subject is null or length(v_subject) > 200
    or v_allegation is null or length(v_allegation) > 5000
    or (v_email is not null and length(v_email) > 254)
    or (v_phone is not null and length(v_phone) > 40)
    or (v_postal_address is not null and length(v_postal_address) > 1000)
    or (v_respondent is not null and length(v_respondent) > 200)
    or (v_email is null and v_phone is null and v_postal_address is null) then
    raise exception using errcode = '22023', message = 'validated complaint intake fields are required';
  end if;

  if v_email is not null
    and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode = '22023', message = 'complaint intake email is invalid';
  end if;

  if v_phone is not null then
    if v_phone !~ '^\+?[0-9[:space:]().-]+$' then
      raise exception using errcode = '22023', message = 'complaint intake phone is invalid';
    end if;
    v_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
    if length(v_digits) < 7 or length(v_digits) > 15 then
      raise exception using errcode = '22023', message = 'complaint intake phone is invalid';
    end if;
  end if;

  if v_privacy_notice_version is distinct from 'OCPNG-COMPLAINT-PRIVACY-v1' then
    raise exception using errcode = '22023', message = 'approved complaint privacy notice version is required';
  end if;

  case p_channel
    when 'public_web' then
      if p_actor_id is not null then
        raise exception using errcode = '22023', message = 'public complaint intake cannot specify an actor';
      end if;
      if v_privacy_required is distinct from true
        or v_privacy_method is distinct from 'public_checkbox'
        or v_privacy_reason is not null then
        raise exception using errcode = '22023', message = 'public complaint privacy acknowledgement is required';
      end if;
      v_source := 'wasdok_public_form';
      v_privacy_recorded_by := null;

    when 'assisted_internal' then
      if p_actor_id is null then
        raise exception using errcode = '22023', message = 'assisted complaint intake requires an actor';
      end if;
      if not private.complaint_intake_actor_allowed(p_actor_id, v_scope) then
        raise exception using errcode = '42501', message = 'assisted complaint intake actor is not authorized';
      end if;
      if not (
        (
          v_privacy_required is true
          and v_privacy_method = 'assisted_acknowledgement'
          and v_privacy_reason is null
        )
        or
        (
          v_privacy_required is false
          and v_privacy_method = 'not_required'
          and v_privacy_reason = 'formal_correspondence_already_received'
        )
      ) then
        raise exception using errcode = '22023', message = 'approved assisted complaint privacy evidence is required';
      end if;
      v_source := 'wasdok_assisted_form';
      v_privacy_recorded_by := p_actor_id;

    else
      raise exception using errcode = '22023', message = 'complaint intake channel is not approved';
  end case;

  -- Fast-path exact retries. The intake row lock serializes comparison against
  -- the immutable privacy evidence record created in the same transaction.
  select ci.*
  into v_intake
  from public.complaint_intakes ci
  where ci.idempotency_key_hash = v_hash
  for update;

  if found then
    if v_intake.status <> 'submitted'
      or v_intake.channel is distinct from p_channel
      or v_intake.source is distinct from v_source
      or v_intake.actor_id is distinct from p_actor_id
      or v_intake.organisation_scope is distinct from v_scope
      or v_intake.complainant_name is distinct from v_complainant_name
      or v_intake.email is distinct from v_email
      or v_intake.phone is distinct from v_phone
      or v_intake.postal_address is distinct from v_postal_address
      or v_intake.government_body is distinct from v_government_body
      or v_intake.respondent is distinct from v_respondent
      or v_intake.subject is distinct from v_subject
      or v_intake.allegation is distinct from v_allegation then
      raise exception using errcode = '22023', message = 'idempotency key was already used for a different submission';
    end if;

    select pe.*
    into v_privacy
    from public.complaint_intake_privacy_evidence pe
    where pe.intake_id = v_intake.id;

    if not found
      or v_privacy.notice_version is distinct from v_privacy_notice_version
      or v_privacy.acknowledgement_required is distinct from v_privacy_required
      or v_privacy.acknowledgement_method is distinct from v_privacy_method
      or v_privacy.not_required_reason is distinct from v_privacy_reason
      or v_privacy.recorded_by is distinct from v_privacy_recorded_by then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different privacy evidence';
    end if;

    return query select v_intake.id, v_intake.receipt_reference, v_intake.submitted_at, true;
    return;
  end if;

  v_receipt := 'OC-RCP-'
    || to_char(clock_timestamp(), 'YYYY')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

  insert into public.complaint_intakes (
    status,
    channel,
    source,
    actor_id,
    organisation_scope,
    classification,
    revision,
    receipt_reference,
    idempotency_key_hash,
    complainant_name,
    email,
    phone,
    postal_address,
    government_body,
    respondent,
    subject,
    allegation
  ) values (
    'draft',
    p_channel,
    v_source,
    p_actor_id,
    v_scope,
    'CONFIDENTIAL'::public.security_classification,
    1,
    v_receipt,
    v_hash,
    v_complainant_name,
    v_email,
    v_phone,
    v_postal_address,
    v_government_body,
    v_respondent,
    v_subject,
    v_allegation
  )
  on conflict (idempotency_key_hash) do nothing
  returning id into v_inserted_id;

  -- A concurrent identical retry may win the unique-key race. Once its
  -- transaction commits, compare both authoritative complaint and privacy
  -- evidence and return the same receipt rather than duplicating anything.
  if v_inserted_id is null then
    select ci.*
    into v_intake
    from public.complaint_intakes ci
    where ci.idempotency_key_hash = v_hash
    for update;

    if not found
      or v_intake.status <> 'submitted'
      or v_intake.channel is distinct from p_channel
      or v_intake.source is distinct from v_source
      or v_intake.actor_id is distinct from p_actor_id
      or v_intake.organisation_scope is distinct from v_scope
      or v_intake.complainant_name is distinct from v_complainant_name
      or v_intake.email is distinct from v_email
      or v_intake.phone is distinct from v_phone
      or v_intake.postal_address is distinct from v_postal_address
      or v_intake.government_body is distinct from v_government_body
      or v_intake.respondent is distinct from v_respondent
      or v_intake.subject is distinct from v_subject
      or v_intake.allegation is distinct from v_allegation then
      raise exception using errcode = '22023', message = 'idempotency key was already used for a different submission';
    end if;

    select pe.*
    into v_privacy
    from public.complaint_intake_privacy_evidence pe
    where pe.intake_id = v_intake.id;

    if not found
      or v_privacy.notice_version is distinct from v_privacy_notice_version
      or v_privacy.acknowledgement_required is distinct from v_privacy_required
      or v_privacy.acknowledgement_method is distinct from v_privacy_method
      or v_privacy.not_required_reason is distinct from v_privacy_reason
      or v_privacy.recorded_by is distinct from v_privacy_recorded_by then
      raise exception using errcode = '22023', message = 'idempotency key was already used for different privacy evidence';
    end if;

    return query select v_intake.id, v_intake.receipt_reference, v_intake.submitted_at, true;
    return;
  end if;

  insert into public.complaint_intake_privacy_evidence (
    intake_id,
    notice_version,
    acknowledgement_required,
    acknowledgement_method,
    not_required_reason,
    acknowledged_at,
    recorded_by
  ) values (
    v_inserted_id,
    v_privacy_notice_version,
    v_privacy_required,
    v_privacy_method,
    v_privacy_reason,
    case when v_privacy_required then clock_timestamp() else null end,
    v_privacy_recorded_by
  );

  perform public.submit_complaint_intake(v_inserted_id, 1);

  select ci.*
  into strict v_intake
  from public.complaint_intakes ci
  where ci.id = v_inserted_id;

  return query select v_intake.id, v_intake.receipt_reference, v_intake.submitted_at, false;
end;
$$;

revoke all on function public.persist_complaint_intake_submission(
  text, text, uuid, text, text, text, text, text, text, text, text, text,
  text, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.persist_complaint_intake_submission(
  text, text, uuid, text, text, text, text, text, text, text, text, text,
  text, boolean, text, text
) to service_role;