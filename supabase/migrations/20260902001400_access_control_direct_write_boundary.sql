-- WASDOK-78 — Access Control Administration
-- Task 4 security-boundary hardening.
--
-- Access-control state is mutated only through the audited SECURITY DEFINER
-- administration RPCs. Browser-facing database roles retain read access only
-- where RLS allows it; they do not receive direct DML capability on RBAC state.

revoke insert, update, delete on table public.profiles from anon, authenticated;
revoke insert, update, delete on table public.roles from anon, authenticated;
revoke insert, update, delete on table public.permissions from anon, authenticated;
revoke insert, update, delete on table public.user_roles from anon, authenticated;
revoke insert, update, delete on table public.role_permissions from anon, authenticated;
revoke insert, update, delete on table public.data_scopes from anon, authenticated;
revoke insert, update, delete on table public.security_compartments from anon, authenticated;
revoke insert, update, delete on table public.user_compartments from anon, authenticated;

-- RPC execution remains explicit and authenticated-only. These grants are
-- repeated here intentionally so the DML boundary and permitted mutation API
-- are reviewable together in one forward-only hardening migration.
revoke all on function public.admin_create_role(text,text,text,text,text) from public, anon;
revoke all on function public.admin_update_role(uuid,text,text,text,text,text) from public, anon;
revoke all on function public.admin_set_role_active(uuid,boolean,text) from public, anon;
revoke all on function public.admin_retire_role(uuid,text) from public, anon;
revoke all on function public.admin_grant_role_permission(uuid,text,text) from public, anon;
revoke all on function public.admin_revoke_role_permission(uuid,text,text) from public, anon;
revoke all on function public.admin_assign_user_role(uuid,uuid,text) from public, anon;
revoke all on function public.admin_revoke_user_role(uuid,uuid,text) from public, anon;
revoke all on function public.admin_grant_data_scope(uuid,text,text,text) from public, anon;
revoke all on function public.admin_revoke_data_scope(uuid,text,text) from public, anon;
revoke all on function public.admin_grant_user_compartment(uuid,text,text) from public, anon;
revoke all on function public.admin_revoke_user_compartment(uuid,text,text) from public, anon;
revoke all on function public.admin_set_user_active(uuid,boolean,text) from public, anon;

grant execute on function public.admin_create_role(text,text,text,text,text) to authenticated;
grant execute on function public.admin_update_role(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_role_active(uuid,boolean,text) to authenticated;
grant execute on function public.admin_retire_role(uuid,text) to authenticated;
grant execute on function public.admin_grant_role_permission(uuid,text,text) to authenticated;
grant execute on function public.admin_revoke_role_permission(uuid,text,text) to authenticated;
grant execute on function public.admin_assign_user_role(uuid,uuid,text) to authenticated;
grant execute on function public.admin_revoke_user_role(uuid,uuid,text) to authenticated;
grant execute on function public.admin_grant_data_scope(uuid,text,text,text) to authenticated;
grant execute on function public.admin_revoke_data_scope(uuid,text,text) to authenticated;
grant execute on function public.admin_grant_user_compartment(uuid,text,text) to authenticated;
grant execute on function public.admin_revoke_user_compartment(uuid,text,text) to authenticated;
grant execute on function public.admin_set_user_active(uuid,boolean,text) to authenticated;
