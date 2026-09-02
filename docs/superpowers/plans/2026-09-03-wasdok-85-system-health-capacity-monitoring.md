# WASDOK-85 System Health, Capacity & Operational Monitoring Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a permission-controlled System Health dashboard that collects and retains safe application, database, Storage, backup, deployment and approved security-health telemetry; detects stale/unavailable signals and schema drift; evaluates thresholds; and forecasts capacity without exposing protected case content or infrastructure credentials.

**Architecture:** WASDOK-85 consumes safe operational metrics through server-only collectors and provider adapters, normalizes them into an allowlisted health metric catalogue, stores historical samples/snapshots in Supabase, and evaluates thresholds deterministically. Backup health comes from WASDOK-55 metadata; security health consumes only aggregate indicators supplied by WASDOK-48. The browser reads authorized normalized health data only and never calls privileged provider metrics endpoints directly.

**Tech Stack:** Next.js 16.3.3 App Router, React 19.2.8, TypeScript 6.0.3, Supabase/PostgreSQL/RLS/RPC, Supabase Metrics/Management API, Node 22 collector worker, Zod 4.5.4, Vitest 4.1.11, pgTAP, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-03-wasdok-backup-recovery-system-health-design.md`

## Global Constraints

- WASDOK-85 execution starts only after WASDOK-55 has merged into `feat/wasdok360-release1`; create/rebase the WASDOK-85 work branch from that exact release head.
- WASDOK-81 reserves migrations `01500–01700`; WASDOK-55 reserves `01800–02000`; WASDOK-85 reserves `20260903002100`, `20260903002200`, and `20260903002300`.
- Before Task 1, run a migration preflight. If `02100–02300` already exist, stop and renumber all three before implementation.
- Health data is operational metadata, not authorization to protected case content.
- No health response may contain complaint/case narratives, protected filenames, credentials, tokens, service-role material, database connection strings, provider management tokens or encryption keys.
- Browser code never scrapes Supabase Metrics API or Management API directly.
- Provider collectors use server-only credentials and return normalized allowlisted metrics.
- Missing or stale data is `UNKNOWN`; it must never be silently reported as `HEALTHY`.
- `HEALTHY`, `WARNING`, `CRITICAL`, and `UNKNOWN` statuses always have an underlying measurement/reason accessible to an authorized user.
- `TRAINING_SUPER_ADMIN` receives fictional DEMO telemetry only unless separately granted production `system.health.view`; training role type alone does not expose production infrastructure details.
- Capacity forecasting is deterministic, documented and testable; it must not invent forecasts when insufficient samples exist.
- Health failures do not automatically change production data, security policy, compute size or retention policy.
- Hosted deployment, provider credential configuration and collector scheduling remain explicit post-merge approval gates.

---

## File Structure

### Database
- Create `supabase/migrations/20260903002100_system_health_foundation.sql` — permissions, health metric catalogue, snapshots/samples, thresholds, alerts, deployment state and RLS.
- Create `supabase/migrations/20260903002200_system_health_workflows.sql` — audited threshold administration, service-only ingestion, alert acknowledgement, safe aggregate read RPCs.
- Create `supabase/migrations/20260903002300_system_health_direct_write_boundary.sql` — direct DML denial and final grants.
- Create `supabase/tests/system_health_foundation.sql`.
- Create `supabase/tests/system_health_workflows.sql`.
- Create `supabase/tests/system_health_direct_write_denial.sql`.

### Domain / collectors
- Create `lib/operations/health/types.ts`.
- Create `lib/operations/health/validation.ts`.
- Create `lib/operations/health/catalog.ts`.
- Create `lib/operations/health/status.ts`.
- Create `lib/operations/health/forecast.ts`.
- Create `lib/operations/health/queries.ts`.
- Create `lib/operations/health/mutations.ts`.
- Create `lib/operations/health/provider-types.ts`.
- Create `lib/operations/health/providers/supabase-metrics.ts`.
- Create `lib/operations/health/providers/database-aggregate.ts`.
- Create `lib/operations/health/providers/storage-aggregate.ts`.
- Create `lib/operations/health/providers/application-probe.ts`.
- Create `lib/operations/health/providers/deployment-state.ts`.
- Create `lib/operations/health/providers/backup-health.ts`.
- Create `lib/operations/health/providers/security-health.ts`.

### Collector worker / health endpoint
- Create `app/api/health/route.ts` — safe application liveness/version response.
- Create `scripts/operations/health-collector.mjs`.
- Create `scripts/operations/lib/health-collector-runner.mjs`.
- Modify `lib/config/server-environment.ts` for server-only health collector configuration.

### UI
- Create `app/dashboard/operations/system-health/page.tsx`.
- Create `app/dashboard/operations/system-health/database/page.tsx`.
- Create `app/dashboard/operations/system-health/storage/page.tsx`.
- Create `app/dashboard/operations/system-health/backups/page.tsx`.
- Create `app/dashboard/operations/system-health/deployment/page.tsx`.
- Create `app/dashboard/operations/system-health/alerts/page.tsx`.
- Create `app/dashboard/operations/system-health/actions.ts`.
- Create `components/operations/health/health-status-card.tsx`.
- Create `components/operations/health/metric-table.tsx`.
- Create `components/operations/health/growth-chart.tsx`.
- Create `components/operations/health/capacity-forecast-card.tsx`.
- Create `components/operations/health/threshold-form.tsx`.
- Create `components/operations/health/alert-table.tsx`.
- Modify `lib/rbac/types.ts` and `lib/rbac/navigation.ts`.

### Tests / CI / docs
- Create `tests/health/status.test.ts`.
- Create `tests/health/forecast.test.ts`.
- Create `tests/health/provider-contracts.test.ts`.
- Create `tests/health/collector.test.ts`.
- Create `tests/health/routes-actions.test.ts`.
- Create `tests/health/e2e.test.ts`.
- Create `tests/health/security-boundary.test.ts`.
- Modify `scripts/routes-smoke.mjs` and `scripts/static-security.mjs`.
- Modify `.github/workflows/ci.yml`.
- Create `docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md`.
- Create `docs/operations/WASDOK-85-HEALTH-METRIC-CATALOG.md`.

---

### Task 1: Health schema, metric catalogue and permissions

**Files:**
- Create: `supabase/tests/system_health_foundation.sql`
- Create: `supabase/migrations/20260903002100_system_health_foundation.sql`
- Modify: `lib/rbac/types.ts`

**Interfaces:**
- Permissions: `system.health.view`, `system.health.manage`.
- Tables: `health_metric_catalog`, `system_health_snapshots`, `system_health_metric_samples`, `system_health_thresholds`, `system_health_alerts`, `deployment_health_state`.
- Status enum: `HEALTHY`, `WARNING`, `CRITICAL`, `UNKNOWN`.

- [ ] **Step 1: Write RED pgTAP tests**

Assert both permissions, all tables, RLS, unique metric code, metric unit/type validation, `observed_at`, `collected_at`, source/provider, stale-after seconds, and alert/status enums.

Example:

```sql
select has_table('public','system_health_metric_samples','health samples exist');
select ok(exists(select 1 from public.permissions where code='system.health.view'),'health view permission exists');
select ok((select relrowsecurity from pg_class where oid='public.system_health_alerts'::regclass),'health alerts RLS enabled');
```

- [ ] **Step 2: Run RED**

```bash
supabase start
supabase db reset
npm run test:rls
```

- [ ] **Step 3: Implement `02100`**

Seed an allowlisted metric catalogue with stable codes including:

```text
app.availability
app.response_latency_ms
app.http_error_rate
app.deployed_commit
db.database_bytes
db.disk_bytes
db.wal_bytes
db.connections_active
db.connections_max
db.long_running_queries
db.deadlocks_24h
storage.object_count
storage.bytes
backup.last_verified_age_seconds
backup.last_restore_rehearsal_age_seconds
deployment.schema_drift
security.failed_privileged_ops_24h
security.failed_logins_24h
security.advisor_warning_count
```

String-valued deployment metrics are stored in safe snapshot metadata rather than numeric metric sample columns.

- [ ] **Step 4: Extend `PermissionCode` and run GREEN**

```bash
supabase db reset
npm run test:rls
npm run typecheck:domain
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/system_health_foundation.sql \
  supabase/migrations/20260903002100_system_health_foundation.sql lib/rbac/types.ts
