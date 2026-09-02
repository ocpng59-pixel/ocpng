# WASDOK-81 Online Help, User Guidance and Prompt Assistance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a configurable, permission-aware WASDOK 360 Help Centre with contextual field/screen guidance, Guided Entry Prompts, searchable online manual content, training-mode detail, public-safe complaint-intake help, versioned administration and immutable audit evidence.

**Architecture:** Store help topics, context bindings and append-versioned content in PostgreSQL/Supabase behind RLS and audited administration RPCs. Application code consumes a dedicated `lib/help` domain layer; authenticated contextual Help is exposed through the AppShell and `/dashboard/help`, public Help is opt-in and PUBLIC-only, and Help Administration is protected by `help.manage` / `help.publish`. The first release uses human-authored published guidance only; AI assistance remains out of scope.

**Tech Stack:** Next.js 16.3.3 App Router, React 19.2.8, TypeScript 6.0.3, Supabase/PostgreSQL/RLS/RPC, `@supabase/ssr` 0.12.5, `@supabase/supabase-js` 2.112.4, Zod 4.5.4, Vitest 4.1.11, pgTAP, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-02-wasdok-81-online-help-user-guidance-design.md`

## Global Constraints

- Base release branch is `feat/wasdok360-release1`; implementation work must use an isolated WASDOK-81 work branch/worktree created from the latest approved base before Task 1.
- Existing highest migration is `20260902001400_access_control_direct_write_boundary.sql`; WASDOK-81 reserves ordered migrations `20260903001500`, `20260903001600`, and `20260903001700`.
- Help content never overrides RBAC, RLS, security compartments, classification, mandatory validation, statutory decision-making, privacy/statutory notices, or protected-record immutability.
- `help_key` is immutable after creation and remains reserved after retirement.
- Initial locale is `en-PG`; future Tok Pisin locale is `tpi-PG`; locale fallback must never widen security visibility.
- Public help is opt-in, `PUBLIC` classified, contextual only in the initial release, and must not expose internal routes/permissions/system structure.
- Help search must not disclose unauthorized topic titles, snippets, module names or hit counts.
- Raw Help search phrases are not written to immutable audit events.
- Published content is never edited in place; lifecycle is `DRAFT → PUBLISHED → RETIRED`, with prior published versions preserved.
- Help administration permissions are `help.manage` and `help.publish`; no mandatory two-person approval queue is introduced.
- Training mode is presentation-only and must not grant additional application permissions, scopes or compartments.
- Client-facing Help code must not import the service-role client or reference service-role/secret environment variables.
- Example content involving people/cases/agencies/decisions uses fictional `DEMO WASDOK81` material only.
- Existing mandatory privacy/statutory notices remain under their existing stronger governance and are not converted to casually editable Help content.
- Hosted database deployment remains a separate explicit approval gate after merge and post-merge CI.

---

## File Structure

### Database
- Create `supabase/migrations/20260903001500_help_content_foundation.sql` — enums, `help_topics`, `help_context_bindings`, `help_content_versions`, permission catalogue additions, core constraints and baseline RLS.
- Create `supabase/migrations/20260903001600_help_lifecycle_search.sql` — audited administration RPCs, publication lifecycle, authorized contextual discovery/search and public-safe read functions.
- Create `supabase/migrations/20260903001700_help_direct_write_boundary.sql` — direct-write revocations, hardened execution grants, stable-key/immutability guards and final security boundary.
- Create `supabase/tests/help_content_foundation.sql` — schema/constraint/permission/RLS contract.
- Create `supabase/tests/help_lifecycle_search.sql` — lifecycle, audit, search-disclosure, public, locale and training authorization contract.
- Create `supabase/tests/help_direct_write_denial.sql` — direct DML denial and protected history tests.

### Help domain
- Create `lib/help/types.ts` — domain contracts shared by queries/components.
- Create `lib/help/validation.ts` — Zod validation for keys, locale, content, links, search and admin reasons.
- Create `lib/help/queries.ts` — server-only contextual discovery, article retrieval, search and administration-read adapters.
- Create `lib/help/mutations.ts` — server-only audited RPC adapters with safe SQLSTATE mapping.
- Create `lib/help/context.ts` — route/field/action/workflow context request builders and English fallback rules.
- Create `lib/help/training.ts` — training-presentation determination without authorization escalation.

### User-facing Help
- Create `app/dashboard/help/page.tsx` — searchable Help Centre.
- Create `app/dashboard/help/[helpKey]/page.tsx` — authorized article page.
- Create `app/dashboard/help/actions.ts` — authenticated contextual/search server actions used by client components.
- Create `components/help/help-drawer.tsx` — AppShell contextual Help drawer.
- Create `components/help/help-panel-content.tsx` — common rendering for topic guidance.
- Create `components/help/help-field-tip.tsx` — accessible field help.
- Create `components/help/guided-entry-prompt.tsx` — “Show me what to enter” structure/examples.
- Create `components/help/help-search-form.tsx` — search UI.
- Modify `components/app-shell.tsx` — mount Help control/drawer.
- Modify `app/dashboard/layout.tsx` only if server-derived training/user Help context must be passed to AppShell.
- Modify `lib/rbac/navigation.ts` — add Help Centre navigation entry available to authenticated users through an existing permission-safe strategy described in Task 6.
- Modify `lib/rbac/types.ts` — add `help.manage` / `help.publish` to `PermissionCode`.

### Public/complaint Help adoption
- Create `lib/help/public.ts` — PUBLIC-only contextual query adapter with no authenticated assumptions.
- Modify `components/complaints/intake-form.tsx` — accept safe Help bundle and render field tips/Guided Entry Prompt while retaining static fallback hints during migration.
- Modify `app/dashboard/complaints/new/page.tsx` — load authenticated Help bundle for assisted intake.
- Modify the existing public complaint intake page that renders `ComplaintIntakeForm` — load PUBLIC-only Help bundle.

### Help Administration
- Create `app/dashboard/help/admin/page.tsx` — topic catalogue.
- Create `app/dashboard/help/admin/new/page.tsx` — topic creation.
- Create `app/dashboard/help/admin/[topicId]/page.tsx` — topic/version/binding editor and history.
- Create `app/dashboard/help/admin/actions.ts` — protected server actions.
- Create `components/help/admin/help-topic-form.tsx`.
- Create `components/help/admin/help-version-form.tsx`.
- Create `components/help/admin/help-binding-form.tsx`.
- Create `components/help/admin/help-version-history.tsx`.

### Tests / CI / docs
- Create `tests/help/validation.test.ts`.
- Create `tests/help/queries.test.ts`.
- Create `tests/help/mutations.test.ts`.
- Create `tests/help/routes.test.ts`.
- Create `tests/help/components.test.tsx`.
- Create `tests/help/e2e.test.ts`.
- Create `tests/help/security-boundary.test.ts`.
- Modify `scripts/routes-smoke.mjs`.
- Modify `scripts/static-security.mjs` only if needed to add Help client-boundary assertions without weakening current checks.
- Modify `.github/workflows/ci.yml` — add WASDOK-81 Help E2E after local reset/pgTAP, preserving existing WASDOK-67/78 stages.
- Create `docs/deployment/WASDOK-81-HOSTED-DEPLOYMENT.md` — ordered migration and rollback-safe verifier runbook.

---

### Task 1: Help data foundation and permission catalogue

**Files:**
- Create: `supabase/tests/help_content_foundation.sql`
- Create: `supabase/migrations/20260903001500_help_content_foundation.sql`
- Modify: `lib/rbac/types.ts`
- Test: `supabase/tests/help_content_foundation.sql`

**Interfaces:**
- Produces PostgreSQL enums: `help_content_type`, `help_audience`, `help_visibility`, `help_content_status`, `help_display_region`.
- Produces tables: `public.help_topics`, `public.help_context_bindings`, `public.help_content_versions`.
- Produces permission codes `help.manage` and `help.publish` in `public.permissions` and TypeScript `PermissionCode`.
- No administration mutation RPCs are created in this task.

- [ ] **Step 1: Write the failing pgTAP contract**

Create `supabase/tests/help_content_foundation.sql` with a rollback-wrapped pgTAP suite that asserts:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

select has_table('public', 'help_topics', 'help_topics exists');
select has_table('public', 'help_context_bindings', 'help_context_bindings exists');
select has_table('public', 'help_content_versions', 'help_content_versions exists');
select ok(exists(select 1 from public.permissions where code='help.manage'), 'help.manage exists');
select ok(exists(select 1 from public.permissions where code='help.publish'), 'help.publish exists');
select col_is_pk('public','help_topics','id','help topic id is primary key');
select col_is_unique('public','help_topics','help_key','help key is unique');
select ok((select relrowsecurity from pg_class where oid='public.help_topics'::regclass), 'help_topics RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.help_context_bindings'::regclass), 'bindings RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.help_content_versions'::regclass), 'versions RLS enabled');
-- Add assertions for immutable-key trigger/function presence, binding selector check,
-- unique (topic, locale, version_number), content status values, and PUBLIC classification rule.
select * from finish();
rollback;
```

