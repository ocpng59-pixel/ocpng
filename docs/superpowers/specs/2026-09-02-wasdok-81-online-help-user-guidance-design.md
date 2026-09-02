# WASDOK-81 — Online Help, User Guidance and Prompt Assistance Design

**Status:** Approved architecture; formal design specification  
**Date:** 2026-09-02  
**Jira:** WASDOK-81 — Implement Contextual Online Help, Guided Entry Prompts and User Manual  
**Target product:** WASDOK 360  
**Base release:** `feat/wasdok360-release1`

## 1. Purpose

WASDOK 360 requires an integrated user-assistance capability that tells officers what a screen or field is for, what information to enter, what format is expected, what must not be entered, and what procedural step follows. The assistance must be available at the point of work and must also form a searchable online user manual.

The design replaces scattered hard-coded instructional strings with a centrally managed, versioned help-content service. It must support ordinary operational users, administrators, public complaint-intake users where explicitly allowed, and DEMO/UAT training users without becoming an authorization bypass or a substitute for statutory human decision-making.

The subsystem is named **WASDOK 360 Help Centre, User Guidance & Prompt Assistance**.

## 2. Design goals

The subsystem shall:

1. provide contextual help directly from relevant WASDOK screens and fields;
2. provide guided-entry prompts and fictional examples for narrative fields;
3. provide screen and workflow guidance including prerequisites, authority and expected outcomes;
4. provide a searchable online Help Centre at `/dashboard/help` for authenticated users;
5. allow approved public help only for explicitly public workflows such as complaint intake;
6. filter help content so it does not disclose restricted internal functionality to unauthorized users;
7. allow authorized administrators to maintain and publish help without application source-code changes;
8. preserve previous published guidance through versioning;
9. support English initially while allowing Tok Pisin and other locales later without schema redesign;
10. provide more detailed training guidance without weakening RBAC, RLS, compartments, audit or record controls;
11. generate immutable audit evidence for privileged help-content administration;
12. provide a safe foundation for a later conversational “Ask WASDOK Help” capability that retrieves only approved published guidance.

## 3. Non-goals

WASDOK-81 does not:

- implement an AI assistant in the first release;
- allow help text to authorize an operation;
- replace RLS, permission checks, classifications, compartments or server-side validation;
- make findings, legal conclusions, Commission decisions or misconduct determinations for users;
- store live case facts inside help content or examples;
- expose infrastructure secrets, Supabase service-role credentials or hidden system configuration;
- audit every tooltip view or every search phrase;
- create a mandatory two-person approval workflow for help publishing.

## 4. User experience

### 4.1 Global Help entry point

The authenticated WASDOK `AppShell` shall expose a persistent **Help** control in the top bar. Selecting Help opens a contextual side panel for the current route. The panel may show:

- screen purpose;
- prerequisites;
- required authority;
- ordered steps;
- field-entry guidance;
- warnings;
- related manual articles;
- related glossary entries;
- a link to the full Help Centre.

The Help panel must never show help topics the current user is not permitted to discover.

### 4.2 Field-level help

Important fields may expose an accessible help control adjacent to the label. Field help can contain:

- **What to enter**;
- **Why it is required**;
- **Expected format**;
- **Suggested structure**;
- **Example**;
- **Do not enter**;
- related procedure/manual links.

The control must be keyboard accessible, have an accessible name and expose help content through standard semantic elements rather than hover-only behavior.

### 4.3 Guided Entry Prompts

Narrative fields may expose a **Show me what to enter** action. Guided Entry Prompts provide a structure, not a generated official answer.

For example, a complaint allegation prompt may suggest:

1. background;
2. what happened;
3. when and where it occurred;
4. public body or officer involved;
5. effect on the complainant;
6. evidence available;
7. action already taken;
8. outcome requested.

Prompts for findings, legal matters, Leadership Code matters and Commission functions must explicitly avoid wording that implies guilt, misconduct, legal advice or an official decision before an authorized human has made one.

### 4.4 Screen/workflow help

