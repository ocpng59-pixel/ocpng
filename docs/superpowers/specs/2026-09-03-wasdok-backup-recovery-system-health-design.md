# WASDOK 360 Backup, Recovery & System Health Administration Design

**Status:** Approved architecture; formal design specification  
**Date:** 2026-09-03  
**Parent Epic:** WASDOK-17 — Deployment & Production Readiness  
**Backup/Recovery Story:** WASDOK-55 — Implement Backup, Recovery & Disaster Recovery Administration  
**System Health Story:** WASDOK-85 — Implement System Health, Capacity & Operational Monitoring Dashboard  
**Security Integration:** WASDOK-48 — Implement security monitoring and incident-response controls  
**Target product:** WASDOK 360  
**Base release:** `feat/wasdok360-release1`

## 1. Purpose

WASDOK 360 requires an operational administration subsystem that gives OCPNG controlled visibility of backup readiness, independent archival custody, restore capability, database/storage growth, application health, deployment/schema drift, capacity risk and approved security-health indicators.

The subsystem must not expose provider infrastructure credentials to browser users, must not turn System Administrator status into unrestricted infrastructure authority, and must not attempt to replace provider-native PostgreSQL physical backup/PITR mechanisms with custom application logic.

The approved architecture is a hybrid control plane:

1. **Provider-managed database recovery** for daily backups and Point-in-Time Recovery (PITR) where enabled;
2. **WASDOK-controlled independent archival exports** for OCPNG custody;
3. **separate Storage-object backup** because database backups include Storage metadata but not the object bytes;
4. **privileged server-side operations workers** for export, copy, package, encrypt, verify and restore-orchestration work;
5. **System Health collectors** for approved database, storage, application, deployment, backup and security-health telemetry;
6. **WASDOK administrative UI** as a permission-controlled control plane, never as a holder of provider secrets.

## 2. Story boundaries

### 2.1 WASDOK-55 — Backup, Recovery & Disaster Recovery Administration

Owns:

- backup job requests and lifecycle;
- independent database archival export;
- Storage full/incremental archival copy;
- archive manifests and integrity verification;
- backup schedules and retention policies;
- recovery-point visibility;
- backup download authorization;
- isolated restore rehearsal;
- production restore orchestration and high-impact authorization;
- RPO/RTO evidence;
- backup/restore immutable audit events.

### 2.2 WASDOK-85 — System Health, Capacity & Operational Monitoring Dashboard

Owns:

- application health;
- database health and growth;
- Storage health and growth;
- capacity forecasting;
- backup/recovery health summary sourced from WASDOK-55;
- deployment/release/migration health;
- schema drift detection;
- operational thresholds;
- health alerts;
- approved aggregate security-health indicators sourced from WASDOK-48;
- health administration audit events.

### 2.3 WASDOK-48 — Security Monitoring & Incident Response

Remains authoritative for:

- security event monitoring;
- authentication/privileged-access monitoring;
- security alerting;
- incident triage/escalation;
- security log retention/access.

WASDOK-85 consumes approved aggregate indicators from WASDOK-48 but does not duplicate incident-response logic.

### 2.4 WASDOK-17 — Deployment & Production Readiness

Coordinates the operational stories and provides the production-readiness governance umbrella. It does not itself implement backup or monitoring UI.

## 3. Design goals

The subsystem shall:

1. provide a controlled Backup & Recovery console under Administration;
2. record every backup as an immutable operational job with a unique backup ID;
3. support independent encrypted OCPNG archival packages containing database export, Storage objects and approved manifests;
4. distinguish provider-native operational recovery from portable OCPNG archival backup;
5. support Storage incremental archival copy while using provider PITR/WAL for database point-in-time recovery rather than inventing a custom row-delta backup engine;
6. verify archive integrity before declaring a backup available;
7. support short-lived, permission-controlled archive download;
8. provide isolated restore rehearsal and measured RPO/RTO evidence;
9. guard production restore as a high-impact operation requiring independent authorization;
10. provide current and historical application/database/storage/backup/deployment/security health;
11. provide growth history and capacity forecasts;
12. detect migration/schema drift between the deployed application expectation and production database state;
13. provide configurable thresholds and operational alerts;
14. expose only aggregate operational metadata where protected content would otherwise leak;
15. keep provider credentials, encryption keys and archive secrets outside browser code and audit metadata;
16. support DEMO/training presentation without exposing production infrastructure or enabling production backup/restore authority.

