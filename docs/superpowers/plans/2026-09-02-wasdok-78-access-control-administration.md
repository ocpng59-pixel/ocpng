# WASDOK-78 Access Control Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Release 1 Users / Roles & Permissions prototype into a secure, configurable Access Control Administration subsystem with real role, permission, user-role, scope, compartment, activation and audit workflows.

**Architecture:** Extend the existing UUID-based RBAC schema with lifecycle history and lifecycle-aware authorization. All application-level writes go through authenticated PostgreSQL administration RPCs called by Next.js server actions; user invitation uses the existing server-only Supabase service client only after verified `admin.manage_users` authorization. Dedicated dashboard routes replace the current Access Control dead-label shell.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 6.0.3, Supabase PostgreSQL/Auth/RLS, `@supabase/ssr` 0.12.5, `@supabase/supabase-js` 2.112.4, Zod 4.5.4, Vitest 4.1.11, pgTAP via `supabase test db`.

**Spec:** `docs/superpowers/specs/2026-09-02-wasdok-78-access-control-administration-design.md`

## Global Constraints

- All application roles are fully configurable; seeded role names/codes are not immutable.
- Role retirement is logical (`deleted_at`), never destructive; retired codes remain reserved.
- Privileged changes take effect immediately; no two-person approval queue exists.
- Every privileged mutation requires a trimmed administrative reason of 3–500 characters and one immutable audit event.
- The browser never supplies authoritative actor ID, granted-by identity, actor permission, effective-access claim, or audit timestamp.
- Direct browser/table writes to RBAC configuration tables remain denied; PostgreSQL RPCs are the mutation boundary.
- `admin.manage_users` governs user invitation, activation/suspension and data-scope management.
- `admin.manage_roles` governs role lifecycle and role-permission management.
- User-role and user-compartment assignment/revocation require both `admin.manage_users` and `admin.manage_roles`.
- An administrator cannot modify their own roles, scopes, compartments or active status.
- An administrator cannot alter/deactivate/retire/change permissions on a role they currently hold.
- The database preserves at least one active effective `admin.manage_roles` user and one active effective `admin.manage_users` user.
- `has_permission()`, `has_scope()` and `has_compartment()` become lifecycle-aware and fail for inactive profiles.
- `TRAINING_SUPER_ADMIN` is an application role only; it never gains service-role, database-owner, RLS-bypass, environment-secret or audit-mutation capability.
- Automated E2E tests use only local Supabase and fictional `DEMO WASDOK78` identities.
- WASDOK-78 does not activate production complaint submission.

## Fixed Test Identities

Use these UUIDs in SQL/E2E fixtures so failures are reproducible:

```text
78000000-0000-0000-0000-000000000001  DEMO WASDOK78 Role/User Admin
78000000-0000-0000-0000-000000000002  DEMO WASDOK78 Target User
78000000-0000-0000-0000-000000000003  DEMO WASDOK78 Non Admin
78000000-0000-0000-0000-000000000004  DEMO WASDOK78 Backup Admin
78000000-0000-0000-0000-000000000101  DEMO WASDOK78 Mutable Role
78000000-0000-0000-0000-000000000102  DEMO WASDOK78 Held Role
```

## Locked File Structure

### Database
- Create `supabase/migrations/20260902001100_access_control_administration.sql`.
- Create `supabase/tests/access_control_administration.sql`.
- Modify `supabase/seed.sql`.

### Domain/server
- Create `lib/access-control/types.ts`.
- Create `lib/access-control/validation.ts`.
- Create `lib/access-control/queries.ts`.
- Create `lib/access-control/mutations.ts`.
- Create `lib/access-control/invitations.ts`.

### Routes/components
- Create `app/dashboard/users/actions.ts`.
- Create `app/dashboard/users/page.tsx`.
- Create `app/dashboard/users/[userId]/page.tsx`.
- Create `app/dashboard/users/[userId]/access/page.tsx`.
- Create `app/dashboard/users/roles/actions.ts`.
- Create `app/dashboard/users/roles/page.tsx`.
- Create `app/dashboard/users/roles/new/page.tsx`.
- Create `app/dashboard/users/roles/[roleId]/page.tsx`.
- Create `app/dashboard/users/permissions/page.tsx`.
- Create `app/dashboard/users/scopes-compartments/page.tsx`.
- Create `components/access-control/action-message.tsx`.
- Create `components/access-control/role-form.tsx`.
- Create `components/access-control/permission-matrix.tsx`.
- Create `components/access-control/user-access-form.tsx`.
- Create `components/access-control/user-invite-form.tsx`.
- Modify `app/globals.css`.

