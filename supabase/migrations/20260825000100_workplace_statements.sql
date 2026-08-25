-- Statements the employer must hand over, and hand over again.
--
-- Two obligations under the Fair Work Act 2009 that no amount of good intent
-- covers, because both are about *timing*:
--
--   s.125  Every new employee gets the Fair Work Information Statement before
--          starting, or as soon as practicable after.
--   s.125B Every casual employee gets the Casual Employment Information
--          Statement on the same terms — and again at set points afterwards
--          for as long as they remain casual. A small business employer (fewer
--          than 15 employees) owes it at 12 months; every other employer owes
--          it at 6 months, at 12 months, and every 12 months after that.
--
-- The second one is what gets missed. It is not an event anybody witnesses; it
-- is a date that passes. So it is computed rather than remembered: the view
-- below derives every point at which a statement falls due from the employee's
-- own start date and the size of the workspace, and left-joins what was
-- actually handed over. Nothing has to be scheduled and nothing drifts — an
-- employee who turns casual today grows the right history immediately.

create type workplace_statement as enum (
  'Fair Work Information Statement',
  'Casual Employment Information Statement'
);

create table statement_issues (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  employee_id     uuid not null references profiles(id) on delete cascade,
  kind            workplace_statement not null,
  -- Which falling-due this discharges. Recording the date it was owed, not
  -- only the date it was given, is what makes a late one visibly late.
  due_on          date not null,
  issued_at       timestamptz not null default now(),
  issued_by       uuid references profiles(id) on delete set null,
  note            text,
  unique (employee_id, kind, due_on)
);

create index statement_issues_employee_idx on statement_issues (employee_id, kind);

alter table statement_issues enable row level security;
alter table statement_issues force row level security;

-- Everyone may see their own; whoever runs the records may see all of them.
create policy statement_issue_read on statement_issues for select to authenticated
  using (organisation_id = current_org_id()
         and (employee_id = auth.uid() or has_permission('report.view_full')));

-- Recording that a statement was handed over is a record of what the employer
-- did, so an employee cannot write their own.
create policy statement_issue_write on statement_issues for insert to authenticated
  with check (organisation_id = current_org_id() and has_permission('employee.edit'));

grant select, insert on public.statement_issues to authenticated;

-- No update and no delete policy, deliberately: "we gave it to her in March"
-- is only worth anything if it cannot be typed in afterwards and cannot be
-- quietly withdrawn.

-- ------------------------------------------------------------- when it is due
create or replace function public.is_small_business_employer(org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  -- Fewer than 15 employees, counted on the head not the hours: s.23 counts
  -- casuals only when they are employed on a regular and systematic basis,
  -- which this workspace does not model, so it counts them all and errs
  -- towards owing the statement more often rather than less.
  select count(*) < 15 from profiles where organisation_id = org and is_active;
$$;

create view statement_obligations with (security_invoker = on) as
with people as (
  select p.id, p.organisation_id, p.name, p.email, p.start_date,
         p.employment_basis, p.manager_id,
         is_small_business_employer(p.organisation_id) as small_employer
  from profiles p
  where p.is_active and p.start_date is not null
),
due as (
  -- Everyone, once, on day one.
  select id as employee_id, organisation_id,
         'Fair Work Information Statement'::workplace_statement as kind,
         start_date as due_on
  from people
  union all
  -- Casuals, on day one and then on the clock.
  select id, organisation_id,
         'Casual Employment Information Statement'::workplace_statement,
         start_date
  from people where employment_basis = 'Casual'
  union all
  select id, organisation_id,
         'Casual Employment Information Statement'::workplace_statement,
         (start_date + interval '6 months')::date
  from people where employment_basis = 'Casual' and not small_employer
  union all
  select p.id, p.organisation_id,
         'Casual Employment Information Statement'::workplace_statement,
         (p.start_date + (n || ' years')::interval)::date
  from people p
  cross join generate_series(
    1,
    -- Every anniversary that has already arrived, plus the next one, so a
    -- statement can be handed over before it is late rather than after.
    greatest(1, extract(year from age(current_date, p.start_date))::int + 1)
  ) as n
  where p.employment_basis = 'Casual'
)
select
  d.employee_id, d.organisation_id, d.kind, d.due_on,
  pe.name  as employee_name,
  pe.email as employee_email,
  m.name   as manager_name,
  i.issued_at,
  i.id     as issue_id,
  case
    when i.id is not null       then 'Given'
    when d.due_on > current_date then 'Upcoming'
    else 'Overdue'
  end as status
from due d
join people pe on pe.id = d.employee_id
left join profiles m on m.id = pe.manager_id
left join statement_issues i
       on i.employee_id = d.employee_id and i.kind = d.kind and i.due_on = d.due_on
-- A due date before the workspace existed is not a debt this app can settle.
where d.due_on >= pe.start_date;

grant select on public.statement_obligations to authenticated;
