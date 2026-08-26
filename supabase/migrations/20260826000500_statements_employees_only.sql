-- Information statements are owed to employees, not to contractors.
--
-- The register was built before the workspace could record a contractor, so it
-- treated everybody with a start date as an employee. Left alone, engaging a
-- contractor would invent an obligation that does not exist and report a gap
-- that is not one — which is the specific way a compliance screen stops being
-- read.
--
-- The view is dropped and recreated rather than replaced: adding a condition
-- inside a CTE changes nothing about the column list, but `create or replace
-- view` still refuses often enough that it is not worth finding out.
drop view if exists statement_obligations;

create view statement_obligations with (security_invoker = on) as
with people as (
  select p.id, p.organisation_id, p.name, p.email, p.start_date,
         p.employment_basis, p.manager_id,
         is_small_business_employer(p.organisation_id) as small_employer
  from profiles p
  where p.is_active
    and p.start_date is not null
    -- A contractor is not an employee and is owed neither statement.
    and p.employment_basis is distinct from 'Contract'
),
due as (
  select id as employee_id, organisation_id,
         'Fair Work Information Statement'::workplace_statement as kind,
         start_date as due_on
  from people
  union all
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
    when i.id is not null        then 'Given'
    when d.due_on > current_date then 'Upcoming'
    else 'Overdue'
  end as status
from due d
join people pe on pe.id = d.employee_id
left join profiles m on m.id = pe.manager_id
left join statement_issues i
       on i.employee_id = d.employee_id and i.kind = d.kind and i.due_on = d.due_on
where d.due_on >= pe.start_date;

grant select on public.statement_obligations to authenticated;
