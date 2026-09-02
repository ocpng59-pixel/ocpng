# WASDOK-78 Access Control Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Release 1 Users / Roles & Permissions prototype into a secure, configurable Access Control Administration subsystem with real role, permission, user-role, scope, compartment, activation and audit workflows.

**Architecture:** Keep the existing UUID-based RBAC schema and authorization primitives, extend them with lifecycle history, and add narrowly executable authenticated PostgreSQL administration RPCs. Next.js server actions use the verified session client for application-level mutations; Supabase Auth invitation remains isolated behind the existing server-only service client. Dedicated dashboard routes replace the generic dead-label shell for Access Control.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 6.0.3, Supabase PostgreSQL/Auth/RLS, `@supabase/ssr` 0.12.5, `@supabase/supabase-js` 2.112.4, Zod 4.5.4, Vitest 4.1.11, pgTAP via `supabase test db`.

**Spec:** `docs/superpowers/specs/2026-09-02-wasdok-78-access-control-administration-design.md`

## Global Constraints

- All application roles are fully configurable; seeded role names/codes are not immutable.
- Role retirement is logical (`deleted_at`), not destructive deletion; retired codes remain reserved.
- Privileged changes take effect immediately; there is no two-person approval queue.
- Every privileged mutation requires a non-empty administrative reason and immutable audit event.
- The browser never supplies authoritative actor IDs, actor permissions, effective-access claims or audit timestamps.
- Direct browser writes to RBAC tables remain denied; PostgreSQL RPCs are the mutation boundary.
- `admin.manage_users` governs user lifecycle and data-scope operations.
- `admin.manage_roles` governs role lifecycle and role-permission operations.
- User-role and user-compartment assignment/revocation require both `admin.manage_users` and `admin.manage_roles`.
- An administrator cannot modify their own roles, scopes, compartments or active status.
- An administrator cannot alter/deactivate/retire/change permissions on a role they currently hold.
- The database must preserve at least one active effective `admin.manage_roles` user and one active effective `admin.manage_users` user.
- `has_permission()`, `has_scope()` and `has_compartment()` must become lifecycle-aware and fail for inactive profiles.
- `TRAINING_SUPER_ADMIN` is an application role only; it never receives infrastructure/service-role/RLS-bypass/audit-mutation capability.
- Hosted production data is never used by automated E2E tests.
- Production complaint submission activation remains unrelated to WASDOK-78 and stays under its separate release gate.

---

## File Structure Locked by This Plan

### Database
- Create `supabase/migrations/20260902001100_access_control_administration.sql` — lifecycle schema, auth-profile sync trigger, lifecycle-aware authorization functions, private access-admin helpers and all public administration RPCs.
- Create `supabase/tests/access_control_administration.sql` — pgTAP coverage for lifecycle authorization, RPC authorization, history, anti-lockout, self-escalation, audit and direct-write denial.
- Modify `supabase/seed.sql` — add a configurable `TRAINING_SUPER_ADMIN` role definition only; do not grant it to a real/production identity.

### Access-control domain/server layer
- Create `lib/access-control/types.ts` — stable DTOs and action-result types shared by routes/components/server actions.
- Create `lib/access-control/validation.ts` — Zod schemas for role, permission, assignment, scope, compartment, user-status and invitation forms.
- Create `lib/access-control/queries.ts` — server-only RLS-respecting catalogue/detail/effective-access reads using the session client.
- Create `lib/access-control/mutations.ts` — server-only wrappers around the PostgreSQL administration RPC contracts.
- Create `lib/access-control/invitations.ts` — server-only Supabase Auth invitation adapter using `createServiceSupabaseClient()` after verified `admin.manage_users` authorization.

### Routes and components
- Create `app/dashboard/users/actions.ts` — user invitation/status/access server actions.
- Create `app/dashboard/users/page.tsx` — user catalogue.
- Create `app/dashboard/users/[userId]/page.tsx` — user identity/effective-access summary.
- Create `app/dashboard/users/[userId]/access/page.tsx` — role/scope/compartment mutation workspace.
- Create `app/dashboard/users/roles/actions.ts` — role and role-permission server actions.
- Create `app/dashboard/users/roles/page.tsx` — Access Control landing and role catalogue; replaces the generic `Review roles` label experience.
- Create `app/dashboard/users/roles/new/page.tsx` — role creation screen.
- Create `app/dashboard/users/roles/[roleId]/page.tsx` — role detail and permission matrix.
- Create `app/dashboard/users/permissions/page.tsx` — read-only approved permission catalogue.
- Create `app/dashboard/users/scopes-compartments/page.tsx` — target-user selector and entry point for `Grant compartment`.
- Create `components/access-control/action-message.tsx` — safe reusable success/error rendering.
- Create `components/access-control/role-form.tsx` — role create/edit form.
- Create `components/access-control/permission-matrix.tsx` — role-permission grant/revoke controls.
- Create `components/access-control/user-access-form.tsx` — role/scope/compartment and status controls.
- Create `components/access-control/user-invite-form.tsx` — invite user form.
- Modify `app/globals.css` — Access Control table/form/action styling only.

