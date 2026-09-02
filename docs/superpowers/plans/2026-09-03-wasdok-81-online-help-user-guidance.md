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
- Create `supabase/tests/help_content_foundation.sql`.
- Create `supabase/tests/help_lifecycle_search.sql`.
- Create `supabase/tests/help_direct_write_denial.sql`.

### Help domain
- Create `lib/help/types.ts`.
- Create `lib/help/validation.ts`.
- Create `lib/help/context.ts`.
- Create `lib/help/training.ts`.
- Create `lib/help/queries.ts`.
- Create `lib/help/mutations.ts`.
- Create `lib/help/public.ts`.

### User-facing Help
- Create `app/dashboard/help/page.tsx`.
- Create `app/dashboard/help/[helpKey]/page.tsx`.
- Create `app/dashboard/help/actions.ts`.
- Create `components/help/help-drawer.tsx`.
- Create `components/help/help-panel-content.tsx`.
- Create `components/help/help-field-tip.tsx`.
- Create `components/help/guided-entry-prompt.tsx`.
- Create `components/help/help-search-form.tsx`.
- Modify `components/app-shell.tsx`.

### Public/complaint Help adoption
- Modify `components/complaints/intake-form.tsx`.
- Modify `app/dashboard/complaints/new/page.tsx`.
- Modify `app/complaints/intake/page.tsx`.

### Help Administration
- Create `app/dashboard/help/admin/page.tsx`.
- Create `app/dashboard/help/admin/new/page.tsx`.
- Create `app/dashboard/help/admin/[topicId]/page.tsx`.
- Create `app/dashboard/help/admin/actions.ts`.
- Create `components/help/admin/help-topic-form.tsx`.
- Create `components/help/admin/help-version-form.tsx`.
- Create `components/help/admin/help-binding-form.tsx`.
- Create `components/help/admin/help-version-history.tsx`.

### Existing authorization / seed / verification files
- Modify `lib/rbac/types.ts` — add `help.manage` / `help.publish`.
- Modify `supabase/seed.sql` — fictional Help seed content only.
- Modify `scripts/routes-smoke.mjs`.
- Modify `scripts/static-security.mjs` — enforce Help client/service-role boundary.
- Modify `.github/workflows/ci.yml`.
- Create `docs/deployment/WASDOK-81-HOSTED-DEPLOYMENT.md`.

### Tests
- Create `tests/help/validation.test.ts`.
- Create `tests/help/queries.test.ts`.
- Create `tests/help/mutations.test.ts`.
- Create `tests/help/routes.test.ts`.
- Create `tests/help/components.test.tsx`.
- Create `tests/help/complaint-intake-integration.test.tsx`.
- Create `tests/help/training-locale.test.ts`.
- Create `tests/help/security-boundary.test.ts`.
- Create `tests/help/e2e.test.ts`.
- Create `tests/help/ci-contract.test.ts`.

---

### Task 1: Help data foundation and permission catalogue

**Files:**
- Create: `supabase/tests/help_content_foundation.sql`
- Create: `supabase/migrations/20260903001500_help_content_foundation.sql`
- Modify: `lib/rbac/types.ts`

**Interfaces:**
- Produces PostgreSQL enums `help_content_type`, `help_audience`, `help_visibility`, `help_content_status`, `help_display_region`.
- Produces `public.help_topics`, `public.help_context_bindings`, `public.help_content_versions`.
- Produces permission codes `help.manage` and `help.publish` in both PostgreSQL and TypeScript.

- [ ] **Step 1: Write the failing pgTAP contract**

