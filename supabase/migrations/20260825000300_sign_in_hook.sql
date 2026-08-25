-- Counting sign-in attempts below both apps.
--
-- The web workspace signs in through its own route, so it could count failures
-- and slow down guessing. The phone app talks to the auth service directly, as
-- it should — it has to work whether or not the web app is deployed — and so
-- was never covered. Anything else holding the anon key was never covered
-- either: an attacker is not going to use our front door.
--
-- So the control moves underneath both of them. This is a GoTrue password
-- verification hook: the auth service calls it on every password attempt,
-- before the session is issued, whichever client is asking. There is no way in
-- that skips it.
--
-- What it cannot see is the network — no address, no user agent. The web route
-- fills those in afterwards for the row this function writes, and the phone
-- adds nothing, which is honest: it is one app on one device.

create or replace function public.password_verification_attempt(event jsonb)
returns jsonb
language plpgsql
security definer set search_path = public as $$
declare
  subject   uuid := (event->>'user_id')::uuid;
  -- Not named `succeeded`: that is also the column name below, and inside a
  -- plpgsql WHERE clause the two are indistinguishable.
  was_valid boolean := coalesce((event->>'valid')::boolean, false);
  who       record;
  failures  integer;
begin
  /*
   * The hook only fires for an address that exists, because there is no user
   * to verify a password against otherwise. That is a feature: an address
   * nobody works under has no account to protect, and recording attempts
   * against it would build a list of guesses worth reading.
   */
  select id, email into who from profiles where id = subject;
  if who.id is null then
    return event;
  end if;

  select count(*) into failures
  from sign_in_events
  where user_id = subject
    and not succeeded
    and at > now() - interval '15 minutes';

  /*
   * Refused before the password is even considered. The count is per account
   * rather than per address on the network: an attacker moves between
   * addresses far more cheaply than a person changes accounts, and the cost of
   * being wrong is a wait — the window rolls forward on its own and nothing
   * has to be unlocked by hand.
   */
  if failures >= 5 then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 429,
        'message', 'Too many failed attempts. Try again in 15 minutes.'));
  end if;

  insert into sign_in_events (email, user_id, succeeded)
  values (who.email, who.id, was_valid);

  return event;
end $$;

-- The auth service runs as its own role and reaches nothing else in this
-- database. It is given exactly this one function and the schema it lives in.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.password_verification_attempt(jsonb) to supabase_auth_admin;

-- And nobody else may call it. It writes to an append-only log and decides
-- whether a sign in proceeds; a session that could invoke it directly could
-- fabricate attempts or lock somebody out of their own account.
revoke execute on function public.password_verification_attempt(jsonb) from authenticated, anon, public;
