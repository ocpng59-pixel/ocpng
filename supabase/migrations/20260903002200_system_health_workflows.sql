-- WASDOK-85 — System Health, Capacity & Operational Monitoring Dashboard
-- Task 2: trusted ingestion, deterministic threshold/alert lifecycle, audited administration,
-- and normalized permission-gated read models.

create or replace function private.require_health_permission(p_permission_code text)
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
    raise exception 'Access denied for %', p_permission_code using errcode='42501';
  end if;
  return v_actor;
end;
$$;

create or replace function private.require_health_worker()
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'System health worker authority required' using errcode='42501';
  end if;
end;
$$;

create or replace function private.require_health_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_reason text := btrim(coalesce(p_reason,''));
begin
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'Administrative reason must be 3 to 500 characters' using errcode='22023';
  end if;
  return v_reason;
end;
$$;

create or replace function private.assert_safe_health_metadata(p_metadata jsonb)
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
    for v_key,v_value in select key,value from jsonb_each(v_metadata)
    loop
      if lower(v_key) ~ '(password|token|secret|bearer|signed_url|api_key|database_url|service_role|authorization|cookie|raw_payload|payload)' then
        raise exception 'Unsafe health metadata key is not permitted' using errcode='22023';
      end if;
      if jsonb_typeof(v_value) in ('object','array') then
        perform private.assert_safe_health_metadata(v_value);
      end if;
    end loop;
  elsif jsonb_typeof(v_metadata)='array' then
    for v_value in select value from jsonb_array_elements(v_metadata)
    loop
      if jsonb_typeof(v_value) in ('object','array') then
        perform private.assert_safe_health_metadata(v_value);
      end if;
    end loop;
  end if;
  return v_metadata;
end;
$$;

