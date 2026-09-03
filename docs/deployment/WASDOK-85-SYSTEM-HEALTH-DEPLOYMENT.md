# WASDOK-85 System Health Deployment Runbook

## Status of this runbook

This document is a deployment procedure, **not deployment authorization**. PR #19, corrective hotfix PRs, hosted Supabase migration, production provider credentials, telemetry scraping, collector scheduling, threshold activation and application production deployment remain separate approval gates.

Do not perform any production step merely because this file exists or because CI is green.

## Required preconditions

1. PR #19 has completed exact-head review and has been explicitly approved for merge.
2. Any corrective WASDOK-85 hotfix PR has completed exact-head review and has been explicitly approved for merge before its migration is deployed.
3. The merged release head is known and immutable for the deployment window.
4. A separate explicit approval has been given for hosted Supabase migration deployment.
5. A separate explicit approval has been given before configuring production System Health provider credentials or enabling the scheduler.
6. WASDOK-55 Backup & Recovery is already deployed and its metadata workflows are healthy.
7. The operator has a rollback/change record and the maintenance window owner is identified.

## Required migration order

Apply the WASDOK-85 migrations in this exact order after all previously approved release migrations:

1. `20260903002100_system_health_foundation.sql`
2. `20260903002200_system_health_workflows.sql`
3. `20260903002300_system_health_direct_write_boundary.sql`
4. `20260903002400_system_health_canonical_schema_version.sql`

Never apply a WASDOK-85 migration before its predecessor. The `02400` hotfix establishes the canonical application schema marker used by deployment-drift detection.

Supabase hosted migration APIs may record deployment-time ledger timestamps that differ from repository migration filenames. **Do not compare the raw `supabase_migrations.schema_migrations` maximum timestamp to the application's expected schema version.** After `02400`, verify the service-role-only `read_applied_schema_version()` RPC reports **`20260903002400`** from the private canonical application schema marker before enabling production collection.

If any migration fails, stop. Do not enable the collector and do not attempt ad-hoc migration-history edits or unreviewed SQL fixes outside the reviewed migration chain.

## Production configuration

Configure secrets only in the approved server/worker secret store. Never prefix these values with `NEXT_PUBLIC_` and never place them in browser bundles, GitHub source, screenshots, Jira comments or application logs.

Required server-side values:

- `OCPNG_SUPABASE_PROJECT_REF` — the production Supabase project reference.
- `OCPNG_SUPABASE_HEALTH_TOKEN` — a separately managed, least-privilege Supabase Management API token for the metrics scrape endpoint. Use a scoped token limited to the required project and **`analytics_logs_read`** permission where scoped tokens are available.
- `OCPNG_PUBLIC_APP_URL` — canonical production application base URL used by the public-safe application liveness probe.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to the trusted collector runtime according to the existing server-only Supabase operations pattern; the service-role value must never enter client code.
- Collector runtime/module configuration must reference only the reviewed WASDOK-85 runtime adapter.

The reviewed runtime adapter must expose the collector's `recordSnapshot` persistence callback and, when the deployment provider exposes deployment state, `recordDeploymentState`. `recordDeploymentState` must map only the normalized environment, deployed commit, release identifier, expected/applied schema versions, status and observed time into the service-role-only `record_deployment_health_state` RPC. It must not directly write `deployment_health_state`, pass arbitrary metadata, or attach raw environment variables.

The public liveness endpoint may expose only the approved minimal health response. It must not reveal commit SHA, schema version, environment variables, provider configuration or credentials.

## Pre-enable validation

Before the first production scrape:

1. Confirm the application release is the explicitly approved merged head.
2. Confirm hosted migration history contains the WASDOK-85 `02100`, `02200`, `02300`, and `02400` migrations in order. Hosted ledger timestamps may differ from repository filename versions.
3. Confirm service-role-only `read_applied_schema_version()` returns canonical application version `20260903002400` from `private.application_schema_state`.
4. Confirm `anon` and ordinary `authenticated` sessions cannot execute `read_applied_schema_version()` and have no direct SELECT/INSERT/UPDATE/DELETE access to health operational tables.
5. Confirm `system.health.view` users can call only normalized read RPCs.
6. Confirm `system.health.manage` is required for threshold administration and alert acknowledgement.
7. Confirm service-role collector access is server-side only, including `record_health_snapshot`, `record_deployment_health_state`, and `read_applied_schema_version`.
8. Confirm the Management API token can read the project metrics endpoint and cannot perform unrelated write operations.
9. Confirm `/api/health` returns the public-safe liveness contract without infrastructure detail.
10. Confirm no production thresholds have been silently created. Threshold values require an authorized administrative decision and reason.