Create `supabase/tests/help_content_foundation.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

select has_table('public','help_topics','help_topics exists');
select has_table('public','help_context_bindings','help_context_bindings exists');
select has_table('public','help_content_versions','help_content_versions exists');
select ok(exists(select 1 from public.permissions where code='help.manage'),'help.manage exists');
select ok(exists(select 1 from public.permissions where code='help.publish'),'help.publish exists');
select col_is_pk('public','help_topics','id','help topic id is primary key');
select col_is_unique('public','help_topics','help_key','help key is unique');
select ok((select relrowsecurity from pg_class where oid='public.help_topics'::regclass),'help_topics RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.help_context_bindings'::regclass),'bindings RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.help_content_versions'::regclass),'versions RLS enabled');
select ok(exists(select 1 from pg_constraint where conname='help_binding_has_selector'),'binding selector check exists');
select ok(exists(select 1 from pg_constraint where conname='help_topics_public_classification'),'PUBLIC visibility/classification check exists');
select ok(exists(select 1 from pg_indexes where indexname='help_content_versions_topic_locale_version_uq'),'topic/locale/version unique index exists');
select ok(exists(select 1 from pg_trigger where tgname='help_topics_immutable_help_key' and not tgisinternal),'immutable help_key trigger exists');
select ok(exists(select 1 from pg_constraint where conname='help_content_versions_locale_format'),'locale format constraint exists');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the suite and verify RED**

```bash
supabase start
supabase db reset
npm run test:rls
```

Expected: existing suites pass; the new Help assertions fail because the schema and permissions do not exist.

- [ ] **Step 3: Implement `20260903001500_help_content_foundation.sql`**

Create the design enums/tables and exact constraints:

```sql
alter table public.help_topics
  add constraint help_topics_help_key_format
  check (help_key ~ '^[a-z0-9][a-z0-9_.-]{2,127}$');

alter table public.help_topics
  add constraint help_topics_public_classification
  check (visibility <> 'PUBLIC'::help_visibility or classification = 'PUBLIC'::security_classification);

alter table public.help_context_bindings
  add constraint help_binding_has_selector
  check (num_nonnulls(route_pattern, field_key, action_key, workflow_step_key) >= 1);

alter table public.help_content_versions
  add constraint help_content_versions_locale_format
  check (locale ~ '^[a-z]{2,3}-[A-Z]{2}$');

create unique index help_content_versions_topic_locale_version_uq
  on public.help_content_versions(help_topic_id, locale, version_number);
```

Add an immutable-key trigger named `help_topics_immutable_help_key`. Add `help.manage` and `help.publish` idempotently to `public.permissions`. Enable RLS on all three Help tables.

- [ ] **Step 4: Extend `PermissionCode`**

In `lib/rbac/types.ts` add only:

```ts
  | 'help.manage'
  | 'help.publish'
```

- [ ] **Step 5: Run GREEN verification**

```bash
supabase db reset
npm run test:rls
npm run typecheck:domain
npm run typecheck
```

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
- Create: `supabase/tests/help_lifecycle_search.sql`
- Create: `supabase/migrations/20260903001600_help_lifecycle_search.sql`

**Interfaces:**
- `admin_create_help_topic(p_help_key text, p_module_code text, p_content_type text, p_audience text, p_visibility text, p_required_permission_code text, p_required_compartment_code text, p_classification text, p_reason text) returns uuid`
- `admin_create_help_version(p_topic_id uuid, p_locale text, p_title text, p_summary text, p_body text, p_what_to_enter text, p_why_required text, p_expected_format text, p_suggested_structure jsonb, p_example_text text, p_warning_text text, p_related_links jsonb, p_reason text) returns uuid`
- `admin_create_help_binding(p_topic_id uuid, p_route_pattern text, p_field_key text, p_action_key text, p_workflow_step_key text, p_display_region text, p_sort_order integer, p_reason text) returns uuid`
- `admin_update_help_binding(p_binding_id uuid, p_route_pattern text, p_field_key text, p_action_key text, p_workflow_step_key text, p_display_region text, p_sort_order integer, p_is_active boolean, p_reason text) returns void`
- `admin_publish_help_version(p_version_id uuid, p_reason text) returns void`
- `admin_retire_help_version(p_version_id uuid, p_reason text) returns void`
- `admin_retire_help_topic(p_topic_id uuid, p_reason text) returns void`

- [ ] **Step 1: Write RED lifecycle pgTAP assertions**

Use fictional `DEMO WASDOK81` users/roles. Include:

```sql
select has_function('public','admin_create_help_topic',
  array['text','text','text','text','text','text','text','text','text']);
