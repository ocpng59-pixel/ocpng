-- WASDOK-65: persist validated complaint intake content with controlled receipts
-- and idempotent trusted-server submission. Public UI activation remains gated
-- until the WASDOK-66 privacy/consent control is approved.

alter table public.complaint_intakes
  add column receipt_reference text,
  add column idempotency_key_hash text,
  add column complainant_name text,
  add column email text,
  add column phone text,
  add column postal_address text,
  add column government_body text,
  add column respondent text,
  add column subject text,
  add column allegation text;

alter table public.complaint_intakes
  add constraint complaint_intakes_receipt_reference_unique unique (receipt_reference),
  add constraint complaint_intakes_idempotency_key_hash_unique unique (idempotency_key_hash),
  add constraint complaint_intakes_receipt_reference_format_check
    check (
      receipt_reference is null
      or receipt_reference ~ '^OC-RCP-[0-9]{4}-[A-F0-9]{16}$'
    ),
  add constraint complaint_intakes_idempotency_key_hash_format_check
    check (
      idempotency_key_hash is null
      or idempotency_key_hash ~ '^[0-9a-f]{64}$'
    ),
  add constraint complaint_intakes_persisted_payload_check
    check (
      (
        idempotency_key_hash is null
        and receipt_reference is null
        and complainant_name is null
        and email is null
        and phone is null
        and postal_address is null
        and government_body is null
        and respondent is null
        and subject is null
        and allegation is null
      )
      or
      (
        idempotency_key_hash is not null
        and receipt_reference is not null
        and complainant_name is not null
        and length(complainant_name) between 1 and 200
        and (email is null or length(email) between 1 and 254)
        and (phone is null or length(phone) between 1 and 40)
        and (postal_address is null or length(postal_address) between 1 and 1000)
        and government_body is not null
        and length(government_body) between 1 and 200
        and (respondent is null or length(respondent) between 1 and 200)
        and subject is not null
        and length(subject) between 1 and 200
        and allegation is not null
        and length(allegation) between 1 and 5000
        and (email is not null or phone is not null or postal_address is not null)
      )
    );

-- Expand the WASDOK-64 mutation guard so persisted complaint content and
-- receipt/idempotency evidence cannot be altered after authoritative insert.
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
    or old.created_at is distinct from new.created_at
    or old.receipt_reference is distinct from new.receipt_reference
    or old.idempotency_key_hash is distinct from new.idempotency_key_hash
    or old.complainant_name is distinct from new.complainant_name
    or old.email is distinct from new.email
    or old.phone is distinct from new.phone
    or old.postal_address is distinct from new.postal_address
    or old.government_body is distinct from new.government_body
    or old.respondent is distinct from new.respondent
    or old.subject is distinct from new.subject
    or old.allegation is distinct from new.allegation then
    raise exception using
      errcode = '23514',
      message = 'complaint intake provenance and persisted content are immutable';
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

-- Add the submission timestamp to lifecycle evidence while continuing to keep
-- complaint content, contact details, receipt and idempotency values out of audit.
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
    jsonb_strip_nulls(jsonb_build_object(
      'status', new.status,
      'revision', new.revision,
      'submitted_at', new.submitted_at
    )),
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

create or replace function public.persist_complaint_intake_submission(
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
  p_allegation text
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
  v_digits text;
  v_receipt text;
  v_intake public.complaint_intakes%rowtype;
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

  case p_channel
    when 'public_web' then
      if p_actor_id is not null then
        raise exception using errcode = '22023', message = 'public complaint intake cannot specify an actor';
      end if;
      v_source := 'wasdok_public_form';

    when 'assisted_internal' then
      if p_actor_id is null then
        raise exception using errcode = '22023', message = 'assisted complaint intake requires an actor';
      end if;
      if not private.complaint_intake_actor_allowed(p_actor_id, v_scope) then
        raise exception using errcode = '42501', message = 'assisted complaint intake actor is not authorized';
      end if;
      v_source := 'wasdok_assisted_form';

    else
      raise exception using errcode = '22023', message = 'complaint intake channel is not approved';
  end case;

  -- Fast-path exact retries. Lock the existing row so comparison and return are
  -- stable while concurrent callers settle.
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

  -- A concurrent identical retry may win the unique-key race. Once the winner
  -- commits, compare its authoritative row and return it rather than duplicating.
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

    return query select v_intake.id, v_intake.receipt_reference, v_intake.submitted_at, true;
    return;
  end if;

  perform public.submit_complaint_intake(v_inserted_id, 1);

  select ci.*
  into strict v_intake
  from public.complaint_intakes ci
  where ci.id = v_inserted_id;

  return query select v_intake.id, v_intake.receipt_reference, v_intake.submitted_at, false;
end;
$$;

revoke all on function public.persist_complaint_intake_submission(
  text, text, uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.persist_complaint_intake_submission(
  text, text, uuid, text, text, text, text, text, text, text, text, text
) to service_role;
