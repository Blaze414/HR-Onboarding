-- Every sign in, and every attempt that failed.
--
-- Zero trust asks for two things this app could not do: a limit on how often
-- somebody may guess a password, and enough of a trail that an unusual sign in
-- is visible to the person it happened to. Both need the attempt recorded
-- server-side — the browser cannot be asked to report its own failures
-- honestly, and an attacker's browser will not.
--
-- Nothing here is a policy the client can reach. Rows are written by the
-- sign-in route with the service key, which bypasses row level security; there
-- is deliberately no insert policy, so an authenticated session cannot forge a
-- sign in that never happened or bury one that did.

create table sign_in_events (
  id         uuid primary key default gen_random_uuid(),
  -- Kept for failures too, where there is no user to point at — that is the
  -- case the limit exists for.
  email      text not null,
  user_id    uuid references profiles(id) on delete cascade,
  succeeded  boolean not null,
  -- As reported by the proxy in front of the app. Treated as a hint, never as
  -- an identity: it is trivially spoofed and is only ever used to group
  -- attempts and to show somebody where their own session came from.
  ip         text,
  user_agent text,
  at         timestamptz not null default now()
);

create index sign_in_events_email_idx on sign_in_events (email, at desc);
create index sign_in_events_user_idx on sign_in_events (user_id, at desc);

alter table sign_in_events enable row level security;
alter table sign_in_events force row level security;

-- You see your own sign ins. Not your colleagues', and not the failed attempts
-- against an address that is not yours: "was this email tried" is itself worth
-- knowing, and worth not handing out.
create policy sign_in_event_read on sign_in_events for select to authenticated
  using (user_id = auth.uid());

grant select on public.sign_in_events to authenticated;

-- No insert, update or delete policy. Written by the service key only.