## 4. Non-goals

This design does not:

- replace Supabase daily backup or PITR/WAL recovery;
- implement custom PostgreSQL physical backup/WAL tooling inside WASDOK;
- store backup encryption keys inside the archive or WASDOK audit trail;
- put backup archives in ordinary case/evidence Storage buckets;
- give `TRAINING_SUPER_ADMIN` automatic production backup/download/restore rights;
- expose provider management API keys, S3 access keys, database credentials or service-role keys to the browser;
- allow a normal web request to perform a long-running multi-gigabyte export synchronously;
- expose protected filenames, complaint titles, case narratives or evidence content merely to calculate health/storage statistics;
- auto-remediate security or production failures without separately approved operational rules;
- treat a successfully created archive file as a successful backup until integrity verification passes;
- guarantee provider features that are unavailable on the subscribed Supabase/Netlify plan. Provider capability is detected and displayed; unavailable capabilities fail closed with a clear operational state.

## 5. Operational architecture

### 5.1 Control plane

The WASDOK application provides the operator-facing control plane:

- request a backup;
- view backup status/history;
- verify/archive/download an approved backup;
- manage schedules/retention;
- request restore rehearsal;
- initiate production-restore approval workflow;
- view System Health and alerts;
- configure health thresholds where authorized.

The application persists only operational metadata, policy, approvals, status and safe references.

### 5.2 Operations worker

Long-running privileged operations execute outside ordinary browser request handlers. The worker may be implemented as an approved secure job runner/server process, but must satisfy these invariants:

- provider credentials are server-side only;
- job requests carry stable IDs, not raw credentials;
- every step is idempotent or safely retryable;
- job status is persisted;
- failures are explicit and auditable;
- no successful status is emitted before required verification;
- worker logs redact credentials, encryption material and protected record content.

### 5.3 Provider adapters

Provider-specific behavior is isolated behind adapters rather than scattered through UI code.

Conceptual interfaces:

- `DatabaseRecoveryProvider` — discover daily/PITR recovery capability and recovery points; invoke separately authorized recovery operations;
- `DatabaseArchiveProvider` — create logical export for independent OCPNG custody;
- `ObjectArchiveProvider` — enumerate/copy Storage objects and metadata server-side;
- `MetricsProvider` — collect database/platform metrics;
- `ApplicationTelemetryProvider` — collect approved application/deployment telemetry;
- `ArchiveStore` — store encrypted backup artifacts and manifests;
- `ArchiveKeyProvider` — obtain/use managed encryption keys without exposing key material to WASDOK browser clients.

Provider adapters are implementation details; the database model and UI operate on provider-neutral contracts.

## 6. Backup categories

### 6.1 Provider recovery backup

Represents provider-managed database recovery capability:

- scheduled/daily database backup;
- PITR recovery window where available;
- earliest/latest recovery point;
- provider recovery status.

These recovery points are not repackaged by WASDOK as downloadable OCPNG archives.

### 6.2 Full OCPNG archival backup

An independent portable archive containing approved components:

- logical database export;
- Storage object bytes;
- Storage metadata/object manifest;
- database/schema/migration manifest;
- application release/commit manifest;
- archive manifest;
- checksums;
- restore metadata/instructions.

### 6.3 Storage incremental archive

Captures Storage objects created or changed since the last approved Storage checkpoint. The checkpoint must be stable and auditable.

Storage incremental logic may use provider object metadata such as modification timestamp/ETag/hash where reliable. Deleted-object handling is recorded in a delta manifest; the design must not assume provider bucket versioning.

### 6.4 Pre-release / pre-migration backup

A tagged full/verified archival backup or validated provider recovery point created before a high-risk deployment/migration.

### 6.5 Post-migration integrity snapshot

Records the deployed application version, migration history, table/storage counts and health checks after a successful deployment. It is not a substitute for a full archive unless it also contains the required archive components.

## 7. Database differential/incremental policy

WASDOK shall not describe a custom logical row-delta ZIP as equivalent to PostgreSQL PITR.

For database recovery:

- full independent logical archives provide portable custody;
- provider PITR/WAL provides incremental point-in-time recovery where enabled;
- daily provider backups remain visible as operational recovery points;
- implementation may later add an independently engineered incremental database archive only under a separate approved design if there is a demonstrated requirement.

