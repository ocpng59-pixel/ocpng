# Complaint intake state — WASDOK-64

## Scope

WASDOK-64 provides the database state/provenance foundation for the shared form delivered in WASDOK-63. Its four acceptance gates are distinct draft/submitted states, persisted approved channel/source, no silent submitted-to-draft reversal, and auditable tested transitions.

The existing public and assisted forms remain validation-only. WASDOK-65 owns the trusted application persistence/submission path, complaint data and receipt/idempotency handling. WASDOK-66 owns approved privacy/consent. No new browser action or live lodging channel is activated by this migration.

## Record and operations

`public.complaint_intakes` stores a UUID, status (`draft` or `submitted`), channel/source, optional staff actor, non-empty organisational scope, fixed CONFIDENTIAL classification, revision and timestamps. Complaint narratives and contact data are not stored in this state-only change.

| Channel | Fixed source | Actor |
| --- | --- | --- |
| `public_web` | `wasdok_public_form` | null (public origin; no invented user) |
| `assisted_internal` | `wasdok_assisted_form` | active, authorized staff profile |

An assisted actor requires `complaints.create`, an active matching organisation scope (or explicit wildcard scope), and the CONFIDENTIAL compartment. These checks run on creation and transition. A System Administrator role does not bypass them. Channel/source, owner, scope, classification, record identity and creation timestamp are immutable.

Database API, restricted to `service_role`:

```sql
public.create_complaint_intake_draft(p_channel text, p_scope text, p_actor_id uuid default null)
public.submit_complaint_intake(p_intake_id uuid, p_expected_revision integer)
```

Both return the intake UUID. New records must start as draft at revision 1. Submission updates the same row only when draft and the expected revision match; the database sets submitted/updated times and increments the revision. Stale/repeated submissions fail without changing state or creating duplicate audit events. Receipt-based idempotent replay belongs to WASDOK-65.

The trusted caller is responsible for authenticating its user, deriving channel/scope/actor from the approved route and assignment, validating complaint data and enforcing applicable consent before invoking these operations. These obligations must be implemented and tested when the application path is connected. The service key never enters a browser. There are no grants to anonymous or authenticated clients for either operation or direct mutation.

## Security and audit

- RLS is enabled in the migration. Authenticated staff can read only their own assisted records while active, with create permission, matching scope and the CONFIDENTIAL compartment. Public-origin state records are not exposed to ordinary authenticated sessions.
- Anonymous access and ordinary browser writes are denied. Service-role table privileges are limited to select/insert/update. Delete/TRUNCATE are revoked; a trigger rejects deletes and modifications of submitted rows.
- Functions and triggers use SECURITY INVOKER with a fixed empty search path. Internal trigger functions live in the non-exposed `private` schema; no new SECURITY DEFINER routine is introduced.
- Every creation and actual draft update/submission appends a state-only event to `audit_events` within the same transaction. Failed audit insertion rolls back the state change. Events include actor, entity UUID, scope/classification, channel/source and before/after status/revision, never complaint content.
- The existing audit insert policy excludes the reserved `complaint_intake.*` prefix from direct authenticated insertion, preventing forged lifecycle evidence. Existing authentication-event actor binding is retained.
- Table ownership/DB administration remain privileged maintenance boundaries; this change does not claim protection from a database administrator deliberately disabling triggers.

## Verification and rollout

pgTAP exercises the real migrated schema with fictional DEMO profiles and state records inside a rolled-back transaction: both channels, invalid provenance, actor/permission/scope/compartment rejection, role boundaries, immutable fields, invalid states, revisions, timestamps, read-only submission, safe audit attribution and audit rollback. The existing CI database job applies all migrations and runs all test files.

The Supabase CLI generates the migration file. Its timestamp must follow the repository's latest migration, including the already-deployed 20260902000700 actor-integrity migration. Deployment requires this additive migration after merge; there is no existing complaint-data conversion or data deletion.