### Tests/CI
- Create `tests/access-control/validation.test.ts`.
- Create `tests/access-control/mutations.test.ts`.
- Create `tests/access-control/invitations.test.ts`.
- Create `tests/access-control/routes.test.ts`.
- Create `tests/access-control/e2e.test.ts`.
- Modify `.github/workflows/ci.yml`.
- Modify `scripts/routes-smoke.mjs`.
- Modify security regressions only when a new import/route must be covered.

---

### Task 1: Lifecycle schema, profile sync and lifecycle-aware authorization

**Files:**
- Create `supabase/migrations/20260902001100_access_control_administration.sql`
- Create `supabase/tests/access_control_administration.sql`

**Produces:**
- Lifecycle columns/history uniqueness on `roles`, `user_roles`, `role_permissions`, `data_scopes`, `user_compartments`.
- `private.handle_new_auth_user()` trigger.
- Lifecycle-aware `public.has_permission(text)`, `public.has_scope(text)`, `public.has_compartment(text)`.

- [ ] **Step 1: Write the RED pgTAP contract**

Start the SQL test with `begin;` and `select plan(24);`. The first 24 assertions must be exactly these behaviours:

| # | Assertion |
|---|---|
| 1 | `roles.is_active` exists |
| 2 | `roles.role_type` exists |
| 3 | `roles.deleted_at` exists |
| 4 | `user_roles.is_active` exists |
| 5 | `role_permissions.is_active` exists |
| 6 | `data_scopes.revoked_at` exists |
| 7 | `user_compartments.is_active` exists |
| 8 | inserting auth user 001 creates matching profile |
| 9 | active profile + active role + active assignment + active permission returns `has_permission=true` |
| 10 | inactive profile returns `has_permission=false` |
| 11 | inactive role returns `has_permission=false` |
| 12 | retired role returns `has_permission=false` |
| 13 | revoked user-role returns `has_permission=false` |
| 14 | revoked role-permission returns `has_permission=false` |
| 15 | active matching scope returns `has_scope=true` |
| 16 | revoked scope returns `has_scope=false` |
| 17 | wildcard active scope returns `has_scope=true` |
| 18 | inactive profile returns `has_scope=false` |
| 19 | `PUBLIC` compartment returns true for active profile |
| 20 | `INTERNAL` compartment returns true for active profile |
| 21 | active restricted user-compartment returns true |
| 22 | revoked restricted user-compartment returns false |
| 23 | inactive profile returns false for restricted compartment |
| 24 | transaction finishes and rolls back |

Use `set_config('request.jwt.claim.sub', '<uuid>', true)` before each actor-sensitive assertion.

- [ ] **Step 2: Run RED**

```bash
supabase start
supabase db reset
supabase test db
```

Expected: the new suite fails on missing lifecycle columns/trigger behaviour.

- [ ] **Step 3: Add lifecycle columns and active-row uniqueness**

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

create unique index if not exists user_roles_one_active on public.user_roles(user_id,role_id) where is_active;
create unique index if not exists role_permissions_one_active on public.role_permissions(role_id,permission_id) where is_active;
create unique index if not exists data_scopes_one_active on public.data_scopes(user_id,scope_code) where active;
create unique index if not exists user_compartments_one_active on public.user_compartments(user_id,compartment_id) where is_active;
```

- [ ] **Step 4: Add auth-user profile synchronization**

```sql
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.profiles(id,display_name,email,is_active)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),new.email,'WASDOK User'),new.email,true)
  on conflict(id) do update
    set email=excluded.email,
        display_name=case when public.profiles.display_name='' then excluded.display_name else public.profiles.display_name end,
        updated_at=now();
  return new;
end;
$$;