## Initial collector dry run

The first production collector execution is a separate enablement gate.

Run one reviewed single-shot collector execution using the supported `--once` mode. Do not schedule recurring collection yet.

Validate after that run:

- one snapshot per configured provider/source;
- only the 18 allowlisted numeric metric codes are stored;
- provider failures become approved `UNKNOWN` states and do not stop other providers;
- raw Prometheus/provider payloads and provider error bodies are absent from database records and logs;
- Storage object names/paths and protected filenames are absent;
- `deployment.schema_drift` is `0` when `read_applied_schema_version()` reports `20260903002400`;
- raw hosted migration-ledger timestamps are never exposed to operators as the canonical application schema version;
- deployment state contains only normalized safe identifiers, with source fixed to `deployment` and provider fixed to `wasdok`;
- deployment state and deployment metrics age to `UNKNOWN` for human readers when their 300-second freshness window expires;
- authorized System Health pages render normalized measurements and reasons;
- unauthorized users receive no health data;
- no service-role or Management API credential appears in browser output.

If the dry run is not clean, disable/stop collection, preserve safe diagnostic evidence and return to code/configuration review. Do not weaken RLS, RPC checks or static security controls to make telemetry appear healthy.

## Threshold initialization

Thresholds are not automatically inferred from production values. For each metric requiring alerting:

1. An authorized `system.health.manage` administrator selects an allowlisted metric.
2. Warning and critical values are set in the catalogue's supported direction.
3. A meaningful reason is entered.
4. The audited `admin_set_health_threshold` RPC records the change.
5. Validate a controlled non-production or DEMO scenario before relying on the alert operationally.

`UNKNOWN` must remain distinct from `HEALTHY` throughout initialization.

## Scheduler enablement

Only after the dry run has been explicitly accepted may a recurring collector schedule be enabled.

Recommended initial scheduler cadence: **once per minute**. This keeps the 300-second application/deployment freshness windows comfortably covered while still remaining well below the normal Management API project-level request limit for one metrics scrape per run. Provider-specific metric documentation may retain longer semantic sampling/staleness windows.

Use a single active production schedule unless a reviewed high-availability design explicitly requires otherwise. Overlapping collector runs are not a substitute for reliability monitoring.

## Post-enable verification

After scheduling:

- verify multiple consecutive runs complete without secret leakage;
- verify collection timestamps advance as expected;
- verify database and Storage history accumulates without object-level content;
- verify forecasts remain `INSUFFICIENT_DATA` until seven distinct observation days exist;
- verify backup health reads only WASDOK-55 operational metadata;
- verify schema drift turns CRITICAL for a controlled mismatched canonical version in non-production testing;
- verify raw hosted migration-ledger timestamps do not drive application schema-drift status;
- verify stale deployment state becomes UNKNOWN rather than remaining HEALTHY;
- verify audit records identify authorized human threshold/acknowledgement actors;
- verify application build/browser scans remain credential-clean.

## Rollback / disablement

If production collection causes instability or provider authorization changes:

1. Disable the collector scheduler first.
2. Revoke/rotate the dedicated health Management API token if compromise is suspected.
3. Leave historical safe health data and audit evidence intact unless a separately approved retention action applies.
4. Do not drop health tables or erase alert/audit history as an operational rollback.
5. Restore application code through the normal release rollback procedure if required.
6. Record the operational reason and corrective action.

Database migration rollback must be separately designed and approved; destructive ad-hoc down migrations are not part of this runbook.

## Production approval gates

The required sequence is:

**merge approval → hosted Supabase migration approval → application release approval (where separately required) → credential/configuration approval → one-shot collector dry-run approval → recurring scheduler approval → operational acceptance.**

Each gate is explicit. Passing CI or completing an earlier gate does not authorize a later one.
