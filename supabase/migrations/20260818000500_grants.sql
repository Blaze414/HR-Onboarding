-- Table privileges. RLS decides *which rows*; grants decide whether the role
-- may touch the table at all. Both are required.
do $$
declare t text;
begin
  foreach t in array array[
    'organisations','departments','profiles','courses','course_assignments','tasks',
    'events','event_participants','documents','onboarding_templates',
    'onboarding_template_steps','employee_onboarding','onboarding_steps','activity_log'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

grant usage on schema public to authenticated, anon;
