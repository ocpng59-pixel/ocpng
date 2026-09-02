# WASDOK-55 Backup, Recovery & Disaster Recovery Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure WASDOK 360 Backup & Recovery control plane that creates and verifies encrypted OCPNG archival backups, exposes provider recovery points, supports controlled archive download and restore rehearsal, and guards production PITR restore with independent authorization.

**Architecture:** Use PostgreSQL/Supabase for operational metadata, authorization, lifecycle and immutable audit evidence; use server-only provider adapters and an operations worker for long-running export/copy/package/verify/restore work. Provider-managed Supabase backup/PITR remains the database recovery mechanism, while WASDOK creates portable encrypted archives covering application database, Auth/identity recovery references, and Storage object bytes. Browser code never receives provider management tokens, service-role keys, database passwords, S3 credentials or archive encryption key material.

**Tech Stack:** Next.js 16.3.3 App Router, React 19.2.8, TypeScript 6.0.3, Supabase/PostgreSQL/RLS/RPC, Supabase Management API, Supabase Storage API, Node 22 operations worker, Node `crypto`, `archiver` streaming ZIP packaging, Zod 4.5.4, Vitest 4.1.11, pgTAP, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-03-wasdok-backup-recovery-system-health-design.md` and `docs/superpowers/specs/2026-09-03-wasdok-backup-recovery-identity-coverage-clarification.md`

## Global Constraints

- Implementation branch/worktree starts from the latest approved `feat/wasdok360-release1` after any earlier approved story merges.
- WASDOK-81 reserves migrations `20260903001500–01700`; WASDOK-55 reserves `20260903001800`, `20260903001900`, and `20260903002000`. Do not reuse those numbers for another story.
- Before Task 1, run a migration-name preflight; if `01800–02000` already exist on the execution base, stop and renumber this entire three-migration sequence before writing code.
- Provider-managed daily backup/PITR is not replaced by custom application WAL/physical-backup logic.
- A backup is not `FULL`/`COMPREHENSIVE` unless application database, identity/Auth recovery, and Storage-object recovery are all verified or tied to one tested recovery set.
- Standard Supabase CLI logical dumps exclude managed `auth` and `storage` schemas by default; do not claim they alone provide full project recovery.
- Storage object bytes are backed up through supported Storage APIs, never by direct mutation of `storage` schema tables.
- `TRAINING_SUPER_ADMIN` does not automatically receive production backup download or restore authority.
- Production restore requires requester/authorizer separation; the requester cannot authorize their own restore.
- Browser/client components may never import `lib/supabase/service.ts`, Management API credentials, database connection strings, archive keys or operations-worker secrets.
- Archive package encryption uses approved authenticated encryption equivalent to AES-256-GCM; ZipCrypto is prohibited.
- Key material never appears in archive manifests, database rows, audit metadata, logs or download URLs.
- Long-running export/copy/package/verify/restore work executes in a trusted operations worker, not a normal browser request.
- Hosted deployment and provider credential enablement remain separate explicit approval gates after PR merge and post-merge CI.

---

## File Structure

### Database
- Create `supabase/migrations/20260903001800_backup_recovery_foundation.sql` — enums, permissions, backup/restore/schedule/retention metadata tables, RLS, immutable identifiers.
- Create `supabase/migrations/20260903001900_backup_recovery_workflows.sql` — audited request/transition/download/restore approval RPCs and provider-recovery metadata ingestion boundary.
- Create `supabase/migrations/20260903002000_backup_recovery_direct_write_boundary.sql` — direct DML revocation and final execute grants.
- Create `supabase/tests/backup_recovery_foundation.sql`.
- Create `supabase/tests/backup_recovery_workflows.sql`.
- Create `supabase/tests/backup_recovery_direct_write_denial.sql`.

### Domain / provider contracts
- Create `lib/operations/backups/types.ts`.
- Create `lib/operations/backups/validation.ts`.
- Create `lib/operations/backups/queries.ts`.
- Create `lib/operations/backups/mutations.ts`.
- Create `lib/operations/backups/provider-types.ts`.
- Create `lib/operations/backups/providers/supabase-management.ts`.
- Create `lib/operations/backups/providers/database-archive.ts`.
- Create `lib/operations/backups/providers/identity-recovery.ts`.
- Create `lib/operations/backups/providers/storage-archive.ts`.
- Create `lib/operations/backups/providers/archive-store.ts`.
- Create `lib/operations/backups/providers/archive-key.ts`.
- Create `lib/operations/backups/manifest.ts`.
- Create `lib/operations/backups/package.ts`.
- Create `lib/operations/backups/verify.ts`.

### Operations worker
- Create `scripts/operations/backup-worker.mjs`.
- Create `scripts/operations/lib/backup-job-runner.mjs`.
- Create `scripts/operations/lib/redaction.mjs`.
- Modify `lib/config/server-environment.ts` — add server-only operations configuration readers without returning secrets to callers unnecessarily.

### UI / actions
- Create `app/dashboard/operations/backups/page.tsx`.
- Create `app/dashboard/operations/backups/[backupId]/page.tsx`.
- Create `app/dashboard/operations/backups/restore/page.tsx`.
- Create `app/dashboard/operations/backups/actions.ts`.
- Create `components/operations/backups/backup-request-form.tsx`.
- Create `components/operations/backups/backup-status-card.tsx`.
- Create `components/operations/backups/backup-history-table.tsx`.
- Create `components/operations/backups/restore-request-form.tsx`.
- Create `components/operations/backups/restore-authorization-panel.tsx`.
- Modify `lib/rbac/types.ts` and `lib/rbac/navigation.ts`.

### Tests / CI / docs
- Create `tests/backups/validation.test.ts`.
- Create `tests/backups/provider-contracts.test.ts`.
- Create `tests/backups/manifest-package.test.ts`.
- Create `tests/backups/worker.test.ts`.
- Create `tests/backups/routes-actions.test.ts`.
- Create `tests/backups/e2e.test.ts`.
- Create `tests/backups/security-boundary.test.ts`.
- Modify `scripts/routes-smoke.mjs` and `scripts/static-security.mjs`.
- Modify `.github/workflows/ci.yml`.
- Create `docs/deployment/WASDOK-55-BACKUP-RECOVERY-DEPLOYMENT.md`.
- Create `docs/operations/WASDOK-55-RESTORE-REHEARSAL.md`.

---

### Task 1: Backup/recovery metadata and least-privilege permission foundation

**Files:**
- Create: `supabase/tests/backup_recovery_foundation.sql`
- Create: `supabase/migrations/20260903001800_backup_recovery_foundation.sql`
- Modify: `lib/rbac/types.ts`

**Interfaces:**
- Permission codes: `backup.view`, `backup.create`, `backup.verify`, `backup.download`, `backup.schedule`, `backup.restore_test`, `backup.restore_production`, `backup.authorize_production_restore`, `backup.manage_retention`.
- Tables: `backup_jobs`, `backup_artifacts`, `backup_schedules`, `backup_retention_policies`, `backup_verifications`, `provider_recovery_points`, `restore_runs`, `restore_authorizations`, `restore_verifications`.
- Backup job states: `REQUESTED`, `QUEUED`, `RUNNING`, `PACKAGING`, `VERIFYING`, `AVAILABLE`, `FAILED`, `ARCHIVED`, `EXPIRED`, `PURGED`.

- [ ] **Step 1: Write RED pgTAP schema/permission tests**

Use rollback-wrapped pgTAP and assert all nine permissions, all tables, RLS on every table, unique immutable `backup_code`, restore requester/authorizer columns, and a constraint preventing a restore authorization row from having `authorizer_user_id = requester_user_id`.

```sql
select has_table('public','backup_jobs','backup jobs table exists');
select ok(exists(select 1 from public.permissions where code='backup.download'),'backup.download exists');
select ok((select relrowsecurity from pg_class where oid='public.restore_runs'::regclass),'restore_runs RLS enabled');
select ok(exists(select 1 from pg_constraint where conname='restore_authorizer_not_requester'),'self-authorization constraint exists');
```

- [ ] **Step 2: Run RED**

```bash
supabase start
supabase db reset
npm run test:rls
```

Expected: existing tests pass; new WASDOK-55 schema assertions fail because the objects do not exist.

- [ ] **Step 3: Implement migration `01800`**

Create enums/tables with UUID primary keys, `created_at`, actor/provenance fields, safe provider reference fields and checks:

```sql
check (backup_code ~ '^BKP-[0-9]{4}-[0-9]{6}$')
check (archive_checksum is null or archive_checksum ~ '^[a-f0-9]{64}$')
check (request_reason is null or char_length(request_reason) between 3 and 500)
```

Do not store encryption keys, provider access tokens, database passwords or signed URLs.

- [ ] **Step 4: Extend `PermissionCode`**

Add exactly the nine `backup.*` codes to `lib/rbac/types.ts`.

- [ ] **Step 5: Run GREEN**

```bash
supabase db reset
npm run test:rls
npm run typecheck:domain
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add supabase/tests/backup_recovery_foundation.sql \
  supabase/migrations/20260903001800_backup_recovery_foundation.sql lib/rbac/types.ts
