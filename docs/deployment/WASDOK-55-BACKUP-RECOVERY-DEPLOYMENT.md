# WASDOK-55 — Backup, Recovery & Disaster Recovery Deployment Runbook

## Purpose

This runbook controls deployment and enablement of WASDOK-55 Backup, Recovery & Disaster Recovery Administration. It does **not** authorize a production backup, archive download, restore rehearsal, Point-in-Time Recovery (PITR), or production restore. Those are separate privileged operational actions.

## Hard safety rules

1. Never run `supabase db reset`, destructive DDL, `DROP`, `TRUNCATE`, or data-clearing commands against the hosted OCPNG project.
2. Apply the forward-only WASDOK-55 migrations in strict order: **01800 → 01900 → 02000**.
3. Do not place provider, database, Storage, service-role, S3, signing, or encryption credentials in browser code or `NEXT_PUBLIC_*` variables.
4. The Supabase Management API token is server/worker-only. Use the minimum scope required:
   - `backups_read` for recovery-point inventory/readiness;
   - add `backups_write` **only** when production restore is separately approved and explicitly enabled.
5. The backup archive bucket must remain private. Download access is by short-lived signed grant only after the audited `backup.download` database authorization succeeds.
6. Encryption keys are referenced by key identifier. Never store key material in the database, manifest, audit event, ZIP, source repository, or download URL.
7. **Do not execute a production restore during deployment verification.** Deployment verification is read-only/provider-dry-run plus application/database authorization checks.
8. Training access does not imply infrastructure authority. `TRAINING_SUPER_ADMIN` must not automatically receive backup download or production restore permissions.

## Target

Production target is the approved OCPNG Supabase project/environment only. Confirm the project reference immediately before any hosted migration action. Stop if the target cannot be positively identified.

## Required code and migration evidence

Before hosted deployment approval:

- PR merge commit is known and immutable.
- Exact merge SHA has passed the full OCPNG Release 1 CI pipeline.
- `20260903001800_backup_recovery_foundation.sql` passed local reset and pgTAP.
- `20260903001900_backup_recovery_workflows.sql` passed lifecycle/authorization tests.
- `20260903002000_backup_recovery_direct_write_boundary.sql` passed direct-write and read-boundary tests.
- WASDOK-55 local E2E passed using disposable local Supabase and fake/local providers only.
- Static/browser credential scans passed.
- No unrelated migration is bundled into this deployment gate.

## Required server-side operations configuration

Configure these values only on the approved operations worker/runtime. Values are secrets or restricted infrastructure configuration and must not be copied into ordinary application logs.

- `OCPNG_SUPABASE_PROJECT_REF` — exact OCPNG hosted project reference.
- `OCPNG_SUPABASE_MANAGEMENT_TOKEN` — scoped server-only token. Begin with `backups_read`; do not grant `backups_write` until a separate production-restore enablement approval.
- `OCPNG_BACKUP_DATABASE_URL` — server-only PostgreSQL connection used by the logical archival exporter.
- `OCPNG_BACKUP_BUCKET` — dedicated private backup archive bucket.
- `OCPNG_BACKUP_KEY_REF` — identifier for the approved external encryption key.
- `SUPABASE_SERVICE_ROLE_KEY` — server/worker-only and never exposed to browser bundles.

The worker host must have the approved PostgreSQL/Supabase tooling, encrypted temporary storage, controlled egress, log redaction, and a cleanup policy for plaintext/intermediate files.

## Pre-deployment checks

1. Confirm the application deployment target and Supabase project reference.
2. Record current hosted migration history.
3. Confirm migrations 01800–02000 are not already partially registered under unexpected names.
4. Confirm at least one active administrator can be deliberately assigned the required backup permissions after deployment; do not auto-grant them broadly.
5. Verify provider recovery capability/readiness using read-only provider APIs. Record whether managed backups/PITR are enabled and the available recovery window. This is an inventory check, **not a restore**.
6. Verify the private backup bucket exists or has an approved creation procedure and is not public.
7. Verify the key reference resolves on the worker without exposing key material.
8. Verify the database exporter can reach the database from the worker through the approved network path without printing the database URL.
9. Confirm an isolated environment exists for future restore rehearsals.
10. Confirm incident contacts and escalation owner for failed migrations or backup-provider errors.

## Hosted migration sequence

Only after explicit hosted-deployment approval:

