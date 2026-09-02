-- WASDOK-55 — Backup, Recovery & Disaster Recovery Administration
-- Task 3: final browser direct-write boundary and explicit RPC grants.

-- Operational metadata is mutated only through audited SECURITY DEFINER RPCs
-- or the trusted operations worker. Browser roles may not write these tables.
revoke insert, update, delete on table public.backup_retention_policies from anon, authenticated;
revoke insert, update, delete on table public.backup_schedules from anon, authenticated;
revoke insert, update, delete on table public.backup_jobs from anon, authenticated;
revoke insert, update, delete on table public.backup_artifacts from anon, authenticated;
revoke insert, update, delete on table public.backup_verifications from anon, authenticated;
revoke insert, update, delete on table public.provider_recovery_points from anon, authenticated;
revoke insert, update, delete on table public.restore_runs from anon, authenticated;
revoke insert, update, delete on table public.restore_authorizations from anon, authenticated;
revoke insert, update, delete on table public.restore_verifications from anon, authenticated;
revoke insert, update, delete on table public.backup_download_requests from anon, authenticated;

-- Operational metadata is never anonymously readable. Authenticated sessions
-- may reach these tables only through RLS, with backup.view as the common
-- least-privilege read capability. The rows contain safe operational metadata;
-- archive bytes and signed URLs are not stored here.
revoke select on table public.backup_retention_policies from anon;
revoke select on table public.backup_schedules from anon;
revoke select on table public.backup_jobs from anon;
revoke select on table public.backup_artifacts from anon;
revoke select on table public.backup_verifications from anon;
revoke select on table public.provider_recovery_points from anon;
revoke select on table public.restore_runs from anon;
revoke select on table public.restore_authorizations from anon;
revoke select on table public.restore_verifications from anon;
revoke select on table public.backup_download_requests from anon;

grant select on table public.backup_retention_policies to authenticated;
grant select on table public.backup_schedules to authenticated;
grant select on table public.backup_jobs to authenticated;
grant select on table public.backup_artifacts to authenticated;
grant select on table public.backup_verifications to authenticated;
grant select on table public.provider_recovery_points to authenticated;
grant select on table public.restore_runs to authenticated;
grant select on table public.restore_authorizations to authenticated;
grant select on table public.restore_verifications to authenticated;
grant select on table public.backup_download_requests to authenticated;

drop policy if exists backup_retention_policies_view on public.backup_retention_policies;
create policy backup_retention_policies_view on public.backup_retention_policies
for select to authenticated using (public.has_permission('backup.view'));

drop policy if exists backup_schedules_view on public.backup_schedules;
create policy backup_schedules_view on public.backup_schedules
for select to authenticated using (public.has_permission('backup.view'));

drop policy if exists backup_jobs_view on public.backup_jobs;
create policy backup_jobs_view on public.backup_jobs
for select to authenticated using (public.has_permission('backup.view'));

drop policy if exists backup_artifacts_view on public.backup_artifacts;
create policy backup_artifacts_view on public.backup_artifacts
for select to authenticated using (public.has_permission('backup.view'));

drop policy if exists backup_verifications_view on public.backup_verifications;
create policy backup_verifications_view on public.backup_verifications
for select to authenticated using (public.has_permission('backup.view'));

drop policy if exists provider_recovery_points_view on public.provider_recovery_points;
create policy provider_recovery_points_view on public.provider_recovery_points
for select to authenticated using (public.has_permission('backup.view'));

drop policy if exists restore_runs_view on public.restore_runs;
create policy restore_runs_view on public.restore_runs
for select to authenticated using (public.has_permission('backup.view'));

drop policy if exists restore_authorizations_view on public.restore_authorizations;
create policy restore_authorizations_view on public.restore_authorizations
for select to authenticated using (public.has_permission('backup.view'));

drop policy if exists restore_verifications_view on public.restore_verifications;
create policy restore_verifications_view on public.restore_verifications
for select to authenticated using (public.has_permission('backup.view'));

drop policy if exists backup_download_requests_view on public.backup_download_requests;
create policy backup_download_requests_view on public.backup_download_requests
for select to authenticated using (public.has_permission('backup.view'));

-- backup_code allocation is owned by the definer-side request path, never a browser role.
revoke usage, select, update on sequence public.backup_code_seq from anon, authenticated;

-- Private helpers are never an application RPC surface.
revoke all on function private.require_backup_permission(text) from public, anon, authenticated;
revoke all on function private.require_backup_reason(text) from public, anon, authenticated;
revoke all on function private.require_backup_worker() from public, anon, authenticated;
revoke all on function private.assert_safe_backup_metadata(jsonb) from public, anon, authenticated;
revoke all on function private.record_backup_audit(text,text,uuid,jsonb,jsonb,text,jsonb) from public, anon, authenticated;
revoke all on function private.assert_backup_transition(text,text) from public, anon, authenticated;
revoke all on function private.assert_restore_transition(text,text) from public, anon, authenticated;

-- Remove PostgreSQL's default PUBLIC function execution from every WASDOK-55 RPC.
revoke all on function public.request_backup(text,text) from public, anon, authenticated;
revoke all on function public.record_backup_worker_transition(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.record_backup_verification(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.request_backup_download(uuid,text) from public, anon, authenticated;
revoke all on function public.request_restore_test(uuid,text) from public, anon, authenticated;
revoke all on function public.request_production_restore(text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.authorize_production_restore(uuid,text) from public, anon, authenticated;
revoke all on function public.record_restore_worker_transition(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.admin_upsert_backup_schedule(uuid,text,text,uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.admin_upsert_retention_policy(uuid,text,integer,boolean,text) from public, anon, authenticated;

-- Browser-facing RPCs remain authenticated-only; each RPC performs its own
-- permission/reason/actor checks at the authoritative database boundary.
grant execute on function public.request_backup(text,text) to authenticated;
grant execute on function public.request_backup_download(uuid,text) to authenticated;
grant execute on function public.request_restore_test(uuid,text) to authenticated;
grant execute on function public.request_production_restore(text,timestamptz,text) to authenticated;
grant execute on function public.authorize_production_restore(uuid,text) to authenticated;
grant execute on function public.admin_upsert_backup_schedule(uuid,text,text,uuid,boolean,text) to authenticated;
grant execute on function public.admin_upsert_retention_policy(uuid,text,integer,boolean,text) to authenticated;

-- Worker transitions are infrastructure-only and cannot be invoked by browser roles.
grant execute on function public.record_backup_worker_transition(uuid,text,text,jsonb) to service_role;
grant execute on function public.record_backup_verification(uuid,text,jsonb) to service_role;
grant execute on function public.record_restore_worker_transition(uuid,text,text,jsonb) to service_role;