git commit -m "feat(WASDOK-85): add system health foundation"
```

---

### Task 2: Health ingestion, threshold administration and alert lifecycle

**Files:**
- Create: `supabase/tests/system_health_workflows.sql`
- Create: `supabase/migrations/20260903002200_system_health_workflows.sql`

**Interfaces:**
- Service-only `record_health_snapshot(p_source text, p_observed_at timestamptz, p_metrics jsonb, p_safe_metadata jsonb) returns uuid`.
- `admin_set_health_threshold(p_metric_code text, p_warning numeric, p_critical numeric, p_direction text, p_reason text) returns uuid`.
- `admin_set_health_threshold_active(p_threshold_id uuid, p_active boolean, p_reason text) returns void`.
- `acknowledge_health_alert(p_alert_id uuid, p_reason text) returns void`.
- Authorized read RPCs return normalized data only to `system.health.view`.

- [ ] **Step 1: Write RED workflow tests**

Prove ordinary authenticated users cannot ingest snapshots; `system.health.manage` is required for threshold changes; reasons are 3–500 chars; thresholds must use known metric codes; WARNING/CRITICAL ordering matches direction; alert acknowledgement is audited; raw provider payloads/secrets cannot be stored in safe metadata.

- [ ] **Step 2: Run RED and implement `02200`**

Use `SECURITY DEFINER set search_path=''`, resolve human actor from `auth.uid()` for admin mutations, and grant ingestion only to trusted service/worker role. Add safe immutable events `health.threshold_changed` and `health.alert_acknowledged`.

- [ ] **Step 3: Run GREEN and commit**

```bash
supabase db reset && npm run test:rls
git add supabase/tests/system_health_workflows.sql \
  supabase/migrations/20260903002200_system_health_workflows.sql
