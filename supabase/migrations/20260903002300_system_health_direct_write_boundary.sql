-- WASDOK-85 — System Health, Capacity & Operational Monitoring Dashboard
-- Task 3: final browser direct-access boundary and explicit RPC grants.

-- Deployment/schema-drift collection needs the latest applied migration version,
-- but migration history must never be exposed to browser sessions.
create or replace function public.read_applied_schema_version()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select max(version)::text
  from supabase_migrations.schema_migrations;
$$;

-- Health operational metadata is never accessed directly by browser roles.
-- Human reads flow only through normalized SECURITY DEFINER RPCs that enforce
-- system.health.view; mutations flow through audited system.health.manage RPCs.
revoke select, insert, update, delete on table public.health_metric_catalog from anon, authenticated;
revoke select, insert, update, delete on table public.system_health_snapshots from anon, authenticated;
revoke select, insert, update, delete on table public.system_health_metric_samples from anon, authenticated;
revoke select, insert, update, delete on table public.system_health_thresholds from anon, authenticated;
revoke select, insert, update, delete on table public.system_health_alerts from anon, authenticated;
revoke select, insert, update, delete on table public.deployment_health_state from anon, authenticated;

-- Private helpers are implementation details, never application RPC surfaces.
revoke all on function private.require_health_permission(text) from public, anon, authenticated;
revoke all on function private.require_health_worker() from public, anon, authenticated;
revoke all on function private.require_health_reason(text) from public, anon, authenticated;
revoke all on function private.assert_safe_health_metadata(jsonb) from public, anon, authenticated;
revoke all on function private.record_health_audit(text,text,uuid,jsonb,jsonb,text,jsonb) from public, anon, authenticated;
revoke all on function private.evaluate_health_threshold(text,numeric) from public, anon, authenticated;

