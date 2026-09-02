# WASDOK-78 — Configurable Access Control Administration Design

**Status:** Design approved in principle; implementation not started  
**Jira:** WASDOK-78 — Build configurable Access Control Administration module  
**Target branch:** `feat/wasdok360-release1`  
**Design branch:** `WASDOK-78-access-control-admin`  
**Date:** 2026-09-02

## 1. Purpose

WASDOK-78 converts the existing Administration → Users / Roles & Permissions prototype surfaces into a functional, secure Access Control Administration subsystem.

The current Release 1 UI exposes actions such as **Review roles** and **Grant compartment**, but the generic module renderer displays those actions as non-functional labels. WASDOK-78 replaces that prototype behaviour with real routes, forms, server actions and PostgreSQL authorization operations while preserving WASDOK 360's existing permission, scope, compartment, RLS and immutable-audit security model.

The outcome is an administrator-facing capability for managing application users, configurable roles, approved permissions, organisational/data scope and security compartments without requiring role-specific source-code changes.

## 2. Approved governance decisions

The following decisions are authoritative for this design:

1. **All application roles are fully configurable.** Existing seeded roles such as Chief Ombudsman, Ombudsman, Secretary, Counsel, Director, Team Leader, Senior Investigator, Investigator and System Administrator are not permanently protected from rename, deactivation or retirement merely because they were seeded as system roles.
2. **Privileged configuration changes take effect immediately.** There is no two-person approval queue for role, permission, user-role, scope or compartment changes.
3. **Immediate change does not mean unrestricted change.** Every privileged mutation remains subject to authenticated server-side authorization, database-side authorization, anti-lockout rules, a mandatory reason and immutable audit evidence.
4. **Role identity is UUID-based.** Role codes and names are editable labels/business identifiers; foreign-key relationships continue to use the role UUID.
5. **Permission capabilities remain an approved application catalogue.** Administrators may assign or remove permissions from roles, but cannot invent arbitrary permission codes that the application does not implement.
6. **Training Super Administrator is an application role, not infrastructure superuser.** `TRAINING_SUPER_ADMIN` may be configured for broad DEMO/UAT functional access but cannot access service-role credentials, environment secrets, database owner capabilities, RLS bypass or mutable audit controls.
7. **Role deletion is a controlled logical retirement, not destructive history deletion.** The UI may present a Delete/Retire action after active assignments are resolved, but the database retains the role UUID and historical security/audit relationships. Retired role codes remain reserved to avoid ambiguous reuse.

## 3. Existing foundation

The repository already contains the principal access-control data model:

- `profiles`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `data_scopes`
- `security_compartments`
- `user_compartments`

The current authorization model already exposes database functions including:

- `has_permission(permission_code)`
- `has_compartment(classification_code)`
- `has_scope(scope_code)`
- `record_access_allowed(...)`

The dashboard module router already checks route permission and classification/compartment access before rendering protected modules.

The missing capability is the controlled administration write layer. Current RBAC tables have read-side authorization policies but no complete administrator-facing mutation workflow. The current generic module UI also renders module actions as `<span>` labels rather than links or executable controls.

The current `has_permission()` implementation also does not yet account for profile status, role status or assignment lifecycle because those lifecycle fields do not exist. The current `has_compartment()` implementation similarly has no revocation lifecycle. WASDOK-78 must therefore update these authorization functions so suspension, deactivation and revocation take effect immediately.

WASDOK-78 extends the existing security architecture; it does not replace it.

## 4. Scope

### 4.1 In scope

WASDOK-78 implements:

- User administration and access status management.
- Configurable role catalogue.
- Role create/edit/activate/deactivate/retire lifecycle.
- Approved permission catalogue presentation.
- Role-permission assignment matrix.
- User-role assignment and revocation.
- Organisation/data-scope assignment and revocation.
- Security-compartment assignment and revocation.
- Effective-access summary for a selected user.
- `TRAINING_SUPER_ADMIN` support for controlled DEMO/UAT use.
- Immutable audit evidence for all access-control configuration mutations.
- Negative authorization tests and anti-lockout safeguards.
- Functional routing for the current **Review roles** and **Grant compartment** controls.
- Lifecycle-aware updates to `has_permission()`, `has_compartment()` and `has_scope()` so access grants and revocations are immediately authoritative.

### 4.2 Out of scope

WASDOK-78 does not:

