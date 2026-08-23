-- Required training and notifications.
--
-- A course assignment can be marked required, with a date it is due by. The
-- staff member sees the requirement on their own screens; the person who
-- assigned it sees whether it landed. Nothing here changes who may read a row —
-- that is still the assignment's own tenancy and ownership.

alter table course_assignments
  add column is_required boolean not null default false,
  add column due_date    date;

create index on course_assignments (user_id, is_required, due_date);

/*
 * Notifications.
 *
 * Rows are written by triggers rather than by the client, so a notification
 * exists because something actually happened in the database — not because a
 * screen remembered to send one. `user_id` is the recipient; `actor_id` is who
 * caused it, and nobody is ever notified about their own action.
 */
create type notification_kind as enum (
  'course_assigned', 'course_due_soon', 'task_assigned', 'onboarding_step_assigned',
  'event_invited', 'course_completed', 'task_completed', 'onboarding_completed'
);

create table notifications (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  actor_id        uuid references profiles(id) on delete set null,
  kind            notification_kind not null,
  title           text not null,
  body            text,
  -- Where the notification takes you. Stored as a path so both clients can
  -- route it without either one hard-coding a mapping from kind to screen.
  href            text,
  entity_id       uuid,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index on notifications (user_id, read_at, created_at desc);
create index on notifications (organisation_id);

alter table notifications enable row level security;
alter table notifications force row level security;

-- You read and update only your own notifications. There is no client insert
-- policy on purpose: only the triggers below create them.
create policy notification_read on notifications for select to authenticated
  using (user_id = auth.uid() and organisation_id = current_org_id());
create policy notification_mark on notifications for update to authenticated
  using (user_id = auth.uid() and organisation_id = current_org_id())
  with check (user_id = auth.uid() and organisation_id = current_org_id());

-- Dismissing is a recipient's own business: they may remove their own rows,
-- and only their own. There is still no insert policy — a client may delete a
-- notification it was sent, but can never create one.
create policy notification_dismiss on notifications for delete to authenticated
  using (user_id = auth.uid() and organisation_id = current_org_id());

grant select, update, delete on public.notifications to authenticated;

-- Writes bypass RLS deliberately: the trigger is the author, not the caller.
create or replace function public.notify(
  org uuid, recipient uuid, actor uuid, kind notification_kind,
  title text, body text, href text, entity uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Telling someone what they just did themselves is noise.
  if recipient is null or recipient = actor then
    return;
  end if;
  insert into notifications (organisation_id, user_id, actor_id, kind, title, body, href, entity_id)
  values (org, recipient, actor, kind, title, body, href, entity);
end $$;

-- ---------------------------------------------------------------- staff side
create or replace function public.notify_course_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare course_title text;
begin
  select title into course_title from courses where id = new.course_id;
  perform notify(
    new.organisation_id, new.user_id, coalesce(new.assigned_by, auth.uid()), 'course_assigned',
    case when new.is_required then 'Required: ' || course_title else 'New course: ' || course_title end,
    case when new.due_date is not null
         then 'Due by ' || to_char(new.due_date, 'FMDay DD FMMonth')
         else 'Added to your courses.' end,
    '/courses/' || new.course_id, new.id
  );
  return new;
end $$;

create trigger course_assignment_notifies after insert on course_assignments
for each row execute function notify_course_assigned();

create or replace function public.notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is null then return new; end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  perform notify(
    new.organisation_id, new.assigned_to, coalesce(new.created_by, auth.uid()), 'task_assigned',
    new.title,
    case when new.due_date is not null
         then 'Due ' || to_char(new.due_date, 'FMDay DD FMMonth')
         else new.priority || ' priority' end,
    '/tasks/' || new.id, new.id
  );
  return new;
end $$;

create trigger task_notifies after insert or update of assigned_to on tasks
for each row execute function notify_task_assigned();

create or replace function public.notify_step_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is null then return new; end if;
  perform notify(
    new.organisation_id, new.assigned_to, auth.uid(), 'onboarding_step_assigned',
    new.title, 'An onboarding step is waiting for you.',
    '/onboarding', new.id
  );
  return new;
end $$;

create trigger onboarding_step_notifies after insert on onboarding_steps
for each row execute function notify_step_assigned();

create or replace function public.notify_event_invited() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select title, start_time, organisation_id into e from events where id = new.event_id;
  perform notify(
    e.organisation_id, new.user_id, auth.uid(), 'event_invited',
    e.title, to_char(e.start_time, 'FMDay DD FMMonth, HH12:MIam'),
    '/events/' || new.event_id, new.event_id
  );
  return new;
end $$;

create trigger event_participant_notifies after insert on event_participants
for each row execute function notify_event_invited();

-- ---------------------------------------------------------------- admin side
create or replace function public.notify_course_completed() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; course_title text;
begin
  if new.status <> 'Completed' or old.status = 'Completed' then return new; end if;
  select name into who from profiles where id = new.user_id;
  select title into course_title from courses where id = new.course_id;
  perform notify(
    new.organisation_id, new.assigned_by, new.user_id, 'course_completed',
    who || ' finished ' || course_title, 'Nothing needed from you.',
    '/courses/' || new.course_id, new.id
  );
  return new;
end $$;

create trigger course_completion_notifies after update of status on course_assignments
for each row execute function notify_course_completed();

create or replace function public.notify_task_completed() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.status <> 'Completed' or old.status = 'Completed' then return new; end if;
  select name into who from profiles where id = new.assigned_to;
  perform notify(
    new.organisation_id, new.created_by, new.assigned_to, 'task_completed',
    who || ' completed ' || new.title, 'Review it when you have a moment.',
    '/tasks/' || new.id, new.id
  );
  return new;
end $$;

create trigger task_completion_notifies after update of status on tasks
for each row execute function notify_task_completed();

create or replace function public.notify_onboarding_completed() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if new.status <> 'Completed' or old.status = 'Completed' then return new; end if;
  select name into who from profiles where id = new.employee_id;
  perform notify(
    new.organisation_id, new.created_by, new.employee_id, 'onboarding_completed',
    who || ' finished onboarding', 'Every step is done.',
    '/onboarding/' || new.id, new.id
  );
  return new;
end $$;

create trigger onboarding_completion_notifies after update of status on employee_onboarding
for each row execute function notify_onboarding_completed();
