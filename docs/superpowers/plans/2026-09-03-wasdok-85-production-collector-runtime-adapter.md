# WASDOK-85 Production Collector Runtime Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production Node ESM runtime adapter required by the existing WASDOK-85 collector so approved operational providers can run with server-only credentials and persist only through the existing service-role RPC boundary.

**Architecture:** Keep `scripts/operations/health-collector.mjs` as the single CLI and `scripts/operations/lib/health-collector-runner.mjs` as the single orchestration engine. Extract existing provider behavior into runtime-safe `.mjs` modules with `.d.mts` declarations, keep the existing TypeScript import paths as thin wrappers, and compose those providers in `scripts/operations/runtime/health-production-runtime.mjs`. The runtime owns one Supabase service client, column-limited WASDOK-55 reads, canonical schema-version RPC access, and RPC-only health persistence.

**Tech Stack:** Node.js 22 ESM, TypeScript 6, Vitest 4, `@supabase/supabase-js` 2.112.4, Next.js 16, Supabase/Postgres RPCs, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-03-wasdok-85-production-collector-runtime-adapter-design.md`

## Global Constraints

- Canonical application schema version is exactly `20260903002400`.
- Existing collector metric allowlist remains exactly the current 18-code catalogue.
- This task may emit from Supabase Management metrics only `db.database_bytes` and `db.connections_active`; do not add new provider mappings.
- The `security` source remains explicit `UNKNOWN` with `PROVIDER_UNAVAILABLE`; do not add or discover a new aggregate source in this task.
- Application probing may emit only `app.availability` and `app.response_latency_ms`; do not synthesize `app.http_error_rate`.
- Health persistence must use only `record_health_snapshot` and `record_deployment_health_state` RPCs; no direct health-table writes.
- Schema drift must use only `read_applied_schema_version()`; never read `supabase_migrations.schema_migrations` from runtime code.
- WASDOK-55 reads are limited to `backup_verifications.verified_at` for `PASSED` rows and `restore_runs.completed_at` for completed `TEST` runs.
- No backup artifact/reference/checksum/key/metadata fields may be queried by the health runtime.
- Production runtime configuration remains server-only. Never introduce a `NEXT_PUBLIC_*` secret.
- No real credential, provider body, auth header, Supabase error payload, Storage identifier, complaint/case/evidence content, or environment dump may be logged or persisted.
- Provider failures remain isolated and normalize to existing approved UNKNOWN reasons; persistence failures fail the collector process.
- No database migration or privilege grant is authorized by this plan. If one appears necessary, stop and return to design review.
- No production credential configuration, production `--once` run, threshold mutation, scheduler enablement, or WASDOK-85 closure is authorized by implementation.
- Preserve all repository guardrails in `AGENTS.md` and all existing WASDOK-55/62/67/78/85 regression gates.

---

## File Structure

### New runtime files

- `scripts/operations/lib/health-runtime-config.mjs` — validates the complete worker-only environment and returns normalized configuration without echoing values.
- `scripts/operations/lib/health-runtime-config.d.mts` — TypeScript declarations for runtime configuration.
- `scripts/operations/lib/providers/supabase-metrics.mjs` — single runtime implementation of existing strict Prometheus parsing/provider behavior.
- `scripts/operations/lib/providers/supabase-metrics.d.mts` — declarations for the shared Supabase metrics provider.
- `scripts/operations/lib/providers/backup-health.mjs` — single runtime implementation of existing WASDOK-55 age derivation behavior.
- `scripts/operations/lib/providers/backup-health.d.mts` — declarations for backup provider/data-source interface.
- `scripts/operations/lib/providers/schema-drift.mjs` — single runtime implementation of canonical schema drift/deployment state behavior.
- `scripts/operations/lib/providers/schema-drift.d.mts` — declarations for schema drift provider/state.
- `scripts/operations/lib/providers/security-health.mjs` — single runtime implementation of existing aggregate security normalization; production composition supplies no source.
- `scripts/operations/lib/providers/security-health.d.mts` — declarations for security provider/source types.
- `scripts/operations/lib/providers/application-health.mjs` — public-safe `/api/health` liveness/latency provider.
- `scripts/operations/lib/providers/application-health.d.mts` — declarations for application provider.
- `scripts/operations/lib/health-supabase-runtime.mjs` — owns the one service client, exact WASDOK-55 reads, schema RPC and persistence RPC adapters.
- `scripts/operations/lib/health-supabase-runtime.d.mts` — declarations for the Supabase runtime adapter.
- `scripts/operations/runtime/health-production-runtime.mjs` — exports `createHealthCollectorRuntime()` and composes the five fixed provider sources.
- `scripts/operations/runtime/health-production-runtime.d.mts` — declaration of the collector runtime factory.

### Existing files to modify

- `lib/operations/health/providers/supabase-metrics.ts` — become server-only typed re-export of shared `.mjs` implementation.
- `lib/operations/health/providers/backup-health.ts` — become typed re-export of shared `.mjs` implementation.
- `lib/operations/health/providers/schema-drift.ts` — become typed re-export of shared `.mjs` implementation.
- `lib/operations/health/providers/security-health.ts` — become typed re-export of shared `.mjs` implementation.
- `.env.example` — add blank runtime variable names only.
- `scripts/static-security.mjs` — add runtime-specific secret/direct-write/raw-ledger/backup-field assertions.
- `.github/workflows/ci.yml` — include the runtime-adapter local Supabase E2E in the WASDOK-85 CI gate.
- `docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md` — document the reviewed adapter path and configuration-only validation; preserve the separate `--once` approval gate.

### New/modified tests

- `tests/health/production-runtime.test.ts` — runtime configuration, composition, application probe, Supabase RPC/query and secret-containment contract tests.
- `tests/health/provider-contracts.test.ts` — preserve Supabase metrics behavior while verifying the shared implementation.
- `tests/health/integrations.test.ts` — preserve backup/schema/security provider behavior after extraction.
- `tests/health/runtime-adapter-e2e.test.ts` — local Supabase end-to-end runtime persistence and canonical-version test.
- `tests/health/security-boundary.test.ts` — extend static/runtime boundary assertions if a focused assertion belongs here rather than `static-security.mjs`.

---

### Task 1: Establish RED runtime-adapter contract evidence

**Files:**
- Create: `tests/health/production-runtime.test.ts`
- No production runtime files yet.

**Interfaces:**
- Consumes: existing CLI contract `createHealthCollectorRuntime()` loaded through `OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE`.
- Produces: failing tests that define the exact runtime module/configuration/persistence contract for Tasks 2–6.

- [ ] **Step 1: Add the initial missing-runtime RED assertion**

Create `tests/health/production-runtime.test.ts` with an initial test that proves the approved module is required but does not yet exist:

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('WASDOK-85 production health runtime', () => {
  it('provides the reviewed production runtime adapter module', () => {
    expect(
      existsSync(resolve('scripts/operations/runtime/health-production-runtime.mjs')),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run only the RED test**

Run:

```bash
npx vitest run tests/health/production-runtime.test.ts
```

Expected: FAIL because `scripts/operations/runtime/health-production-runtime.mjs` does not exist.

- [ ] **Step 3: Commit RED evidence before implementation**

```bash
git add tests/health/production-runtime.test.ts
git commit -m "test(WASDOK-85): define production runtime adapter RED contract"
```

Record the commit SHA and exact failing assertion in Jira WASDOK-85. If GitHub CI is triggered, preserve the failing run ID as RED evidence; do not attempt to make the branch green before this evidence is captured.

---

### Task 2: Extract existing provider behavior into runtime-safe shared modules

**Files:**
- Create: `scripts/operations/lib/providers/supabase-metrics.mjs`
- Create: `scripts/operations/lib/providers/supabase-metrics.d.mts`
- Create: `scripts/operations/lib/providers/backup-health.mjs`
- Create: `scripts/operations/lib/providers/backup-health.d.mts`
- Create: `scripts/operations/lib/providers/schema-drift.mjs`
- Create: `scripts/operations/lib/providers/schema-drift.d.mts`
- Create: `scripts/operations/lib/providers/security-health.mjs`
- Create: `scripts/operations/lib/providers/security-health.d.mts`
- Modify: `lib/operations/health/providers/supabase-metrics.ts`
- Modify: `lib/operations/health/providers/backup-health.ts`
- Modify: `lib/operations/health/providers/schema-drift.ts`
- Modify: `lib/operations/health/providers/security-health.ts`
- Test: `tests/health/provider-contracts.test.ts`
- Test: `tests/health/integrations.test.ts`

**Interfaces:**
- Consumes: current class names and behavior: `SupabaseMetricsProvider`, `BackupHealthProvider`, `SchemaDriftProvider`, `AggregateSecurityHealthProvider`, `EXPECTED_SCHEMA_VERSION`.
- Produces: the same runtime classes from `.mjs`, with TypeScript declarations so existing imports remain unchanged.

- [ ] **Step 1: Add direct shared-module regression assertions before extraction**

Extend the two existing test files so they import the proposed `.mjs` modules directly and assert parity with the current TypeScript imports. For example, add a test that calls both Prometheus parsers with:

```text
pg_database_size_mb 12.5
pg_stat_database_num_backends 7
unexpected_sensitive_metric{object_name="RESTRICTED-case-file.pdf"} 999
```

and expects exactly:

```ts
[
  { code: 'db.database_bytes', value: 12.5 * 1024 * 1024 },
  { code: 'db.connections_active', value: 7 },
]
```

Expected before extraction: FAIL because the `.mjs` modules do not exist.

- [ ] **Step 2: Move Supabase metrics implementation without widening the parser**

Create `scripts/operations/lib/providers/supabase-metrics.mjs` by moving the existing parser/provider behavior exactly. Keep:

```js
const MANAGEMENT_API_ROOT = 'https://api.supabase.com/v1/projects';
const DEFAULT_TIMEOUT_MS = 10_000;
const MB = 1024 * 1024;
```

The parser may recognize only `pg_database_size_mb` and `pg_stat_database_num_backends`. Do not add any other mapping.

Create `supabase-metrics.d.mts` declaring:

```ts
export type HealthProviderMetric = { code: string; value: number };
export type HealthProviderSnapshot = {
  source: string;
  status: 'AVAILABLE' | 'UNKNOWN';
  metrics: HealthProviderMetric[];
  reason?: 'AUTHENTICATION_FAILED' | 'AUTHORIZATION_FAILED' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_ERROR';
};
export function parseSupabasePrometheusMetrics(text: string): HealthProviderMetric[];
export class SupabaseMetricsProvider {
  constructor(input: { projectRef: string; healthToken: string; fetchImpl?: typeof fetch; timeoutMs?: number });
  collect(): Promise<HealthProviderSnapshot>;
}
```

Replace `lib/operations/health/providers/supabase-metrics.ts` with a server-only re-export:

```ts
import 'server-only';
export {
  SupabaseMetricsProvider,
  parseSupabasePrometheusMetrics,
} from '../../../../scripts/operations/lib/providers/supabase-metrics.mjs';
```

- [ ] **Step 3: Move backup provider implementation and declarations**

Move existing age calculation and UNKNOWN semantics into `scripts/operations/lib/providers/backup-health.mjs`. Declare `BackupHealthDataSource` and `BackupHealthProvider` in the adjacent `.d.mts`. Replace the TypeScript file with:

```ts
export {
  BackupHealthProvider,
  type BackupHealthDataSource,
} from '../../../../scripts/operations/lib/providers/backup-health.mjs';
```

Preserve: missing both timestamps -> `UNKNOWN/PROVIDER_UNAVAILABLE`; malformed/future timestamps -> `UNKNOWN/PROVIDER_ERROR`; one valid timestamp -> one metric only.

- [ ] **Step 4: Move schema-drift provider implementation and declarations**

Move current behavior into `scripts/operations/lib/providers/schema-drift.mjs` and keep:

```js
export const EXPECTED_SCHEMA_VERSION = '20260903002400';
```

The TypeScript wrapper re-exports the class, constant and `DeploymentHealthState` type. Do not add raw migration-ledger access.

- [ ] **Step 5: Move security provider implementation and declarations**

Move current `AggregateSecurityHealthProvider` implementation into `scripts/operations/lib/providers/security-health.mjs`. Preserve the optional source interface for tests/application reuse, but the future production composition in Task 6 must construct it with no source.

- [ ] **Step 6: Run provider regression tests and typecheck**

```bash
npx vitest run tests/health/provider-contracts.test.ts tests/health/integrations.test.ts
npm run typecheck
```

Expected: PASS with the same current outputs, including canonical version `20260903002400` and security UNKNOWN-without-source.

- [ ] **Step 7: Commit the provider extraction**

```bash
git add scripts/operations/lib/providers lib/operations/health/providers tests/health/provider-contracts.test.ts tests/health/integrations.test.ts
git commit -m "refactor(WASDOK-85): share health providers with production runtime"
```

---

### Task 3: Implement fail-closed worker configuration and application probe

**Files:**
- Create: `scripts/operations/lib/health-runtime-config.mjs`
- Create: `scripts/operations/lib/health-runtime-config.d.mts`
- Create: `scripts/operations/lib/providers/application-health.mjs`
- Create: `scripts/operations/lib/providers/application-health.d.mts`
- Modify: `tests/health/production-runtime.test.ts`

**Interfaces:**
- Produces: `getHealthRuntimeConfiguration(source?)` and `ApplicationHealthProvider`.
- Runtime config return shape:

```ts
{
  supabaseUrl: string;
  serviceRoleKey: string;
  projectRef: string;
  healthToken: string;
  publicAppUrl: string;
  environment: 'production';
  deployedCommit?: string;
  releaseId?: string;
}
```

- [ ] **Step 1: Write failing configuration tests**

Add tests using fictional values:

```ts
const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_DEMO_SERVICE_ROLE_1234567890',
  OCPNG_SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  OCPNG_SUPABASE_HEALTH_TOKEN: 'sbp_DEMO_HEALTH_TOKEN_1234567890',
  OCPNG_PUBLIC_APP_URL: 'https://wasdok.example.invalid',
  OCPNG_DEPLOYED_COMMIT: 'abcdef1234567890',
  OCPNG_RELEASE_ID: 'release-85',
};
```

Assert complete configuration is accepted, `environment` is exactly `production`, and each missing/invalid required value throws exactly:

```text
System health runtime configuration is unavailable.
```

For invalid service-role, health-token and URL inputs, assert the thrown string does not contain the input value.

- [ ] **Step 2: Implement configuration validation**

In `health-runtime-config.mjs`, implement local helpers equivalent to existing server validation semantics:

- Supabase URL: HTTPS URL with hostname and no username/password;
- service credential: `sb_secret_` prefix or a structurally valid legacy JWT whose decoded payload role is exactly `service_role`;
- project ref: `/^[a-z0-9]{20}$/`;
- health token: 24–512 chars, `/^[A-Za-z0-9._~-]+$/`;
- public app URL: HTTPS with hostname and no username/password;
- deployed commit when supplied: `/^[A-Fa-f0-9]{7,64}$/`;
- release ID when supplied: `/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/`.

Return only normalized values; never include the source object in an exception.

- [ ] **Step 3: Write failing application-probe tests**

Add deterministic tests with injected `fetchImpl` and `nowMs`:

1. 200 + `{status:'ok'}` -> `AVAILABLE` with `app.availability=1` and measured latency.
2. 503 -> `AVAILABLE` with `app.availability=0` plus latency, and a fake body containing `SECRET_RESPONSE_BODY` must never be read or appear in result JSON.
3. thrown network error -> `UNKNOWN/PROVIDER_UNAVAILABLE`.
4. malformed 2xx JSON contract -> `UNKNOWN/PROVIDER_ERROR`.
5. output never contains `app.http_error_rate`.
6. request URL is exactly `<base>/api/health` and includes an `AbortSignal`.

- [ ] **Step 4: Implement `ApplicationHealthProvider`**

Use an internal timeout default of `8_000` ms. For 2xx, parse JSON only to verify `payload?.status === 'ok'`. For non-2xx, do not call `response.text()` or `response.json()`; return availability `0` immediately after status/latency measurement. Catch all network/abort failures and return `PROVIDER_UNAVAILABLE`; malformed 2xx content returns `PROVIDER_ERROR`.

- [ ] **Step 5: Run focused tests**

```bash
npx vitest run tests/health/production-runtime.test.ts
```

Expected: configuration and application-provider tests PASS; the original missing production composition test may remain RED until Task 6.

- [ ] **Step 6: Commit configuration and application provider**

```bash
git add scripts/operations/lib/health-runtime-config.mjs scripts/operations/lib/health-runtime-config.d.mts scripts/operations/lib/providers/application-health.mjs scripts/operations/lib/providers/application-health.d.mts tests/health/production-runtime.test.ts
git commit -m "feat(WASDOK-85): add runtime config and application probe"
```

---

### Task 4: Implement the one-client Supabase runtime data/persistence adapter

**Files:**
- Create: `scripts/operations/lib/health-supabase-runtime.mjs`
- Create: `scripts/operations/lib/health-supabase-runtime.d.mts`
- Modify: `tests/health/production-runtime.test.ts`

**Interfaces:**
- Consumes: `supabaseUrl`, `serviceRoleKey`, injectable `createClientImpl`.
- Produces:

```ts
createHealthSupabaseRuntime(input) => {
  backupSource: {
    loadLastVerifiedBackupAt(): Promise<string | null>;
    loadLastCompletedRestoreTestAt(): Promise<string | null>;
  };
  loadAppliedSchemaVersion(): Promise<string>;
  recordSnapshot(input): Promise<void>;
  recordDeploymentState(state): Promise<void>;
}
```

- [ ] **Step 1: Write failing one-client and exact-query tests**

Use a fake `createClientImpl` and fake query builders. Assert client construction is called exactly once with:

```ts
{
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}
```

Assert backup verification query touches only `backup_verifications`, selects only `verified_at`, filters `status = PASSED`, excludes null timestamps, orders newest first and limits to one row.

Assert restore-test query touches only `restore_runs`, selects only `completed_at`, filters `restore_type = TEST`, `status = COMPLETED`, excludes null timestamps, orders newest first and limits to one row.

Assert no test call references `backup_artifacts`, `storage_reference`, `archive_checksum`, `encryption_key_reference`, `provider_recovery_ref`, `impact_summary` or `safe_metadata`.

- [ ] **Step 2: Write failing RPC adapter tests**

Assert these exact calls:

```ts
rpc('read_applied_schema_version')
```

```ts
rpc('record_health_snapshot', {
  p_source: input.source,
  p_observed_at: input.observedAt,
  p_metrics: input.metrics,
  p_safe_metadata: input.safeMetadata,
})
```

```ts
rpc('record_deployment_health_state', {
  p_environment: state.environment,
  p_deployed_commit: state.deployedCommit ?? null,
  p_release_id: state.releaseId ?? null,
  p_expected_schema_version: state.expectedSchemaVersion,
  p_applied_schema_version: state.appliedSchemaVersion ?? null,
  p_status: state.status,
  p_observed_at: state.observedAt,
})
```

For each RPC/query error, assert the adapter throws a generic constant message and does not include a fake secret/provider error body.

- [ ] **Step 3: Implement `createHealthSupabaseRuntime`**

Import `createClient` from `@supabase/supabase-js`; permit `createClientImpl` injection only for tests. Create exactly one client. Use the exact column-limited queries and RPC mappings above. Normalize no provider error details into returned values.

Use generic error messages:

```text
Health runtime backup metadata read failed.
Health runtime schema version read failed.
Health runtime snapshot persistence failed.
Health runtime deployment persistence failed.
```

- [ ] **Step 4: Run focused tests and static grep**

```bash
npx vitest run tests/health/production-runtime.test.ts
rg -n "backup_artifacts|storage_reference|archive_checksum|encryption_key_reference|provider_recovery_ref|impact_summary|supabase_migrations" scripts/operations/lib/health-supabase-runtime.mjs
```

Expected: tests PASS for this module; `rg` returns no matches.

- [ ] **Step 5: Commit the Supabase adapter**

```bash
git add scripts/operations/lib/health-supabase-runtime.mjs scripts/operations/lib/health-supabase-runtime.d.mts tests/health/production-runtime.test.ts
git commit -m "feat(WASDOK-85): add RPC-only health Supabase runtime"
```

---

### Task 5: Compose the five-source production runtime

**Files:**
- Create: `scripts/operations/runtime/health-production-runtime.mjs`
- Create: `scripts/operations/runtime/health-production-runtime.d.mts`
- Modify: `tests/health/production-runtime.test.ts`

**Interfaces:**
- Consumes: `getHealthRuntimeConfiguration`, `createHealthSupabaseRuntime`, `ApplicationHealthProvider`, `SupabaseMetricsProvider`, `BackupHealthProvider`, `SchemaDriftProvider`, `AggregateSecurityHealthProvider`.
- Produces: exported `createHealthCollectorRuntime()` returning the exact dependency object consumed by `health-collector.mjs`.

- [ ] **Step 1: Expand the RED composition test**

With dependency injection for `env`, `fetchImpl`, `createClientImpl` and `now`, assert the runtime returns source IDs in this exact stable order:

```ts
[
  'application',
  'supabase-management-metrics',
  'backup',
  'deployment',
  'security',
]
```

Assert `recordSnapshot` and `recordDeploymentState` are functions, `providerTimeoutMs` is `10_000`, and security is constructed without a source.

- [ ] **Step 2: Implement the production composition module**

Use this construction policy:

```js
export function createHealthCollectorRuntime({
  env = process.env,
  fetchImpl = fetch,
  createClientImpl,
  now = () => new Date(),
} = {})
```

Production calls it with no arguments; injection exists only to make secrets/network/database behavior deterministic in tests.

Build configuration first. Then build the single Supabase runtime. Compose:

```text
application -> ApplicationHealthProvider
supabase-management-metrics -> SupabaseMetricsProvider
backup -> BackupHealthProvider
 deployment -> SchemaDriftProvider
