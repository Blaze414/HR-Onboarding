-- The employee choice pathway.
--
-- Since the Closing Loopholes changes a casual does not wait to be offered
-- permanent employment — they notify the employer in writing that they want it,
-- and the employer has to answer. Three things about that are deadlines rather
-- than intentions, which is why they are modelled here rather than left to
-- somebody's diary:
--
--   * The employer must **consult** the employee before responding.
--   * The employer must respond **in writing within 21 days** of the notice.
--   * A refusal is only lawful on one of three grounds, and the written
--     response has to say which.
--
-- Eligibility is computed, not asserted. A casual may give notice once they
-- have been employed six months — twelve for a small business employer — and
-- not within six months of their last notice. Working that out from the record
-- means an employee cannot give a notice they are not entitled to, and HR
-- cannot wave one through that they are.

-- Notifications carry a kind, and neither existing one fits: this is not a
-- task and not a course. Added rather than borrowed, because the kind is what
-- a reader sorts by when the list gets long.
alter type notification_kind add value if not exists 'conversion_notice';
alter type notification_kind add value if not exists 'conversion_answered';

create type conversion_status as enum (
  'Awaiting response', 'Accepted', 'Refused', 'Withdrawn'
);

-- The only grounds on which a notice may be refused. An enum rather than free
-- text because "why was this refused" is the question the Fair Work Commission
-- asks, and a text box answers it differently every time.
create type conversion_refusal_ground as enum (
  'Still meets the definition of a casual employee',
  'Fair and reasonable operational grounds',
  -- Shortened from the wording in the Act because a Postgres enum label caps
  -- at 63 bytes; the app spells it out in full where a person reads it.
  'Would not comply with a legal recruitment process'
);

create table casual_conversion_notices (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  employee_id     uuid not null references profiles(id) on delete cascade,
  given_at        timestamptz not null default now(),
  -- Twenty-one days from the notice. Stored rather than computed on read so
  -- the deadline cannot move if the rule changes later: this notice was owed an
  -- answer by this date.
  due_by          date not null,
  note            text,
  status          conversion_status not null default 'Awaiting response',
  -- The employer must consult before responding. Recorded separately from the
  -- response because a response written without one is a defective response,
  -- and the two dates being the same is itself worth being able to see.
  consulted_at    timestamptz,
  responded_at    timestamptz,
  responded_by    uuid references profiles(id) on delete set null,
  refusal_ground  conversion_refusal_ground,
  response_note   text,
  -- What the employment became. Only set on acceptance.
  new_hours       employment_hours,
  new_basis       employment_basis,
  created_at      timestamptz not null default now()
);

create index casual_conversion_employee_idx on casual_conversion_notices (employee_id, given_at desc);
create index casual_conversion_open_idx on casual_conversion_notices (organisation_id, status, due_by);

alter table casual_conversion_notices enable row level security;
alter table casual_conversion_notices force row level security;

-- ------------------------------------------------------------- eligibility
create or replace function public.casual_conversion_eligibility(employee uuid)
returns table (eligible boolean, reason text, qualifies_on date)
language plpgsql stable security definer set search_path = public as $$
declare
  p            record;
  months_owed  integer;
  qualifies    date;
  last_notice  timestamptz;
begin
  select id, organisation_id, start_date, employment_basis, is_active
    into p from profiles where id = employee;

  if p.id is null or not p.is_active then
    return query select false, 'This person is not an employee of this workspace.'::text, null::date;
    return;
  end if;

  if p.employment_basis is distinct from 'Casual' then
    return query select false, 'Only a casual employee can give this notice.'::text, null::date;
    return;
  end if;

  if p.start_date is null then
    return query select false, 'No start date on the record, so length of service cannot be worked out.'::text, null::date;
    return;
  end if;

  -- Six months of service, or twelve for a small business employer.
  months_owed := case when is_small_business_employer(p.organisation_id) then 12 else 6 end;
  qualifies := (p.start_date + (months_owed || ' months')::interval)::date;

  if current_date < qualifies then
    return query select
      false,
      format('A casual can give notice after %s months. This becomes available on %s.',
             months_owed, to_char(qualifies, 'FMDD Mon YYYY'))::text,
      qualifies;
    return;
  end if;

  -- Not within six months of the last notice, whatever came of it.
  select max(given_at) into last_notice
  from casual_conversion_notices where employee_id = employee;

  if last_notice is not null and last_notice > now() - interval '6 months' then
    return query select
      false,
      format('A notice was already given on %s. Another can be given from %s.',
             to_char(last_notice, 'FMDD Mon YYYY'),
             to_char(last_notice + interval '6 months', 'FMDD Mon YYYY'))::text,
      (last_notice + interval '6 months')::date;
    return;
  end if;

  return query select true, 'Eligible to give notice.'::text, qualifies;
end $$;

grant execute on function public.casual_conversion_eligibility(uuid) to authenticated;

-- ------------------------------------------------------------------ policies
-- Your own notices, and HR sees the workspace's. A line manager does not:
-- whether somebody has asked to go permanent is not team information until it
-- has been decided.
create policy conversion_read on casual_conversion_notices for select to authenticated
  using (organisation_id = current_org_id()
         and (employee_id = auth.uid() or has_permission('employee.edit')));

-- Only the employee gives the notice. That is the whole point of the pathway —
-- it replaced waiting to be offered.
create policy conversion_give on casual_conversion_notices for insert to authenticated
  with check (organisation_id = current_org_id() and employee_id = auth.uid());

-- Both sides write to a notice afterwards: HR responds, and the employee may
-- withdraw. Which of them may change what is decided by the trigger below,
-- because that is a column-level question and a policy cannot answer it.
create policy conversion_update on casual_conversion_notices for update to authenticated
  using (organisation_id = current_org_id()
         and (employee_id = auth.uid() or has_permission('employee.edit')));

