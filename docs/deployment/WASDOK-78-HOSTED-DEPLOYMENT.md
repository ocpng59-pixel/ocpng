# WASDOK-78 Hosted Deployment Runbook

**Status:** Authoritative Task 10 hosted migration procedure  
**Target:** OCPNG Supabase production project `znbkwlsetcoxhhybadhq`, branch `main`  
**Safety gate:** No hosted SQL is applied until explicit production-deployment approval is given after PR #17 merge and post-merge CI verification.

## Authority

This runbook **supersedes the original WASDOK-78 implementation plan, Task 10 Step 4**, which incorrectly referred to only migration `01100`. WASDOK-78 now consists of four required forward migrations and production must apply all four in chronological order.

## Required migration sequence

**01100 → 01200 → 01300 → 01400**

1. `20260902001100_access_control_administration.sql`
2. `20260902001200_access_control_role_permissions.sql`
3. `20260902001300_access_control_user_access.sql`
4. `20260902001400_access_control_direct_write_boundary.sql`

Do not skip, reorder, combine, or manually cherry-pick statements from these migrations. `01400` depends on functions created by the first three migrations and contains the final direct-write, last-administrator concurrency, role-validation, and invitation-audit hardening boundary.

## Pre-deployment gate

Before touching production:

- PR #17 must be merged only after explicit merge approval.
- Post-merge CI must pass on the exact merge commit.
- Confirm the target is OCPNG project `znbkwlsetcoxhhybadhq` / `main`.
- Confirm no DLPP or unrelated Supabase project is selected.
- Read the hosted migration history and verify whether any of `01100`–`01400` are already registered.
- If any migration is already present, stop and reconcile history before applying anything.
- Do not drop, truncate, reset, or recreate existing RBAC, complaint, audit, profile, role, permission, scope, or compartment tables.

## Deployment execution

Apply exactly the four migration files above in order through the controlled Supabase migration mechanism. If connector-based migration execution is unavailable and manual SQL execution is explicitly approved, record that execution separately and do **not** claim official Supabase migration-history registration unless migration history is independently verified afterward.

## Post-deployment verification

Run a rollback-safe verifier using `BEGIN ... ROLLBACK` and only fictional `DEMO WASDOK78` fixtures. Verify at minimum:

- lifecycle-aware `has_permission`, `has_scope`, and `has_compartment` behaviour;
- all Access Control administration RPCs exist;
- RLS remains enabled on protected tables;
- authenticated direct RBAC DML remains denied;
- direct and held-role self-escalation are rejected;
- concurrent/removal paths cannot leave zero effective role administrators or user administrators;
- user invitation audit RPC exists and stores only safe target identifiers/reason metadata;
- revocation and suspension change authorization immediately;
- role and assignment history is not destructively deleted;
- no passwords, JWTs, session cookies, service-role credentials, database credentials, or environment secrets appear in audit metadata;
- rollback leaves no verifier rows.

The final verification result must establish:

```text
verification_status = WASDOK-78 LIVE VERIFICATION PASSED
no_test_records_remain = true
lifecycle_authorization_verified = true
admin_rpcs_verified = true
anti_lockout_verified = true
audit_verified = true
```

## Closure

Only after successful hosted verification should deployment evidence be recorded against WASDOK-78. Jira closure remains a separate explicit approval gate.
