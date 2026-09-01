# Complaint intake form and validation — WASDOK-63

The shared form is available as a public DEMO preview at `/complaints/intake` and as assisted entry through **Complaints → New Complaint** (`/dashboard/complaints/new`). Both surfaces are explicitly validation-only: neither saves a complaint, creates a draft or receipt, records a submission audit event, nor decides jurisdiction or admissibility. Use fictional DEMO details only.

## Field contract

These are application validation rules for named intake, not statutory admissibility rules. Anonymous intake policy is not defined by this task.

| Field | Rule | Maximum characters |
| --- | --- | --- |
| Complainant name | Required | 200 |
| Email | Optional individually; valid email when supplied | 254 |
| Phone | Optional individually; 7–15 digits with optional leading +, spaces, parentheses, dots or hyphens | 40 |
| Postal address | Optional individually | 1,000 |
| Government body or agency | Required free text; registry matching is later work | 200 |
| Person or office concerned | Optional when unknown | 200 |
| Complaint subject | Required | 200 |
| What happened? | Required allegation narrative | 5,000 |

At least one of email, phone or postal address is required. All supplied fields are validated even if another contact method is valid. Surrounding whitespace is trimmed; internal narrative whitespace is retained. Optional text can be omitted or blank. Names are not restricted to an English alphabet. Unknown fields, repeated form fields, file uploads in text fields and incorrect value types are rejected.

`lib/complaints/intake-schema.ts` owns the Zod schema, inferred TypeScript contract, field constraints and safe validation results. Both the browser and server call the same validator. Server responses contain only validation status and fixed field/form errors, never the entered values, raw validator issues or database details. The parser's normalized data is intended for the future trusted persistence boundary; a client validation result must never be treated as authorization to save.

## Access and privacy boundaries

- Public validation does not instantiate a Supabase client or access records.
- The assisted page and its directly callable server action independently verify claims and require `complaints.create` plus the CONFIDENTIAL compartment. They fail closed on missing sessions, configuration or permission-service errors. There is no administrator bypass.
- This is a blank form with no record reads/writes. Organisational scope, case assignment, channel and actor attribution must be enforced at trusted persistence in WASDOK-64/65; the form does not accept these values.
- Next server actions provide the request boundary. No browser local/session storage, query-string values, uploaded evidence or complaint-value logging are added.
- While checking, editing and repeat requests are disabled. An edit clears the previous validation result. Failures retain the current in-memory form values and present a safe retry/access message. An error summary receives focus and links to labelled fields with associated messages.
- The public preview is marked noindex. It is not advertised as an operational complaint-submission channel.

## Delivery boundaries and verification

WASDOK-64 owns draft/submitted state and approved channel/source recording. WASDOK-65 owns trusted persistence, idempotency and controlled receipts. WASDOK-66 owns the approved privacy notice and consent. WASDOK-67 owns the complete submission audit and end-to-end scenario. Those gates must pass before this preview becomes a live lodging service; there is no database migration in this change.

`tests/complaints` covers valid/invalid field rules, bounds, normalized values, malformed and forged payloads, duplicate/file rejection, no-value responses, direct-action validation, assisted page/action authorization, session loss and real React form interactions in jsdom. Fixtures are fictional and visibly DEMO. These tests run in the existing CI `test:run` step.

The production authentication smoke adds the new assisted route to unauthenticated GET/HEAD/RSC and malformed-cookie coverage (36 protected requests in total) and checks the public preview alongside the three authentication routes. The built assets remain covered by the privileged-credential canary scan. Full complaint-lodgement E2E coverage remains WASDOK-67.
