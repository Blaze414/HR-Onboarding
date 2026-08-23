-- Deadlines that chase people.
--
-- Required training could be given a due date, and then nothing happened. The
-- `course_due_soon` notification kind existed but no trigger ever produced one,
-- so a deadline was a number in a column: the learner was told once, on the day
-- it was assigned, and never again. In practice that is how mandatory training
-- quietly goes unfinished — nobody is reminded, and nobody's manager is told.
--
-- A trigger cannot do this, because nothing happens in the database when a date
-- passes. It needs a sweep that is run on a schedule, and that is safe to run
-- repeatedly.

alter type notification_kind add value if not exists 'course_overdue';
alter type notification_kind add value if not exists 'report_overdue';

/*
 * Raises reminders for required training, and escalates to the learner's
 * manager once it is late.
 *
 * Idempotent by design: "due soon" is raised once per assignment, and "overdue"
 * at most once per day, so calling this hourly, on every page load, or twice by
 * accident produces the same result as calling it once.
 *
 * Scoped to the caller's own organisation, so it cannot be used to discover or
 * disturb another tenant's data.
 */
create or replace function public.notify_training_deadlines()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  org uuid := current_org_id();
  raised integer := 0;
  row record;
begin
  if org is null then
    return 0;
  end if;

  for row in
    select a.id, a.user_id, a.course_id, a.due_date, c.title, p.name as learner, p.manager_id
      from course_assignments a
      join courses c on c.id = a.course_id
      join profiles p on p.id = a.user_id
     where a.organisation_id = org
       and a.is_required
       and a.due_date is not null
       and a.status <> 'Completed'
       -- Someone who has left keeps their record, but is never chased for work
       -- they can no longer do, and neither is their manager.
       and p.is_active
  loop
    if row.due_date < current_date then
      -- Late: the learner is reminded daily, because the reminder is the point.
      if not exists (
        select 1 from notifications
         where entity_id = row.id and kind = 'course_overdue'
           and user_id = row.user_id and created_at::date = current_date
      ) then
        perform notify(
          org, row.user_id, null, 'course_overdue',
          'Overdue: ' || row.title,
          'This was due ' || to_char(row.due_date, 'FMDay DD FMMonth') || '.',
          '/courses/' || row.course_id, row.id
        );
        raised := raised + 1;
      end if;

      -- And their manager is told once a day, which is the only thing that
      -- reliably moves mandatory training along.
      if row.manager_id is not null and not exists (
        select 1 from notifications
         where entity_id = row.id and kind = 'report_overdue'
           and user_id = row.manager_id and created_at::date = current_date
      ) then
        perform notify(
          org, row.manager_id, null, 'report_overdue',
          row.learner || ' is overdue on ' || row.title,
          'Due ' || to_char(row.due_date, 'FMDay DD FMMonth') || '. It may need a nudge.',
          '/employees/' || row.user_id, row.id
        );
        raised := raised + 1;
      end if;

    elsif row.due_date <= current_date + 7 then
      -- Approaching: said once. Repeating this every day for a week trains
      -- people to ignore the bell, which costs more than the reminder gains.
      if not exists (
        select 1 from notifications
         where entity_id = row.id and kind = 'course_due_soon' and user_id = row.user_id
      ) then
        perform notify(
          org, row.user_id, null, 'course_due_soon',
          'Due soon: ' || row.title,
          'Due ' || to_char(row.due_date, 'FMDay DD FMMonth') || '.',
          '/courses/' || row.course_id, row.id
        );
        raised := raised + 1;
      end if;
    end if;
  end loop;

  return raised;
end $$;

grant execute on function public.notify_training_deadlines() to authenticated;

/*
 * Outstanding required training, one row per person per course.
 *
 * The reports page could show course completion rates and employee progress,
 * but not the question an HR coordinator is actually asked: who has not done
 * what, and how late are they. Answering that from the existing views meant
 * reading three tables and doing the arithmetic by eye.
 *
 * Leavers are excluded. Their record remains on the assignment, but they are
 * not outstanding work anybody can chase.
 */
create view outstanding_required_training with (security_invoker = on) as
select
  a.id                as assignment_id,
  a.organisation_id,
  p.id                as employee_id,
  p.name              as employee_name,
  p.email             as employee_email,
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