select has_function('public','admin_publish_help_version',array['uuid','text']);
select throws_ok(
  $$select public.admin_publish_help_version('81000000-0000-0000-0000-000000000201','x')$$,
  '22023',null,'short reason rejected'
);
```

Also assert `help.manage` cannot publish without `help.publish`, unauthorized users get `42501`, version numbers are monotonic per topic/locale, publishing supersedes the prior current published version atomically, and audit events do not store full article bodies.

- [ ] **Step 2: Run RED**

```bash
supabase db reset
npm run test:rls
```

- [ ] **Step 3: Implement private helpers and lifecycle RPCs**

Add:

```text
private.require_help_permission(permission_code text)
private.require_help_reason(reason text)
private.record_help_change(action text, entity_type text, entity_id uuid,
  reason text, before_data jsonb, after_data jsonb)
```

All RPCs use `SECURITY DEFINER` with `set search_path=''`. `private.record_help_change` writes through the existing immutable audit model with `request_metadata.source='help_content_administration'`; it excludes full `body`, `example_text`, search terms, secrets and tokens.

Publishing must lock the topic/locale version set, require a DRAFT target, retire/supersede the previously current published version, then mark the target PUBLISHED with `published_at` and `published_by` in the same transaction.

- [ ] **Step 4: Run GREEN**

```bash
supabase db reset
npm run test:rls
```

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
- `get_context_help(p_route text, p_field_key text, p_action_key text, p_workflow_step_key text, p_locale text, p_training_mode boolean)` returns authorized published Help rows.
- `search_help(p_query text, p_locale text, p_module_code text, p_training_mode boolean, p_limit integer)` returns authorized ranked results.
- `get_help_article(p_help_key text, p_locale text, p_training_mode boolean)` returns one authorized article or zero rows.
- `get_public_context_help(p_route text, p_field_key text, p_action_key text, p_workflow_step_key text, p_locale text)` returns PUBLIC-only published rows.

- [ ] **Step 1: Add RED discovery/search tests**

Create DEMO topics for authenticated general guidance, `admin.manage_roles` restricted guidance, a compartment-restricted article, training-only help, a PUBLIC complaint-intake hint, and English/Tok Pisin versions. Assert unauthorized users cannot infer restricted titles/snippets/counts/direct keys; anonymous callers see only explicit PUBLIC content; and `tpi-PG → en-PG` fallback occurs only after authorization passes.

- [ ] **Step 2: Run RED**

```bash
supabase db reset
npm run test:rls
```

- [ ] **Step 3: Implement discovery and search**

Enforce this order server-side/database-side:

```text
active topic
→ visibility/request context
→ required permission
→ required compartment/classification
→ audience/training eligibility
→ current published version
→ requested locale or authorized en-PG fallback
→ ranking/snippet generation
```

Search must not reveal unauthorized counts. Cap `p_limit` at 50. Empty/whitespace query returns no ranked results. Public read function refuses any topic that is not both `visibility='PUBLIC'` and `classification='PUBLIC'`.

- [ ] **Step 4: Run GREEN**

```bash
supabase db reset
npm run test:rls
```

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
- Authenticated users mutate Help state only through approved RPCs.
- `anon` receives EXECUTE only on `get_public_context_help`.
- `authenticated` receives EXECUTE on authorized Help read RPCs and admin RPCs; admin RPCs remain internally permission checked.

- [ ] **Step 1: Write RED direct-write tests**

Follow the existing `pg_temp.try_direct_write` pattern and prove direct INSERT/UPDATE/DELETE cannot change `help_topics`, `help_context_bindings`, or `help_content_versions` under `set local role authenticated`.

- [ ] **Step 2: Run RED**

```bash
supabase db reset
npm run test:rls
```

- [ ] **Step 3: Implement `01700`**

Revoke INSERT/UPDATE/DELETE on all Help tables from `anon` and `authenticated`. Revoke default PUBLIC function execution and grant only intended role/function combinations. Reassert immutable `help_key` and published-history protections at the final boundary.

- [ ] **Step 4: Run GREEN**

```bash
supabase db reset
npm run test:rls
```

- [ ] **Step 5: Commit Task 4**

```bash
git add supabase/tests/help_direct_write_denial.sql \
  supabase/migrations/20260903001700_help_direct_write_boundary.sql