- [ ] **Step 2: Run the database suite and verify RED**

Run:

```bash
supabase start
supabase db reset
npm run test:rls
```

Expected: existing suites pass; new Help foundation assertions fail because Help schema/permissions do not exist.

- [ ] **Step 3: Implement migration `01500`**

Implement the enums and tables from the design with these non-negotiable constraints:

```sql
alter table public.help_topics
  add constraint help_topics_help_key_format
  check (help_key ~ '^[a-z0-9][a-z0-9_.-]{2,127}$');

alter table public.help_context_bindings
  add constraint help_binding_has_selector
  check (num_nonnulls(route_pattern, field_key, action_key, workflow_step_key) >= 1);

alter table public.help_content_versions
  add constraint help_version_locale_format
  check (locale ~ '^[a-z]{2,3}-[A-Z]{2}$');

create unique index help_content_versions_topic_locale_version_uq
  on public.help_content_versions(help_topic_id, locale, version_number);
```

Add `help.manage` and `help.publish` using idempotent permission inserts. Add RLS to all three Help tables. Add a trigger that rejects updates to `help_topics.help_key` after insert. Do not grant direct mutation rights to `anon`/`authenticated` yet beyond the minimum existing defaults; Task 4 hardens them explicitly.

- [ ] **Step 4: Extend TypeScript `PermissionCode`**

