-- Reminders that reach a phone that is not open.
--
-- Mail already leaves the building (20260819002900_email_outbox.sql), but mail
-- is read on the day somebody opens their inbox. The obligations this product
-- chases are hours-and-days shaped — a certificate that lapses tomorrow, a
-- contract that was due on Tuesday — so the phone needs its own path.
--
-- Same shape as the mail queue, and for the same reason: the database queues,
-- it does not send. Sending is slow, fails outside the transaction, and would
-- tie a trigger to whichever push provider is in fashion. A separate sender
-- drains the queue (scripts/send-push.mjs).

/*
 * Where a person can be reached.
 *
 * One row per device, not per person: somebody with a phone and a tablet is two
 * rows, and a reminder goes to both. Tokens are rotated by the operating system
 * without warning, so the app re-registers on every launch and the row is
 * upserted rather than inserted.
 */
create table push_tokens (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  token           text not null,
  platform        text not null check (platform in ('ios', 'android', 'web')),
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),

  -- A device belongs to whoever signed in on it last. Two people sharing a
  -- handset must not both keep receiving its notifications.
  constraint push_tokens_unique unique (token)
);

create index on push_tokens (user_id);

alter table push_tokens enable row level security;
alter table push_tokens force row level security;

-- A person registers their own device and nobody else's. There is deliberately
-- no read policy for other people's tokens: a token is an address you can send
-- to, so the list of them is not workspace-readable.
create policy push_token_read on push_tokens for select to authenticated
  using (user_id = auth.uid());

create policy push_token_register on push_tokens for insert to authenticated
  with check (user_id = auth.uid() and organisation_id = current_org_id());

create policy push_token_refresh on push_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_token_forget on push_tokens for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.push_tokens to authenticated;

/*
 * What is waiting to be pushed.
 *
 * The token is copied in at queue time for the same reason the mail queue
 * copies the address: a queue that reads live rows delivers a leaver's
 * reminders to whatever device inherited their sign-in.
 */
create table push_outbox (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  notification_id uuid not null references notifications(id) on delete cascade,
  recipient_id    uuid not null references profiles(id) on delete cascade,
  token           text not null,
  title           text not null,
  body            text,
  href            text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  attempts        integer not null default 0,
  last_error      text,

  -- One message per notification per device. Registering a device twice must
  -- not double every reminder that follows.
  constraint push_outbox_one_per_device unique (notification_id, token)
);

create index on push_outbox (sent_at, created_at) where sent_at is null;
create index on push_outbox (recipient_id);

alter table push_outbox enable row level security;
alter table push_outbox force row level security;

-- Written by the trigger, drained by the sender with the service key. A person
-- can see what was queued for them so an unsent backlog is visible rather than
-- silent, and nothing more.
create policy push_outbox_read on push_outbox for select to authenticated
  using (
    organisation_id = current_org_id()
    and (recipient_id = auth.uid() or has_permission('report.view_full'))
  );

grant select on public.push_outbox to authenticated;

/*
 * Queue a push for every device the recipient has registered.
 *
 * Definer for the same reason as the mail queue: the notification triggers run
 * as whoever caused them, who has no business writing here. Failure is
 * swallowed — an in-app reminder that arrives without its push is a smaller
 * problem than a deadline sweep that aborts halfway.
 */
create or replace function public.queue_notification_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  active boolean;
begin
  select is_active into active from profiles where id = new.user_id;

  -- Nobody chases a leaver.
  if active is not true then
    return new;
  end if;

  begin
    insert into push_outbox (
      organisation_id, notification_id, recipient_id, token, title, body, href
    )
    select new.organisation_id, new.id, new.user_id, t.token, new.title, new.body, new.href
    from push_tokens t
    where t.user_id = new.user_id
    on conflict (notification_id, token) do nothing;
  exception when others then
    raise warning 'could not queue push for notification %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

create trigger notification_queues_push
  after insert on notifications
  for each row execute function public.queue_notification_push();
