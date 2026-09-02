# WASDOK-55 — Isolated Restore Rehearsal Runbook

## Purpose

This runbook proves that an approved WASDOK backup/recovery set can actually be restored and validated without risking production. A rehearsal is always performed in an isolated recovery environment. It is not a production restore and must never target the live OCPNG project.

## Objectives

A successful rehearsal must prove all three recovery domains:

1. **Application database** — schema, data, RBAC/application configuration and migration history.
2. **Auth / identity** — users and identity state recover through the approved identity-recovery mechanism without exporting plaintext passwords or provider secrets.
3. **Storage objects** — actual private document/evidence bytes, not only `storage.objects` metadata, are recoverable and checksum-verifiable.

It must also measure achieved **RPO** (recovery point objective) and **RTO** (recovery time objective).

## Safety rules

- Never point rehearsal tooling at the production Supabase project or production Storage bucket.
- Never use a production-restore API endpoint merely to test that credentials work.
- Use an isolated Supabase/recovery environment with distinct project reference, database, Auth, Storage and keys.
- Do not copy live secrets into documentation, tickets, test output or audit metadata.
- If production data is used under an approved DR test, apply the same classification and access controls as production and destroy the recovery environment after evidence is captured.
- Prefer fictional `DEMO WASDOK55` fixtures for routine technical rehearsal.
- A training administrator has no automatic authority to run a production-data rehearsal.

## Preconditions

Before the rehearsal begins, record:

- rehearsal identifier and date/time;
- operator and approving authority;
- source backup ID or provider recovery point;
- source application release/commit;
- source migration level;
- backup verification result and checksum;
- expected source database record counts;
- expected Storage object count/bytes/checksums;
- identity-recovery mechanism to be used;
- target isolated environment identifier;
- RPO and RTO targets.

The source archival package must be encrypted and integrity-verified before restoration begins.

## Phase 1 — Build isolated target

1. Provision or reset the approved **non-production** recovery environment.
2. Confirm the target project reference is not the OCPNG production project.
3. Restrict network/user access to the rehearsal team.
4. Configure temporary recovery keys/secrets through the approved secret manager only.
5. Record rehearsal start time for RTO measurement.

## Phase 2 — Restore application database

Restore the application database using the approved recovery method for the selected recovery set.

Validate:

- expected schemas/tables/functions exist;
- migration history matches the selected recovery point;
- row counts for key WASDOK domains are within expected source counts;
- RBAC tables, permissions and relationships are present;
- RLS is enabled on protected tables;
- audit events are readable only through authorized pathways;
- backup/recovery operational metadata is consistent with the selected source;
- no database URL, service-role credential or encryption key appears in restored business/audit metadata.

Record discrepancies instead of altering source evidence to make the test pass.

## Phase 3 — Restore Auth / identity

Use the approved identity-recovery provider/mechanism. Do not assume a normal logical `supabase db dump` contains recoverable Auth identities.

Validate:

- expected user/identity count;
- profile-to-identity referential integrity;
- representative DEMO/approved test users can authenticate;
- disabled users remain disabled where applicable;
- roles and permissions resolve correctly after login;
- no plaintext password export was required;
- no provider token/key was embedded in the recovery package.

Record the identity recovery method in the rehearsal result.

## Phase 4 — Restore Storage object bytes

Restore private Storage objects from the approved object archive/manifest into the isolated target.

Validate:

- expected bucket structure exists;
- buckets intended to be private remain private;
- object count equals the manifest expectation or every variance is documented;
- byte totals are within expected values;
- SHA-256/object checksums validate for sampled and/or all objects according to policy;
- representative authorized application reads succeed;
- unauthorized users cannot enumerate or download restricted objects;
- there are no orphan manifest entries or unexplained missing objects.

Do not treat restored database `storage.objects` rows as proof that object bytes exist.

## Phase 5 — Application smoke and security validation

Deploy the matching WASDOK application version to the isolated environment and perform:

1. login/authentication smoke;
2. dashboard/navigation authorization checks;
3. representative complaint/case read under authorized account;
4. restricted-classification access denial under unauthorized account;
5. Access Control permission/RLS checks;
6. audit-log authorization and append-only behavior checks;
7. Backup & Recovery page access using `backup.view` and denial without it;
8. direct browser DML denial on protected operational tables;
9. no service/provider credentials in browser bundles;
10. migration/application version consistency check.

Do not modify recovered evidence merely to produce a successful result.

## Phase 6 — Integrity comparison

Create a reconciliation report containing at minimum:

- source vs restored table/record counts for agreed critical tables;
- source vs restored Storage object counts and bytes;
- checksum results;
- identity counts and authentication result;
- migration/version comparison;
- failed/missing items;
- security/RLS smoke result;
- any data recovered later than/earlier than the selected recovery point.

A “restore completed” provider status is not sufficient; application-level integrity must pass.

## Phase 7 — Measure RPO and RTO

**Achieved RPO** = difference between the latest recoverable committed data/object timestamp and the incident/rehearsal reference time.

**Achieved RTO** = time from rehearsal restore start until the isolated WASDOK environment satisfies the agreed database, Auth, Storage, application and security validation checks.

Record:

- target RPO;
- achieved RPO;
- target RTO;
- achieved RTO;
- reason for any variance.

Do not report an RTO as achieved until all required recovery domains are operational.

## Phase 8 — Rehearsal result

Mark the rehearsal:

- `PASSED` — database + identity + Storage + application/security validation passed;
- `PASSED WITH ACTIONS` — recovery succeeded but documented non-critical corrective actions remain;
- `FAILED` — any required recovery domain could not be restored/verified or security boundaries failed.

Record immutable/safe evidence in WASDOK operational metadata where the implementation permits. Do not record passwords, JWTs, provider response bodies, signed URLs, database URLs, encryption keys or service-role values.

## Cleanup

After evidence is accepted:

1. revoke temporary recovery credentials;
2. securely remove plaintext/intermediate exports;
3. destroy or re-secure the isolated recovery environment according to policy;
4. remove temporary signed download grants;
5. confirm no rehearsal bucket/object became public;
6. retain only approved encrypted archival/rehearsal evidence;
7. record cleanup completion.

## Failure handling

If the rehearsal fails:

- do not attempt a production restore to “confirm” the failure;
- preserve logs/checksums/safe error metadata;
- classify the failing recovery domain;
- raise remediation before the backup is relied upon for DR readiness;
- rerun the isolated rehearsal after remediation.

A backup whose restore has never been successfully rehearsed must not be represented as fully proven DR readiness.

## Production restore gate

A successful rehearsal is evidence for—but does not authorize—a production restore. Production recovery still requires:

- a real incident/approved business reason;
- impact assessment and selected recovery point;
- `backup.restore_production` requester authority;
- a **different** officer with `backup.authorize_production_restore`;
- database state `AUTHORIZED` before provider execution;
- separately enabled server-side provider write scope;
- communications, RPO/RTO and post-restore verification plan.

The requester must never authorize their own production restore.