git commit -m "feat(WASDOK-55): add backup recovery foundation"
```

---

### Task 2: Audited backup lifecycle and production-restore approval workflow

**Files:**
- Create: `supabase/tests/backup_recovery_workflows.sql`
- Create: `supabase/migrations/20260903001900_backup_recovery_workflows.sql`

**Interfaces:**
- `request_backup(p_backup_type text, p_reason text) returns uuid`
- `record_backup_worker_transition(p_backup_id uuid, p_from text, p_to text, p_safe_metadata jsonb) returns void` — trusted service/worker path only.
- `record_backup_verification(p_backup_id uuid, p_status text, p_safe_metadata jsonb) returns void`.
- `request_backup_download(p_backup_id uuid, p_reason text) returns uuid` — records authorized request; does not return a signed URL from SQL.
- `request_restore_test(p_backup_id uuid, p_reason text) returns uuid`.
- `request_production_restore(p_recovery_ref text, p_recovery_time timestamptz, p_reason text) returns uuid`.
- `authorize_production_restore(p_restore_id uuid, p_reason text) returns void`.
- `record_restore_worker_transition(p_restore_id uuid, p_from text, p_to text, p_safe_metadata jsonb) returns void` — trusted service/worker path only.

- [ ] **Step 1: Write RED workflow/security tests**

Prove permission enforcement, mandatory 3–500 reason, illegal lifecycle transitions rejected with `23514`, self-authorization rejected, a user without `backup.authorize_production_restore` cannot authorize, an authorization cannot target an already rejected/completed restore, and safe audit events are appended for request/authorization/completion without credentials or archive contents.

- [ ] **Step 2: Run RED**

```bash
supabase db reset
npm run test:rls
```

- [ ] **Step 3: Implement migration `01900`**

Add private helpers:

```text
private.require_backup_permission(code text)
private.require_backup_reason(reason text)
private.record_backup_audit(action text, entity_type text, entity_id uuid, reason text, safe_metadata jsonb)
private.assert_backup_transition(from_state text, to_state text)
private.assert_restore_transition(from_state text, to_state text)
```

Authenticated request RPCs use `SECURITY DEFINER set search_path=''` and resolve actor from `auth.uid()`. Worker transition RPCs reject ordinary authenticated execution and are granted only to the trusted service role used by the operations worker.

- [ ] **Step 4: Run GREEN**

```bash
supabase db reset
npm run test:rls
```

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/backup_recovery_workflows.sql \
  supabase/migrations/20260903001900_backup_recovery_workflows.sql
git commit -m "feat(WASDOK-55): add audited backup and restore workflows"
```