The UI should therefore use accurate labels such as **Full Archive**, **Recovery Point**, **PITR Window**, and **Storage Increment**, rather than misleading users with a generic “Differential Database ZIP” label.

## 8. Archive format and contents

A full archive is represented by a stable backup ID, for example:

`BKP-2026-000038`

An archive layout may be:

```text
WASDOK360_BKP-2026-000038/
  manifest.json
  checksums.sha256
  database/
    roles.sql
    schema.sql
    data.sql
  storage/
    manifest.json
    objects/...
  configuration/
    migration-manifest.json
    deployment-manifest.json
    storage-buckets.json
    safe-system-config.json
  recovery/
    restore-manifest.json
```

The exact logical database export file extension may vary by approved tool, but the manifest records format/version/tool.

A downloadable package may use ZIP for operator portability, but **ZipCrypto is prohibited**. If ZIP is used, it must use an approved strong encryption method or be wrapped in an approved encrypted envelope. Minimum cryptographic posture is authenticated encryption equivalent to AES-256-GCM using managed key material. Custom cryptographic algorithms are prohibited.

Recommended external filename:

`WASDOK360_BKP-2026-000038_FULL.zip.enc`

The archive encryption key is not stored in the package, filename, database row, audit metadata or ordinary application logs.

## 9. Archive manifest

`manifest.json` records only safe operational metadata:

- backup ID;
- environment;
- backup type;
- requested/started/completed/verified timestamps;
- application release;
- Git commit;
- expected/latest migration identifier;
- database export format/tool version;
- database export byte size;
- Storage object count;
- Storage byte count;
- archive byte size;
- checksum algorithm and checksum reference;
- encryption algorithm/key reference identifier (never key material);
- retention policy ID;
- parent/full checkpoint ID for Storage incremental archives;
- verification result/version.

The manifest must not contain passwords, tokens, private keys, service-role values, database URLs with embedded credentials or protected record narratives.

## 10. Backup lifecycle

Approved lifecycle:

`REQUESTED → QUEUED → RUNNING → PACKAGING → VERIFYING → AVAILABLE`

Failure path:

`REQUESTED/QUEUED/RUNNING/PACKAGING/VERIFYING → FAILED`

Later lifecycle states:

`AVAILABLE → ARCHIVED → EXPIRED`

and, where policy requires controlled deletion:

`EXPIRED → PURGED`

Rules:

- state transitions are server controlled;
- operators cannot directly set `AVAILABLE`;
- `AVAILABLE` requires successful verification;
- failed jobs preserve diagnostic operational metadata but not secrets;
- retry creates a linked attempt or safe retry state; it does not rewrite historical audit evidence;
- archive purge must be policy-authorized and auditable.

## 11. Backup verification

A full archive is verified before availability.

Minimum verification:

### Database

- expected export components exist;
- export files are readable/non-empty where expected;
- migration manifest is readable;
- table/schema inventory generated;
- approved table row-count snapshot generated where safe;
- export checksum validated.

### Storage

- expected bucket/object inventory generated;
- object count and byte count reconcile with the manifest;
- object-level or segment-level checksums validated according to the approved scale strategy;
- missing/copy-failed objects cause verification failure;
- metadata/object mismatch is surfaced.

### Package

- encrypted package exists;
- archive/package checksum matches;
- encryption metadata references an approved key provider/key reference;
- manifest lists all required components;
- verification tool/version recorded.

A package that fails any mandatory check is `FAILED`, not `AVAILABLE`.

## 12. Archive storage and custody

Backup archives must be stored in a dedicated highly restricted backup repository, separate from case/evidence buckets.

Required controls:

- non-public storage;
- server-side operations identity only;
- encryption at rest plus package-level approved encryption for portable archives;
- retention policy;
- immutable or write-once retention features where the selected archive store supports them and OCPNG policy approves them;
- restricted download path;
- no routine browsing by ordinary application users;
- audit and monitoring of privileged access.

The archive store may be provider-native or an independent OCPNG-controlled storage service. The design intentionally does not hard-code a vendor; the implementation must use an approved `ArchiveStore` adapter and preserve the same security contract.

## 13. Backup scheduling and retention

Backup policy is configurable, not hard-coded.

A recommended starting operational template is:

- continuous/provider PITR where enabled;
- provider daily database backup according to plan capability;
- daily Storage increment;
- weekly full OCPNG archive;
- monthly long-retention archival copy;
- pre-major-release verified recovery point/full archive;
- pre-high-risk-migration verified recovery point/full archive;
- quarterly restore rehearsal.