git commit -m "feat(WASDOK-81): harden help administration write boundary"
```

---

### Task 5: Help domain types, validation, queries and mutations

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

Query signatures:

```ts
getContextHelp(input: ContextHelpInput): Promise<HelpTopicView[]>
searchHelp(input: HelpSearchInput): Promise<HelpSearchResult[]>
getHelpArticle(helpKey: string, locale: HelpLocale, trainingMode: boolean): Promise<HelpTopicView | null>
getPublicContextHelp(input: PublicContextHelpInput): Promise<HelpTopicView[]>
```

- [ ] **Step 1: Write RED Vitest contracts**

Test help-key regex, locale validation, search length, bounded `suggestedStructure`, safe internal/HTTPS links, reason 3–500, safe SQLSTATE mapping, authenticated server client usage and absence of service-role imports in client-facing/query code.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/validation.test.ts tests/help/queries.test.ts \
  tests/help/mutations.test.ts tests/help/security-boundary.test.ts
```

- [ ] **Step 3: Implement the domain layer**

Use `createServerSupabaseClient()` for authenticated queries/mutations. `lib/help/public.ts` calls only the PUBLIC-safe RPC through the existing anon/public client pattern; it never imports the service client. Mutation adapters map `42501`, `22023`, `23505`, and `23514` to safe messages without returning raw PostgreSQL details.

`lib/help/training.ts` remains presentation-only:

```ts
export function resolveTrainingHelpMode(roleTypes: readonly string[]): boolean {
  return roleTypes.includes('training');
}
```

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
- Modify: `scripts/routes-smoke.mjs`

**Interfaces:**
- `/dashboard/help?q=<text>&module=<optional>&locale=<optional>` uses `searchHelp` only.
- `/dashboard/help/[helpKey]` uses `getHelpArticle` and `notFound()` when unauthorized/missing.
- Ordinary Help Centre access relies on the authenticated Dashboard layout; do not add a generic `help.view` permission.

- [ ] **Step 1: Write RED route tests**

Assert route files exist, `searchParams` are consumed server-side, direct article access fails closed, and UI files contain no raw SQL/Supabase table queries.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/routes.test.ts
```

- [ ] **Step 3: Implement Help Centre and article pages**

Search is GET-based and returns authorized safe excerpts. Empty search renders authorized module/recent-topic browsing from a server query rather than dumping all topics.

- [ ] **Step 4: Extend route smoke checks**

Add `/dashboard/help`, `/dashboard/help/<demo-key>`, and `/dashboard/help/admin` protected-route expectations to `scripts/routes-smoke.mjs`.

- [ ] **Step 5: Run GREEN**

```bash
npx vitest run tests/help/routes.test.ts
npm run test:routes
npm run typecheck
```

- [ ] **Step 6: Commit Task 6**

```bash
git add app/dashboard/help components/help/help-search-form.tsx \
  components/help/help-panel-content.tsx tests/help/routes.test.ts scripts/routes-smoke.mjs
