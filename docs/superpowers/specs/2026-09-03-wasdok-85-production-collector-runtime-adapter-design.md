# WASDOK-85 Production Collector Runtime Adapter Design

**Status:** Design approved in chat on 2026-09-03; implementation not yet authorized by this document.

**Issue:** WASDOK-85 — System Health / Capacity & Operational Monitoring Dashboard

**Base release:** `feat/wasdok360-release1` at `c2c34d5acaccb37985d3a5226c89ccb23ff4bd2f`

## 1. Purpose

WASDOK-85 already has a reviewed collector CLI, provider contracts, metric allowlist, health ingestion RPCs, normalized read RPCs, deployment-state persistence, canonical schema-version marker and production deployment runbook. The remaining gap is the production runtime adapter expected by `scripts/operations/health-collector.mjs`.

The runtime adapter is the trusted composition boundary between:

1. server-only production configuration and credentials;
2. the public-safe WASDOK application liveness endpoint;
3. Supabase Management API aggregate metrics;
4. WASDOK-55 backup/recovery operational metadata;
5. canonical schema-version drift detection;
6. explicit UNKNOWN security-provider state until a separate aggregate-source design is approved; and
7. the service-role-only health persistence RPCs.

The adapter must make these dependencies available to the existing collector without exposing secrets, bypassing the reviewed RPC boundary, inventing unavailable metrics or broadening browser access.

This design does **not** authorize production credentials, the first production `--once` collector run, threshold configuration, scheduler enablement or WASDOK-85 closure. Those remain separate explicit gates.

## 2. Existing constraints that remain authoritative

The implementation must preserve all existing WASDOK-85 controls:

- accepted metric codes remain limited to the 18-code catalogue;
- raw Prometheus responses, Storage object names/paths, case filenames, credentials, tokens, connection strings and provider error bodies must not be persisted or displayed;
- missing, stale, invalid or unavailable signals are `UNKNOWN`, never implicitly healthy;
- provider failures are isolated and normalized to the approved reason codes;
- browser roles do not directly read or mutate health operational tables;
- human reads continue through permission-checked normalized RPCs;
- infrastructure ingestion remains service-role-only;
- deployment state is normalized before persistence;
- canonical schema version is read through `read_applied_schema_version()` and must report `20260903002400` after the hosted `02400` hotfix;
- no production threshold value is silently inferred from observed telemetry;
- no real credential or production personal/protected case content may be committed to the repository.

The repository guardrails in `AGENTS.md` remain binding.

## 3. Chosen architecture

Use a **repository-owned production runtime adapter composed from shared runtime-safe `.mjs` modules**.

The adapter will be an explicit Node ESM module that exports:

```text
createHealthCollectorRuntime()
```

The existing `health-collector.mjs` remains the only CLI entry point. It continues to load the adapter through `OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE`, validates that the factory exists, and passes the returned dependencies to the existing collector runner.

### Why this architecture

The collector itself is plain `.mjs` and CI runs Node 22. Depending on a TypeScript loader or runtime-specific TypeScript behavior would make production execution less deterministic. Duplicating the existing TypeScript provider logic inside a separate worker implementation would create two security and parsing implementations that could drift.

Therefore logic that must be used both by the application/test layer and the production worker will move into or be implemented in small runtime-safe `.mjs` modules with corresponding `.d.mts` declarations where TypeScript imports need type information. Existing TypeScript provider modules may become thin typed wrappers/re-exports around those shared runtime modules.

The change must not introduce a second collector runner.

## 4. Proposed module boundaries

The exact implementation plan may refine filenames, but the intended responsibilities are fixed.

### 4.1 Production composition module

Proposed path:

`scripts/operations/runtime/health-production-runtime.mjs`

Responsibilities:

- validate server-only runtime configuration;
- create exactly one service-role Supabase client for trusted database/RPC access;
- instantiate the approved providers;
- expose `providers`, `recordSnapshot`, `recordDeploymentState`, and optional safe clock/timeout configuration;
- contain no embedded credential value;
- never log environment-variable values, headers, provider bodies or Supabase error payloads.