OCPNG must approve actual retention durations, RPO/RTO targets and archival custody policy before production enablement.

Scheduling metadata includes:

- schedule ID;
- backup type;
- environment;
- cadence/next run;
- retention policy;
- enabled flag;
- last run/status;
- created/changed by;
- mandatory administrative reason.

## 14. Recovery Point Objective and Recovery Time Objective

The system records policy targets and measured rehearsal results.

### RPO

Maximum tolerated data loss measured as time between disaster point and latest usable recovery point.

### RTO

Maximum tolerated restoration/service-return duration.

WASDOK stores:

- target RPO/RTO policy;
- recovery point selected;
- restore start/end;
- application validation completion time;
- achieved RPO/RTO;
- result/pass/fail;
- verification evidence reference.

Targets are policy data and are not assumed by this design.

## 15. Restore Centre

Administration route concept:

`/dashboard/operations/backups/restore`

Supported workflows:

### 15.1 Restore rehearsal

1. select verified backup/recovery point;
2. create isolated recovery environment;
3. restore database and required Storage/configuration dependencies;
4. verify migration/schema state;
5. verify record counts/integrity;
6. verify Storage objects/counts;
7. run application/security smoke checks;
8. measure RTO/RPO;
9. record result/evidence;
10. destroy or resecure the recovery environment according to policy.

Restore rehearsals use no production mutation.

### 15.2 Production restore

Production restore is a high-impact operation.

Required stages:

`REQUESTED → IMPACT_REVIEW → AWAITING_AUTHORIZATION → AUTHORIZED → EXECUTING → VERIFYING → COMPLETED`

Failure/rejection states:

`REJECTED`, `FAILED`.

Production restore requirements:

- `backup.restore_production` permission for requester;
- mandatory reason;
- selected verified recovery point;
- displayed recovery-point timestamp and data-loss impact window;
- independent senior authorization from a different active user with the separately approved production-recovery authorization capability;
- requester cannot self-authorize;
- execution performed only by privileged operations worker/provider adapter;
- post-restore verification required before COMPLETED;
- immutable audit trail for request, authorization, execution and result.

This is an intentional exception to the normal single-administrator immediacy used for ordinary access-control changes. The destructive blast radius justifies independent authorization.

## 16. Backup permissions

Approved application permission catalogue additions for WASDOK-55:

- `backup.view`
- `backup.create`
- `backup.verify`
- `backup.download`
- `backup.schedule`
- `backup.restore_test`
- `backup.restore_production`
- `backup.authorize_production_restore`
- `backup.manage_retention`

Rules:

- permissions are configurable through Access Control Administration;
- application System Administrator does not automatically receive all backup permissions;
- `TRAINING_SUPER_ADMIN` does not receive production infrastructure authority merely because of training role type;
- production download and restore permissions are treated as highly privileged;
- requester/authorizer separation for production restore is enforced server-side/database-side, not by UI convention.

## 17. Backup download

Download sequence:

1. verify authenticated session;
2. require `backup.download`;
3. require backup state `AVAILABLE` or approved archival state;
4. capture mandatory reason;
5. create `backup.download_requested` audit evidence;
6. issue a short-lived single-purpose signed/download capability from the archive store;
7. return only the temporary capability to the authorized user;
8. expire automatically;
9. record completion where technically detectable, otherwise record issuance plus expiry.

Permanent public URLs are prohibited.

The download response never contains the archive encryption key.

## 18. Backup audit events

Recommended immutable actions:

- `backup.requested`
- `backup.queued`
- `backup.started`
- `backup.packaged`
- `backup.completed`
- `backup.failed`
- `backup.verified`
- `backup.download_requested`
- `backup.download_capability_issued`
- `backup.downloaded` where detectable
- `backup.schedule_changed`
- `backup.retention_changed`
- `backup.expired`
- `backup.purged`
- `restore.requested`
- `restore.test_started`
- `restore.test_completed`
- `restore.production_authorized`
- `restore.production_rejected`
- `restore.production_started`
- `restore.production_completed`
- `restore.failed`

Safe audit metadata may include backup ID, type, state, environment, recovery timestamp, artifact ID, retention policy ID and result. It excludes archive bodies, object names where protected, encryption keys, provider secrets and credentials.

## 19. Backup operational data model

Proposed logical tables:

### `backup_jobs`

