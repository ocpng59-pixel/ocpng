# WASDOK-85 Production Collector Runtime Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production Node ESM runtime adapter required by the existing WASDOK-85 collector so approved operational providers can run with server-only credentials and persist only through the existing service-role RPC boundary.

**Architecture:** Keep `scripts/operations/health-collector.mjs` as the single CLI and `scripts/operations/lib/health-collector-runner.mjs` as the single orchestration engine. Extract existing provider behavior into runtime-safe `.mjs` modules with `.d.mts` declarations, keep the existing TypeScript import paths as thin wrappers, and compose those providers in `scripts/operations/runtime/health-production-runtime.mjs`. The runtime owns one Supabase service client, column-limited WASDOK-55 reads, canonical schema-version RPC access, and RPC-only health persistence.

**Tech Stack:** Node.js 22 ESM, TypeScript 6, Vitest 4, `@supabase/supabase-js` 2.112.4, Next.js 16, Supabase/Postgres RPCs, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-03-wasdok-85-production-collector-runtime-adapter-design.md`

## Global Constraints

- Canonical application schema version is exactly `20260903002400`.
- Existing collector metric allowlist remains exactly the current 18-code catalogue.
- Supabase Management metrics may emit only `db.database_bytes` and `db.connections_active` in this task.
- The `security` source remains explicit `UNKNOWN` with `PROVIDER_UNAVAILABLE`; this task does not implement a security aggregate source.
- Application probing may emit only `app.availability` and `app.response_latency_ms`; it must not synthesize `app.http_error_rate`.
- Health persistence uses only `record_health_snapshot` and `record_deployment_health_state`; no direct health-table writes.
- Schema drift uses only `read_applied_schema_version()`; runtime code never reads `supabase_migrations.schema_migrations`.
- WASDOK-55 reads are limited to `backup_verifications.verified_at` for `PASSED` rows and `restore_runs.completed_at` for completed `TEST` runs.
- No backup artifact/reference/checksum/key/metadata field may be queried by the health runtime.
- Production runtime configuration remains server-only. No `NEXT_PUBLIC_*` secret may be introduced.
- No real credential, provider body, auth header, Supabase error payload, Storage identifier, complaint/case/evidence content, or environment dump may be logged or persisted.
- Provider failures remain isolated and normalize to existing approved UNKNOWN reasons; persistence failures fail the collector process.
- No database migration or privilege grant is authorized. If one becomes necessary, stop and return to design review.
- No production credential configuration, production `--once` run, threshold mutation, scheduler enablement, or WASDOK-85 closure is authorized by implementation.
- Preserve `AGENTS.md` and all existing WASDOK-55/62/67/78/85 regression gates.

---

## File Structure

### New runtime files

- `scripts/operations/lib/health-runtime-config.mjs` — validates the complete worker-only environment.
- `scripts/operations/lib/health-runtime-config.d.mts` — declarations for runtime configuration.
- `scripts/operations/lib/providers/supabase-metrics.mjs` and `.d.mts` — shared strict Supabase metrics provider.
- `scripts/operations/lib/providers/backup-health.mjs` and `.d.mts` — shared WASDOK-55 age provider.
- `scripts/operations/lib/providers/schema-drift.mjs` and `.d.mts` — shared canonical schema-drift provider.
- `scripts/operations/lib/providers/security-health.mjs` and `.d.mts` — shared aggregate-security normalization; production supplies no source.
- `scripts/operations/lib/providers/application-health.mjs` and `.d.mts` — public-safe application liveness provider.
- `scripts/operations/lib/health-supabase-runtime.mjs` and `.d.mts` — one service client, exact backup reads, canonical schema RPC, persistence RPCs.
- `scripts/operations/runtime/health-production-runtime.mjs` and `.d.mts` — exports `createHealthCollectorRuntime()` and composes the five fixed source identities.

### Existing files to modify

- `lib/operations/health/providers/supabase-metrics.ts`
- `lib/operations/health/providers/backup-health.ts`
- `lib/operations/health/providers/schema-drift.ts`
- `lib/operations/health/providers/security-health.ts`
- `.env.example`
- `scripts/static-security.mjs`
- `.github/workflows/ci.yml`
- `docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md`

### Tests

- Create `tests/health/production-runtime.test.ts`.
- Create `tests/health/runtime-adapter-e2e.test.ts`.
- Modify `tests/health/provider-contracts.test.ts`.
- Modify `tests/health/integrations.test.ts`.
- Modify `tests/health/security-boundary.test.ts`.

---

### Task 1: Capture RED evidence for the missing runtime

**Files:**
- Create: `tests/health/production-runtime.test.ts`

**Interfaces:**
- Consumes: existing CLI requirement for an exported `createHealthCollectorRuntime()` factory.
- Produces: recorded RED evidence before implementation begins.

- [ ] **Step 1: Write the failing existence test**

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

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/health/production-runtime.test.ts
```