Complex workflows may show step-level guidance such as “Step 2 of 5 — Jurisdiction Assessment”. Each step may define:

- purpose;
- prerequisites;
- who may perform the step;
- information required;
- expected result;
- next permitted step;
- warnings and escalation notes.

Help describes the workflow but does not itself change workflow state.

### 4.5 Online Help Centre

Authenticated users may access `/dashboard/help`. The Help Centre shall support:

- module browsing;
- full-text search;
- FAQ browsing;
- glossary browsing;
- recently updated guidance;
- related-topic navigation;
- contextual return links to application screens where appropriate.

The Help Centre shall be organized around WASDOK functional domains including Getting Started, Complaints, Investigations, Leadership Code, Annual Statements, Oversight, Compliance, Commission, Legal, Intelligence, Records/Evidence, Reporting, Administration, Security, FAQs and Glossary.

### 4.6 Public help

Public workflows may render only help topics explicitly marked for public visibility and safe for unauthenticated disclosure. Public help must use published content with `PUBLIC` classification and must not expose internal routes, permissions, administrative procedures or restricted terminology that would reveal protected system structure.

A public searchable Help Centre is not required for the initial implementation. Public help is contextual to explicitly public workflows such as complaint intake.

## 5. Help content model

### 5.1 `help_topics`

`help_topics` is the stable logical identity of a help item. Proposed fields:

- `id uuid primary key`;
- `help_key text unique not null` — immutable stable application key, e.g. `complaints.intake.allegation`;
- `module_code text not null`;
- `content_type help_content_type not null`;
- `audience help_audience not null`;
- `visibility help_visibility not null`;
- `required_permission_code text null` referencing the approved permission catalogue by code through validated administration logic;
- `required_compartment_code text null` where discovery itself requires a protected compartment;
- `classification security_classification not null default 'INTERNAL'`;
- `is_active boolean not null default true`;
- `metadata jsonb not null default '{}'`;
- creation/update provenance fields.

`help_key` is an application identifier. It is not editable after creation because routes/components bind to it. Human-readable titles live in versioned content.

### 5.2 `help_context_bindings`

Bindings attach a topic to one or more application contexts. Proposed fields:

- `id uuid primary key`;
- `help_topic_id uuid not null`;
- `route_pattern text null`;
- `field_key text null`;
- `action_key text null`;
- `workflow_step_key text null`;
- `display_region help_display_region not null` — e.g. `FIELD`, `SIDE_PANEL`, `WORKFLOW`, `RELATED`;
- `sort_order integer not null default 0`;
- `is_active boolean not null default true`;
- provenance fields.

At least one context selector must be present. Binding changes are privileged, audited administration operations.

### 5.3 `help_content_versions`

Content is append-versioned rather than overwritten. Proposed fields:

- `id uuid primary key`;
- `help_topic_id uuid not null`;
- `locale text not null default 'en-PG'`;
- `version_number integer not null`;
- `status help_content_status not null` — `DRAFT`, `PUBLISHED`, `RETIRED`;
- `title text not null`;
- `summary text null`;
- `body text null`;
- `what_to_enter text null`;
- `why_required text null`;
- `expected_format text null`;
- `suggested_structure jsonb null` containing an ordered string array only;
- `example_text text null`;
- `warning_text text null`;
- `related_links jsonb null` containing validated internal-help or approved external-reference links;
- `effective_from timestamptz null`;
- `published_at timestamptz null`;
- `published_by uuid null`;
- `created_by uuid not null`;
- `created_at timestamptz not null`;
- `change_reason text not null`.

There may be only one current published version for a given `(help_topic_id, locale)` at a time. Publishing a later version supersedes, but does not delete, the previous published content.

### 5.4 Enumerations

Approved content types:

- `FIELD_HINT`
- `ENTRY_PROMPT`
- `EXAMPLE`
- `WARNING`
- `WORKFLOW_GUIDE`
- `ARTICLE`
- `FAQ`
- `GLOSSARY`
- `VALIDATION_HELP`
- `POLICY_GUIDANCE`