Job identity, type, environment, lifecycle state, requester, reason, timestamps, provider, parent checkpoint and safe status/error code.

### `backup_artifacts`

Artifact identity, backup job, archive-store reference, encrypted size, checksum, encryption metadata/key reference, retention policy, availability/expiry.

### `backup_components`

Component-level verification metadata for database/storage/manifests without storing protected content.

### `backup_schedules`

Policy/cadence/enabled/next-run metadata.

### `backup_retention_policies`

Named retention policy, durations, archive class and approved purge behavior.

### `backup_verifications`

Verification attempt, validator version, result, component counts/checksums, safe failure codes.

### `restore_runs`

Restore identity, type, source backup/recovery point, requester, independent authorizer where required, lifecycle, timing and result.

### `restore_verifications`

Post-restore schema/data/storage/application/security verification results and measured RPO/RTO.

No table stores raw provider secrets or archive encryption keys.

## 20. System Health overview

Administration route concept:

`/dashboard/operations/health`

Health domains:

- Application;
- Database;
- Storage;
- Backup & Recovery;
- Deployment;
- Security;
- Scheduled/Operational Jobs.

Each domain exposes:

- `HEALTHY`;
- `WARNING`;
- `CRITICAL`;
- `UNKNOWN` where telemetry is unavailable or stale.

A status is always accompanied by the underlying measurement, threshold, timestamp and freshness indicator. The UI must not show unexplained red/green lights.

## 21. Application health

Approved indicators may include:

- production application availability;
- request/route latency summary;
- HTTP/server error rate;
- server-function invocation/error/duration where provider telemetry supports it;
- current release identifier;
- deployed Git commit;
- last successful deployment timestamp;
- last failed deployment timestamp;
- environment name;
- health-check endpoint result.

Provider plan/capability is detected. Missing metrics produce `UNKNOWN`, not fabricated zero values.

## 22. Database health

Approved indicators may include:

- PostgreSQL database size;
- total disk/storage allocation/usage where available;
- WAL usage/activity;
- active connections;
- maximum connections;
- connection saturation percentage;
- transaction rate;
- long-running query count;
- deadlocks;
- cache/IO indicators;
- CPU/memory/IO metrics where provider exposes them;
- largest table sizes;
- index sizes;
- row-count estimates where safe;
- health-data freshness.

Metrics collection runs server-side using approved provider telemetry/SQL. Browser clients receive only normalized safe health data.

## 23. Storage health

Approved aggregate indicators:

- total object count;
- total bytes;
- bucket-level aggregate usage where disclosure is safe;
- growth by day/week/month;
- failed/corrupt archival object counts;
- largest aggregate domains/classifications using non-sensitive labels;
- orphan/integrity counters where safely detectable.

System Health must not leak protected object names, case references or Storage paths to a user who merely has `system.health.view`.

Where classification-level aggregation could itself reveal sensitive operational facts, the implementation may coarsen or suppress the breakdown while still showing total capacity.

## 24. Backup & Recovery health

WASDOK-85 consumes safe WASDOK-55 metadata:

- last successful full archive;
- last provider recovery point;
- PITR capability/window state where available;
- last Storage increment;
- last backup verification result;
- backup freshness/age;
- current running/failed jobs;
- last successful restore rehearsal;
- restore rehearsal age;
- latest achieved RPO/RTO;
- backup archive-store reachability/health where approved.

System Health does not itself create/download/restore backups.

## 25. Deployment health and schema drift

WASDOK shall compare the application-expected schema/migration version with the production migration history.

Conceptual outcomes:

- expected == live → `HEALTHY`;
- live behind expected → `CRITICAL` schema drift;
- live ahead of application expectation → `CRITICAL` incompatible/unknown deployment state unless explicitly recognized;
- migration history unavailable → `UNKNOWN`;
- unexpected failed/partial deployment signal → `CRITICAL`.

The System Health page displays:

- application release;
- expected migration version;
- live migration version;
- Git commit;
- deployment timestamp;
- CI/deployment status where available;
- drift result.

Schema drift detection is read-only. It never auto-applies migrations.

## 26. Security health integration

WASDOK-85 may display approved aggregate signals from WASDOK-48 such as:

- RLS policy verification status;
- audit append-only/immutability verification status;
- failed privileged-operation count/trend;
- failed authentication count/trend;
- current Security Advisor warning count/classification;
- last security verification time/result;
- security monitoring freshness.

It does not display protected case content or detailed incident records merely because the user has health-view permission.