- Make every placeholder action in every WASDOK 360 business module functional. A separate Release 1 action/navigation completion work item should cover the cross-module dead-action audit.
- Disable or weaken RLS, immutable audit protection, record immutability or security-classification controls.
- Provide database-owner, Supabase project-owner or infrastructure-secret administration.
- Implement production MFA policy; privileged-account MFA remains part of production security readiness.
- Replace Supabase Auth with a custom identity provider.
- Permit arbitrary runtime permission-code creation that application code does not understand.

## 5. Architecture

### 5.1 Security boundary

The administration UI is not an authorization boundary.

The request flow is:

1. Authenticated administrator opens an Access Control route.
2. Next.js server code resolves the verified Supabase session.
3. The server action validates submitted form data and never trusts a browser-supplied actor ID, actor permission, effective-access claim or audit timestamp.
4. The server calls a dedicated PostgreSQL administration RPC using the authenticated session context.
5. The RPC independently re-checks required permissions, actor activity and anti-lockout conditions immediately before mutation.
6. The mutation and its audit event execute atomically in one database transaction.
7. The UI refreshes authoritative data from the database after success.

Direct browser writes to RBAC tables remain denied.

The service-role credential is not used as the normal authorization mechanism for application-level role/permission administration. Where Supabase Auth administrative APIs are needed for user invitation/creation, that operation is isolated to server-only code and the privileged credential is never exposed to browser artifacts.

### 5.2 Administration routes

WASDOK-78 uses these routes:

- `/dashboard/users` — user catalogue and user administration.
- `/dashboard/users/[userId]` — user identity/access summary.
- `/dashboard/users/[userId]/access` — user roles, scopes and compartment assignments.
- `/dashboard/users/roles` — role catalogue / Access Control landing.
- `/dashboard/users/roles/new` — create role.
- `/dashboard/users/roles/[roleId]` — role detail and permission matrix.
- `/dashboard/users/permissions` — read-only approved application permission catalogue.
- `/dashboard/users/scopes-compartments` — configured scope and compartment catalogue/assignment entry point.
- `/dashboard/audit-log?domain=access` — immutable access-control audit history filtered through the existing audit module.

The existing generic module shell may remain for untouched modules, but Access Control receives dedicated components because it is a transactional administration subsystem rather than a static landing page.

## 6. Screens and control behaviour

### 6.1 Access Control landing

The `/dashboard/users/roles` experience becomes a real administration console with navigation to:

- Users
- Roles
- Permissions
- Scopes & Compartments
- Access-control Audit History

The existing controls are rewired as follows:

**Review roles**

- Navigates to `/dashboard/users/roles`.
- Lists all configured roles and their status.
- Supports role creation and selection.
- Displays assigned-user count and effective permission count.

**Grant compartment**

- Navigates to `/dashboard/users/scopes-compartments` and requires target-user selection before mutation.
- Displays current roles, effective permissions, scopes and compartments before change.
- Supports grant/revoke of approved security compartments with a required reason.
- When launched from a user detail screen, the action deep-links directly to `/dashboard/users/[userId]/access`.

No visible production-looking action in the Access Control module may remain a dead label. An action must be functional, explicitly disabled with a reason, or removed.

### 6.2 Role catalogue and permission matrix

Authorized administrators can:

- Create a role.
- Edit role code.
- Edit role name.
- Edit role description.
- Change role type.
- Activate/deactivate a role.
- Review assigned users.
- Grant/revoke approved permissions.
- Retire a role after assignment safeguards pass.

The permission matrix is grouped by domain, including:

- Dashboard
- Complaints
- Investigations / Evidence
- Leadership Code
- Annual Statements
- Government Oversight
- Compliance
- Commission
- Legal
- Intelligence
- Reporting
- Workflow
- Administration
- Audit

Each permission shown in the matrix corresponds to an approved capability known to the application and database.

An administrator may not modify the definition or permission matrix of any role they currently hold. This prevents indirect self-escalation by granting new capabilities to an already-held role.

### 6.3 User administration

The Users screen shows only appropriate identity/access-management data required for administration:

- display name
- email / login identity as applicable
- active/suspended status
- current roles
- organisation/data scope
- permitted compartments
- effective permission summary
- access-control audit history

Authorized operations include:

- invite/create a supported application user
- activate access
- suspend access
- assign/revoke role
- assign/revoke scope
- grant/revoke compartment
- review effective access

Password values are never displayed or stored by WASDOK 360.

### 6.4 Training Super Administrator

`TRAINING_SUPER_ADMIN` is created/configured through the same role catalogue as any other role.

For DEMO/UAT it may receive broad application permissions and DEMO/UAT compartments. It does not receive:

- Supabase service-role access
- environment secrets
- database-owner permissions
- RLS bypass
- audit mutation capability
- ability to weaken protected-record immutability

