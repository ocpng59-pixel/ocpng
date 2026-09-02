# WASDOK Backup/Recovery Identity Coverage Clarification

**Applies to:** `2026-09-03-wasdok-backup-recovery-system-health-design.md`  
**Stories:** WASDOK-55 / WASDOK-85  
**Date:** 2026-09-03

## Reason for clarification

A portable backup must not equate a default Supabase CLI logical database dump with a complete Supabase project recovery package. Supabase-managed `auth` and `storage` schemas have provider-specific behavior, and Storage object bytes live outside PostgreSQL metadata.

## Approved interpretation of “comprehensive backup”

A WASDOK full archival/recovery set is complete only when all three recovery domains have an explicit, verified recovery path:

1. **Application database recovery** — WASDOK/OCPNG schemas, data, roles/permissions and migration history required to recreate the application database state;
2. **Identity/Auth recovery** — an approved provider-native or separately engineered recovery mechanism that can recreate required authentication identities and credential-derived state without exposing plaintext credentials or provider secrets;
3. **Storage-object recovery** — actual Storage object bytes plus the metadata/configuration needed to reconcile and restore them through supported Storage APIs.

A job must not be labelled `FULL` or `COMPREHENSIVE` merely because `schema.sql`/`data.sql` exist.

## Provider adapter addition

Add the conceptual interface:

- `IdentityRecoveryProvider` — discovers the approved Auth/identity recovery mechanism, produces or references the required protected recovery artifact/state, verifies recoverability, and restores identities only through supported provider mechanisms.

The implementation may satisfy this through provider physical backup/restore, an approved Auth migration/export mechanism, or another documented supported method. The selected mechanism is deployment configuration, but the recovery contract is mandatory.

## Credential handling

- Plaintext passwords are never exported or displayed by WASDOK.
- Provider API keys, JWT signing secrets, service-role keys, database passwords, S3 credentials and archive encryption keys are never stored in backup manifests or ordinary audit metadata.
- Auth password hashes/credential-derived records, where an approved provider recovery mechanism necessarily preserves them, are treated as highly restricted backup content and remain inside the encrypted recovery artifact/provider backup boundary; they are not exposed as ordinary files or rendered in the WASDOK UI.
- Custom provider role passwords that are not recoverable from provider backup are recreated/reset according to the restore runbook rather than embedded in the archive.

## Manifest requirement

`manifest.json` must include a safe `recovery_domains` section recording only status/reference metadata, for example:

```json
{
  "recovery_domains": {
    "application_database": "VERIFIED",
    "identity_auth": "VERIFIED_PROVIDER_RECOVERY",
    "storage_objects": "VERIFIED"
  }
}
```

No identity records, password hashes, tokens or secrets are copied into the manifest.

## Verification requirement

A full archive/recovery verification fails unless:

- application database recovery coverage is verified;
- identity/Auth recovery coverage is verified or explicitly tied to a tested provider recovery point that is part of the same recovery set;
- Storage object recovery coverage is verified;
- the restore rehearsal proves the combined identity + database + Storage path in an isolated environment.

## Acceptance-criteria amendment

For WASDOK-55, “independent full OCPNG archive covers logical database export plus Storage object bytes and approved manifests” is interpreted together with this clarification: the backup/recovery set must also provide a verified identity/Auth recovery path. A standard CLI application-data dump by itself is not sufficient evidence of comprehensive recoverability.