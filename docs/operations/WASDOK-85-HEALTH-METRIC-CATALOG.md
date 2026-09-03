# WASDOK-85 System Health Metric Catalogue

## Purpose

This catalogue defines the only operational metrics accepted by the WASDOK-85 System Health collector. The metrics are operational metadata. They do not grant access to complaint, investigation, leadership, legal, intelligence or evidence content.

All browser reads use normalized permission-checked RPCs. Raw Prometheus responses, Storage object names/paths, case filenames, credentials, tokens, connection strings and provider error bodies are not persisted or displayed.

## Status and fallback rules

- `HEALTHY`, `WARNING` and `CRITICAL` are deterministic results of an active configured threshold.
- Missing, stale, invalid or unavailable signals are `UNKNOWN`; `UNKNOWN` is never treated as healthy.
- Threshold direction below is the supported default direction for administration. Numeric warning/critical values are environment-specific and are not silently invented by the system.
- Provider failures are isolated per source. Approved fallback reason codes are `AUTHENTICATION_FAILED`, `AUTHORIZATION_FAILED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE` and `PROVIDER_ERROR`.
- Capacity forecasts are available only with at least seven distinct observation days and use at most the latest 90 days.

## Catalogue

| Metric code | Domain | Unit | Source / provider | Recommended cadence | Stale after | Default threshold direction | Privacy classification | Fallback |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| `app.availability` | Application | bool | WASDOK application probe | 1 min | 300 s | BELOW_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `app.response_latency_ms` | Application | ms | WASDOK application probe | 1 min | 300 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `app.http_error_rate` | Application | ratio | approved application/platform aggregate | 1 min | 300 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `db.database_bytes` | Database | bytes | Supabase aggregate/metrics | 5 min | 900 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `db.disk_bytes` | Database | bytes | Supabase metrics | 5 min | 900 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `db.wal_bytes` | Database | bytes | Supabase metrics | 5 min | 900 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `db.connections_active` | Database | count | Supabase metrics | 1 min | 300 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `db.connections_max` | Database | count | Supabase metrics | 15 min | 3600 s | BELOW_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `db.long_running_queries` | Database | count | Supabase aggregate/metrics | 1 min | 300 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `db.deadlocks_24h` | Database | count | Supabase aggregate/metrics | 15 min | 1800 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `storage.object_count` | Storage | count | Supabase aggregate only | 15 min | 1800 s | ABOVE_IS_BAD | RESTRICTED aggregate metadata | UNKNOWN |
| `storage.bytes` | Storage | bytes | Supabase aggregate only | 15 min | 1800 s | ABOVE_IS_BAD | RESTRICTED aggregate metadata | UNKNOWN |
| `backup.last_verified_age_seconds` | Backup | seconds | WASDOK-55 verified-backup metadata | 15 min | 1800 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `backup.last_restore_rehearsal_age_seconds` | Backup | seconds | WASDOK-55 restore-rehearsal metadata | 30 min | 3600 s | ABOVE_IS_BAD | RESTRICTED operational metadata | UNKNOWN |
| `deployment.schema_drift` | Deployment | bool | WASDOK deployment-state provider | 1 min | 300 s | ABOVE_IS_BAD | RESTRICTED release metadata | UNKNOWN |
| `security.failed_privileged_ops_24h` | Security | count | WASDOK aggregate audit indicator | 15 min | 1800 s | ABOVE_IS_BAD | RESTRICTED security aggregate | UNKNOWN |
| `security.failed_logins_24h` | Security | count | Supabase/Auth aggregate | 15 min | 1800 s | ABOVE_IS_BAD | RESTRICTED security aggregate | UNKNOWN |
| `security.advisor_warning_count` | Security | count | approved Supabase security aggregate | 30 min | 3600 s | ABOVE_IS_BAD | RESTRICTED security aggregate | UNKNOWN |

## Historical capacity metrics

Only `db.database_bytes` and `storage.bytes` are exposed through `read_system_health_metric_history(text, integer)`. The read window is constrained to 1–90 days and requires `system.health.view`. The RPC returns only metric code, unit, numeric value, status/reason, source/provider and observation/collection times. It does not return snapshot safe metadata or Storage object identifiers.

## Training and demonstration boundary

`TRAINING_SUPER_ADMIN` does not receive production infrastructure telemetry merely because it is a training role. Demonstrations use fictional `DEMO WASDOK85` samples unless the user has separately been granted production `system.health.view` under the Access Control model.
