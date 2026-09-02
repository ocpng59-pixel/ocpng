-- WASDOK-55 — Backup, Recovery & Disaster Recovery Administration
-- Task 2: audited human request/admin workflows and trusted worker transitions.

create table if not exists public.backup_download_requests (
  id uuid primary key default gen_random_uuid(),
  backup_id uuid not null references public.backup_jobs(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  request_reason text not null check (char_length(request_reason) between 3 and 500),
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED','GRANTED','EXPIRED','DENIED')),
  grant_reference text,
  expires_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.backup_download_requests enable row level security;

create or replace function private.require_backup_permission(p_permission_code text)
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

create or replace function private.require_backup_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'Administrative reason must be 3 to 500 characters'
      using errcode='22023';
  end if;
  return v_reason;
end;
$$;

create or replace function private.require_backup_worker()
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Backup worker authority required'
      using errcode='42501';
  end if;
end;
$$;

create or replace function private.assert_safe_backup_metadata(p_metadata jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  v_metadata jsonb := coalesce(p_metadata,'{}'::jsonb);
  v_key text;
  v_value jsonb;
begin
  if jsonb_typeof(v_metadata)='object' then
    for v_key, v_value in select key,value from jsonb_each(v_metadata)
    loop
      if lower(v_key) ~ '(password|token|secret|bearer|signed_url|encryption_key|database_url|service_role)' then
        raise exception 'Unsafe backup metadata key is not permitted'
          using errcode='22023';
      end if;
      if jsonb_typeof(v_value) in ('object','array') then
        perform private.assert_safe_backup_metadata(v_value);
      end if;
    end loop;
  elsif jsonb_typeof(v_metadata)='array' then
    for v_value in select value from jsonb_array_elements(v_metadata)
    loop
      if jsonb_typeof(v_value) in ('object','array') then
        perform private.assert_safe_backup_metadata(v_value);
      end if;
    end loop;
  end if;
  return v_metadata;
end;
$$;

create or replace function private.record_backup_audit(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text,
  p_safe_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_metadata jsonb;
begin
  v_metadata := private.assert_safe_backup_metadata(p_safe_metadata);
  v_actor := case when coalesce(auth.role(),'')='service_role' then null else auth.uid() end;

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
    v_actor,
    p_action,
    p_entity_type,
    p_entity_id,
    jsonb_build_object('source','backup_recovery_administration','wasdok','WASDOK-55'),
    p_before,
    p_after,
    p_reason,
    'RESTRICTED',
    jsonb_build_object('wasdok','WASDOK-55','safe',v_metadata)
  );
end;
$$;

create or replace function private.assert_backup_transition(p_from text,p_to text)
returns void
language plpgsql
immutable
set search_path=''
as $$
begin
  if not (
    (p_from='REQUESTED' and p_to in ('QUEUED','FAILED')) or
    (p_from='QUEUED' and p_to in ('RUNNING','FAILED')) or
    (p_from='RUNNING' and p_to in ('PACKAGING','FAILED')) or
    (p_from='PACKAGING' and p_to in ('VERIFYING','FAILED')) or
    (p_from='VERIFYING' and p_to in ('AVAILABLE','FAILED')) or
    (p_from='AVAILABLE' and p_to in ('ARCHIVED','EXPIRED')) or
    (p_from='ARCHIVED' and p_to='EXPIRED') or
    (p_from='EXPIRED' and p_to='PURGED')
  ) then
    raise exception 'Illegal backup transition % -> %', p_from,p_to
      using errcode='23514';
  end if;
end;
$$;

create or replace function private.assert_restore_transition(p_from text,p_to text)
returns void
language plpgsql
immutable
set search_path=''
as $$
begin
  if not (
    (p_from='REQUESTED' and p_to in ('IMPACT_REVIEW','REJECTED','FAILED')) or
    (p_from='IMPACT_REVIEW' and p_to in ('AWAITING_AUTHORIZATION','REJECTED','FAILED')) or
    (p_from='AUTHORIZED' and p_to in ('EXECUTING','FAILED')) or
    (p_from='EXECUTING' and p_to in ('VERIFYING','FAILED')) or
    (p_from='VERIFYING' and p_to in ('COMPLETED','FAILED'))
  ) then
    raise exception 'Illegal restore transition % -> %', p_from,p_to
      using errcode='23514';
  end if;
end;
$$;

create or replace function public.request_backup(p_backup_type text,p_reason text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_type public.backup_type;
  v_job public.backup_jobs;
begin
  v_actor := private.require_backup_permission('backup.create');
  v_reason := private.require_backup_reason(p_reason);
  begin
    v_type := p_backup_type::public.backup_type;
  exception when invalid_text_representation then
    raise exception 'Unknown backup type' using errcode='22023';
  end;

  insert into public.backup_jobs(backup_type,status,requested_by,request_reason)
  values(v_type,'REQUESTED',v_actor,v_reason)
  returning * into v_job;

  perform private.record_backup_audit(
    'backup.requested','backup_job',v_job.id,null,
    jsonb_build_object('backup_code',v_job.backup_code,'backup_type',v_job.backup_type,'status',v_job.status),
    v_reason
  );
  return v_job.id;
end;
$$;

create or replace function public.record_backup_worker_transition(
  p_backup_id uuid,p_from text,p_to text,p_safe_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before public.backup_jobs;
  v_after public.backup_jobs;
  v_metadata jsonb;
begin
  perform private.require_backup_worker();
  v_metadata := private.assert_safe_backup_metadata(p_safe_metadata);

  select * into v_before from public.backup_jobs where id=p_backup_id for update;
  if not found then raise exception 'Backup job not found' using errcode='P0002'; end if;
  if v_before.status::text <> p_from then
    raise exception 'Backup state changed from expected %',p_from using errcode='23514';
  end if;
  perform private.assert_backup_transition(p_from,p_to);

  if p_to='AVAILABLE' and not exists(
    select 1 from public.backup_verifications
    where backup_id=p_backup_id and status='PASSED'
  ) then
    raise exception 'Backup cannot become AVAILABLE without PASSED verification'
      using errcode='23514';
  end if;

  update public.backup_jobs
  set status=p_to::public.backup_job_status,
      started_at=case when p_to='RUNNING' then coalesce(started_at,now()) else started_at end,
      completed_at=case when p_to in ('AVAILABLE','FAILED') then now() else completed_at end,
      verified_at=case when p_to='AVAILABLE' then now() else verified_at end,
      updated_at=now()
  where id=p_backup_id
  returning * into v_after;

  perform private.record_backup_audit(
    'backup.status_changed','backup_job',p_backup_id,
    jsonb_build_object('status',v_before.status),
    jsonb_build_object('status',v_after.status),
    'Trusted backup worker transition',v_metadata
  );
end;
$$;

create or replace function public.record_backup_verification(
  p_backup_id uuid,p_status text,p_safe_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_job public.backup_jobs;
  v_status public.backup_verification_status;
  v_metadata jsonb;
begin
  perform private.require_backup_worker();
  v_metadata := private.assert_safe_backup_metadata(p_safe_metadata);
  begin
    v_status := p_status::public.backup_verification_status;
  exception when invalid_text_representation then
    raise exception 'Unknown backup verification status' using errcode='22023';
  end;
  if v_status='PENDING' then
    raise exception 'Worker must record a terminal verification result' using errcode='23514';
  end if;

  select * into v_job from public.backup_jobs where id=p_backup_id for update;
  if not found then raise exception 'Backup job not found' using errcode='P0002'; end if;
  if v_job.status <> 'VERIFYING' then
    raise exception 'Backup must be VERIFYING before verification result'
      using errcode='23514';
  end if;

  insert into public.backup_verifications(
    backup_id,status,verification_version,verified_at,safe_metadata
  ) values (
    p_backup_id,v_status,'WASDOK-55-v1',now(),v_metadata
  );

  perform private.record_backup_audit(
    case when v_status='PASSED' then 'backup.verified' else 'backup.verification_failed' end,
    'backup_job',p_backup_id,
    jsonb_build_object('status',v_job.status),
    jsonb_build_object('verification_status',v_status),
    'Trusted backup verification result',v_metadata
  );
end;
$$;

create or replace function public.request_backup_download(p_backup_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_job public.backup_jobs;
  v_request public.backup_download_requests;
begin
  v_actor := private.require_backup_permission('backup.download');
  v_reason := private.require_backup_reason(p_reason);
  select * into v_job from public.backup_jobs where id=p_backup_id for share;
  if not found then raise exception 'Backup job not found' using errcode='P0002'; end if;
  if v_job.status <> 'AVAILABLE' or not exists(
    select 1 from public.backup_verifications where backup_id=p_backup_id and status='PASSED'
  ) then
    raise exception 'Only verified AVAILABLE backups may be downloaded' using errcode='23514';
  end if;

  insert into public.backup_download_requests(backup_id,requested_by,request_reason,status)
  values(p_backup_id,v_actor,v_reason,'REQUESTED') returning * into v_request;

  perform private.record_backup_audit(
    'backup.download_requested','backup_download_request',v_request.id,null,
    jsonb_build_object('backup_id',p_backup_id,'status',v_request.status),v_reason
  );
  return v_request.id;
end;
$$;

create or replace function public.request_restore_test(p_backup_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_job public.backup_jobs;
  v_restore public.restore_runs;
begin
  v_actor := private.require_backup_permission('backup.restore_test');
  v_reason := private.require_backup_reason(p_reason);
  select * into v_job from public.backup_jobs where id=p_backup_id for share;
  if not found then raise exception 'Backup job not found' using errcode='P0002'; end if;
  if v_job.status <> 'AVAILABLE' or not exists(
    select 1 from public.backup_verifications where backup_id=p_backup_id and status='PASSED'
  ) then
    raise exception 'Restore rehearsal requires a verified AVAILABLE backup' using errcode='23514';
  end if;

  insert into public.restore_runs(
    restore_type,status,backup_id,requested_by,request_reason
  ) values ('TEST','REQUESTED',p_backup_id,v_actor,v_reason)
  returning * into v_restore;

  perform private.record_backup_audit(
    'restore.test_requested','restore_run',v_restore.id,null,
    jsonb_build_object('restore_type',v_restore.restore_type,'status',v_restore.status,'backup_id',p_backup_id),
    v_reason
  );
  return v_restore.id;
end;
$$;

create or replace function public.request_production_restore(
  p_recovery_ref text,p_recovery_time timestamptz,p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_point public.provider_recovery_points;
  v_restore public.restore_runs;
begin
  v_actor := private.require_backup_permission('backup.restore_production');
  v_reason := private.require_backup_reason(p_reason);

  select * into v_point
  from public.provider_recovery_points
  where recovery_reference=btrim(coalesce(p_recovery_ref,''))
    and recovery_time is not distinct from p_recovery_time
    and available
  order by observed_at desc
  limit 1;
  if not found then raise exception 'Available recovery point not found' using errcode='P0002'; end if;

  insert into public.restore_runs(
    restore_type,status,provider_recovery_point_id,requested_by,request_reason,requested_recovery_time
  ) values (
    'PRODUCTION','REQUESTED',v_point.id,v_actor,v_reason,p_recovery_time
  ) returning * into v_restore;

  perform private.record_backup_audit(
    'restore.production_requested','restore_run',v_restore.id,null,
    jsonb_build_object('restore_type',v_restore.restore_type,'status',v_restore.status,
      'provider_recovery_point_id',v_point.id,'requested_recovery_time',p_recovery_time),
    v_reason
  );
  return v_restore.id;
end;
$$;

create or replace function public.record_restore_worker_transition(
  p_restore_id uuid,p_from text,p_to text,p_safe_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before public.restore_runs;
  v_after public.restore_runs;
  v_metadata jsonb;
begin
  perform private.require_backup_worker();
  v_metadata := private.assert_safe_backup_metadata(p_safe_metadata);
  select * into v_before from public.restore_runs where id=p_restore_id for update;
  if not found then raise exception 'Restore run not found' using errcode='P0002'; end if;
  if v_before.status::text <> p_from then
    raise exception 'Restore state changed from expected %',p_from using errcode='23514';
  end if;
  perform private.assert_restore_transition(p_from,p_to);

  update public.restore_runs
  set status=p_to::public.restore_run_status,
      started_at=case when p_to='EXECUTING' then coalesce(started_at,now()) else started_at end,
      completed_at=case when p_to in ('COMPLETED','FAILED','REJECTED') then now() else completed_at end,
      safe_metadata=safe_metadata || v_metadata,
      updated_at=now()
  where id=p_restore_id
  returning * into v_after;

  perform private.record_backup_audit(
    'restore.status_changed','restore_run',p_restore_id,
    jsonb_build_object('status',v_before.status),jsonb_build_object('status',v_after.status),
    'Trusted restore worker transition',v_metadata
  );
end;
$$;

create or replace function public.authorize_production_restore(p_restore_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_restore public.restore_runs;
begin
  v_actor := private.require_backup_permission('backup.authorize_production_restore');
  v_reason := private.require_backup_reason(p_reason);
  select * into v_restore from public.restore_runs where id=p_restore_id for update;
  if not found then raise exception 'Restore run not found' using errcode='P0002'; end if;
  if v_restore.restore_type <> 'PRODUCTION' or v_restore.status <> 'AWAITING_AUTHORIZATION' then
    raise exception 'Restore is not awaiting production authorization' using errcode='23514';
  end if;
  if v_actor=v_restore.requested_by then
    raise exception 'Requester cannot authorize own production restore' using errcode='42501';
  end if;

  insert into public.restore_authorizations(
    restore_run_id,requester_user_id,authorizer_user_id,authorization_reason
  ) values (p_restore_id,v_restore.requested_by,v_actor,v_reason);

  update public.restore_runs set status='AUTHORIZED',updated_at=now() where id=p_restore_id;

  perform private.record_backup_audit(
    'restore.production_authorized','restore_run',p_restore_id,
    jsonb_build_object('status','AWAITING_AUTHORIZATION'),
    jsonb_build_object('status','AUTHORIZED','authorizer_user_id',v_actor),v_reason
  );
end;
$$;

create or replace function public.admin_upsert_backup_schedule(
  p_schedule_id uuid,p_backup_type text,p_cadence text,p_retention_policy_id uuid,
  p_enabled boolean,p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_type public.backup_type;
  v_id uuid := coalesce(p_schedule_id,gen_random_uuid());
  v_name text;
  v_cadence text := btrim(coalesce(p_cadence,''));
begin
  v_actor := private.require_backup_permission('backup.schedule');
  v_reason := private.require_backup_reason(p_reason);
  if length(v_cadence)<1 or length(v_cadence)>200 then
    raise exception 'Invalid backup schedule cadence' using errcode='22023';
  end if;
  begin v_type := p_backup_type::public.backup_type;
  exception when invalid_text_representation then
    raise exception 'Unknown backup type' using errcode='22023';
  end;
  if p_retention_policy_id is not null and not exists(
    select 1 from public.backup_retention_policies where id=p_retention_policy_id and is_active
  ) then
    raise exception 'Active retention policy not found' using errcode='P0002';
  end if;

  if p_schedule_id is null then
    v_name := v_type::text || ' schedule ' || left(v_id::text,8);
    insert into public.backup_schedules(
      id,name,backup_type,cadence,retention_policy_id,enabled,created_by,updated_by,change_reason
    ) values (
      v_id,v_name,v_type,v_cadence,p_retention_policy_id,coalesce(p_enabled,true),v_actor,v_actor,v_reason
    );
  else
    update public.backup_schedules
    set backup_type=v_type,cadence=v_cadence,retention_policy_id=p_retention_policy_id,
        enabled=coalesce(p_enabled,enabled),updated_by=v_actor,change_reason=v_reason,updated_at=now()
    where id=v_id;
    if not found then raise exception 'Backup schedule not found' using errcode='P0002'; end if;
  end if;

  perform private.record_backup_audit(
    'backup.schedule_changed','backup_schedule',v_id,null,
    jsonb_build_object('backup_type',v_type,'cadence',v_cadence,'enabled',coalesce(p_enabled,true)),v_reason
  );
  return v_id;
end;
$$;

create or replace function public.admin_upsert_retention_policy(
  p_policy_id uuid,p_name text,p_retention_days integer,p_purge_enabled boolean,p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_id uuid := coalesce(p_policy_id,gen_random_uuid());
  v_name text := btrim(coalesce(p_name,''));
begin
  v_actor := private.require_backup_permission('backup.manage_retention');
  v_reason := private.require_backup_reason(p_reason);
  if v_name='' or length(v_name)>200 or p_retention_days is null or p_retention_days<=0 then
    raise exception 'Invalid backup retention policy' using errcode='22023';
  end if;

  if p_policy_id is null then
    insert into public.backup_retention_policies(
      id,name,retention_days,purge_enabled,created_by,updated_by,change_reason
    ) values (
      v_id,v_name,p_retention_days,coalesce(p_purge_enabled,false),v_actor,v_actor,v_reason
    );
  else
    update public.backup_retention_policies
    set name=v_name,retention_days=p_retention_days,purge_enabled=coalesce(p_purge_enabled,purge_enabled),
        updated_by=v_actor,change_reason=v_reason,updated_at=now()
    where id=v_id;
    if not found then raise exception 'Backup retention policy not found' using errcode='P0002'; end if;
  end if;

  perform private.record_backup_audit(
    'backup.retention_changed','backup_retention_policy',v_id,null,
    jsonb_build_object('name',v_name,'retention_days',p_retention_days,'purge_enabled',coalesce(p_purge_enabled,false)),v_reason
  );
  return v_id;
end;
$$;