Add:

```ts
  | 'help.manage'
  | 'help.publish'
```

to `lib/rbac/types.ts` and no other new permission strings.

- [ ] **Step 5: Run GREEN verification**

Run:

```bash
supabase db reset
npm run test:rls
npm run typecheck:domain
npm run typecheck
```

Expected: Help foundation contract and all pre-existing database/type tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add supabase/tests/help_content_foundation.sql \
  supabase/migrations/20260903001500_help_content_foundation.sql \
  lib/rbac/types.ts
git commit -m "feat(WASDOK-81): add help content foundation"
```

---

### Task 2: Audited Help administration lifecycle

**Files:**
- Create: `supabase/tests/help_lifecycle_search.sql` (initial lifecycle section)
- Create: `supabase/migrations/20260903001600_help_lifecycle_search.sql`

**Interfaces:**
- Produces authenticated RPCs:
  - `admin_create_help_topic(text,text,text,text,text,text,text,text,text)` → `uuid`
  - `admin_create_help_version(uuid,text,text,text,text,text,text,jsonb,text,text,jsonb,text)` → `uuid`
  - `admin_create_help_binding(uuid,text,text,text,text,text,integer,text)` → `uuid`
  - `admin_update_help_binding(uuid,text,text,text,text,text,integer,boolean,text)` → `void`
  - `admin_publish_help_version(uuid,text)` → `void`
  - `admin_retire_help_version(uuid,text)` → `void`
  - `admin_retire_help_topic(uuid,text)` → `void`
- Every privileged RPC checks `help.manage` or `help.publish` internally, requires a 3–500 character reason, uses `SECURITY DEFINER set search_path=''`, and writes safe immutable audit metadata.

- [ ] **Step 1: Extend pgTAP with RED lifecycle assertions**

Use fictional `DEMO WASDOK81` users/roles. Assert:

```sql
select has_function('public','admin_create_help_topic',
  array['text','text','text','text','text','text','text','text','text']);
select has_function('public','admin_publish_help_version',array['uuid','text']);
select throws_ok(
  $$select public.admin_publish_help_version('81000000-0000-0000-0000-000000000201','x')$$,
  '22023', null, 'short reason rejected'
);
```

Also assert unauthorized users get `42501`, `help.manage` cannot publish without `help.publish`, published content is not modified in place, version numbers are monotonic per topic/locale, and `help.version_published` audit metadata does not contain the article body.

- [ ] **Step 2: Run RED**

```bash
supabase db reset
npm run test:rls
```

Expected: new lifecycle RPC assertions fail only on missing WASDOK-81 behavior.

- [ ] **Step 3: Implement lifecycle helpers and RPCs**

In migration `01600`, add private helpers:

```sql
private.require_help_permission(permission_code text)
private.require_help_reason(reason text)
private.record_help_change(action text, entity_type text, entity_id uuid,
  reason text, before_data jsonb, after_data jsonb)
```

`private.record_help_change` must use the existing immutable `audit_events` boundary and `request_metadata.source='help_content_administration'`. Full `body`, `example_text`, search phrases and secrets must never be copied into audit metadata.

Publishing must lock the topic/locale version set, validate that the selected version is `DRAFT`, retire/supersede the prior current published version atomically, then mark the selected version `PUBLISHED` with `published_at` / `published_by`.

- [ ] **Step 4: Verify RED→GREEN lifecycle**

```bash
supabase db reset
npm run test:rls
```

Expected: all lifecycle assertions pass and existing RLS tests remain green.

- [ ] **Step 5: Commit Task 2**

```bash
git add supabase/tests/help_lifecycle_search.sql \
  supabase/migrations/20260903001600_help_lifecycle_search.sql