---

### Task 3: Direct-write boundary and function grants

**Files:**
- Create: `supabase/tests/backup_recovery_direct_write_denial.sql`
- Create: `supabase/migrations/20260903002000_backup_recovery_direct_write_boundary.sql`

- [ ] **Step 1: Write RED direct-DML tests**

Under `set local role authenticated`, prove INSERT/UPDATE/DELETE are denied on every WASDOK-55 operational table and that `anon` has no execution rights on backup/restore functions.

- [ ] **Step 2: Run RED**

```bash
supabase db reset
npm run test:rls
```

- [ ] **Step 3: Implement `02000`**

Revoke direct DML from `anon`/`authenticated`; grant authenticated execution only on user-facing request/read RPCs; keep worker transition RPCs inaccessible to browser roles. Revoke default PUBLIC function execution for WASDOK-55 functions.

- [ ] **Step 4: Run GREEN and commit**

```bash
supabase db reset && npm run test:rls
git add supabase/tests/backup_recovery_direct_write_denial.sql \
  supabase/migrations/20260903002000_backup_recovery_direct_write_boundary.sql
git commit -m "feat(WASDOK-55): harden backup recovery write boundary"
```

---

### Task 4: Server-only operations configuration and provider contracts

**Files:**
- Create: `lib/operations/backups/provider-types.ts`
- Create: `lib/operations/backups/types.ts`
- Create: `lib/operations/backups/validation.ts`
- Modify: `lib/config/server-environment.ts`
- Create: `tests/backups/validation.test.ts`
- Create: `tests/backups/security-boundary.test.ts`

