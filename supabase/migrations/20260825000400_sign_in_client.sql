-- Which app a sign in came from.
--
-- The history was already shared: `sign_in_events` is one table keyed by the
-- person, and both apps read every row belonging to the caller — sign in on
-- the phone and it is on the desktop list a second later, and the other way
-- round. What neither list could say was *which app*, because the auth hook
-- that records the attempt cannot see the network and every phone sign in
-- therefore read as "Unknown device". A history that cannot tell a phone from
-- a laptop is not much use for spotting the sign in that was not you.
--
-- The web app fills this in from the server with the service key. The phone
-- has no such key and should not, so it stamps its own row through the
-- function below — narrowly: your own most recent attempt, only if nothing has
-- described it yet, and only within a minute of it happening.

alter table sign_in_events
  add column client text,
  add column device text,
  -- The clock the device is set to, e.g. Australia/Brisbane. Reported by the
  -- browser or the phone, never looked up from the address: resolving an IP to
  -- a place means sending somebody's address to a third party to find out
  -- where they are, which is not a thing to do quietly to your own staff. A
  -- self-reported zone is also simply better evidence — it is the clock the
  -- person is actually working to, not a guess from a network route.
  add column time_zone text;

comment on column sign_in_events.client is
  'Which app the attempt came through. Self-reported and treated as a hint.';
comment on column sign_in_events.time_zone is
  'The clock the device is set to, reported by the device. Never derived from the IP address.';

create or replace function public.describe_my_sign_in(
  client_name text, device_name text, zone_name text default null)
returns void
language plpgsql
security definer set search_path = public as $$
declare
  target uuid;
begin
  /*
   * Deliberately narrow. The caller cannot choose a row, cannot describe
   * somebody else's, cannot relabel one that is already described, and cannot
   * reach back further than a minute — so the worst a compromised session can
   * do with this is mislabel the sign in it just made, which it could have
   * mislabelled anyway by lying about its user agent.
   */
  select id into target
  from sign_in_events
  where user_id = auth.uid()
    and client is null
    and at > now() - interval '1 minute'
  order by at desc
  limit 1;

  if target is null then
    return;
  end if;

  update sign_in_events
     set client    = left(client_name, 40),
         device    = left(device_name, 80),
         time_zone = left(zone_name, 60)
   where id = target;
end $$;

revoke execute on function public.describe_my_sign_in(text, text, text) from public;
grant execute on function public.describe_my_sign_in(text, text, text) to authenticated;