Expected: FAIL because `scripts/operations/runtime/health-production-runtime.mjs` does not exist.

- [ ] **Step 3: Commit and record RED evidence**

```bash
git add tests/health/production-runtime.test.ts
git commit -m "test(WASDOK-85): define production runtime adapter RED contract"
```

Record the commit SHA and failing assertion in Jira WASDOK-85. If CI runs, retain the failing run ID as the formal RED artifact.

---

### Task 2: Extract the four existing providers into shared runtime-safe modules

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
- Consumes: current class names and behavior.
- Produces: runtime `.mjs` implementations with TypeScript declarations while keeping existing TypeScript import paths stable.

- [ ] **Step 1: Add RED direct-runtime imports**

Add direct imports from the proposed `.mjs` paths to the provider tests and assert parity with current behavior. The Supabase parser fixture is:

```text
pg_database_size_mb 12.5
pg_stat_database_num_backends 7
unexpected_sensitive_metric{object_name="RESTRICTED-case-file.pdf"} 999
```

Expected parsed result:

```ts
[
  { code: 'db.database_bytes', value: 12.5 * 1024 * 1024 },
  { code: 'db.connections_active', value: 7 },
]
```

Expected before extraction: FAIL because the runtime modules do not exist.

- [ ] **Step 2: Move Supabase metrics behavior exactly**

Create the shared module by moving the existing implementation. Keep:

```js
const MANAGEMENT_API_ROOT = 'https://api.supabase.com/v1/projects';
const DEFAULT_TIMEOUT_MS = 10_000;
const MB = 1024 * 1024;
```

The parser recognizes only `pg_database_size_mb` and `pg_stat_database_num_backends`.

Declare in `.d.mts`:

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

Replace the TypeScript file with:

```ts
import 'server-only';
export {
  SupabaseMetricsProvider,
  parseSupabasePrometheusMetrics,
} from '../../../../scripts/operations/lib/providers/supabase-metrics.mjs';
```

- [ ] **Step 3: Move backup provider behavior exactly**

Move the current implementation and declare `BackupHealthDataSource` plus `BackupHealthProvider`. Replace the TypeScript file with:

```ts
export {
  BackupHealthProvider,
  type BackupHealthDataSource,
} from '../../../../scripts/operations/lib/providers/backup-health.mjs';
```

Preserve missing-both -> `UNKNOWN/PROVIDER_UNAVAILABLE`, malformed/future -> `UNKNOWN/PROVIDER_ERROR`, and one-valid-timestamp -> one metric.

- [ ] **Step 4: Move schema-drift behavior exactly**

Keep:

```js
export const EXPECTED_SCHEMA_VERSION = '20260903002400';
```

Declare and re-export `SchemaDriftProvider` and `DeploymentHealthState`. No runtime migration-ledger query is added.

- [ ] **Step 5: Move security provider behavior exactly**

Move `AggregateSecurityHealthProvider` and declare its optional source types. Preserve no-source -> `UNKNOWN/PROVIDER_UNAVAILABLE`.

