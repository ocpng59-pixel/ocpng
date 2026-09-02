create extension if not exists pgcrypto;

create sequence if not exists public.backup_code_seq;

do $$ begin
  create type public.backup_job_status as enum (
    'REQUESTED','QUEUED','RUNNING','PACKAGING','VERIFYING','AVAILABLE',
    'FAILED','ARCHIVED','EXPIRED','PURGED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.backup_type as enum (
    'FULL_ARCHIVE','STORAGE_INCREMENT','PRE_RELEASE','PRE_MIGRATION'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.backup_verification_status as enum ('PENDING','PASSED','FAILED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.restore_run_type as enum ('TEST','PRODUCTION');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.restore_run_status as enum (
    'REQUESTED','IMPACT_REVIEW','AWAITING_AUTHORIZATION','AUTHORIZED',
    'EXECUTING','VERIFYING','COMPLETED','REJECTED','FAILED'
  );
exception when duplicate_object then null;
end $$;

insert into public.permissions (code,name,domain,classification)
values
  ('backup.view','View backup and recovery status','Backup & Recovery','RESTRICTED'),
  ('backup.create','Create backup jobs','Backup & Recovery','RESTRICTED'),
  ('backup.verify','Verify backup artifacts','Backup & Recovery','RESTRICTED'),
  ('backup.download','Download encrypted backup archives','Backup & Recovery','RESTRICTED'),
  ('backup.schedule','Manage backup schedules','Backup & Recovery','RESTRICTED'),
  ('backup.restore_test','Run restore rehearsals','Backup & Recovery','RESTRICTED'),
  ('backup.restore_production','Request production restore','Backup & Recovery','RESTRICTED'),
  ('backup.authorize_production_restore','Authorize production restore','Backup & Recovery','RESTRICTED'),
  ('backup.manage_retention','Manage backup retention policies','Backup & Recovery','RESTRICTED')
on conflict (code) do nothing;

create table if not exists public.backup_retention_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  retention_days integer not null check (retention_days > 0),
  purge_enabled boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  change_reason text check (change_reason is null or char_length(change_reason) between 3 and 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.backup_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  backup_type public.backup_type not null,
  cadence text not null check (char_length(cadence) between 1 and 200),
  retention_policy_id uuid references public.backup_retention_policies(id),
  environment text not null default 'production' check (char_length(environment) between 2 and 64),
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_run_status public.backup_job_status,
  next_run_at timestamptz,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  change_reason text check (change_reason is null or char_length(change_reason) between 3 and 500),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  backup_code text not null unique default (
    'BKP-' || to_char(current_date,'YYYY') || '-' ||
    lpad(nextval('public.backup_code_seq')::text,6,'0')
  ),
  backup_type public.backup_type not null,
  environment text not null default 'production' check (char_length(environment) between 2 and 64),
  status public.backup_job_status not null default 'REQUESTED',
  requested_by uuid references public.profiles(id),
  request_reason text not null check (char_length(request_reason) between 3 and 500),
  schedule_id uuid references public.backup_schedules(id),
  retention_policy_id uuid references public.backup_retention_policies(id),
  parent_backup_id uuid references public.backup_jobs(id),
  provider_recovery_ref text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backup_code_format check (backup_code ~ '^BKP-[0-9]{4}-[0-9]{6}$')
);

create table if not exists public.backup_artifacts (
  id uuid primary key default gen_random_uuid(),
  backup_id uuid not null references public.backup_jobs(id) on delete cascade,
  artifact_type text not null check (char_length(artifact_type) between 2 and 64),
  storage_reference text not null,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  archive_checksum text,
  encryption_algorithm text,
  encryption_key_reference text,
  recovery_domains jsonb not null default '{}'::jsonb,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint backup_artifact_checksum_format check (
    archive_checksum is null or archive_checksum ~ '^[a-f0-9]{64}$'
  )
);

create table if not exists public.backup_verifications (
  id uuid primary key default gen_random_uuid(),
  backup_id uuid not null references public.backup_jobs(id) on delete cascade,
  status public.backup_verification_status not null default 'PENDING',
  verification_version text not null,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_recovery_points (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  recovery_reference text not null,
  recovery_kind text not null,
  recovery_time timestamptz,
  earliest_recovery_time timestamptz,
  latest_recovery_time timestamptz,
  available boolean not null default true,
  observed_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider,recovery_reference)
);

create table if not exists public.restore_runs (
  id uuid primary key default gen_random_uuid(),
  restore_type public.restore_run_type not null,
  status public.restore_run_status not null default 'REQUESTED',
  backup_id uuid references public.backup_jobs(id),
  provider_recovery_point_id uuid references public.provider_recovery_points(id),
  requested_by uuid not null references public.profiles(id),
  request_reason text not null check (char_length(request_reason) between 3 and 500),
  requested_recovery_time timestamptz,
  impact_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  achieved_rpo_seconds integer check (achieved_rpo_seconds is null or achieved_rpo_seconds >= 0),
  achieved_rto_seconds integer check (achieved_rto_seconds is null or achieved_rto_seconds >= 0),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restore_authorizations (
  id uuid primary key default gen_random_uuid(),
  restore_run_id uuid not null references public.restore_runs(id) on delete cascade,
  requester_user_id uuid not null references public.profiles(id),
  authorizer_user_id uuid not null references public.profiles(id),
  authorization_reason text not null check (char_length(authorization_reason) between 3 and 500),
  authorized_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint restore_authorizer_not_requester check (authorizer_user_id <> requester_user_id),
  unique(restore_run_id, authorizer_user_id)
);

create table if not exists public.restore_verifications (
  id uuid primary key default gen_random_uuid(),
  restore_run_id uuid not null references public.restore_runs(id) on delete cascade,
  status public.backup_verification_status not null default 'PENDING',
  verification_version text not null,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.backup_retention_policies enable row level security;
alter table public.backup_schedules enable row level security;
alter table public.backup_jobs enable row level security;
alter table public.backup_artifacts enable row level security;
alter table public.backup_verifications enable row level security;
alter table public.provider_recovery_points enable row level security;
alter table public.restore_runs enable row level security;
alter table public.restore_authorizations enable row level security;
alter table public.restore_verifications enable row level security;