**Interfaces:**

```ts
export interface DatabaseRecoveryProvider {
  listRecoveryPoints(): Promise<ProviderRecoveryStatus>;
  restorePitr(input: { recoveryTimeUnix: number; restoreRunId: string }): Promise<void>;
}
export interface DatabaseArchiveProvider { createLogicalExport(workDir: string): Promise<DatabaseArchiveResult>; }
export interface IdentityRecoveryProvider { verifyCoverage(): Promise<IdentityRecoveryCoverage>; }
export interface ObjectArchiveProvider { exportFull(workDir: string): Promise<ObjectArchiveResult>; exportIncremental(workDir: string, checkpoint: StorageCheckpoint): Promise<ObjectArchiveResult>; }
export interface ArchiveStore { putEncryptedArtifact(input: ArchiveStorePutInput): Promise<ArchiveStoredReference>; createDownloadGrant(ref: string, expiresInSeconds: number): Promise<string>; }
export interface ArchiveKeyProvider { getEncryptionKey(keyRef: string): Promise<Buffer>; }
```

- [ ] **Step 1: Write RED validation/security tests**

Test server-only configuration rejects missing/invalid project ref, Management API token, database URL, archive key reference and backup bucket. Scan browser-facing code for `SUPABASE_MANAGEMENT`, `DATABASE_URL`, `service_role`, `OCPNG_BACKUP_MASTER_KEY`, and `createServiceSupabaseClient` imports.

- [ ] **Step 2: Implement server configuration**

Add `getBackupOperationsConfiguration()` reading these server-only values: `OCPNG_SUPABASE_PROJECT_REF`, `OCPNG_SUPABASE_MANAGEMENT_TOKEN`, `OCPNG_BACKUP_DATABASE_URL`, `OCPNG_BACKUP_BUCKET`, and `OCPNG_BACKUP_KEY_REF`. Never prefix any of them `NEXT_PUBLIC_`. The configuration object may carry secrets only inside server-only modules and worker code; UI/action return values must never include them.

- [ ] **Step 3: Implement provider contracts/types and run GREEN**

```bash
npx vitest run tests/backups/validation.test.ts tests/backups/security-boundary.test.ts
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add lib/operations/backups lib/config/server-environment.ts tests/backups
git commit -m "feat(WASDOK-55): add server-only backup provider contracts"
```

---

### Task 5: Supabase recovery-point and PITR adapter

**Files:**
- Create: `lib/operations/backups/providers/supabase-management.ts`
- Create: `tests/backups/provider-contracts.test.ts`

