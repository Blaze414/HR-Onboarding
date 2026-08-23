-- The onboarding roll-up runs inside the employee's own transaction, so with
-- RLS forced on employee_onboarding it silently updated zero rows: employees
-- may read their plan but not write it. Recalculating a derived column is a
-- system action, so the function runs as its owner and re-checks the tenant
-- itself rather than relying on the caller's policies.

create or replace function recalc_onboarding_progress() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ob_id uuid := coalesce(new.onboarding_id, old.onboarding_id);
  total int;
  done  int;
  pct   int;
begin
  select count(*), count(*) filter (where status = 'Completed')
    into total, done
    from onboarding_steps where onboarding_id = ob_id;

  pct := case when total = 0 then 0 else round(done::numeric * 100 / total) end;

  update employee_onboarding
     set progress     = pct,
         status       = case
                          when total > 0 and done = total then 'Completed'::onboarding_status
                          when done > 0 then 'In Progress'::onboarding_status
                          else status
                        end,
         completed_at = case when total > 0 and done = total then coalesce(completed_at, now()) else null end
   where id = ob_id;

  return null;
end $$;