git commit -m "feat(WASDOK-81): add audited help publishing lifecycle"
```

---

### Task 3: Authorized contextual discovery, search, public Help and locale fallback

**Files:**
- Modify: `supabase/tests/help_lifecycle_search.sql`
- Modify: `supabase/migrations/20260903001600_help_lifecycle_search.sql`

**Interfaces:**
- Produces read RPCs:
  - `get_context_help(text,text,text,text,text,boolean)` → authorized published topic rows.
  - `search_help(text,text,text,boolean,integer)` → authorized ranked results.
  - `get_help_article(text,text,boolean)` → one authorized article row or zero rows.
  - `get_public_context_help(text,text,text,text,text)` → PUBLIC-only published rows with no internal authorization leakage.
- Locale fallback is requested locale → `en-PG`; fallback never bypasses the topic’s visibility/permission/compartment checks.

- [ ] **Step 1: Add failing search/disclosure tests**

Create DEMO topics for:
- authenticated general guidance;
- `admin.manage_roles` restricted guidance;
- a `RESTRICTED`/compartment-bound article;
- training-only detailed help;
- a PUBLIC complaint-intake field hint;
- English + Tok Pisin versions.

Assert an unauthorized user cannot infer restricted content through title, snippet, count or direct `help_key` lookup. Assert an anonymous caller sees only the explicit PUBLIC topic. Assert `tpi-PG` falls back to `en-PG` only after topic authorization passes.

- [ ] **Step 2: Run RED**

```bash
supabase db reset
npm run test:rls
```

Expected: discovery/search assertions fail because read RPCs do not exist.

- [ ] **Step 3: Implement authorization/discovery helpers**

Add private functions that evaluate:

```text
active topic
+ current published version
+ visibility mode
+ authenticated/public context
+ required permission via public.has_permission()
+ required compartment via public.has_compartment()
+ classification via existing record access primitives
+ audience/training flag
+ locale selection/fallback
```

Search must perform authorization before returning title/snippet data. Do not expose unauthorized counts. Cap `p_limit` to a safe maximum (50) and trim search text; empty/whitespace search returns no ranked results rather than a global dump.

- [ ] **Step 4: Run GREEN**

```bash
supabase db reset
npm run test:rls
```

Expected: all Help lifecycle/search/public/locale assertions and all pre-existing suites pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add supabase/tests/help_lifecycle_search.sql \
  supabase/migrations/20260903001600_help_lifecycle_search.sql
git commit -m "feat(WASDOK-81): add authorized help discovery and search"
```

---

### Task 4: Help direct-write and immutable-history hardening

**Files:**
- Create: `supabase/tests/help_direct_write_denial.sql`
- Create: `supabase/migrations/20260903001700_help_direct_write_boundary.sql`

**Interfaces:**
- Authenticated application users mutate Help administration state only through approved RPCs.
- `anon` has execute only on the PUBLIC-safe read RPC required for complaint-intake Help.
- `authenticated` has execute on authorized Help read RPCs and the admin RPCs; admin RPCs remain internally permission-checked.

- [ ] **Step 1: Write RED direct-write tests**

Follow the existing `pg_temp.try_direct_write` pattern. Under `set local role authenticated`, prove direct INSERT/UPDATE/DELETE cannot change:

```text
help_topics
help_context_bindings
help_content_versions
```

Also prove published version rows and `help_key` cannot be destructively rewritten through ordinary authenticated DML.

- [ ] **Step 2: Run RED**

```bash
supabase db reset
npm run test:rls
```

Expected: at least one direct-write assertion fails before `01700` hardening.

- [ ] **Step 3: Implement migration `01700`**

Explicitly revoke INSERT/UPDATE/DELETE on Help tables from `anon` and `authenticated`. Revoke all public EXECUTE defaults on Help admin functions, then grant only the intended roles. Re-assert the stable-key and published-history guards at the final migration boundary.

- [ ] **Step 4: Run GREEN + full DB reset**

```bash
supabase db reset
npm run test:rls
```

Expected: direct-write denial and all prior suites pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add supabase/tests/help_direct_write_denial.sql \
  supabase/migrations/20260903001700_help_direct_write_boundary.sql
git commit -m "feat(WASDOK-81): harden help administration write boundary"
```

---

### Task 5: Help domain types, validation, query and mutation adapters

**Files:**
- Create: `lib/help/types.ts`
- Create: `lib/help/validation.ts`
- Create: `lib/help/context.ts`
- Create: `lib/help/training.ts`
- Create: `lib/help/queries.ts`
- Create: `lib/help/mutations.ts`
- Create: `lib/help/public.ts`
- Create: `tests/help/validation.test.ts`
- Create: `tests/help/queries.test.ts`
- Create: `tests/help/mutations.test.ts`
- Create: `tests/help/security-boundary.test.ts`

**Interfaces:**

Define in `lib/help/types.ts`:

```ts
export type HelpLocale = 'en-PG' | 'tpi-PG';
export type HelpContentType = 'FIELD_HINT' | 'ENTRY_PROMPT' | 'EXAMPLE' | 'WARNING' |
  'WORKFLOW_GUIDE' | 'ARTICLE' | 'FAQ' | 'GLOSSARY' | 'VALIDATION_HELP' | 'POLICY_GUIDANCE';