1. Apply `01800_backup_recovery_foundation`.
2. Verify migration registration and table/RLS/permission creation.
3. Apply `01900_backup_recovery_workflows`.
4. Verify the expected SECURITY DEFINER RPCs, transition guards, audit safeguards, and requester/authorizer separation.
5. Apply `02000_backup_recovery_direct_write_boundary`.
6. Verify browser direct DML is denied, anonymous SELECT is denied, authenticated metadata reads require `backup.view`, worker-only RPCs remain service-role-only, and browser-facing RPCs remain authenticated with database-side permission checks.

Stop immediately if a migration fails. Do not skip forward to a later migration and do not attempt an ad-hoc destructive rollback.

## Post-migration database verification

Verify without manipulating real cases or weakening real administrators:

- all WASDOK-55 tables have RLS enabled;
- `anon` has no operational metadata SELECT or DML;
- `authenticated` has no direct INSERT/UPDATE/DELETE on operational tables;
- `backup.view` gates metadata SELECT;
- `request_backup`, `request_backup_download`, schedule/retention and restore-request RPCs require authenticated callers and enforce their own fixed permissions;
- worker transition/verification RPCs are service-role-only;
- production restore requires the distinct `backup.authorize_production_restore` permission and requester ≠ authorizer;
- unsafe audit metadata keys such as password/token/secret/bearer/signed URL/encryption key/database URL/service-role are rejected;
- no test fixture remains after verification.

Use only fictional `DEMO WASDOK55` records if a hosted transactional verification is separately approved. Roll them back or remove them under a controlled test-cleanup transaction.

## Provider dry run

After server configuration is enabled, perform **read-only** provider validation:

1. List recovery/backup capability using the scoped `backups_read` token.
2. Confirm the project reference matches OCPNG.
3. Confirm API failures are reported without response-body/token leakage.
4. Confirm the UI/health metadata can represent “recovery unavailable/unknown” without fabricating a recovery point.
5. Do not POST a PITR restore and do not add `backups_write` merely for deployment testing.

## Backup worker enablement

Worker enablement is a separate operational gate after migration/deployment verification.

Before enabling scheduled execution:

- private archive custody is configured;
- key reference is healthy;
- database logical exporter, identity-recovery provider, Storage-object exporter, encrypted packaging, verification and cleanup adapters are healthy;
- failed jobs transition to `FAILED` and redact operational errors;
- schedules are initially disabled unless an approved schedule/retention policy exists;
- retention purge remains disabled by default unless explicitly configured.

A backup is not “successful” merely because a ZIP exists. The job may become `AVAILABLE` only after verification passes.

## Production backup enablement

A production archival backup is an operational action and must be separately authorized. When approved, verify that a `FULL_ARCHIVE` recovery set covers:

1. application database/schema/data/migration history;
2. Auth/identity recovery through the approved identity-recovery mechanism;
3. actual Storage object bytes plus object/checksum manifest.

A default logical database dump by itself must never be labelled FULL/COMPREHENSIVE.

## Production restore enablement

Production restore is disabled by policy until explicitly authorized. Before enabling:

- establish named requester and independent authorizer roles;
- add `backups_write` only to the server-side Management API credential used for approved restore execution;
- prove a recent isolated restore rehearsal;
- record impact window, expected RPO/RTO and rollback/communications plan;
- require database state `AUTHORIZED` before the provider restore adapter can execute;
- never allow requester self-authorization.

## Rollback / failed deployment

WASDOK-55 schema migrations are forward-only/additive. Do not drop the new tables or permissions as an emergency rollback. If the application release must be rolled back:

1. disable worker/schedules;
2. revoke/disable provider execution credentials if necessary;
3. roll the application deployment back through the normal release mechanism;
4. leave additive schema in place;
5. diagnose and prepare a reviewed forward-fix migration.

If a provider operation was unexpectedly invoked, treat it as an incident and preserve audit/provider evidence.

## Deployment evidence for closure review

Record:

- approved merge SHA and post-merge CI run;
- hosted migration versions/names for 01800–02000;
- RLS/RPC/permission verification results;
- provider read-only recovery dry-run result;
- worker configuration readiness without secret values;
- private bucket/key-reference readiness;
- whether scheduled backups remain disabled or were separately approved;
- most recent isolated restore-rehearsal evidence, when available;
- confirmation that **no production restore was executed during deployment verification**.

Jira closure remains a separate explicit approval gate.