- [ ] **Step 1: Write RED adapter tests with mocked HTTPS**

Prove GET `/v1/projects/{ref}/database/backups` maps `pitr_enabled`, backup status and earliest/latest physical recovery points into provider-neutral types. Prove POST `/v1/projects/{ref}/database/backups/restore-pitr` is never called unless the caller supplies an already-authorized restore run and valid Unix recovery time. Map `401/403/429/5xx` to safe operational errors without response-token leakage.

- [ ] **Step 2: Implement adapter**

Use server-only `fetch`, `Authorization: Bearer <scoped token>`, explicit timeout/abort, and redacted error messages. No Management API response body is sent directly to client components.

- [ ] **Step 3: Run GREEN and commit**

```bash
npx vitest run tests/backups/provider-contracts.test.ts
npm run typecheck
git add lib/operations/backups/providers/supabase-management.ts tests/backups/provider-contracts.test.ts
git commit -m "feat(WASDOK-55): add Supabase recovery provider adapter"
```

---

### Task 6: Database/identity/Storage archival providers and manifest verification

**Files:**
- Create: `lib/operations/backups/providers/database-archive.ts`
- Create: `lib/operations/backups/providers/identity-recovery.ts`
- Create: `lib/operations/backups/providers/storage-archive.ts`
- Create: `lib/operations/backups/manifest.ts`
- Create: `lib/operations/backups/verify.ts`
- Create: `tests/backups/manifest-package.test.ts`

- [ ] **Step 1: Write RED recovery-domain tests**

A `FULL` manifest must fail verification unless it contains safe statuses for `application_database`, `identity_auth`, and `storage_objects`. Test that no manifest serializer accepts values under field names matching password/token/key/secret credential patterns.

- [ ] **Step 2: Implement database archive provider**

Invoke the approved Supabase CLI logical export in a child process using `OCPNG_BACKUP_DATABASE_URL` only through child-process environment. Create `roles.sql`, `schema.sql`, `data.sql`, and a migration-history export under a private temporary directory. Redact child-process output and never write the connection string into manifest/logs.

- [ ] **Step 3: Implement identity coverage adapter**

For the first release, provider-native physical/PITR recovery is the authoritative identity recovery path. `verifyCoverage()` returns `VERIFIED_PROVIDER_RECOVERY` only when selected provider recovery status proves Auth/identity recovery is available for the same recovery set; otherwise `FULL` verification fails.

- [ ] **Step 4: Implement Storage exporter**

Use supported Supabase Storage APIs through the service-role server client to enumerate private buckets/objects and stream object bytes into the work directory. Treat storage metadata as read-only; never mutate `storage.objects` directly. Produce bucket/object/byte/checksum manifests and incremental checkpoint metadata.

- [ ] **Step 5: Run GREEN and commit**

```bash
npx vitest run tests/backups/manifest-package.test.ts tests/backups/provider-contracts.test.ts
npm run typecheck
git add lib/operations/backups/providers lib/operations/backups/manifest.ts \
  lib/operations/backups/verify.ts tests/backups
git commit -m "feat(WASDOK-55): add comprehensive archive providers"
```

---

### Task 7: Streaming ZIP encryption, archive store and download grants

**Files:**
- Create: `lib/operations/backups/package.ts`
- Create: `lib/operations/backups/providers/archive-key.ts`
- Create: `lib/operations/backups/providers/archive-store.ts`
- Modify: `package.json` and `package-lock.json` — add runtime dependency `archiver` and dev dependency `@types/archiver`.
- Modify: `tests/backups/manifest-package.test.ts`

- [ ] **Step 1: Write RED crypto/package tests**

Prove packaging is streaming, output filename ends `.zip.enc`, AES-256-GCM metadata contains nonce/tag/key-reference but no key material, SHA-256 is computed over final encrypted artifact, and tampering causes verification failure.

- [ ] **Step 2: Install the selected archive dependency**

