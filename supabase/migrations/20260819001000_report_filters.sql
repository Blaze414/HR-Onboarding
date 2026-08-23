-- The outstanding-training view carried a department name but not its id, so the
-- department filter on the report had nothing to match against and quietly did
-- nothing. A filter that returns the same rows whatever you choose is worse than
-- no filter: it answers a question it did not actually ask.
drop view outstanding_required_training;

create view outstanding_required_training with (security_invoker = on) as
select
  a.id                as assignment_id,
  a.organisation_id,
  p.id                as employee_id,
  p.name              as employee_name,
  p.email             as employee_email,
  p.department_id,
  d.name              as department_name,
  m.name              as manager_name,
  c.id                as course_id,
  c.title             as course_title,
  a.due_date,
  a.progress,
  a.status,
  (current_date - a.due_date)                    as days_overdue,
  (a.due_date < current_date)                    as is_overdue
from course_assignments a
join courses  c on c.id = a.course_id
join profiles p on p.id = a.user_id
left join departments d on d.id = p.department_id
left join profiles   m on m.id = p.manager_id
where a.is_required
  and a.status <> 'Completed'
  and p.is_active;

grant select on outstanding_required_training to authenticated;
