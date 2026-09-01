# WASDOK 360 — OCPNG Integrated Oversight & Case Management System

WASDOK 360 is a fresh, role-based oversight and case-management platform for the Ombudsman Commission of Papua New Guinea (OCPNG). Release 1 covers complaints, investigations, Leadership Code administration, Annual Statements, government-body oversight, recommendations/compliance, Members of Commission decisions, legal work, intelligence, reporting and institutional administration.

## Current Release 1 foundation

- Next.js 16 / React 19 / TypeScript application shell.
- Supabase Auth entry, recovery and password-change surfaces with no fake authentication bypass.
- Configuration-driven navigation and 38 OCPNG module surfaces.
- RBAC plus organisational scope, case assignment and protected security compartments.
- OCPNG case numbering and controlled complaint/Leadership/Annual Statement/compliance lifecycle rules.
- 96-table Supabase PostgreSQL foundation with RLS enabled on every migration-created public business table.
- Append-only audit-event controls.
- DEMO-only fictional seed data and executive dashboard.
- Codespaces and GitHub Actions verification.

## Security classifications

`PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`, `LEADERSHIP_RESTRICTED`, `ANNUAL_STATEMENT_SECRET`, `INTELLIGENCE_SECRET`, `LEGAL_PRIVILEGE`.

Protected data requires functional permission plus the applicable data scope/case assignment and security compartment. System Administrator status alone does not grant protected content visibility.

## Development

```bash
npm install
npm run dev
```

For an approved connected backend, copy `.env.example` to a local environment file and populate values outside source control. Without Supabase configuration the interface remains a fictional prototype and the login screen explicitly reports that authentication is not configured.

## Verification

```bash
npm run test:run
npm run typecheck:domain
npm run test:domain
npm run test:schema
npm run test:routes
npm run verify:static
npm run typecheck
npm run lint
npm run build
```

## Status

This is a Release 1 foundation/UAT implementation, not a production-authorisation statement. Production use requires live Supabase migration and policy testing, private storage policies, OCPNG ICT/security/legal approval, penetration testing, backup/restore verification and formal UAT.