```bash
npm install archiver
npm install -D @types/archiver
```

Commit the resulting `package.json` and `package-lock.json`; do not hand-edit the resolved dependency version.

- [ ] **Step 3: Implement package pipeline**

Create ZIP with `archiver`, pipe the ZIP stream through `crypto.createCipheriv('aes-256-gcm', ...)`, and write a temporary protected `.zip.enc`. Persist nonce/tag/key-reference/checksum metadata only. Overwrite/fill the in-memory key `Buffer` with zeros in `finally` after the cipher is initialized/completed.

- [ ] **Step 4: Implement archive store**

Use a dedicated private Supabase backup bucket as the first `ArchiveStore` adapter. Store encrypted artifacts and safe manifests only. `createDownloadGrant()` returns a short-lived signed URL after application authorization has been checked by server action; the URL is never persisted to database/audit state.

- [ ] **Step 5: Run GREEN and commit**

```bash
npx vitest run tests/backups/manifest-package.test.ts
npm run typecheck
npm run lint
git add package.json package-lock.json lib/operations/backups/package.ts \
  lib/operations/backups/providers/archive-key.ts lib/operations/backups/providers/archive-store.ts tests/backups
git commit -m "feat(WASDOK-55): add encrypted backup packaging and custody"
```

---

### Task 8: Operations worker and retention execution

**Files:**
- Create: `scripts/operations/backup-worker.mjs`
- Create: `scripts/operations/lib/backup-job-runner.mjs`
- Create: `scripts/operations/lib/redaction.mjs`
- Create: `tests/backups/worker.test.ts`

- [ ] **Step 1: Write RED worker tests**

Use fake providers and prove exact lifecycle order `QUEUED → RUNNING → PACKAGING → VERIFYING → AVAILABLE`, any mandatory provider/verification failure ends `FAILED`, retry never rewrites prior audit evidence, logs redact secrets, and expired-artifact purge requires a retention-approved job.

- [ ] **Step 2: Implement one-job runner**

`backup-worker.mjs --job-id <uuid>` loads one queued job, obtains server-only providers, uses an isolated temporary directory, performs export/identity coverage/storage/package/verification/store, records worker transitions, and recursively removes temporary plaintext/export files in `finally`.

- [ ] **Step 3: Add schedule/retention worker modes**

Support `--enqueue-due-schedules` and `--purge-expired`, both idempotent. Do not run the worker inside normal Next.js route handlers.

- [ ] **Step 4: Run GREEN and commit**

```bash
npx vitest run tests/backups/worker.test.ts
npm run verify:static
git add scripts/operations tests/backups/worker.test.ts
git commit -m "feat(WASDOK-55): add backup operations worker"
```

---

### Task 9: Backup & Recovery UI and guarded actions

**Files:**
- Create: `app/dashboard/operations/backups/page.tsx`
- Create: `app/dashboard/operations/backups/[backupId]/page.tsx`
- Create: `app/dashboard/operations/backups/restore/page.tsx`
- Create: `app/dashboard/operations/backups/actions.ts`
- Create: `components/operations/backups/backup-request-form.tsx`
- Create: `components/operations/backups/backup-status-card.tsx`
- Create: `components/operations/backups/backup-history-table.tsx`
- Create: `components/operations/backups/restore-request-form.tsx`
- Create: `components/operations/backups/restore-authorization-panel.tsx`
- Modify: `lib/rbac/navigation.ts`
- Create: `tests/backups/routes-actions.test.ts`

- [ ] **Step 1: Write RED route/action tests**

Prove `backup.view` protects the dashboard, action-specific permissions protect create/verify/download/schedule/restore, `requestDownloadAction` records reason then creates a short-lived grant without persisting URL, production restore displays recovery timestamp/data-loss impact and cannot self-authorize, and no provider credential enters form state/HTML.

- [ ] **Step 2: Implement navigation/routes**

Add Administration item `Backup & Recovery` at `/dashboard/operations/backups`, requiring `backup.view`. Detail screen shows backup lifecycle, recovery domains, manifest-safe metadata, verification, retention and download availability.

