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

1. **All application roles are fully configurable.** Existing seeded roles such as Chief Ombudsman, Ombudsman, Secretary, Counsel, Director, Team Leader, Senior Investigator, Investigator and System Administrator are not permanently protected from rename, deactivation or deletion merely because they were seeded as system roles.
2. **Privileged configuration changes take effect immediately.** There is no two-person approval queue for role, permission, user-role, scope or compartment changes.
3. **Immediate change does not mean unrestricted change.** Every privileged mutation remains subject to authenticated server-side authorization, database-side authorization, anti-lockout rules, a mandatory reason and immutable audit evidence.
4. **Role identity is UUID-based.** Role codes and names are editable labels/business identifiers; foreign-key relationships continue to use the role UUID.
5. **Permission capabilities remain an approved application catalogue.** Administrators may assign or remove permissions from roles, but cannot invent arbitrary permission codes that the application does not implement.
6. **Training Super Administrator is an application role, not infrastructure superuser.** `TRAINING_SUPER_ADMIN` may be configured for broad DEMO/UAT functional access but cannot access service-role credentials, environment secrets, database owner capabilities, RLS bypass or mutable audit controls.

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

WASDOK-78 therefore extends the existing security architecture; it does not replace it.

## 4. Scope

### 4.1 In scope

WASDOK-78 implements:

- User administration and access status management.
- Configurable role catalogue.
- Role create/edit/activate/deactivate/delete lifecycle.
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
3. The server action validates submitted form data and never trusts a browser-supplied actor ID.
4. The server calls a dedicated PostgreSQL administration RPC using the authenticated session context.
5. The RPC independently re-checks required permissions and anti-lockout conditions immediately before mutation.
6. The mutation and its audit event execute atomically in one database transaction.
7. The UI refreshes authoritative data from the database after success.

Direct browser writes to RBAC tables remain denied.

The service-role credential is not used as the normal authorization mechanism for application-level role/permission administration. Where Supabase Auth administrative APIs are needed for user invitation/creation, that operation is isolated to server-only code and the privileged credential is never exposed to browser artifacts.

### 5.2 Administration routes

The administration workspace will provide dedicated routes under the existing dashboard hierarchy. The exact final path names may follow the repository's route conventions, but the functional model is:

- `/dashboard/users` — user administration.
- `/dashboard/users/roles` — Access Control landing / role catalogue.
- `/dashboard/users/roles/[roleId]` — role detail and permission matrix.
- `/dashboard/users/[userId]` — user access detail.
- `/dashboard/users/[userId]/access` — role, scope and compartment assignments.
- optional dedicated audit view filtered to access-control actions, or a deep link into `/dashboard/audit-log`.

The existing generic module shell may remain for untouched modules, but Access Control receives dedicated components because it is a transactional administration subsystem rather than a static landing page.

## 6. Screens and control behaviour

### 6.1 Access Control landing

The `/dashboard/users/roles` experience becomes a real administration console with clear navigation for:

- Users
- Roles
- Permissions
- Scopes & Compartments
- Access-control Audit History

The existing controls are rewired as follows:

**Review roles**

- Navigates to the role catalogue / permission matrix.
- Lists all configured roles and their status.
- Supports role creation and selection.
- Displays assigned-user count and effective permission count.

**Grant compartment**

- Navigates to the user access-assignment workflow.
- Requires selection of a target user.
- Displays current roles, effective permissions, scopes and compartments before change.
- Supports grant/revoke of approved security compartments with a required reason.

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
- Delete a role after assignment safeguards pass.

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

The implementation should extend the existing RBAC tables rather than introduce parallel role systems.

### 7.1 Roles

Add or formalize fields required for lifecycle management:

- `is_active boolean not null default true`
- `role_type text` with controlled values such as `operational`, `administrative`, `training`
- `deactivated_at timestamptz`
- `deactivated_by uuid references profiles(id)`
- `updated_by uuid references profiles(id)`