Approved audiences:

- `GENERAL`
- `TRAINING`
- `ADMINISTRATOR`
- `PUBLIC_INTAKE`

Approved visibility modes:

- `PUBLIC`
- `AUTHENTICATED`
- `PERMISSION_RESTRICTED`

Approved content lifecycle:

- `DRAFT`
- `PUBLISHED`
- `RETIRED`

## 6. Authorization model

### 6.1 Ordinary help consumption

Viewing help is not controlled by a blanket `help.view` permission. Help discovery follows the user's existing authorized application context.

A topic is visible only when all applicable conditions pass:

1. the topic is active;
2. a current published version exists for the requested locale or the approved English fallback;
3. the visibility rule allows the request context;
4. the topic's required permission, if any, is satisfied;
5. the topic's required compartment, if any, is satisfied;
6. its classification is permitted by the existing security model;
7. audience restrictions are satisfied.

The server is authoritative. Client-side hiding is not an authorization boundary.

### 6.2 Help administration permissions

Add two approved permissions to the permission catalogue:

- `help.manage` — create topics, edit draft content, create new versions, manage context bindings and retire drafts;
- `help.publish` — publish a draft version, retire published guidance and restore/supersede official published guidance.

A user may hold both permissions. No mandatory two-person approval queue is introduced.

Help administrators cannot use these permissions to grant themselves unrelated application permissions or bypass existing Access Control Administration safeguards.

### 6.3 Training mode

Detailed Training Help is a display mode, not an authorization mode.

A user with an active role whose `role_type='training'` may automatically receive Detailed Training Help. The same detailed presentation may later be offered as a personal preference to other authorized users. In either case, the user receives only help topics already permitted by their normal permissions and compartments.

`TRAINING` audience content may be visible to training-role users and explicitly authorized training administrators. It never confers additional business-data access.

## 7. Publishing and version lifecycle

The lifecycle is intentionally simple:

`DRAFT → PUBLISHED → RETIRED`

Rules:

- edits to a published version create a new draft version;
- a published version is never modified in place;
- publishing requires `help.publish` and a mandatory administrative reason;
- publishing atomically makes the selected version current for its topic/locale and supersedes the previously current published version;
- retirement does not delete historical versions;
- retired topics are not shown to ordinary users;
- stable `help_key` values remain reserved even after retirement so an old key cannot later mean something different;
- deletion of published help history is not exposed through application administration.

## 8. Search design

Initial Help Centre search shall use PostgreSQL full-text search over published help content. Search indexes may include title, summary, body, what-to-enter guidance, glossary terms and approved keywords.

The security order is mandatory:

1. identify candidate published topics;
2. apply help authorization/discovery filters server-side;
3. search/rank only the authorized candidate set or ensure unauthorized rows cannot be returned by RLS/query policy;
4. return safe excerpts.

Search must not reveal titles, snippets, hit counts or module names for unauthorized topics.

Raw Help search phrases are not written to immutable audit events by default. Aggregate privacy-preserving usage analytics may be designed separately later.

## 9. Multilingual design

The initial operational locale is `en-PG` (English). The schema supports independent published versions per locale from the beginning.

A future Tok Pisin locale shall use `tpi-PG`. If no authorized published translation exists for the user's selected locale, the system falls back to the authorized `en-PG` published version and clearly indicates that English is being shown.

Translations are independently versioned and published. A translation cannot expand security visibility beyond its parent topic.

## 10. Administration user experience

Help administration shall be available under a protected route such as `/dashboard/help/admin` with server-side authorization.

The administration workspace shall support:

- topic catalogue;
- create topic with stable help key;
- draft/version editor;
- context-binding editor;
- preview as normal, training or public audience subject to administrator authorization;
- publish/retire actions;
- version history;
- related links;
- locale management;
- change reason capture.

The editor should use structured fields for the principal guidance components rather than accepting arbitrary executable markup. Rich text, if supported, must be sanitized through an allowlist and must not allow scripts, event handlers, arbitrary iframes or unsafe URLs.

