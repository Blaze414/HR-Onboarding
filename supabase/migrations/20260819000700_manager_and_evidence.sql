-- Manager visibility, acknowledgement receipts, offboarding, verified progress.

-- ================================================================ managers
/*
 * `manager_id` was stored and used for nothing: a manager was told when their
 * report went overdue and then had no way to look at it. Reporting lines are
 * the mechanism by which work actually gets chased, so they need to grant
 * visibility of the team's work — and nothing else.
 */
create or replace function public.is_manager_of(subject uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select manager_id = auth.uid() from profiles where id = subject), false)
$$;

grant execute on function public.is_manager_of(uuid) to authenticated;

-- Read-only, and only for direct reports. A manager sees their team's work; a
-- manager does not gain admin over it.
create policy assignment_read_team on course_assignments for select to authenticated
  using (organisation_id = current_org_id() and is_manager_of(user_id));

create policy task_read_team on tasks for select to authenticated
  using (organisation_id = current_org_id() and is_manager_of(assigned_to));

create policy onboarding_read_team on employee_onboarding for select to authenticated
  using (organisation_id = current_org_id() and is_manager_of(employee_id));

create policy onboarding_step_read_team on onboarding_steps for select to authenticated
  using (organisation_id = current_org_id()
         and exists (select 1 from employee_onboarding o
                      where o.id = onboarding_id and is_manager_of(o.employee_id)));

-- ================================================================ acknowledgements
/*
 * "A file exists" and "this person has read it" are different records, and only
 * the second is worth anything when someone asks whether staff were told. A
 * document can now be marked as needing acknowledgement, and each person's
 * acknowledgement is its own row with its own timestamp.
 */
alter table documents add column requires_acknowledgement boolean not null default false;

create table document_acknowledgements (
  document_id     uuid not null references documents(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  organisation_id uuid not null references organisations(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

create index on document_acknowledgements (organisation_id, user_id);

alter table document_acknowledgements enable row level security;
alter table document_acknowledgements force row level security;

create policy ack_read on document_acknowledgements for select to authenticated
  using (organisation_id = current_org_id()
         and (is_admin() or user_id = auth.uid() or is_manager_of(user_id)));

-- You may record your own acknowledgement and nobody else's. There is no update
-- and no delete: an acknowledgement is a fact about a moment, not a setting.
create policy ack_insert_own on document_acknowledgements for insert to authenticated
  with check (organisation_id = current_org_id() and user_id = auth.uid());

grant select, insert on public.document_acknowledgements to authenticated;

-- ================================================================ offboarding
/*
 * Onboarding had templates and steps; leaving had nothing, so the last day of
 * employment was managed in someone's head. The machinery is identical, so the
 * plan simply gains a kind.
 */
create type plan_kind as enum ('Onboarding', 'Offboarding');

alter table onboarding_templates add column kind plan_kind not null default 'Onboarding';
alter table employee_onboarding  add column kind plan_kind not null default 'Onboarding';

-- ================================================================ verified progress
/*
 * Progress was whatever the learner typed. That is fine as a personal tracker
 * and worthless as evidence, so required training now carries a separate fact:
 * somebody with the authority to say so confirmed it was done.
 *
 * The learner's own figure is untouched — this records who agreed with it.
 */
alter table course_assignments
  add column verified_at timestamptz,
  add column verified_by uuid references profiles(id) on delete set null;

/*
 * Required training that the learner says is finished, and nobody has confirmed.
 * This is the queue an HR coordinator works through, and the gap that makes a
 * completion figure worth quoting.
 */
create view awaiting_verification with (security_invoker = on) as
select
  a.id            as assignment_id,
  a.organisation_id,
  p.id            as employee_id,
  p.name          as employee_name,
  m.name          as manager_name,
  c.id            as course_id,
  c.title         as course_title,
  a.due_date,
  a.completed_at
from course_assignments a
join courses  c on c.id = a.course_id
join profiles p on p.id = a.user_id
left join profiles m on m.id = p.manager_id
where a.is_required
  and a.status = 'Completed'
  and a.verified_at is null
  and p.is_active;

grant select on awaiting_verification to authenticated;

/*
 * Who still owes an acknowledgement. One row per person per document, so the
 * answer to "was everyone told?" is a list of names rather than a count.
 */
create view outstanding_acknowledgements with (security_invoker = on) as
select
  d.id            as document_id,
  d.organisation_id,
  d.name          as document_name,
  p.id            as employee_id,
  p.name          as employee_name,
  p.email         as employee_email,
  m.name          as manager_name,
  d.created_at    as published_at
from documents d
cross join profiles p
left join profiles m on m.id = p.manager_id
where d.requires_acknowledgement
  and d.organisation_id = p.organisation_id
  and p.is_active
  and not exists (
    select 1 from document_acknowledgements a
     where a.document_id = d.id and a.user_id = p.id
  );

grant select on outstanding_acknowledgements to authenticated;
