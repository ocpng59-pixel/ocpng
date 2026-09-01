# WASDOK-63 — complaint intake form and validation

## Scope and design

Implement the form/validation subtask of WASDOK-28. Source requirements: Jira WASDOK-63 and Confluence 02.2 Complaints & Public Intake (page 524295), alongside the approved 31 August system design.

- Share a Zod schema and accessible form between a public DEMO preview at `/complaints/intake` and assisted entry at `/dashboard/complaints/new`.
- Require complainant name, at least one contact method, government body, subject and allegation. Respondent name is optional when unknown. These are implementation field rules for review, not additional statutory admissibility criteria.
- Trim surrounding whitespace, bound all text, validate supplied email/phone, reject malformed types, duplicate fields and unknown fields. Errors identify fields without echoing submitted information or validator internals.
- Run the same schema in the UI and server actions. The assisted page and action independently require verified authentication, `complaints.create` and the CONFIDENTIAL compartment. No existing records are read and no scope/assignment is created; persistence must enforce these in WASDOK-65.
- Keep the preview visibly DEMO and validation-only. A successful check does not create a record, receipt, draft, audit event or submission. Do not add browser storage. Keep complaint values out of responses and logs.
- Preserve the existing Next/Supabase/Netlify architecture and visual style. Add Zod for the shared schema and jsdom only for interaction tests. No schema migration is needed.

## Implementation sequence

1. Write failing schema, direct-action authorization and form interaction tests using fictional DEMO fixtures.
2. Implement the shared schema and safe results, then the public and assisted server actions.
3. Build and connect the two form surfaces with accessible labels, error summary, per-field errors, pending protection and explicit validation-only success.
4. Run the full suite, typechecks, domain/schema/route/static checks, lint and production authentication build/credential scan. Extend protected HTTP coverage to the new assisted route.
5. Obtain independent code review, resolve findings, publish a review-ready PR, verify CI and record evidence in WASDOK-63. Merge remains a separate controlled release decision.

## Follow-on work

WASDOK-64 owns draft/submitted/channel state; WASDOK-65 owns trusted persistence, idempotency and receipts; WASDOK-66 owns approved privacy notices and consent; WASDOK-67 owns submission audit and end-to-end coverage. The DEMO preview must not be represented as a live complaint-lodgement service before those gates pass.