Detailed security investigation remains under WASDOK-48/audit permissions.

## 27. Scheduled jobs health

The dashboard shall monitor important background operations including:

- backup schedules;
- backup jobs;
- health snapshot collection;
- alert evaluation;
- retention/purge jobs;
- approved notification jobs;
- restore-verification jobs.

Indicators include last run, next run, duration, success/failure and consecutive failure count.

## 28. Health snapshot model

WASDOK shall persist normalized historical snapshots rather than querying every provider metric live for every page load.

Proposed tables:

### `system_health_snapshots`

One snapshot run with environment, collected timestamp, collector version, result/freshness.

### `system_health_metrics`

Normalized metric values keyed by snapshot, metric code, unit, dimension-safe labels and source provider.

### `system_health_thresholds`

Configurable thresholds, comparison rule, warning/critical values, unit, enabled flag and change reason.

### `system_health_alerts`

Alert instances with metric, state, opened/acknowledged/resolved timestamps and safe context.

### `deployment_health`

Expected/live release and migration identifiers, drift state and verification timestamp.

### `capacity_forecasts`

Forecast series for approved resources with generated timestamp, horizon, method/version and confidence/quality indicator.

## 29. Metrics retention and sampling

Health snapshots are operational telemetry, not full application logs.

The implementation plan shall define collection frequencies by metric class. A reasonable architecture supports:

- frequent current-health snapshots for saturation/availability;
- daily capacity snapshots for growth forecasting;
- longer-term rollups for monthly/yearly trends.

Raw high-frequency provider telemetry need not be copied wholesale into WASDOK PostgreSQL if an approved external monitoring backend already retains it. WASDOK may store normalized rollups/current health plus external reference IDs.

Retention must balance operational usefulness, cost and privacy.

## 30. Capacity forecasting

Initial forecasting should be deterministic and explainable.

For database/storage capacity:

- retain daily/weekly historical usage snapshots;
- calculate recent average growth and trend;
- project approved horizons such as 30/90/180/365 days;
- display the method and snapshot age;
- suppress forecasts when history is insufficient or anomalous rather than presenting false precision.

AI/ML forecasting is not required.

Forecast examples are presentation concepts only; production values come from collected telemetry.

## 31. Health thresholds

Approved permission-controlled thresholds may include:

- database capacity percentage/bytes;
- Storage capacity percentage/bytes where provider exposes a finite quota;
- connection saturation;
- backup freshness age;
- failed backup count;
- restore rehearsal age;
- job consecutive failures;
- deployment drift;
- application availability/error rate.

Thresholds use explicit units and comparison semantics. Configuration changes require reason and audit.

Provider plans may not expose an absolute quota for every resource; percentage thresholds are only used when denominator capacity is authoritative.

## 32. Health alerts

Recommended alert codes:

- `DATABASE_CAPACITY_WARNING`
- `DATABASE_CAPACITY_CRITICAL`
- `DATABASE_GROWTH_HIGH`
- `STORAGE_CAPACITY_WARNING`
- `STORAGE_CAPACITY_CRITICAL`
- `BACKUP_OVERDUE`
- `BACKUP_FAILED`
- `BACKUP_INTEGRITY_FAILED`
- `RESTORE_TEST_OVERDUE`
- `DATABASE_CONNECTION_SATURATION`
- `MIGRATION_DRIFT`
- `APPLICATION_UNHEALTHY`
- `METRICS_STALE`
- `SECURITY_HEALTH_WARNING`
- `SCHEDULED_JOB_FAILED`

Alerts are operational records. Notification delivery may integrate with existing WASDOK notifications/email/SMS later without changing alert semantics.

## 33. System Health permissions

Approved permission catalogue additions for WASDOK-85:

- `system.health.view`
- `system.health.manage`

`system.health.view` grants access to safe operational health information, not provider credentials, protected case content or backup archives.

`system.health.manage` grants threshold/monitoring-policy administration only. It does not grant backup creation/download/restore authority.

Detailed security investigation remains governed by existing security/audit permissions.

## 34. Health audit events

Privileged administration events:

- `health.threshold_created`
- `health.threshold_updated`
- `health.threshold_retired`
- `health.monitor_config_changed`
- `health.alert_acknowledged`
- `health.alert_resolved_manually` where policy allows manual resolution

Ordinary metric viewing and automatic snapshot collection are not audited per view/run unless a separate monitoring policy requires it.

