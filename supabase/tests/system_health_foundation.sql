begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(42);

select ok(exists(select 1 from public.permissions where code='system.health.view'),'system.health.view permission exists');
select ok(exists(select 1 from public.permissions where code='system.health.manage'),'system.health.manage permission exists');

select has_table('public','health_metric_catalog','health metric catalogue exists');
select has_table('public','system_health_snapshots','health snapshots table exists');
select has_table('public','system_health_metric_samples','health metric samples table exists');
select has_table('public','system_health_thresholds','health thresholds table exists');
select has_table('public','system_health_alerts','health alerts table exists');
select has_table('public','deployment_health_state','deployment health state table exists');

select ok(coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='health_metric_catalog'),false),'health_metric_catalog RLS enabled');
select ok(coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='system_health_snapshots'),false),'system_health_snapshots RLS enabled');
select ok(coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='system_health_metric_samples'),false),'system_health_metric_samples RLS enabled');
select ok(coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='system_health_thresholds'),false),'system_health_thresholds RLS enabled');
select ok(coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='system_health_alerts'),false),'system_health_alerts RLS enabled');
select ok(coalesce((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='deployment_health_state'),false),'deployment_health_state RLS enabled');

select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='health_metric_catalog' and column_name='metric_code'),'metric catalogue has metric_code');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='health_metric_catalog' and column_name='unit'),'metric catalogue has unit');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='health_metric_catalog' and column_name='value_type'),'metric catalogue has value_type');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='health_metric_catalog' and column_name='source'),'metric catalogue has source');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='health_metric_catalog' and column_name='stale_after_seconds'),'metric catalogue has stale_after_seconds');
select ok(exists(select 1 from pg_indexes where schemaname='public' and tablename='health_metric_catalog' and indexdef ilike '%unique%' and indexdef ilike '%metric_code%'),'metric_code is unique');
select ok(exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='health_metric_catalog' and con.contype='c' and pg_get_constraintdef(con.oid) ilike '%value_type%'),'metric value type validation exists');
select ok(exists(select 1 from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='health_metric_catalog' and con.contype='c' and pg_get_constraintdef(con.oid) ilike '%stale_after_seconds%'),'metric stale-after validation exists');

select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_snapshots' and column_name='observed_at'),'health snapshot has observed_at');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_snapshots' and column_name='collected_at'),'health snapshot has collected_at');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_snapshots' and column_name='source'),'health snapshot has source');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_snapshots' and column_name='provider'),'health snapshot has provider');

select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_metric_samples' and column_name='metric_code'),'metric sample has metric_code');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_metric_samples' and column_name='observed_at'),'metric sample has observed_at');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_metric_samples' and column_name='collected_at'),'metric sample has collected_at');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_metric_samples' and column_name='source'),'metric sample has source');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_metric_samples' and column_name='provider'),'metric sample has provider');
select ok(exists(select 1 from information_schema.columns where table_schema='public' and table_name='system_health_metric_samples' and column_name='stale_after_seconds'),'metric sample has stale_after_seconds');

select ok(exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname='health_status'),'health_status enum exists');
select ok((select array_agg(e.enumlabel order by e.enumsortorder)::text[] from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname='public' and t.typname='health_status') = array['HEALTHY','WARNING','CRITICAL','UNKNOWN']::text[],'health_status enum has required values');
select ok(exists(select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname='health_alert_status'),'health_alert_status enum exists');
select ok((select array_agg(e.enumlabel order by e.enumsortorder)::text[] from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname='public' and t.typname='health_alert_status') @> array['OPEN','ACKNOWLEDGED','RESOLVED']::text[],'health alert enum has lifecycle values');

select ok(exists(select 1 from public.health_metric_catalog where metric_code='app.availability'),'app availability metric seeded');
select ok(exists(select 1 from public.health_metric_catalog where metric_code='db.database_bytes'),'database bytes metric seeded');
select ok(exists(select 1 from public.health_metric_catalog where metric_code='storage.bytes'),'storage bytes metric seeded');
select ok(exists(select 1 from public.health_metric_catalog where metric_code='backup.last_verified_age_seconds'),'backup freshness metric seeded');
select ok(exists(select 1 from public.health_metric_catalog where metric_code='deployment.schema_drift'),'schema drift metric seeded');
select ok(exists(select 1 from public.health_metric_catalog where metric_code='security.advisor_warning_count'),'security advisor warning metric seeded');

select * from finish();
rollback;
