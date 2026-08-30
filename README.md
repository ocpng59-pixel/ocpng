# WASDOK 360 — OCPNG Integrated Oversight & Case Management System

WASDOK 360 is a secure digital oversight and case-management platform for the Ombudsman Commission of Papua New Guinea (OCPNG).

The Release 1 design covers complaints, investigations, Leadership Code administration, Annual Statements, government-body oversight, recommendations and compliance, Members of Commission decisions, legal work, intelligence, reporting and institutional administration.

## Release 1 foundation

The foundation is being restored from the approved 31 August 2026 OCPNG design and implementation plan. It uses Next.js 16, React 19, TypeScript, Supabase PostgreSQL/Auth/Storage, Row Level Security, configuration-driven RBAC, security compartments, immutable audit controls, GitHub Actions and Codespaces.

Protected classifications include `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED`, `LEADERSHIP_RESTRICTED`, `ANNUAL_STATEMENT_SECRET`, `INTELLIGENCE_SECRET` and `LEGAL_PRIVILEGE`.

This repository intentionally excludes NJSS FF3/FF4, budget, supplier, commitment and financial-domain modules.

## Development

Active Release 1 implementation is performed on `feat/wasdok360-release1` and merged to `main` only after verification.
