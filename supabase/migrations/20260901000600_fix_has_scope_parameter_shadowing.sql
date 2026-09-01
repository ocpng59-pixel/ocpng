-- WASDOK-27: Fix data-scope isolation defect caused by SQL name shadowing.
--
-- The original function accepted an input parameter named scope_code and
-- compared `ds.scope_code = scope_code`. In a SQL-language function this can
-- resolve both identifiers to the table column, making the comparison
-- tautological for any user who has at least one active scope.
--
-- Keep the existing function signature so CREATE OR REPLACE does not disturb
-- dependent policies/functions, but use positional argument $1 inside the
-- body so the requested scope can never be confused with the stored column.

create or replace function public.has_scope(scope_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    $1 is null
    or exists (
      select 1
      from public.data_scopes ds
      where ds.user_id = auth.uid()
        and ds.active
        and (
          ds.scope_code = $1
          or ds.scope_code = '*'
        )
    );
$$;
