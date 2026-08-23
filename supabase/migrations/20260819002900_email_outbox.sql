-- Reminders that reach somebody who is not logged in.
--
-- Every chase in this product so far happens in-app, which means the people it
-- most needs to reach — the ones who have not opened it in a fortnight — are
-- exactly the people it never reaches. Deadlines quietly pass and the first
-- anybody hears of it is a report.
--
-- The database does not send mail, and should not: sending is slow, fails in
-- ways a transaction cannot roll back, and would tie a trigger to whichever
-- provider is in fashion. So a notification also writes a queued message, and a
-- separate sender drains the queue (scripts/send-email.mjs). The queue is the
-- contract; the provider is a detail behind an environment variable.

create table email_outbox (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  notification_id uuid not null references notifications(id) on delete cascade,
  recipient_id    uuid not null references profiles(id) on delete cascade,
  -- Copied at queue time, not read at send time: mail should go where the
  -- person was when it was raised, and a queue that reads live rows sends a
  -- leaver's reminders to whoever inherits their address.
  recipient_email text not null,
  subject         text not null,
  body            text,
  href            text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  attempts        integer not null default 0,
  last_error      text,

  -- One queued message per notification. The notification triggers are already
  -- careful not to raise the same reminder twice; this makes sure a retry of
  -- the queue writer cannot undo that care.
  constraint email_outbox_one_per_notification unique (notification_id)
);

create index on email_outbox (sent_at, created_at) where sent_at is null;
create index on email_outbox (recipient_id);

alter table email_outbox enable row level security;
alter table email_outbox force row level security;

/*
 * No client insert, update or delete policy, on purpose. The queue is written
 * by the trigger below and drained by the sender using the service key. A
 * person can read what was queued about their workspace so an unsent backlog is
 * visible rather than silent, and nothing more.
 */
create policy email_outbox_read on email_outbox for select to authenticated
  using (
    organisation_id = current_org_id()
    and (recipient_id = auth.uid() or has_permission('report.view_full'))
  );

grant select on public.email_outbox to authenticated;

/*
 * Queue a message for every notification raised.
 *
 * Runs as definer because the notification triggers run as whoever caused them
 * — often the learner themselves, who has no business writing to the queue.
 * Failure here must never lose the notification, so the insert is swallowed:
 * an in-app reminder that arrives without its email is a smaller problem than
 * a deadline sweep that aborts halfway.
 */
create or replace function public.queue_notification_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  address text;
  active  boolean;
begin
  select email, is_active into address, active from profiles where id = new.user_id;

  -- Nobody chases a leaver.
  if address is null or active is not true then
    return new;
  end if;

  begin
    insert into email_outbox (
      organisation_id, notification_id, recipient_id, recipient_email, subject, body, href
    ) values (
      new.organisation_id, new.id, new.user_id, address, new.title, new.body, new.href
    )
    on conflict (notification_id) do nothing;
  exception when others then
    raise warning 'could not queue email for notification %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

create trigger notification_queues_email
  after insert on notifications
  for each row execute function public.queue_notification_email();