## 11. Audit model

Privileged changes shall generate immutable audit events through the existing WASDOK audit boundary.

Recommended actions:

- `help.topic_created`
- `help.topic_updated`
- `help.topic_retired`
- `help.version_created`
- `help.version_published`
- `help.version_retired`
- `help.binding_created`
- `help.binding_updated`
- `help.binding_retired`

Audit metadata should contain stable IDs, help key, locale, version number, action and safe before/after administrative metadata. Full article bodies and search phrases should not be copied into audit metadata.

Ordinary tooltip/help views do not require audit events. Access to unusually sensitive policy guidance may be considered later under the broader security monitoring workstream, not assumed by this story.

## 12. Validation and error handling

Help administration shall validate at both application and PostgreSQL boundaries.

Examples:

- help keys follow a conservative identifier format and length;
- locale values are allowlisted/validated;
- content-type/audience/visibility values use enums;
- published title cannot be blank;
- administrative reason has an approved minimum and maximum length;
- external related links must use approved `https` URLs and may be restricted to approved domains later;
- internal related links must resolve to approved application/help paths;
- `suggested_structure` must contain a bounded ordered array of plain-text items;
- example content must be explicitly marked/validated as DEMO guidance by editorial rules where the content type can represent a person, case, agency event or decision.

If help loading fails, the business screen remains usable. A help failure must not block the underlying authorized workflow. The UI should report that guidance is temporarily unavailable without exposing database errors.

If help administration mutation fails, it fails closed: no partial publish state is reported successful.

## 13. Existing static hints migration

Existing embedded guidance, including Complaint Intake hints, shall be migrated incrementally rather than removed in one risky conversion.

Implementation should support a transition strategy:

1. introduce the central help service;
2. bind central topics to selected high-value fields/screens;
3. keep existing static fallback hints until the corresponding central topic is proven available;
4. remove duplicated hard-coded text only after automated tests prove the central help binding and fallback behavior;
5. preserve mandatory security/privacy notices in code or policy-controlled sources where they are normative application controls rather than optional help content.

Privacy notices, statutory notices and mandatory consent wording are not casually editable “help” and should remain under their existing stronger governance unless separately approved.

## 14. Security boundaries

WASDOK Help must not become a side channel around protected system controls.

Required controls:

- server-side filtering before rendering/searching restricted topics;
- RLS or equivalent database policy for help administration and protected help discovery;
- no service-role client in browser components;
- no secrets or hidden configuration stored in help content;
- direct browser DML to help administration tables denied where audited RPC/server-action administration is required;
- secure sanitized rendering of rich text;
- stable topic keys cannot be repurposed after retirement;
- public help is opt-in, explicitly classified PUBLIC and separately testable;
- examples use fictional DEMO data;
- help content cannot mutate business records merely by being displayed;
- Help administration is distinct from Access Control Administration and cannot change RBAC rules.

## 15. Future “Ask WASDOK Help” boundary

The first release does not implement AI. The architecture nevertheless supports a later conversational Help feature.

Any future assistant must:

1. retrieve only current published help content the user is already permitted to view;
2. cite or link the approved help source used for its answer;
3. distinguish approved guidance from generated explanation;
4. never use hidden unauthorized help or protected case records merely because the user can ask a question;
5. never present generated text as an official Commission finding, decision or legal opinion;
6. respect the same language and audience visibility rules;
7. fail safely when no approved guidance supports an answer.

AI implementation, model selection, retention rules and prompt-injection defenses require a separate design and approval story.

## 16. Proposed application components

The implementation plan may refine file names, but the subsystem should remain separated into clear units:

- Help authorization service — resolves whether a topic is discoverable;
- Help query service — contextual retrieval and Help Centre search;
- Help administration mutation service — audited topic/version/binding changes;
- Context Help renderer — field and screen help;
- Help Drawer — AppShell contextual panel;
- Help Centre — searchable manual;
- Help Administration workspace — draft/version/binding management;
- Help validation/types — shared contracts;
- Database migrations and RLS/RPC layer — authoritative storage and mutation boundary.