Audit metadata excludes provider secrets and protected data.

## 35. Training and demonstration

Training mode must use synthetic operational telemetry and synthetic backup records identified as `DEMO WASDOK` data.

Training users may learn:

- how to read backup status;
- how to interpret health indicators;
- how restore workflow approvals operate;
- how thresholds affect alerts.

Training mode must not:

- expose live production archive links;
- expose provider account/project management tokens;
- allow production backup download;
- allow production restore;
- reveal restricted production infrastructure detail merely through the training role.

`TRAINING_SUPER_ADMIN` remains an application training role, not an infrastructure-owner role.

## 36. Administration navigation

Recommended Administration entries:

- Users
- Roles & Permissions
- Audit Logs
- Help Administration
- **Backup & Recovery**
- **System Health**
- System Settings

Conceptual routes:

- `/dashboard/operations/backups`
- `/dashboard/operations/backups/history`
- `/dashboard/operations/backups/schedules`
- `/dashboard/operations/backups/restore`
- `/dashboard/operations/health`
- `/dashboard/operations/health/database`
- `/dashboard/operations/health/storage`
- `/dashboard/operations/health/deployment`
- `/dashboard/operations/health/alerts`

Final route names may be refined during implementation planning, but authorization boundaries and story ownership do not change.

## 37. Failure handling

### Backup worker unavailable

- backup request remains QUEUED or transitions to FAILED after defined retry policy;
- UI shows explicit worker/unavailable status;
- no false success;
- existing business workflows remain available unless broader infrastructure failure requires otherwise.

### Provider recovery capability unavailable

- display `UNKNOWN`/`NOT AVAILABLE ON CURRENT PROVIDER PLAN` as appropriate;
- do not fabricate recovery points;
- independent archival backup capability may remain available if its provider requirements are met.

### Metrics provider unavailable/stale

- last successful metric remains timestamped;
- status becomes `UNKNOWN`/`METRICS STALE` after freshness threshold;
- stale metrics never appear as current healthy values.

### Archive verification failure

- artifact remains unavailable for ordinary download/restore selection;
- job is FAILED;
- failure is audited and alerts may be generated.

### Production restore failure

- transition to FAILED;
- preserve recovery/provider diagnostic reference safely;
- trigger critical operational/security notification path;
- do not claim service restored until post-restore verification passes.

## 38. Security boundaries

Required controls across both stories:

- no provider management credentials in browser bundles;
- no privileged Storage S3 access keys in browser code;
- no service-role credentials in client-facing code;
- RLS/DB authorization for operational metadata;
- audited RPC/server-worker boundary for privileged backup/restore actions;
- direct browser DML denied for protected operational state where lifecycle/audit invariants apply;
- short-lived signed capabilities for backup download;
- encryption key material held by approved key provider, not application rows/audit/logs;
- health metrics sanitized/aggregated before rendering;
- archive/object names protected from unauthorized disclosure;
- production restore requester cannot authorize own restore;
- all demo/test backups use fictional isolated fixtures;
- secrets scanning/static client-boundary tests in CI.

## 39. Provider capability facts and design consequences

The implementation must preserve these provider-neutral consequences:

1. Managed database backup/PITR capability is treated as provider recovery, not as WASDOK archive content.
2. Storage object bytes require separate backup from database metadata.
3. Bulk Storage archival is performed through an approved server-side Storage API/S3-compatible mechanism.
4. Database health telemetry may be collected from provider metrics/SQL using privileged server-side credentials.
5. Current provider plan/feature capability is detected at runtime/configuration and exposed as operational capability state; the code must not assume every production plan has PITR or every metric.

## 40. Testing requirements

### Database/security tests

- permission catalogue additions;
- RLS/direct-write boundaries;
- backup lifecycle state-machine enforcement;
- `AVAILABLE` requires successful verification;
- production restore requester/authorizer separation;
- archive metadata cannot store forbidden secret fields;
- immutable audit events for privileged operations;
- threshold configuration authorization;
- unauthorized health users cannot access restricted telemetry;
- training role does not confer production backup/restore authority.

### Application tests

- Backup & Recovery routes protected by exact permissions;
- Backup history/status rendering;
- restore impact/authorization workflow;
- short-lived download capability path never exposes encryption key/provider secret;
- Health dashboard status/freshness semantics;
- schema drift detection;
- capacity history/forecast behavior;
- aggregate Storage display does not render protected filenames;
- stale metrics become UNKNOWN rather than HEALTHY;
- client-facing code passes secret/service-role scans.

