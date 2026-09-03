-- WASDOK-85 — System Health, Capacity & Operational Monitoring Dashboard
-- Task 3: final browser direct-access boundary and explicit RPC grants.

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

-- Human-facing RPCs are authenticated-only. Each RPC performs the authoritative
-- system.health.view/system.health.manage check internally at the database boundary.
grant execute on function public.admin_set_health_threshold(text,numeric,numeric,text,text) to authenticated;
grant execute on function public.admin_set_health_threshold_active(uuid,boolean,text) to authenticated;
grant execute on function public.acknowledge_health_alert(uuid,text) to authenticated;
grant execute on function public.read_system_health_latest_metrics(text) to authenticated;
grant execute on function public.read_system_health_thresholds() to authenticated;
grant execute on function public.read_system_health_alerts(text) to authenticated;
grant execute on function public.read_deployment_health_state() to authenticated;

-- Snapshot ingestion is infrastructure-only and cannot be invoked by browser roles.
grant execute on function public.record_health_snapshot(text,timestamptz,jsonb,jsonb) to service_role;