Existing `is_system` may remain for provenance/reporting compatibility, but it must not make seeded roles immutable because the approved governance decision is that all roles are fully configurable.

### 7.2 User-role assignments

Preserve assignment history where practical. Extend or normalize lifecycle metadata such as:

- `assigned_by`
- `assigned_at`
- `revoked_at`
- `revoked_by`

Implementation may use active-row lifecycle semantics rather than destructive deletion if this is the cleanest way to preserve assignment history and enforce immediate revocation.

### 7.3 Role-permission assignments

Extend with administration provenance such as:

- `granted_by`
- `granted_at`
- optional revocation lifecycle metadata if historical rows are retained

The database remains authoritative for effective role-permission relationships.

### 7.4 Data scopes

`data_scopes` remains the basis of organisation/data-scope authorization. Add mutation provenance where needed, including `granted_by`, and preserve revocation history where practical.

### 7.5 User compartments

`user_compartments` remains the basis of need-to-know compartment membership. It already records `granted_by` and `granted_at`; extend lifecycle metadata for explicit revocation rather than losing history.

### 7.6 Permission catalogue

The permission catalogue is database-backed and synchronized with implemented application capabilities.

Administrators can activate/use approved permissions and assign them to roles. They cannot create arbitrary new permission identifiers that lack application meaning.

TypeScript may continue to provide compile-time safety for known permission codes while the database remains authoritative for runtime assignments.

## 8. Database administration API

Dedicated PostgreSQL RPCs provide the mutation boundary. Exact final naming may be adjusted during implementation, but the contract should include operations equivalent to:

- create role
- update role
- activate/deactivate role
- delete role
- grant/revoke role permission
- assign/revoke user role
- grant/revoke data scope
- grant/revoke user compartment
- activate/suspend user profile

Each RPC must:

1. Require an authenticated actor.
2. Check the necessary administrator permission in the database.
3. Reject self-modification where prohibited.
4. Apply anti-lockout checks.
5. Validate target records and allowed capability values.
6. Require a non-empty administrative reason.
7. Perform mutation and audit insert in one transaction.
8. Return a minimal structured success result suitable for server actions.
9. Avoid returning privileged credentials or unnecessary sensitive data.

RPC execution privileges must be narrowly granted. Anonymous users receive no execution rights.

## 9. Authorization rules

### 9.1 Administrator permissions

At minimum:

- `admin.manage_users` controls user lifecycle and ordinary user access assignment operations.
- `admin.manage_roles` controls role definitions, permission matrix and compartment catalogue/assignment operations as defined by the final implementation policy.

The implementation must avoid circular authorization where a user can manufacture authority simply because the browser allows an action.

### 9.2 No self-modification of privileged access

An administrator cannot use this console to change their own:

- roles
- data scopes
- security compartments
- active/suspended status

This prevents immediate self-escalation and accidental self-lockout under the approved immediate-activation model.

### 9.3 Immediate effect

Successful grants and revocations become authoritative immediately for subsequent server/database authorization requests.

Client UI state must not be treated as authoritative. After mutation, the application refreshes from the database.

Existing server/database authorization functions remain the final decision point.

## 10. Anti-lockout safeguards

The database must reject operations that would make administration unrecoverable from within the application.

Mandatory safeguards:

1. **No self role/scope/compartment mutation.**
2. **No self-suspension.**
3. **Last role-admin protection:** reject a change that would leave zero active users effectively capable of `admin.manage_roles`.
4. **Last user-admin protection:** reject a change that would leave zero active users effectively capable of `admin.manage_users`.
5. **Role deletion protection:** reject role deletion while active user assignments exist.
6. **Atomicity:** no partial role/permission/compartment updates.
7. **Fresh authorization check:** database re-evaluates actor permissions immediately before applying each mutation.
8. **Security-control immutability:** application administrators cannot disable RLS, audit append-only controls, protected-record immutability or infrastructure security.
9. **Operational recovery path:** production operations retain a separate controlled database-owner recovery procedure for true administrative lockout/disaster recovery; that recovery capability is not exposed in the WASDOK UI.

