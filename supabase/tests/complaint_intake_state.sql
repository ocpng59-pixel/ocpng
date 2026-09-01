begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(1);
select has_table('public', 'complaint_intakes', 'WASDOK-64 persists controlled intake state');
select * from finish();
rollback;