export type HelpAudience = 'GENERAL' | 'TRAINING' | 'ADMINISTRATOR' | 'PUBLIC_INTAKE';
export type HelpVisibility = 'PUBLIC' | 'AUTHENTICATED' | 'PERMISSION_RESTRICTED';
export type HelpContentStatus = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
export type HelpDisplayRegion = 'FIELD' | 'SIDE_PANEL' | 'WORKFLOW' | 'RELATED';

export interface HelpTopicView {
  helpKey: string;
  moduleCode: string;
  contentType: HelpContentType;
  audience: HelpAudience;
  classification: string;
  locale: HelpLocale;
  usedFallbackLocale: boolean;
  title: string;
  summary: string | null;
  body: string | null;
  whatToEnter: string | null;
  whyRequired: string | null;
  expectedFormat: string | null;
  suggestedStructure: string[];
  exampleText: string | null;
  warningText: string | null;
}
```

Define query signatures:

```ts
getContextHelp(input: ContextHelpInput): Promise<HelpTopicView[]>
searchHelp(input: HelpSearchInput): Promise<HelpSearchResult[]>
getHelpArticle(helpKey: string, locale: HelpLocale, trainingMode: boolean): Promise<HelpTopicView | null>
getPublicContextHelp(input: PublicContextHelpInput): Promise<HelpTopicView[]>
```

Define mutation adapters for all Task 2 admin RPCs and map `42501`, `22023`, `23505`, `23514` to safe user-facing messages without returning raw PostgreSQL text.

- [ ] **Step 1: Write failing Vitest contracts**

Tests must prove key regex, locale validation, max search length, bounded suggested structure, safe HTTPS/internal links, reason 3–500, safe SQLSTATE mapping, authenticated server client usage, and no service-role import in `lib/help` user-facing/query code.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/validation.test.ts tests/help/queries.test.ts tests/help/mutations.test.ts tests/help/security-boundary.test.ts
```

Expected: missing `lib/help` modules.

- [ ] **Step 3: Implement minimal domain layer**

Use `createServerSupabaseClient()` for authenticated Help query/mutation adapters. `lib/help/public.ts` may use only the existing public/anon Supabase path appropriate to public complaint intake; it must call only `get_public_context_help` and never construct a service client.

`training.ts` returns presentation intent only, e.g.:

```ts
export function resolveTrainingHelpMode(roleTypes: string[]): boolean {
  return roleTypes.includes('training');
}
```

It must not return permissions or alter authorization inputs.

- [ ] **Step 4: Run GREEN**

```bash
npx vitest run tests/help
npm run typecheck:domain
npm run typecheck
```

- [ ] **Step 5: Commit Task 5**

```bash
git add lib/help tests/help
git commit -m "feat(WASDOK-81): add help domain adapters"
```

---

### Task 6: Authenticated Help Centre and article routes

**Files:**
- Create: `app/dashboard/help/page.tsx`
- Create: `app/dashboard/help/[helpKey]/page.tsx`
- Create: `app/dashboard/help/actions.ts`
- Create: `components/help/help-search-form.tsx`
- Create: `components/help/help-panel-content.tsx`
- Create: `tests/help/routes.test.ts`
- Modify: `lib/rbac/navigation.ts`
- Modify: `scripts/routes-smoke.mjs`

**Interfaces:**
- `/dashboard/help?q=<text>&module=<optional>&locale=<optional>` renders only results from `searchHelp`.
- `/dashboard/help/[helpKey]` calls `getHelpArticle` and `notFound()` when unauthorized/missing.
- Help Centre navigation must not require users to possess `help.manage`; ordinary authenticated access uses the already-authenticated Dashboard boundary. If current navigation resolver requires a permission code for every item, add Help as a top-bar route instead of inventing a blanket `help.view` permission.

- [ ] **Step 1: Write failing route/source tests**

Assert real route files exist, search parameters are consumed server-side, article route fails closed via `notFound`, and no raw database query is embedded in UI components.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/routes.test.ts
```

- [ ] **Step 3: Implement Help Centre pages**

Use server-rendered result lists with safe excerpts. Search form submits GET query parameters. Empty search shows module browsing/recent approved topics through an authorized query—not all protected content.

- [ ] **Step 4: Extend route smoke coverage**

Add `/dashboard/help` and representative article/admin paths to `scripts/routes-smoke.mjs` with their expected protected-route handling.

- [ ] **Step 5: Run GREEN**

```bash
npx vitest run tests/help/routes.test.ts
npm run test:routes
npm run typecheck
```

- [ ] **Step 6: Commit Task 6**

```bash
git add app/dashboard/help components/help/help-search-form.tsx \
  components/help/help-panel-content.tsx tests/help/routes.test.ts \
  lib/rbac/navigation.ts scripts/routes-smoke.mjs