No component should duplicate the application's primary RBAC implementation. Help authorization consumes the existing authorization primitives.

## 17. Testing and verification requirements

The implementation must include automated coverage for at least:

### Database/security tests

- help tables and constraints;
- RLS/authorization policies;
- `help.manage` and `help.publish` enforcement;
- unauthorized direct writes denied;
- draft content not visible to ordinary users;
- restricted topic title/snippet cannot be discovered by unauthorized search;
- publication lifecycle preserves prior versions;
- publish/retire actions produce immutable safe audit events;
- public visibility only for explicitly public topics;
- training audience does not bypass business permissions;
- locale fallback does not bypass topic security.

### Application tests

- Help control appears in authenticated AppShell;
- contextual route/field binding resolution;
- accessible field help interaction;
- Guided Entry Prompt rendering;
- Help Centre search and module browsing;
- role-aware result filtering;
- administration route protection;
- sanitized rendering;
- help-load failure does not break the underlying business form;
- no service-role secret import/reference in client-facing Help code.

### End-to-end tests

Use only fictional `DEMO WASDOK81` fixtures. Prove:

- administrator drafts and publishes a topic;
- authorized user sees it contextually and in search;
- unauthorized user cannot discover it by URL, search, title or snippet;
- new version supersedes the previous version without deleting history;
- retirement removes ordinary visibility;
- privileged operations append expected audit evidence;
- training mode shows additional authorized guidance without granting additional application permissions;
- rollback-safe hosted verification leaves no DEMO records.

## 18. Deployment and migration posture

Database changes must be delivered through ordered, versioned Supabase migrations and tested by local reset before hosted deployment.

Hosted deployment must remain a separate explicit approval gate after merge and post-merge CI. Production verification shall use transactional/rollback-safe fictional `DEMO WASDOK81` fixtures wherever database mutation is required.

No existing WASDOK help-like static text should be destructively removed during the first deployment. Central help adoption is incremental.

## 19. Relationship to WASDOK-78

WASDOK-81 is a separate story. It does not reopen the Access Control Administration design and does not absorb the outstanding WASDOK-78 functional Audit History remediation.

WASDOK-78 governs configurable user/role/permission/scope/compartment administration. WASDOK-81 consumes those authorization primitives and adds `help.manage` / `help.publish` to the approved permission catalogue through its own implementation and review cycle.

## 20. Acceptance criteria

WASDOK-81 is complete only when:

1. authenticated users can access contextual Help directly from supported WASDOK screens and important fields;
2. supported narrative fields can show approved Guided Entry Prompts and fictional examples;
3. `/dashboard/help` provides searchable, module-organized, role-aware published guidance;
4. explicitly public workflows can show only approved public help without exposing internal guidance;
5. administrators with `help.manage` can create topics, draft versions and bindings without source-code changes;
6. administrators with `help.publish` can publish/retire official versions with mandatory reasons;
7. prior published versions remain preserved and stable help keys are not repurposed;
8. users cannot discover help for functions/content they are not authorized to access;
9. training guidance can be more detailed without increasing business-data authorization;
10. English is supported operationally and the design supports later Tok Pisin publication/fallback;
11. privileged help administration creates immutable, safe audit evidence;
12. client-facing Help code exposes no service-role credentials or infrastructure secrets;
13. Help failure does not prevent use of the underlying authorized business workflow;
14. negative-access, lifecycle, audit, search-disclosure and end-to-end tests are green in CI;
15. hosted deployment and rollback-safe verification succeed with no DEMO residue;
16. future AI assistance remains optional and outside the initial implementation scope.

## 21. Approved architecture decision

WASDOK 360 shall implement **Configurable Help Centre + Contextual Field Help + Guided Entry Prompts + Role-Aware Online Manual + Training Mode + Versioned Help Administration** as one coherent help subsystem.

The initial release shall use approved human-authored content. Conversational AI assistance is a later enhancement built on top of the same authorized published help repository and requires separate design approval.
