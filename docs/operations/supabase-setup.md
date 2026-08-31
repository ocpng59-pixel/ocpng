# Supabase Setup — WASDOK 360

1. Create an OCPNG-approved Supabase project/environment. Do not use personal or shared development credentials for production.
2. Keep `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in deployment/Codespaces environment configuration. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only and never expose it through a `NEXT_PUBLIC_` variable.
3. Apply migrations in timestamp order from `supabase/migrations/`.
4. Run `supabase/seed.sql` only in a controlled UAT/demo environment; every seed record is fictional and marked DEMO.
5. Validate RLS with separate accounts representing Investigator, Leadership-authorised officer, Legal, Intelligence, Commission and System Administrator. Confirm System Administrator cannot read protected content merely by being administrator.
6. Configure private storage buckets and policies before enabling evidence/document upload.
7. Set `OCPNG_STRICT_ENV=true` only after the approved public configuration is present.

Production deployment requires OCPNG ICT/security/legal approval and a controlled legacy-data migration plan.