git commit -m "feat(WASDOK-81): add searchable help centre"
```

---

### Task 7: AppShell contextual Help drawer

**Files:**
- Create: `components/help/help-drawer.tsx`
- Modify: `components/app-shell.tsx`
- Modify: `app/dashboard/layout.tsx` only if needed to pass training-mode/user context
- Create/Modify: `tests/help/components.test.tsx`

**Interfaces:**
- `HelpDrawer` uses `usePathname()` to identify the current route and calls `getContextHelpAction({ route, locale: 'en-PG', trainingMode })`.
- The Help button is keyboard accessible, uses `aria-expanded`/`aria-controls`, and drawer close restores sensible focus.
- Help failures display “Guidance is temporarily unavailable.” and never block `children` or sign-out/navigation.

- [ ] **Step 1: Write RED component tests**

Test closed/open state, accessible button name, contextual action call, safe failure state, and zero impact on main application rendering.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/components.test.tsx
```

- [ ] **Step 3: Implement HelpDrawer and AppShell integration**

Keep data fetching behind the authenticated server action; never pass Supabase clients into the browser component.

- [ ] **Step 4: Run GREEN + static boundary**

```bash
npx vitest run tests/help/components.test.tsx
npm run verify:static
npm run typecheck
```

- [ ] **Step 5: Commit Task 7**

```bash
git add components/help/help-drawer.tsx components/app-shell.tsx \
  app/dashboard/layout.tsx tests/help/components.test.tsx
git commit -m "feat(WASDOK-81): add contextual help drawer"
```

---

### Task 8: Field Help and Guided Entry Prompts with complaint-intake migration

**Files:**
- Create: `components/help/help-field-tip.tsx`
- Create: `components/help/guided-entry-prompt.tsx`
- Modify: `components/complaints/intake-form.tsx`
- Modify: `app/dashboard/complaints/new/page.tsx`
- Modify: existing public complaint-intake page that renders `ComplaintIntakeForm`
- Modify: `tests/help/components.test.tsx`
- Create: `tests/help/complaint-intake-integration.test.tsx`

**Interfaces:**

Add a serializable optional prop to the complaint form:

```ts
export interface ComplaintIntakeHelpBundle {
  complainantName?: HelpTopicView;
  governmentBody?: HelpTopicView;
  subject?: HelpTopicView;
  allegation?: HelpTopicView;
  allegationPrompt?: HelpTopicView;
}
```

`ComplaintIntakeForm` must preserve existing static hints as fallback until a central published topic is supplied.

- [ ] **Step 1: Write RED integration tests**

Prove:
- central help replaces only the corresponding optional hint presentation;
- fallback static hint remains when central Help is unavailable;
- allegation Guided Entry Prompt renders an ordered structure and DEMO example;
- mandatory privacy notice/acknowledgement copy is unchanged;
- public form receives only PUBLIC-safe help.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/complaint-intake-integration.test.tsx
```

- [ ] **Step 3: Implement field and prompt components**

`HelpFieldTip` must use a button/popover/details-style accessible interaction, not hover-only content. `GuidedEntryPrompt` renders human-authored structure/example only; it never generates or writes the user’s field value.

- [ ] **Step 4: Wire authenticated and public Help bundles**

Authenticated assisted intake uses `getContextHelp`; public complaint intake uses `getPublicContextHelp`. Do not share an authenticated data path into the public page.

- [ ] **Step 5: Run GREEN**

```bash
npx vitest run tests/help/complaint-intake-integration.test.tsx tests/help/components.test.tsx
npm run test:run
npm run typecheck
```

- [ ] **Step 6: Commit Task 8**

```bash
git add components/help/help-field-tip.tsx components/help/guided-entry-prompt.tsx \
  components/complaints/intake-form.tsx app/dashboard/complaints/new/page.tsx \
  tests/help
git commit -m "feat(WASDOK-81): add contextual field guidance and prompts"
```

---

### Task 9: Help Content Administration workspace

**Files:**
- Create: `app/dashboard/help/admin/page.tsx`
- Create: `app/dashboard/help/admin/new/page.tsx`
- Create: `app/dashboard/help/admin/[topicId]/page.tsx`
- Create: `app/dashboard/help/admin/actions.ts`
- Create: `components/help/admin/help-topic-form.tsx`
- Create: `components/help/admin/help-version-form.tsx`
- Create: `components/help/admin/help-binding-form.tsx`
- Create: `components/help/admin/help-version-history.tsx`
- Modify: `tests/help/routes.test.ts`
- Modify/Create: `tests/help/mutations.test.ts`

**Interfaces:**
- Every admin page rechecks `help.manage` or `help.publish` server-side before rendering/mutating.
- `help.manage`: topic creation, draft version creation, binding create/update/retire.
- `help.publish`: publish/retire official versions/topics.
- Forms contain no actor IDs, `published_by`, audit actor fields or service credentials; the database derives actor identity from the session.

- [ ] **Step 1: Write RED admin route/action tests**

Assert route files, `use server` actions, required reason capture, permission checks, and no browser-authoritative actor/audit fields.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/routes.test.ts tests/help/mutations.test.ts
```