- [ ] **Step 6: Verify provider parity**

```bash
npx vitest run tests/health/provider-contracts.test.ts tests/health/integrations.test.ts
npm run typecheck
```

Expected: PASS. The retained Task 1 RED test is not part of this command.

- [ ] **Step 7: Commit**

```bash
git add scripts/operations/lib/providers lib/operations/health/providers tests/health/provider-contracts.test.ts tests/health/integrations.test.ts
git commit -m "refactor(WASDOK-85): share health providers with production runtime"
```

---

### Task 3: Implement fail-closed runtime configuration and application probe

**Files:**
- Create: `scripts/operations/lib/health-runtime-config.mjs`
- Create: `scripts/operations/lib/health-runtime-config.d.mts`
- Create: `scripts/operations/lib/providers/application-health.mjs`
- Create: `scripts/operations/lib/providers/application-health.d.mts`
- Modify: `tests/health/production-runtime.test.ts`

**Interfaces:**
- Produces `getHealthRuntimeConfiguration(source?)` returning:

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

- Produces `ApplicationHealthProvider` with `collect(): Promise<HealthProviderSnapshot>`.

- [ ] **Step 1: Write RED configuration tests**

Use fictional values:

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

Assert complete configuration is accepted and every missing/invalid required value throws exactly `System health runtime configuration is unavailable.` without echoing the supplied value.

- [ ] **Step 2: Implement configuration validation**

Validate:

- Supabase URL: HTTPS, hostname present, no username/password.
- Service credential: `sb_secret_` prefix or legacy JWT whose decoded payload role is `service_role`.
- Project ref: `/^[a-z0-9]{20}$/`.
- Health token: 24–512 chars and `/^[A-Za-z0-9._~-]+$/`.
- Public app URL: HTTPS, hostname present, no username/password.
- Optional deployed commit: `/^[A-Fa-f0-9]{7,64}$/`.
- Optional release ID: `/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/`.

Return `environment: 'production'` as a constant. Do not include source values in exceptions.

- [ ] **Step 3: Write RED application-probe tests**

Cover:

1. 200 plus `{status:'ok'}` -> availability `1` plus non-negative latency.
2. 503 -> availability `0` plus latency; a body containing `SECRET_RESPONSE_BODY` is never read and never appears in the result.
3. network/abort failure -> `UNKNOWN/PROVIDER_UNAVAILABLE`.
4. malformed 2xx contract -> `UNKNOWN/PROVIDER_ERROR`.
5. no output metric named `app.http_error_rate`.
6. URL is exactly `<base>/api/health` and request has an `AbortSignal`.

- [ ] **Step 4: Implement `ApplicationHealthProvider`**

Use internal timeout `8_000` ms. Parse JSON only for 2xx to check `payload?.status === 'ok'`. For non-2xx, never call body-reading methods. Catch network/abort as `PROVIDER_UNAVAILABLE`; malformed 2xx as `PROVIDER_ERROR`.

- [ ] **Step 5: Run only new config/application tests by name**

```bash
npx vitest run tests/health/production-runtime.test.ts -t "configuration|application"
```

Expected: PASS. The retained existence RED remains intentionally outside this filtered command until Task 5.

- [ ] **Step 6: Commit**

```bash
git add scripts/operations/lib/health-runtime-config.mjs scripts/operations/lib/health-runtime-config.d.mts scripts/operations/lib/providers/application-health.mjs scripts/operations/lib/providers/application-health.d.mts tests/health/production-runtime.test.ts
git commit -m "feat(WASDOK-85): add runtime config and application probe"
```

---

### Task 4: Implement one-client Supabase reads and RPC persistence

**Files:**
- Create: `scripts/operations/lib/health-supabase-runtime.mjs`
- Create: `scripts/operations/lib/health-supabase-runtime.d.mts`
- Modify: `tests/health/production-runtime.test.ts`

**Interfaces:**
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

- [ ] **Step 1: Write RED client/query tests**