create or replace function private.record_health_audit(
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
  v_metadata := private.assert_safe_health_metadata(p_safe_metadata);
  v_actor := case when coalesce(auth.role(),'')='service_role' then null else auth.uid() end;

  insert into public.audit_events(
    actor_id,action,entity_type,entity_id,request_metadata,before_data,after_data,
    reason,classification,metadata
  ) values (
    v_actor,p_action,p_entity_type,p_entity_id,
    jsonb_build_object('source','system_health_administration','wasdok','WASDOK-85'),
    p_before,p_after,p_reason,'RESTRICTED',
    jsonb_build_object('wasdok','WASDOK-85','safe',v_metadata)
  );
end;
$$;

create or replace function private.evaluate_health_threshold(p_metric_code text,p_value numeric)
returns public.health_status
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_threshold public.system_health_thresholds;
begin
  select * into v_threshold
  from public.system_health_thresholds
  where metric_code=p_metric_code and is_active
  limit 1;

  if not found then return 'UNKNOWN'; end if;

  if v_threshold.direction='ABOVE_IS_BAD' then
    if p_value >= v_threshold.critical_value then return 'CRITICAL'; end if;
    if p_value >= v_threshold.warning_value then return 'WARNING'; end if;
    return 'HEALTHY';
  end if;

  if p_value <= v_threshold.critical_value then return 'CRITICAL'; end if;
  if p_value <= v_threshold.warning_value then return 'WARNING'; end if;
  return 'HEALTHY';
end;
$$;

create unique index if not exists system_health_alerts_one_active_per_metric
on public.system_health_alerts(metric_code)
where status in ('OPEN','ACKNOWLEDGED');

create or replace function public.record_health_snapshot(
  p_source text,
  p_observed_at timestamptz,
  p_metrics jsonb,
  p_safe_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_source text := btrim(coalesce(p_source,''));
  v_metadata jsonb;
  v_snapshot_id uuid;
  v_snapshot_status public.health_status := 'HEALTHY';
  v_item jsonb;
  v_metric_code text;
  v_reason text;
  v_value numeric;
  v_catalog public.health_metric_catalog;
  v_status public.health_status;
  v_threshold_id uuid;
  v_alert_id uuid;
  v_keys text[];
begin
  perform private.require_health_worker();
  v_metadata := private.assert_safe_health_metadata(p_safe_metadata);

  if length(v_source)<2 or length(v_source)>64 or p_observed_at is null then
    raise exception 'Invalid health snapshot source or observation time' using errcode='22023';
  end if;
  if jsonb_typeof(p_metrics) <> 'array' or jsonb_array_length(p_metrics)=0 or jsonb_array_length(p_metrics)>100 then
    raise exception 'Health metrics must be a non-empty bounded array' using errcode='22023';
  end if;

  insert into public.system_health_snapshots(source,provider,status,observed_at,safe_metadata)
  values(v_source,'wasdok-health-worker','UNKNOWN',p_observed_at,v_metadata)
  returning id into v_snapshot_id;

  for v_item in select value from jsonb_array_elements(p_metrics)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each health metric must be an object' using errcode='22023';
    end if;

    select array_agg(key order by key) into v_keys from jsonb_object_keys(v_item) key;
    if exists(
      select 1 from unnest(coalesce(v_keys,array[]::text[])) k
      where k not in ('metric_code','value','reason')
    ) then
      raise exception 'Unsupported health metric field' using errcode='22023';
    end if;

    v_metric_code := btrim(coalesce(v_item->>'metric_code',''));
    v_reason := nullif(btrim(coalesce(v_item->>'reason','')), '');
    if v_reason is not null and length(v_reason)>500 then
      raise exception 'Health metric reason is too long' using errcode='22023';
    end if;

    select * into v_catalog
    from public.health_metric_catalog
    where metric_code=v_metric_code and is_active;
    if not found then
      raise exception 'Unknown health metric code' using errcode='22023';
    end if;

    begin
      if not (v_item ? 'value') or jsonb_typeof(v_item->'value') <> 'number' then
        raise exception 'Health metric value must be numeric' using errcode='22023';
      end if;
      v_value := (v_item->>'value')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Health metric value must be numeric' using errcode='22023';
    end;

    v_status := private.evaluate_health_threshold(v_metric_code,v_value);

    insert into public.system_health_metric_samples(
      snapshot_id,metric_code,numeric_value,status,reason,source,provider,
      observed_at,stale_after_seconds,safe_metadata
    ) values (
      v_snapshot_id,v_metric_code,v_value,v_status,v_reason,v_source,
      coalesce(v_catalog.provider,v_source),p_observed_at,v_catalog.stale_after_seconds,'{}'::jsonb
    );

    if v_status='CRITICAL' then
      v_snapshot_status := 'CRITICAL';
    elsif v_status='WARNING' and v_snapshot_status <> 'CRITICAL' then
      v_snapshot_status := 'WARNING';
    elsif v_status='UNKNOWN' and v_snapshot_status='HEALTHY' then
      v_snapshot_status := 'UNKNOWN';
    end if;

    select id into v_threshold_id
    from public.system_health_thresholds
    where metric_code=v_metric_code and is_active
    limit 1;

    if v_status in ('WARNING','CRITICAL') then
      select id into v_alert_id
      from public.system_health_alerts
      where metric_code=v_metric_code and status in ('OPEN','ACKNOWLEDGED')
      order by opened_at desc limit 1 for update;

      if found then
        update public.system_health_alerts
        set severity=v_status,
            current_value=v_value,
            reason=coalesce(v_reason,'Metric crossed configured health threshold'),
            source=v_source,
            provider=coalesce(v_catalog.provider,v_source),
            threshold_id=v_threshold_id,
            updated_at=now()
        where id=v_alert_id;
      else
        insert into public.system_health_alerts(
          metric_code,threshold_id,status,severity,current_value,reason,source,provider
        ) values (
          v_metric_code,v_threshold_id,'OPEN',v_status,v_value,
          coalesce(v_reason,'Metric crossed configured health threshold'),v_source,
          coalesce(v_catalog.provider,v_source)
        );
      end if;
    elsif v_status='HEALTHY' then
      update public.system_health_alerts
      set status='RESOLVED',resolved_at=now(),current_value=v_value,
          reason=coalesce(v_reason,'Metric returned to healthy range'),updated_at=now()
      where metric_code=v_metric_code and status in ('OPEN','ACKNOWLEDGED');
    end if;
  end loop;

  update public.system_health_snapshots
  set status=v_snapshot_status
  where id=v_snapshot_id;

  return v_snapshot_id;
end;
$$;

create or replace function public.admin_set_health_threshold(
  p_metric_code text,
  p_warning numeric,
  p_critical numeric,
  p_direction text,
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
  v_metric_code text := btrim(coalesce(p_metric_code,''));
  v_direction text := upper(btrim(coalesce(p_direction,'')));
  v_id uuid;
  v_before jsonb;
begin
  v_actor := private.require_health_permission('system.health.manage');
  v_reason := private.require_health_reason(p_reason);

  if not exists(select 1 from public.health_metric_catalog where metric_code=v_metric_code and is_active) then
    raise exception 'Unknown health metric code' using errcode='22023';
  end if;
  if p_warning is null or p_critical is null or v_direction not in ('ABOVE_IS_BAD','BELOW_IS_BAD') then
    raise exception 'Invalid health threshold configuration' using errcode='22023';
  end if;
  if (v_direction='ABOVE_IS_BAD' and p_critical <= p_warning)
     or (v_direction='BELOW_IS_BAD' and p_critical >= p_warning) then
    raise exception 'Health threshold warning/critical ordering is invalid' using errcode='22023';
  end if;

  select jsonb_build_object(
    'warning_value',warning_value,'critical_value',critical_value,
    'direction',direction,'is_active',is_active
  ) into v_before
  from public.system_health_thresholds where metric_code=v_metric_code;

  insert into public.system_health_thresholds(
    metric_code,warning_value,critical_value,direction,is_active,
    created_by,updated_by,change_reason
  ) values (
    v_metric_code,p_warning,p_critical,v_direction,true,v_actor,v_actor,v_reason
  )
  on conflict (metric_code) do update set
    warning_value=excluded.warning_value,
    critical_value=excluded.critical_value,
    direction=excluded.direction,
    updated_by=excluded.updated_by,
    change_reason=excluded.change_reason,
    updated_at=now()
  returning id into v_id;

  perform private.record_health_audit(
    'health.threshold_changed','system_health_threshold',v_id,v_before,
    jsonb_build_object('metric_code',v_metric_code,'warning_value',p_warning,
      'critical_value',p_critical,'direction',v_direction),v_reason
  );
  return v_id;
end;
$$;

create or replace function public.admin_set_health_threshold_active(
  p_threshold_id uuid,
  p_active boolean,
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
  v_before public.system_health_thresholds;
  v_after public.system_health_thresholds;
begin
  v_actor := private.require_health_permission('system.health.manage');
  v_reason := private.require_health_reason(p_reason);
  if p_threshold_id is null or p_active is null then
    raise exception 'Threshold identifier and active state are required' using errcode='22023';
  end if;

  select * into v_before from public.system_health_thresholds where id=p_threshold_id for update;
  if not found then raise exception 'Health threshold not found' using errcode='P0002'; end if;

  update public.system_health_thresholds
  set is_active=p_active,updated_by=v_actor,change_reason=v_reason,updated_at=now()
  where id=p_threshold_id returning * into v_after;

  perform private.record_health_audit(
    'health.threshold_changed','system_health_threshold',p_threshold_id,
    jsonb_build_object('is_active',v_before.is_active),
    jsonb_build_object('is_active',v_after.is_active),v_reason
  );
end;
$$;

create or replace function public.acknowledge_health_alert(p_alert_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid;
  v_reason text;
  v_before public.system_health_alerts;
begin
  v_actor := private.require_health_permission('system.health.manage');
  v_reason := private.require_health_reason(p_reason);
  if p_alert_id is null then raise exception 'Health alert identifier is required' using errcode='22023'; end if;

  select * into v_before from public.system_health_alerts where id=p_alert_id for update;
  if not found then raise exception 'Health alert not found' using errcode='P0002'; end if;
  if v_before.status <> 'OPEN' then
    raise exception 'Only OPEN health alerts may be acknowledged' using errcode='23514';
  end if;

  update public.system_health_alerts
  set status='ACKNOWLEDGED',acknowledged_by=v_actor,acknowledged_at=now(),
      acknowledgment_reason=v_reason,updated_at=now()
  where id=p_alert_id;

  perform private.record_health_audit(
    'health.alert_acknowledged','system_health_alert',p_alert_id,
    jsonb_build_object('status',v_before.status),
    jsonb_build_object('status','ACKNOWLEDGED','acknowledged_by',v_actor),v_reason
  );
end;
$$;

create or replace function public.read_system_health_latest_metrics(p_domain text default null)
returns table(
  metric_code text,
  domain text,
  name text,
  unit text,
  numeric_value numeric,
  status public.health_status,
  reason text,
  source text,
  provider text,
  observed_at timestamptz,
  collected_at timestamptz,
  stale_after_seconds integer
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(auth.role(),'')='service_role' then return; end if;
  perform private.require_health_permission('system.health.view');

  return query
  select distinct on (s.metric_code)
    s.metric_code,c.domain,c.name,c.unit,s.numeric_value,s.status,s.reason,
    s.source,s.provider,s.observed_at,s.collected_at,s.stale_after_seconds
  from public.system_health_metric_samples s
  join public.health_metric_catalog c on c.metric_code=s.metric_code and c.is_active
  where p_domain is null or c.domain=p_domain
  order by s.metric_code,s.observed_at desc,s.collected_at desc,s.id desc;
end;
$$;

create or replace function public.read_system_health_thresholds()
returns table(
  id uuid,
  metric_code text,
  warning_value numeric,
  critical_value numeric,
  direction text,
  is_active boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(auth.role(),'')='service_role' then return; end if;
  perform private.require_health_permission('system.health.view');
  return query
  select t.id,t.metric_code,t.warning_value,t.critical_value,t.direction,t.is_active,t.updated_at
  from public.system_health_thresholds t
  order by t.metric_code;
end;
$$;

create or replace function public.read_system_health_alerts(p_status text default null)
returns table(
  id uuid,
  metric_code text,
  status public.health_alert_status,
  severity public.health_status,
  current_value numeric,
  reason text,
  source text,
  provider text,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_status text := nullif(upper(btrim(coalesce(p_status,''))), '');
begin
  if coalesce(auth.role(),'')='service_role' then return; end if;
  perform private.require_health_permission('system.health.view');
  if v_status is not null and v_status not in ('OPEN','ACKNOWLEDGED','RESOLVED') then
    raise exception 'Unknown health alert status' using errcode='22023';
  end if;
  return query
  select a.id,a.metric_code,a.status,a.severity,a.current_value,a.reason,
    a.source,a.provider,a.opened_at,a.acknowledged_at,a.resolved_at,a.updated_at
  from public.system_health_alerts a
  where v_status is null or a.status::text=v_status
  order by a.opened_at desc,a.id;
end;
$$;

create or replace function public.read_deployment_health_state()
returns table(
  id uuid,
  environment text,
  deployed_commit text,
  release_id text,
  expected_schema_version text,
  applied_schema_version text,
  status public.health_status,
  source text,
  provider text,
  observed_at timestamptz,
  collected_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(auth.role(),'')='service_role' then return; end if;
  perform private.require_health_permission('system.health.view');
  return query
  select d.id,d.environment,d.deployed_commit,d.release_id,d.expected_schema_version,
    d.applied_schema_version,d.status,d.source,d.provider,d.observed_at,d.collected_at,d.updated_at
  from public.deployment_health_state d
  order by d.environment;
end;
$$;
