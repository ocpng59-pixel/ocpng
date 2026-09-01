# WASDOK-61 Authentication Lifecycle Audit Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture auditable successful sign-in and intentional sign-out events without storing credentials or tokens, while retaining failed/expired/revoked authentication evidence in Supabase Auth logs.

**Architecture:** Add a small auth-audit helper that whitelists safe request metadata and inserts append-only `audit_events` rows only after authentication exists. Tighten the database insert policy so `actor_id` must equal `auth.uid()`. Wire successful sign-in to record an event before entering `/dashboard`, wire sign-out to attempt the audit event before local session destruction without ever trapping a user on sign-out, and keep failed sign-in/expired/revoked events in Supabase Auth logs because no authenticated WASDOK actor exists at those points.

**Tech Stack:** Next.js 16, TypeScript 6, Supabase JS 2.112.4, PostgreSQL RLS, Vitest 4.1.11, GitHub Actions.

**Spec:** Jira WASDOK-61 — Capture authentication lifecycle audit events.

## Global Constraints

- Never store passwords, bearer tokens, access tokens, refresh tokens, cookies, service-role credentials, or Supabase secret keys in `audit_events`.
- Do not create an anonymous insert path into `audit_events`.
- `audit_events` remains append-only.
- Authenticated audit rows must set `actor_id = auth.uid()`.
- Failed sign-in and expired/revoked-session evidence remains in Supabase Auth logs; do not weaken WASDOK RLS to duplicate those events.
- Sign-out must proceed even if WASDOK audit insertion fails.
- No service-role key is introduced into browser or Netlify configuration.

---

### Task 1: RED tests for auth audit sanitization and persistence contract

**Files:**
- Create: `tests/foundation/auth-audit.test.ts`
- Create later in GREEN: `lib/auth/audit.ts`

**Interfaces:**
- Produces expected `sanitizeAuthAuditMetadata(input)` and `recordAuthenticatedAuthEvent(...)` behavior.

- [ ] **Step 1: Write failing tests** proving safe metadata is retained, sensitive keys are excluded recursively, and the insert row uses `actor_id`, controlled auth action, `auth_session` entity type and `RESTRICTED` classification.
- [ ] **Step 2: Run `npm run test:run -- tests/foundation/auth-audit.test.ts` in CI and verify RED because `@/lib/auth/audit` does not exist.**
- [ ] **Step 3: Commit RED evidence.**

### Task 2: GREEN auth audit helper

**Files:**
- Create: `lib/auth/audit.ts`

**Interfaces:**
- `sanitizeAuthAuditMetadata(input: Record<string, unknown>): Record<string, string | number | boolean | null>`
- `recordAuthenticatedAuthEvent({ insert, actorId, action, requestMetadata }): Promise<{ ok: true } | { ok: false; message: string }>`

- [ ] **Step 1: Implement only the helper required by the RED tests.**
- [ ] **Step 2: Run the focused auth-audit tests and verify GREEN.**
- [ ] **Step 3: Commit.**

### Task 3: RED/GREEN database actor-integrity policy

**Files:**
- Create: `supabase/migrations/20260902000700_auth_audit_actor_integrity.sql`
- Modify: `scripts/static-security.mjs` only if required for an automated static assertion.
- Test: existing static/security CI plus migration text assertion in `tests/foundation/auth-audit.test.ts` if needed.

**Interfaces:**
- Replaces `audit_events_insert` with `WITH CHECK (auth.uid() is not null and actor_id = auth.uid())`.

- [ ] **Step 1: Add a failing test/assertion requiring actor-integrity enforcement.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Add the versioned migration that drops/recreates only the insert policy.**
- [ ] **Step 4: Verify GREEN and all existing RLS/static tests.**
- [ ] **Step 5: Commit.**

### Task 4: RED/GREEN successful sign-in audit wiring

**Files:**
- Modify: `app/login/page.tsx`
- Test: `tests/foundation/auth-audit.test.ts`

**Interfaces:**
- On successful password authentication, records `auth.sign_in_succeeded` with actor ID from Supabase user and safe metadata before navigation to `/dashboard`.
- Failed password authentication does not call WASDOK `audit_events`; Supabase Auth logs remain authoritative for that unauthenticated failure.

- [ ] **Step 1: Add failing source/behavior test proving successful login invokes the auth-audit helper and that password/token values are never passed.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement minimal login wiring.**
- [ ] **Step 4: Verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 5: RED/GREEN intentional sign-out audit wiring

**Files:**
- Modify: `components/sign-out-control.tsx`
- Modify only if required: `lib/auth/session-lifecycle.ts`
- Test: `tests/foundation/auth-audit.test.ts` and `tests/foundation/session-lifecycle.test.ts`

**Interfaces:**
- Attempts `auth.sign_out` audit while the authenticated session still exists.
- Local Supabase sign-out proceeds regardless of audit insertion outcome.

- [ ] **Step 1: Add failing test proving audit attempt occurs before session destruction and audit failure does not prevent sign-out.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement minimal wiring.**
- [ ] **Step 4: Verify GREEN.**
- [ ] **Step 5: Commit.**

### Task 6: Full verification and PR

**Files:**
- No new production behavior.

- [ ] **Step 1: Run `npm run test:run`.**
- [ ] **Step 2: Run `npm run typecheck`.**
- [ ] **Step 3: Run `npm run lint`.**
- [ ] **Step 4: Run `npm run build`.**
- [ ] **Step 5: Run `npm run verify:static`.**
- [ ] **Step 6: Confirm CI is fully green and inspect the diff for credential/token leakage.**
- [ ] **Step 7: Open PR to `feat/wasdok360-release1` with WASDOK-61 traceability and verification evidence.**