With an injected fake `createClientImpl`, assert it is called exactly once with:

```ts
{
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
}
```

Assert backup verification uses only `backup_verifications`, selects only `verified_at`, filters `status = PASSED`, filters non-null, orders descending, limit 1.

Assert restore rehearsal uses only `restore_runs`, selects only `completed_at`, filters `restore_type = TEST`, `status = COMPLETED`, filters non-null, orders descending, limit 1.

- [ ] **Step 2: Write RED RPC tests**

Assert exact calls:

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

- [ ] **Step 3: Implement `createHealthSupabaseRuntime`**

Import `createClient` from `@supabase/supabase-js`, allow test injection, and create exactly one client. On errors throw only:

```text
Health runtime backup metadata read failed.
Health runtime schema version read failed.
Health runtime snapshot persistence failed.
Health runtime deployment persistence failed.
```

Do not stringify Supabase error objects.

- [ ] **Step 4: Verify focused tests and forbidden-string absence**

```bash
npx vitest run tests/health/production-runtime.test.ts -t "Supabase runtime|RPC|backup metadata"
rg -n "backup_artifacts|storage_reference|archive_checksum|encryption_key_reference|provider_recovery_ref|impact_summary|safe_metadata|supabase_migrations" scripts/operations/lib/health-supabase-runtime.mjs
```

Expected: test filter PASS; `rg` returns no matches except `p_safe_metadata` is permitted only in the RPC argument mapping. If the grep returns that permitted RPC parameter, verify manually that no database `safe_metadata` column is queried.

- [ ] **Step 5: Commit**

```bash
git add scripts/operations/lib/health-supabase-runtime.mjs scripts/operations/lib/health-supabase-runtime.d.mts tests/health/production-runtime.test.ts
git commit -m "feat(WASDOK-85): add RPC-only health Supabase runtime"
```

---

### Task 5: Compose the fixed five-source production runtime

**Files:**
- Create: `scripts/operations/runtime/health-production-runtime.mjs`
- Create: `scripts/operations/runtime/health-production-runtime.d.mts`
- Modify: `tests/health/production-runtime.test.ts`

**Interfaces:**
- Produces `createHealthCollectorRuntime()` returning the dependency object consumed by `health-collector.mjs`.

- [ ] **Step 1: Write RED composition assertions**

With injected `env`, `fetchImpl`, `createClientImpl`, and `now`, expect source IDs in this exact order:

```ts
[
  'application',
  'supabase-management-metrics',
  'backup',
  'deployment',
  'security',
]
```

Assert `recordSnapshot` and `recordDeploymentState` are functions and `providerTimeoutMs === 10_000`.

- [ ] **Step 2: Implement the factory**

Use:

```js
export function createHealthCollectorRuntime({
  env = process.env,
  fetchImpl = fetch,
  createClientImpl,
  now = () => new Date(),
} = {})
```

Build configuration first, then one Supabase runtime, then compose:

```text
application -> ApplicationHealthProvider
supabase-management-metrics -> SupabaseMetricsProvider
backup -> BackupHealthProvider
deployment -> SchemaDriftProvider
security -> AggregateSecurityHealthProvider with no source
```

Pass `environment: 'production'`, optional normalized commit/release IDs, and no other environment values.

- [ ] **Step 3: Verify canonical drift and UNKNOWN security through composition**

Fake `read_applied_schema_version()` as `20260903002400`; assert `deployment.schema_drift=0`. Assert `security` returns `UNKNOWN/PROVIDER_UNAVAILABLE` with no metrics.

- [ ] **Step 4: Run all runtime/provider/collector tests**

```bash
npx vitest run tests/health/production-runtime.test.ts tests/health/collector.test.ts tests/health/provider-contracts.test.ts tests/health/integrations.test.ts
npm run typecheck
```

Expected: PASS, including the original Task 1 existence test.

- [ ] **Step 5: Commit**

```bash
git add scripts/operations/runtime tests/health/production-runtime.test.ts
git commit -m "feat(WASDOK-85): compose production health collector runtime"
```