This module is the intended production value for `OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE` after the separate secret/configuration gate is completed.

### 4.2 Runtime configuration module

Proposed path:

`scripts/operations/lib/health-runtime-config.mjs`

Responsibilities:

- parse and validate only the environment variables required by the trusted worker;
- fail closed with generic errors that do not echo input values;
- validate project reference, HTTPS URLs, service-role key shape and Management API health-token shape;
- normalize optional deployment identifiers;
- expose no browser-facing API.

Required runtime values:

- `NEXT_PUBLIC_SUPABASE_URL` — existing Supabase API URL used server-side by the worker;
- `SUPABASE_SERVICE_ROLE_KEY` — server-only health persistence/read authority;
- `OCPNG_SUPABASE_PROJECT_REF` — the 20-character target project reference;
- `OCPNG_SUPABASE_HEALTH_TOKEN` — separately managed least-privilege Management API credential for the approved project metrics endpoint; it must not carry unrelated write authority where scoped tokens are available;
- `OCPNG_PUBLIC_APP_URL` — canonical HTTPS base URL for the public-safe liveness probe.

The adapter is production-specific, so deployment `environment` is fixed to `production` unless a later reviewed multi-environment runtime design explicitly changes that.

Optional non-secret deployment identifiers:

- `OCPNG_DEPLOYED_COMMIT` — 7–64 hexadecimal characters;
- `OCPNG_RELEASE_ID` — bounded release identifier using the same character policy already enforced by the collector runner.

No new `NEXT_PUBLIC_*` secret is permitted.

### 4.3 Application liveness provider

Proposed path:

`scripts/operations/lib/providers/application-health.mjs`

The provider requests only:

`<OCPNG_PUBLIC_APP_URL>/api/health`

The current public endpoint returns only `{ "status": "ok" }` and must remain free of commit SHA, schema version, environment details or credentials.

Behavior:

- expected 2xx response with the approved minimal contract -> `AVAILABLE` with `app.availability = 1` and measured `app.response_latency_ms`;
- reachable non-2xx response -> `AVAILABLE` with `app.availability = 0` and response latency, without reading or persisting the response body;
- network failure, timeout, invalid URL state or malformed success contract -> `UNKNOWN` with a safe approved provider reason;
- response headers and body are never copied into snapshot metadata;
- `app.http_error_rate` is **not** inferred from one liveness request. It remains unavailable until a separately approved aggregate source exists.

The provider must have an internal abort timeout no longer than the collector's provider timeout so a timed-out runner does not leave an uncontrolled HTTP request running.

### 4.4 Supabase Management metrics provider

The existing `SupabaseMetricsProvider` behavior remains authoritative and should be made runtime-shareable rather than cloned.

It may call only:

`GET /v1/projects/{ref}/analytics/endpoints/metrics`

using `OCPNG_SUPABASE_HEALTH_TOKEN` as a bearer credential.

The parser continues to extract only explicitly allowlisted aggregate series already reviewed by WASDOK-85. Unrecognized series and labels are discarded. No raw provider body is returned from the provider.

This runtime-adapter task supports **only** the mappings already present in the reviewed provider:

- `db.database_bytes`;
- `db.connections_active`.

This task must not add additional Management API metric mappings. Any expansion to database, WAL, Storage, deadlock, connection-limit or other catalogue mappings requires a separate reviewed change rather than opportunistic implementation inside this adapter task.

Authentication, authorization, rate-limit and provider/server failures remain normalized to `UNKNOWN` reason codes without including the response body or token.

### 4.5 WASDOK-55 backup health source

The existing `BackupHealthProvider` behavior remains authoritative and should be runtime-shareable rather than cloned.

The production source may read only the minimum approved columns needed to produce the two backup-age metrics:

- most recent successful backup verification timestamp;
- most recent completed restore-test timestamp.

The service client must use explicitly column-limited queries. It must not select backup artifact rows, Storage references, checksums, encryption key references, provider recovery references, impact summaries or arbitrary `safe_metadata`.