grant select, insert, update on public.casual_conversion_notices to authenticated;

-- ------------------------------------------------------------------- guards
create or replace function public.guard_conversion_notice() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ok boolean;
  why text;
begin
  select eligible, reason into ok, why
    from casual_conversion_eligibility(new.employee_id);

  if not ok then
    raise exception '%', why using errcode = 'check_violation';
  end if;

  -- The deadline is the employer's obligation, not a field the person giving
  -- notice gets to set.
  new.due_by := (new.given_at + interval '21 days')::date;
  new.status := 'Awaiting response';
  new.consulted_at := null;
  new.responded_at := null;
  new.responded_by := null;
  new.refusal_ground := null;
  new.new_hours := null;
  new.new_basis := null;
  return new;
end $$;

create trigger conversion_guard_insert
  before insert on casual_conversion_notices
  for each row execute function public.guard_conversion_notice();

create or replace function public.guard_conversion_response() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- The notice itself is a record of what the employee did. Nothing about it
  -- may be rewritten afterwards, by either side.
  new.employee_id := old.employee_id;
  new.organisation_id := old.organisation_id;
  new.given_at := old.given_at;
  new.due_by := old.due_by;
  new.note := old.note;

  if old.status <> 'Awaiting response' then
    raise exception 'This notice has already been answered.' using errcode = 'check_violation';
  end if;

  -- The employee's only move is to withdraw it.
  if auth.uid() = old.employee_id and not has_permission('employee.edit') then
    if new.status is distinct from 'Withdrawn' then
      raise exception 'You can withdraw your notice. Answering it is for the employer.'
        using errcode = 'insufficient_privilege';
    end if;
    new.consulted_at := old.consulted_at;
    new.responded_at := null;
    new.responded_by := null;
    new.refusal_ground := null;
    new.new_hours := null;
    new.new_basis := null;
    return new;
  end if;

  -- Consultation is a step, so it can be recorded on its own before there is
  -- an answer to give.
  if new.status = 'Awaiting response' then
    return new;
  end if;

  if new.status in ('Accepted', 'Refused') then
    if new.consulted_at is null then
      raise exception 'Consult the employee before responding. Record the consultation first.'
        using errcode = 'check_violation';
    end if;
    new.responded_at := coalesce(new.responded_at, now());
    new.responded_by := auth.uid();
  end if;

  if new.status = 'Refused' then
    if new.refusal_ground is null then
      raise exception 'A notice can only be refused on one of the three permitted grounds. Say which.'
        using errcode = 'check_violation';
    end if;
    new.new_hours := null;
    new.new_basis := null;
  end if;

  if new.status = 'Accepted' then
    if new.new_hours is null or new.new_basis is null then
      raise exception 'Say what the employment becomes: full-time or part-time, ongoing or fixed term.'
        using errcode = 'check_violation';
    end if;
    if new.new_basis = 'Casual' or new.new_hours = 'Casual' then
      raise exception 'Accepting the notice means the employment stops being casual.'
        using errcode = 'check_violation';
    end if;
    new.refusal_ground := null;
    -- The record follows the decision. Doing it here rather than in the app
    -- means the employment particulars and the answer cannot disagree.
    update profiles
       set employment_hours = new.new_hours,
           employment_basis = new.new_basis
     where id = old.employee_id;
  end if;

  return new;
end $$;

create trigger conversion_guard_update
  before update on casual_conversion_notices
  for each row execute function public.guard_conversion_response();

-- ------------------------------------------------------------- who is told
create or replace function public.notify_conversion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who   record;
  admin record;
begin
  select name, organisation_id into who from profiles where id = new.employee_id;

  if tg_op = 'INSERT' then
    -- Everyone who could answer it, because a deadline nobody sees is a
    -- deadline nobody meets.
    for admin in
      select p.id from profiles p
       where p.organisation_id = new.organisation_id and p.is_active and p.role = 'admin'
    loop
      perform notify(
        new.organisation_id, admin.id, new.employee_id, 'conversion_notice'::notification_kind,
        format('%s asked to become permanent', who.name),
        format('A written answer is owed by %s.', to_char(new.due_by, 'FMDD Mon YYYY')),
        '/reports?report=conversion', new.id);
    end loop;
    return new;
  end if;

  if new.status in ('Accepted', 'Refused') and old.status = 'Awaiting response' then
    perform notify(
      new.organisation_id, new.employee_id, auth.uid(), 'conversion_answered'::notification_kind,
      format('Your request to become permanent was %s', lower(new.status::text)),
      coalesce(new.response_note, new.refusal_ground::text, 'See your record for the written response.'),
      '/profile', new.id);
  end if;
  return new;
end $$;

create trigger conversion_notify
  after insert or update on casual_conversion_notices
  for each row execute function public.notify_conversion();

-- --------------------------------------------------------- what is outstanding
create view casual_conversion_worklist with (security_invoker = on) as
select
  n.id, n.organisation_id, n.employee_id, n.given_at, n.due_by, n.status,
  n.consulted_at, n.responded_at, n.refusal_ground, n.response_note, n.note,
  p.name  as employee_name,
  p.email as employee_email,
  m.name  as manager_name,
  r.name  as responded_by_name,
  (n.status = 'Awaiting response' and n.due_by < current_date) as is_overdue,
  (n.due_by - current_date)                                    as days_left
from casual_conversion_notices n
join profiles p on p.id = n.employee_id
left join profiles m on m.id = p.manager_id
left join profiles r on r.id = n.responded_by;

grant select on public.casual_conversion_worklist to authenticated;