security -> AggregateSecurityHealthProvider with no source
```

Set `environment: 'production'` only from normalized config. Pass optional commit/release only from normalized config. Do not read any other environment variable.

- [ ] **Step 3: Assert the canonical schema and UNKNOWN security behavior through the composed runtime**

Use fake RPC/data sources to verify deployment provider returns `deployment.schema_drift=0` when the schema RPC returns `20260903002400`, and the security provider returns `UNKNOWN/PROVIDER_UNAVAILABLE` with zero metrics.

- [ ] **Step 4: Run production-runtime and collector tests**

```bash
npx vitest run tests/health/production-runtime.test.ts tests/health/collector.test.ts tests/health/provider-contracts.test.ts tests/health/integrations.test.ts
```

Expected: all PASS. The original Task 1 missing-module test now turns GREEN.

- [ ] **Step 5: Commit production composition**

```bash
git add scripts/operations/runtime tests/health/production-runtime.test.ts
git commit -m "feat(WASDOK-85): compose production health collector runtime"
```

---

### Task 6: Add local Supabase runtime-adapter E2E

**Files:**
- Create: `tests/health/runtime-adapter-e2e.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: local Supabase `API_URL`/`SERVICE_ROLE_KEY`, canonical migration chain through `02400`, production runtime factory with fictional health token/app URL and fake HTTP responses.
- Produces: proof that the real service-role RPC boundary accepts a mixed AVAILABLE/UNKNOWN collector run and persists canonical deployment state.

