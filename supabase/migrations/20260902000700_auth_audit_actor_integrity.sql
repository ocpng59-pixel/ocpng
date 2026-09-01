-- WASDOK-61: authentication audit actor integrity.
-- Authenticated clients may append audit events only for their own auth identity.

drop policy if exists audit_events_insert on public.audit_events;

create policy audit_events_insert
on public.audit_events
for insert
to authenticated
with check (
  auth.uid() is not null
  and actor_id = auth.uid()
);