drop trigger if exists wasdok_auth_user_profile on auth.users;
create trigger wasdok_auth_user_profile
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function private.handle_new_auth_user();
```

- [ ] **Step 5: Replace the three authorization primitives**

```sql
create or replace function public.has_permission(permission_code text)
returns boolean language sql stable security definer set search_path=''
as $$
select exists(
  select 1
  from public.profiles pr
  join public.user_roles ur on ur.user_id=pr.id and ur.is_active
  join public.roles r on r.id=ur.role_id and r.is_active and r.deleted_at is null
  join public.role_permissions rp on rp.role_id=r.id and rp.is_active
  join public.permissions p on p.id=rp.permission_id
  where pr.id=auth.uid() and pr.is_active and p.code=permission_code
);
$$;

create or replace function public.has_scope(scope_code text)
returns boolean language sql stable security definer set search_path=''
as $$
select exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_active)
  and (scope_code is null or exists(
    select 1 from public.data_scopes ds
    where ds.user_id=auth.uid() and ds.active and (ds.scope_code=scope_code or ds.scope_code='*')
  ));
$$;

create or replace function public.has_compartment(classification_code text)
returns boolean language sql stable security definer set search_path=''
as $$
select exists(select 1 from public.profiles pr where pr.id=auth.uid() and pr.is_active)
  and (classification_code in ('PUBLIC','INTERNAL') or exists(
    select 1 from public.user_compartments uc
    join public.security_compartments sc on sc.id=uc.compartment_id
    where uc.user_id=auth.uid() and uc.is_active and sc.code::text=classification_code
  ));