---

### Task 6: Add local Supabase runtime E2E and CI gate

**Files:**
- Create: `tests/health/runtime-adapter-e2e.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: local Supabase service credentials, fake HTTP responses, canonical migration chain through `02400`.
- Produces: evidence of mixed AVAILABLE/UNKNOWN persistence through real service-role RPCs.

- [ ] **Step 1: Write the gated E2E**

Use:

```ts
const enabled = process.env.WASDOK85_RUNTIME_E2E === 'true';
const describeRuntime = enabled ? describe : describe.skip;
```

Build runtime with local `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` and fictional:

```text
OCPNG_SUPABASE_PROJECT_REF=abcdefghijklmnopqrst
OCPNG_SUPABASE_HEALTH_TOKEN=sbp_DEMO_HEALTH_TOKEN_1234567890
OCPNG_PUBLIC_APP_URL=https://wasdok-runtime-e2e.example.invalid
```

Inject fake fetch responses:

- `/api/health` -> 200 `{ "status": "ok" }`.
- Management endpoint -> `pg_database_size_mb 12.5` and `pg_stat_database_num_backends 7`.

Execute:

```ts
const runtime = createHealthCollectorRuntime({ env, fetchImpl, now: () => NOW });
const result = await runHealthCollector({
  providers: runtime.providers,
  recordSnapshot: runtime.recordSnapshot,
  recordDeploymentState: runtime.recordDeploymentState,
  now: runtime.now,
  providerTimeoutMs: runtime.providerTimeoutMs,
});
```

- [ ] **Step 2: Assert persisted evidence**

Using a separate local service client for verification only, assert:

- snapshots for `application`, `supabase-management-metrics`, `backup`, `deployment`, `security`;
- application has only availability/latency;
- Management metrics contain only database bytes/active connections;
- backup/security empty-source states are UNKNOWN, with no fake zero sample;
- `deployment.schema_drift = 0`;
- deployment expected/applied versions both equal `20260903002400` and status is `HEALTHY`;
- thresholds remain zero;
- alerts remain zero when thresholds are empty.

- [ ] **Step 3: Run local E2E**

```bash
eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export WASDOK85_RUNTIME_E2E="true"
npx vitest run tests/health/runtime-adapter-e2e.test.ts
```

Expected: PASS with no production network call because `fetchImpl` is injected.

- [ ] **Step 4: Add it to the existing WASDOK-85 CI step**

Use:

```bash
export WASDOK85_HEALTH_E2E="true"
export WASDOK85_RUNTIME_E2E="true"
npx vitest run tests/health/e2e.test.ts tests/health/runtime-adapter-e2e.test.ts
```

No production health token is added as a GitHub secret.

- [ ] **Step 5: Commit**

```bash
git add tests/health/runtime-adapter-e2e.test.ts .github/workflows/ci.yml
git commit -m "test(WASDOK-85): cover production runtime with local Supabase"
```

---

### Task 7: Enforce the runtime security boundary and document deployment

**Files:**
- Modify: `scripts/static-security.mjs`
- Modify: `tests/health/security-boundary.test.ts`
- Modify: `.env.example`
- Modify: `docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md`

**Interfaces:**
- Produces: executable static/behavioral security checks plus the non-activating deployment configuration instructions.

- [ ] **Step 1: Add blank environment names**

Append:

```text
OCPNG_SUPABASE_PROJECT_REF=
OCPNG_SUPABASE_HEALTH_TOKEN=
OCPNG_PUBLIC_APP_URL=
OCPNG_DEPLOYED_COMMIT=
OCPNG_RELEASE_ID=
OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE=
```

Keep `SUPABASE_SERVICE_ROLE_KEY=` blank.

- [ ] **Step 2: Extend `tests/health/security-boundary.test.ts`**

Add a source-level test that recursively reads `components/operations/health/` and `app/dashboard/operations/system-health/` and asserts no file imports or references:

```text
scripts/operations/
OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE
OCPNG_SUPABASE_HEALTH_TOKEN
SUPABASE_SERVICE_ROLE_KEY
```

This makes the browser/import-graph boundary explicit in Vitest.

- [ ] **Step 3: Extend `scripts/static-security.mjs`**

Build a `healthRuntimeFiles` set from `scripts/operations/`. Assert:

- no JWT-like credential literal;
- no nonblank `sbp_` or `sb_secret_` credential assignment;
- no `.from('system_health_` or `.from("system_health_` in the production/Supabase runtime modules;
- no `supabase_migrations.schema_migrations` in runtime files;
- no backup artifact/reference fields in `health-supabase-runtime.mjs`;
- only these health RPC names are present in the Supabase runtime: `record_health_snapshot`, `record_deployment_health_state`, `read_applied_schema_version`.

Behavioral tests, not source regexes, remain authoritative for proving that the application provider does not read a non-2xx response body.

- [ ] **Step 4: Update the deployment runbook**

Document the reviewed module:

```text
scripts/operations/runtime/health-production-runtime.mjs
```

Document that `OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE` resolves to that deployed file, using an absolute path or `file:` URL supported by the existing CLI loader.

Keep this sequence explicit:

1. configure worker secret store/runtime variables;
2. validate configuration without running collector;
3. obtain explicit approval for one `--once` run;
4. inspect persisted snapshots/deployment state;
5. obtain explicit approval for scheduler;
6. manage thresholds only through separate authorized administration.

- [ ] **Step 5: Verify static/security gates**

```bash
npm run verify:static
npx vitest run tests/health/security-boundary.test.ts tests/health/production-runtime.test.ts
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/static-security.mjs tests/health/security-boundary.test.ts .env.example docs/deployment/WASDOK-85-SYSTEM-HEALTH-DEPLOYMENT.md
git commit -m "docs(WASDOK-85): secure production runtime deployment boundary"
```

---

### Task 8: Full regression, PR preparation and exact-head merge gate

**Files:**
- No feature scope beyond defects demonstrated by the approved tests/CI.

**Interfaces:**
- Produces: draft PR against `feat/wasdok360-release1`, exact reviewed head SHA, full GREEN CI evidence, separate merge approval.

- [ ] **Step 1: Run complete local verification**

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

- [ ] **Step 2: Review the complete branch diff**

Reject/correct any diff containing:

- real service-role or Management API token material;
- browser import path to operations runtime;
- direct writes to health tables;
- raw migration-history reads;
- new Supabase metric mappings;
- generated security metrics instead of UNKNOWN;
- application/provider response-body persistence;
- backup artifact/reference/metadata access;
- new migration, permission or RLS change;
- unrelated WASDOK scope.

- [ ] **Step 3: Create a draft PR**

Title:

```text
WASDOK-85: production health collector runtime adapter
```

Base: `feat/wasdok360-release1`.

Body records design/spec path, RED evidence, runtime path, five sources, RPC-only persistence, canonical `20260903002400`, security UNKNOWN boundary, no migration, no production credentials/scrape/`--once`/threshold/scheduler action, and local verification evidence.

- [ ] **Step 4: Verify exact-head CI**

Require the CI run to match the current PR head SHA and pass every existing release gate plus `runtime-adapter-e2e.test.ts`. Any corrective commit invalidates earlier green evidence and requires a new exact-head run.

- [ ] **Step 5: Record Jira merge-gate evidence**

Record branch, PR number, reviewed head SHA, RED commit/run, final CI run ID/conclusion, changed files, no migration/privilege change, and confirmation that production credentials/collector/scheduler remain untouched.

- [ ] **Step 6: Stop for explicit merge approval**

Do not mark ready or merge until the user replies exactly:

```text
Approve WASDOK-85 production runtime adapter PR merge.
```

After separately approved merge, require exact merge-SHA CI before returning to production credential/configuration. Merge does not authorize secrets or `--once` execution.