- [ ] **Step 3: Implement restore UI**

Separate `Restore Test` and `Production Restore`. The production panel shows requester, proposed recovery point, estimated data-loss window, authorization state and different-user authorization requirement.

- [ ] **Step 4: Run GREEN and commit**

```bash
npx vitest run tests/backups/routes-actions.test.ts
npm run test:routes
npm run typecheck
npm run lint
git add app/dashboard/operations/backups components/operations/backups lib/rbac/navigation.ts tests/backups/routes-actions.test.ts
git commit -m "feat(WASDOK-55): add backup recovery administration UI"
```

---

### Task 10: Restore rehearsal, end-to-end security and CI/deployment gates

**Files:**
- Create: `tests/backups/e2e.test.ts`
- Modify: `scripts/routes-smoke.mjs`
- Modify: `scripts/static-security.mjs`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/operations/WASDOK-55-RESTORE-REHEARSAL.md`
- Create: `docs/deployment/WASDOK-55-BACKUP-RECOVERY-DEPLOYMENT.md`

- [ ] **Step 1: Write RED E2E/CI contract**

Gate with `WASDOK55_BACKUP_E2E=true`. Use only `DEMO WASDOK55` metadata and fake/local provider adapters in CI. Prove backup request → worker execution → verified AVAILABLE artifact, unauthorized download denial, short-lived grant generation, restore-test request/result, production requester/authorizer separation, provider failure → FAILED, and safe immutable audit evidence.

- [ ] **Step 2: Add static security rules**

Fail CI if client-facing backup code contains Management API token names, database URLs, `SUPABASE_SERVICE_ROLE_KEY`, archive key variables, persisted provider signed URLs or service-client imports.

- [ ] **Step 3: Add CI stage**

Add `Backup & Recovery end-to-end (WASDOK-55)` after local database reset/pgTAP and before final static/type/build gates. CI uses fake providers and never calls the production Management API or creates production archives.

- [ ] **Step 4: Write deployment/restore runbooks**

Deployment requires ordered `01800 → 01900 → 02000`, scoped Management API token permissions (`backups_read`; add `backups_write` only when production restore is explicitly enabled), dedicated private backup bucket, database URL, key-provider reference, worker-host configuration, recovery-point listing dry run, and no production restore during deployment verification.

Restore rehearsal specifies isolated environment, identity + application database + Storage restoration, record/object count checks, login/Auth smoke test, migration integrity, RPO/RTO measurement and cleanup.

- [ ] **Step 5: Full exact-head verification**

```bash
npm run test:run
npm run test:auth-security
supabase db reset
npm run test:rls
WASDOK55_BACKUP_E2E=true npx vitest run tests/backups/e2e.test.ts
npm run typecheck:domain
npm run test:domain
npm run test:schema
npm run test:routes
npm run verify:static
npm run typecheck
npm run lint
npm run test:auth-build
```

- [ ] **Step 6: Draft PR and stop at merge gate**

Target `feat/wasdok360-release1`, list migrations `01800–02000`, state that real provider credentials/PITR restore were not used in CI, and request exactly:

`Approve WASDOK-55 PR #<number> merge.`

---

## Post-Merge / Production Enablement Gates

1. Merge only after explicit approval and exact-head green CI.
2. Verify post-merge CI on the release-branch merge commit.
3. Request explicit approval for hosted database migrations `01800–02000`.
4. Apply only those migrations to the OCPNG Supabase project.
5. Configure server-only backup bucket/key/database/Management API/worker credentials through the approved secret-management path; this is a separate production enablement step, not a database migration.
6. Verify recovery-point listing and archive creation using a controlled non-production or explicitly approved production backup job; do not invoke production PITR restore.
7. Perform an isolated restore rehearsal and record identity/database/Storage verification plus achieved RPO/RTO.
8. Run Security Advisor and privileged-boundary review.
9. Only after clean closure review request: `Approve WASDOK-55 closure.`
