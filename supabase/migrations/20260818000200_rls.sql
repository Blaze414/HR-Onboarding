-- Row Level Security. The database is the real security boundary; client-side
-- capability checks are UX only.

-- Helper functions are SECURITY DEFINER so that reading the caller's own
-- profile does not recurse through the profiles policies.
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select organisation_id from profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
$$;

grant execute on function public.current_org_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'organisations','departments','profiles','courses','course_assignments','tasks',
    'events','event_participants','documents','onboarding_templates',
    'onboarding_template_steps','employee_onboarding','onboarding_steps','activity_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- organisations
create policy org_read on organisations for select to authenticated
  using (id = current_org_id());
create policy org_admin_update on organisations for update to authenticated
  using (id = current_org_id() and is_admin())
  with check (id = current_org_id() and is_admin());

-- ---------------------------------------------------------------- departments
create policy dept_read on departments for select to authenticated
  using (organisation_id = current_org_id());
create policy dept_admin_write on departments for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

-- ---------------------------------------------------------------- profiles
-- Colleagues are visible within the organisation (names, job titles, managers).
create policy profile_read_org on profiles for select to authenticated
  using (organisation_id = current_org_id());
create policy profile_update_self on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and organisation_id = current_org_id());
create policy profile_admin_write on profiles for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

-- ---------------------------------------------------------------- courses
create policy course_read on courses for select to authenticated
  using (organisation_id = current_org_id());
create policy course_admin_write on courses for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

-- ---------------------------------------------------------------- course_assignments
create policy assignment_read on course_assignments for select to authenticated
  using (organisation_id = current_org_id() and (is_admin() or user_id = auth.uid()));
-- Learners may move their own progress along, nothing else.
create policy assignment_update_own on course_assignments for update to authenticated
  using (organisation_id = current_org_id() and user_id = auth.uid())
  with check (organisation_id = current_org_id() and user_id = auth.uid());
create policy assignment_admin_write on course_assignments for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

-- ---------------------------------------------------------------- tasks
create policy task_read on tasks for select to authenticated
  using (organisation_id = current_org_id()
         and (is_admin() or assigned_to = auth.uid() or created_by = auth.uid()));
create policy task_update_own on tasks for update to authenticated
  using (organisation_id = current_org_id() and assigned_to = auth.uid())
  with check (organisation_id = current_org_id() and assigned_to = auth.uid());
create policy task_admin_write on tasks for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

-- ---------------------------------------------------------------- events
create policy event_read on events for select to authenticated
  using (organisation_id = current_org_id());
create policy event_admin_write on events for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

create policy participant_read on event_participants for select to authenticated
  using (organisation_id = current_org_id());
create policy participant_rsvp_self on event_participants for all to authenticated
  using (organisation_id = current_org_id() and user_id = auth.uid())
  with check (organisation_id = current_org_id() and user_id = auth.uid());
create policy participant_admin_write on event_participants for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

-- ---------------------------------------------------------------- documents
-- owner_id null  => shared organisation document
-- owner_id = uid => personal document
create policy document_read on documents for select to authenticated
  using (organisation_id = current_org_id()
         and (owner_id is null or owner_id = auth.uid() or is_admin()));
create policy document_insert_personal on documents for insert to authenticated
  with check (organisation_id = current_org_id()
              and owner_id = auth.uid()
              and uploaded_by = auth.uid());
create policy document_modify_own on documents for update to authenticated
  using (organisation_id = current_org_id() and owner_id = auth.uid())
  with check (organisation_id = current_org_id() and owner_id = auth.uid());
create policy document_delete_own on documents for delete to authenticated
  using (organisation_id = current_org_id() and owner_id = auth.uid());
create policy document_admin_write on documents for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

-- ---------------------------------------------------------------- onboarding
create policy template_read on onboarding_templates for select to authenticated
  using (organisation_id = current_org_id());
create policy template_admin_write on onboarding_templates for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

create policy template_step_read on onboarding_template_steps for select to authenticated
  using (organisation_id = current_org_id());
create policy template_step_admin_write on onboarding_template_steps for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

create policy onboarding_read on employee_onboarding for select to authenticated
  using (organisation_id = current_org_id() and (is_admin() or employee_id = auth.uid()));
create policy onboarding_admin_write on employee_onboarding for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

create policy onboarding_step_read on onboarding_steps for select to authenticated
  using (organisation_id = current_org_id()
         and (is_admin()
              or assigned_to = auth.uid()
              or exists (select 1 from employee_onboarding o
                          where o.id = onboarding_id and o.employee_id = auth.uid())));
create policy onboarding_step_complete on onboarding_steps for update to authenticated
  using (organisation_id = current_org_id()
         and (assigned_to = auth.uid()
              or exists (select 1 from employee_onboarding o
                          where o.id = onboarding_id and o.employee_id = auth.uid())))
  with check (organisation_id = current_org_id());
create policy onboarding_step_admin_write on onboarding_steps for all to authenticated
  using (organisation_id = current_org_id() and is_admin())
  with check (organisation_id = current_org_id() and is_admin());

-- ---------------------------------------------------------------- activity log
create policy activity_read on activity_log for select to authenticated
  using (organisation_id = current_org_id() and (is_admin() or actor_id = auth.uid()));
create policy activity_insert on activity_log for insert to authenticated
  with check (organisation_id = current_org_id() and actor_id = auth.uid());
