# WASDOK-64 Intake State Implementation Plan

> **For agentic workers:** Execute the approved task in this session using superpowers:executing-plans. Obtain an independent code review before publishing the final PR.

**Goal:** Enforce persisted intake state, provenance and audit integrity in Postgres.

**Architecture:** An additive intake-state table uses RLS, constrained provenance and invoker triggers. Trusted-server-only RPCs create drafts and submit by expected revision. The existing UI remains validation-only until WASDOK-65/66 connect the approved persistence/privacy path.

**Tech Stack:** Existing Supabase/Postgres, pgTAP, Next.js/TypeScript and GitHub CI; no new runtime dependency.

**Spec:** `docs/architecture/complaint-intake-state.md`

## Global constraints

- Every new public business table requires RLS in the same migration set.
- Protected access requires permission + scope/assignment + compartment. System Administrator is not a protected-content bypass.
- All test identities and records are fictional and visibly DEMO.
- No hosted schema mutation before the controlled merge/deployment decision.

## Task 1: Persist and guard state

Files: CLI-generated migration `supabase/migrations/20260902000800_complaint_intake_state_controls.sql`; `supabase/tests/complaint_intake_state.sql`.

Interfaces: `create_complaint_intake_draft(text,text,uuid) returns uuid`; `submit_complaint_intake(uuid,integer) returns uuid`, executable by service_role only.

- [ ] Write pgTAP tests for missing table/RLS and permitted/forbidden operations. Use the existing auth profile/RBAC fixtures pattern and rollback every fixture.
- [ ] Verify the tests fail before the migration. If local Docker is unavailable, run the existing CI database job on a review branch and retain its red result.
- [ ] Implement the table, provenance and actor checks, immutable attributes, submitted-row protection, revision condition and safe atomic audit events.
- [ ] Restrict table/RPC privileges and reserve lifecycle audit actions from direct authenticated insertion.
- [ ] Run pgTAP against the complete migration chain; fix every SQL or security failure before marking this task complete.

Representative assertions:

```sql
select has_table('public','complaint_intakes','Intake state is persisted');
select ok((select relrowsecurity from pg_class where oid='public.complaint_intakes'::regclass),'RLS enabled');
select throws_ok($$select public.submit_complaint_intake('64000000-0000-4000-8000-000000000001',1)$$,
  '42501',null,'Browser cannot call trusted submission');
```

## Task 2: Verify and publish

Files: migration, database tests, architecture/plan documentation, `.gitignore` (Supabase generated temp files).

- [ ] Run `npm run test:run`, both typechecks, domain/schema/route/static checks, lint and production authentication build checks.
- [ ] Review migration privileges, trigger rollback and the future WASDOK-65 integration contract independently; resolve findings.
- [ ] Publish a review-ready PR against `feat/wasdok360-release1`. Verify CI on the exact final commit, including the complete database suite.
- [ ] Record acceptance evidence in WASDOK-64. Keep In Progress pending approved merge, migration deployment and post-merge verification.