Production use of such a role remains subject to privileged-access policy and is not implied merely by its existence in UAT.

## 7. Data model changes

The implementation extends the existing RBAC tables rather than introducing parallel role systems.

### 7.1 Roles

Add:

- `is_active boolean not null default true`
- `role_type text not null default 'operational' check (role_type in ('operational','administrative','training'))`
- `deactivated_at timestamptz`
- `deactivated_by uuid references profiles(id)`
- `deleted_at timestamptz`
- `deleted_by uuid references profiles(id)`
- `updated_by uuid references profiles(id)`

Existing `is_system` remains for provenance/reporting compatibility only; it does not make seeded roles immutable.

A retired role is represented by `deleted_at is not null` and `is_active = false`. Retired role rows are never reused as new roles, and their unique role codes remain reserved.

### 7.2 User-role assignments

`user_roles` uses explicit lifecycle rows rather than destructive deletion. Add:

- `is_active boolean not null default true`
- `assigned_by uuid references profiles(id)`
- `assigned_at timestamptz not null default now()`
- `revoked_at timestamptz`
- `revoked_by uuid references profiles(id)`

Replace the current unconditional `unique(user_id, role_id)` constraint with an active-assignment uniqueness rule that permits historical revoked rows but only one active assignment for a `(user_id, role_id)` pair.

Revocation sets `is_active = false`, `revoked_at` and `revoked_by`; it does not delete history.

### 7.3 Role-permission assignments

`role_permissions` also uses lifecycle rows. Add:

- `is_active boolean not null default true`
- `granted_by uuid references profiles(id)`
- `granted_at timestamptz not null default now()`
- `revoked_at timestamptz`
- `revoked_by uuid references profiles(id)`

Replace the current unconditional `unique(role_id, permission_id)` constraint with an active-assignment uniqueness rule.

Revocation preserves the historical row.

### 7.4 Data scopes

`data_scopes.active` remains the authoritative lifecycle flag. Add:

- `granted_by uuid references profiles(id)`
- `granted_at timestamptz not null default now()`
- `revoked_at timestamptz`
- `revoked_by uuid references profiles(id)`

Replace the current unconditional `unique(user_id, scope_code)` constraint with an active-scope uniqueness rule so historical grants can be retained.

### 7.5 User compartments

`user_compartments` uses explicit lifecycle rows. Add:

- `is_active boolean not null default true`
- `revoked_at timestamptz`
- `revoked_by uuid references profiles(id)`

Existing `granted_by` and `granted_at` are retained.

Replace the current unconditional `unique(user_id, compartment_id)` constraint with an active-assignment uniqueness rule.

### 7.6 Permission catalogue

The permission catalogue is database-backed and synchronized with implemented application capabilities.

Administrators can assign/revoke approved permissions from roles. They cannot create arbitrary new permission identifiers that lack application meaning.

TypeScript continues to provide compile-time safety for known permission codes while the database is authoritative for runtime role-permission assignments.

### 7.7 Lifecycle-aware authorization functions

WASDOK-78 updates the authorization functions as follows:

- `has_permission(code)` returns true only when the authenticated profile is active, the user-role assignment is active, the role is active and not retired, the role-permission assignment is active, and the permission code exists.
- `has_compartment(code)` returns true for `PUBLIC`/`INTERNAL` as currently defined, otherwise only when the authenticated profile is active and the user-compartment assignment is active.
- `has_scope(code)` returns true only for an active profile and an active matching scope (`scope_code = requested` or `*`).
- suspension of a profile therefore causes permission/scope/compartment authorization to fail for subsequent protected requests without waiting for client-side state refresh.

These functions remain server/database authorization primitives and continue to be used by RLS and route authorization.

## 8. Database administration API

Dedicated PostgreSQL RPCs provide the mutation boundary. The implementation uses these contracts:

- `admin_create_role`
- `admin_update_role`
- `admin_set_role_active`
- `admin_retire_role`
- `admin_grant_role_permission`
- `admin_revoke_role_permission`
- `admin_assign_user_role`
- `admin_revoke_user_role`
- `admin_grant_data_scope`
- `admin_revoke_data_scope`
- `admin_grant_user_compartment`
- `admin_revoke_user_compartment`
- `admin_set_user_active`

User invitation/creation itself uses a separate server-only Supabase Auth administration adapter because creation of an Auth identity is not a normal authenticated PostgreSQL row mutation.

Each PostgreSQL administration RPC must:

1. Require an authenticated and active actor.
2. Check the necessary administrator permission in the database.
3. Reject direct and indirect self-modification where prohibited.
4. Apply anti-lockout checks.
5. Validate target records and approved capability values.
6. Require a non-empty administrative reason.
7. Perform mutation and audit insert in one transaction.
8. Return a minimal structured success result suitable for server actions.
9. Avoid returning privileged credentials or unnecessary sensitive data.

RPC execution privileges are granted only to `authenticated`; `anon` receives no execution rights. The functions themselves remain the authoritative authorization boundary and must not rely on table visibility alone.

## 9. Authorization rules

### 9.1 Administrator permissions

The permission split is explicit:

- `admin.manage_users` is required for user invitation/creation, user activation/suspension, user identity/access summary and data-scope management.
- `admin.manage_roles` is required for role lifecycle, role-permission matrix and role/compartment catalogue operations.
- Mutations that attach or detach a role or security compartment to/from a user require **both** `admin.manage_users` and `admin.manage_roles` because they alter both a user security profile and a role/compartment authorization relationship.
- Access-control audit review continues to require `audit.view` in addition to ordinary route authentication.

The application may give one administrative role both management permissions, but the database checks each operation independently.

### 9.2 No direct or indirect self-modification

An administrator cannot use this console to change their own:

- roles
- data scopes
- security compartments
- active/suspended status

An administrator also cannot alter, deactivate, retire or change the permission matrix of a role they currently hold. This closes the indirect self-escalation path where an administrator could otherwise add privileges to an already-assigned role.

### 9.3 Immediate effect

Successful grants and revocations become authoritative immediately for subsequent server/database authorization requests.

Client UI state is never authoritative. After mutation, the application refreshes from the database.

Role deactivation, role retirement, user-role revocation, permission revocation, scope revocation, compartment revocation and profile suspension are reflected by the lifecycle-aware authorization functions on the next protected request.

## 10. Anti-lockout safeguards

The database rejects operations that would make administration unrecoverable from within the application.

Mandatory safeguards:

1. **No self role/scope/compartment mutation.**
2. **No self-suspension.**
3. **No mutation of an actively held role.** An actor cannot change the permissions, status or identity of a role currently assigned to themselves.
4. **Last role-admin protection:** reject a change that would leave zero active profiles with an active role and active role-permission path to `admin.manage_roles`.
5. **Last user-admin protection:** reject a change that would leave zero active profiles with an active role and active role-permission path to `admin.manage_users`.
6. **Role retirement protection:** reject retirement while active user-role assignments remain.
7. **Atomicity:** no partial role/permission/compartment updates.
8. **Fresh authorization check:** database re-evaluates actor permissions immediately before applying each mutation.
9. **Security-control immutability:** application administrators cannot disable RLS, audit append-only controls, protected-record immutability or infrastructure security.
10. **Operational recovery path:** production operations retain a separate controlled database-owner recovery procedure for true administrative lockout/disaster recovery; that recovery capability is not exposed in the WASDOK UI.

These safeguards protect availability and security without freezing any particular role name or role code.

## 11. Audit model

Every successful access-control mutation creates an immutable `audit_events` entry in the same transaction.

Action codes are:

- `access.role_created`
- `access.role_updated`
- `access.role_activated`
- `access.role_deactivated`
- `access.role_retired`
- `access.role_permission_granted`
- `access.role_permission_revoked`
- `access.user_role_assigned`
- `access.user_role_revoked`
- `access.scope_granted`
- `access.scope_revoked`
- `access.compartment_granted`
- `access.compartment_revoked`
- `access.user_activated`
- `access.user_suspended`

Audit data includes:

- authenticated actor ID
- action code
- target entity type and ID
- safe before/after access metadata
- administrative reason
- server/database timestamp
- relevant organisation scope where applicable

Audit events must not contain:

- passwords
- Supabase access tokens
- refresh tokens
- session cookies
- service-role credentials
- database credentials
- environment secrets

The existing append-only audit protection remains mandatory.

## 12. Error handling

The administration subsystem produces explicit, safe outcomes for common failure cases:

- unauthenticated → route/action denied
- inactive actor → denied without mutation
- insufficient permission → denied without mutation
- direct self-modification attempt → denied
- indirect self-modification through an actively held role → denied
- last-admin safeguard triggered → denied with specific administrative message
- role still assigned to active users → retirement denied with assignment count/context
- duplicate or previously retired role code → validation error
- unknown permission code → rejected
- invalid compartment → rejected
- database failure → transaction rollback; no partial mutation or orphan audit event

User-facing errors are actionable but do not reveal database internals, secrets or unnecessary policy implementation details.

