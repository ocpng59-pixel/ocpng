# WASDOK 360 Security Model

## Authority model
WASDOK 360 applies four cumulative access layers: functional permission, organisational/data scope, case assignment where applicable, and security compartment. A technical System Administrator role is not a content-visibility bypass for Leadership, Annual Statement, Intelligence or Legal Privilege material.

## Classifications
`PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`, `LEADERSHIP_RESTRICTED`, `ANNUAL_STATEMENT_SECRET`, `INTELLIGENCE_SECRET`, and `LEGAL_PRIVILEGE`.

## Database enforcement
All 96 Release 1 public business tables have Row Level Security enabled in versioned migrations. Read policies call permission and record-access helpers. Protected tables require the applicable compartment. Case-linked records also require authorised case access. Write operations remain deliberately constrained in the foundation and should be introduced through reviewed workflows/RPCs rather than broad table policies.

## Audit
`audit_events` is append-only: normal UPDATE and DELETE attempts are rejected by trigger. Privileged reads, exports, role/compartment changes, evidence custody and Commission decisions are expected to emit auditable events as working transactions are implemented.

## Human decision authority
The platform may surface deadlines, variances, links and workflow states. It must not determine misconduct, guilt, illegality, credibility or Commission outcomes. Annual Statement variance flags are analytical prompts only.

## Remaining production controls
Before production: live Supabase policy tests, storage-bucket policies, MFA/SSO decision, OCPNG-approved hosting, penetration testing, backup/restore rehearsal, retention/legal-hold policy, security monitoring, and formal UAT/security sign-off.