- [ ] **Step 3: Implement protected administration UI**

Topic page shows stable key, metadata, active bindings, locale/version history and explicit Publish/Retire actions. Editing a published version always creates a new draft; do not expose an in-place edit button for a PUBLISHED row.

- [ ] **Step 4: Add navigation for authorized Help administrators**

Add a Help Administration link only where `help.manage`/`help.publish` authorization supports it. Ordinary Help Centre access remains separate.

- [ ] **Step 5: Run GREEN**

```bash
npx vitest run tests/help
npm run test:routes
npm run typecheck
npm run lint
```

- [ ] **Step 6: Commit Task 9**

```bash
git add app/dashboard/help/admin components/help/admin tests/help \
  lib/rbac/navigation.ts
git commit -m "feat(WASDOK-81): add help content administration"
```

---

### Task 10: Training presentation, locale behavior and seed/demo content

**Files:**
- Modify: `lib/help/training.ts`
- Modify: `lib/help/context.ts`
- Modify: `supabase/seed.sql`
- Create: `tests/help/training-locale.test.ts`

**Interfaces:**
- Training mode can select additional `TRAINING` audience topics only after normal authorization for the topic passes.
- Locale resolver returns `{ requestedLocale, resolvedLocale, usedFallbackLocale }` and defaults to `en-PG`.
- Seed content creates only fictional Help examples/topics, no production user assignment or real protected content.

- [ ] **Step 1: Write RED tests**

Test training role detection, no authorization widening, `tpi-PG → en-PG` fallback marker, and no fallback to an unauthorized English topic.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/training-locale.test.ts
```

- [ ] **Step 3: Add fictional seed topics**

Seed representative `DEMO WASDOK81` Help topics for:
- complaint allegation FIELD_HINT/ENTRY_PROMPT;
- Access Control role administration ARTICLE;
- PUBLIC complaint-intake hint;
- one TRAINING-only walkthrough.

Do not seed production user-role assignments for Help administration.

- [ ] **Step 4: Run GREEN and reset**

```bash
supabase db reset
npm run test:rls
npx vitest run tests/help/training-locale.test.ts
```

- [ ] **Step 5: Commit Task 10**

```bash
git add lib/help/training.ts lib/help/context.ts supabase/seed.sql \
  tests/help/training-locale.test.ts
git commit -m "feat(WASDOK-81): add training and locale help behavior"
```

---

### Task 11: WASDOK-81 end-to-end, CI integration and hosted-deployment runbook

**Files:**
- Create: `tests/help/e2e.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/routes-smoke.mjs`
- Modify: `scripts/static-security.mjs` if necessary
- Create: `docs/deployment/WASDOK-81-HOSTED-DEPLOYMENT.md`

**Interfaces:**
- E2E enabled only with `WASDOK81_HELP_E2E=true`.
- Fixtures use reserved fictional UUIDs and `DEMO WASDOK81` labels.
- Deployment order is strictly `01500 → 01600 → 01700`.

- [ ] **Step 1: Write RED E2E**

Using local Supabase and synthetic users, prove:

```text
help.manage administrator creates topic + draft + binding
help.publish administrator publishes it
authorized user sees it contextually and in search
unauthorized user cannot discover title/snippet/direct key
PUBLIC caller sees only explicitly PUBLIC topic
new version supersedes prior published version without deleting history
retirement removes ordinary visibility
training mode adds only authorized training guidance
help administration audit actions exist with safe metadata
```

- [ ] **Step 2: Run RED against pre-E2E CI state**

```bash
eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export WASDOK81_HELP_E2E="true"
npx vitest run tests/help/e2e.test.ts
```

Expected: if implementation is complete, this may already pass; to preserve valid TDD evidence, introduce the E2E contract before the final integration behavior it uniquely tests (for example the last missing CI/public/training integration) so a targeted RED is observed before GREEN.

- [ ] **Step 3: Add CI stage**

After `supabase db reset` + pgTAP and before final static/type/build checks, add:

```yaml
- name: Online Help end-to-end (WASDOK-81)
  run: |
    eval "$(supabase status -o env)"
    export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
    export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
    export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
    export WASDOK81_HELP_E2E="true"
    npx vitest run tests/help/e2e.test.ts
