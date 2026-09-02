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