git commit -m "feat(WASDOK-81): add searchable help centre"
```

---

### Task 7: AppShell contextual Help drawer

**Files:**
- Create: `components/help/help-drawer.tsx`
- Modify: `components/app-shell.tsx`
- Modify: `tests/help/components.test.tsx`

**Interfaces:**
- `HelpDrawer` uses `usePathname()` and calls `getContextHelpAction({ route, locale: 'en-PG' })`.
- The server action resolves current-user training mode internally before calling `getContextHelp`; no role/permission list is trusted from the browser.
- The Help button exposes `aria-expanded` and `aria-controls`.

- [ ] **Step 1: Write RED component tests**

Test closed/open state, keyboard-accessible Help button, current-route lookup, safe failure message and uninterrupted main application rendering.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/components.test.tsx
```

- [ ] **Step 3: Implement HelpDrawer/AppShell integration**

Help failure renders `Guidance is temporarily unavailable.` and never blocks `children`, navigation or sign-out. No Supabase client is passed into the browser component.

- [ ] **Step 4: Run GREEN**

```bash
npx vitest run tests/help/components.test.tsx
npm run verify:static
npm run typecheck
```

- [ ] **Step 5: Commit Task 7**

```bash
git add components/help/help-drawer.tsx components/app-shell.tsx \
  tests/help/components.test.tsx
git commit -m "feat(WASDOK-81): add contextual help drawer"
```

---

### Task 8: Field Help and Guided Entry Prompts for complaint intake

**Files:**
- Create: `components/help/help-field-tip.tsx`
- Create: `components/help/guided-entry-prompt.tsx`
- Modify: `components/complaints/intake-form.tsx`
- Modify: `app/dashboard/complaints/new/page.tsx`
- Modify: `app/complaints/intake/page.tsx`
- Create: `tests/help/complaint-intake-integration.test.tsx`
- Modify: `tests/help/components.test.tsx`

**Interfaces:**

```ts
export interface ComplaintIntakeHelpBundle {
  complainantName?: HelpTopicView;
  governmentBody?: HelpTopicView;
  subject?: HelpTopicView;
  allegation?: HelpTopicView;
  allegationPrompt?: HelpTopicView;
}
```

`ComplaintIntakeForm` receives optional `help?: ComplaintIntakeHelpBundle` and retains its current static hints as fallback.

- [ ] **Step 1: Write RED integration tests**

Prove central Help is shown when supplied, static hint fallback remains when central Help is unavailable, allegation prompt renders ordered guidance/DEMO example, mandatory privacy copy is unchanged, and the public form cannot receive non-PUBLIC guidance.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/complaint-intake-integration.test.tsx
```

- [ ] **Step 3: Implement accessible field/prompt components**

Use button/details/popover semantics; never hover-only Help. `GuidedEntryPrompt` displays approved content and never writes generated text into the form field.

- [ ] **Step 4: Wire authenticated and public bundles**

`app/dashboard/complaints/new/page.tsx` uses authenticated Help queries. `app/complaints/intake/page.tsx` uses only `getPublicContextHelp` through `lib/help/public.ts`.

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
  app/complaints/intake/page.tsx tests/help
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
- Modify: `app/dashboard/help/page.tsx`
- Modify: `tests/help/routes.test.ts`
- Modify: `tests/help/mutations.test.ts`

**Interfaces:**
- Admin pages call `has_permission('help.manage')` and/or `has_permission('help.publish')` server-side before rendering.
- Help Centre page shows `Manage Help content` only to an authorized Help administrator; this is not an authorization boundary.
- Forms contain no actor IDs, `published_by`, audit actor fields or service credentials.

- [ ] **Step 1: Write RED admin route/action tests**

Assert `use server` actions, server permission checks, required reason capture, no browser-authoritative actor fields, and no in-place editing control for PUBLISHED versions.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/routes.test.ts tests/help/mutations.test.ts
```

- [ ] **Step 3: Implement administration UI**

Topic detail shows stable key, metadata, bindings, locale/version history and explicit Publish/Retire actions. Editing official content creates a new DRAFT version.

- [ ] **Step 4: Run GREEN**

```bash
npx vitest run tests/help
npm run test:routes
npm run typecheck
npm run lint
```