```

If prior E2E suites mutate state that could affect Help invariants, add an explicit `supabase db reset` immediately before the WASDOK-81 stage rather than relying on accidental fixture isolation.

- [ ] **Step 4: Create hosted deployment runbook**

`docs/deployment/WASDOK-81-HOSTED-DEPLOYMENT.md` must state:

```text
Target: OCPNG Supabase project only, never DLPP/other projects.
Migrations: 20260903001500, 20260903001600, 20260903001700 in strict order.
Use Supabase migration mechanism so hosted migration history is authoritative.
No unapproved fourth migration or ad-hoc production DDL.
Post-deploy verifier uses BEGIN ... ROLLBACK and only DEMO WASDOK81 fixtures.
Verify no DEMO residue after rollback.
Verify migration history, authorized search, public-only disclosure, admin audit, and direct-write denial.
```

- [ ] **Step 5: Run full local verification**

```bash
npm run test:run
npm run test:auth-security
supabase db reset
npm run test:rls
eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export WASDOK67_COMPLAINT_E2E="true"
npx vitest run tests/complaints/intake-e2e.test.ts
export WASDOK78_ACCESS_E2E="true"
npx vitest run tests/access-control/e2e.test.ts
supabase db reset
export WASDOK81_HELP_E2E="true"
npx vitest run tests/help/e2e.test.ts
npm run typecheck:domain
npm run test:domain
npm run test:schema
npm run test:routes
npm run verify:static
npm run typecheck
npm run lint
npm run test:auth-build
```

Expected: zero test failures, zero TypeScript errors, zero lint errors, successful production build/security scan.

- [ ] **Step 6: Commit Task 11**

```bash
git add tests/help/e2e.test.ts .github/workflows/ci.yml scripts \
  docs/deployment/WASDOK-81-HOSTED-DEPLOYMENT.md
git commit -m "test(WASDOK-81): add help end-to-end and deployment gates"
```

---

### Task 12: Merge-preparation security review and evidence reconciliation

**Files:**
- Review all WASDOK-81 changed files.
- Update: `docs/superpowers/specs/2026-09-02-wasdok-81-online-help-user-guidance-design.md` only if implementation-compatible clarifications are required.
- Update: `docs/superpowers/plans/2026-09-03-wasdok-81-online-help-user-guidance.md` only to reconcile executed migration/runbook facts; never rewrite history to hide deviations.
- Jira: add a WASDOK-81 evidence comment; do not transition to Done.

**Interfaces:**
- No code or schema acceptance claim without exact-head CI evidence.
- Merge approval remains a separate explicit user gate.
- Hosted deployment approval remains a separate explicit user gate after merge and post-merge CI.

- [ ] **Step 1: Review the final diff against all 16 acceptance criteria in the design spec**

Create a checklist mapping each criterion to tests/files. Treat any missing negative-access/search-disclosure test as a blocker.

- [ ] **Step 2: Verify client/security boundaries**

Search the final diff for:

```text
SUPABASE_SERVICE_ROLE_KEY
service_role
createServiceSupabaseClient
raw search logging
dangerouslySetInnerHTML
```

Any client-facing secret/service reference is a blocker. `dangerouslySetInnerHTML` is prohibited unless an explicitly reviewed sanitizer/allowlist contract is present and tested; structured plain-text rendering is preferred for Release 1.

- [ ] **Step 3: Verify exact-head CI and Netlify preview**

Do not rely on prior task runs. Require the exact final commit SHA to have successful OCPNG Release 1 CI and successful deploy-preview status before presenting merge approval.

- [ ] **Step 4: Record Jira evidence**

Comment on WASDOK-81 with branch, final head SHA, PR number, migration list, test counts, CI run, known non-blocking limitations and explicit statement that no hosted production deployment has occurred.

- [ ] **Step 5: Stop at merge gate**

Present the exact user phrase:

```text
Approve WASDOK-81 PR #<number> merge.
```

Do not merge until that explicit approval is received.

---

## Post-Merge / Hosted Deployment Gates

These are execution gates, not implementation tasks to perform without approval.

1. After explicit merge approval, merge only the reviewed PR with expected-head-SHA protection.
2. Verify post-merge CI on the exact release-branch merge commit.
3. Then request: `Approve WASDOK-81 hosted Supabase deployment of migrations 01500–01700.`
4. Apply only `01500 → 01600 → 01700` to the OCPNG Supabase project using the migration mechanism.
5. Run rollback-safe `DEMO WASDOK81` hosted verification and confirm no residue.
6. Re-run Supabase Security Advisor; classify new findings before closure.
7. Conduct closure review against Jira acceptance criteria and design spec.
8. Only when clean, request: `Approve WASDOK-81 closure.`

## Execution Notes

- Use strict RED→GREEN TDD for every task. A failing test must fail for the intended missing behavior, not because of fixture/configuration errors.
- Preserve existing WASDOK-67 and WASDOK-78 CI coverage; WASDOK-81 must not weaken or skip prior security gates.
- Keep files focused. Do not combine Help query, mutation, UI and validation responsibilities into one large module.
- Do not introduce an AI SDK/model dependency in WASDOK-81.
- Do not create a generic `help.view` permission merely to make navigation convenient; ordinary Help discovery follows existing authorized application context.
- No production migration, user mutation or Help publication is authorized by this plan document.