Expected mappings:

- latest `backup_verifications.verified_at` where verification status is `PASSED` -> `backup.last_verified_age_seconds`;
- latest `restore_runs.completed_at` where `restore_type = TEST` and status is `COMPLETED` -> `backup.last_restore_rehearsal_age_seconds`.

If no qualifying timestamp exists, the provider retains existing UNKNOWN semantics rather than inventing an age.

No database migration is required for these reads because the trusted worker already requires the service-role credential for health persistence and schema-version RPC access. The implementation still limits each query to the exact operational timestamp column required.

### 4.6 Schema-drift provider

The existing `SchemaDriftProvider` remains the source of deployment schema-drift semantics and should be runtime-shareable rather than cloned.

The runtime supplies `loadAppliedSchemaVersion()` by calling only the service-role-only RPC:

`read_applied_schema_version()`

The runtime must never query or compare `supabase_migrations.schema_migrations` directly.

The provider compares the result to the canonical expected application version `20260903002400` and produces:

- `deployment.schema_drift = 0` for an exact canonical match;
- `deployment.schema_drift = 1` for a valid mismatch;
- `UNKNOWN` if the RPC fails or returns an invalid value.

The provider's `collectDeploymentState()` remains the source for normalized deployment-state persistence. Environment is `production`; optional deployed commit/release identifiers are included only when present and valid.

### 4.7 Security aggregate provider

The existing `AggregateSecurityHealthProvider` remains the approved normalization layer.

This runtime-adapter implementation will **not derive security metrics from ambiguous row contents**. The current `audit_events` table has no generic success/failure outcome column, and failed-login evidence is intentionally handled outside anonymous application audit insertion. Counting actions by string convention would create a misleading security signal.

Therefore the production runtime in this task will instantiate the security provider **without an aggregate source**. It will record an explicit `UNKNOWN` source snapshot and will not fabricate:

- `security.failed_privileged_ops_24h`;
- `security.failed_logins_24h`;
- `security.advisor_warning_count`.

Adding any Management API/log-derived or database-derived security aggregate is a future separately designed and approved extension.

## 5. Provider list and source identities

The production runtime returns a deterministic provider list with stable source IDs compatible with the runner's validation rules.

Initial sources:

- `application` — public-safe application liveness probe;
- `supabase-management-metrics` — approved Management API metrics scrape;
- `backup` — WASDOK-55 operational timestamp health;
- `deployment` — canonical schema drift and deployment state;
- `security` — explicit UNKNOWN in this task.

A provider may return fewer metric codes than the catalogue contains. Absence is preferable to invented telemetry.

## 6. Persistence adapter

The production adapter creates a service-role Supabase client with session persistence/refresh disabled and supplies only the following persistence functions to the runner.

### 6.1 `recordSnapshot(input)`

Maps runner input to:

`public.record_health_snapshot(p_source, p_observed_at, p_metrics, p_safe_metadata)`

Rules:

- `p_metrics` comes only from the runner's normalized allowlisted metric array;
- UNKNOWN providers may persist an empty array only with the runner-generated approved `provider_status=UNKNOWN` metadata/reason contract supported by the existing RPC;
- no arbitrary provider metadata is added;
- Supabase error details are not returned or logged; persistence failure becomes a generic runtime error.

The adapter must never directly insert/update/delete `system_health_snapshots`, `system_health_metric_samples`, `system_health_alerts` or `system_health_thresholds`.

### 6.2 `recordDeploymentState(state)`

Maps only the normalized runner state into:

`public.record_deployment_health_state(...)`

Permitted fields are limited to:

- environment;
- deployed commit;
- release identifier;
- expected schema version;
- applied schema version;
- status;
- observed timestamp.

The adapter must not attach arbitrary metadata or environment-variable dumps.

### 6.3 Schema-version loader

Calls only `public.read_applied_schema_version()` and returns the scalar canonical version to `SchemaDriftProvider`.

No raw hosted migration-ledger timestamp is exposed as application state.