These safeguards protect availability and security without freezing any particular role name or role code.

## 11. Audit model

Every successful access-control mutation creates an immutable `audit_events` entry in the same transaction.

Recommended action codes:

- `access.role_created`
- `access.role_updated`
- `access.role_activated`
- `access.role_deactivated`
- `access.role_deleted`
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
- timestamp
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

The administration subsystem must produce explicit, safe outcomes for common failure cases:

- unauthenticated → route/action denied
- insufficient permission → denied without mutation
- self-modification attempt → denied
- last-admin safeguard triggered → denied with specific administrative message
- role still assigned to active users → deletion denied with assignment count/context
- duplicate role code → validation error
- unknown permission code → rejected
- invalid compartment → rejected
- database failure → transaction rollback; no partial mutation or orphan audit event

User-facing errors should be actionable but must not reveal database internals, secrets or policy implementation details that are unnecessary for remediation.

## 13. Testing strategy

WASDOK-78 requires TDD and layered verification.

### 13.1 Unit / application tests

Cover:

- role form validation
- permission-matrix transformation
- user-access form validation
- button routing and dedicated screen rendering
- server-action handling of success and safe error results
- no browser-trusted actor identity

### 13.2 Server authorization tests

Cover:

- unauthenticated rejection
- administrator allowed path
- non-admin rejection
- self-modification rejection
- stale/forged browser privilege input ignored

### 13.3 PostgreSQL / pgTAP tests

Cover:

- RPC permissions
- role create/update/deactivate/delete
- permission grant/revoke
- user-role assignment/revocation
- scope grant/revoke
- compartment grant/revoke
- immediate authorization effect through `has_permission`, `has_scope` and `has_compartment`
- last-role-admin protection
- last-user-admin protection
- self-modification protection
- active-assignment deletion block
- atomic rollback on rejected operations
- immutable audit event creation
- direct unauthorized table writes denied

### 13.4 End-to-end local Supabase tests

Run against the local Supabase CI stack using fictional DEMO users/data only.

At minimum verify:

1. Authorized admin opens Access Control and retrieves role catalogue.
2. Admin creates a custom role.
3. Admin grants an approved permission.
4. Admin assigns the role to a DEMO user.
5. Effective authorization changes immediately.
6. Admin grants a DEMO compartment.
7. Effective compartment check changes immediately.
8. Revocation removes access immediately.
9. Audit chain contains the expected safe administrative events.
10. Non-admin attempts fail without changes.

Hosted production data is not used for automated E2E testing.

## 14. Migration and deployment

Implementation will require a new forward-only Supabase migration after the current complaint/privacy migration sequence.

The migration must:

- extend existing RBAC tables safely
- introduce administration RPCs
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
- User activation/suspension is functional and protected.
- `TRAINING_SUPER_ADMIN` can be configured for broad DEMO/UAT application functionality without infrastructure or security-boundary bypass.
- `Review roles` is a real routed function.
- `Grant compartment` is a real routed/mutation function.
- Access changes take effect through the same server/database authorization model used by the rest of WASDOK 360.
- Unauthorized and self-escalation attempts are denied and tested.
- Anti-lockout safeguards are enforced in the database.
- Every successful privileged change produces immutable audit evidence.
- No Access Control production-looking action remains an unexplained dead label.

## 16. Deferred cross-module action completion

The issue that triggered WASDOK-78 also exposed a broader Release 1 UX requirement: visible actions in other modules should not remain dead prototype labels at UAT.

That broader work is intentionally not absorbed into WASDOK-78. A separate Release 1 Functional Action & Navigation Completion work item should inventory every visible action across Complaints, Investigations, Leadership Code, Annual Statements, Oversight, Compliance, Commission, Legal, Intelligence, Reporting, Workflow and Administration and classify each as:

- functional and routed/executable
- explicitly disabled with a clear Release 1 reason
- removed from the Release 1 UI

WASDOK-78 establishes that standard for Access Control Administration first.