git commit -m "feat(WASDOK-85): add health ingestion thresholds and alerts"
```

---

### Task 3: Health direct-write boundary

**Files:**
- Create: `supabase/tests/system_health_direct_write_denial.sql`
- Create: `supabase/migrations/20260903002300_system_health_direct_write_boundary.sql`

- [ ] **Step 1: Write RED authenticated direct-DML tests**

Prove INSERT/UPDATE/DELETE are denied on all health tables and `anon` has no health RPC execution.

- [ ] **Step 2: Implement `02300`**

Revoke browser DML; grant authenticated read/admin RPCs only; keep ingestion RPC service-only.

- [ ] **Step 3: Run GREEN and commit**

```bash
supabase db reset && npm run test:rls
git add supabase/tests/system_health_direct_write_denial.sql \
  supabase/migrations/20260903002300_system_health_direct_write_boundary.sql
git commit -m "feat(WASDOK-85): harden system health write boundary"
```

---

### Task 4: Domain status/freshness model and capacity forecasting

**Files:**
- Create: `lib/operations/health/types.ts`
- Create: `lib/operations/health/validation.ts`
- Create: `lib/operations/health/catalog.ts`
- Create: `lib/operations/health/status.ts`
- Create: `lib/operations/health/forecast.ts`
- Create: `tests/health/status.test.ts`
- Create: `tests/health/forecast.test.ts`

**Interfaces:**

```ts
export type HealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';
export interface MetricSample { code: string; value: number; observedAt: string; staleAfterSeconds: number; }
export interface CapacityForecast { status: 'AVAILABLE' | 'INSUFFICIENT_DATA'; slopePerDay: number | null; projected30Days: number | null; projected180Days: number | null; projected365Days: number | null; sampleCount: number; }
```

- [ ] **Step 1: Write RED status tests**

Prove missing sample = UNKNOWN, stale sample = UNKNOWN, threshold evaluation respects `ABOVE_IS_BAD` and `BELOW_IS_BAD`, CRITICAL dominates WARNING, and UNKNOWN is never coerced to HEALTHY.

- [ ] **Step 2: Write RED forecast tests**

Use ordinary least-squares slope over daily samples with minimum 7 distinct days and maximum 90-day lookback. Less than 7 points returns `INSUFFICIENT_DATA`. Negative projected bytes clamp at zero. Forecasting uses observed numeric data only; no AI/model call.

- [ ] **Step 3: Implement minimal domain logic and run GREEN**

```bash
npx vitest run tests/health/status.test.ts tests/health/forecast.test.ts
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add lib/operations/health tests/health/status.test.ts tests/health/forecast.test.ts
git commit -m "feat(WASDOK-85): add health status and capacity forecasting"
```

---

### Task 5: Provider collectors and safe aggregation

**Files:**
- Create: `lib/operations/health/provider-types.ts`
- Create: `lib/operations/health/providers/supabase-metrics.ts`
- Create: `lib/operations/health/providers/database-aggregate.ts`
- Create: `lib/operations/health/providers/storage-aggregate.ts`
- Create: `lib/operations/health/providers/application-probe.ts`
- Create: `lib/operations/health/providers/deployment-state.ts`
- Modify: `lib/config/server-environment.ts`
- Create: `app/api/health/route.ts`
- Create: `tests/health/provider-contracts.test.ts`
- Create: `tests/health/security-boundary.test.ts`

**Interfaces:**

```ts
export interface HealthProvider { collect(): Promise<CollectedHealthMetric[]>; }
```

- [ ] **Step 1: Write RED provider tests**

Mock Supabase Metrics/Management API and prove Prometheus text is parsed only for allowlisted metric names, unexpected labels/metrics are dropped, provider 401/403/429/5xx become UNKNOWN source state, and error messages do not contain credentials.

- [ ] **Step 2: Implement Supabase metrics adapter**

Use server-only scoped analytics credential for Management API metrics scrape or approved secret API-key endpoint configuration. Normalize CPU/IO/WAL/connection/query metrics into catalogue codes. Do not persist raw Prometheus payloads.

- [ ] **Step 3: Implement safe database/storage aggregates**

Use server-side/service-only reads to calculate database size, approved table-size aggregates, storage object count/bytes and latest migration state. Never return Storage object names/paths or protected record values.

- [ ] **Step 4: Implement safe application probe**

`app/api/health/route.ts` returns only liveness, release/commit identifier, expected schema version and timestamp. It exposes no environment variables or credentials.

- [ ] **Step 5: Run GREEN and commit**

```bash
npx vitest run tests/health/provider-contracts.test.ts tests/health/security-boundary.test.ts
npm run typecheck
npm run verify:static
git add lib/operations/health/providers lib/config/server-environment.ts app/api/health/route.ts tests/health
git commit -m "feat(WASDOK-85): add safe system health collectors"
```

---

### Task 6: Backup-health, security-health and schema-drift integration

**Files:**
- Create: `lib/operations/health/providers/backup-health.ts`
- Create: `lib/operations/health/providers/security-health.ts`
- Modify: `lib/operations/health/providers/deployment-state.ts`
- Modify: `tests/health/provider-contracts.test.ts`

- [ ] **Step 1: Write RED integration tests**

Backup health reads WASDOK-55 verified/restore metadata only; no archive URL/content. Security provider consumes an approved aggregate interface and returns UNKNOWN when WASDOK-48 has not yet produced a signal. Deployment provider compares code `EXPECTED_SCHEMA_VERSION='20260903002300'` with the latest applied migration and emits `deployment.schema_drift=1` on mismatch, `0` on match, UNKNOWN on query failure.

- [ ] **Step 2: Implement integrations**

Calculate backup age from last VERIFIED/AVAILABLE archive/recovery metadata and restore-rehearsal age from completed restore test. Do not equate a failed or unverified backup with healthy freshness.

- [ ] **Step 3: Run GREEN and commit**

```bash
npx vitest run tests/health/provider-contracts.test.ts
npm run typecheck
git add lib/operations/health/providers tests/health/provider-contracts.test.ts
git commit -m "feat(WASDOK-85): integrate backup security and deployment health"
```

---

### Task 7: Collector worker, normalization and deterministic alert evaluation

**Files:**
- Create: `scripts/operations/health-collector.mjs`
- Create: `scripts/operations/lib/health-collector-runner.mjs`
- Create: `tests/health/collector.test.ts`

- [ ] **Step 1: Write RED collector tests**

Using fake providers, prove one run collects all sources independently, one failed provider does not suppress other metrics, failed source records UNKNOWN source state, samples are normalized/allowlisted before ingestion, thresholds generate/resolve alerts deterministically, and no raw provider payload is stored.

- [ ] **Step 2: Implement collector**

`health-collector.mjs --once` invokes providers concurrently with bounded timeouts, normalizes results, calls service-only `record_health_snapshot`, evaluates current thresholds, and persists/open/closes alerts idempotently.

- [ ] **Step 3: Add periodic mode contract**

The executable supports repeated external scheduling but does not implement an endless loop inside Netlify request functions. Production scheduler invokes `--once` at the approved cadence; 60 seconds is the recommended Supabase Metrics scrape cadence, while snapshot persistence may be downsampled according to retention policy.

- [ ] **Step 4: Run GREEN and commit**

```bash
npx vitest run tests/health/collector.test.ts
npm run verify:static
git add scripts/operations/health-collector.mjs scripts/operations/lib/health-collector-runner.mjs tests/health/collector.test.ts
git commit -m "feat(WASDOK-85): add system health collector worker"
```

---

### Task 8: System Health dashboard and threshold administration

**Files:**
- Create: `app/dashboard/operations/system-health/*`
- Create: `app/dashboard/operations/system-health/actions.ts`
- Create: `components/operations/health/*`
- Create: `lib/operations/health/queries.ts`
- Create: `lib/operations/health/mutations.ts`
- Modify: `lib/rbac/navigation.ts`
- Create: `tests/health/routes-actions.test.ts`

- [ ] **Step 1: Write RED UI/action tests**

Prove all pages require `system.health.view`, threshold mutations require `system.health.manage`, no raw provider data is queried by client components, stale/UNKNOWN is visibly distinct from HEALTHY, and drill-down displays measurement/unit/observed time/source/reason without protected content.

- [ ] **Step 2: Implement navigation and overview**

Add Administration item `System Health` at `/dashboard/operations/system-health` requiring `system.health.view`. Overview cards: Application, Database, Storage, Backup & Recovery, Deployment, Security.

- [ ] **Step 3: Implement database/storage growth and forecasts**

Render historical daily samples and capacity forecast cards for database/storage bytes. Use accessible tables plus charts; charts do not become the only representation of status.

- [ ] **Step 4: Implement alerts/threshold UI**

Authorized managers can set warning/critical thresholds with reason, deactivate thresholds, and acknowledge alerts. UI cannot edit metric catalogue codes or inject arbitrary SQL/PromQL.

- [ ] **Step 5: Run GREEN and commit**

```bash
npx vitest run tests/health/routes-actions.test.ts tests/health/status.test.ts tests/health/forecast.test.ts
npm run test:routes
npm run typecheck
npm run lint
git add app/dashboard/operations/system-health components/operations/health lib/operations/health \
  lib/rbac/navigation.ts tests/health/routes-actions.test.ts
git commit -m "feat(WASDOK-85): add system health dashboard"
```

---

### Task 9: E2E, CI, metric catalogue documentation and deployment gates

**Files:**
- Create: `tests/health/e2e.test.ts`
- Modify: `scripts/routes-smoke.mjs`
- Modify: `scripts/static-security.mjs`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/operations/WASDOK-85-HEALTH-METRIC-CATALOG.md`
- Create: `docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md`

- [ ] **Step 1: Write RED E2E/CI contract**

Gate with `WASDOK85_HEALTH_E2E=true`. Use fictional `DEMO WASDOK85` metrics/fake providers. Prove authorized view, unauthorized denial, threshold create/update audit, WARNING/CRITICAL transitions, stale → UNKNOWN, provider failure isolation, database/storage forecast, backup health consumption from WASDOK-55 fixtures, and schema-drift detection.

- [ ] **Step 2: Extend static security checks**

Fail client code that references Supabase Management/metrics credentials, service-role keys, database URLs, raw provider payloads or Storage object names from collector internals.

- [ ] **Step 3: Add CI stage**

Add `System Health end-to-end (WASDOK-85)` after database reset/pgTAP and WASDOK-55 local integration, using fake providers only. CI never scrapes production Supabase/Netlify telemetry.

- [ ] **Step 4: Write metric catalogue/runbook**

Document each metric code, unit, source, scrape/sample cadence, stale threshold, default threshold direction, privacy classification and fallback behavior. Deployment runbook requires ordered `02100 → 02200 → 02300`, scoped server-only analytics credential, application probe URL, collector scheduler, and initial collector dry run.

- [ ] **Step 5: Full exact-head verification**

```bash
npm run test:run
npm run test:auth-security
supabase db reset
npm run test:rls
WASDOK55_BACKUP_E2E=true npx vitest run tests/backups/e2e.test.ts
WASDOK85_HEALTH_E2E=true npx vitest run tests/health/e2e.test.ts
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

Target the release branch that already contains merged WASDOK-55. PR body lists `02100–02300`, explains UNKNOWN/stale semantics and provider credential separation, and requests exactly:

`Approve WASDOK-85 PR #<number> merge.`

---

## Post-Merge / Production Enablement Gates

1. Merge only after explicit user approval and exact-head green CI.
2. Verify post-merge CI on the exact release merge commit.
3. Request explicit hosted Supabase migration approval for `02100–02300`.
4. Apply only those migrations to the OCPNG project.
5. Configure server-only health collector credentials and scheduler separately; never expose them to Netlify browser variables.
6. Run one controlled collector cycle and verify application/database/Storage/backup/deployment signals. Missing provider integrations must show UNKNOWN, not HEALTHY.
7. Observe at least one snapshot interval, confirm growth history is recording, and test a non-destructive threshold alert using controlled DEMO/test metric ingestion where possible.
8. Run Security Advisor and negative-access review.
9. Conduct closure review against WASDOK-85 acceptance criteria and only then request: `Approve WASDOK-85 closure.`
