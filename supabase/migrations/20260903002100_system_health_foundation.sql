-- WASDOK-85 — System Health, Capacity & Operational Monitoring Dashboard
-- Task 1: permissions, metric catalogue, operational metadata and RLS foundation.

create extension if not exists pgcrypto;

do $$ begin
  create type public.health_status as enum ('HEALTHY','WARNING','CRITICAL','UNKNOWN');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.health_alert_status as enum ('OPEN','ACKNOWLEDGED','RESOLVED');
exception when duplicate_object then null;
end $$;

insert into public.permissions (code,name,domain,classification)
values
  ('system.health.view','View system health and capacity','System Health','RESTRICTED'),
  ('system.health.manage','Manage system health thresholds and alerts','System Health','RESTRICTED')
on conflict (code) do nothing;

create table if not exists public.health_metric_catalog (
  metric_code text primary key,
  name text not null,
  domain text not null check (domain in ('application','database','storage','backup','deployment','security')),
  unit text not null check (unit in ('bool','ms','ratio','bytes','count','seconds')),
  value_type text not null check (value_type in ('BOOLEAN','GAUGE','RATIO','COUNTER')),
  source text not null check (char_length(source) between 2 and 64),
  provider text check (provider is null or char_length(provider) between 2 and 64),
  stale_after_seconds integer not null check (stale_after_seconds > 0 and stale_after_seconds <= 604800),
  classification text not null default 'RESTRICTED' check (classification in ('INTERNAL','CONFIDENTIAL','RESTRICTED')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_metric_code_format check (metric_code ~ '^[a-z0-9]+([._][a-z0-9]+)*$')
);

create table if not exists public.system_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (char_length(source) between 2 and 64),
  provider text not null check (char_length(provider) between 2 and 64),
  status public.health_status not null default 'UNKNOWN',
  observed_at timestamptz not null,
  collected_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.system_health_metric_samples (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.system_health_snapshots(id) on delete cascade,
  metric_code text not null references public.health_metric_catalog(metric_code),
  numeric_value numeric not null,
  status public.health_status not null default 'UNKNOWN',
  reason text check (reason is null or char_length(reason) between 1 and 500),
  source text not null check (char_length(source) between 2 and 64),
  provider text not null check (char_length(provider) between 2 and 64),
  observed_at timestamptz not null,
  collected_at timestamptz not null default now(),
  stale_after_seconds integer not null check (stale_after_seconds > 0 and stale_after_seconds <= 604800),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(snapshot_id,metric_code)
);

create table if not exists public.system_health_thresholds (
  id uuid primary key default gen_random_uuid(),
  metric_code text not null unique references public.health_metric_catalog(metric_code),
  warning_value numeric not null,
  critical_value numeric not null,
  direction text not null check (direction in ('ABOVE_IS_BAD','BELOW_IS_BAD')),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  change_reason text check (change_reason is null or char_length(change_reason) between 3 and 500),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_health_alerts (
  id uuid primary key default gen_random_uuid(),
  metric_code text not null references public.health_metric_catalog(metric_code),
  threshold_id uuid references public.system_health_thresholds(id),
  status public.health_alert_status not null default 'OPEN',
  severity public.health_status not null check (severity in ('WARNING','CRITICAL')),
  current_value numeric,
  reason text not null check (char_length(reason) between 1 and 500),
  source text not null check (char_length(source) between 2 and 64),
  provider text not null check (char_length(provider) between 2 and 64),
  opened_at timestamptz not null default now(),
  acknowledged_by uuid references public.profiles(id),
  acknowledged_at timestamptz,
  acknowledgment_reason text check (acknowledgment_reason is null or char_length(acknowledgment_reason) between 3 and 500),
  resolved_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deployment_health_state (
  id uuid primary key default gen_random_uuid(),
  environment text not null unique check (char_length(environment) between 2 and 64),
  deployed_commit text check (deployed_commit is null or char_length(deployed_commit) between 7 and 64),
  release_id text check (release_id is null or char_length(release_id) between 1 and 128),
  expected_schema_version text check (expected_schema_version is null or char_length(expected_schema_version) between 1 and 64),
  applied_schema_version text check (applied_schema_version is null or char_length(applied_schema_version) between 1 and 64),
  status public.health_status not null default 'UNKNOWN',
  source text not null default 'deployment' check (char_length(source) between 2 and 64),
  provider text not null default 'wasdok' check (char_length(provider) between 2 and 64),
  observed_at timestamptz not null,
  collected_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.health_metric_catalog(
  metric_code,name,domain,unit,value_type,source,provider,stale_after_seconds,description
) values
  ('app.availability','Application availability','application','bool','BOOLEAN','application','wasdok',300,'Public-safe liveness result expressed as 1 or 0.'),
  ('app.response_latency_ms','Application response latency','application','ms','GAUGE','application','wasdok',300,'Response latency of the public-safe liveness endpoint.'),
  ('app.http_error_rate','Application HTTP error rate','application','ratio','RATIO','application','netlify',300,'Approved aggregate HTTP error ratio.'),
  ('db.database_bytes','Database size','database','bytes','GAUGE','database','supabase',900,'PostgreSQL database size in bytes.'),
  ('db.disk_bytes','Database disk usage','database','bytes','GAUGE','database','supabase',900,'Provider-reported database disk usage in bytes.'),
  ('db.wal_bytes','WAL usage','database','bytes','GAUGE','database','supabase',900,'Write-ahead log usage in bytes.'),
  ('db.connections_active','Active database connections','database','count','GAUGE','database','supabase',300,'Current active PostgreSQL connections.'),
  ('db.connections_max','Maximum database connections','database','count','GAUGE','database','supabase',3600,'Configured maximum PostgreSQL connections.'),
  ('db.long_running_queries','Long-running queries','database','count','GAUGE','database','supabase',300,'Approved aggregate count of long-running queries.'),
  ('db.deadlocks_24h','Database deadlocks in 24 hours','database','count','COUNTER','database','supabase',1800,'Aggregate deadlock count over the approved 24-hour window.'),
  ('storage.object_count','Storage object count','storage','count','GAUGE','storage','supabase',1800,'Aggregate Storage object count without object names or paths.'),
  ('storage.bytes','Storage bytes','storage','bytes','GAUGE','storage','supabase',1800,'Aggregate Storage object bytes.'),
  ('backup.last_verified_age_seconds','Last verified backup age','backup','seconds','GAUGE','backup','wasdok',1800,'Age of the most recent verified AVAILABLE backup.'),
  ('backup.last_restore_rehearsal_age_seconds','Last restore rehearsal age','backup','seconds','GAUGE','backup','wasdok',3600,'Age of the most recent completed restore rehearsal.'),
  ('deployment.schema_drift','Deployment schema drift','deployment','bool','BOOLEAN','deployment','wasdok',300,'1 when expected and applied schema versions differ, otherwise 0.'),
  ('security.failed_privileged_ops_24h','Failed privileged operations in 24 hours','security','count','COUNTER','security','wasdok',1800,'Approved aggregate failed privileged-operation count.'),
  ('security.failed_logins_24h','Failed logins in 24 hours','security','count','COUNTER','security','supabase',1800,'Approved aggregate failed-login count.'),
  ('security.advisor_warning_count','Security advisor warning count','security','count','GAUGE','security','supabase',3600,'Count of approved security-advisor warnings.')
on conflict (metric_code) do update set
  name=excluded.name,
  domain=excluded.domain,
  unit=excluded.unit,
  value_type=excluded.value_type,
  source=excluded.source,
  provider=excluded.provider,
  stale_after_seconds=excluded.stale_after_seconds,
  description=excluded.description,
  updated_at=now();

alter table public.health_metric_catalog enable row level security;
alter table public.system_health_snapshots enable row level security;
alter table public.system_health_metric_samples enable row level security;
alter table public.system_health_thresholds enable row level security;
alter table public.system_health_alerts enable row level security;
alter table public.deployment_health_state enable row level security;