### Tests/CI
- Create `tests/access-control/validation.test.ts`.
- Create `tests/access-control/mutations.test.ts`.
- Create `tests/access-control/invitations.test.ts`.
- Create `tests/access-control/routes.test.ts`.
- Create `tests/access-control/e2e.test.ts`.
- Modify `.github/workflows/ci.yml` — run WASDOK-78 E2E after local Supabase reset/pgTAP.
- Modify `scripts/routes-smoke.mjs` — include the dedicated Access Control routes.
- Modify `scripts/static-security.mjs` only if a new server-only import boundary needs explicit enforcement.

---

### Task 1: Add RBAC lifecycle schema and lifecycle-aware authorization primitives

**Files:**
- Create: `supabase/migrations/20260902001100_access_control_administration.sql`
- Create: `supabase/tests/access_control_administration.sql`

**Interfaces:**
- Produces lifecycle columns on `roles`, `user_roles`, `role_permissions`, `data_scopes`, `user_compartments`.
- Produces lifecycle-aware `public.has_permission(text)`, `public.has_scope(text)`, `public.has_compartment(text)`.
- Produces automatic `public.profiles` creation for new `auth.users` identities via `private.handle_new_auth_user()` trigger.

- [ ] **Step 1: Write the failing pgTAP lifecycle tests**

Create the test file with a transaction and initial assertions that the new columns/functions behave as required:

```sql
begin;
select plan(18);

select has_column('public', 'roles', 'is_active', 'roles has is_active');
select has_column('public', 'roles', 'deleted_at', 'roles has logical-retirement timestamp');
select has_column('public', 'user_roles', 'is_active', 'user_roles retains active lifecycle');
select has_column('public', 'role_permissions', 'is_active', 'role_permissions retains active lifecycle');
select has_column('public', 'user_compartments', 'is_active', 'user_compartments retains active lifecycle');
select has_column('public', 'data_scopes', 'revoked_at', 'data_scopes retains revocation timestamp');

insert into auth.users (id, email, raw_user_meta_data)
values ('78000000-0000-0000-0000-000000000001', 'wasdok78-admin@test.invalid', '{"display_name":"DEMO WASDOK78 Admin"}'::jsonb);

select is(
  (select display_name from public.profiles where id='78000000-0000-0000-0000-000000000001'),
  'DEMO WASDOK78 Admin',
  'auth user creation synchronizes a profile'
);

-- Remaining assertions in this file use set_config('request.jwt.claim.sub', ..., true)
-- and prove inactive profile/role/assignment paths return false, while active paths return true.

select * from finish();
rollback;
```

- [ ] **Step 2: Run pgTAP and confirm RED**

Run:

```bash
supabase start
supabase db reset
supabase test db
```

Expected: `access_control_administration.sql` fails because lifecycle columns and the auth-user profile trigger do not exist.

- [ ] **Step 3: Implement the lifecycle schema and profile trigger**

Add these schema changes in the migration, using guarded DDL so a forward migration is safe against the existing Release 1 schema:

```sql
alter table public.roles add column if not exists is_active boolean not null default true;
alter table public.roles add column if not exists role_type text not null default 'operational';
alter table public.roles add column if not exists deactivated_at timestamptz;
alter table public.roles add column if not exists deactivated_by uuid references public.profiles(id);
alter table public.roles add column if not exists deleted_at timestamptz;
alter table public.roles add column if not exists deleted_by uuid references public.profiles(id);
alter table public.roles add column if not exists updated_by uuid references public.profiles(id);
alter table public.roles drop constraint if exists roles_role_type_check;
alter table public.roles add constraint roles_role_type_check check (role_type in ('operational','administrative','training'));

alter table public.user_roles add column if not exists is_active boolean not null default true;
alter table public.user_roles add column if not exists assigned_by uuid references public.profiles(id);
alter table public.user_roles add column if not exists assigned_at timestamptz not null default now();
alter table public.user_roles add column if not exists revoked_at timestamptz;
alter table public.user_roles add column if not exists revoked_by uuid references public.profiles(id);

alter table public.role_permissions add column if not exists is_active boolean not null default true;
alter table public.role_permissions add column if not exists granted_by uuid references public.profiles(id);
alter table public.role_permissions add column if not exists granted_at timestamptz not null default now();
alter table public.role_permissions add column if not exists revoked_at timestamptz;
alter table public.role_permissions add column if not exists revoked_by uuid references public.profiles(id);

alter table public.data_scopes add column if not exists granted_by uuid references public.profiles(id);
alter table public.data_scopes add column if not exists granted_at timestamptz not null default now();
alter table public.data_scopes add column if not exists revoked_at timestamptz;
alter table public.data_scopes add column if not exists revoked_by uuid references public.profiles(id);

alter table public.user_compartments add column if not exists is_active boolean not null default true;
alter table public.user_compartments add column if not exists revoked_at timestamptz;
alter table public.user_compartments add column if not exists revoked_by uuid references public.profiles(id);

alter table public.user_roles drop constraint if exists user_roles_user_id_role_id_key;
alter table public.role_permissions drop constraint if exists role_permissions_role_id_permission_id_key;
alter table public.data_scopes drop constraint if exists data_scopes_user_id_scope_code_key;
alter table public.user_compartments drop constraint if exists user_compartments_user_id_compartment_id_key;

create unique index if not exists user_roles_one_active
  on public.user_roles(user_id, role_id) where is_active;
create unique index if not exists role_permissions_one_active
  on public.role_permissions(role_id, permission_id) where is_active;
create unique index if not exists data_scopes_one_active
  on public.data_scopes(user_id, scope_code) where active;
create unique index if not exists user_compartments_one_active
  on public.user_compartments(user_id, compartment_id) where is_active;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(id, display_name, email, is_active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), new.email, 'WASDOK User'),
    new.email,
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = case
          when public.profiles.display_name = '' then excluded.display_name
          else public.profiles.display_name
        end,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists wasdok_auth_user_profile on auth.users;
create trigger wasdok_auth_user_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.handle_new_auth_user();
```