### Operations-worker tests

- idempotent job pickup;
- safe retry behavior;
- export/copy/package/verify ordering;
- partial Storage copy fails verification;
- encryption/package checksum verification;
- secret redaction;
- no `AVAILABLE` transition on failed verification.

### End-to-end tests

Use only fictional `DEMO WASDOK` backup/health fixtures in isolated/local environments. Prove:

- authorized backup request;
- unauthorized backup request denied;
- backup state progression;
- successful verification before availability;
- download reason/audit/capability issuance;
- restore rehearsal into isolated test environment or controlled test double;
- production restore two-person rule using synthetic environment only;
- health collection/history;
- database/storage growth trend;
- schema drift warning;
- stale metric behavior;
- negative infrastructure-disclosure tests;
- zero DEMO residue in hosted rollback-safe verification where applicable.

## 41. Deployment posture

Implementation must be split into reviewable stories/tasks rather than one monolithic release.

Recommended implementation sequence:

1. operational permissions/data model/common provider-neutral contracts;
2. WASDOK-55 backup metadata/lifecycle and archive worker contract;
3. independent database/Storage archive and verification;
4. download/retention/scheduling;
5. restore rehearsal;
6. production restore authorization/orchestration after rehearsal path is proven;
7. WASDOK-85 health snapshot/threshold model;
8. database/storage/application/deployment collectors;
9. growth/forecasting/alerts;
10. WASDOK-48 aggregate security-health integration;
11. full CI/security/DR rehearsal and hosted deployment verification.

Every hosted database migration and production worker/provider credential change remains a separate explicit approval gate.

## 42. Acceptance criteria — WASDOK-55

WASDOK-55 is complete only when:

1. backup/recovery permissions are configurable and server enforced;
2. provider recovery capability/recovery points can be viewed safely where available;
3. independent full OCPNG archive covers logical database export plus Storage object bytes and approved manifests;
4. Storage incremental archive/checkpoint behavior is implemented and verified;
5. archive package uses approved strong encryption and integrity checks without storing key material in WASDOK;
6. backup jobs use the approved lifecycle and cannot become AVAILABLE before verification;
7. schedules and retention are configurable/audited;
8. archive download uses short-lived authorized capability and mandatory reason/audit;
9. restore rehearsal succeeds in an isolated environment and verifies database/Storage/application integrity;
10. RPO/RTO policy/results are recorded;
11. production restore requires requester/authorizer separation and post-restore verification;
12. privileged events are immutable-audited with safe metadata;
13. training users cannot gain production archive/restore authority;
14. negative-access and secret-boundary tests are green;
15. production operational runbook and disaster-recovery rehearsal evidence are approved.

## 43. Acceptance criteria — WASDOK-85

WASDOK-85 is complete only when:

1. authorized users can view current application, database, Storage, backup, deployment and approved security-health indicators;
2. telemetry includes freshness timestamps and UNKNOWN handling;
3. database/storage historical snapshots support growth trends;
4. deterministic capacity forecasts display method/freshness and suppress false precision when history is inadequate;
5. migration/schema drift is detected and clearly surfaced;
6. thresholds are configurable by `system.health.manage` and changes are audited;
7. alerts are generated for approved threshold/health failures;
8. Backup Health consumes safe WASDOK-55 metadata without granting backup authority;
9. Security Health consumes aggregate WASDOK-48 indicators without exposing incident/case content;
10. aggregate Storage/database telemetry does not leak protected filenames or narratives;
11. provider credentials remain server-side and client scans are green;
12. training mode uses fictional telemetry and no production infrastructure authority;
13. automated authorization, stale-data, threshold, drift, privacy and negative-access tests are green;
14. operational monitoring runbook defines collection, retention, alert and escalation responsibilities.

## 44. Approved architecture decision

WASDOK 360 shall implement **Provider-managed Database Recovery + Independent Encrypted OCPNG Archival Backups + Separate Storage Backup + Backup Administration & Restore Centre + System Health/Capacity Dashboard + Deployment Drift Detection + Security Health Integration + Immutable Operational Audit**.

The browser is a control plane only. Privileged backup, restore and provider-metrics actions execute through server-side workers/adapters. Production restore uses independent authorization. System Health exposes safe operational metadata and never becomes a path to protected records, infrastructure secrets or backup archives.