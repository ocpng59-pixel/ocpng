begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

select has_table('public','backup_jobs','backup jobs table exists');
select has_table('public','backup_artifacts','backup artifacts table exists');
select has_table('public','backup_schedules','backup schedules table exists');
select has_table('public','backup_retention_policies','backup retention policies table exists');
select has_table('public','backup_verifications','backup verifications table exists');
select has_table('public','provider_recovery_points','provider recovery points table exists');
select has_table('public','restore_runs','restore runs table exists');
select has_table('public','restore_authorizations','restore authorizations table exists');
select has_table('public','restore_verifications','restore verifications table exists');

select ok(exists(select 1 from public.permissions where code='backup.view'),'backup.view permission exists');
select ok(exists(select 1 from public.permissions where code='backup.create'),'backup.create permission exists');
select ok(exists(select 1 from public.permissions where code='backup.verify'),'backup.verify permission exists');
select ok(exists(select 1 from public.permissions where code='backup.download'),'backup.download permission exists');
select ok(exists(select 1 from public.permissions where code='backup.schedule'),'backup.schedule permission exists');
select ok(exists(select 1 from public.permissions where code='backup.restore_test'),'backup.restore_test permission exists');
select ok(exists(select 1 from public.permissions where code='backup.restore_production'),'backup.restore_production permission exists');
select ok(exists(select 1 from public.permissions where code='backup.authorize_production_restore'),'backup.authorize_production_restore permission exists');
select ok(exists(select 1 from public.permissions where code='backup.manage_retention'),'backup.manage_retention permission exists');

select ok((select relrowsecurity from pg_class where oid='public.backup_jobs'::regclass),'backup_jobs RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.restore_runs'::regclass),'restore_runs RLS enabled');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='backup_jobs_backup_code_uq'),'backup_code unique index exists');
select ok(exists(select 1 from pg_trigger where tgname='backup_jobs_immutable_backup_code' and not tgisinternal),'backup_code immutability trigger exists');
select ok(exists(select 1 from pg_constraint where conname='restore_authorizer_not_requester'),'restore requester cannot authorize own production restore');

select * from finish();
rollback;