- [ ] **Step 4: Replace authorization primitives with lifecycle-aware definitions**

```sql
create or replace function public.has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.user_roles ur on ur.user_id = pr.id and ur.is_active
    join public.roles r on r.id = ur.role_id and r.is_active and r.deleted_at is null
    join public.role_permissions rp on rp.role_id = r.id and rp.is_active
    join public.permissions p on p.id = rp.permission_id
    where pr.id = auth.uid()
      and pr.is_active
      and p.code = permission_code
  );
$$;

create or replace function public.has_scope(scope_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_active)
    and (
      scope_code is null
      or exists (
        select 1 from public.data_scopes ds
        where ds.user_id=auth.uid()
          and ds.active
          and (ds.scope_code=scope_code or ds.scope_code='*')
      )
    );
$$;

create or replace function public.has_compartment(classification_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_active)
    and (
      classification_code in ('PUBLIC','INTERNAL')
      or exists (
        select 1
        from public.user_compartments uc
        join public.security_compartments sc on sc.id=uc.compartment_id
        where uc.user_id=auth.uid()
          and uc.is_active
          and sc.code::text=classification_code
      )
    );
$$;
```

- [ ] **Step 5: Run the lifecycle pgTAP tests GREEN**

Run `supabase db reset && supabase test db`.
Expected: all lifecycle assertions pass and existing RLS tests remain green.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902001100_access_control_administration.sql supabase/tests/access_control_administration.sql
git commit -m "feat(WASDOK-78): add access control lifecycle authorization"
```

---

### Task 2: Implement role lifecycle administration RPCs with audit and anti-lockout

**Files:**
- Modify: `supabase/migrations/20260902001100_access_control_administration.sql`
- Modify: `supabase/tests/access_control_administration.sql`

**Interfaces:**
- Produces `admin_create_role(p_code text, p_name text, p_description text, p_role_type text, p_reason text) returns uuid`.
- Produces `admin_update_role(p_role_id uuid, p_code text, p_name text, p_description text, p_role_type text, p_reason text) returns void`.
- Produces `admin_set_role_active(p_role_id uuid, p_active boolean, p_reason text) returns void`.
- Produces `admin_retire_role(p_role_id uuid, p_reason text) returns void`.

- [ ] **Step 1: Add failing pgTAP cases for role create/update/deactivate/reactivate/retire**

Add assertions that an authenticated actor with `admin.manage_roles` succeeds, a non-admin fails, an actor cannot alter a role they hold, active assignments block retirement, retired role codes remain unique, and each success produces one corresponding `access.role_*` audit event.

Use fixed fictional UUIDs beginning `78000000-...` so the suite is deterministic and rolls back completely.

- [ ] **Step 2: Run RED**

Run `supabase test db`.
Expected: failures report missing `admin_create_role`, `admin_update_role`, `admin_set_role_active`, and `admin_retire_role`.

- [ ] **Step 3: Add private authorization/audit helpers**

```sql
create or replace function private.require_access_admin(required_permission text, administrative_reason text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception using errcode='42501', message='Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=actor and p.is_active) then
    raise exception using errcode='42501', message='Active administrator required';
  end if;
  if coalesce(length(trim(administrative_reason)),0) < 3 then
    raise exception using errcode='22023', message='Administrative reason is required';
  end if;
  if not public.has_permission(required_permission) then
    raise exception using errcode='42501', message='Administrative permission denied';
  end if;
  return actor;
end;
$$;

create or replace function private.actor_holds_role(target_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.user_roles
    where user_id=auth.uid() and role_id=target_role_id and is_active
  );
$$;

create or replace function private.write_access_audit(
  p_actor uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_reason text,
  p_before jsonb,
  p_after jsonb
) returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.audit_events(actor_id, action, entity_type, entity_id, reason, before_data, after_data, classification, request_metadata)
  values (p_actor, p_action, p_entity_type, p_entity_id, p_reason, p_before, p_after, 'RESTRICTED', jsonb_build_object('event_source','wasdok-access-control'));
end;
$$;
```

- [ ] **Step 4: Implement the four role RPCs**

Each RPC uses `security invoker` semantics for session identity through `auth.uid()`, calls `private.require_access_admin('admin.manage_roles', p_reason)`, rejects `private.actor_holds_role(p_role_id)` for update/status/retire, validates role code with `^[a-z0-9_]{3,64}$`, writes audit via `private.write_access_audit`, and never physically deletes a role.

For retirement, update exactly:

```sql
update public.roles
set is_active=false,
    deleted_at=now(),
    deleted_by=actor,
    deactivated_at=coalesce(deactivated_at, now()),
    deactivated_by=coalesce(deactivated_by, actor),
    updated_by=actor,
    updated_at=now()
where id=p_role_id and deleted_at is null;
```

Before retirement, reject when `exists(select 1 from public.user_roles where role_id=p_role_id and is_active)`.

- [ ] **Step 5: Protect execute privileges**

```sql
revoke all on function public.admin_create_role(text,text,text,text,text) from public, anon;
revoke all on function public.admin_update_role(uuid,text,text,text,text,text) from public, anon;
revoke all on function public.admin_set_role_active(uuid,boolean,text) from public, anon;
revoke all on function public.admin_retire_role(uuid,text) from public, anon;
grant execute on function public.admin_create_role(text,text,text,text,text) to authenticated;
grant execute on function public.admin_update_role(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_role_active(uuid,boolean,text) to authenticated;
grant execute on function public.admin_retire_role(uuid,text) to authenticated;
```

- [ ] **Step 6: Run GREEN and existing regression**

Run `supabase db reset && supabase test db`.
Expected: role lifecycle/negative/audit assertions pass; existing complaint/RLS tests remain green.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260902001100_access_control_administration.sql supabase/tests/access_control_administration.sql
git commit -m "feat(WASDOK-78): add audited role administration RPCs"
```

---

### Task 3: Implement role-permission administration and indirect self-escalation protection

**Files:**
- Modify: `supabase/migrations/20260902001100_access_control_administration.sql`
- Modify: `supabase/tests/access_control_administration.sql`

**Interfaces:**
- Produces `admin_grant_role_permission(p_role_id uuid, p_permission_code text, p_reason text) returns uuid`.
- Produces `admin_revoke_role_permission(p_role_id uuid, p_permission_code text, p_reason text) returns void`.

- [ ] **Step 1: Write failing role-permission tests**

Cases must prove: approved permission grant succeeds, unknown permission fails, duplicate active grant fails safely, revoke preserves historical row, grant/revoke affects `has_permission()` immediately, actor cannot mutate a role they currently hold, and last-admin protection blocks removal of `admin.manage_roles`/`admin.manage_users` when it would eliminate the last effective administrator.

- [ ] **Step 2: Run RED**

Run `supabase test db` and confirm missing RPC failures.

- [ ] **Step 3: Add last-admin helper**

```sql
create or replace function private.effective_admin_count(permission_code text)
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select count(distinct pr.id)
  from public.profiles pr
  join public.user_roles ur on ur.user_id=pr.id and ur.is_active
  join public.roles r on r.id=ur.role_id and r.is_active and r.deleted_at is null
  join public.role_permissions rp on rp.role_id=r.id and rp.is_active
  join public.permissions p on p.id=rp.permission_id
  where pr.is_active and p.code=permission_code;
$$;
```

For any operation removing/deactivating an effective admin path, perform the candidate mutation inside the RPC, then assert `private.effective_admin_count('admin.manage_roles') > 0` and `private.effective_admin_count('admin.manage_users') > 0`; raise `23514` before commit when either count is zero so the entire RPC transaction rolls back.

- [ ] **Step 4: Implement grant/revoke RPCs**

Grant resolves the approved `permissions.id`, inserts a new active lifecycle row with `granted_by=actor`, and audits `access.role_permission_granted`.

Revoke updates only the active row:

```sql
update public.role_permissions
set is_active=false, revoked_at=now(), revoked_by=actor, updated_at=now()
where role_id=p_role_id
  and permission_id=permission_id_value
  and is_active;
```

Then enforce the last-admin counts before returning and audit `access.role_permission_revoked`.

- [ ] **Step 5: Protect execute privileges and run GREEN**

Grant EXECUTE only to `authenticated`, revoke from `anon/public`, then run `supabase db reset && supabase test db`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260902001100_access_control_administration.sql supabase/tests/access_control_administration.sql
git commit -m "feat(WASDOK-78): manage role permissions safely"
```

---

### Task 4: Implement user-role, scope, compartment and user-status administration RPCs

**Files:**
- Modify: `supabase/migrations/20260902001100_access_control_administration.sql`
- Modify: `supabase/tests/access_control_administration.sql`

**Interfaces:**
- Produces `admin_assign_user_role(uuid,uuid,text) returns uuid`.
- Produces `admin_revoke_user_role(uuid,uuid,text) returns void`.
- Produces `admin_grant_data_scope(uuid,text,text,text) returns uuid` where parameters are target user, scope code, scope type, reason.
- Produces `admin_revoke_data_scope(uuid,text,text) returns void`.
- Produces `admin_grant_user_compartment(uuid,text,text) returns uuid`.
- Produces `admin_revoke_user_compartment(uuid,text,text) returns void`.
- Produces `admin_set_user_active(uuid,boolean,text) returns void`.

- [ ] **Step 1: Add failing pgTAP tests for all assignment/status operations**

Prove both-permission requirement for role/compartment assignment, `admin.manage_users` requirement for scope/status, direct self-modification denial, history retention after revocation, immediate `has_*` effect, suspended user denial, and last-admin rollback on role revocation or suspension.

- [ ] **Step 2: Run RED**

Run `supabase test db`; expected missing RPC failures.

- [ ] **Step 3: Add common self-target guard**

```sql
create or replace function private.reject_self_target(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if target_user_id=auth.uid() then
    raise exception using errcode='42501', message='Administrators cannot modify their own access';
  end if;
end;
$$;
```

- [ ] **Step 4: Implement assignment lifecycle mutations**

All grant RPCs insert a new active lifecycle row and all revoke RPCs update only the active row to inactive with server timestamps/actor. `admin_assign_user_role` and both compartment RPCs call both:

```sql
perform private.require_access_admin('admin.manage_users', p_reason);
if not public.has_permission('admin.manage_roles') then
  raise exception using errcode='42501', message='Role administration permission also required';
end if;
```

`admin_set_user_active` denies self-target, updates `profiles.is_active`, then checks both effective admin counts before commit. Audit action is `access.user_activated` or `access.user_suspended`.

- [ ] **Step 5: Restrict direct authenticated writes to RBAC configuration tables**

Do not add INSERT/UPDATE/DELETE RLS policies for ordinary authenticated users. Add pgTAP assertions proving authenticated direct writes fail even for an admin JWT while the approved RPC succeeds.

- [ ] **Step 6: Execute privilege hardening**

Revoke all seven RPCs from `public, anon`; grant only to `authenticated`.

- [ ] **Step 7: Run GREEN and commit**

Run `supabase db reset && supabase test db`.

```bash
git add supabase/migrations/20260902001100_access_control_administration.sql supabase/tests/access_control_administration.sql
git commit -m "feat(WASDOK-78): add user access administration RPCs"
```

---

### Task 5: Add Access Control domain types, validation and RLS-respecting query layer

**Files:**
- Create: `lib/access-control/types.ts`
- Create: `lib/access-control/validation.ts`
- Create: `lib/access-control/queries.ts`
- Create: `tests/access-control/validation.test.ts`

**Interfaces:**
- Produces `AccessControlActionState`, `RoleSummary`, `RoleDetail`, `UserAccessSummary`, `PermissionSummary`, `CompartmentSummary`.
- Produces `parseRoleForm`, `parseReason`, `parseUserRoleForm`, `parseScopeForm`, `parseCompartmentForm`, `parseUserStatusForm`, `parseInviteUserForm`.
- Produces server-only `listRoles()`, `getRoleDetail(roleId)`, `listUsers()`, `getUserAccess(userId)`, `listPermissions()`, `listCompartments()`.

- [ ] **Step 1: Write failing validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseReason, parseRoleForm } from '@/lib/access-control/validation';

describe('WASDOK-78 access-control validation', () => {
  it('accepts a configurable role code and role type', () => {
    expect(parseRoleForm({
      code: 'training_super_admin',
      name: 'Training Super Administrator',
      description: 'DEMO/UAT broad application role',
      roleType: 'training',
      reason: 'Prepare controlled UAT access',
    }).success).toBe(true);
  });

  it('rejects invalid role codes', () => {
    expect(parseRoleForm({
      code: 'Chief Ombudsman!', name: 'Role', description: '', roleType: 'operational', reason: 'Change role'
    }).success).toBe(false);
  });

  it('requires a meaningful administrative reason', () => {
    expect(parseReason('')).toEqual({ success: false, message: 'Administrative reason is required.' });
  });
});
```

- [ ] **Step 2: Run RED**

Run `npx vitest run tests/access-control/validation.test.ts`.
Expected: module-not-found failure.

- [ ] **Step 3: Implement stable DTOs and validators**

Use Zod with these exact constraints:

```ts
const roleCode = z.string().trim().regex(/^[a-z0-9_]{3,64}$/);
const reason = z.string().trim().min(3).max(500);
const roleType = z.enum(['operational', 'administrative', 'training']);
const scopeCode = z.string().trim().min(1).max(100);
const email = z.string().trim().email();
```

Return discriminated parse results; never throw validation details directly into route responses.

- [ ] **Step 4: Implement server-only query functions**

Start `queries.ts` with `import 'server-only';`. Every function creates `createServerSupabaseClient()`, throws a generic `AccessControlUnavailableError` when no client/session query is available, and queries only fields required by the UI. Reads remain subject to existing RLS; do not use the service-role client for role/user catalogue reads.

- [ ] **Step 5: Run GREEN, typecheck and commit**

Run:

```bash
npx vitest run tests/access-control/validation.test.ts
npm run typecheck
```

Then:

```bash
git add lib/access-control tests/access-control/validation.test.ts
git commit -m "feat(WASDOK-78): add access control domain layer"
```

---

### Task 6: Add server mutation adapters and safe Supabase Auth invitation

**Files:**
- Create: `lib/access-control/mutations.ts`
- Create: `lib/access-control/invitations.ts`
- Create: `tests/access-control/mutations.test.ts`
- Create: `tests/access-control/invitations.test.ts`

**Interfaces:**
- Produces one typed wrapper for each database RPC from Tasks 2–4.
- Produces `inviteApplicationUser(input: { email: string; displayName: string; reason: string }): Promise<AccessControlActionState>`.

- [ ] **Step 1: Write failing mutation-adapter tests**

Mock `createServerSupabaseClient()` and assert that `grantUserCompartment()` sends only target user ID, classification code and reason; it must not accept actor ID or browser-supplied audit time.

- [ ] **Step 2: Write failing invitation tests**

Mock the session client and service client. Prove invitation first verifies `admin.manage_users` through the authenticated session, then calls `auth.admin.inviteUserByEmail(email, { data: { display_name } })`; if permission is absent it never creates the service client.

- [ ] **Step 3: Run RED**

Run `npx vitest run tests/access-control/mutations.test.ts tests/access-control/invitations.test.ts`.

- [ ] **Step 4: Implement mutation wrappers**

`mutations.ts` starts with `import 'server-only';` and exposes functions such as:

```ts
export async function grantUserCompartment(input: {
  userId: string;
  compartment: SecurityClassification;
  reason: string;
}): Promise<AccessControlActionState> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { ok: false, message: 'Access Control is unavailable.' };
  const { error } = await supabase.rpc('admin_grant_user_compartment', {
    p_user_id: input.userId,
    p_compartment_code: input.compartment,
    p_reason: input.reason,
  });
  return error
    ? { ok: false, message: mapAccessControlError(error) }
    : { ok: true, message: 'Compartment granted.' };
}
```

Implement a safe error mapper for SQLSTATE categories `42501`, `22023`, `23505`, `23514`; unknown database errors map to `The access change could not be completed.` without exposing raw SQL text.

- [ ] **Step 5: Implement invitation adapter**

```ts
export async function inviteApplicationUser(input: {
  email: string;
  displayName: string;
  reason: string;
}): Promise<AccessControlActionState> {
  const session = await createServerSupabaseClient();
  if (!session) return { ok: false, message: 'Access Control is unavailable.' };
  const { data: allowed, error: permissionError } = await session.rpc('has_permission', {
    permission_code: 'admin.manage_users',
  });
  if (permissionError || allowed !== true) return { ok: false, message: 'Administrative permission denied.' };

  const service = createServiceSupabaseClient();
  const { error } = await service.auth.admin.inviteUserByEmail(input.email, {
    data: { display_name: input.displayName, invitation_reason: input.reason },
  });
  return error
    ? { ok: false, message: 'The user invitation could not be sent.' }
    : { ok: true, message: 'User invitation sent.' };
}
```

Do not store `invitation_reason` as authoritative audit evidence; the database access mutation audit remains authoritative. The auth invitation itself may be separately audited in a later identity lifecycle enhancement.

- [ ] **Step 6: Run GREEN, security suite and commit**

Run:

```bash
npx vitest run tests/access-control/mutations.test.ts tests/access-control/invitations.test.ts
npm run test:auth-security
npm run typecheck
```

Commit:

```bash
git add lib/access-control tests/access-control
git commit -m "feat(WASDOK-78): add trusted access control server adapters"
```

---

### Task 7: Activate Review roles with dedicated role catalogue, creation and permission matrix routes

**Files:**
- Create: `app/dashboard/users/roles/actions.ts`
- Create: `app/dashboard/users/roles/page.tsx`
- Create: `app/dashboard/users/roles/new/page.tsx`
- Create: `app/dashboard/users/roles/[roleId]/page.tsx`
- Create: `app/dashboard/users/permissions/page.tsx`
- Create: `components/access-control/action-message.tsx`
- Create: `components/access-control/role-form.tsx`
- Create: `components/access-control/permission-matrix.tsx`
- Create: `tests/access-control/routes.test.ts`
- Modify: `app/globals.css`

**Interfaces:**
- `Review roles` resolves to a real `/dashboard/users/roles` route.
- Role mutations call Task 6 wrappers only; UI never calls Supabase directly.

- [ ] **Step 1: Write failing route/component tests**

Assert that concrete route files exist, `Review roles` is rendered as a link/button rather than `.oc-action` span, the role catalogue exposes `Create role`, and permission matrix form controls submit permission code + reason only.

- [ ] **Step 2: Run RED**

Run `npx vitest run tests/access-control/routes.test.ts`.

- [ ] **Step 3: Implement role server actions**

Each action starts with `'use server';`, parses `FormData` through Task 5 validators, calls a Task 6 mutation wrapper, and calls `revalidatePath('/dashboard/users/roles')` after success. Do not read any `actorId`, `actorPermission`, `grantedBy`, or audit timestamp fields from the browser.

- [ ] **Step 4: Implement dedicated role routes**

`/dashboard/users/roles/page.tsx` must render:

- title `Roles, Permissions & Compartments`
- navigation cards/links for `Review roles`, `Permissions`, `Scopes & Compartments`, `Audit History`
- role table with code, name, type, active/retired status, assigned-user count and permission count
- `Create role` link

`/dashboard/users/roles/[roleId]/page.tsx` renders `RoleForm` and `PermissionMatrix`; it disables all mutation controls when the database summary says the current actor holds that role and explains `You cannot change a role currently assigned to your own account.`

- [ ] **Step 5: Implement permission catalogue route**

`/dashboard/users/permissions` is read-only and groups Task 5 `PermissionSummary` rows by `domain`. No arbitrary create-permission button exists.

- [ ] **Step 6: Add focused CSS**

Add semantic classes for `.oc-admin-grid`, `.oc-admin-table`, `.oc-form-grid`, `.oc-inline-actions`, `.oc-field-error`, `.oc-action-link`, preserving existing application visual language.

- [ ] **Step 7: Run GREEN and existing route/type checks**

```bash
npx vitest run tests/access-control/routes.test.ts
npm run test:routes
npm run typecheck
npm run lint
```

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/users/roles components/access-control app/globals.css tests/access-control/routes.test.ts
git commit -m "feat(WASDOK-78): activate role administration screens"
```

---

### Task 8: Activate Users and Grant compartment workflows

**Files:**
- Create: `app/dashboard/users/actions.ts`
- Create: `app/dashboard/users/page.tsx`
- Create: `app/dashboard/users/[userId]/page.tsx`
- Create: `app/dashboard/users/[userId]/access/page.tsx`
- Create: `app/dashboard/users/scopes-compartments/page.tsx`
- Create: `components/access-control/user-access-form.tsx`
- Create: `components/access-control/user-invite-form.tsx`
- Modify: `tests/access-control/routes.test.ts`

**Interfaces:**
- `Grant compartment` resolves to `/dashboard/users/scopes-compartments`, then deep-links to `/dashboard/users/[userId]/access`.
- User access form performs immediate role/scope/compartment/status mutations with explicit reasons.

- [ ] **Step 1: Extend failing route tests**

Prove `/dashboard/users`, user detail/access routes and `/dashboard/users/scopes-compartments` are concrete routes; `Grant compartment` is an interactive link; user access form never contains hidden `actorId` or `grantedBy` inputs.

- [ ] **Step 2: Run RED**

Run `npx vitest run tests/access-control/routes.test.ts`.

- [ ] **Step 3: Implement user server actions**

Provide actions for invitation, activation/suspension, assign/revoke role, grant/revoke scope, and grant/revoke compartment. Parse every request with Task 5 validators. Successful mutations call `revalidatePath()` for both the user detail and access routes.

- [ ] **Step 4: Implement user catalogue and invitation**

`/dashboard/users` renders a searchable server-side catalogue, current active/suspended state and access-summary counts plus `Invite user` form. Do not display passwords or privileged tokens.

- [ ] **Step 5: Implement effective access summary**

`/dashboard/users/[userId]` renders identity, active state, roles, effective permissions, scopes and compartments; it deep-links `Manage access` to the access route.

- [ ] **Step 6: Implement access mutation screen**

`UserAccessForm` must render separate sections for Roles, Data scopes, Security compartments and Account status. Every grant/revoke/status form contains a required `reason` field. When viewing the actor's own account, render the data read-only and display `You cannot modify your own privileged access.`

- [ ] **Step 7: Implement Grant compartment entry point**

`/dashboard/users/scopes-compartments` lists target users and each row's `Manage roles, scopes & compartments` link. This route is the target of the previously dead `Grant compartment` action.

- [ ] **Step 8: Run GREEN and commit**

```bash
npx vitest run tests/access-control/routes.test.ts
npm run test:routes
npm run typecheck
npm run lint
```

```bash
git add app/dashboard/users components/access-control tests/access-control/routes.test.ts
git commit -m "feat(WASDOK-78): activate user and compartment administration"
```

---

### Task 9: Add Training Super Administrator seed, access audit link and route/security regressions

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `scripts/routes-smoke.mjs`
- Modify: `tests/rbac/admin-module-classification.test.ts`
- Modify: `tests/security/server-auth-boundary.test.ts`
- Modify: `tests/security/service-role-boundary.test.ts`

**Interfaces:**
- Creates only the role definition `training_super_admin` / `Training Super Administrator` with `role_type='training'`; does not assign a real identity.
- Ensures all new routes remain protected by dashboard authentication and RLS/RPC permissions.

- [ ] **Step 1: Add failing security/route assertions**

Add the new concrete route paths to route smoke tests and protected-route regression cases. Add a static assertion that no Access Control client component imports `@/lib/supabase/service`.

- [ ] **Step 2: Run RED**

Run:

```bash
npm run test:routes
npm run test:auth-security
```

- [ ] **Step 3: Seed Training Super Administrator definition**

```sql
insert into public.roles(code,name,description,is_system,is_active,role_type,metadata)
values (
  'training_super_admin',
  'Training Super Administrator',
  'DEMO/UAT application-wide functional role; not an infrastructure superuser.',
  false,
  true,
  'training',
  '{"demo_role":true}'::jsonb
)
on conflict (code) do update
set name=excluded.name,
    description=excluded.description,
    role_type='training',
    metadata=public.roles.metadata || '{"demo_role":true}'::jsonb;
```

Do not grant permissions automatically in seed; the role-permission matrix is the controlled configuration mechanism required by WASDOK-78.

- [ ] **Step 4: Wire access audit navigation**

Role/user detail screens link to `/dashboard/audit-log?domain=access`. Do not weaken the existing `audit.view` route requirement to make this link work.

- [ ] **Step 5: Run GREEN and commit**

Run `npm run test:routes && npm run test:auth-security && npm run verify:static && npm run typecheck`.

```bash
git add supabase/seed.sql scripts tests app/dashboard/users
git commit -m "test(WASDOK-78): harden access control route boundaries"
```

---

### Task 10: Add local-Supabase end-to-end Access Control test and CI stage

**Files:**
- Create: `tests/access-control/e2e.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- E2E uses only local Supabase and fictional `DEMO WASDOK78` identities.
- Produces proof of create role → permission grant → user assignment → immediate authorization → compartment grant → revocation → suspension → immutable audit.

- [ ] **Step 1: Write the failing E2E test**

The test is conditionally enabled by `WASDOK78_ACCESS_E2E=true`, creates two fictional local Auth identities (admin and target), configures the admin through local service-role setup only, then exercises the actual authenticated RPC/server layer for the target user. It must assert:

```ts
expect(createdRole.code).toBe('wasdok78_demo_investigator');
expect(await permissionFor(targetClient, 'complaints.view')).toBe(true);
expect(await compartmentFor(targetClient, 'CONFIDENTIAL')).toBe(true);
expect(await permissionFor(targetClient, 'complaints.view')).toBe(false); // after revoke
expect(await permissionFor(targetClient, 'dashboard.view')).toBe(false); // after suspension
expect(auditActions).toEqual(expect.arrayContaining([
  'access.role_created',
  'access.role_permission_granted',
  'access.user_role_assigned',
  'access.compartment_granted',
  'access.role_permission_revoked',
  'access.user_suspended',
]));
```

Audit serialization must not contain passwords, JWTs, service-role key fragments or session cookies.

- [ ] **Step 2: Run RED in the existing workflow order**

Run ordinary `npm run test:run`; the E2E suite remains skipped. Run manually with the flag against local Supabase and confirm the first missing integration failure before wiring CI.

- [ ] **Step 3: Add the dedicated CI step after `supabase db reset` and pgTAP**

```yaml
      - name: Access Control end-to-end (WASDOK-78)
        run: |
          eval "$(supabase status -o env)"
          export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
          export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
          export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
          export WASDOK78_ACCESS_E2E="true"
          npx vitest run tests/access-control/e2e.test.ts
```

- [ ] **Step 4: Run the complete local verification sequence**

```bash
npm run test:run
supabase db reset
npm run test:rls
WASDOK78_ACCESS_E2E=true npx vitest run tests/access-control/e2e.test.ts
npm run typecheck:domain
npm run test:domain
npm run test:schema
npm run test:routes
npm run verify:static
npm run typecheck
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add tests/access-control/e2e.test.ts .github/workflows/ci.yml
git commit -m "test(WASDOK-78): add access control end-to-end coverage"
```

---

### Task 11: Final review, hosted migration verification and closure evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-wasdok-78-access-control-administration-design.md` only if implementation evidence reveals a factual mismatch; do not silently change approved governance.
- No destructive production test data.

**Interfaces:**
- Produces review/CI evidence, forward-only hosted migration evidence, rollback-safe verifier evidence and Jira closure evidence.

- [ ] **Step 1: Run verification-before-completion on the final branch head**

Record the exact head SHA and rerun the full CI-equivalent command set from Task 10. Do not rely on earlier green runs after subsequent commits.

- [ ] **Step 2: Request code review**

Review specifically for privilege escalation, RLS bypass, service-role leakage, audit-sensitive metadata, last-admin races, lifecycle-query omissions, and dead Access Control actions. Resolve all Critical/Important findings before merge approval.

- [ ] **Step 3: Merge only after explicit user approval**

Create/prepare the PR to `feat/wasdok360-release1`, verify exact head CI, obtain the user's explicit merge phrase, merge, then verify post-merge CI on the exact merge commit.

- [ ] **Step 4: Deploy the forward-only migration to the OCPNG production Supabase project only after explicit deployment approval**

Apply `20260902001100_access_control_administration.sql` to project `znbkwlsetcoxhhybadhq` / production branch `main`. Never touch a DLPP project. Do not drop existing RBAC tables or complaint tables.

- [ ] **Step 5: Run a rollback-safe hosted verifier**

The verifier must use `BEGIN ... ROLLBACK`, synthetic `DEMO WASDOK78` identities/rows only, and prove:

- lifecycle columns/functions/RPCs exist;
- RLS remains enabled;
- valid role/permission/user-role/compartment changes work;
- direct self-escalation and held-role self-escalation fail;
- last-admin removal fails;
- revocation/suspension changes authorization immediately;
- audit events contain only safe access metadata;
- rollback leaves no verifier DEMO records.

The final SELECT should return a single status row such as `WASDOK-78 LIVE VERIFICATION PASSED` plus booleans proving no test records remain after rollback.

- [ ] **Step 6: Record evidence in Jira and request closure approval**

Record merge commit, post-merge CI run, hosted migration evidence, rollback verifier result, and any migration-history caveat. If migration was applied manually, do not claim official Supabase migration-history registration unless separately verified.

- [ ] **Step 7: Close WASDOK-78 only after explicit user approval**

Transition Jira to Done only after the user replies with the designated closure approval phrase.