- [ ] **Step 1: Write the gated E2E test**

Gate the test with:

```ts
const enabled = process.env.WASDOK85_RUNTIME_E2E === 'true';
const describeRuntime = enabled ? describe : describe.skip;
```

Construct the runtime using local `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, fictional:

```text
OCPNG_SUPABASE_PROJECT_REF=abcdefghijklmnopqrst
OCPNG_SUPABASE_HEALTH_TOKEN=sbp_DEMO_HEALTH_TOKEN_1234567890
OCPNG_PUBLIC_APP_URL=https://wasdok-runtime-e2e.example.invalid
```

Inject a fake `fetchImpl` that returns:

- `/api/health` -> 200 `{ "status": "ok" }`;
- Management metrics endpoint -> only `pg_database_size_mb 12.5` and `pg_stat_database_num_backends 7`.

Run the existing `runHealthCollector(runtime)` inputs without any production network request.

- [ ] **Step 2: Assert persisted runtime evidence**

Using a separate local service client only for test verification, assert:

- source snapshots exist for `application`, `supabase-management-metrics`, `backup`, `deployment`, `security`;
- application snapshot contains only availability/latency metrics;
- Management snapshot contains only database bytes/active connections;
- empty backup/security provider states are `UNKNOWN`, not fake zero samples;
- `deployment.schema_drift` sample is `0`;
- `deployment_health_state.expected_schema_version = '20260903002400'`;
- `deployment_health_state.applied_schema_version = '20260903002400'`;
- deployment status is `HEALTHY`;
- no thresholds are created;
- no alert is created solely by this run when thresholds remain empty.

- [ ] **Step 3: Run the E2E against local Supabase**

```bash
eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export WASDOK85_RUNTIME_E2E="true"
npx vitest run tests/health/runtime-adapter-e2e.test.ts
```

Expected: PASS. No external Management API or production app request occurs because fetch is injected.

- [ ] **Step 4: Add the E2E to the existing WASDOK-85 CI step**

In `.github/workflows/ci.yml`, after exporting the existing local Supabase variables, add:

```bash
export WASDOK85_RUNTIME_E2E="true"
npx vitest run tests/health/e2e.test.ts tests/health/runtime-adapter-e2e.test.ts
```

Do not add any GitHub secret requirement for a production health token.

- [ ] **Step 5: Commit E2E coverage**

```bash
git add tests/health/runtime-adapter-e2e.test.ts .github/workflows/ci.yml
git commit -m "test(WASDOK-85): cover production runtime with local Supabase"
```

---

### Task 7: Extend static security and deployment documentation

**Files:**
- Modify: `scripts/static-security.mjs`
- Modify: `.env.example`
- Modify: `docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md`
- Test: `tests/health/security-boundary.test.ts` if needed for a focused source-level invariant.

**Interfaces:**
- Produces: automated prevention of secret/browser leakage, direct health writes, raw ledger access and forbidden backup-field access; deployment documentation for the reviewed adapter path only.

- [ ] **Step 1: Add blank environment variable names**

Append only blank placeholders:

```text
OCPNG_SUPABASE_PROJECT_REF=
OCPNG_SUPABASE_HEALTH_TOKEN=
OCPNG_PUBLIC_APP_URL=
OCPNG_DEPLOYED_COMMIT=
OCPNG_RELEASE_ID=
OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE=
```

Keep `SUPABASE_SERVICE_ROLE_KEY=` blank. Do not add fictional-looking token values to `.env.example`.

- [ ] **Step 2: Extend `static-security.mjs` with runtime-specific scans**

Build a `healthRuntimeFiles` collection from `scripts/operations/` and assert:

- no JWT-like literal or nonblank `sbp_`/`sb_secret_` assignment exists;
- browser health surfaces do not contain `OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE` or any service/health secret;
- `health-production-runtime.mjs` and `health-supabase-runtime.mjs` do not contain `.from('system_health_` or `.from("system_health_`;
- runtime files do not contain `supabase_migrations.schema_migrations`;
- `health-supabase-runtime.mjs` does not contain forbidden backup artifact/reference field names;
- application provider does not call/read a response body on the non-2xx branch; enforce this primarily with the behavioral unit test rather than a brittle source regex.

The allowed RPC names are exactly:

```text
record_health_snapshot
record_deployment_health_state
read_applied_schema_version
```

- [ ] **Step 3: Update the deployment runbook without activating anything**

Document the reviewed production adapter value as:

```text
scripts/operations/runtime/health-production-runtime.mjs
```

Document that the hosting/worker platform must resolve `OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE` to this deployed file (prefer an absolute path or `file:` URL as supported by the existing CLI loader).

Keep these gates explicit and separate:

1. configure secret store/runtime variables;
2. validate configuration without running collector;
3. user approval for one `--once` run;
4. inspect persisted snapshots/deployment state;
5. user approval for scheduler;
6. separate threshold administration.

- [ ] **Step 4: Run static and focused security verification**

```bash
npm run verify:static
npx vitest run tests/health/security-boundary.test.ts tests/health/production-runtime.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commit security/docs changes**

```bash
git add scripts/static-security.mjs .env.example docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md tests/health/security-boundary.test.ts
git commit -m "docs(WASDOK-85): secure production runtime deployment boundary"
```

If `tests/health/security-boundary.test.ts` did not require a change, omit it from `git add` rather than editing it only to create churn.

---

### Task 8: Full regression, exact-head CI and PR merge preparation

**Files:**
- No new feature scope. Fix only defects demonstrated by the approved tests/CI and remain within the specification.

**Interfaces:**
- Produces: a draft PR against `feat/wasdok360-release1`, exact reviewed head SHA, full GREEN CI evidence and a separate merge approval gate.

- [ ] **Step 1: Run the complete local verification sequence**

```bash
npm run test:run
npm run test:auth-security
supabase start
supabase db reset
npm run test:rls

eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"

export WASDOK55_BACKUP_E2E="true"
npx vitest run tests/backups/e2e.test.ts

export WASDOK85_HEALTH_E2E="true"
export WASDOK85_RUNTIME_E2E="true"
npx vitest run tests/health/e2e.test.ts tests/health/runtime-adapter-e2e.test.ts

supabase db reset
export OCPNG_COMPLAINT_SUBMISSION_ENABLED="true"
export WASDOK67_COMPLAINT_E2E="true"
npx vitest run tests/complaints/intake-e2e.test.ts

export WASDOK78_ACCESS_E2E="true"
npx vitest run tests/access-control/e2e.test.ts
supabase db reset
npx vitest run tests/access-control/task10-concurrency-e2e.test.ts

npm run typecheck:domain
npm run test:domain
npm run test:schema
npm run test:routes
npm run verify:static
npm run typecheck
npm run lint
npm run test:auth-build
```

Expected: every command PASS.

- [ ] **Step 2: Inspect the full branch diff against the release base**

Review specifically for:

- service-role or Management API token leakage;
- any hardcoded token/value;
- browser import path reaching operations runtime;
- direct writes to health tables;
- direct reads from raw migration history;
- new Supabase metric mappings beyond the two approved;
- security metrics being generated rather than UNKNOWN;
- application response body/error body persistence;
- backup artifact/reference/metadata access;
- any new migration, permission or RLS change;
- changes unrelated to WASDOK-85 runtime adapter.

If any appear, correct them before PR creation.

- [ ] **Step 3: Create a draft PR**

Title:

```text
WASDOK-85: production health collector runtime adapter
```

Base:

```text
feat/wasdok360-release1
```

Body must state:

- design/spec path and approved scope;
- RED test commit/run evidence;
- runtime module path;
- five fixed source identities;
- RPC-only persistence boundary;
- canonical schema version `20260903002400`;
- security source intentionally UNKNOWN;
- no new migration;
- no production credentials, scrape, `--once`, thresholds or scheduler action;
- test/CI evidence.

Keep the PR draft until the implementation review is complete.

- [ ] **Step 4: Wait for and verify exact-head CI**

The CI run must be for the PR's current head SHA and must pass every existing release gate plus `runtime-adapter-e2e.test.ts`. If any corrective commit changes the head SHA, discard earlier green evidence and require a new exact-head successful run.

- [ ] **Step 5: Record merge-gate evidence in Jira**

Add a WASDOK-85 comment containing:

- branch name;
- PR number;
- exact reviewed head SHA;
- RED evidence commit/run;
- final CI run ID and conclusion;
- all changed files;
- confirmation that there is no migration/privilege change;
- confirmation that production credentials/collector/scheduler remain untouched.

- [ ] **Step 6: Stop at the explicit merge approval gate**

Do not mark ready and do not merge until the user replies exactly:

```text
Approve WASDOK-85 production runtime adapter PR merge.
```

After a separately approved merge, require exact merge-SHA CI before returning to the production credential/configuration gate. A merge is not authorization to configure secrets or execute `--once`.