- [ ] **Step 5: Commit Task 9**

```bash
git add app/dashboard/help components/help/admin tests/help
git commit -m "feat(WASDOK-81): add help content administration"
```

---

### Task 10: Training/locale behavior, fictional seed content and full Help E2E

**Files:**
- Modify: `lib/help/training.ts`
- Modify: `lib/help/context.ts`
- Modify: `supabase/seed.sql`
- Create: `tests/help/training-locale.test.ts`
- Create: `tests/help/e2e.test.ts`

**Interfaces:**
- Training mode adds only authorized `TRAINING` audience guidance.
- Locale resolver returns `{ requestedLocale, resolvedLocale, usedFallbackLocale }`.
- E2E is gated by `WASDOK81_HELP_E2E=true` and uses fictional `DEMO WASDOK81` fixtures.

- [ ] **Step 1: Write RED training/locale tests and E2E contract**

The E2E contract must require representative seeded Help topics that do not exist before this task, including `complaints.intake.allegation`, a PUBLIC complaint-intake hint, and a TRAINING walkthrough. This guarantees the targeted run is RED for the intended missing integration rather than fixture failure.

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/training-locale.test.ts

eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export WASDOK81_HELP_E2E="true"
npx vitest run tests/help/e2e.test.ts
```

Expected: missing representative `DEMO WASDOK81` Help seed/integration assertions fail while database connectivity succeeds.

- [ ] **Step 3: Add fictional Help seed topics and finalize locale/training resolver**

Seed only fictional Help content; do not seed a production Help administrator or grant production users `help.manage`/`help.publish`.

- [ ] **Step 4: Run GREEN**

```bash
supabase db reset
npm run test:rls
npx vitest run tests/help/training-locale.test.ts

eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export WASDOK81_HELP_E2E="true"
npx vitest run tests/help/e2e.test.ts
```

E2E must prove create/draft/bind/publish, authorized contextual/search visibility, unauthorized non-discovery by title/snippet/direct key, PUBLIC-only anonymous help, superseding version history, retirement, training-detail without authorization widening, and safe audit evidence.

- [ ] **Step 5: Commit Task 10**

```bash
git add lib/help/training.ts lib/help/context.ts supabase/seed.sql \
  tests/help/training-locale.test.ts tests/help/e2e.test.ts
git commit -m "test(WASDOK-81): add training locale and help end-to-end"
```

---

### Task 11: CI contract, static security enforcement and deployment runbook

**Files:**
- Create: `tests/help/ci-contract.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `scripts/static-security.mjs`
- Create: `docs/deployment/WASDOK-81-HOSTED-DEPLOYMENT.md`

**Interfaces:**
- CI stage is named `Online Help end-to-end (WASDOK-81)`.
- Deployment order is strictly `01500 → 01600 → 01700`.

- [ ] **Step 1: Write RED CI/runbook contract test**

Test source text for:

```ts
expect(ci).toContain('Online Help end-to-end (WASDOK-81)');
expect(ci).toContain('WASDOK81_HELP_E2E');
expect(runbook).toContain('20260903001500');
expect(runbook).toContain('20260903001600');
expect(runbook).toContain('20260903001700');
expect(runbook).toContain('BEGIN');
expect(runbook).toContain('ROLLBACK');
expect(runbook).toContain('DEMO WASDOK81');
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run tests/help/ci-contract.test.ts
```

- [ ] **Step 3: Add CI stage and static boundary**

Add after local pgTAP/reset stages and before final type/static/build gates:

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

If prior E2E state can affect Help invariants, add `supabase db reset` immediately before this stage. Extend `scripts/static-security.mjs` so client-facing `components/help/**` and public Help code fail verification if they reference `SUPABASE_SERVICE_ROLE_KEY`, `service_role`, or import the privileged service client.

- [ ] **Step 4: Create hosted deployment runbook**

The runbook must state:

```text
Target only OCPNG Supabase project; never DLPP/other projects.
Apply 20260903001500 → 20260903001600 → 20260903001700 using the migration mechanism.
No unapproved fourth migration or ad-hoc production DDL.
Hosted verifier uses BEGIN ... ROLLBACK and only DEMO WASDOK81 fixtures.
Verify migration history, authorized search, PUBLIC-only disclosure, audit events, direct-write denial, and zero DEMO residue.
```

- [ ] **Step 5: Run GREEN**

```bash
npx vitest run tests/help/ci-contract.test.ts
npm run verify:static
npm run typecheck
```

- [ ] **Step 6: Commit Task 11**

```bash
git add tests/help/ci-contract.test.ts .github/workflows/ci.yml \
  scripts/static-security.mjs docs/deployment/WASDOK-81-HOSTED-DEPLOYMENT.md
git commit -m "test(WASDOK-81): add help CI and deployment gates"
```

---

### Task 12: Full verification, review and merge preparation

**Files:**
- Review all WASDOK-81 changed files.
- Update Jira WASDOK-81 evidence only after exact-head verification.

**Interfaces:**
- Merge approval remains a separate explicit user gate.
- Hosted deployment remains a later separate explicit user gate.

- [ ] **Step 1: Run the full verification suite on the exact final head**

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
eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
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

Expected: zero test failures, zero TypeScript errors, zero lint errors, successful build/browser credential scan/HTTP auth boundary.

- [ ] **Step 2: Perform security/diff review**

Search final changed files for:

```text
SUPABASE_SERVICE_ROLE_KEY
service_role
createServiceSupabaseClient
raw Help search logging
dangerouslySetInnerHTML
```

Any client-facing service credential reference is a blocker. Prefer structured text rendering; if `dangerouslySetInnerHTML` exists, it is a blocker unless an explicit allowlist sanitizer and regression tests are included and reviewed.

- [ ] **Step 3: Map all 16 design acceptance criteria to evidence**

Document which file/test/CI step proves each criterion. Missing negative-access or search-disclosure evidence is a blocker.

- [ ] **Step 4: Open the PR as Draft and require exact-head CI**

Target `feat/wasdok360-release1`. PR body must list migrations `01500–01700`, state that hosted Supabase has not been changed, and preserve separate merge/deployment gates.

- [ ] **Step 5: Record Jira evidence after CI is green**

Comment on WASDOK-81 with branch, final head SHA, PR number, migration list, test/CI evidence, known non-blocking limitations and explicit statement that no hosted deployment occurred.

- [ ] **Step 6: Stop at the merge gate**

Present exactly:

```text
Approve WASDOK-81 PR #<number> merge.
```

Do not merge until that approval is received.

---

## Post-Merge / Hosted Deployment Gates

1. After explicit merge approval, merge only the reviewed PR using expected-head-SHA protection.
2. Verify post-merge CI on the exact release-branch merge commit.
3. Request: `Approve WASDOK-81 hosted Supabase deployment of migrations 01500–01700.`
4. Apply only `01500 → 01600 → 01700` to the OCPNG Supabase project using the migration mechanism.
5. Run rollback-safe `DEMO WASDOK81` hosted verification and confirm zero residue.
6. Re-run Supabase Security Advisor and classify findings before closure.
7. Conduct closure review against Jira and design acceptance criteria.
8. Only when clean, request: `Approve WASDOK-81 closure.`

## Execution Notes

- Use strict RED→GREEN TDD for every implementation task; a RED must fail for the intended missing behavior rather than a broken fixture/configuration.
- Preserve existing WASDOK-67 and WASDOK-78 CI coverage; WASDOK-81 must not weaken or skip prior security gates.
- Keep Help query, mutation, UI and validation responsibilities in separate focused files.
- Do not introduce an AI SDK/model dependency in WASDOK-81.
- Do not create a generic `help.view` permission merely for navigation convenience.
- No production migration, production user mutation or production Help publication is authorized by this plan.