## 7. Error handling and secret containment

The adapter and shared runtime modules must follow these failure rules:

1. **Configuration errors fail before provider construction.** The error is generic and contains no configuration value.
2. **Provider failures are data, not process crashes, where the existing provider contract supports UNKNOWN.**
3. **Persistence failures are process failures.** A run must not report completion when the database rejected a snapshot or deployment state.
4. **Service-role and Management API errors are sanitized.** The runtime does not stringify provider/client error objects into logs.
5. **No provider body is persisted.** This includes liveness responses, Prometheus payloads, Supabase Management API error bodies and auth/log responses.
6. **No credential reaches safe metadata.** Existing database metadata validation remains a second line of defense.
7. **No direct business-data reads are added.** The only database reads introduced by the adapter are the canonical schema RPC and the exact WASDOK-55 operational timestamps specified above.

The existing `safeOperationalError` handling at the CLI remains the final logging boundary.

## 8. TypeScript/runtime sharing strategy

Where existing provider logic is currently implemented only in `.ts`, implementation should extract the runtime implementation into focused `.mjs` modules and add `.d.mts` declarations where required. The existing `.ts` provider paths remain stable for application/tests by using thin typed wrappers or re-exports.

The objective is one behavior implementation per provider, not parallel TypeScript and JavaScript copies.

The implementation plan must identify each provider that needs extraction and demonstrate that existing imports continue to typecheck.

## 9. Static-security requirements

The existing static-security scan must be extended where necessary to assert that:

- `OCPNG_SUPABASE_HEALTH_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` are not referenced from client components or browser artifacts;
- production runtime modules live only under server/operations paths;
- runtime code does not import from browser-facing components;
- no hardcoded `sbp_`, `sb_secret_` or service-role JWT value is added;
- runtime persistence references the approved RPC names and not direct health-table write calls;
- the production runtime does not read `supabase_migrations.schema_migrations`;
- the application probe does not persist or log response bodies;
- backup health code does not query `backup_artifacts` or Storage object fields.

`.env.example` must be updated with empty-name-only entries for the runtime configuration variables, including `OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE`, without any real key/token or deployment value.

## 10. Test strategy

Implementation is TDD-first.

### 10.1 RED tests before runtime code

Add focused tests proving the production runtime does not yet exist / cannot satisfy the contract. Tests should cover:

- exported `createHealthCollectorRuntime()` factory contract;
- complete required configuration acceptance;
- fail-closed behavior for each missing/invalid secret or URL without echoing values;
- fixed production environment and validated optional deployment identifiers;
- provider composition/source IDs;
- RPC-only persistence boundary;
- absence of direct health-table writes;
- no direct raw migration-ledger query;
- no hardcoded credential material.

The initial CI run must fail for the intended missing-runtime reason before implementation begins.

### 10.2 Unit/provider tests

Application probe tests:

- healthy minimal `/api/health` response -> availability `1` plus non-negative latency;
- reachable non-2xx -> availability `0` without reading/persisting body;
- timeout/network error -> UNKNOWN;
- malformed 2xx contract -> UNKNOWN;
- no `app.http_error_rate` is synthesized.

Management metrics tests preserve all existing token/body-redaction and allowlist cases and assert that this task adds no new metric mappings beyond `db.database_bytes` and `db.connections_active`.

Backup source tests assert only the approved timestamp columns/tables are queried and that no artifact/reference fields are requested.

Schema-drift tests assert the canonical RPC is used and raw migration history is never read.

Security provider tests assert the no-source state is UNKNOWN and emits no invented counts.

Persistence tests use a fake Supabase client or dependency-injected RPC function to assert exact RPC names/arguments and generic failure handling.

### 10.3 Integration/E2E

Use local Supabase only. No production token is used in CI.

The existing WASDOK-85 E2E remains mandatory. Add a runtime-adapter integration case with fake HTTP/Management API dependencies and local service-role credentials to prove:

- a successful provider and an UNKNOWN provider can coexist in one run;
- safe snapshots persist through `record_health_snapshot`;
- deployment state persists through `record_deployment_health_state`;
- canonical schema version is read from `read_applied_schema_version()`;
- no direct browser access is introduced.

Full CI must continue to pass:

- unit test suite;
- WASDOK-62 authentication/security regressions;
- full Supabase reset/migrations including `02400`;
- pgTAP/RLS;
- WASDOK-55 E2E;
- WASDOK-85 E2E plus runtime-adapter tests;
- WASDOK-67 complaint audit E2E;
- WASDOK-78 Access Control E2E and last-admin concurrency;
- domain/schema/route/static checks;
- TypeScript/lint;
- production build/browser credential scan and HTTP authentication boundary.

## 11. Database/migration impact

No new database migration is planned for the runtime adapter.

The existing `02100`–`02400` chain already provides the required health catalogue, ingestion RPC, UNKNOWN-source persistence, deployment-state persistence, direct-access boundary and canonical schema-version RPC.

If implementation discovers that the adapter cannot satisfy an approved data requirement without broad direct table access or a new database function, implementation must stop and return to design review rather than adding an unplanned migration or weakening RLS/RPC controls.

## 12. Deployment/configuration sequence after merge

Completing and merging the adapter still does not activate telemetry.

After merge and exact-merge CI success, the operational sequence remains:

1. connect or establish the approved production worker/secret store;
2. create/provide the least-privilege Supabase Management API health token;
3. configure the required server-only runtime variables;
4. set `OCPNG_HEALTH_COLLECTOR_RUNTIME_MODULE` to the reviewed production adapter;
5. validate configuration without executing the collector;
6. obtain separate explicit approval for one production `--once` run;
7. inspect persisted snapshots and deployment state;
8. only after dry-run acceptance, obtain separate scheduler approval;
9. threshold activation remains a separate authorized administrative action.

## 13. Acceptance criteria for the implementation PR

The implementation PR is merge-ready only when all of the following are true:

- production runtime adapter exists and exports `createHealthCollectorRuntime()`;
- production execution requires no TypeScript runtime loader;
- provider behavior is shared rather than duplicated where existing logic already exists;
- configuration fails closed and never echoes secret values;
- application probe emits only approved deterministic metrics and no response content;
- Supabase metrics remain limited to the two already reviewed Management API mappings in this task;
- backup health reads only the approved WASDOK-55 timestamp fields;
- schema drift uses only the canonical service-role RPC;
- security aggregate metrics remain UNKNOWN rather than fabricated;
- health persistence uses only service-role RPCs;
- no browser/RLS/permission boundary is weakened;
- no real secret is committed;
- RED test evidence is captured before implementation;
- exact-head CI is fully green;
- PR remains unmerged until a separate explicit merge approval.

## 14. Explicit non-goals

This task does not:

- create or reveal the production Management API token;
- configure a production secret store;
- determine the final production public URL;
- execute the production collector;
- enable recurring scheduling;
- create production thresholds;
- add new Management API metric mappings beyond the two already reviewed mappings;
- add new security aggregate sources;
- add new alert delivery channels;
- implement raw logs ingestion;
- infer failed-login or failed-privileged-operation counts from ambiguous audit text;
- expose Storage object names, case/evidence content or protected operational payloads;
- modify Access Control semantics;
- close WASDOK-85.

## 15. Security review focus for the implementation PR

Before merge approval, review the runtime diff specifically for:

- service-role leakage into browser/import graphs;
- Management API token leakage into source, tests, error strings or logs;
- direct health-table writes that bypass RPC validation;
- raw migration-ledger reads that reintroduce false drift;
- application response body retention;
- Prometheus label/body retention;
- accidental backup-artifact/object-reference access;
- provider failures that abort unrelated providers instead of becoming UNKNOWN;
- deployment-state fields outside the normalized allowlist;
- fake metric creation for unavailable sources;
- any new migration or privilege grant not explicitly covered by this design.

This design is the implementation authority for the production collector runtime adapter. Any material expansion requires a new explicit design approval.