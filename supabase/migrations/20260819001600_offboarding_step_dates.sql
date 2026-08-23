-- Exit steps get dates too.
--
-- Onboarding steps carried due dates and exit steps did not, which quietly makes
-- the exit plan advisory: "return the laptop" with no date is a wish. The steps
-- of a leaving plan are worked back from the last day, so the equipment comes
-- back before the person does not.
alter table onboarding_template_steps
  add column if not exists due_after_days int;

comment on column onboarding_template_steps.due_after_days is
  'Days from the plan start. On a leaving plan the target date is the last day, so a negative value means "before the last day".';

/*
 * Applies the template's offsets when a plan is created. Onboarding counts
 * forward from the start date; offboarding counts back from the last day,
 * because that is the date everybody actually works to.
 */
create or replace function public.date_plan_steps() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  plan record;
  anchor date;
begin
  select * into plan from employee_onboarding where id = new.onboarding_id;
  if plan is null then return new; end if;

  anchor := case
    when plan.kind = 'Offboarding' then coalesce(plan.target_completion_date, plan.start_date, current_date)
    else coalesce(plan.start_date, current_date)
  end;

  if new.due_date is null and new.template_step_id is not null then
    select case
             when plan.kind = 'Offboarding' then anchor - coalesce(t.due_after_days, 0)
             else anchor + coalesce(t.due_after_days, 7)
           end
      into new.due_date
      from onboarding_template_steps t
     where t.id = new.template_step_id;
  end if;

  return new;
end $$;

create trigger onboarding_step_dates
before insert on onboarding_steps
for each row execute function date_plan_steps();

-- The seeded exit plan works back from the last day.
update onboarding_template_steps set due_after_days = case title
    when 'Hand over open tasks to a colleague'   then 7
    when 'Write handover notes for the team'     then 5
    when 'Return laptop and access card'         then 1
    when 'Close workspace and email accounts'    then 0
    when 'Hold the exit conversation'            then 2
    when 'Confirm final pay and leave balance'   then 0
    else due_after_days
  end
 where onboarding_template_id = 'a1000000-0000-0000-0000-00000000f001';