## 13. Testing strategy

WASDOK-78 requires TDD and layered verification.

### 13.1 Unit / application tests

Cover:

- role form validation
- permission-matrix transformation
- user-access form validation
- button routing and dedicated screen rendering
- server-action handling of success and safe error results
- no browser-trusted actor identity, permission claim or audit timestamp

### 13.2 Server authorization tests

Cover:

- unauthenticated rejection
- inactive-user rejection
- administrator allowed path
- non-admin rejection
- direct self-modification rejection
- indirect self-escalation through an actively held role rejection
- stale/forged browser privilege input ignored

### 13.3 PostgreSQL / pgTAP tests

Cover:

- RPC execute permissions
- role create/update/deactivate/reactivate/retire
- permission grant/revoke
- user-role assignment/revocation with history retention
- scope grant/revoke with history retention
- compartment grant/revoke with history retention
- lifecycle-aware `has_permission`, `has_scope` and `has_compartment`
- immediate authorization effect after grant/revocation/suspension
- last-role-admin protection
- last-user-admin protection
- direct self-modification protection
- indirect held-role self-escalation protection
- active-assignment retirement block
- retired role-code reuse rejection
- atomic rollback on rejected operations
- immutable audit event creation
- direct unauthorized table writes denied

### 13.4 End-to-end local Supabase tests

Run against the local Supabase CI stack using fictional DEMO users/data only.

At minimum verify:

1. Authorized DEMO admin opens Access Control and retrieves the role catalogue.
2. Admin creates a custom DEMO role.
3. Admin grants an approved permission.
4. Admin assigns the role to another DEMO user.
5. Effective authorization changes immediately.
6. Admin grants a DEMO compartment to that user.
7. Effective compartment check changes immediately.
8. Revocation removes access immediately while retaining assignment history.
9. Suspension removes protected authorization on subsequent requests.
10. Audit chain contains the expected safe administrative events.
11. Non-admin attempts fail without changes.
12. Self-escalation attempts fail without changes.

Hosted production data is not used for automated E2E testing.

## 14. Migration and deployment

Implementation requires a new forward-only Supabase migration after the current complaint/privacy migration sequence.

The migration must:

- extend existing RBAC tables safely
- replace unconditional assignment uniqueness constraints with active-row uniqueness rules where history is retained
- update `has_permission()`, `has_compartment()` and `has_scope()` for lifecycle-aware authorization
- introduce the administration RPCs defined in this design
- configure narrow execute privileges
- preserve/strengthen RLS
- add required audit/immutability controls
- avoid destructive reset of existing roles, users or assignments

Production deployment follows the established controlled migration verification process. If the hosted Supabase connector is unavailable, manual SQL deployment may be used only with explicit operator confirmation and rollback-safe verification. Manual execution must not be misrepresented as official migration-history registration unless migration history is separately verified.

## 15. Acceptance mapping to WASDOK-78

WASDOK-78 is complete only when:

- Authorized administrators can create and manage roles without source-code role changes.
- Existing seeded roles are fully configurable in accordance with the approved governance decision.
- Approved permissions can be assigned/revoked through a functional role-permission matrix.
- Users can be assigned/revoked roles, scopes and compartments through functional administration screens.
- User activation/suspension is functional and reflected immediately by authorization checks.
- `TRAINING_SUPER_ADMIN` can be configured for broad DEMO/UAT application functionality without infrastructure or security-boundary bypass.
- `Review roles` is a real routed function.
- `Grant compartment` is a real routed/mutation function.
- Access changes take effect through the same server/database authorization model used by the rest of WASDOK 360.
- Unauthorized, inactive-user and self-escalation attempts are denied and tested.
- Anti-lockout safeguards are enforced in the database.
- Every successful privileged change produces immutable audit evidence.
- Historical assignment/revocation evidence is preserved.
- No Access Control production-looking action remains an unexplained dead label.

## 16. Deferred cross-module action completion

The issue that triggered WASDOK-78 also exposed a broader Release 1 UX requirement: visible actions in other modules should not remain dead prototype labels at UAT.

That broader work is intentionally not absorbed into WASDOK-78. A separate Release 1 Functional Action & Navigation Completion work item should inventory every visible action across Complaints, Investigations, Leadership Code, Annual Statements, Oversight, Compliance, Commission, Legal, Intelligence, Reporting, Workflow and Administration and classify each as:

- functional and routed/executable
- explicitly disabled with a clear Release 1 reason
- removed from the Release 1 UI

WASDOK-78 establishes that standard for Access Control Administration first.