-- Remove PostgreSQL's default PUBLIC execution from every WASDOK-85 RPC.
revoke all on function public.record_health_snapshot(text,timestamptz,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.admin_set_health_threshold(text,numeric,numeric,text,text) from public, anon, authenticated;
revoke all on function public.admin_set_health_threshold_active(uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.acknowledge_health_alert(uuid,text) from public, anon, authenticated;
revoke all on function public.read_system_health_latest_metrics(text) from public, anon, authenticated;
revoke all on function public.read_system_health_thresholds() from public, anon, authenticated;
revoke all on function public.read_system_health_alerts(text) from public, anon, authenticated;
revoke all on function public.read_deployment_health_state() from public, anon, authenticated;
revoke all on function public.read_applied_schema_version() from public, anon, authenticated;

-- Human-facing RPCs are authenticated-only. Each RPC performs the authoritative
-- system.health.view/system.health.manage check internally at the database boundary.
grant execute on function public.admin_set_health_threshold(text,numeric,numeric,text,text) to authenticated;
grant execute on function public.admin_set_health_threshold_active(uuid,boolean,text) to authenticated;
grant execute on function public.acknowledge_health_alert(uuid,text) to authenticated;
grant execute on function public.read_system_health_latest_metrics(text) to authenticated;
grant execute on function public.read_system_health_thresholds() to authenticated;
grant execute on function public.read_system_health_alerts(text) to authenticated;
grant execute on function public.read_deployment_health_state() to authenticated;

-- Infrastructure-only RPCs cannot be invoked by browser roles.
grant execute on function public.record_health_snapshot(text,timestamptz,jsonb,jsonb) to service_role;
grant execute on function public.read_applied_schema_version() to service_role;

-- Task 7: keep the existing metric-ingestion/threshold/alert implementation intact,
-- but move it behind an internal boundary so the public worker RPC can also record
-- a failed provider as a real UNKNOWN source state without inventing a metric.
alter function public.record_health_snapshot(text,timestamptz,jsonb,jsonb) set schema private;
alter function private.record_health_snapshot(text,timestamptz,jsonb,jsonb) rename to record_health_snapshot_with_metrics;
revoke all on function private.record_health_snapshot_with_metrics(text,timestamptz,jsonb,jsonb)
  from public, anon, authenticated, service_role;

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
  v_provider_status text;
  v_reason text;
begin
  perform private.require_health_worker();
  v_metadata := private.assert_safe_health_metadata(p_safe_metadata);

  if length(v_source)<2 or length(v_source)>64 or p_observed_at is null then
    raise exception 'Invalid health snapshot source or observation time' using errcode='22023';
  end if;

  if jsonb_typeof(p_metrics) <> 'array' or jsonb_array_length(p_metrics)>100 then
    raise exception 'Health metrics must be a bounded array' using errcode='22023';
  end if;

  if jsonb_array_length(p_metrics)>0 then
    return private.record_health_snapshot_with_metrics(
      v_source,
      p_observed_at,
      p_metrics,
      v_metadata
    );
  end if;

  v_provider_status := upper(btrim(coalesce(v_metadata->>'provider_status','')));
  v_reason := upper(btrim(coalesce(v_metadata->>'reason','')));

  if v_provider_status <> 'UNKNOWN'
     or v_reason not in (
       'AUTHENTICATION_FAILED',
       'AUTHORIZATION_FAILED',
       'RATE_LIMITED',
       'PROVIDER_UNAVAILABLE',
       'PROVIDER_ERROR'
     ) then
    raise exception 'Empty health snapshot requires an approved UNKNOWN provider state' using errcode='22023';
  end if;

  insert into public.system_health_snapshots(
    source,provider,status,observed_at,safe_metadata
  ) values (
    v_source,'wasdok-health-worker','UNKNOWN',p_observed_at,v_metadata
  )
  returning id into v_snapshot_id;

  return v_snapshot_id;
end;
$$;

-- The public collector entry point remains service-role-only after replacement.
revoke all on function public.record_health_snapshot(text,timestamptz,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.record_health_snapshot(text,timestamptz,jsonb,jsonb) to service_role;

-- Task 8: capacity history is exposed only through a normalized, permission-checked
-- read model. It intentionally excludes snapshot/provider safe_metadata and all
-- protected Storage object identifiers.
create or replace function public.read_system_health_metric_history(
  p_metric_code text,
  p_days integer default 90
)
returns table(
  metric_code text,
  unit text,
  numeric_value numeric,
  status public.health_status,
  reason text,
  source text,
  provider text,
  observed_at timestamptz,
  collected_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_metric_code text := btrim(coalesce(p_metric_code,''));
begin
  if coalesce(auth.role(),'')='service_role' then return; end if;
  perform private.require_health_permission('system.health.view');

  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'Health history window must be between 1 and 90 days' using errcode='22023';
  end if;

  if not exists(
    select 1 from public.health_metric_catalog c
    where c.metric_code=v_metric_code
      and c.domain in ('database','storage')
      and c.is_active
  ) then
    raise exception 'Health history metric is not approved for capacity history' using errcode='22023';
  end if;

  return query
  select s.metric_code,c.unit,s.numeric_value,s.status,s.reason,s.source,s.provider,s.observed_at,s.collected_at
  from public.system_health_metric_samples s
  join public.health_metric_catalog c on c.metric_code=s.metric_code and c.is_active
  where s.metric_code=v_metric_code
    and s.observed_at >= now() - make_interval(days => p_days)
  order by s.observed_at asc,s.collected_at asc,s.id asc;
end;
$$;

revoke all on function public.read_system_health_metric_history(text,integer) from public, anon, authenticated;
grant execute on function public.read_system_health_metric_history(text,integer) to authenticated;

-- Final normalized latest-metric semantics: freshness is evaluated at read time.
-- Stored sample status remains immutable historical evidence, but stale telemetry
-- must never be presented to an operator as HEALTHY/WARNING/CRITICAL.
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
    s.metric_code,
    c.domain,
    c.name,
    c.unit,
    s.numeric_value,
    case
      when now() > s.observed_at + make_interval(secs => s.stale_after_seconds)
        then 'UNKNOWN'::public.health_status
      else s.status
    end as status,
    case
      when now() > s.observed_at + make_interval(secs => s.stale_after_seconds)
        then 'STALE_SAMPLE'::text
      else s.reason
    end as reason,
    s.source,
    s.provider,
    s.observed_at,
    s.collected_at,
    s.stale_after_seconds
  from public.system_health_metric_samples s
  join public.health_metric_catalog c on c.metric_code=s.metric_code and c.is_active
  where p_domain is null or c.domain=p_domain
  order by s.metric_code,s.observed_at desc,s.collected_at desc,s.id desc;
end;
$$;

revoke all on function public.read_system_health_latest_metrics(text) from public, anon, authenticated;
grant execute on function public.read_system_health_latest_metrics(text) to authenticated;

-- Deployment state is persisted through a dedicated infrastructure-only RPC.
-- The worker accepts only bounded identifiers needed for operational drift review;
-- source/provider are fixed server-side and no arbitrary metadata is accepted.
create or replace function public.record_deployment_health_state(
  p_environment text,
  p_deployed_commit text,
  p_release_id text,
  p_expected_schema_version text,
  p_applied_schema_version text,
  p_status text,
  p_observed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_environment text := btrim(coalesce(p_environment,''));
  v_commit text := nullif(btrim(coalesce(p_deployed_commit,'')), '');
  v_release text := nullif(btrim(coalesce(p_release_id,'')), '');
  v_expected text := btrim(coalesce(p_expected_schema_version,''));
  v_applied text := nullif(btrim(coalesce(p_applied_schema_version,'')), '');
  v_status text := upper(btrim(coalesce(p_status,'')));
  v_id uuid;
begin
  perform private.require_health_worker();

  if v_environment !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$' then
    raise exception 'Invalid deployment environment identifier' using errcode='22023';
  end if;
  if v_commit is not null and v_commit !~ '^[A-Fa-f0-9]{7,64}$' then
    raise exception 'Invalid deployment commit identifier' using errcode='22023';
  end if;
  if v_release is not null and v_release !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'Invalid deployment release identifier' using errcode='22023';
  end if;
  if v_expected !~ '^[0-9]{14}$' or (v_applied is not null and v_applied !~ '^[0-9]{14}$') then
    raise exception 'Invalid deployment schema version' using errcode='22023';
  end if;
  if v_status not in ('HEALTHY','WARNING','CRITICAL','UNKNOWN') or p_observed_at is null then
    raise exception 'Invalid deployment health status or observation time' using errcode='22023';
  end if;

  insert into public.deployment_health_state(
    environment,deployed_commit,release_id,expected_schema_version,applied_schema_version,
    status,source,provider,observed_at,safe_metadata
  ) values (
    v_environment,v_commit,v_release,v_expected,v_applied,
    v_status::public.health_status,'deployment','wasdok',p_observed_at,'{}'::jsonb
  )
  on conflict (environment) do update set
    deployed_commit=excluded.deployed_commit,
    release_id=excluded.release_id,
    expected_schema_version=excluded.expected_schema_version,
    applied_schema_version=excluded.applied_schema_version,
    status=excluded.status,
    source='deployment',
    provider='wasdok',
    observed_at=excluded.observed_at,
    collected_at=now(),
    safe_metadata='{}'::jsonb,
    updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_deployment_health_state(text,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_deployment_health_state(text,text,text,text,text,text,timestamptz)
  to service_role;
