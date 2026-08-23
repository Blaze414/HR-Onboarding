-- Progress analytics.
--
-- Overall employee progress = 50% course + 25% task + 25% onboarding.
-- Components with no underlying records are dropped and the remaining weights
-- are re-normalised, so an employee with no onboarding plan is not punished
-- with a 0% onboarding component.
--
-- Views use security_invoker so the caller's RLS policies still apply:
-- analytics can never leak across organisations.

create or replace view employee_progress
with (security_invoker = on) as
select
  p.id                       as employee_id,
  p.organisation_id,
  p.name,
  p.job_title,
  p.department_id,
  p.is_active,
  c.total_courses,
  c.completed_courses,
  c.in_progress_courses,
  c.pending_courses,
  c.course_progress,
  t.total_tasks,
  t.completed_tasks,
  t.overdue_tasks,
  t.task_progress,
  o.onboarding_progress,
  o.onboarding_status,
  round(
    ( coalesce(c.course_progress, 0) * (case when c.total_courses > 0 then 0.50 else 0 end)
    + coalesce(t.task_progress,   0) * (case when t.total_tasks   > 0 then 0.25 else 0 end)
    + coalesce(o.onboarding_progress, 0) * (case when o.onboarding_progress is not null then 0.25 else 0 end)
    ) / nullif(
      (case when c.total_courses > 0 then 0.50 else 0 end)
      + (case when t.total_tasks > 0 then 0.25 else 0 end)
      + (case when o.onboarding_progress is not null then 0.25 else 0 end), 0)
  )::int as overall_progress
from profiles p
cross join lateral (
  select
    count(*)::int                                                   as total_courses,
    count(*) filter (where ca.status = 'Completed')::int            as completed_courses,
    count(*) filter (where ca.status = 'In Progress')::int          as in_progress_courses,
    count(*) filter (where ca.status = 'Pending')::int              as pending_courses,
    coalesce(round(avg(ca.progress)), 0)::int                       as course_progress
  from course_assignments ca where ca.user_id = p.id
) c
cross join lateral (
  select
    count(*)::int                                                   as total_tasks,
    count(*) filter (where tk.status = 'Completed')::int            as completed_tasks,
    count(*) filter (where tk.status <> 'Completed'
                      and tk.due_date is not null
                      and tk.due_date < current_date)::int          as overdue_tasks,
    case when count(*) = 0 then 0
         else round(count(*) filter (where tk.status = 'Completed')::numeric * 100 / count(*))
    end::int                                                        as task_progress
  from tasks tk where tk.assigned_to = p.id
) t
left join lateral (
  select eo.progress as onboarding_progress, eo.status as onboarding_status
  from employee_onboarding eo
  where eo.employee_id = p.id
  order by eo.created_at desc
  limit 1
) o on true;

create or replace view department_progress
with (security_invoker = on) as
select
  d.id   as department_id,
  d.organisation_id,
  d.name,
  count(ep.employee_id)::int                            as employees,
  coalesce(round(avg(ep.overall_progress)), 0)::int      as overall_progress,
  coalesce(round(avg(ep.course_progress)), 0)::int       as course_progress,
  coalesce(round(avg(ep.task_progress)), 0)::int         as task_progress,
  coalesce(round(avg(ep.onboarding_progress)), 0)::int   as onboarding_progress,
  coalesce(sum(ep.total_tasks - ep.completed_tasks), 0)::int as outstanding_tasks,
  coalesce(sum(ep.overdue_tasks), 0)::int                as overdue_tasks
from departments d
left join employee_progress ep
  on ep.department_id = d.id and ep.is_active
group by d.id, d.organisation_id, d.name;

create or replace view organisation_progress
with (security_invoker = on) as
select
  organisation_id,
  count(*)::int                                          as employees,
  coalesce(round(avg(overall_progress)), 0)::int         as overall_progress,
  coalesce(round(avg(course_progress)), 0)::int          as course_progress,
  coalesce(round(avg(task_progress)), 0)::int            as task_progress,
  coalesce(round(avg(onboarding_progress)), 0)::int      as onboarding_progress,
  coalesce(sum(overdue_tasks), 0)::int                   as overdue_tasks
from employee_progress
where is_active
group by organisation_id;

create or replace view course_performance
with (security_invoker = on) as
select
  co.id as course_id,
  co.organisation_id,
  co.title,
  co.status,
  count(ca.id)::int                                        as assigned,
  count(ca.id) filter (where ca.status = 'Completed')::int as completed,
  count(ca.id) filter (where ca.status = 'In Progress')::int as in_progress,
  count(ca.id) filter (where ca.status = 'Pending')::int   as pending,
  coalesce(round(avg(ca.progress)), 0)::int                as average_progress
from courses co
left join course_assignments ca on ca.course_id = co.id
group by co.id, co.organisation_id, co.title, co.status;

grant select on employee_progress, department_progress, organisation_progress, course_performance
  to authenticated;
