-- Sign-in history a breach can actually be investigated with.
--
-- Under the Notifiable Data Breaches scheme an organisation that suspects an
-- eligible breach has to assess it and, if it is one, notify the OAIC and the
-- people affected. That assessment is a set of questions about *whose account*,
-- *from where*, and *when*: none of which can be answered from a log that only
-- the account holder can read one row at a time.
--
-- So a Super Administrator — not every admin — can read the sign-in history for
-- their own workspace. Two things make that defensible rather than surveillance:
-- it is the narrowest role in the app and the one already trusted with role
-- assignment, and reading it is itself recorded, so the people who can watch
-- everybody are the people most visibly watched.

alter table sign_in_events
  add column organisation_id uuid references organisations(id) on delete cascade;

create index sign_in_events_org_idx on sign_in_events (organisation_id, at desc);

update sign_in_events e
   set organisation_id = p.organisation_id
  from profiles p where p.id = e.user_id;

-- The hook is the only writer of an attempt, so it is where the workspace gets
-- attached. Redefined here rather than edited in place so the earlier
-- migration still describes what it did at the time.
create or replace function public.password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  subject   uuid := (event->>'user_id')::uuid;
  was_valid boolean := coalesce((event->>'valid')::boolean, false);
  who       record;
  failures  integer;
begin
  select id, email, organisation_id into who from profiles where id = subject;
  if who.id is null then
    return event;
  end if;

  select count(*) into failures
  from sign_in_events
  where user_id = subject
    and not succeeded
    and at > now() - interval '15 minutes';

  if failures >= 5 then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 429,
        'message', 'Too many failed attempts. Try again in 15 minutes.'));
  end if;

  insert into sign_in_events (email, user_id, organisation_id, succeeded)
  values (who.email, who.id, who.organisation_id, was_valid);

  return event;
end $$;

grant execute on function public.password_verification_attempt(jsonb) to supabase_auth_admin;
revoke execute on function public.password_verification_attempt(jsonb) from authenticated, anon, public;

-- ------------------------------------------------------------------ reading it
drop policy sign_in_event_read on sign_in_events;

create policy sign_in_event_read on sign_in_events for select to authenticated
  using (
    user_id = auth.uid()
    or (organisation_id = current_org_id() and is_super_admin())
  );

-- ----------------------------------------------------------- watching the watchers
create table sign_in_log_reads (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  reader_id       uuid not null references profiles(id) on delete cascade,
  -- Why, in their own words. Required: an investigation has a reason and a
  -- breach report has to say what prompted the look.
  reason          text not null,
  subject_id      uuid references profiles(id) on delete set null,
  at              timestamptz not null default now()
);

alter table sign_in_log_reads enable row level security;
alter table sign_in_log_reads force row level security;

-- Visible to the Super Administrators as a group, and to anybody whose own
-- history was the subject of a look.
create policy sign_in_log_read_read on sign_in_log_reads for select to authenticated
  using (organisation_id = current_org_id() and (is_super_admin() or subject_id = auth.uid()));

grant select on public.sign_in_log_reads to authenticated;

-- No insert policy: written by the function below, which stamps the reader
-- from the session rather than taking their word for who they are.
create or replace function public.record_sign_in_log_read(why text, subject uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then
    raise exception 'Only a Super Administrator may read the workspace sign-in history.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(why), '') = '' then
    raise exception 'Say why you are looking.' using errcode = 'check_violation';
  end if;
  insert into sign_in_log_reads (organisation_id, reader_id, reason, subject_id)
  values (current_org_id(), auth.uid(), left(trim(why), 300), subject);
end $$;

revoke execute on function public.record_sign_in_log_read(text, uuid) from public;
grant execute on function public.record_sign_in_log_read(text, uuid) to authenticated;