$$;
```

- [ ] **Step 6: Run GREEN and commit**

```bash
supabase db reset
supabase test db
git add supabase/migrations/20260902001100_access_control_administration.sql supabase/tests/access_control_administration.sql
git commit -m "feat(WASDOK-78): add access control lifecycle authorization"
```

---

### Task 2: Role lifecycle RPCs, audit helper and role-held self-protection

**Files:** same migration/test files.

**Produces exact RPCs:**

```text
admin_create_role(text,text,text,text,text) returns uuid
admin_update_role(uuid,text,text,text,text,text) returns void
admin_set_role_active(uuid,boolean,text) returns void
admin_retire_role(uuid,text) returns void
```

- [ ] **Step 1: Append 20 RED assertions**

Extend the test plan by 20 and prove these cases with fixed fixtures:

| Case | Expected |
|---|---|
| admin creates `wasdok78_demo_role` | succeeds; one active row; audit `access.role_created` |
| non-admin creates role | SQLSTATE `42501`; zero role rows |
| duplicate active/retired code | SQLSTATE `23505` or explicit `23514`; original row unchanged |
| admin updates code/name/type | succeeds; audit `access.role_updated` |
| actor updates role 102 that actor holds | SQLSTATE `42501`; unchanged |
| deactivate role 101 | `is_active=false`; audit `access.role_deactivated` |
| reactivate role 101 | `is_active=true`; audit `access.role_activated` |
| actor deactivates held role 102 | SQLSTATE `42501` |
| retire role with active assignment | SQLSTATE `23514` |
| retire unassigned role | `deleted_at` non-null, `is_active=false`, row retained, audit `access.role_retired` |

- [ ] **Step 2: Run RED**

`supabase test db` must fail because the RPCs do not exist.

- [ ] **Step 3: Add private helpers**

```sql
create or replace function private.require_access_admin(required_permission text, administrative_reason text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception using errcode='42501',message='Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=actor and p.is_active) then
    raise exception using errcode='42501',message='Active administrator required';
  end if;
  if coalesce(length(trim(administrative_reason)),0) not between 3 and 500 then
    raise exception using errcode='22023',message='Administrative reason must be 3 to 500 characters';
  end if;
  if not public.has_permission(required_permission) then
    raise exception using errcode='42501',message='Administrative permission denied';
  end if;
  return actor;
end;
$$;

create or replace function private.actor_holds_role(target_role_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
select exists(select 1 from public.user_roles where user_id=auth.uid() and role_id=target_role_id and is_active);
$$;

create or replace function private.write_access_audit(
  p_actor uuid,p_action text,p_entity_type text,p_entity_id uuid,p_reason text,p_before jsonb,p_after jsonb
) returns void language plpgsql security definer set search_path=''
as $$
begin
  insert into public.audit_events(actor_id,action,entity_type,entity_id,reason,before_data,after_data,classification,request_metadata)
  values(p_actor,p_action,p_entity_type,p_entity_id,p_reason,p_before,p_after,'RESTRICTED',jsonb_build_object('event_source','wasdok-access-control'));
end;
$$;
```

- [ ] **Step 4: Implement all four role RPCs with these non-negotiable rules**

The implementation body for each RPC must call `private.require_access_admin('admin.manage_roles', p_reason)`. Update/status/retire must reject `private.actor_holds_role(p_role_id)`. Code must match `^[a-z0-9_]{3,64}$`. Role type must be one of the database check values. Retirement performs this update and never `DELETE`:

```sql
update public.roles
set is_active=false,
    deleted_at=now(),deleted_by=actor,
    deactivated_at=coalesce(deactivated_at,now()),
    deactivated_by=coalesce(deactivated_by,actor),
    updated_by=actor,updated_at=now()
where id=p_role_id and deleted_at is null;
```

Retirement first rejects any `user_roles` row with matching role and `is_active=true`.

- [ ] **Step 5: Lock EXECUTE and run GREEN**

```sql
revoke all on function public.admin_create_role(text,text,text,text,text) from public,anon;
revoke all on function public.admin_update_role(uuid,text,text,text,text,text) from public,anon;
revoke all on function public.admin_set_role_active(uuid,boolean,text) from public,anon;
revoke all on function public.admin_retire_role(uuid,text) from public,anon;
grant execute on function public.admin_create_role(text,text,text,text,text) to authenticated;
grant execute on function public.admin_update_role(uuid,text,text,text,text,text) to authenticated;
grant execute on function public.admin_set_role_active(uuid,boolean,text) to authenticated;
grant execute on function public.admin_retire_role(uuid,text) to authenticated;
```

Run `supabase db reset && supabase test db`, then commit:

```bash
git add supabase/migrations/20260902001100_access_control_administration.sql supabase/tests/access_control_administration.sql
git commit -m "feat(WASDOK-78): add audited role lifecycle RPCs"
```

---

### Task 3: Role-permission RPCs and last-admin protection

**Produces:**

```text
admin_grant_role_permission(uuid,text,text) returns uuid
admin_revoke_role_permission(uuid,text,text) returns void
```

- [ ] **Step 1: Append 16 RED assertions**

Prove: approved permission grant succeeds; unknown permission returns `22023`; duplicate active grant fails; revoke sets `is_active=false` plus `revoked_at/revoked_by`; historical row remains; re-grant creates a new active row; `has_permission` changes immediately; actor cannot grant/revoke on held role 102; removing the only `admin.manage_roles` path returns `23514`; removing the only `admin.manage_users` path returns `23514`; each success produces exactly one `access.role_permission_*` audit event.

- [ ] **Step 2: Add effective-admin helper**

```sql
create or replace function private.effective_admin_count(permission_code text)
returns bigint language sql stable security definer set search_path=''
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

- [ ] **Step 3: Implement grant/revoke**

Grant resolves `permissions.id`, inserts an active lifecycle row with `granted_by=actor`, and audits `access.role_permission_granted`. Revoke performs:

```sql
update public.role_permissions
set is_active=false,revoked_at=now(),revoked_by=actor,updated_at=now()
where role_id=p_role_id and permission_id=permission_id_value and is_active;
```

After any candidate removal/deactivation that could affect administration, assert both effective-admin counts are greater than zero before returning. Raising `23514` must roll back the candidate mutation and its audit.

- [ ] **Step 4: Restrict EXECUTE, run GREEN, commit**

Revoke from `public,anon`, grant to `authenticated`, run `supabase db reset && supabase test db`, then:

```bash
git add supabase/migrations/20260902001100_access_control_administration.sql supabase/tests/access_control_administration.sql
git commit -m "feat(WASDOK-78): add safe role permission administration"
```

---

### Task 4: User-role, scope, compartment and active-status RPCs

**Produces:**

```text
admin_assign_user_role(uuid,uuid,text) returns uuid
admin_revoke_user_role(uuid,uuid,text) returns void
admin_grant_data_scope(uuid,text,text,text) returns uuid
admin_revoke_data_scope(uuid,text,text) returns void
admin_grant_user_compartment(uuid,text,text) returns uuid
admin_revoke_user_compartment(uuid,text,text) returns void
admin_set_user_active(uuid,boolean,text) returns void
```

- [ ] **Step 1: Append 28 RED assertions**

Test this matrix:

| Operation | Required authority | Success effect | Mandatory negative |
|---|---|---|---|
| assign user role | users + roles | active history row | self target `42501` |
| revoke user role | users + roles | row retained inactive | last admin `23514` |
| grant scope | users | active scope row | self target `42501` |
| revoke scope | users | row retained inactive | self target `42501` |
| grant compartment | users + roles | active compartment row | self target `42501` |
| revoke compartment | users + roles | row retained inactive | self target `42501` |
| suspend user | users | `profiles.is_active=false` | self target `42501`; last admin `23514` |
| reactivate user | users | `profiles.is_active=true` | self target `42501` |

Also prove immediate `has_permission`, `has_scope`, `has_compartment` results after grant/revoke/suspension and one audit event per success.

- [ ] **Step 2: Add self-target helper**

```sql
create or replace function private.reject_self_target(target_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if target_user_id=auth.uid() then
    raise exception using errcode='42501',message='Administrators cannot modify their own access';
  end if;
end;
$$;
```

- [ ] **Step 3: Implement all seven RPCs**

Every RPC calls `private.reject_self_target(p_user_id)`. Role and compartment operations first call `private.require_access_admin('admin.manage_users',p_reason)` and additionally require `public.has_permission('admin.manage_roles')`. Scope/status operations require `admin.manage_users`. Grants insert a new active lifecycle row; revokes update the current active row and preserve history. `admin_set_user_active` updates the profile then asserts both effective-admin counts remain greater than zero.

- [ ] **Step 4: Prove direct table writes remain denied**

Add pgTAP `throws_ok` assertions for authenticated direct `insert/update/delete` against `roles`, `role_permissions`, `user_roles`, `data_scopes`, `user_compartments`. Do not create direct mutation RLS policies.

- [ ] **Step 5: Restrict EXECUTE, run GREEN, commit**

Grant all seven RPCs only to `authenticated`; revoke from `public,anon`. Run `supabase db reset && supabase test db`, then commit:

```bash
git add supabase/migrations/20260902001100_access_control_administration.sql supabase/tests/access_control_administration.sql
git commit -m "feat(WASDOK-78): add user access administration RPCs"
```

---

### Task 5: Domain types, validation, safe queries and mutation adapters

**Files:**
- Create `lib/access-control/types.ts`
- Create `lib/access-control/validation.ts`
- Create `lib/access-control/queries.ts`
- Create `lib/access-control/mutations.ts`
- Create `tests/access-control/validation.test.ts`
- Create `tests/access-control/mutations.test.ts`

**Produces:**

```ts
export type AccessControlActionState = { ok: true; message: string } | { ok: false; message: string; fieldErrors?: Record<string,string> };
export type RoleType = 'operational' | 'administrative' | 'training';
```

Query exports: `listRoles`, `getRoleDetail`, `listUsers`, `getUserAccess`, `listPermissions`, `listCompartments`.
Mutation exports mirror all 13 administration RPCs.

- [ ] **Step 1: Write RED validation tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseReason, parseRoleForm } from '@/lib/access-control/validation';

describe('WASDOK-78 validation', () => {
  it('accepts a configurable training role', () => {
    expect(parseRoleForm({
      code:'training_super_admin',name:'Training Super Administrator',description:'DEMO/UAT role',roleType:'training',reason:'Prepare controlled UAT access'
    }).success).toBe(true);
  });
  it('rejects an invalid role code', () => {
    expect(parseRoleForm({code:'Chief Ombudsman!',name:'Role',description:'',roleType:'operational',reason:'Change role'}).success).toBe(false);
  });
  it('rejects a short reason', () => {
    expect(parseReason('x').success).toBe(false);
  });
});
```

- [ ] **Step 2: Write RED mutation tests**

Mock `createServerSupabaseClient()` and prove `grantUserCompartment({userId,compartment,reason})` sends only `p_user_id`, `p_compartment_code`, `p_reason`; no actor/audit fields are accepted.

- [ ] **Step 3: Run RED**

```bash
npx vitest run tests/access-control/validation.test.ts tests/access-control/mutations.test.ts
```

- [ ] **Step 4: Implement validators with exact constraints**

```ts
const roleCode=z.string().trim().regex(/^[a-z0-9_]{3,64}$/);
const roleType=z.enum(['operational','administrative','training']);
const reason=z.string().trim().min(3).max(500);
const scopeCode=z.string().trim().min(1).max(100);
const email=z.string().trim().email();
```

Parsers return discriminated success/error objects and never expose Zod internals directly to users.

- [ ] **Step 5: Implement server-only query layer**

`queries.ts` starts `import 'server-only';`, uses `createServerSupabaseClient()`, never the service client, and selects only UI-required fields. `RoleDetail` includes `actorHoldsRole:boolean` computed from the current authenticated profile so role forms can fail closed in the UI in addition to database enforcement.

- [ ] **Step 6: Implement mutation wrappers and safe SQLSTATE mapping**

Example complete wrapper:

```ts
export async function grantUserCompartment(input:{userId:string;compartment:SecurityClassification;reason:string}):Promise<AccessControlActionState>{
  const supabase=await createServerSupabaseClient();
  if(!supabase) return {ok:false,message:'Access Control is unavailable.'};
  const {error}=await supabase.rpc('admin_grant_user_compartment',{
    p_user_id:input.userId,p_compartment_code:input.compartment,p_reason:input.reason,
  });
  if(!error) return {ok:true,message:'Compartment granted.'};
  return {ok:false,message:mapAccessControlError(error.code)};
}
```

Map `42501` → `Administrative permission denied.`, `22023` → `The submitted access change is invalid.`, `23505` → `That active assignment already exists.`, `23514` → `The access change is blocked by a security safeguard.`, and all other codes → `The access change could not be completed.`.

- [ ] **Step 7: Run GREEN and commit**

```bash
npx vitest run tests/access-control/validation.test.ts tests/access-control/mutations.test.ts
npm run typecheck
git add lib/access-control tests/access-control
git commit -m "feat(WASDOK-78): add access control domain and mutation layer"
```

---

### Task 6: Safe user invitation adapter

**Files:**
- Create `lib/access-control/invitations.ts`
- Create `tests/access-control/invitations.test.ts`

- [ ] **Step 1: Write RED tests**

Prove: no session → unavailable; `has_permission('admin.manage_users')` false → denied and service client never created; allowed → calls `auth.admin.inviteUserByEmail(email,{data:{display_name}})`; raw service-role key never appears in returned state/error.

- [ ] **Step 2: Run RED**

`npx vitest run tests/access-control/invitations.test.ts`.

- [ ] **Step 3: Implement adapter**

```ts
import 'server-only';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';

export async function inviteApplicationUser(input:{email:string;displayName:string;reason:string}):Promise<AccessControlActionState>{
  const session=await createServerSupabaseClient();
  if(!session) return {ok:false,message:'Access Control is unavailable.'};
  const {data:allowed,error:permissionError}=await session.rpc('has_permission',{permission_code:'admin.manage_users'});
  if(permissionError||allowed!==true) return {ok:false,message:'Administrative permission denied.'};
  if(input.reason.trim().length<3||input.reason.trim().length>500) return {ok:false,message:'Administrative reason is required.'};
  const service=createServiceSupabaseClient();
  const {error}=await service.auth.admin.inviteUserByEmail(input.email,{data:{display_name:input.displayName}});
  return error?{ok:false,message:'The user invitation could not be sent.'}:{ok:true,message:'User invitation sent.'};
}
```

The profile sync trigger from Task 1 creates/updates `profiles` when Auth creates the user.

- [ ] **Step 4: Run GREEN/security and commit**

```bash
npx vitest run tests/access-control/invitations.test.ts
npm run test:auth-security
npm run typecheck
git add lib/access-control/invitations.ts tests/access-control/invitations.test.ts
git commit -m "feat(WASDOK-78): add protected user invitations"
```

---

### Task 7: Activate Review roles and permission matrix routes

**Files:**
- Create role routes/actions/components listed in Locked File Structure.
- Create `tests/access-control/routes.test.ts`.
- Modify `app/globals.css`.

- [ ] **Step 1: Write RED route assertions**

The test reads source files and asserts concrete paths exist, `/dashboard/users/roles` renders an anchor/form control containing `Review roles`, `Create role` exists, `/dashboard/users/permissions` is read-only, and no Access Control action is emitted as `<span className="oc-action">Review roles</span>` or `<span className="oc-action">Grant compartment</span>`.

- [ ] **Step 2: Run RED**

`npx vitest run tests/access-control/routes.test.ts`.

- [ ] **Step 3: Implement role server actions**

Every action uses `'use server'`, parses `FormData` through Task 5, calls only Task 5 mutation wrappers, ignores any browser `actorId/grantedBy/auditTimestamp` fields, and calls `revalidatePath('/dashboard/users/roles')` after success.

- [ ] **Step 4: Implement `/dashboard/users/roles`**

Render title `Roles, Permissions & Compartments`, links `Review roles`, `Permissions`, `Scopes & Compartments`, `Audit History`, role table (code/name/type/status/user count/permission count), and `Create role`.

- [ ] **Step 5: Implement role create/detail and permission matrix**

`/roles/new` uses `RoleForm`. `/roles/[roleId]` renders role details plus `PermissionMatrix`. If `actorHoldsRole=true`, all mutation controls are disabled and the page renders exactly: `You cannot change a role currently assigned to your own account.`

- [ ] **Step 6: Implement read-only permission catalogue and focused CSS**

Group permissions by domain and expose no create-permission control. Add `.oc-admin-grid`, `.oc-admin-table`, `.oc-form-grid`, `.oc-inline-actions`, `.oc-field-error`, `.oc-action-link` styles.

- [ ] **Step 7: Run GREEN and commit**

```bash
npx vitest run tests/access-control/routes.test.ts
npm run test:routes
npm run typecheck
npm run lint
git add app/dashboard/users/roles app/dashboard/users/permissions components/access-control app/globals.css tests/access-control/routes.test.ts
git commit -m "feat(WASDOK-78): activate role administration screens"
```

---

### Task 8: Activate Users and Grant compartment workflows

**Files:**
- Create user routes/actions/components listed in Locked File Structure.
- Modify `tests/access-control/routes.test.ts`.

- [ ] **Step 1: Extend RED assertions**

Assert concrete `/dashboard/users`, `/dashboard/users/[userId]`, `/dashboard/users/[userId]/access`, `/dashboard/users/scopes-compartments` routes exist; `Grant compartment` is an interactive link; user access forms contain a required `reason`; no form includes authoritative `actorId` or `grantedBy` inputs.

- [ ] **Step 2: Run RED**

`npx vitest run tests/access-control/routes.test.ts`.

- [ ] **Step 3: Implement user actions**

Expose invitation, activate/suspend, assign/revoke role, grant/revoke scope and grant/revoke compartment server actions. Every action parses validation, calls the trusted adapter, and revalidates both user detail/access paths after success.

- [ ] **Step 4: Implement user catalogue/detail/access screens**

User catalogue shows display name, email, active/suspended status and counts plus `Invite user`. User detail shows roles/effective permissions/scopes/compartments. User access form has separate Roles, Data scopes, Security compartments and Account status sections. Every mutation has a required reason.

- [ ] **Step 5: Enforce read-only self view in UI**

When the selected `userId` equals authenticated actor ID, render access data but no mutation controls and show exactly `You cannot modify your own privileged access.` Database RPCs remain authoritative even if client markup is manipulated.

- [ ] **Step 6: Implement Grant compartment entry point**

`/dashboard/users/scopes-compartments` lists target users; each row links to `/dashboard/users/<id>/access` with label `Manage roles, scopes & compartments`. This replaces the dead `Grant compartment` label.

- [ ] **Step 7: Run GREEN and commit**

```bash
npx vitest run tests/access-control/routes.test.ts
npm run test:routes
npm run typecheck
npm run lint
git add app/dashboard/users components/access-control tests/access-control/routes.test.ts
git commit -m "feat(WASDOK-78): activate user and compartment administration"
```

---

### Task 9: Training role, security regressions, E2E and CI

**Files:**
- Modify `supabase/seed.sql`.
- Modify `scripts/routes-smoke.mjs`.
- Modify relevant security tests.
- Create `tests/access-control/e2e.test.ts`.
- Modify `.github/workflows/ci.yml`.

- [ ] **Step 1: Seed only the configurable training role definition**

```sql
insert into public.roles(code,name,description,is_system,is_active,role_type,metadata)
values('training_super_admin','Training Super Administrator','DEMO/UAT application-wide functional role; not an infrastructure superuser.',false,true,'training','{"demo_role":true}'::jsonb)
on conflict(code) do update
set name=excluded.name,description=excluded.description,role_type='training',metadata=public.roles.metadata||'{"demo_role":true}'::jsonb;
```

Do not auto-assign a user and do not auto-grant permissions.

- [ ] **Step 2: Add route/security regression assertions**

Add every dedicated Access Control route to `routes-smoke`. Add protected-route coverage proving unauthenticated requests are not rendered. Add a service-role boundary assertion proving Access Control client components never import `@/lib/supabase/service`.

- [ ] **Step 3: Write RED local-Supabase E2E**

Enable only when `WASDOK78_ACCESS_E2E=true`. Create fictional admin/backup/target/non-admin identities locally, bootstrap admin permissions with the local service client, then exercise real authenticated RPCs/server adapters. Assert:

```ts
expect(await permissionFor(targetClient,'complaints.view')).toBe(true);
expect(await compartmentFor(targetClient,'CONFIDENTIAL')).toBe(true);
expect(await permissionFor(targetClient,'complaints.view')).toBe(false); // after revoke
expect(await permissionFor(targetClient,'dashboard.view')).toBe(false); // after suspension
expect(auditActions).toEqual(expect.arrayContaining([
  'access.role_created','access.role_permission_granted','access.user_role_assigned',
  'access.compartment_granted','access.role_permission_revoked','access.user_suspended',
]));
```

Also assert non-admin and self-escalation attempts fail without row-count changes and serialized audit data contains no password/JWT/service-role/session-cookie material.

- [ ] **Step 4: Add dedicated CI stage after local Supabase reset/pgTAP**

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

- [ ] **Step 5: Run the complete verification sequence**

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
npm run test:auth-security
npm run typecheck
npm run lint
npm run build
```

Every command must exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql scripts tests .github/workflows/ci.yml
git commit -m "test(WASDOK-78): add access control security and end-to-end coverage"
```

---

### Task 10: Review, merge, hosted migration verification and closure

- [ ] **Step 1: Verify final branch head from scratch**

Record exact SHA and rerun the full Task 9 verification sequence after the last code commit.

- [ ] **Step 2: Perform security-focused code review**

Reject merge for any Critical/Important finding involving privilege escalation, RLS bypass, service-role leakage, raw SQL errors in UI, missing audit, last-admin race, lifecycle omission, destructive role/history deletion, or dead Access Control action.

- [ ] **Step 3: PR and merge gate**

Open/prepare the PR to `feat/wasdok360-release1`, verify CI on exact head, and obtain explicit user merge approval before merging. After merge, verify post-merge CI on the exact merge commit.

- [ ] **Step 4: Hosted migration gate**

After explicit deployment approval, apply only `20260902001100_access_control_administration.sql` to OCPNG Supabase project `znbkwlsetcoxhhybadhq`, production branch `main`. Never touch DLPP projects and never drop existing RBAC/complaint tables.

- [ ] **Step 5: Run rollback-safe hosted verifier**

Use `BEGIN ... ROLLBACK` and only `DEMO WASDOK78` fixtures. Verify: lifecycle columns/functions/RPCs exist; RLS remains enabled; valid role/permission/user-role/compartment changes work; direct and held-role self-escalation fail; last-admin removal fails; revocation/suspension changes authorization immediately; audit metadata contains no credentials/PII beyond necessary target identifiers; rollback leaves no verifier rows.

Final verifier query must return one row with:

```text
verification_status = WASDOK-78 LIVE VERIFICATION PASSED
no_test_records_remain = true
lifecycle_authorization_verified = true
admin_rpcs_verified = true
anti_lockout_verified = true
audit_verified = true
```

- [ ] **Step 6: Record Jira evidence and closure gate**

Record design commit, implementation head, merge commit, post-merge CI, hosted migration evidence, verifier result and any migration-history caveat. If SQL was manually applied, do not claim official Supabase migration-history registration without separate proof. Transition WASDOK-78 to Done only after explicit closure approval.
